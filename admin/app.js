// admin/app.js — ReBe Admin CRM (Phase 2)
//
// Single-page app:
//   #dashboard         → stats overview
//   #customers         → unified customer list (search + filter)
//   #customer/EMAIL    → customer detail + notes
//
// All data reads are gated by RLS policies in Supabase that check
// is_admin_or_staff(). Without an entry in user_roles for the logged-in
// user, every query returns zero rows.

(function () {
  'use strict';

  // ============================================================
  // Supabase client
  // ============================================================
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

  // ============================================================
  // DOM
  // ============================================================
  const loginView  = document.getElementById('login-view');
  const appView    = document.getElementById('app-view');

  // Login
  const loginForm   = document.getElementById('login-form');
  const emailInput  = document.getElementById('login-email');
  const passInput   = document.getElementById('login-password');
  const passLabel   = document.getElementById('password-label');
  const submitBtn   = document.getElementById('login-submit');
  const errorEl     = document.getElementById('login-error');
  const successEl   = document.getElementById('login-success');
  const magicToggle = document.getElementById('magic-toggle');

  // Header
  const userEmailEl   = document.getElementById('user-email');
  const userRoleEl    = document.getElementById('user-role');
  const welcomeNameEl = document.getElementById('welcome-name');
  const logoutBtn     = document.getElementById('logout-btn');
  const navLinks      = document.querySelectorAll('#nav-links a[data-route]');

  // Views
  const viewDashboard = document.getElementById('view-dashboard');
  const viewCustomers = document.getElementById('view-customers');
  const viewCustomer  = document.getElementById('view-customer');

  // Dashboard stats
  const statWorkshop = document.getElementById('stat-workshop');
  const statCohort   = document.getElementById('stat-cohort');
  const statLeads    = document.getElementById('stat-leads');
  const statNotes    = document.getElementById('stat-notes');
  const myTasksList  = document.getElementById('my-tasks-list');

  // Invite modal
  const inviteBtn     = document.getElementById('invite-btn');
  const inviteModal   = document.getElementById('invite-modal');
  const inviteEmail   = document.getElementById('invite-email');
  const inviteName    = document.getElementById('invite-name');
  const inviteRole    = document.getElementById('invite-role');
  const inviteSubmit  = document.getElementById('invite-submit');
  const inviteCancel  = document.getElementById('invite-cancel');
  const inviteError   = document.getElementById('invite-error');
  const inviteSuccess = document.getElementById('invite-success');

  // Tasks (customer detail)
  const tasksList   = document.getElementById('tasks-list');
  const taskTitle   = document.getElementById('task-title');
  const taskDue     = document.getElementById('task-due');
  const taskAssign  = document.getElementById('task-assign');
  const taskSubmit  = document.getElementById('task-submit');
  const taskError   = document.getElementById('task-error');

  // Pilot requests
  const viewPilots       = document.getElementById('view-pilots');
  const pilotSearchInput = document.getElementById('pilot-search');
  const pilotFilterPills = document.getElementById('pilot-filter-pills');
  const pilotTable       = document.getElementById('pilot-table');
  const pilotTbody       = document.getElementById('pilot-tbody');
  const pilotLoading     = document.getElementById('pilot-list-loading');
  const pilotEmpty       = document.getElementById('pilot-empty');

  // Customer list
  const searchInput   = document.getElementById('customer-search');
  const filterPills   = document.getElementById('filter-pills');
  const customerTable = document.getElementById('customer-table');
  const customerTbody = document.getElementById('customer-tbody');
  const listLoading   = document.getElementById('customer-list-loading');
  const listEmpty     = document.getElementById('customer-empty');

  // Customer detail
  const cdLoading   = document.getElementById('customer-detail-loading');
  const cdContent   = document.getElementById('customer-detail-content');
  const cdError     = document.getElementById('customer-detail-error');
  const cdName      = document.getElementById('cd-name');
  const cdTags      = document.getElementById('cd-tags');
  const cdEmail     = document.getElementById('cd-email');
  const cdPhone     = document.getElementById('cd-phone');
  const cdFirstSeen = document.getElementById('cd-first-seen');
  const cdSlot      = document.getElementById('cd-slot');
  const cdPayment   = document.getElementById('cd-payment');
  const cdReadiness = document.getElementById('cd-readiness');
  const cdIntakeBody = document.getElementById('cd-intake-body');

  // Compose tabs
  const composeTabs = document.querySelectorAll('.compose-tab');
  const composePanels = {
    email: document.getElementById('compose-email'),
    sms:   document.getElementById('compose-sms'),
    note:  document.getElementById('compose-note'),
  };

  // Email compose
  const emailFromSelect = document.getElementById('email-from');
  const emailSubject    = document.getElementById('email-subject');
  const emailBody       = document.getElementById('email-body');
  const emailSendBtn    = document.getElementById('email-send-btn');
  const emailSendError  = document.getElementById('email-send-error');
  const emailSendSuccess= document.getElementById('email-send-success');

  // SMS compose
  const smsBody       = document.getElementById('sms-body');
  const smsSendBtn    = document.getElementById('sms-send-btn');
  const smsSendError  = document.getElementById('sms-send-error');
  const smsSendSuccess= document.getElementById('sms-send-success');
  const smsCharCount  = document.getElementById('sms-char-count');
  const smsProvider   = document.getElementById('sms-provider');
  const smsToDisplay  = document.getElementById('sms-to-display');
  const emailToDisplay= document.getElementById('email-to-display');

  // Note compose
  const noteInput   = document.getElementById('note-input');
  const noteSubmit  = document.getElementById('note-submit');
  const noteError   = document.getElementById('note-error');

  // Activity feed
  const activityList = document.getElementById('activity-list');

  // ============================================================
  // State
  // ============================================================
  let magicLinkMode = false;
  let currentUser = null;
  let currentRole = null;
  let allCustomers = []; // cached list, refreshed on customers view enter
  let currentFilter = 'all';
  let currentSlotFilter = 'all';   // 'all' | '11am' | '8pm'
  let currentSort = 'signed_up';   // 'name' | 'signed_up' | 'notes'
  let currentSortDir = 'desc';     // 'asc' | 'desc'
  let currentSearch = '';

  // ============================================================
  // Helpers
  // ============================================================
  function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }
  function hideMsg(el) { el.style.display = 'none'; el.textContent = ''; }
  function fmtDate(s) {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return s; }
  }
  function fmtDateTime(s) {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return s; }
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ============================================================
  // Auth — login form, logout, session restore
  // ============================================================
  magicToggle.addEventListener('click', () => {
    magicLinkMode = !magicLinkMode;
    passLabel.classList.toggle('hidden', magicLinkMode);
    passInput.classList.toggle('hidden', magicLinkMode);
    submitBtn.textContent = magicLinkMode ? 'Send magic link' : 'Sign in';
    magicToggle.textContent = magicLinkMode ? 'Use password instead' : 'Or send me a magic link';
    hideMsg(errorEl); hideMsg(successEl);
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(errorEl); hideMsg(successEl);

    const email = (emailInput.value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(errorEl, 'Please enter a valid email.'); return;
    }
    submitBtn.disabled = true;

    if (magicLinkMode) {
      submitBtn.textContent = 'Sending…';
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/admin/' },
      });
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send magic link';
      if (error) { showError(errorEl, error.message); return; }
      showError(successEl, 'Magic link sent. Check your inbox.');
      return;
    }

    const password = passInput.value || '';
    if (!password) { showError(errorEl, 'Please enter your password.'); submitBtn.disabled = false; return; }
    submitBtn.textContent = 'Signing in…';

    // Reset auth state cleanly before signing in — fixes spinner-hang caused
    // by stale tokens or in-flight token-refresh cycles fighting with the
    // new sign-in. signOut() clears both internal state and localStorage;
    // race against a short timeout in case signOut hangs.
    try {
      await Promise.race([
        sb.auth.signOut().catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch (_) {}
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.startsWith('supabase.'))) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

    // Sign in with a hard 15s timeout — if the network call hangs, fail
    // visibly instead of spinning forever.
    let result;
    try {
      result = await Promise.race([
        sb.auth.signInWithPassword({ email, password }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sign-in timed out (15s). Refresh the page and try again — if it keeps happening, your network or Supabase may be having issues.')), 15000)
        ),
      ]);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      showError(errorEl, err.message);
      return;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    if (result && result.error) {
      showError(errorEl, result.error.message);
      return;
    }
    // Fallback: explicitly enter app in case onAuthStateChange doesn't fire
    // fast enough (rare but happens with some Supabase client states).
    if (result && result.data && result.data.user) {
      enterApp(result.data.user);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.hash = '';
  });

  // Don't await enterApp() here — Supabase JS may block signInWithPassword
  // resolution on this handler completing. We fire-and-forget instead so the
  // sign-in Promise resolves promptly even if role-lookup or rendering hangs.
  sb.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      enterApp(session.user).catch((err) => console.warn('enterApp failed in auth listener:', err));
    } else {
      enterLogin();
    }
  });

  function enterLogin() {
    currentUser = null;
    currentRole = null;
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function enterApp(user) {
    // Idempotency: if we already loaded this user, skip the second pass
    // (init getSession + onAuthStateChange both fire on page load).
    if (currentUser && currentUser.id === user.id && currentRole) {
      return;
    }

    const { data: roles, error: rolesError } = await sb
      .from('user_roles').select('role').eq('user_id', user.id).limit(1);

    if (rolesError) {
      // Network / RLS hiccup — show a soft error but DON'T sign out.
      // The session stays in localStorage; refresh can retry.
      console.warn('Role lookup failed:', rolesError);
      enterLogin();
      showError(errorEl, 'Couldn\'t verify your role (network glitch). Refresh and try again.');
      return;
    }
    if (!roles || !roles.length) {
      // No role assigned — show login view with explanation. Don't signOut;
      // the user might just need an admin to add their row.
      enterLogin();
      showError(errorEl, 'Your account exists but no team role is assigned yet. Ask Osil to add you.');
      return;
    }

    currentUser = user;
    currentRole = roles[0].role;

    userEmailEl.textContent = user.email || '(no email)';
    userRoleEl.textContent  = currentRole;

    // Friendly first-name greeting by email local-part. Falls back to
    // Supabase user_metadata.full_name or the email's local-part.
    const local = (user.email || '').toLowerCase().split('@')[0];
    const firstNameMap = {
      osilpistole: 'Osil',
      'o.pistole': 'Osil',
      opistole:    'Osil',
      'a.logan':   'Ashley',
      alogan:      'Ashley',
      'e.good':    'Elizabeth',
      egood:       'Elizabeth',
    };
    const display = firstNameMap[local]
      || (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
      || local;
    welcomeNameEl.textContent = `Welcome, ${display}.`;

    // Show invite button only to admins
    if (inviteBtn) {
      if (currentRole === 'admin') inviteBtn.classList.remove('hidden');
      else inviteBtn.classList.add('hidden');
    }

    // Render the topbar avatar (uses user_metadata.avatar_url if set)
    renderTopbarAvatar();

    loginView.classList.add('hidden');
    appView.classList.remove('hidden');

    routeFromHash();
  }

  // ============================================================
  // Router — hash-based
  // ============================================================
  window.addEventListener('hashchange', routeFromHash);

  function routeFromHash() {
    if (!currentUser) return; // Auth state will trigger when ready

    const hash = (window.location.hash || '').replace(/^#/, '');
    // Support ?filter=… on customers route (e.g. #customers?filter=workshop)
    const [pathPart, queryPart] = hash.split('?');
    const [route, ...rest] = pathPart.split('/');
    const param = rest.join('/');

    const queryParams = {};
    if (queryPart) {
      queryPart.split('&').forEach((p) => {
        const [k, v] = p.split('=');
        if (k) queryParams[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }

    // Hide all views
    viewDashboard.classList.add('hidden');
    viewCustomers.classList.add('hidden');
    viewCustomer.classList.add('hidden');
    if (viewPilots) viewPilots.classList.add('hidden');
    ['view-team', 'view-account', 'view-one-to-one', 'view-community'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Highlight active nav
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-route') === (route || 'dashboard'));
    });

    if (route === 'customers') {
      sessionStorage.setItem('lastListRoute', '#customers' + (queryParams.filter ? `?filter=${queryParams.filter}` : ''));
      viewCustomers.classList.remove('hidden');
      currentFilter = queryParams.filter || 'all';
      document.querySelectorAll('#view-customers .filter-pill').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
      });
      loadCustomerList();
    } else if (route === 'pilots') {
      if (viewPilots) viewPilots.classList.remove('hidden');
      loadPilotList();
    } else if (route === 'cohorts') {
      sessionStorage.setItem('lastListRoute', '#cohorts');
      viewCustomers.classList.remove('hidden');
      currentFilter = queryParams.filter || 'cohort';
      currentSlotFilter = queryParams.slot || 'all';
      document.querySelectorAll('#view-customers .filter-pill').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
      });
      document.querySelectorAll('#slot-pills .filter-pill').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-slot') === currentSlotFilter);
      });
      loadCustomerList();
    } else if (route === 'popups') {
      sessionStorage.setItem('lastListRoute', '#popups');
      viewCustomers.classList.remove('hidden');
      currentFilter = 'workshop';
      currentSlotFilter = 'all';
      document.querySelectorAll('#view-customers .filter-pill').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-filter') === 'workshop');
      });
      loadCustomerList();
    } else if (route === 'team') {
      const el = document.getElementById('view-team');
      if (el) el.classList.remove('hidden');
      loadTeamDirectory();
    } else if (route === 'account') {
      const el = document.getElementById('view-account');
      if (el) el.classList.remove('hidden');
      loadAccount();
    } else if (route === 'one-to-one' || route === 'community') {
      const el = document.getElementById('view-' + route);
      if (el) el.classList.remove('hidden');
    } else if (route === 'customer' && param) {
      viewCustomer.classList.remove('hidden');
      loadCustomerDetail(decodeURIComponent(param));
    } else {
      // default → dashboard
      viewDashboard.classList.remove('hidden');
      loadDashboardStats();
      if (!route) navLinks[0].classList.add('active'); // first nav
    }
  }

  // ============================================================
  // Dashboard stats
  // ============================================================
  async function loadDashboardStats() {
    const safeCount = async (table, filter) => {
      let q = sb.from(table).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count, error } = await q;
      if (error) { console.warn(`count ${table} failed`, error); return null; }
      return count ?? 0;
    };

    const [w, p, l, n] = await Promise.all([
      safeCount('contacts'),
      // Match the list-view 'Paid only' filter exactly: only count rows with
      // a real Stripe payment recorded.
      safeCount('refresh_signups', (q) => q.eq('status', 'enrolled').gt('paid_amount_cents', 0)),
      safeCount('refresh_signups', (q) => q.eq('readiness', 'wants_more_info')),
      safeCount('customer_notes'),
    ]);

    statWorkshop.textContent = w ?? '—';
    statCohort.textContent   = p ?? '—';
    statLeads.textContent    = l ?? '—';
    statNotes.textContent    = n ?? '—';

    // My tasks (open, assigned to me OR unassigned)
    loadMyTasks();
  }

  async function loadMyTasks() {
    if (!myTasksList || !currentUser) return;
    // Open tasks where assigned_to is me OR null (unassigned — anyone can pick up)
    const { data, error } = await sb.from('customer_tasks')
      .select('id, customer_email, title, due_date, assigned_to, assigned_to_email')
      .eq('status', 'open')
      .or(`assigned_to.eq.${currentUser.id},assigned_to.is.null`)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) {
      console.warn('My tasks fetch failed:', error);
      myTasksList.innerHTML = '<div class="tasks-empty">Couldn\'t load tasks.</div>';
      return;
    }
    if (!data || !data.length) {
      myTasksList.innerHTML = '<div class="tasks-empty">No open tasks. Nice.</div>';
      return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    myTasksList.innerHTML = data.map((t) => {
      const isOverdue = t.due_date && new Date(t.due_date) < today;
      const isToday   = t.due_date && new Date(t.due_date).toDateString() === today.toDateString();
      const cls = ['task-item'];
      if (isOverdue) cls.push('overdue');
      else if (isToday) cls.push('due-soon');
      const dueCls = isOverdue ? 'overdue' : isToday ? 'today' : '';
      const dueLabel = t.due_date ? (isOverdue ? `Overdue · ${fmtDate(t.due_date)}` : isToday ? 'Today' : fmtDate(t.due_date)) : 'No due date';
      const customerLabel = t.customer_email || '(no customer)';
      return `
        <div class="${cls.join(' ')}">
          <input type="checkbox" class="task-check" data-dash-toggle-task="${escapeHtml(t.id)}">
          <div class="task-body">
            <p class="task-title">${escapeHtml(t.title)}</p>
            <div class="task-meta">
              <span class="task-due ${dueCls}">${escapeHtml(dueLabel)}</span>
              <span>· <a href="#customer/${escapeHtml(encodeURIComponent(customerLabel))}" class="task-customer">${escapeHtml(customerLabel)}</a></span>
              ${t.assigned_to ? '' : '<span>· <em>unassigned</em></span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Dashboard task checkbox handler (complete from the dashboard)
  if (myTasksList) {
    myTasksList.addEventListener('change', async (e) => {
      const cb = e.target.closest('[data-dash-toggle-task]');
      if (!cb || !cb.checked) return;
      const taskId = cb.getAttribute('data-dash-toggle-task');
      const { error } = await sb.from('customer_tasks').update({ status: 'completed' }).eq('id', taskId);
      if (error) { alert('Couldn\'t update: ' + error.message); cb.checked = false; return; }
      loadMyTasks();
    });
  }

  // ============================================================
  // Invite teammate (admin-only)
  // ============================================================
  function openInviteModal() {
    if (!inviteModal) return;
    hideMsg(inviteError); hideMsg(inviteSuccess);
    inviteEmail.value = '';
    inviteName.value  = '';
    inviteRole.value  = 'staff';
    inviteModal.classList.add('open');
    setTimeout(() => inviteEmail.focus(), 50);
  }
  function closeInviteModal() {
    if (inviteModal) inviteModal.classList.remove('open');
  }
  if (inviteBtn)    inviteBtn.addEventListener('click', openInviteModal);
  if (inviteCancel) inviteCancel.addEventListener('click', closeInviteModal);
  if (inviteModal)  inviteModal.addEventListener('click', (e) => {
    if (e.target === inviteModal) closeInviteModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inviteModal && inviteModal.classList.contains('open')) {
      closeInviteModal();
    }
  });

  if (inviteSubmit) {
    inviteSubmit.addEventListener('click', async () => {
      hideMsg(inviteError); hideMsg(inviteSuccess);
      const email = (inviteEmail.value || '').trim().toLowerCase();
      const fullName = (inviteName.value || '').trim();
      const role = inviteRole.value || 'staff';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError(inviteError, 'Enter a valid email.'); return;
      }

      const { data: { session } } = await sb.auth.getSession();
      if (!session) { showError(inviteError, 'Not logged in.'); return; }

      inviteSubmit.disabled = true;
      inviteSubmit.textContent = 'Sending…';

      try {
        const resp = await fetch('/api/admin/invite-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email, full_name: fullName, role }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        const msg = data.message ||
          `✓ Invited ${email} as ${role}. They'll get an email to set their password.`;
        showError(inviteSuccess, '✓ ' + msg);
        inviteEmail.value = '';
        inviteName.value = '';
        setTimeout(closeInviteModal, 2500);
      } catch (err) {
        showError(inviteError, `Couldn't invite: ${err.message}`);
      } finally {
        inviteSubmit.disabled = false;
        inviteSubmit.textContent = 'Send invite';
      }
    });
  }

  // ============================================================
  // Customer list — fetch contacts + refresh_signups, merge by email
  // ============================================================
  async function loadCustomerList() {
    listLoading.classList.remove('hidden');
    customerTable.classList.add('hidden');
    listEmpty.classList.add('hidden');

    // Pull both sources in parallel
    const [contactsRes, cohortRes, notesRes] = await Promise.all([
      sb.from('contacts')
        .select('id, first_name, last_name, email, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      sb.from('refresh_signups')
        .select('id, full_name, email, phone, status, readiness, preferred_group_time, seat_type, intake_completed, area_needing_refresh, reason_for_interest, previous_rebe_experience, paid_amount_cents, paid_at, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      sb.from('customer_notes')
        .select('customer_email')
        .limit(2000),
    ]);

    if (contactsRes.error) console.warn('contacts fetch error', contactsRes.error);
    if (cohortRes.error)   console.warn('refresh_signups fetch error', cohortRes.error);
    if (notesRes.error)    console.warn('notes fetch error', notesRes.error);

    // Count notes per email
    const notesByEmail = {};
    (notesRes.data || []).forEach((n) => {
      const e = (n.customer_email || '').toLowerCase();
      if (e) notesByEmail[e] = (notesByEmail[e] || 0) + 1;
    });

    // Merge by email
    const merged = new Map();

    (contactsRes.data || []).forEach((c) => {
      const email = (c.email || '').toLowerCase().trim();
      if (!email) return;
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(no name)';
      const existing = merged.get(email) || makeCustomer(email);
      existing.name = existing.name || name;
      existing.phone = existing.phone || c.phone;
      existing.sources.add('workshop');
      existing.firstSeen = earliest(existing.firstSeen, c.created_at);
      merged.set(email, existing);
    });

    (cohortRes.data || []).forEach((s) => {
      const email = (s.email || '').toLowerCase().trim();
      if (!email) return;
      const name = (s.full_name || '').trim() || '(no name)';
      const existing = merged.get(email) || makeCustomer(email);
      existing.name = existing.name || name;
      existing.phone = existing.phone || s.phone;
      existing.firstSeen = earliest(existing.firstSeen, s.created_at);

      const paidAmount = s.paid_amount_cents || 0;
      const seat = (s.seat_type || '').toLowerCase();
      const readiness = s.readiness || '';
      const status = s.status || '';
      // Intake-done logic: explicit column wins. If not set yet, fall back
      // to inference. Stripe Checkout collects intake-style custom fields
      // as part of the payment flow — so anyone with a stripe_session_id
      // has completed intake even though the values weren't persisted
      // into the dedicated columns.
      const hasIntakeContent = !!(
        paidAmount > 0 // Stripe-paid customers had to fill the Checkout custom fields
        || ['attendee', 'facilitator', 'comped', 'other'].includes(seat)
        || (s.area_needing_refresh && String(s.area_needing_refresh).trim())
        || (s.reason_for_interest && String(s.reason_for_interest).trim())
        || (s.previous_rebe_experience !== null && s.previous_rebe_experience !== undefined && s.previous_rebe_experience !== false && String(s.previous_rebe_experience).trim())
      );
      const intakeDone = s.intake_completed === true
        ? true
        : s.intake_completed === false
          ? false
          : hasIntakeContent;

      // 'paid' = actually paid money
      if (paidAmount > 0) existing.sources.add('paid');
      // Specific intake categories
      if (seat === 'attendee')    existing.sources.add('attendee');
      if (seat === 'facilitator') existing.sources.add('facilitator');
      if (seat === 'comped')      existing.sources.add('comped');

      // 'cohort' = in the cohort. Trust status='enrolled' as the primary
      // signal (Stripe webhook + intake form both set it). Also include
      // paid customers + intake-done customers as a safety net for any
      // rows where status didn't get set.
      const isLeadOrWaitlist = (readiness === 'wants_more_info' || readiness === 'waitlist');
      if ((status === 'enrolled' || paidAmount > 0 || intakeDone) && !isLeadOrWaitlist) {
        existing.sources.add('cohort');
      }

      if (readiness === 'wants_more_info') existing.sources.add('lead');
      if (readiness === 'waitlist')        existing.sources.add('waitlist');

      existing.preferredSlot = existing.preferredSlot || s.preferred_group_time;
      existing.intakeDone = existing.intakeDone || intakeDone;
      existing.seatType = existing.seatType || seat;
      existing.paidAt = existing.paidAt || s.paid_at;
      merged.set(email, existing);
    });

    // Apply notes counts
    merged.forEach((c, email) => {
      c.noteCount = notesByEmail[email] || 0;
    });

    allCustomers = Array.from(merged.values())
      .sort((a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''));

    listLoading.classList.add('hidden');

    // Show a banner if either source hit the 500-row cap so we don't silently
    // lose customers as the business grows.
    const limitHit = (contactsRes.data || []).length >= 500 || (cohortRes.data || []).length >= 500;
    let banner = document.getElementById('customer-limit-banner');
    if (limitHit) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'customer-limit-banner';
        banner.style.cssText = 'background:var(--gold-wash);border:1px solid #ead7a8;color:var(--gold-ink);padding:10px 14px;border-radius:10px;font-size:13px;margin:0 0 12px;font-weight:600';
        banner.textContent = 'Showing up to 500 customers per source — use search to find specific people, or ask for the cap to be raised.';
        const toolbar = document.querySelector('#view-customers .toolbar');
        if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(banner, toolbar);
      }
    } else if (banner) {
      banner.remove();
    }

    renderCustomerList();
  }

  function makeCustomer(email) {
    return {
      email,
      name: '',
      phone: '',
      sources: new Set(),
      firstSeen: null,
      preferredSlot: null,
      paidAt: null,
      noteCount: 0,
      intakeDone: false,
      seatType: '',
    };
  }

  function earliest(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  function renderCustomerList() {
    const q = currentSearch.toLowerCase().trim();
    const filtered = allCustomers.filter((c) => {
      // Search filter
      if (q) {
        const blob = `${c.name} ${c.email} ${c.phone || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      // Source filter
      if (currentFilter === 'notes') {
        if (!c.noteCount || c.noteCount <= 0) return false;
      } else if (currentFilter !== 'all') {
        if (!c.sources.has(currentFilter)) return false;
      }
      // Slot sub-filter (only meaningful for cohort signups)
      if (currentSlotFilter && currentSlotFilter !== 'all') {
        const slot = (c.preferredSlot || '').toLowerCase();
        if (currentSlotFilter === '11am' && !slot.includes('11')) return false;
        if (currentSlotFilter === '8pm'  && !slot.includes('8'))  return false;
      }
      return true;
    });

    // Apply sort if set
    if (currentSort) {
      const dir = currentSortDir === 'desc' ? -1 : 1;
      filtered.sort((a, b) => {
        let av, bv;
        if (currentSort === 'name') {
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
        } else if (currentSort === 'signed_up') {
          av = a.firstSeen || '';
          bv = b.firstSeen || '';
        } else if (currentSort === 'notes') {
          av = a.noteCount || 0;
          bv = b.noteCount || 0;
        } else {
          return 0;
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return  1 * dir;
        return 0;
      });
    }

    if (!filtered.length) {
      customerTable.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      return;
    }

    listEmpty.classList.add('hidden');
    customerTable.classList.remove('hidden');

    // Show the sort arrow for the active column
    document.querySelectorAll('#customer-table th.sortable').forEach((h) => {
      const col = h.getAttribute('data-sort');
      const arrow = h.querySelector('.sort-arrow');
      if (col === currentSort) {
        h.classList.add('sort-active');
        if (arrow) arrow.textContent = currentSortDir === 'asc' ? '▲' : '▼';
      } else {
        h.classList.remove('sort-active');
        if (arrow) arrow.textContent = '';
      }
    });

    customerTbody.innerHTML = filtered.map((c) => {
      const tagLabel = (s) => {
        if (s === 'paid')        return 'Paid';
        if (s === 'lead')        return 'Lead';
        if (s === 'workshop')    return 'Workshop';
        if (s === 'waitlist')    return 'Waitlist';
        if (s === 'attendee')    return 'Attendee';
        if (s === 'facilitator') return 'Facilitator';
        if (s === 'comped')      return 'Comped';
        if (s === 'cohort')      return null; // hide the umbrella tag — too generic
        return s;
      };
      const tags = Array.from(c.sources)
        .map(tagLabel)
        .filter(Boolean)
        .map((label, i) => {
          const sourceKey = Array.from(c.sources).filter((s) => tagLabel(s) === label)[0] || 'paid';
          return `<span class="source-tag ${escapeHtml(sourceKey)}">${escapeHtml(label)}</span>`;
        })
        .join('');

      // Slot badge (visible whenever the person has a slot — cohort signups)
      const slotLower = (c.preferredSlot || '').toLowerCase();
      const slotBadge = slotLower.includes('11')
        ? `<span class="source-tag" style="background:#FBF4E4;color:#B07D14;border:1px solid #ead7a8">11 AM ET</span>`
        : slotLower.includes('8')
          ? `<span class="source-tag" style="background:#E9EDFB;color:#252C5C;border:1px solid #C8D0EE">8 PM ET</span>`
          : '';

      // Intake-form indicator
      const intakeBadge = c.sources.has('cohort')
        ? (c.intakeDone
            ? `<span class="source-tag" style="background:var(--green-wash);color:var(--green-deep);border:1px solid #BFE3BF" title="Intake form completed">✓ Intake</span>`
            : `<span class="source-tag" style="background:var(--coral-wash);color:var(--coral-ink);border:1px solid var(--coral-border)" title="Intake form not yet completed">Needs intake</span>`)
        : '';

      const phone = c.phone ? `<div class="phone">${escapeHtml(c.phone)}</div>` : '';
      return `<tr data-email="${escapeHtml(c.email)}">
        <td><div class="name">${escapeHtml(c.name || '(no name)')}</div></td>
        <td><div class="email">${escapeHtml(c.email)}</div>${phone}</td>
        <td>${tags}${slotBadge}${intakeBadge || '—'}</td>
        <td>${escapeHtml(fmtDate(c.firstSeen))}</td>
        <td>${c.noteCount ? `${c.noteCount} 📝` : '—'}</td>
      </tr>`;
    }).join('');

    // Attach click handlers
    customerTbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        const email = tr.getAttribute('data-email');
        window.location.hash = '#customer/' + encodeURIComponent(email);
      });
    });
  }

  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderCustomerList();
  });

  filterPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    filterPills.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderCustomerList();
  });

  // Mobile sidebar hamburger
  const mobileMenuBtn   = document.getElementById('mobile-menu-btn');
  const sidebarEl       = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  function openSidebar() {
    if (sidebarEl)       sidebarEl.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('show');
    if (mobileMenuBtn)   mobileMenuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    if (sidebarEl)       sidebarEl.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('show');
    if (mobileMenuBtn)   mobileMenuBtn.setAttribute('aria-expanded', 'false');
  }
  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
  // Close on any nav link click (so mobile nav doesn't stay open after navigation)
  if (sidebarEl) {
    sidebarEl.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeSidebar();
    });
  }

  // Global search in the topbar — searches across customer list, jumps to
  // /admin/#customers with the query applied. Cmd+K focuses it.
  const globalSearch = document.getElementById('global-search');
  if (globalSearch) {
    globalSearch.addEventListener('input', () => {
      const q = globalSearch.value || '';
      if (window.location.hash.split('?')[0] !== '#customers') {
        window.location.hash = '#customers';
      }
      currentSearch = q;
      if (searchInput) searchInput.value = q;
      renderCustomerList();
    });
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { globalSearch.value = ''; globalSearch.dispatchEvent(new Event('input')); globalSearch.blur(); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        globalSearch.focus();
        globalSearch.select();
      }
    });
  }

  // Slot pill (11 AM / 8 PM / Any) — sub-filter on top of the source filter
  const slotPills = document.getElementById('slot-pills');
  if (slotPills) {
    slotPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      slotPills.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentSlotFilter = btn.getAttribute('data-slot');
      renderCustomerList();
    });
  }

  // Sortable column headers — click to toggle asc/desc on the chosen column
  document.querySelectorAll('#customer-table th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSort === col) {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = col;
        currentSortDir = 'asc';
      }
      // Update arrow indicators
      document.querySelectorAll('#customer-table th.sortable').forEach((h) => {
        const arrow = h.querySelector('.sort-arrow');
        if (h === th) {
          h.classList.add('sort-active');
          if (arrow) arrow.textContent = currentSortDir === 'asc' ? '▲' : '▼';
        } else {
          h.classList.remove('sort-active');
          if (arrow) arrow.textContent = '';
        }
      });
      renderCustomerList();
    });
  });

  // ============================================================
  // Customer detail
  // ============================================================
  let currentDetailEmail = null;
  let currentDetailPhone = null;

  function allowedSendersForUser(email) {
    const shared = { email: 'refresh@justrebe.com', label: 'ReBe ReFresh' };
    const local = (email || '').toLowerCase().split('@')[0];
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

  // Tab switching
  composeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-compose');
      composeTabs.forEach((t) => t.classList.toggle('active', t === tab));
      Object.entries(composePanels).forEach(([k, p]) => {
        if (p) p.classList.toggle('hidden', k !== target);
      });
    });
  });

  // SMS char counter
  if (smsBody && smsCharCount) {
    smsBody.addEventListener('input', () => {
      const n = smsBody.value.length;
      const segments = Math.max(1, Math.ceil(n / 160));
      smsCharCount.textContent = `${n} chars · ${segments} segment${segments > 1 ? 's' : ''}`;
      smsCharCount.classList.toggle('over', n > 320);
    });
  }

  async function loadCustomerDetail(email) {
    currentDetailEmail = email.toLowerCase().trim();
    currentDetailPhone = null;
    cdLoading.classList.remove('hidden');
    cdContent.classList.add('hidden');
    cdError.classList.add('hidden');

    const [contactRes, cohortRes, notesRes, activitiesRes, tasksRes, kitEventsRes] = await Promise.all([
      sb.from('contacts')
        .select('first_name, last_name, email, phone, sms_consent, marketing_consent, notes, created_at')
        .ilike('email', currentDetailEmail).limit(1),
      sb.from('refresh_signups')
        .select('full_name, email, phone, status, readiness, preferred_group_time, audience_type, group_type, seat_type, intake_completed, area_needing_refresh, reason_for_interest, previous_rebe_experience, organization_name, role_title, notes, paid_amount_cents, paid_at, stripe_session_id, created_at')
        .ilike('email', currentDetailEmail).order('created_at', { ascending: false }).limit(1),
      sb.from('customer_notes')
        .select('id, body, author_id, author_email, created_at, updated_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(200),
      sb.from('customer_activities')
        .select('id, type, body, subject, from_addr, to_addr, actor_email, status, error_message, metadata, created_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(200),
      sb.from('customer_tasks')
        .select('id, title, description, due_date, status, assigned_to, assigned_to_email, created_by, created_by_email, created_at, completed_at')
        .ilike('customer_email', currentDetailEmail)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200),
      sb.from('kit_events')
        .select('id, event_type, tag_name, link_url, form_id, created_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(100),
    ]);

    cdLoading.classList.add('hidden');

    const contact    = (contactRes.data || [])[0] || null;
    const cohort     = (cohortRes.data || [])[0] || null;
    const notes      = notesRes.data || [];
    const activities = activitiesRes.data || [];
    const tasks      = tasksRes.data || [];
    const kitEvents  = kitEventsRes.data || [];

    if (!contact && !cohort) {
      cdError.classList.remove('hidden');
      return;
    }
    cdContent.classList.remove('hidden');

    // Rewrite the back link to point to wherever the user came from
    const backLink = document.querySelector('#view-customer .back-link');
    if (backLink) {
      const last = sessionStorage.getItem('lastListRoute') || '#customers';
      backLink.setAttribute('href', last);
      backLink.textContent =
        last.startsWith('#cohorts') ? '← All cohort' :
        last.startsWith('#popups')  ? '← Pop-Ups' :
        last.startsWith('#pilots')  ? '← Pilot requests' :
                                      '← All customers';
    }

    // Cache phone for SMS composer
    currentDetailPhone = (cohort && cohort.phone) || (contact && contact.phone) || null;

    // Populate sender picker for email composer
    if (emailFromSelect && currentUser) {
      const senders = allowedSendersForUser(currentUser.email);
      emailFromSelect.innerHTML = senders.map((s) =>
        `<option value="${escapeHtml(s.email)}">${escapeHtml(s.label)} &lt;${escapeHtml(s.email)}&gt;</option>`
      ).join('');
    }

    // Show recipient clearly in compose panels so we never confuse who we're
    // texting/emailing
    const recipientName = (cohort && cohort.full_name)
      || (contact && [contact.first_name, contact.last_name].filter(Boolean).join(' '))
      || '';
    if (emailToDisplay) {
      emailToDisplay.value = recipientName
        ? `${recipientName} <${currentDetailEmail}>`
        : currentDetailEmail;
    }
    if (smsToDisplay) {
      const phoneDisplay = currentDetailPhone || '(no phone on file)';
      smsToDisplay.value = recipientName
        ? `${recipientName} · ${phoneDisplay}`
        : phoneDisplay;
    }

    // Profile
    const name = (cohort && cohort.full_name)
      || (contact && [contact.first_name, contact.last_name].filter(Boolean).join(' '))
      || currentDetailEmail;
    cdName.textContent = name;
    cdEmail.innerHTML = `<a href="mailto:${escapeHtml(currentDetailEmail)}">${escapeHtml(currentDetailEmail)}</a>`;
    const phone = (cohort && cohort.phone) || (contact && contact.phone) || '';
    cdPhone.innerHTML = phone
      ? `<a href="sms:${escapeHtml(phone.replace(/\D/g,''))}">${escapeHtml(phone)}</a>`
      : '<span class="muted">Not on file</span>';

    const firstSeen = earliest(contact && contact.created_at, cohort && cohort.created_at);
    cdFirstSeen.textContent = firstSeen ? fmtDate(firstSeen) : '—';

    cdSlot.textContent = (cohort && cohort.preferred_group_time) || '—';

    if (cohort && cohort.paid_at) {
      const amt = cohort.paid_amount_cents ? `$${(cohort.paid_amount_cents/100).toFixed(2)}` : 'Paid';
      cdPayment.textContent = `${amt} · ${fmtDate(cohort.paid_at)}`;
    } else {
      cdPayment.innerHTML = '<span class="muted">No payment</span>';
    }

    cdReadiness.textContent = (cohort && cohort.readiness) || '—';

    // Source + slot + intake tags. Distinguish paid (money received) from
    // "enrolled but unpaid" (comped/attendee/facilitator) so the lead override
    // doesn't double-tag people.
    const tags = [];
    if (contact) tags.push({ label: 'Workshop', cls: 'workshop' });
    const paidAmountD = (cohort && cohort.paid_amount_cents) || 0;
    const seatD = ((cohort && cohort.seat_type) || '').toLowerCase();
    if (paidAmountD > 0) {
      tags.push({ label: 'Paid cohort', cls: 'paid' });
    } else if (cohort && cohort.status === 'enrolled' && ['attendee', 'facilitator', 'comped', 'other'].includes(seatD)) {
      tags.push({ label: seatD === 'facilitator' ? 'Facilitator' : seatD === 'comped' ? 'Comped' : 'Attendee', cls: 'paid' });
    }
    if (cohort && cohort.readiness === 'wants_more_info') tags.push({ label: 'Cohort lead', cls: 'lead' });
    if (cohort && cohort.readiness === 'waitlist') tags.push({ label: 'Waitlist', cls: 'waitlist' });

    // Slot tag (11 AM / 8 PM if known)
    const slotLowerD = (cohort && cohort.preferred_group_time || '').toLowerCase();
    let slotTagHtml = '';
    if (slotLowerD.includes('11')) {
      slotTagHtml = `<span class="source-tag" style="background:#FBF4E4;color:#B07D14;border:1px solid #ead7a8">11 AM ET</span>`;
    } else if (slotLowerD.includes('8')) {
      slotTagHtml = `<span class="source-tag" style="background:#E9EDFB;color:#252C5C;border:1px solid #C8D0EE">8 PM ET</span>`;
    }

    // Intake-status tag — uses the same logic as the list view
    let intakeTagHtml = '';
    if (cohort && cohort.status === 'enrolled') {
      const seatD = (cohort.seat_type || '').toLowerCase();
      const paidD = cohort.paid_amount_cents || 0;
      const hasContent = paidD > 0
        || ['attendee', 'facilitator', 'comped', 'other'].includes(seatD)
        || (cohort.area_needing_refresh && String(cohort.area_needing_refresh).trim())
        || (cohort.reason_for_interest && String(cohort.reason_for_interest).trim())
        || (cohort.previous_rebe_experience !== null && cohort.previous_rebe_experience !== undefined && cohort.previous_rebe_experience !== false && String(cohort.previous_rebe_experience).trim());
      const inferredDone = cohort.intake_completed === true
        ? true
        : cohort.intake_completed === false ? false : !!hasContent;
      intakeTagHtml = inferredDone
        ? `<span class="source-tag" style="background:var(--green-wash);color:var(--green-deep);border:1px solid #BFE3BF">✓ Intake</span>`
        : `<span class="source-tag" style="background:var(--coral-wash);color:var(--coral-ink);border:1px solid var(--coral-border)">Needs intake</span>`;
    }

    cdTags.innerHTML = (tags.length
      ? tags.map((t) => `<span class="source-tag ${t.cls}">${escapeHtml(t.label)}</span>`).join('')
      : '') + slotTagHtml + intakeTagHtml;

    // Intake / context
    const intakeBits = [];
    if (cohort) {
      if (cohort.audience_type)   intakeBits.push(['Audience', cohort.audience_type]);
      if (cohort.group_type)      intakeBits.push(['Group type', cohort.group_type]);
      if (cohort.area_needing_refresh) intakeBits.push(['Area needing refresh', cohort.area_needing_refresh]);
      if (cohort.reason_for_interest)  intakeBits.push(['Reason for interest', cohort.reason_for_interest]);
      if (cohort.previous_rebe_experience) intakeBits.push(['Previous ReBe experience', cohort.previous_rebe_experience]);
      if (cohort.organization_name) intakeBits.push(['Organization', cohort.organization_name]);
      if (cohort.role_title)        intakeBits.push(['Role/title', cohort.role_title]);
      if (cohort.notes)             intakeBits.push(['Cohort signup notes', cohort.notes]);
    }
    if (contact && contact.notes) intakeBits.push(['Contact notes', contact.notes]);
    if (contact) {
      intakeBits.push(['SMS consent', contact.sms_consent ? 'Yes' : 'No']);
      intakeBits.push(['Marketing consent', contact.marketing_consent ? 'Yes' : 'No']);
    }
    if (cohort && cohort.stripe_session_id) {
      intakeBits.push(['Stripe session', cohort.stripe_session_id.slice(0, 18) + '…']);
    }

    if (intakeBits.length) {
      cdIntakeBody.innerHTML = intakeBits.map(([k, v]) =>
        `<div class="pf-row"><span class="pf-label">${escapeHtml(k)}</span><span class="pf-value">${escapeHtml(String(v))}</span></div>`
      ).join('');
    } else {
      cdIntakeBody.innerHTML = '<p class="pf-value muted">No intake data on file.</p>';
    }

    // Smart-default SMS provider: look at the most recent SMS activity
    // (either sent or received). If its provider was Twilio, default to
    // Twilio so replies continue on the same thread. Otherwise default
    // OpenPhone (the personal/CRM standard).
    if (smsProvider) {
      const smsItems = (activities || []).filter((a) =>
        a.type === 'sms_received' || a.type === 'sms_sent'
      );
      const mostRecentSms = smsItems[0]; // already ordered desc
      const lastProvider = (mostRecentSms && mostRecentSms.metadata && mostRecentSms.metadata.provider) || null;
      smsProvider.value = lastProvider === 'twilio' ? 'twilio' : 'openphone';
    }

    // Tasks
    renderTasks(tasks);

    // Populate task-assign dropdown (cached after first load)
    populateTaskAssign();

    // Reset task form
    if (taskTitle) taskTitle.value = '';
    if (taskDue) taskDue.value = '';
    if (taskAssign) taskAssign.value = '';
    hideMsg(taskError);

    // Reset all compose drafts so they don't bleed between customers
    if (emailSubject) emailSubject.value = '';
    if (emailBody)    emailBody.value = '';
    if (smsBody)      smsBody.value = '';
    if (smsCharCount) smsCharCount.textContent = '0 chars';
    if (noteInput)    noteInput.value = '';
    hideMsg(emailSendError); hideMsg(emailSendSuccess);
    hideMsg(smsSendError);   hideMsg(smsSendSuccess);
    hideMsg(noteError);

    // Reset compose tab back to Email so we never start on a stale tab
    composeTabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-compose') === 'email'));
    Object.entries(composePanels).forEach(([k, p]) => {
      if (p) p.classList.toggle('hidden', k !== 'email');
    });

    // Unified activity feed: notes + sent emails + sent texts + kit events
    renderActivity(notes, activities, kitEvents);
  }

  // Map a team email to a friendly first name (shared with greeting logic).
  function friendlyActorName(email) {
    if (!email) return '(system)';
    const local = String(email).toLowerCase().split('@')[0];
    const map = {
      osilpistole: 'Osil',
      'o.pistole': 'Osil',
      opistole:    'Osil',
      'a.logan':   'Ashley',
      alogan:      'Ashley',
      'e.good':    'Elizabeth',
      egood:       'Elizabeth',
    };
    return map[local] || email;
  }

  // Pretty-print a phone number to "(941) 297-4243" if it looks like a US E.164
  function prettyPhone(p) {
    if (!p) return p || '';
    const m = String(p).match(/^\+?1?(\d{3})(\d{3})(\d{4})$/);
    if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
    return p;
  }

  function formatKitEvent(ev) {
    const t = ev.event_type || 'event';
    if (t === 'tag_add')         return `Tag added: ${ev.tag_name || ev.tag_id || '(unnamed)'}`;
    if (t === 'tag_remove')      return `Tag removed: ${ev.tag_name || ev.tag_id || '(unnamed)'}`;
    if (t === 'link_click')      return `Link clicked: ${ev.link_url || '(unknown URL)'}`;
    if (t === 'form_subscribe')  return `Subscribed via form ${ev.form_id || ''}`.trim();
    if (t === 'course_subscribe')return `Joined a Kit sequence`;
    if (t === 'course_complete') return `Completed a Kit sequence`;
    if (t === 'subscriber_activate')    return `Subscribed to Kit`;
    if (t === 'subscriber_unsubscribe') return `Unsubscribed from Kit`;
    if (t === 'subscriber_bounce')      return `Email bounced (Kit)`;
    if (t === 'subscriber_complain')    return `Marked as spam (Kit)`;
    if (t === 'product_purchase')       return `Made a purchase (Kit)`;
    return t.replace(/_/g, ' ');
  }

  function renderActivity(notes, activities, kitEvents) {
    const items = [];
    (notes || []).forEach((n) => {
      items.push({
        kind: 'note',
        id: n.id,
        date: n.created_at,
        author: n.author_email || '(unknown)',
        authorId: n.author_id,
        body: n.body || '',
        // Show the edit/delete actions if the current user wrote it OR if
        // they're an admin. (Admin delete is already allowed by the RLS
        // policy; this just exposes the UI.)
        mine: (currentUser && n.author_id === currentUser.id) || currentRole === 'admin',
      });
    });
    (activities || []).forEach((a) => {
      const provider = a.metadata && a.metadata.provider;
      const kind =
        a.type === 'email_sent'   ? 'email' :
        a.type === 'sms_sent'     ? 'sms' :
        a.type === 'sms_received' ? 'sms-in' :
        'other';

      // Pretty author line: friendly name + which address/phone they sent from
      let authorLine;
      if (a.type === 'sms_received') {
        const fromPretty = prettyPhone(a.from_addr) || a.from_addr || '(unknown)';
        authorLine = `From ${fromPretty}${provider ? ' · via ' + provider : ''}`;
      } else {
        const who  = friendlyActorName(a.actor_email);
        const sent = a.type === 'sms_sent'
          ? prettyPhone(a.from_addr) || a.from_addr || ''
          : a.from_addr || '';
        authorLine = sent ? `${who} · from ${sent}` : who;
      }

      items.push({
        kind,
        id: a.id,
        date: a.created_at,
        author: authorLine,
        subject: a.subject,
        body: a.body || '',
        from: a.from_addr,
        to: a.to_addr,
        failed: a.status === 'failed',
        error: a.error_message,
      });
    });
    (kitEvents || []).forEach((ev) => {
      items.push({
        kind: 'kit',
        id: ev.id,
        date: ev.created_at,
        author: 'Kit',
        body: formatKitEvent(ev),
      });
    });

    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (!items.length) {
      activityList.innerHTML = '<div class="activity-empty">No activity yet — notes, emails, texts, and Kit events will show here.</div>';
      return;
    }

    activityList.innerHTML = items.map((it) => {
      const cls = ['activity-item', `kind-${it.kind}`];
      if (it.failed) cls.push('kind-failed');
      const typeLabel =
        it.kind === 'note'   ? '📝 Note' :
        it.kind === 'email'  ? '📧 Email' :
        it.kind === 'sms'    ? '📱 SMS sent' :
        it.kind === 'sms-in' ? '📥 SMS received' :
        it.kind === 'kit'    ? '✨ Kit' : it.kind;
      const toPretty = it.kind === 'sms' ? prettyPhone(it.to) : it.to;
      const recipientLine = (it.kind === 'email' || it.kind === 'sms') && it.to
        ? `<p class="ai-subject" style="font-weight:600;font-size:12px;color:var(--muted)">→ ${escapeHtml(toPretty)}</p>`
        : '';
      const subject = it.subject ? `<p class="ai-subject">${escapeHtml(it.subject)}</p>` : '';
      const failedMsg = it.failed ? `<p class="ai-fail">✗ Failed to send${it.error ? ': ' + escapeHtml(it.error) : ''}</p>` : '';
      const actions = it.kind === 'note' && it.mine
        ? `<div class="ai-actions">
             <button class="ai-action-btn" data-edit-note="${escapeHtml(it.id)}">Edit</button>
             <button class="ai-action-btn delete" data-delete-note="${escapeHtml(it.id)}">Delete</button>
           </div>`
        : '';
      return `
        <div class="${cls.join(' ')}" data-note-id="${escapeHtml(it.id || '')}">
          <div class="ai-head">
            <div class="ai-meta">
              <span class="ai-type ${it.kind}">${escapeHtml(typeLabel)}</span>
              <span class="ai-author">${escapeHtml(it.author)}</span>
            </div>
            <span class="ai-date">${escapeHtml(fmtDateTime(it.date))}</span>
          </div>
          ${recipientLine}
          ${subject}
          <div class="ai-body-wrap"><p class="ai-body" data-raw="${escapeHtml(it.body)}">${escapeHtml(it.body)}</p></div>
          ${failedMsg}
          ${actions}
        </div>
      `;
    }).join('');
  }

  async function refreshActivity() {
    if (!currentDetailEmail) return;
    const [notesRes, activitiesRes, kitEventsRes] = await Promise.all([
      sb.from('customer_notes')
        .select('id, body, author_id, author_email, created_at, updated_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(200),
      sb.from('customer_activities')
        .select('id, type, body, subject, from_addr, to_addr, actor_email, status, error_message, metadata, created_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(200),
      sb.from('kit_events')
        .select('id, event_type, tag_name, link_url, form_id, created_at')
        .ilike('customer_email', currentDetailEmail)
        .order('created_at', { ascending: false }).limit(100),
    ]);
    renderActivity(notesRes.data || [], activitiesRes.data || [], kitEventsRes.data || []);
  }

  async function refreshTasks() {
    if (!currentDetailEmail) return;
    const { data } = await sb.from('customer_tasks')
      .select('id, title, description, due_date, status, assigned_to, assigned_to_email, created_by, created_by_email, created_at, completed_at')
      .ilike('customer_email', currentDetailEmail)
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200);
    renderTasks(data || []);
  }

  function renderTasks(tasks) {
    if (!tasks || !tasks.length) {
      tasksList.innerHTML = '<div class="tasks-empty">No open tasks for this customer.</div>';
      return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    tasksList.innerHTML = tasks.map((t) => {
      const isDone = t.status === 'completed';
      const isOverdue = !isDone && t.due_date && new Date(t.due_date) < today;
      const isToday = !isDone && t.due_date && new Date(t.due_date).toDateString() === today.toDateString();
      const cls = ['task-item'];
      if (isDone) cls.push('completed');
      else if (isOverdue) cls.push('overdue');
      else if (isToday) cls.push('due-soon');

      const dueCls = isOverdue ? 'overdue' : isToday ? 'today' : '';
      const dueLabel = t.due_date ? (isOverdue ? `Overdue · ${fmtDate(t.due_date)}` : isToday ? `Today` : fmtDate(t.due_date)) : 'No due date';

      return `
        <div class="${cls.join(' ')}" data-task-id="${escapeHtml(t.id)}">
          <input type="checkbox" class="task-check" data-toggle-task="${escapeHtml(t.id)}" ${isDone ? 'checked' : ''}>
          <div class="task-body">
            <p class="task-title">${escapeHtml(t.title)}</p>
            <div class="task-meta">
              <span class="task-due ${dueCls}">${escapeHtml(dueLabel)}</span>
              ${t.assigned_to_email ? `<span>· <span class="task-assign">${escapeHtml(t.assigned_to_email)}</span></span>` : '<span>· Unassigned</span>'}
              <span>· added by ${escapeHtml(t.created_by_email || '(unknown)')}</span>
            </div>
          </div>
          <button class="task-delete-btn" data-delete-task="${escapeHtml(t.id)}" title="Delete">✕</button>
        </div>
      `;
    }).join('');
  }

  // Cache team members for assignment dropdown
  let teamMembersCache = null;
  async function populateTaskAssign() {
    if (!taskAssign) return;
    if (!teamMembersCache) {
      const { data, error } = await sb.rpc('list_team_members');
      if (error) {
        console.warn('Team list fetch failed:', error);
        teamMembersCache = [];
      } else {
        teamMembersCache = data || [];
      }
    }
    taskAssign.innerHTML =
      '<option value="">Assign to (anyone)</option>' +
      teamMembersCache.map((m) =>
        `<option value="${escapeHtml(m.user_id)}" data-email="${escapeHtml(m.email)}">${escapeHtml(m.full_name || m.email)}</option>`
      ).join('');
  }

  // Task event delegation: toggle complete + delete
  if (tasksList) {
    tasksList.addEventListener('change', async (e) => {
      const cb = e.target.closest('[data-toggle-task]');
      if (!cb) return;
      const taskId = cb.getAttribute('data-toggle-task');
      const status = cb.checked ? 'completed' : 'open';
      const { error } = await sb.from('customer_tasks').update({ status }).eq('id', taskId);
      if (error) { alert('Couldn\'t update task: ' + error.message); cb.checked = !cb.checked; return; }
      refreshTasks();
    });
    tasksList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-task]');
      if (!btn) return;
      if (!confirm('Delete this task?')) return;
      const taskId = btn.getAttribute('data-delete-task');
      const { error } = await sb.from('customer_tasks').delete().eq('id', taskId);
      if (error) { alert('Couldn\'t delete task: ' + error.message); return; }
      refreshTasks();
    });
  }

  // Task submit (add)
  if (taskSubmit) {
    taskSubmit.addEventListener('click', async () => {
      hideMsg(taskError);
      const title = (taskTitle.value || '').trim();
      if (!title) { showError(taskError, 'Task title required.'); return; }
      if (!currentDetailEmail) { showError(taskError, 'No customer loaded.'); return; }
      const due = taskDue.value || null;
      const assignedTo = taskAssign.value || null;
      const assignedToEmail = assignedTo
        ? (taskAssign.options[taskAssign.selectedIndex].getAttribute('data-email') || '')
        : null;

      taskSubmit.disabled = true;
      taskSubmit.textContent = 'Adding…';
      const { error } = await sb.from('customer_tasks').insert({
        customer_email: currentDetailEmail,
        title,
        due_date: due,
        assigned_to: assignedTo,
        assigned_to_email: assignedToEmail,
        created_by: currentUser.id,
        created_by_email: currentUser.email,
      });
      taskSubmit.disabled = false;
      taskSubmit.textContent = 'Add task';
      if (error) { showError(taskError, `Couldn't add: ${error.message}`); return; }
      taskTitle.value = '';
      taskDue.value = '';
      taskAssign.value = '';
      refreshTasks();
    });
  }

  // === Note edit/delete (event delegation on activityList) ===
  if (activityList) {
    activityList.addEventListener('click', async (e) => {
      // Delete note
      const delBtn = e.target.closest('[data-delete-note]');
      if (delBtn) {
        if (!confirm('Delete this note?')) return;
        const id = delBtn.getAttribute('data-delete-note');
        const { error } = await sb.from('customer_notes').delete().eq('id', id);
        if (error) { alert('Couldn\'t delete: ' + error.message); return; }
        refreshActivity();
        return;
      }
      // Edit note → swap body for textarea
      const editBtn = e.target.closest('[data-edit-note]');
      if (editBtn) {
        const id = editBtn.getAttribute('data-edit-note');
        const item = editBtn.closest('.activity-item');
        if (!item) return;
        const bodyEl = item.querySelector('.ai-body');
        if (!bodyEl) return;
        // Read the raw text we stashed on the body element (avoids
        // double-encoding via textContent → escapeHtml → innerHTML round-trip).
        const currentText = bodyEl.dataset.raw != null ? bodyEl.dataset.raw : bodyEl.textContent;
        const wrap = item.querySelector('.ai-body-wrap');

        // Build the edit UI with DOM APIs so the textarea's value is set
        // through the property (no HTML encoding involved).
        wrap.innerHTML = '';
        const editArea = document.createElement('div');
        editArea.className = 'note-edit-area';
        const ta = document.createElement('textarea');
        ta.value = currentText;
        editArea.appendChild(ta);
        const actions = document.createElement('div');
        actions.className = 'edit-actions';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'save';
        saveBtn.dataset.saveNote = id;
        saveBtn.textContent = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cancel';
        cancelBtn.dataset.cancelEdit = '';
        cancelBtn.textContent = 'Cancel';
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editArea.appendChild(actions);
        wrap.appendChild(editArea);
        const actionsRow = item.querySelector('.ai-actions');
        if (actionsRow) actionsRow.style.display = 'none';
        ta.focus();
        return;
      }
      // Save edited note
      const saveBtn = e.target.closest('[data-save-note]');
      if (saveBtn) {
        const id = saveBtn.getAttribute('data-save-note');
        const item = saveBtn.closest('.activity-item');
        const newBody = (item.querySelector('textarea').value || '').trim();
        if (!newBody) { alert('Note can\'t be empty.'); return; }
        const { error } = await sb.from('customer_notes')
          .update({ body: newBody, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { alert('Couldn\'t save: ' + error.message); return; }
        refreshActivity();
        return;
      }
      // Cancel edit
      if (e.target.closest('[data-cancel-edit]')) {
        refreshActivity();
      }
    });
  }

  // === Note submit ===
  if (noteSubmit) {
    noteSubmit.addEventListener('click', async () => {
      hideMsg(noteError);
      const body = (noteInput.value || '').trim();
      if (!body) { showError(noteError, 'Note can\'t be empty.'); return; }
      if (!currentDetailEmail) { showError(noteError, 'No customer loaded.'); return; }
      noteSubmit.disabled = true;
      noteSubmit.textContent = 'Saving…';
      const { error } = await sb.from('customer_notes').insert({
        customer_email: currentDetailEmail,
        author_id: currentUser.id,
        author_email: currentUser.email,
        body,
      });
      noteSubmit.disabled = false;
      noteSubmit.textContent = 'Save note';
      if (error) { showError(noteError, `Couldn't save: ${error.message}`); return; }
      noteInput.value = '';
      refreshActivity();
    });
  }

  // === Email send ===
  if (emailSendBtn) {
    emailSendBtn.addEventListener('click', async () => {
      hideMsg(emailSendError); hideMsg(emailSendSuccess);
      const from = emailFromSelect.value;
      const subject = (emailSubject.value || '').trim();
      const body = (emailBody.value || '').trim();
      if (!subject) { showError(emailSendError, 'Subject required.'); return; }
      if (!body)    { showError(emailSendError, 'Message body required.'); return; }
      if (!currentDetailEmail) { showError(emailSendError, 'No customer loaded.'); return; }

      const { data: { session } } = await sb.auth.getSession();
      if (!session) { showError(emailSendError, 'Not logged in.'); return; }

      emailSendBtn.disabled = true;
      emailSendBtn.textContent = 'Sending…';

      try {
        const resp = await fetch('/api/admin/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ to: currentDetailEmail, from, subject, body }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        showError(emailSendSuccess, `✓ Sent to ${currentDetailEmail}`);
        emailSubject.value = '';
        emailBody.value = '';
        refreshActivity();
      } catch (err) {
        showError(emailSendError, `Couldn't send: ${err.message}`);
      } finally {
        emailSendBtn.disabled = false;
        emailSendBtn.textContent = 'Send email';
      }
    });
  }

  // === SMS send ===
  if (smsSendBtn) {
    smsSendBtn.addEventListener('click', async () => {
      hideMsg(smsSendError); hideMsg(smsSendSuccess);
      const body = (smsBody.value || '').trim();
      if (!body) { showError(smsSendError, 'Message body required.'); return; }
      if (!currentDetailPhone) {
        showError(smsSendError, 'No phone number on file for this customer.');
        return;
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { showError(smsSendError, 'Not logged in.'); return; }

      smsSendBtn.disabled = true;
      smsSendBtn.textContent = 'Sending…';

      const provider = (smsProvider && smsProvider.value) || 'openphone';
      const providerLabel = provider === 'twilio' ? 'Twilio' : 'OpenPhone';

      try {
        const resp = await fetch('/api/admin/send-sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to: currentDetailPhone,
            customer_email: currentDetailEmail,
            body,
            provider,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        showError(smsSendSuccess, `✓ Text sent via ${providerLabel} to ${currentDetailPhone}`);
        smsBody.value = '';
        if (smsCharCount) smsCharCount.textContent = '0 chars';
        refreshActivity();
      } catch (err) {
        showError(smsSendError, `Couldn't send: ${err.message}`);
      } finally {
        smsSendBtn.disabled = false;
        smsSendBtn.textContent = 'Send text';
      }
    });
  }

  // ============================================================
  // Pilot requests
  // ============================================================
  let allPilots = [];
  let pilotSearch = '';
  let pilotFilter = 'all';

  async function loadPilotList() {
    if (!pilotLoading) return;
    pilotLoading.classList.remove('hidden');
    pilotTable.classList.add('hidden');
    pilotEmpty.classList.add('hidden');

    const { data, error } = await sb.from('pilot_requests')
      .select('id, created_at, first_name, last_name, email, phone, website, organization, role_title, pathway, challenges, timing, status, email_forwarded')
      .order('created_at', { ascending: false })
      .limit(500);

    pilotLoading.classList.add('hidden');
    if (error) {
      console.warn('Pilot requests fetch failed:', error);
      pilotEmpty.querySelector('p').textContent = 'Couldn\'t load pilot requests: ' + (error.message || error);
      pilotEmpty.classList.remove('hidden');
      return;
    }
    allPilots = data || [];
    renderPilotList();
  }

  function renderPilotList() {
    const q = pilotSearch.toLowerCase().trim();
    const filtered = allPilots.filter((p) => {
      if (q) {
        const blob = `${p.first_name || ''} ${p.last_name || ''} ${p.organization || ''} ${p.email || ''} ${p.role_title || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (pilotFilter === 'all') return true;
      if (pilotFilter === 'workplace' || pilotFilter === 'education' || pilotFilter === 'both') {
        return p.pathway === pilotFilter;
      }
      return p.status === pilotFilter;
    });

    if (!filtered.length) {
      pilotTable.classList.add('hidden');
      pilotEmpty.querySelector('p').textContent = 'No pilot requests match.';
      pilotEmpty.classList.remove('hidden');
      return;
    }
    pilotEmpty.classList.add('hidden');
    pilotTable.classList.remove('hidden');

    pilotTbody.innerHTML = filtered.map((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(no name)';
      const pathwayLabel = p.pathway === 'workplace' ? 'Workplace' : p.pathway === 'education' ? 'Education' : 'Both';
      const statusOptions = ['new', 'contacted', 'qualified', 'closed_won', 'closed_lost', 'spam']
        .map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`)
        .join('');
      return `
        <tr data-pilot-id="${escapeHtml(p.id)}">
          <td>${escapeHtml(fmtDate(p.created_at))}</td>
          <td>
            <div class="name">${escapeHtml(name)}</div>
            <div class="email">${escapeHtml(p.email)}</div>
            ${p.phone ? `<div class="phone">${escapeHtml(p.phone)}</div>` : ''}
          </td>
          <td>
            <div class="name">${escapeHtml(p.organization)}</div>
            <div class="email">${escapeHtml(p.role_title)}</div>
            ${p.website ? `<div class="phone"><a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">${escapeHtml(p.website)}</a></div>` : ''}
          </td>
          <td><span class="source-tag pathway-${escapeHtml(p.pathway || 'both')}">${escapeHtml(pathwayLabel)}</span></td>
          <td>
            <select class="pilot-status-select" data-pilot-id="${escapeHtml(p.id)}" onclick="event.stopPropagation()">${statusOptions}</select>
          </td>
        </tr>
        <tr class="pilot-detail-row" data-pilot-id="${escapeHtml(p.id)}" style="display:none">
          <td colspan="5" style="background:var(--mist);padding:16px 22px">
            <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--green-ink);font-weight:700">Challenges</p>
            <p style="margin:0 0 14px;font-size:13px;color:var(--slate)">${escapeHtml((p.challenges || []).join(' · ') || '—')}</p>
            <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--green-ink);font-weight:700">What makes now the right time</p>
            <p style="margin:0;font-size:14px;color:var(--slate);white-space:pre-wrap">${escapeHtml(p.timing || '(not provided)')}</p>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Toggle detail row on click
  if (pilotTbody) {
    pilotTbody.addEventListener('click', (e) => {
      if (e.target.closest('.pilot-status-select')) return; // ignore status dropdown
      const row = e.target.closest('tr[data-pilot-id]');
      if (!row || row.classList.contains('pilot-detail-row')) return;
      const id = row.getAttribute('data-pilot-id');
      const detail = pilotTbody.querySelector(`.pilot-detail-row[data-pilot-id="${id}"]`);
      if (detail) detail.style.display = detail.style.display === 'none' ? 'table-row' : 'none';
    });

    // Status change
    pilotTbody.addEventListener('change', async (e) => {
      const sel = e.target.closest('.pilot-status-select');
      if (!sel) return;
      const id = sel.getAttribute('data-pilot-id');
      const newStatus = sel.value;
      const { error } = await sb.from('pilot_requests').update({ status: newStatus }).eq('id', id);
      if (error) { alert('Couldn\'t update status: ' + error.message); return; }
      const p = allPilots.find((x) => x.id === id);
      if (p) p.status = newStatus;
    });
  }

  // Pilot search + filter
  if (pilotSearchInput) {
    pilotSearchInput.addEventListener('input', () => { pilotSearch = pilotSearchInput.value; renderPilotList(); });
  }
  if (pilotFilterPills) {
    pilotFilterPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      pilotFilterPills.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      pilotFilter = btn.getAttribute('data-pilot-filter');
      renderPilotList();
    });
  }

  // ============================================================
  // Team directory + My Account
  // ============================================================
  async function loadTeamDirectory() {
    const loading = document.getElementById('team-list-loading');
    const grid    = document.getElementById('team-grid');
    if (!grid) return;
    if (loading) loading.classList.remove('hidden');
    grid.classList.add('hidden');

    const { data, error } = await sb.rpc('list_team_members');
    if (loading) loading.classList.add('hidden');
    if (error) {
      grid.classList.remove('hidden');
      grid.innerHTML = `<div class="card" style="grid-column:1/-1"><p class="msg-error show">Couldn't load team: ${escapeHtml(error.message || '')}</p></div>`;
      return;
    }
    const members = data || [];
    if (!members.length) {
      grid.classList.remove('hidden');
      grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted)"><p>No team members yet.</p></div>';
      return;
    }
    grid.classList.remove('hidden');
    grid.innerHTML = members.map((m) => {
      const initials = (m.full_name || m.email || '?').split(/\s+|@/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
      const displayName = m.full_name || friendlyActorName(m.email) || m.email;
      const isMe = currentUser && m.user_id === currentUser.id;
      const avatarHtml = m.avatar_url
        ? `<div style="width:80px;height:80px;border-radius:50%;flex-shrink:0;background:#fff;overflow:hidden;border:1px solid var(--bone)"><img src="${escapeHtml(m.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="width:80px;height:80px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:700;font-size:24px;flex-shrink:0">${escapeHtml(initials)}</div>`;
      const titleLine = m.title
        ? `<p style="margin:2px 0 0;font-size:12px;color:var(--body)">${escapeHtml(m.title)}</p>`
        : '';
      return `
        <div class="card" style="padding:18px 20px">
          <div style="display:flex;align-items:center;gap:12px;margin:0 0 10px">
            ${avatarHtml}
            <div style="min-width:0;flex:1">
              <p style="margin:0;font-size:15px;font-weight:700;color:var(--slate);display:flex;align-items:center;gap:6px">${escapeHtml(displayName)}${isMe ? '<span class="role-pill" style="background:var(--green-wash);color:var(--green-deep);border:1px solid #BFE3BF">YOU</span>' : ''}</p>
              ${titleLine}
              <p style="margin:2px 0 0;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.email)}</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-weight:700">
            <span>Role</span>
            <span style="color:var(--navy)">${escapeHtml(m.role || '—')}</span>
          </div>
          ${isMe ? `<div style="margin:14px 0 0;padding:12px 0 0;border-top:1px solid var(--bone)"><a href="#account" style="color:var(--green-ink);font-size:12px;font-weight:700;text-decoration:none">Edit my profile →</a></div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderAvatar(target, fullName, avatarUrl) {
    if (!target) return;
    if (avatarUrl) {
      target.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
      target.style.background = 'transparent';
    } else {
      const initials = (fullName || '?').split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '—';
      target.textContent = initials;
      target.style.background = 'var(--navy)';
      target.style.color = '#fff';
    }
  }

  async function loadAccount() {
    if (!currentUser) return;
    const meta = currentUser.user_metadata || {};
    const fullName = meta.full_name || meta.name || friendlyActorName(currentUser.email) || '';
    const title    = meta.title || '';
    const avatarUrl = meta.avatar_url || '';

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('acct-email', currentUser.email || '—');
    set('acct-meta', `${currentRole || '—'}  ·  signed in ${currentUser.last_sign_in_at ? fmtDateTime(currentUser.last_sign_in_at) : '—'}`);
    const nameInput  = document.getElementById('acct-display-name');
    const titleInput = document.getElementById('acct-title');
    if (nameInput)  nameInput.value  = fullName;
    if (titleInput) titleInput.value = title;
    renderAvatar(document.getElementById('acct-avatar'), fullName, avatarUrl);
    hideMsg(document.getElementById('acct-error'));
    hideMsg(document.getElementById('acct-success'));
  }

  // Save profile (display name + title)
  const acctSaveBtn = document.getElementById('acct-save-btn');
  if (acctSaveBtn) {
    acctSaveBtn.addEventListener('click', async () => {
      const errEl = document.getElementById('acct-error');
      const okEl  = document.getElementById('acct-success');
      hideMsg(errEl); hideMsg(okEl);
      const fullName = (document.getElementById('acct-display-name').value || '').trim();
      const title    = (document.getElementById('acct-title').value || '').trim();
      acctSaveBtn.disabled = true;
      acctSaveBtn.textContent = 'Saving…';
      const { data, error } = await sb.auth.updateUser({
        data: {
          ...(currentUser.user_metadata || {}),
          full_name: fullName,
          title,
        },
      });
      acctSaveBtn.disabled = false;
      acctSaveBtn.textContent = 'Save profile';
      if (error) { showError(errEl, 'Couldn\'t save: ' + error.message); return; }
      if (data && data.user) currentUser = data.user;
      showError(okEl, '✓ Saved.');
      // Re-render avatar in case name initials changed
      renderAvatar(document.getElementById('acct-avatar'),
        fullName,
        currentUser.user_metadata && currentUser.user_metadata.avatar_url);
      renderTopbarAvatar();
    });
  }

  // Photo upload
  const acctPhotoInput = document.getElementById('acct-photo-input');
  const acctAvatarWrap = document.getElementById('acct-avatar-wrap');
  if (acctAvatarWrap && acctPhotoInput) {
    acctAvatarWrap.addEventListener('click', (e) => {
      e.preventDefault();
      acctPhotoInput.click();
    });
  }
  if (acctPhotoInput) {
    acctPhotoInput.addEventListener('change', async (e) => {
      const errEl = document.getElementById('acct-error');
      const okEl  = document.getElementById('acct-success');
      hideMsg(errEl); hideMsg(okEl);

      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!currentUser) { showError(errEl, 'Not signed in.'); return; }
      if (file.size > 5 * 1024 * 1024) {
        showError(errEl, 'Photo too large (max 5 MB).');
        acctPhotoInput.value = '';
        return;
      }

      // Build storage path: <user_id>/avatar-<timestamp>.<ext>
      // Date.now() ensures the path is unique across the session lifetime
      // (performance.now() resets to 0 on each page load and could collide).
      const ext = ((file.name.match(/\.(\w+)$/) || [])[1] || 'png').toLowerCase();
      const ts  = Date.now();
      const path = `${currentUser.id}/avatar-${ts}.${ext}`;

      // Best-effort cleanup of previous avatars so we don't accumulate cruft
      // in storage. Ignore errors here — the upload is the important part.
      try {
        const { data: existing } = await sb.storage.from('avatars').list(currentUser.id);
        const toRemove = (existing || []).map((f) => `${currentUser.id}/${f.name}`);
        if (toRemove.length) await sb.storage.from('avatars').remove(toRemove);
      } catch (cleanupErr) {
        console.warn('[avatar upload] cleanup failed (non-fatal):', cleanupErr);
      }

      const avatarEl = document.getElementById('acct-avatar');
      const previousAvatarHtml = avatarEl ? avatarEl.innerHTML : '';
      if (avatarEl) avatarEl.textContent = '…';

      console.log('[avatar upload] uploading to', path, 'size', file.size, 'type', file.type);

      const { error: upErr } = await sb.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/png',
      });
      if (upErr) {
        console.error('[avatar upload] storage upload error:', upErr);
        // Restore previous avatar state
        if (avatarEl) avatarEl.innerHTML = previousAvatarHtml;
        // Common cause: migration 022 not run → bucket missing
        const msg = (upErr.message || String(upErr)).toLowerCase();
        if (msg.includes('not found') || msg.includes('bucket')) {
          showError(errEl,
            'Upload failed: the avatars storage bucket doesn\'t exist yet. ' +
            'Run migration 022 in Supabase SQL Editor to create it. ' +
            '(' + upErr.message + ')');
        } else if (msg.includes('row-level security') || msg.includes('policy')) {
          showError(errEl,
            'Upload failed: storage policy blocked the write. ' +
            'Re-run migration 022 to set up policies. (' + upErr.message + ')');
        } else {
          showError(errEl, 'Upload failed: ' + upErr.message);
        }
        return;
      }

      // Public URL
      const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = pub && pub.publicUrl;
      console.log('[avatar upload] public URL:', avatarUrl);

      // Save URL to user_metadata
      const { data, error: userErr } = await sb.auth.updateUser({
        data: {
          ...(currentUser.user_metadata || {}),
          avatar_url: avatarUrl,
        },
      });
      if (userErr) {
        console.error('[avatar upload] user-metadata save error:', userErr);
        if (avatarEl) avatarEl.innerHTML = previousAvatarHtml;
        showError(errEl, 'Photo uploaded but profile save failed: ' + userErr.message);
        return;
      }
      if (data && data.user) currentUser = data.user;
      renderAvatar(avatarEl, currentUser.user_metadata.full_name, avatarUrl);
      renderTopbarAvatar();
      showError(okEl, '✓ Photo updated.');
      acctPhotoInput.value = '';
    });
  }

  // Topbar mini-avatar
  function renderTopbarAvatar() {
    const wrap = document.getElementById('topbar-avatar');
    if (!wrap || !currentUser) return;
    const meta = currentUser.user_metadata || {};
    const fullName = meta.full_name || friendlyActorName(currentUser.email) || '';
    const avatarUrl = meta.avatar_url || '';
    renderAvatar(wrap, fullName, avatarUrl);
  }

  // ============================================================
  // Export → Cohort intake (printable HTML for browser-PDF)
  // ============================================================
  const exportIntakeBtn = document.getElementById('export-intake-btn');
  if (exportIntakeBtn) {
    exportIntakeBtn.addEventListener('click', async () => {
      const orig = exportIntakeBtn.textContent;
      exportIntakeBtn.disabled = true;
      exportIntakeBtn.textContent = 'Loading…';
      try {
        const { data, error } = await sb.from('refresh_signups')
          .select('id, full_name, email, phone, preferred_group_time, seat_type, intake_completed, area_needing_refresh, reason_for_interest, previous_rebe_experience, organization_name, role_title, notes, paid_amount_cents, paid_at, created_at')
          .order('preferred_group_time', { ascending: true })
          .order('full_name', { ascending: true })
          .limit(1000);
        if (error) throw error;

        // Only people with any intake content OR who paid for a cohort seat
        const rows = (data || []).filter((r) => {
          if (r.intake_completed === true) return true;
          if ((r.notes || '').trim() !== '') return true;
          if ((r.area_needing_refresh || '').trim() !== '') return true;
          if ((r.reason_for_interest || '').trim() !== '') return true;
          if (typeof r.paid_amount_cents === 'number' && r.paid_amount_cents > 0) return true;
          return false;
        });

        // Group by slot: '11 AM ET' / '8 PM ET' / everything else
        const groups = { '11 AM ET': [], '8 PM ET': [], 'Other / no slot': [] };
        rows.forEach((r) => {
          const slot = String(r.preferred_group_time || '').trim();
          if (/11\s*AM/i.test(slot)) groups['11 AM ET'].push(r);
          else if (/8\s*PM/i.test(slot)) groups['8 PM ET'].push(r);
          else groups['Other / no slot'].push(r);
        });

        const esc = (s) => String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const fmtMoney = (cents) => {
          if (typeof cents !== 'number') return '—';
          if (cents === 0) return 'Comp ($0)';
          return '$' + (cents / 100).toFixed(2);
        };
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : '—';
        const fmtBool = (b) => b === true ? 'Yes — prior ReBe experience' : b === false ? 'No — first time' : '—';

        const renderPerson = (r) => `
          <article class="person">
            <header class="person-head">
              <h3>${esc(r.full_name || '(no name)')}</h3>
              <p class="contact">${esc(r.email || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</p>
            </header>
            <dl class="kv">
              <div><dt>Paid</dt><dd>${esc(fmtMoney(r.paid_amount_cents))}</dd></div>
              <div><dt>Paid on</dt><dd>${esc(fmtDate(r.paid_at))}</dd></div>
              <div><dt>Signed up</dt><dd>${esc(fmtDate(r.created_at))}</dd></div>
              <div><dt>Seat type</dt><dd>${esc(r.seat_type || '—')}</dd></div>
              <div><dt>Prior ReBe?</dt><dd>${esc(fmtBool(r.previous_rebe_experience))}</dd></div>
              ${r.organization_name ? `<div><dt>Org</dt><dd>${esc(r.organization_name)}${r.role_title ? ' · ' + esc(r.role_title) : ''}</dd></div>` : ''}
            </dl>
            ${r.area_needing_refresh ? `<div class="block"><h4>Area needing refresh</h4><p>${esc(r.area_needing_refresh)}</p></div>` : ''}
            ${r.reason_for_interest ? `<div class="block"><h4>Reason for interest</h4><p>${esc(r.reason_for_interest)}</p></div>` : ''}
            ${r.notes ? `<div class="block"><h4>Intake details + notes</h4><pre class="notes">${esc(r.notes)}</pre></div>` : ''}
          </article>
        `;

        const totalCount = rows.length;
        const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        const slotSection = (label, list) => {
          if (!list.length) return '';
          return `
            <section class="slot-section">
              <h2 class="slot-title">${esc(label)} <span class="slot-count">${list.length} ${list.length === 1 ? 'person' : 'people'}</span></h2>
              ${list.map(renderPerson).join('')}
            </section>
          `;
        };

        const html = `<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Cohort intake — ${esc(today)}</title>
<style>
  @page { margin: 18mm 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #212B37; margin: 0; padding: 32px 36px; line-height: 1.5; font-size: 12pt; }
  .report-head { border-bottom: 2px solid #060B50; padding-bottom: 18px; margin: 0 0 24px; }
  .report-head h1 { font-family: Georgia, serif; font-weight: 600; font-size: 26pt; margin: 0 0 6px; color: #060B50; }
  .report-head p { margin: 0; color: #4A535E; font-size: 11pt; }
  .summary { background: #FAF9F7; border: 1px solid #E2E2E2; border-radius: 8px; padding: 12px 16px; margin: 0 0 28px; font-size: 11pt; }
  .summary strong { color: #060B50; }
  .slot-section { margin: 0 0 32px; page-break-inside: auto; }
  .slot-title { font-family: Georgia, serif; font-weight: 600; font-size: 18pt; color: #060B50; border-bottom: 1px solid #E3A01F; padding: 0 0 6px; margin: 24px 0 16px; }
  .slot-count { font-family: -apple-system, sans-serif; font-size: 10pt; color: #9DA1A8; font-weight: 400; letter-spacing: .04em; text-transform: uppercase; margin-left: 8px; }
  .person { border: 1px solid #E2E2E2; border-radius: 8px; padding: 16px 20px; margin: 0 0 14px; page-break-inside: avoid; background: #FFFFFF; }
  .person-head h3 { margin: 0 0 4px; font-family: Georgia, serif; font-size: 14pt; color: #060B50; font-weight: 600; }
  .person-head .contact { margin: 0 0 12px; color: #4A535E; font-size: 10pt; }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 0 0 12px; padding: 0; }
  .kv > div { display: flex; gap: 6px; font-size: 10pt; }
  .kv dt { color: #9DA1A8; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; min-width: 96px; margin: 0; }
  .kv dd { margin: 0; color: #212B37; }
  .block { margin: 12px 0 0; padding: 10px 12px; background: #FAF9F7; border-left: 3px solid #449945; border-radius: 0 6px 6px 0; }
  .block h4 { margin: 0 0 4px; font-size: 9.5pt; color: #3A8438; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .block p, .block pre { margin: 0; font-size: 11pt; color: #212B37; line-height: 1.55; }
  .notes { white-space: pre-wrap; font-family: inherit; }
  .print-controls { position: fixed; top: 12px; right: 12px; background: #060B50; color: #fff; padding: 10px 16px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18); font-size: 12px; }
  .print-controls button { background: #fff; color: #060B50; border: 0; padding: 6px 12px; border-radius: 4px; font-weight: 700; cursor: pointer; margin-left: 8px; }
  @media print { .print-controls { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="print-controls">Use File → Print → Save as PDF <button onclick="window.print()">Print now</button></div>
  <header class="report-head">
    <h1>ReBe ReFresh — Cohort intake forms</h1>
    <p>Generated ${esc(today)}</p>
  </header>
  <div class="summary">
    <strong>${totalCount}</strong> ${totalCount === 1 ? 'person' : 'people'} with intake on file ·
    <strong>${groups['11 AM ET'].length}</strong> in 11 AM ET ·
    <strong>${groups['8 PM ET'].length}</strong> in 8 PM ET ·
    <strong>${groups['Other / no slot'].length}</strong> other
  </div>
  ${slotSection('11 AM Eastern cohort', groups['11 AM ET'])}
  ${slotSection('8 PM Eastern cohort', groups['8 PM ET'])}
  ${slotSection('Other / slot not recorded', groups['Other / no slot'])}
  ${totalCount === 0 ? '<p style="text-align:center;color:#9DA1A8;font-style:italic;padding:40px 0">No intake responses on file yet.</p>' : ''}
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) {
          alert("Couldn't open the print window — your browser may have blocked the pop-up. Allow pop-ups for this site and try again.");
          return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch (err) {
        console.error('Intake export failed:', err);
        alert("Couldn't load intake data: " + (err.message || err));
      } finally {
        exportIntakeBtn.disabled = false;
        exportIntakeBtn.textContent = orig;
      }
    });
  }

  // ============================================================
  // Manual add customer + delete customer
  // ============================================================
  const addCustomerBtn = document.getElementById('add-customer-btn');
  const addCustomerModal = document.getElementById('add-customer-modal');
  if (addCustomerBtn && addCustomerModal) {
    addCustomerBtn.addEventListener('click', () => {
      hideMsg(document.getElementById('add-cust-error'));
      ['add-cust-name', 'add-cust-email', 'add-cust-phone'].forEach((id) => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const src = document.getElementById('add-cust-source'); if (src) src.value = 'cohort';
      addCustomerModal.classList.add('open');
      setTimeout(() => document.getElementById('add-cust-name').focus(), 50);
    });
    const cancel = document.getElementById('add-cust-cancel');
    if (cancel) cancel.addEventListener('click', () => addCustomerModal.classList.remove('open'));
    addCustomerModal.addEventListener('click', (e) => {
      if (e.target === addCustomerModal) addCustomerModal.classList.remove('open');
    });
    const submitBtn = document.getElementById('add-cust-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('add-cust-error');
        hideMsg(errEl);
        const fullName = (document.getElementById('add-cust-name').value || '').trim();
        const email    = (document.getElementById('add-cust-email').value || '').trim().toLowerCase();
        const phone    = (document.getElementById('add-cust-phone').value || '').trim();
        const source   = (document.getElementById('add-cust-source').value || 'cohort');
        const slot     = (document.getElementById('add-cust-slot').value || '');

        if (!fullName) { showError(errEl, 'Full name required.'); return; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError(errEl, 'Valid email required.'); return; }

        submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
        let error = null;
        try {
          if (source === 'workshop') {
            const [firstName, ...rest] = fullName.split(/\s+/);
            const r = await sb.from('contacts').insert({
              first_name: firstName,
              last_name: rest.join(' ') || null,
              email,
              phone: phone || null,
            });
            error = r.error;
          } else {
            // cohort / lead / waitlist / paid go into refresh_signups
            const status = source === 'paid' ? 'enrolled' : source === 'cohort' ? 'enrolled' : 'pending';
            const readiness =
              source === 'paid'     ? 'ready_to_pay' :
              source === 'cohort'   ? 'ready_to_pay' :
              source === 'waitlist' ? 'waitlist' :
                                       'wants_more_info';
            const preferredTime = slot === '11am' ? '11 AM ET' : slot === '8pm' ? '8 PM ET' : null;
            // seat_type must NOT be 'attendee' for waitlist/lead since the
            // intake heuristic would then mis-mark them as 'intake done'.
            const seatType =
              source === 'paid'     ? 'paid' :
              source === 'cohort'   ? 'other' :    // generic enrolled — they'll need intake
              source === 'waitlist' ? null  :     // not in cohort yet
                                       null;
            const r = await sb.from('refresh_signups').insert({
              full_name: fullName,
              email,
              phone: phone || '',
              status,
              readiness,
              audience_type: 'groups',
              group_type: 'no_preference',
              preferred_group_time: preferredTime,
              paid_amount_cents: 0,
              consent_to_contact: true,
              consent_to_confidentiality: true,
              seat_type: seatType,
              intake_completed: null,
            });
            error = r.error;
          }
        } catch (e) { error = e; }
        submitBtn.disabled = false; submitBtn.textContent = 'Add customer';
        if (error) { showError(errEl, `Couldn't add: ${error.message || error}`); return; }
        addCustomerModal.classList.remove('open');
        loadCustomerList();
      });
    }
  }

  // Delete-customer button on customer detail (hard delete from both tables)
  const deleteCustomerBtn = document.getElementById('delete-customer-btn');
  if (deleteCustomerBtn) {
    deleteCustomerBtn.addEventListener('click', async () => {
      if (!currentDetailEmail) return;
      const ok = confirm(`Delete ${currentDetailEmail} from the CRM?\n\nThis removes them from contacts + refresh_signups. Activity, notes, and tasks tied to this email stay (they're keyed by email so they'd reappear if the person comes back).\n\nThis cannot be undone.`);
      if (!ok) return;
      deleteCustomerBtn.disabled = true;
      deleteCustomerBtn.textContent = 'Deleting…';
      const emailToDelete = currentDetailEmail;
      try {
        // .select() makes Postgrest return the deleted rows so we can detect
        // silent RLS-blocked deletes (returns 0 rows, no error).
        const cR = await sb.from('contacts').delete().ilike('email', emailToDelete).select('email');
        const rR = await sb.from('refresh_signups').delete().ilike('email', emailToDelete).select('email');

        if (cR.error || rR.error) {
          throw new Error((cR.error || rR.error).message);
        }
        const deletedRows = (cR.data || []).length + (rR.data || []).length;
        if (deletedRows === 0) {
          // RLS policy is missing — surface a clear instruction.
          alert(
            'Delete returned 0 rows. The most likely cause: the DELETE permission ' +
            'policy on contacts/refresh_signups isn\'t enabled in Supabase yet.\n\n' +
            'Run migration 018 in Supabase SQL Editor (or paste this):\n\n' +
            'CREATE POLICY "admin_staff_delete_contacts" ON contacts FOR DELETE TO authenticated USING (is_admin_or_staff());\n' +
            'CREATE POLICY "admin_staff_delete_refresh_signups" ON refresh_signups FOR DELETE TO authenticated USING (is_admin_or_staff());'
          );
          return;
        }

        // Navigate back to wherever we came from instead of dumping into All Customers
        const lastListRoute = sessionStorage.getItem('lastListRoute') || '#customers';
        window.location.hash = lastListRoute;
      } catch (err) {
        alert('Delete failed: ' + (err.message || err));
      } finally {
        deleteCustomerBtn.disabled = false;
        deleteCustomerBtn.textContent = 'Delete customer';
      }
    });
  }

  // Intake-completed override (Mark intake done / needed)
  const intakeOverride = document.getElementById('cd-intake-override');
  if (intakeOverride) {
    intakeOverride.addEventListener('change', async () => {
      if (!currentDetailEmail) return;
      const val = intakeOverride.value;
      if (!val) return;
      const newVal = val === 'done';

      // Find existing refresh_signups row for this email; if none, create a
      // minimal one so we have somewhere to store the flag.
      const { data: existing } = await sb.from('refresh_signups')
        .select('id').ilike('email', currentDetailEmail).limit(1);

      let error;
      if (existing && existing.length) {
        const r = await sb.from('refresh_signups')
          .update({ intake_completed: newVal })
          .eq('id', existing[0].id);
        error = r.error;
      } else {
        const r = await sb.from('refresh_signups').insert({
          email: currentDetailEmail,
          full_name: currentDetailEmail,
          phone: currentDetailPhone || '',
          status: 'enrolled',
          readiness: 'ready_to_pay',
          audience_type: 'groups',
          group_type: 'no_preference',
          consent_to_contact: true,
          consent_to_confidentiality: true,
          paid_amount_cents: 0,
          intake_completed: newVal,
        });
        error = r.error;
      }
      intakeOverride.value = '';
      if (error) { alert('Couldn\'t update intake status: ' + error.message); return; }

      // Audit trail: write a note so the team has a record of the override
      try {
        await sb.from('customer_notes').insert({
          customer_email: currentDetailEmail,
          author_id: currentUser.id,
          author_email: currentUser.email,
          body: `🔁 Intake status changed to "${newVal ? 'done ✓' : 'needed ✗'}" by ${friendlyActorName(currentUser.email)}`,
        });
      } catch (_) {}

      loadCustomerDetail(currentDetailEmail);
    });
  }

  // Status override dropdown on customer detail (Mark as paid / lead / waitlist)
  const statusOverride = document.getElementById('cd-status-override');
  if (statusOverride) {
    statusOverride.addEventListener('change', async () => {
      if (!currentDetailEmail) return;
      const newReadiness = statusOverride.value;
      if (!newReadiness) return;

      let patch;
      if (newReadiness === 'paid') {
        // Prompt for amount + slot so we record a real payment, not just
        // flip a flag. Default amount = $300 (cohort price).
        const amountStr = prompt(
          'Mark as paid — enter the amount they paid in dollars\n(default $300):',
          '300'
        );
        if (amountStr === null) { statusOverride.value = ''; return; }
        const amount = parseFloat(String(amountStr).replace(/[$,\s]/g, ''));
        if (isNaN(amount) || amount < 0) {
          alert('Invalid amount.');
          statusOverride.value = '';
          return;
        }
        const slot = prompt(
          'Which cohort slot? Type "11" for 11 AM ET, "8" for 8 PM ET, or leave blank for no preference:',
          ''
        );
        const preferredTime = !slot
          ? null
          : String(slot).includes('8') ? 'Tuesdays at 8 PM ET' : 'Tuesdays at 11 AM ET';
        patch = {
          status: 'enrolled',
          readiness: 'ready_to_pay',
          paid_amount_cents: Math.round(amount * 100),
          paid_at: new Date().toISOString(),
          seat_type: 'paid',
          intake_completed: true,
        };
        if (preferredTime) patch.preferred_group_time = preferredTime;
      } else {
        patch = { status: 'enrolled', readiness: newReadiness };
      }
      // Update existing row OR insert if not present
      const { data: existing } = await sb.from('refresh_signups').select('id').ilike('email', currentDetailEmail).limit(1);
      let error;
      if (existing && existing.length) {
        const r = await sb.from('refresh_signups').update(patch).eq('id', existing[0].id);
        error = r.error;
      } else {
        // No refresh_signups row yet — insert one carrying the patch values
        const r = await sb.from('refresh_signups').insert({
          email: currentDetailEmail,
          full_name: currentDetailEmail,
          phone: currentDetailPhone || '',
          status: patch.status,
          readiness: patch.readiness,
          audience_type: 'groups',
          group_type: 'no_preference',
          consent_to_contact: true,
          consent_to_confidentiality: true,
          paid_amount_cents: patch.paid_amount_cents || 0,
          paid_at: patch.paid_at || null,
          preferred_group_time: patch.preferred_group_time || null,
          seat_type: patch.seat_type || 'paid',
          intake_completed: patch.intake_completed !== undefined ? patch.intake_completed : null,
        });
        error = r.error;
      }
      if (error) { alert('Couldn\'t update status: ' + error.message); return; }

      // Audit trail
      try {
        const label =
          newReadiness === 'paid'             ? `paid${patch.paid_amount_cents ? ' ($' + (patch.paid_amount_cents/100).toFixed(2) + ')' : ''}` :
          newReadiness === 'wants_more_info'  ? 'cohort lead' :
          newReadiness === 'waitlist'         ? 'cohort waitlist' :
                                                 newReadiness;
        await sb.from('customer_notes').insert({
          customer_email: currentDetailEmail,
          author_id: currentUser.id,
          author_email: currentUser.email,
          body: `🔁 Status changed to "${label}" by ${friendlyActorName(currentUser.email)}`,
        });
      } catch (_) {}

      loadCustomerDetail(currentDetailEmail);
    });
  }

  // ============================================================
  // Init — restore session if exists
  // ============================================================
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) enterApp(data.session.user);
    else enterLogin();
  });

})();
