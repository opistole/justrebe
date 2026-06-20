-- ============================================================
-- ReBe ReFresh — allow admin/staff to delete customers.
--
-- The original Phase 1 migration enabled RLS on contacts and
-- refresh_signups + added SELECT and UPDATE policies, but never
-- added a DELETE policy. Result: clicking 'Delete customer'
-- from the CRM silently returned 0 rows affected — the row
-- never actually deleted, and Osil's test customers stayed
-- visible.
--
-- This fixes that.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE POLICY "admin_staff_delete_contacts" ON contacts
  FOR DELETE TO authenticated USING (is_admin_or_staff());

CREATE POLICY "admin_staff_delete_refresh_signups" ON refresh_signups
  FOR DELETE TO authenticated USING (is_admin_or_staff());
