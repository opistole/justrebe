// api/_kit.js — Shared Kit (formerly ConvertKit) helper.
//
// Used by /api/notify.js (form submissions) and /api/stripe-webhook.js
// (payment confirmation) to subscribe a person to Kit with one or more tags.
//
// Why a shared file: Vercel serverless functions can import from sibling
// files. The underscore prefix keeps this file from being treated as a
// public HTTP endpoint.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   KIT_API_KEY     — public-ish Kit API key (read tags, light operations)
//   KIT_API_SECRET  — server-only Kit API secret (subscribe people, tag)
//
// If either is missing, every Kit call silently no-ops so the rest of the
// notify/webhook flow keeps working.

// In-memory cache of tag name → tag ID. Filled on first call.
let _tagCache = null;
let _tagCachePromise = null;

async function fetchTagMap() {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) throw new Error('Missing KIT_API_KEY');

  const r = await fetch(`https://api.convertkit.com/v3/tags?api_key=${apiKey}`);
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Kit tags fetch ${r.status}: ${detail}`);
  }
  const json = await r.json();
  const map = {};
  (json.tags || []).forEach((t) => { map[t.name] = t.id; });
  return map;
}

async function getTagMap() {
  if (_tagCache) return _tagCache;
  if (_tagCachePromise) return _tagCachePromise;
  _tagCachePromise = fetchTagMap().then(
    (m) => { _tagCache = m; _tagCachePromise = null; return m; },
    (e) => { _tagCachePromise = null; throw e; }
  );
  return _tagCachePromise;
}

async function subscribeToTag(tagId, { email, first_name }) {
  // Use API Key (not Secret) — Kit V3 docs allow either for the
  // subscribe-to-tag endpoint, and the Key is what we already know
  // works (the tag-list GET uses it). If api_secret was misconfigured
  // in Vercel, falling back to api_key sidesteps that.
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) throw new Error('Missing KIT_API_KEY');

  const r = await fetch(`https://api.convertkit.com/v3/tags/${tagId}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      email,
      ...(first_name ? { first_name } : {}),
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Kit subscribe ${r.status}: ${detail}`);
  }
  return r.json();
}

// Public API. Pass an email + array of tag names. Resolves tag names to IDs
// via cached tag map and subscribes the person to each. Failures on
// individual tags are logged but don't abort the others.
async function kitSubscribe({ email, first_name, tags }) {
  if (!email) {
    return { skipped: true, reason: 'missing_email' };
  }
  if (!tags || !tags.length) {
    return { skipped: true, reason: 'no_tags' };
  }
  if (!process.env.KIT_API_KEY || !process.env.KIT_API_SECRET) {
    console.log('Kit not configured — skipping subscribe for', email);
    return { skipped: true, reason: 'kit_not_configured' };
  }

  let tagMap;
  try {
    tagMap = await getTagMap();
  } catch (err) {
    console.error('Kit getTagMap failed:', err);
    return { skipped: true, reason: 'tag_map_fetch_failed', error: String(err && err.message || err) };
  }

  const results = await Promise.allSettled(
    tags.map((name) => {
      const id = tagMap[name];
      if (!id) {
        console.warn(`Kit tag not found in Kit account: "${name}"`);
        return Promise.resolve({ skipped: true, tag: name });
      }
      return subscribeToTag(id, { email, first_name });
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.error('Kit subscribe partial failure:', failed.map((f) => String(f.reason)));
  }
  return {
    ok: failed.length === 0,
    sent: results.length - failed.length,
    failed: failed.length,
  };
}

module.exports = { kitSubscribe };
