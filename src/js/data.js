// thc-clinicians-portal — Data Layer
// Uses direct VitalStats GraphQL API (no SDK) for reads. Exposes window.AppData.
// Root fields (getContacts, getItems, getAppointments, etc.) must match your VitalStats schema;
// some schemas use prefixed names (e.g. getThcContacts) — adjust if the API returns unknown field errors.
(function () {
  'use strict';

  var config = typeof window !== 'undefined' && window.AppConfig ? window.AppConfig : {};
  // API base: in dev, cross-origin to Express server; in prod, same domain
  var API_BASE = (window.ClinicianAuth && window.ClinicianAuth.API_BASE) || '';

  function authHeaders() {
    var token = window.ClinicianAuth && window.ClinicianAuth.getToken();
    var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function fetchGraphQL(query, variables) {
    variables = variables || {};
    return fetch(API_BASE + '/api/clinician/graphql', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: query, variables: variables }),
    })
      .then(function (res) {
        if (res.status === 401) { window.ClinicianAuth && window.ClinicianAuth.logout(); throw new Error('Session expired'); }
        return res.json();
      })
      .then(function (json) {
        if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'GraphQL error');
        return json.data;
      });
  }

  // ── Queries (direct GraphQL) ─────────────────────────────────

  /** Fetch patients (contacts). Returns plain array of objects. */
  function fetchPatients(limit) {
    var q = 'query getContacts($limit: IntScalar) { getContacts(limit: $limit) { id first_name last_name email sms_number office_phone birthday age sex address city state_au zip_code } }';
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
      '  ) { id first_name last_name email sms_number office_phone birthday age sex address city state_au zip_code }',
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
    var q = 'query getContactById($id: IntScalar!) { getContacts(query: [{ where: { id: $id, _OPERATOR_: eq } }], limit: 1) { id first_name last_name email sms_number office_phone birthday age sex address city state_au zip_code } }';
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

  /**
   * Fetch the clinical note for a specific appointment (returns most recent note or null).
   * Uses Ontraport REST because notes are written via Ontraport API — GraphQL has sync lag.
   * TODO: Migrate to GraphQL once note creation also uses GraphQL mutations.
   */
  function fetchClinicalNoteByAppointment(appointmentId) {
    var params = 'objectID=10008&range=1&sortDir=desc&sort=' + NOTE_FIELDS.date_created +
      '&condition=' + encodeURIComponent(
        JSON.stringify([{ field: { field: NOTE_FIELDS.appointment_id }, op: '=', value: { value: String(appointmentId) } }])
      );
    return ontraportRequest('GET', '/objects?' + params).then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.list) || (data && data.data) || [];
      if (!list.length) return null;
      var raw = list[0];
      return {
        id: raw.id,
        title: raw[NOTE_FIELDS.title] || '',
        content: raw[NOTE_FIELDS.content] || '',
        author_id: raw[NOTE_FIELDS.author_id],
        patient_id: raw[NOTE_FIELDS.patient_id],
        appointment_id: raw[NOTE_FIELDS.appointment_id],
        created_at: raw[NOTE_FIELDS.date_created] || raw.date,
        last_modified: raw.dlm || raw[NOTE_FIELDS.date_created] || raw.date
      };
    }).catch(function () { return null; });
  }

  /** Fetch scripts for a patient. */
  function fetchScripts(patientId) {
    var q = 'query getScripts($patient_id: IntScalar!) { getScripts(query: [{ where: { patient_id: $patient_id, _OPERATOR_: eq } }], limit: 100) { id script_status repeats remaining supply_limit interval_days dosage_instructions condition valid_until doctor_id patient_id drug_id appointment_id created_at } }';
    return fetchGraphQL(q, { patient_id: Number(patientId) }).then(function (data) {
      var list = data && data.getScripts;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    }).catch(function () { return []; });
  }

  /** Fetch items (drugs) for script display. Returns plain array. */
  function fetchItems(limit) {
    var q = 'query getItems($limit: IntScalar) { getItems(limit: $limit) { id item_name brand type description status retail_price wholesale_price item_image } }';
    return fetchGraphQL(q, { limit: limit || 500 }).then(function (data) {
      var list = data && data.getItems;
      return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
    });
  }

  /** Enriched item fields for recommendation engine (terpenes, cannabinoids, clinical, financial) */
  var ENRICHED_ITEM_FIELDS = [
    'id', 'item_name', 'brand', 'type', 'sub_type', 'description', 'item_image',
    'status', 'retail_price', 'wholesale_price',
    'thc', 'cbd', 'cbg', 'cbn', 'cbc', 'psychoactive',
    'myrcene', 'limonene', 'beta_caryophyllene', 'linalool', 'trans_caryophyllene',
    'ocimene', 'farnesene', 'alpha_pinene', 'beta_pinene', 'humulene', 'terpinolene',
    'dominant_terpenes_options_as_text', 'conditions_options_as_text', 'benefits_options_as_text',
    'paul_rating', 'prioritise', 'high_profit',
    'pack_size', 'strength_1', 'units_per_pack', 'price_per_mg',
    'organic', 'origin_country',
    'expiry', 'expiry_score',
    'tga_category', 'tga_schedule',
    'sativa_indica', 'dominance', 'chemovar',
    'dosage_form', 'cannabis_type', 'dosage_instructions',
    'gross_profit', 'profit', 'link_to_catalyst_listing'
  ].join(' ');

  /**
   * Fetch enriched items for recommendation engine. Includes terpenes, cannabinoids,
   * clinical, and financial fields. Fetches all in-stock items using offset pagination
   * in batches of 500 (staying under the 1000-record limit that can cause hangs).
   * Returns plain array of all matching items.
   */
  function fetchEnrichedItems() {
    var BATCH_SIZE = 500;
    var q = 'query getEnrichedItems($limit: IntScalar, $offset: IntScalar) { getItems(' +
      'query: [{ where: { status: "In Stock", _OPERATOR_: eq } }], ' +
      'limit: $limit, offset: $offset' +
      ') { ' + ENRICHED_ITEM_FIELDS + ' } }';

    function fetchBatch(offset) {
      return fetchGraphQL(q, { limit: BATCH_SIZE, offset: offset }).then(function (data) {
        var list = data && data.getItems;
        return Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      });
    }

    // Fetch batches sequentially until we get fewer than BATCH_SIZE results
    var allItems = [];
    function fetchNext(offset) {
      return fetchBatch(offset).then(function (batch) {
        allItems = allItems.concat(batch);
        if (batch.length >= BATCH_SIZE) {
          return fetchNext(offset + BATCH_SIZE);
        }
        return allItems;
      });
    }

    return fetchNext(0);
  }

  /**
   * Fetch patient intake data via GraphQL.
   * Returns contact object with friendly field names.
   */
  var INTAKE_QUERY_FIELDS = [
    // Demographics
    'id', 'first_name', 'last_name', 'email', 'sms_number', 'birthday', 'age',
    'sex', 'Weight', 'address', 'address_2', 'city', 'state_au', 'zip_code',
    // Conditions (booleans)
    'chronic_non_cancer_pain', 'anxiety_disorder', 'depression', 'ptsd', 'adhd',
    'sleep_disorder', 'epilepsy', 'fibromyalgia', 'arthritis', 'migraines',
    'chemotherapy_induced_nausea_and_vomiting', 'endometriosis',
    'crohns_ulcerative_colitis_ibs_gut', 'multiple_sclerosis', 'inflammation',
    'neuropathic_pain', 'cancer', 'parkinson_s_disease', 'loss_of_appetite',
    'autism_spectrum_disorder', 'glaucoma', 'chronic_illness', 'palliative_care',
    'headaches', 'other_condition', 'condition_details',
    // Safety / Eligibility
    'i_am_currently_pregnant_or_breastfeeding',
    'i_have_a_history_of_schizophrenia_bipolar_and_or_psychosis',
    'history_of_opioid_replacement_therapy_and_or_drug_dependency',
    'i_have_an_allergy_to_cannabinoids', 'i_suffer_from_chronic_liver_disease',
    // Clinical
    'Severity', 'Experience_Level', 'allergies_information',
    'list_your_medications_supplements', 'are_you_currently_taking_any_medications_or_supplements',
    'mental_health_history', 'previous_treatment', 'treatment_outcome', 'long_term_condition',
    // Medicare
    'medicare_name', 'medicare_number', 'issue_number', 'irn', 'ihi_number',
    'concession_card_holder',
    // Lifestyle
    'Drives_Regularly', 'Heavy_Machinery', 'Competitive_Sport', 'Sport_Type',
    'Shift_Work', 'pregnancy_or_fertility',
    // Product Preferences
    'product_preference', 'effect_preference', 'lineage_preference',
    'Budget_Range', 'budget_important', 'discretion_important',
    'flowers', 'oils', 'vapes', 'edibles', 'prev_cannabis_use',
    // Consent
    'terms_conditions', 'declaration_i_have_answered_truthfully',
    'application_status', 'time_signed_terms',
    // Other
    'contact_comment', 'last_feedback_rating'
  ].join(' ');

  function fetchPatientIntake(patientId) {
    var q = 'query getContactIntake($id: IntScalar!) { getContacts(query: [{ where: { id: $id, _OPERATOR_: eq } }], limit: 1) { ' + INTAKE_QUERY_FIELDS + ' } }';
    return fetchGraphQL(q, { id: Number(patientId) }).then(function (data) {
      var list = data && data.getContacts;
      var arr = Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      return arr.length ? arr[0] : {};
    });
  }

  // Update patient intake fields on Contact record (objectID 0)
  function updatePatientIntake(patientId, fields) {
    var payload = { objectID: 0, id: patientId };
    for (var key in fields) {
      payload[key] = fields[key];
    }
    return ontraportRequest('PUT', '/objects', payload);
  }

  // ── Ontraport API ───────────────────────────────────────────

  // All Ontraport calls routed through authenticated server-side proxy

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
    timeslot_id: 'f2672',
    date_booked: 'f2144',   // timestamp — date the appointment was created
    immediate: 'f3336',     // checkbox — appointment created from clinician portal
  };

  var APPT_STATUS = { Booked: '138', Paid: '131', Completed: '150', Cancelled: '129', Rescheduled: '197' };
  var APPT_TYPE = { 'Initial Consultation': '237', 'Follow Up Consultation': '236', 'In Patient Consultation': '770' };

  // Ontraport field mapping for Scripts (objectID 10002)
  var SCRIPT_FIELDS = {
    doctor_id: 'f2208',
    patient_id: 'f2207',
    drug_id: 'f2232',
    appointment_id: 'f2277',
    script_status: 'f2205',
    repeats: 'f2206',
    remaining: 'f2265',
    interval_days: 'f2741',
    dosage_instructions: 'f2854',
    additional_instructions: 'f2855',
    dispense_qty: 'f2858',
    valid_until: 'f2859',
    supply_limit: 'f3093',
    condition: 'f2825',
    route: 'f2856',
    doctor_notes_pharmacy: 'f2809',
  };

  var SCRIPT_STATUS = {
    'Draft': '278',
    'To Be Processed': '678',
    'Open': '145',
    'Fulfilled': '144',
    'Stock Issue': '692',
    'Archived': '332',
    'External Processing': '766',
    'Cancelled': '143'
  };

  // Ontraport field mapping for Clinical Notes (objectID 10008)
  var NOTE_FIELDS = {
    title: 'f3082',
    content: 'f3083',
    author_id: 'f3084',
    patient_id: 'f3085',
    appointment_id: 'f3086',
    date_created: 'f3087',
    upload: 'f3092'
  };

  // Ontraport field mapping for Doctor Preferences (Contact objectID 0)
  var DOCTOR_PREF_FIELDS = {
    default_repeats: 'f3365',
    default_interval_days: 'f3366',
    calendar_view_start: 'f3367',
    calendar_view_end: 'f3368',
  };

  /** Ontraport API call via authenticated server-side proxy */
  function ontraportRequest(method, endpoint, body) {
    return fetch(API_BASE + '/api/clinician/ontraport', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ method: method, endpoint: endpoint, body: body }),
    }).then(function (res) {
      if (res.status === 401) { window.ClinicianAuth && window.ClinicianAuth.logout(); throw new Error('Session expired'); }
      if (!res.ok) throw new Error('Ontraport API error: ' + res.status);
      return res.json();
    }).then(function (json) {
      if (json.code !== 0) {
        console.error('Ontraport API error:', json);
        throw new Error('Ontraport error code: ' + json.code + (json.message ? ' — ' + json.message : ''));
      }
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
    if (apptData.timeslot_id) payload[APPT_FIELDS.timeslot_id] = apptData.timeslot_id;
    if (apptData.fee) payload[APPT_FIELDS.fee] = apptData.fee;
    return ontraportRequest('POST', '/objects', payload);
  }

  function updateAppointment(appointmentId, apptData) {
    var payload = { id: appointmentId, objectID: 10001 };
    if (apptData.status != null) payload[APPT_FIELDS.status] = APPT_STATUS[apptData.status] || apptData.status;
    if (apptData.type != null) payload[APPT_FIELDS.type] = APPT_TYPE[apptData.type] || apptData.type;
    if (apptData.appointment_time != null) payload[APPT_FIELDS.appointment_time] = apptData.appointment_time;
    return ontraportRequest('PUT', '/objects', payload);
  }

  function cancelAppointment(appointmentId) {
    return updateAppointment(appointmentId, { status: 'Cancelled' });
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

  /**
   * Create a new script via Ontraport API (objectID 10002).
   * scriptData: { doctor_id, patient_id, drug_id, appointment_id, repeats, dosage_instructions, condition }
   * Defaults: status=Open, repeats=3, remaining=repeats, interval_days=7, dispense_qty=1
   */
  function createScript(scriptData) {
    var repeats = scriptData.repeats != null ? scriptData.repeats : 3;
    var payload = { objectID: 10002 };
    payload[SCRIPT_FIELDS.doctor_id] = scriptData.doctor_id;
    payload[SCRIPT_FIELDS.patient_id] = scriptData.patient_id;
    payload[SCRIPT_FIELDS.drug_id] = scriptData.drug_id;
    if (scriptData.appointment_id) payload[SCRIPT_FIELDS.appointment_id] = scriptData.appointment_id;
    payload[SCRIPT_FIELDS.script_status] = SCRIPT_STATUS[scriptData.status] || SCRIPT_STATUS['Draft'];
    payload[SCRIPT_FIELDS.repeats] = repeats;
    payload[SCRIPT_FIELDS.remaining] = repeats;
    payload[SCRIPT_FIELDS.interval_days] = scriptData.interval_days || 7;
    payload[SCRIPT_FIELDS.dispense_qty] = scriptData.dispense_qty || 1;
    payload[SCRIPT_FIELDS.supply_limit] = scriptData.supply_limit || repeats;
    if (scriptData.dosage_instructions) payload[SCRIPT_FIELDS.dosage_instructions] = scriptData.dosage_instructions;
    if (scriptData.additional_instructions) payload[SCRIPT_FIELDS.additional_instructions] = scriptData.additional_instructions;
    if (scriptData.condition) payload[SCRIPT_FIELDS.condition] = scriptData.condition;
    if (scriptData.route) payload[SCRIPT_FIELDS.route] = scriptData.route;
    if (scriptData.doctor_notes_pharmacy) payload[SCRIPT_FIELDS.doctor_notes_pharmacy] = scriptData.doctor_notes_pharmacy;
    // Valid until: default 6 months from now
    if (scriptData.valid_until) {
      payload[SCRIPT_FIELDS.valid_until] = scriptData.valid_until;
    } else {
      var sixMonths = new Date();
      sixMonths.setMonth(sixMonths.getMonth() + 6);
      payload[SCRIPT_FIELDS.valid_until] = sixMonths.toISOString().split('T')[0];
    }
    return ontraportRequest('POST', '/objects', payload);
  }

  /**
   * Create a clinical note via Ontraport API (objectID 10008).
   * noteData: { title, content, author_id, patient_id, appointment_id }
   */
  function createClinicalNote(noteData) {
    var payload = { objectID: 10008 };
    payload[NOTE_FIELDS.title] = noteData.title || '';
    payload[NOTE_FIELDS.content] = noteData.content || '';
    payload[NOTE_FIELDS.author_id] = noteData.author_id;
    payload[NOTE_FIELDS.patient_id] = noteData.patient_id;
    if (noteData.appointment_id) payload[NOTE_FIELDS.appointment_id] = noteData.appointment_id;
    payload[NOTE_FIELDS.date_created] = Math.floor(Date.now() / 1000);
    return ontraportRequest('POST', '/objects', payload);
  }

  /** Update an existing script via Ontraport API (objectID 10002). */
  function updateScript(scriptId, scriptData) {
    var payload = { id: scriptId, objectID: 10002 };
    if (scriptData.status != null) payload[SCRIPT_FIELDS.script_status] = SCRIPT_STATUS[scriptData.status] || scriptData.status;
    if (scriptData.repeats != null) { payload[SCRIPT_FIELDS.repeats] = scriptData.repeats; payload[SCRIPT_FIELDS.remaining] = scriptData.repeats; }
    if (scriptData.interval_days != null) payload[SCRIPT_FIELDS.interval_days] = scriptData.interval_days;
    if (scriptData.dispense_qty != null) payload[SCRIPT_FIELDS.dispense_qty] = scriptData.dispense_qty;
    if (scriptData.dosage_instructions != null) payload[SCRIPT_FIELDS.dosage_instructions] = scriptData.dosage_instructions;
    if (scriptData.condition != null) payload[SCRIPT_FIELDS.condition] = scriptData.condition;
    if (scriptData.doctor_notes_pharmacy != null) payload[SCRIPT_FIELDS.doctor_notes_pharmacy] = scriptData.doctor_notes_pharmacy;
    if (scriptData.valid_until != null) payload[SCRIPT_FIELDS.valid_until] = scriptData.valid_until;
    if (scriptData.supply_limit != null) payload[SCRIPT_FIELDS.supply_limit] = scriptData.supply_limit;
    return ontraportRequest('PUT', '/objects', payload);
  }

  /** Delete a single script via Ontraport API (objectID 10002). */
  function deleteScript(scriptId) {
    return ontraportRequest('DELETE', '/object?objectID=10002&id=' + encodeURIComponent(scriptId));
  }

  /** Update an existing clinical note via Ontraport API (objectID 10008). */
  function updateClinicalNote(noteId, noteData) {
    var payload = { id: noteId, objectID: 10008 };
    if (noteData.content != null) payload[NOTE_FIELDS.content] = noteData.content;
    if (noteData.title != null) payload[NOTE_FIELDS.title] = noteData.title;
    return ontraportRequest('PUT', '/objects', payload);
  }

  // ── Doctor Preferences ──────────────────────────────────────

  function fetchDoctorPreferences(doctorId) {
    return ontraportRequest('GET', '/object?objectID=0&id=' + encodeURIComponent(doctorId))
      .then(function (raw) {
        if (!raw || !raw.data) return {};
        var d = raw.data;
        var prefs = {};
        for (var key in DOCTOR_PREF_FIELDS) {
          var fid = DOCTOR_PREF_FIELDS[key];
          if (d[fid] != null && d[fid] !== '') prefs[key] = d[fid];
        }
        return prefs;
      });
  }

  function saveDoctorPreferences(doctorId, prefs) {
    var fields = {};
    for (var key in prefs) {
      if (DOCTOR_PREF_FIELDS[key]) fields[DOCTOR_PREF_FIELDS[key]] = prefs[key];
    }
    return updatePatientIntake(doctorId, fields);
  }

  // ── Billing ────────────────────────────────────────────────

  /** Fetch credit cards on file for a contact. Returns array of card objects. */
  function fetchCreditCards(contactId) {
    var condition = encodeURIComponent(
      JSON.stringify([{ field: { field: 'contact_id' }, op: '=', value: { value: String(contactId) } }])
    );
    return ontraportRequest('GET', '/CreditCards?range=50&count=false&condition=' + condition)
      .then(function (raw) {
        return Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data)) ? raw.data : [];
      });
  }

  /**
   * Process a payment (charge card on file).
   * @param {object} opts - { contact_id, cc_id, amount, description, gateway_id, appointment_id }
   */
  function chargeCard(opts) {
    var payload = {
      contact_id: String(opts.contact_id),
      chargeNow: 'chargeNow',
      trans_date: Date.now(),
      invoice_template: 1,
      gateway_id: opts.gateway_id || 1,
      cc_id: opts.cc_id,
      offer: {
        products: [{
          id: String(opts.product_id || '0'),
          quantity: 1,
          price: Number(opts.amount).toFixed(2),
          total: Number(opts.amount).toFixed(2),
          type: 'one_time',
          taxable: false,
          shipping: false,
        }],
        shipping: [],
        subTotal: Number(opts.amount).toFixed(2),
        grandTotal: Number(opts.amount).toFixed(2),
        discountTotal: '0.00',
      },
      external_order_id: opts.appointment_id ? 'APPT-' + opts.appointment_id : 'CLIN-' + Date.now(),
    };
    return ontraportRequest('POST', '/transaction/processManual', payload);
  }

  /**
   * Create an unpaid invoice (no card charge).
   * @param {object} opts - { contact_id, amount, description, gateway_id, appointment_id }
   */
  function createInvoice(opts) {
    var payload = {
      contact_id: String(opts.contact_id),
      chargeNow: 'requestPayment',
      gateway_id: opts.gateway_id || 1,
      send_invoice: false,
      trans_date: Date.now(),
      due_on: 14,
      offer: {
        products: [{
          id: String(opts.product_id || '0'),
          quantity: 1,
          price: Number(opts.amount).toFixed(2),
          total: Number(opts.amount).toFixed(2),
          type: 'one_time',
          taxable: false,
          shipping: false,
        }],
        shipping: [],
        subTotal: Number(opts.amount).toFixed(2),
        grandTotal: Number(opts.amount).toFixed(2),
        discountTotal: '0.00',
      },
      customer_note: opts.description || 'Consultation fee',
      external_order_id: opts.appointment_id ? 'APPT-' + opts.appointment_id : 'CLIN-' + Date.now(),
    };
    return ontraportRequest('POST', '/transaction/processManual', payload);
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
    fetchEnrichedItems: fetchEnrichedItems,
    fetchPatientIntake: fetchPatientIntake,
    updatePatientIntake: updatePatientIntake,
    createPatient: createPatient,
    createAppointment: createAppointment,
    updateAppointment: updateAppointment,
    cancelAppointment: cancelAppointment,
    createScript: createScript,
    updateScript: updateScript,
    deleteScript: deleteScript,
    createClinicalNote: createClinicalNote,
    updateClinicalNote: updateClinicalNote,
    fetchClinicalNoteByAppointment: fetchClinicalNoteByAppointment,
    fetchTimeslots: fetchTimeslots,
    createTimeslot: createTimeslot,
    updateTimeslot: updateTimeslot,
    deleteTimeslot: deleteTimeslot,
    SCRIPT_STATUS: SCRIPT_STATUS,
    callGemini: callGemini,
    fetchDoctorPreferences: fetchDoctorPreferences,
    saveDoctorPreferences: saveDoctorPreferences,
    fetchCreditCards: fetchCreditCards,
    chargeCard: chargeCard,
    createInvoice: createInvoice,
  };

  // ── Gemini Flash API (via authenticated server-side proxy) ──
  function callGemini(prompt) {
    return fetch(API_BASE + '/api/clinician/gemini', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: prompt }),
    }).then(function (res) {
      if (res.status === 401) { window.ClinicianAuth && window.ClinicianAuth.logout(); throw new Error('Session expired'); }
      if (!res.ok) throw new Error('Gemini API error: ' + res.status);
      return res.json();
    }).then(function (json) {
      if (!json.candidates || !json.candidates[0]) throw new Error('No response from Gemini');
      var candidate = json.candidates[0];
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Gemini finish reason:', candidate.finishReason);
      }
      // Concatenate all parts (Gemini can split response across multiple parts)
      var text = '';
      if (candidate.content && candidate.content.parts) {
        candidate.content.parts.forEach(function (part) {
          if (part.text) text += part.text;
        });
      }
      if (!text) throw new Error('Empty response from Gemini (finishReason: ' + (candidate.finishReason || 'unknown') + ')');
      return text;
    });
  }
})();
