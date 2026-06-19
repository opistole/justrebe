-- ============================================================
-- ReBe ReFresh — Admin CRM Phase 5
-- Tasks (follow-ups per customer) + Kit events (webhook log).
--
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. customer_tasks — follow-ups assigned to a team member
-- ------------------------------------------------------------
CREATE TABLE customer_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_tasks_email ON customer_tasks(customer_email);
CREATE INDEX idx_customer_tasks_assigned_status ON customer_tasks(assigned_to, status);
CREATE INDEX idx_customer_tasks_due ON customer_tasks(due_date, status) WHERE status = 'open';

ALTER TABLE customer_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_read_tasks" ON customer_tasks
  FOR SELECT TO authenticated USING (is_admin_or_staff());

CREATE POLICY "admin_staff_create_tasks" ON customer_tasks
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff() AND created_by = auth.uid());

CREATE POLICY "admin_staff_update_tasks" ON customer_tasks
  FOR UPDATE TO authenticated USING (is_admin_or_staff());

CREATE POLICY "admin_staff_delete_tasks" ON customer_tasks
  FOR DELETE TO authenticated USING (is_admin_or_staff());

CREATE OR REPLACE FUNCTION update_customer_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_tasks_updated_at
  BEFORE UPDATE ON customer_tasks
  FOR EACH ROW EXECUTE FUNCTION update_customer_tasks_updated_at();


-- 2. kit_events — Kit webhook log per customer
-- ------------------------------------------------------------
CREATE TABLE kit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,

  -- Kit V4 webhook event names: subscriber_activate, subscriber_unsubscribe,
  -- subscriber_bounce, subscriber_complain, form_subscribe, course_subscribe,
  -- course_complete, link_click, product_purchase, tag_add, tag_remove
  event_type TEXT NOT NULL,

  tag_id TEXT,         -- when event_type is tag_add / tag_remove
  tag_name TEXT,       -- denormalized for display

  link_url TEXT,       -- when event_type is link_click
  form_id TEXT,        -- when event_type is form_subscribe

  raw JSONB,           -- full Kit payload for any future reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kit_events_email ON kit_events(customer_email);
CREATE INDEX idx_kit_events_created ON kit_events(created_at DESC);
CREATE INDEX idx_kit_events_type ON kit_events(event_type);

ALTER TABLE kit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_read_kit_events" ON kit_events
  FOR SELECT TO authenticated USING (is_admin_or_staff());
-- INSERTs come from server-side webhook handler (service_role bypasses RLS).


-- 3. list_team_members() — RPC for task-assign dropdown
-- Returns each team member's id, email, display name, role.
-- SECURITY DEFINER so it can read auth.users (which is otherwise hidden
-- from the API). Gated by is_admin_or_staff() to prevent leaking the
-- user list to anyone unauthenticated.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_team_members()
RETURNS TABLE(user_id UUID, email TEXT, full_name TEXT, role app_role)
LANGUAGE PLPGSQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
    SELECT
      u.id AS user_id,
      u.email::TEXT AS email,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email::TEXT, '@', 1)) AS full_name,
      ur.role
    FROM user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    ORDER BY ur.role::TEXT DESC, u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_team_members() TO authenticated;
