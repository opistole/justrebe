-- Migration 004 — CRM foundation
-- Adds: team-member fields on admin_emails, crm_notes, crm_signups view,
-- admin SELECT policies on contacts/enrollments/programs.
-- Idempotent — safe to re-run.
--
-- Run this in Supabase SQL Editor after migrations 001-003.

-- ============================================================
-- 1. EXTEND admin_emails with display_name + role
--    (admin_emails is the existing allowlist for staff login)
-- ============================================================
create table if not exists public.admin_emails (
  email      text primary key,
  added_at   timestamptz not null default now()
);

alter table public.admin_emails
  add column if not exists display_name text,
  add column if not exists role text not null default 'coach'
    check (role in ('admin', 'coach', 'coordinator'));

-- ============================================================
-- 2. CRM_NOTES — free-form notes keyed by contact email
--    Notes follow the person across every form they fill out.
-- ============================================================
create table if not exists public.crm_notes (
  id            uuid primary key default gen_random_uuid(),
  contact_email text not null,
  body          text not null check (length(trim(body)) > 0),
  author_email  text not null,
  created_at    timestamptz not null default now()
);

create index if not exists crm_notes_email_idx
  on public.crm_notes (lower(trim(contact_email)));

create index if not exists crm_notes_created_idx
  on public.crm_notes (created_at desc);

alter table public.crm_notes enable row level security;

drop policy if exists "Team can read notes" on public.crm_notes;
create policy "Team can read notes"
  on public.crm_notes for select
  to authenticated
  using (auth.email() in (select email from public.admin_emails));

drop policy if exists "Team can write notes" on public.crm_notes;
create policy "Team can write notes"
  on public.crm_notes for insert
  to authenticated
  with check (
    auth.email() in (select email from public.admin_emails)
    and author_email = auth.email()
  );

drop policy if exists "Team can edit own notes" on public.crm_notes;
create policy "Team can edit own notes"
  on public.crm_notes for update
  to authenticated
  using (author_email = auth.email());

drop policy if exists "Team can delete own notes" on public.crm_notes;
create policy "Team can delete own notes"
  on public.crm_notes for delete
  to authenticated
  using (author_email = auth.email());

-- ============================================================
-- 3. ADMIN-SIDE SELECT policies on existing tables
--    (so authenticated team members can read everything)
-- ============================================================

-- contacts (from migration 001 — anyone can INSERT, nobody could SELECT until now)
do $$
begin
  if exists (select 1 from pg_class where relname = 'contacts') then
    execute 'alter table public.contacts enable row level security';
    execute 'drop policy if exists "Team can read contacts" on public.contacts';
    execute $sql$
      create policy "Team can read contacts"
        on public.contacts for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
    execute 'drop policy if exists "Team can update contacts" on public.contacts';
    execute $sql$
      create policy "Team can update contacts"
        on public.contacts for update
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

-- enrollments
do $$
begin
  if exists (select 1 from pg_class where relname = 'enrollments') then
    execute 'alter table public.enrollments enable row level security';
    execute 'drop policy if exists "Team can read enrollments" on public.enrollments';
    execute $sql$
      create policy "Team can read enrollments"
        on public.enrollments for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
    execute 'drop policy if exists "Team can update enrollments" on public.enrollments';
    execute $sql$
      create policy "Team can update enrollments"
        on public.enrollments for update
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

-- programs (public already has SELECT on open/waitlist — give team SELECT on all)
do $$
begin
  if exists (select 1 from pg_class where relname = 'programs') then
    execute 'drop policy if exists "Team can read all programs" on public.programs';
    execute $sql$
      create policy "Team can read all programs"
        on public.programs for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

-- refresh_signups + confidant_requests already have admin SELECT policies
-- from earlier setup (faith-setup.md, design spec) — verify they exist,
-- create if missing.

do $$
begin
  if exists (select 1 from pg_class where relname = 'refresh_signups') then
    execute 'drop policy if exists "Team can read all signups" on public.refresh_signups';
    execute $sql$
      create policy "Team can read all signups"
        on public.refresh_signups for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
    execute 'drop policy if exists "Team can update signups" on public.refresh_signups';
    execute $sql$
      create policy "Team can update signups"
        on public.refresh_signups for update
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class where relname = 'confidant_requests') then
    execute 'drop policy if exists "Team can read all confidant requests" on public.confidant_requests';
    execute $sql$
      create policy "Team can read all confidant requests"
        on public.confidant_requests for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
    execute 'drop policy if exists "Team can update confidant requests" on public.confidant_requests';
    execute $sql$
      create policy "Team can update confidant requests"
        on public.confidant_requests for update
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

-- ============================================================
-- 4. UNIFIED CRM VIEW — every signup from every form, one list
--    One row per signup (not deduped by email — Phase 2).
--    Columns are normalized so the dashboard treats them all alike.
-- ============================================================
create or replace view public.crm_signups as
with workshop_rows as (
  -- Workshop signups (reset.html → contacts + enrollments)
  select
    e.id::text                       as signup_id,
    'workshop'::text                 as source,
    coalesce(p.title, 'Workshop')    as program_title,
    c.first_name || ' ' || c.last_name as name,
    lower(trim(c.email))             as email,
    c.phone                          as phone,
    e.status                         as status,
    null::text                       as readiness,
    null::text                       as preferred_confidant,
    null::text                       as situation_or_reason,
    null::text                       as paypal_order_id,
    e.enrolled_at                    as created_at
  from public.enrollments e
  left join public.contacts c on c.id = e.contact_id
  left join public.programs p on p.id = e.program_id
  where p.type = 'workshop'
),
cohort_rows as (
  -- Cohort enrollments (refresh-groups.html → refresh_signups)
  select
    rs.id::text                      as signup_id,
    'cohort'::text                   as source,
    'ReFresh 6-week cohort'          as program_title,
    rs.full_name                     as name,
    lower(trim(rs.email))            as email,
    rs.phone                         as phone,
    rs.status                        as status,
    rs.readiness                     as readiness,
    null::text                       as preferred_confidant,
    rs.reason_for_interest           as situation_or_reason,
    rs.paypal_order_id               as paypal_order_id,
    rs.created_at                    as created_at
  from public.refresh_signups rs
),
oneonone_rows as (
  -- 1:1 requests (refresh-groups.html private section → confidant_requests)
  select
    cr.id::text                      as signup_id,
    '1on1'::text                     as source,
    'Private 1:1 with ' || cr.preferred_confidant as program_title,
    cr.name                          as name,
    lower(trim(cr.email))            as email,
    cr.phone                         as phone,
    cr.status                        as status,
    null::text                       as readiness,
    cr.preferred_confidant           as preferred_confidant,
    cr.situation                     as situation_or_reason,
    cr.paypal_order_id               as paypal_order_id,
    cr.created_at                    as created_at
  from public.confidant_requests cr
)
select * from workshop_rows
union all
select * from cohort_rows
union all
select * from oneonone_rows;

-- Grant team members SELECT on the view
grant select on public.crm_signups to authenticated;

-- ============================================================
-- 5. SEED — add the owner as the first admin so login works
-- ============================================================
insert into public.admin_emails (email, display_name, role)
values ('osilpistole@gmail.com', 'Osil Pistole', 'admin')
on conflict (email) do update
  set display_name = excluded.display_name,
      role = excluded.role;

-- Other team members: add them here (or via Supabase Table Editor) when ready.
-- Example:
-- insert into public.admin_emails (email, display_name, role)
--   values ('elizabeth@justrebe.com', 'Elizabeth Good', 'admin')
--   on conflict (email) do update set display_name = excluded.display_name, role = excluded.role;

-- Done.
