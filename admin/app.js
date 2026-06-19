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

    // Highlight active nav
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-route') === (route || 'dashboard'));
    });

    if (route === 'customers') {
      viewCustomers.classList.remove('hidden');
      // Apply ?filter=… from dashboard cards
      if (queryParams.filter) {
        currentFilter = queryParams.filter;
        document.querySelectorAll('.filter-pill').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
        });
      }
      loadCustomerList();
    } else if (route === 'pilots') {
      if (viewPilots) viewPilots.classList.remove('hidden');
      loadPilotList();
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
      safeCount('refresh_signups', (q) => q.eq('status', 'enrolled')),
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
        showError(inviteSuccess, `✓ Invited ${email} as ${role}. They'll get a Supabase email to set their password.`);
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
        .select('id, full_name, email, phone, status, readiness, preferred_group_time, paid_amount_cents, paid_at, created_at')
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

      if (s.status === 'enrolled') existing.sources.add('paid');
      if (s.readiness === 'wants_more_info') existing.sources.add('lead');
      if (s.readiness === 'waitlist') existing.sources.add('waitlist');

      existing.preferredSlot = existing.preferredSlot || s.preferred_group_time;
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
      const tags = Array.from(c.sources).map((s) => {
        const label = s === 'paid' ? 'Paid' : s === 'lead' ? 'Lead' : s === 'workshop' ? 'Workshop' : s === 'waitlist' ? 'Waitlist' : s;
        return `<span class="source-tag ${escapeHtml(s)}">${escapeHtml(label)}</span>`;
      }).join('');

      const phone = c.phone ? `<div class="phone">${escapeHtml(c.phone)}</div>` : '';
      return `<tr data-email="${escapeHtml(c.email)}">
        <td><div class="name">${escapeHtml(c.name || '(no name)')}</div></td>
        <td><div class="email">${escapeHtml(c.email)}</div>${phone}</td>
        <td>${tags || '—'}</td>
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
        .select('full_name, email, phone, status, readiness, preferred_group_time, audience_type, group_type, area_needing_refresh, reason_for_interest, previous_rebe_experience, organization_name, role_title, notes, paid_amount_cents, paid_at, stripe_session_id, created_at')
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

    // Source tags
    const tags = [];
    if (contact) tags.push({ label: 'Workshop', cls: 'workshop' });
    if (cohort && cohort.status === 'enrolled') tags.push({ label: 'Paid cohort', cls: 'paid' });
    if (cohort && cohort.readiness === 'wants_more_info') tags.push({ label: 'Cohort lead', cls: 'lead' });
    if (cohort && cohort.readiness === 'waitlist') tags.push({ label: 'Waitlist', cls: 'waitlist' });
    cdTags.innerHTML = tags.length
      ? tags.map((t) => `<span class="source-tag ${t.cls}">${escapeHtml(t.label)}</span>`).join('')
      : '';

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
        mine: currentUser && n.author_id === currentUser.id,
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
          <div class="ai-body-wrap"><p class="ai-body">${escapeHtml(it.body)}</p></div>
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
        const currentText = bodyEl.textContent;
        const wrap = item.querySelector('.ai-body-wrap');
        wrap.innerHTML = `
          <div class="note-edit-area">
            <textarea>${escapeHtml(currentText)}</textarea>
            <div class="edit-actions">
              <button type="button" class="save" data-save-note="${escapeHtml(id)}">Save</button>
              <button type="button" class="cancel" data-cancel-edit>Cancel</button>
            </div>
          </div>
        `;
        const actionsRow = item.querySelector('.ai-actions');
        if (actionsRow) actionsRow.style.display = 'none';
        wrap.querySelector('textarea').focus();
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
          <td><span class="source-tag ${p.pathway === 'workplace' ? 'paid' : p.pathway === 'education' ? 'lead' : 'workshop'}">${escapeHtml(pathwayLabel)}</span></td>
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
  // Init — restore session if exists
  // ============================================================
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) enterApp(data.session.user);
    else enterLogin();
  });

})();
