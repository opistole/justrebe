-- ============================================================
-- ReBe ReFresh — pilot_requests table for the corporate /
-- education / general pilot form on /pilot.html.
--
-- Replaces the fragile formsubmit.co flow that silently lost a
-- corporate submission. Every form submission now lands here
-- AND also fires an email via Resend.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE pilot_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- About them
  first_name TEXT NOT NULL,
  last_name  TEXT,
  email      TEXT NOT NULL,
  phone      TEXT,
  website    TEXT,

  -- About their organization
  organization TEXT NOT NULL,
  role_title   TEXT NOT NULL,

  -- Pathway: 'education' | 'workplace' | 'both' (was 'ReBe Education' / 'ReBe Workplace' / 'Both / Not Sure' on the form)
  pathway TEXT NOT NULL CHECK (pathway IN ('education', 'workplace', 'both')),

  -- Free-text fields
  challenges TEXT[],   -- the multi-select checkboxes
  timing     TEXT,     -- "what makes now the right time"

  -- Internal triage state — admin team can mark as contacted / closed
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost', 'spam')),

  -- Operational
  email_forwarded BOOLEAN NOT NULL DEFAULT FALSE,
  email_error TEXT,
  raw JSONB
);

CREATE INDEX idx_pilot_requests_created ON pilot_requests(created_at DESC);
CREATE INDEX idx_pilot_requests_pathway ON pilot_requests(pathway);
CREATE INDEX idx_pilot_requests_status  ON pilot_requests(status);

ALTER TABLE pilot_requests ENABLE ROW LEVEL SECURITY;

-- Only admin/staff can read. Inserts come from the public API
-- endpoint using service_role (bypasses RLS).
CREATE POLICY "admin_staff_read_pilot_requests" ON pilot_requests
  FOR SELECT TO authenticated USING (is_admin_or_staff());

CREATE POLICY "admin_staff_update_pilot_requests" ON pilot_requests
  FOR UPDATE TO authenticated USING (is_admin_or_staff());
