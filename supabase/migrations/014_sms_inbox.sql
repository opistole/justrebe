-- ============================================================
-- ReBe ReFresh — Admin CRM Phase 6A
-- Add 'sms_received' to customer_activities type check so the
-- Twilio incoming webhook can log incoming texts there.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_type_check;
ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_type_check
  CHECK (type IN ('email_sent', 'sms_sent', 'sms_received', 'email_received'));
