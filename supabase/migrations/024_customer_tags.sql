-- ============================================================
-- ReBe ReFresh — Manual tags on customers.
--
-- Up until now every "tag" shown in the CRM was DERIVED from source
-- data (status='enrolled' → "Cohort", paid_amount_cents > 0 → "Paid",
-- etc). You couldn't say "yes, this person showed up to the 11 AM
-- cohort" or "I added them to the group offline" because there was no
-- place to put that.
--
-- This adds a tiny key/value table: one row per (customer_email, tag).
-- Tags are arbitrary free-text strings, lower-cased & trimmed at write
-- time. Team can add quick-add buttons in the UI but any string works.
--
-- Auth model: any signed-in team member (anyone with a row in
-- user_roles) can read + write any customer's tags. Mirrors how
-- customer_notes works.
--
-- Run in Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_tags (
  id              BIGSERIAL PRIMARY KEY,
  customer_email  TEXT NOT NULL,
  tag             TEXT NOT NULL,
  added_by_email  TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_tags_unique UNIQUE (customer_email, tag)
);

CREATE INDEX IF NOT EXISTS customer_tags_email_idx ON customer_tags(customer_email);
CREATE INDEX IF NOT EXISTS customer_tags_tag_idx   ON customer_tags(tag);

-- Normalize on write so 'VIP', 'vip', ' VIP ' all collapse to 'vip'.
-- Keep human-friendly display by storing trimmed but preserving case;
-- the unique constraint above uses the actual stored value, so we
-- lowercase before insert via app code instead of a trigger. (Triggers
-- can fight with optimistic-update patterns. App-side normalization
-- keeps the data path simple.)

-- RLS: any authenticated user with a row in user_roles can read/write.
-- This matches the existing pattern for customer_notes.
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team can read customer_tags" ON customer_tags;
CREATE POLICY "team can read customer_tags"
  ON customer_tags FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "team can insert customer_tags" ON customer_tags;
CREATE POLICY "team can insert customer_tags"
  ON customer_tags FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "team can delete customer_tags" ON customer_tags;
CREATE POLICY "team can delete customer_tags"
  ON customer_tags FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));
