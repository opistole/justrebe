// api/admin/send-sms.js
//
// Send an SMS to a customer from the CRM via OpenPhone (default) or Twilio.
// Routes by `provider` in the POST body so we stay at one serverless function
// (Vercel Hobby caps at 12).
//
// POST body:
//   { to: '+15551234567',          // E.164 preferred; we'll normalize
//     customer_email: 'sarah@x.com',
//     body: 'Hi Sarah — ...',
//     provider: 'openphone' | 'twilio'  // optional; defaults to 'openphone' }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      (auth + log)
//   OPENPHONE_API_KEY, OPENPHONE_FROM_NUMBER     (for provider='openphone')
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN        (for provider='twilio')
//   TWILIO_PHONE_NUMBER                          (Twilio "from" — default +19412696448)

const { requireAdminStaff, logActivity } = require('./_admin-auth.js');

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(p || '').startsWith('+')) return String(p);
  return `+${digits}`;
}

async function sendViaOpenPhone(normPhone, body) {
  const apiKey = process.env.OPENPHONE_API_KEY;
  const fromNum = process.env.OPENPHONE_FROM_NUMBER;
  if (!apiKey || !fromNum) {
    return { error: 'OPENPHONE_API_KEY or OPENPHONE_FROM_NUMBER not configured', fromNum };
  }
  try {
    const r = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromNum, to: [normPhone], content: body }),
    });
    const data = await r.json();
    if (!r.ok) {
      return { error: (data && (data.message || data.error)) || `HTTP ${r.status}`, fromNum, data };
    }
    const messageId = data.id || (data.data && data.data.id);
    return { ok: true, fromNum, messageId, data };
  } catch (err) {
    return { error: String(err && err.message || err), fromNum };
  }
}

async function sendViaTwilio(normPhone, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNum    = process.env.TWILIO_PHONE_NUMBER || '+19412696448';
  if (!accountSid || !authToken) {
    return { error: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured', fromNum };
  }
  try {
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromNum, To: normPhone, Body: body }).toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return { error: (data && (data.message || data.error_message)) || `HTTP ${r.status}`, fromNum, data };
    }
    return { ok: true, fromNum, messageId: data.sid, data };
  } catch (err) {
    return { error: String(err && err.message || err), fromNum };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdminStaff(req);
  if (auth.error) return res.status(auth.error.status).json({ error: auth.error.msg });
  const { user } = auth;

  const { to, body, customer_email, provider } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Message body required' });
  }
  const normPhone = normalizePhone(to);
  if (!normPhone || normPhone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid recipient phone required (E.164 preferred)' });
  }

  const chosenProvider = String(provider || 'openphone').toLowerCase();
  const trimmedBody = String(body).trim();

  const result = chosenProvider === 'twilio'
    ? await sendViaTwilio(normPhone, trimmedBody)
    : await sendViaOpenPhone(normPhone, trimmedBody);

  // Always log to activity feed, success or failure
  await logActivity({
    customerEmail: (customer_email || normPhone).toLowerCase(),
    type: 'sms_sent',
    body: trimmedBody,
    subject: null,
    fromAddr: result.fromNum,
    toAddr: normPhone,
    actorId: user.id,
    actorEmail: user.email,
    metadata: {
      provider: chosenProvider,
      message_id: result.messageId,
      raw: result.data,
    },
    status: result.error ? 'failed' : 'sent',
    errorMessage: result.error,
  });

  if (result.error) {
    return res.status(502).json({
      error: `${chosenProvider === 'twilio' ? 'Twilio' : 'OpenPhone'} rejected the message`,
      detail: result.error,
    });
  }

  return res.status(200).json({
    ok: true,
    provider: chosenProvider,
    message_id: result.messageId,
    sent_from: result.fromNum,
    sent_to: normPhone,
  });
};
