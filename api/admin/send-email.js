// api/admin/send-email.js
//
// Send an email to a customer from the CRM via Resend. Logs every send
// to customer_activities so the team sees a unified comms history.
//
// POST body:
//   { to: 'customer@example.com',
//     from: 'refresh@justrebe.com',   // must be in user's allowed senders
//     subject: 'Hello',
//     body: 'Plain text body...' }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (for auth check + log write)
//   RESEND_API_KEY                            (for sending)

const { requireAdminStaff, allowedSendersForUser, logActivity } = require('./_admin-auth.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Auth
  const auth = await requireAdminStaff(req);
  if (auth.error) return res.status(auth.error.status).json({ error: auth.error.msg });
  const { user } = auth;

  // 2. Validate body
  const { to, from, subject, body } = req.body || {};
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Valid recipient email required' });
  }
  if (!subject || !String(subject).trim()) {
    return res.status(400).json({ error: 'Subject required' });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Body required' });
  }
  if (!from) {
    return res.status(400).json({ error: 'Sender required' });
  }

  // 3. Validate sender is allowed for this user
  const allowed = allowedSendersForUser(user.email);
  if (!allowed.find((s) => s.email.toLowerCase() === from.toLowerCase())) {
    return res.status(403).json({
      error: 'Sender not allowed for this user',
      allowed: allowed.map((s) => s.email),
    });
  }

  // 4. Pick the "display name" for the from header (so it reads as a person)
  const senderInfo = allowed.find((s) => s.email.toLowerCase() === from.toLowerCase());
  const fromHeader = senderInfo.label
    ? `${senderInfo.label} <${senderInfo.email}>`
    : senderInfo.email;

  // 5. Send via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  let resendData = null;
  let sendError = null;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader,
        to,
        subject: String(subject).trim(),
        text: String(body),
        reply_to: from, // replies go back to the sender, not the team's shared inbox
      }),
    });
    resendData = await r.json();
    if (!r.ok) sendError = resendData.message || resendData.error || `HTTP ${r.status}`;
  } catch (err) {
    sendError = String(err && err.message || err);
  }

  // 6. Log to activity feed (regardless of success/failure)
  await logActivity({
    customerEmail: to,
    type: 'email_sent',
    body: String(body),
    subject: String(subject).trim(),
    fromAddr: from,
    toAddr: to,
    actorId: user.id,
    actorEmail: user.email,
    metadata: { resend_id: resendData && resendData.id, sender_label: senderInfo.label },
    status: sendError ? 'failed' : 'sent',
    errorMessage: sendError,
  });

  if (sendError) {
    return res.status(502).json({ error: 'Resend rejected the email', detail: sendError });
  }

  return res.status(200).json({
    ok: true,
    message_id: resendData && resendData.id,
    sent_from: from,
    sent_to: to,
  });
};
