-- ============================================================
-- ReBe ReFresh — backfill 'Intake complete' tag for anyone who
-- actually has intake data (was missing because /api/notify wasn't
-- persisting to DB until yesterday's fix).
--
-- The original migration 026 only tagged people whose
-- refresh_signups.intake_completed = TRUE. But all the historical
-- paid customers had this column NULL because:
--   1. /api/notify (the endpoint /thank-you-cohort POSTs to) never
--      wrote to the DB until commit 1b2c0af (2026-06-21).
--   2. Stripe webhook never set intake_completed either.
--
-- Result: paid customers who filled out intake were showing 'Needs
-- intake' in the CRM. False alarm.
--
-- This migration assumes anyone who:
--   - paid (paid_amount_cents > 0), OR
--   - has free-text intake content (notes / area_needing_refresh /
--     reason_for_interest)
-- has actually completed intake — and tags them accordingly.
-- It also flips intake_completed = TRUE on those rows so the column
-- and the tag stay in sync going forward.
--
-- Safe to re-run.
-- ============================================================

-- Tag people we can infer completed intake.
INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Intake complete', 'system', NOW()
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND (
    intake_completed = TRUE
    OR COALESCE(paid_amount_cents, 0) > 0
    OR (notes IS NOT NULL AND TRIM(notes::text) <> '')
    OR (area_needing_refresh IS NOT NULL AND TRIM(area_needing_refresh::text) <> '')
    OR (reason_for_interest IS NOT NULL AND TRIM(reason_for_interest::text) <> '')
  )
ON CONFLICT (customer_email, tag) DO NOTHING;

-- Flip the column TRUE for the same set so future code that reads
-- intake_completed (e.g. the search/render layer) also sees them as done.
UPDATE refresh_signups
SET intake_completed = TRUE
WHERE intake_completed IS DISTINCT FROM TRUE
  AND (
    COALESCE(paid_amount_cents, 0) > 0
    OR (notes IS NOT NULL AND TRIM(notes::text) <> '')
    OR (area_needing_refresh IS NOT NULL AND TRIM(area_needing_refresh::text) <> '')
    OR (reason_for_interest IS NOT NULL AND TRIM(reason_for_interest::text) <> '')
  );
