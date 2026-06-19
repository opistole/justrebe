-- ============================================================
-- ReBe ReFresh — add 'attendee' to seat_type values.
-- (Replaces 'comped' in the form, but the constraint keeps
-- 'comped' too so any earlier rows stay valid.)
--
-- Run this in Supabase SQL Editor AFTER migration 015.
-- ============================================================

ALTER TABLE refresh_signups DROP CONSTRAINT IF EXISTS refresh_signups_seat_type_check;
ALTER TABLE refresh_signups ADD CONSTRAINT refresh_signups_seat_type_check
  CHECK (seat_type IN ('paid', 'attendee', 'comped', 'facilitator', 'other'));
