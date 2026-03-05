// thc-clinicians-portal — Main Application
// This is the project-specific entry point.
// Edit this file to build your app logic.
(function () {
  'use strict';

  var utils = window.AppUtils;

  document.addEventListener('DOMContentLoaded', function () {
    init();
  });

  function init() {
    window.VitalSync.connect()
      .then(function (plugin) {
        // SDK connected — hide loading, show content
        var loading = utils.byId('app-loading');
        var content = utils.byId('app-content');
        if (loading) loading.classList.add('hidden');
        if (content) content.classList.remove('hidden');

        if (window.AppConfig.DEBUG) {
          console.log('thc-clinicians-portal ready, plugin:', plugin);
        }

        // Build your app here using:
        //   plugin.switchTo('ModelName').query()...
        //   plugin.switchTo('ModelName').mutation()...
        //   utils.$(), utils.byId(), utils.formatCurrency(), etc.
      })
      .catch(function (err) {
        // Show error state
        var loading = utils.byId('app-loading');
        var errorEl = utils.byId('app-error');
        if (loading) loading.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
        console.error('App init failed:', err);
      });
  }
})();
