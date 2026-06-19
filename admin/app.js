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
  const notesList    = document.getElementById('notes-list');
  const noteForm     = document.getElementById('note-form');
  const noteInput    = document.getElementById('note-input');
  const noteSubmit   = document.getElementById('note-submit');
  const noteError    = document.getElementById('note-error');

  // ============================================================
  // State
  // ============================================================
  let magicLinkMode = false;
  let currentUser = null;
  let currentRole = null;
  let allCustomers = []; // cached list, refreshed on customers view enter
  let currentFilter = 'all';
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

    // Defensive: clear any stale Supabase auth tokens before login.
    // Fixes "spinner hangs forever" issue caused by corrupted session state
    // left in localStorage from earlier failed/expired sessions.
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.startsWith('supabase.'))) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

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
    const { error } = await sb.auth.signInWithPassword({ email, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    if (error) { showError(errorEl, error.message); return; }
    // onAuthStateChange handles the rest
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.hash = '';
  });

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      await enterApp(session.user);
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
    const { data: roles } = await sb
      .from('user_roles').select('role').eq('user_id', user.id).limit(1);
    if (!roles || !roles.length) {
      showError(errorEl, 'Your account exists but no team role is assigned yet. Ask Osil to add you to user_roles.');
      await sb.auth.signOut();
      return;
    }

    currentUser = user;
    currentRole = roles[0].role;

    userEmailEl.textContent = user.email || '(no email)';
    userRoleEl.textContent  = currentRole;
    const display = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
                    || (user.email || '').split('@')[0];
    welcomeNameEl.textContent = `Welcome, ${display}.`;

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
    const [route, ...rest] = hash.split('/');
    const param = rest.join('/');

    // Hide all views
    viewDashboard.classList.add('hidden');
    viewCustomers.classList.add('hidden');
    viewCustomer.classList.add('hidden');

    // Highlight active nav
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-route') === (route || 'dashboard'));
    });

    if (route === 'customers') {
      viewCustomers.classList.remove('hidden');
      loadCustomerList();
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
      if (currentFilter !== 'all') {
        if (!c.sources.has(currentFilter)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      customerTable.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      return;
    }

    listEmpty.classList.add('hidden');
    customerTable.classList.remove('hidden');

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

  // ============================================================
  // Customer detail
  // ============================================================
  let currentDetailEmail = null;

  async function loadCustomerDetail(email) {
    currentDetailEmail = email.toLowerCase().trim();
    cdLoading.classList.remove('hidden');
    cdContent.classList.add('hidden');
    cdError.classList.add('hidden');

    const [contactRes, cohortRes, notesRes] = await Promise.all([
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
    ]);

    cdLoading.classList.add('hidden');

    const contact = (contactRes.data || [])[0] || null;
    const cohort  = (cohortRes.data || [])[0] || null;
    const notes   = notesRes.data || [];

    if (!contact && !cohort) {
      cdError.classList.remove('hidden');
      return;
    }
    cdContent.classList.remove('hidden');

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

    // Notes
    renderNotes(notes);
  }

  function renderNotes(notes) {
    if (!notes.length) {
      notesList.innerHTML = '<div class="notes-empty">No notes yet. Be the first.</div>';
      return;
    }
    notesList.innerHTML = notes.map((n) => `
      <div class="note">
        <div class="note-head">
          <span class="note-author">${escapeHtml(n.author_email || '(unknown)')}</span>
          <span class="note-date">${escapeHtml(fmtDateTime(n.created_at))}</span>
        </div>
        <p class="note-body">${escapeHtml(n.body)}</p>
      </div>
    `).join('');
  }

  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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

    if (error) {
      showError(noteError, `Couldn't save: ${error.message}`);
      return;
    }

    noteInput.value = '';

    // Refresh notes list
    const { data: notes } = await sb.from('customer_notes')
      .select('id, body, author_id, author_email, created_at, updated_at')
      .ilike('customer_email', currentDetailEmail)
      .order('created_at', { ascending: false }).limit(200);
    renderNotes(notes || []);
  });

  // ============================================================
  // Init — restore session if exists
  // ============================================================
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) enterApp(data.session.user);
    else enterLogin();
  });

})();
