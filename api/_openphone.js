// api/_openphone.js — OpenPhone integration helper
//
// When a visitor submits a form on the site (BB Ashley handoff, Reset signup,
// cohort signup, etc.), this helper creates a contact in Ashley's OpenPhone
// workspace so she can text them straight from the OpenPhone app.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   OPENPHONE_API_KEY     — API key from OpenPhone → Settings → API
//   OPENPHONE_FROM_NUMBER — Ashley's OpenPhone number in E.164, e.g. "+19412974243"
//                          Used to look up which user the contact should be
//                          assigned to (createdByUserId).
//
// Gracefully no-ops if env vars are missing, so missing config doesn't break
// the main email flow.

const API_KEY  = process.env.OPENPHONE_API_KEY;
const FROM_NUM = process.env.OPENPHONE_FROM_NUMBER;
const BASE_URL = 'https://api.openphone.com/v1';

// Cached user lookup — find the OpenPhone user whose number matches
// OPENPHONE_FROM_NUMBER. Required because /v1/contacts wants createdByUserId.
let cachedUserId = null;
let userLookupInFlight = null;

async function findUserId() {
  if (cachedUserId) return cachedUserId;
  if (userLookupInFlight) return userLookupInFlight;

  userLookupInFlight = (async () => {
    try {
      const r = await fetch(`${BASE_URL}/users`, {
        headers: { Authorization: API_KEY },
      });
      if (!r.ok) {
        const detail = await r.text();
        console.error(`OpenPhone /users error ${r.status}:`, detail);
        return null;
      }
      const data = await r.json();
      const users = data.data || [];

      // Find user whose phoneNumbers array contains FROM_NUM
      for (const u of users) {
        const phones = (u.phoneNumbers || []).map((p) => p.phoneNumber || p.number || '');
        if (phones.includes(FROM_NUM)) {
          cachedUserId = u.id;
          return u.id;
        }
      }
      // Fallback: first user in workspace (single-user case)
      if (users[0]) {
        cachedUserId = users[0].id;
        return users[0].id;
      }
      return null;
    } catch (err) {
      console.error('OpenPhone user lookup failed:', err);
      return null;
    } finally {
      userLookupInFlight = null;
    }
  })();

  return userLookupInFlight;
}

// Normalize a US phone string to E.164 ("+15551234567")
function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(phone).startsWith('+')) return String(phone);
  return `+${digits}`;
}

// Create a contact in OpenPhone. Gracefully no-ops if env vars missing.
//
// Args:
//   firstName, lastName — visitor's name (split before calling)
//   email               — visitor's email
//   phone               — raw phone string, will be normalized to E.164
//   source              — short label for where the contact came from
//                         (shown in OpenPhone's "Role" field, e.g. "Reset signup")
//
// Returns { ok: true, contactId } on success, { skipped, reason } if no-op,
// { ok: false, error } on failure.
async function createOpenPhoneContact({ firstName, lastName, email, phone, source } = {}) {
  if (!API_KEY) return { skipped: true, reason: 'OPENPHONE_API_KEY not set' };
  if (!phone)   return { skipped: true, reason: 'no phone number provided' };

  const e164 = toE164(phone);
  if (!e164) return { skipped: true, reason: 'phone could not be normalized' };

  const userId = await findUserId();

  const body = {
    defaultFields: {
      firstName: firstName || '',
      lastName: lastName || '',
      phoneNumbers: [{ name: 'Mobile', value: e164 }],
    },
  };
  if (email) {
    body.defaultFields.emails = [{ name: 'Email', value: email }];
  }
  if (source) {
    body.defaultFields.role = source;
  }
  if (userId) body.createdByUserId = userId;

  try {
    const r = await fetch(`${BASE_URL}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error(`OpenPhone /contacts error ${r.status}:`, detail);
      return { ok: false, error: detail };
    }
    const data = await r.json();
    return { ok: true, contactId: data?.data?.id || null };
  } catch (err) {
    console.error('OpenPhone /contacts request failed:', err);
    return { ok: false, error: String((err && err.message) || err) };
  }
}

module.exports = { createOpenPhoneContact };
