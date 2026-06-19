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

async function requireAdminStaff(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { error: { status: 500, msg: 'Supabase env vars not configured' } };
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: { status: 401, msg: 'Missing Authorization header' } };

  // Verify the JWT by asking Supabase who the user is.
  // apikey should be anon/publishable. We don't have a separate env var for it
  // but the service_role also works for this endpoint.
  let userResp;
  try {
    userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    return { error: { status: 500, msg: `Supabase request failed: ${err.message}` } };
  }

  if (!userResp.ok) {
    let detail = '';
    try { detail = await userResp.text(); } catch (_) {}
    return {
      error: {
        status: 401,
        msg: `Auth check failed (HTTP ${userResp.status}): ${detail.slice(0, 200)}`,
      },
    };
  }
  const user = await userResp.json();
  if (!user || !user.id) return { error: { status: 401, msg: 'No user found for token (response body: ' + JSON.stringify(user).slice(0, 200) + ')' } };

  // Look up role using service-role (bypasses RLS for this admin check)
  const roleResp = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${user.id}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!roleResp.ok) return { error: { status: 500, msg: 'Role lookup failed' } };
  const roles = await roleResp.json();
  if (!roles || !roles.length) return { error: { status: 403, msg: 'No team role assigned' } };

  return { user, role: roles[0].role };
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

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/customer_activities`, {
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
