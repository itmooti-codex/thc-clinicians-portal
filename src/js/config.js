// thc-clinicians-portal Configuration
// In production (Ontraport), window.AppConfig is set by merge fields in header code.
// In development, values come from dev/mock-data.js.
(function () {
  'use strict';

  window.AppConfig = window.AppConfig || {};

  var config = window.AppConfig;

  // Defaults — overridden by Ontraport header code or dev mock data
  config.SLUG = config.SLUG || 'thc';
  config.API_KEY = config.API_KEY || '';
  config.CONTACT_ID = config.CONTACT_ID || '';
  config.DEBUG = config.DEBUG || false;

  // GitHub Pages CDN base URL (auto-set by scaffold)
  config.CDN_BASE = config.CDN_BASE || 'https://itmooti-codex.github.io/thc-clinicians-portal';

  Object.freeze(config);
})();
