// scripts/setup-kit-webhooks.js
//
// One-shot: registers Kit V4 webhooks pointing at our /api/kit-webhook
// endpoint so every tag-add / tag-remove / unsubscribe / link-click event
// flows into the CRM activity feed.
//
// Kit removed the webhooks UI in V4 — they're API-only now. Run this once;
// it's idempotent (skips events already registered).
//
// USAGE:
//   1. Get your Kit V4 API key:
//        Kit → Settings (top right) → Developer → API Keys → Create a new key
//        Copy the v4_... key (NOT the v3 api_secret).
//   2. Run:
//        KIT_API_KEY=v4_xxx node scripts/setup-kit-webhooks.js
//   3. Optional: override webhook URL (default points at production):
//        KIT_API_KEY=v4_xxx KIT_WEBHOOK_URL=https://staging.example.com/api/kit-webhook \
//          node scripts/setup-kit-webhooks.js

const API_KEY = process.env.KIT_API_KEY;
const SECRET  = process.env.KIT_WEBHOOK_SECRET;
const BASE_URL = process.env.KIT_WEBHOOK_URL || 'https://www.justrebe.com/api/kit-webhook';
const TARGET_URL = SECRET ? `${BASE_URL}?secret=${encodeURIComponent(SECRET)}` : BASE_URL;

if (!API_KEY) {
  console.error('✗ Missing KIT_API_KEY env var. See header comment for how to get one.');
  process.exit(1);
}

// Kit V4 renamed the endpoint from V3's /automations/hooks to /webhooks
const BASE = 'https://api.kit.com/v4';
const HOOK_PATH = '/webhooks';

const HEADERS = {
  'X-Kit-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

// Events that fire for ALL subscribers — no tag filter needed
const GLOBAL_EVENTS = [
  'subscriber.subscriber_activate',
  'subscriber.subscriber_unsubscribe',
  'subscriber.subscriber_bounce',
  'subscriber.subscriber_complain',
  'subscriber.form_subscribe',
  'subscriber.link_click',
  'purchase.purchase_create',
];

// Events that REQUIRE a specific tag_id — one webhook per tag
const PER_TAG_EVENTS = [
  'subscriber.tag_add',
  'subscriber.tag_remove',
];

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

function eventSig(ev) {
  // Sort keys so { name, tag_id } and { tag_id, name } compare equal
  const norm = {};
  Object.keys(ev || {}).sort().forEach((k) => { norm[k] = ev[k]; });
  return JSON.stringify(norm);
}

async function listExistingHooks() {
  const r = await api('GET', HOOK_PATH);
  if (!r.ok) {
    console.error(`  ✗ List failed (${r.status}): ${r.text.slice(0, 300)}`);
    return [];
  }
  return r.json && (r.json.webhooks || r.json.automation_hooks || r.json.hooks || r.json.data) || [];
}

async function listTags() {
  const r = await api('GET', '/tags');
  if (!r.ok) {
    console.error(`  ✗ Tags list failed (${r.status}): ${r.text.slice(0, 300)}`);
    return [];
  }
  return (r.json && (r.json.tags || r.json.data)) || [];
}

async function createHook(event) {
  const r = await api('POST', HOOK_PATH, { target_url: TARGET_URL, event });
  if (!r.ok) {
    return { ok: false, msg: `${r.status}: ${r.text.slice(0, 300)}` };
  }
  return { ok: true, hook: r.json };
}

(async () => {
  console.log('\n=== Kit webhook setup ===');
  console.log(`Target: ${TARGET_URL}\n`);

  console.log('1. Existing hooks:');
  const existing = await listExistingHooks();
  if (existing.length === 0) console.log('   (none)');
  existing.forEach((h) => {
    const ev = h.event || {};
    console.log(`   - id=${h.id} ${ev.name}${ev.tag_id ? ` (tag=${ev.tag_id})` : ''} -> ${h.target_url}`);
  });
  const existingSigs = new Set(existing.map((h) => eventSig(h.event)));

  console.log('\n2. Registering global events:');
  for (const name of GLOBAL_EVENTS) {
    const sig = eventSig({ name });
    if (existingSigs.has(sig)) { console.log(`   - SKIP ${name} (already registered)`); continue; }
    const { ok, msg } = await createHook({ name });
    if (ok) console.log(`   ✓ ${name}`);
    else    console.log(`   ✗ ${name}: ${msg}`);
  }

  console.log('\n3. Fetching tags for per-tag events…');
  const tags = await listTags();
  console.log(`   Found ${tags.length} tag(s):`);
  tags.forEach((t) => console.log(`   - id=${t.id}  "${t.name}"`));

  console.log('\n4. Registering tag_add + tag_remove for each tag:');
  for (const tag of tags) {
    for (const name of PER_TAG_EVENTS) {
      const event = { name, tag_id: tag.id };
      if (existingSigs.has(eventSig(event))) {
        console.log(`   - SKIP ${name} for "${tag.name}" (already registered)`);
        continue;
      }
      const { ok, msg } = await createHook(event);
      if (ok) console.log(`   ✓ ${name} for "${tag.name}"`);
      else    console.log(`   ✗ ${name} for "${tag.name}": ${msg}`);
    }
  }

  console.log('\n=== Done ===');
  console.log('All future Kit events will flow into your CRM activity feed.');
  console.log('To verify: add a tag to a subscriber in Kit, then open that');
  console.log('person in the CRM → check the Activity section.\n');
})().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
