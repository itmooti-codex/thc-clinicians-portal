// thc-clinicians-portal — Main Application
// Clinician portal: patient search, detail views, appointments, notes, scripts.
(function () {
  'use strict';

  var u = window.AppUtils;
  var data = window.AppData;
  var doctorId = null;
  var allPatients = [];
  var itemsMap = {};   // id -> Item (for drug names in scripts)

  // ── Initialization ─────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    window.VitalSync.connect()
      .then(function () {
        doctorId = window.AppConfig.CONTACT_ID || null;

        // Hide loading, show content
        var loading = u.byId('app-loading');
        var content = u.byId('app-content');
        if (loading) loading.classList.add('hidden');
        if (content) content.classList.remove('hidden');

        bindEvents();
        loadInitialData();
      })
      .catch(function (err) {
        var loading = u.byId('app-loading');
        var error = u.byId('app-error');
        if (loading) loading.classList.add('hidden');
        if (error) error.classList.remove('hidden');
        console.error('App init failed:', err);
      });
  });

  function loadInitialData() {
    // Fetch patients and items in parallel
    Promise.all([
      data.fetchPatients(500),
      data.fetchItems(500),
    ]).then(function (results) {
      allPatients = results[0] || [];
      var items = results[1] || [];

      // Build items lookup
      items.forEach(function (item) { itemsMap[item.id] = item; });

      // Load doctor name
      if (doctorId) {
        data.fetchPatientById(Number(doctorId)).then(function (doc) {
          if (doc) {
            var el = u.byId('doctor-name');
            if (el) el.textContent = 'Dr. ' + (doc.first_name || '') + ' ' + (doc.last_name || '');
          }
        });
      }

      renderPatientList(allPatients);
    }).catch(function (err) {
      console.error('Failed to load initial data:', err);
      u.showToast('Failed to load data. Please refresh.', 'error');
    });
  }

  // ── Event Binding ──────────────────────────────────────────

  function bindEvents() {
    // Main tabs
    u.$$('#main-tabs .tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchMainTab(btn.dataset.tab); });
    });

    // Patient search (debounced)
    var searchInput = u.byId('patient-search');
    if (searchInput) {
      var timer;
      searchInput.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { filterPatients(searchInput.value); }, 200);
      });
    }

    // Add patient modal
    u.byId('btn-add-patient').addEventListener('click', function () { openModal('modal-add-patient'); });
    u.byId('form-add-patient').addEventListener('submit', handleCreatePatient);

    // Add appointment
    u.byId('btn-add-appointment').addEventListener('click', function () {
      // Default date/time to now
      var now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      u.byId('appt-date').value = now.toISOString().slice(0, 16);
      openModal('modal-add-appointment');
    });
    u.byId('form-add-appointment').addEventListener('submit', handleCreateAppointment);

    // Back button
    u.byId('btn-back-patients').addEventListener('click', function () { showView('patients'); });

    // Detail sub-tabs
    u.$$('#detail-tabs .detail-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchDetailTab(btn.dataset.detailTab); });
    });

    // Modal close buttons
    u.$$('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.dataset.closeModal); });
    });

    // Close modals on overlay click
    u.$$('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  // ── Navigation ─────────────────────────────────────────────

  function switchMainTab(tab) {
    u.$$('#main-tabs .tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    u.$$('.view').forEach(function (v) { v.classList.add('hidden'); });

    if (tab === 'patients') {
      u.byId('view-patients').classList.remove('hidden');
    } else if (tab === 'appointments') {
      u.byId('view-appointments').classList.remove('hidden');
      loadDoctorAppointments();
    }
  }

  function showView(view) {
    u.$$('.view').forEach(function (v) { v.classList.add('hidden'); });

    if (view === 'patients') {
      u.byId('view-patients').classList.remove('hidden');
      u.$$('#main-tabs .tab-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === 'patients');
      });
    } else if (view === 'patient-detail') {
      u.byId('view-patient-detail').classList.remove('hidden');
    }
  }

  function switchDetailTab(tab) {
    u.$$('#detail-tabs .detail-tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.detailTab === tab);
    });

    u.$$('.detail-panel').forEach(function (p) { p.classList.add('hidden'); });
    var panel = u.byId('detail-' + tab);
    if (panel) panel.classList.remove('hidden');
  }

  // ── Modal Helpers ──────────────────────────────────────────

  function openModal(id) {
    var modal = u.byId(id);
    if (modal) modal.classList.remove('hidden');
  }

  function closeModal(id) {
    var modal = u.byId(id);
    if (modal) modal.classList.add('hidden');
  }

  // ── Patient Search & List ──────────────────────────────────

  function filterPatients(query) {
    if (!query || !query.trim()) {
      renderPatientList(allPatients);
      return;
    }
    var q = query.toLowerCase().trim();
    var filtered = allPatients.filter(function (p) {
      var name = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      var email = (p.email || '').toLowerCase();
      var phone = (p.sms_number || '');
      return name.indexOf(q) !== -1 || email.indexOf(q) !== -1 || phone.indexOf(q) !== -1;
    });
    renderPatientList(filtered);
  }

  function renderPatientList(patients) {
    var container = u.byId('patient-list');
    var emptyEl = u.byId('patient-empty');
    var countEl = u.byId('patient-count');

    if (countEl) countEl.textContent = patients.length + ' patient' + (patients.length !== 1 ? 's' : '');

    if (!patients.length) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    container.innerHTML = patients.map(function (p) {
      var initials = ((p.first_name || '?')[0] + (p.last_name || '?')[0]).toUpperCase();
      var name = u.escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''));
      var meta = u.escapeHtml(p.email || 'No email');
      if (p.sms_number) meta += '  &middot;  ' + u.escapeHtml(p.sms_number);
      var statusChip = getStatusChip(p.application_status || p.clinician_status || '');

      return (
        '<div class="patient-card" data-patient-id="' + p.id + '">' +
          '<div class="patient-avatar">' + initials + '</div>' +
          '<div class="patient-card-info">' +
            '<div class="patient-card-name">' + name + '</div>' +
            '<div class="patient-card-meta">' + meta + '</div>' +
          '</div>' +
          statusChip +
          '<svg class="patient-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>'
      );
    }).join('');

    // Click handlers
    u.$$('.patient-card', container).forEach(function (card) {
      card.addEventListener('click', function () {
        openPatientDetail(Number(card.dataset.patientId));
      });
    });
  }

  // ── Patient Detail ─────────────────────────────────────────

  function openPatientDetail(patientId) {
    var patient = allPatients.find(function (p) { return p.id === patientId; });
    if (!patient) {
      u.showToast('Patient not found', 'error');
      return;
    }

    renderPatientHero(patient);
    showView('patient-detail');
    switchDetailTab('appointments');

    // Load detail data in parallel
    loadPatientAppointments(patientId);
    loadPatientNotes(patientId);
    loadPatientScripts(patientId);

    // Set up appointment modal context
    u.byId('appt-patient-id').value = patientId;
    u.byId('appt-patient-name').textContent = (patient.first_name || '') + ' ' + (patient.last_name || '');
  }

  function renderPatientHero(p) {
    var hero = u.byId('patient-hero');
    var initials = ((p.first_name || '?')[0] + (p.last_name || '?')[0]).toUpperCase();
    var name = u.escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''));
    var statusChip = getStatusChip(p.application_status || p.clinician_status || '');

    var metaItems = [];
    if (p.email) {
      metaItems.push(
        '<span class="hero-meta-item">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>' +
          u.escapeHtml(p.email) +
        '</span>'
      );
    }
    if (p.sms_number) {
      metaItems.push(
        '<span class="hero-meta-item">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>' +
          u.escapeHtml(p.sms_number) +
        '</span>'
      );
    }
    if (p.city || p.state_au) {
      metaItems.push(
        '<span class="hero-meta-item">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          u.escapeHtml((p.city || '') + (p.city && p.state_au ? ', ' : '') + (p.state_au || '')) +
        '</span>'
      );
    }

    hero.innerHTML =
      '<div class="hero-top">' +
        '<div class="hero-avatar">' + initials + '</div>' +
        '<div>' +
          '<div class="hero-name">' + name + ' ' + statusChip + '</div>' +
          (p.treatment_plan ? '<div style="font-size:13px;color:var(--brand-text-muted);margin-top:2px">Treatment: ' + u.escapeHtml(p.treatment_plan) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="hero-meta">' + metaItems.join('') + '</div>';
  }

  // ── Patient Appointments ───────────────────────────────────

  function loadPatientAppointments(patientId) {
    var list = u.byId('patient-appointments-list');
    var empty = u.byId('patient-appointments-empty');
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    empty.classList.add('hidden');

    data.fetchAppointments({ patient_id: patientId }).then(function (appts) {
      appts.sort(function (a, b) { return (b.appointment_time || 0) - (a.appointment_time || 0); });

      if (!appts.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      list.innerHTML = appts.map(renderAppointmentCard).join('');
    }).catch(function (err) {
      console.error('Failed to load appointments:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load appointments</div>';
    });
  }

  function renderAppointmentCard(appt) {
    var dateStr = u.formatDate(appt.appointment_time);
    var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '';
    var chip = getStatusChip(appt.status || '');
    var fee = appt.fee_paid ? u.formatCurrency(appt.fee_paid) : '';

    return (
      '<div class="record-card">' +
        '<div class="record-card-header">' +
          '<span class="record-card-title">' + u.escapeHtml(appt.type || 'Appointment') + '</span>' +
          chip +
        '</div>' +
        '<div class="record-card-body">' +
          '<p>' + dateStr + (timeStr ? ' at ' + timeStr : '') + '</p>' +
          (fee ? '<p>Fee: ' + fee + '</p>' : '') +
        '</div>' +
      '</div>'
    );
  }

  // ── Doctor Appointments ────────────────────────────────────

  function loadDoctorAppointments() {
    var list = u.byId('doctor-appointments-list');
    var empty = u.byId('doctor-appointments-empty');
    var loading = u.byId('doctor-appointments-loading');

    list.innerHTML = '';
    empty.classList.add('hidden');
    loading.classList.remove('hidden');

    var filters = { limit: 200 };
    if (doctorId) filters.doctor_id = doctorId;

    data.fetchAppointments(filters).then(function (appts) {
      loading.classList.add('hidden');
      appts.sort(function (a, b) { return (b.appointment_time || 0) - (a.appointment_time || 0); });

      if (!appts.length) {
        empty.classList.remove('hidden');
        return;
      }

      // Group by today / upcoming / past
      var now = Math.floor(Date.now() / 1000);
      var todayStart = getDayStart(now);
      var todayEnd = todayStart + 86400;

      var today = [], upcoming = [], past = [];
      appts.forEach(function (a) {
        var t = a.appointment_time || 0;
        if (t >= todayStart && t < todayEnd) today.push(a);
        else if (t >= todayEnd) upcoming.push(a);
        else past.push(a);
      });

      var html = '';
      if (today.length) {
        html += '<h3 class="detail-heading" style="margin-bottom:10px">Today</h3>' +
                today.map(renderDoctorAppointmentCard).join('');
      }
      if (upcoming.length) {
        html += '<h3 class="detail-heading" style="margin:20px 0 10px">Upcoming</h3>' +
                upcoming.map(renderDoctorAppointmentCard).join('');
      }
      if (past.length) {
        html += '<h3 class="detail-heading" style="margin:20px 0 10px;color:var(--brand-text-muted)">Past</h3>' +
                past.map(renderDoctorAppointmentCard).join('');
      }
      list.innerHTML = html;
    }).catch(function (err) {
      loading.classList.add('hidden');
      console.error('Failed to load doctor appointments:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load appointments</div>';
    });
  }

  function renderDoctorAppointmentCard(appt) {
    var dateStr = u.formatDate(appt.appointment_time);
    var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '';
    var chip = getStatusChip(appt.status || '');
    var patientName = getPatientName(appt.patient_id);

    return (
      '<div class="record-card" style="margin-bottom:8px">' +
        '<div class="record-card-header">' +
          '<span class="record-card-title">' + u.escapeHtml(patientName) + '</span>' +
          chip +
        '</div>' +
        '<div class="record-card-body">' +
          '<p>' + u.escapeHtml(appt.type || 'Appointment') + ' &middot; ' + dateStr + (timeStr ? ' at ' + timeStr : '') + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Clinical Notes ─────────────────────────────────────────

  function loadPatientNotes(patientId) {
    var list = u.byId('patient-notes-list');
    var empty = u.byId('patient-notes-empty');
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    empty.classList.add('hidden');

    data.fetchClinicalNotes(patientId).then(function (notes) {
      notes.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });

      if (!notes.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      list.innerHTML = notes.map(function (note) {
        return (
          '<div class="record-card">' +
            '<div class="record-card-header">' +
              '<span class="record-card-title">' + u.escapeHtml(note.title || 'Clinical Note') + '</span>' +
            '</div>' +
            '<div class="record-card-body">' +
              '<p>' + u.escapeHtml(truncate(note.content || '', 300)) + '</p>' +
            '</div>' +
            '<div class="record-card-footer">' + u.formatDate(note.created_at) + '</div>' +
          '</div>'
        );
      }).join('');
    }).catch(function (err) {
      console.error('Failed to load notes:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load notes</div>';
    });
  }

  // ── Scripts / Prescriptions ────────────────────────────────

  function loadPatientScripts(patientId) {
    var list = u.byId('patient-scripts-list');
    var empty = u.byId('patient-scripts-empty');
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    empty.classList.add('hidden');

    data.fetchScripts(patientId).then(function (scripts) {
      scripts.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });

      if (!scripts.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      list.innerHTML = scripts.map(function (script) {
        var drug = itemsMap[script.drug_id];
        var drugName = drug ? drug.item_name : 'Unknown medication';
        var drugBrand = drug ? drug.brand : '';
        var chip = getScriptStatusChip(script.script_status || '');

        return (
          '<div class="record-card">' +
            '<div class="record-card-header">' +
              '<span class="record-card-title">' + u.escapeHtml(drugName) +
                (drugBrand ? ' <span style="font-weight:400;color:var(--brand-text-muted)">(' + u.escapeHtml(drugBrand) + ')</span>' : '') +
              '</span>' +
              chip +
            '</div>' +
            '<div class="record-card-body">' +
              '<p>Repeats: ' + (script.repeats || 0) + ' &middot; Remaining: ' + (script.remaining || 0) + '</p>' +
            '</div>' +
            '<div class="record-card-footer">' + u.formatDate(script.created_at) + '</div>' +
          '</div>'
        );
      }).join('');
    }).catch(function (err) {
      console.error('Failed to load scripts:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load scripts</div>';
    });
  }

  // ── Create Patient ─────────────────────────────────────────

  function handleCreatePatient(e) {
    e.preventDefault();
    var btn = u.byId('btn-submit-patient');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    var payload = {
      first_name: u.byId('new-first-name').value.trim(),
      last_name: u.byId('new-last-name').value.trim(),
      email: u.byId('new-email').value.trim(),
    };

    var phone = u.byId('new-phone').value.trim();
    if (phone) payload.sms_number = phone;

    var address = u.byId('new-address').value.trim();
    if (address) payload.address = address;

    var city = u.byId('new-city').value.trim();
    if (city) payload.city = city;

    var state = u.byId('new-state').value;
    if (state) payload.state_au = state;

    var zip = u.byId('new-zip').value.trim();
    if (zip) payload.zip_code = zip;

    data.createPatient(payload).then(function () {
      u.showToast('Patient created successfully', 'success');
      closeModal('modal-add-patient');
      u.byId('form-add-patient').reset();

      // Refresh patient list
      data.fetchPatients(500).then(function (patients) {
        allPatients = patients || [];
        var q = u.byId('patient-search').value;
        if (q) filterPatients(q); else renderPatientList(allPatients);
      });
    }).catch(function (err) {
      console.error('Create patient failed:', err);
      u.showToast('Failed to create patient: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Create Patient';
    });
  }

  // ── Create Appointment ─────────────────────────────────────

  function handleCreateAppointment(e) {
    e.preventDefault();
    var btn = u.byId('btn-submit-appointment');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    var patientId = Number(u.byId('appt-patient-id').value);
    var dateVal = u.byId('appt-date').value;
    var apptTime = dateVal ? Math.floor(new Date(dateVal).getTime() / 1000) : 0;

    var payload = {
      type: u.byId('appt-type').value,
      patient_id: patientId,
      appointment_time: apptTime,
      status: 'Booked',
    };

    if (doctorId) payload.doctor_id = Number(doctorId);

    data.createAppointment(payload).then(function (result) {
      u.showToast('Appointment created', 'success');
      closeModal('modal-add-appointment');
      u.byId('form-add-appointment').reset();

      // Open the clinician appointment page in Ontraport
      var pageUrl = result && result.page_105_url;
      if (pageUrl) {
        window.open(pageUrl, '_blank');
      }

      // Refresh patient appointments
      loadPatientAppointments(patientId);
    }).catch(function (err) {
      console.error('Create appointment failed:', err);
      u.showToast('Failed to create appointment: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Create Appointment';
    });
  }

  // ── Helpers ────────────────────────────────────────────────

  function getPatientName(patientId) {
    if (!patientId) return 'Unknown Patient';
    var p = allPatients.find(function (c) { return c.id === patientId; });
    return p ? (p.first_name || '') + ' ' + (p.last_name || '') : 'Patient #' + patientId;
  }

  function getStatusChip(status) {
    if (!status) return '';
    var cls = 'chip-default';
    var s = status.toLowerCase();
    if (s === 'active' || s === 'completed' || s === 'paid' || s === 'approved' || s === 'application approved') cls = 'chip-active';
    else if (s === 'booked' || s === 'pending' || s === 'pending payment' || s === 'application pending' || s === 'awaiting approval' || s === 'new' || s === 'draft') cls = 'chip-pending';
    else if (s === 'cancelled' || s === 'rejected' || s === 'no show' || s === 'suspended' || s === 'deactivated') cls = 'chip-error';
    else if (s === 'rescheduled' || s === 'consultation booked' || s === 'script issued') cls = 'chip-info';
    return '<span class="chip ' + cls + '">' + u.escapeHtml(status) + '</span>';
  }

  function getScriptStatusChip(status) {
    if (!status) return '';
    var cls = 'chip-default';
    var s = status.toLowerCase();
    if (s === 'fulfilled') cls = 'chip-active';
    else if (s === 'open' || s === 'to be processed' || s === 'external processing' || s === 'draft') cls = 'chip-pending';
    else if (s === 'cancelled' || s === 'stock issue') cls = 'chip-error';
    return '<span class="chip ' + cls + '">' + u.escapeHtml(status) + '</span>';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }

  function getDayStart(ts) {
    var d = new Date(ts * 1000);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  function truncate(str, max) {
    if (!str || str.length <= max) return str;
    return str.substring(0, max) + '...';
  }
})();
