// thc-clinicians-portal — Data Layer
// All VitalSync queries and mutations. Exposes window.AppData.
(function () {
  'use strict';

  var fetchOnce = window.VitalSync.fetchOnce;

  function getPlugin() {
    return window.VitalSync.getPlugin();
  }

  // ── Queries ────────────────────────────────────────────────

  /** Fetch patients (contacts). Returns plain objects. */
  function fetchPatients(limit) {
    var plugin = getPlugin();
    return fetchOnce(
      plugin
        .switchTo('ThcContact')
        .query()
        .limit(limit || 200)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    );
  }

  /** Fetch a single contact by ID. */
  function fetchPatientById(id) {
    var plugin = getPlugin();
    return fetchOnce(
      plugin
        .switchTo('ThcContact')
        .query()
        .where('id', { eq: id })
        .limit(1)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    ).then(function (records) {
      return records && records.length ? records[0] : null;
    });
  }

  /** Fetch appointments filtered by doctor and/or patient. */
  function fetchAppointments(filters) {
    var plugin = getPlugin();
    var q = plugin.switchTo('ThcAppointment').query();
    if (filters && filters.doctor_id) {
      q = q.where('doctor_id', { eq: Number(filters.doctor_id) });
    }
    if (filters && filters.patient_id) {
      q = q.where('patient_id', { eq: Number(filters.patient_id) });
    }
    return fetchOnce(
      q.limit(filters && filters.limit || 200)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    );
  }

  /** Fetch clinical notes for a patient. */
  function fetchClinicalNotes(patientId) {
    var plugin = getPlugin();
    return fetchOnce(
      plugin
        .switchTo('ThcClinicalNote')
        .query()
        .where('patient_id', { eq: Number(patientId) })
        .limit(100)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    );
  }

  /** Fetch scripts for a patient. */
  function fetchScripts(patientId) {
    var plugin = getPlugin();
    return fetchOnce(
      plugin
        .switchTo('ThcScript')
        .query()
        .where('patient_id', { eq: Number(patientId) })
        .limit(100)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    );
  }

  /** Fetch items (drugs) by IDs for script display. */
  function fetchItems(limit) {
    var plugin = getPlugin();
    return fetchOnce(
      plugin
        .switchTo('ThcItem')
        .query()
        .limit(limit || 500)
        .fetchAllRecords()
        .pipe(window.toMainInstance(true))
    );
  }

  // ── Mutations ──────────────────────────────────────────────

  /** Create a new patient (Contact). */
  function createPatient(data) {
    var plugin = getPlugin();
    return plugin
      .switchTo('ThcContact')
      .mutation()
      .createOne(data)
      .execute(true)
      .toPromise();
  }

  /** Create a new appointment. */
  function createAppointment(data) {
    var plugin = getPlugin();
    return plugin
      .switchTo('ThcAppointment')
      .mutation()
      .createOne(data)
      .execute(true)
      .toPromise();
  }

  // ── Expose ─────────────────────────────────────────────────

  window.AppData = {
    fetchPatients: fetchPatients,
    fetchPatientById: fetchPatientById,
    fetchAppointments: fetchAppointments,
    fetchClinicalNotes: fetchClinicalNotes,
    fetchScripts: fetchScripts,
    fetchItems: fetchItems,
    createPatient: createPatient,
    createAppointment: createAppointment,
  };
})();
