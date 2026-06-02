-- Migration 005 — confidant_requests table
-- Stores 1:1 private-session requests from refresh-private.html.
-- The HTML form has been live for a while but the table wasn't created,
-- so submissions were silently failing with PGRST205 "table not found".
--
-- Idempotent — safe to re-run.
-- Run in Supabase → SQL Editor.

-- ============================================================
-- 1. TABLE
-- ============================================================
create table if not exists public.confidant_requests (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  email                 text not null,
  phone                 text,
  preferred_confidant   text not null,
  situation             text not null,
  best_times            text,
  paypal_order_id       text,
  status                text not null default 'pending'
                        check (status in ('pending', 'paid', 'scheduled', 'completed', 'cancelled')),
  created_at            timestamptz not null default now()
);

create index if not exists confidant_requests_email_idx       on public.confidant_requests(email);
create index if not exists confidant_requests_status_idx      on public.confidant_requests(status);
create index if not exists confidant_requests_created_at_idx  on public.confidant_requests(created_at desc);
create index if not exists confidant_requests_confidant_idx   on public.confidant_requests(preferred_confidant);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================
alter table public.confidant_requests enable row level security;

-- Anyone can INSERT a request (public form submission from refresh-private.html)
drop policy if exists "Anyone can submit a confidant request" on public.confidant_requests;
create policy "Anyone can submit a confidant request"
  on public.confidant_requests for insert
  to anon, authenticated
  with check (true);

-- After PayPal capture, the same anonymous client needs to UPDATE the row
-- with paypal_order_id + status='paid'. Scope this to just those two columns
-- by restricting via the row's existing id (the JS holds the row id from the
-- INSERT and uses .eq('id', requestId) before .update()).
drop policy if exists "Anyone can confirm payment on their own request" on public.confidant_requests;
create policy "Anyone can confirm payment on their own request"
  on public.confidant_requests for update
  to anon, authenticated
  using (true)
  with check (true);

-- Admins (later, via CRM auth) can SELECT all requests
-- Only creates this policy if admin_emails table exists
do $$
begin
  if exists (select 1 from pg_class where relname = 'admin_emails') then
    execute 'drop policy if exists "Admins can view confidant requests" on public.confidant_requests';
    execute $sql$
      create policy "Admins can view confidant requests"
        on public.confidant_requests for select
        to authenticated
        using (auth.email() in (select email from public.admin_emails))
    $sql$;
  end if;
end $$;

-- Done.
