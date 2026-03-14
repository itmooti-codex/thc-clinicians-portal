// thc-clinicians-portal — Main Application
// Clinician portal: patient search, detail views, appointments, notes, scripts.
(function () {
  'use strict';

  var u = window.AppUtils;
  var data = window.AppData;
  var doctorId = null;
  var allPatients = [];
  var itemsMap = {};   // id -> Item (for drug names in scripts)
  var cachedTimeslots = [];
  var cachedDoctorAppointments = [];
  var timeslotsCalendarInstance = null;
  var appointmentsCalendarInstance = null;
  var editingTimeslotId = null;
  var timeslotActionSlot = null;
  var CALENDAR_VIEW_HOURS_STORAGE_KEY = 'thc_calendar_view_hours';
  var pageSettingsContext = null;
  var timeslotsSorted = [];
  var timeslotsNextIndex = -1;
  var timeslotsWindowStart = 0;
  var timeslotsWindowEnd = 0;
  var TIMESLOTS_PAGE_SIZE = 10;
  var TIMESLOTS_SCROLL_THRESHOLD = 120;

  // ── Initialization ─────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    doctorId = window.AppConfig && (window.AppConfig.CONTACT_ID || null);
    var loading = u.byId('app-loading');
    var content = u.byId('app-content');
    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    bindEvents();
    // Data is loaded via direct GraphQL API (no SDK). Short delay then load.
    var delay = window.__TEST_MOCK__ ? 0 : 500;
    setTimeout(function () { loadInitialData(); }, delay);
  });

  var INITIAL_DATA_RETRY_DELAYS_MS = [5000, 10000];
  var patientListEmptyMessage = 'No patients found';
  var patientSearchHasRun = false;
  var initialLoadSettled = false;

  function showPatientLoadError(show) {
    var errEl = u.byId('patient-load-error');
    if (errEl) errEl.classList.toggle('hidden', !show);
  }

  function applyInitialData(items, doctorDoc) {
    showPatientLoadError(false);
    if (items && items.length) {
      items.forEach(function (item) { itemsMap[item.id] = item; });
    }
    if (doctorDoc) {
      var el = u.byId('doctor-name');
      if (el) el.textContent = 'Dr. ' + (doctorDoc.first_name || '') + ' ' + (doctorDoc.last_name || '');
    }
    patientSearchHasRun = false;
    patientListEmptyMessage = 'Search by name, email, or phone and press Enter.';
    renderPatientList([]);
    var doctorIdNum = doctorId != null ? Number(doctorId) : NaN;
    if (!doctorDoc && !isNaN(doctorIdNum) && doctorIdNum > 0) {
      data.fetchPatientById(doctorIdNum).then(function (doc) {
        if (doc) {
          var el = u.byId('doctor-name');
          if (el) el.textContent = 'Dr. ' + (doc.first_name || '') + ' ' + (doc.last_name || '');
        }
      }).catch(function () {});
    }
  }

  function loadInitialData(retryCount) {
    retryCount = retryCount || 0;
    data.fetchItems(500)
      .then(function (items) {
        initialLoadSettled = true;
        var list = Array.isArray(items) ? items : (items && items.list) || (items && items.data) || [];
        applyInitialData(list, null);
      })
      .catch(function (err) {
        console.error('Failed to load initial data:', err);
        if (retryCount < INITIAL_DATA_RETRY_DELAYS_MS.length) {
          var delay = INITIAL_DATA_RETRY_DELAYS_MS[retryCount];
          setTimeout(function () {
            loadInitialData(retryCount + 1);
          }, delay);
        } else {
          initialLoadSettled = true;
          showPatientLoadError(true);
          u.showToast('Failed to load data. Try Retry below or refresh the page.', 'error');
        }
      });
  }

  // ── Event Binding ──────────────────────────────────────────

  function bindEvents() {
    // Main tabs
    u.$$('#main-tabs .tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchMainTab(btn.dataset.tab); });
    });

    var btnRetryLoad = u.byId('btn-retry-load');
    if (btnRetryLoad) {
      btnRetryLoad.addEventListener('click', function () {
        initialLoadSettled = false;
        showPatientLoadError(false);
        loadInitialData(0);
      });
    }

    // Patient search: run on Enter (server-side)
    var searchInput = u.byId('patient-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        runPatientSearch();
      });
    }

    // Add patient modal
    u.byId('btn-add-patient').addEventListener('click', function () { openModal('modal-add-patient'); });
    u.byId('form-add-patient').addEventListener('submit', handleCreatePatient);

    // Add appointment (from patient detail)
    u.byId('btn-add-appointment').addEventListener('click', function () {
      var btn = u.byId('btn-add-appointment');
      var id = btn && btn.dataset.patientId;
      var name = btn && btn.dataset.patientName;
      openAddAppointmentModal(id ? Number(id) : null, name || '');
    });
    // Add appointment (from My Appointments)
    var btnAddApptFromList = u.byId('btn-add-appointment-from-list');
    if (btnAddApptFromList) btnAddApptFromList.addEventListener('click', function () { openAddAppointmentModal(null); });
    u.byId('form-add-appointment').addEventListener('submit', handleCreateAppointment);

    // Patient search in add-appointment modal: Enter runs server search
    var apptPatientSearch = u.byId('appt-patient-search');
    var apptPatientResults = u.byId('appt-patient-results');
    if (apptPatientSearch) {
      apptPatientSearch.addEventListener('input', function () {
        u.byId('appt-patient-id').value = '';
      });
      apptPatientSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runAppointmentPatientSearch();
        }
      });
      apptPatientSearch.addEventListener('focus', function () {
        if (!u.byId('appt-patient-id').value) renderAppointmentPatientResultsFromList([], 'Type a name and press Enter to search.');
      });
      apptPatientSearch.addEventListener('blur', function () {
        setTimeout(function () {
          if (apptPatientResults) apptPatientResults.classList.add('hidden');
        }, 200);
      });
    }
    if (apptPatientResults) {
      apptPatientResults.addEventListener('click', function (e) {
        var item = e.target && e.target.closest('.patient-result-item:not(.empty-msg)');
        if (!item || !item.dataset.patientId) return;
        u.byId('appt-patient-id').value = item.dataset.patientId || '';
        if (apptPatientSearch) apptPatientSearch.value = item.dataset.patientName || '';
        apptPatientResults.classList.add('hidden');
        apptPatientResults.innerHTML = '';
      });
    }

    // Add timeslot
    u.byId('btn-add-timeslot').addEventListener('click', function () {
      var now = new Date();
      now.setMinutes(0, 0, 0);
      openAddTimeslotWithStart(now);
    });
    u.byId('slot-start').addEventListener('input', updateSlotSelectedDay);
    u.byId('slot-start').addEventListener('change', updateSlotSelectedDay);
    u.byId('form-add-timeslot').addEventListener('submit', handleCreateTimeslot);

    // Timeslots list/calendar toggle
    var timeslotsListWrap = u.byId('timeslots-list-wrap');
    if (timeslotsListWrap) {
      timeslotsListWrap.addEventListener('scroll', function () {
        if (!timeslotsSorted.length) return;
        var list = u.byId('timeslots-list');
        if (!list) return;
        var scrollTop = timeslotsListWrap.scrollTop;
        var clientHeight = timeslotsListWrap.clientHeight;
        var scrollHeight = timeslotsListWrap.scrollHeight;
        if (scrollTop <= TIMESLOTS_SCROLL_THRESHOLD && timeslotsWindowStart > 0) {
          var oldStart = timeslotsWindowStart;
          timeslotsWindowStart = Math.max(0, timeslotsWindowStart - TIMESLOTS_PAGE_SIZE);
          renderTimeslotsWindow();
          var anchor = list.querySelector('[data-slot-index="' + oldStart + '"]');
          if (anchor) timeslotsListWrap.scrollTop = anchor.offsetTop;
        } else if (scrollTop + clientHeight >= scrollHeight - TIMESLOTS_SCROLL_THRESHOLD && timeslotsWindowEnd < timeslotsSorted.length) {
          timeslotsWindowEnd = Math.min(timeslotsSorted.length, timeslotsWindowEnd + TIMESLOTS_PAGE_SIZE);
          renderTimeslotsWindow();
        }
      });
    }

    // Page settings cog (in main tab bar) – opens settings for current page
    u.byId('page-settings-cog').addEventListener('click', function () {
      var activeTab = document.querySelector('#main-tabs .tab-btn.active');
      var tab = activeTab ? activeTab.dataset.tab : '';
      if (tab === 'timeslots' || tab === 'appointments') {
        pageSettingsContext = tab;
        var hours = getCalendarViewHours();
        var startInput = u.byId('timeslot-view-start');
        var endInput = u.byId('timeslot-view-end');
        if (startInput) startInput.value = hours.slotMinTime.slice(0, 5);
        if (endInput) endInput.value = hours.slotMaxTime.slice(0, 5);
        openModal('modal-timeslot-view-hours');
      } else {
        u.showToast('No settings for this page', 'info');
      }
    });
    u.byId('timeslot-view-hours-save').addEventListener('click', function () {
      var start = u.byId('timeslot-view-start').value;
      var end = u.byId('timeslot-view-end').value;
      if (!start || !end) {
        u.showToast('Please set both start and end time', 'error');
        return;
      }
      if (start >= end) {
        u.showToast('End time must be after start time', 'error');
        return;
      }
      setCalendarViewHours(start, end);
      closeModal('modal-timeslot-view-hours');
      pageSettingsContext = null;
      u.showToast('Calendar view hours updated', 'success');
    });

    // Timeslot action modal
    u.byId('timeslot-action-edit').addEventListener('click', function () {
      closeModal('modal-timeslot-actions');
      if (timeslotActionSlot) openEditTimeslotModal(timeslotActionSlot);
      timeslotActionSlot = null;
    });
    u.byId('timeslot-action-delete').addEventListener('click', function () {
      closeModal('modal-timeslot-actions');
      var slot = timeslotActionSlot;
      timeslotActionSlot = null;
      if (!slot || !slot.id) return;
      if (!window.confirm('Delete this timeslot? This cannot be undone.')) return;
      data.deleteTimeslot(slot.id).then(function () {
        u.showToast('Timeslot deleted', 'success');
        loadTimeslots().then(function () {
          if (timeslotsCalendarInstance && u.byId('timeslots-calendar') && !u.byId('timeslots-calendar').classList.contains('hidden')) {
            timeslotsCalendarInstance.refetchEvents();
          }
        });
      }).catch(function (err) {
        console.error('Delete timeslot failed:', err);
        u.showToast('Failed to delete timeslot: ' + (err.message || 'Unknown error'), 'error');
      });
    });
    u.byId('timeslot-action-cancel-btn').addEventListener('click', function () {
      closeModal('modal-timeslot-actions');
      var slot = timeslotActionSlot;
      timeslotActionSlot = null;
      if (!slot || !slot.id) return;
      if (!window.confirm('Mark this timeslot as cancelled? Existing appointments will remain.')) return;
      data.updateTimeslot(slot.id, { timeslot_status: '202' }).then(function () {
        u.showToast('Timeslot cancelled', 'success');
        loadTimeslots().then(function () {
          if (timeslotsCalendarInstance && u.byId('timeslots-calendar') && !u.byId('timeslots-calendar').classList.contains('hidden')) {
            timeslotsCalendarInstance.refetchEvents();
          }
        });
      }).catch(function (err) {
        console.error('Cancel timeslot failed:', err);
        u.showToast('Failed to cancel timeslot: ' + (err.message || 'Unknown error'), 'error');
      });
    });

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

    window.addEventListener('resize', function () {
      updateTimeslotsCalendarHeight();
      updateAppointmentsCalendarHeight();
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
      var calAppt = initAppointmentsCalendar();
      if (calAppt) calAppt.refetchEvents();
      requestAnimationFrame(function () { updateAppointmentsCalendarHeight(); });
    } else if (tab === 'timeslots') {
      u.byId('view-timeslots').classList.remove('hidden');
      loadTimeslots();
      var calSlot = initTimeslotsCalendar();
      if (calSlot) calSlot.refetchEvents();
      requestAnimationFrame(function () { updateTimeslotsCalendarHeight(); });
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

  function runPatientSearch() {
    var searchInput = u.byId('patient-search');
    var query = searchInput ? searchInput.value.trim() : '';
    patientSearchHasRun = true;
    patientListEmptyMessage = 'No patients found';
    if (!query) {
      allPatients = [];
      renderPatientList([]);
      if (searchInput) searchInput.focus();
      return;
    }
    data.searchPatients(query).then(function (results) {
      allPatients = Array.isArray(results) ? results : [];
      renderPatientList(allPatients);
    }).catch(function (err) {
      console.error('Patient search failed:', err);
      u.showToast('Search failed. Please try again.', 'error');
      renderPatientList([]);
    });
  }

  function renderPatientList(patients) {
    var container = u.byId('patient-list');
    var emptyEl = u.byId('patient-empty');
    var countEl = u.byId('patient-count');
    var msgEl = u.byId('patient-empty-msg');

    if (countEl) countEl.textContent = patients.length + ' patient' + (patients.length !== 1 ? 's' : '');

    if (!patients.length) {
      container.innerHTML = '';
      if (msgEl) msgEl.textContent = patientListEmptyMessage;
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

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

    var btnAppt = u.byId('btn-add-appointment');
    if (btnAppt) {
      btnAppt.dataset.patientId = String(patientId);
      btnAppt.dataset.patientName = (patient.first_name || '') + ' ' + (patient.last_name || '');
    }
  }

  function getPatientDisplayName(p) {
    return ((p.first_name || p.firstname || '') + ' ' + (p.last_name || p.lastname || '')).trim() || 'Patient #' + (p.id != null ? p.id : '');
  }

  function renderAppointmentPatientResultsFromList(patients, emptyMessage) {
    var list = u.byId('appt-patient-results');
    var idInput = u.byId('appt-patient-id');
    if (!list || !idInput) return;
    if (idInput.value) {
      list.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    list.innerHTML = '';
    var arr = Array.isArray(patients) ? patients : [];
    if (arr.length === 0) {
      var empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'patient-result-item empty-msg';
      empty.textContent = emptyMessage || 'Type a name and press Enter to search.';
      empty.tabIndex = -1;
      list.appendChild(empty);
    } else {
      arr.forEach(function (p) {
        var id = p.id != null ? String(p.id) : '';
        var name = getPatientDisplayName(p);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'patient-result-item';
        btn.textContent = name;
        btn.dataset.patientId = id;
        btn.dataset.patientName = name;
        btn.setAttribute('role', 'option');
        list.appendChild(btn);
      });
    }
    list.classList.remove('hidden');
  }

  function runAppointmentPatientSearch() {
    var searchInput = u.byId('appt-patient-search');
    var idInput = u.byId('appt-patient-id');
    if (!searchInput || !idInput) return;
    if (idInput.value) return;
    var query = searchInput.value.trim();
    if (!query) {
      renderAppointmentPatientResultsFromList([], 'Type a name and press Enter to search.');
      return;
    }
    data.searchPatients(query).then(function (results) {
      var arr = Array.isArray(results) ? results : [];
      renderAppointmentPatientResultsFromList(arr, arr.length === 0 ? 'No patients match. Try a different name.' : null);
    }).catch(function (err) {
      console.error('Appointment patient search failed:', err);
      renderAppointmentPatientResultsFromList([], 'Search failed. Try again.');
    });
  }

  function openAddAppointmentModal(preSelectedPatientId, preSelectedPatientName) {
    var searchInput = u.byId('appt-patient-search');
    var idInput = u.byId('appt-patient-id');
    var results = u.byId('appt-patient-results');
    if (!searchInput || !idInput) return;
    searchInput.value = '';
    idInput.value = '';
    if (results) results.classList.add('hidden');
    if (preSelectedPatientId != null) {
      searchInput.value = preSelectedPatientName || '';
      idInput.value = String(preSelectedPatientId);
    }
    var now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    u.byId('appt-date').value = now.toISOString().slice(0, 16);
    openModal('modal-add-appointment');
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
    var url = appt.unique_id ? 'https://app.thehappy.clinic/clinician/appointments/' + appt.unique_id : '';

    var card =
      '<div class="record-card-header">' +
        '<span class="record-card-title">' + u.escapeHtml(appt.type || 'Appointment') + '</span>' +
        chip +
      '</div>' +
      '<div class="record-card-body">' +
        '<p>' + dateStr + (timeStr ? ' at ' + timeStr : '') + '</p>' +
        (fee ? '<p>Fee: ' + fee + '</p>' : '') +
      '</div>';

    if (url) {
      return '<a href="' + url + '" target="_blank" class="record-card record-card-link">' + card + '</a>';
    }
    return '<div class="record-card">' + card + '</div>';
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
      cachedDoctorAppointments = appts || [];
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
      cachedDoctorAppointments = [];
      console.error('Failed to load doctor appointments:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load appointments</div>';
    });
  }

  function renderDoctorAppointmentCard(appt) {
    var dateStr = u.formatDate(appt.appointment_time);
    var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '';
    var chip = getStatusChip(appt.status || '');
    var patientName = getPatientName(appt.patient_id);
    var url = appt.unique_id ? 'https://app.thehappy.clinic/clinician/appointments/' + appt.unique_id : '';

    var card =
      '<div class="record-card-header">' +
        '<span class="record-card-title">' + u.escapeHtml(patientName) + '</span>' +
        chip +
      '</div>' +
      '<div class="record-card-body">' +
        '<p>' + u.escapeHtml(appt.type || 'Appointment') + ' &middot; ' + dateStr + (timeStr ? ' at ' + timeStr : '') + '</p>' +
      '</div>';

    if (url) {
      return '<a href="' + url + '" target="_blank" class="record-card record-card-link" style="margin-bottom:8px">' + card + '</a>';
    }
    return '<div class="record-card" style="margin-bottom:8px">' + card + '</div>';
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
              '<div class="note-content">' + (note.content || '') + '</div>' +
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

      var q = (u.byId('patient-search') && u.byId('patient-search').value) ? u.byId('patient-search').value.trim() : '';
      if (q) runPatientSearch(); else renderPatientList([]);
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
    var idInput = u.byId('appt-patient-id');
    var patientId = idInput && idInput.value ? Number(idInput.value) : 0;
    if (!patientId) {
      u.showToast('Please search and select a patient', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Creating...';

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
      var searchEl = u.byId('appt-patient-search');
      var idEl = u.byId('appt-patient-id');
      if (searchEl) searchEl.value = '';
      if (idEl) idEl.value = '';
      var resultsEl = u.byId('appt-patient-results');
      if (resultsEl) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; }

      var pageUrl = result && result.page_105_url;
      if (pageUrl) window.open(pageUrl, '_blank');

      loadDoctorAppointments();
      loadPatientAppointments(patientId);
    }).catch(function (err) {
      console.error('Create appointment failed:', err);
      u.showToast('Failed to create appointment: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Create Appointment';
    });
  }

  // ── Timeslots ──────────────────────────────────────────────

  // Ontraport status value → label
  var SLOT_STATUS_MAP = { '133': 'Open For Appointments', '132': 'Closed For Appointments', '157': 'Completed Timeslot', '202': 'Cancelled' };

  function renderTimeslotsWindow() {
    var list = u.byId('timeslots-list');
    if (!list || !timeslotsSorted.length) return;
    var start = timeslotsWindowStart;
    var end = timeslotsWindowEnd;
    var slice = timeslotsSorted.slice(start, end);
    var html = slice.map(function (slot, i) {
      var idx = start + i;
      return '<div class="timeslot-list-item" data-slot-index="' + idx + '">' + renderTimeslotCard(slot) + '</div>';
    }).join('');
    list.innerHTML = html;
  }

  function loadTimeslots() {
    var list = u.byId('timeslots-list');
    var empty = u.byId('timeslots-empty');
    var loading = u.byId('timeslots-loading');

    list.innerHTML = '';
    empty.classList.add('hidden');
    loading.classList.remove('hidden');

    return data.fetchTimeslots(doctorId).then(function (slots) {
      loading.classList.add('hidden');
      cachedTimeslots = slots || [];

      if (!slots || !slots.length) {
        empty.classList.remove('hidden');
        return;
      }

      // Chronological order (oldest first); find index of first upcoming
      var sorted = slots.slice().sort(function (a, b) {
        return (Number(a.f2125) || 0) - (Number(b.f2125) || 0);
      });
      var now = Math.floor(Date.now() / 1000);
      var nextIndex = -1;
      for (var i = 0; i < sorted.length; i++) {
        if ((Number(sorted[i].f2125) || 0) >= now) {
          nextIndex = i;
          break;
        }
      }

      timeslotsSorted = sorted;
      timeslotsNextIndex = nextIndex >= 0 ? nextIndex : sorted.length;
      // Initial window: next 10 (or last 10 if all past)
      var start = nextIndex >= 0 ? nextIndex : Math.max(0, sorted.length - TIMESLOTS_PAGE_SIZE);
      var end = Math.min(sorted.length, start + TIMESLOTS_PAGE_SIZE);
      timeslotsWindowStart = start;
      timeslotsWindowEnd = end;

      renderTimeslotsWindow();
      var listWrap = u.byId('timeslots-list-wrap');
      if (listWrap) listWrap.scrollTop = 0;
      if (timeslotsCalendarInstance && u.byId('timeslots-calendar') && !u.byId('timeslots-calendar').classList.contains('hidden')) {
        timeslotsCalendarInstance.refetchEvents();
      }
    }).catch(function (err) {
      loading.classList.add('hidden');
      cachedTimeslots = [];
      console.error('Failed to load timeslots:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load timeslots</div>';
    });
  }

  function renderTimeslotCard(slot) {
    var startTs = Number(slot.f2125) || 0;
    var endTs = Number(slot.f2126) || 0;
    var dateStr = u.formatDate(startTs);
    var startTime = formatTime(startTs);
    var endTime = formatTime(endTs);
    var statusLabel = SLOT_STATUS_MAP[slot.f2151] || SLOT_STATUS_MAP[slot.f3281] || 'Unknown';
    var chip = getTimeslotStatusChip(statusLabel);
    var maxAppts = slot.f2149 || '–';
    var availAppts = slot.f2669 || '0';
    var bookedAppts = Number(slot.f2360) || 0;

    return (
      '<div class="record-card timeslot-card" style="margin-bottom:8px">' +
        '<div class="record-card-header">' +
          '<span class="record-card-title">' + dateStr + '</span>' +
          chip +
        '</div>' +
        '<div class="record-card-body">' +
          '<p>' + startTime + ' – ' + endTime + '</p>' +
          '<p class="timeslot-meta">' +
            '<span>Booked: ' + bookedAppts + ' / ' + maxAppts + '</span>' +
            '<span>Available: ' + availAppts + '</span>' +
          '</p>' +
        '</div>' +
      '</div>'
    );
  }

  function getTimeslotStatusChip(status) {
    if (!status) return '';
    var cls = 'chip-default';
    var s = status.toLowerCase();
    if (s.indexOf('open') >= 0) cls = 'chip-active';
    else if (s.indexOf('completed') >= 0) cls = 'chip-info';
    else if (s.indexOf('closed') >= 0) cls = 'chip-pending';
    else if (s.indexOf('cancel') >= 0) cls = 'chip-error';
    return '<span class="chip ' + cls + '">' + u.escapeHtml(status) + '</span>';
  }

  function timeslotsToCalendarEvents(slots) {
    var list = Array.isArray(slots) ? slots : (slots && slots.list) || (slots && slots.data) || (slots && slots.objects) || [];
    if (!list.length) return [];
    return list
      .filter(function (slot) {
        var startTs = Number(slot.f2125) || 0;
        return startTs > 0;
      })
      .map(function (slot) {
        var startTs = Number(slot.f2125) || 0;
        var endTs = Number(slot.f2126) || 0;
        if (!endTs) endTs = startTs + 3600;
        var statusLabel = SLOT_STATUS_MAP[slot.f2151] || SLOT_STATUS_MAP[slot.f3281] || 'Timeslot';
        var max = slot.f2149 != null ? slot.f2149 : 0;
        var booked = Number(slot.f2360) || 0;
        var shortStatus = statusLabel.indexOf('Open') >= 0 ? 'Open' : statusLabel.indexOf('Closed') >= 0 ? 'Closed' : statusLabel.indexOf('Completed') >= 0 ? 'Done' : statusLabel.indexOf('Cancel') >= 0 ? 'Cancelled' : 'Slot';
        var summary = booked + '/' + max + ' booked';
        return {
          id: String(slot.id || 'slot-' + startTs),
          title: shortStatus + ' · ' + summary,
          start: new Date(startTs * 1000).toISOString(),
          end: new Date(endTs * 1000).toISOString(),
          extendedProps: { slot: slot },
        };
      });
  }

  function appointmentsToCalendarEvents(appts) {
    if (!appts || !appts.length) return [];
    return appts.map(function (appt) {
      var startTs = Number(appt.appointment_time) || 0;
      var endTs = startTs + 3600;
      var patientName = getPatientName(appt.patient_id);
      var title = (patientName || 'Patient') + ' – ' + (appt.type || 'Appointment');
      return {
        id: String(appt.id || 'appt-' + startTs),
        title: title,
        start: new Date(startTs * 1000).toISOString(),
        end: new Date(endTs * 1000).toISOString(),
        extendedProps: { appt: appt },
      };
    });
  }

  function getViewHoursFromStorage(storageKey) {
    var defaultStart = '08:00';
    var defaultEnd = '20:00';
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        var start = parsed.start && /^\d{2}:\d{2}$/.test(parsed.start) ? parsed.start : defaultStart;
        var end = parsed.end && /^\d{2}:\d{2}$/.test(parsed.end) ? parsed.end : defaultEnd;
        if (start < end) {
          return { slotMinTime: start + ':00', slotMaxTime: end + ':00', scrollTime: start + ':00' };
        }
      }
    } catch (e) {}
    return { slotMinTime: defaultStart + ':00', slotMaxTime: defaultEnd + ':00', scrollTime: defaultStart + ':00' };
  }

  function getCalendarViewHours() {
    return getViewHoursFromStorage(CALENDAR_VIEW_HOURS_STORAGE_KEY);
  }

  function setCalendarViewHours(start, end) {
    try {
      localStorage.setItem(CALENDAR_VIEW_HOURS_STORAGE_KEY, JSON.stringify({ start: start, end: end }));
    } catch (e) {}
    var hours = getCalendarViewHours();
    if (timeslotsCalendarInstance) {
      timeslotsCalendarInstance.setOption('slotMinTime', hours.slotMinTime);
      timeslotsCalendarInstance.setOption('slotMaxTime', hours.slotMaxTime);
      timeslotsCalendarInstance.setOption('scrollTime', hours.scrollTime);
    }
    if (appointmentsCalendarInstance) {
      appointmentsCalendarInstance.setOption('slotMinTime', hours.slotMinTime);
      appointmentsCalendarInstance.setOption('slotMaxTime', hours.slotMaxTime);
      appointmentsCalendarInstance.setOption('scrollTime', hours.scrollTime);
    }
  }

  function getTimeslotViewHours() {
    return getCalendarViewHours();
  }

  function getAppointmentsViewHours() {
    return getCalendarViewHours();
  }

  function initTimeslotsCalendar() {
    if (timeslotsCalendarInstance) return timeslotsCalendarInstance;
    var calendarEl = u.byId('timeslots-calendar');
    var FC = window.FullCalendar || window.fullCalendar;
    if (!calendarEl || !FC || !FC.Calendar) return null;
    var Calendar = FC.Calendar;
    var viewHours = getTimeslotViewHours();
    var initialHeight = calendarEl.clientHeight;
    if (initialHeight <= 0) initialHeight = Math.max(400, window.innerHeight - 280);
    timeslotsCalendarInstance = new Calendar(calendarEl, {
      initialView: 'timeGridWeek',
      timeZone: 'local',
      slotMinTime: viewHours.slotMinTime,
      slotMaxTime: viewHours.slotMaxTime,
      scrollTime: viewHours.scrollTime,
      height: initialHeight,
      expandRows: true,
      allDaySlot: false,
      selectable: true,
      views: {
        listAll: {
          type: 'list',
          buttonText: 'List',
          visibleRange: function (currentDate) {
            var start = new Date(currentDate);
            start.setHours(0, 0, 0, 0);
            var end = new Date(start);
            end.setMonth(end.getMonth() + 3);
            return { start: start, end: end };
          },
        },
        listPast: {
          type: 'list',
          buttonText: 'Past',
          visibleRange: function (currentDate) {
            var end = new Date(currentDate);
            end.setHours(0, 0, 0, 0);
            var start = new Date(end);
            start.setFullYear(start.getFullYear() - 1);
            return { start: start, end: end };
          },
        },
      },
      select: function (arg) {
        var start = arg.start;
        var minutes = start.getMinutes();
        if (minutes !== 0 && minutes !== 30) start.setMinutes(minutes < 30 ? 0 : 30, 0, 0);
        openAddTimeslotWithStart(start);
        timeslotsCalendarInstance.unselect();
      },
      eventClick: function (arg) {
        arg.jsEvent.preventDefault();
        var slot = arg.event.extendedProps.slot;
        if (slot) showTimeslotActionModal(slot);
      },
      eventContent: function (arg) {
        var slot = arg.event.extendedProps.slot;
        if (!slot) return null;
        var max = slot.f2149 != null ? slot.f2149 : '–';
        var booked = Number(slot.f2360) || 0;
        var statusLabel = SLOT_STATUS_MAP[slot.f2151] || SLOT_STATUS_MAP[slot.f3281] || '–';
        if (arg.view.type === 'list') {
          var startTs = Number(slot.f2125) || 0;
          var timeStr = startTs ? formatTime(startTs) : '–';
          var dateStr = startTs ? u.formatDate(startTs) : '–';
          return {
            html:
              '<div class="fc-list-event-cols">' +
                '<span class="fc-list-col fc-list-col-datetime">' + u.escapeHtml(dateStr + ' ' + timeStr) + '</span>' +
                '<span class="fc-list-col fc-list-col-max">' + u.escapeHtml(String(max)) + '</span>' +
                '<span class="fc-list-col fc-list-col-booked">' + u.escapeHtml(String(booked)) + '</span>' +
                '<span class="fc-list-col fc-list-col-status">' + u.escapeHtml(String(statusLabel)) + '</span>' +
              '</div>',
          };
        }
        var summary = booked + '/' + max + ' booked';
        return {
          html: '<div class="fc-timeslot-event"><span class="fc-timeslot-status">' + u.escapeHtml(statusLabel) + '</span><span class="fc-timeslot-booked">' + u.escapeHtml(summary) + '</span></div>',
        };
      },
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,timeGridDay,dayGridMonth,listAll,listPast',
      },
      viewDidMount: function (arg) {
        if (arg.view.type === 'list') {
          injectTimeslotListHeader(arg.el);
          timeslotsCalendarInstance.gotoDate(new Date());
        }
      },
      events: function (info, successCallback) {
        successCallback(timeslotsToCalendarEvents(cachedTimeslots));
      },
    });
    timeslotsCalendarInstance.render();
    return timeslotsCalendarInstance;
  }

  function injectTimeslotListHeader(calendarEl) {
    function run() {
      var list = calendarEl.querySelector('.fc-list');
      var existing = calendarEl.querySelector('.fc-list-header-cols');
      if (existing) existing.remove();
      if (!list) return;
      var header = document.createElement('div');
      header.className = 'fc-list-header-cols fc-list-event-cols';
      header.setAttribute('role', 'row');
      header.innerHTML =
        '<span class="fc-list-col fc-list-col-datetime">Date & time</span>' +
        '<span class="fc-list-col fc-list-col-max">Max</span>' +
        '<span class="fc-list-col fc-list-col-booked">Booked</span>' +
        '<span class="fc-list-col fc-list-col-status">Status</span>';
      list.insertBefore(header, list.firstChild);
    }
    run();
    requestAnimationFrame(run);
  }

  function initAppointmentsCalendar() {
    if (appointmentsCalendarInstance) return appointmentsCalendarInstance;
    var calendarEl = u.byId('doctor-appointments-calendar');
    var FC = window.FullCalendar || window.fullCalendar;
    if (!calendarEl || !FC || !FC.Calendar) return null;
    var Calendar = FC.Calendar;
    var viewHours = getAppointmentsViewHours();
    var initialHeight = calendarEl.clientHeight;
    if (initialHeight <= 0) initialHeight = Math.max(400, window.innerHeight - 280);
    appointmentsCalendarInstance = new Calendar(calendarEl, {
      initialView: 'timeGridWeek',
      timeZone: 'local',
      slotMinTime: viewHours.slotMinTime,
      slotMaxTime: viewHours.slotMaxTime,
      scrollTime: viewHours.scrollTime,
      height: initialHeight,
      expandRows: true,
      allDaySlot: false,
      views: {
        listAll: {
          type: 'list',
          buttonText: 'List',
          visibleRange: function (currentDate) {
            var start = new Date(currentDate);
            start.setHours(0, 0, 0, 0);
            var end = new Date(start);
            end.setMonth(end.getMonth() + 3);
            return { start: start, end: end };
          },
        },
        listPast: {
          type: 'list',
          buttonText: 'Past',
          visibleRange: function (currentDate) {
            var end = new Date(currentDate);
            end.setHours(0, 0, 0, 0);
            var start = new Date(end);
            start.setFullYear(start.getFullYear() - 1);
            return { start: start, end: end };
          },
        },
      },
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,timeGridDay,dayGridMonth,listAll,listPast',
      },
      viewDidMount: function (arg) {
        if (arg.view.type === 'list') appointmentsCalendarInstance.gotoDate(new Date());
      },
      events: function (info, successCallback) {
        successCallback(appointmentsToCalendarEvents(cachedDoctorAppointments));
      },
    });
    appointmentsCalendarInstance.render();
    return appointmentsCalendarInstance;
  }

  function updateTimeslotsCalendarHeight() {
    var el = u.byId('timeslots-calendar');
    if (!timeslotsCalendarInstance || !el) return;
    var h = el.clientHeight;
    if (h > 0) {
      timeslotsCalendarInstance.setOption('height', h);
    } else {
      requestAnimationFrame(function () {
        var again = el.clientHeight;
        if (again > 0) timeslotsCalendarInstance.setOption('height', again);
      });
    }
  }

  function updateAppointmentsCalendarHeight() {
    var el = u.byId('doctor-appointments-calendar');
    if (!appointmentsCalendarInstance || !el) return;
    var h = el.clientHeight;
    if (h > 0) {
      appointmentsCalendarInstance.setOption('height', h);
    } else {
      requestAnimationFrame(function () {
        var again = el.clientHeight;
        if (again > 0) appointmentsCalendarInstance.setOption('height', again);
      });
    }
  }

  function openAddTimeslotWithStart(startDate) {
    var d = new Date(startDate);
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    u.byId('slot-start').value = y + '-' + m + '-' + day + 'T' + h + ':00';
    updateSlotSelectedDay();
    editingTimeslotId = null;
    var titleEl = u.byId('modal-add-timeslot-title');
    if (titleEl) titleEl.textContent = 'New Timeslot';
    var btn = u.byId('btn-submit-timeslot');
    if (btn) btn.textContent = 'Create Timeslot';
    openModal('modal-add-timeslot');
  }

  function openEditTimeslotModal(slot) {
    var startTs = Number(slot.f2125) || 0;
    var d = new Date(startTs * 1000);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    u.byId('slot-start').value = y + '-' + m + '-' + day + 'T' + h + ':' + min;
    var max = Number(slot.f2149) || 3;
    max = Math.max(2, Math.min(5, max));
    u.byId('slot-max').value = String(max);
    updateSlotSelectedDay();
    editingTimeslotId = slot.id;
    var titleEl = u.byId('modal-add-timeslot-title');
    if (titleEl) titleEl.textContent = 'Edit Timeslot';
    var btn = u.byId('btn-submit-timeslot');
    if (btn) btn.textContent = 'Save Changes';
    openModal('modal-add-timeslot');
  }

  function renderTimeslotActionAppointments(slot, apptsInSlot, patientMap) {
    var summaryEl = u.byId('timeslot-action-summary');
    var listEl = u.byId('timeslot-action-appointment-list');
    if (!summaryEl || !listEl) return;
    var max = Number(slot.f2149) || 0;
    var count = apptsInSlot.length;
    summaryEl.textContent = count + ' from ' + max + ' appointment' + (max === 1 ? '' : 's') + ' booked';
    summaryEl.classList.remove('hidden');
    listEl.innerHTML = '';
    apptsInSlot.forEach(function (appt, index) {
      var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '–';
      var name = getPatientName(appt.patient_id, patientMap);
      var phone = getPatientPhone(appt.patient_id, patientMap);
      var status = appt.status || '–';
      var telHref = phone ? formatTelHref(phone) : '';
      var phonePart = phone
        ? (telHref
          ? '<a href="' + u.escapeHtml(telHref) + '" class="timeslot-appt-phone-link" title="Call (opens in Dialpad)">' + u.escapeHtml(phone) + '</a>'
          : '<span class="timeslot-appt-phone">' + u.escapeHtml(phone) + '</span>')
        : '';
      var li = document.createElement('li');
      li.className = 'timeslot-action-appointment-item';
      li.innerHTML =
        '<span class="timeslot-appt-order">' + (index + 1) + '.</span> ' +
        '<span class="timeslot-appt-time">' + u.escapeHtml(timeStr) + '</span> ' +
        '<span class="timeslot-appt-name">' + u.escapeHtml(name) + '</span>' +
        (phonePart ? ' <span class="timeslot-appt-phone-wrap">' + phonePart + '</span>' : '') +
        ' <span class="timeslot-appt-status">' + u.escapeHtml(status) + '</span>';
      listEl.appendChild(li);
    });
  }

  function showTimeslotActionModal(slot) {
    timeslotActionSlot = slot;
    var summaryEl = u.byId('timeslot-action-summary');
    var listEl = u.byId('timeslot-action-appointment-list');
    if (summaryEl) summaryEl.textContent = 'Loading appointments…';
    if (listEl) listEl.innerHTML = '';
    var wrapEditDelete = u.byId('timeslot-action-edit-delete');
    var wrapCancel = u.byId('timeslot-action-cancel');
    var slotStart = Number(slot.f2125) || 0;
    var slotEnd = Number(slot.f2126) || 0;
    data.fetchAppointments({ doctor_id: doctorId, limit: 500 }).then(function (appts) {
      var inSlot = (appts || []).filter(function (a) {
        var t = Number(a.appointment_time) || 0;
        return t >= slotStart && t < slotEnd;
      });
      inSlot.sort(function (a, b) { return (a.appointment_time || 0) - (b.appointment_time || 0); });
      var patientIds = [];
      var seen = {};
      inSlot.forEach(function (a) {
        var id = a.patient_id != null ? Number(a.patient_id) : null;
        if (id != null && !seen[id]) { seen[id] = true; patientIds.push(id); }
      });
      var patientMap = {};
      allPatients.forEach(function (p) {
        if (p && p.id != null) {
          patientMap[p.id] = p;
          patientMap[Number(p.id)] = p;
        }
      });
      if (patientIds.length === 0) {
        renderTimeslotActionAppointments(slot, inSlot, patientMap);
        return;
      }
      // VitalSync allows only one query at a time; fetch patients sequentially
      var seq = Promise.resolve(patientMap);
      patientIds.forEach(function (id) {
        seq = seq.then(function (map) {
          return data.fetchPatientById(id).then(function (p) {
            if (p && p.id != null) {
              map[p.id] = p;
              map[Number(p.id)] = p;
            }
            return map;
          });
        });
      });
      seq.then(function (map) {
        renderTimeslotActionAppointments(slot, inSlot, map);
      }).catch(function () {
        renderTimeslotActionAppointments(slot, inSlot, patientMap);
      });
    }).catch(function () {
      if (summaryEl) summaryEl.textContent = 'Could not load appointments.';
      if (listEl) listEl.innerHTML = '';
    });
    var booked = Number(slot.f2360) || 0;
    if (wrapEditDelete) wrapEditDelete.classList.toggle('hidden', booked > 0);
    if (wrapCancel) wrapCancel.classList.toggle('hidden', booked === 0);
    openModal('modal-timeslot-actions');
  }

  function updateSlotSelectedDay() {
    var el = u.byId('slot-selected-day');
    var input = u.byId('slot-start');
    if (!el || !input) return;
    var val = input.value;
    if (!val) {
      el.textContent = '';
      return;
    }
    var d = new Date(val);
    if (isNaN(d.getTime())) {
      el.textContent = '';
      return;
    }
    el.textContent = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function handleCreateTimeslot(e) {
    e.preventDefault();
    var btn = u.byId('btn-submit-timeslot');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    var startVal = u.byId('slot-start').value;
    var startTs = startVal ? Math.floor(new Date(startVal).getTime() / 1000) : 0;

    if (!startTs) {
      u.showToast('Please select a start date and time', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Timeslot';
      return;
    }

    var startDate = new Date(startVal);
    var minutes = startDate.getMinutes();
    if (minutes !== 0 && minutes !== 30) {
      u.showToast('Start time must be on the hour or half-hour (e.g. 9:00 or 9:30).', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Timeslot';
      return;
    }

    var maxAppts = Number(u.byId('slot-max').value);
    if (![2, 3, 4, 5].includes(maxAppts)) {
      u.showToast('Max appointments must be 2, 3, 4, or 5.', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Timeslot';
      return;
    }

    var endTs = startTs + 3600;

    var payload = {
      doctor_id: doctorId ? Number(doctorId) : undefined,
      start_time: startTs,
      end_time: endTs,
      max_appointments: maxAppts,
    };

    function onSuccess(message) {
      u.showToast(message, 'success');
      closeModal('modal-add-timeslot');
      u.byId('form-add-timeslot').reset();
      editingTimeslotId = null;
      var titleEl = u.byId('modal-add-timeslot-title');
      if (titleEl) titleEl.textContent = 'New Timeslot';
      if (btn) btn.textContent = 'Create Timeslot';
      loadTimeslots().then(function () {
        if (timeslotsCalendarInstance && u.byId('timeslots-calendar') && !u.byId('timeslots-calendar').classList.contains('hidden')) {
          timeslotsCalendarInstance.refetchEvents();
        }
      });
    }

    if (editingTimeslotId) {
      btn.textContent = 'Saving...';
      data.updateTimeslot(editingTimeslotId, { start_time: startTs, end_time: endTs, max_appointments: maxAppts }).then(function () {
        onSuccess('Timeslot updated');
      }).catch(function (err) {
        console.error('Update timeslot failed:', err);
        u.showToast('Failed to update timeslot: ' + (err.message || 'Unknown error'), 'error');
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = editingTimeslotId ? 'Save Changes' : 'Create Timeslot';
      });
    } else {
      data.createTimeslot(payload).then(function () {
        onSuccess('Timeslot created');
      }).catch(function (err) {
        console.error('Create timeslot failed:', err);
        u.showToast('Failed to create timeslot: ' + (err.message || 'Unknown error'), 'error');
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = 'Create Timeslot';
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function findPatient(patientId) {
    if (patientId == null) return null;
    var id = Number(patientId);
    return allPatients.find(function (c) {
      if (!c) return false;
      var cid = c.id != null ? Number(c.id) : NaN;
      return cid === id || c.id === patientId;
    }) || null;
  }

  function getPatientFromMap(patientId, patientMap) {
    if (!patientMap || patientId == null) return null;
    return patientMap[patientId] || patientMap[Number(patientId)] || patientMap[String(patientId)] || null;
  }

  function getPatientName(patientId, patientMap) {
    if (!patientId) return 'Unknown Patient';
    var p = getPatientFromMap(patientId, patientMap) || findPatient(patientId);
    var name = p
      ? ((p.first_name || p.firstname || '') + ' ' + (p.last_name || p.lastname || '')).trim()
      : '';
    return name || 'Patient #' + patientId;
  }

  function getPatientPhone(patientId, patientMap) {
    if (!patientId) return '';
    var p = getPatientFromMap(patientId, patientMap) || findPatient(patientId);
    var num = p && (p.sms_number || p.phone || p.mobile);
    return num ? String(num).trim() : '';
  }

  function formatTelHref(phone) {
    if (!phone || typeof phone !== 'string') return '';
    var digits = phone.replace(/\D/g, '');
    if (digits.length === 9) digits = '61' + digits;
    else if (digits.length === 10 && digits.charAt(0) === '0') digits = '61' + digits.slice(1);
    return digits ? 'tel:+' + digits : '';
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
