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
        .where('id', id)
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
      q = q.where('doctor_id', Number(filters.doctor_id));
    }
    if (filters && filters.patient_id) {
      q = q.where('patient_id', Number(filters.patient_id));
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
        .where('patient_id', Number(patientId))
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
        .where('patient_id', Number(patientId))
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

  // ── Ontraport API ───────────────────────────────────────────

  // In local dev, Vite proxies /ontraport-api → https://api.ontraport.com/1
  var IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  var ONTRAPORT_API = IS_DEV ? '/ontraport-api' : 'https://api.ontraport.com/1';
  var ONTRAPORT_APPID = '2_266635_xuw5tJVbm';
  var ONTRAPORT_KEY = 'uV22NoeXQtVD2bH';

  // Ontraport field mapping for Appointments (objectID 10001)
  var APPT_FIELDS = {
    patient_id: 'f2146',
    doctor_id: 'f2549',
    appointment_time: 'f2543',
    status: 'f2148',        // 138=Booked, 131=Paid, 150=Completed, 129=Cancelled
    type: 'f2570',          // 237=Initial Consultation, 236=Follow Up Consultation
    fee: 'f2579',
    date_booked: 'f2144',   // timestamp — date the appointment was created
    immediate: 'f3336',     // checkbox — appointment created from clinician portal
  };

  var APPT_STATUS = { Booked: '138', Paid: '131', Completed: '150', Cancelled: '129', Rescheduled: '197' };
  var APPT_TYPE = { 'Initial Consultation': '237', 'Follow Up Consultation': '236', 'In Patient Consultation': '770' };

  /** POST to Ontraport API */
  function ontraportRequest(method, endpoint, body) {
    return fetch(ONTRAPORT_API + endpoint, {
      method: method,
      headers: {
        'Api-Appid': ONTRAPORT_APPID,
        'Api-Key': ONTRAPORT_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('Ontraport API error: ' + res.status);
      return res.json();
    }).then(function (json) {
      if (json.code !== 0) throw new Error('Ontraport error code: ' + json.code);
      return json.data;
    });
  }

  // ── Mutations ──────────────────────────────────────────────

  /** Create a new patient (Contact) via Ontraport API (objectID 0). */
  function createPatient(contactData) {
    var payload = { objectID: 0 };
    if (contactData.first_name) payload.firstname = contactData.first_name;
    if (contactData.last_name) payload.lastname = contactData.last_name;
    if (contactData.email) payload.email = contactData.email;
    if (contactData.sms_number) payload.sms_number = contactData.sms_number;
    if (contactData.address) payload.address = contactData.address;
    if (contactData.city) payload.city = contactData.city;
    if (contactData.state_au) payload.state = contactData.state_au;
    if (contactData.zip_code) payload.zip = contactData.zip_code;
    return ontraportRequest('POST', '/objects', payload);
  }

  /**
   * Create a new appointment via Ontraport API (objectID 10001).
   * Returns the full record including page_105_url (clinician page).
   */
  function createAppointment(apptData) {
    var payload = { objectID: 10001 };
    payload[APPT_FIELDS.patient_id] = apptData.patient_id;
    if (apptData.doctor_id) payload[APPT_FIELDS.doctor_id] = apptData.doctor_id;
    payload[APPT_FIELDS.appointment_time] = apptData.appointment_time;
    payload[APPT_FIELDS.status] = APPT_STATUS[apptData.status] || APPT_STATUS.Booked;
    payload[APPT_FIELDS.type] = APPT_TYPE[apptData.type] || APPT_TYPE['Initial Consultation'];
    payload[APPT_FIELDS.date_booked] = Math.floor(Date.now() / 1000);
    payload[APPT_FIELDS.immediate] = 1;
    return ontraportRequest('POST', '/objects', payload);
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
