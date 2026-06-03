-- 007_stripe_columns.sql
--
-- Adds the columns the Stripe webhook writes to when a Checkout Session
-- completes. Applied to both refresh_signups (cohort) and confidant_requests
-- (1:1) so the same webhook handler works for both kinds of payment.
--
-- Columns:
--   stripe_session_id  — the Stripe Checkout Session ID (cs_test_... or cs_live_...)
--   paid_amount_cents  — what they actually paid, in cents (e.g., 49700 for $497)
--   paid_at            — timestamp when Stripe confirmed payment
--
-- IF NOT EXISTS makes this safe to re-run.

ALTER TABLE public.refresh_signups
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.confidant_requests
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Helpful for looking up rows by Stripe session ID (e.g., from the success page).
CREATE INDEX IF NOT EXISTS refresh_signups_stripe_session_id_idx
  ON public.refresh_signups (stripe_session_id);

CREATE INDEX IF NOT EXISTS confidant_requests_stripe_session_id_idx
  ON public.confidant_requests (stripe_session_id);
