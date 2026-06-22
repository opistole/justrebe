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
    // previous_rebe_experience is a BOOLEAN column in the schema:
    // - 'First time' means no prior experience → false
    // - Any other value means they have prior experience → true
    // The exact value ('Reset workshop' / 'REAL TALK program' / etc.) is
    // also preserved verbatim in the notes block below for full detail.
    previous_rebe_experience: body.prior_experience
      ? (String(body.prior_experience).trim().toLowerCase() === 'first time' ? false : true)
      : (body.previous_rebe_experience === true || body.previous_rebe_experience === false
          ? body.previous_rebe_experience
          : null),
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

    // ──────────────────────────────────────────────────────────────
    // Welcome email via Resend — fire-and-forget, non-blocking.
    // Sends the participant a warm welcome with the Zoom link for
    // their chosen slot (11 AM ET or 8 PM ET). Failures are logged
    // but don't affect the user's submit success.
    // ──────────────────────────────────────────────────────────────
    try {
      await sendWelcomeEmail({
        toEmail: email,
        firstName: (fullName.split(/\s+/)[0] || ''),
        slotChoice: slot,
      });
    } catch (welcomeErr) {
      console.warn('refresh-intake: welcome email failed (non-fatal):', welcomeErr);
    }

    return res.status(200).json({ ok: true, id: Array.isArray(data) ? data[0]?.id : data.id });
  } catch (err) {
    console.error('refresh-intake insert failed:', err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
};

// Resend welcome email. Picks the right Zoom URL based on the slot they
// chose in the form. Slot may be '11 AM ET' / '8 PM ET' / 'Either' or
// the older 'Tuesdays at 11 AM ET' format from cohort marketing pages.
async function sendWelcomeEmail({ toEmail, firstName, slotChoice }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('refresh-intake: RESEND_API_KEY not set — skipping welcome email');
    return;
  }
  const fromAddr = process.env.NOTIFY_FROM || 'ReBe ReFresh <refresh@justrebe.com>';

  const slotLower = String(slotChoice || '').toLowerCase();
  const isEightPm = slotLower.includes('8');
  const isElevenAm = slotLower.includes('11');
  const ZOOM_11AM = 'https://us06web.zoom.us/j/88554567062';
  const ZOOM_8PM  = 'https://us06web.zoom.us/j/81155916766';

  // Build slot copy. If 'Either', list both. Otherwise show the picked one.
  let slotLabel, zoomUrl, zoomBlock;
  if (isEightPm && !isElevenAm) {
    slotLabel = 'Tuesdays · 8 PM Eastern';
    zoomUrl = ZOOM_8PM;
    zoomBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4FAEF;border:1px solid #cfe6d0;border-radius:14px;padding:22px 24px;margin:24px 0;text-align:center;"><tr><td><p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3A8438;">Your Zoom — 8 PM Eastern</p><p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;color:#4A535E;line-height:1.5;">Save this link — it's the same every Tuesday for all 5 weeks.</p><a href="${ZOOM_8PM}" style="display:inline-block;padding:14px 28px;background:#3A8438;color:#FFFFFF;font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border-radius:999px;">Join Zoom →</a><p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9DA1A8;word-break:break-all;">${ZOOM_8PM}</p></td></tr></table>`;
  } else if (isElevenAm && !isEightPm) {
    slotLabel = 'Tuesdays · 11 AM Eastern';
    zoomUrl = ZOOM_11AM;
    zoomBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4FAEF;border:1px solid #cfe6d0;border-radius:14px;padding:22px 24px;margin:24px 0;text-align:center;"><tr><td><p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3A8438;">Your Zoom — 11 AM Eastern</p><p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;color:#4A535E;line-height:1.5;">Save this link — it's the same every Tuesday for all 5 weeks.</p><a href="${ZOOM_11AM}" style="display:inline-block;padding:14px 28px;background:#3A8438;color:#FFFFFF;font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border-radius:999px;">Join Zoom →</a><p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9DA1A8;word-break:break-all;">${ZOOM_11AM}</p></td></tr></table>`;
  } else {
    slotLabel = 'Tuesdays · pick the slot that fits your schedule';
    zoomUrl = ZOOM_11AM;
    zoomBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4FAEF;border:1px solid #cfe6d0;border-radius:14px;padding:22px 24px;margin:24px 0;text-align:center;"><tr><td><p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3A8438;">Your Zoom links</p><p style="margin:0 0 14px;font-family:Georgia,serif;font-size:14px;color:#4A535E;line-height:1.5;">Pick whichever Tuesday slot fits you — same link every week for that slot.</p><p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:13px;color:#060B50;"><strong>11 AM Eastern:</strong> <a href="${ZOOM_11AM}" style="color:#3A8438;font-weight:700;">${ZOOM_11AM}</a></p><p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#060B50;"><strong>8 PM Eastern:</strong> <a href="${ZOOM_8PM}" style="color:#3A8438;font-weight:700;">${ZOOM_8PM}</a></p></td></tr></table>`;
  }

  const greeting = firstName ? `Hi ${firstName},` : 'Hi friend,';

  const html =
`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF9F7;padding:32px 12px;font-family:Georgia,'Times New Roman',serif;color:#4A535E;line-height:1.6;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;border:1px solid #E2E2E2;overflow:hidden;">
<tr><td style="padding:36px 36px 8px;">
<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3A8438;">Welcome to ReBe ReFresh</p>
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:600;font-size:30px;line-height:1.2;color:#060B50;">Your seat is reserved.</h1>
</td></tr>
<tr><td style="padding:8px 36px 12px;font-size:16px;line-height:1.7;">
<p style="margin:0 0 18px;">${greeting}</p>
<p style="margin:0 0 18px;">Thank you for registering for the first ReBe ReFresh cohort. We're so glad you're here.</p>
<p style="margin:0 0 18px;">Below is your Zoom link for our weekly sessions. Save it — it's the same link every Tuesday for all 5 weeks.</p>
<p style="margin:0 0 18px;"><strong style="color:#060B50;">Schedule:</strong> ${slotLabel}<br><strong style="color:#060B50;">First session:</strong> Tuesday, June 23</p>
</td></tr>
<tr><td style="padding:0 36px;">${zoomBlock}</td></tr>
<tr><td style="padding:8px 36px 12px;font-size:16px;line-height:1.7;">
<p style="margin:0 0 18px;">In the next few days you'll get a follow-up from Elizabeth with what to bring (mostly: yourself) and a few thoughts to settle into before we begin.</p>
<p style="margin:0 0 6px;">If you have any questions, just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 36px 36px;font-size:16px;line-height:1.7;border-top:1px solid #E2E2E2;">
<p style="margin:18px 0 4px;">With love,</p>
<p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:24px;color:#060B50;">Elizabeth &amp; the ReBe team</p>
</td></tr>
<tr><td style="padding:20px 24px;background:#FAF9F7;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#9DA1A8;line-height:1.5;border-top:1px solid #E2E2E2;">
ReBe — Rebuilding people from the inside out.<br>
Questions? <a href="mailto:refresh@justrebe.com" style="color:#3A8438;text-decoration:none;font-weight:700;">refresh@justrebe.com</a>
</td></tr>
</table>
</td></tr>
</table>`;

  const text =
`${greeting}

Thank you for registering for the first ReBe ReFresh cohort. We're so glad you're here.

Below is your Zoom link for our weekly sessions. Save it — it's the same link every Tuesday for all 5 weeks.

Schedule:    ${slotLabel}
First session: Tuesday, June 23

YOUR ZOOM LINK
${slotLabel.includes('8 PM') ? ZOOM_8PM : slotLabel.includes('11 AM') ? ZOOM_11AM : `11 AM ET: ${ZOOM_11AM}\n8 PM ET: ${ZOOM_8PM}`}

In the next few days you'll get a follow-up from Elizabeth with what to bring (mostly: yourself) and a few thoughts to settle into before we begin.

If you have any questions, just reply to this email.

With love,
Elizabeth & the ReBe team

—
ReBe · refresh@justrebe.com`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to: toEmail,
      reply_to: 'refresh@justrebe.com',
      subject: 'Welcome to the ReBe ReFresh cohort 💛',
      html,
      text,
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Resend HTTP ${r.status}: ${detail.slice(0, 300)}`);
  }
  return await r.json();
}
