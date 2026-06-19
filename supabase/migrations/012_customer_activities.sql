-- ============================================================
-- ReBe ReFresh — Admin CRM Phase 4
-- Activity log for every email / SMS sent through the CRM.
-- Lets the team see a unified per-customer comms history.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE customer_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,

  -- 'email_sent' | 'sms_sent' (more types later: kit_event, etc.)
  type TEXT NOT NULL CHECK (type IN ('email_sent', 'sms_sent')),

  -- Common fields
  body TEXT,           -- email text body or SMS content
  subject TEXT,        -- email subject (NULL for SMS)
  from_addr TEXT,      -- sender email or phone number
  to_addr TEXT,        -- recipient email or phone number

  -- Who triggered it
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,

  -- Provider response metadata (Resend message id, OpenPhone id, etc.)
  metadata JSONB,

  -- Send status
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_activities_email ON customer_activities(customer_email);
CREATE INDEX idx_customer_activities_created ON customer_activities(created_at DESC);
CREATE INDEX idx_customer_activities_type ON customer_activities(type);

-- RLS — admin/staff can read; INSERTs come from server-side functions
-- using service_role (which bypasses RLS), so we don't need an INSERT
-- policy here. We do need a SELECT policy.
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_read_activities" ON customer_activities
  FOR SELECT TO authenticated USING (is_admin_or_staff());
