// api/notify.js — Vercel serverless function
//
// Handles two kinds of inbound requests:
//   1. Supabase Database Webhooks (INSERT events) for refresh_signups + confidant_requests
//      Payload shape: { type: 'INSERT', table: '...', record: {...} }
//   2. Direct JS POSTs from the workshop signup flow on reset.html
//      Payload shape: { kind: 'workshop_signup', first_name, last_name, email, phone,
//                       sms_consent, marketing_consent, signup_id }
//
// Sends a confirmation email to the person + a notification email to refresh@justrebe.com
// via Resend, and (if Twilio env vars are set + sms_consent + phone) a confirmation SMS.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY          — Resend API key (secret)
//   NOTIFY_FROM             — "ReBe ReFresh <refresh@justrebe.com>" (domain must be verified)
//   NOTIFY_ADMIN            — "refresh@justrebe.com"
//   SUPABASE_WEBHOOK_SECRET — optional shared secret on webhook header
//   TWILIO_ACCOUNT_SID      — Twilio account SID (starts with AC…)
//   TWILIO_AUTH_TOKEN       — Twilio auth token
//   TWILIO_FROM_NUMBER      — your Twilio phone number, E.164 format (+15555550100)

const FROM         = process.env.NOTIFY_FROM   || 'ReBe ReFresh <refresh@justrebe.com>';
const ADMIN_EMAIL  = process.env.NOTIFY_ADMIN  || 'refresh@justrebe.com';
const WEBHOOK_KEY  = process.env.SUPABASE_WEBHOOK_SECRET || '';

// ---------- Resend (email) ----------
async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Resend ${r.status}: ${detail}`);
  }
  return r.json();
}

// ---------- Twilio (SMS) — gracefully no-op if env vars are missing ----------
async function sendSMS({ to, body }) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !auth || !from) {
    console.log('Twilio not configured — skipping SMS for', to);
    return { skipped: true, reason: 'twilio_not_configured' };
  }
  const cleanTo = normalizePhone(to);
  if (!cleanTo) {
    console.log('SMS skipped — invalid phone:', to);
    return { skipped: true, reason: 'invalid_phone' };
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: cleanTo, Body: body }).toString(),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Twilio ${r.status}: ${detail}`);
  }
  return r.json();
}

function normalizePhone(p) {
  if (!p) return null;
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits;            // US default
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (String(p).startsWith('+')) return String(p);            // already E.164
  return null;
}

function escape(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return String(v);
}

// ---------- Email content builders ----------
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

function buildWorkshopEmails(p) {
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'there';

  const userText = `Hi ${p.first_name || 'there'},

You're in for the ReBe ReFresh free workshop on Tuesday, June 16 at 11:00 AM Eastern.

We'll email you the Zoom link the day before. You'll also get one reminder ~1 hour before we start.

If anything changes on your end, just reply to this email — refresh@justrebe.com will see it.

— The ReBe team`;

  const adminText = `NEW WORKSHOP SIGNUP — reset.html

Name:               ${escape(fullName)}
Email:              ${escape(p.email)}
Phone:              ${escape(p.phone)}
SMS consent:        ${escape(p.sms_consent)}
Marketing consent:  ${escape(p.marketing_consent)}
Source:             ${escape(p.source)}

Signup id: ${p.signup_id || '—'}`;

  return [
    { to: p.email,     subject: "You're in — ReBe ReFresh free workshop, June 16", text: userText },
    { to: ADMIN_EMAIL, subject: `New workshop signup — ${fullName} (${p.email})`,    text: adminText },
  ];
}

function buildWorkshopSMS(p) {
  const name = p.first_name || 'there';
  return `Hi ${name}, you're confirmed for the ReBe ReFresh free workshop Tue June 16 at 11 AM ET. We'll text the Zoom link the day before. Reply STOP to opt out.`;
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // -------- A) Direct workshop signup from reset.html --------
  if (body.kind === 'workshop_signup') {
    if (!body.email) return res.status(400).json({ error: 'Missing email' });
    const messages = buildWorkshopEmails(body);
    const tasks = messages.map((m) => sendEmail(m));

    let smsAttempted = false;
    if (body.sms_consent && body.phone) {
      smsAttempted = true;
      tasks.push(sendSMS({ to: body.phone, body: buildWorkshopSMS(body) }));
    }

    try {
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        console.error('Workshop notify partial failure:', failed.map((f) => String(f.reason)));
        return res.status(207).json({
          ok: true,
          sent: results.length - failed.length,
          failed: failed.length,
          details: failed.map((f) => String(f.reason)),
          sms_attempted: smsAttempted,
        });
      }
      return res.status(200).json({ ok: true, sent: results.length, sms_attempted: smsAttempted });
    } catch (err) {
      console.error('Notify error (workshop):', err);
      return res.status(500).json({ error: 'Email send failed', detail: String(err && err.message || err) });
    }
  }

  // -------- B) Supabase webhook --------
  if (WEBHOOK_KEY) {
    const provided = req.headers['x-webhook-secret'] || req.headers['x-supabase-webhook-secret'] || '';
    if (provided !== WEBHOOK_KEY) return res.status(401).json({ error: 'Unauthorized' });
  }

  if (body.type !== 'INSERT' || !body.record) {
    return res.status(200).json({ ok: true, skipped: 'not an insert' });
  }

  let messages;
  if (body.table === 'refresh_signups')           messages = buildCohortEmails(body.record);
  else if (body.table === 'confidant_requests')   messages = buildConfidantEmails(body.record);
  else return res.status(200).json({ ok: true, skipped: `unhandled table: ${body.table}` });

  try {
    await Promise.all(messages.map(sendEmail));
    return res.status(200).json({ ok: true, sent: messages.length });
  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: 'Email send failed', detail: String(err && err.message || err) });
  }
};
