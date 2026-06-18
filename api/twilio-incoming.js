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

module.exports = async function handler(req, res) {
  // Twilio always uses POST for webhooks
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
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

  if (!resendKey) {
    console.error('RESEND_API_KEY not configured — cannot forward Twilio SMS');
    // Still return success to Twilio so it doesn't retry
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  // Forward to email via Resend (fire-and-forget; don't block Twilio response)
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
