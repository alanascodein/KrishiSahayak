-- ============================================================================
-- KrishiSahayak AI — DATABASE UPDATES (one-time fix)
-- Adds: (A) officer replies on farmer reports, (B) the group chat table.
-- Run in: Supabase Dashboard → SQL Editor → New query → paste ALL → Run
-- Safe to re-run. Takes a few seconds.
-- ============================================================================

-- ============================================================================
-- A. OFFICER REPLIES (feedback on farmer reports)
-- ============================================================================
alter table public.farmer_reports add column if not exists review_note  text;
alter table public.farmer_reports add column if not exists reviewed_by  uuid references auth.users(id) on delete set null;
alter table public.farmer_reports add column if not exists reviewed_at  timestamptz;

-- ============================================================================
-- B. GROUP CHAT (messages between members of a cooperative group)
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

-- Only members can read the group's messages.
drop policy if exists "members read group messages" on public.group_messages;
create policy "members read group messages"
  on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));

-- Only members can post, and only as themselves.
drop policy if exists "members post in their groups" on public.group_messages;
create policy "members post in their groups"
  on public.group_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_group_member(group_id));

-- Authors can delete their own messages.
drop policy if exists "authors delete own messages" on public.group_messages;
create policy "authors delete own messages"
  on public.group_messages for delete to authenticated
  using (sender_id = auth.uid());

-- Realtime: new messages stream live to members.
do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception
  when duplicate_object then null;  -- already added
end $$;
