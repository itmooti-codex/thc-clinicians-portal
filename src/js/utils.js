// thc-clinicians-portal Utilities
// DOM helpers, formatters, toast notifications, page loader.
(function () {
  'use strict';

  // ── DOM Helpers ──────────────────────────────────────────────

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function byId(id) {
    return document.getElementById(id);
  }

  // ── Formatters ───────────────────────────────────────────────

  function formatCurrency(amount, currency, locale) {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat(locale || 'en-AU', {
      style: 'currency',
      currency: currency || 'AUD',
    }).format(amount);
  }

  function formatDate(ts, locale) {
    if (!ts) return 'N/A';
    try {
      var date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
      return date.toLocaleDateString(locale || 'en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return 'N/A';
    }
  }

  function toNum(str) {
    var n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(text) {
    if (!text) return '';
    var d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }

  // ── Page Loader ──────────────────────────────────────────────

  var loaderEl = null;
  var loaderMsgEl = null;

  function ensureLoader() {
    if (loaderEl) return;
    loaderEl = document.createElement('div');
    loaderEl.id = 'page-loader-overlay';
    loaderEl.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(255,255,255,0.85);opacity:0;transition:opacity 0.2s;pointer-events:none;';
    loaderEl.innerHTML =
      '<div style="text-align:center">' +
      '<div class="loading-spinner" style="width:32px;height:32px;margin:0 auto 12px"></div>' +
      '<p id="page-loader-msg" style="font-size:13px;color:#666"></p>' +
      '</div>';
    document.body.appendChild(loaderEl);
    loaderMsgEl = byId('page-loader-msg');
  }

  function showPageLoader(msg) {
    ensureLoader();
    if (msg && loaderMsgEl) loaderMsgEl.textContent = msg;
    loaderEl.style.opacity = '1';
    loaderEl.style.pointerEvents = 'auto';
  }

  function hidePageLoader() {
    if (!loaderEl) return;
    loaderEl.style.opacity = '0';
    loaderEl.style.pointerEvents = 'none';
    if (loaderMsgEl) loaderMsgEl.textContent = '';
  }

  function setPageLoaderMessage(msg) {
    ensureLoader();
    if (loaderMsgEl) loaderMsgEl.textContent = msg || '';
  }

  function withPageLoader(promise, msg) {
    showPageLoader(msg);
    return promise.finally(hidePageLoader);
  }

  // ── Toast Notifications ──────────────────────────────────────

  var toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer) return;
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(toastContainer);
  }

  var TOAST_STYLES = {
    success: { bg: '#f0fdf4', border: '#16a34a', color: '#15803d' },
    error: { bg: '#fef2f2', border: '#dc2626', color: '#b91c1c' },
    warning: { bg: '#fffbeb', border: '#d97706', color: '#92400e' },
    info: { bg: '#eff6ff', border: '#2563eb', color: '#1e40af' },
  };

  function showToast(message, type, duration) {
    ensureToastContainer();
    type = type || 'info';
    duration = duration || 4000;
    var s = TOAST_STYLES[type] || TOAST_STYLES.info;

    var toast = document.createElement('div');
    toast.style.cssText =
      'padding:12px 20px;border-radius:8px;font-size:14px;max-width:360px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.1);opacity:0;transition:opacity 0.2s;' +
      'background:' + s.bg + ';border:1px solid ' + s.border + ';color:' + s.color + ';';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Fade in
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
    });

    // Auto dismiss
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, duration);
  }

  // ── Product Search Helpers ───────────────────────────────────

  // Terpene fields — include name in haystack if concentration >= 0.1%
  var TERPENE_FIELDS = [
    'myrcene', 'limonene', 'beta_caryophyllene', 'linalool', 'trans_caryophyllene',
    'ocimene', 'farnesene', 'alpha_pinene', 'beta_pinene', 'humulene', 'terpinolene',
  ];

  // Pretty names for matching (e.g. "beta-caryophyllene" as well as "beta_caryophyllene")
  var TERPENE_DISPLAY_NAMES = {
    myrcene: ['myrcene'],
    limonene: ['limonene'],
    beta_caryophyllene: ['beta-caryophyllene', 'caryophyllene'],
    linalool: ['linalool'],
    trans_caryophyllene: ['trans-caryophyllene', 'caryophyllene'],
    ocimene: ['ocimene'],
    farnesene: ['farnesene'],
    alpha_pinene: ['alpha-pinene', 'pinene'],
    beta_pinene: ['beta-pinene', 'pinene'],
    humulene: ['humulene'],
    terpinolene: ['terpinolene'],
  };

  // Build a lowercase search string for a product combining name, brand, chemovar,
  // dominance, lineage, conditions, benefits, and any terpenes >0.1%.
  // Note: Ontraport stores conditions/benefits as star-delimited option IDs
  // (numeric IDs wrapped in star-slash delimiters) — we decode via window.AppLabels.
  function buildProductHaystack(item) {
    if (!item) return '';
    var parts = [
      item.item_name, item.brand, item.chemovar, item.dominance, item.sativa_indica,
      item.sub_type, item.type,
      item.dominant_terpenes_options_as_text,
    ];

    // Decode condition/benefit option IDs to human-readable names
    var labels = window.AppLabels;
    if (labels && labels.parseOptionIds) {
      if (item.conditions_options_as_text) {
        parts.push(labels.parseOptionIds(item.conditions_options_as_text, labels.CONDITIONS).join(' '));
      }
      if (item.benefits_options_as_text) {
        parts.push(labels.parseOptionIds(item.benefits_options_as_text, labels.BENEFITS).join(' '));
      }
    } else {
      // Fallback: include raw text in case AppLabels isn't loaded yet
      parts.push(item.conditions_options_as_text, item.benefits_options_as_text);
    }

    // Add terpene names for any terpene present >= 0.1%
    for (var i = 0; i < TERPENE_FIELDS.length; i++) {
      var f = TERPENE_FIELDS[i];
      var val = parseFloat(item[f]);
      if (!isNaN(val) && val >= 0.1) {
        var names = TERPENE_DISPLAY_NAMES[f] || [f];
        parts.push(names.join(' '));
      }
    }
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  /**
   * Parse a search query into lowercase tokens.
   * Respects quoted phrases: 'anxiety "chronic pain"' → ['anxiety', 'chronic pain']
   * Commas and whitespace both act as separators.
   */
  function parseSearchQuery(query) {
    if (!query || !query.trim()) return [];
    var tokens = [];
    var str = query.trim();
    // Extract quoted phrases first
    var quoteRegex = /"([^"]+)"/g;
    var m;
    while ((m = quoteRegex.exec(str)) !== null) {
      var phrase = m[1].trim();
      if (phrase) tokens.push(phrase.toLowerCase());
    }
    // Remove quoted portions, then split the rest on commas/whitespace
    var remainder = str.replace(/"[^"]+"/g, ' ');
    var raw = remainder.split(/[\s,]+/);
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].trim().toLowerCase();
      if (t) tokens.push(t);
    }
    return tokens;
  }

  /**
   * Returns true if every token appears as a substring in haystack.
   */
  function matchesAllTokens(haystack, tokens) {
    if (!tokens || tokens.length === 0) return true;
    if (!haystack) return false;
    for (var i = 0; i < tokens.length; i++) {
      if (haystack.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  // ── Expose on window ─────────────────────────────────────────

  window.AppUtils = {
    $: $,
    $$: $$,
    byId: byId,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    toNum: toNum,
    clamp: clamp,
    escapeHtml: escapeHtml,
    showPageLoader: showPageLoader,
    hidePageLoader: hidePageLoader,
    setPageLoaderMessage: setPageLoaderMessage,
    withPageLoader: withPageLoader,
    showToast: showToast,
    buildProductHaystack: buildProductHaystack,
    parseSearchQuery: parseSearchQuery,
    matchesAllTokens: matchesAllTokens,
  };
})();
