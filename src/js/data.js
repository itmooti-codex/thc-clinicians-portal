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
    // Order newest first — VitalStats uses { path: [...], type: desc } syntax
    var orderClause = 'orderBy: [{path: ["appointment_time"], type: desc}], ';
    var q = 'query getAppointments(' + varDecl.join(', ') + ') { getAppointments(' + queryClause + orderClause + 'limit: $limit) { id doctor_id patient_id appointment_time status type timeslot_id } }';
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
   * Fetch a single item by id without any status filter. Used as a fallback
   * for openItemDetailPage when the item isn't in the in-memory cache —
   * specifically for archived / unavailable items, which fetchEnrichedItems
   * filters out (status: "In Stock" only). Returns the item or null.
   */
  function fetchItemById(itemId) {
    var q = 'query getItem($id: IntScalar!) { getItems(query: [{ where: { id: $id, _OPERATOR_: eq } }], limit: 1) { ' + ENRICHED_ITEM_FIELDS + ' } }';
    return fetchGraphQL(q, { id: Number(itemId) }).then(function (data) {
      var list = data && data.getItems;
      var arr = Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      return arr[0] || null;
    });
  }

  /**
   * Fetch patient intake data via GraphQL.
   *
   * After the Intake Form migration, ~75 consult-related fields moved off
   * Contact onto a ClinicalNote (with Note_Type='Intake Form'). This function:
   *   1) Fetches identity + Medicare + consent fields from Contact (stay-fields)
   *   2) Fetches the most recent Intake Form ClinicalNote for that patient
   *   3) Merges them into a single flat object keyed by the LEGACY Contact
   *      field names (e.g. `adhd`, `Severity`, `flowers`) so downstream code
   *      (prescribe.js, recommend.js, app.js) continues to read the same
   *      shape without changes.
   *
   * Returns a contact-shaped object. The merge prefers Intake Form values for
   * migrated fields; Contact fields are still used for identity / Medicare /
   * consent / status.
   */

  // Contact fields that stay on Contact post-migration.
  var INTAKE_QUERY_FIELDS = [
    // Demographics
    'id', 'unique_id', 'first_name', 'last_name', 'email', 'sms_number', 'birthday', 'age',
    'sex', 'Weight', 'address', 'address_2', 'city', 'state_au', 'zip_code',
    // Medicare / IHI
    'medicare_name', 'medicare_number', 'issue_number', 'irn', 'ihi_number',
    'concession_card_holder',
    // Consent / status
    'terms_conditions', 'declaration_i_have_answered_truthfully',
    'application_status', 'time_signed_terms',
    // Other
    'contact_comment', 'last_feedback_rating',
    'Outreach_Notes',
    // Intake invite tracking
    'send_intake_form'
  ].join(' ');

  // Latest Intake Form ClinicalNote — fields to fetch (PascalCase column names
  // from the new schema). Mapped to legacy Contact field names by
  // `mapIntakeFormToContactShape` below.
  //
  // The condition booleans (`Has_X`) are being phased out in favour of a single
  // `TGA_Indications` multi-select field aligned with the TGA's 31 official
  // cannabis-prescribing indications. We read both for now (TGA_Indications
  // takes precedence; booleans are fallback for pre-TGA-migration records).
  var INTAKE_FORM_QUERY_FIELDS = [
    'id', 'date_created', 'Note_Type', 'Intake_Completed_At', 'Intake_Form_Version',
    // TGA Indications (canonical multi-select; replaced the 27 condition booleans)
    'TGA_Indications_options_as_text',
    // Primary/secondary conditions (still used for severity + duration)
    'Primary_Condition', 'Primary_Condition_Severity', 'Primary_Condition_Duration',
    'Secondary_Condition', 'Secondary_Condition_Severity', 'Secondary_Condition_Duration',
    'Condition_Details', 'Allergies_Information',
    // Eligibility screening
    'I_have_an_allergy_to_cannabinoids', 'I_suffer_from_chronic_liver_disease',
    'I_am_currently_pregnant_or_breastfeeding',
    'I_have_a_history_of_suicidal_ideations_or_self_harm',
    'I_have_a_history_of_schizophrenia_bipolar_or_psychosis',
    'History_of_opioid_replacement_or_drug_dependency',
    'None_of_these_apply_to_me_intake',
    'Pregnancy_or_fertility_status',
    'Previous_treatment_intake', 'Treatment_outcome_intake',
    'Long_term_condition_intake', 'Mental_health_history_intake',
    // Mental health & PHQ-2
    'PHQ_2_Q1', 'PHQ_2_Q2', 'PHQ_2_Total_Score',
    'Psychiatric_History', 'Family_Psychiatric_History', 'Substance_Use',
    'Tobacco_Frequency', 'Alcohol_Units_Per_Week',
    'Current_Anxiety_or_Depression_Treatment',
    // Cannabis history
    'Has_Used_Cannabis_Before', 'Cannabis_History',
    'Cannabis_Experience_Level', 'Prior_Product_Feedback_intake',
    // Product preferences
    'Onset_Preference_intake', 'Flower_Preference_intake',
    'Lineage_Preference_intake', 'Organic_Preference_intake',
    'Effect_Preference_intake', 'Product_Preference_intake',
    'Prefers_Oils', 'Prefers_Vapes', 'Prefers_Edibles', 'Prefers_Flowers',
    'THC_Comfort_Level', 'Budget_Range_intake', 'Discretion_Important',
    // Lifestyle & safety
    'Shift_Work_intake', 'Heavy_Machinery_intake',
    'Drives_Regularly_intake', 'Competitive_Sport_intake',
    'Sport_Type_intake',
    // Current medications
    'What_Is_Working_For_You', 'List_Your_Medications_Supplements',
    'Why_Regular_Medicine_Isnt_Working', 'Currently_Taking_Medications',
    // Other clinic
    'Using_Other_Clinic', 'Alternative_Clinic_Email'
  ].join(' ');

  // TGA Indication option-id → label (Ontraport stores list-field values as
  // option IDs in `*/*<id>*/*<id>*/*` format; this map decodes them).
  // Keep in sync with the TGA Indications field options in Ontraport.
  var TGA_OPTION_ID_TO_LABEL = {
    '938': 'Wasting and anorexia', '939': 'Spasticity-associated Pain',
    '940': 'Spasticity', '941': 'Sleep Disorder', '942': 'Seizure Management',
    '943': 'Post-Traumatic Stress Disorder (PTSD)', '944': "Parkinson's Disease",
    '945': 'Palliative Care', '946': 'Osteoarthritis', '947': 'Neuropathic Pain',
    '948': 'Multiple Sclerosis', '949': 'Mood Disorder',
    '950': 'Irritable Bowel Syndrome (IBS)', '951': 'Insomnia',
    '952': 'Inflammatory Bowel Disease (IBD)',
    '953': 'Fibromyalgia and Arthropathic Pain', '954': 'Epilepsy',
    '955': 'Endometriosis', '956': 'Depression', '957': 'Dementia',
    "958": "Crohn's Disease", '959': 'Chronic non-cancer pain',
    '960': 'Chemotherapy-Induced Nausea and Vomiting (CINV)',
    '961': 'Cancer-related pain', '962': 'Cancer symptom management',
    '963': 'Cachexia', '964': 'Autism Spectrum Disorder (ASD)',
    '965': 'Attention Deficit Disorder with Hyperactivity (ADHD)',
    '966': 'Anxiety', '967': 'Anorexia', "968": "Alzheimer's Disease"
  };

  // TGA indication label → list of legacy Contact-style condition field names.
  // Used to translate the TGA multi-select back to the snake_case shape that
  // existing prescribe.js / recommend.js / mapContactToIntake expects.
  var TGA_LABEL_TO_LEGACY_FIELDS = {
    'Anxiety': ['anxiety_disorder'],
    'Depression': ['depression'],
    'Post-Traumatic Stress Disorder (PTSD)': ['ptsd'],
    'Attention Deficit Disorder with Hyperactivity (ADHD)': ['adhd'],
    'Sleep Disorder': ['sleep_disorder'],
    'Insomnia': ['sleep_disorder'],
    'Epilepsy': ['epilepsy'],
    'Seizure Management': ['epilepsy'],
    'Fibromyalgia and Arthropathic Pain': ['fibromyalgia', 'arthritis'],
    'Osteoarthritis': ['arthritis'],
    'Neuropathic Pain': ['neuropathic_pain'],
    'Chemotherapy-Induced Nausea and Vomiting (CINV)': ['chemotherapy_induced_nausea_and_vomiting'],
    'Endometriosis': ['endometriosis'],
    "Crohn's Disease": ['crohns_ulcerative_colitis_ibs_gut'],
    'Irritable Bowel Syndrome (IBS)': ['crohns_ulcerative_colitis_ibs_gut'],
    'Inflammatory Bowel Disease (IBD)': ['crohns_ulcerative_colitis_ibs_gut'],
    'Multiple Sclerosis': ['multiple_sclerosis'],
    'Spasticity': ['multiple_sclerosis'],
    'Spasticity-associated Pain': ['multiple_sclerosis'],
    'Cancer symptom management': ['cancer'],
    'Cancer-related pain': ['cancer'],
    "Parkinson's Disease": ['parkinson_s_disease'],
    'Autism Spectrum Disorder (ASD)': ['autism_spectrum_disorder'],
    'Palliative Care': ['palliative_care'],
    'Chronic non-cancer pain': ['chronic_non_cancer_pain'],
    'Anorexia': ['loss_of_appetite'],
    'Cachexia': ['loss_of_appetite'],
    'Wasting and anorexia': ['loss_of_appetite']
  };

  // Parse the Ontraport list-field encoding (slash-asterisk-slash delimited
  // option ids) into an array of TGA indication labels.
  function parseTgaIndications(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw.split('*/*').filter(Boolean).map(function (id) {
      return TGA_OPTION_ID_TO_LABEL[id] || null;
    }).filter(Boolean);
  }

  /**
   * Convert an Intake Form ClinicalNote record into the legacy Contact field
   * shape so downstream code can read `contact.adhd`, `contact.Severity`, etc.
   * unchanged.
   */
  function mapIntakeFormToContactShape(note) {
    if (!note) return {};
    var out = {};

    // ── Conditions: derive legacy snake_case condition flags ──
    // Prefer the TGA Indications multi-select (canonical post-migration).
    // Fall back to the Has_X booleans for older records that haven't been
    // migrated yet. Both produce the same snake_case keys downstream code reads.
    var legacyFromTga = {};
    var tgaLabels = parseTgaIndications(note.TGA_Indications_options_as_text);
    tgaLabels.forEach(function (label) {
      var legacy = TGA_LABEL_TO_LEGACY_FIELDS[label] || [];
      legacy.forEach(function (key) { legacyFromTga[key] = 1; });
    });

    Object.assign(out, legacyFromTga);
    out.__tgaIndications = tgaLabels; // expose for any TGA-aware UI

    // Severity — primary_condition_severity is the new authoritative one;
    // the legacy `Severity` field on Contact was a single integer.
    if (note.Primary_Condition_Severity != null) {
      out.Severity = note.Primary_Condition_Severity;
    }
    if (note.Cannabis_Experience_Level != null) {
      out.Experience_Level = note.Cannabis_Experience_Level;
    }

    if (note.Condition_Details) out.condition_details = note.Condition_Details;
    if (note.Allergies_Information) out.allergies_information = note.Allergies_Information;
    if (note.Pregnancy_or_fertility_status) out.pregnancy_or_fertility = note.Pregnancy_or_fertility_status;
    if (note.Previous_treatment_intake) out.previous_treatment = note.Previous_treatment_intake;
    if (note.Treatment_outcome_intake) out.treatment_outcome = note.Treatment_outcome_intake;
    if (note.Long_term_condition_intake) out.long_term_condition = note.Long_term_condition_intake;
    if (note.Mental_health_history_intake) out.mental_health_history = note.Mental_health_history_intake;

    // Eligibility / hard-exclusion booleans
    if (note.I_have_an_allergy_to_cannabinoids != null) out.i_have_an_allergy_to_cannabinoids = note.I_have_an_allergy_to_cannabinoids;
    if (note.I_suffer_from_chronic_liver_disease != null) out.i_suffer_from_chronic_liver_disease = note.I_suffer_from_chronic_liver_disease;
    if (note.I_am_currently_pregnant_or_breastfeeding != null) out.i_am_currently_pregnant_or_breastfeeding = note.I_am_currently_pregnant_or_breastfeeding;
    if (note.I_have_a_history_of_schizophrenia_bipolar_or_psychosis != null) out.i_have_a_history_of_schizophrenia_bipolar_and_or_psychosis = note.I_have_a_history_of_schizophrenia_bipolar_or_psychosis;
    if (note.History_of_opioid_replacement_or_drug_dependency != null) out.history_of_opioid_replacement_therapy_and_or_drug_dependency = note.History_of_opioid_replacement_or_drug_dependency;

    // Lifestyle & safety
    if (note.Drives_Regularly_intake != null) out.Drives_Regularly = note.Drives_Regularly_intake;
    if (note.Heavy_Machinery_intake != null) out.Heavy_Machinery = note.Heavy_Machinery_intake;
    if (note.Competitive_Sport_intake != null) out.Competitive_Sport = note.Competitive_Sport_intake;
    if (note.Sport_Type_intake) out.Sport_Type = note.Sport_Type_intake;
    if (note.Shift_Work_intake != null) out.Shift_Work = note.Shift_Work_intake;

    // Product preferences
    if (note.Product_Preference_intake) out.product_preference = note.Product_Preference_intake;
    if (note.Effect_Preference_intake) out.effect_preference = note.Effect_Preference_intake;
    if (note.Lineage_Preference_intake) out.lineage_preference = note.Lineage_Preference_intake;
    if (note.Onset_Preference_intake) out.Intake_Onset_Preference = note.Onset_Preference_intake;
    if (note.Flower_Preference_intake) out.Intake_Flower_Preference = note.Flower_Preference_intake;
    if (note.Organic_Preference_intake) out.Intake_Organic_Preference = note.Organic_Preference_intake;
    if (note.Budget_Range_intake) out.Budget_Range = note.Budget_Range_intake;
    if (note.Budget_Important != null) out.budget_important = note.Budget_Important;
    if (note.Discretion_Important != null) out.discretion_important = note.Discretion_Important;
    if (note.Prefers_Oils != null) out.oils = note.Prefers_Oils;
    if (note.Prefers_Vapes != null) out.vapes = note.Prefers_Vapes;
    if (note.Prefers_Edibles != null) out.edibles = note.Prefers_Edibles;
    if (note.Prefers_Flowers != null) out.flowers = note.Prefers_Flowers;
    if (note.Has_Used_Cannabis_Before != null) out.prev_cannabis_use = note.Has_Used_Cannabis_Before;
    if (note.Prior_Product_Feedback_intake) out.Prior_Product_Feedback = note.Prior_Product_Feedback_intake;

    // Current medications
    if (note.List_Your_Medications_Supplements) out.list_your_medications_supplements = note.List_Your_Medications_Supplements;
    if (note.Currently_Taking_Medications) out.are_you_currently_taking_any_medications_or_supplements = note.Currently_Taking_Medications;

    // Stash the source intake form id for write-back paths.
    if (note.id) out.__intakeFormId = note.id;

    return out;
  }

  /** Fetch the most recent Intake Form ClinicalNote for a patient. */
  function fetchLatestIntakeForm(patientId) {
    var q = 'query getLatestIntakeForm($pid: IntScalar!) { getClinicalNotes(' +
      'query: [' +
        '{ where:    { _OPERATOR_: eq, Latest_Intake_Form_for_Patient_id: $pid } }, ' +
        '{ andWhere: { _OPERATOR_: eq, Note_Type: "Intake Form" } }' +
      '], orderBy: { field: Intake_Completed_At, direction: desc }, limit: 1) { ' +
      INTAKE_FORM_QUERY_FIELDS + ' } }';
    return fetchGraphQL(q, { pid: Number(patientId) }).then(function (data) {
      var list = data && data.getClinicalNotes;
      var arr = Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      return arr.length ? arr[0] : null;
    }).catch(function (err) {
      console.warn('fetchLatestIntakeForm failed:', err);
      return null;
    });
  }

  function fetchPatientIntake(patientId) {
    var q = 'query getContactIntake($id: IntScalar!) { getContacts(query: [{ where: { id: $id, _OPERATOR_: eq } }], limit: 1) { ' + INTAKE_QUERY_FIELDS + ' } }';
    var contactPromise = fetchGraphQL(q, { id: Number(patientId) }).then(function (data) {
      var list = data && data.getContacts;
      var arr = Array.isArray(list) ? list : (list && list.list) || (list && list.data) || [];
      return arr.length ? arr[0] : {};
    });
    var intakePromise = fetchLatestIntakeForm(patientId);
    return Promise.all([contactPromise, intakePromise]).then(function (results) {
      var contact = results[0] || {};
      var intakeForm = results[1];
      // Merge: Intake Form values overlay Contact values for any keys that
      // moved. Identity / Medicare / consent stay from Contact.
      var mapped = mapIntakeFormToContactShape(intakeForm);
      Object.keys(mapped).forEach(function (k) {
        contact[k] = mapped[k];
      });
      // Stash whether an Intake Form ClinicalNote exists for this patient,
      // and when it was last completed. Consumers use this to render the
      // empty/refresh-required state.
      contact.__hasIntakeForm = !!(intakeForm && intakeForm.id);
      contact.__intakeFormId = intakeForm && intakeForm.id || null;
      contact.__intakeCompletedAt = intakeForm && intakeForm.Intake_Completed_At || null;
      return contact;
    });
  }

  /**
   * Update the patient's identity / consent / status fields on the Contact.
   * Use for fields that stay on Contact after the migration (name, Medicare,
   * application_status, Outreach_Notes, etc.).
   */
  function updatePatientContact(patientId, fields) {
    var payload = { objectID: 0, id: patientId };
    for (var key in fields) payload[key] = fields[key];
    return ontraportRequest('PUT', '/objects', payload);
  }

  /**
   * Update the latest Intake Form ClinicalNote for a patient.
   * `fields` should use the NEW PascalCase ClinicalNote field names
   * (e.g. Has_ADHD, Allergies_Information). Pass `intakeFormId` directly to
   * skip the lookup if the caller already has it (e.g. from fetchPatientIntake's
   * __intakeFormId stash).
   */
  function updateLatestIntakeForm(patientId, fields, intakeFormId) {
    var lookup = intakeFormId
      ? Promise.resolve(intakeFormId)
      : fetchLatestIntakeForm(patientId).then(function (n) { return n ? n.id : null; });
    return lookup.then(function (id) {
      if (!id) {
        return Promise.reject(new Error('No Intake Form ClinicalNote found for patient ' + patientId));
      }
      var payload = { objectID: 10008, id: id };
      for (var key in fields) payload[key] = fields[key];
      return ontraportRequest('PUT', '/objects', payload);
    });
  }

  /**
   * Backwards-compatible shim. Translates legacy Contact-style snake_case keys
   * onto the new Intake Form (ClinicalNote) schema OR the TGA Indications
   * multi-select. Use the explicit `updatePatientContact` /
   * `updateLatestIntakeForm` for new code; this shim exists so the existing
   * prescribe.js condition checkboxes keep working.
   */

  // Legacy condition keys (snake_case Contact field names) → TGA indication
  // labels they should populate. Same mapping as the patient intake form's
  // form-label → TGA mapping, just keyed by the snake_case column name.
  var LEGACY_CONDITION_TO_TGA_LABELS = {
    'adhd': ['Attention Deficit Disorder with Hyperactivity (ADHD)'],
    'ptsd': ['Post-Traumatic Stress Disorder (PTSD)'],
    'cancer': ['Cancer symptom management', 'Cancer-related pain'],
    'anxiety_disorder': ['Anxiety'],
    'epilepsy': ['Epilepsy', 'Seizure Management'],
    'glaucoma': [],
    'arthritis': ['Osteoarthritis', 'Fibromyalgia and Arthropathic Pain'],
    'headaches': ['Neuropathic Pain'],
    'migraines': ['Neuropathic Pain'],
    'crohns_ulcerative_colitis_ibs_gut': ["Crohn's Disease", 'Irritable Bowel Syndrome (IBS)', 'Inflammatory Bowel Disease (IBD)'],
    'depression': ['Depression'],
    'parkinson_s_disease': ["Parkinson's Disease"],
    'fibromyalgia': ['Fibromyalgia and Arthropathic Pain'],
    'inflammation': ['Inflammatory Bowel Disease (IBD)'],
    'endometriosis': ['Endometriosis'],
    'sleep_disorder': ['Sleep Disorder', 'Insomnia'],
    'autism_spectrum_disorder': ['Autism Spectrum Disorder (ASD)'],
    'chemotherapy_induced_nausea_and_vomiting': ['Chemotherapy-Induced Nausea and Vomiting (CINV)'],
    'other_condition': [],
    'palliative_care': ['Palliative Care'],
    'loss_of_appetite': [],
    'neuropathic_pain': ['Neuropathic Pain'],
    'multiple_sclerosis': ['Multiple Sclerosis', 'Spasticity', 'Spasticity-associated Pain'],
    'chronic_illness': [],
    'chronic_non_cancer_pain': ['Chronic non-cancer pain']
  };

  // Non-condition legacy keys → ClinicalNote field names (still single-write,
  // routed via updateLatestIntakeForm). Keep this map separate from condition
  // keys so condition writes can be batched into TGA Indications.
  var INTAKE_FORM_LEGACY_KEYS = {
    'condition_details': 'Condition_Details',
    'allergies_information': 'Allergies_Information',
    'pregnancy_or_fertility': 'Pregnancy_or_fertility_status',
    'previous_treatment': 'Previous_treatment_intake',
    'treatment_outcome': 'Treatment_outcome_intake',
    'long_term_condition': 'Long_term_condition_intake',
    'mental_health_history': 'Mental_health_history_intake',
    'i_have_an_allergy_to_cannabinoids': 'I_have_an_allergy_to_cannabinoids',
    'i_suffer_from_chronic_liver_disease': 'I_suffer_from_chronic_liver_disease',
    'i_am_currently_pregnant_or_breastfeeding': 'I_am_currently_pregnant_or_breastfeeding',
    'i_have_a_history_of_schizophrenia_bipolar_and_or_psychosis': 'I_have_a_history_of_schizophrenia_bipolar_or_psychosis',
    'history_of_opioid_replacement_therapy_and_or_drug_dependency': 'History_of_opioid_replacement_or_drug_dependency',
    'Severity': 'Primary_Condition_Severity',
    'Experience_Level': 'Cannabis_Experience_Level',
    'Drives_Regularly': 'Drives_Regularly_intake',
    'Heavy_Machinery': 'Heavy_Machinery_intake',
    'Competitive_Sport': 'Competitive_Sport_intake',
    'Sport_Type': 'Sport_Type_intake',
    'Shift_Work': 'Shift_Work_intake',
    'product_preference': 'Product_Preference_intake',
    'effect_preference': 'Effect_Preference_intake',
    'lineage_preference': 'Lineage_Preference_intake',
    'Intake_Onset_Preference': 'Onset_Preference_intake',
    'Intake_Flower_Preference': 'Flower_Preference_intake',
    'Intake_Organic_Preference': 'Organic_Preference_intake',
    'Budget_Range': 'Budget_Range_intake',
    'discretion_important': 'Discretion_Important',
    'oils': 'Prefers_Oils', 'vapes': 'Prefers_Vapes',
    'edibles': 'Prefers_Edibles', 'flowers': 'Prefers_Flowers',
    'prev_cannabis_use': 'Has_Used_Cannabis_Before',
    'Prior_Product_Feedback': 'Prior_Product_Feedback_intake',
    'list_your_medications_supplements': 'List_Your_Medications_Supplements',
    'are_you_currently_taking_any_medications_or_supplements': 'Currently_Taking_Medications'
  };

  // Ontraport field id for TGA Indications (multi-select). Hardcoded for
  // stability — option ids change if the field is recreated, but the field id
  // is stable until the field itself is dropped.
  var TGA_INDICATIONS_FIELD_ID = 'f3478';

  /**
   * Translate a payload of legacy condition keys into a TGA Indications
   * multi-select string. Pass labels (not option ids) — Ontraport accepts both
   * and converts labels to ids server-side.
   */
  function buildTgaIndicationsValue(payload) {
    var labels = {};
    Object.keys(payload).forEach(function (k) {
      var v = payload[k];
      var isOn = (v === '1' || v === 1 || v === true);
      if (!isOn) return;
      var tgaLabels = LEGACY_CONDITION_TO_TGA_LABELS[k];
      if (!tgaLabels) return;
      tgaLabels.forEach(function (l) { labels[l] = true; });
    });
    var arr = Object.keys(labels);
    return arr.length > 0 ? '*/*' + arr.join('*/*') + '*/*' : null;
  }

  function updatePatientIntake(patientId, fields) {
    var contactFields = {};
    var intakeFields = {};
    var hasConditionKeys = false;

    Object.keys(fields).forEach(function (k) {
      if (LEGACY_CONDITION_TO_TGA_LABELS.hasOwnProperty(k)) {
        // Condition key — handled below via TGA Indications, not as Has_X.
        hasConditionKeys = true;
        return;
      }
      var newKey = INTAKE_FORM_LEGACY_KEYS[k];
      if (newKey) intakeFields[newKey] = fields[k];
      else contactFields[k] = fields[k];
    });

    if (hasConditionKeys) {
      // The caller is rewriting the patient's condition set wholesale. Build
      // the TGA Indications multi-select from whichever condition keys are
      // present + truthy and overwrite the field.
      var tgaValue = buildTgaIndicationsValue(fields);
      // Even an empty result should clear the field — write empty delimiter.
      intakeFields[TGA_INDICATIONS_FIELD_ID] = tgaValue || '';
    }

    var promises = [];
    if (Object.keys(contactFields).length) promises.push(updatePatientContact(patientId, contactFields));
    if (Object.keys(intakeFields).length) promises.push(updateLatestIntakeForm(patientId, intakeFields));
    return Promise.all(promises);
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
      if (!res.ok) {
        return res.text().then(function (body) {
          console.error('Ontraport API HTTP error:', res.status, body);
          throw new Error('Ontraport API error: ' + res.status + ' — ' + body);
        });
      }
      return res.json();
    }).then(function (json) {
      if (json.code != null && json.code !== 0) {
        console.error('Ontraport API error:', json);
        throw new Error('Ontraport error code: ' + json.code + (json.message ? ' — ' + json.message : ''));
      }
      return json.data || json;
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
    if (apptData.timeslot_id) payload[APPT_FIELDS.timeslot_id] = String(apptData.timeslot_id);
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
    var amt = Number(opts.amount);
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
          owner: 1,
          type: 'single',
          taxable: false,
          shipping: false,
          price: [{ price: amt, payment_count: 0, id: 1 }],
          total: amt,
        }],
        shipping: [],
        subTotal: amt,
        grandTotal: amt,
      },
      customer_note: opts.description || 'Consultation fee',
      external_order_id: opts.appointment_id ? 'APPT-' + opts.appointment_id : 'CLIN-' + Date.now(),
    };
    return ontraportRequest('POST', '/transaction/requestPayment', payload);
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
    fetchItemById: fetchItemById,
    fetchPatientIntake: fetchPatientIntake,
    fetchLatestIntakeForm: fetchLatestIntakeForm,
    updatePatientIntake: updatePatientIntake,
    updatePatientContact: updatePatientContact,
    updateLatestIntakeForm: updateLatestIntakeForm,
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
