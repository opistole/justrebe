-- Migration 003 — refresh-groups page updates
-- Adds: who_referred_you column; allows 'waitlist' as a readiness option.
-- Safe to re-run (uses IF NOT EXISTS and DROP CONSTRAINT IF EXISTS).
--
-- Run this in Supabase SQL Editor (or via the Supabase CLI).

-- 1. Add who_referred_you column
alter table public.refresh_signups
  add column if not exists who_referred_you text;

-- 2. Update readiness check constraint to allow 'waitlist' (in addition to existing values)
alter table public.refresh_signups
  drop constraint if exists refresh_signups_readiness_check;

alter table public.refresh_signups
  add constraint refresh_signups_readiness_check
  check (readiness in ('ready_to_pay', 'wants_intake_call', 'wants_more_info', 'waitlist'));

-- Done.
