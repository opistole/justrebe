// api/twilio-incoming.js — Twilio inbound SMS webhook
//
// Configured at: Twilio Console -> Phone Numbers -> [your ReBe number]
//   "A MESSAGE COMES IN" webhook URL: https://www.justrebe.com/api/twilio-incoming
//   Method: POST
//
// Every time someone replies to a text sent from the ReBe Twilio number,
// Twilio POSTs the message here. We forward it to refresh@justrebe.com via
// Resend so the team sees the reply in their inbox without having to log
// into Twilio Console.
//
// Returns empty TwiML so Twilio doesn't auto-reply on our behalf.
//
// Required env vars (already set on Vercel):
//   RESEND_API_KEY   - for sending the notification email
//   NOTIFY_FROM      - optional, defaults to 'ReBe ReFresh <refresh@justrebe.com>'
//   NOTIFY_ADMIN     - optional, defaults to 'refresh@justrebe.com'
//
// Twilio posts application/x-www-form-urlencoded — Vercel auto-parses this
// into req.body when bodyParser is left on (default).

const crypto = require('crypto');

// Validate Twilio's X-Twilio-Signature header. Returns true if valid (or
// if TWILIO_AUTH_TOKEN isn't set, in which case we log + skip).
// Signature spec: HMAC-SHA1(authToken, fullUrl + sorted POST params concatenated as key+value)
function isValidTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('[twilio-incoming] TWILIO_AUTH_TOKEN not set — signature NOT verified.');
    return true;
  }
  const sigHeader = req.headers['x-twilio-signature'] || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  const url   = `${proto}://${host}${req.url}`;
  const params = req.body || {};
  const keys = Object.keys(params).sort();
  const concatenated = keys.reduce((acc, k) => acc + k + params[k], url);
  const computed = crypto.createHmac('sha1', authToken).update(Buffer.from(concatenated, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  // Twilio always uses POST for webhooks
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!isValidTwilioSignature(req)) {
    console.warn('[twilio-incoming] Invalid signature, rejecting');
    return res.status(403).send('Invalid signature');
  }

  const body = req.body || {};
  const from        = body.From || '(unknown sender)';
  const to          = body.To || '(unknown recipient)';
  const messageBody = body.Body || '(no message body)';
  const messageSid  = body.MessageSid || '(no sid)';
  const fromCity    = body.FromCity || '';
  const fromState   = body.FromState || '';
  const fromCountry = body.FromCountry || '';
  const location    = [fromCity, fromState, fromCountry].filter(Boolean).join(', ');

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr  = process.env.NOTIFY_FROM  || 'ReBe ReFresh <refresh@justrebe.com>';
  const adminAddr = process.env.NOTIFY_ADMIN || 'refresh@justrebe.com';

  // ──────────────────────────────────────────────────────────────
  // 1. Match the sender to a customer + log to customer_activities
  //    so the SMS shows up in the CRM activity feed. If no match,
  //    create a phone-only contact so the person appears in the
  //    customer list and we can reply via the CRM later.
  // ──────────────────────────────────────────────────────────────
  try {
    const rawUrl = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (rawUrl && SERVICE_KEY) {
      const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
      const sbHeaders = {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      };

      // Normalize sender to E.164
      const digits = String(from || '').replace(/\D/g, '');
      let normPhone;
      if (digits.length === 10) normPhone = `+1${digits}`;
      else if (digits.length === 11 && digits.startsWith('1')) normPhone = `+${digits}`;
      else if (String(from || '').startsWith('+')) normPhone = String(from);
      else normPhone = `+${digits}`;

      // Try to match against contacts + refresh_signups by phone
      let customerEmail = null;
      try {
        const cR = await fetch(
          `${SUPABASE_URL}/rest/v1/contacts?phone=eq.${encodeURIComponent(normPhone)}&select=email&limit=1`,
          { headers: sbHeaders }
        );
        const cData = await cR.json();
        if (Array.isArray(cData) && cData[0] && cData[0].email) customerEmail = cData[0].email;
      } catch (_) {}

      if (!customerEmail) {
        try {
          const rR = await fetch(
            `${SUPABASE_URL}/rest/v1/refresh_signups?phone=eq.${encodeURIComponent(normPhone)}&select=email&limit=1`,
            { headers: sbHeaders }
          );
          const rData = await rR.json();
          if (Array.isArray(rData) && rData[0] && rData[0].email) customerEmail = rData[0].email;
        } catch (_) {}
      }

      // If still no match — create a phone-only contact so they appear
      // in the CRM. Use a placeholder email derived from the phone.
      if (!customerEmail) {
        const placeholderEmail = `${normPhone.replace(/[^0-9+]/g, '')}@sms.justrebe.com`;
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify({
              email: placeholderEmail.toLowerCase(),
              phone: normPhone,
              first_name: 'Unknown',
              last_name: `(SMS · ${normPhone})`,
            }),
          });
        } catch (_) {}
        customerEmail = placeholderEmail.toLowerCase();
      }

      // Log to customer_activities as sms_received
      await fetch(`${SUPABASE_URL}/rest/v1/customer_activities`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          customer_email: customerEmail.toLowerCase(),
          type: 'sms_received',
          body: messageBody,
          from_addr: normPhone,
          to_addr: to,
          metadata: { provider: 'twilio', twilio_message_sid: messageSid, location },
          status: 'sent',
        }),
      });
    }
  } catch (err) {
    console.error('Twilio incoming: failed to log to customer_activities:', err);
    // Continue to email-forward fallback below
  }

  if (!resendKey) {
    console.error('RESEND_API_KEY not configured — cannot forward Twilio SMS');
    // Still return success to Twilio so it doesn't retry
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Forward to email so the team still gets an instant notification
  //    even if they're not actively watching the CRM.
  // ──────────────────────────────────────────────────────────────
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: adminAddr,
        subject: `📱 SMS reply from ${from}`,
        text:
`Someone just texted back the ReBe Twilio number.

FROM:      ${from}${location ? ` (${location})` : ''}
TO:        ${to}
WHEN:      ${new Date().toISOString()}
MSG SID:   ${messageSid}

MESSAGE:
${messageBody}

---
Reply by going to Twilio Console -> Messages, or text them back from
your phone/OpenPhone. This is an automated forward from the Twilio
inbound webhook (api/twilio-incoming.js).`,
      }),
    });
  } catch (err) {
    console.error('Failed to forward Twilio SMS to email:', err);
    // Don't fail the Twilio response — we still want to return 200 quickly
  }

  // Empty TwiML response = no auto-reply, but acknowledges receipt
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
