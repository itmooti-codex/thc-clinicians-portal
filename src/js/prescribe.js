// thc-clinicians-portal — Prescribe UI (rendering + cart state)
// Depends on: utils.js, science-data.js, recommend.js, data.js
(function () {
  'use strict';

  var utils = window.AppUtils || {};
  var SD = window.ScienceData;
  var RE = window.RecommendEngine;
  var data = window.AppData;

  // ── Cart State ──
  var cart = [];

  function addToCart(item, recommendation) {
    if (cart.some(function (c) { return c.item.id === item.id; })) return;
    cart.push({
      item: item,
      recommendation: recommendation || null,
      repeats: 3,
      dosage: recommendation ? recommendation.dosageTemplate : (SD.DOSAGE_TEMPLATES[item.type] || SD.DOSAGE_TEMPLATES['Oil']),
      condition: recommendation && recommendation.matchedConditions
        ? recommendation.matchedConditions.map(function (mc) { return mc.condition; }).join(', ')
        : (window._currentPatientConditions || '')
    });
    renderCartSidebar();
  }

  function removeFromCart(itemId) {
    cart = cart.filter(function (c) { return c.item.id !== itemId; });
    renderCartSidebar();
  }

  function clearCart() {
    cart = [];
    renderCartSidebar();
  }

  function getCart() { return cart; }

  // ── Render: Intake Summary (full clinician view) ──
  function renderIntakeSummary(container, intakeData) {
    var d = intakeData || {};
    if (!d.primaryConditions || d.primaryConditions.length === 0) {
      container.innerHTML = '<div class="empty-state-sm">No intake data available for this patient. The recommendation engine requires a completed intake form.</div>';
      return false;
    }

    var levelLabels = { '1': 'Naive', '2': 'Beginner', '3': 'Moderate', '4': 'Experienced', '5': 'Expert' };
    var html = '';

    // ─── SAFETY FLAGS (always visible, top priority) ───
    var flags = [];
    if (d.psychiatricHistory && d.psychiatricHistory.length > 0) {
      flags.push({ label: d.psychiatricHistory.join(', '), type: 'danger' });
    }
    if (d.pregnancyStatus === 'Yes') flags.push({ label: 'Pregnant / Breastfeeding', type: 'danger' });
    if (d.drivesRegularly && d.drivesRegularly !== 'No') flags.push({ label: 'Professional Driver', type: 'warning' });
    if (d.heavyMachinery === 'Yes') flags.push({ label: 'Heavy Machinery', type: 'warning' });
    if (d.medications && /\b(ssri|sertraline|fluoxetine|paroxetine|citalopram|escitalopram|venlafaxine|duloxetine)\b/i.test(d.medications)) {
      flags.push({ label: 'SSRI / SNRI Medication', type: 'warning' });
    }
    if (d.medications && /\b(warfarin|opioid|oxycodone|codeine|tramadol)\b/i.test(d.medications)) {
      flags.push({ label: 'Drug Interaction Risk', type: 'warning' });
    }
    if (flags.length > 0) {
      html += '<div class="intake-flags">';
      flags.forEach(function (f) {
        html += '<span class="chip chip-' + f.type + '">' + escHtml(f.label) + '</span>';
      });
      html += '</div>';
    }

    // ─── CLINICAL OVERVIEW (always visible) ───
    html += '<div class="intake-section">';
    html += '<div class="intake-section-title">Clinical Overview</div>';
    html += '<div class="intake-grid">';

    // Conditions
    html += item('Conditions', d.primaryConditions.map(function (c) { return '<span class="chip chip-primary">' + escHtml(c) + '</span>'; }).join(' '), true);
    if (d.secondaryConditions && d.secondaryConditions.length > 0) {
      html += item('Secondary', d.secondaryConditions.map(function (c) { return '<span class="chip chip-secondary">' + escHtml(c) + '</span>'; }).join(' '), true);
    }

    // Condition details (duration + severity)
    if (d.conditionDetails) html += item('Duration & Severity', d.conditionDetails);
    if (d.severity) html += item('Current Severity', d.severity + ' / 10');

    // Experience
    html += item('Experience Level', 'Level ' + d.experienceLevel + ' \u2014 ' + (levelLabels[d.experienceLevel] || 'Unknown'));
    if (d.previousResponse) html += item('Previous Response', d.previousResponse);

    // Medications & Allergies
    if (d.medications) html += item('Medications', d.medications);
    if (d.allergies) html += item('Allergies', d.allergies);
    html += '</div></div>';

    // ─── MENTAL HEALTH (collapsible) ───
    var hasMH = d.mentalHealthHistory || d.substanceUse.length > 0;
    if (hasMH) {
      html += section('Mental Health & Substance Use', function () {
        var s = '';
        if (d.psychiatricHistory.length > 0) s += item('Psychiatric History', d.psychiatricHistory.join(', '));
        if (d.mentalHealthHistory) s += item('Details', d.mentalHealthHistory);
        if (d.substanceUse.length > 0) s += item('Substance Use', d.substanceUse.join(', '));
        return s;
      });
    }

    // ─── DEMOGRAPHICS (collapsible) ───
    html += section('Patient Details', function () {
      var s = '';
      if (d.sex) s += item('Sex', d.sex);
      if (d.dob) {
        var dobDate = new Date(parseInt(d.dob) * 1000);
        var dobStr = isNaN(dobDate.getTime()) ? d.dob : dobDate.toLocaleDateString('en-AU');
        s += item('Date of Birth', dobStr + (d.age ? ' (age ' + d.age + ')' : ''));
      }
      if (d.weight) s += item('Weight', d.weight + ' kg');
      if (d.address) s += item('Address', d.address);
      return s;
    });

    // ─── MEDICARE (collapsible) ───
    var hasMedicare = d.medicareNumber || d.ihi;
    if (hasMedicare) {
      html += section('Medicare / IHI', function () {
        var s = '';
        if (d.medicareNumber) {
          s += item('Medicare', d.medicareNumber);
          if (d.medicareIRN) s += item('IRN', d.medicareIRN);
          if (d.medicareExpiry) s += item('Valid Until', d.medicareExpiry);
          if (d.medicareName) s += item('Name on Card', d.medicareName);
        }
        if (d.ihi) s += item('IHI', d.ihi);
        if (d.concessionCard) s += item('Concession Card', 'Yes');
        if (d.veteranCard) s += item('Veteran Card', 'Yes');
        return s;
      });
    }

    // ─── LIFESTYLE & SAFETY (collapsible) ───
    html += section('Lifestyle & Safety', function () {
      var s = '';
      if (d.occupation) s += item('Occupation', d.occupation);
      s += item('Drives Regularly', d.drivesRegularly || 'Not specified');
      if (d.heavyMachinery === 'Yes') s += item('Heavy Machinery', 'Yes');
      if (d.competitiveSport === 'Yes') s += item('Competitive Sport', d.sportType || 'Yes');
      if (d.shiftWork === 'Yes') s += item('Shift Work', 'Yes');
      if (d.contraception) s += item('Contraception', d.contraception);
      if (d.pregnancyStatus === 'Yes') s += item('Pregnancy', 'Yes');
      return s;
    });

    // ─── PRODUCT PREFERENCES (collapsible) ───
    html += section('Product Preferences', function () {
      var s = '';
      var validForms = (d.preferredForms || []).filter(function (f) { return f && f !== '0' && f !== 'undefined'; });
      if (validForms.length > 0) s += item('Preferred Forms', validForms.map(function (f) { return '<span class="chip">' + escHtml(f) + '</span>'; }).join(' '), true);
      if (d.thcComfort && d.thcComfort !== '0') s += item('THC Comfort', d.thcComfort);
      if (d.lineagePreference) s += item('Lineage Preference', d.lineagePreference);
      if (d.onsetPreference) s += item('Onset Preference', d.onsetPreference);
      if (d.organicPreference === 'Yes') s += item('Organic Preference', 'Yes');
      if (d.mainGoal) s += item('Main Goal', d.mainGoal);
      if (d.budgetRange) s += item('Budget', d.budgetRange);
      if (d.budgetImportant === 'Yes') s += item('Budget Important', 'Yes');
      if (d.discretionImportant === 'Yes') s += item('Discretion Important', 'Yes');
      if (d.prevCannabisUse === 'Yes') s += item('Previous Cannabis Use', 'Yes');
      return s;
    });

    // ─── TREATMENT HISTORY (collapsible) ───
    var hasTreatment = d.treatmentOutcome || d.previousTreatment || d.longTermCondition;
    if (hasTreatment) {
      html += section('Treatment History', function () {
        var s = '';
        if (d.previousTreatment) s += item('Previous Treatment', d.previousTreatment);
        if (d.treatmentOutcome) s += item('What Is Working', d.treatmentOutcome);
        if (d.longTermCondition) s += item('Why Regular Medicine Isn\'t Working', d.longTermCondition);
        return s;
      });
    }

    // ─── PRIOR PRODUCT FEEDBACK (always visible if present) ───
    if (d.priorProductFeedback) {
      html += '<div class="intake-section">';
      html += '<div class="intake-section-title">Prior Product Feedback</div>';
      var products = d.priorProductFeedback.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
      if (products.length > 0) {
        html += '<div class="intake-product-chips">';
        products.forEach(function (p) {
          html += '<span class="chip chip-product">' + escHtml(p) + '</span>';
        });
        html += '</div>';
      } else {
        html += '<div class="intake-notes">' + escHtml(d.priorProductFeedback) + '</div>';
      }
      html += '</div>';
    }

    // ─── DOCTOR NOTES (always visible if present) ───
    if (d.additionalNotes) {
      html += '<div class="intake-section">';
      html += '<div class="intake-section-title">Patient Notes</div>';
      html += '<div class="intake-notes">' + escHtml(d.additionalNotes) + '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
    return true;
  }

  // Intake rendering helpers
  function item(label, value, isHtml) {
    if (!value) return '';
    return '<div class="intake-row"><span class="intake-label">' + label + '</span><span class="intake-value">' + (isHtml ? value : escHtml(value)) + '</span></div>';
  }

  function section(title, contentFn) {
    var content = contentFn();
    if (!content) return '';
    return '<details class="intake-section intake-collapsible">' +
      '<summary class="intake-section-title">' + title + '</summary>' +
      '<div class="intake-grid">' + content + '</div>' +
      '</details>';
  }

  // ── Render: Recommendation Cards ──
  function renderRecommendationCards(container, recommendations) {
    if (!recommendations || recommendations.length === 0) {
      container.innerHTML = '';
      var empty = document.getElementById('prescribe-recs-empty');
      if (empty) {
        empty.textContent = 'No products met the clinical threshold for this patient. Try manual search.';
        empty.classList.remove('hidden');
      }
      return;
    }

    var empty2 = document.getElementById('prescribe-recs-empty');
    if (empty2) empty2.classList.add('hidden');

    var html = '';
    recommendations.forEach(function (rec) {
      var isInCart = cart.some(function (c) { return c.item.id === rec.id; });
      html += '<div class="rec-card' + (isInCart ? ' rec-card-selected' : '') + '" data-item-id="' + rec.id + '">';

      // Header (with action button inline)
      html += '<div class="rec-header">';
      html += '<div class="rec-rank">#' + rec.rank + '</div>';
      html += productThumb(rec.item);
      html += '<div class="rec-name-wrap">';
      html += '<div class="rec-name">' + escHtml(rec.item_name) + '</div>';
      html += '<div class="rec-brand">' + escHtml(rec.brand || '') + '</div>';
      html += '</div>';
      html += '<span class="chip chip-type">' + escHtml(rec.type || '') + '</span>';
      if (isInCart) {
        html += '<button class="btn btn-sm btn-ghost btn-remove-from-cart" data-item-id="' + rec.id + '">Remove</button>';
      } else {
        html += '<button class="btn btn-sm btn-primary btn-add-to-cart" data-item-id="' + rec.id + '">+ Prescribe</button>';
      }
      html += '</div>';

      // Scores bar (inline)
      html += '<div class="rec-scores">';
      html += '<div class="score-bar">';
      html += '<div class="score-fill score-clinical" style="width:' + Math.min(rec.clinicalScore, 200) / 2 + '%"></div>';
      html += '</div>';
      html += '<div class="score-labels">';
      html += '<span class="score-clickable" data-item-id="' + rec.id + '" title="Click for score breakdown">Clinical: ' + Math.round(rec.clinicalScore) + ' &middot; Final: ' + Math.round(rec.finalScore) + '</span>';
      html += '</div>';
      html += '</div>';

      // Details
      html += '<div class="rec-details">';
      if (rec.thc != null) html += '<span class="rec-detail">THC ' + rec.thc + '</span>';
      if (rec.cbd != null) html += '<span class="rec-detail">CBD ' + rec.cbd + '</span>';
      if (rec.retail_price) html += '<span class="rec-detail">$' + parseFloat(rec.retail_price).toFixed(2) + '</span>';
      html += '</div>';

      // Terpene profile (individual terpenes with % bars)
      if (rec.topTerpenes && rec.topTerpenes.length > 0) {
        // Build set of matched terpene names for highlighting
        var matchedSet = {};
        if (rec.matchedConditions) {
          rec.matchedConditions.forEach(function (mc) {
            if (mc.matchedTerpenes) {
              mc.matchedTerpenes.forEach(function (tn) { matchedSet[tn] = true; });
            }
          });
        }
        var totalTerp = 0;
        rec.topTerpenes.forEach(function (t) { totalTerp += t.value; });

        html += '<div class="rec-terpenes">';
        html += '<div class="rec-terpenes-header"><span class="rec-terpenes-label">Terpenes</span><span class="rec-terpenes-total">' + totalTerp.toFixed(1) + '% total</span></div>';
        rec.topTerpenes.forEach(function (t) {
          var isMatched = matchedSet[t.name];
          var barWidth = Math.min(t.value / 3 * 100, 100); // scale: 3% = full bar
          html += '<div class="rec-terp-row' + (isMatched ? ' terp-matched' : '') + '">';
          html += '<span class="rec-terp-name">' + escHtml(t.name) + (isMatched ? ' \u2713' : '') + '</span>';
          html += '<span class="rec-terp-bar"><span class="rec-terp-fill" style="width:' + barWidth + '%"></span></span>';
          html += '<span class="rec-terp-val">' + t.value.toFixed(2) + '%</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      // Tags
      if (rec.tags && rec.tags.length > 0) {
        html += '<div class="rec-tags">';
        rec.tags.forEach(function (tag) {
          var cls = 'chip-tag';
          if (tag === 'Drug Interaction Risk') cls = 'chip-warning';
          else if (tag === 'Non-Psychoactive') cls = 'chip-safe';
          else if (tag === 'Budget Pick') cls = 'chip-budget';
          else if (tag === 'Category Fallback') cls = 'chip-fallback';
          html += '<span class="chip ' + cls + '">' + escHtml(tag) + '</span>';
        });
        html += '</div>';
      }

      // Reasoning
      if (rec.reasoning && rec.reasoning.length > 0) {
        html += '<div class="rec-reasoning">';
        rec.reasoning.forEach(function (r) {
          html += '<div class="rec-reason">' + escHtml(r) + '</div>';
        });
        html += '</div>';
      }

      // Contraindications
      if (rec.contraindications && rec.contraindications.length > 0) {
        html += '<div class="rec-contraindications">';
        rec.contraindications.forEach(function (c) {
          html += '<div class="rec-contra">' + escHtml(c) + '</div>';
        });
        html += '</div>';
      }

      // (action button is in the header row)

      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Render: Product Search Results ──
  function renderProductGrid(container, items) {
    if (!items || items.length === 0) {
      container.innerHTML = '';
      var empty = document.getElementById('prescribe-search-empty');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    var empty2 = document.getElementById('prescribe-search-empty');
    if (empty2) empty2.classList.add('hidden');

    var html = '';
    items.forEach(function (item) {
      var isInCart = cart.some(function (c) { return c.item.id === item.id; });
      html += '<div class="product-row' + (isInCart ? ' product-row-selected' : '') + '" data-item-id="' + item.id + '">';
      html += productThumb(item);
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
      html += '</div>';
      html += '<div class="product-actions">';
      if (isInCart) {
        html += '<button class="btn btn-sm btn-ghost btn-remove-from-cart" data-item-id="' + item.id + '">Remove</button>';
      } else {
        html += '<button class="btn btn-sm btn-primary btn-add-to-cart" data-item-id="' + item.id + '">+ Add</button>';
      }
      html += '</div>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Render: Unified Product Grid (with score data) ──
  function renderUnifiedProductGrid(container, items, scoreMap) {
    if (!items || items.length === 0) {
      container.innerHTML = '';
      var empty = document.getElementById('prescribe-search-empty');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    var empty2 = document.getElementById('prescribe-search-empty');
    if (empty2) empty2.classList.add('hidden');
    scoreMap = scoreMap || {};

    var html = '';
    items.forEach(function (item) {
      var isInCart = cart.some(function (c) { return c.item.id === item.id; });
      var sc = scoreMap[item.id];
      var hasScore = sc && sc.clinicalScore >= 50;

      html += '<div class="product-row' + (isInCart ? ' product-row-selected' : '') + (hasScore ? ' product-row-scored' : '') + '" data-item-id="' + item.id + '">';

      // Score badge (if scored)
      if (hasScore) {
        var scoreCls = sc.finalScore >= 80 ? 'score-high' : sc.finalScore >= 50 ? 'score-mid' : 'score-low';
        html += '<div class="product-score-badge score-clickable ' + scoreCls + '" data-item-id="' + item.id + '" title="Click for score breakdown">' + Math.round(sc.finalScore) + '</div>';
      }

      html += productThumb(item);
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

      // Terpene chips (top 3)
      var topTerps = window.RecommendEngine.getTopTerpenes(item, 3);
      if (topTerps && topTerps.length > 0) {
        html += '<div class="product-terpene-chips">';
        topTerps.forEach(function (t) {
          html += '<span class="terpene-chip">' + escHtml(t.name) + ' ' + t.value.toFixed(1) + '%</span>';
        });
        html += '</div>';
      }

      // Match reasoning (if scored)
      if (hasScore && sc.reasoning && sc.reasoning.length > 0) {
        html += '<div class="product-match-reason">' + escHtml(sc.reasoning[0]) + '</div>';
      }
      // Contraindication (if any)
      if (hasScore && sc.contraindications && sc.contraindications.length > 0) {
        html += '<div class="product-contra">' + escHtml(sc.contraindications[0]) + '</div>';
      }

      html += '</div>';
      html += '<div class="product-actions">';
      if (isInCart) {
        html += '<button class="btn btn-sm btn-ghost btn-remove-from-cart" data-item-id="' + item.id + '">Remove</button>';
      } else {
        html += '<button class="btn btn-sm btn-primary btn-add-to-cart" data-item-id="' + item.id + '">+ Prescribe</button>';
      }
      html += '</div>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Render: Cart Sidebar ──
  function renderCartSidebar() {
    var container = document.getElementById('cart-items');
    var countEl = document.getElementById('cart-count');
    var footerEl = document.getElementById('cart-footer');
    if (!container) return;

    if (countEl) countEl.textContent = cart.length;
    if (footerEl) footerEl.style.display = cart.length > 0 ? '' : 'none';

    if (cart.length === 0) {
      container.innerHTML = '<div class="cart-empty">Select products from recommendations or search to add them here.</div>';
      return;
    }

    var html = '';
    cart.forEach(function (entry) {
      var item = entry.item;
      html += '<div class="cart-item" data-item-id="' + item.id + '">';
      html += '<div class="cart-item-header">';
      html += productThumb(item, 'cart-thumb');
      html += '<div class="cart-item-name">' + escHtml(item.item_name || '') + '</div>';
      html += '<button class="cart-item-remove btn-remove-from-cart" data-item-id="' + item.id + '" title="Remove">&times;</button>';
      html += '</div>';
      html += '<div class="cart-item-meta">';
      html += '<span>' + escHtml(item.brand || '') + '</span>';
      if (item.type) html += ' &middot; <span>' + escHtml(item.type) + '</span>';
      if (item.retail_price) html += ' &middot; $' + parseFloat(item.retail_price).toFixed(2);
      html += '</div>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Route of administration options (maps from item dosage_form) ──
  var ROUTE_OPTIONS = [
    'inhalation route',
    'oral route',
    'sublingual route',
    'topical route',
    'oromucosal route'
  ];

  function defaultRoute(item) {
    var form = (item.dosage_form || item.type || '').toLowerCase();
    if (form.indexOf('inhalation') !== -1 || form === 'flower' || form === 'vape') return 'inhalation route';
    if (form.indexOf('oral') !== -1 || form === 'edible' || form.indexOf('capsule') !== -1) return 'oral route';
    if (form.indexOf('sublingual') !== -1 || form === 'oil' || form.indexOf('tincture') !== -1) return 'sublingual route';
    if (form.indexOf('topical') !== -1) return 'topical route';
    if (form.indexOf('spray') !== -1 || form.indexOf('oromucosal') !== -1) return 'oromucosal route';
    return '';
  }

  function defaultValidUntil() {
    var d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  }

  // ── Clinical Justification Generator ──
  var EXP_LABELS = { 1: 'naive', 2: 'beginner', 3: 'moderate', 4: 'experienced', 5: 'expert' };

  function generateClinicalJustification(item, recommendation, intakeData) {
    if (!item || !recommendation || !intakeData) return '';

    var RE = window.RecommendEngine;
    var conditions = [];
    if (intakeData.conditions && intakeData.conditions.length) {
      conditions = intakeData.conditions;
    } else if (intakeData.primaryConditions && intakeData.primaryConditions.length) {
      conditions = intakeData.primaryConditions;
    }
    var conditionText = conditions.length > 0 ? conditions.join(', ') : 'their condition';

    var expLevel = parseInt(intakeData.experienceLevel || intakeData.experience_level) || 3;
    var expLabel = EXP_LABELS[expLevel] || 'moderate';

    var thcVal = item.thc != null ? item.thc : '—';
    var cbdVal = item.cbd != null ? item.cbd : '—';

    var topTerps = RE ? RE.getTopTerpenes(item, 3) : [];
    var totalTerp = RE ? RE.getTotalTerpenePercent(item) : 0;
    var terpNames = topTerps.map(function (t) { return t.name + ' (' + t.value.toFixed(1) + '%)'; });
    var terpText = terpNames.length > 0 ? terpNames.join(', ') : 'no significant terpenes detected';

    var productName = (item.item_name || '') + (item.brand ? ' (' + item.brand + ')' : '');

    // Build the justification paragraph
    var text = 'The patient discussed ' + conditionText + ' and has ' + expLabel + ' experience with cannabis (Level ' + expLevel + '). ';
    text += 'After consideration, I have recommended ' + productName + ' due to the THC being ' + thcVal + ' and CBD being ' + cbdVal;

    if (totalTerp > 0) {
      text += ' and the total terpenes being ' + totalTerp.toFixed(1) + '% which predominantly are ' + terpText + '.';
    } else {
      text += '.';
    }

    // Condition-specific reasoning from matched conditions
    if (recommendation.matchedConditions && recommendation.matchedConditions.length > 0) {
      text += ' This product profile has been matched to the following conditions: ';
      var condParts = [];
      var allRefs = [];
      recommendation.matchedConditions.forEach(function (mc) {
        var part = mc.condition + ' (Evidence Grade ' + mc.evidence_grade + ')';
        if (mc.matchedTerpenes && mc.matchedTerpenes.length > 0) {
          part += ' — matched terpenes: ' + mc.matchedTerpenes.join(', ');
        }
        condParts.push(part);
        // Collect references
        if (mc.condition && SD.CONDITION_REFERENCES) {
          var ref = SD.CONDITION_REFERENCES[mc.condition];
          if (ref) allRefs.push(mc.condition + ': ' + ref);
        }
      });
      text += condParts.join('; ') + '.';

      // Append references
      if (allRefs.length > 0) {
        text += '\n\nReferences:\n' + allRefs.join('\n');
      }
    }

    text += '\n\nWe will monitor the patient\'s response and adjust as needed.';

    return text;
  }

  // Generate justification for all cart items
  function generateAllJustifications(intakeData, recommendations) {
    var texts = [];
    cart.forEach(function (entry) {
      var rec = null;
      if (recommendations) {
        for (var i = 0; i < recommendations.length; i++) {
          if (String(recommendations[i].id) === String(entry.item.id)) {
            rec = recommendations[i];
            break;
          }
        }
      }
      if (rec) {
        texts.push(generateClinicalJustification(entry.item, rec, intakeData));
      }
    });
    return texts;
  }

  // ── Render: Script Creation Modal ──
  // intakeData + recommendations are optional — used to pre-populate clinical justification
  function renderScriptModal(container, intakeData, recommendations) {
    if (cart.length === 0) return;

    var validUntil = defaultValidUntil();
    var html = '';
    cart.forEach(function (entry, idx) {
      var item = entry.item;
      var route = defaultRoute(item);
      var dosage = entry.dosage || item.dosage_instructions || SD.DOSAGE_TEMPLATES[item.type] || '';

      // Auto-generate clinical justification if intake data available
      var justification = '';
      if (intakeData && recommendations) {
        var rec = null;
        for (var r = 0; r < recommendations.length; r++) {
          if (String(recommendations[r].id) === String(item.id)) { rec = recommendations[r]; break; }
        }
        if (rec) justification = generateClinicalJustification(item, rec, intakeData);
      }

      html += '<div class="script-modal-item" data-idx="' + idx + '">';

      // Product header with image
      html += '<div class="script-modal-header">';
      html += productThumb(item, 'cart-thumb');
      html += '<div>';
      html += '<strong>' + escHtml(item.item_name || '') + '</strong>';
      html += ' <span class="text-muted">' + escHtml(item.brand || '') + '</span>';
      html += '</div>';
      html += '</div>';

      // Row 1: Quantity + Dosage Instructions
      html += '<div class="form-row">';
      html += '<div class="form-group form-group-sm" style="max-width:100px">';
      html += '<label>Quantity</label>';
      html += '<div class="input-wrapper"><input type="number" class="script-qty" data-idx="' + idx + '" value="1" min="1" max="10"></div>';
      html += '</div>';
      html += '<div class="form-group form-group-sm" style="flex:1">';
      html += '<label>Dosage Instructions</label>';
      html += '<div class="input-wrapper"><textarea class="script-dosage" data-idx="' + idx + '" rows="2">' + escHtml(dosage) + '</textarea></div>';
      html += '</div>';
      html += '</div>';

      // Row 2: Route of Administration
      html += '<div class="form-group form-group-sm">';
      html += '<label>Route of Administration</label>';
      html += '<div class="input-wrapper"><select class="script-route" data-idx="' + idx + '">';
      html += '<option value="">Select...</option>';
      ROUTE_OPTIONS.forEach(function (r) {
        html += '<option value="' + escAttr(r) + '"' + (r === route ? ' selected' : '') + '>' + escHtml(r) + '</option>';
      });
      html += '</select></div>';
      html += '</div>';

      // Row 3: Repeats + Interval Days + Dispense Quantity
      html += '<div class="form-row">';
      html += '<div class="form-group form-group-sm">';
      html += '<label>Repeats</label>';
      html += '<div class="input-wrapper"><input type="number" class="script-repeats" data-idx="' + idx + '" value="' + (entry.repeats || 3) + '" min="0" max="20"></div>';
      html += '</div>';
      html += '<div class="form-group form-group-sm">';
      html += '<label>Interval Days</label>';
      html += '<div class="input-wrapper"><input type="number" class="script-interval" data-idx="' + idx + '" value="7" min="1" max="90"></div>';
      html += '</div>';
      html += '<div class="form-group form-group-sm">';
      html += '<label>Dispense Quantity</label>';
      html += '<div class="input-wrapper"><input type="number" class="script-dispense-qty" data-idx="' + idx + '" value="1" min="1" max="10"></div>';
      html += '</div>';
      html += '</div>';

      // Row 4: Valid Until + Condition
      html += '<div class="form-row">';
      html += '<div class="form-group form-group-sm">';
      html += '<label>Valid Until</label>';
      html += '<div class="input-wrapper"><input type="date" class="script-valid-until" data-idx="' + idx + '" value="' + validUntil + '"></div>';
      html += '</div>';
      html += '<div class="form-group form-group-sm">';
      html += '<label>Condition</label>';
      html += '<div class="input-wrapper"><input type="text" class="script-condition" data-idx="' + idx + '" value="' + escAttr(entry.condition) + '" placeholder="e.g. Chronic Pain"></div>';
      html += '</div>';
      html += '</div>';

      // Row 5: Doctor Notes To Pharmacy (pre-populated with clinical justification if available)
      html += '<div class="form-group form-group-sm">';
      html += '<label>Doctor Notes To Pharmacy' + (justification ? ' <span class="text-muted">(auto-generated — edit as needed)</span>' : '') + '</label>';
      html += '<div class="input-wrapper"><textarea class="script-pharmacy-notes" data-idx="' + idx + '" rows="' + (justification ? '6' : '2') + '" placeholder="Doctor Notes To Pharmacy">' + escHtml(justification) + '</textarea></div>';
      html += '</div>';

      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Collect script data from modal ──
  function collectScriptData(doctorId, patientId, appointmentId) {
    var scripts = [];
    cart.forEach(function (entry, idx) {
      var val = function (cls) {
        var el = document.querySelector('.' + cls + '[data-idx="' + idx + '"]');
        return el ? el.value : '';
      };

      scripts.push({
        doctor_id: doctorId,
        patient_id: patientId,
        drug_id: entry.item.id,
        appointment_id: appointmentId,
        repeats: parseInt(val('script-repeats')) || 3,
        interval_days: parseInt(val('script-interval')) || 7,
        dispense_qty: parseInt(val('script-dispense-qty')) || 1,
        supply_limit: parseInt(val('script-repeats')) || 3,
        dosage_instructions: val('script-dosage') || entry.dosage,
        route: val('script-route'),
        condition: val('script-condition') || entry.condition,
        valid_until: val('script-valid-until'),
        doctor_notes_pharmacy: val('script-pharmacy-notes')
      });
    });
    return scripts;
  }

  // ── Render: Score Breakdown Popover ──
  function renderScoreBreakdown(rec) {
    if (!rec || !rec.scoreBreakdown) return '';
    var bd = rec.scoreBreakdown;
    var p = bd.pipeline || {};
    var html = '<div class="score-breakdown">';
    html += '<div class="score-breakdown-title">Score Breakdown: ' + escHtml(rec.item_name) + '</div>';
    html += '<table class="score-breakdown-table">';
    html += '<thead><tr><th>Step</th><th>Rule / Detail</th><th>Result</th></tr></thead>';
    html += '<tbody>';

    // ── FILTER STEPS (1-3) ──
    html += sectionHeader('Pipeline Filters');

    // Step 1
    if (p.step1) {
      html += filterRow('1. Hard Filter', p.step1.rule, p.step1.input, p.step1.passed, p.step1.removed);
    }

    // Step 2
    if (p.step2) {
      html += filterRow('2. Safety', p.step2.rule, p.step2.input, p.step2.passed, p.step2.removed);
    }

    // Step 3
    if (p.step3) {
      html += filterRow('3. Experience', p.step3.rule, p.step3.input, p.step3.passed, p.step3.removed);
    }

    // ── SCORING STEPS (4-8) ──
    html += sectionHeader('Clinical Scoring');

    // Step 4 — Conditions
    var s4 = bd.step4_conditions;
    if (s4.detail && s4.detail.length > 0) {
      s4.detail.forEach(function (mc) {
        var detail = mc.condition + ' (Grade ' + mc.evidence_grade + ')';
        if (mc.reasons && mc.reasons.length) detail += ' — ' + mc.reasons.join(', ');
        html += scoreRow('4. Condition', detail, mc.score);
      });
    } else {
      html += scoreRow('4. Condition', 'No condition match', 0);
    }

    // Step 5 — Terpene depth
    var t5 = bd.step5_terpene_depth;
    var terpRule = 'Total terpene: ' + (t5.totalPct || 0).toFixed(1) + '%';
    if (t5.totalPct > 3) terpRule += ' (>3% = +20)';
    else if (t5.totalPct > 2) terpRule += ' (>2% = +10)';
    else terpRule += ' (<2% = no bonus)';
    html += scoreRow('5. Terpene depth', terpRule, t5.points);

    // Step 6 — Paul Rating
    var pr = bd.step6_paul_rating;
    var paulRule = pr.rating > 0 ? 'Rating: ' + pr.rating + ' → min(' + pr.rating + ', 5) × 5' : 'No rating';
    html += scoreRow('6. Paul Rating', paulRule, pr.points);

    // Step 2 adj — Safety score adjustment
    html += scoreRow('2b. Safety adj', bd.step2_safety_adj.flags.length ? bd.step2_safety_adj.flags.join(', ') : 'No adjustments', bd.step2_safety_adj.points, bd.step2_safety_adj.points < 0);

    // Step 7 — Priority/Profit flags
    var s7parts = [];
    if (bd.step7_priority_profit.prioritise) s7parts.push('Prioritised (+15)');
    if (bd.step7_priority_profit.highProfit) s7parts.push('High Profit (+20, only if clinical ≥ 50)');
    html += scoreRow('7. Priority/Profit', s7parts.length ? s7parts.join(', ') : 'Not flagged', bd.step7_priority_profit.points);

    // Step 8 — Expiry
    var expVal = bd.step8_expiry.expiryScore;
    var expRule = expVal == null || expVal === '' ? 'No expiry score (treated as 100)' : 'Expiry score: ' + expVal + (num(expVal) < 30 ? ' (<30 = -10)' : ' (≥30 = no deduction)');
    html += scoreRow('8. Expiry', expRule, bd.step8_expiry.points, bd.step8_expiry.points < 0);

    // Clinical subtotal
    html += '<tr class="score-breakdown-subtotal"><td></td><td><strong>Clinical Total</strong></td><td class="score-pos"><strong>+' + bd.clinical_total + '</strong></td></tr>';

    // ── THRESHOLD + RANKING (9-11) ──
    html += sectionHeader('Threshold & Ranking');

    // Step 9 — Clinical threshold
    var s9 = bd.step9_threshold;
    var s9Rule = 'Score ' + s9.score + (s9.passed ? ' ≥ ' : ' < ') + s9.threshold;
    var isFallback = rec.tags && rec.tags.indexOf('Category Fallback') !== -1;
    if (!s9.passed && isFallback) s9Rule += ' — included as Category Fallback';
    html += '<tr><td class="score-step">9. Threshold</td><td>' + escHtml(s9Rule) + '</td><td class="' + (s9.passed ? 'score-pos' : isFallback ? 'score-zero' : 'score-neg') + '">' + (s9.passed ? 'PASS' : isFallback ? 'FALLBACK' : 'FAIL') + '</td></tr>';

    // Step 10 — Profitability
    var s10 = bd.step10_profit;
    html += scoreRow('10. Profitability', 'GP: ' + s10.profitPct.toFixed(1) + '% → normalised ' + Math.round(s10.profitabilityScore) + '/100 (range ' + s10.minProfit.toFixed(0) + '–' + s10.maxProfit.toFixed(0) + '%)', Math.round(s10.profitabilityScore * 0.5));

    // Step 11 — Category guarantee
    var catTags = (rec.tags || []).filter(function (t) { return t === 'Category Fallback' || t === 'Budget Pick'; });
    var s11Rule = catTags.length ? catTags.join(', ') : 'Standard ranking (no category adjustment)';
    html += '<tr><td class="score-step">11. Category</td><td>' + escHtml(s11Rule) + '</td><td></td></tr>';

    // ── FINAL ──
    html += '<tr class="score-breakdown-total"><td></td><td><strong>Final Score</strong> = ' + escHtml(bd.final_calc) + '</td><td><strong>' + Math.round(rec.finalScore) + '</strong></td></tr>';

    html += '</tbody></table></div>';
    return html;
  }

  function sectionHeader(title) {
    return '<tr class="score-breakdown-section"><td colspan="3">' + title + '</td></tr>';
  }

  function filterRow(step, rule, input, passed, removed) {
    return '<tr><td class="score-step">' + step + '</td><td>' + escHtml(rule) + '</td><td class="score-zero">' + passed + '/' + input + ' <span style="color:#991b1b">(-' + removed + ')</span></td></tr>';
  }

  function scoreRow(step, detail, points, isNeg) {
    var cls = points > 0 ? 'score-pos' : points < 0 ? 'score-neg' : 'score-zero';
    if (isNeg) cls = 'score-neg';
    var prefix = points > 0 ? '+' : '';
    return '<tr><td class="score-step">' + step + '</td><td>' + escHtml(detail) + '</td><td class="' + cls + '">' + prefix + points + '</td></tr>';
  }

  // ── Render: Similar Products Panel ──
  function renderSimilarProducts(container, sourceItem, similarResults) {
    if (!container) return;

    if (!similarResults || similarResults.length === 0) {
      container.innerHTML = '<div class="similar-empty">No similar products currently in stock for this type.</div>';
      return;
    }

    var html = '<div class="similar-header">';
    html += '<span class="similar-source">Alternatives to <strong>' + escHtml(sourceItem.item_name) + '</strong></span>';
    if (similarResults.length < 3) {
      html += '<span class="similar-notice">Only ' + similarResults.length + ' similar product' + (similarResults.length > 1 ? 's' : '') + ' available.</span>';
    }
    html += '</div>';

    similarResults.forEach(function (result) {
      var item = result.item;
      var ml = result.matchLabel;
      var isInCart = cart.some(function (c) { return c.item.id === item.id; });

      html += '<div class="similar-card" data-item-id="' + item.id + '">';

      // Single row: match badge + image + name + details + action
      html += '<div class="similar-card-row">';
      html += '<span class="similar-match ' + ml.cls + '">' + result.score + '</span>';
      html += productThumb(item);
      html += '<div class="similar-card-info">';
      html += '<div class="similar-card-name">' + escHtml(item.item_name || '') + '</div>';
      html += '<div class="similar-card-meta">';
      html += '<span>' + escHtml(item.brand || '') + '</span>';
      if (item.thc != null && num(item.thc) > 0) html += '<span>THC ' + item.thc + '</span>';
      if (item.cbd != null && num(item.cbd) > 0) html += '<span>CBD ' + item.cbd + '</span>';
      if (item.retail_price) html += '<span>$' + parseFloat(item.retail_price).toFixed(2) + '</span>';
      html += '</div>';
      html += '</div>';
      if (isInCart) {
        html += '<button class="btn btn-sm btn-ghost btn-remove-from-cart" data-item-id="' + item.id + '">Remove</button>';
      } else {
        html += '<button class="btn btn-sm btn-primary btn-add-to-cart" data-item-id="' + item.id + '">+ Prescribe</button>';
      }
      html += '</div>';

      html += '</div>';
    });

    container.innerHTML = html;
  }

  function num(v) {
    if (v == null || v === '') return 0;
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // ── Product thumbnail (image or type-based fallback icon) ──
  var TYPE_ICONS = {
    'Flower': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M12 2C8 2 4 6 4 10c0 3 2 5 4 6l-1 6h10l-1-6c2-1 4-3 4-6 0-4-4-8-8-8z"/></svg>',
    'Oil': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M10 2v6l-3 4v8a2 2 0 002 2h6a2 2 0 002-2v-8l-3-4V2"/><line x1="9" y1="2" x2="15" y2="2"/></svg>',
    'Vape': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="9" y="2" width="6" height="20" rx="3"/><line x1="12" y1="6" x2="12" y2="10"/></svg>',
    'Edible': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>',
    'default': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
  };

  function productThumb(item, extraClass) {
    var cls = 'product-thumb' + (extraClass ? ' ' + extraClass : '');
    if (item.item_image) {
      return '<img class="' + cls + '" src="' + escAttr(item.item_image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    }
    var icon = TYPE_ICONS[item.type] || TYPE_ICONS['default'];
    return '<div class="' + cls + ' product-thumb-icon">' + icon + '</div>';
  }

  // ── HTML escaping ──
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return escHtml(str).replace(/'/g, '&#39;');
  }

  // ── Editable Intake Form (for workspace) ──
  var ALL_CONDITIONS = [
    'Chronic Pain','Anxiety','Depression','PTSD','ADHD','Sleep Disorder','Epilepsy',
    'Fibromyalgia','Arthritis','Migraines','Nausea / Vomiting','Endometriosis',
    "Crohn's / IBS",'Multiple Sclerosis','Inflammation','Neuropathic Pain','Cancer',
    "Parkinson's Disease",'Loss of Appetite','Autism Spectrum','Glaucoma',
    'Chronic Illness (other)','Palliative Care'
  ];

  function renderEditableIntake(container, intakeData) {
    var d = intakeData || {};
    var html = '<div class="editable-intake">';

    // Conditions (checkbox grid)
    html += '<div class="ei-section">';
    html += '<div class="ei-label">Conditions</div>';
    html += '<div class="ei-checkbox-grid">';
    ALL_CONDITIONS.forEach(function (c) {
      var checked = (d.primaryConditions || []).indexOf(c) !== -1;
      html += '<label class="ei-checkbox"><input type="checkbox" name="ei-condition" value="' + escAttr(c) + '"' + (checked ? ' checked' : '') + '> ' + escHtml(c) + '</label>';
    });
    html += '</div></div>';

    // Experience Level
    html += '<div class="ei-row">';
    html += '<div class="ei-field"><div class="ei-label">Experience Level</div>';
    html += '<select id="ei-experience">';
    for (var lv = 1; lv <= 5; lv++) {
      var lvLabels = {1:'Naive',2:'Beginner',3:'Moderate',4:'Experienced',5:'Expert'};
      html += '<option value="' + lv + '"' + (d.experienceLevel == lv ? ' selected' : '') + '>Level ' + lv + ' \u2014 ' + lvLabels[lv] + '</option>';
    }
    html += '</select></div>';

    // THC Comfort
    html += '<div class="ei-field"><div class="ei-label">THC Comfort</div>';
    html += '<select id="ei-thc-comfort">';
    ['CBD only','Mostly CBD','Balanced','Mostly THC','Open to anything'].forEach(function (opt) {
      html += '<option value="' + escAttr(opt) + '"' + (d.thcComfort === opt ? ' selected' : '') + '>' + escHtml(opt) + '</option>';
    });
    html += '</select></div>';

    // Budget
    html += '<div class="ei-field"><div class="ei-label">Budget</div>';
    html += '<select id="ei-budget">';
    ['','Under $150','$150 \u2013 $250','$250 \u2013 $400','$400+','No preference'].forEach(function (opt) {
      html += '<option value="' + escAttr(opt) + '"' + (d.budgetRange === opt ? ' selected' : '') + '>' + (opt || 'Not specified') + '</option>';
    });
    html += '</select></div>';
    html += '</div>';

    // Medications + Allergies
    html += '<div class="ei-row">';
    html += '<div class="ei-field ei-field-wide"><div class="ei-label">Current Medications</div>';
    html += '<textarea id="ei-medications" rows="2" placeholder="List medications and supplements...">' + escHtml(d.medications || '') + '</textarea></div>';
    html += '<div class="ei-field"><div class="ei-label">Allergies</div>';
    html += '<textarea id="ei-allergies" rows="2" placeholder="Including carrier oil allergies...">' + escHtml(d.allergies || '') + '</textarea></div>';
    html += '</div>';

    // Safety flags (read-only display)
    var flags = [];
    if (d.psychiatricHistory && d.psychiatricHistory.length > 0) flags.push({l: d.psychiatricHistory.join(', '), t: 'danger'});
    if (d.pregnancyStatus === 'Yes') flags.push({l: 'Pregnant / Breastfeeding', t: 'danger'});
    if (d.drivesRegularly && d.drivesRegularly !== 'No') flags.push({l: 'Professional Driver', t: 'warning'});
    if (flags.length > 0) {
      html += '<div class="ei-section"><div class="ei-label">Safety Flags</div>';
      html += '<div class="intake-flags" style="margin:0">';
      flags.forEach(function (f) { html += '<span class="chip chip-' + f.t + '">' + escHtml(f.l) + '</span>'; });
      html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // Collect current values from the editable form
  function collectEditableIntake() {
    var conditions = [];
    document.querySelectorAll('input[name="ei-condition"]:checked').forEach(function (cb) {
      conditions.push(cb.value);
    });
    var expEl = document.getElementById('ei-experience');
    var thcEl = document.getElementById('ei-thc-comfort');
    var budgetEl = document.getElementById('ei-budget');
    var medsEl = document.getElementById('ei-medications');
    var allergiesEl = document.getElementById('ei-allergies');

    return {
      primaryConditions: conditions,
      experienceLevel: expEl ? expEl.value : '3',
      thcComfort: thcEl ? thcEl.value : '',
      budgetRange: budgetEl ? budgetEl.value : '',
      medications: medsEl ? medsEl.value : '',
      allergies: allergiesEl ? allergiesEl.value : ''
    };
  }

  // ── Render: Edit Script Modal (matches Create Script layout) ──
  function renderEditScriptModal(script, drug) {
    var item = drug || {};
    var route = script.route_of_administration || defaultRoute(item);
    var dosage = script.dosage_instructions || item.dosage_instructions || SD.DOSAGE_TEMPLATES[item.type] || '';
    var validRaw = script.valid_until;
    var validUntil = '';
    if (validRaw) {
      // Handle unix timestamp or ISO string
      var d = parseInt(validRaw) > 1e9 ? new Date(parseInt(validRaw) * 1000) : new Date(validRaw);
      if (!isNaN(d.getTime())) validUntil = d.toISOString().split('T')[0];
    }
    if (!validUntil) validUntil = defaultValidUntil();

    var html = '';

    // Product header with image
    html += '<div class="script-modal-header">';
    html += productThumb(item, 'cart-thumb');
    html += '<div>';
    html += '<strong>' + escHtml(item.item_name || 'Unknown medication') + '</strong>';
    html += ' <span class="text-muted">' + escHtml(item.brand || '') + '</span>';
    html += '</div>';
    html += '</div>';

    // Row 1: Quantity + Dosage Instructions
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-sm" style="max-width:100px">';
    html += '<label>Quantity</label>';
    html += '<div class="input-wrapper"><input type="number" id="edit-script-qty" value="' + (script.dispense_quantity || 1) + '" min="1" max="10"></div>';
    html += '</div>';
    html += '<div class="form-group form-group-sm" style="flex:1">';
    html += '<label>Dosage Instructions</label>';
    html += '<div class="input-wrapper"><textarea id="edit-script-dosage" rows="2">' + escHtml(dosage) + '</textarea></div>';
    html += '</div>';
    html += '</div>';

    // Row 2: Route of Administration
    html += '<div class="form-group form-group-sm">';
    html += '<label>Route of Administration</label>';
    html += '<div class="input-wrapper"><select id="edit-script-route">';
    html += '<option value="">Select...</option>';
    ROUTE_OPTIONS.forEach(function (r) {
      html += '<option value="' + escAttr(r) + '"' + (r === route ? ' selected' : '') + '>' + escHtml(r) + '</option>';
    });
    html += '</select></div>';
    html += '</div>';

    // Row 3: Repeats + Interval Days + Dispense Quantity
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-sm">';
    html += '<label>Repeats</label>';
    html += '<div class="input-wrapper"><input type="number" id="edit-script-repeats" value="' + (script.repeats || 3) + '" min="0" max="20"></div>';
    html += '</div>';
    html += '<div class="form-group form-group-sm">';
    html += '<label>Interval Days</label>';
    html += '<div class="input-wrapper"><input type="number" id="edit-script-interval" value="' + (script.interval_days || 7) + '" min="1" max="90"></div>';
    html += '</div>';
    html += '<div class="form-group form-group-sm">';
    html += '<label>Dispense Quantity</label>';
    html += '<div class="input-wrapper"><input type="number" id="edit-script-dispense-qty" value="' + (script.dispense_quantity || 1) + '" min="1" max="10"></div>';
    html += '</div>';
    html += '</div>';

    // Row 4: Valid Until + Condition
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-sm">';
    html += '<label>Valid Until</label>';
    html += '<div class="input-wrapper"><input type="date" id="edit-script-valid-until" value="' + validUntil + '"></div>';
    html += '</div>';
    html += '<div class="form-group form-group-sm">';
    html += '<label>Condition</label>';
    html += '<div class="input-wrapper"><input type="text" id="edit-script-condition" value="' + escAttr(script.condition || '') + '" placeholder="e.g. Chronic Pain"></div>';
    html += '</div>';
    html += '</div>';

    // Row 5: Doctor Notes To Pharmacy
    html += '<div class="form-group form-group-sm">';
    html += '<label>Doctor Notes To Pharmacy</label>';
    html += '<div class="input-wrapper"><textarea id="edit-script-pharmacy-notes" rows="2" placeholder="Doctor Notes To Pharmacy">' + escHtml(script.doctor_notes_to_pharmacy || '') + '</textarea></div>';
    html += '</div>';

    return html;
  }

  // ── Expose ──
  window.Prescribe = {
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    getCart: getCart,
    renderIntakeSummary: renderIntakeSummary,
    renderRecommendationCards: renderRecommendationCards,
    renderProductGrid: renderProductGrid,
    renderUnifiedProductGrid: renderUnifiedProductGrid,
    renderCartSidebar: renderCartSidebar,
    renderScriptModal: renderScriptModal,
    collectScriptData: collectScriptData,
    renderSimilarProducts: renderSimilarProducts,
    renderScoreBreakdown: renderScoreBreakdown,
    renderEditableIntake: renderEditableIntake,
    collectEditableIntake: collectEditableIntake,
    renderEditScriptModal: renderEditScriptModal,
    generateClinicalJustification: generateClinicalJustification,
    generateAllJustifications: generateAllJustifications,
    productThumb: productThumb
  };
})();
