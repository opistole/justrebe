// api/refresh-intake.js
//
// Public endpoint for the non-paying ReFresh cohort intake form
// (/refresh-cohort-intake.html). Used by facilitators + complimentary
// participants whose seat doesn't go through Stripe Checkout.
//
// POST body (form-encoded or JSON):
//   full_name *           — required
//   email *               — required, will be lowercased
//   phone                 — optional, normalized to E.164 if US
//   seat_type             — 'facilitator' | 'comped' | 'other' (default 'comped')
//   group_type            — preferred cohort time slot
//   audience_type         — educator / healthcare / etc.
//   area_needing_refresh  — free text
//   reason_for_interest   — free text
//   previous_rebe_experience — none / workshop / 1:1 / cohort
//   organization_name     — optional
//   role_title            — optional
//   notes                 — optional, anything else
//
// Inserts a row in refresh_signups with status='enrolled', readiness='enrolled',
// paid_amount_cents=0, and the chosen seat_type. Row shows up immediately in
// the admin CRM customer list.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(p).startsWith('+')) return String(p);
  return `+${digits}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured (Supabase env vars missing)' });
  }
  const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  // Accept JSON or form-encoded
  const body = req.body || {};
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  // SECURITY: the public form must never let a stranger self-mark as a
  // paying 'attendee'. Only facilitators / comped / other are accepted
  // from the public POST. 'attendee' / 'paid' can only be set server-side
  // by the Stripe webhook or by admin/staff via the CRM.
  const seatType = ['facilitator', 'comped', 'other'].includes(String(body.seat_type || '').toLowerCase())
    ? String(body.seat_type).toLowerCase()
    : 'other';

  if (!fullName) return res.status(400).json({ error: 'Full name required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // The form's "Which cohort time slot?" answer is the actual slot →
  // belongs in preferred_group_time. group_type + audience_type are enum
  // columns with CHECK constraints; mirror what Stripe webhook does.
  const slot = body.group_type || body.preferred_group_time || null;

  // New fields that don't have dedicated columns get folded into notes
  // as a structured block. Keeps everything searchable from one place
  // without a schema migration.
  const whyArr = Array.isArray(body.why_here) ? body.why_here : [];
  const extras = [
    body.city || body.state || body.country
      ? `Location: ${[body.city, body.state, body.country].filter(Boolean).join(', ')}`
      : null,
    body.prior_experience      ? `Prior ReBe experience: ${String(body.prior_experience).trim()}` : null,
    whyArr.length              ? `Why they're joining: ${whyArr.join(', ')}`                       : null,
    body.heard_from            ? `Heard about ReBe from: ${String(body.heard_from).trim()}`        : null,
    body.referrer              ? `Referred by: ${String(body.referrer).trim()}`                    : null,
    body.breakout_preference   ? `Breakout-room preference: ${String(body.breakout_preference).trim()}` : null,
    body.audience_type         ? `World: ${String(body.audience_type).trim()}`                     : null,
  ].filter(Boolean);
  const extraNotes = [
    extras.length ? extras.join('\n') : null,
    body.notes ? `\n${String(body.notes).trim()}` : null,
  ].filter(Boolean).join('\n');

  const row = {
    full_name: fullName,
    email,
    // 'phone' is NOT NULL in refresh_signups — default to '' if blank
    // so the insert doesn't violate the constraint.
    phone: phone || '',
    seat_type: seatType,
    status: 'enrolled',
    readiness: 'ready_to_pay',  // closest valid enum value for a confirmed seat
    paid_amount_cents: 0,
    audience_type: 'groups',          // cohort intake = group setting
    group_type: 'no_preference',      // constraint-safe constant
    preferred_group_time:     slot ? String(slot).trim() : null,
    area_needing_refresh:     body.area_needing_refresh     ? String(body.area_needing_refresh).trim()     : null,
    reason_for_interest:      body.reason_for_interest      ? String(body.reason_for_interest).trim()      : null,
    previous_rebe_experience: body.prior_experience
      ? String(body.prior_experience).trim()
      : body.previous_rebe_experience
        ? String(body.previous_rebe_experience).trim()
        : null,
    organization_name:        body.organization_name        ? String(body.organization_name).trim()        : null,
    role_title:               body.role_title               ? String(body.role_title).trim()               : null,
    notes:                    extraNotes || null,
    // consents — voluntary form submission implies both; mirrors how Stripe
    // webhook fills these for paid signups
    consent_to_contact: true,
    consent_to_confidentiality: true,
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/refresh_signups`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    const data = await resp.json();
    if (!resp.ok) {
      // Surface Supabase's message field (has column name for NOT NULL violations)
      const supabaseMsg = data && (data.message || data.msg || data.error_description);
      return res.status(500).json({
        error: 'Couldn\'t save your intake — please try again or email refresh@justrebe.com.',
        detail: supabaseMsg || data,
      });
    }
    return res.status(200).json({ ok: true, id: Array.isArray(data) ? data[0]?.id : data.id });
  } catch (err) {
    console.error('refresh-intake insert failed:', err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
};
