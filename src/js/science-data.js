// thc-clinicians-portal — Science Data (Clinical Evidence Lookup)
// Static JSON config for the recommendation engine. Updated quarterly.
// Source: claude2.md — Science Data Table + Terpene/Cannabinoid condition mappings
(function () {
  'use strict';

  // ── Condition Profiles (used by recommend.js Step 4A) ─────────────
  // Each entry defines the ideal cannabinoid/terpene profile for a medical condition.
  // Evidence grades: A = Strong RCT, B = Moderate, C = Observational, D = Preclinical
  var CONDITIONS = [
    {
      condition: 'Chronic Pain (general)',
      category: 'Pain',
      evidence_grade: 'A',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: ['CBG', 'CBN'],
      primary_terpenes: ['Beta-caryophyllene', 'Myrcene', 'Linalool', 'Alpha-pinene'],
      secondary_terpenes: ['Humulene', 'Ocimene'],
      recommended_forms: ['Flower', 'Oil', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Chronic Pain', 'Arthritis'],
      contraindications: 'Caution: high THC may worsen anxiety. Start 2.5mg THC. Titrate weekly.'
    },
    {
      condition: 'Neuropathic Pain',
      category: 'Pain',
      evidence_grade: 'A',
      ideal_ratio: 'thc_leaning',
      primary_minor_cannabinoids: ['CBG', 'CBN'],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Myrcene', 'Alpha-pinene'],
      secondary_terpenes: ['Humulene'],
      recommended_forms: ['Flower', 'Oil', 'Vape'],
      min_experience_level: 2,
      conditions_tags: ['Neuropathic Pain', 'Chronic Non-Cancer Pain'],
      contraindications: 'Higher THC doses often needed. Monitor cognitive effects. CYP450 interactions.'
    },
    {
      condition: 'Cancer-related Pain (opioid-refractory)',
      category: 'Pain/Oncology',
      evidence_grade: 'A',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Humulene'],
      secondary_terpenes: ['Myrcene', 'Alpha-pinene'],
      recommended_forms: ['Oil', 'Vape', 'Edible'],
      min_experience_level: 3,
      conditions_tags: ['Cancer symptom management'],
      contraindications: 'Opioid-sparing effect documented. Monitor interactions with opioids & chemo.'
    },
    {
      condition: 'Fibromyalgia (pain + sleep)',
      category: 'Pain',
      evidence_grade: 'B',
      ideal_ratio: 'thc_leaning',
      primary_minor_cannabinoids: ['CBN'],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Myrcene'],
      secondary_terpenes: ['Terpinolene'],
      recommended_forms: ['Oil', 'Flower', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Fibromyalgia', 'Arthritis'],
      contraindications: 'Consider split dosing: CBD-dominant daytime, THC-dominant nighttime.'
    },
    {
      condition: 'Arthritis / Osteoarthritis',
      category: 'Pain',
      evidence_grade: 'B',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Alpha-pinene', 'Myrcene'],
      secondary_terpenes: ['Humulene', 'Linalool'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Arthritis / Osteoarthritis'],
      contraindications: null
    },
    {
      condition: 'Migraine / MOH',
      category: 'Pain/Neurological',
      evidence_grade: 'B',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Alpha-pinene'],
      secondary_terpenes: ['Limonene'],
      recommended_forms: ['Vape', 'Oil', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Migraines', 'Headaches'],
      contraindications: 'SSRI interaction risk. THC may worsen MOH if overused.'
    },
    {
      condition: 'Epilepsy \u2014 Dravet Syndrome',
      category: 'Neurological',
      evidence_grade: 'A',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool'],
      secondary_terpenes: ['Alpha-pinene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Epilepsy', 'Dravet Syndrome'],
      contraindications: 'Do NOT use THC products. Specialist neurology oversight required. CYP2C19 interaction with clobazam.'
    },
    {
      condition: 'Epilepsy \u2014 Lennox-Gastaut (LGS)',
      category: 'Neurological',
      evidence_grade: 'A',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool'],
      secondary_terpenes: ['Alpha-pinene'],
      recommended_forms: ['Oil'],
      min_experience_level: 1,
      conditions_tags: ['Epilepsy', 'Lennox-Gastaut'],
      contraindications: null
    },
    {
      condition: 'Multiple Sclerosis Spasticity',
      category: 'Neurological',
      evidence_grade: 'A',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Myrcene'],
      secondary_terpenes: ['Alpha-pinene'],
      recommended_forms: ['Oil', 'Vape', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Multiple Sclerosis', 'Spasticity'],
      contraindications: null
    },
    {
      condition: "Parkinson's Disease (non-motor)",
      category: 'Neurological',
      evidence_grade: 'C',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool', 'Beta-caryophyllene'],
      secondary_terpenes: ['Alpha-pinene', 'Myrcene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ["Parkinson's Disease"],
      contraindications: 'Specialist oversight. No large RCTs.'
    },
    {
      condition: "Alzheimer's / Dementia",
      category: 'Neurological',
      evidence_grade: 'C',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Linalool', 'Alpha-pinene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ["Alzheimer's Disease", 'Dementia'],
      contraindications: 'Very low THC only \u2014 agitation/psychosis risk. Carer-supervised dosing.'
    },
    {
      condition: 'Tourette Syndrome (tics)',
      category: 'Neurological',
      evidence_grade: 'B',
      ideal_ratio: 'thc_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool', 'Myrcene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Capsule'],
      min_experience_level: 2,
      conditions_tags: ['Tourette Syndrome'],
      contraindications: 'Assess ADHD/OCD before prescribing high THC.'
    },
    {
      condition: 'Anxiety (situational/social)',
      category: 'Mental Health',
      evidence_grade: 'B',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Linalool', 'Limonene'],
      secondary_terpenes: ['Alpha-pinene', 'Ocimene'],
      recommended_forms: ['Oil', 'Edible', 'Vape'],
      min_experience_level: 1,
      conditions_tags: ['Anxiety'],
      contraindications: 'HIGH THC WORSENS ANXIETY. CBD-dominant only.'
    },
    {
      condition: 'Depression (adjunctive)',
      category: 'Mental Health',
      evidence_grade: 'C',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBC'],
      primary_terpenes: ['Linalool', 'Limonene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Depression'],
      contraindications: 'SSRI drug interaction risk.'
    },
    {
      condition: 'PTSD \u2014 Nightmares (night)',
      category: 'Mental Health',
      evidence_grade: 'B',
      ideal_ratio: 'thc_dominant',
      primary_minor_cannabinoids: ['CBN'],
      primary_terpenes: ['Linalool', 'Myrcene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Flower', 'Vape', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['PTSD', 'Nightmares'],
      contraindications: 'SSRI interaction risk.'
    },
    {
      condition: 'PTSD \u2014 Daytime Symptoms',
      category: 'Mental Health',
      evidence_grade: 'B',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Linalool', 'Limonene'],
      secondary_terpenes: ['Myrcene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['PTSD'],
      contraindications: null
    },
    {
      condition: 'ADHD',
      category: 'Mental Health',
      evidence_grade: 'C',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Alpha-pinene', 'Limonene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['ADHD'],
      contraindications: 'Not recommended < 21.'
    },
    {
      condition: 'Insomnia (chronic)',
      category: 'Sleep',
      evidence_grade: 'B',
      ideal_ratio: 'thc_leaning',
      primary_minor_cannabinoids: ['CBN'],
      primary_terpenes: ['Myrcene', 'Linalool', 'Terpinolene'],
      secondary_terpenes: ['Ocimene'],
      recommended_forms: ['Flower', 'Edible', 'Oil'],
      min_experience_level: 2,
      conditions_tags: ['Insomnia', 'Sleep'],
      contraindications: null
    },
    {
      condition: "Crohn's / IBD",
      category: 'Gastrointestinal',
      evidence_grade: 'B',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Alpha-pinene', 'Humulene'],
      secondary_terpenes: ['Myrcene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ["Crohn's Disease", 'IBD', 'IBS'],
      contraindications: null
    },
    {
      condition: 'Nausea / CINV (chemo-induced)',
      category: 'Gastrointestinal/Oncology',
      evidence_grade: 'A',
      ideal_ratio: 'thc_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Limonene', 'Linalool'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Vape', 'Oil', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Chemotherapy-Induced Nausea', 'Nausea / Vomiting'],
      contraindications: null
    },
    {
      condition: 'Appetite Loss / Cachexia',
      category: 'Gastrointestinal/Oncology',
      evidence_grade: 'A',
      ideal_ratio: 'thc_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Myrcene', 'Limonene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 2,
      conditions_tags: ['Loss of Appetite', 'Cachexia / Wasting'],
      contraindications: null
    },
    {
      condition: 'Endometriosis',
      category: "Women's Health",
      evidence_grade: 'C',
      ideal_ratio: 'balanced',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Linalool', 'Myrcene'],
      secondary_terpenes: ['Alpha-pinene', 'Humulene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Endometriosis'],
      contraindications: 'Avoid high THC if fertility concerns.'
    },
    {
      condition: 'PCOS',
      category: "Women's Health",
      evidence_grade: 'D',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool', 'Beta-caryophyllene', 'Myrcene'],
      secondary_terpenes: ['Alpha-pinene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['PCOS'],
      contraindications: 'Preclinical only. Caution with hormonal contraceptives.'
    },
    {
      condition: 'General Inflammation',
      category: 'Inflammation',
      evidence_grade: 'B',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Beta-caryophyllene', 'Alpha-pinene', 'Humulene'],
      secondary_terpenes: ['Myrcene', 'Ocimene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Inflammation'],
      contraindications: null
    },
    {
      condition: 'Autism Spectrum Disorder (ASD)',
      category: 'Neurological',
      evidence_grade: 'B',
      ideal_ratio: 'cbd_dominant',
      primary_minor_cannabinoids: [],
      primary_terpenes: ['Linalool', 'Alpha-pinene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil', 'Edible'],
      min_experience_level: 1,
      conditions_tags: ['Autism Spectrum Disorder', 'ASD'],
      contraindications: 'Paediatric specialist required.'
    },
    {
      condition: 'Palliative Care (symptom cluster)',
      category: 'Palliative',
      evidence_grade: 'B',
      ideal_ratio: 'thc_leaning',
      primary_minor_cannabinoids: ['CBN'],
      primary_terpenes: ['Myrcene', 'Linalool', 'Beta-caryophyllene'],
      secondary_terpenes: ['Alpha-pinene', 'Terpinolene'],
      recommended_forms: ['Oil', 'Flower', 'Vape'],
      min_experience_level: 2,
      conditions_tags: ['Palliative Care'],
      contraindications: null
    },
    {
      condition: 'Glaucoma (IOP reduction)',
      category: 'Ophthalmology',
      evidence_grade: 'C',
      ideal_ratio: 'thc_dominant',
      primary_minor_cannabinoids: ['CBG'],
      primary_terpenes: ['Alpha-pinene', 'Limonene'],
      secondary_terpenes: ['Beta-caryophyllene'],
      recommended_forms: ['Oil'],
      min_experience_level: 3,
      conditions_tags: ['Glaucoma'],
      contraindications: 'NOT recommended as primary treatment. Effect short-lived (3\u20134hrs).'
    }
  ];

  // ── Terpene → Condition Mapping (for data enrichment & condition derivation) ──
  var TERPENE_CONDITIONS = {
    'beta_caryophyllene': ['anxiety', 'pain', 'inflammation', 'ibs'],
    'limonene': ['anxiety', 'depression', 'stress', 'mood'],
    'linalool': ['sleep', 'anxiety', 'neuropathic_pain'],
    'myrcene': ['sleep', 'pain', 'muscle_spasm'],
    'alpha_pinene': ['focus', 'memory', 'inflammation'],
    'humulene': ['pain', 'inflammation', 'appetite_suppression']
  };

  // ── Cannabinoid → Condition Mapping ──
  // Thresholds: THC_high = >10%, CBD_high = >10%, CBG = >0.5%, CBN = >0%
  var CANNABINOID_CONDITIONS = {
    'THC_high': { threshold: 10, conditions: ['pain', 'nausea', 'appetite', 'sleep'] },
    'CBD_high': { threshold: 10, conditions: ['anxiety', 'seizure', 'inflammation'] },
    'CBG':      { threshold: 0.5, conditions: ['anxiety', 'ibs', 'glaucoma'] },
    'CBN':      { threshold: 0, conditions: ['sleep', 'pain'] }
  };

  // ── Dosage Instruction Templates (by product type) ──
  var DOSAGE_TEMPLATES = {
    'Flower': 'Inhale via dry herb vaporiser. Start with a small amount (0.1g). Set vaporiser to 170\u2013185\u00B0C. Take 1\u20132 draws and wait 15 minutes before redosing.',
    'Oil': 'Place prescribed dose under the tongue (sublingual). Hold for 60\u201390 seconds before swallowing. Onset: 30\u201390 minutes. Titrate dose as directed by prescriber.',
    'Vape': 'Inhale one draw from device as directed. Onset: 2\u20135 minutes. Wait 15 minutes between doses. Start with one draw and assess effect.',
    'Edible': 'Swallow whole with water. Do not chew. Onset: 1\u20132 hours. Do NOT re-dose within 2 hours. Effects can last 4\u20138 hours.',
    'Capsule': 'Swallow whole with food or milk. Onset: 1\u20132 hours. Take at the same time each day as directed.',
    'Spray': 'Spray under tongue or on inner cheek. Hold for 30\u201360 seconds. Onset: 15\u201345 minutes. Do not eat or drink for 5 minutes after use.'
  };

  // ── Terpene field name → display name mapping ──
  // Maps GraphQL field names to human-readable terpene names for condition matching
  var TERPENE_FIELD_MAP = {
    'myrcene': 'Myrcene',
    'limonene': 'Limonene',
    'beta_caryophyllene': 'Beta-caryophyllene',
    'linalool': 'Linalool',
    'trans_caryophyllene': 'Trans-caryophyllene',
    'ocimene': 'Ocimene',
    'farnesene': 'Farnesene',
    'alpha_pinene': 'Alpha-pinene',
    'beta_pinene': 'Beta-pinene',
    'humulene': 'Humulene',
    'terpinolene': 'Terpinolene'
  };

  // ── Intake condition labels → Science Data matching ──
  // Maps the intake form condition labels (from thc-portal IntakeFormPage) to Science Data conditions_tags
  var INTAKE_CONDITION_MAP = {
    'Chronic Pain': ['Chronic Pain'],
    'Anxiety': ['Anxiety'],
    'Depression': ['Depression'],
    'PTSD': ['PTSD', 'Nightmares'],
    'ADHD': ['ADHD'],
    'Sleep Disorder': ['Insomnia', 'Sleep'],
    'Epilepsy': ['Epilepsy', 'Dravet Syndrome', 'Lennox-Gastaut'],
    'Fibromyalgia': ['Fibromyalgia'],
    'Arthritis': ['Arthritis / Osteoarthritis'],
    'Migraines': ['Migraines', 'Headaches'],
    'Nausea / Vomiting': ['Chemotherapy-Induced Nausea', 'Nausea / Vomiting'],
    'Endometriosis': ['Endometriosis'],
    "Crohn's / IBS": ["Crohn's Disease", 'IBD', 'IBS'],
    'Multiple Sclerosis': ['Multiple Sclerosis', 'Spasticity'],
    'Inflammation': ['Inflammation'],
    'Neuropathic Pain': ['Neuropathic Pain'],
    'Cancer': ['Cancer symptom management'],
    "Parkinson's Disease": ["Parkinson's Disease"],
    'Loss of Appetite': ['Loss of Appetite', 'Cachexia / Wasting'],
    'Autism Spectrum': ['Autism Spectrum Disorder', 'ASD'],
    'Glaucoma': ['Glaucoma'],
    'Chronic Illness (other)': [],
    'Palliative Care': ['Palliative Care']
  };

  // ── Clinical References per Condition (cleaned for stronger journal quality) ──
  var CONDITION_REFERENCES = {
    'Chronic Pain (general)': 'Best supported as modest benefit, not large effect: Wang et al. (2021) BMJ systematic review/meta-analysis; Hsu et al. (2026) JAMA review.',
    'Neuropathic Pain': 'M\u00fccke et al. (2018) Cochrane Review; Hsu et al. (2026) JAMA review \u2014 evidence mixed and generally small in magnitude.',
    'Cancer-related Pain (opioid-refractory)': 'Johnson et al. (2010) J Pain Symptom Manage; Portenoy et al. (2012) J Pain; Hsu et al. (2026) JAMA review \u2014 mixed but clinically relevant adjunctive signals in some patients.',
    'Fibromyalgia (pain + sleep)': 'Insufficient high-quality evidence in major journals for strong efficacy claims; Hsu et al. (2026) JAMA review.',
    'Arthritis / Osteoarthritis': 'Insufficient high-quality clinical evidence in major journals for routine efficacy claims; Hsu et al. (2026) JAMA review.',
    'Migraine / MOH': 'Insufficient high-quality clinical evidence in major journals for routine efficacy claims; Hsu et al. (2026) JAMA review.',
    'Epilepsy \u2014 Dravet Syndrome': 'Strongest cannabinoid indication: Devinsky et al. (2017) N Engl J Med.',
    'Epilepsy \u2014 Lennox-Gastaut (LGS)': 'Strongest cannabinoid indication: Devinsky et al. (2018) N Engl J Med; Thiele et al. (2018) Lancet.',
    'Multiple Sclerosis Spasticity': 'Novotna et al. (2011) Eur J Neurol; Koppel et al. (2014) Neurology guideline \u2014 nabiximols may improve patient-reported spasticity in treatment-resistant MS.',
    "Parkinson's Disease (non-motor)": 'Insufficient high-quality clinical evidence in major journals for routine efficacy claims; Hsu et al. (2026) JAMA review.',
    "Alzheimer's / Dementia": 'Insufficient high-quality clinical evidence in major journals for routine efficacy claims; Hsu et al. (2026) JAMA review.',
    'Tourette Syndrome (tics)': 'Preliminary / low-quality evidence only: Tetrahydrocannabinol and Cannabidiol in Tourette Syndrome (2023) NEJM Evidence; Lancet Psychiatry (2026) meta-analysis.',
    'Anxiety (situational/social)': 'Preliminary evidence only: Bergamaschi et al. (2011) Neuropsychopharmacology; Lancet Psychiatry (2026) meta-analysis; Hsu et al. (2026) JAMA review.',
    'Depression (adjunctive)': 'Insufficient / low-quality evidence overall: Lancet Psychiatry (2026) meta-analysis; Hsu et al. (2026) JAMA review.',
    'PTSD \u2014 Nightmares (night)': 'Small preliminary signal only: Jetly et al. (2015) Psychoneuroendocrinology; Lancet Psychiatry (2026) meta-analysis \u2014 insufficient overall for strong claims.',
    'PTSD \u2014 Daytime Symptoms': 'Insufficient / low-quality evidence overall: Lancet Psychiatry (2026) meta-analysis; Hsu et al. (2026) JAMA review.',
    'ADHD': 'Insufficient high-quality clinical evidence in major journals for efficacy claims; Lancet Psychiatry (2026) meta-analysis; Hsu et al. (2026) JAMA review.',
    'Insomnia (chronic)': 'Low-quality evidence only: Lancet Psychiatry (2026) meta-analysis; Hsu et al. (2026) JAMA review.',
    "Crohn's / IBD": 'Naftali et al. (2013) Clin Gastroenterol Hepatol \u2014 symptomatic response reported; Hsu et al. (2026) JAMA review \u2014 remission / objective inflammatory benefit remains unproven.',
    'Nausea / CINV (chemo-induced)': 'One of the better-supported THC-class indications: Tram\u00e8r et al. (2001) BMJ systematic review; Hsu et al. (2026) JAMA review.',
    'Appetite Loss / Cachexia': 'Limited / mixed evidence: Jatoi et al. (2002) J Clin Oncol; Brisbois et al. (2011) Ann Oncol; Hsu et al. (2026) JAMA review.',
    'Endometriosis': 'Insufficient high-quality clinical evidence in major journals for routine efficacy claims.',
    'PCOS': 'No established human clinical efficacy evidence in major journals; do not cite as a therapeutic benefit.',
    'General Inflammation': 'Do not use as a clinical efficacy claim. Mechanistic / preclinical rationale only; if needed, cite separately under terpene notes (e.g., beta-caryophyllene).',
    'Autism Spectrum Disorder (ASD)': 'Preliminary / low-quality evidence only: Aran et al. (2021) Molecular Autism; Lancet Psychiatry (2026) meta-analysis.',
    'Palliative Care (symptom cluster)': 'Limited / mixed evidence overall; avoid strong broad-symptom-cluster claims without indication-specific support; Hsu et al. (2026) JAMA review.',
    'Glaucoma (IOP reduction)': 'Tomida et al. (2006) J Glaucoma \u2014 short-lived IOP reduction only; not strong evidence for routine glaucoma treatment.'
  };

  // ── Cannabinoid / Terpene Evidence Notes (use in justification text) ──
  var COMPOUND_EVIDENCE_NOTES = {
    'CBD': 'Strongest human evidence is for Dravet syndrome and Lennox-Gastaut syndrome (NEJM/Lancet RCTs). Experimental anxiolytic signals exist, but broader psychiatric evidence remains limited.',
    'THC / dronabinol / nabilone': 'Best supported for chemotherapy-induced nausea and vomiting; some limited evidence for appetite stimulation and selected symptom relief, balanced against psychoactive adverse effects.',
    'THC:CBD combinations / nabiximols': 'Best-supported human evidence is for MS spasticity; mixed evidence for chronic pain and cancer pain.',
    'beta-Caryophyllene': 'Most defensible terpene to mention, but only as mechanistic / preclinical rationale: Russo (2011) Br J Pharmacol \u2014 CB2-related anti-inflammatory rationale. Do not present as proven human clinical efficacy.',
    'Linalool': 'No robust human clinical efficacy evidence in medicinal cannabis formulations in major journals; use only as mechanistic / preclinical rationale.',
    'Limonene': 'No robust human clinical efficacy evidence in medicinal cannabis formulations in major journals; use only as mechanistic / preclinical rationale.',
    'Myrcene': 'No robust human clinical efficacy evidence in medicinal cannabis formulations in major journals; use only as mechanistic / preclinical rationale.',
    'Pinene': 'No robust human clinical efficacy evidence in medicinal cannabis formulations in major journals; use only as mechanistic / preclinical rationale.',
    'Entourage effect': 'Do not describe as established clinical fact. Nature (2019) notes the hypothesis is intriguing but lacks solid evidence.'
  };

  // Inject references into each condition object
  CONDITIONS.forEach(function (c) {
    c.references = CONDITION_REFERENCES[c.condition] || '';
  });

  // ── Expose ──
  window.ScienceData = {
    CONDITIONS: Object.freeze(CONDITIONS),
    TERPENE_CONDITIONS: Object.freeze(TERPENE_CONDITIONS),
    CANNABINOID_CONDITIONS: Object.freeze(CANNABINOID_CONDITIONS),
    DOSAGE_TEMPLATES: Object.freeze(DOSAGE_TEMPLATES),
    TERPENE_FIELD_MAP: Object.freeze(TERPENE_FIELD_MAP),
    INTAKE_CONDITION_MAP: Object.freeze(INTAKE_CONDITION_MAP),
    CONDITION_REFERENCES: Object.freeze(CONDITION_REFERENCES),
    COMPOUND_EVIDENCE_NOTES: Object.freeze(COMPOUND_EVIDENCE_NOTES)
  };
})();
