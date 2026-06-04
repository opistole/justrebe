// api/stripe-webhook.js — Vercel serverless function
//
// Receives webhook events from Stripe. Verifies the signature, then
// (on a successful checkout.session.completed event) updates the
// matching Supabase row to status='paid'.
//
// Stripe → Dashboard → Developers → Webhooks → Add endpoint
//   URL:     https://justrebe.com/api/stripe-webhook
//   Events:  checkout.session.completed
//   Copy the "Signing secret" (whsec_...) into STRIPE_WEBHOOK_SECRET env var.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   STRIPE_WEBHOOK_SECRET     — whsec_... from the webhook endpoint config
//   SUPABASE_URL              — https://YOUR_PROJECT.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service_role key (NOT the anon key — this bypasses RLS)
//
// Stripe signature verification needs the RAW request body, not the
// parsed JSON, so we disable Vercel's default body parser below.

const crypto = require('crypto');
const { kitSubscribe } = require('./_kit.js');

// Tell Vercel to give us the raw body, not a parsed JSON object.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Read the raw request body as a Buffer.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe signature verification.
// Header format: "t=TIMESTAMP,v1=SIGNATURE[,v1=...]"
// Signed payload: `${timestamp}.${rawBody}` HMAC-SHA256 with the secret.
// Tolerance window: 5 minutes (matches Stripe's recommendation).
function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!sigHeader || typeof sigHeader !== 'string') return false;

  const parts = sigHeader.split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    if (!acc[k]) acc[k] = [];
    acc[k].push(v);
    return acc;
  }, {});

  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Constant-time compare against any provided v1 signature
  return signatures.some((sig) => {
    try {
      const a = Buffer.from(sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

// PATCH a Supabase row using the service-role key (bypasses RLS).
async function supabasePatch({ table, id, patch }) {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  // Defensive: strip whitespace and trailing slash, and remove any
  // accidentally-included REST path component (e.g., "/rest/v1") so the
  // resulting URL is always well-formed.
  const url = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  const r = await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Supabase PATCH ${r.status}: ${detail}`);
  }
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET env var not set');
    return res.status(500).json({ error: 'Webhook not configured (missing STRIPE_WEBHOOK_SECRET)' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body:', err);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  const sigHeader = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
    console.error('Invalid Stripe signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Failed to parse event JSON:', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // We only care about completed Checkout Sessions.
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const session = (event.data && event.data.object) || {};
  const metadata = session.metadata || {};
  const kind = metadata.kind;          // 'cohort' | 'private'
  const signup_id = metadata.signup_id;

  if (!kind || !signup_id) {
    console.error('Webhook missing metadata.kind or metadata.signup_id', metadata);
    return res.status(200).json({ ok: true, skipped: 'missing metadata' });
  }

  const table =
    kind === 'cohort'  ? 'refresh_signups' :
    kind === 'private' ? 'confidant_requests' :
    null;

  if (!table) {
    console.error('Webhook unknown kind:', kind);
    return res.status(200).json({ ok: true, skipped: `unknown kind: ${kind}` });
  }

  const patch = {
    status: 'paid',
    stripe_session_id: session.id,
    paid_amount_cents: session.amount_total ?? null,
    paid_at: new Date().toISOString(),
  };

  try {
    const rows = await supabasePatch({ table, id: signup_id, patch });

    // Tag the customer in Kit as "ReBe — Customer (Paid)". Fire-and-forget;
    // a Kit failure shouldn't make Stripe think the webhook failed and retry.
    const customerEmail = (session.customer_details && session.customer_details.email) || session.customer_email;
    const customerName = (session.customer_details && session.customer_details.name) || metadata.customer_name || '';
    if (customerEmail) {
      kitSubscribe({
        email: customerEmail,
        first_name: customerName.trim().split(/\s+/)[0] || '',
        tags: ['ReBe — Customer (Paid)'],
      }).catch((e) => console.error('Kit (stripe-webhook):', e));
    }

    return res.status(200).json({ ok: true, updated: rows.length, table, signup_id });
  } catch (err) {
    console.error('Webhook Supabase update failed:', err);
    // Return 500 so Stripe retries.
    return res.status(500).json({ error: 'Supabase update failed', detail: String(err && err.message || err) });
  }
};
