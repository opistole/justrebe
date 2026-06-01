// lib/confidant-form.js
// Handler for the 1:1 confidant request form (refresh-private.html, linked from refresh-faith.html).
// Loaded as a regular <script> tag — sets window.initConfidantForm.

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

  function validate(form) {
    clearErrors(form);
    var ok = true;

    var email = $('[name=email]', form);
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test((email.value || '').trim())) {
      showError(email, 'Please enter a valid email.');
      ok = false;
    }

    var required = ['name', 'email', 'preferred_confidant', 'situation'];
    required.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      if (!el.value || !el.value.trim()) {
        showError(el, 'Required.');
        ok = false;
      }
    });

    var consent = form.querySelector('[name="consent_to_contact"]');
    if (!consent.checked) {
      showError(consent, 'Please check this box to continue.');
      ok = false;
    }

    if (!ok) {
      var firstError = $('.field-error', form);
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  function collectPayload(form) {
    var fd = new FormData(form);
    var p = {};
    fd.forEach(function (v, k) {
      p[k] = typeof v === 'string' ? v.trim() : v;
    });
    // Drop the consent checkbox from the row (it's not a saved field)
    delete p.consent_to_contact;
    // Optional fields → null when empty
    ['phone', 'best_times'].forEach(function (k) {
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

  function showPostSubmit(opts, payload, requestId) {
    var zone = opts.postSubmitZone;
    var contact = opts.contactEmail || 'hello@justrebe.com';
    var price = opts.priceDisplay || '$197';
    var paypalInit = opts.paypalInit;

    zone.style.display = 'block';
    zone.innerHTML =
      '<h3 class="post-h">You&rsquo;re in. One last step.</h3>' +
      '<p class="post-recap">Private 1:1 session &middot; ' + price + ' &middot; ' +
      payload.preferred_confidant + '</p>' +
      '<div id="paypal-button-container-1on1"></div>' +
      '<p class="post-help">After payment, ' +
      (payload.preferred_confidant === 'No preference'
        ? 'we&rsquo;ll match you and your confidant will reach out within 48 hours'
        : payload.preferred_confidant + ' will reach out within 48 hours') +
      ' to schedule. Questions? Email <a href="mailto:' + contact + '">' + contact + '</a>.</p>';

    var container = $('#paypal-button-container-1on1', zone);
    if (typeof paypalInit === 'function') {
      paypalInit(container, requestId);
    } else {
      container.innerHTML =
        '<p class="paypal-pending">Payment will be available shortly. We&rsquo;ll email you when it&rsquo;s ready, ' +
        'or you can email <a href="mailto:' + contact + '">' + contact + '</a> to arrange it now.</p>';
    }

    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.initConfidantForm = function (opts) {
    // opts: { form, postSubmitZone, supabase, contactEmail, priceDisplay, paypalInit? }
    var form = opts.form;
    var supabase = opts.supabase;

    if (!form) {
      console.error('initConfidantForm: missing form element');
      return;
    }
    if (!supabase) {
      console.error('initConfidantForm: missing supabase client');
      return;
    }

    // Demo mode: if Supabase URL is still a placeholder, simulate the post-submit
    // flow without attempting a real save. Once the real URL is pasted in, this
    // branch is bypassed automatically.
    var supabaseUrl = '';
    try { supabaseUrl = supabase.supabaseUrl || ''; } catch (e) { supabaseUrl = ''; }
    var isDemo = supabaseUrl.indexOf('REPLACE_WITH') >= 0 || supabaseUrl === '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form)) return;

      var submitBtn = form.querySelector('[type=submit]');
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      var payload = collectPayload(form);

      if (isDemo) {
        setTimeout(function () {
          form.style.display = 'none';
          var intro = form.parentNode && form.parentNode.querySelector('.form-intro');
          if (intro) intro.style.display = 'none';
          showPostSubmit(opts, payload, 'demo-preview');
        }, 600);
        return;
      }

      supabase
        .from('confidant_requests')
        .insert(payload)
        .select('id')
        .single()
        .then(function (res) {
          if (res.error) {
            console.error('Supabase insert error', res.error);
            showSubmitError(form, 'Something went wrong saving your details.', opts.contactEmail);
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
            return;
          }
          form.style.display = 'none';
          var intro = form.parentNode && form.parentNode.querySelector('.form-intro');
          if (intro) intro.style.display = 'none';
          showPostSubmit(opts, payload, res.data.id);
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
