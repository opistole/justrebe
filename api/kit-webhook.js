// api/kit-webhook.js — Kit V4 webhook receiver
//
// Receives Kit (formerly ConvertKit) webhook events and stores them in
// the kit_events table so the admin CRM activity feed can show what
// Kit has done with each customer (tags added/removed, links clicked,
// forms subscribed, etc.).
//
// Configured in Kit → Settings → Account → Developer / API → Create a
// new webhook for each event type you care about, pointing here:
//   https://www.justrebe.com/api/kit-webhook
//
// Supported V4 webhook events (per Kit docs):
//   subscriber.subscriber_activate
//   subscriber.subscriber_unsubscribe
//   subscriber.subscriber_bounce
//   subscriber.subscriber_complain
//   subscriber.form_subscribe
//   subscriber.course_subscribe
//   subscriber.course_complete
//   subscriber.link_click       (requires tag_id? — no, fires on any link)
//   subscriber.product_purchase
//   subscriber.tag_add          (requires tag_id when creating)
//   subscriber.tag_remove       (requires tag_id when creating)
//   purchase.purchase_create
//
// IMPORTANT: This endpoint must be PUBLIC (no auth) so Kit's servers
// can POST to it. Kit doesn't currently sign webhook requests, so we
// validate by checking expected payload shape.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (to insert kit_events)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !SERVICE_KEY) {
    console.error('Kit webhook: missing Supabase env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }
  const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  const body = req.body || {};

  // Always log so we can see in Vercel function logs what Kit is sending
  console.log('Kit webhook received:', JSON.stringify(body).slice(0, 2000));

  // Kit V4 wraps things differently depending on event. Search both
  // top-level and inside common wrappers (data, payload, event).
  const containers = [body, body.data, body.payload, body.event].filter(Boolean);

  function pick(prop) {
    for (const c of containers) {
      if (c && typeof c === 'object' && c[prop]) return c[prop];
    }
    return null;
  }

  const sub = pick('subscriber') || {};
  const tag = pick('tag');
  const link = pick('link');
  const form = pick('form');

  const customerEmail = String(
    sub.email_address ||
    sub.email ||
    (body.subscriber_email_address) ||
    (body.email_address) ||
    ''
  ).toLowerCase().trim();

  // Determine event_type from a few possible locations
  let eventType =
    body.event_type ||
    (typeof body.event === 'string' ? body.event : null) ||
    (body.event && body.event.name) ||
    (req.query && req.query.event) ||
    'unknown';

  if (typeof eventType === 'string' && eventType.includes('.')) {
    eventType = eventType.split('.').pop();
  }

  // Even if we can't find an email, log it anyway so we can debug the shape.
  // Use a placeholder so the row is queryable.
  const emailForRow = customerEmail || '(no-email-in-payload)';

  const row = {
    customer_email: emailForRow,
    event_type: String(eventType),
    tag_id: tag && tag.id ? String(tag.id) : null,
    tag_name: tag && tag.name ? String(tag.name) : null,
    link_url: link && link.url ? String(link.url) : null,
    form_id: form && form.id ? String(form.id) : null,
    raw: body,
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/kit_events`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error('Kit webhook: Supabase insert failed', resp.status, detail);
      // Still return 200 to Kit so it doesn't retry — we'll see the error in our logs
      return res.status(200).json({ ok: false, logged: false, error: detail.slice(0, 200) });
    }
  } catch (err) {
    console.error('Kit webhook: insert threw', err);
    return res.status(200).json({ ok: false, logged: false, error: String(err && err.message || err) });
  }

  return res.status(200).json({ ok: true, logged: true, event_type: eventType });
};
