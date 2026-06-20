-- ============================================================
-- ReBe ReFresh — track intake-form completion explicitly.
--
-- The old logic inferred intake-done from seat_type, but that
-- broke for paid customers who completed the intake form
-- separately (they showed as 'Needs intake' in the CRM even
-- though they were done). This adds an explicit column so the
-- team can both:
--   (a) trust the auto-detection for the common cases
--   (b) manually flip it for edge cases via the CRM toggle
--
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE refresh_signups
  ADD COLUMN IF NOT EXISTS intake_completed BOOLEAN;

-- Backfill: anyone with an intake-style seat_type OR who has any
-- of the free-text intake fields filled in is treated as 'done'.
UPDATE refresh_signups
SET intake_completed = TRUE
WHERE intake_completed IS NULL
  AND (
    seat_type IN ('attendee', 'facilitator', 'comped', 'other')
    OR COALESCE(area_needing_refresh, '') <> ''
    OR COALESCE(reason_for_interest,  '') <> ''
    OR COALESCE(previous_rebe_experience, '') <> ''
  );
