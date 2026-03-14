// thc-clinicians-portal — Data Layer
// Uses direct VitalStats GraphQL API (no SDK) for reads. Exposes window.AppData.
// Root fields (getContacts, getItems, getAppointments, etc.) must match your VitalStats schema;
// some schemas use prefixed names (e.g. getThcContacts) — adjust if the API returns unknown field errors.
(function () {
  'use strict';

  var config = typeof window !== 'undefined' && window.AppConfig ? window.AppConfig : {};
  var GRAPHQL_ENDPOINT = 'https://' + (config.SLUG || 'thc') + '.vitalstats.app/api/v1/graphql';
  var API_KEY = config.API_KEY || '';

  function fetchGraphQL(query, variables) {
    variables = variables || {};
    return fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Api-Key': API_KEY,
      },
      body: JSON.stringify({ query: query, variables: variables }),
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'GraphQL error');
        return json.data;
      });
  }

  // ── Queries (direct GraphQL) ─────────────────────────────────

  /** Fetch patients (contacts). Returns plain array of objects. */
  function fetchPatients(limit) {
    var q = 'query getContacts($limit: IntScalar) { getContacts(limit: $limit) { id first_name last_name email sms_number office_phone } }';
    return fetchGraphQL(q, { limit: limit || 200 }).then(function (data) {
      var list = data && data.getContacts;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    });
  }

  /**
   * For phone-like search terms, return variants so 0420908066 matches +61420908066.
   * Australian: 0xxxxxxxxx (10 digits) <=> 61xxxxxxxxx (11 digits) <=> +61xxxxxxxxx.
   */
  function smsSearchPatterns(term) {
    var digits = (term || '').replace(/\D/g, '');
    if (digits.length < 6) return [term];
    var out = [term];
    if (digits.length === 10 && digits[0] === '0') {
      var nine = digits.slice(1);
      out.push('61' + nine);
      out.push('+61' + nine);
    } else if (digits.length === 11 && digits.slice(0, 2) === '61') {
      var rest = digits.slice(2);
      if (rest.length === 9) {
        out.push('0' + rest);
        out.push('+61' + rest);
      }
    } else if (digits.length === 9 && digits[0] !== '0') {
      out.push('0' + digits);
      out.push('61' + digits);
      out.push('+61' + digits);
    }
    return out.filter(function (p, i, arr) { return arr.indexOf(p) === i; });
  }

  /**
   * Run one search query for a single pattern (name/email/sms). Returns promise of contact array.
   */
  function searchPatientsOnePattern(pattern, limit) {
    var smsPatterns = smsSearchPatterns(pattern);
    var vars = { pattern: '%' + pattern + '%', limit: limit || 50 };
    var queryParts = [
      '{ where: { first_name: $pattern, _OPERATOR_: like } }',
      '{ orWhere: { last_name: $pattern, _OPERATOR_: like } }',
      '{ orWhere: { email: $pattern, _OPERATOR_: like } }',
    ];
    for (var i = 0; i < smsPatterns.length; i++) {
      var smsKey = i === 0 ? 'sms' : 'sms' + i;
      vars[smsKey] = '%' + smsPatterns[i] + '%';
      queryParts.push('{ orWhere: { sms_number: $' + smsKey + ', _OPERATOR_: like } }');
    }
    var varDecl = ['$pattern: StringScalar', '$limit: IntScalar'];
    for (var k = 0; k < smsPatterns.length; k++) {
      varDecl.push('$' + (k === 0 ? 'sms' : 'sms' + k) + ': StringScalar');
    }
    var q = [
      'query searchContacts(' + varDecl.join(', ') + ') {',
      '  getContacts(',
      '    query: [ ' + queryParts.join(', ') + ' ],',
      '    limit: $limit',
      '  ) { id first_name last_name email sms_number office_phone }',
      '}',
    ].join('\n');
    return fetchGraphQL(q, vars).then(function (data) {
      var list = data && data.getContacts;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    });
  }

  /**
   * Search patients by name, email, or phone. Full name "Andrew Wadsworth" matches first_name + last_name.
   * SMS: 0420908066 will match +61420908066. Returns plain array of matching contacts, max 50.
   */
  function searchPatients(query, limit) {
    var term = (query && typeof query === 'string') ? query.trim() : '';
    if (!term) return Promise.resolve([]);
    var limitVal = limit || 50;
    var tokens = term.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) {
      return searchPatientsOnePattern(term, limitVal).catch(function () { return []; });
    }
    // Full name (e.g. "Andrew Wadsworth"): run one query per token, keep contacts that match every token
    return Promise.all(tokens.map(function (t) { return searchPatientsOnePattern(t, limitVal); }))
      .then(function (resultsPerToken) {
        if (!resultsPerToken.length) return [];
        var byId = {};
        resultsPerToken[0].forEach(function (c) { byId[c.id] = c; });
        for (var i = 1; i < resultsPerToken.length; i++) {
          var ids = {};
          resultsPerToken[i].forEach(function (c) { ids[c.id] = true; });
          for (var id in byId) {
            if (!ids[id]) delete byId[id];
          }
        }
        return Object.keys(byId).map(function (id) { return byId[id]; }).slice(0, limitVal);
      })
      .catch(function () { return []; });
  }

  /** Fetch a single contact by ID. */
  function fetchPatientById(id) {
    var q = 'query getContactById($id: IntScalar!) { getContacts(query: [{ where: { id: $id, _OPERATOR_: eq } }], limit: 1) { id first_name last_name email sms_number office_phone } }';
    return fetchGraphQL(q, { id: Number(id) }).then(function (data) {
      var list = data && data.getContacts;
      var arr = Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      return arr.length ? arr[0] : null;
    });
  }

  /** Fetch appointments filtered by doctor and/or patient. */
  function fetchAppointments(filters) {
    var limit = (filters && filters.limit) || 200;
    var doctorId = filters && filters.doctor_id != null ? Number(filters.doctor_id) : null;
    var patientId = filters && filters.patient_id != null ? Number(filters.patient_id) : null;
    var vars = { limit: limit };
    var queryParts = [];
    if (doctorId != null) {
      queryParts.push('{ where: { doctor_id: $doctor_id, _OPERATOR_: eq } }');
      vars.doctor_id = doctorId;
    }
    if (patientId != null) {
      queryParts.push('{ ' + (queryParts.length ? 'andWhere' : 'where') + ': { patient_id: $patient_id, _OPERATOR_: eq } }');
      vars.patient_id = patientId;
    }
    var queryClause = queryParts.length ? 'query: [' + queryParts.join(', ') + '], ' : '';
    var varDecl = ['$limit: IntScalar'];
    if (vars.doctor_id != null) varDecl.push('$doctor_id: IntScalar');
    if (vars.patient_id != null) varDecl.push('$patient_id: IntScalar');
    var q = 'query getAppointments(' + varDecl.join(', ') + ') { getAppointments(' + queryClause + 'limit: $limit) { id doctor_id patient_id appointment_time status type timeslot_id } }';
    return fetchGraphQL(q, vars).then(function (data) {
      var list = data && data.getAppointments;
      if (Array.isArray(list)) return list;
      if (list && typeof list === 'object' && !Array.isArray(list)) return Object.keys(list).map(function (k) { return list[k]; });
      return [];
    });
  }

  /** Fetch clinical notes for a patient. */
  function fetchClinicalNotes(patientId) {
    var q = 'query getClinicalNotes($patient_id: IntScalar!) { getClinicalNotes(query: [{ where: { patient_id: $patient_id, _OPERATOR_: eq } }], limit: 100) { id title content author_id patient_id appointment_id created_at } }';
    return fetchGraphQL(q, { patient_id: Number(patientId) }).then(function (data) {
      var list = data && data.getClinicalNotes;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    }).catch(function () { return []; });
  }

  /** Fetch scripts for a patient. */
  function fetchScripts(patientId) {
    var q = 'query getScripts($patient_id: IntScalar!) { getScripts(query: [{ where: { patient_id: $patient_id, _OPERATOR_: eq } }], limit: 100) { id script_status repeats remaining doctor_id patient_id drug_id appointment_id created_at } }';
    return fetchGraphQL(q, { patient_id: Number(patientId) }).then(function (data) {
      var list = data && data.getScripts;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    }).catch(function () { return []; });
  }

  /** Fetch items (drugs) for script display. Returns plain array. */
  function fetchItems(limit) {
    var q = 'query getItems($limit: IntScalar) { getItems(limit: $limit) { id item_name brand type description status retail_price wholesale_price } }';
    return fetchGraphQL(q, { limit: limit || 500 }).then(function (data) {
      var list = data && data.getItems;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    });
  }

  // ── Ontraport API ───────────────────────────────────────────

  // In local dev, Vite proxies /ontraport-api → https://api.ontraport.com/1
  var IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  var ONTRAPORT_API = IS_DEV ? '/ontraport-api' : 'https://api.ontraport.com/1';
  var ONTRAPORT_APPID = '2_266635_xuw5tJVbm';
  var ONTRAPORT_KEY = 'uV22NoeXQtVD2bH';

  // Ontraport field mapping for Timeslots (objectID 10000)
  var TIMESLOT_FIELDS = {
    start_time: 'f2125',
    end_time: 'f2126',
    doctor_id: 'f2127',
    max_appointments: 'f2149',
    timeslot_status: 'f2151',       // 133=Open, 132=Closed, 157=Completed, 202=Cancelled
    available_appointments: 'f2669',
  };

  var TIMESLOT_STATUS = {
    'Open For Appointments': '133',
    'Closed For Appointments': '132',
    'Completed Timeslot': '157',
    'Cancelled': '202',
  };

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

  /** Fetch timeslots for a doctor via Ontraport API. */
  function fetchTimeslots(doctorId) {
    var params = 'objectID=10000&range=200&sortDir=desc&sort=' + TIMESLOT_FIELDS.start_time;
    if (doctorId) {
      params += '&condition=' + encodeURIComponent(
        JSON.stringify([{ field: { field: TIMESLOT_FIELDS.doctor_id }, op: '=', value: { value: String(doctorId) } }])
      );
    }
    return ontraportRequest('GET', '/objects?' + params).then(function (data) {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.list)) return data.list;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.objects)) return data.objects;
      return [];
    });
  }

  /** Create a new timeslot via Ontraport API (objectID 10000). */
  function createTimeslot(slotData) {
    var payload = { objectID: 10000 };
    payload[TIMESLOT_FIELDS.doctor_id] = slotData.doctor_id;
    payload[TIMESLOT_FIELDS.start_time] = slotData.start_time;
    payload[TIMESLOT_FIELDS.end_time] = slotData.end_time;
    payload[TIMESLOT_FIELDS.max_appointments] = slotData.max_appointments || 3;
    payload[TIMESLOT_FIELDS.timeslot_status] = TIMESLOT_STATUS['Open For Appointments'];
    return ontraportRequest('POST', '/objects', payload);
  }

  /** Update a timeslot via Ontraport API (objectID 10000). */
  function updateTimeslot(id, patch) {
    var payload = { id: id, objectID: 10000 };
    if (patch.start_time != null) payload[TIMESLOT_FIELDS.start_time] = patch.start_time;
    if (patch.end_time != null) payload[TIMESLOT_FIELDS.end_time] = patch.end_time;
    if (patch.max_appointments != null) payload[TIMESLOT_FIELDS.max_appointments] = patch.max_appointments;
    if (patch.timeslot_status != null) payload[TIMESLOT_FIELDS.timeslot_status] = patch.timeslot_status;
    return ontraportRequest('PUT', '/objects', payload);
  }

  /** Delete a timeslot via Ontraport API (objectID 10000). */
  function deleteTimeslot(id) {
    return ontraportRequest('DELETE', '/objects?id=' + encodeURIComponent(String(id)) + '&objectID=10000');
  }

  // ── Expose ─────────────────────────────────────────────────

  window.AppData = {
    fetchPatients: fetchPatients,
    searchPatients: searchPatients,
    fetchPatientById: fetchPatientById,
    fetchAppointments: fetchAppointments,
    fetchClinicalNotes: fetchClinicalNotes,
    fetchScripts: fetchScripts,
    fetchItems: fetchItems,
    createPatient: createPatient,
    createAppointment: createAppointment,
    fetchTimeslots: fetchTimeslots,
    createTimeslot: createTimeslot,
    updateTimeslot: updateTimeslot,
    deleteTimeslot: deleteTimeslot,
  };
})();
