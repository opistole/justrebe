#!/usr/bin/env node
// scripts/send-reminders.js
//
// Sends day-before workshop reminder texts to everyone who got a Twilio
// confirmation SMS at signup. Pulls the recipient list from Twilio's own
// message logs — no Supabase / OpenPhone / Kit / CSV needed.
//
// USAGE:
//   1. Provide Twilio credentials one of these ways:
//      a) Create .env.local with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//         TWILIO_FROM_NUMBER on separate lines
//      b) Pass on the command line:
//         TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=yyy TWILIO_FROM_NUMBER=+1xxx \
//           node scripts/send-reminders.js --dry-run
//
//   2. ALWAYS run with --dry-run first to preview:
//         node scripts/send-reminders.js --dry-run
//
//   3. When the preview looks right, run for real:
//         node scripts/send-reminders.js
//
// FLAGS:
//   --dry-run        Show what would be sent, but don't send anything.
//   --slot=11am      Only send to the 11 AM list (default: both)
//   --slot=8pm       Only send to the 8 PM list
//   --since=2026-06-01  Only look at confirmation texts sent on/after this date
//                       (default: 30 days ago)
//
// No npm packages required — uses Node's built-in fetch.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---- 1. Load .env.local if present (simple parser, no dotenv dep) ----
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---- 2. Parse args ----
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isFinal = args.includes('--final'); // sends "jump in the room" 15-min-before message
const isHappyHour = args.includes('--happy-hour'); // sends Fri 6/19 Happy Hour Q&A invite
const autoConfirm = args.includes('--auto-confirm'); // skips YES prompt (used by scheduled jobs)
const slotArg = (args.find(a => a.startsWith('--slot=')) || '').split('=')[1] || null; // '11am' | '8pm' | null
const sinceArg = (args.find(a => a.startsWith('--since=')) || '').split('=')[1] || null;

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;

if (!SID || !TOKEN || !FROM) {
  console.error('\n❌ Missing Twilio credentials.');
  console.error('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER');
  console.error('   in .env.local or pass them on the command line.\n');
  process.exit(1);
}

const since = sinceArg
  ? new Date(sinceArg)
  : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: 30 days ago

// ---- 3. Templates ----
const ZOOM_LINK = 'https://us06web.zoom.us/j/9057767620';

function reminderFor(slot, firstName) {
  const time = slot === '8pm' ? '8:00 PM Eastern' : '11:00 AM Eastern';
  const name = firstName || 'friend';
  return `Hi ${name}, quick reminder — your ReBe ReFresh experience is tomorrow at ${time}.

Join us here: ${ZOOM_LINK}

See you there!
— The ReBe ReFresh Team

Reply STOP to opt out.`;
}

function finalFor(firstName) {
  const name = firstName || 'friend';
  return `Hi ${name}! Jump in the room — we're starting in 15 min. ${ZOOM_LINK} See you soon! Reply STOP to opt out.`;
}

function happyHourFor(firstName) {
  const name = firstName || 'friend';
  return `Hi ${name}! 🥂 You're invited to a Happy Hour Q&A with Elizabeth & Osil tomorrow (Fri 6/19) at 3 PM Eastern (12 PM Pacific). Come with your questions, let's chat ✨ Zoom: https://us06web.zoom.us/j/9057767620 Reply STOP to opt out.`;
}

// ---- 4. Twilio API helpers ----
const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');
const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${SID}`;

async function listMessages() {
  const all = [];
  let nextUrl = `${baseUrl}/Messages.json?From=${encodeURIComponent(FROM)}&PageSize=1000`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: auth }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Twilio list failed: ${res.status} ${errText}`);
    }
    const data = await res.json();
    all.push(...(data.messages || []));
    nextUrl = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }
  // Filter by date in JS — simpler than URL-encoding the DateSent operator
  return all.filter(m => new Date(m.date_sent) >= since);
}

async function sendMessage(to, body) {
  const params = new URLSearchParams({ To: to, From: FROM, Body: body });
  const res = await fetch(`${baseUrl}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ---- 5. Parse confirmations → recipient list ----
function extractRecipients(messages) {
  const byPhone = new Map();
  for (const m of messages) {
    const body = m.body || '';
    // Match the workshop confirmation pattern from api/notify.js buildWorkshopSMS()
    if (!body.includes('ReBe ReFresh workshop is Tue June 16')) continue;
    if (m.status === 'failed' || m.status === 'undelivered') continue;

    let slot = null;
    if (body.includes('11 AM ET')) slot = '11am';
    else if (body.includes('8 PM ET')) slot = '8pm';
    if (!slot) continue;

    const nameMatch = body.match(/^Hi ([^,!]+?)[!,]/);
    const firstName = nameMatch ? nameMatch[1].trim() : '';
    const cleanName = (firstName === 'there' || firstName.toLowerCase() === 'friend') ? '' : firstName;

    if (!m.to) continue;
    // Keep latest signup if dup
    const existing = byPhone.get(m.to);
    if (!existing || new Date(m.date_sent) > new Date(existing.date_sent)) {
      byPhone.set(m.to, { phone: m.to, firstName: cleanName, slot, date_sent: m.date_sent });
    }
  }
  return [...byPhone.values()];
}

// ---- 6. Confirm prompt ----
function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

// ---- 7. Main ----
(async () => {
  console.log('\n🔍 Pulling confirmation messages from Twilio (since ' + since.toISOString().slice(0, 10) + ')...');
  const messages = await listMessages();
  console.log(`   Got ${messages.length} total messages from ${FROM}.`);

  let recipients = extractRecipients(messages);
  if (slotArg) recipients = recipients.filter(r => r.slot === slotArg);

  const list11 = recipients.filter(r => r.slot === '11am');
  const list8 = recipients.filter(r => r.slot === '8pm');

  console.log('\n📋 Recipient counts:');
  console.log(`   11 AM: ${list11.length}`);
  console.log(`   8 PM:  ${list8.length}`);
  console.log(`   Total: ${recipients.length}`);

  if (recipients.length === 0) {
    console.log('\n⚠️  No recipients found. Check that:');
    console.log('   - The TWILIO_FROM_NUMBER matches the number used for signup texts');
    console.log('   - The --since date is far enough back');
    process.exit(0);
  }

  console.log('\n📱 Sample messages:');
  const mkBody = (slot, name) => isHappyHour ? happyHourFor(name) : isFinal ? finalFor(name) : reminderFor(slot, name);
  if (list11[0]) console.log('\n--- 11 AM sample (to ' + list11[0].phone + ') ---\n' + mkBody('11am', list11[0].firstName));
  if (list8[0]) console.log('\n--- 8 PM sample (to ' + list8[0].phone + ') ---\n' + mkBody('8pm', list8[0].firstName));

  if (isDryRun) {
    console.log('\n✅ DRY RUN complete. No texts sent.');
    console.log('   Re-run without --dry-run to send for real.\n');
    process.exit(0);
  }

  if (autoConfirm) {
    console.log(`\n🤖 Auto-confirm enabled. Sending ${recipients.length} text(s) now...`);
  } else {
    const ok = await confirm(`\n⚠️  Send ${recipients.length} text(s) for real? Type YES to confirm: `);
    if (ok !== 'yes') {
      console.log('Aborted. No texts sent.');
      process.exit(0);
    }
  }

  console.log('\n🚀 Sending...');
  let sent = 0, failed = 0;
  const failures = [];
  for (const r of recipients) {
    const body = mkBody(r.slot, r.firstName);
    try {
      await sendMessage(r.phone, body);
      sent++;
      process.stdout.write(`   ✓ ${r.phone} (${r.slot})  [${sent}/${recipients.length}]\n`);
      // gentle rate limit so we don't hammer Twilio
      await new Promise(res => setTimeout(res, 200));
    } catch (err) {
      failed++;
      failures.push({ phone: r.phone, slot: r.slot, error: err.message });
      process.stdout.write(`   ✗ ${r.phone} (${r.slot}): ${err.message}\n`);
    }
  }

  console.log(`\n📊 Done. Sent: ${sent}  Failed: ${failed}`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f.phone} (${f.slot}) — ${f.error}`));
  }
})().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
