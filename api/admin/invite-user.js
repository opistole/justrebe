// api/admin/invite-user.js
//
// Server-side endpoint to invite a new team member to the ReBe Admin CRM.
// Uses Supabase Auth Admin API (requires SUPABASE_SERVICE_ROLE_KEY).
//
// Called from the dashboard's "Invite teammate" UI (not yet built — Phase 2).
// For Phase 1, this can also be called directly via curl to seed Ashley + Elizabeth:
//
//   curl -X POST https://www.justrebe.com/api/admin/invite-user \
//     -H "Content-Type: application/json" \
//     -d '{"email":"a.logan@justrebe.com","role":"staff","invited_by_secret":"REPLACE_WITH_ADMIN_INVITE_SECRET"}'
//
// Required env vars on Vercel:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY     — bypasses RLS, can create users
//   ADMIN_INVITE_SECRET           — shared secret to gate this endpoint
//                                   until Phase 2 adds in-app auth check
//
// The invited user receives an email from Supabase with a link to set their
// password. Once they set it, they can log in at /admin/ — but they won't
// see any data until their row in user_roles is created (this endpoint
// inserts it for them).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_INVITE_SECRET = process.env.ADMIN_INVITE_SECRET;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }
  if (!ADMIN_INVITE_SECRET) {
    console.error('Missing ADMIN_INVITE_SECRET env var — refusing to allow invites');
    return res.status(500).json({ error: 'Invite endpoint disabled (no secret configured)' });
  }

  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'staff').toLowerCase();
  const invitedBySecret = String(body.invited_by_secret || '');
  const fullName = body.full_name ? String(body.full_name).trim() : '';

  if (invitedBySecret !== ADMIN_INVITE_SECRET) {
    return res.status(401).json({ error: 'Invalid invite secret' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (role !== 'admin' && role !== 'staff') {
    return res.status(400).json({ error: 'role must be "admin" or "staff"' });
  }

  const authHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Create + invite the user via Supabase Auth Admin API
    const inviteResp = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email,
        data: fullName ? { full_name: fullName } : undefined,
      }),
    });
    const inviteData = await inviteResp.json();

    if (!inviteResp.ok) {
      // If user already exists, Supabase returns 422 'A user with this email address has already been registered'
      // — that's actually fine for our purpose. Continue to upsert the role.
      const msg = String(inviteData.msg || inviteData.message || inviteData.error_description || '').toLowerCase();
      if (!msg.includes('already')) {
        return res.status(inviteResp.status).json({
          error: 'Supabase invite failed',
          detail: inviteData,
        });
      }
    }

    // 2. Find the user's id (either from the invite response or by email lookup)
    let userId = (inviteData && inviteData.id) ||
                 (inviteData && inviteData.user && inviteData.user.id) || null;

    if (!userId) {
      // Look up by email via Admin list endpoint
      const lookupResp = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        { headers: authHeaders }
      );
      const lookupData = await lookupResp.json();
      const users = (lookupData && lookupData.users) || [];
      const found = users.find((u) => (u.email || '').toLowerCase() === email);
      if (found) userId = found.id;
    }

    if (!userId) {
      return res.status(500).json({
        error: 'Could not resolve user id after invite',
        detail: inviteData,
      });
    }

    // 3. Upsert into user_roles
    const roleResp = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ user_id: userId, role }),
    });

    if (!roleResp.ok) {
      const roleErr = await roleResp.text();
      return res.status(500).json({
        error: 'User invited but role assignment failed',
        detail: roleErr,
        next_steps: `Manually run in Supabase SQL editor:  INSERT INTO user_roles (user_id, role) VALUES ('${userId}', '${role}');`,
      });
    }

    return res.status(200).json({
      ok: true,
      user_id: userId,
      email,
      role,
      message: `Invite sent to ${email}. They'll get an email from Supabase to set their password, then can log in at /admin/.`,
    });
  } catch (err) {
    console.error('Invite error:', err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
};
