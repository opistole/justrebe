-- ============================================================
-- ReBe ReFresh — fix list_team_members RPC so it actually returns
-- avatar_url + title.
--
-- Migration 022 tried CREATE OR REPLACE FUNCTION, but Postgres won't
-- let CREATE OR REPLACE change the return type of an existing
-- function. So the function silently stayed on the old 4-column
-- signature (no avatar_url, no title), and the team directory
-- never received the photo URLs.
--
-- Fix: DROP first, then CREATE.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

DROP FUNCTION IF EXISTS list_team_members();

CREATE FUNCTION list_team_members()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  full_name TEXT,
  title TEXT,
  avatar_url TEXT,
  role app_role
)
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
      u.id                                                              AS user_id,
      u.email::TEXT                                                     AS email,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email::TEXT, '@', 1)) AS full_name,
      (u.raw_user_meta_data->>'title')                                  AS title,
      (u.raw_user_meta_data->>'avatar_url')                             AS avatar_url,
      ur.role
    FROM user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    ORDER BY ur.role::TEXT DESC, u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_team_members() TO authenticated;
