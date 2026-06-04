// lib/refresh-form.js
// Shared form logic for the four refresh-* intake pages
// (refresh-groups, refresh-corporate, refresh-education, refresh-faith).
// Loaded as a regular <script> tag — sets window.initRefreshForm.

(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function showError(el, msg) {
    var wrap = el.closest('.form-field') || el.parentElement;
    var err = wrap.querySelector('.field-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'field-error';
      wrap.appendChild(err);
    }
    err.textContent = msg;
    el.setAttribute('aria-invalid', 'true');
  }

  function clearErrors(form) {
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    $$('[aria-invalid]', form).forEach(function (e) { e.removeAttribute('aria-invalid'); });
    var submitErr = $('.submit-error', form.parentElement);
    if (submitErr) submitErr.remove();
  }

  function validate(form, audienceType) {
    clearErrors(form);
    var ok = true;

    var email = $('[name=email]', form);
    var phone = $('[name=phone]', form);
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test((email.value || '').trim())) {
      showError(email, 'Please enter a valid email.');
      ok = false;
    }
    if ((phone.value || '').replace(/\D/g, '').length < 10) {
      showError(phone, 'Phone must have at least 10 digits.');
      ok = false;
    }

    var required = [
      'full_name', 'email', 'phone',
      'group_type', 'preferred_group_time',
      'reason_for_interest', 'area_needing_refresh',
      'previous_rebe_experience', 'readiness'
    ];
    if (audienceType === 'corporate' || audienceType === 'education') {
      required.push('organization_name', 'role_title');
    }
    required.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      if (el.type === 'radio') {
        var checked = form.querySelector('[name="' + name + '"]:checked');
        if (!checked) {
          showError(el, 'Please pick one.');
          ok = false;
        }
      } else if (!el.value || !el.value.trim()) {
        showError(el, 'Required.');
        ok = false;
      }
    });

    ['consent_to_contact', 'consent_to_confidentiality'].forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el.checked) {
        showError(el, 'Please check this box to continue.');
        ok = false;
      }
    });

    if (!ok) {
      var firstError = $('.field-error', form);
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  function collectPayload(form, audienceType) {
    var fd = new FormData(form);
    var p = {};
    fd.forEach(function (v, k) {
      // For multi-select radios, only one value lands per name in FormData — that's correct.
      p[k] = typeof v === 'string' ? v.trim() : v;
    });
    p.audience_type = audienceType;
    p.previous_rebe_experience = p.previous_rebe_experience === 'yes';
    p.consent_to_contact = !!form.querySelector('[name="consent_to_contact"]').checked;
    p.consent_to_confidentiality = !!form.querySelector('[name="consent_to_confidentiality"]').checked;
    // Strip optional empty strings to null so they land cleanly in Postgres
    ['organization_name', 'role_title', 'notes'].forEach(function (k) {
      if (!p[k]) p[k] = null;
    });
    return p;
  }

  function showSubmitError(form, msg, contact) {
    var existing = form.parentElement.querySelector('.submit-error');
    if (existing) existing.remove();
    var box = document.createElement('div');
    box.className = 'submit-error';
    box.innerHTML = msg + ' Please try again or email <a href="mailto:' + contact + '">' + contact + '</a>.';
    form.parentElement.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showPostSubmit(opts, readiness, signupId) {
    var zone = opts.postSubmitZone;
    var calendly = opts.calendlyUrl || '#';
    var contact = opts.contactEmail || 'hello@justrebe.com';
    var price = opts.priceDisplay || '$XXX';
    var paypalInit = opts.paypalInit;

    zone.style.display = 'block';

    if (readiness === 'ready_to_pay') {
      zone.innerHTML =
        '<h3 class="post-h">You’re almost there — let’s reserve your seat.</h3>' +
        '<p class="post-recap">ReBe ReFresh · 6 weeks · ' + price + '</p>' +
        '<div id="paypal-button-container"></div>' +
        '<p class="post-help">Need help? Email <a href="mailto:' + contact + '">' + contact + '</a>.</p>';
      var container = $('#paypal-button-container', zone);
      if (typeof paypalInit === 'function') {
        paypalInit(container, signupId);
      } else {
        container.innerHTML =
          '<p class="paypal-pending">Payment will be available shortly. We’ll email you when it’s ready. ' +
          'Need it sooner? Email <a href="mailto:' + contact + '">' + contact + '</a>.</p>';
      }
    } else if (readiness === 'wants_intake_call') {
      zone.innerHTML =
        '<h3 class="post-h">Let’s talk first.</h3>' +
        '<p>A quick conversation is a great way to feel if this is the right fit.</p>' +
        '<a class="btn btn-primary btn-large" href="' + calendly + '" target="_blank" rel="noopener noreferrer">Book Your Intake Call</a>' +
        '<p class="post-help">We have your details. After your call, we’ll send next steps.</p>';
    } else if (readiness === 'waitlist') {
      zone.innerHTML =
        '<h3 class="post-h">You’re on the list.</h3>' +
        '<p>We have your details. As soon as the next cohort is scheduled (or a seat opens in the current one), we’ll reach out with the new dates and how to confirm your seat.</p>' +
        '<p class="post-help">Questions in the meantime? Email <a href="mailto:' + contact + '">' + contact + '</a>.</p>';
    } else {
      zone.innerHTML =
        '<h3 class="post-h">Thank you.</h3>' +
        '<p>We received your details. You’ll hear from us within 48 hours with more about ReBe ReFresh, upcoming cohort dates, and how to take the next step when you’re ready.</p>';
    }

    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.initRefreshForm = function (opts) {
    // opts: { form, postSubmitZone, audienceType, supabase, calendlyUrl, contactEmail, priceDisplay, paypalInit? }
    var form = opts.form;
    var supabase = opts.supabase;
    var audienceType = opts.audienceType;

    if (!form) {
      console.error('initRefreshForm: missing form element');
      return;
    }
    if (!supabase) {
      console.error('initRefreshForm: missing supabase client');
      return;
    }

    // Detect demo mode: if Supabase URL is still a placeholder, simulate the
    // post-submit flow without attempting a real save. Once the real URL is
    // pasted in, this branch is bypassed automatically.
    var supabaseUrl = '';
    try { supabaseUrl = supabase.supabaseUrl || ''; } catch (e) { supabaseUrl = ''; }
    var isDemo = supabaseUrl.indexOf('REPLACE_WITH') >= 0 || supabaseUrl === '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form, audienceType)) return;

      var submitBtn = form.querySelector('[type=submit]');
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      var payload = collectPayload(form, audienceType);

      if (isDemo) {
        // Show the proper post-submit view after a short pause so it feels real.
        setTimeout(function () {
          form.style.display = 'none';
          var intro = form.parentNode && form.parentNode.querySelector('.form-intro');
          if (intro) intro.style.display = 'none';
          showPostSubmit(opts, payload.readiness, 'demo-preview');
        }, 600);
        return;
      }

      // Call the SECURITY DEFINER RPC instead of a direct INSERT — anon doesn't
      // have SELECT on refresh_signups, so .insert().select('id') was failing
      // on the response read-back. Same pattern as confidant-form.js.
      supabase
        .rpc('submit_cohort_signup', {
          p_full_name:                  payload.full_name || null,
          p_email:                      payload.email || null,
          p_phone:                      payload.phone || null,
          p_audience_type:              payload.audience_type || null,
          p_organization_name:          payload.organization_name || null,
          p_role_title:                 payload.role_title || null,
          p_group_type:                 payload.group_type || null,
          p_preferred_group_time:       payload.preferred_group_time || null,
          p_reason_for_interest:        payload.reason_for_interest || null,
          p_area_needing_refresh:       payload.area_needing_refresh || null,
          p_area_other:                 payload.area_other || null,
          p_previous_rebe_experience:   payload.previous_rebe_experience,
          p_readiness:                  payload.readiness || null,
          p_notes:                      payload.notes || null,
          p_who_referred_you:           payload.who_referred_you || null,
          p_referral_code:              payload.referral_code || null,
          p_consent_to_contact:         payload.consent_to_contact,
          p_consent_to_confidentiality: payload.consent_to_confidentiality
        })
        .then(function (res) {
          if (res.error || !res.data) {
            console.error('RPC submit_cohort_signup error', res.error || res.data);
            showSubmitError(form, 'Something went wrong saving your details.', opts.contactEmail);
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
            return;
          }
          form.style.display = 'none';
          var intro = form.parentNode && form.parentNode.querySelector('.form-intro');
          if (intro) intro.style.display = 'none';
          // RPC returns the new row's uuid as a plain string.
          showPostSubmit(opts, payload.readiness, res.data);
        })
        .catch(function (err) {
          console.error('Network error', err);
          showSubmitError(form, 'Network error saving your details.', opts.contactEmail);
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });
  };
})();
