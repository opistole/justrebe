-- ============================================================
-- ReBe ReFresh — allow admin/staff to insert customer rows from
-- the CRM (manual 'Add customer', status override, intake override).
--
-- migration 010 added SELECT + UPDATE policies. 018 added DELETE.
-- INSERT was never granted, so:
--   - '+ Add customer' fails with 'new row violates row-level security'
--   - 'Change status -> Mark as paid' on a workshop-only contact fails
--     when it tries to create a minimal refresh_signups row
--   - 'Mark intake done' on a workshop-only contact fails the same way
--
-- This grants INSERT to authenticated admin/staff users.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE POLICY "admin_staff_insert_contacts" ON contacts
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

CREATE POLICY "admin_staff_insert_refresh_signups" ON refresh_signups
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());
