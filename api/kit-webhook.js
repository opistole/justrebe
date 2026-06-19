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

  // Kit V4 webhook payload shape:
  // {
  //   "subscriber": { "id": ..., "email_address": ..., ... },
  //   "tag": { "id": ..., "name": ... }, (when tag_add/tag_remove)
  //   "link": { "url": ..., ... }, (when link_click)
  //   "form": { "id": ..., "name": ... }, (when form_subscribe)
  // }
  // The webhook URL also includes a path/query indicating the event type,
  // OR there's an `event` field. Different versions vary. We handle both.

  const sub = body.subscriber || {};
  const customerEmail = String(sub.email_address || sub.email || '').toLowerCase().trim();

  if (!customerEmail) {
    // Some Kit webhooks don't include email (e.g., purchase events). Skip silently.
    console.warn('Kit webhook: no email in payload, ignoring', JSON.stringify(body).slice(0, 300));
    return res.status(200).json({ ok: true, skipped: 'no_email' });
  }

  // Determine event_type from a few possible locations
  let eventType =
    body.event_type ||
    body.event ||
    (req.query && req.query.event) ||
    'unknown';

  // Normalize: 'subscriber.tag_add' -> 'tag_add'
  if (typeof eventType === 'string' && eventType.includes('.')) {
    eventType = eventType.split('.').pop();
  }

  const row = {
    customer_email: customerEmail,
    event_type: String(eventType),
    tag_id: body.tag && body.tag.id ? String(body.tag.id) : null,
    tag_name: body.tag && body.tag.name ? String(body.tag.name) : null,
    link_url: body.link && body.link.url ? String(body.link.url) : null,
    form_id: body.form && body.form.id ? String(body.form.id) : null,
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
