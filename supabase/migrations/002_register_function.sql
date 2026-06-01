-- ReBe / JustRebe — Registration Function
-- Adds an atomic function to handle workshop/cohort registration
-- so the form can register a contact + enrollment + SMS consent in one secure call.
-- Run this AFTER 001_initial_schema.sql in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION register_for_program(
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_sms_consent BOOLEAN,
  p_marketing_consent BOOLEAN,
  p_program_slug TEXT,
  p_source TEXT,
  p_consent_text TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_program_id UUID;
  v_enrollment_id UUID;
BEGIN
  -- Validate program exists and is open
  SELECT id INTO v_program_id
  FROM programs
  WHERE slug = p_program_slug AND status IN ('open', 'waitlist');

  IF v_program_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Program is not available for registration.');
  END IF;

  -- Upsert contact by email
  INSERT INTO contacts (first_name, last_name, email, phone, sms_consent, marketing_consent)
  VALUES (p_first_name, p_last_name, LOWER(TRIM(p_email)), p_phone, p_sms_consent, p_marketing_consent)
  ON CONFLICT (email) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = COALESCE(EXCLUDED.phone, contacts.phone),
        sms_consent = contacts.sms_consent OR EXCLUDED.sms_consent,
        marketing_consent = contacts.marketing_consent OR EXCLUDED.marketing_consent,
        updated_at = NOW()
  RETURNING id INTO v_contact_id;

  -- Create or refresh enrollment (idempotent — re-registering is fine)
  INSERT INTO enrollments (contact_id, program_id, status, source)
  VALUES (v_contact_id, v_program_id, 'registered', p_source)
  ON CONFLICT (contact_id, program_id) DO UPDATE
    SET status = 'registered',
        source = COALESCE(EXCLUDED.source, enrollments.source),
        enrolled_at = NOW()
  RETURNING id INTO v_enrollment_id;

  -- Log SMS consent for compliance audit trail (only if consented)
  IF p_sms_consent THEN
    INSERT INTO sms_consent_log (contact_id, consent_text, ip_address, user_agent)
    VALUES (v_contact_id, p_consent_text, p_ip_address, p_user_agent);
  END IF;

  RETURN json_build_object(
    'success', true,
    'contact_id', v_contact_id,
    'enrollment_id', v_enrollment_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Allow anonymous (public) calls to this function
GRANT EXECUTE ON FUNCTION register_for_program TO anon;
