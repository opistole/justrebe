-- 008_submit_cohort_signup_rpc.sql
--
-- The cohort form was failing at submit with:
--   "Something went wrong saving your details."
--
-- Root cause: lib/refresh-form.js calls
--   supabase.from('refresh_signups').insert(payload).select('id').single()
-- and the .select('id') part is blocked by RLS because anonymous visitors
-- have INSERT permission on refresh_signups but no SELECT permission.
-- So the INSERT itself works but the chained read-back returns an RLS error.
--
-- Same bug we hit on the 1:1 form earlier; same fix pattern. This RPC runs
-- as the owner (SECURITY DEFINER), bypassing RLS for the single INSERT,
-- and returns the new row's id. The form helper will call this instead of
-- .insert().select().
--
-- Idempotent — safe to re-run. Run this in Supabase → SQL Editor.

create or replace function public.submit_cohort_signup(
  p_full_name                   text,
  p_email                       text,
  p_phone                       text,
  p_audience_type               text,
  p_organization_name           text,
  p_role_title                  text,
  p_group_type                  text,
  p_preferred_group_time        text,
  p_reason_for_interest         text,
  p_area_needing_refresh        text,
  p_area_other                  text,
  p_previous_rebe_experience    boolean,
  p_readiness                   text,
  p_notes                       text,
  p_who_referred_you            text,
  p_referral_code               text,
  p_consent_to_contact          boolean,
  p_consent_to_confidentiality  boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.refresh_signups (
    full_name,
    email,
    phone,
    audience_type,
    organization_name,
    role_title,
    group_type,
    preferred_group_time,
    reason_for_interest,
    area_needing_refresh,
    area_other,
    previous_rebe_experience,
    readiness,
    notes,
    who_referred_you,
    referral_code,
    consent_to_contact,
    consent_to_confidentiality
  ) values (
    p_full_name,
    p_email,
    p_phone,
    coalesce(p_audience_type, 'groups'),
    p_organization_name,
    p_role_title,
    p_group_type,
    p_preferred_group_time,
    p_reason_for_interest,
    p_area_needing_refresh,
    p_area_other,
    p_previous_rebe_experience,
    p_readiness,
    p_notes,
    p_who_referred_you,
    p_referral_code,
    coalesce(p_consent_to_contact, false),
    coalesce(p_consent_to_confidentiality, false)
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Anonymous (public) form submitters can call this RPC.
grant execute on function public.submit_cohort_signup(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, boolean, boolean
) to anon, authenticated;
