-- ============================================================================
-- KrishiSahayak AI — one-time fix: SURPLUS / UNUSED PRODUCT SHARING
-- Run this whole file in Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run (everything is IF NOT EXISTS / DROP POLICY IF EXISTS).
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
