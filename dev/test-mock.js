// Only active when opening /dev/?test=1 (e.g. Playwright). Mocks VitalSync and AppData so tests don't depend on live SDK.
(function () {
  'use strict';
  var isTest = typeof window !== 'undefined' && window.location && window.location.search.indexOf('test=1') !== -1;
  if (!isTest) return;

  if (window.VitalSync && window.VitalSync.connect) {
    window.VitalSync.connect = function () {
      return Promise.resolve(window.VitalSync.getPlugin && window.VitalSync.getPlugin() || {});
    };
  }

  var mockDoctor = { id: 425, first_name: 'Mario', last_name: 'Alam' };
  window.AppData = {
    fetchPatients: function () { return Promise.resolve([]); },
    searchPatients: function () { return Promise.resolve([]); },
    fetchPatientById: function () { return Promise.resolve(mockDoctor); },
    fetchAppointments: function () { return Promise.resolve([]); },
    fetchClinicalNotes: function () { return Promise.resolve([]); },
    fetchScripts: function () { return Promise.resolve([]); },
    fetchItems: function () { return Promise.resolve([]); },
    createPatient: function () { return Promise.resolve({}); },
    createAppointment: function () { return Promise.resolve({}); },
    fetchTimeslots: function () { return Promise.resolve([]); },
    createTimeslot: function () { return Promise.resolve({}); },
    updateTimeslot: function () { return Promise.resolve({}); },
    deleteTimeslot: function () { return Promise.resolve({}); },
  };
  window.__TEST_MOCK__ = true;
})();
