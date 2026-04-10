// thc-clinicians-portal — Authentication Module
// Magic-link login via shared THC Portal backend.
// Must load BEFORE config.js (sets CONTACT_ID from JWT).
(function () {
  'use strict';

  var STORAGE_KEY = 'thc-clinician-session';
  // In dev, the API is on the thc-portal Express server (port 4020)
  // In production, same domain (/api) via nginx reverse proxy
  var IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  var API_BASE = IS_DEV ? 'http://localhost:4020' : '';

  var session = null; // { token, contactId, email, firstName, lastName, role }

  // ── Session persistence ──

  function saveSession(data) {
    session = data;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return session;
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // ── Public API ──

  /** Returns the current JWT token string, or null if not authenticated. */
  function getToken() {
    return session ? session.token : null;
  }

  /** Returns the stored session object, or null. */
  function getSession() {
    return session;
  }

  /** Request a magic link email. Returns a promise that rejects if not a clinician. */
  function requestMagicLink(email) {
    return fetch(API_BASE + '/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, requiredRole: 'clinician' }),
    }).then(function (res) {
      if (res.status === 403) {
        return res.json().then(function (data) {
          throw new Error(data.error || 'This email is not registered as a clinician.');
        });
      }
      return res.json();
    });
  }

  /** Verify a magic link token. Returns { sessionToken, contactId, role, ... } */
  function verifyToken(token) {
    return fetch(API_BASE + '/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Verification failed');
      return res.json();
    });
  }

  /** Validate an existing session token with the server. */
  function validateSession(token) {
    return fetch(API_BASE + '/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Session invalid');
      return res.json();
    });
  }

  /** Log out — clear session and reload. */
  function logout() {
    clearSession();
    window.location.reload();
  }

  // ── Init: check URL for ?token= (magic link callback) ──

  function handleMagicLinkCallback() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');
    if (!token) return Promise.resolve(false);

    // Clean the URL
    var cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    return verifyToken(token).then(function (data) {
      if (data.role !== 'clinician') {
        // Patient tried to access clinician portal — redirect
        var patientUrl = IS_DEV ? 'http://localhost:5173' : '/';
        window.location.href = patientUrl;
        return false;
      }
      saveSession({
        token: data.sessionToken,
        contactId: data.contactId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      });
      return true;
    });
  }

  // ── Boot: called by the login UI after DOM is ready ──

  /**
   * Initialize auth. Returns a promise that resolves to:
   *   { authenticated: true } — app should show main content
   *   { authenticated: false } — app should show login form
   */
  function init() {
    console.log('[auth] init() starting');
    // 1. Check for magic link callback
    return handleMagicLinkCallback().then(function (verified) {
      if (verified) {
        console.log('[auth] magic link verified, session:', session);
        applySession();
        return { authenticated: true };
      }

      // 2. Check stored session
      var stored = loadSession();
      console.log('[auth] stored session:', stored ? { token: stored.token ? stored.token.slice(0, 20) + '...' : null, contactId: stored.contactId, role: stored.role } : null);
      if (!stored || !stored.token) {
        console.log('[auth] no stored session — showing login');
        return { authenticated: false };
      }

      // 3. Validate stored token with server
      console.log('[auth] validating token with server at:', API_BASE + '/api/auth/session');
      return validateSession(stored.token).then(function (result) {
        console.log('[auth] validation result:', result);
        if (result.valid && (result.role === 'clinician' || stored.role === 'clinician')) {
          applySession();
          console.log('[auth] authenticated as clinician');
          return { authenticated: true };
        }
        console.log('[auth] validation passed but role mismatch — clearing');
        clearSession();
        return { authenticated: false };
      }).catch(function (err) {
        console.log('[auth] validation failed:', err.message);
        clearSession();
        return { authenticated: false };
      });
    });
  }

  /** Set AppConfig.CONTACT_ID from session so existing app.js works unchanged. */
  function applySession() {
    if (session && session.contactId) {
      window.AppConfig = window.AppConfig || {};
      window.AppConfig.CONTACT_ID = String(session.contactId);
    }
  }

  // ── Expose on window ──

  window.ClinicianAuth = {
    init: init,
    getToken: getToken,
    getSession: getSession,
    requestMagicLink: requestMagicLink,
    logout: logout,
    API_BASE: API_BASE,
  };
})();
