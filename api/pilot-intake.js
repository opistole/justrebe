// api/pilot-intake.js
//
// Public endpoint for the /pilot.html form. Replaces the prior
// formsubmit.co flow that silently lost a corporate submission
// because the destination email had never been verified with
// formsubmit.co.
//
// Every submission:
//   1. Is saved to the pilot_requests table in Supabase (RLS gates
//      read access to admin/staff only).
//   2. Triggers an email via Resend to the right pathway owner
//      AND to refresh@justrebe.com as a backup so a single mailbox
//      issue can't lose a lead again.
//   3. Returns a clean JSON response the form can use to show
//      the success / failure state.
//
// POST body (JSON):
//   { first_name, last_name, email, phone, website,
//     organization, role_title, pathway, challenges, timing }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY (optional — submission still saves if missing)

// Map the form's pathway labels to enum values + recipient list
const PATHWAY_MAP = {
  'ReBe Education': {
    enum: 'education',
    recipients: ['v.ellery@justrebe.com', 'a.pace@justrebe.com'],
    subject: 'Education Pilot Request',
  },
  'ReBe Workplace': {
    enum: 'workplace',
    recipients: ['o.pistole@justrebe.com', 'e.good@justrebe.com'],
    subject: 'Corporate Pilot Request',
  },
  'Both / Not Sure': {
    enum: 'both',
    recipients: ['hello@justrebe.com', 'refresh@justrebe.com'],
    subject: 'Pilot Request — Both / Not Sure',
  },
};

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

  const body = req.body || {};
  const firstName    = String(body.first_name || body['First Name'] || '').trim();
  const lastName     = String(body.last_name  || body['Last Name']  || '').trim();
  const email        = String(body.email      || body['Email']      || '').trim().toLowerCase();
  const phone        = String(body.phone      || body['Phone']      || '').trim();
  const website      = String(body.website    || body['Website']    || '').trim();
  const organization = String(body.organization || body['Organization'] || '').trim();
  const roleTitle    = String(body.role_title || body['Role'] || '').trim();
  const pathwayRaw   = String(body.pathway || body['Pathway'] || '').trim();
  const timing       = String(body.timing || body['Timing'] || '').trim();

  // Challenges may come in as an array or as repeated fields
  let challenges = body.challenges || body['Challenges'] || [];
  if (typeof challenges === 'string') challenges = [challenges];
  if (!Array.isArray(challenges)) challenges = [];
  challenges = challenges.map((c) => String(c).trim()).filter(Boolean);

  // Validate required fields
  if (!firstName)    return res.status(400).json({ error: 'First name required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!organization) return res.status(400).json({ error: 'Organization required' });
  if (!roleTitle)    return res.status(400).json({ error: 'Role / title required' });

  const pathwayConfig = PATHWAY_MAP[pathwayRaw];
  if (!pathwayConfig) {
    return res.status(400).json({ error: `Invalid pathway. Must be one of: ${Object.keys(PATHWAY_MAP).join(', ')}` });
  }

  // ──────────────────────────────────────────────────────────────
  // 1. Save to Supabase
  // ──────────────────────────────────────────────────────────────
  // Don't persist the raw POST body — only known/validated fields.
  // Avoids storing unknown keys, oversized payloads, or PII we didn't ask for.
  const insertRow = {
    first_name: firstName,
    last_name: lastName || null,
    email,
    phone: phone || null,
    website: website || null,
    organization,
    role_title: roleTitle,
    pathway: pathwayConfig.enum,
    challenges: challenges.length ? challenges : null,
    timing: timing || null,
  };

  let pilotRow = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pilot_requests`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(insertRow),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && (data.message || data.msg)) || JSON.stringify(data).slice(0, 300);
      return res.status(500).json({ error: 'Could not save your request — please try again', detail: msg });
    }
    pilotRow = Array.isArray(data) ? data[0] : data;
  } catch (err) {
    console.error('pilot-intake save failed:', err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Email forward (best-effort — submission already saved)
  // ──────────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  let emailForwarded = false;
  let emailError = null;

  if (resendKey) {
    const fromAddr = process.env.NOTIFY_FROM || 'ReBe ReFresh <refresh@justrebe.com>';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    const emailBody = [
      `A new pilot request just came in via the website.`,
      ``,
      `NAME:         ${fullName}`,
      `EMAIL:        ${email}`,
      phone   ? `PHONE:        ${phone}` : null,
      website ? `WEBSITE:      ${website}` : null,
      `ORGANIZATION: ${organization}`,
      `ROLE:         ${roleTitle}`,
      `PATHWAY:      ${pathwayRaw}`,
      challenges.length ? `CHALLENGES:   ${challenges.join(', ')}` : null,
      ``,
      `WHY NOW:`,
      timing || '(not specified)',
      ``,
      `---`,
      `Saved to /admin (id: ${pilotRow && pilotRow.id || 'n/a'}).`,
      `Pilot CRM: https://www.justrebe.com/admin/#pilots`,
    ].filter((l) => l !== null).join('\n');

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddr,
          to: pathwayConfig.recipients,
          subject: `🌱 ${pathwayConfig.subject}: ${organization}`,
          text: emailBody,
          reply_to: email,
        }),
      });
      if (r.ok) emailForwarded = true;
      else {
        const d = await r.text();
        emailError = `Resend HTTP ${r.status}: ${d.slice(0, 300)}`;
      }
    } catch (err) {
      emailError = String(err && err.message || err);
    }

    // Patch the row with email result (best-effort, ignore failures)
    if (pilotRow && pilotRow.id) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/pilot_requests?id=eq.${pilotRow.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ email_forwarded: emailForwarded, email_error: emailError }),
        });
      } catch (_) {}
    }
  }

  return res.status(200).json({
    ok: true,
    id: pilotRow && pilotRow.id,
    email_forwarded: emailForwarded,
  });
};
