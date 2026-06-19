// scripts/list-kit-webhooks.js
//
// Lists every webhook currently registered in your Kit account so we can
// confirm setup-kit-webhooks.js actually created them.
//
// USAGE:
//   KIT_API_KEY=v4_xxx node scripts/list-kit-webhooks.js

const API_KEY = process.env.KIT_API_KEY;
if (!API_KEY) {
  console.error('Missing KIT_API_KEY env var');
  process.exit(1);
}

(async () => {
  const r = await fetch('https://api.kit.com/v4/webhooks', {
    headers: { 'X-Kit-Api-Key': API_KEY },
  });
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status}:`, text.slice(0, 500));
    process.exit(1);
  }
  let data;
  try { data = JSON.parse(text); } catch { console.log(text); return; }
  const hooks = data.webhooks || data.automation_hooks || data.data || data.hooks || [];

  console.log(`Found ${hooks.length} webhook(s):\n`);
  if (!hooks.length) {
    console.log('(none — script either failed silently or webhooks were deleted)');
    return;
  }
  hooks.forEach((h, i) => {
    console.log(`${i + 1}. id=${h.id}`);
    console.log(`   url:    ${h.target_url}`);
    console.log(`   event:  ${JSON.stringify(h.event)}`);
    console.log('');
  });
})().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
