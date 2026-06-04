-- 009_drop_paypal_columns.sql
--
-- We switched from PayPal to Stripe earlier. The PayPal-era columns
-- are still on the tables but never written to anymore — every new
-- row's PayPal columns are NULL. Dropping them now to keep the
-- schema clean and reduce confusion when reading rows in the
-- Supabase Table Editor.
--
-- Replacement columns (added in migration 007):
--   stripe_session_id   replaces  paypal_order_id
--   paid_amount_cents   replaces  paypal_amount
--   paid_at             (new, no PayPal equivalent)
--
-- Safe to re-run — IF EXISTS guards make it idempotent. Run in
-- Supabase → SQL Editor.

ALTER TABLE public.refresh_signups
  DROP COLUMN IF EXISTS paypal_order_id,
  DROP COLUMN IF EXISTS paypal_amount;

ALTER TABLE public.confidant_requests
  DROP COLUMN IF EXISTS paypal_order_id;
