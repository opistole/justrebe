-- ============================================================
-- ReBe ReFresh — 'Intake complete' as a tag (not a separate column-driven badge)
--
-- Migration 025 made tags primary. This finishes the shift by making
-- intake-completion just another tag, so the team's mental model is:
-- "everything is a tag, nothing is special."
--
-- After this:
--   - Anyone who has intake_completed=TRUE in refresh_signups gets an
--     'Intake complete' tag (backfilled here)
--   - New intake submissions (Stripe webhook insert, or
--     /api/notify PATCHing intake_completed=true) automatically add
--     the tag via the trigger below
--
-- The 'Needs intake' UI badge can now be derived purely from tags:
--   if 'Cohort' present AND 'Intake complete' absent → needs intake
--
-- Safe to re-run.
-- ============================================================

-- ---- BACKFILL ----
INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
SELECT LOWER(TRIM(email)), 'Intake complete', 'system', COALESCE(created_at, NOW())
FROM refresh_signups
WHERE email IS NOT NULL AND TRIM(email) <> ''
  AND intake_completed = TRUE
ON CONFLICT (customer_email, tag) DO NOTHING;

-- ---- TRIGGER: fires on INSERT with intake_completed=true, or on UPDATE
--      when intake_completed flips from null/false to true ----
CREATE OR REPLACE FUNCTION fn_autotag_intake_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.intake_completed = TRUE
     AND (TG_OP = 'INSERT' OR OLD.intake_completed IS DISTINCT FROM TRUE) THEN
    INSERT INTO customer_tags (customer_email, tag, added_by_email, added_at)
    VALUES (LOWER(TRIM(COALESCE(NEW.email, ''))), 'Intake complete', 'system', NOW())
    ON CONFLICT (customer_email, tag) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_autotag_intake_complete ON refresh_signups;
CREATE TRIGGER trg_autotag_intake_complete
  AFTER INSERT OR UPDATE ON refresh_signups
  FOR EACH ROW EXECUTE FUNCTION fn_autotag_intake_complete();
