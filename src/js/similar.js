// thc-clinicians-portal — Similar Product Engine (Module 3)
// Given a source product, returns the top 3 most similar in-stock products of the same type.
// Depends on: recommend.js (for shared utilities)
(function () {
  'use strict';

  var RE = window.RecommendEngine;

  function num(v) {
    if (v == null || v === '') return 0;
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // ── Detect organic/LSO ──
  function isOrganic(item) {
    if (item.organic === true || item.organic === 'Yes') return true;
    if ((item.item_name || '').toLowerCase().indexOf('lso') !== -1) return true;
    return false;
  }

  // ── Normalize chemovar for comparison (Balanced = Hybrid) ──
  function normalizeChemovar(val) {
    if (!val) return '';
    var v = val.toLowerCase().trim();
    if (v === 'balanced' || v === 'balanced hybrid') return 'hybrid';
    if (v.indexOf('sativa') !== -1) return 'sativa';
    if (v.indexOf('indica') !== -1) return 'indica';
    if (v === 'hybrid') return 'hybrid';
    return v;
  }

  // ── Phase 1: Hard Filters ──
  function hardFilter(source, candidates) {
    var sourceType = (source.type || '').toLowerCase();
    var sourceName = (source.item_name || '').toLowerCase();
    var sourceBrand = (source.brand || '').toLowerCase();

    return candidates.filter(function (c) {
      if (c.status !== 'In Stock') return false;
      if (num(c.retail_price) <= 0) return false;
      // Exclude self
      if ((c.item_name || '').toLowerCase() === sourceName &&
          (c.brand || '').toLowerCase() === sourceBrand) return false;
      // Must be same type (Liquid vape cartridge = Vape)
      var cType = (c.type || '').toLowerCase();
      if (cType === 'liquid vape cartridge') cType = 'vape';
      var sType = sourceType === 'liquid vape cartridge' ? 'vape' : sourceType;
      if (cType !== sType) return false;
      return true;
    });
  }

  // ── Phase 2: Similarity Scoring ──
  function scoreSimilarity(source, candidate) {
    var score = 0;
    var breakdown = {};

    // ── Tier A: THC Match (25 pts) ──
    var srcTHC = num(source.thc);
    var candTHC = num(candidate.thc);
    var thcDiff = Math.abs(srcTHC - candTHC);
    if (srcTHC === 0) {
      // SPECIAL: source THC = 0.0, only 0.0 candidates get 25
      breakdown.thc = candTHC === 0 ? 25 : 0;
    } else if (thcDiff <= 1) {
      breakdown.thc = 25;
    } else if (thcDiff <= 2) {
      breakdown.thc = 12;
    } else {
      breakdown.thc = 0;
    }
    score += breakdown.thc;

    // ── Tier A: CBD Match (15 pts) ──
    var srcCBD = num(source.cbd);
    var candCBD = num(candidate.cbd);
    var cbdDiff = Math.abs(srcCBD - candCBD);
    if (cbdDiff <= 1) {
      breakdown.cbd = 15;
    } else if (cbdDiff <= 2) {
      breakdown.cbd = 7;
    } else {
      breakdown.cbd = 0;
    }
    score += breakdown.cbd;

    // ── Tier A2: Chemovar / Sativa-Indica (20 pts) ──
    var srcChemo = normalizeChemovar(source.sativa_indica);
    if (srcChemo) {
      var candChemo = normalizeChemovar(candidate.sativa_indica);
      breakdown.chemovar = (srcChemo === candChemo) ? 20 : 0;
      score += breakdown.chemovar;
    } else {
      breakdown.chemovar = null; // skipped
    }

    // ── Tier B: Terpene matching ──
    var srcTerpenes = RE.getTopTerpenes(source, 3);
    var srcHasTerpeneData = srcTerpenes.length > 0;

    if (srcHasTerpeneData) {
      var candTerpenes = RE.getTopTerpenes(candidate, 3);
      var candHasTerpeneData = candTerpenes.length > 0;

      if (candHasTerpeneData) {
        // Terpene % Total (15 pts)
        var srcTotal = RE.getTotalTerpenePercent(source);
        var candTotal = RE.getTotalTerpenePercent(candidate);
        if (srcTotal > 0) {
          var relDiff = Math.abs(srcTotal - candTotal) / srcTotal;
          if (relDiff <= 0.10) {
            breakdown.terpeneTotal = 15;
          } else if (relDiff <= 0.20) {
            breakdown.terpeneTotal = 7;
          } else {
            breakdown.terpeneTotal = 0;
          }
        } else {
          breakdown.terpeneTotal = 0;
        }
        score += breakdown.terpeneTotal;

        // Top 3 Terpene Names (15 pts)
        var srcNames = srcTerpenes.map(function (t) { return t.name; });
        var candNames = candTerpenes.map(function (t) { return t.name; });
        var nameMatches = 0;
        for (var i = 0; i < srcNames.length; i++) {
          if (candNames.indexOf(srcNames[i]) !== -1) nameMatches++;
        }
        if (nameMatches >= 3) breakdown.terpeneNames = 15;
        else if (nameMatches === 2) breakdown.terpeneNames = 10;
        else if (nameMatches === 1) breakdown.terpeneNames = 5;
        else breakdown.terpeneNames = 0;
        score += breakdown.terpeneNames;
      } else {
        // Missing terpene data penalty: -20
        breakdown.terpeneTotal = 0;
        breakdown.terpeneNames = 0;
        breakdown.terpenePenalty = -20;
        score -= 20;
      }
    } else {
      // Source has no terpene data: skip all Tier B
      breakdown.terpeneTotal = null;
      breakdown.terpeneNames = null;
    }

    // ── Tier C: Price per mg (10 pts) ──
    var srcPPM = RE.calculatePricePerMg(source);
    var candPPM = RE.calculatePricePerMg(candidate);
    if (srcPPM > 0 && candPPM > 0) {
      var ppmRelDiff = Math.abs(srcPPM - candPPM) / srcPPM;
      if (ppmRelDiff <= 0.10) {
        breakdown.pricePerMg = 10;
      } else if (ppmRelDiff <= 0.20) {
        breakdown.pricePerMg = 5;
      } else {
        breakdown.pricePerMg = 0;
      }
    } else {
      breakdown.pricePerMg = 0;
    }
    score += breakdown.pricePerMg;

    // ── Tier D: Origin Country (5 pts) ──
    var srcCountry = (source.origin_country || '').toLowerCase().trim();
    var candCountry = (candidate.origin_country || '').toLowerCase().trim();
    if (srcCountry && candCountry && srcCountry === candCountry) {
      breakdown.origin = 5;
    } else {
      breakdown.origin = 0;
    }
    score += breakdown.origin;

    // ── Tier E: Organic/LSO (3 pts) ──
    if (isOrganic(source) && isOrganic(candidate)) {
      breakdown.organic = 3;
    } else {
      breakdown.organic = 0;
    }
    score += breakdown.organic;

    // ── Tiebreaker: Gross Profit % ──
    var gpPct = RE.calculateProfitPct(candidate);

    return {
      score: Math.max(score, 0),
      gpPct: gpPct,
      breakdown: breakdown
    };
  }

  // ── Score interpretation label ──
  function getMatchLabel(score) {
    if (score >= 80) return { label: 'Excellent match', cls: 'match-excellent' };
    if (score >= 60) return { label: 'Good match', cls: 'match-good' };
    if (score >= 40) return { label: 'Partial match', cls: 'match-partial' };
    if (score >= 20) return { label: 'Weak match', cls: 'match-weak' };
    return { label: 'Poor match', cls: 'match-poor' };
  }

  // ── Main: Find Similar Products ──
  function findSimilar(source, allItems, topN) {
    topN = topN || 3;
    if (!source || !allItems || !allItems.length) return [];

    // Phase 1: Hard filter
    var candidates = hardFilter(source, allItems);

    // Phase 2: Score each candidate
    var scored = candidates.map(function (c) {
      var result = scoreSimilarity(source, c);
      return {
        item: c,
        score: result.score,
        gpPct: result.gpPct,
        breakdown: result.breakdown,
        matchLabel: getMatchLabel(result.score)
      };
    });

    // Sort by score descending, GP% tiebreaker
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      // GP% tiebreaker: higher wins. Invalid wholesale sorts to bottom
      var aGP = a.gpPct > 0 ? a.gpPct : -1;
      var bGP = b.gpPct > 0 ? b.gpPct : -1;
      return bGP - aGP;
    });

    return scored.slice(0, topN);
  }

  // ── Expose ──
  window.SimilarEngine = {
    findSimilar: findSimilar,
    scoreSimilarity: scoreSimilarity,
    hardFilter: hardFilter,
    getMatchLabel: getMatchLabel,
    isOrganic: isOrganic
  };
})();
