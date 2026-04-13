// thc-clinicians-portal — Main Application
// Clinician portal: patient search, detail views, appointments, notes, scripts.
(function () {
  'use strict';

  var u = window.AppUtils;
  var data = window.AppData;
  var prescribe = window.Prescribe;
  var recommend = window.RecommendEngine;
  var similar = window.SimilarEngine;
  var doctorId = null;
  var allPatients = [];
  var itemsMap = {};   // id -> Item (for drug names in scripts)
  var enrichedItemsCache = [];  // Full product data for recommendation engine
  var currentPatientId = null;  // Currently viewed patient
  var currentAppointmentId = null; // Currently open appointment workspace
  var workspaceNoteId = null;  // ID of the note being edited in workspace (null = new)
  var currentPatientIntake = null; // Patient intake data for prescribing
  var currentRecommendations = null; // Last generated recommendations
  var scoreCache = {}; // itemId → { clinicalScore, finalScore, reasoning, contraindications, tags }
  var scoreCacheReady = false;
  var previousView = null; // Where to go back to from workspace
  var lastTranscriptText = null; // Captured transcript from most recent video call
  var pendingPrescribeItem = null; // { item, recommendation } — stashed when prescribing without appointment context
  var wpTabsLoaded = { appointments: false, notes: false, scripts: false }; // Lazy load flags for workspace patient tabs
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

  // ── Doctor Preferences ──────────────────────────────────────

  var doctorPreferences = {};
  var PREF_DEFAULTS = {
    default_repeats: 3,
    default_interval_days: 7,
    calendar_view_start: '08:00',
    calendar_view_end: '20:00',
  };

  window.DoctorPreferences = {
    get: function (key) {
      var val = doctorPreferences[key];
      return val != null && val !== '' ? val : PREF_DEFAULTS[key];
    },
    getAll: function () {
      var merged = {};
      for (var k in PREF_DEFAULTS) merged[k] = doctorPreferences[k] != null && doctorPreferences[k] !== '' ? doctorPreferences[k] : PREF_DEFAULTS[k];
      return merged;
    },
    set: function (key, value) { doctorPreferences[key] = value; },
    setAll: function (prefs) { for (var k in prefs) doctorPreferences[k] = prefs[k]; },
  };

  // ── Initialization ─────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var loading = u.byId('app-loading');
    var content = u.byId('app-content');
    var loginEl = u.byId('app-login');

    // ── Auth gate: require magic-link login ──

    if (window.ClinicianAuth) {
      window.ClinicianAuth.init().then(function (result) {

        if (!result.authenticated) {
          // Show login form, hide loading
          if (loading) loading.classList.add('hidden');
          if (loginEl) loginEl.classList.remove('hidden');
          bindLoginEvents();
          return;
        }
        // Authenticated — proceed with app
        bootApp();
      });
    } else {
      // No auth module (e.g. legacy Ontraport embed) — fall through
      bootApp();
    }

    function bootApp() {
      doctorId = window.AppConfig && (window.AppConfig.CONTACT_ID || null);
      if (loading) loading.classList.add('hidden');
      if (loginEl) loginEl.classList.add('hidden');
      if (content) content.classList.remove('hidden');
      bindEvents();
      addLogoutButton();
      createActiveCallIndicator();
      // Data is loaded via direct GraphQL API (no SDK). Short delay then load.
      var delay = window.__TEST_MOCK__ ? 0 : 500;
      setTimeout(function () { loadInitialData(); }, delay);

      // Warn before closing browser tab during active call
      window.addEventListener('beforeunload', function (e) {
        if (window.VideoConsultation && window.VideoConsultation.isActive()) {
          e.preventDefault();
          e.returnValue = 'You have an active video consultation. Are you sure you want to leave?';
        }
      });

      // Handle call ending unexpectedly (network drop, patient hangs up)
      window._onVideoCallEnded = function () {
        hideActiveCallIndicator();
      };
    }

    function addLogoutButton() {
      if (!window.ClinicianAuth) return;
      var headerRight = document.querySelector('.header-right');
      if (!headerRight) return;
      var btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-ghost';
      btn.textContent = 'Logout';
      btn.style.marginLeft = '12px';
      btn.addEventListener('click', function () { window.ClinicianAuth.logout(); });
      headerRight.appendChild(btn);
    }

    function bindLoginEvents() {
      var form = u.byId('login-form');
      var msgEl = u.byId('login-message');
      if (!form) return;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = u.byId('login-email').value.trim();
        if (!email) return;
        var btn = u.byId('login-submit');
        btn.disabled = true;
        btn.textContent = 'Sending...';
        window.ClinicianAuth.requestMagicLink(email).then(function () {
          if (msgEl) {
            msgEl.textContent = 'Check your email for a magic link to sign in.';
            msgEl.className = 'login-message login-message-success';
            msgEl.classList.remove('hidden');
          }
          btn.textContent = 'Link Sent';
        }).catch(function (err) {
          if (msgEl) {
            msgEl.textContent = err.message || 'Something went wrong. Please try again.';
            msgEl.className = 'login-message login-message-error';
            msgEl.classList.remove('hidden');
          }
          btn.disabled = false;
          btn.textContent = 'Send Magic Link';
        });
      });
    }
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

      // Load doctor preferences from Ontraport
      data.fetchDoctorPreferences(doctorIdNum).then(function (prefs) {
        window.DoctorPreferences.setAll(prefs);
        // Sync calendar hours to localStorage for existing calendar code
        var start = window.DoctorPreferences.get('calendar_view_start');
        var end = window.DoctorPreferences.get('calendar_view_end');
        setCalendarViewHours(start, end);
      }).catch(function () { /* silent — defaults used */ });
    }

    // Background check: fetch timeslots early to show alert banner if needed
    if (doctorId) {
      data.fetchTimeslots(doctorId).then(function (slots) {
        cachedTimeslots = slots || [];
        checkFutureTimeslotAlert();
      }).catch(function () {});

      // Fetch appointments at boot for Today's Schedule
      data.fetchAppointments({ doctor_id: doctorId, limit: 200 }).then(function (appts) {
        cachedDoctorAppointments = appts || [];
        loadTodaySchedule();
      }).catch(function () {});
    }
  }

  function loadInitialData(retryCount) {
    retryCount = retryCount || 0;
    // Load basic items and enriched items in parallel
    Promise.all([
      data.fetchItems(500),
      data.fetchEnrichedItems().catch(function () { return []; })
    ])
      .then(function (results) {
        initialLoadSettled = true;
        var items = results[0];
        var enriched = results[1];
        var list = Array.isArray(items) ? items : (items && items.list) || (items && items.data) || [];
        enrichedItemsCache = Array.isArray(enriched) ? enriched : [];
        if (window.AppConfig && window.AppConfig.DEBUG) {
          console.log('Enriched items loaded:', enrichedItemsCache.length);
        }
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

    // Appointment "When" toggle (Now / Future Timeslot)
    u.$$('.appt-when-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        u.$$('.appt-when-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var mode = btn.dataset.when;
        var nowSection = u.byId('appt-when-now');
        var slotSection = u.byId('appt-when-timeslot');
        var dateInput = u.byId('appt-date');
        if (mode === 'now') {
          if (nowSection) nowSection.classList.remove('hidden');
          if (slotSection) slotSection.classList.add('hidden');
          if (dateInput) dateInput.required = true;
        } else {
          if (nowSection) nowSection.classList.add('hidden');
          if (slotSection) slotSection.classList.remove('hidden');
          if (dateInput) dateInput.required = false;
          renderApptTimeslotList();
        }
      });
    });

    // Timeslot selection in appointment modal
    var apptTimeslotList = u.byId('appt-timeslot-list');
    if (apptTimeslotList) {
      apptTimeslotList.addEventListener('click', function (e) {
        var item = e.target.closest('.appt-timeslot-item');
        if (!item) return;
        // Deselect all, select this one
        apptTimeslotList.querySelectorAll('.appt-timeslot-item').forEach(function (el) { el.classList.remove('selected'); });
        item.classList.add('selected');
        var slotId = item.dataset.timeslotId;
        var slotTime = item.dataset.startTime;
        u.byId('appt-timeslot-id').value = slotId;
        // Also set the date input so handleCreateAppointment picks it up
        u.byId('appt-date').value = '';
        // Store the start_time unix on a data attribute for the handler
        apptTimeslotList.dataset.selectedTime = slotTime;
      });
    }

    // Add clinical note
    var btnAddNote = u.byId('btn-add-note');
    if (btnAddNote) btnAddNote.addEventListener('click', function () { openAddNoteModal(); });
    var btnAddNoteEmpty = u.byId('btn-add-note-empty');
    if (btnAddNoteEmpty) btnAddNoteEmpty.addEventListener('click', function () { openAddNoteModal(); });
    var formAddNote = u.byId('form-add-note');
    if (formAddNote) formAddNote.addEventListener('submit', handleCreateNote);

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
        // Check card on file for selected patient
        checkPatientCard(Number(item.dataset.patientId));
      });
    }

    // Auto-update fee when appointment type changes
    var apptTypeSelect = u.byId('appt-type');
    if (apptTypeSelect) {
      apptTypeSelect.addEventListener('change', function () { updateApptFee(); updatePaymentInfo(); });
    }
    // Update payment info when fee changes
    var apptFeeInput = u.byId('appt-fee');
    if (apptFeeInput) {
      apptFeeInput.addEventListener('input', updatePaymentInfo);
    }
    // Payment method radio toggle
    var paymentInfoEl = u.byId('appt-payment-info');
    if (paymentInfoEl) {
      paymentInfoEl.addEventListener('change', function (e) {
        if (e.target.name === 'appt-payment-method') {
          selectedPaymentMethod = e.target.value;
          var cardList = u.byId('appt-card-list');
          if (cardList) cardList.classList.toggle('hidden', selectedPaymentMethod !== 'card');
        }
        if (e.target.name === 'appt-card' && cachedPatientCards) {
          cachedPatientCards.selectedCardIdx = parseInt(e.target.value);
        }
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

    // Timeslot alert banner
    var tsAlertLink = u.byId('timeslot-alert-link');
    if (tsAlertLink) tsAlertLink.addEventListener('click', function (e) {
      e.preventDefault();
      switchMainTab('timeslots');
    });
    var tsAlertDismiss = u.byId('btn-dismiss-timeslot-alert');
    if (tsAlertDismiss) tsAlertDismiss.addEventListener('click', function () {
      var banner = u.byId('timeslot-alert-banner');
      if (banner) banner.classList.add('hidden');
    });

    // Formulary events
    var formularySearch = u.byId('formulary-search');
    if (formularySearch) {
      formularySearch.addEventListener('input', function () {
        clearTimeout(formularySearchDebounce);
        formularySearchDebounce = setTimeout(runFormularySearch, 300);
      });
      formularySearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runFormularySearch(); }
      });
    }
    var formularySort = u.byId('formulary-sort');
    if (formularySort) formularySort.addEventListener('change', runFormularySearch);

    var btnClearFormularyFilters = u.byId('btn-clear-formulary-filters');
    if (btnClearFormularyFilters) btnClearFormularyFilters.addEventListener('click', function () {
      u.$$('#formulary-filters .filter-pill.active').forEach(function (p) { p.classList.remove('active'); });
      var pmin = u.byId('f-filter-price-min'); if (pmin) pmin.value = '';
      var pmax = u.byId('f-filter-price-max'); if (pmax) pmax.value = '';
      updateFormularyAdvFilterCount();
      runFormularySearch();
    });

    var btnToggleFormularyAdv = u.byId('btn-toggle-formulary-adv-filters');
    if (btnToggleFormularyAdv) btnToggleFormularyAdv.addEventListener('click', function () {
      var body = u.byId('formulary-adv-filters-body');
      if (body) body.classList.toggle('hidden');
    });

    // Formulary filter pill clicks (delegated)
    var formularyFilters = u.byId('formulary-filters');
    if (formularyFilters) {
      formularyFilters.addEventListener('click', function (e) {
        var pill = e.target.closest('.filter-pill');
        if (!pill) return;
        pill.classList.toggle('active');
        updateFormularyAdvFilterCount();
        runFormularySearch();
      });
      // Price range changes
      formularyFilters.addEventListener('change', function (e) {
        if (e.target.id === 'f-filter-price-min' || e.target.id === 'f-filter-price-max') runFormularySearch();
      });
    }

    // Formulary Similar + View Details buttons (delegated)
    document.addEventListener('click', function (e) {
      var similarBtn = e.target.closest('.btn-formulary-similar');
      if (similarBtn) {
        e.stopPropagation();
        toggleFormularySimilar(similarBtn.dataset.itemId);
        return;
      }
      var detailBtn = e.target.closest('.btn-formulary-detail');
      if (detailBtn) {
        e.stopPropagation();
        openItemDetailPage(parseInt(detailBtn.dataset.itemId));
        return;
      }
      // Click on similar card in expansion to navigate to detail
      var simCard = e.target.closest('.similar-card[data-item-id]');
      if (simCard && simCard.closest('.similar-expansion')) {
        e.stopPropagation();
        openItemDetailPage(parseInt(simCard.dataset.itemId));
      }
    });

    // Back button
    u.byId('btn-back-patients').addEventListener('click', function () { showView('patients'); });

    // Workspace jump nav
    document.addEventListener('click', function (e) {
      var jumpBtn = e.target.closest('.jump-btn[data-jump]');
      if (!jumpBtn) return;
      var targetId = jumpBtn.dataset.jump;
      var target = u.byId(targetId);
      if (!target) return;
      // Open all ancestor <details> if collapsed
      var el = target;
      while (el) {
        if (el.tagName === 'DETAILS' && !el.open) el.open = true;
        el = el.parentElement;
      }
      // If jumping to Prescribe, trigger scoring and search
      if (targetId === 'workspace-prescribe-section') {
        if (!scoreCacheReady && currentPatientIntake) cacheProductScores();
        else if (enrichedItemsCache.length > 0) runProductSearch();
      }
      // Delay to let details expand before scrolling
      setTimeout(function () {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });

    // Workspace patient tabs (Appointments / Clinical Notes / Scripts)
    document.addEventListener('click', function (e) {
      var tabBtn = e.target.closest('.wp-tab-btn[data-wp-tab]');
      if (!tabBtn) return;
      var tabId = tabBtn.dataset.wpTab;
      var panel = u.byId(tabId);
      var isActive = tabBtn.classList.contains('active');

      // Deactivate all tabs and hide all panels
      u.$$('.wp-tab-btn').forEach(function (b) { b.classList.remove('active'); });
      u.$$('.wp-tab-panel').forEach(function (p) { p.classList.add('hidden'); });

      // If clicking the already-active tab, just collapse (toggle off)
      if (isActive) return;

      // Activate this tab and show its panel
      tabBtn.classList.add('active');
      if (panel) panel.classList.remove('hidden');

      // Lazy load data on first click
      if (!currentPatientId) return;
      if (tabId === 'wp-appointments' && !wpTabsLoaded.appointments) {
        wpTabsLoaded.appointments = true;
        loadWpAppointments(currentPatientId);
      }
      if (tabId === 'wp-notes' && !wpTabsLoaded.notes) {
        wpTabsLoaded.notes = true;
        loadWpNotes(currentPatientId);
      }
      if (tabId === 'wp-scripts' && !wpTabsLoaded.scripts) {
        wpTabsLoaded.scripts = true;
        loadWpScripts(currentPatientId);
      }
    });

    // Workspace back button
    var btnBackWorkspace = u.byId('btn-back-from-workspace');
    if (btnBackWorkspace) {
      btnBackWorkspace.addEventListener('click', function () {
        if (previousView === 'patient-detail') {
          showView('patient-detail');
          // Refresh notes timeline since we may have added/edited a note
          if (currentPatientId) loadPatientNotes(currentPatientId);
        } else {
          showView('appointments');
        }
      });
    }

    // Video consultation buttons
    var btnStartVideo = u.byId('btn-start-video');
    var btnEndVideo = u.byId('btn-end-video');
    var btnToggleVideo = u.byId('btn-toggle-video-size');
    if (btnStartVideo) btnStartVideo.addEventListener('click', function () {
      if (currentAppointmentId && window.VideoConsultation) {
        // Check if there's already an active call for a different appointment
        if (window.VideoConsultation.isActive()) {
          var info = window.VideoConsultation.getActiveCallInfo();
          if (info && String(info.appointmentId) !== String(currentAppointmentId)) {
            if (!confirm('You have a live call with ' + (info.patientName || 'a patient') + '. End it to start a new one?')) return;
            window.VideoConsultation.endCall();
          }
        }
        var session = window.ClinicianAuth ? window.ClinicianAuth.getSession() : null;
        var doctorName = session ? ('Dr. ' + (session.firstName || '') + ' ' + (session.lastName || '')).trim() : 'Doctor';
        var patient = allPatients.find(function (p) { return p.id == currentPatientId; }) || {};
        var patientName = ((patient.first_name || '') + ' ' + (patient.last_name || '')).trim() || 'Patient';
        window.VideoConsultation.startCall(currentAppointmentId, doctorName, currentPatientId, patientName);
      }
    });
    if (btnEndVideo) btnEndVideo.addEventListener('click', function () {
      if (window.VideoConsultation) {
        lastTranscriptText = window.VideoConsultation.getTranscriptText() || '';
        window.VideoConsultation.endCall();
        hideActiveCallIndicator();
        if (lastTranscriptText.trim()) {
          generateTranscriptSummary(lastTranscriptText);
        }
      }
    });
    if (btnToggleVideo) btnToggleVideo.addEventListener('click', function () {
      if (window.VideoConsultation) window.VideoConsultation.toggleSize();
    });

    // Complete Appointment buttons
    var btnComplete = u.byId('btn-complete-appointment');
    var btnConfirmComplete = u.byId('btn-confirm-complete');
    var btnCancelComplete = u.byId('btn-cancel-complete');
    if (btnComplete) btnComplete.addEventListener('click', function () { handleCompleteAppointment(); });
    if (btnConfirmComplete) btnConfirmComplete.addEventListener('click', function () { confirmCompleteAppointment(); });
    if (btnCancelComplete) btnCancelComplete.addEventListener('click', function () {
      var bar = u.byId('complete-confirmation-bar');
      if (bar) bar.classList.add('hidden');
    });

    // Editable intake: auto-save on change
    var intakeSaveTimeout = null;
    document.addEventListener('change', function (e) {
      var inEditable = e.target.closest('#workspace-editable-intake');
      if (!inEditable || !currentPatientId) return;
      clearTimeout(intakeSaveTimeout);
      intakeSaveTimeout = setTimeout(function () { saveEditableIntake(); }, 800);
    });
    // Also handle textarea blur for medications/allergies
    document.addEventListener('blur', function (e) {
      if ((e.target.id === 'ei-medications' || e.target.id === 'ei-allergies') && currentPatientId) {
        clearTimeout(intakeSaveTimeout);
        intakeSaveTimeout = setTimeout(function () { saveEditableIntake(); }, 300);
      }
    }, true);

    // Auto-score when Prescribe section opens
    var prescribeDetails = u.byId('workspace-prescribe-section');
    if (prescribeDetails) {
      prescribeDetails.addEventListener('toggle', function () {
        if (prescribeDetails.open) {
          if (!scoreCacheReady && currentPatientIntake) cacheProductScores();
          else if (enrichedItemsCache.length > 0) runProductSearch();
        }
      });
    }

    // Scripts panel: sub-tab toggle, archive, bulk archive, checkbox tracking
    document.addEventListener('click', function (e) {
      // Sub-tab toggle
      var subTab = e.target.closest('.script-sub-tab');
      if (subTab) {
        var panel = subTab.closest('.scripts-tab-bar') ? subTab.closest('.scripts-tab-bar').parentElement : null;
        if (!panel) return;
        var tabName = subTab.dataset.scriptTab;
        panel.querySelectorAll('.script-sub-tab').forEach(function (t) { t.classList.remove('active'); });
        subTab.classList.add('active');
        panel.querySelectorAll('.script-tab-panel').forEach(function (p) { p.classList.add('hidden'); });
        var targetPanel = panel.querySelector('[data-script-panel="' + tabName + '"]');
        if (targetPanel) targetPanel.classList.remove('hidden');
        // Hide bulk actions when switching tabs
        var bulkActions = panel.querySelector('.scripts-bulk-actions');
        if (bulkActions) bulkActions.classList.add('hidden');
        return;
      }

      // Archive single script
      var archiveBtn = e.target.closest('.btn-archive-script');
      if (archiveBtn) {
        var scriptId = archiveBtn.dataset.scriptId;
        var scriptName = archiveBtn.dataset.scriptName || 'this script';
        archiveBtn.disabled = true;
        archiveBtn.textContent = 'Archiving...';
        data.updateScript(scriptId, { status: 'Archived' }).then(function () {
          u.showToast('"' + scriptName + '" archived', 'success');
          var card = archiveBtn.closest('.script-card');
          if (card) card.remove();
          // Update the open count badge
          updateScriptTabCounts(archiveBtn);
        }).catch(function (err) {
          console.error('Failed to archive script:', err);
          u.showToast('Failed to archive script', 'error');
          archiveBtn.disabled = false;
          archiveBtn.textContent = 'Archive';
        });
        return;
      }

      // Bulk archive
      var bulkArchiveBtn = e.target.closest('.btn-bulk-archive');
      if (bulkArchiveBtn) {
        var panel = bulkArchiveBtn.closest('.scripts-tab-bar') ? bulkArchiveBtn.closest('.scripts-tab-bar').parentElement : bulkArchiveBtn.parentElement.parentElement;
        var checked = panel.querySelectorAll('.script-select:checked');
        if (checked.length === 0) return;
        if (!confirm('Archive ' + checked.length + ' script' + (checked.length > 1 ? 's' : '') + '?')) return;
        bulkArchiveBtn.disabled = true;
        bulkArchiveBtn.textContent = 'Archiving...';
        var promises = [];
        checked.forEach(function (cb) {
          promises.push(data.updateScript(cb.dataset.scriptId, { status: 'Archived' }));
        });
        Promise.all(promises).then(function () {
          u.showToast(checked.length + ' script' + (checked.length > 1 ? 's' : '') + ' archived', 'success');
          checked.forEach(function (cb) {
            var card = cb.closest('.script-card');
            if (card) card.remove();
          });
          updateScriptTabCounts(bulkArchiveBtn);
          var bulkActions = bulkArchiveBtn.closest('.scripts-bulk-actions');
          if (bulkActions) bulkActions.classList.add('hidden');
          bulkArchiveBtn.disabled = false;
          bulkArchiveBtn.textContent = 'Archive Selected';
        }).catch(function () {
          u.showToast('Some scripts failed to archive', 'error');
          bulkArchiveBtn.disabled = false;
          bulkArchiveBtn.textContent = 'Archive Selected';
        });
        return;
      }

      // Bulk re-prescribe
      var bulkReprescribeBtn = e.target.closest('.btn-bulk-represcribe');
      if (bulkReprescribeBtn) {
        var panel = bulkReprescribeBtn.closest('.scripts-tab-bar') ? bulkReprescribeBtn.closest('.scripts-tab-bar').parentElement : bulkReprescribeBtn.parentElement.parentElement.parentElement;
        var checked = panel.querySelectorAll('.script-select:checked');
        if (checked.length === 0) return;
        var items = [];
        checked.forEach(function (cb) {
          var card = cb.closest('.script-card');
          var drugId = card ? parseInt(card.dataset.drugId) : 0;
          var item = enrichedItemsCache.find(function (i) { return i.id === drugId; }) || itemsMap[drugId];
          if (item) items.push({ item: item, recommendation: null });
        });
        if (items.length > 0) {
          requireAppointmentContextBulk(items);
        } else {
          u.showToast('No product data found for selected scripts', 'error');
        }
        return;
      }
    });

    // Checkbox change: show/hide bulk action buttons
    document.addEventListener('change', function (e) {
      if (!e.target.classList.contains('script-select')) return;
      var panel = e.target.closest('[data-script-panel="open"]');
      if (!panel) return;
      var anyChecked = panel.querySelector('.script-select:checked');
      var container = panel.parentElement;
      var bulkActions = container ? container.querySelector('.scripts-bulk-actions') : null;
      if (bulkActions) bulkActions.classList.toggle('hidden', !anyChecked);
    });

    // Draft script actions: Edit + Delete
    document.addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('.btn-delete-script');
      if (deleteBtn) {
        var scriptId = deleteBtn.dataset.scriptId;
        var scriptName = deleteBtn.dataset.scriptName || 'this script';
        if (!confirm('Delete "' + scriptName + '"? This cannot be undone.')) return;
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        data.deleteScript(scriptId).then(function () {
          u.showToast('Script deleted', 'success');
          // Remove the card from DOM immediately (VitalStats read API has sync lag)
          var card = deleteBtn.closest('.record-card');
          if (card) card.remove();
          // Check if the scripts list is now empty
          var container = u.byId('workspace-scripts');
          var empty = u.byId('workspace-scripts-empty');
          if (container && container.children.length === 0 && empty) empty.style.display = '';
        }).catch(function (err) {
          console.error('Failed to delete script:', err);
          u.showToast('Failed to delete script', 'error');
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete';
        });
        return;
      }
      var editBtn = e.target.closest('.btn-edit-script');
      if (editBtn) {
        openEditScriptModal(editBtn.dataset.scriptId);
        return;
      }
    });

    // Workspace auto-save note on blur (click away)
    var wsNoteEditor = u.byId('workspace-note-content');
    if (wsNoteEditor) {
      wsNoteEditor.addEventListener('blur', function () {
        var content = wsNoteEditor.innerHTML.trim();
        if (content && content !== '<br>') saveWorkspaceNote();
      });
    }

    // Generate Clinical Note button
    var btnGenNote = u.byId('btn-generate-clinical-note');
    if (btnGenNote) btnGenNote.addEventListener('click', handleGenerateClinicalNote);

    // Appointment card clicks → open workspace (delegated)
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.appt-workspace-card');
      if (!card) return;
      // Don't trigger on external link clicks
      if (e.target.closest('a')) return;
      var apptId = card.dataset.apptId;
      var patientId = card.dataset.patientId;
      if (apptId && patientId) {
        openAppointmentWorkspace(Number(apptId), Number(patientId));
      }
    });

    // Item detail — back button
    var btnBackItem = u.byId('btn-back-from-item');
    if (btnBackItem) {
      btnBackItem.addEventListener('click', function () {
        if (itemDetailPreviousView && itemDetailPreviousView.id) {
          var viewName = itemDetailPreviousView.id.replace('view-', '');
          showView(viewName);
        } else {
          showView('appointment-workspace');
        }
      });
    }

    // Item detail — click item name/image anywhere to open detail page
    document.addEventListener('click', function (e) {
      // Don't trigger on buttons
      if (e.target.closest('button') || e.target.closest('a')) return;

      var itemId = null;

      // Click on item name in rec card
      var recName = e.target.closest('.rec-name');
      if (recName) {
        var recCard = recName.closest('.rec-card');
        if (recCard) itemId = parseInt(recCard.dataset.itemId);
      }

      // Click on product name in search results
      var prodName = e.target.closest('.product-name');
      if (prodName) {
        var prodRow = prodName.closest('.product-row');
        if (prodRow) itemId = parseInt(prodRow.dataset.itemId);
      }

      // Click on product thumb/image
      var thumb = e.target.closest('.product-thumb');
      if (thumb) {
        var parent = thumb.closest('[data-item-id]');
        if (parent) itemId = parseInt(parent.dataset.itemId);
      }

      // Click on script card name
      var scriptName = e.target.closest('.script-card-name');
      if (scriptName) {
        var scriptCard = scriptName.closest('.script-card');
        // script cards don't have data-item-id on the card, get drug_id from the rendered card
        // For now, look for the img's parent
      }

      // Click on similar product card in sidebar
      var similarCard = e.target.closest('.item-similar-card');
      if (similarCard) itemId = parseInt(similarCard.dataset.itemId);

      if (itemId) {
        e.stopPropagation();
        openItemDetailPage(itemId);
      }
    });

    // Prescribe button on item detail page
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-prescribe-item');
      if (!btn) return;
      var itemId = parseInt(btn.dataset.itemId);
      var item = enrichedItemsCache.find(function (i) { return i.id === itemId; });
      if (item) {
        requireAppointmentContext(item, null);
        // Navigate back to workspace if we're already in context
        if (currentAppointmentId) {
          showView('appointment-workspace');
          var prescribeSection = u.byId('workspace-prescribe-section');
          if (prescribeSection) prescribeSection.open = true;
        }
      }
    });

    // Re-prescribe button on existing scripts
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-represcribe');
      if (!btn) return;
      var drugId = parseInt(btn.dataset.drugId);
      var item = enrichedItemsCache.find(function (i) { return i.id === drugId; }) || itemsMap[drugId];
      if (item) {
        requireAppointmentContext(item, null);
        if (currentAppointmentId) {
          var prescribeSection = u.byId('workspace-prescribe-section');
          if (prescribeSection) {
            prescribeSection.open = true;
            prescribeSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }
    });

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

    // Clear pending prescribe item when appointment picker is closed
    u.$$('[data-close-modal="modal-appointment-picker"]').forEach(function (btn) {
      btn.addEventListener('click', function () { pendingPrescribeItem = null; });
    });
    var pickerOverlay = u.byId('modal-appointment-picker');
    if (pickerOverlay) {
      pickerOverlay.addEventListener('click', function (e) {
        if (e.target === pickerOverlay) pendingPrescribeItem = null;
      });
    }

    // Appointment picker: patient search
    var pickerPatientSearch = u.byId('appt-picker-patient-search');
    if (pickerPatientSearch) {
      pickerPatientSearch.addEventListener('input', function () {
        u.byId('appt-picker-patient-id').value = '';
      });
      pickerPatientSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runPickerPatientSearch();
        }
      });
    }

    // Appointment picker: patient result selection
    var pickerPatientResults = u.byId('appt-picker-patient-results');
    if (pickerPatientResults) {
      pickerPatientResults.addEventListener('click', function (e) {
        var item = e.target.closest('.patient-result-item');
        if (!item || !item.dataset.patientId) return;
        var pId = item.dataset.patientId;
        var pName = item.dataset.patientName;
        u.byId('appt-picker-patient-id').value = pId;
        if (pickerPatientSearch) pickerPatientSearch.value = pName;
        pickerPatientResults.classList.add('hidden');
        // Transition to appointment list
        var patientStep = u.byId('appt-picker-patient-step');
        var apptsStep = u.byId('appt-picker-appointments');
        var labelEl = u.byId('appt-picker-patient-label');
        if (patientStep) patientStep.classList.add('hidden');
        if (labelEl) labelEl.textContent = 'Appointments for ' + pName;
        if (apptsStep) apptsStep.classList.remove('hidden');
        loadAppointmentPickerList(Number(pId));
      });
    }

    // Appointment picker: appointment selection
    var pickerList = u.byId('appt-picker-list');
    if (pickerList) {
      pickerList.addEventListener('click', function (e) {
        var item = e.target.closest('.appt-picker-item');
        if (!item) return;
        var appointmentId = Number(item.dataset.appointmentId);
        var patientId = Number(item.dataset.patientId);
        closeModal('modal-appointment-picker');
        openAppointmentWorkspace(appointmentId, patientId);
      });
    }

    window.addEventListener('resize', function () {
      updateTimeslotsCalendarHeight();
      updateAppointmentsCalendarHeight();
    });

    // ── Appointment Edit/Cancel ──
    document.addEventListener('click', function (e) {
      var editBtn = e.target.closest('.btn-edit-appt');
      if (editBtn) {
        var apptId = Number(editBtn.dataset.apptId);
        var appt = cachedDoctorAppointments.find(function (a) { return a.id == apptId; });
        if (appt) openEditAppointmentModal(appt);
        return;
      }
      var cancelBtn = e.target.closest('.btn-cancel-appt');
      if (cancelBtn) {
        var apptId2 = Number(cancelBtn.dataset.apptId);
        if (!confirm('Cancel this appointment? This cannot be undone.')) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling...';
        data.cancelAppointment(apptId2).then(function () {
          u.showToast('Appointment cancelled', 'success');
          loadDoctorAppointments();
          loadTodaySchedule();
        }).catch(function () {
          u.showToast('Failed to cancel appointment', 'error');
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancel';
        });
        return;
      }
    });

    // ── Edit appointment save ──
    var btnSaveEditAppt = u.byId('btn-save-edit-appt');
    if (btnSaveEditAppt) {
      btnSaveEditAppt.addEventListener('click', handleSaveAppointment);
    }

    // ── Settings save ──
    var btnSaveSettings = u.byId('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', function () {
        var prefs = {
          default_repeats: parseInt(u.byId('pref-default-repeats').value) || 3,
          default_interval_days: parseInt(u.byId('pref-default-interval').value) || 7,
          calendar_view_start: u.byId('pref-calendar-start').value || '08:00',
          calendar_view_end: u.byId('pref-calendar-end').value || '20:00',
        };
        btnSaveSettings.disabled = true;
        btnSaveSettings.textContent = 'Saving...';
        data.saveDoctorPreferences(doctorId, prefs).then(function () {
          window.DoctorPreferences.setAll(prefs);
          setCalendarViewHours(prefs.calendar_view_start, prefs.calendar_view_end);
          // Re-fetch from Ontraport to confirm the save persisted
          return data.fetchDoctorPreferences(Number(doctorId));
        }).then(function (serverPrefs) {
          if (serverPrefs) window.DoctorPreferences.setAll(serverPrefs);
          populateSettingsForm();
          btnSaveSettings.textContent = 'Save Settings';
          btnSaveSettings.disabled = false;
          u.showToast('Settings saved', 'success');
        }).catch(function () {
          btnSaveSettings.textContent = 'Save Settings';
          btnSaveSettings.disabled = false;
          u.showToast('Failed to save settings', 'error');
        });
      });
    }

    // ── Prescribe events (document-level delegation for workspace) ──
    document.addEventListener('click', function (e) {
      var target = e.target;

      // Legacy generate recommendations — now auto-scored
      if (target.closest('#btn-generate-recs')) { return; }

      // Create scripts button
      if (target.closest('#btn-create-scripts')) {
        openCreateScriptsModal();
        return;
      }

      // Confirm scripts button
      if (target.closest('#btn-confirm-scripts')) {
        confirmCreateScripts();
        return;
      }

      // Toggle manual search
      if (target.closest('#btn-toggle-search')) {
        // Legacy — no longer needed, search is always visible
        return;
      }

      // Toggle advanced filters
      if (target.closest('#btn-toggle-advanced-filters')) {
        var advBody = u.byId('advanced-filters-body');
        var advBtn = u.byId('btn-toggle-advanced-filters');
        if (advBody) {
          advBody.classList.toggle('hidden');
          if (advBtn) advBtn.classList.toggle('is-open', !advBody.classList.contains('hidden'));
        }
        return;
      }

      // Clear all filters
      if (target.closest('#btn-clear-filters')) {
        u.$$('#prescribe-filters .filter-pill.active').forEach(function (p) { p.classList.remove('active'); });
        u.$$('#prescribe-filters .filter-count').forEach(function (c) { c.classList.add('hidden'); c.textContent = '0'; });
        var pm = u.byId('filter-price-min'); if (pm) pm.value = '';
        var px = u.byId('filter-price-max'); if (px) px.value = '';
        var si = u.byId('prescribe-product-search'); if (si) si.value = '';
        var sortSel = u.byId('product-sort'); if (sortSel) sortSel.value = 'relevance';
        updateAdvancedFilterCount();
        runProductSearch();
        return;
      }
    });

    // Prescribe click delegation (add/remove cart, score breakdown, similar)
    // Use document level since the prescribe section is inside a <details> in the workspace
    document.addEventListener('click', function (e) {
      // Only handle if we're inside a prescribe area or workspace
      var inPrescribe = e.target.closest('#workspace-prescribe-section') || e.target.closest('#prescribe-recs-section');
      if (inPrescribe) {
        handlePrescribeClick(e);
      }
    });

    // Filter pill clicks (document-level — elements inside workspace <details>)
    document.addEventListener('click', function (e) {
      var pill = e.target.closest('#prescribe-filters .filter-pill');
      if (!pill) return;
      pill.classList.toggle('active');
      var group = pill.closest('[data-filter-group]');
      if (group) {
        var activeCount = group.querySelectorAll('.filter-pill.active').length;
        var countBadge = group.querySelector('.filter-count');
        if (countBadge) {
          countBadge.textContent = activeCount;
          countBadge.classList.toggle('hidden', activeCount === 0);
        }
      }
      updateAdvancedFilterCount();
      runProductSearch();
    });

    // Price range + search input (document-level)
    var searchDebounce = null;
    document.addEventListener('input', function (e) {
      if (e.target.id === 'filter-price-min' || e.target.id === 'filter-price-max') {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(runProductSearch, 400);
      }
      if (e.target.id === 'prescribe-product-search') {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(runProductSearch, 300);
      }
    });

    // Sort dropdown
    document.addEventListener('change', function (e) {
      if (e.target.id === 'product-sort') {
        runProductSearch();
      }
    });
  }

  // ── Navigation ─────────────────────────────────────────────

  function switchMainTab(tab) {
    u.$$('#main-tabs .tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    u.$$('.view').forEach(function (v) { v.classList.add('hidden'); });

    if (tab === 'today') {
      u.byId('view-today').classList.remove('hidden');
      loadTodaySchedule();
    } else if (tab === 'patients') {
      u.byId('view-patients').classList.remove('hidden');
    } else if (tab === 'appointments') {
      u.byId('view-appointments').classList.remove('hidden');
      loadDoctorAppointments();
      initAppointmentsCalendar();
      requestAnimationFrame(function () { updateAppointmentsCalendarHeight(); });
    } else if (tab === 'timeslots') {
      u.byId('view-timeslots').classList.remove('hidden');
      loadTimeslots();
      var calSlot = initTimeslotsCalendar();
      if (calSlot) calSlot.refetchEvents();
      requestAnimationFrame(function () { updateTimeslotsCalendarHeight(); });
    } else if (tab === 'formulary') {
      u.byId('view-formulary').classList.remove('hidden');
      runFormularySearch();
    } else if (tab === 'settings') {
      u.byId('view-settings').classList.remove('hidden');
      populateSettingsForm();
    }
  }

  function populateSettingsForm() {
    var prefs = window.DoctorPreferences.getAll();
    var el;
    el = u.byId('pref-default-repeats');   if (el) el.value = prefs.default_repeats;
    el = u.byId('pref-default-interval');  if (el) el.value = prefs.default_interval_days;
    el = u.byId('pref-calendar-start');    if (el) el.value = prefs.calendar_view_start;
    el = u.byId('pref-calendar-end');      if (el) el.value = prefs.calendar_view_end;
  }

  // ── Active Call Indicator ──────────────────────────────────
  var _callTimerInterval = null;

  function createActiveCallIndicator() {
    var indicator = document.createElement('div');
    indicator.id = 'active-call-indicator';
    indicator.className = 'active-call-indicator hidden';
    indicator.innerHTML =
      '<div class="call-indicator-left">' +
        '<span class="call-indicator-dot"></span>' +
        '<span class="call-indicator-label">Live Consultation</span>' +
        '<span class="call-indicator-sep">&middot;</span>' +
        '<span class="call-indicator-patient" id="call-indicator-patient"></span>' +
        '<span class="call-indicator-sep">&middot;</span>' +
        '<span class="call-indicator-timer" id="call-indicator-timer">00:00</span>' +
      '</div>' +
      '<button class="call-indicator-btn" id="btn-return-to-call">' +
        'Return to Call' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</button>';

    // Insert between header and tab bar
    var tabBar = document.querySelector('.tab-bar');
    if (tabBar && tabBar.parentNode) {
      tabBar.parentNode.insertBefore(indicator, tabBar);
    }

    // Return-to-call click handler
    indicator.querySelector('#btn-return-to-call').addEventListener('click', function () {
      var info = window.VideoConsultation ? window.VideoConsultation.getActiveCallInfo() : null;
      if (info) {
        returnToActiveCall(info.appointmentId, info.patientId);
      }
    });
  }

  function showActiveCallIndicator() {
    var indicator = u.byId('active-call-indicator');
    if (!indicator) return;
    var info = window.VideoConsultation ? window.VideoConsultation.getActiveCallInfo() : null;
    if (!info) return;

    // Set patient name
    var patientEl = u.byId('call-indicator-patient');
    if (patientEl) patientEl.textContent = info.patientName || 'Patient';

    // Start timer
    if (_callTimerInterval) clearInterval(_callTimerInterval);
    _callTimerInterval = setInterval(function () { updateCallTimer(info.startTime); }, 1000);
    updateCallTimer(info.startTime);

    indicator.classList.remove('hidden');

    // Add LIVE badge to Appointments tab
    addTabLiveBadge();
  }

  function hideActiveCallIndicator() {
    var indicator = u.byId('active-call-indicator');
    if (indicator) indicator.classList.add('hidden');
    if (_callTimerInterval) { clearInterval(_callTimerInterval); _callTimerInterval = null; }
    removeTabLiveBadge();
  }

  function updateCallTimer(startTime) {
    var timerEl = u.byId('call-indicator-timer');
    if (!timerEl || !startTime) return;
    var elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    var mins = Math.floor(elapsed / 60);
    var secs = elapsed % 60;
    var hours = Math.floor(mins / 60);
    mins = mins % 60;
    timerEl.textContent = hours > 0
      ? hours + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
      : String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function addTabLiveBadge() {
    removeTabLiveBadge(); // prevent duplicates
    var apptTab = document.querySelector('.tab-btn[data-tab="appointments"]');
    if (apptTab && !apptTab.querySelector('.tab-live-badge')) {
      var badge = document.createElement('span');
      badge.className = 'tab-live-badge';
      badge.textContent = 'LIVE';
      apptTab.appendChild(badge);
    }
  }

  function removeTabLiveBadge() {
    var badges = document.querySelectorAll('.tab-live-badge');
    badges.forEach(function (b) { b.remove(); });
  }

  function returnToActiveCall(appointmentId, patientId) {
    if (!appointmentId) return;
    hideActiveCallIndicator();
    currentAppointmentId = Number(appointmentId);
    currentPatientId = patientId ? Number(patientId) : currentPatientId;

    // Re-show the workspace with the video reattached
    showView('appointment-workspace');
    if (window.VideoConsultation) window.VideoConsultation.reattach();
  }

  function showView(view) {
    u.$$('.view').forEach(function (v) { v.classList.add('hidden'); });

    // When leaving workspace: detach (keep call alive) or cleanup (no call)
    if (view !== 'appointment-workspace') {
      var banner = u.byId('workspace-context-banner');
      if (banner) banner.remove();
      if (window.VideoConsultation && window.VideoConsultation.isActive()) {
        window.VideoConsultation.detach();
        showActiveCallIndicator();
      } else if (window.VideoConsultation) {
        window.VideoConsultation.cleanup();
      }
    } else {
      // Returning to workspace — hide the indicator
      hideActiveCallIndicator();
    }

    // Show the target view
    var el = u.byId('view-' + view);
    if (el) el.classList.remove('hidden');

    // Sync tab bar active state for main tabs
    var mainTabs = ['patients', 'appointments', 'timeslots', 'formulary'];
    if (mainTabs.indexOf(view) >= 0) {
      u.$$('#main-tabs .tab-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === view);
      });
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

  // ── Prescribe Gate: ensure appointment context ─────────────

  function requireAppointmentContext(item, recommendation) {
    pendingPrescribeItem = null; // Clear any stale pending item
    if (currentAppointmentId) {
      // Already in workspace context — add directly
      prescribe.addToCart(item, recommendation || null);
      u.showToast('"' + (item.item_name || 'Product') + '" added to prescription cart', 'success');
      return;
    }
    // No appointment context — stash item and open picker
    pendingPrescribeItem = [{ item: item, recommendation: recommendation || null }];
    openAppointmentPickerModal(currentPatientId);
  }

  /** Gate for multiple items at once (bulk re-prescribe). */
  function requireAppointmentContextBulk(items) {
    pendingPrescribeItem = null;
    if (currentAppointmentId) {
      items.forEach(function (entry) { prescribe.addToCart(entry.item, entry.recommendation || null); });
      u.showToast(items.length + ' item' + (items.length > 1 ? 's' : '') + ' added to prescription cart', 'success');
      return;
    }
    pendingPrescribeItem = items;
    openAppointmentPickerModal(currentPatientId);
  }

  function openAppointmentPickerModal(patientId) {
    var patientStep = u.byId('appt-picker-patient-step');
    var apptsStep = u.byId('appt-picker-appointments');
    var loading = u.byId('appt-picker-loading');
    var searchInput = u.byId('appt-picker-patient-search');
    var idInput = u.byId('appt-picker-patient-id');
    var results = u.byId('appt-picker-patient-results');
    var listEl = u.byId('appt-picker-list');
    var emptyEl = u.byId('appt-picker-empty');
    var labelEl = u.byId('appt-picker-patient-label');

    // Reset state
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.add('hidden');
    if (loading) loading.classList.add('hidden');
    if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
    if (searchInput) searchInput.value = '';
    if (idInput) idInput.value = '';

    if (patientId) {
      // Patient context exists — skip search, go straight to appointment list
      if (patientStep) patientStep.classList.add('hidden');
      if (idInput) idInput.value = String(patientId);
      var patient = allPatients.find(function (p) { return p.id == patientId; });
      var name = patient ? getPatientDisplayName(patient) : 'Patient #' + patientId;
      if (labelEl) labelEl.textContent = 'Appointments for ' + name;
      if (apptsStep) apptsStep.classList.remove('hidden');
      loadAppointmentPickerList(patientId);
    } else {
      // No patient context — show search step
      if (patientStep) patientStep.classList.remove('hidden');
      if (apptsStep) apptsStep.classList.add('hidden');
    }

    openModal('modal-appointment-picker');
  }

  function loadAppointmentPickerList(patientId) {
    var listEl = u.byId('appt-picker-list');
    var emptyEl = u.byId('appt-picker-empty');
    var loading = u.byId('appt-picker-loading');
    if (loading) loading.classList.remove('hidden');
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.add('hidden');

    data.fetchAppointments({ patient_id: patientId, doctor_id: doctorId }).then(function (appointments) {
      if (loading) loading.classList.add('hidden');
      if (!appointments || appointments.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
      }
      // Sort by appointment_time descending (most recent first)
      appointments.sort(function (a, b) {
        return (parseInt(b.appointment_time) || 0) - (parseInt(a.appointment_time) || 0);
      });
      appointments.forEach(function (appt) {
        var time = appt.appointment_time ? new Date(parseInt(appt.appointment_time) * 1000) : null;
        var timeStr = time ? time.toLocaleDateString('en-AU') + ' ' + time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : 'No date';
        var statusClass = (appt.status || '').toLowerCase().replace(/\s+/g, '-');
        var div = document.createElement('div');
        div.className = 'appt-picker-item';
        div.dataset.appointmentId = appt.id;
        div.dataset.patientId = appt.patient_id;
        div.innerHTML =
          '<div class="appt-picker-item-info">' +
            '<span class="appt-picker-item-type">' + u.escapeHtml(appt.type || 'Appointment') + '</span>' +
            '<span class="appt-picker-item-time">' + u.escapeHtml(timeStr) + '</span>' +
          '</div>' +
          '<span class="appt-picker-item-status">' + u.escapeHtml(appt.status || '') + '</span>';
        listEl.appendChild(div);
      });
    }).catch(function () {
      if (loading) loading.classList.add('hidden');
      if (emptyEl) { emptyEl.textContent = 'Failed to load appointments.'; emptyEl.classList.remove('hidden'); }
    });
  }

  function runPickerPatientSearch() {
    var searchInput = u.byId('appt-picker-patient-search');
    var idInput = u.byId('appt-picker-patient-id');
    if (!searchInput || !idInput) return;
    if (idInput.value) return;
    var query = searchInput.value.trim();
    if (!query) return;
    renderAppointmentPatientResultsFromList([], 'Searching...', 'appt-picker-patient-results');
    data.searchPatients(query).then(function (results) {
      var arr = Array.isArray(results) ? results : [];
      renderAppointmentPatientResultsFromList(arr, arr.length === 0 ? 'No patients match. Try a different name.' : null, 'appt-picker-patient-results');
    }).catch(function () {
      renderAppointmentPatientResultsFromList([], 'Search failed. Try again.', 'appt-picker-patient-results');
    });
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

    currentPatientId = patientId;
    currentPatientIntake = null;
    currentRecommendations = null;
    if (prescribe) prescribe.clearCart();

    renderPatientHero(patient);
    renderPatientSummary(patientId);
    showView('patient-detail');
    switchDetailTab('appointments');

    // Load detail data in parallel
    loadPatientAppointments(patientId);
    loadPatientNotes(patientId);
    loadPatientScripts(patientId);
    loadPrescribeIntake(patientId);

    var btnAppt = u.byId('btn-add-appointment');
    if (btnAppt) {
      btnAppt.dataset.patientId = String(patientId);
      btnAppt.dataset.patientName = (patient.first_name || '') + ' ' + (patient.last_name || '');
    }
  }

  function getPatientDisplayName(p) {
    return ((p.first_name || p.firstname || '') + ' ' + (p.last_name || p.lastname || '')).trim() || 'Patient #' + (p.id != null ? p.id : '');
  }

  function renderAppointmentPatientResultsFromList(patients, emptyMessage, targetId) {
    var listId = targetId || 'appt-patient-results';
    var list = u.byId(listId);
    // Derive the hidden input ID from the list ID pattern (appt-*-results → appt-*-id)
    var idInputId = listId.replace(/-results$/, '-id');
    var idInput = u.byId(idInputId);
    if (!list) return;
    if (idInput && idInput.value) {
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
        var details = [];
        if (p.sms_number) details.push(p.sms_number);
        if (p.birthday) {
          var bd = new Date(parseInt(p.birthday) * 1000);
          if (!isNaN(bd.getTime())) details.push('DOB: ' + bd.toLocaleDateString('en-AU'));
        }
        if (p.state_au) details.push(p.state_au);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'patient-result-item';
        btn.innerHTML = '<span class="patient-result-name">' + u.escapeHtml(name) + '</span>' +
          (details.length ? '<span class="patient-result-details">' + u.escapeHtml(details.join(' \u00b7 ')) + '</span>' : '');
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
    u.byId('appt-date').required = true;
    // Reset toggle to "Now"
    u.$$('.appt-when-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.when === 'now'); });
    var nowSection = u.byId('appt-when-now');
    var slotSection = u.byId('appt-when-timeslot');
    if (nowSection) nowSection.classList.remove('hidden');
    if (slotSection) slotSection.classList.add('hidden');
    var slotIdInput = u.byId('appt-timeslot-id');
    if (slotIdInput) slotIdInput.value = '';
    // Clear fee (optional — doctor chooses whether to charge)
    var feeInput = u.byId('appt-fee');
    if (feeInput) feeInput.value = '';
    selectedPaymentMethod = 'card'; // reset to card as default choice
    // Check for card on file
    var paymentInfo = u.byId('appt-payment-info');
    if (paymentInfo) { paymentInfo.classList.add('hidden'); paymentInfo.innerHTML = ''; }
    if (preSelectedPatientId) {
      checkPatientCard(preSelectedPatientId);
    }
    openModal('modal-add-appointment');
  }

  var CONSULTATION_FEES = {
    'Initial Consultation': { price: 59, productId: '1' },
    'Follow Up Consultation': { price: 39, productId: '13' },
  };

  function updateApptFee() {
    var typeSelect = u.byId('appt-type');
    var feeInput = u.byId('appt-fee');
    if (!typeSelect || !feeInput) return;
    var entry = CONSULTATION_FEES[typeSelect.value];
    var fee = entry ? entry.price : 0;
    feeInput.value = fee > 0 ? fee.toFixed(2) : '';
  }

  var cachedPatientCards = null; // { patientId, cards[] }

  function processAppointmentBilling(patientId, amount, productId, appointmentId) {
    var billingOpts = {
      contact_id: patientId,
      amount: amount,
      product_id: productId,
      description: 'Consultation fee',
      gateway_id: 4, // Live gateway
      appointment_id: appointmentId,
    };

    // Determine selected card (if charging)
    var selectedCard = null;
    if (selectedPaymentMethod === 'card' && cachedPatientCards && cachedPatientCards.cards.length > 0) {
      var idx = cachedPatientCards.selectedCardIdx;
      if (idx != null) {
        selectedCard = cachedPatientCards.cards[idx];
      } else {
        // Use default card, or first active
        selectedCard = cachedPatientCards.cards.find(function (c) { return (c.card_status || '').indexOf('Default') !== -1; }) || cachedPatientCards.cards[0];
      }
    }

    if (selectedPaymentMethod === 'card' && selectedCard && selectedCard.id) {
      // Charge selected card
      billingOpts.cc_id = selectedCard.id;
      data.chargeCard(billingOpts).then(function (result) {
        var invoiceId = result && result.invoice_id;
        u.showToast('Card charged $' + Number(amount).toFixed(2) + (invoiceId ? ' (Invoice #' + invoiceId + ')' : ''), 'success');
      }).catch(function (err) {
        console.error('Card charge failed:', err);
        u.showToast('Card charge failed: ' + (err.message || 'Unknown error'), 'error');
      });
    } else {
      // Send unpaid invoice
      data.createInvoice(billingOpts).then(function (result) {
        var invoiceId = result && result.invoice_id;
        u.showToast('Unpaid invoice #' + (invoiceId || '?') + ' created for $' + Number(amount).toFixed(2), 'success');
      }).catch(function (err) {
        console.error('Invoice creation failed:', err);
        u.showToast('Invoice creation failed: ' + (err.message || 'Unknown error'), 'error');
      });
    }
  }

  function checkPatientCard(patientId) {
    var paymentInfo = u.byId('appt-payment-info');
    if (!paymentInfo) return;
    cachedPatientCards = null;
    // Only show payment info if a fee is entered
    var feeInput = u.byId('appt-fee');
    var fee = feeInput ? parseFloat(feeInput.value) : 0;
    if (!fee || fee <= 0) {
      paymentInfo.classList.add('hidden');
      paymentInfo.innerHTML = '';
    } else {
      paymentInfo.classList.remove('hidden');
      paymentInfo.innerHTML = '<span class="text-muted">Checking card on file...</span>';
    }
    data.fetchCreditCards(patientId).then(function (cards) {
      var active = cards.filter(function (c) {
        var status = (c.card_status || c.status || '').toLowerCase();
        return status.indexOf('active') !== -1;
      });
      if (active.length > 0) {
        var card = active[0];
        var last4 = card.card_number_last_4 || card.last4 || '****';
        var type = card.card_type || 'Card';
        cachedPatientCards = { patientId: patientId, cards: active, defaultCard: card };
        if (fee > 0) paymentInfo.innerHTML = '<span class="chip chip-paid">' + u.escapeHtml(type) + ' ending ' + u.escapeHtml(last4) + '</span> will be charged';
      } else {
        cachedPatientCards = { patientId: patientId, cards: [], defaultCard: null };
        if (fee > 0) paymentInfo.innerHTML = '<span class="text-muted">No card on file — an unpaid invoice will be created</span>';
      }
    }).catch(function () {
      cachedPatientCards = { patientId: patientId, cards: [], defaultCard: null };
    });
  }

  var selectedPaymentMethod = 'card'; // 'card' or 'invoice'

  function updatePaymentInfo() {
    var paymentInfo = u.byId('appt-payment-info');
    if (!paymentInfo) return;
    var feeInput = u.byId('appt-fee');
    var fee = feeInput ? parseFloat(feeInput.value) : 0;
    if (!fee || fee <= 0) {
      paymentInfo.classList.add('hidden');
      paymentInfo.innerHTML = '';
      return;
    }
    paymentInfo.classList.remove('hidden');
    if (cachedPatientCards && cachedPatientCards.cards && cachedPatientCards.cards.length > 0) {
      var html = '<div class="payment-method-choice">';
      html += '<label class="payment-option"><input type="radio" name="appt-payment-method" value="card" ' + (selectedPaymentMethod === 'card' ? 'checked' : '') + '> Charge card on file</label>';
      // Show available cards
      html += '<div class="payment-cards' + (selectedPaymentMethod !== 'card' ? ' hidden' : '') + '" id="appt-card-list">';
      cachedPatientCards.cards.forEach(function (card, idx) {
        var last4 = card.card_number_last_4 || card.last4 || '****';
        var type = card.card_type || 'Card';
        var isDefault = (card.card_status || '').indexOf('Default') !== -1;
        var checked = (selectedPaymentMethod === 'card' && (cachedPatientCards.selectedCardIdx === idx || (cachedPatientCards.selectedCardIdx == null && isDefault) || (cachedPatientCards.selectedCardIdx == null && idx === 0)));
        html += '<label class="card-option' + (isDefault ? ' card-default' : '') + '">';
        html += '<input type="radio" name="appt-card" value="' + idx + '" ' + (checked ? 'checked' : '') + '>';
        html += '<span class="chip chip-paid">' + u.escapeHtml(type) + ' ending ' + u.escapeHtml(last4) + '</span>';
        if (isDefault) html += ' <span class="text-muted">(default)</span>';
        html += '</label>';
      });
      html += '</div>';
      html += '<label class="payment-option"><input type="radio" name="appt-payment-method" value="invoice" ' + (selectedPaymentMethod === 'invoice' ? 'checked' : '') + '> Send unpaid invoice</label>';
      html += '</div>';
      paymentInfo.innerHTML = html;
    } else if (cachedPatientCards) {
      selectedPaymentMethod = 'invoice';
      paymentInfo.innerHTML = '<span class="text-muted">No card on file — an unpaid invoice for $' + fee.toFixed(2) + ' will be created</span>';
    }
  }

  function renderApptTimeslotList() {
    var listEl = u.byId('appt-timeslot-list');
    var emptyEl = u.byId('appt-timeslot-empty');
    var slotIdInput = u.byId('appt-timeslot-id');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (slotIdInput) slotIdInput.value = '';
    if (emptyEl) emptyEl.classList.add('hidden');
    listEl.dataset.selectedTime = '';

    // Ontraport field IDs for timeslot object
    var F_START = 'f2125';
    var F_END = 'f2126';
    var F_STATUS = 'f2151';
    var F_AVAIL = 'f2669';
    var F_MAX = 'f2149';
    // Open status code = 133
    var OPEN_STATUS = '133';

    var nowUnix = Math.floor(Date.now() / 1000);
    var available = (cachedTimeslots || []).filter(function (slot) {
      var startTime = Number(slot[F_START]) || 0;
      var status = String(slot[F_STATUS] || '');
      var max = Number(slot[F_MAX]) || 0;
      var avail = Number(slot[F_AVAIL]) || max;
      return startTime > nowUnix && status === OPEN_STATUS && avail > 0;
    });

    available.sort(function (a, b) {
      return (Number(a[F_START]) || 0) - (Number(b[F_START]) || 0);
    });

    if (!available.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    available.forEach(function (slot) {
      var startTime = Number(slot[F_START]) || 0;
      var endTime = Number(slot[F_END]) || 0;
      var startDate = new Date(startTime * 1000);
      var endDate = new Date(endTime * 1000);
      var dateStr = startDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      var timeRange = startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) +
        ' - ' + endDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      var avail = Number(slot[F_AVAIL]) || Number(slot[F_MAX]) || 0;

      var div = document.createElement('div');
      div.className = 'appt-timeslot-item';
      div.dataset.timeslotId = slot.id;
      div.dataset.startTime = String(startTime);
      div.innerHTML =
        '<div class="appt-timeslot-info">' +
          '<span class="appt-timeslot-date">' + u.escapeHtml(dateStr) + '</span>' +
          '<span class="appt-timeslot-time">' + u.escapeHtml(timeRange) + '</span>' +
        '</div>' +
        '<span class="appt-timeslot-avail">' + avail + ' spot' + (avail !== 1 ? 's' : '') + '</span>';
      listEl.appendChild(div);
    });
  }

  function phoneToE164(phone) {
    if (!phone) return '';
    var digits = phone.replace(/[^\d+]/g, '');
    // Australian: starts with 0, convert to +61
    if (digits.charAt(0) === '0') digits = '+61' + digits.substring(1);
    // Ensure + prefix
    if (digits.charAt(0) !== '+') digits = '+' + digits;
    return digits;
  }

  function buildContactMeta(p) {
    var esc = u.escapeHtml;
    var metaItems = [];

    // Demographics: sex, DOB, age
    var demoParts = [];
    if (p.sex) demoParts.push(esc(p.sex));
    if (p.birthday) {
      var bd = new Date(parseInt(p.birthday) * 1000);
      if (!isNaN(bd.getTime())) demoParts.push('DOB: ' + bd.toLocaleDateString('en-AU'));
    }
    if (p.age) demoParts.push('Age ' + esc(String(p.age)));
    if (demoParts.length > 0) {
      metaItems.push('<span class="hero-meta-item hero-meta-demo">' + demoParts.join(' &middot; ') + '</span>');
    }

    if (p.sms_number) {
      var e164 = phoneToE164(p.sms_number);
      metaItems.push(
        '<a class="hero-meta-item hero-meta-link" href="tel:' + encodeURIComponent(e164) + '" title="Call">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>' +
          esc(p.sms_number) +
        '</a>'
      );
    }
    if (p.email) {
      metaItems.push(
        '<a class="hero-meta-item hero-meta-link" href="mailto:' + encodeURIComponent(p.email) + '" title="Email">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>' +
          esc(p.email) +
        '</a>'
      );
    }
    var addressParts = [p.address, p.city, p.state_au, p.zip_code].filter(Boolean);
    if (addressParts.length > 0) {
      metaItems.push(
        '<span class="hero-meta-item">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          esc(addressParts.join(', ')) +
        '</span>'
      );
    }
    return metaItems;
  }

  function renderPatientHero(p) {
    var hero = u.byId('patient-hero');
    var initials = ((p.first_name || '?')[0] + (p.last_name || '?')[0]).toUpperCase();
    var name = u.escapeHtml((p.first_name || '') + ' ' + (p.last_name || ''));
    var statusChip = getStatusChip(p.application_status || p.clinician_status || '');
    var metaItems = buildContactMeta(p);

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

  function renderPatientSummary(patientId) {
    var container = u.byId('patient-summary');
    if (!container) return;
    container.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div></div>';

    Promise.all([
      data.fetchAppointments({ patient_id: patientId, doctor_id: doctorId }),
      data.fetchScripts(patientId),
      data.fetchClinicalNotes(patientId)
    ]).then(function (results) {
      var appts = results[0] || [];
      var scripts = results[1] || [];
      var notes = results[2] || [];

      var nowUnix = Math.floor(Date.now() / 1000);

      // Next appointment
      var futureAppts = appts.filter(function (a) { return (a.appointment_time || 0) > nowUnix; });
      futureAppts.sort(function (a, b) { return (a.appointment_time || 0) - (b.appointment_time || 0); });
      var nextAppt = futureAppts[0];
      var nextApptHtml = nextAppt
        ? u.formatDate(nextAppt.appointment_time) + '<br><span class="summary-sub">' + u.escapeHtml(nextAppt.type || 'Appointment') + '</span>'
        : '<span class="summary-sub">None scheduled</span>';

      // Active scripts
      var activeScripts = scripts.filter(function (s) {
        var st = (s.script_status || '').toLowerCase();
        return st !== 'archived' && st !== 'cancelled' && st !== 'fulfilled';
      });
      var lastScriptDate = scripts.length ? Math.max.apply(null, scripts.map(function (s) { return s.created_at || 0; })) : 0;
      var activeScriptsHtml = '<strong>' + activeScripts.length + '</strong> active' +
        (lastScriptDate ? '<br><span class="summary-sub">Last: ' + u.formatDate(lastScriptDate) + '</span>' : '');

      // Clinical notes
      var lastNoteDate = notes.length ? Math.max.apply(null, notes.map(function (n) { return n.created_at || 0; })) : 0;
      var notesHtml = '<strong>' + notes.length + '</strong> total' +
        (lastNoteDate ? '<br><span class="summary-sub">Last: ' + u.formatDate(lastNoteDate) + '</span>' : '');

      // Patient since (earliest appointment)
      var allTimes = appts.map(function (a) { return a.appointment_time || 0; }).filter(function (t) { return t > 0; });
      var firstVisit = allTimes.length ? Math.min.apply(null, allTimes) : 0;
      var sinceHtml = firstVisit ? u.formatDate(firstVisit) : '<span class="summary-sub">No visits yet</span>';

      container.innerHTML =
        '<div class="summary-tile"><div class="summary-label">Next Appointment</div><div class="summary-value">' + nextApptHtml + '</div></div>' +
        '<div class="summary-tile"><div class="summary-label">Scripts</div><div class="summary-value">' + activeScriptsHtml + '</div></div>' +
        '<div class="summary-tile"><div class="summary-label">Clinical Notes</div><div class="summary-value">' + notesHtml + '</div></div>' +
        '<div class="summary-tile"><div class="summary-label">Patient Since</div><div class="summary-value">' + sinceHtml + '</div></div>';
    }).catch(function () {
      container.innerHTML = '';
    });
  }

  // ── Patient Appointments ───────────────────────────────────

  function loadPatientAppointments(patientId) {
    var list = u.byId('patient-appointments-list');
    var empty = u.byId('patient-appointments-empty');
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    empty.classList.add('hidden');

    data.fetchAppointments({ patient_id: patientId, doctor_id: doctorId }).then(function (appts) {
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
      '<div class="record-card record-card-clickable appt-workspace-card" data-appt-id="' + appt.id + '" data-patient-id="' + appt.patient_id + '" style="cursor:pointer">' +
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
      cachedDoctorAppointments = appts || [];
      appts.sort(function (a, b) { return (b.appointment_time || 0) - (a.appointment_time || 0); });

      // Batch-fetch patient names for all appointments
      var patientIds = [];
      appts.forEach(function (a) {
        if (a.patient_id && !findPatient(a.patient_id)) patientIds.push(a.patient_id);
      });
      // Deduplicate
      patientIds = patientIds.filter(function (id, i) { return patientIds.indexOf(id) === i; });
      // Fetch missing patients in parallel (max 10 at a time)
      var fetchPromises = patientIds.slice(0, 20).map(function (pid) {
        return data.fetchPatientById(pid).then(function (p) {
          if (p) allPatients.push(p);
        }).catch(function () {});
      });
      Promise.all(fetchPromises).then(function () {
        // Re-render cards and calendar with resolved names
        renderDoctorAppointmentsList(appts, list, empty);
        if (appointmentsCalendarInstance) appointmentsCalendarInstance.refetchEvents();
      });

      // Initial render (may have "Patient #ID" until batch fetch completes)
      renderDoctorAppointmentsList(appts, list, empty);
    }).catch(function (err) {
      loading.classList.add('hidden');
      cachedDoctorAppointments = [];
      console.error('Failed to load doctor appointments:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load appointments</div>';
    });
  }

  function renderDoctorAppointmentsList(appts, list, empty) {
    // Filter out rescheduled, cancelled, no show — doctor doesn't need to see these
    var visible = appts.filter(function (a) {
      return APPT_HIDDEN_STATUSES.indexOf((a.status || '').toLowerCase()) === -1;
    });
    if (!visible.length) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    var now = Math.floor(Date.now() / 1000);
    var todayStart = getDayStart(now);
    var todayEnd = todayStart + 86400;
    var today = [], upcoming = [], past = [];
    visible.forEach(function (a) {
      var t = a.appointment_time || 0;
      if (t >= todayStart && t < todayEnd) today.push(a);
      else if (t >= todayEnd) upcoming.push(a);
      else past.push(a);
    });
    var html = '';
    if (today.length) html += '<h3 class="detail-heading" style="margin-bottom:10px">Today</h3>' + today.map(renderDoctorAppointmentCard).join('');
    if (upcoming.length) html += '<h3 class="detail-heading" style="margin:20px 0 10px">Upcoming</h3>' + upcoming.map(renderDoctorAppointmentCard).join('');
    if (past.length) html += '<h3 class="detail-heading" style="margin:20px 0 10px;color:var(--brand-text-muted)">Past</h3>' + past.map(renderDoctorAppointmentCard).join('');
    list.innerHTML = html;
  }

  function renderDoctorAppointmentCard(appt) {
    var dateStr = u.formatDate(appt.appointment_time);
    var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '';
    var chip = getStatusChip(appt.status || '');
    var patientName = getPatientName(appt.patient_id);
    var statusLower = (appt.status || '').toLowerCase();
    var canEdit = statusLower !== 'completed' && statusLower !== 'cancelled';

    return (
      '<div class="record-card record-card-clickable appt-workspace-card" data-appt-id="' + appt.id + '" data-patient-id="' + appt.patient_id + '" style="margin-bottom:8px;cursor:pointer">' +
        '<div class="record-card-header">' +
          '<span class="record-card-title">' + u.escapeHtml(patientName) + '</span>' +
          chip +
        '</div>' +
        '<div class="record-card-body">' +
          '<p>' + u.escapeHtml(appt.type || 'Appointment') + ' &middot; ' + dateStr + (timeStr ? ' at ' + timeStr : '') + '</p>' +
        '</div>' +
        (canEdit ? '<div class="appt-card-actions" onclick="event.stopPropagation()">' +
          '<button class="btn btn-sm btn-ghost btn-edit-appt" data-appt-id="' + appt.id + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger-ghost btn-cancel-appt" data-appt-id="' + appt.id + '">Cancel</button>' +
        '</div>' : '') +
      '</div>'
    );
  }

  function openEditAppointmentModal(appt) {
    var typeSelect = u.byId('edit-appt-type');
    var dateInput = u.byId('edit-appt-date');
    var statusSelect = u.byId('edit-appt-status');
    var idInput = u.byId('edit-appt-id');
    if (!typeSelect || !dateInput || !statusSelect || !idInput) return;

    idInput.value = String(appt.id);
    typeSelect.value = appt.type || 'Initial Consultation';

    // Convert unix timestamp to datetime-local format
    if (appt.appointment_time) {
      var d = new Date(parseInt(appt.appointment_time) * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      dateInput.value = d.toISOString().slice(0, 16);
    } else {
      dateInput.value = '';
    }

    statusSelect.value = appt.status || 'Booked';
    openModal('modal-edit-appointment');
  }

  function handleSaveAppointment() {
    var idInput = u.byId('edit-appt-id');
    var typeSelect = u.byId('edit-appt-type');
    var dateInput = u.byId('edit-appt-date');
    var statusSelect = u.byId('edit-appt-status');
    if (!idInput || !idInput.value) return;

    var apptId = Number(idInput.value);
    var updates = {};
    if (typeSelect) updates.type = typeSelect.value;
    if (statusSelect) updates.status = statusSelect.value;
    if (dateInput && dateInput.value) {
      updates.appointment_time = Math.floor(new Date(dateInput.value).getTime() / 1000);
    }

    var btn = u.byId('btn-save-edit-appt');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    data.updateAppointment(apptId, updates).then(function () {
      closeModal('modal-edit-appointment');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      u.showToast('Appointment updated', 'success');
      loadDoctorAppointments();
      loadTodaySchedule();
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      u.showToast('Failed to update appointment', 'error');
    });
  }

  // ── Today's Schedule ───────────────────────────────────────

  function loadTodaySchedule() {
    var list = u.byId('today-list');
    var empty = u.byId('today-empty');
    var dateEl = u.byId('today-date');
    if (!list) return;

    // Set today's date header
    var now = new Date();
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var nowUnix = Math.floor(Date.now() / 1000);
    var todayStart = getDayStart(nowUnix);
    var todayEnd = todayStart + 86400;

    var todayAppts = (cachedDoctorAppointments || []).filter(function (a) {
      var t = a.appointment_time || 0;
      var status = (a.status || '').toLowerCase();
      return t >= todayStart && t < todayEnd && APPT_HIDDEN_STATUSES.indexOf(status) === -1;
    });

    // Sort chronologically (earliest first)
    todayAppts.sort(function (a, b) { return (a.appointment_time || 0) - (b.appointment_time || 0); });

    if (!todayAppts.length) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    // Batch-fetch patient names
    var patientIds = [];
    todayAppts.forEach(function (a) { if (a.patient_id && patientIds.indexOf(a.patient_id) === -1) patientIds.push(a.patient_id); });
    var fetches = patientIds.filter(function (pid) { return !getPatientName(pid) || getPatientName(pid) === 'Patient #' + pid; }).map(function (pid) {
      return data.fetchPatientById(Number(pid)).then(function (p) {
        if (p && !allPatients.some(function (ap) { return ap.id == p.id; })) allPatients.push(p);
      }).catch(function () {});
    });

    Promise.all(fetches).then(function () {
      list.innerHTML = todayAppts.map(function (appt) {
        return renderTodayCard(appt, nowUnix);
      }).join('');
    });
  }

  function renderTodayCard(appt, nowUnix) {
    var timeStr = appt.appointment_time ? formatTime(appt.appointment_time) : '';
    var chip = getStatusChip(appt.status || '');
    var patientName = getPatientName(appt.patient_id);
    var isNext = appt.appointment_time && appt.appointment_time >= nowUnix;
    var nextClass = isNext ? ' today-card-next' : ' today-card-past';

    return (
      '<div class="today-card' + nextClass + ' appt-workspace-card" data-appt-id="' + appt.id + '" data-patient-id="' + appt.patient_id + '">' +
        '<div class="today-card-time">' + u.escapeHtml(timeStr) + '</div>' +
        '<div class="today-card-info">' +
          '<div class="today-card-patient">' + u.escapeHtml(patientName) + '</div>' +
          '<div class="today-card-type">' + u.escapeHtml(appt.type || 'Appointment') + '</div>' +
        '</div>' +
        '<div class="today-card-right">' +
          chip +
          '<button class="btn btn-sm btn-primary today-card-open">Open</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Clinical Notes ─────────────────────────────────────────

  // Cache for appointments loaded for timeline
  var cachedPatientAppointments = [];

  function loadPatientNotes(patientId) {
    _loadNotesTimeline(patientId, 'patient-notes-list', 'patient-notes-empty');
  }

  function _loadNotesTimeline(patientId, listId, emptyId) {
    var list = u.byId(listId);
    var empty = u.byId(emptyId);
    if (!list) return;
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading notes...</span></div>';
    if (empty) empty.classList.add('hidden');

    // Fetch notes, scripts, and ALL appointments (unscoped — need other doctors' appts for timeline context)
    Promise.all([
      data.fetchClinicalNotes(patientId),
      data.fetchScripts(patientId),
      data.fetchAppointments({ patient_id: patientId })
    ]).then(function (results) {
      var notes = results[0] || [];
      var scripts = results[1] || [];
      var appointments = results[2] || [];
      cachedPatientAppointments = appointments;

      if (!notes.length && !scripts.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      // Fetch doctor names for appointments (batch lookup unique doctor IDs)
      var doctorIds = [];
      appointments.forEach(function (a) {
        if (a.doctor_id && doctorIds.indexOf(a.doctor_id) === -1) doctorIds.push(a.doctor_id);
      });
      var doctorNameMap = {};
      var doctorFetches = doctorIds.map(function (did) {
        // Check allPatients first (the logged-in doctor may be there)
        var cached = allPatients.find(function (p) { return p.id == did; });
        if (cached) { doctorNameMap[did] = 'Dr. ' + ((cached.first_name || '') + ' ' + (cached.last_name || '')).trim(); return Promise.resolve(); }
        return data.fetchPatientById(Number(did)).then(function (doc) {
          if (doc) doctorNameMap[did] = 'Dr. ' + ((doc.first_name || '') + ' ' + (doc.last_name || '')).trim();
        }).catch(function () {});
      });
      Promise.all(doctorFetches).then(function () {
        _renderNotesTimeline(list, empty, notes, scripts, appointments, doctorNameMap);
      });
    }).catch(function (err) {
      console.error('Failed to load notes timeline:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load</div>';
    });
  }

  function _renderNotesTimeline(list, empty, notes, scripts, appointments, doctorNameMap) {
      // Group notes and scripts by appointment_id
      var notesByAppt = {};
      var scriptsByAppt = {};
      var orphanNotes = [];

      notes.forEach(function (n) {
        if (n.appointment_id) {
          if (!notesByAppt[n.appointment_id]) notesByAppt[n.appointment_id] = [];
          notesByAppt[n.appointment_id].push(n);
        } else {
          orphanNotes.push(n);
        }
      });

      scripts.forEach(function (s) {
        if (s.appointment_id) {
          if (!scriptsByAppt[s.appointment_id]) scriptsByAppt[s.appointment_id] = [];
          scriptsByAppt[s.appointment_id].push(s);
        }
      });

      // Build appointment lookup
      var apptMap = {};
      appointments.forEach(function (a) { apptMap[a.id] = a; });

      // Collect all appointment IDs that have notes or scripts
      var apptIds = {};
      Object.keys(notesByAppt).forEach(function (id) { apptIds[id] = true; });
      Object.keys(scriptsByAppt).forEach(function (id) { apptIds[id] = true; });

      // Sort by appointment time descending
      var sortedApptIds = Object.keys(apptIds).sort(function (a, b) {
        var apptA = apptMap[a];
        var apptB = apptMap[b];
        var timeA = apptA ? (apptA.appointment_time || apptA.created_at || 0) : 0;
        var timeB = apptB ? (apptB.appointment_time || apptB.created_at || 0) : 0;
        return timeB - timeA;
      });

      var html = '';

      // Render each appointment group
      sortedApptIds.forEach(function (apptId, idx) {
        var appt = apptMap[apptId];
        var apptNotes = notesByAppt[apptId] || [];
        var apptScripts = scriptsByAppt[apptId] || [];
        var isFirst = idx === 0;

        // Sort notes within group by date
        apptNotes.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });

        html += '<details class="timeline-group"' + (isFirst ? ' open' : '') + '>';
        html += '<summary class="timeline-marker">';
        html += '<div class="timeline-dot"></div>';
        html += '<div class="timeline-marker-content">';
        html += '<span class="timeline-date">' + (appt ? u.formatDate(appt.appointment_time) : 'Unknown date') + '</span>';
        html += '<span class="timeline-type">' + u.escapeHtml(appt ? (appt.type || 'Appointment') : 'Appointment #' + apptId) + '</span>';
        if (appt && appt.doctor_id && doctorNameMap[appt.doctor_id]) {
          html += '<span class="timeline-doctor">' + u.escapeHtml(doctorNameMap[appt.doctor_id]) + '</span>';
        }
        var noteCount = apptNotes.length;
        var scriptCount = apptScripts.length;
        html += '<span class="timeline-counts">' + noteCount + ' note' + (noteCount !== 1 ? 's' : '') + ', ' + scriptCount + ' script' + (scriptCount !== 1 ? 's' : '') + '</span>';
        html += '</div>';
        html += '</summary>';

        html += '<div class="timeline-content">';

        // Notes for this appointment
        apptNotes.forEach(function (note) {
          html += renderNoteCard(note);
        });

        // Scripts for this appointment
        if (apptScripts.length > 0) {
          html += '<div class="timeline-scripts">';
          html += '<div class="timeline-scripts-label">Scripts from this visit</div>';
          apptScripts.forEach(function (script) {
            html += renderTimelineScript(script);
          });
          html += '</div>';
        }

        html += '</div></details>';
      });

      // Orphan notes (no appointment)
      if (orphanNotes.length > 0) {
        orphanNotes.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
        html += '<details class="timeline-group" open>';
        html += '<summary class="timeline-marker">';
        html += '<div class="timeline-dot timeline-dot-muted"></div>';
        html += '<div class="timeline-marker-content">';
        html += '<span class="timeline-date">General Notes</span>';
        html += '<span class="timeline-type">Not linked to an appointment</span>';
        html += '</div></summary>';
        html += '<div class="timeline-content">';
        orphanNotes.forEach(function (note) {
          html += renderNoteCard(note);
        });
        html += '</div></details>';
      }

      list.innerHTML = html;
      if (empty) empty.classList.add('hidden');
  }

  function renderNoteCard(note) {
    return (
      '<div class="note-card">' +
        '<div class="note-card-header">' +
          '<span class="note-card-title">' + u.escapeHtml(note.title || 'Clinical Note') + '</span>' +
          '<span class="note-card-date">' + u.formatDate(note.created_at) + '</span>' +
        '</div>' +
        '<div class="note-card-body">' + (note.content || '<span class="text-muted">No content</span>') + '</div>' +
      '</div>'
    );
  }

  function renderTimelineScript(script) {
    var drug = itemsMap[script.drug_id];
    var drugName = drug ? drug.item_name : 'Unknown medication';
    var drugBrand = drug ? drug.brand : '';
    var chip = getScriptStatusChip(script.script_status || '');
    return (
      '<div class="timeline-script-card">' +
        '<div class="timeline-script-info">' +
          '<span class="timeline-script-name">' + u.escapeHtml(drugName) + '</span>' +
          (drugBrand ? '<span class="timeline-script-brand">' + u.escapeHtml(drugBrand) + '</span>' : '') +
        '</div>' +
        '<div class="timeline-script-meta">' +
          chip +
          '<span class="timeline-script-repeats">' + (script.remaining || 0) + '/' + (script.repeats || 0) + ' repeats</span>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Scripts ──────────────────────────────────────────────────

  function loadPatientScripts(patientId) {
    var list = u.byId('patient-scripts-list');
    var empty = u.byId('patient-scripts-empty');
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    if (empty) empty.classList.add('hidden');

    data.fetchScripts(patientId).then(function (scripts) {
      scripts.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
      if (!scripts.length) {
        list.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
      }
      if (empty) empty.classList.add('hidden');
      renderScriptsPanel(scripts, list);
    }).catch(function (err) {
      console.error('Failed to load scripts:', err);
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load scripts</div>';
    });
  }

  var OPEN_STATUSES = ['Open', 'To Be Processed', 'Draft', 'Stock Issue', 'External Processing'];

  function updateScriptTabCounts(contextEl) {
    var container = contextEl.closest('#patient-scripts-list') || contextEl.closest('#wp-scripts-list');
    if (!container) return;
    var openPanel = container.querySelector('[data-script-panel="open"]');
    var openCount = openPanel ? openPanel.querySelectorAll('.script-card').length : 0;
    var openTab = container.querySelector('[data-script-tab="open"]');
    if (openTab) openTab.textContent = 'Open (' + openCount + ')';
  }

  function isOpenScript(script) {
    return OPEN_STATUSES.indexOf(script.script_status) !== -1;
  }

  /**
   * Render a full scripts panel with Open/Past sub-tabs, actions, and bulk archive.
   * Used by both patient detail Scripts tab and workspace Scripts tab.
   */
  function renderScriptsPanel(scripts, container) {
    if (!container) return;
    var open = scripts.filter(isOpenScript);
    var past = scripts.filter(function (s) { return !isOpenScript(s); });

    var html = '';
    // Sub-tab bar + bulk archive button
    html += '<div class="scripts-tab-bar">';
    html += '<div class="scripts-sub-tabs">';
    html += '<button class="script-sub-tab active" data-script-tab="open">Open (' + open.length + ')</button>';
    html += '<button class="script-sub-tab" data-script-tab="past">Past (' + past.length + ')</button>';
    html += '</div>';
    html += '<div class="scripts-bulk-actions hidden">';
    html += '<button class="btn btn-sm btn-primary btn-bulk-represcribe">Re-prescribe Selected</button>';
    html += '<button class="btn btn-sm btn-ghost btn-bulk-archive">Archive Selected</button>';
    html += '</div>';
    html += '</div>';

    // Open scripts panel
    html += '<div class="script-tab-panel" data-script-panel="open">';
    if (open.length === 0) {
      html += '<div class="empty-state-sm">No open scripts</div>';
    } else {
      html += open.map(function (s) { return renderScriptCard(s, { showActions: true, showCheckbox: true }); }).join('');
    }
    html += '</div>';

    // Past scripts panel
    html += '<div class="script-tab-panel hidden" data-script-panel="past">';
    if (past.length === 0) {
      html += '<div class="empty-state-sm">No past scripts</div>';
    } else {
      html += past.map(function (s) { return renderScriptCard(s, { showActions: true, isPast: true }); }).join('');
    }
    html += '</div>';

    container.innerHTML = html;

    // Click delegation for expand/collapse details
    container.onclick = function (e) {
      if (e.target.closest('.btn-represcribe') || e.target.closest('.btn-archive-script') || e.target.closest('.script-select') || e.target.closest('.script-sub-tab') || e.target.closest('.btn-bulk-archive')) return;
      var card = e.target.closest('.script-card');
      if (!card || e.target.closest('a')) return;
      var details = card.querySelector('.script-details');
      if (details) {
        details.classList.toggle('hidden');
        card.classList.toggle('script-card-expanded');
      }
    };

    // Bind archive buttons directly (event delegation to document is unreliable here)
    container.querySelectorAll('.btn-archive-script').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var scriptId = btn.dataset.scriptId;
        var scriptName = btn.dataset.scriptName || 'this script';
        btn.disabled = true;
        btn.textContent = 'Archiving...';
        data.updateScript(scriptId, { status: 'Archived' }).then(function () {
          u.showToast('"' + scriptName + '" archived', 'success');
          var card = btn.closest('.script-card');
          if (card) card.remove();
          updateScriptTabCounts(btn);
        }).catch(function (err) {
          console.error('Failed to archive script:', err);
          u.showToast('Failed to archive script', 'error');
          btn.disabled = false;
          btn.textContent = 'Archive';
        });
      });
    });

    // Bind re-prescribe buttons directly
    container.querySelectorAll('.btn-represcribe').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var drugId = parseInt(btn.dataset.drugId);
        var item = enrichedItemsCache.find(function (i) { return i.id === drugId; }) || itemsMap[drugId];
        if (item) {
          requireAppointmentContext(item, null);
        } else {
          u.showToast('Product data not found', 'error');
        }
      });
    });
  }

  function renderScriptCard(script, opts) {
    opts = opts || {};
    var drug = itemsMap[script.drug_id] || enrichedItemsCache.find(function (i) { return i.id === script.drug_id; });
    var drugName = drug ? drug.item_name : 'Unknown medication';
    var drugBrand = drug ? drug.brand : '';
    var drugType = drug ? drug.type : '';
    var drugImage = drug ? drug.item_image : '';
    var thc = drug ? drug.thc : null;
    var cbd = drug ? drug.cbd : null;
    var price = drug ? drug.retail_price : null;
    var chip = getScriptStatusChip(script.script_status || '');

    var imgHtml = '';
    if (drugImage) {
      imgHtml = '<img class="script-card-img" src="' + u.escapeHtml(drugImage) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    } else {
      imgHtml = '<div class="script-card-img script-card-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>';
    }

    var validUntilStr = '';
    if (script.valid_until) {
      var vd = new Date(script.valid_until * 1000);
      validUntilStr = isNaN(vd.getTime()) ? '' : vd.toLocaleDateString('en-AU');
    }

    var html = '<div class="script-card" data-script-id="' + script.id + '" data-drug-id="' + (script.drug_id || '') + '" style="cursor:pointer">';
    html += '<div class="script-card-summary">';

    // Checkbox for bulk select (open scripts only)
    if (opts.showCheckbox) {
      html += '<input type="checkbox" class="script-select" data-script-id="' + script.id + '" onclick="event.stopPropagation()">';
    }

    html += imgHtml;
    html += '<div class="script-card-info">';
    html += '<div class="script-card-name">' + u.escapeHtml(drugName) + '</div>';
    html += '<div class="script-card-meta">';
    if (drugBrand) html += '<span>' + u.escapeHtml(drugBrand) + '</span>';
    if (drugType) html += '<span class="chip chip-type chip-sm">' + u.escapeHtml(drugType) + '</span>';
    html += '<span>Repeats: ' + (script.remaining != null ? script.remaining : '?') + '/' + (script.repeats || 0) + '</span>';
    html += '<span>' + u.formatDate(script.created_at) + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="script-card-status">' + chip + '</div>';

    // Action buttons
    if (opts.showActions) {
      html += '<div class="script-card-actions">';
      html += '<button class="btn btn-sm btn-primary btn-represcribe" data-drug-id="' + (script.drug_id || '') + '" data-script-id="' + script.id + '">Re-prescribe</button>';
      if (!opts.isPast) {
        html += '<button class="btn btn-sm btn-ghost btn-archive-script" data-script-id="' + script.id + '" data-script-name="' + u.escapeHtml(drugName) + '">Archive</button>';
      }
      html += '</div>';
    }

    html += '</div>';

    // Detail section (hidden by default)
    html += '<div class="script-details hidden">';
    html += '<div class="script-details-grid">';
    if (thc != null && parseFloat(thc) > 0) html += detailRow('THC', thc + (drugType === 'Flower' ? '%' : ''));
    if (cbd != null && parseFloat(cbd) > 0) html += detailRow('CBD', cbd + (drugType === 'Flower' ? '%' : ''));
    if (script.dosage_instructions) html += detailRow('Dosage', script.dosage_instructions);
    if (script.condition) html += detailRow('Condition', script.condition);
    if (validUntilStr) html += detailRow('Valid Until', validUntilStr);
    if (script.interval_days) html += detailRow('Interval', script.interval_days + ' day' + (script.interval_days > 1 ? 's' : '') + ' between dispenses');
    if (script.supply_limit) html += detailRow('Supply Limit', script.supply_limit);
    if (price) html += detailRow('Price', '$' + parseFloat(price).toFixed(2));
    if (drug && drug.dosage_form) html += detailRow('Form', drug.dosage_form);
    html += '</div></div>';
    html += '</div>';
    return html;
  }

  function detailRow(label, value) {
    return '<div class="script-detail-row"><span class="script-detail-label">' + u.escapeHtml(label) + '</span><span class="script-detail-value">' + u.escapeHtml(String(value)) + '</span></div>';
  }

  // ── Clinical Note Creation ───────────────────────────────────

  function openAddNoteModal() {
    if (!currentPatientId) { u.showToast('Select a patient first', 'error'); return; }
    u.byId('note-patient-id').value = currentPatientId;
    u.byId('note-title').value = '';
    u.byId('note-content').value = '';

    // Populate appointment dropdown with this patient's appointments
    var apptSelect = u.byId('note-appointment');
    if (apptSelect) {
      apptSelect.innerHTML = '<option value="">None (standalone note)</option>';
      var appts = cachedPatientAppointments || [];
      appts.sort(function (a, b) { return (b.appointment_time || 0) - (a.appointment_time || 0); });
      appts.forEach(function (a) {
        var label = u.formatDate(a.appointment_time) + ' — ' + (a.type || 'Appointment');
        apptSelect.innerHTML += '<option value="' + a.id + '">' + u.escapeHtml(label) + '</option>';
      });
    }

    // Auto-set title from note type
    var noteType = u.byId('note-type');
    var noteTitle = u.byId('note-title');
    if (noteType && noteTitle) {
      noteTitle.value = noteType.value;
      noteType.addEventListener('change', function () {
        if (!noteTitle.dataset.userEdited) noteTitle.value = noteType.value;
      });
      noteTitle.addEventListener('input', function () { noteTitle.dataset.userEdited = '1'; });
    }

    openModal('modal-add-note');
  }

  function handleCreateNote(e) {
    e.preventDefault();
    var patientId = u.byId('note-patient-id').value;
    var title = u.byId('note-title').value.trim();
    var content = u.byId('note-content').value.trim();
    var appointmentId = u.byId('note-appointment').value;

    if (!title || !content) {
      u.showToast('Title and content are required', 'error');
      return;
    }

    var btnSubmit = u.byId('btn-submit-note');
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Saving...'; }

    data.createClinicalNote({
      title: title,
      content: content,
      author_id: doctorId,
      patient_id: patientId,
      appointment_id: appointmentId || null
    }).then(function () {
      u.showToast('Clinical note saved', 'success');
      closeModal('modal-add-note');
      loadPatientNotes(Number(patientId));
    }).catch(function (err) {
      console.error('Failed to create note:', err);
      u.showToast('Failed to save note: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Save Note'; }
    });
  }

  // ── Item Detail Page ─────────────────────────────────────────

  var itemDetailPreviousView = null;

  // Ontraport option ID → label maps for Item list fields
  var CONDITIONS_LABELS = {
    '470':'Depression','472':"Parkinson's Disease",'476':'Seizure Management',
    '483':'Neuropathic Pain','484':'Autism Spectrum Disorder','485':'Multiple Sclerosis',
    '489':'Insomnia','490':'Inflammation','497':'Chronic Non-Cancer Pain',
    '498':'Cancer symptom management','499':'Fibromyalgia','500':'Endometriosis',
    '501':'Arthritis / Osteoarthritis','502':'Anxiety','550':'Palliative Care',
    '551':'Chemo-Induced Nausea','552':'Loss of Appetite','553':'Headaches',
    '554':'Migraines','555':'PTSD','556':'ADHD','557':"Crohn's / IBD / IBS",
    '558':'Chronic Illness','559':'Glaucoma','784':"Alzheimer's Disease",
    '785':'Anorexia','786':'Cachexia','787':'Dementia','788':'Mood Disorder',
    '789':'Spasticity','790':'Spasticity Pain','791':'Wasting'
  };
  var BENEFITS_LABELS = {
    '373':'Skin-Protective','374':'Sedative','375':'Neuroprotective',
    '376':'Muscle Relaxant','377':'Mood-Elevating','378':'Memory Aid',
    '383':'Decongestant','387':'Anxiolytic','388':'Antiviral',
    '393':'Antifungal','394':'Antidepressant','395':'Anticonvulsant',
    '396':'Anticancer','397':'Antibacterial','398':'Anti-inflammatory','399':'Analgesic'
  };

  // Parse Ontraport list field format (star-separated option IDs) into label array
  function parseOptionIds(raw, labelMap) {
    if (!raw || typeof raw !== 'string') return [];
    var ids = raw.replace(/\*\/\*/g, ',').replace(/^\*|\*$/g, '').split(',').filter(Boolean);
    return ids.map(function (id) { return labelMap[id.trim()] || null; }).filter(Boolean);
  }

  function openItemDetailPage(itemId) {
    var item = enrichedItemsCache.find(function (i) { return i.id === itemId; }) || itemsMap[itemId];
    if (!item) { u.showToast('Product not found', 'error'); return; }

    // Remember current view for back button
    if (!u.byId('view-item-detail').classList.contains('hidden')) {
      // Already on item detail — just update (for similar product clicks)
    } else {
      itemDetailPreviousView = document.querySelector('.view:not(.hidden)');
    }

    showView('item-detail');

    var mainEl = u.byId('item-detail-main');
    var sidebarEl = u.byId('item-detail-sidebar');
    if (mainEl) mainEl.innerHTML = renderItemDetail(item);
    if (sidebarEl && similar) {
      var results = similar.findSimilar(item, enrichedItemsCache, 3);
      sidebarEl.innerHTML = renderItemSimilarSidebar(results);
    }

    window.scrollTo(0, 0);
  }

  function renderItemDetail(item) {
    var esc = u.escapeHtml;
    var html = '';

    // ── Header ──
    var imgHtml = item.item_image
      ? '<img class="item-detail-hero-img" src="' + esc(item.item_image) + '" alt="" onerror="this.style.display=\'none\'">'
      : '<div class="item-detail-hero-img item-detail-hero-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>';

    html += '<div class="item-detail-header">';
    html += imgHtml;
    html += '<div class="item-detail-header-info">';
    html += '<h2 class="item-detail-title">' + esc(item.item_name || '') + '</h2>';
    html += '<div class="item-detail-brand">' + esc(item.brand || '') + '</div>';
    html += '<div class="item-detail-tags">';
    if (item.type) html += '<span class="chip chip-type">' + esc(item.type) + '</span>';
    if (item.status) html += '<span class="chip ' + (item.status === 'In Stock' ? 'chip-type' : 'chip-danger') + '">' + esc(item.status) + '</span>';
    if (item.sub_type) html += '<span class="chip">' + esc(item.sub_type) + '</span>';
    if (item.organic === true || item.organic === 'Yes') html += '<span class="chip chip-safe">Organic</span>';
    html += '</div>';
    html += '<div class="item-detail-actions">';
    if (item.status === 'In Stock') {
      html += '<button class="btn btn-primary btn-prescribe-item" data-item-id="' + item.id + '">+ Prescribe This Product</button>';
    }
    if (item.link_to_catalyst_listing) {
      html += '<a href="' + esc(item.link_to_catalyst_listing) + '" target="_blank" rel="noopener" class="btn btn-catalyst">' +
        '<img src="https://catalyst.honahlee.com.au/favicon.ico" alt="" width="16" height="16" style="border-radius:3px" onerror="this.style.display=\'none\'"> View on Catalyst</a>';
    }
    html += '</div>';
    html += '</div></div>';

    // ── Cannabinoids ──
    html += '<div class="item-detail-section">';
    html += '<div class="item-detail-section-title">Cannabinoids</div>';
    html += '<div class="item-detail-bars">';
    html += cannabinoidBar('THC', item.thc, 30, '#7c3aed');
    html += cannabinoidBar('CBD', item.cbd, 300, '#f59e0b');
    if (parseFloat(item.cbg) > 0) html += cannabinoidBar('CBG', item.cbg, 10, '#10b981');
    if (parseFloat(item.cbn) > 0) html += cannabinoidBar('CBN', item.cbn, 5, '#6366f1');
    if (parseFloat(item.cbc) > 0) html += cannabinoidBar('CBC', item.cbc, 5, '#ec4899');
    html += '</div></div>';

    // ── Terpene Profile ──
    var terpenes = recommend.getTopTerpenes(item, 11);
    if (terpenes.length > 0) {
      var terpColors = ['#b45309','#65a30d','#0891b2','#7c3aed','#dc2626','#0d9488','#c026d3','#ea580c','#4f46e5','#15803d','#be185d'];
      var totalTerpene = recommend.getTotalTerpenePercent(item);
      html += '<div class="item-detail-section">';
      html += '<div class="item-detail-section-title">Terpene Profile <span class="terpene-total">' + totalTerpene.toFixed(2) + '% total</span></div>';
      html += '<div class="item-detail-bars">';
      terpenes.forEach(function (t, idx) {
        var maxVal = Math.max(2, terpenes[0].value * 1.2);
        var pct = Math.min(100, (t.value / maxVal) * 100);
        html += '<div class="detail-bar-row">';
        html += '<span class="detail-bar-label">' + esc(t.name) + '</span>';
        html += '<div class="detail-bar-track"><div class="detail-bar-fill" style="width:' + pct + '%;background:' + terpColors[idx % terpColors.length] + '"></div></div>';
        html += '<span class="detail-bar-value">' + t.value.toFixed(2) + '%</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // ── Overview ──
    html += '<div class="item-detail-section">';
    html += '<div class="item-detail-section-title">Overview</div>';
    html += '<div class="item-detail-grid">';
    if (item.dominance) html += dRow('Dominance', item.dominance);
    if (item.sativa_indica) html += dRow('Lineage', item.sativa_indica);
    if (item.chemovar) html += dRow('Cultivar', item.chemovar);
    if (item.cannabis_type) html += dRow('Cannabis Type', item.cannabis_type);
    if (item.tga_category) html += dRow('TGA Category', item.tga_category);
    if (item.tga_schedule) html += dRow('Schedule', item.tga_schedule);
    if (item.dosage_form) html += dRow('Dosage Form', item.dosage_form);
    if (item.origin_country) html += dRow('Origin', item.origin_country);
    html += '</div></div>';

    // ── Clinical ──
    var conditionLabels = parseOptionIds(item.conditions_options_as_text, CONDITIONS_LABELS);
    var benefitLabels = parseOptionIds(item.benefits_options_as_text, BENEFITS_LABELS);
    var hasClinical = conditionLabels.length > 0 || benefitLabels.length > 0 || item.dosage_instructions || parseFloat(item.paul_rating) > 0;
    if (hasClinical) {
      html += '<div class="item-detail-section">';
      html += '<div class="item-detail-section-title">Clinical</div>';
      if (conditionLabels.length > 0) {
        html += '<div class="item-detail-chips-row"><span class="item-detail-label">Conditions</span>';
        html += '<div class="item-detail-chips">' + conditionLabels.map(function (c) { return '<span class="chip chip-primary">' + esc(c) + '</span>'; }).join('') + '</div></div>';
      }
      if (benefitLabels.length > 0) {
        html += '<div class="item-detail-chips-row"><span class="item-detail-label">Benefits</span>';
        html += '<div class="item-detail-chips">' + benefitLabels.map(function (b) { return '<span class="chip chip-safe">' + esc(b) + '</span>'; }).join('') + '</div></div>';
      }
      html += '<div class="item-detail-grid">';
      if (item.dosage_instructions) html += dRow('Dosage', item.dosage_instructions);
      if (parseFloat(item.paul_rating) > 0) html += dRow('Paul Rating', Math.min(parseFloat(item.paul_rating), 5) + ' / 5');
      html += '</div></div>';
    }

    // ── Pricing & Details ──
    html += '<div class="item-detail-section">';
    html += '<div class="item-detail-section-title">Pricing & Details</div>';
    html += '<div class="item-detail-grid">';
    if (item.retail_price) html += dRow('Retail Price', '$' + parseFloat(item.retail_price).toFixed(2));
    if (item.pack_size) html += dRow('Pack Size', item.pack_size + (item.type === 'Flower' ? 'g' : item.type === 'Oil' ? 'mL' : ''));
    if (parseFloat(item.price_per_mg) > 0) {
      var ppm = parseFloat(item.price_per_mg);
      var ppmStr = ppm >= 0.01 ? ppm.toFixed(2) : ppm.toFixed(4);
      html += dRow('Price per mg', '$' + ppmStr);
    }
    if (item.strength_1) html += dRow('Strength', item.strength_1);
    if (item.expiry) {
      var expDate = new Date(parseInt(item.expiry) * 1000);
      if (!isNaN(expDate.getTime())) html += dRow('Expiry', expDate.toLocaleDateString('en-AU'));
    }
    html += '</div></div>';

    // ── Description ──
    if (item.description) {
      html += '<div class="item-detail-section">';
      html += '<div class="item-detail-section-title">Description</div>';
      html += '<div class="item-detail-description">' + esc(item.description) + '</div>';
      html += '</div>';
    }

    return html;
  }

  function cannabinoidBar(label, value, maxScale, color) {
    var v = parseFloat(value) || 0;
    var pct = Math.min(100, (v / maxScale) * 100);
    var display = v > 0 ? (v < 1 && label !== 'THC' ? v.toFixed(2) : v) : '<1';
    return '<div class="detail-bar-row">' +
      '<span class="detail-bar-label">' + label + '</span>' +
      '<div class="detail-bar-track"><div class="detail-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="detail-bar-value">' + display + (label === 'THC' || label === 'CBD' ? '' : '') + '</span>' +
      '</div>';
  }

  function dRow(label, value) {
    return '<div class="item-detail-row"><span class="item-detail-label">' + u.escapeHtml(label) + '</span><span class="item-detail-value">' + u.escapeHtml(String(value)) + '</span></div>';
  }

  function renderItemSimilarSidebar(results) {
    var html = '<div class="item-similar-title">Similar Products</div>';
    if (!results || results.length === 0) {
      html += '<div class="empty-state-sm">No similar products in stock.</div>';
      return html;
    }
    results.forEach(function (r) {
      var item = r.item;
      var ml = r.matchLabel;
      html += '<div class="item-similar-card" data-item-id="' + item.id + '" style="cursor:pointer">';
      if (item.item_image) {
        html += '<img class="item-similar-img" src="' + u.escapeHtml(item.item_image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
      }
      html += '<div class="item-similar-info">';
      html += '<div class="item-similar-name">' + u.escapeHtml(item.item_name || '') + '</div>';
      html += '<div class="item-similar-brand">' + u.escapeHtml(item.brand || '') + '</div>';
      html += '<div class="item-similar-meta">';
      html += '<span class="similar-match ' + ml.cls + '">' + r.score + '</span>';
      if (item.thc) html += '<span>THC ' + item.thc + '</span>';
      if (item.retail_price) html += '<span>$' + parseFloat(item.retail_price).toFixed(2) + '</span>';
      html += '</div>';
      html += '</div></div>';
    });
    return html;
  }

  // ── Appointment Workspace ────────────────────────────────────

  function openAppointmentWorkspace(appointmentId, patientId) {
    currentAppointmentId = appointmentId;
    currentPatientId = patientId;
    workspaceNoteId = null;
    currentPatientIntake = null;
    currentRecommendations = null;
    if (prescribe) prescribe.clearCart();
    // If there are pending prescribe items from the appointment picker, add them after clearing cart
    if (pendingPrescribeItem && prescribe) {
      var pendingItems = pendingPrescribeItem;
      pendingPrescribeItem = null;
      pendingItems.forEach(function (entry) { prescribe.addToCart(entry.item, entry.recommendation); });
      var names = pendingItems.map(function (e) { return e.item.item_name || 'Product'; });
      u.showToast('"' + names.join('", "') + '" added to prescription cart', 'success');
    }
    // Reset workspace patient tabs
    wpTabsLoaded = { appointments: false, notes: false, scripts: false };
    u.$$('.wp-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    u.$$('.wp-tab-panel').forEach(function (p) { p.classList.add('hidden'); });

    // Remember where we came from for the back button
    if (!u.byId('view-patient-detail').classList.contains('hidden')) {
      previousView = 'patient-detail';
    } else {
      previousView = 'appointments';
    }

    // Update back button label with patient name
    var btnBack = u.byId('btn-back-from-workspace');
    if (btnBack) {
      var backPatient = allPatients.find(function (p) { return p.id == patientId; });
      var firstName = backPatient && backPatient.first_name ? backPatient.first_name : '';
      btnBack.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>' +
        (firstName ? 'Back to ' + u.escapeHtml(firstName) + '\u2019s Record' : 'Back to Patient Record');
    }

    showView('appointment-workspace');

    // Show loading in note area
    var noteContent = u.byId('workspace-note-content');
    var noteStatus = u.byId('workspace-note-status');
    var noteSaved = u.byId('workspace-note-saved');
    if (noteContent) { noteContent.innerHTML = ''; noteContent.contentEditable = 'false'; }
    if (noteStatus) { noteStatus.textContent = 'Loading...'; noteStatus.className = 'note-status-badge'; }
    if (noteSaved) noteSaved.textContent = '';

    // Load everything in parallel (include patient lookup if not cached)
    var cachedPatient = allPatients.find(function (p) { return p.id == patientId; });
    Promise.all([
      data.fetchAppointments({ patient_id: patientId, doctor_id: doctorId }),
      data.fetchPatientIntake(patientId),
      data.fetchClinicalNoteByAppointment(appointmentId),
      data.fetchScripts(patientId),
      cachedPatient ? Promise.resolve(cachedPatient) : data.fetchPatientById(patientId)
    ]).then(function (results) {
      var appointments = results[0] || [];
      var intakeRaw = results[1];
      var existingNote = results[2];
      var allScripts = results[3] || [];
      var patient = results[4] || {};

      // Find this appointment
      var appointment = appointments.find(function (a) { return a.id == appointmentId; });

      // Render header with full patient details
      renderWorkspaceHeader(appointment, patient);

      // Initialize video consultation panel
      // If returning to an appointment with an active call, reattach instead of reinitializing
      if (window.VideoConsultation) {
        var callInfo = window.VideoConsultation.getActiveCallInfo();
        if (callInfo && String(callInfo.appointmentId) === String(appointmentId)) {
          window.VideoConsultation.reattach();
        } else {
          window.VideoConsultation.initForAppointment(appointmentId);
        }
      }

      // Load note into editor (contenteditable div — preserves HTML)
      if (existingNote && existingNote.id) {
        workspaceNoteId = existingNote.id;
        if (noteContent) { noteContent.innerHTML = existingNote.content || ''; noteContent.contentEditable = 'true'; }
        if (noteStatus) { noteStatus.textContent = 'Saved'; noteStatus.className = 'note-status-badge note-status-saved'; }
        var savedTs = existingNote.last_modified || existingNote.created_at;
        if (noteSaved && savedTs) {
          var savedDate = new Date(parseInt(savedTs) * 1000);
          noteSaved.textContent = 'Last saved: ' + (isNaN(savedDate.getTime()) ? '' : savedDate.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
        }
      } else {
        workspaceNoteId = null;
        if (noteContent) {
          noteContent.innerHTML = '';
          noteContent.contentEditable = 'true';
          noteContent.focus();
        }
        if (noteStatus) { noteStatus.textContent = 'New'; noteStatus.className = 'note-status-badge note-status-new'; }
      }

      // Render editable intake (above prescribe)
      currentPatientIntake = mapContactToIntake(intakeRaw);
      // Set primary conditions for script creation default
      window._currentPatientConditions = (currentPatientIntake.primaryConditions || []).join(', ');
      var editableIntakeEl = u.byId('workspace-editable-intake');
      if (editableIntakeEl && prescribe) {
        prescribe.renderEditableIntake(editableIntakeEl, currentPatientIntake);
      }

      // Render full read-only intake (collapsible below)
      var intakeEl = u.byId('workspace-intake');
      if (intakeEl && prescribe) {
        prescribe.renderIntakeSummary(intakeEl, currentPatientIntake);
      }

      // Pre-cache product scores for this patient (runs in background)
      if (enrichedItemsCache.length > 0) cacheProductScores();

      // Render scripts for THIS appointment only
      var apptScripts = allScripts.filter(function (s) { return s.appointment_id == appointmentId; });
      renderWorkspaceScripts(apptScripts);

      // Render existing patient scripts (from other appointments) for re-prescribe
      var otherScripts = allScripts.filter(function (s) { return s.appointment_id != appointmentId; });
      renderExistingPatientScripts(otherScripts);

    }).catch(function (err) {
      console.error('Failed to load workspace:', err);
      u.showToast('Failed to load appointment workspace', 'error');
    });
  }

  function renderWorkspaceHeader(appointment, patient) {
    var header = u.byId('workspace-header');
    if (!header) return;
    var p = patient || {};
    var esc = u.escapeHtml;
    var patientName = ((p.first_name || p.firstname || '') + ' ' + (p.last_name || p.lastname || '')).trim() || 'Patient';
    var initials = ((p.first_name || p.firstname || '?')[0] + (p.last_name || p.lastname || '?')[0]).toUpperCase();
    var apptDate = appointment ? u.formatDate(appointment.appointment_time) : '';
    var apptType = appointment ? (appointment.type || 'Appointment') : 'Appointment';
    var statusChip = appointment ? getAppointmentStatusChip(appointment.status) : '';

    var metaItems = buildContactMeta(p);

    // Appointment time
    var apptTimeStr = '';
    if (appointment && appointment.appointment_time) {
      var apptDt = new Date(Number(appointment.appointment_time) * 1000);
      if (!isNaN(apptDt.getTime())) {
        apptTimeStr = apptDt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      }
    }

    // Context banner — appointment info above hero card
    var banner = u.byId('workspace-context-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'workspace-context-banner';
      banner.className = 'workspace-context-banner';
      header.parentNode.insertBefore(banner, header);
    }
    banner.innerHTML =
      '<div class="context-banner-left">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span class="context-banner-type">' + esc(apptType) + '</span>' +
        '<span class="context-banner-sep">&middot;</span>' +
        '<span class="context-banner-datetime">' + apptDate + (apptTimeStr ? ' at ' + apptTimeStr : '') + '</span>' +
      '</div>' +
      '<div class="context-banner-right">' + statusChip + '</div>';

    // Hero card — patient info only (appointment details are in banner above)
    header.className = 'patient-hero workspace-header';
    header.innerHTML =
      '<div class="hero-top">' +
        '<div class="hero-avatar">' + initials + '</div>' +
        '<div style="flex:1">' +
          '<div class="hero-name">' + esc(patientName) + '</div>' +
          '<div class="hero-meta">' + metaItems.join('') + '</div>' +
        '</div>' +
      '</div>';
  }

  // Appointment statuses to hide from doctor's view
  var APPT_HIDDEN_STATUSES = ['reschedule', 'rescheduled', 'cancelled', 'no show', 'no-show'];

  // Calendar event colors by status (matching Ontraport colors)
  var APPT_STATUS_COLORS = {
    'booked': '#f59e0b',             // orange/amber
    'paid': '#06b6d4',               // cyan/teal
    'payment processing': '#8b5cf6', // purple
    'script added': '#9ca3af',       // gray
    'completed': '#1f2937',          // dark/black
    'cancelled': '#ef4444',          // red
    'reschedule': '#eab308'          // yellow
  };

  function getAppointmentStatusChip(status) {
    if (!status) return '';
    var s = (status || '').toLowerCase().trim();
    var cls = 'chip-default';
    if (s === 'completed') cls = 'chip-completed';
    else if (s === 'paid') cls = 'chip-paid';
    else if (s === 'payment processing') cls = 'chip-payment-processing';
    else if (s === 'booked') cls = 'chip-booked';
    else if (s === 'script added') cls = 'chip-script-added';
    else if (s === 'cancelled') cls = 'chip-cancelled';
    else if (s === 'reschedule') cls = 'chip-reschedule';
    return '<span class="chip ' + cls + '">' + u.escapeHtml(status) + '</span>';
  }

  function renderWorkspaceScripts(scripts) {
    var container = u.byId('workspace-scripts');
    var empty = u.byId('workspace-scripts-empty');
    if (!container) return;

    if (!scripts || scripts.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }

    if (empty) empty.style.display = 'none';
    container.innerHTML = scripts.map(function (script) {
      var drug = itemsMap[script.drug_id] || enrichedItemsCache.find(function (i) { return i.id === script.drug_id; });
      var drugName = drug ? drug.item_name : 'Unknown medication';
      var drugBrand = drug ? drug.brand : '';
      var chip = getScriptStatusChip(script.script_status || '');
      var isDraft = (script.script_status || '').toLowerCase() === 'draft';
      var actions = '';
      if (isDraft) {
        actions =
          '<div class="script-draft-actions">' +
            '<button class="btn btn-sm btn-ghost btn-edit-script" data-script-id="' + script.id + '">Edit</button>' +
            '<button class="btn btn-sm btn-danger-ghost btn-delete-script" data-script-id="' + script.id + '" data-script-name="' + u.escapeHtml(drugName) + '">Delete</button>' +
          '</div>';
      }
      return (
        '<div class="record-card' + (isDraft ? ' record-card-draft' : '') + '">' +
          '<div class="record-card-header">' +
            '<span class="record-card-title">' + u.escapeHtml(drugName) +
              (drugBrand ? ' <span style="font-weight:400;color:var(--brand-text-muted)">(' + u.escapeHtml(drugBrand) + ')</span>' : '') +
            '</span>' + chip +
          '</div>' +
          '<div class="record-card-body">' +
            '<p>Repeats: ' + (script.repeats || 0) + ' &middot; Remaining: ' + (script.remaining || 0) + '</p>' +
          '</div>' +
          '<div class="record-card-footer">' +
            '<span>' + u.formatDate(script.created_at) + '</span>' +
            actions +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ── Workspace Patient Tab Loaders ──
  // These mirror loadPatientAppointments/Notes/Scripts but target the workspace panel containers.

  // Workspace patient tabs reuse the same rendering as patient detail
  function loadWpAppointments(patientId) {
    var list = u.byId('wp-appointments-list');
    var empty = u.byId('wp-appointments-empty');
    if (!list) return;
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    if (empty) empty.classList.add('hidden');
    data.fetchAppointments({ patient_id: patientId, doctor_id: doctorId }).then(function (appts) {
      appts.sort(function (a, b) { return (b.appointment_time || 0) - (a.appointment_time || 0); });
      if (!appts.length) { list.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
      list.innerHTML = appts.map(function (appt) {
        var card = renderAppointmentCard(appt);
        if (appt.id == currentAppointmentId) {
          card = card.replace('class="record-card', 'class="record-card record-card-current');
        }
        return card;
      }).join('');
    }).catch(function () {
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load</div>';
    });
  }

  function loadWpNotes(patientId) {
    _loadNotesTimeline(patientId, 'wp-notes-list', 'wp-notes-empty');
  }

  function loadWpScripts(patientId) {
    var list = u.byId('wp-scripts-list');
    var empty = u.byId('wp-scripts-empty');
    if (!list) return;
    list.innerHTML = '<div class="loading-inline"><div class="loading-spinner loading-spinner-sm"></div><span>Loading...</span></div>';
    if (empty) empty.classList.add('hidden');
    data.fetchScripts(patientId).then(function (scripts) {
      scripts.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
      if (!scripts.length) { list.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
      if (empty) empty.classList.add('hidden');
      renderScriptsPanel(scripts, list);
    }).catch(function () {
      list.innerHTML = '<div class="empty-state-sm" style="color:var(--brand-error)">Failed to load</div>';
    });
  }

  function reloadWorkspaceScripts(expectedMinCount, retries) {
    if (!currentPatientId) return;
    retries = retries || 0;
    data.fetchScripts(currentPatientId).then(function (allScripts) {
      var apptScripts = (allScripts || []).filter(function (s) { return s.appointment_id == currentAppointmentId; });

      // Ontraport API has eventual consistency — retry if we don't see the expected scripts yet
      if (expectedMinCount && apptScripts.length < expectedMinCount && retries < 3) {
        setTimeout(function () { reloadWorkspaceScripts(expectedMinCount, retries + 1); }, 2000);
        return;
      }

      renderWorkspaceScripts(apptScripts);
      var otherScripts = (allScripts || []).filter(function (s) { return s.appointment_id != currentAppointmentId; });
      renderExistingPatientScripts(otherScripts);
    });
  }

  function openEditScriptModal(scriptId) {
    data.fetchScripts(currentPatientId).then(function (allScripts) {
      var script = allScripts.find(function (s) { return s.id == scriptId; });
      if (!script) { u.showToast('Script not found', 'error'); return; }

      var drug = itemsMap[script.drug_id] || enrichedItemsCache.find(function (i) { return i.id === script.drug_id; });

      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'modal-edit-script';
      overlay.innerHTML =
        '<div class="modal modal-wide">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title">Edit Script</h2>' +
            '<button class="modal-close" id="close-edit-script">&times;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            prescribe.renderEditScriptModal(script, drug) +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn btn-secondary" id="cancel-edit-script">Cancel</button>' +
            '<button class="btn btn-primary" id="save-edit-script">Save Changes</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      function closeModal() { overlay.remove(); }
      overlay.querySelector('#close-edit-script').addEventListener('click', closeModal);
      overlay.querySelector('#cancel-edit-script').addEventListener('click', closeModal);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

      overlay.querySelector('#save-edit-script').addEventListener('click', function () {
        var btn = this;
        btn.disabled = true;
        btn.textContent = 'Saving...';
        // Capture values before modal is removed
        var newRepeats = parseInt(u.byId('edit-script-repeats').value) || 3;
        var payload = {
          repeats: newRepeats,
          interval_days: parseInt(u.byId('edit-script-interval').value) || 7,
          dispense_qty: parseInt(u.byId('edit-script-dispense-qty').value) || 1,
          dosage_instructions: u.byId('edit-script-dosage').value,
          condition: u.byId('edit-script-condition').value,
          doctor_notes_pharmacy: u.byId('edit-script-pharmacy-notes').value,
          valid_until: u.byId('edit-script-valid-until').value
        };
        data.updateScript(scriptId, payload).then(function () {
          u.showToast('Script updated', 'success');
          closeModal();
          // Update card in DOM immediately
          var card = document.querySelector('.btn-edit-script[data-script-id="' + scriptId + '"]');
          if (card) {
            var cardEl = card.closest('.record-card');
            var body = cardEl ? cardEl.querySelector('.record-card-body p') : null;
            if (body) {
              body.textContent = 'Repeats: ' + newRepeats + ' \u00b7 Remaining: ' + newRepeats;
            }
          }
        }).catch(function (err) {
          console.error('Failed to update script:', err);
          u.showToast('Failed to update script', 'error');
          btn.disabled = false;
          btn.textContent = 'Save Changes';
        });
      });
    });
  }

  function renderExistingPatientScripts(scripts) {
    var container = u.byId('workspace-existing-scripts');
    var empty = u.byId('workspace-existing-scripts-empty');
    if (!container) return;

    if (!scripts || scripts.length === 0) {
      container.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    // Group by status: active first, then past
    var active = scripts.filter(function (s) {
      return s.script_status && ['Open', 'To Be Processed', 'Draft'].indexOf(s.script_status) !== -1;
    });
    var past = scripts.filter(function (s) {
      return !s.script_status || ['Open', 'To Be Processed', 'Draft'].indexOf(s.script_status) === -1;
    });

    function renderRow(script) {
      var drug = itemsMap[script.drug_id] || enrichedItemsCache.find(function (i) { return i.id === script.drug_id; });
      var drugName = drug ? drug.item_name : 'Unknown medication';
      var drugBrand = drug ? drug.brand : '';
      var drugType = drug ? drug.type : '';
      var drugImage = drug && drug.item_image ? '<img class="script-card-img" src="' + u.escapeHtml(drug.item_image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '';
      var chip = getScriptStatusChip(script.script_status || '');

      return (
        '<div class="existing-script-row">' +
          (drugImage || '') +
          '<div class="existing-script-info">' +
            '<div class="existing-script-name">' + u.escapeHtml(drugName) + '</div>' +
            '<div class="existing-script-meta">' +
              (drugBrand ? '<span>' + u.escapeHtml(drugBrand) + '</span>' : '') +
              (drugType ? '<span class="chip chip-type chip-sm">' + u.escapeHtml(drugType) + '</span>' : '') +
              '<span>Repeats: ' + (script.remaining != null ? script.remaining : '?') + '/' + (script.repeats || 0) + '</span>' +
              '<span>' + u.formatDate(script.created_at) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="existing-script-actions">' +
            chip +
            '<button class="btn btn-sm btn-primary btn-represcribe" data-drug-id="' + script.drug_id + '" data-script-id="' + script.id + '">Re-prescribe</button>' +
          '</div>' +
        '</div>'
      );
    }

    var html = '';
    if (active.length) {
      html += '<div class="existing-scripts-group-label">Active</div>';
      html += active.map(renderRow).join('');
    }
    if (past.length) {
      html += '<div class="existing-scripts-group-label" style="margin-top:12px">Past</div>';
      html += past.map(renderRow).join('');
    }
    container.innerHTML = html;
  }

  function saveEditableIntake() {
    if (!currentPatientId || !prescribe) return;
    var edited = prescribe.collectEditableIntake();
    var statusEl = u.byId('workspace-intake-status');

    // Build Ontraport field payload using field IDs (writes still go through Ontraport API)
    var payload = {};
    // Conditions: set each boolean field using Ontraport field IDs
    for (var condName in CONDITION_FIELD_IDS) {
      var isChecked = edited.primaryConditions.indexOf(condName) !== -1;
      payload[CONDITION_FIELD_IDS[condName]] = isChecked ? '1' : '0';
    }
    // Experience level + preferences (using Ontraport field IDs)
    payload[INTAKE_FIELD_IDS.experienceLevel] = edited.experienceLevel;
    payload[INTAKE_FIELD_IDS.thcComfort] = COMFORT_TO_PRODUCT_PREF[edited.thcComfort] || edited.thcComfort;
    payload[INTAKE_FIELD_IDS.budgetRange] = edited.budgetRange;
    // Medications + allergies
    payload[INTAKE_FIELD_IDS.medications] = edited.medications;
    payload[INTAKE_FIELD_IDS.allergies] = edited.allergies;

    if (statusEl) statusEl.textContent = 'Saving...';

    data.updatePatientIntake(currentPatientId, payload).then(function () {
      // Update local state so recommendations use the new values
      currentPatientIntake = Object.assign(currentPatientIntake || {}, edited);
      scoreCacheReady = false; // Invalidate score cache — will re-score on next search
      if (statusEl) statusEl.textContent = 'Saved';
      setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 2000);
      // Re-score if prescribe section is open
      var ps = u.byId('workspace-prescribe-section');
      if (ps && ps.open) { setTimeout(cacheProductScores, 500); }
    }).catch(function (err) {
      console.error('Failed to save intake:', err);
      if (statusEl) statusEl.textContent = 'Save failed';
    });
  }

  var _noteSaveInProgress = false;
  function saveWorkspaceNote() {
    var noteContent = u.byId('workspace-note-content');
    var content = noteContent ? noteContent.innerHTML.trim() : '';
    if (!content || content === '<br>') return; // silently skip empty on blur
    if (_noteSaveInProgress) return; // prevent duplicate creates
    _noteSaveInProgress = true;

    var noteStatus = u.byId('workspace-note-status');
    var noteSaved = u.byId('workspace-note-saved');
    if (noteStatus) { noteStatus.textContent = 'Saving...'; noteStatus.className = 'note-status-badge'; }

    // Find appointment details for auto-title
    var appointment = cachedPatientAppointments.find(function (a) { return a.id == currentAppointmentId; });
    var autoTitle = (appointment ? (appointment.type || 'Note') : 'Clinical Note') + ' \u2014 ' + new Date().toLocaleDateString('en-AU');

    var promise;
    if (workspaceNoteId) {
      // Update existing
      promise = data.updateClinicalNote(workspaceNoteId, { content: content });
    } else {
      // Create new
      promise = data.createClinicalNote({
        title: autoTitle,
        content: content,
        author_id: doctorId,
        patient_id: currentPatientId,
        appointment_id: currentAppointmentId
      }).then(function (result) {
        // Capture the new note ID so subsequent saves update instead of creating duplicates
        if (result && result.id) workspaceNoteId = result.id;
        else if (result && result.attrs && result.attrs.id) workspaceNoteId = result.attrs.id;
        return result;
      });
    }

    promise.then(function () {
      if (noteStatus) { noteStatus.textContent = 'Saved'; noteStatus.className = 'note-status-badge note-status-saved'; }
      if (noteSaved) noteSaved.textContent = 'Saved just now';
      u.showToast('Note saved', 'success');
    }).catch(function (err) {
      console.error('Failed to save note:', err);
      if (noteStatus) { noteStatus.textContent = 'Error'; noteStatus.className = 'note-status-badge chip-danger'; }
    }).finally(function () {
      _noteSaveInProgress = false;
    });
  }

  // ── Generate Clinical Note (LLM-aggregated) ──────────────────

  var EXP_LABELS = { 1: 'Naive', 2: 'Beginner', 3: 'Moderate', 4: 'Experienced', 5: 'Expert' };

  function handleGenerateClinicalNote() {
    var btn = u.byId('btn-generate-clinical-note');
    if (!btn) return;

    var scriptCards = u.$$('#workspace-scripts .record-card');
    if (scriptCards.length === 0) {
      u.showToast('No scripts created yet. Add scripts first, then generate the note.', 'error');
      return;
    }

    var intake = currentPatientIntake || {};
    var recs = currentRecommendations || [];
    var SD = window.ScienceData;

    // ── Patient summary ──
    var conditions = intake.conditions || intake.primaryConditions || [];
    var expLevel = parseInt(intake.experienceLevel || intake.experience_level) || 3;
    var expLabel = EXP_LABELS[expLevel] || 'Moderate';
    var medications = intake.medications || 'None reported';
    var patient = allPatients.find(function (p) { return p.id == currentPatientId; }) || {};
    var patientName = ((patient.first_name || '') + ' ' + (patient.last_name || '')).trim() || 'Patient';
    var patientAge = patient.age || '';
    var patientSex = patient.sex || '';

    var severity = intake.severity || '';
    var duration = intake.conditionDuration || intake.duration || '';
    var allergies = intake.allergies || '';
    var previousResponse = intake.previousResponse || '';
    var drivesRegularly = intake.drivesRegularly || '';
    var psychiatricHistory = (intake.psychiatricHistory || []).join(', ');
    var substanceUse = intake.substanceUse || intake.cannabisUse || '';
    var lineagePref = intake.lineagePreference || '';
    var budgetRange = intake.budgetRange || intake.budget || '';

    var patientSummary = patientName +
      (patientAge ? ', Age ' + patientAge : '') +
      (patientSex ? ', ' + patientSex : '') +
      '\nConditions: ' + (conditions.length > 0 ? conditions.join(', ') : 'Not specified') +
      (severity ? '\nCurrent Severity: ' + severity + '/10' : '') +
      (duration ? '\nDuration: ' + duration : '') +
      '\nExperience Level: Level ' + expLevel + ' \u2014 ' + expLabel +
      (previousResponse ? '\nPrevious Cannabis Response: ' + previousResponse : '') +
      '\nMedications: ' + medications +
      (allergies ? '\nAllergies: ' + allergies : '') +
      (psychiatricHistory ? '\nPsychiatric History: ' + psychiatricHistory : '') +
      (drivesRegularly && drivesRegularly !== 'No' ? '\nDrives Regularly: ' + drivesRegularly : '') +
      (substanceUse ? '\nSubstance Use: ' + substanceUse : '');

    // ── Clinician notes (what the doctor already typed) ──
    var noteEditor = u.byId('workspace-note-content');
    var clinicianNotes = '';
    if (noteEditor) {
      // Strip HTML tags to get plain text, skip any previously generated scripts section
      var temp = document.createElement('div');
      temp.innerHTML = noteEditor.innerHTML;
      // Remove any existing generated Scripts section
      var scriptsH4 = temp.querySelector('h4');
      if (scriptsH4) {
        var removeFrom = scriptsH4.previousElementSibling; // the <hr> before it
        if (removeFrom && removeFrom.tagName === 'HR') removeFrom.remove();
        while (scriptsH4.nextSibling) scriptsH4.nextSibling.remove();
        scriptsH4.remove();
      }
      clinicianNotes = (temp.textContent || temp.innerText || '').trim();
    }

    // ── Previous prescription history (from other appointments) ──
    var priorScriptsContext = '';
    var existingScriptRows = u.$$('#workspace-existing-scripts .existing-script-row');
    if (existingScriptRows.length > 0) {
      var priorLines = [];
      existingScriptRows.forEach(function (row) {
        var nameEl = row.querySelector('.existing-script-name');
        var metaEl = row.querySelector('.existing-script-meta');
        if (nameEl) {
          var line = nameEl.textContent.trim();
          if (metaEl) line += ' (' + metaEl.textContent.trim().replace(/\s+/g, ' ') + ')';
          priorLines.push(line);
        }
      });
      if (priorLines.length > 0) {
        priorScriptsContext = 'This patient has ' + priorLines.length + ' prior script(s) from previous appointments:\n' + priorLines.join('\n');
      }
    }

    // ── Products + evidence ──
    var productsContext = [];
    var allCondRefs = {};
    var relevantCompounds = {};

    scriptCards.forEach(function (card) {
      var titleEl = card.querySelector('.record-card-title');
      if (!titleEl) return;
      var fullText = titleEl.textContent.trim();
      var matchedItem = null;
      for (var i = 0; i < enrichedItemsCache.length; i++) {
        if (fullText.indexOf(enrichedItemsCache[i].item_name) !== -1) {
          matchedItem = enrichedItemsCache[i];
          break;
        }
      }
      if (!matchedItem) return;

      var topTerps = recommend ? recommend.getTopTerpenes(matchedItem, 3) : [];
      var totalTerp = recommend ? recommend.getTotalTerpenePercent(matchedItem) : 0;
      var terpStr = topTerps.map(function (t) { return t.name + ' (' + t.value.toFixed(1) + '%)'; }).join(', ');

      // Track which compounds are relevant for evidence notes
      if (parseFloat(matchedItem.cbd) > 0) relevantCompounds['CBD'] = true;
      if (parseFloat(matchedItem.thc) > 0) relevantCompounds['THC / dronabinol / nabilone'] = true;
      if (parseFloat(matchedItem.thc) > 0 && parseFloat(matchedItem.cbd) > 0) relevantCompounds['THC:CBD combinations / nabiximols'] = true;
      topTerps.forEach(function (t) {
        var terpKey = t.name.replace('Beta-caryophyllene', 'beta-Caryophyllene')
                           .replace('Alpha-pinene', 'Pinene').replace('Beta-pinene', 'Pinene');
        if (SD.COMPOUND_EVIDENCE_NOTES && SD.COMPOUND_EVIDENCE_NOTES[terpKey]) relevantCompounds[terpKey] = true;
      });

      // Find matched conditions from recommendations
      var rec = null;
      for (var r = 0; r < recs.length; r++) {
        if (String(recs[r].id) === String(matchedItem.id)) { rec = recs[r]; break; }
      }
      if (rec && rec.matchedConditions) {
        rec.matchedConditions.forEach(function (mc) {
          if (SD && SD.CONDITION_REFERENCES && SD.CONDITION_REFERENCES[mc.condition]) {
            allCondRefs[mc.condition] = SD.CONDITION_REFERENCES[mc.condition];
          }
        });
      }

      productsContext.push(
        matchedItem.item_name + ' (' + (matchedItem.brand || '') + ') \u2014 ' + (matchedItem.type || '') +
        '\n  THC: ' + (matchedItem.thc || '0') + ', CBD: ' + (matchedItem.cbd || '0') +
        ', Total terpenes: ' + totalTerp.toFixed(1) + '%' +
        (terpStr ? '\n  Top terpenes: ' + terpStr : '')
      );
    });

    if (productsContext.length === 0) {
      u.showToast('Could not find product data for the scripts.', 'error');
      return;
    }

    // ── Build evidence library section ──
    var evidenceLines = [];
    for (var condName in allCondRefs) {
      evidenceLines.push('Condition \u2014 ' + condName + ': ' + allCondRefs[condName]);
    }
    if (SD && SD.COMPOUND_EVIDENCE_NOTES) {
      for (var compound in relevantCompounds) {
        if (SD.COMPOUND_EVIDENCE_NOTES[compound]) {
          evidenceLines.push('Compound \u2014 ' + compound + ': ' + SD.COMPOUND_EVIDENCE_NOTES[compound]);
        }
      }
    }

    // ── Assemble full prompt ──
    var prompt =
      '## Clinical note prompt \u2014 governed by evidence library\n\n' +
      'You are a clinical documentation assistant for an Australian medicinal cannabis clinic.\n\n' +
      'Write a brief prescribing-rationale note for the medical record. This note is governed by the clinic\'s evidence library and supplements, but does not replace, the full consultation note, intake form, clinician assessment, consent documentation, approval pathway documentation, and dosing instructions recorded elsewhere.\n\n' +
      'Use the patient data, clinician notes, prescribed products, and evidence library entries provided. Use only the supplied information. Do not invent history, treatment failures, contraindications, approvals, consent, dosing, or evidence.\n\n' +
      '### Output requirements\n\n' +
      'Return plain text only, with these 5 labelled sections in this exact order:\n\n' +
      '1. Patient Presentation\n2. Clinical Reasoning\n3. Prescribed Products\n4. Evidence Base\n5. Monitoring Plan\n\n' +
      '### Style rules\n\n' +
      '- Write as one cohesive clinical note, not separate per-product paragraphs.\n' +
      '- Keep it concise, professional, and suitable for Australian medical records.\n' +
      '- Target approximately 90\u2013140 words total.\n' +
      '- Use plain text only. No markdown, bullet points, numbering, or headings beyond the required section labels.\n' +
      '- Use conservative, clinically neutral language.\n' +
      '- Do not use marketing language.\n' +
      '- Do not overstate efficacy.\n' +
      '- Do not claim terpene effects as established unless they are explicitly supported in the supplied evidence library.\n' +
      '- Do not use the phrase "entourage effect" unless it appears in the supplied evidence library and is directly relevant.\n' +
      '- Prefer cannabinoid-based rationale over terpene-based claims unless the evidence library clearly supports terpene relevance for the stated condition.\n' +
      '- Do not repeat the full patient context under each product.\n' +
      '- Do not restate the full medication list or demographics unless directly relevant to safety or prescribing.\n\n' +
      '### Content rules for each section\n\n' +
      '#### 1. Patient Presentation\n' +
      '- Write one sentence only.\n' +
      '- State the indication and relevant treatment context.\n' +
      '- Include only clinically relevant background from the intake form or doctor notes.\n\n' +
      '#### 2. Clinical Reasoning\n' +
      '- Write 1\u20132 sentences.\n' +
      '- Explain why the selected products were chosen as a group.\n' +
      '- Focus on cannabinoid profile, route of administration, onset/duration, intended role of each format, and how the regimen supports the patient\'s clinical needs.\n' +
      '- If prior conventional treatments are documented, you may briefly note that medicinal cannabis is being used after review of those options.\n' +
      '- If that information is not documented, do not invent it.\n\n' +
      '#### 3. Prescribed Products\n' +
      '- Write one compact sentence.\n' +
      '- List each prescribed product with its intended clinical role.\n' +
      '- Keep product-level rationale brief and practical.\n' +
      '- Do not repeat the same condition wording for each product.\n\n' +
      '#### 4. Evidence Base\n' +
      '- Write 1\u20132 sentences only.\n' +
      '- Use only the supplied evidence library references.\n' +
      '- Summarise the evidence cautiously and naturally, grouped by condition if more than one condition is present.\n' +
      '- Do not fabricate citations or mention studies not supplied.\n' +
      '- Do not imply that evidence is strong if the supplied evidence is limited or mixed.\n' +
      '- If the evidence library indicates limited evidence, say so clearly and conservatively.\n' +
      '- Always include specific author/year citations from the supplied evidence library.\n\n' +
      '#### 5. Monitoring Plan\n' +
      '- Write one sentence only.\n' +
      '- State what will be reviewed at follow-up, including efficacy, tolerability, adverse effects, and any relevant safety issues.\n' +
      '- If any prescribed product contains THC, include sedation/cognition and driving or machinery precautions.\n' +
      '- If the clinician notes include agreed goals, review interval, or stop criteria, reflect them briefly.\n' +
      '- If not documented, do not invent them.\n\n' +
      '### Evidence governance rules\n\n' +
      '- The evidence library is the only permitted source for clinical evidence statements in the note.\n' +
      '- If the evidence library does not support a claim, do not include that claim.\n' +
      '- If the evidence library and product data differ in strength or certainty, default to the more conservative wording.\n' +
      '- Never present preliminary, associative, or terpene-based findings as settled clinical fact.\n' +
      '- If evidence is condition-specific, only cite it against the relevant condition.\n\n' +
      '### Safety rules\n\n' +
      '- If THC is present in any product, include monitoring for psychoactive effects and driving/work safety.\n' +
      '- If a relevant interaction, psychiatric risk, substance use risk, or other safety issue is documented in the intake or doctor notes, incorporate it briefly into Clinical Reasoning or Monitoring Plan.\n' +
      '- If not documented, do not infer it.\n\n' +
      '### Input data\n\n' +
      'Patient:\n' + patientSummary + '\n\n' +
      (priorScriptsContext ? 'Previous prescription history:\n' + priorScriptsContext + '\n\n' : '') +
      'Clinician notes:\n' + (clinicianNotes || 'No clinician notes recorded yet.') + '\n\n' +
      'Scripts prescribed this visit:\n' + productsContext.join('\n\n') + '\n\n' +
      'Evidence library:\n' + (evidenceLines.length > 0 ? evidenceLines.join('\n') : 'No matching evidence library entries.') + '\n\n' +
      '### Final instruction\n\n' +
      'Generate the note now using only the supplied information and following all rules above.';

    // Show loading state
    btn.disabled = true;
    btn.textContent = 'Generating...';

    data.callGemini(prompt).then(function (generatedText) {
      if (noteEditor) {
        var existing = noteEditor.innerHTML || '';
        var htmlText = '<hr><h4>Scripts</h4>';
        generatedText.split('\n').forEach(function (line) {
          var trimmed = line.trim();
          if (trimmed) htmlText += '<p>' + u.escapeHtml(trimmed) + '</p>';
        });
        noteEditor.innerHTML = existing + htmlText;
        saveWorkspaceNote();
      }
      u.showToast('Clinical note generated', 'success');
    }).catch(function (err) {
      console.error('Failed to generate clinical note:', err);
      u.showToast('Failed to generate note: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Draft Note';
    });
  }

  // ── Transcript Summary (AI-extracted from video call) ──────────

  function generateTranscriptSummary(transcriptText) {
    if (!transcriptText || !transcriptText.trim()) return;

    var noteEditor = u.byId('workspace-note-content');
    if (!noteEditor) return;

    // Show loading indicator in the note editor
    var loadingEl = document.createElement('div');
    loadingEl.className = 'ai-loading';
    loadingEl.id = 'transcript-loading';
    loadingEl.textContent = 'Analysing consultation transcript...';
    noteEditor.appendChild(loadingEl);

    var prompt =
      'You are a clinical documentation assistant for an Australian medicinal cannabis clinic.\n\n' +
      'A telehealth video consultation has just concluded. Below is the live transcript.\n\n' +
      'Extract ONLY the clinically relevant information. Specifically identify:\n' +
      '- Chief complaint and symptoms discussed\n' +
      '- Clinical observations noted by the clinician\n' +
      '- Treatment decisions or changes discussed\n' +
      '- Patient-reported outcomes or responses to current treatment\n' +
      '- Any safety concerns, adverse effects, or contraindications mentioned\n' +
      '- Agreed next steps or follow-up plan\n\n' +
      'Do NOT include:\n' +
      '- Social pleasantries or small talk\n' +
      '- Repeated statements (summarise once)\n' +
      '- Administrative discussion (scheduling, payment)\n' +
      '- Any information not explicitly stated in the transcript\n\n' +
      'Write as concise clinical shorthand suitable for an Australian medical record. ' +
      'Use plain text, no markdown. Target 60\u2013100 words. Use conservative, clinically neutral language.\n\n' +
      'Transcript:\n' + transcriptText;

    data.callGemini(prompt).then(function (summaryText) {
      // Remove loading indicator
      var loading = u.byId('transcript-loading');
      if (loading) loading.remove();

      // Insert AI summary as an editable block
      var summaryHtml = '<div class="ai-transcript-summary">' +
        '<strong>Consultation Summary</strong><br>';
      summaryText.split('\n').forEach(function (line) {
        var trimmed = line.trim();
        if (trimmed) summaryHtml += '<p>' + u.escapeHtml(trimmed) + '</p>';
      });
      summaryHtml += '</div>';

      noteEditor.innerHTML = summaryHtml + (noteEditor.innerHTML || '');
      saveWorkspaceNote();
      u.showToast('Consultation summary added to note', 'success');
    }).catch(function (err) {
      console.error('Failed to generate transcript summary:', err);
      var loading = u.byId('transcript-loading');
      if (loading) loading.remove();
      u.showToast('Could not analyse transcript: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ── Complete Appointment ──────────────────────────────────────

  function handleCompleteAppointment() {
    var btn = u.byId('btn-complete-appointment');
    if (!btn) return;

    if (!currentAppointmentId) {
      u.showToast('No appointment context', 'error');
      return;
    }

    var intake = currentPatientIntake || {};
    var SD = window.ScienceData;
    var recs = currentRecommendations || [];

    // ── Gather all note content (doctor's notes + transcript summary) ──
    var noteEditor = u.byId('workspace-note-content');
    var existingNoteText = '';
    if (noteEditor) {
      var temp = document.createElement('div');
      temp.innerHTML = noteEditor.innerHTML;
      existingNoteText = (temp.textContent || temp.innerText || '').trim();
    }

    // ── Patient summary (same as handleGenerateClinicalNote) ──
    var conditions = intake.conditions || intake.primaryConditions || [];
    var expLevel = parseInt(intake.experienceLevel || intake.experience_level) || 3;
    var expLabel = EXP_LABELS[expLevel] || 'Moderate';
    var medications = intake.medications || 'None reported';
    var patient = allPatients.find(function (p) { return p.id == currentPatientId; }) || {};
    var patientName = ((patient.first_name || '') + ' ' + (patient.last_name || '')).trim() || 'Patient';
    var patientAge = patient.age || '';
    var patientSex = patient.sex || '';
    var severity = intake.severity || '';
    var duration = intake.conditionDuration || intake.duration || '';
    var allergies = intake.allergies || '';
    var previousResponse = intake.previousResponse || '';
    var drivesRegularly = intake.drivesRegularly || '';
    var psychiatricHistory = (intake.psychiatricHistory || []).join(', ');
    var substanceUse = intake.substanceUse || intake.cannabisUse || '';

    var patientSummary = patientName +
      (patientAge ? ', Age ' + patientAge : '') +
      (patientSex ? ', ' + patientSex : '') +
      '\nConditions: ' + (conditions.length > 0 ? conditions.join(', ') : 'Not specified') +
      (severity ? '\nCurrent Severity: ' + severity + '/10' : '') +
      (duration ? '\nDuration: ' + duration : '') +
      '\nExperience Level: Level ' + expLevel + ' \u2014 ' + expLabel +
      (previousResponse ? '\nPrevious Cannabis Response: ' + previousResponse : '') +
      '\nMedications: ' + medications +
      (allergies ? '\nAllergies: ' + allergies : '') +
      (psychiatricHistory ? '\nPsychiatric History: ' + psychiatricHistory : '') +
      (drivesRegularly && drivesRegularly !== 'No' ? '\nDrives Regularly: ' + drivesRegularly : '') +
      (substanceUse ? '\nSubstance Use: ' + substanceUse : '');

    // ── Scripts from this visit ──
    var scriptCards = u.$$('#workspace-scripts .record-card');
    var productsContext = [];
    var allCondRefs = {};
    var relevantCompounds = {};

    scriptCards.forEach(function (card) {
      var titleEl = card.querySelector('.record-card-title');
      if (!titleEl) return;
      var fullText = titleEl.textContent.trim();
      var matchedItem = null;
      for (var i = 0; i < enrichedItemsCache.length; i++) {
        if (fullText.indexOf(enrichedItemsCache[i].item_name) !== -1) {
          matchedItem = enrichedItemsCache[i];
          break;
        }
      }
      if (!matchedItem) return;

      var topTerps = recommend ? recommend.getTopTerpenes(matchedItem, 3) : [];
      var totalTerp = recommend ? recommend.getTotalTerpenePercent(matchedItem) : 0;
      var terpStr = topTerps.map(function (t) { return t.name + ' (' + t.value.toFixed(1) + '%)'; }).join(', ');

      if (parseFloat(matchedItem.cbd) > 0) relevantCompounds['CBD'] = true;
      if (parseFloat(matchedItem.thc) > 0) relevantCompounds['THC / dronabinol / nabilone'] = true;
      if (parseFloat(matchedItem.thc) > 0 && parseFloat(matchedItem.cbd) > 0) relevantCompounds['THC:CBD combinations / nabiximols'] = true;
      topTerps.forEach(function (t) {
        var terpKey = t.name.replace('Beta-caryophyllene', 'beta-Caryophyllene')
                         .replace('Alpha-pinene', 'Pinene').replace('Beta-pinene', 'Pinene');
        if (SD && SD.COMPOUND_EVIDENCE_NOTES && SD.COMPOUND_EVIDENCE_NOTES[terpKey]) relevantCompounds[terpKey] = true;
      });

      var rec = null;
      for (var r = 0; r < recs.length; r++) {
        if (String(recs[r].id) === String(matchedItem.id)) { rec = recs[r]; break; }
      }
      if (rec && rec.matchedConditions) {
        rec.matchedConditions.forEach(function (mc) {
          if (SD && SD.CONDITION_REFERENCES && SD.CONDITION_REFERENCES[mc.condition]) {
            allCondRefs[mc.condition] = SD.CONDITION_REFERENCES[mc.condition];
          }
        });
      }

      productsContext.push(
        matchedItem.item_name + ' (' + (matchedItem.brand || '') + ') \u2014 ' + (matchedItem.type || '') +
        '\n  THC: ' + (matchedItem.thc || '0') + ', CBD: ' + (matchedItem.cbd || '0') +
        ', Total terpenes: ' + totalTerp.toFixed(1) + '%' +
        (terpStr ? '\n  Top terpenes: ' + terpStr : '')
      );
    });

    // ── Evidence library ──
    var evidenceLines = [];
    for (var condName in allCondRefs) {
      evidenceLines.push('Condition \u2014 ' + condName + ': ' + allCondRefs[condName]);
    }
    if (SD && SD.COMPOUND_EVIDENCE_NOTES) {
      for (var compound in relevantCompounds) {
        if (SD.COMPOUND_EVIDENCE_NOTES[compound]) {
          evidenceLines.push('Compound \u2014 ' + compound + ': ' + SD.COMPOUND_EVIDENCE_NOTES[compound]);
        }
      }
    }

    // ── Prior scripts ──
    var priorScriptsContext = '';
    var existingScriptRows = u.$$('#workspace-existing-scripts .existing-script-row');
    if (existingScriptRows.length > 0) {
      var priorLines = [];
      existingScriptRows.forEach(function (row) {
        var nameEl = row.querySelector('.existing-script-name');
        var metaEl = row.querySelector('.existing-script-meta');
        if (nameEl) {
          var line = nameEl.textContent.trim();
          if (metaEl) line += ' (' + metaEl.textContent.trim().replace(/\s+/g, ' ') + ')';
          priorLines.push(line);
        }
      });
      if (priorLines.length > 0) {
        priorScriptsContext = 'This patient has ' + priorLines.length + ' prior script(s):\n' + priorLines.join('\n');
      }
    }

    // ── Build final compilation prompt ──
    var prompt =
      '## Final clinical note \u2014 governed by evidence library\n\n' +
      'You are a clinical documentation assistant for an Australian medicinal cannabis clinic.\n\n' +
      'The doctor has completed a telehealth consultation. Compile the FINAL clinical note for this appointment by combining the consultation observations, prescribed products, patient intake data, and evidence library.\n\n' +
      'Write a brief prescribing-rationale note for the medical record. This note supplements the full consultation note, intake form, clinician assessment, consent documentation, and dosing instructions recorded elsewhere.\n\n' +
      '### Output requirements\n\n' +
      'Return plain text only, with these 5 labelled sections in this exact order:\n\n' +
      '1. Patient Presentation\n2. Clinical Reasoning\n3. Prescribed Products\n4. Evidence Base\n5. Monitoring Plan\n\n' +
      '### Style rules\n\n' +
      '- Write as one cohesive clinical note, not separate per-product paragraphs.\n' +
      '- Keep it concise, professional, and suitable for Australian medical records.\n' +
      '- Target approximately 120\u2013180 words total.\n' +
      '- Use plain text only. No markdown, bullet points, numbering, or headings beyond the required section labels.\n' +
      '- Use conservative, clinically neutral language.\n' +
      '- Incorporate relevant observations from the consultation into the appropriate sections.\n' +
      '- The consultation observations should inform Patient Presentation, Clinical Reasoning, and Monitoring Plan where applicable.\n' +
      '- Do not use marketing language or overstate efficacy.\n' +
      '- Prefer cannabinoid-based rationale over terpene-based claims unless evidence library supports terpene relevance.\n\n' +
      '### Content rules for each section\n\n' +
      '1. Patient Presentation: 1\u20132 sentences. State indication, relevant treatment context, and key observations from the consultation.\n' +
      '2. Clinical Reasoning: 1\u20132 sentences. Explain product selection rationale, incorporating what was discussed during the consultation.\n' +
      '3. Prescribed Products: One compact sentence listing each product with its clinical role.\n' +
      '4. Evidence Base: 1\u20132 sentences using only supplied evidence library references.\n' +
      '5. Monitoring Plan: 1\u20132 sentences. State follow-up plan, including any goals or concerns discussed during the consultation.\n\n' +
      '### Evidence and safety rules\n\n' +
      '- The evidence library is the only permitted source for clinical evidence statements.\n' +
      '- If THC is present, include monitoring for psychoactive effects and driving safety.\n' +
      '- If safety issues are documented in intake or consultation, incorporate them.\n' +
      '- Do not invent history, treatments, or evidence not supplied.\n\n' +
      '### Input data\n\n' +
      'Patient:\n' + patientSummary + '\n\n' +
      (priorScriptsContext ? 'Previous prescription history:\n' + priorScriptsContext + '\n\n' : '') +
      'Consultation observations (from transcript and clinician notes):\n' + (existingNoteText || 'No observations recorded.') + '\n\n' +
      'Scripts prescribed this visit:\n' + (productsContext.length > 0 ? productsContext.join('\n\n') : 'No scripts prescribed.') + '\n\n' +
      'Evidence library:\n' + (evidenceLines.length > 0 ? evidenceLines.join('\n') : 'No matching evidence library entries.') + '\n\n' +
      '### Final instruction\n\n' +
      'Generate the final clinical note now using only the supplied information and following all rules above.';

    // Show loading state
    btn.disabled = true;
    btn.textContent = 'Compiling...';

    data.callGemini(prompt).then(function (generatedText) {
      if (noteEditor) {
        // Replace the entire note with the final compiled version
        var htmlText = '<div class="ai-final-note"><strong>Final Clinical Note</strong><br>';
        generatedText.split('\n').forEach(function (line) {
          var trimmed = line.trim();
          if (trimmed) htmlText += '<p>' + u.escapeHtml(trimmed) + '</p>';
        });
        htmlText += '</div>';
        noteEditor.innerHTML = htmlText;
      }
      // Show confirmation bar
      var confirmBar = u.byId('complete-confirmation-bar');
      if (confirmBar) confirmBar.classList.remove('hidden');
      u.showToast('Final note compiled \u2014 review and confirm below', 'info');
    }).catch(function (err) {
      console.error('Failed to compile final note:', err);
      u.showToast('Failed to compile note: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Complete Appointment';
    });
  }

  function confirmCompleteAppointment() {
    saveWorkspaceNote();

    data.updateAppointment(currentAppointmentId, { status: 'Completed' }).then(function () {
      u.showToast('Appointment completed', 'success');
      var confirmBar = u.byId('complete-confirmation-bar');
      if (confirmBar) confirmBar.classList.add('hidden');
      // Update the appointment status chip in the context banner
      var bannerRight = document.querySelector('.context-banner-right');
      if (bannerRight) bannerRight.innerHTML = '<span class="chip chip-completed">Completed</span>';
      lastTranscriptText = null;
    }).catch(function (err) {
      console.error('Failed to complete appointment:', err);
      u.showToast('Note saved but failed to update appointment status: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ── Prescribe: Intake, Recommendations, Cart, Script Creation ──

  function loadPrescribeIntake(patientId) {
    var summaryEl = u.byId('prescribe-intake-summary');
    scoreCache = {};
    scoreCacheReady = false;

    // For now, build intake data from what we know about the patient
    // TODO: Once we map Ontraport Contact intake field IDs, use data.fetchPatientIntake(patientId)
    // For demonstration, we use a mock/placeholder that can be replaced with real data
    data.fetchPatientIntake(patientId).then(function (contactData) {
      currentPatientIntake = mapContactToIntake(contactData);
      if (summaryEl && prescribe) {
        var hasIntake = prescribe.renderIntakeSummary(summaryEl, currentPatientIntake);
        if (btnGen) btnGen.disabled = !hasIntake;
      }
    }).catch(function () {
      // If intake fetch fails, show empty state
      if (summaryEl) summaryEl.innerHTML = '<div class="empty-state-sm">Could not load intake data. You can still browse and prescribe manually.</div>';
      if (btnGen) btnGen.disabled = false; // allow manual prescribing
    });
  }

  /**
   * Ontraport Contact field IDs for intake form data.
   * Mapped from thc-portal/server/src/routes/intake.ts (mapStep1–mapStep8).
   */
  // Condition name → GraphQL field name (for reading via GraphQL)
  var CONDITION_FIELDS = {
    'Chronic Pain': 'chronic_non_cancer_pain',
    'Anxiety': 'anxiety_disorder',
    'Depression': 'depression',
    'PTSD': 'ptsd',
    'ADHD': 'adhd',
    'Sleep Disorder': 'sleep_disorder',
    'Epilepsy': 'epilepsy',
    'Fibromyalgia': 'fibromyalgia',
    'Arthritis': 'arthritis',
    'Migraines': 'migraines',
    'Nausea / Vomiting': 'chemotherapy_induced_nausea_and_vomiting',
    'Endometriosis': 'endometriosis',
    "Crohn's / IBS": 'crohns_ulcerative_colitis_ibs_gut',
    'Multiple Sclerosis': 'multiple_sclerosis',
    'Inflammation': 'inflammation',
    'Neuropathic Pain': 'neuropathic_pain',
    'Cancer': 'cancer',
    "Parkinson's Disease": 'parkinson_s_disease',
    'Loss of Appetite': 'loss_of_appetite',
    'Autism Spectrum': 'autism_spectrum_disorder',
    'Glaucoma': 'glaucoma',
    'Chronic Illness (other)': 'chronic_illness',
    'Palliative Care': 'palliative_care'
  };

  // Condition name → Ontraport field ID (for writing via Ontraport API)
  var CONDITION_FIELD_IDS = {
    'Chronic Pain': 'f2305', 'Anxiety': 'f2310', 'Depression': 'f2311',
    'PTSD': 'f2316', 'ADHD': 'f2984', 'Sleep Disorder': 'f2306',
    'Epilepsy': 'f2317', 'Fibromyalgia': 'f2982', 'Arthritis': 'f2980',
    'Migraines': 'f2315', 'Nausea / Vomiting': 'f2309', 'Endometriosis': 'f2981',
    "Crohn's / IBS": 'f2340', 'Multiple Sclerosis': 'f2307', 'Inflammation': 'f2337',
    'Neuropathic Pain': 'f2312', 'Cancer': 'f2339', "Parkinson's Disease": 'f2338',
    'Loss of Appetite': 'f2331', 'Autism Spectrum': 'f2983', 'Glaucoma': 'f2334',
    'Chronic Illness (other)': 'f2314', 'Palliative Care': 'f2308'
  };

  // Ontraport dropdown option ID → label mappings
  var OPTION_LABELS = {
    // f2691 — Product Preference
    '279': 'Balanced', '280': 'Higher CBD', '281': 'Higher THC',
    // f2692 — Effect Preference
    '282': 'Longer Lasting', '283': 'Faster Onset',
    // f2175 — Sex
    '139': 'Intersex', '140': 'Female', '141': 'Male', '612': 'Prefer not to say',
    // f2914 — State
    '613': 'NT', '614': 'TAS', '615': 'SA', '616': 'WA', '617': 'QLD', '618': 'VIC', '619': 'ACT', '620': 'NSW',
    // f2346 — Medicare Valid To Month
    '168': '12', '169': '11', '170': '10', '171': '09', '172': '08', '173': '07',
    '174': '06', '175': '05', '176': '04', '177': '03', '178': '02', '179': '01',
    // f2347 — Medicare Valid To Year
    '180': '2035', '181': '2034', '182': '2033', '183': '2032', '184': '2031', '185': '2030',
    '186': '2029', '187': '2028', '188': '2027', '189': '2026', '190': '2025'
  };

  // Map Ontraport product_preference (f2691) values to/from THC Comfort dropdown
  var PRODUCT_PREF_TO_COMFORT = {
    'Higher CBD': 'Mostly CBD',
    'Higher THC': 'Mostly THC',
    'Balanced': 'Balanced'
  };
  var COMFORT_TO_PRODUCT_PREF = {
    'CBD only': '280',       // Higher CBD option ID
    'Mostly CBD': '280',     // Higher CBD option ID
    'Balanced': '279',       // Balanced option ID
    'Mostly THC': '281',     // Higher THC option ID
    'Open to anything': ''   // No preference
  };
  function mapProductPreference(ontraportVal) {
    return PRODUCT_PREF_TO_COMFORT[ontraportVal] || ontraportVal || '';
  }

  function optionLabel(val) {
    if (val == null || val === '') return '';
    var s = String(val);
    return OPTION_LABELS[s] || s;
  }

  // Intake key → GraphQL field name (for reading via GraphQL)
  var INTAKE_FIELDS = {
    // Personal
    sex: 'sex', weight: 'Weight', state: 'state_au',
    // Eligibility
    pregnant: 'i_am_currently_pregnant_or_breastfeeding',
    psychosisHistory: 'i_have_a_history_of_schizophrenia_bipolar_and_or_psychosis',
    // Medicare
    medicareName: 'medicare_name', medicareNumber: 'medicare_number',
    medicareIssue: 'issue_number', medicareIRN: 'irn',
    ihi: 'ihi_number', concessionCard: 'concession_card_holder',
    // Clinical
    experienceLevel: 'Experience_Level', medications: 'list_your_medications_supplements',
    allergies: 'allergies_information', conditionDetails: 'condition_details',
    severity: 'Severity', previousResponse: 'previous_treatment',
    cannabisFlower: 'flowers', cannabisOil: 'oils', hasExperience: 'prev_cannabis_use',
    // Mental health
    mentalHealthHistory: 'mental_health_history',
    opioids: 'history_of_opioid_replacement_therapy_and_or_drug_dependency',
    // Lifestyle
    drives: 'Drives_Regularly', heavyMachinery: 'Heavy_Machinery',
    competitiveSport: 'Competitive_Sport', sportType: 'Sport_Type', shiftWork: 'Shift_Work',
    contraception: 'pregnancy_or_fertility',
    // Preferences
    preferredForm: 'product_preference', thcComfort: 'product_preference',
    effectPreference: 'effect_preference', budgetRange: 'Budget_Range',
    // Consent
    consent: 'terms_conditions', consentAccuracy: 'declaration_i_have_answered_truthfully',
    additionalNotes: 'contact_comment', applicationStatus: 'application_status'
  };

  // Intake key → Ontraport field ID (for writing via Ontraport API)
  var INTAKE_FIELD_IDS = {
    experienceLevel: 'f3339', thcComfort: 'f2691', budgetRange: 'f3346',
    medications: 'f2320', allergies: 'f3026'
  };

  /**
   * Map GraphQL Contact fields to full intake structure.
   * GraphQL returns friendly field names and actual enum labels (not option IDs).
   */
  function mapContactToIntake(contactData) {
    if (!contactData || typeof contactData !== 'object') return {};
    var d = contactData;
    var f = INTAKE_FIELDS;

    function bool(fid) { var v = d[fid]; return v === '1' || v === 1 || v === true || v === 'true'; }
    function str(fid) { return d[fid] || ''; }
    function expLevel() { var n = parseInt(d[f.experienceLevel]); return (n >= 1 && n <= 5) ? String(n) : '3'; }

    // Conditions
    var conditions = [];
    for (var condName in CONDITION_FIELDS) {
      if (bool(CONDITION_FIELDS[condName])) conditions.push(condName);
    }

    // Psychiatric history
    var mhText = str(f.mentalHealthHistory);
    var psychiatricHistory = [];
    if (bool(f.psychosisHistory)) {
      if (/diagnosed.*schizophrenia|schizophrenia.*yes/i.test(mhText)) psychiatricHistory.push('Schizophrenia');
      if (/diagnosed.*psychosis|psychosis.*yes/i.test(mhText)) psychiatricHistory.push('Psychosis');
      if (/diagnosed.*bipolar\s*i\b|bipolar\s*i.*yes/i.test(mhText)) psychiatricHistory.push('Bipolar I');
      if (/diagnosed.*bipolar\s*ii|bipolar\s*ii.*yes/i.test(mhText)) psychiatricHistory.push('Bipolar II');
      if (/diagnosed.*borderline|borderline.*yes/i.test(mhText)) psychiatricHistory.push('Borderline PD');
      if (psychiatricHistory.length === 0) psychiatricHistory.push('Psychiatric History (flagged)');
    }

    // Substance use
    var substanceUse = [];
    if (bool(f.opioids)) substanceUse.push('Opioids');
    if (bool(f.hasExperience)) substanceUse.push('Cannabis (prior)');

    return {
      // ── Conditions & Clinical ──
      primaryConditions: conditions,
      secondaryConditions: [],
      experienceLevel: expLevel(),
      conditionDetails: str(f.conditionDetails),
      severity: str(f.severity),
      previousResponse: str(f.previousResponse),
      medications: str(f.medications),
      allergies: str(f.allergies),

      // ── Safety Flags ──
      psychiatricHistory: psychiatricHistory,
      pregnancyStatus: bool(f.pregnant) ? 'Yes' : 'No',
      breastfeeding: bool(f.pregnant) ? 'Yes' : 'No',
      drivesRegularly: bool(f.drives) ? 'Yes, professional driver' : 'No',

      // ── Demographics (GraphQL returns string labels directly) ──
      firstName: d.first_name || '',
      lastName: d.last_name || '',
      email: d.email || '',
      phone: d.sms_number || '',
      dob: d.birthday || '',
      age: d.age || '',
      sex: d[f.sex] || '',
      weight: str(f.weight),
      address: [d.address, d.address_2, d.city, d[f.state], d.zip_code].filter(Boolean).join(', '),

      // ── Medicare / IHI ──
      medicareName: str(f.medicareName),
      medicareNumber: str(f.medicareNumber),
      medicareIRN: str(f.medicareIRN),
      medicareExpiry: '',
      ihi: str(f.ihi),
      concessionCard: bool(f.concessionCard),
      veteranCard: false,

      // ── Mental Health ──
      mentalHealthHistory: mhText,
      substanceUse: substanceUse,

      // ── Lifestyle & Safety ──
      occupation: '',
      heavyMachinery: bool(f.heavyMachinery) ? 'Yes' : '',
      competitiveSport: bool(f.competitiveSport) ? 'Yes' : '',
      sportType: str(f.sportType),
      shiftWork: bool(f.shiftWork) ? 'Yes' : '',
      contraception: str(f.contraception),

      // ── Product Preferences (GraphQL returns labels, not option IDs) ──
      preferredForms: parseMultiValue(d[f.preferredForm]),
      thcComfort: mapProductPreference(d[f.thcComfort] || ''),
      mainGoal: '',
      budgetRange: str(f.budgetRange),
      lineagePreference: d.lineage_preference || '',
      onsetPreference: d.effect_preference || '',
      flowerPreference: d.flowers ? 'Yes' : '',
      oilPreference: d.oils ? 'Yes' : '',
      vapePreference: d.vapes ? 'Yes' : '',
      ediblePreference: d.edibles ? 'Yes' : '',
      organicPreference: d.organic ? 'Yes' : 'No',
      budgetImportant: d.budget_important ? 'Yes' : '',
      discretionImportant: d.discretion_important ? 'Yes' : '',
      prevCannabisUse: d.prev_cannabis_use ? 'Yes' : '',

      // ── Treatment History ──
      treatmentOutcome: d.treatment_outcome || '',
      previousTreatment: d.previous_treatment || '',
      longTermCondition: d.long_term_condition || '',

      // ── Prior Product Feedback ──
      priorProductFeedback: String(d.prior_product_feedback || d.last_feedback_rating || ''),

      // ── Consent & Notes ──
      consent: bool(f.consent),
      consentAccuracy: bool(f.consentAccuracy),
      additionalNotes: str(f.additionalNotes)
    };
  }

  function parseMultiValue(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim()) return val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return [];
  }

  /**
   * Cache product scores for the current patient.
   * Runs the full 12-step recommendation engine and stores results in scoreCache.
   * Called when Prescribe opens or intake changes.
   */
  function cacheProductScores() {
    if (!recommend || !currentPatientIntake) return;
    var statusEl = u.byId('prescribe-scoring-status');
    if (statusEl) statusEl.classList.remove('hidden');
    scoreCacheReady = false;

    setTimeout(function () {
      var editedFields = prescribe && prescribe.collectEditableIntake ? prescribe.collectEditableIntake() : {};
      var intake = Object.assign({}, currentPatientIntake, editedFields);
      var results = recommend.generateRecommendations(enrichedItemsCache, intake);
      currentRecommendations = results;

      // Build lookup map
      scoreCache = {};
      results.forEach(function (rec) {
        scoreCache[rec.id] = {
          clinicalScore: rec.clinicalScore,
          finalScore: rec.finalScore,
          reasoning: rec.reasoning || [],
          contraindications: rec.contraindications || [],
          tags: rec.tags || [],
          rank: rec.rank
        };
      });
      scoreCacheReady = true;

      if (statusEl) statusEl.classList.add('hidden');
      if (window.AppConfig && window.AppConfig.DEBUG) {
        console.log('Score cache built:', results.length, 'scored items from', enrichedItemsCache.length, 'products');
      }

      // Re-run search to apply scores
      runProductSearch();
    }, 50);
  }

  function handlePrescribeClick(e) {
    var target = e.target;

    // Score breakdown toggle (dev mode only — controlled by AppConfig.DEBUG)
    var scoreEl = target.closest('.score-clickable');
    if (scoreEl && currentRecommendations) {
      var scoreItemId = parseInt(scoreEl.dataset.itemId);
      var rec = currentRecommendations.find(function (r) { return r.id === scoreItemId; });
      if (rec && prescribe) {
        var card = scoreEl.closest('.rec-card') || scoreEl.closest('.product-row');
        var existing = card ? card.querySelector('.score-breakdown') : null;
        if (existing) {
          existing.remove();
          return;
        }
        document.querySelectorAll('.score-breakdown').forEach(function (el) { el.remove(); });
        var breakdownHtml = prescribe.renderScoreBreakdown(rec);
        if (card && breakdownHtml) {
          var div = document.createElement('div');
          div.innerHTML = breakdownHtml;
          card.appendChild(div.firstChild);
        }
      }
      return;
    }

    // Add to cart
    if (target.classList.contains('btn-add-to-cart') || target.closest('.btn-add-to-cart')) {
      var btn = target.classList.contains('btn-add-to-cart') ? target : target.closest('.btn-add-to-cart');
      var itemId = parseInt(btn.dataset.itemId);
      var item = enrichedItemsCache.find(function (i) { return i.id === itemId; }) || itemsMap[itemId];
      if (item) {
        var rec = currentRecommendations ? currentRecommendations.find(function (r) { return r.id === itemId; }) : null;
        requireAppointmentContext(item, rec);
        if (currentAppointmentId) refreshPrescribeViews();
      }
      return;
    }

    // Remove from cart
    if (target.classList.contains('btn-remove-from-cart') || target.closest('.btn-remove-from-cart')) {
      var removeBtn = target.classList.contains('btn-remove-from-cart') ? target : target.closest('.btn-remove-from-cart');
      var removeId = parseInt(removeBtn.dataset.itemId);
      prescribe.removeFromCart(removeId);
      refreshPrescribeViews();
      return;
    }

    // Show similar products when clicking a product card/row (not buttons)
    if (target.closest('button')) return;

    var clickedEl = target.closest('.rec-card') || target.closest('.product-row') || target.closest('.similar-card');
    if (clickedEl && similar) {
      var clickedItemId = parseInt(clickedEl.dataset.itemId);
      if (clickedItemId) showSimilarProducts(clickedItemId, clickedEl);
    }
  }

  function showSimilarProducts(itemId, anchorEl) {
    var sourceItem = enrichedItemsCache.find(function (i) { return i.id === itemId; });
    if (!sourceItem || !similar || !prescribe) return;

    // Remove any existing inline similar panel
    var existing = document.querySelectorAll('.similar-inline');
    existing.forEach(function (el) { el.remove(); });

    // If clicking the same product that's already expanded, just close it (toggle)
    if (anchorEl && anchorEl.dataset.similarOpen === 'true') {
      anchorEl.dataset.similarOpen = '';
      return;
    }
    // Clear previous open state
    document.querySelectorAll('[data-similar-open]').forEach(function (el) {
      el.dataset.similarOpen = '';
    });

    var results = similar.findSimilar(sourceItem, enrichedItemsCache, 3);

    // Create inline panel
    var panel = document.createElement('div');
    panel.className = 'similar-inline prescribe-section';

    var header = '<div class="detail-toolbar">' +
      '<h3 class="detail-heading">Similar Products</h3>' +
      '<button class="btn btn-sm btn-ghost btn-close-similar-inline" title="Close">&times;</button>' +
      '</div>';
    panel.innerHTML = header + '<div class="similar-inline-list"></div>';

    // Insert right after the clicked element
    if (anchorEl && anchorEl.parentNode) {
      anchorEl.parentNode.insertBefore(panel, anchorEl.nextSibling);
      anchorEl.dataset.similarOpen = 'true';
    }

    // Render similar results into the inline panel
    var listEl = panel.querySelector('.similar-inline-list');
    if (listEl) prescribe.renderSimilarProducts(listEl, sourceItem, results);

    // Close button
    var closeBtn = panel.querySelector('.btn-close-similar-inline');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        panel.remove();
        if (anchorEl) anchorEl.dataset.similarOpen = '';
      });
    }

    // Smooth scroll to make the panel visible
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function refreshPrescribeViews() {
    // Clean up any open inline similar panels before re-rendering
    document.querySelectorAll('.similar-inline').forEach(function (el) { el.remove(); });

    // Re-render unified product list to update add/remove buttons
    runProductSearch();
  }

  // ── Lineage normalization: map DB values to filter pill values ──
  var LINEAGE_MAP = {
    'Sativa': 'Sativa',
    'Sativa dominant': 'Sativa',
    'Indica': 'Indica',
    'Indica dominant': 'Indica',
    'Indica 80/20': 'Indica',
    'Balanced Hybrid': 'Balanced'
  };

  function updateAdvancedFilterCount() {
    var advBody = document.getElementById('advanced-filters-body');
    if (!advBody) return;
    var count = advBody.querySelectorAll('.filter-pill.active').length;
    var badge = document.getElementById('advanced-filter-count');
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  }

  function getActiveFilterValues(groupName) {
    var pills = document.querySelectorAll('[data-filter-group="' + groupName + '"] .filter-pill.active');
    var values = [];
    pills.forEach(function (p) { values.push(p.dataset.value); });
    return values;
  }

  function runProductSearch() {
    var searchInput = u.byId('prescribe-product-search');
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    // Collect active filters from each group
    var types = getActiveFilterValues('type');
    var dominances = getActiveFilterValues('dominance');
    var lineages = getActiveFilterValues('lineage');
    var subTypes = getActiveFilterValues('subtype');

    var priceMinEl = u.byId('filter-price-min');
    var priceMaxEl = u.byId('filter-price-max');
    var priceMin = priceMinEl && priceMinEl.value ? parseFloat(priceMinEl.value) : 0;
    var priceMax = priceMaxEl && priceMaxEl.value ? parseFloat(priceMaxEl.value) : Infinity;

    var totalItems = enrichedItemsCache.length;

    var results = enrichedItemsCache.filter(function (item) {
      // Text search
      if (query) {
        var searchStr = ((item.item_name || '') + ' ' + (item.brand || '') + ' ' + (item.chemovar || '') + ' ' + (item.dominance || '') + ' ' + (item.conditions_options_as_text || '') + ' ' + (item.benefits_options_as_text || '')).toLowerCase();
        if (searchStr.indexOf(query) === -1) return false;
      }

      // Type filter (OR within group)
      var itemType = item.type || '';
      if (itemType === 'Liquid vape cartridge') itemType = 'Vape';
      if (types.length > 0) {
        if (types.indexOf(itemType) === -1) return false;
      } else {
        // No type selected: exclude Accessories by default
        if (itemType === 'Accessory') return false;
      }

      // Dominance filter (OR within group)
      if (dominances.length > 0) {
        if (dominances.indexOf(item.dominance || '') === -1) return false;
      }

      // Lineage filter (OR within group, with normalization)
      if (lineages.length > 0) {
        var normalizedLineage = LINEAGE_MAP[item.sativa_indica] || '';
        if (lineages.indexOf(normalizedLineage) === -1) return false;
      }

      // Sub type filter (OR within group)
      if (subTypes.length > 0) {
        if (subTypes.indexOf(item.sub_type || '') === -1) return false;
      }

      // Price range
      var price = parseFloat(item.retail_price) || 0;
      if (price < priceMin) return false;
      if (priceMax !== Infinity && price > priceMax) return false;

      return true;
    });

    // Sort results
    var sortEl = u.byId('product-sort');
    var sortVal = sortEl ? sortEl.value : 'relevance';
    if (sortVal === 'relevance' && scoreCacheReady) {
      // "Best Match" = sort by cached finalScore from full recommendation engine
      results.sort(function (a, b) {
        var sa = scoreCache[a.id] ? scoreCache[a.id].finalScore : -1;
        var sb = scoreCache[b.id] ? scoreCache[b.id].finalScore : -1;
        return sb - sa;
      });
    } else if (sortVal === 'relevance' && currentPatientIntake && recommend) {
      // Fallback: lightweight scoring if cache not ready yet
      var editedFields = prescribe && prescribe.collectEditableIntake ? prescribe.collectEditableIntake() : {};
      var intake = Object.assign({}, currentPatientIntake, editedFields);
      results = recommend.scoreItems(results, intake);
    } else if (sortVal !== 'relevance') {
      results.sort(function (a, b) {
        switch (sortVal) {
          case 'price-asc': return (parseFloat(a.retail_price) || 0) - (parseFloat(b.retail_price) || 0);
          case 'price-desc': return (parseFloat(b.retail_price) || 0) - (parseFloat(a.retail_price) || 0);
          case 'thc-desc': return (parseFloat(b.thc) || 0) - (parseFloat(a.thc) || 0);
          case 'cbd-desc': return (parseFloat(b.cbd) || 0) - (parseFloat(a.cbd) || 0);
          case 'value-asc':
            var aVal = parseFloat(a.price_per_mg) || Infinity;
            var bVal = parseFloat(b.price_per_mg) || Infinity;
            return aVal - bVal;
          case 'rating-desc': return (parseFloat(b.paul_rating) || 0) - (parseFloat(a.paul_rating) || 0);
          case 'freshness-desc': return (parseFloat(b.expiry_score) || 0) - (parseFloat(a.expiry_score) || 0);
          default: return 0;
        }
      });
    }

    // Update result count
    var countEl = u.byId('filter-result-count');
    if (countEl) {
      countEl.textContent = 'Showing ' + Math.min(results.length, 100) + ' of ' + results.length + ' products' +
        (results.length < totalItems ? ' (filtered from ' + totalItems + ')' : '');
    }

    // Display up to 100 results with score data
    var displayed = results.slice(0, 100);
    var container = u.byId('prescribe-search-results');
    if (container && prescribe) {
      prescribe.renderUnifiedProductGrid(container, displayed, scoreCache);
    }
  }

  // ── Formulary ─────────────────────────────────────────────
  var formularySearchDebounce = null;

  function getFormularyFilterValues(groupName) {
    var pills = document.querySelectorAll('[data-filter-group="' + groupName + '"] .filter-pill.active');
    var values = [];
    pills.forEach(function (p) { values.push(p.dataset.value); });
    return values;
  }

  function runFormularySearch() {
    var searchInput = u.byId('formulary-search');
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    var types = getFormularyFilterValues('f-type');
    var dominances = getFormularyFilterValues('f-dominance');
    var lineages = getFormularyFilterValues('f-lineage');
    var subTypes = getFormularyFilterValues('f-subtype');

    var priceMinEl = u.byId('f-filter-price-min');
    var priceMaxEl = u.byId('f-filter-price-max');
    var priceMin = priceMinEl && priceMinEl.value ? parseFloat(priceMinEl.value) : 0;
    var priceMax = priceMaxEl && priceMaxEl.value ? parseFloat(priceMaxEl.value) : Infinity;

    var totalItems = enrichedItemsCache.length;

    var results = enrichedItemsCache.filter(function (item) {
      if (query) {
        var searchStr = ((item.item_name || '') + ' ' + (item.brand || '') + ' ' + (item.chemovar || '') + ' ' + (item.dominance || '') + ' ' + (item.conditions_options_as_text || '') + ' ' + (item.benefits_options_as_text || '')).toLowerCase();
        if (searchStr.indexOf(query) === -1) return false;
      }

      var itemType = item.type || '';
      if (itemType === 'Liquid vape cartridge') itemType = 'Vape';
      if (types.length > 0) {
        if (types.indexOf(itemType) === -1) return false;
      } else {
        if (itemType === 'Accessory') return false;
      }

      if (dominances.length > 0) {
        if (dominances.indexOf(item.dominance || '') === -1) return false;
      }

      if (lineages.length > 0) {
        var normalizedLineage = LINEAGE_MAP[item.sativa_indica] || '';
        if (lineages.indexOf(normalizedLineage) === -1) return false;
      }

      if (subTypes.length > 0) {
        if (subTypes.indexOf(item.sub_type || '') === -1) return false;
      }

      var price = parseFloat(item.retail_price) || 0;
      if (price < priceMin) return false;
      if (priceMax !== Infinity && price > priceMax) return false;

      return true;
    });

    // Sort
    var sortEl = u.byId('formulary-sort');
    var sortVal = sortEl ? sortEl.value : 'name-asc';
    results.sort(function (a, b) {
      switch (sortVal) {
        case 'name-asc': return (a.item_name || '').localeCompare(b.item_name || '');
        case 'price-asc': return (parseFloat(a.retail_price) || 0) - (parseFloat(b.retail_price) || 0);
        case 'price-desc': return (parseFloat(b.retail_price) || 0) - (parseFloat(a.retail_price) || 0);
        case 'thc-desc': return (parseFloat(b.thc) || 0) - (parseFloat(a.thc) || 0);
        case 'cbd-desc': return (parseFloat(b.cbd) || 0) - (parseFloat(a.cbd) || 0);
        case 'value-asc':
          var aVal = parseFloat(a.price_per_mg) || Infinity;
          var bVal = parseFloat(b.price_per_mg) || Infinity;
          return aVal - bVal;
        case 'rating-desc': return (parseFloat(b.paul_rating) || 0) - (parseFloat(a.paul_rating) || 0);
        case 'freshness-desc': return (parseFloat(b.expiry_score) || 0) - (parseFloat(a.expiry_score) || 0);
        default: return 0;
      }
    });

    // Update count
    var countEl = u.byId('formulary-result-count');
    if (countEl) {
      countEl.textContent = 'Showing ' + Math.min(results.length, 100) + ' of ' + results.length + ' products' +
        (results.length < totalItems ? ' (filtered from ' + totalItems + ')' : '');
    }

    var empty = u.byId('formulary-empty');
    if (empty) empty.classList.toggle('hidden', results.length > 0);

    // Render
    var displayed = results.slice(0, 100);
    renderFormularyGrid(u.byId('formulary-results'), displayed);
  }

  function renderFormularyGrid(container, items) {
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = '';
      return;
    }
    var recommend = window.RecommendEngine;
    var escHtml = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

    var html = '';
    items.forEach(function (item) {
      html += '<div class="product-row formulary-row" data-item-id="' + item.id + '">';
      // Thumbnail (reuse prescribe's productThumb for consistent rendering)
      html += prescribe.productThumb(item);
      html += '<div class="product-info">';
      html += '<div class="product-name">' + escHtml(item.item_name || '') + '</div>';
      html += '<div class="product-meta">';
      html += '<span>' + escHtml(item.brand || '') + '</span>';
      if (item.type) html += '<span class="chip chip-type chip-sm">' + escHtml(item.type) + '</span>';
      if (item.thc != null) html += '<span>THC ' + item.thc + '</span>';
      if (item.cbd != null && parseFloat(item.cbd) > 0) html += '<span>CBD ' + item.cbd + '</span>';
      if (item.retail_price) html += '<span>$' + parseFloat(item.retail_price).toFixed(2) + '</span>';
      var ppmg = parseFloat(item.price_per_mg);
      if (ppmg && isFinite(ppmg)) html += '<span class="meta-value">$' + ppmg.toFixed(2) + '/mg</span>';
      var rating = parseFloat(item.paul_rating);
      if (rating > 0) html += '<span class="meta-rating">' + rating + '\u2605</span>';
      html += '</div>';

      // Terpene chips
      if (recommend) {
        var topTerps = recommend.getTopTerpenes(item, 3);
        if (topTerps && topTerps.length > 0) {
          html += '<div class="product-terpene-chips">';
          topTerps.forEach(function (t) {
            html += '<span class="terpene-chip">' + escHtml(t.name) + ' ' + t.value.toFixed(1) + '%</span>';
          });
          html += '</div>';
        }
      }

      html += '</div>';
      html += '<div class="product-actions">';
      html += '<button class="btn btn-sm btn-ghost btn-formulary-similar" data-item-id="' + item.id + '">Similar</button>';
      html += '<button class="btn btn-sm btn-primary btn-formulary-detail" data-item-id="' + item.id + '">View Details</button>';
      html += '</div>';
      html += '</div>';

      // Placeholder for inline similar expansion
      html += '<div class="similar-expansion hidden" id="similar-expand-' + item.id + '"></div>';
    });

    container.innerHTML = html;
  }

  function toggleFormularySimilar(itemId) {
    var expandEl = u.byId('similar-expand-' + itemId);
    if (!expandEl) return;

    // Toggle
    if (!expandEl.classList.contains('hidden')) {
      expandEl.classList.add('hidden');
      expandEl.innerHTML = '';
      return;
    }

    // Close any other open expansion
    u.$$('.similar-expansion:not(.hidden)').forEach(function (el) {
      el.classList.add('hidden');
      el.innerHTML = '';
    });

    var similar = window.SimilarEngine;
    if (!similar) return;

    var item = null;
    for (var i = 0; i < enrichedItemsCache.length; i++) {
      if (String(enrichedItemsCache[i].id) === String(itemId)) { item = enrichedItemsCache[i]; break; }
    }
    if (!item) return;

    var results = similar.findSimilar(item, enrichedItemsCache, 3);
    if (!results || results.length === 0) {
      expandEl.innerHTML = '<div class="similar-empty">No similar products found in stock.</div>';
      expandEl.classList.remove('hidden');
      return;
    }

    var escHtml = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    var html = '<div class="similar-results-header">Top 3 Similar to ' + escHtml(item.item_name || '') + '</div>';
    html += '<div class="similar-results-grid">';
    results.forEach(function (r) {
      var c = r.candidate;
      html += '<div class="similar-card" data-item-id="' + c.id + '">';
      html += '<div class="similar-card-name">' + escHtml(c.item_name || '') + '</div>';
      html += '<div class="similar-card-meta">';
      html += '<span>' + escHtml(c.brand || '') + '</span>';
      if (c.type) html += '<span class="chip chip-type chip-sm">' + escHtml(c.type) + '</span>';
      if (c.thc != null) html += '<span>THC ' + c.thc + '</span>';
      if (c.cbd != null && parseFloat(c.cbd) > 0) html += '<span>CBD ' + c.cbd + '</span>';
      if (c.retail_price) html += '<span>$' + parseFloat(c.retail_price).toFixed(2) + '</span>';
      html += '</div>';
      var scoreCls = r.score >= 80 ? 'score-high' : r.score >= 60 ? 'score-mid' : r.score >= 40 ? 'score-low' : 'score-weak';
      html += '<div class="similar-card-score ' + scoreCls + '">' + Math.round(r.score) + '% match</div>';
      html += '</div>';
    });
    html += '</div>';
    expandEl.innerHTML = html;
    expandEl.classList.remove('hidden');
  }

  function updateFormularyAdvFilterCount() {
    var advBody = document.getElementById('formulary-adv-filters-body');
    if (!advBody) return;
    var count = advBody.querySelectorAll('.filter-pill.active').length;
    var badge = document.getElementById('formulary-adv-filter-count');
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  }

  function openCreateScriptsModal() {
    if (!prescribe) return;
    var cartItems = prescribe.getCart();
    if (cartItems.length === 0) {
      u.showToast('Add products to the cart first.', 'error');
      return;
    }

    var body = u.byId('create-scripts-body');
    if (body) prescribe.renderScriptModal(body, currentPatientIntake, currentRecommendations);
    openModal('modal-create-scripts');
  }

  function confirmCreateScripts() {
    if (!prescribe || !data) return;
    var scriptDataArr = prescribe.collectScriptData(doctorId, currentPatientId, currentAppointmentId);
    if (scriptDataArr.length === 0) return;

    var btnConfirm = u.byId('btn-confirm-scripts');
    if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Creating...'; }

    var promises = scriptDataArr.map(function (sd) {
      return data.createScript(sd);
    });

    Promise.all(promises).then(function (results) {
      u.showToast(results.length + ' script' + (results.length > 1 ? 's' : '') + ' created successfully!', 'success');

      // Clinical note is NOT auto-populated — doctor uses "Generate Note" button instead
      closeModal('modal-create-scripts');

      prescribe.clearCart();

      // ── 2. Append script cards to "Scripts from this visit" ──
      if (currentAppointmentId && !u.byId('view-appointment-workspace').classList.contains('hidden')) {
        var container = u.byId('workspace-scripts');
        var emptyEl = u.byId('workspace-scripts-empty');
        if (emptyEl) emptyEl.style.display = 'none';
        if (container) {
          var appendHtml = scriptDataArr.map(function (sd, idx) {
            var a = (results[idx] && results[idx].attrs) || results[idx] || {};
            var scriptId = a.id || ('new-' + idx);
            var drug = itemsMap[sd.drug_id] || enrichedItemsCache.find(function (i) { return String(i.id) === String(sd.drug_id); });
            var drugName = drug ? drug.item_name : 'Unknown medication';
            var drugBrand = drug ? drug.brand : '';
            var repeats = sd.repeats || 3;
            return (
              '<div class="record-card record-card-draft">' +
                '<div class="record-card-header">' +
                  '<span class="record-card-title">' + u.escapeHtml(drugName) +
                    (drugBrand ? ' <span style="font-weight:400;color:var(--brand-text-muted)">(' + u.escapeHtml(drugBrand) + ')</span>' : '') +
                  '</span><span class="chip chip-pending">Draft</span>' +
                '</div>' +
                '<div class="record-card-body">' +
                  '<p>Repeats: ' + repeats + ' &middot; Remaining: ' + repeats + '</p>' +
                '</div>' +
                '<div class="record-card-footer">' +
                  '<span>Just now</span>' +
                  '<div class="script-draft-actions">' +
                    '<button class="btn btn-sm btn-ghost btn-edit-script" data-script-id="' + scriptId + '">Edit</button>' +
                    '<button class="btn btn-sm btn-danger-ghost btn-delete-script" data-script-id="' + scriptId + '" data-script-name="' + u.escapeHtml(drugName) + '">Delete</button>' +
                  '</div>' +
                '</div>' +
              '</div>'
            );
          }).join('');
          container.insertAdjacentHTML('beforeend', appendHtml);
        }
      } else if (currentPatientId) {
        loadPatientScripts(currentPatientId);
        switchDetailTab('scripts');
      }
    }).catch(function (err) {
      console.error('Failed to create scripts:', err);
      u.showToast('Failed to create scripts: ' + (err.message || 'Unknown error'), 'error');
    }).finally(function () {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Confirm & Create'; }
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

    // Determine appointment time: from date input or selected timeslot
    var apptTime = 0;
    var timeslotId = null;
    var activeWhen = document.querySelector('.appt-when-btn.active');
    var mode = activeWhen ? activeWhen.dataset.when : 'now';

    if (mode === 'timeslot') {
      var slotIdInput = u.byId('appt-timeslot-id');
      var slotList = u.byId('appt-timeslot-list');
      timeslotId = slotIdInput && slotIdInput.value ? Number(slotIdInput.value) : null;
      apptTime = slotList && slotList.dataset.selectedTime ? Number(slotList.dataset.selectedTime) : 0;
      if (!timeslotId || !apptTime) {
        u.showToast('Please select a timeslot', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Appointment';
        return;
      }
    } else {
      var dateVal = u.byId('appt-date').value;
      apptTime = dateVal ? Math.floor(new Date(dateVal).getTime() / 1000) : Math.floor(Date.now() / 1000);
    }

    var apptType = u.byId('appt-type').value;
    var feeInput = u.byId('appt-fee');
    var feeAmount = feeInput ? parseFloat(feeInput.value) : 0;

    var payload = {
      type: apptType,
      patient_id: patientId,
      appointment_time: apptTime,
      status: 'Booked',
    };

    if (timeslotId) payload.timeslot_id = timeslotId;
    if (doctorId) payload.doctor_id = Number(doctorId);
    if (feeAmount > 0) payload.fee = feeAmount.toFixed(2);

    data.createAppointment(payload).then(function (result) {
      var newApptId = result && (result.id || (result.attrs && result.attrs.id));

      // Process billing if fee was entered
      if (feeAmount > 0) {
        var feeEntry = CONSULTATION_FEES[apptType] || { price: feeAmount, productId: '0' };
        processAppointmentBilling(patientId, feeAmount, feeEntry.productId, newApptId);
      } else {
        u.showToast('Appointment created', 'success');
      }

      closeModal('modal-add-appointment');
      u.byId('form-add-appointment').reset();
      var searchEl = u.byId('appt-patient-search');
      var idEl = u.byId('appt-patient-id');
      if (searchEl) searchEl.value = '';
      if (idEl) idEl.value = '';
      var resultsEl = u.byId('appt-patient-results');
      if (resultsEl) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; }

      loadDoctorAppointments();
      loadTodaySchedule();

      // Open the new appointment in the workspace
      if (newApptId && patientId) {
        openAppointmentWorkspace(newApptId, patientId);
      }
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
      checkFutureTimeslotAlert();

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

  // ── Timeslot Alert: warn if <2 future timeslots ──
  function checkFutureTimeslotAlert() {
    var banner = u.byId('timeslot-alert-banner');
    if (!banner) return;
    var now = Math.floor(Date.now() / 1000);
    var futureCount = 0;
    for (var i = 0; i < cachedTimeslots.length; i++) {
      if ((Number(cachedTimeslots[i].f2125) || 0) > now) futureCount++;
    }
    if (futureCount < 2) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
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

    // Debug: log unique statuses to help identify unexpected values
    if (window.AppConfig && window.AppConfig.DEBUG) {
      var statuses = {};
      appts.forEach(function (a) { statuses[a.status || '(empty)'] = (statuses[a.status || '(empty)'] || 0) + 1; });
      console.log('Appointment statuses:', statuses);
    }

    // Filter out rescheduled, cancelled, no show
    var visible = appts.filter(function (a) {
      var s = (a.status || '').toLowerCase().trim();
      return APPT_HIDDEN_STATUSES.indexOf(s) === -1;
    });

    return visible.map(function (appt) {
      var startTs = Number(appt.appointment_time) || 0;
      var endTs = startTs + 900; // 15 minutes
      var patientName = getPatientName(appt.patient_id);
      var statusLower = (appt.status || '').toLowerCase().trim();
      var color = APPT_STATUS_COLORS[statusLower] || '#3b82f6';
      var statusLabel = appt.status ? ' [' + appt.status + ']' : '';
      var title = (patientName || 'Patient') + ' \u2013 ' + (appt.type || 'Appointment') + statusLabel;
      return {
        id: String(appt.id || 'appt-' + startTs),
        title: title,
        start: new Date(startTs * 1000).toISOString(),
        end: new Date(endTs * 1000).toISOString(),
        color: color,
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
      initialView: 'listAll',
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
      eventClick: function (arg) {
        arg.jsEvent.preventDefault();
        var appt = arg.event.extendedProps.appt;
        if (appt && appt.id && appt.patient_id) {
          openAppointmentWorkspace(Number(appt.id), Number(appt.patient_id));
        }
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
