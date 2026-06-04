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

const { kitSubscribe } = require('./_kit.js');

// ---------- Tag plan ----------
// Maps the cohort readiness option to the Kit tag suffix used in
// "Cohort · {time} · {label}" tag names.
const COHORT_READINESS_LABEL = {
  ready_to_pay:      'Ready to Pay',
  waitlist:          'Waitlist',
  wants_more_info:   'Wants Info',
};

// Map preferred_group_time row value → tag slot label.
function cohortSlotLabel(preferred_group_time) {
  if (preferred_group_time === 'Tuesdays at 8 PM ET') return '8 PM';
  return '11 AM'; // default for legacy rows / unknown
}

function firstNameFromFull(full) {
  if (!full) return '';
  return String(full).trim().split(/\s+/)[0] || '';
}

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
function cohortUserMessage(row) {
  const name = row.full_name || 'there';
  const readiness = row.readiness || '';
  const time = row.preferred_group_time || '';
  // Both time slots use the same Zoom link
  const zoomLink = 'https://us06web.zoom.us/j/9057767620';
  // Friendly time-slot summary used in the body of every readiness path
  let timeLine = '';
  if (time === 'Tuesdays at 11 AM ET') {
    timeLine = "Your time slot: Tuesdays at 11 AM Eastern (June 23 – July 21, five weeks).";
  } else if (time === 'Tuesdays at 8 PM ET') {
    timeLine = "Your time slot: Tuesdays at 8 PM Eastern (June 23 – July 21, five weeks).";
  } else if (time) {
    timeLine = `Your time slot: ${time}.`;
  }

  let subject, body;

  if (readiness === 'ready_to_pay') {
    // This email fires on form submission, BEFORE we know whether the
    // person completed Stripe checkout. So it's intentionally path-agnostic:
    // works whether they paid or abandoned at checkout. No Zoom link here —
    // that's sent by the Kit welcome sequence triggered by the
    // "ReBe — Customer (Paid)" tag, which the Stripe webhook applies.
    subject = "We received your ReBe ReFresh enrollment";
    body = `Hi ${name},

Thanks for starting your ReBe ReFresh enrollment.

${timeLine}

✓ If you completed your Stripe payment:
You're all set — your welcome email with the Zoom link and what to expect is on its way to this inbox within the next few minutes.

⏳ If you didn't finish checkout yet:
The next step is paying to lock in your seat. Head back here when you're ready:
https://www.justrebe.com/refresh-groups.html#enroll

Questions about ReBe ReFresh, the cohort, or anything in between? Just reply to this email and we'll help.

— The ReBe team
refresh@justrebe.com`;
  } else if (readiness === 'waitlist') {
    subject = "You're on the ReBe ReFresh waitlist";
    body = `Hi ${name},

Thank you — you're officially on the waitlist for the next ReBe ReFresh cohort.

${timeLine ? `We've noted your preferred time: ${time}. ` : ''}As soon as the next cohort dates are set (or a seat opens in the current one), we'll reach out with the new dates and how to confirm your seat.

Questions in the meantime? Just reply to this email.

— The ReBe team
refresh@justrebe.com`;
  } else if (readiness === 'wants_more_info') {
    subject = "We'll be in touch about ReBe ReFresh";
    body = `Hi ${name},

Thank you for your interest in ReBe ReFresh. We've received your details and we'll reach out within 48 hours with more about the cohort, what to expect, and how to take the next step when you're ready.

${timeLine}

If you have a specific question in the meantime, just reply to this email.

— The ReBe team
refresh@justrebe.com`;
  } else {
    subject = "We received your ReBe ReFresh enrollment";
    body = `Hi ${name},

Thank you for filling out the ReBe ReFresh enrollment form. We've received your details and we'll be in touch within 48 hours with next steps.

— The ReBe team
refresh@justrebe.com`;
  }

  return { subject, body };
}

function buildCohortEmails(row) {
  const userMsg = cohortUserMessage(row);
  const userText = userMsg.body;

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
    { to: row.email,    subject: userMsg.subject, text: userText },
    { to: ADMIN_EMAIL,  subject: `New cohort signup (${row.readiness || 'no-readiness'}) — ${row.full_name || row.email}`, text: adminText },
  ];
}

function buildConfidantEmails(row) {
  const userText = `Hi ${row.name || 'there'},

Thank you for requesting a private 1:1 session with ${row.preferred_confidant || 'a ReBe confidant'}.

You'll be guided through checkout next on the same page (if you haven't already). Once payment is confirmed, your confidant will reach out within 48 hours to schedule directly with you.

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
  // Two time slots, same Zoom link
  const timeLabel = p.preferred_time === '8pm'
    ? 'Tuesday, June 16 at 8:00 PM Eastern'
    : 'Tuesday, June 16 at 11:00 AM Eastern';
  const subjectTime = p.preferred_time === '8pm' ? '8 PM ET' : '11 AM ET';

  const userText = `Hi ${p.first_name || 'there'},

So glad you said yes. You're in for the ReBe ReFresh free workshop — we can't wait to be in the room with you.

WHAT THIS HOUR IS

A live 60-minute group session on Zoom with the full ReBe team — Elizabeth Good, Dr. Jason Quintal, Beth Rech, Jean Park, Fred Feller, Osil Pistole, and Christophe Dessaigne. An honest hour for adults who are tired in a way that doesn't quite have a name yet — anxious, angry, stressed, lonely, or just not yourself this season.

Together we'll:
  • Notice the story you've been living inside of
  • Name what's actually driving it
  • Practice picturing something different

No slides. No homework. No pressure. Just a small group, the ReBe team, and one quiet hour to do something most adults never do — picture a future worth living.

WHEN & WHERE

When:  ${timeLabel} (60 minutes)
Where: Zoom — https://us06web.zoom.us/j/9057767620

Save the link, add it to your calendar, and come as you are. We'll send one reminder the day before and one about an hour before we start.

Anything come up? Just reply to this email — refresh@justrebe.com will see it.

We're glad you're here.
— The ReBe team`;

  const adminText = `NEW WORKSHOP SIGNUP — reset.html

Name:               ${escape(fullName)}
Email:              ${escape(p.email)}
Phone:              ${escape(p.phone)}
Time slot:          ${escape(timeLabel)}
SMS consent:        ${escape(p.sms_consent)}
Marketing consent:  ${escape(p.marketing_consent)}
Source:             ${escape(p.source)}

Signup id: ${p.signup_id || '—'}`;

  return [
    { to: p.email,     subject: `You're in — ReBe ReFresh workshop, June 16 (${subjectTime})`, text: userText },
    { to: ADMIN_EMAIL, subject: `New workshop signup (${subjectTime}) — ${fullName} (${p.email})`, text: adminText },
  ];
}

function buildWorkshopSMS(p) {
  const name = p.first_name || 'there';
  const timeShort = p.preferred_time === '8pm' ? '8 PM ET' : '11 AM ET';
  return `Hi ${name}! So glad you're in. ReBe ReFresh workshop is Tue June 16, ${timeShort}. Zoom: https://us06web.zoom.us/j/9057767620 Reply STOP to opt out.`;
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

    // Kit tagging
    const slotTag = body.preferred_time === '8pm'
      ? 'Workshop · June 16 · 8 PM ET'
      : 'Workshop · June 16 · 11 AM ET';
    tasks.push(kitSubscribe({
      email: body.email,
      first_name: body.first_name || '',
      tags: ['ReBe — All', 'ReBe — Workshop', slotTag],
    }));

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

  // -------- A2) Direct cohort signup from refresh-groups.html --------
  // The form helper calls /api/notify after the Supabase RPC succeeds.
  // body shape: { kind:'cohort_signup', record: { full_name, email, ... } }
  if (body.kind === 'cohort_signup') {
    const row = body.record || {};
    if (!row.email) return res.status(400).json({ error: 'Missing record.email' });
    try {
      const messages = buildCohortEmails(row);
      // Build cohort tags based on readiness + slot
      const tags = ['ReBe — All', 'ReBe — Cohort'];
      const readinessLabel = COHORT_READINESS_LABEL[row.readiness];
      if (readinessLabel) {
        tags.push(`Cohort · ${cohortSlotLabel(row.preferred_group_time)} · ${readinessLabel}`);
      }
      await Promise.all([
        ...messages.map(sendEmail),
        kitSubscribe({ email: row.email, first_name: firstNameFromFull(row.full_name), tags })
          .catch((e) => console.error('Kit (cohort_signup):', e)),
      ]);
      return res.status(200).json({ ok: true, sent: messages.length });
    } catch (err) {
      console.error('Notify error (cohort_signup):', err);
      return res.status(500).json({ error: 'Email send failed', detail: String(err && err.message || err) });
    }
  }

  // -------- A3) Direct 1:1 request from refresh-private.html / refresh-groups.html --------
  // body shape: { kind:'confidant_request', record: { name, email, ... } }
  if (body.kind === 'confidant_request') {
    const row = body.record || {};
    if (!row.email) return res.status(400).json({ error: 'Missing record.email' });
    try {
      const messages = buildConfidantEmails(row);
      // Tag based on which confidant they asked for (or "Any" if none)
      const confidant = (row.preferred_confidant && row.preferred_confidant.trim()) || 'Any (Choose for me)';
      const tags = ['ReBe — All', 'ReBe — 1:1 Interest', `1:1 · ${confidant}`];
      await Promise.all([
        ...messages.map(sendEmail),
        kitSubscribe({ email: row.email, first_name: firstNameFromFull(row.name), tags })
          .catch((e) => console.error('Kit (confidant_request):', e)),
      ]);
      return res.status(200).json({ ok: true, sent: messages.length });
    } catch (err) {
      console.error('Notify error (confidant_request):', err);
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
