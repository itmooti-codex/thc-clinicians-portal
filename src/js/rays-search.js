// thc-clinicians-portal — Rays Wellness Pharmacy product search
// Password-gated view. JWT (clinician magic-link) is required by the backend
// proxy at /api/clinician/rays/*; the page password is a second factor that
// must be supplied as the X-Rays-Password header on every search call.
(function () {
  'use strict';

  var API_BASE = (window.ClinicianAuth && window.ClinicianAuth.API_BASE) || '';
  var PW_STORAGE_KEY = 'thc-rays-pw';
  var initialised = false;

  function $(id) { return document.getElementById(id); }

  function authHeaders(extra) {
    var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    var token = window.ClinicianAuth && window.ClinicianAuth.getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function getCachedPassword() {
    try { return sessionStorage.getItem(PW_STORAGE_KEY) || ''; } catch (e) { return ''; }
  }

  function setCachedPassword(pw) {
    try { sessionStorage.setItem(PW_STORAGE_KEY, pw); } catch (e) { /* ignore */ }
  }

  function clearCachedPassword() {
    try { sessionStorage.removeItem(PW_STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function showSearchPanel() {
    var pw = $('rays-password-panel');
    var sp = $('rays-search-panel');
    if (pw) pw.classList.add('hidden');
    if (sp) sp.classList.remove('hidden');
    var input = $('rays-search-input');
    if (input) input.focus();
  }

  function showPasswordPanel() {
    var pw = $('rays-password-panel');
    var sp = $('rays-search-panel');
    if (pw) pw.classList.remove('hidden');
    if (sp) sp.classList.add('hidden');
    var input = $('rays-password-input');
    if (input) { input.value = ''; input.focus(); }
  }

  function setPasswordError(msg) {
    var el = $('rays-password-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function setSearchStatus(msg, isError) {
    var el = $('rays-search-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
    el.classList.toggle('error', !!isError);
  }

  function validatePassword(pw) {
    return fetch(API_BASE + '/api/clinician/rays/validate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ password: pw }),
    }).then(function (res) {
      if (res.status === 401) {
        window.ClinicianAuth && window.ClinicianAuth.logout();
        throw new Error('Session expired');
      }
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error((j && j.error) || 'Invalid password');
        }, function () { throw new Error('Invalid password'); });
      }
      return true;
    });
  }

  function search(term) {
    var pw = getCachedPassword();
    if (!pw) { showPasswordPanel(); return Promise.reject(new Error('No password cached')); }
    var url = API_BASE + '/api/clinician/rays/products?searchTerms=' +
      encodeURIComponent(term) + '&searchTermsMode=OR&showInactive=false';
    return fetch(url, {
      method: 'GET',
      headers: authHeaders({ 'X-Rays-Password': pw }),
    }).then(function (res) {
      if (res.status === 401) {
        window.ClinicianAuth && window.ClinicianAuth.logout();
        throw new Error('Session expired');
      }
      if (res.status === 403) {
        // Server rejected the cached password — re-prompt.
        clearCachedPassword();
        showPasswordPanel();
        setPasswordError('Password no longer valid — please re-enter.');
        throw new Error('Invalid password');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Rays API error ' + res.status));
        return data;
      });
    });
  }

  // Render whatever shape the Rays API returns. Tries common product fields
  // (name, sku, price, stock, brand, etc.) and falls back to a JSON dump.
  function render(data) {
    var out = $('rays-results');
    if (!out) return;
    out.innerHTML = '';

    var items = Array.isArray(data) ? data
      : (data && Array.isArray(data.products)) ? data.products
      : (data && Array.isArray(data.data)) ? data.data
      : (data && Array.isArray(data.items)) ? data.items
      : [];

    var countEl = $('rays-results-count');
    if (countEl) countEl.textContent = items.length + ' result' + (items.length === 1 ? '' : 's');

    if (!items.length) {
      out.innerHTML = '<p class="rays-empty">No products matched that search.</p>';
      return;
    }

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'rays-result-card';

      var name = item.name || item.productName || item.title || item.sku || 'Unnamed product';
      var sku = item.sku || item.code || item.id || '';
      var brand = item.brand || item.manufacturer || item.supplier || '';
      var price = item.price || item.priceIncGst || item.retailPrice || item.cost || '';
      var stock = (item.stockOnHand != null) ? item.stockOnHand
        : (item.stock != null) ? item.stock
        : (item.quantityOnHand != null) ? item.quantityOnHand : '';
      var active = (item.active != null) ? item.active
        : (item.isActive != null) ? item.isActive : null;

      var html = '<div class="rays-result-header">' +
        '<h4 class="rays-result-name">' + escapeHtml(String(name)) + '</h4>' +
        (sku ? '<span class="rays-result-sku">' + escapeHtml(String(sku)) + '</span>' : '') +
        '</div>';

      var meta = [];
      if (brand) meta.push('<span><strong>Brand:</strong> ' + escapeHtml(String(brand)) + '</span>');
      if (price !== '') meta.push('<span><strong>Price:</strong> $' + escapeHtml(String(price)) + '</span>');
      if (stock !== '') meta.push('<span><strong>Stock:</strong> ' + escapeHtml(String(stock)) + '</span>');
      if (active !== null) meta.push('<span><strong>Status:</strong> ' + (active ? 'Active' : 'Inactive') + '</span>');
      if (meta.length) html += '<div class="rays-result-meta">' + meta.join('') + '</div>';

      // Always include a collapsible raw JSON dump so clinicians can see every
      // field the API returned (helps when the standard fields above are empty
      // or named differently than expected).
      html += '<details class="rays-result-raw"><summary>Raw fields</summary>' +
        '<pre>' + escapeHtml(JSON.stringify(item, null, 2)) + '</pre></details>';

      card.innerHTML = html;
      out.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bindEvents() {
    var pwForm = $('rays-password-form');
    if (pwForm) {
      pwForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('rays-password-input');
        var btn = $('rays-password-submit');
        var pw = (input && input.value) || '';
        if (!pw) { setPasswordError('Enter the page password.'); return; }
        setPasswordError('');
        if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
        validatePassword(pw).then(function () {
          setCachedPassword(pw);
          showSearchPanel();
        }).catch(function (err) {
          setPasswordError(err.message || 'Invalid password');
        }).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
        });
      });
    }

    var searchForm = $('rays-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('rays-search-input');
        var btn = $('rays-search-submit');
        var term = (input && input.value || '').trim();
        if (!term) { setSearchStatus('Enter a search term.', true); return; }
        setSearchStatus('Searching…');
        if (btn) btn.disabled = true;
        var out = $('rays-results');
        if (out) out.innerHTML = '';
        var countEl = $('rays-results-count');
        if (countEl) countEl.textContent = '';
        search(term).then(function (data) {
          setSearchStatus('');
          render(data);
        }).catch(function (err) {
          setSearchStatus(err.message || 'Search failed', true);
        }).then(function () {
          if (btn) btn.disabled = false;
        });
      });
    }

    var lockBtn = $('rays-lock');
    if (lockBtn) {
      lockBtn.addEventListener('click', function () {
        clearCachedPassword();
        showPasswordPanel();
      });
    }
  }

  function init() {
    if (initialised) return;
    initialised = true;
    bindEvents();
    if (getCachedPassword()) {
      showSearchPanel();
    } else {
      showPasswordPanel();
    }
  }

  window.RaysSearch = { init: init };
})();
