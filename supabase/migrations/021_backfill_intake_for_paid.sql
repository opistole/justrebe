-- ============================================================
-- ReBe ReFresh — backfill intake_completed for paid Stripe customers.
--
-- Stripe Checkout collects intake-style custom fields as part of the
-- payment flow, but our webhook never writes them to refresh_signups.
-- So paid customers were ending up flagged 'Needs intake' even though
-- they had completed it.
--
-- Rule: if you have a stripe_session_id or paid_amount_cents > 0,
-- you went through Stripe Checkout and answered the intake there.
-- Mark intake_completed = TRUE so the CRM badge reflects reality.
--
-- Run this in Supabase SQL Editor (after 019).
-- ============================================================

UPDATE refresh_signups
SET intake_completed = TRUE
WHERE intake_completed IS NULL
  AND (
    (stripe_session_id IS NOT NULL AND stripe_session_id <> '')
    OR COALESCE(paid_amount_cents, 0) > 0
  );
