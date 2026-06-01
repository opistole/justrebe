-- ReBe / JustRebe — Initial Schema
-- Tables: contacts, programs, enrollments, sms_consent_log
-- Run this in Supabase SQL Editor

-- =============================================================
-- 1. CONTACTS — one row per person, regardless of how many
--    programs they sign up for
-- =============================================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_email ON contacts(email);

-- =============================================================
-- 2. PROGRAMS — every workshop, cohort, or 1:1 offering
-- =============================================================
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('workshop', 'cohort', 'one_on_one')),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  capacity INTEGER,
  price_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'waitlist', 'cancelled')),
  cohort_track TEXT CHECK (cohort_track IN ('faith', 'education', 'corporate', 'groups', 'private')),
  host TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_programs_slug ON programs(slug);
CREATE INDEX idx_programs_type ON programs(type);
CREATE INDEX idx_programs_status ON programs(status);

-- =============================================================
-- 3. ENROLLMENTS — connects a contact to a program
-- =============================================================
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'paid', 'refunded', 'no_show', 'cancelled')),
  source TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE(contact_id, program_id)
);

CREATE INDEX idx_enrollments_contact ON enrollments(contact_id);
CREATE INDEX idx_enrollments_program ON enrollments(program_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);

-- =============================================================
-- 4. SMS_CONSENT_LOG — audit trail for A2P 10DLC compliance
-- =============================================================
CREATE TABLE sms_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  consent_text TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_sms_consent_contact ON sms_consent_log(contact_id);

-- =============================================================
-- 5. AUTO-UPDATE updated_at columns
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- 6. ROW LEVEL SECURITY (RLS)
--    Public form can INSERT, but cannot READ other people's data
-- =============================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_consent_log ENABLE ROW LEVEL SECURITY;

-- Anyone can SELECT programs (so the landing page can display them)
CREATE POLICY "Public can view programs"
  ON programs FOR SELECT
  USING (status IN ('open', 'waitlist'));

-- Anyone can INSERT a contact (form submission)
CREATE POLICY "Public can register as a contact"
  ON contacts FOR INSERT
  WITH CHECK (true);

-- Anyone can INSERT an enrollment (form submission)
CREATE POLICY "Public can enroll"
  ON enrollments FOR INSERT
  WITH CHECK (true);

-- Anyone can INSERT into SMS consent log (form submission)
CREATE POLICY "Public can log SMS consent"
  ON sms_consent_log FOR INSERT
  WITH CHECK (true);

-- Note: NO SELECT, UPDATE, or DELETE policies for anon users.
-- Admin operations will use the service role key from a server.

-- =============================================================
-- 7. SEED — insert the first workshop as a program
-- =============================================================
INSERT INTO programs (slug, type, title, description, start_date, end_date, capacity, price_cents, status, host)
VALUES (
  'reset-2026-06-09',
  'workshop',
  'An hour for the people holding it together.',
  'A free 60-minute live workshop with Elizabeth Good. For adults who are tired, lonely, or carrying more than they let on — and still getting it all done.',
  '2026-06-09 15:00:00+00',  -- 11:00 AM ET = 15:00 UTC (EDT)
  '2026-06-09 16:00:00+00',  -- 12:00 PM ET = 16:00 UTC
  NULL,                       -- no capacity cap for now
  0,                          -- free
  'open',
  'Elizabeth Good'
);
