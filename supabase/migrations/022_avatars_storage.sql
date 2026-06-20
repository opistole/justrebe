-- ============================================================
-- ReBe ReFresh — avatars storage bucket + editable profile fields.
--
-- Each team member can upload a profile photo. The photo lives in
-- the 'avatars' bucket at <user_id>/<filename> so each user can
-- only write files inside their own folder.
--
-- Also updates list_team_members RPC to surface avatar_url + title
-- so the team directory can render proper cards.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. Create the public 'avatars' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies on storage.objects for the avatars bucket
-- Public read so any URL we render will load without auth.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload into their own folder only.
-- storage.foldername(name) returns the path segments; element 1 is the top folder.
DROP POLICY IF EXISTS "Users upload to own avatar folder" ON storage.objects;
CREATE POLICY "Users upload to own avatar folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users can update their own files.
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users can delete their own files (e.g. to replace).
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Extend the list_team_members RPC to also return avatar_url + title
-- (both stored in user_metadata).
CREATE OR REPLACE FUNCTION list_team_members()
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
