// api/create-checkout-session.js — Vercel serverless function
//
// Called by the cohort + 1:1 forms after the user has filled out the form
// (and the row has been saved in Supabase). Creates a Stripe Checkout
// Session and returns its hosted-payment URL.
//
// The frontend then redirects the user to that URL. The user completes
// payment on Stripe's hosted page (cards, Affirm, Klarna, Afterpay,
// Apple Pay, Google Pay — whatever is enabled in the Stripe Dashboard).
//
// On success, Stripe redirects them back to the success_url (e.g., the
// thank-you page). Simultaneously, Stripe sends a webhook to
// /api/stripe-webhook with checkout.session.completed which updates
// the Supabase row to status='paid'.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY — sk_test_... or sk_live_... from Stripe Dashboard → Developers → API keys
//
// Expected request body (POST, application/json):
//   {
//     "kind":          "cohort" | "private",
//     "signup_id":     "uuid of the refresh_signups or confidant_requests row",
//     "customer_email": "buyer@example.com",
//     "customer_name":  "Full Name",
//     "amount_cents":   49700,         // $497.00 (or 19700 for $197, or 100 for $1 test)
//     "description":    "ReBe ReFresh · 6-Week Cohort",
//     "success_url":    "https://justrebe.com/thank-you-cohort.html",
//     "cancel_url":     "https://justrebe.com/refresh-groups.html",
//     "referral_code":  "FOUNDING50" | null
//   }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY env var not set');
    return res.status(500).json({ error: 'Stripe not configured (missing STRIPE_SECRET_KEY)' });
  }

  const body = req.body || {};
  const {
    kind,
    signup_id,
    customer_email,
    customer_name,
    amount_cents,
    description,
    success_url,
    cancel_url,
    referral_code,
  } = body;

  // Basic validation
  if (!kind || !['cohort', 'private'].includes(kind)) {
    return res.status(400).json({ error: "Invalid 'kind' — must be 'cohort' or 'private'" });
  }
  if (!signup_id) return res.status(400).json({ error: "Missing 'signup_id'" });
  if (!customer_email) return res.status(400).json({ error: "Missing 'customer_email'" });
  if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 50) {
    return res.status(400).json({ error: "Invalid 'amount_cents' (must be a number >= 50 cents)" });
  }
  if (!description) return res.status(400).json({ error: "Missing 'description'" });
  if (!success_url) return res.status(400).json({ error: "Missing 'success_url'" });
  if (!cancel_url) return res.status(400).json({ error: "Missing 'cancel_url'" });

  // Build Stripe Checkout Session params (URL-encoded form body)
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('customer_email', customer_email);
  params.append('client_reference_id', signup_id);

  // Line item — single item, the product
  params.append('line_items[0][price_data][currency]', 'usd');
  params.append('line_items[0][price_data][product_data][name]', description);
  params.append('line_items[0][price_data][unit_amount]', String(amount_cents));
  params.append('line_items[0][quantity]', '1');

  // Let Stripe show whatever payment methods are enabled in the dashboard
  // (cards, Affirm, Klarna, Afterpay, Apple Pay, Google Pay, etc.)
  params.append('automatic_payment_methods[enabled]', 'true');

  // Redirect URLs
  params.append('success_url', success_url + (success_url.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}');
  params.append('cancel_url', cancel_url);

  // Metadata travels through to the webhook so we know which row to update
  params.append('metadata[kind]', kind);
  params.append('metadata[signup_id]', signup_id);
  if (customer_name) params.append('metadata[customer_name]', customer_name);
  if (referral_code) params.append('metadata[referral_code]', referral_code);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error(`Stripe error ${r.status}:`, detail);
      return res.status(500).json({ error: 'Stripe rejected the request', detail });
    }

    const session = await r.json();
    return res.status(200).json({
      id: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session', detail: String(err && err.message || err) });
  }
};
