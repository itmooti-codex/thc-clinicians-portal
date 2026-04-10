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
            apiKey: config.API_KEY || '', // API_KEY no longer in config (proxy handles auth) — SDK init is optional
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

  /**
   * Convert SDK records to plain objects (getState extracts non-enumerable props).
   * fetchAllRecords() with toMainInstance returns an Object keyed by PK, not an Array.
   * This converts both cases to an Array of plain objects.
   */
  function toPlain(data) {
    if (Array.isArray(data)) {
      return data.map(function (r) { return r && r.getState ? r.getState() : r; });
    }
    if (data && typeof data === 'object' && !data.getState) {
      // Object keyed by PK — keys may be non-enumerable, so use getOwnPropertyNames
      var keys = Object.getOwnPropertyNames(data);
      return keys.map(function (key) {
        var r = data[key];
        return r && r.getState ? r.getState() : r;
      });
    }
    return data && data.getState ? data.getState() : data;
  }

  /**
   * Subscribe to an observable, resolve on first emission, auto-unsubscribe.
   * Records are converted to plain objects automatically.
   */
  function fetchOnce(observable) {
    return new Promise(function (resolve, reject) {
      var sub;
      sub = observable.subscribe({
        next: function (data) {
          if (sub) sub.unsubscribe();
          resolve(toPlain(data));
        },
        error: function (err) {
          reject(err);
        },
      });
    });
  }

  // Expose on window
  window.VitalSync = {
    connect: connect,
    getPlugin: getPlugin,
    getStatus: getStatus,
    onStatusChange: onStatusChange,
    fetchOnce: fetchOnce,
    toPlain: toPlain,
  };
})();
