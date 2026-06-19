// api/admin/send-sms-twilio.js
//
// Send an SMS from the CRM via Twilio. Use this when replying to an
// incoming Twilio message (so the customer's conversation thread stays
// intact). The OpenPhone variant lives at /api/admin/send-sms.js.
//
// POST body:
//   { to: '+13868525250',
//     customer_email: 'sarah@x.com',  // or '+13868525250@sms.justrebe.com' for phone-only
//     body: 'Hi Sarah — Osil here...' }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auth + log)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN  (send)
//   TWILIO_PHONE_NUMBER                    (defaults to +19412696448)

const { requireAdminStaff, logActivity } = require('./_admin-auth.js');

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(p || '').startsWith('+')) return String(p);
  return `+${digits}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdminStaff(req);
  if (auth.error) return res.status(auth.error.status).json({ error: auth.error.msg });
  const { user } = auth;

  const { to, body, customer_email } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Message body required' });
  }
  const normPhone = normalizePhone(to);
  if (!normPhone || normPhone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid recipient phone required' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+19412696448';
  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)' });
  }

  let twilioData = null;
  let sendError = null;
  try {
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: normPhone,
        Body: String(body).trim(),
      }).toString(),
    });
    twilioData = await r.json();
    if (!r.ok) {
      sendError = (twilioData && (twilioData.message || twilioData.error_message)) || `HTTP ${r.status}`;
    }
  } catch (err) {
    sendError = String(err && err.message || err);
  }

  await logActivity({
    customerEmail: (customer_email || normPhone).toLowerCase(),
    type: 'sms_sent',
    body: String(body).trim(),
    subject: null,
    fromAddr: fromNumber,
    toAddr: normPhone,
    actorId: user.id,
    actorEmail: user.email,
    metadata: { provider: 'twilio', twilio_sid: twilioData && twilioData.sid },
    status: sendError ? 'failed' : 'sent',
    errorMessage: sendError,
  });

  if (sendError) {
    return res.status(502).json({ error: 'Twilio rejected the message', detail: sendError });
  }

  return res.status(200).json({
    ok: true,
    message_sid: twilioData && twilioData.sid,
    sent_to: normPhone,
    sent_from: fromNumber,
  });
};
