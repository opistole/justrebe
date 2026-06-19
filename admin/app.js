// admin/app.js — ReBe Admin CRM (Phase 1)
//
// Handles: login (password + magic link), session restore, role check,
// dashboard stats, logout. Uses Supabase Auth + the publishable anon key.
//
// All data reads are gated by RLS policies in Supabase that check the
// is_admin_or_staff() function — without an entry in user_roles for the
// logged-in user, every query returns zero rows.
//
// Future phases will add customer list, customer detail + notes, Kit feed.

(function () {
  'use strict';

  // === Supabase client ===========================================
  const SUPABASE_URL = 'https://erbncxjkgwqtfhulricc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_3L24YRPqcRSQNHWa8ofpSA_t0mAB6LY';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase JS SDK failed to load.');
    alert('Could not load Supabase SDK. Check internet + refresh.');
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // === DOM ============================================================
  const loginView    = document.getElementById('login-view');
  const dashView     = document.getElementById('dashboard-view');
  const loginForm    = document.getElementById('login-form');
  const emailInput   = document.getElementById('login-email');
  const passInput    = document.getElementById('login-password');
  const passLabel    = document.getElementById('password-label');
  const submitBtn    = document.getElementById('login-submit');
  const errorEl      = document.getElementById('login-error');
  const successEl    = document.getElementById('login-success');
  const magicToggle  = document.getElementById('magic-toggle');

  const userEmailEl   = document.getElementById('user-email');
  const userRoleEl    = document.getElementById('user-role');
  const welcomeNameEl = document.getElementById('welcome-name');
  const logoutBtn     = document.getElementById('logout-btn');

  const statWorkshop = document.getElementById('stat-workshop');
  const statCohort   = document.getElementById('stat-cohort');
  const statLeads    = document.getElementById('stat-leads');
  const statNotes    = document.getElementById('stat-notes');

  // === State ==========================================================
  let magicLinkMode = false;
  let currentSession = null;
  let currentRole = null;

  // === Helpers ========================================================
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
  }
  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.style.display = 'block';
    errorEl.style.display = 'none';
  }
  function clearMsgs() {
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
  }
  function setLoading(loading, label) {
    submitBtn.disabled = !!loading;
    submitBtn.textContent = loading ? (label || 'Working…') : (magicLinkMode ? 'Send magic link' : 'Sign in');
    if (loading) {
      submitBtn.innerHTML = '<span class="spinner"></span>' + (label || 'Working…');
    }
  }

  // === Magic link mode toggle =========================================
  magicToggle.addEventListener('click', () => {
    magicLinkMode = !magicLinkMode;
    passLabel.classList.toggle('hidden', magicLinkMode);
    passInput.classList.toggle('hidden', magicLinkMode);
    submitBtn.textContent = magicLinkMode ? 'Send magic link' : 'Sign in';
    magicToggle.textContent = magicLinkMode
      ? 'Use password instead'
      : 'Or send me a magic link';
    clearMsgs();
  });

  // === Login form =====================================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsgs();
    const email = (emailInput.value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email.');
      return;
    }

    if (magicLinkMode) {
      setLoading(true, 'Sending…');
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/admin/' },
      });
      setLoading(false);
      if (error) { showError(error.message); return; }
      showSuccess('Magic link sent. Check your inbox.');
      return;
    }

    const password = passInput.value || '';
    if (!password) { showError('Please enter your password.'); return; }
    setLoading(true, 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { showError(error.message); return; }
    // onAuthStateChange will handle the view swap
  });

  // === Logout =========================================================
  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  // === Auth state =====================================================
  sb.auth.onAuthStateChange(async (event, session) => {
    currentSession = session || null;
    if (session && session.user) {
      await enterDashboard(session.user);
    } else {
      enterLogin();
    }
  });

  function enterLogin() {
    currentRole = null;
    dashView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function enterDashboard(user) {
    // Confirm the user has a role in user_roles. If they don't, they're
    // either a newly invited account that hasn't been assigned a role yet
    // OR someone who got an account but isn't team. Either way: don't
    // expose the dashboard.
    const { data: roles, error } = await sb
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);

    if (error) {
      console.warn('user_roles lookup failed', error);
      // RLS could legitimately return empty for a user with no role — fall through
    }

    if (!roles || !roles.length) {
      // No role assigned — sign out and tell them to ping the admin.
      showError('Your account exists but no team role is assigned yet. Ask Osil to add you to user_roles in Supabase.');
      await sb.auth.signOut();
      return;
    }

    currentRole = roles[0].role; // 'admin' or 'staff'

    // Update header
    userEmailEl.textContent = user.email || '(no email)';
    userRoleEl.textContent  = currentRole;

    // Pull the user's display name from metadata if set; otherwise use email
    const display = (user.user_metadata && user.user_metadata.full_name)
      || (user.user_metadata && user.user_metadata.name)
      || (user.email || '').split('@')[0];
    welcomeNameEl.textContent = `Welcome, ${display}.`;

    // Swap views
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');

    // Fetch dashboard stats in parallel
    loadDashboardStats();
  }

  async function loadDashboardStats() {
    const safeCount = async (table, filter) => {
      let q = sb.from(table).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count, error } = await q;
      if (error) {
        console.warn(`count ${table} failed`, error);
        return null;
      }
      return count ?? 0;
    };

    const [workshopCount, cohortPaidCount, cohortLeadCount, notesCount] = await Promise.all([
      safeCount('contacts'),
      safeCount('refresh_signups', (q) => q.eq('status', 'enrolled')),
      safeCount('refresh_signups', (q) => q.eq('readiness', 'wants_more_info')),
      safeCount('customer_notes'),
    ]);

    statWorkshop.textContent = workshopCount ?? '—';
    statCohort.textContent   = cohortPaidCount ?? '—';
    statLeads.textContent    = cohortLeadCount ?? '—';
    statNotes.textContent    = notesCount ?? '—';
  }

  // === Init ===========================================================
  // Check existing session on page load (Supabase auto-restores via persistSession)
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) {
      enterDashboard(data.session.user);
    } else {
      enterLogin();
    }
  });

})();
