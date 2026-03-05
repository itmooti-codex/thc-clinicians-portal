// thc-clinicians-portal — VitalSync SDK Wrapper
// Vanilla JS wrapper for the VitalSync SDK (loaded via CDN).
// Exposes window.VitalSync with connect/getPlugin/getStatus/onStatusChange.
(function () {
  'use strict';

  var plugin = null;
  var status = 'loading'; // loading | connected | error
  var listeners = [];

  function setStatus(newStatus) {
    status = newStatus;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](status); } catch (e) { console.error('VitalSync listener error:', e); }
    }
  }

  function onStatusChange(callback) {
    listeners.push(callback);
    return function () {
      listeners = listeners.filter(function (fn) { return fn !== callback; });
    };
  }

  // Wait for the VitalSync SDK script to load
  function waitForSDK(maxWait) {
    maxWait = maxWait || 10000;
    return new Promise(function (resolve, reject) {
      var elapsed = 0;
      var interval = 100;
      var timer = setInterval(function () {
        elapsed += interval;
        if (typeof window.initVitalStatsSDK === 'function') {
          clearInterval(timer);
          resolve();
        } else if (elapsed >= maxWait) {
          clearInterval(timer);
          reject(new Error('VitalSync SDK failed to load after ' + maxWait + 'ms'));
        }
      }, interval);
    });
  }

  // Connect to VitalSync
  function connect() {
    var config = window.AppConfig || {};
    if (!config.SLUG) {
      setStatus('error');
      return Promise.reject(new Error('AppConfig.SLUG is not set'));
    }

    setStatus('loading');

    return waitForSDK()
      .then(function () {
        return window
          .initVitalStatsSDK({
            slug: config.SLUG,
            apiKey: config.API_KEY || '',
            isDefault: true,
          })
          .toPromise();
      })
      .then(function (initResult) {
        plugin = (initResult && initResult.plugin) || (window.getVitalStatsPlugin && window.getVitalStatsPlugin());

        if (!plugin) {
          throw new Error('Plugin not available after initialization');
        }

        setStatus('connected');
        if (config.DEBUG) console.log('VitalSync connected');
        return plugin;
      })
      .catch(function (err) {
        setStatus('error');
        console.error('VitalSync connection failed:', err);
        throw err;
      });
  }

  function getPlugin() {
    return plugin;
  }

  function getStatus() {
    return status;
  }

  // Expose on window
  window.VitalSync = {
    connect: connect,
    getPlugin: getPlugin,
    getStatus: getStatus,
    onStatusChange: onStatusChange,
  };
})();
