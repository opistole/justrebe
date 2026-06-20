// api/admin/_admin-auth.js
//
// Shared helper for admin-only serverless endpoints. Validates the
// incoming request's Supabase JWT, confirms the user has an admin
// or staff role in user_roles, returns the authenticated user.
//
// Usage in handler:
//   const { user, error } = await requireAdminStaff(req);
//   if (error) return res.status(error.status).json({ error: error.msg });
//   // ... use user.id, user.email
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

// Verify a Supabase HS256 JWT against SUPABASE_JWT_SECRET, returning the
// decoded payload or null on any failure (bad format, bad signature, etc.).
// If SUPABASE_JWT_SECRET isn't set, falls back to unsafe decode so the
// CRM keeps working — but logs a warning so we know to add the env var.
function base64UrlDecode(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}
function verifyJwtHS256(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = String(token).split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    if (header.alg !== 'HS256') return null;

    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest();
    const providedSig = base64UrlDecode(sigB64);
    if (!constantTimeEqual(expectedSig, providedSig)) return null;

    return JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
}
function decodeJwtUnverified(token) {
  try {
    const payloadB64 = String(token).split('.')[1];
    if (!payloadB64) return null;
    return JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
}
function decodeAndVerifyJwt(token) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) return verifyJwtHS256(token, secret);
  // Fallback only if the secret isn't configured. Log a clear warning so
  // ops sees it and adds the env var.
  console.warn('[_admin-auth] SUPABASE_JWT_SECRET not configured — JWT signature NOT verified.');
  return decodeJwtUnverified(token);
}

async function requireAdminStaff(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { error: { status: 500, msg: 'Supabase env vars not configured' } };
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: { status: 401, msg: 'Missing Authorization header' } };

  // Verify JWT signature (if SUPABASE_JWT_SECRET is set) + decode payload
  const payload = decodeAndVerifyJwt(token);
  if (!payload || !payload.sub) {
    return { error: { status: 401, msg: 'Invalid or unverifiable JWT — log out and back in' } };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { error: { status: 401, msg: 'Session expired — log out and back in to get a fresh token' } };
  }

  const userId = payload.sub;
  const userEmail = payload.email || '';

  // Confirm user has a role in user_roles using service_role (bypasses RLS).
  // This is the actual auth check — without a row here, the user can't act.
  // SUPABASE_URL on Vercel has /rest/v1 appended (matches stripe-webhook
  // handling). Strip trailing slash AND /rest/v1 suffix to get a clean base.
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const rolesUrl = `${baseUrl}/rest/v1/user_roles?select=role&user_id=eq.${userId}&limit=1`;

  let roleResp;
  try {
    roleResp = await fetch(rolesUrl, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch (err) {
    return { error: { status: 500, msg: `Role lookup network error: ${err.message} (URL: ${rolesUrl})` } };
  }
  if (!roleResp.ok) {
    let detail = '';
    try { detail = await roleResp.text(); } catch (_) {}
    return {
      error: {
        status: 500,
        msg: `Role lookup failed (HTTP ${roleResp.status}) at URL [${rolesUrl}]: ${detail.slice(0, 200)}`,
      },
    };
  }
  const roles = await roleResp.json();
  if (!roles || !roles.length) {
    return { error: { status: 403, msg: 'No team role assigned to this user' } };
  }

  return {
    user: { id: userId, email: userEmail },
    role: roles[0].role,
  };
}

// Returns array of { email, label, default? } the given user is allowed
// to send "from". MVP: hardcoded by email local-part. Future: store in
// a user_profiles table.
function allowedSendersForUser(userEmail) {
  const shared = { email: 'refresh@justrebe.com', label: 'ReBe ReFresh', default: true };
  const local = (userEmail || '').toLowerCase().split('@')[0];

  const personalMap = {
    osilpistole:    { email: 'o.pistole@justrebe.com', label: 'Osil Pistole' },
    'o.pistole':    { email: 'o.pistole@justrebe.com', label: 'Osil Pistole' },
    opistole:       { email: 'o.pistole@justrebe.com', label: 'Osil Pistole' },
    'a.logan':      { email: 'a.logan@justrebe.com',  label: 'Ashley Logan' },
    alogan:         { email: 'a.logan@justrebe.com',  label: 'Ashley Logan' },
    'e.good':       { email: 'e.good@justrebe.com',   label: 'Elizabeth Good' },
    egood:          { email: 'e.good@justrebe.com',   label: 'Elizabeth Good' },
  };

  const personal = personalMap[local];
  return personal ? [shared, personal] : [shared];
}

// Log a customer activity row (email_sent or sms_sent). Always called
// with service_role so it bypasses RLS.
async function logActivity({ customerEmail, type, body, subject, fromAddr, toAddr, actorId, actorEmail, metadata, status, errorMessage }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return { error: 'env not configured' };
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

  try {
    const resp = await fetch(`${baseUrl}/rest/v1/customer_activities`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        customer_email: (customerEmail || '').toLowerCase(),
        type,
        body,
        subject,
        from_addr: fromAddr,
        to_addr: toAddr,
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: metadata || null,
        status: status || 'sent',
        error_message: errorMessage || null,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('Activity log failed:', resp.status, txt);
      return { error: txt };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Activity log threw:', err);
    return { error: String(err && err.message || err) };
  }
}

module.exports = { requireAdminStaff, allowedSendersForUser, logActivity };
