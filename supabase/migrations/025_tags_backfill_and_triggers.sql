-- ============================================================
-- ReBe ReFresh — switch the CRM to a tag-first model (Kit style).
--
-- Up until now the dashboard inferred "tags" (Paid, Cohort, Lead,
-- Waitlist, Workshop, Comped) on the fly from source-table columns
-- like status, readiness, paid_amount_cents, seat_type. That meant:
--   - The team couldn't override a wrong inference (e.g. someone paid
--     but didn't show up — they were stuck looking "Paid")
--   - Removing/adding a "tag" required editing source data
--
-- This migration:
--   1. Backfills customer_tags from existing source data so every
--      person who already has signals in the DB shows up tagged.
--   2. Installs AFTER INSERT triggers on refresh_signups + contacts
--      so future signups automatically get the right tags without any
--      API code changes.
--
-- After this runs, the admin UI treats customer_tags as the source of
-- truth for "what is this person?". Source columns stay as the
-- underlying record but the team can add/remove tags freely.
--
-- Run in Supabase SQL editor. SAFE TO RE-RUN — uses ON CONFLICT DO
-- NOTHING for backfill + DROP IF EXISTS for triggers.
-- ============================================================

-- Helper: insert if not already present. customer_tags has a UNIQUE
-- constraint on (customer_email, tag) so ON CONFLICT works directly.

-- ---- BACKFILL FROM refresh_signups ----
INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Cohort', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND (status = 'enrolled' OR COALESCE(paid_amount_cents,0) > 0 OR intake_completed = TRUE)
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Cohort 11 AM', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND preferred_group_time ILIKE '%11%am%'
  AND (status = 'enrolled' OR COALESCE(paid_amount_cents,0) > 0 OR intake_completed = TRUE)
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Cohort 8 PM', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND preferred_group_time ILIKE '%8%pm%'
  AND (status = 'enrolled' OR COALESCE(paid_amount_cents,0) > 0 OR intake_completed = TRUE)
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Paid', 'system', COALESCE(paid_at, created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND COALESCE(paid_amount_cents,0) > 0
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Comped', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND seat_type = 'comped'
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Lead', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND readiness = 'wants_more_info'
ON CONFLICT (customer_email, tag) DO NOTHING;

INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Waitlist', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND readiness = 'waitlist'
ON CONFLICT (customer_email, tag) DO NOTHING;

-- ---- BACKFILL FROM contacts (workshop attendees) ----
INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Workshop attendee', 'system', COALESCE(created_at, NOW())
FROM contacts
WHERE email IS NOT NULL AND TRIM(email) <> ''
ON CONFLICT (customer_email, tag) DO NOTHING;

-- ============================================================
-- TRIGGERS: auto-tag on new INSERTs going forward
-- ============================================================

-- Function for refresh_signups inserts: tag based on slot + payment + state
CREATE OR REPLACE FUNCTION fn_autotag_refresh_signups()
RETURNS TRIGGER AS $$
DECLARE
  email_lc TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
BEGIN
  IF email_lc = '' THEN RETURN NEW; END IF;

  -- Cohort umbrella tag (any signup is at least a cohort lead)
  INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
  VALUES (email_lc, 'Cohort', 'system', NOW())
  ON CONFLICT (customer_email, tag) DO NOTHING;

  -- Slot-specific tags
  IF NEW.preferred_group_time ILIKE '%11%am%' THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Cohort 11 AM', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  ELSIF NEW.preferred_group_time ILIKE '%8%pm%' THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Cohort 8 PM', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  END IF;

  -- Payment / readiness / seat-type
  IF COALESCE(NEW.paid_amount_cents, 0) > 0 THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Paid', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  END IF;

  IF NEW.seat_type = 'comped' THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Comped', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  END IF;

  IF NEW.readiness = 'wants_more_info' THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Lead', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  ELSIF NEW.readiness = 'waitlist' THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (email_lc, 'Waitlist', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_autotag_refresh_signups ON refresh_signups;
CREATE TRIGGER trg_autotag_refresh_signups
  AFTER INSERT ON refresh_signups
  FOR EACH ROW EXECUTE FUNCTION fn_autotag_refresh_signups();

-- Function for contacts inserts: tag as Workshop attendee
CREATE OR REPLACE FUNCTION fn_autotag_contacts()
RETURNS TRIGGER AS $$
DECLARE
  email_lc TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
BEGIN
  IF email_lc = '' THEN RETURN NEW; END IF;
  INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
  VALUES (email_lc, 'Workshop attendee', 'system', NOW())
  ON CONFLICT (customer_email, tag) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_autotag_contacts ON contacts;
CREATE TRIGGER trg_autotag_contacts
  AFTER INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_autotag_contacts();
