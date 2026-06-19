// scripts/setup-openphone-webhook.js
//
// Registers an OpenPhone webhook that fires whenever someone texts the
// ReBe Quo number, pointing at /api/openphone-incoming so incoming SMS
// flows into the CRM activity feed.
//
// USAGE:
//   OPENPHONE_API_KEY=op_xxx node scripts/setup-openphone-webhook.js
//
// Optional overrides:
//   OPENPHONE_WEBHOOK_URL=https://staging.example.com/api/openphone-incoming
//
// The script is idempotent — it lists existing webhooks first and only
// creates a new one if no matching webhook already exists.

const API_KEY = process.env.OPENPHONE_API_KEY;
const TARGET_URL = process.env.OPENPHONE_WEBHOOK_URL || 'https://www.justrebe.com/api/openphone-incoming';

if (!API_KEY) {
  console.error('✗ Missing OPENPHONE_API_KEY env var. Find your key at:');
  console.error('  OpenPhone → Settings → API → Personal API key');
  process.exit(1);
}

const BASE = 'https://api.openphone.com/v1';
const HEADERS = {
  Authorization: API_KEY,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  return { ok: r.ok, status: r.status, json, text };
}

(async () => {
  console.log('\n=== OpenPhone webhook setup ===');
  console.log(`Target: ${TARGET_URL}\n`);

  // 1. List existing webhooks
  const list = await api('GET', '/webhooks');
  if (!list.ok) {
    console.error(`✗ Could not list webhooks (HTTP ${list.status}): ${list.text.slice(0, 300)}`);
    process.exit(1);
  }
  const existing = (list.json && (list.json.data || list.json.webhooks)) || [];
  console.log(`Existing webhooks: ${existing.length}`);
  existing.forEach((w) => {
    console.log(`  - id=${w.id}  url=${w.url}  events=${JSON.stringify(w.events)}`);
  });

  const alreadySet = existing.find((w) =>
    w.url === TARGET_URL && Array.isArray(w.events) && w.events.includes('message.received')
  );
  if (alreadySet) {
    console.log(`\n✓ Webhook already registered (id=${alreadySet.id}). Nothing to do.`);
    return;
  }

  // 2. Create the webhook for message.received events
  console.log('\nCreating new webhook for message.received…');
  const create = await api('POST', '/webhooks/messages', {
    url: TARGET_URL,
    events: ['message.received'],
    label: 'CRM incoming SMS feed',
  });

  if (!create.ok) {
    console.error(`✗ Create failed (HTTP ${create.status}): ${create.text.slice(0, 500)}`);
    console.error('\nIf you got 404, your OpenPhone account may use a different webhook path.');
    console.error('Check: https://www.openphone.com/docs/api-reference/webhooks');
    process.exit(1);
  }

  const created = create.json && (create.json.data || create.json);
  console.log(`✓ Webhook created: id=${(created && created.id) || '(?)'} `);
  console.log('\nAll set. Anyone who texts your ReBe Quo number will now show up in the CRM.');
})().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
