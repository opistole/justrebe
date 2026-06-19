-- ============================================================
-- ReBe ReFresh — Admin CRM Phase 2
-- Switch customer_notes from contacts.id FK to email-keyed.
--
-- Why: cohort customers (refresh_signups) often don't have a
-- matching row in contacts (workshop signups table). Email is
-- the universal identifier across both flows.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. Add new email column
ALTER TABLE customer_notes
  ADD COLUMN customer_email TEXT;

-- 2. Backfill from existing customer_id (if any notes already exist).
-- Safe to run even if customer_notes is empty.
UPDATE customer_notes
SET customer_email = (
  SELECT email FROM contacts WHERE contacts.id = customer_notes.customer_id
)
WHERE customer_email IS NULL AND customer_id IS NOT NULL;

-- 3. Make NOT NULL after backfill
ALTER TABLE customer_notes
  ALTER COLUMN customer_email SET NOT NULL;

-- 4. Drop the old customer_id column (no longer needed)
ALTER TABLE customer_notes
  DROP COLUMN customer_id;

-- 5. Index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_customer_notes_email ON customer_notes(customer_email);

-- 6. RLS policies already cover this since they use is_admin_or_staff().
-- The INSERT policy now needs to be re-checked because the WITH CHECK
-- references customer_id which no longer exists.
DROP POLICY IF EXISTS "admin_staff_create_notes" ON customer_notes;

CREATE POLICY "admin_staff_create_notes" ON customer_notes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff() AND author_id = auth.uid());
