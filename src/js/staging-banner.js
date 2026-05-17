// Persistent red banner shown when the clinicians portal is running against
// the staging environment. Self-contained — no dependencies, no globals
// leaked beyond the immediately-invoked function. Belt-and-suspenders
// detection so the banner appears even before any infra/build-flag plumbing:
//
//   - <meta name="environment" content="staging"> in the host index.html
//   - hostname is exactly "my-staging.thehappy.clinic"
//
// Either signal triggers the banner. Renders nothing otherwise.
//
// Sticky at top of viewport so any scrolling page keeps the banner visible —
// staging users should never forget which environment they're in.

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var STAGING_HOSTNAME = 'my-staging.thehappy.clinic';

  function isStaging() {
    var metaTag = document.querySelector('meta[name="environment"]');
    if (metaTag && metaTag.getAttribute('content') === 'staging') return true;
    if (window.location.hostname === STAGING_HOSTNAME) return true;
    return false;
  }

  function injectBanner() {
    if (!isStaging()) return;
    if (document.getElementById('thc-staging-banner')) return; // idempotent

    var banner = document.createElement('div');
    banner.id = 'thc-staging-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-label', 'Staging environment');
    banner.textContent = 'STAGING ENVIRONMENT — mutations restricted to STAGING-tagged records';
    banner.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:9999',
      'width:100%',
      'background-color:#c0392b',
      'color:#fff',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:0.02em',
      'text-align:center',
      'padding:6px 12px',
      'box-shadow:0 2px 4px rgba(0,0,0,0.15)',
    ].join(';');

    if (document.body) {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner, { once: true });
  } else {
    injectBanner();
  }
})();
