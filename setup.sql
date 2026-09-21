-- ============================================================================
-- KrishiSahayak AI — Full Supabase setup
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / ON CONFLICT / DROP POLICY).
-- ============================================================================

-- ============================================================================
-- 0. PROFILES (role source of truth; auto-created from signup metadata)
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default 'Farmer',
  role        text not null default 'farmer'
              check (role in ('farmer', 'officer', 'expert')),
  area        text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by all users" on public.profiles;
create policy "profiles readable by all users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, area)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Farmer'),
    coalesce(new.raw_user_meta_data->>'role', 'farmer'),
    nullif(new.raw_user_meta_data->>'area', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user's role (used by officer policies)
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ============================================================================
-- 1. FARMER REPORTS (photo-based crop reports — the AI feature)
-- ============================================================================
create table if not exists public.farmer_reports (
  id            uuid primary key default gen_random_uuid(),
  farmer_id     uuid not null references auth.users(id) on delete cascade,
  photo_path    text,                 -- path inside the crop-photos bucket
  ai_extracted  jsonb,                -- exactly what the AI returned
  crop          text,                 -- confirmed by the farmer
  affected_part text,
  symptoms      text[] not null default '{}',
  severity      text,
  description   text,
  area          text,                 -- approximate: panchayat or locality
  status        text not null default 'unverified'
                check (status in ('unverified', 'verified', 'rejected')),
  review_note   text,                 -- officer's reply after reviewing the report
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists farmer_reports_match_idx
  on public.farmer_reports (crop, area, created_at desc);

-- Upgrade databases created before officer replies existed (safe to re-run)
alter table public.farmer_reports add column if not exists review_note  text;
alter table public.farmer_reports add column if not exists reviewed_by  uuid references auth.users(id) on delete set null;
alter table public.farmer_reports add column if not exists reviewed_at  timestamptz;

alter table public.farmer_reports enable row level security;

drop policy if exists "farmers insert own reports" on public.farmer_reports;
create policy "farmers insert own reports"
  on public.farmer_reports for insert to authenticated
  with check (farmer_id = auth.uid());

drop policy if exists "farmers read own reports" on public.farmer_reports;
create policy "farmers read own reports"
  on public.farmer_reports for select to authenticated
  using (farmer_id = auth.uid());

drop policy if exists "officers read all reports" on public.farmer_reports;
create policy "officers read all reports"
  on public.farmer_reports for select to authenticated
  using (public.my_role() in ('officer', 'expert'));

drop policy if exists "officers update report status" on public.farmer_reports;
create policy "officers update report status"
  on public.farmer_reports for update to authenticated
  using (public.my_role() = 'officer');

-- ============================================================================
-- 2. STORAGE — private bucket, farmer folders, officers can read
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('crop-photos', 'crop-photos', false)
on conflict (id) do nothing;

drop policy if exists "farmers upload to own folder" on storage.objects;
create policy "farmers upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "farmers read own photos" on storage.objects;
create policy "farmers read own photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'crop-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.my_role() in ('officer', 'expert'))
  );

drop policy if exists "farmers delete own photos" on storage.objects;
create policy "farmers delete own photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'crop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 3. COOPERATIVE GROUPS
-- ============================================================================
create table if not exists public.farm_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  area       text not null,
  main_crop  text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.farm_groups(id) on delete cascade,
  farmer_id  uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (group_id, farmer_id)
);

alter table public.farm_groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "groups readable" on public.farm_groups;
create policy "groups readable"
  on public.farm_groups for select to authenticated using (true);

drop policy if exists "users create groups" on public.farm_groups;
create policy "users create groups"
  on public.farm_groups for insert to authenticated with check (true);

drop policy if exists "members readable" on public.group_members;
create policy "members readable"
  on public.group_members for select to authenticated using (true);

drop policy if exists "users join groups" on public.group_members;
create policy "users join groups"
  on public.group_members for insert to authenticated
  with check (farmer_id = auth.uid());

drop policy if exists "users leave groups" on public.group_members;
create policy "users leave groups"
  on public.group_members for delete to authenticated
  using (farmer_id = auth.uid());

-- ============================================================================
-- 4. SHARED RESOURCE NEEDS (rule-based matching, no AI)
-- ============================================================================
create table if not exists public.resource_needs (
  id           uuid primary key default gen_random_uuid(),
  farmer_id    uuid not null references auth.users(id) on delete cascade,
  resource_type text not null,
  area         text not null,
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.resource_needs enable row level security;

drop policy if exists "needs readable" on public.resource_needs;
create policy "needs readable"
  on public.resource_needs for select to authenticated using (true);

drop policy if exists "farmers post needs" on public.resource_needs;
create policy "farmers post needs"
  on public.resource_needs for insert to authenticated
  with check (farmer_id = auth.uid());

drop policy if exists "farmers delete own needs" on public.resource_needs;
create policy "farmers delete own needs"
  on public.resource_needs for delete to authenticated
  using (farmer_id = auth.uid());

-- ============================================================================
-- 5. KNOWLEDGE SHARING (farmer experience vs verified guidance)
-- ============================================================================
create table if not exists public.knowledge_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Farmer',
  area        text,
  crop        text not null,
  topic       text not null,
  title       text not null,
  body        text not null,
  is_verified boolean not null default false,   -- officer/expert contribution
  created_at  timestamptz not null default now()
);

alter table public.knowledge_posts enable row level security;

drop policy if exists "knowledge readable" on public.knowledge_posts;
create policy "knowledge readable"
  on public.knowledge_posts for select to authenticated using (true);

drop policy if exists "users share knowledge" on public.knowledge_posts;
create policy "users share knowledge"
  on public.knowledge_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      is_verified = false
      or public.my_role() in ('officer', 'expert')
    )
  );

drop policy if exists "authors delete own knowledge" on public.knowledge_posts;
create policy "authors delete own knowledge"
  on public.knowledge_posts for delete to authenticated
  using (author_id = auth.uid());

-- ============================================================================
-- 6. RISK PATTERNS (rule-detected signals; officer-verified alerts)
-- ============================================================================
create table if not exists public.risk_patterns (
  id           uuid primary key default gen_random_uuid(),
  crop         text not null,
  symptom      text not null,
  area         text not null,
  report_count integer not null default 0,
  status       text not null default 'signal'
               check (status in ('signal', 'verified', 'rejected')),
  verified_by  uuid references auth.users(id) on delete set null,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.risk_patterns enable row level security;

drop policy if exists "patterns readable" on public.risk_patterns;
create policy "patterns readable"
  on public.risk_patterns for select to authenticated using (true);

drop policy if exists "officers manage patterns" on public.risk_patterns;
create policy "officers manage patterns"
  on public.risk_patterns for insert to authenticated
  with check (public.my_role() = 'officer');

-- ============================================================================
-- 7. GLOBAL COMMUNITY CHAT (boards → posts → comments → votes)
-- ============================================================================
create table if not exists public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Farmer',
  board       text not null default 'general',
  flair       text not null default 'discussion'
              check (flair in ('question','experience','problem','resource',
                               'discussion','verified','official')),
  title       text not null,
  body        text,
  score       integer not null default 0,
  reply_count integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Farmer',
  author_role text not null default 'farmer',
  body        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.post_votes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists community_posts_board_idx on public.community_posts (board, created_at desc);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.community_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_votes enable row level security;

-- Flairs 'verified' and 'official' are reserved for officers/experts.
create or replace function public.check_flair_role()
returns trigger
language plpgsql
as $$
begin
  if new.flair in ('verified', 'official') then
    if coalesce(public.my_role(), 'farmer') not in ('officer', 'expert') then
      raise exception 'Only officers and experts can use that flair';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_flair on public.community_posts;
create trigger trg_check_flair
  before insert on public.community_posts
  for each row execute function public.check_flair_role();

drop policy if exists "posts readable" on public.community_posts;
create policy "posts readable"
  on public.community_posts for select to authenticated using (true);

drop policy if exists "users create posts" on public.community_posts;
create policy "users create posts"
  on public.community_posts for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "authors delete own posts" on public.community_posts;
create policy "authors delete own posts"
  on public.community_posts for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "comments readable" on public.post_comments;
create policy "comments readable"
  on public.post_comments for select to authenticated using (true);

drop policy if exists "users comment" on public.post_comments;
create policy "users comment"
  on public.post_comments for insert to authenticated
  with check (author_id = auth.uid());

-- Atomic vote counting (called from the client after inserting a vote row).
create or replace function public.ks_post_vote(p_post uuid, p_delta int)
returns void
language sql
as $$
  update public.community_posts
  set score = greatest(0, score + p_delta)
  where id = p_post;
$$;

-- ============================================================================
-- 8. REALTIME — live community posts
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.community_posts;
exception
  when duplicate_object then null;  -- already added
end $$;

-- ============================================================================
-- 9. GROUP CHAT (messages between members of a cooperative group)
-- ============================================================================
create table if not exists public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.farm_groups(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default 'Farmer',
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists group_messages_group_idx
  on public.group_messages (group_id, created_at desc);

alter table public.group_messages enable row level security;

-- Helper: is the current user a member of the given group?
create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and farmer_id = auth.uid()
  )
$$;

drop policy if exists "members read group messages" on public.group_messages;
create policy "members read group messages"
  on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members post in their groups" on public.group_messages;
create policy "members post in their groups"
  on public.group_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "authors delete own messages" on public.group_messages;
create policy "authors delete own messages"
  on public.group_messages for delete to authenticated
  using (sender_id = auth.uid());

-- Realtime: new group messages stream live to online members.
-- (Supabase applies RLS to realtime, so only members receive them.)
do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception
  when duplicate_object then null;  -- already added
end $$;

-- ============================================================================
-- 10. RESOURCE OFFERS (farmers share/sell UNUSED surplus — leftover fertilizer,
--     extra seeds, spare equipment — instead of letting it sit idle)
-- ============================================================================
create table if not exists public.resource_offers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default 'Farmer',
  item_name  text not null check (char_length(item_name) between 1 and 120),
  item_type  text not null,
  quantity   numeric not null check (quantity > 0),
  unit       text not null default 'kg',
  price      numeric not null default 0 check (price >= 0),  -- 0 = share for free
  area       text not null,
  contact    text,                                           -- optional phone / WhatsApp
  note       text,
  status     text not null default 'available' check (status in ('available','shared')),
  created_at timestamptz not null default now()
);

create index if not exists resource_offers_area_idx
  on public.resource_offers (area, created_at desc);

alter table public.resource_offers enable row level security;

drop policy if exists "offers readable" on public.resource_offers;
create policy "offers readable"
  on public.resource_offers for select to authenticated using (true);

drop policy if exists "farmers post offers" on public.resource_offers;
create policy "farmers post offers"
  on public.resource_offers for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "owners update own offers" on public.resource_offers;
create policy "owners update own offers"
  on public.resource_offers for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owners delete own offers" on public.resource_offers;
create policy "owners delete own offers"
  on public.resource_offers for delete to authenticated
  using (owner_id = auth.uid());

-- ============================================================================
-- DONE ✅
-- ============================================================================
