-- ============================================================
-- ReBe ReFresh — pre/post cohort surveys.
--
-- Captures self-reported scores across 3 criteria from cohort
-- participants — same questions before and after the 5-week
-- cohort so the team can measure transformation.
--
-- THREE CRITERIA:
--   - perspective       (need to reframe)
--   - community_connection (felt connection)
--   - hope              (optimism for the future)
--
-- Each criterion has a 1-5 score + an optional comment.
-- survey_type tells us whether this is the 'pre' or 'post' submission.
-- cohort_id allows multiple cohorts to share the same table (next
-- cohort uses cohort_id='cohort-2', etc.).
--
-- Run in Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS cohort_surveys (
  id                BIGSERIAL PRIMARY KEY,
  cohort_id         TEXT NOT NULL DEFAULT 'cohort-1',
  survey_type       TEXT NOT NULL,        -- 'pre' or 'post'
  full_name         TEXT,
  email             TEXT NOT NULL,
  perspective_score INT,                  -- 1..5
  perspective_comment TEXT,
  connection_score  INT,                  -- 1..5
  connection_comment TEXT,
  hope_score        INT,                  -- 1..5
  hope_comment      TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent        TEXT,
  CONSTRAINT survey_type_chk        CHECK (survey_type IN ('pre','post')),
  CONSTRAINT perspective_score_chk  CHECK (perspective_score IS NULL OR perspective_score BETWEEN 1 AND 5),
  CONSTRAINT connection_score_chk   CHECK (connection_score  IS NULL OR connection_score  BETWEEN 1 AND 5),
  CONSTRAINT hope_score_chk         CHECK (hope_score        IS NULL OR hope_score        BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS cohort_surveys_email_idx        ON cohort_surveys (LOWER(email));
CREATE INDEX IF NOT EXISTS cohort_surveys_cohort_type_idx  ON cohort_surveys (cohort_id, survey_type);

-- RLS: anyone (even anon) can INSERT a survey. Only team (anyone in
-- user_roles) can SELECT results.
ALTER TABLE cohort_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can submit a survey" ON cohort_surveys;
CREATE POLICY "anyone can submit a survey"
  ON cohort_surveys FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "team can read surveys" ON cohort_surveys;
CREATE POLICY "team can read surveys"
  ON cohort_surveys FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));
