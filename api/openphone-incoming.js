// api/openphone-incoming.js — OpenPhone inbound webhook receiver
//
// Receives OpenPhone webhook events (message.received in particular) and
// mirrors what Twilio incoming already does:
//   1. Match the sender's phone to an existing customer (contacts +
//      refresh_signups). If no match, auto-create a phone-only contact
//      so they appear in the CRM customer list.
//   2. Log the incoming SMS to customer_activities (type='sms_received',
//      metadata.provider='openphone') so it shows in the activity feed
//      with the new '📥 SMS received · via openphone' label.
//   3. Optionally forward to refresh@justrebe.com so the team still gets
//      an instant email notification even if no one is in the CRM.
//
// Configured by running scripts/setup-openphone-webhook.js once.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — for matching + logging
//   RESEND_API_KEY                            — for the email forward (optional)

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(p || '').startsWith('+')) return String(p);
  return `+${digits}`;
}

const crypto = require('crypto');

// Validate OpenPhone webhook signature. OpenPhone sends an HMAC-SHA256 of
// the raw body in 'openphone-signature' header. Skip if no secret env
// var is set (with warning).
function isValidOpenPhoneSignature(req) {
  const secret = process.env.OPENPHONE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[openphone-incoming] OPENPHONE_WEBHOOK_SECRET not set — signature NOT verified.');
    return true;
  }
  const sigHeader = req.headers['openphone-signature'] || req.headers['x-openphone-signature'] || '';
  if (!sigHeader) return false;
  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body || {});
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isValidOpenPhoneSignature(req)) {
    console.warn('[openphone-incoming] Invalid signature, rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  const rawUrl = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !SERVICE_KEY) {
    console.error('OpenPhone webhook: missing Supabase env vars');
    return res.status(200).json({ ok: true, skipped: 'env_missing' });
  }
  const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  const body = req.body || {};
  console.log('OpenPhone webhook received:', JSON.stringify(body).slice(0, 1500));

  // OpenPhone v1 event payload typically:
  //   { id: 'EVT...', type: 'message.received',
  //     data: { object: { from: '+1...', to: '+1...' or ['+1...'],
  //                       body: '...', direction: 'incoming', ... } } }
  // Older / variant shapes may put the message at top level or under
  // 'message' / 'payload'. Search common containers defensively.
  const containers = [body.data && body.data.object, body.data, body.message, body.object, body].filter(Boolean);
  function pick(field) {
    for (const c of containers) {
      if (c && typeof c === 'object' && c[field] !== undefined && c[field] !== null) return c[field];
    }
    return null;
  }

  const eventType = body.type || body.event || (req.query && req.query.event) || 'unknown';

  // Only act on incoming messages — ignore outbound ones (we sent those)
  // and unrelated events (call.completed, etc.)
  const direction = pick('direction');
  const messageType = pick('messageType');
  if (eventType !== 'message.received' && direction !== 'incoming' && messageType !== 'received') {
    return res.status(200).json({ ok: true, skipped: 'not_an_incoming_message', eventType });
  }

  const fromRaw = pick('from');
  const toRaw   = pick('to');
  const bodyText = pick('body') || pick('text') || '';
  const messageId = pick('id') || body.id || null;

  if (!fromRaw) {
    console.warn('OpenPhone webhook: no from address in payload');
    return res.status(200).json({ ok: true, skipped: 'no_from' });
  }

  const fromPhone = normalizePhone(fromRaw);
  const toPhone   = normalizePhone(Array.isArray(toRaw) ? toRaw[0] : toRaw);

  const sbHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ──────────────────────────────────────────────────────────────
  // 1. Match the sender to a customer by phone, or auto-create a
  //    phone-only contact so they land in the customer list.
  // ──────────────────────────────────────────────────────────────
  let customerEmail = null;
  try {
    const cR = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?phone=eq.${encodeURIComponent(fromPhone)}&select=email&limit=1`,
      { headers: sbHeaders }
    );
    const cData = await cR.json();
    if (Array.isArray(cData) && cData[0] && cData[0].email) customerEmail = cData[0].email;
  } catch (_) {}

  if (!customerEmail) {
    try {
      const rR = await fetch(
        `${SUPABASE_URL}/rest/v1/refresh_signups?phone=eq.${encodeURIComponent(fromPhone)}&select=email&limit=1`,
        { headers: sbHeaders }
      );
      const rData = await rR.json();
      if (Array.isArray(rData) && rData[0] && rData[0].email) customerEmail = rData[0].email;
    } catch (_) {}
  }

  if (!customerEmail) {
    const placeholderEmail = `${fromPhone.replace(/[^0-9+]/g, '')}@sms.justrebe.com`;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          email: placeholderEmail.toLowerCase(),
          phone: fromPhone,
          first_name: 'Unknown',
          last_name: `(SMS · ${fromPhone})`,
        }),
      });
    } catch (_) {}
    customerEmail = placeholderEmail.toLowerCase();
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Log to customer_activities (sms_received, openphone)
  // ──────────────────────────────────────────────────────────────
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/customer_activities`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        customer_email: customerEmail.toLowerCase(),
        type: 'sms_received',
        body: String(bodyText || ''),
        from_addr: fromPhone,
        to_addr: toPhone,
        metadata: { provider: 'openphone', openphone_message_id: messageId, event_type: eventType },
        status: 'sent',
      }),
    });
  } catch (err) {
    console.error('OpenPhone webhook: activity log failed:', err);
  }

  // ──────────────────────────────────────────────────────────────
  // 3. Forward to email so the team gets a heads-up even when
  //    they're not actively in the CRM. (Same pattern as Twilio.)
  // ──────────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromAddr  = process.env.NOTIFY_FROM  || 'ReBe ReFresh <refresh@justrebe.com>';
    const adminAddr = process.env.NOTIFY_ADMIN || 'refresh@justrebe.com';
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddr,
          to: adminAddr,
          subject: `📱 SMS reply from ${fromPhone} (via OpenPhone)`,
          text:
`Someone just texted the ReBe OpenPhone (Quo) number.

FROM:       ${fromPhone}
TO:         ${toPhone || '(unknown)'}
WHEN:       ${new Date().toISOString()}
MSG ID:     ${messageId || '(none)'}

MESSAGE:
${bodyText}

---
Reply from the CRM: open ${customerEmail} in /admin and use the SMS
compose panel (auto-defaults to OpenPhone for OpenPhone threads).`,
        }),
      });
    } catch (err) {
      console.error('OpenPhone webhook: email forward failed:', err);
    }
  }

  return res.status(200).json({ ok: true, customer: customerEmail, message_id: messageId });
};
