// api/admin/send-sms.js
//
// Send an SMS to a customer from the CRM via OpenPhone (Quo). Logs
// every send to customer_activities for the unified comms history.
//
// POST body:
//   { to: '+15551234567',          // E.164 preferred; we'll normalize
//     customer_email: 'sarah@x.com', // used as identifier in activity log
//     body: 'Hi Sarah — Osil here. Confirming you got the Zoom link...' }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auth + log)
//   OPENPHONE_API_KEY, OPENPHONE_FROM_NUMBER  (send)

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

  // 1. Auth
  const auth = await requireAdminStaff(req);
  if (auth.error) return res.status(auth.error.status).json({ error: auth.error.msg });
  const { user } = auth;

  // 2. Validate body
  const { to, body, customer_email } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Message body required' });
  }
  const normPhone = normalizePhone(to);
  if (!normPhone || normPhone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid recipient phone required (E.164 preferred)' });
  }

  // 3. Validate env
  const apiKey = process.env.OPENPHONE_API_KEY;
  const fromNum = process.env.OPENPHONE_FROM_NUMBER;
  if (!apiKey || !fromNum) {
    return res.status(500).json({ error: 'OPENPHONE_API_KEY or OPENPHONE_FROM_NUMBER not configured' });
  }

  // 4. Send via OpenPhone
  let messageData = null;
  let sendError = null;
  try {
    const r = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromNum,
        to: [normPhone],
        content: String(body).trim(),
      }),
    });
    messageData = await r.json();
    if (!r.ok) {
      sendError = (messageData && (messageData.message || messageData.error)) || `HTTP ${r.status}`;
    }
  } catch (err) {
    sendError = String(err && err.message || err);
  }

  const messageId = messageData && (messageData.id || (messageData.data && messageData.data.id));

  // 5. Log to activity feed
  await logActivity({
    customerEmail: (customer_email || normPhone).toLowerCase(),
    type: 'sms_sent',
    body: String(body).trim(),
    subject: null,
    fromAddr: fromNum,
    toAddr: normPhone,
    actorId: user.id,
    actorEmail: user.email,
    metadata: { openphone_id: messageId, raw: messageData },
    status: sendError ? 'failed' : 'sent',
    errorMessage: sendError,
  });

  if (sendError) {
    return res.status(502).json({ error: 'OpenPhone rejected the message', detail: sendError });
  }

  return res.status(200).json({
    ok: true,
    message_id: messageId,
    sent_to: normPhone,
  });
};
