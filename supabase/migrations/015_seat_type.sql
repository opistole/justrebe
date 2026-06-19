-- ============================================================
-- ReBe ReFresh — add seat_type to refresh_signups so we can
-- distinguish paying customers, facilitators, and complimentary
-- participants in the CRM.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE refresh_signups
  ADD COLUMN IF NOT EXISTS seat_type TEXT
  DEFAULT 'paid'
  CHECK (seat_type IN ('paid', 'comped', 'facilitator', 'other'));

-- Backfill: any existing row with a paid_at timestamp is 'paid';
-- everything else stays at the default.
UPDATE refresh_signups SET seat_type = 'paid' WHERE seat_type IS NULL AND paid_at IS NOT NULL;
