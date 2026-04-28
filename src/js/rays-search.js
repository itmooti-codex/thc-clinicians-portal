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

  // Normalise comma-separated input → "curaleaf, cannatrek " → "curaleaf,cannatrek".
  // Rays' API supports comma-joined OR queries but is whitespace-sensitive
  // (a stray space changed 59 results to 33 in testing).
  function normaliseSearchTerm(raw) {
    return String(raw || '')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; })
      .join(',');
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

  // Format priceCents (integer cents) → "$89.00".
  function formatPrice(cents) {
    if (cents == null || cents === '') return '';
    var n = Number(cents);
    if (!isFinite(n)) return String(cents);
    return '$' + (n / 100).toFixed(2);
  }

  function render(data) {
    var out = $('rays-results');
    if (!out) return;
    out.innerHTML = '';

    // Rays API returns { results: [...] }. Other shapes kept as fallbacks
    // in case the API changes.
    var items = Array.isArray(data) ? data
      : (data && Array.isArray(data.results)) ? data.results
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

      var id = item._id || item.id || '';
      var brand = item.brandName || item.brand || '';
      var name = item.productName || item.name || item.concatSearchName || 'Unnamed product';
      var type = item.productType || '';
      var cannabisType = item.cannabisType || '';
      var size = (item.productSizeAmount != null && item.productSizeMeasure)
        ? (item.productSizeAmount + ' ' + item.productSizeMeasure) : '';
      var price = formatPrice(item.priceCents);
      var status = item.status || '';
      var inStock = item.inStock;
      var schedule = (item.tgaSchedule != null) ? item.tgaSchedule : '';
      var sasCat = (item.tgaSasCategory != null) ? item.tgaSasCategory : '';
      var inventory = item.inventory || {};
      var locationCount = Object.keys(inventory).length;

      var typeStr = [type, cannabisType].filter(Boolean).join(' · ');
      var tgaStr = [];
      if (schedule !== '') tgaStr.push('Schedule ' + escapeHtml(String(schedule)));
      if (sasCat !== '') tgaStr.push('SAS Cat ' + escapeHtml(String(sasCat)));

      var html = '';

      // Header: brand + product name + copy-ID button
      html += '<div class="rays-result-header">';
      html += '<div class="rays-result-title">';
      if (brand) html += '<div class="rays-result-brand">' + escapeHtml(brand) + '</div>';
      html += '<h4 class="rays-result-name">' + escapeHtml(name) + '</h4>';
      html += '</div>';
      if (id) {
        html += '<button type="button" class="rays-copy-id" data-copy="' + escapeHtml(id) +
          '" title="Click to copy ID">' +
          '<span class="rays-copy-id-value">' + escapeHtml(id) + '</span>' +
          '<span class="rays-copy-id-icon" aria-hidden="true">⧉</span>' +
          '</button>';
      }
      html += '</div>';

      // Field grid
      var grid = [];
      if (typeStr) grid.push(field('Type', typeStr));
      if (size) grid.push(field('Size', size));
      if (price) grid.push(field('Price', price));
      if (status) grid.push(field('Status', '<span class="rays-badge rays-badge-' +
        (status.toLowerCase() === 'active' ? 'active' : 'inactive') + '">' +
        escapeHtml(status) + '</span>'));
      if (inStock != null) grid.push(field('Stock',
        '<span class="rays-badge rays-badge-' + (inStock ? 'instock' : 'oos') + '">' +
        (inStock ? 'In stock' : 'Out of stock') + '</span>'));
      if (tgaStr.length) grid.push(field('TGA', tgaStr.join(' · ')));
      if (item.concatSearchName && item.concatSearchName !== name) {
        grid.push(field('Search name', escapeHtml(item.concatSearchName)));
      }
      if (grid.length) html += '<div class="rays-result-grid">' + grid.join('') + '</div>';

      // Inventory by location (collapsible)
      if (locationCount > 0) {
        html += '<details class="rays-inventory">' +
          '<summary>Inventory by location (' + locationCount + ')</summary>' +
          '<ul class="rays-inventory-list">';
        Object.keys(inventory).forEach(function (locId) {
          var loc = inventory[locId] || {};
          var bits = [];
          if (loc.isActive != null) bits.push(loc.isActive ? 'Active' : 'Inactive');
          if (loc.inStock != null) bits.push(loc.inStock ? 'In stock' : 'Out of stock');
          if (loc.notes) bits.push(escapeHtml(String(loc.notes)));
          html += '<li><button type="button" class="rays-copy-id rays-copy-id-sm" ' +
            'data-copy="' + escapeHtml(locId) + '" title="Copy location ID">' +
            '<span class="rays-copy-id-value">' + escapeHtml(locId) + '</span>' +
            '<span class="rays-copy-id-icon" aria-hidden="true">⧉</span></button> ' +
            '<span class="rays-inventory-meta">' + bits.join(' · ') + '</span></li>';
        });
        html += '</ul></details>';
      }

      // Raw JSON (always available, collapsed by default)
      html += '<details class="rays-result-raw"><summary>Raw JSON</summary>' +
        '<pre>' + escapeHtml(JSON.stringify(item, null, 2)) + '</pre></details>';

      card.innerHTML = html;
      out.appendChild(card);
    });
  }

  function field(label, valueHtml) {
    return '<div class="rays-field">' +
      '<span class="rays-label">' + escapeHtml(label) + '</span>' +
      '<span class="rays-value">' + valueHtml + '</span>' +
      '</div>';
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-secure contexts
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function flashCopied(btn) {
    var icon = btn.querySelector('.rays-copy-id-icon');
    if (!icon) return;
    var original = icon.textContent;
    icon.textContent = '✓';
    btn.classList.add('rays-copy-id-flash');
    setTimeout(function () {
      icon.textContent = original;
      btn.classList.remove('rays-copy-id-flash');
    }, 900);
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
        var term = normaliseSearchTerm(input && input.value);
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

    // Event delegation for copy-ID buttons (data-copy="..." attribute).
    var resultsEl = $('rays-results');
    if (resultsEl) {
      resultsEl.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.rays-copy-id');
        if (!btn) return;
        e.preventDefault();
        var text = btn.getAttribute('data-copy') || '';
        if (!text) return;
        copyToClipboard(text).then(function () {
          flashCopied(btn);
        }).catch(function () {
          setSearchStatus('Copy failed — your browser blocked clipboard access.', true);
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
