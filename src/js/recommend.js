// thc-clinicians-portal — Product Recommendation Engine
// 12-step scoring algorithm. Pure functions, no DOM access.
// Depends on: science-data.js (window.ScienceData)
(function () {
  'use strict';

  var SD = window.ScienceData;

  // ── Utility: Parse numeric value (handles strings, nulls) ──
  function num(v) {
    if (v == null || v === '') return 0;
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // ── Utility: Check if item is psychoactive ──
  // The psychoactive field has 4 values: "Yes", "Mild/Moderate", "No", null.
  // An item is psychoactive if: field is "Yes" or "Mild/Moderate", OR THC > 0.
  function isPsychoactive(item) {
    if (item.psychoactive === 'Yes' || item.psychoactive === 'Mild/Moderate' || item.psychoactive === true) return true;
    if (num(item.thc) > 0) return true;
    return false;
  }

  // ── Utility: Get product's total terpene % from individual columns ──
  function getTotalTerpenePercent(item) {
    var fields = SD.TERPENE_FIELD_MAP;
    var total = 0;
    for (var field in fields) {
      total += num(item[field]);
    }
    // Cap at 30% — some broad-spectrum oils show 78%+
    return Math.min(total, 30);
  }

  // ── Utility: Get top N terpenes by value from an item ──
  function getTopTerpenes(item, n) {
    var fields = SD.TERPENE_FIELD_MAP;
    var terpenes = [];
    for (var field in fields) {
      var val = num(item[field]);
      if (val > 0) {
        terpenes.push({ field: field, name: fields[field], value: val });
      }
    }
    terpenes.sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name); // alphabetical tiebreaker
    });
    return terpenes.slice(0, n || 3);
  }

  // ── Utility: Determine cannabinoid ratio category from THC/CBD values ──
  function getRatioCategory(thc, cbd) {
    if (cbd > 0 && thc === 0) return 'cbd_dominant';
    if (thc > 0 && cbd === 0) return 'thc_dominant';
    if (thc > 0 && cbd > 0) {
      if (thc / cbd > 3) return 'thc_dominant';
      if (cbd / thc > 3) return 'cbd_dominant';
      return 'balanced';
    }
    return 'unknown';
  }

  // ── Utility: Check if a ratio matches (with leniency for "leaning") ──
  function ratioMatches(productRatio, idealRatio) {
    if (idealRatio === productRatio) return true;
    // thc_leaning matches both thc_dominant and balanced
    if (idealRatio === 'thc_leaning') return productRatio === 'thc_dominant' || productRatio === 'balanced';
    // cbd_leaning matches both cbd_dominant and balanced
    if (idealRatio === 'cbd_leaning') return productRatio === 'cbd_dominant' || productRatio === 'balanced';
    return false;
  }

  // ── Utility: Calculate Price per mg by product type ──
  function calculatePricePerMg(item) {
    var retail = num(item.retail_price);
    if (retail <= 0) return 0;
    var type = (item.type || '').toLowerCase();
    var packSize = num(item.pack_size);
    var thc = num(item.thc);
    var strength = num(item.strength_1);

    if (type === 'flower') {
      // Retail / (pack_size_g × 1000 × THC_pct / 100)
      var denominator = packSize * 1000 * thc / 100;
      return denominator > 0 ? retail / denominator : 0;
    }
    if (type === 'oil') {
      // Retail / (volume_mL × THC_mg_per_mL)
      // For oils, thc is mg/mL and pack_size is mL
      var denom = packSize * thc;
      return denom > 0 ? retail / denom : 0;
    }
    if (type === 'vape' || type === 'liquid vape cartridge') {
      // Retail / Strength_1_mg
      return strength > 0 ? retail / strength : 0;
    }
    if (type === 'edible') {
      // Retail / (Strength_1_mg × Units_per_Pack)
      // units_per_pack may be stored differently — check quantity_unit
      var units = num(item.units_per_pack) || 1;
      var d = strength * units;
      return d > 0 ? retail / d : 0;
    }
    return 0;
  }

  // ── Utility: Calculate Profit % (ALWAYS recalculate, never trust stored) ──
  function calculateProfitPct(item) {
    var retail = num(item.retail_price);
    var wholesale = num(item.wholesale_price);
    if (retail <= 0 || wholesale <= 0 || wholesale > retail) return 0;
    return (retail - wholesale) / retail * 100;
  }

  // ── Utility: Normalize THC to a comparable scale ──
  // Flower = % (already normalized), Oil = mg/mL, Vape = mg total, Edible = mg/unit
  // We normalize everything to "effective potency on 0-100 scale" for comparison
  function normalizeTHC(value, type) {
    var v = num(value);
    var t = (type || '').toLowerCase();
    if (t === 'flower') return v; // already %
    if (t === 'oil') return v;    // mg/mL — compare directly within type
    if (t === 'vape' || t === 'liquid vape cartridge') return v; // mg total
    if (t === 'edible') return v; // mg/unit
    return v;
  }

  // ── STEP 1: Hard Filter (Availability) ──
  function hardFilter(items) {
    var now = Math.floor(Date.now() / 1000);
    return items.filter(function (item) {
      if (item.status !== 'In Stock') return false;
      if ((item.type || '').toLowerCase() === 'accessory') return false;
      if (num(item.retail_price) <= 0) return false;
      if (num(item.wholesale_price) <= 0) return false;
      // Expiry: score 0 + past date = exclude
      if (num(item.expiry_score) === 0 && item.expiry && num(item.expiry) < now) return false;
      return true;
    });
  }

  // ── STEP 2: Safety Exclusions ──
  function safetyExclusions(items, intake) {
    var flags = [];
    var hasPsychosis = intake.psychiatricHistory && intake.psychiatricHistory.some(function (h) {
      return h === 'Schizophrenia' || h === 'Psychosis';
    });
    var isPregnant = intake.pregnancyStatus === 'Yes' || intake.pregnancyStatus === 'Pregnant' ||
                     intake.breastfeeding === 'Yes';
    var age = intake.age ? parseInt(intake.age) : null;
    var isYoung = age != null && age < 21;
    var isProfessionalDriver = intake.drivesRegularly === 'Yes, professional driver';
    var hasSSRI = intake.medications && /\b(ssri|sertraline|fluoxetine|paroxetine|citalopram|escitalopram|venlafaxine|duloxetine)\b/i.test(intake.medications);

    var result = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var thcVal = num(item.thc);
      var type = (item.type || '').toLowerCase();
      var psychoactive = isPsychoactive(item);
      var itemFlags = [];
      var excluded = false;
      var scoreAdj = 0;

      // Psychosis/schizophrenia: EXCLUDE high THC
      if (hasPsychosis && thcVal > 5) { excluded = true; continue; }

      // Pregnant/breastfeeding: EXCLUDE psychoactive
      if (isPregnant && psychoactive) { excluded = true; continue; }

      // Age < 21: penalty for flower, bonus for CBD-only
      if (isYoung) {
        if (type === 'flower') scoreAdj -= 30;
        if (!psychoactive) scoreAdj += 20;
      }

      // Professional driver: penalty for high THC psychoactive
      if (isProfessionalDriver && thcVal > 10 && psychoactive) {
        scoreAdj -= 30;
      }

      // SSRI: flag but don't exclude
      if (hasSSRI && thcVal > 10) {
        itemFlags.push('Drug Interaction Risk');
      }

      if (!excluded) {
        result.push({
          item: item,
          safetyFlags: itemFlags,
          safetyScoreAdj: scoreAdj
        });
      }
    }

    return { items: result, globalFlags: flags };
  }

  // ── STEP 3: Experience Level Filter ──
  function experienceLevelFilter(scoredItems, level) {
    var lvl = parseInt(level) || 3; // default moderate if unknown
    return scoredItems.filter(function (si) {
      var item = si.item;
      var thcVal = num(item.thc);
      var type = (item.type || '').toLowerCase();
      var psychoactive = isPsychoactive(item);

      if (lvl === 1) {
        // Naive: Flower THC ≤ 10%, Oil THC ≤ 5 mg/mL, EXCLUDE psychoactive flower
        if (type === 'flower') {
          if (psychoactive) return false;
          if (thcVal > 10) return false;
        }
        if (type === 'oil' && thcVal > 5) return false;
      } else if (lvl === 2) {
        // Beginner: Flower THC ≤ 20%, Oil ≤ 15 mg/mL
        if (type === 'flower' && thcVal > 20) return false;
        if (type === 'oil' && thcVal > 15) return false;
      } else if (lvl === 3) {
        // Moderate: Flower ≤ 25%
        if (type === 'flower' && thcVal > 25) return false;
      }
      // Level 4-5: no restrictions
      return true;
    });
  }

  // ── STEP 4: Condition Matching (Primary Clinical Score) ──
  function conditionMatch(item, patientConditions, scienceData) {
    var totalScore = 0;
    var reasoning = [];
    var matchedConditions = [];

    // Get product's ratio
    var thcVal = num(item.thc);
    var cbdVal = num(item.cbd);
    var productRatio = getRatioCategory(thcVal, cbdVal);
    var topTerpenes = getTopTerpenes(item, 4);
    var topTerpeneNames = topTerpenes.map(function (t) { return t.name; });

    // Product's minor cannabinoids
    var itemCBG = num(item.cbg);
    var itemCBN = num(item.cbn);
    var itemCBC = num(item.cbc);

    for (var i = 0; i < patientConditions.length; i++) {
      var condName = patientConditions[i];
      // Find matching Science Data profile(s)
      var profiles = findConditionProfiles(condName, scienceData);

      for (var p = 0; p < profiles.length; p++) {
        var profile = profiles[p];
        var condScore = 0;
        var condReasons = [];

        // Step 4A — Profile-based matching (up to 130 pts per condition)

        // Cannabinoid ratio match: +40 pts
        if (ratioMatches(productRatio, profile.ideal_ratio)) {
          condScore += 40;
          condReasons.push(productRatio + ' ratio matches');
        }

        // Terpene matching: +20 pts each (cap 3 = max 60)
        var terpeneMatches = 0;
        var matchedTerpeneNames = [];
        for (var t = 0; t < profile.primary_terpenes.length && terpeneMatches < 3; t++) {
          if (topTerpeneNames.indexOf(profile.primary_terpenes[t]) !== -1) {
            condScore += 20;
            terpeneMatches++;
            matchedTerpeneNames.push(profile.primary_terpenes[t]);
          }
        }
        if (terpeneMatches > 0) {
          condReasons.push(terpeneMatches + ' key terpene' + (terpeneMatches > 1 ? 's' : '') + ' (' + matchedTerpeneNames.join(', ') + ')');
        }

        // Minor cannabinoid matching: +10 pts each (max 30)
        var minorMatches = 0;
        if (profile.primary_minor_cannabinoids) {
          for (var m = 0; m < profile.primary_minor_cannabinoids.length && minorMatches < 3; m++) {
            var mc = profile.primary_minor_cannabinoids[m];
            if (mc === 'CBG' && itemCBG > 0.5) { condScore += 10; minorMatches++; }
            else if (mc === 'CBN' && itemCBN > 0) { condScore += 10; minorMatches++; }
            else if (mc === 'CBC' && itemCBC > 0) { condScore += 10; minorMatches++; }
          }
        }

        // Step 4B — Explicit tag matching (bonus +15)
        var conditionsText = (item.conditions_options_as_text || '').toLowerCase();
        if (conditionsText && profile.conditions_tags) {
          for (var ct = 0; ct < profile.conditions_tags.length; ct++) {
            if (conditionsText.indexOf(profile.conditions_tags[ct].toLowerCase()) !== -1) {
              condScore += 15;
              condReasons.push('condition tag match');
              break;
            }
          }
        }

        if (condScore > 0) {
          matchedConditions.push({
            condition: profile.condition,
            score: condScore,
            evidence_grade: profile.evidence_grade,
            reasons: condReasons,
            matchedTerpenes: matchedTerpeneNames,
            contraindications: profile.contraindications
          });
        }
        totalScore += condScore;
      }
    }

    return {
      score: totalScore,
      matchedConditions: matchedConditions,
      reasoning: reasoning
    };
  }

  // ── Helper: Find Science Data profiles matching a patient condition ──
  function findConditionProfiles(conditionName, scienceData) {
    var conditions = scienceData.CONDITIONS;
    var intakeMap = scienceData.INTAKE_CONDITION_MAP;
    var tags = intakeMap[conditionName] || [conditionName];
    var matches = [];

    for (var i = 0; i < conditions.length; i++) {
      var profile = conditions[i];
      // Check if any of the patient's condition tags match this profile's tags
      for (var t = 0; t < tags.length; t++) {
        if (profile.conditions_tags && profile.conditions_tags.indexOf(tags[t]) !== -1) {
          matches.push(profile);
          break;
        }
      }
    }
    return matches;
  }

  // ── STEP 5: Terpene Depth Bonus ──
  function terpeneDepthBonus(item) {
    var totalTerpene = getTotalTerpenePercent(item);
    if (totalTerpene > 3) return 20;
    if (totalTerpene > 2) return 10;
    return 0;
  }

  // ── STEP 6: Paul Rating Bonus ──
  function paulRatingBonus(item) {
    var rating = num(item.paul_rating);
    if (rating <= 0) return 0;
    return Math.min(rating, 5) * 5; // max 25
  }

  // ── STEP 7: Priority & Profit Flags ──
  function priorityProfitFlags(item, clinicalScore) {
    var bonus = 0;
    if (item.prioritise === true || item.prioritise === 'Yes') bonus += 15;
    // High Profit bonus only if clinical score >= 50
    if ((item.high_profit === true || item.high_profit === 'Yes') && clinicalScore >= 50) bonus += 20;
    return bonus;
  }

  // ── STEP 8: Expiry Deduction ──
  function expiryDeduction(item) {
    var score = item.expiry_score;
    // NULL = uncalculated → treat as 100 (no deduction)
    if (score == null || score === '') return 0;
    var s = num(score);
    if (s < 30) return -10;
    return 0;
  }

  // ── STEP 8B: THC Comfort Adjustment ──
  // Maps patient's THC comfort preference to a scoring adjustment.
  // "CBD only" strongly penalises psychoactive products; "Mostly THC" penalises CBD-dominant.
  function thcComfortAdjustment(item, thcComfort) {
    if (!thcComfort || thcComfort === 'Open to anything') return 0;
    var thcVal = num(item.thc);
    var cbdVal = num(item.cbd);
    var psychoactive = isPsychoactive(item);
    var ratio = getRatioCategory(thcVal, cbdVal); // returns: 'thc_dominant','cbd_dominant','balanced','unknown'

    if (thcComfort === 'CBD only') {
      if (psychoactive && thcVal > 1) return -80; // near-exclusion
      if (ratio === 'cbd_dominant') return 20;
      return 0;
    }
    if (thcComfort === 'Mostly CBD') {
      if (ratio === 'cbd_dominant') return 15;
      if (ratio === 'balanced') return 5;
      if (ratio === 'thc_dominant' && thcVal > 15) return -30;
      return 0;
    }
    if (thcComfort === 'Balanced') {
      if (ratio === 'balanced') return 15;
      return 0;
    }
    if (thcComfort === 'Mostly THC') {
      if (ratio === 'thc_dominant') return 15;
      if (ratio === 'cbd_dominant') return -40;
      return 0;
    }
    return 0;
  }

  // ── STEP 8C: Budget Preference Adjustment ──
  // Penalises products outside the patient's stated budget range.
  function budgetAdjustment(item, budgetRange) {
    if (!budgetRange || budgetRange === 'No preference') return 0;
    var price = num(item.retail_price);
    if (price <= 0) return 0;

    if (budgetRange === 'Under $150') {
      if (price <= 150) return 10;
      if (price <= 200) return -10;
      return -40;
    }
    if (budgetRange === '$150 \u2013 $250') {
      if (price >= 150 && price <= 250) return 10;
      if (price < 100 || price > 350) return -30;
      return -10;
    }
    if (budgetRange === '$250 \u2013 $400') {
      if (price >= 250 && price <= 400) return 10;
      if (price < 150 || price > 500) return -30;
      return -10;
    }
    if (budgetRange === '$400+') {
      if (price >= 400) return 10;
      if (price < 250) return -30;
      return -10;
    }
    return 0;
  }

  // ── STEP 8D: Allergy Check ──
  // Penalises products whose carrier oil matches a stated allergy.
  function allergyAdjustment(item, allergies) {
    if (!allergies) return 0;
    var lower = allergies.toLowerCase();
    var carrier = (item.carrier || '').toLowerCase();
    if (!carrier) return 0;

    // Check if any allergy keyword matches the product's carrier
    var allergyPairs = [
      ['coconut', 'coconut oil'],
      ['mct', 'mct oil'],
      ['olive', 'olive oil'],
      ['hemp seed', 'hemp seed oil'],
      ['hemp oil', 'hemp oil']
    ];
    for (var i = 0; i < allergyPairs.length; i++) {
      if (lower.indexOf(allergyPairs[i][0]) !== -1 && carrier.indexOf(allergyPairs[i][1]) !== -1) {
        return -60;
      }
    }
    return 0;
  }

  // ── STEP 10: Final Score Calculation ──
  function calculateFinalScore(clinicalScore, profitPct, minProfit, maxProfit) {
    var profitRange = maxProfit - minProfit;
    var profitabilityScore = profitRange > 0 ? (profitPct - minProfit) / profitRange * 100 : 0;
    return (clinicalScore * 0.50) + (profitabilityScore * 0.50);
  }

  // ── STEP 11: Mandatory Category Guarantee ──
  function categoryGuarantee(rankedItems, allScoredItems) {
    var categories = {
      'Flower': null,
      'Oil': null,
      'Edible': null,
      'Vape': null
    };

    // Check what's already in the top 10
    var top10 = rankedItems.slice(0, 10);
    for (var i = 0; i < top10.length; i++) {
      var type = top10[i].item.type || '';
      if (type === 'Liquid vape cartridge') type = 'Vape';
      if (categories.hasOwnProperty(type)) categories[type] = true;
    }

    // For each missing category, find the highest-scoring item
    for (var cat in categories) {
      if (categories[cat]) continue; // already represented

      var best = null;
      for (var j = 0; j < allScoredItems.length; j++) {
        var si = allScoredItems[j];
        var siType = si.item.type || '';
        if (siType === 'Liquid vape cartridge') siType = 'Vape';
        if (siType !== cat) continue;
        if (!best || si.finalScore > best.finalScore) best = si;
      }

      if (best) {
        // Check if already in top10
        var alreadyIn = top10.some(function (t) { return t.item.id === best.item.id; });
        if (!alreadyIn) {
          best.tags.push('Category Fallback');
          // Replace lowest-ranked item in top 10
          top10[top10.length - 1] = best;
          top10.sort(function (a, b) { return b.finalScore - a.finalScore; });
        }
      }
    }

    // Budget pick: add lowest price-per-mg item passing clinical threshold
    var hasBudget = top10.some(function (t) { return t.tags.indexOf('Budget Pick') !== -1; });
    if (!hasBudget) {
      var budgetPick = null;
      for (var k = 0; k < allScoredItems.length; k++) {
        var bsi = allScoredItems[k];
        if (bsi.clinicalScore < 50) continue;
        var ppm = calculatePricePerMg(bsi.item);
        if (ppm <= 0) continue;
        if (!budgetPick || ppm < calculatePricePerMg(budgetPick.item)) budgetPick = bsi;
      }
      if (budgetPick) {
        var budgetIn = top10.some(function (t) { return t.item.id === budgetPick.item.id; });
        if (budgetIn) {
          // Just tag it
          var existing = top10.find(function (t) { return t.item.id === budgetPick.item.id; });
          if (existing && existing.tags.indexOf('Budget Pick') === -1) existing.tags.push('Budget Pick');
        } else if (top10.length >= 10) {
          budgetPick.tags.push('Budget Pick');
          top10[top10.length - 1] = budgetPick;
          top10.sort(function (a, b) { return b.finalScore - a.finalScore; });
        } else {
          budgetPick.tags.push('Budget Pick');
          top10.push(budgetPick);
        }
      }
    }

    return top10;
  }

  // ── STEP 12: Generate Output ──
  function generateOutput(scoredItem) {
    var item = scoredItem.item;
    var topTerps = getTopTerpenes(item, 3);
    var psychoactive = isPsychoactive(item);

    // Build reasoning text
    var reasons = [];
    if (scoredItem.matchedConditions && scoredItem.matchedConditions.length > 0) {
      for (var i = 0; i < scoredItem.matchedConditions.length; i++) {
        var mc = scoredItem.matchedConditions[i];
        reasons.push('Recommended for ' + mc.condition + ' (Grade ' + mc.evidence_grade + ')' +
          (mc.reasons.length ? ' — ' + mc.reasons.join(', ') : ''));
      }
    }

    // Tags
    var tags = (scoredItem.tags || []).slice();
    if (!psychoactive && tags.indexOf('Non-Psychoactive') === -1) tags.push('Non-Psychoactive');
    if (num(item.paul_rating) > 0 && tags.indexOf('Paul Rated') === -1) tags.push('Paul Rated');

    return {
      rank: scoredItem.rank || 0,
      item: item,
      id: item.id,
      item_name: item.item_name,
      brand: item.brand,
      type: item.type,
      thc: item.thc,
      cbd: item.cbd,
      topTerpenes: topTerps,
      retail_price: item.retail_price,
      pricePerMg: calculatePricePerMg(item),
      clinicalScore: scoredItem.clinicalScore,
      profitScore: scoredItem.profitScore || 0,
      finalScore: scoredItem.finalScore,
      reasoning: reasons,
      tags: tags,
      matchedConditions: scoredItem.matchedConditions,
      contraindications: scoredItem.contraindications || [],
      dosageTemplate: SD.DOSAGE_TEMPLATES[item.type] || SD.DOSAGE_TEMPLATES['Oil'],
      scoreBreakdown: scoredItem.scoreBreakdown || null
    };
  }

  // ── Breakdown helpers ──
  function safetyRuleDescription(intake) {
    var rules = [];
    if (intake.psychiatricHistory && intake.psychiatricHistory.some(function (h) { return h === 'Schizophrenia' || h === 'Psychosis'; })) {
      rules.push('Psychosis: exclude THC > 5');
    }
    if (intake.pregnancyStatus === 'Yes' || intake.breastfeeding === 'Yes') {
      rules.push('Pregnant/breastfeeding: exclude psychoactive');
    }
    if (intake.drivesRegularly === 'Yes, professional driver') {
      rules.push('Professional driver: -30 pts if THC > 10');
    }
    if (intake.medications && /\b(ssri|sertraline|fluoxetine|paroxetine|citalopram|escitalopram)\b/i.test(intake.medications)) {
      rules.push('SSRI: flag if THC > 10');
    }
    var age = intake.age ? parseInt(intake.age) : null;
    if (age != null && age < 21) rules.push('Age < 21: -30 flower, +20 CBD-only');
    return rules.length ? rules.join('; ') : 'No safety exclusions applied';
  }

  function experienceRuleDescription(level) {
    var lvl = parseInt(level) || 3;
    if (lvl === 1) return 'Naive — Flower THC ≤ 10%, Oil THC ≤ 5mg/mL, exclude psychoactive flower';
    if (lvl === 2) return 'Beginner — Flower THC ≤ 20%, Oil ≤ 15mg/mL';
    if (lvl === 3) return 'Moderate — Flower THC ≤ 25%';
    if (lvl === 4) return 'Experienced — no restrictions';
    if (lvl === 5) return 'Expert — no restrictions';
    return 'Unknown level';
  }

  // ── MAIN: Generate Recommendations ──
  function generateRecommendations(items, patientIntake, scienceData) {
    scienceData = scienceData || SD;
    if (!items || !items.length) return [];

    // Gather patient conditions
    var patientConditions = [];
    if (patientIntake.primaryConditions) {
      patientConditions = patientConditions.concat(patientIntake.primaryConditions);
    }
    if (patientIntake.secondaryConditions) {
      patientConditions = patientConditions.concat(patientIntake.secondaryConditions);
    }

    // Step 1: Hard filter
    var filtered = hardFilter(items);
    var step1Removed = items.length - filtered.length;

    // Step 2: Safety exclusions
    var safetyResult = safetyExclusions(filtered, patientIntake);
    var scoredItems = safetyResult.items;
    var step2Removed = filtered.length - scoredItems.length;

    // Step 3: Experience level filter
    var level = patientIntake.experienceLevel || '3';
    var beforeStep3 = scoredItems.length;
    scoredItems = experienceLevelFilter(scoredItems, level);
    var step3Removed = beforeStep3 - scoredItems.length;

    // Pipeline stats for breakdown display
    var pipelineStats = {
      step1: { input: items.length, passed: filtered.length, removed: step1Removed, rule: 'Exclude: not In Stock, Accessory, price $0, expired' },
      step2: { input: filtered.length, passed: filtered.length - step2Removed, removed: step2Removed, rule: safetyRuleDescription(patientIntake) },
      step3: { input: beforeStep3, passed: scoredItems.length, removed: step3Removed, rule: 'Experience Level ' + level + ': ' + experienceRuleDescription(level) }
    };

    // Calculate profit range across all remaining items (for Step 10)
    var allProfits = scoredItems.map(function (si) { return calculateProfitPct(si.item); });
    var validProfits = allProfits.filter(function (p) { return p > 0; });
    var minProfit = validProfits.length ? Math.min.apply(null, validProfits) : 0;
    var maxProfit = validProfits.length ? Math.max.apply(null, validProfits) : 100;

    // Steps 4-10: Score each item
    var allScored = [];
    for (var i = 0; i < scoredItems.length; i++) {
      var si = scoredItems[i];
      var item = si.item;

      // Step 4: Condition matching
      var condResult = conditionMatch(item, patientConditions, scienceData);
      var s4 = condResult.score;

      // Step 5: Terpene depth bonus
      var s5 = terpeneDepthBonus(item);

      // Step 6: Paul rating bonus
      var s6 = paulRatingBonus(item);

      // Step 2 safety adjustment
      var s2 = si.safetyScoreAdj;

      // Step 7: Priority & profit flags
      var s7 = priorityProfitFlags(item, s4 + s5 + s6 + s2);

      // Step 8: Expiry deduction
      var s8 = expiryDeduction(item);

      // Step 8B: THC comfort preference
      var s8b = thcComfortAdjustment(item, patientIntake.thcComfort);

      // Step 8C: Budget preference
      var s8c = budgetAdjustment(item, patientIntake.budgetRange);

      // Step 8D: Allergy check
      var s8d = allergyAdjustment(item, patientIntake.allergies);

      var clinicalScore = s4 + s5 + s6 + s2 + s7 + s8 + s8b + s8c + s8d;

      // Step 10: Final score
      var profitPct = calculateProfitPct(item);
      var profitRange = maxProfit - minProfit;
      var profitabilityScore = profitRange > 0 ? (profitPct - minProfit) / profitRange * 100 : 0;
      var finalScore = (clinicalScore * 0.50) + (profitabilityScore * 0.50);

      // Build step-by-step breakdown for debug
      var scoreBreakdown = {
        pipeline: pipelineStats,
        step4_conditions: { points: s4, detail: condResult.matchedConditions },
        step5_terpene_depth: { points: s5, totalPct: getTotalTerpenePercent(item) },
        step6_paul_rating: { points: s6, rating: num(item.paul_rating) },
        step2_safety_adj: { points: s2, flags: si.safetyFlags },
        step7_priority_profit: { points: s7, prioritise: item.prioritise, highProfit: item.high_profit },
        step8_expiry: { points: s8, expiryScore: item.expiry_score },
        step8b_thc_comfort: { points: s8b, preference: patientIntake.thcComfort || 'Not set' },
        step8c_budget: { points: s8c, budget: patientIntake.budgetRange || 'Not set', price: num(item.retail_price) },
        step8d_allergies: { points: s8d, allergies: patientIntake.allergies || '', carrier: item.carrier || '' },
        clinical_total: clinicalScore,
        step9_threshold: { passed: clinicalScore >= 50, score: clinicalScore, threshold: 50 },
        step10_profit: { profitPct: profitPct, profitabilityScore: profitabilityScore, minProfit: minProfit, maxProfit: maxProfit },
        final_calc: '(' + clinicalScore + ' × 0.5) + (' + Math.round(profitabilityScore) + ' × 0.5) = ' + Math.round(finalScore)
      };

      // Collect contraindications
      var contras = [];
      if (condResult.matchedConditions) {
        for (var c = 0; c < condResult.matchedConditions.length; c++) {
          if (condResult.matchedConditions[c].contraindications) {
            contras.push(condResult.matchedConditions[c].contraindications);
          }
        }
      }

      allScored.push({
        item: item,
        clinicalScore: clinicalScore,
        profitScore: profitPct,
        finalScore: finalScore,
        matchedConditions: condResult.matchedConditions,
        contraindications: contras,
        tags: si.safetyFlags.slice(),
        safetyScoreAdj: si.safetyScoreAdj,
        scoreBreakdown: scoreBreakdown
      });
    }

    // Step 9: Clinical threshold — include only score >= 50
    var passingItems = allScored.filter(function (s) { return s.clinicalScore >= 50; });

    // Sort by final score descending
    passingItems.sort(function (a, b) { return b.finalScore - a.finalScore; });

    // Step 11: Category guarantee (applied to first 10, then include remaining)
    var top10 = categoryGuarantee(passingItems, allScored);

    // Build full ranked list: guaranteed top 10 + remaining passing items
    var top10Ids = {};
    top10.forEach(function (t) { top10Ids[t.item.id] = true; });
    var remaining = passingItems.filter(function (s) { return !top10Ids[s.item.id]; });
    var fullRanked = top10.concat(remaining).slice(0, 100);

    // Step 12: Generate output for top 100
    var results = [];
    for (var r = 0; r < fullRanked.length; r++) {
      fullRanked[r].rank = r + 1;
      results.push(generateOutput(fullRanked[r]));
    }

    return results;
  }

  // ── Expose ──
  // ── Lightweight scorer for Browse sort-by-relevance ──
  // Returns the input items array sorted by clinical score (descending).
  // Skips profit blending, category guarantee, and output generation.
  function scoreItems(items, patientIntake) {
    if (!items || !items.length || !patientIntake) return items;

    var patientConditions = (patientIntake.primaryConditions || []).concat(patientIntake.secondaryConditions || []);
    if (patientConditions.length === 0) return items; // no conditions = can't score

    var level = patientIntake.experienceLevel || '3';

    // Build a score map: item.id → score
    var scoreMap = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var s4 = conditionMatch(item, patientConditions, SD).score;
      var s5 = terpeneDepthBonus(item);
      var s6 = paulRatingBonus(item);
      var s8b = thcComfortAdjustment(item, patientIntake.thcComfort);
      var s8c = budgetAdjustment(item, patientIntake.budgetRange);
      var s8d = allergyAdjustment(item, patientIntake.allergies);
      scoreMap[item.id] = s4 + s5 + s6 + s8b + s8c + s8d;
    }

    // Return a sorted copy
    return items.slice().sort(function (a, b) {
      return (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0);
    });
  }

  window.RecommendEngine = {
    generateRecommendations: generateRecommendations,
    scoreItems: scoreItems,
    // Exported for testing individual steps
    hardFilter: hardFilter,
    safetyExclusions: safetyExclusions,
    experienceLevelFilter: experienceLevelFilter,
    conditionMatch: conditionMatch,
    terpeneDepthBonus: terpeneDepthBonus,
    paulRatingBonus: paulRatingBonus,
    priorityProfitFlags: priorityProfitFlags,
    expiryDeduction: expiryDeduction,
    calculateFinalScore: calculateFinalScore,
    categoryGuarantee: categoryGuarantee,
    // Utilities
    normalizeTHC: normalizeTHC,
    calculatePricePerMg: calculatePricePerMg,
    calculateProfitPct: calculateProfitPct,
    getRatioCategory: getRatioCategory,
    getTopTerpenes: getTopTerpenes,
    getTotalTerpenePercent: getTotalTerpenePercent
  };
})();
