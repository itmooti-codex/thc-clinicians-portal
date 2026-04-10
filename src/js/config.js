// thc-clinicians-portal Configuration
// In production (Ontraport), window.AppConfig is set by merge fields in header code.
// In development, values come from dev/mock-data.js.
(function () {
  'use strict';

  window.AppConfig = window.AppConfig || {};

  var config = window.AppConfig;

  // Defaults — CONTACT_ID set by auth.js from JWT before config.js loads
  config.SLUG = config.SLUG || 'thc';
  config.CONTACT_ID = config.CONTACT_ID || '';
  config.DEBUG = config.DEBUG || false;

  // GitHub Pages CDN base URL (auto-set by scaffold)
  config.CDN_BASE = config.CDN_BASE || 'https://itmooti-codex.github.io/thc-clinicians-portal';

  Object.freeze(config);
})();
