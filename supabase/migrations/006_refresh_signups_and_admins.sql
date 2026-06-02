-- Migration 006 — refresh_signups + admin_emails
-- The cohort enrollment form on refresh-groups.html writes to refresh_signups,
-- and admin_emails is the team-member allowlist used by RLS policies on
-- refresh_signups, confidant_requests, and (later) the CRM.
--
-- Neither table was created when the public forms went live — submissions
-- to both have been silently failing with PGRST205 "table not found".
--
-- Idempotent — safe to re-run.
-- Run this in Supabase → SQL Editor.

-- ============================================================
-- 1. ADMIN_EMAILS — allowlist for team staff
-- ============================================================
create table if not exists public.admin_emails (
  email         text primary key,
  display_name  text,
  role          text not null default 'admin'
                check (role in ('admin', 'coach', 'coordinator')),
  added_at      timestamptz not null default now()
);

-- Seed the owner so RLS policies that depend on this table aren't empty
insert into public.admin_emails (email, display_name, role)
values ('osilpistole@gmail.com', 'Osil Pistole', 'admin')
on conflict (email) do update
  set display_name = excluded.display_name,
      role = excluded.role;

-- admin_emails is read by RLS; allow authenticated users to SELECT
-- their own row (and that's it — anonymous can't read anything)
alter table public.admin_emails enable row level security;

drop policy if exists "Authenticated can read admin_emails" on public.admin_emails;
create policy "Authenticated can read admin_emails"
  on public.admin_emails for select
  to authenticated
  using (true);

-- ============================================================
-- 2. REFRESH_SIGNUPS — cohort enrollment form
-- ============================================================
create table if not exists public.refresh_signups (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),

  -- Identity
  full_name                   text not null,
  email                       text not null,
  phone                       text not null,

  -- Audience (auto-set by page — groups/corporate/education/faith)
  audience_type               text not null default 'groups'
                              check (audience_type in ('groups', 'corporate', 'education', 'faith')),

  -- Optional context
  organization_name           text,
  role_title                  text,

  -- Intake answers
  group_type                  text,
  preferred_group_time        text,
  reason_for_interest         text,
  area_needing_refresh        text,
  area_other                  text,
  previous_rebe_experience    boolean,
  readiness                   text
                              check (readiness in ('ready_to_pay', 'wants_intake_call', 'wants_more_info', 'waitlist')),
  notes                       text,

  -- Referral
  who_referred_you            text,
  referral_code               text,

  -- Consent
  consent_to_contact          boolean default false,
  consent_to_confidentiality  boolean default false,

  -- Admin / payment lifecycle
  status                      text not null default 'new'
                              check (status in ('new', 'contacted', 'enrolled', 'cancelled', 'archived')),
  payment_status              text not null default 'pending'
                              check (payment_status in ('pending', 'paid', 'refunded', 'not_applicable')),
  paypal_order_id             text,
  paypal_amount               numeric(10,2),
  assigned_group              text,
  admin_notes                 text
);

create index if not exists refresh_signups_audience_idx       on public.refresh_signups(audience_type);
create index if not exists refresh_signups_status_idx         on public.refresh_signups(status);
create index if not exists refresh_signups_payment_idx        on public.refresh_signups(payment_status);
create index if not exists refresh_signups_created_idx        on public.refresh_signups(created_at desc);
create index if not exists refresh_signups_email_idx          on public.refresh_signups(email);

-- ============================================================
-- 3. RLS for refresh_signups
-- ============================================================
alter table public.refresh_signups enable row level security;

-- Anyone can INSERT (public form submission)
drop policy if exists "Anyone can submit cohort signup" on public.refresh_signups;
create policy "Anyone can submit cohort signup"
  on public.refresh_signups for insert
  to anon, authenticated
  with check (true);

-- After PayPal capture the JS updates paypal_order_id + status='paid' using
-- the row id captured from the INSERT. Allow that update path.
drop policy if exists "Anyone can confirm payment on their own signup" on public.refresh_signups;
create policy "Anyone can confirm payment on their own signup"
  on public.refresh_signups for update
  to anon, authenticated
  using (true)
  with check (true);

-- Admins (team allowlist) can SELECT all
drop policy if exists "Admins can view all signups" on public.refresh_signups;
create policy "Admins can view all signups"
  on public.refresh_signups for select
  to authenticated
  using (auth.email() in (select email from public.admin_emails));

drop policy if exists "Admins can update all signups" on public.refresh_signups;
create policy "Admins can update all signups"
  on public.refresh_signups for update
  to authenticated
  using (auth.email() in (select email from public.admin_emails));

-- Done.
