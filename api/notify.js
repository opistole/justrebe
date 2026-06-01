// api/notify.js — Vercel serverless function
// Triggered by a Supabase Database Webhook on INSERT into refresh_signups or confidant_requests.
// Sends (a) a confirmation email to the person and (b) a notification email to refresh@justrebe.com via Resend.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY          — your Resend API key (secret)
//   NOTIFY_FROM             — sender, e.g. "ReBe ReFresh <refresh@justrebe.com>" (domain must be verified in Resend)
//   NOTIFY_ADMIN            — admin recipient, e.g. "refresh@justrebe.com"
//   SUPABASE_WEBHOOK_SECRET — (optional but recommended) shared secret sent by Supabase webhook header
//
// Supabase Database Webhook config:
//   URL: https://<your-domain>/api/notify
//   Events: INSERT
//   Tables: public.refresh_signups, public.confidant_requests
//   Headers (optional): x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>

const FROM         = process.env.NOTIFY_FROM   || 'ReBe ReFresh <refresh@justrebe.com>';
const ADMIN_EMAIL  = process.env.NOTIFY_ADMIN  || 'refresh@justrebe.com';
const WEBHOOK_KEY  = process.env.SUPABASE_WEBHOOK_SECRET || '';

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Resend ${r.status}: ${detail}`);
  }
  return r.json();
}

function escape(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return String(v);
}

function buildCohortEmails(row) {
  const userText = `Hi ${row.full_name || 'there'},

Thank you for filling out the ReBe ReFresh enrollment form. We've received your details and you'll hear from us shortly.

If you indicated you're ready to register and check out, you'll be guided through payment next. If you asked for the waitlist or said you had questions first, we'll reach out personally within 48 hours.

— The ReBe team
refresh@justrebe.com`;

  const adminText = `NEW COHORT SIGNUP — refresh_signups

Name:               ${escape(row.full_name)}
Email:              ${escape(row.email)}
Phone:              ${escape(row.phone)}
Audience:           ${escape(row.audience_type)}
Readiness:          ${escape(row.readiness)}
Preferred time:     ${escape(row.preferred_group_time)}
Group type:         ${escape(row.group_type)}
Area:               ${escape(row.area_needing_refresh)}${row.area_other ? ' / ' + row.area_other : ''}
Reason:             ${escape(row.reason_for_interest)}
Previous experience:${escape(row.previous_rebe_experience)}
Notes:              ${escape(row.notes)}
Organization:       ${escape(row.organization_name)}
Role:               ${escape(row.role_title)}
Referral code:      ${escape(row.referral_code)}
Who referred them:  ${escape(row.who_referred_you)}
Consent to contact: ${escape(row.consent_to_contact)}
Consent (confid.):  ${escape(row.consent_to_confidentiality)}

Row id: ${row.id}`;

  return [
    { to: row.email,    subject: 'We received your ReBe ReFresh enrollment', text: userText },
    { to: ADMIN_EMAIL,  subject: `New cohort signup — ${row.full_name || row.email}`, text: adminText },
  ];
}

function buildConfidantEmails(row) {
  const userText = `Hi ${row.name || 'there'},

Thank you for requesting a private 1:1 session with ${row.preferred_confidant || 'a ReBe confidant'}.

Your confidant will reach out within 48 hours to schedule directly with you. If you indicated you're ready to pay, you'll be guided through checkout next.

— The ReBe team
refresh@justrebe.com`;

  const adminText = `NEW 1:1 REQUEST — confidant_requests

Name:               ${escape(row.name)}
Email:              ${escape(row.email)}
Phone:              ${escape(row.phone)}
Preferred confidant:${escape(row.preferred_confidant)}
Situation:          ${escape(row.situation)}
Best times:         ${escape(row.best_times)}
Status:             ${escape(row.status)}

Row id: ${row.id}`;

  return [
    { to: row.email,    subject: 'We received your ReBe ReFresh 1:1 request', text: userText },
    { to: ADMIN_EMAIL,  subject: `New 1:1 request — ${row.name || row.email}`, text: adminText },
  ];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional shared-secret check
  if (WEBHOOK_KEY) {
    const provided = req.headers['x-webhook-secret'] || req.headers['x-supabase-webhook-secret'] || '';
    if (provided !== WEBHOOK_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const body = req.body || {};
  if (body.type !== 'INSERT' || !body.record) {
    return res.status(200).json({ ok: true, skipped: 'not an insert' });
  }

  let messages;
  if (body.table === 'refresh_signups') {
    messages = buildCohortEmails(body.record);
  } else if (body.table === 'confidant_requests') {
    messages = buildConfidantEmails(body.record);
  } else {
    return res.status(200).json({ ok: true, skipped: `unhandled table: ${body.table}` });
  }

  try {
    await Promise.all(messages.map(sendEmail));
    return res.status(200).json({ ok: true, sent: messages.length });
  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: 'Email send failed', detail: String(err && err.message || err) });
  }
};
