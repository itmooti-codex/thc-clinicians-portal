# thc-clinicians-portal — The Happy Clinic Ontraport App

## Project Details
- **Client:** The Happy Clinic (slug: `thc`)
- **Type:** Ontraport App (vanilla JS, no build step)
- **GitHub Pages:** https://itmooti-codex.github.io/thc-clinicians-portal
- **VitalSync SDK:** Loaded via CDN in header code
- **Script Load Order:** auth.js → config.js → utils.js → vitalsync.js → data.js → science-data.js → recommend.js → similar.js → prescribe.js → app.js

## Sibling Project: Patient Portal

This app shares an Ontraport account and VitalSync API with `thc-portal` (React + TypeScript patient portal). Both are deployed from the same Docker container in production.

- **Shared API reference:** `~/Projects/thc-shared/ontraport-api-patterns.md` — Ontraport field mappings, object IDs, status enums, GraphQL patterns, REST mutation patterns
- **Patient portal source:** `~/Projects/thc-portal/` — React app with magic-link auth, intake form, patient dashboard
- **Shared Express backend:** `~/Projects/thc-portal/server/` — Auth, intake routes, clinician API proxy
- **Auth flow:** Magic link login via shared Express backend. Clinician JWT includes `role: 'clinician'`. API calls go through `/api/clinician/*` proxy.

## Port Registry
**Before assigning or changing any local dev ports**, check `~/Projects/PORT-REGISTRY.md` for current assignments. Update it when adding new ports.

## Quick Commands
- `npm run dev` — Start local dev server
- `npm run parse-schema` — Re-generate types + schema reference from schema.xml

<!-- GOTCHAS:START — Auto-synced from VibeCodeApps. Do not edit manually. -->
## Critical SDK & Pattern Gotchas

These are the most important gotchas — memorize these to avoid common bugs:

- **`plugin.switchTo()` needs the INTERNAL prefixed name** (e.g. `ThcContact`), NOT `publicName` (`Contact`). The `publicName` is for UI labels and TypeScript type names only.
- **Always `.pipe(window.toMainInstance(true))`** on all `fetchAllRecords()` / `fetchOneRecord()` queries
- **SDK records have NON-ENUMERABLE properties** — `{ ...record }` and `Object.keys(record)` produce `{}` / `[]`. Use `record.getState()` to get a plain JS object with all properties.
- **Records are immutable** — never `Object.assign(record, data)` or `record.field = value`, always spread `{ ...existingData, ...newData }`
- **Subscription payloads are PLAIN objects** (no `getState()`), do NOT include `id`, and have `null`/`undefined` for unchanged fields — never blind-merge, only merge defined non-null values, and always preserve the known `id`
- **Mutations disrupt subscriptions** — after `mutation.execute()`, clean up and re-subscribe
- **Direct GraphQL `fetch()` is an alternative to SDK for complex queries** — useful for calc/aggregation queries, cross-model joins, `orderBy`, and `field()` aliasing. The SDK query builder *does* support calc queries; past failures were due to invalid field references, not SDK limitations.
- **Keep `.limit()` reasonable** — limits above ~1,000 can cause the SDK to hang. Use pagination instead.
- **Vite dev server**: root: `.` with `open: '/dev/'` — NOT `root: 'dev'` which breaks `../src/` paths
<!-- GOTCHAS:END -->

## Reference Docs

Read these files on demand when working on the corresponding task:

- **`docs/vitalsync-sdk-patterns.md`** — VitalSync queries, subscriptions, mutations, direct GraphQL API, record conversion
- **`docs/ontraport-app-workflow.md`** — Ontraport scaffolding workflow, merge fields, dynamic lists, config bridge
- **`docs/deployment.md`** — GitHub Pages deployment, cache busting, GitHub Actions
- **`docs/schema-format.md`** — Schema XML parsing reference, data types, enums, FKs
- **`docs/research-phase.md`** — Research script, data collectors, knowledge base

## Schema Workflow
1. Export schema XML from VitalStats and place at `schema/schema.xml`
2. Run `npm run parse-schema`
3. This generates:
   - `src/types/models.js` — JSDoc typedefs + MODELS metadata
   - `schema/schema-reference.json` — Full parsed schema reference
   - Updates the Schema Reference section below

## Reusable Feature Patterns

Check `docs/features/` for pre-built feature implementations that can be added to this app. Each file documents a complete feature with architecture, file list, dependencies, and implementation steps.

## Feature Contribution

When you build a significant new reusable feature in this app (e.g., a new integration, a complex UI pattern, a data pipeline), **proactively offer to document it** for reuse in future projects:

1. Create a feature doc in `docs/features/` following the template in `docs/features/README.md`
2. Include: architecture overview, all files involved, dependencies, env vars, gotchas
3. Tell the user: *"This feature could benefit other projects. I've documented it in `docs/features/`. You can contribute it back to VibeCodeApps by copying it to `../VibeCodeApps/docs/features/` and running `./scripts/sync-child.sh --all`."*

## Staying Current

This project's docs were synced from VibeCodeApps on the date in `docs/.sync-version`. If the parent project has been updated (new features, fixed gotchas, improved patterns), the user can re-sync:
```bash
cd ../VibeCodeApps && ./scripts/sync-child.sh ../thc-clinicians-portal
```

<!-- SCHEMA:START — Auto-generated by parse-schema.js. Do not edit manually. -->
## Schema Reference

29 tables, 1010 columns. Full details: `schema/schema-reference.json`

### Affiliate (SDK: `ThcAffiliate`) — 2 fields
**Other:** id(PK), created_at(ts)

### Automation (SDK: `ThcAutomation`) — 4 fields
**Other:** id(PK), created_at(ts), last_modified_at(ts), object_type_id

### AutomationLogEntry (SDK: `ThcAutomationLogEntry`) — 16 fields
**Other:** id(PK), Appointment_id(FK→Appointment), BlogComment_id(FK→BlogComment), BlogPost_id(FK→BlogPost), ClinicalNote_id(FK→ClinicalNote), Contact_id(FK→Contact), Dispense_id(FK→Dispense), Item_id(FK→Item), Script_id(FK→Script), Timeslot_id(FK→Timeslot), created_at(ts), description(json), object_id, object_type_id, resource, type(enum:20 values)

### Contact (SDK: `ThcContact`) — 248 fields
**System Information:** id(PK), spent(decimal), facebook, linkedin, timezone(tz), dialpadid, instagram, unique_id, created_at(ts), last_sms_sent(ts), last_modified_at(ts)
**Contact Information:** age, city, email(email), state(ISO 3166-2 code as string without the country prefix. Ex: US-FL = FL), Weight(decimal), address, company, country(countryCode), website(url), birthday(ts), state_au(enum:8 values), zip_code, address_2, last_name, coordinate(geoPoint), first_name, sms_number, address_lat(lat), address_long(lng), profile_image(imageUrl), Patient_Status(enum:🔴 DANGER|🟠 CAUTION|🟢 PRIORITY), address_validation(enum:Error|Get Validated|Invalid Address|Not Validated|Validated)
**Lead Information:** gclid, score, priority(enum:High|Low|Medium), sales_stage(enum:7 values), ga_client_id, ga_session_id, here_about_us(enum:Google Search|Other|Print/Newspaper|Radio|Social Media|Word of Mouth), referring_page, sms_permission(bool), bulk_sms_status(bool), last_referrer_id(FK→Contact), bulk_email_status(bool), first_referrer_id(FK→Contact), ga_session_number, linked_in_click_id, time_since_last_activity(enum:More than a month ago (Cold)|This Week|This month|Today (Hot!)), initial_consultation_coupon_used(bool)
**SMS Merge Fields:** last_inbound_sms
**Invoice Info:** last_invoice, total_amount_of_unpaid_transactions(currency)
**Team Information:** bsb, acc_name, entity_name, pharmacy_abn, registered_for_gst(bool), date_first_logged_in(ts)
**Booked Appointments:** future_appointments_booked, last_appointment_booked_time(ts)
**Application Information:** application_date(ts), terms_conditions(bool), time_signed_terms(ts), application_status(enum:10 values)
**Application Fields:** sex(enum:Female|Intersex|Male|Prefer not to say), identify_same_sex_as_at_birth(bool)
**Eligibility Quiz Completion:** treatment_outcome(longtext), previous_treatment(longtext), long_term_condition(longtext), time_completed_quiz(ts), mental_health_history(longtext), pregnancy_or_fertility(longtext)
**Pharmacy Information:** gateway_id(longtext), pharmacy_logo(imageUrl), pharmacy_name, pharmacy_phone, pharmacy_state, pharmacy_colour(longtext), pharmacy_suburb, pharmacy_address, pharmacy_postal_code(address)
**Dr Information:** halaxy_email(email), practitioner, link_to_tga_docs(url), practitioner_role, appointments_today, appointments_left_today, incomplete_appointments
**Existing Conditions:** adhd(bool), ptsd(bool), cancer(bool), Severity, epilepsy(bool), glaucoma(bool), arthritis(bool), headaches(bool), migraines(bool), depression(bool), fibromyalgia(bool), inflammation(bool), endometriosis(bool), sleep_disorder(bool), chronic_illness(bool), other_condition(longtext), palliative_care(bool), anxiety_disorder(bool), loss_of_appetite(bool), neuropathic_pain(bool), condition_details(longtext), multiple_sclerosis(bool), parkinson_s_disease(bool), allergies_information, chronic_non_cancer_pain(bool), autism_spectrum_disorder(bool), crohns_ulcerative_colitis_ibs_gut(bool), chemotherapy_induced_nausea_and_vomiting(bool)
**Other Application Information:** Shift_Work(bool), Sport_Type, Heavy_Machinery(bool), Drives_Regularly(bool), discharge_letter(json), Competitive_Sport(bool), using_other_clinic(enum:I am currently using another natural therapy clinic|I am not currently using another natural therapy clinic), alternative_clinic_email(email)
**Confirm If True:** none_of_these_apply_to_me(bool), i_have_an_allergy_to_cannabinoids(bool), i_suffer_from_chronic_liver_disease(bool), i_am_currently_pregnant_or_breastfeeding(bool), i_have_a_history_of_schizophrenia_bipolar_and_or_psychosis(bool), history_of_opioid_replacement_therapy_and_or_drug_dependency(bool)
**Medicard Number:** irn, ihi_number, issue_number, medicare_name, medicare_number, halaxyid_patient, concession_card_holder(bool), medicare_not_validating(bool), Request_to_Release_Scripts_to_Own_Pharmacy(bool)
**Shipping Address Information:** oils(bool), vapes(bool), edibles(bool), flowers(bool), Budget_Range, business_name, Experience_Level, budget_important(bool), effect_preference(enum:Faster Onset|Longer Lasting), prev_cannabis_use(bool), lineage_preference(enum:Balanced|Indica|Sativa), product_preference(enum:Balanced|Higher CBD|Higher THC), discretion_important(bool), confirm_business_opening_hours(longtext), shipping_address_is_a_business(bool)
**Customer Contact:** contact_comment(longtext)
**Partner Data:** owed(decimal), leads, qr_svg(json), paid_leads, total_sales(decimal), total_refunds(decimal), paypal_address, number_of_sales, total_commission_paid(decimal)
**Partner Center: Payment info:** partner_center_payment_info_url(url)
**Partner Center: Home:** partner_center_home_url(url)
**Document Signed:** signature(imageUrl), process_document(bool), date_signed_document(ts), declaration_i_have_answered_truthfully(bool)
**Dr Appointment Stats:** Static_Timeslot_ID
**PATIENT Eligibility:** patient_eligibility_url(url)
**Dr Payment Stats:** consultation_fee(currency)
**Doctor Expression of Interest:** hpi_i, ahpra_number, availability(longtext), qualifications(longtext), date_applied_eoi(ts), how_soon_to_start(enum:Immediately|In a couple of months|Not available for a while|Within a few weeks), linked_in_profile(url), authorised_prescriber(bool), pbs_prescriber_number, medicare_provider_number, professional_description(longtext), registration_authority_ra_number
**System Fields:** unix_now
**Script information:** open_scripts, scripts_open, Scripts_Count, date_last_script(ts), scripts_archived, date_first_script(ts), scripts_fulfilled, Scripts_Count_Used, last_doctor_seen_id(FK→Contact), Scripts_Can_Dispense, Send_SMS_Scripts_Active(bool), Send_SMS_Scripts_Can_Dispense(bool)
**Nurse Evaluation:** ai_notes, ai_consultation(bool), cannabis_outcome(enum:Eligible|Ineligible|Unkown), date_ai_consulation(ts)
**Item Purchases:** date_last_item_shipped(ts)
**cart Information:** cart_gst(currency), cart_status(enum:Clear|Open|Payment Failed|Payment Success|Process|Processing), cart_shipping(currency), cart_subtotal(decimal), calculate_cart(bool), cart_items_gst(decimal), shipping_items, cart_grand_total(currency), cart_items_total, cart_gst_percentage, cart_credit_card_fee(currency), cart_shipping_option(enum:No Shipping|Startrack), create_shipping_label(bool), preferred_pharmacy_id(FK→Contact), cart_credit_card_fee_gst(currency)
**Medications:** list_your_medications_supplements(longtext), are_you_currently_taking_any_medications_or_supplements(enum:No|Yes)
**Feedback Tracking:** last_feedback_rating
**Parcel Locker:** shipping_option(enum:Home Address|Parcel Locker), parcel_locker_city(address), parcel_locker_state(enum:8 values), parcel_locker_number, parcel_locker_street(address), parcel_locker_postal_code(address)
**Manual SMS Message:** reasoning(longtext), manual_sms(enum:Send|Sent), manual_email(enum:Send|Sent), sms_message_to_send(longtext), email_message_to_send(longtext), email_subject_to_send
**Referral From Items:** referrer_commission(bool)
**Marketing Information:** vaporiser_email_sent(bool)
**Coupon Settings:** switch_coupon(enum:$40 Off Coupon Sent|$40 Off Coupon Used)
**Flower Limit Information:** bud_gm_date_reset(ts), check_flower_limit(bool), flower_gms_in_cart, flower_gms_available, flower_limit_reached(bool), bud_gm_dispensed_last_month, bud_gm_dispensed_this_month, monthly_cannabis_dispense_limit
**Discharge Letter:** date_discharged(ts), create_discharge_letter(bool)
**Dispense Information:** Count_All_Dispenses

### MessageTemplate (SDK: `ThcMessageTemplate`) — 12 fields
**Other:** id(PK), created_at(ts), deletable(bool), inline, json_data, last_modified_at(ts), last_sent, name, resource, sent, status(enum:Approved|Not Submitted|Rejected|Submitted for Review), type(enum:Double Opt-In (ONTRAMail)|Double Opt-In (legacy)|Invoice (ONTRAMail)|Invoice (legacy))

### ObjectLogEntry (SDK: `ThcObjectLogEntry`) — 24 fields
**Other:** id(PK), Appointment_id(FK→Appointment), BlogComment_id(FK→BlogComment), BlogPost_id(FK→BlogPost), ClinicalNote_id(FK→ClinicalNote), Contact_id(FK→Contact), Dispense_id(FK→Dispense), Item_id(FK→Item), Script_id(FK→Script), Timeslot_id(FK→Timeslot), automation_id(FK→Automation), message_id(FK→Message), created_at(ts), details(longtext), entry_items_count, merge_data(json), object_id, object_type_id, split_num, status(enum:15 values), step_num, subject, type(enum:26 values), vtype

### ObjectLogEntryItem (SDK: `ThcObjectLogEntryItem`) — 13 fields
**Other:** id(PK), message_id(FK→Message), object_log_entry_id(FK→ObjectLogEntry), action_id, created_at(ts), details, item_order, merge_data(json), object_type_id, resource, status(enum:15 values), type(enum:26 values), vtype

### Order (SDK: `ThcOrder`) — 2 fields
**Other:** id(PK), last_modified_at(ts)

### Product (SDK: `ThcProduct`) — 33 fields
**Other:** id(PK), created_at(ts), delay_start, deleted(bool), description, download_limit, download_time_limit, external_id, internal_name, last_modified_at(ts), level1, level2, offer_to_affiliates(bool), price(currency), product_code, product_group, product_type, public_name, revenue(currency), setup_fee(currency), setup_fee_date, setup_fee_when, shipping, sku, subscription_count, subscription_fee(currency), subscription_unit, taxable(bool), total_purchases_count, trial_period_count, trial_period_unit, trial_price(currency), type

### Tag (SDK: `ThcTag`) — 3 fields
**Other:** tag_id(PK), name, object_type_id

### AffiliateReferral (SDK: `ThcAffiliateReferral`) — 6 fields
**Other:** referral_id(PK), affiliate_id(FK→Affiliate), contact_id(FK→Contact), created_at(ts), products_purchased, purchased(currency)

### BlogPost (SDK: `ThcBlogPost`) — 40 fields
**System Information:** id(PK), last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Post Settings:** likes, post_date(ts), author_bio(longtext), post_title, author_name, post_status(enum:Idea Backlog|Published|Review|Writing), author_image(imageUrl), time_to_read, editor_s_pick(bool), post_deadline(ts), post_url_slug
**Post Publish Settings:** default_blog_post_page_type_url(url), default_blog_post_page_type_visits, default_blog_post_page_type_published(bool), default_blog_post_page_type_unique_visits
**Post Content:** headline, subheadline, post_content, main_post_image(imageUrl), short_post_description(longtext)
**SEO Settings:** seo_page_title, seo_page_description(longtext), social_image_2_1_ratio(imageUrl)
**Blog post editor:** blog_post_editor_url(url), blog_post_editor_visits, blog_post_editor_published(bool), blog_post_editor_unique_visits

### Item (SDK: `ThcItem`) — 202 fields
**System Information:** id(PK), last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), dominant_terpene(decimal), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Item Information:** gst(bool), type(enum:Accessory|Edible|Extract|Flower|Oil|Vape), brand, expiry(ts), status(enum:In Stock|Unavailable), carrier(enum:Coconut Oil|Hemp Oil|Hemp Seed Oil|MCT Oil|Olive Oil|Other), sub_type(enum:Budget|Core|Craft|Vaporiser), dominance(enum:8 values), item_name, pack_size, retail_gst(currency), description(longtext), retail_price(currency), quantity_unit(enum:7 values), packaging_date(ts), wholesale_price(currency), market_entry_date(ts), concession_discount(currency), estimated_date_in_stock(ts)
**ITem Details:** chemovar, onset_time(enum:15–45 min|1–2 hrs|1–5 min|30–90 min|Variable), dosage_form(enum:Inhalation (Smoking/Vaping)|Oral (Capsules, Edibles)|Sublingual (Tinctures, Sprays)|Suppository (Rectal/Vaginal)|Topical (Creams, Lotions)|Transdermal Patch), other_notes, typical_use, sativa_indica(enum:11 values), expected_effect, typical_duration(enum:1–4 hrs|4–6 hrs|6–10 hrs|6–12 hrs|6–8 hrs|Localised only)
**Strength:** cbc(decimal), cbd(decimal), cbg(decimal), cbn(decimal), thc(decimal), tga_category(enum:1|2|3|4|5), tga_schedule, strength_unit(enum:8 values), link_to_catalyst_listing(url)
**BEnefits and Conditions:** terpene_profile(enum:High >4%|Low <2%|Medium 2-4%), benefits_options_as_text, conditions_options_as_text
**Formulary Information:** prioritise(bool), paul_rating, psychoactive(enum:Mild/Moderate|No|Yes), update_preferences(bool), client_preference_effect(enum:Faster Onset|Longer Lasting), client_preference_lineage(enum:Balanced|Indica|Sativa), client_preference_thc_cbd(enum:Balanced|Higher CBD|Higher THC)
**Shipping Details:** sku, width(decimal), height(decimal), length(decimal), weight
**Halaxy Information:** form(enum:21 values), route(enum:10 values), strength_1, strength_2, strength_3, manufacturer, Added_to_Halaxy(bool), strength_unit_1(enum:%|g|mg|mg/g|mg/ml), strength_unit_2(enum:%|g|mg|mg/g|mg/ml), strength_unit_3(enum:%|g|mg|mg/g|mg/ml), active_ingredient_1(enum:cannabidiolic acid (cbda)|cannabigerol (cbg)|cannabinol (cbn)|delta-9-tetrahydrocannabinol), active_ingredient_2(enum:cannabidiolic acid (cbda)|cannabigerol (cbg)|cannabinol (cbn)|delta-9-tetrahydrocannabinol), active_ingredient_3(enum:cannabidiolic acid (cbda)|cannabigerol (cbg)|cannabinol (cbn)|delta-9-tetrahydrocannabinol), dosage_instructions(longtext)
**Item Profile Page:** item_profile_page_url(url), item_profile_page_visits, item_profile_page_published(bool), item_profile_page_unique_visits
**Terpenes:** guaiol(decimal), others(decimal), phytol(decimal), borneol(decimal), fenchyl(decimal), myrcene(decimal), ocimene(decimal), terpene(decimal), camphene(decimal), humulene(decimal), limonene(decimal), linalool(decimal), farnesene(decimal), nerolidol(decimal), terpineol(decimal), beta_pinene(decimal), terpinolene(decimal), alpha_pinene(decimal), Caryophyllenyl(decimal), delta_3_carene(decimal), alpha_bisabolol(decimal), trans_nerolidol(decimal), Selina_3711_diene(decimal), beta_caryophyllene(decimal), caryophyllene_oxide(decimal), trans_caryophyllene(decimal), Cis_alpha_bergamotene(decimal), dominant_terpenes_options_as_text
**Item Detail Page:** item_detail_page_url(url), item_detail_page_visits, item_detail_page_published(bool), item_detail_page_unique_visits
**Growing Conditions:** cured(bool), organic(bool), packaging(enum:10 values), cured_text, trim_method(enum:Hand|Hybrid|Machine|Other|Unknown), light_source(enum:Artificial light|Hybrid light source|Natural light source|Unknown), growing_medium(enum:8 values), harvest_method(enum:Hand|Hybrid|Machine|Other|Unknown), origin_country(countryCode)
**Last Time Checked Catalyst:** No_Match_Reason, Catalyst_Process(bool), catalyst_checked(bool), last_time_checked(ts), Catalyst_Product_ID
**Shop:** product_id, item_not_shipped(bool), show_on_public_store(bool)
**Storefront Product Detail Page:** storefront_product_detail_page_url(url), storefront_product_detail_page_visits, storefront_product_detail_page_published(bool), storefront_product_detail_page_unique_visits
**Calculated Pricing:** profit(decimal), high_profit(bool), price_per_g(currency), Check_Profit(bool), Total_THC_mg, expiry_score(decimal), gross_profit(currency), price_per_mg(currency), pharmacy_deal(decimal), wholesaler_id(FK→Contact), formulary_deal(decimal), Price_per_mg_THC(decimal), calculate_price_per_mg(bool), pharmacy_for_dispatch_id(FK→Contact)
**Script Information:** script_count
**Condition Rating:** chronic_pain
**Stock Management:** id_2, notes(longtext), check_stock(bool), price_cents, product_name, product_type, cannabis_type, tga_schedule_2, tga_sas_category, brisbane_in_stock(bool), brisbane_is_active(bool), melbourne_in_stock(bool), melbourne_is_active(bool), product_size_amount, product_size_measure
**THC Portal: Product Details Page (Public):** THC_Portal_Product_Details_Page_Public_URL(url), THC_Portal_Product_Details_Page_Public_visits, THC_Portal_Product_Details_Page_Public_published(bool), THC_Portal_Product_Details_Page_Public_unique_visits
**Catalyst Fields:** Species, Day_Night(enum:Day|Day/Night|Night), THC_Ratio, Has_Trials(bool), Has_Feedback(bool), startingdose, Sterilisation(enum:Irradiated|Non-Irradiated|Unknown), terpenesExact(bool), tgaDosageForm, Has_Concession(bool), ratio_category, dosingfrequency, Has_Case_Studies(bool), Terpene_Batch_ID, Terpene_Batch_Date(ts), patientDescription(longtext), storage_conditions(longtext), titration_instructions(longtext), Feelings_options_as_text(longtext), Symptoms_options_as_text(longtext), Benefits_options_as_text2(longtext), Catalyst_Last_Result_Count
**Product Documents:** CMI(url), COA(url), cmi_2(url), Brochure(url), Case_Study(url), item_image(imageUrl), Product_Info(url), item_image_2(imageUrl), information_sheet(json)

### Message (SDK: `ThcMessage`) — 32 fields
**Other:** id(PK), autosave, clicked_count, complaints_count, created_at(ts), from, json_data(longtext), last_auto(ts), last_modified_at(ts), last_save(ts), message_body(longtext), name, not_clicked_count, not_opened_count, object_type_id, old_resource(longtext), opened_count, plaintext(longtext), reply_to_email, resource(json), send_from_email, send_out_name, send_to, sent_count, site_id, spam_score(float), subject, transactional_email(bool), type(enum:10 values), unsubscribed_count, utm_tracking, word_wrap_checkbox

### Note (SDK: `ThcNote`) — 16 fields
**Other:** id(PK), Appointment_id(FK→Appointment), BlogComment_id(FK→BlogComment), BlogPost_id(FK→BlogPost), ClinicalNote_id(FK→ClinicalNote), Contact_id(FK→Contact), Dispense_id(FK→Dispense), Item_id(FK→Item), Script_id(FK→Script), Timeslot_id(FK→Timeslot), date_created(ts), last_modified_at(ts), note(longtext), object_id, object_type_id, type(enum:API|Form|Incoming|Manual|Outgoing)

### TagSubscriber (SDK: `ThcTagSubscriber`) — 13 fields
**Other:** id(PK), Appointment_id(FK→Appointment), BlogComment_id(FK→BlogComment), BlogPost_id(FK→BlogPost), ClinicalNote_id(FK→ClinicalNote), Contact_id(FK→Contact), Dispense_id(FK→Dispense), Item_id(FK→Item), Script_id(FK→Script), Timeslot_id(FK→Timeslot), tag_id(FK→Tag), object_id, object_type_id

### Timeslot (SDK: `ThcTimeslot`) — 35 fields
**System Information:** id(PK), trigger, last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), utc_difference, Timeslot_Status(enum:Closed|Open), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Timeslot Information:** end_time(ts), doctor_id(FK→Contact), start_time(ts), appointments, max_appointments, percent_completed, timeslot_status_2(enum:Cancelled|Closed For Appointments|Completed Timeslot|Open For Appointments), available_appointments, completed_appointments, appointments_left_today, incomplete_appointments
**DOCTOR: Timeslot View:** doctor_timeslot_view_url(url), doctor_timeslot_view_visits, doctor_timeslot_view_published(bool), doctor_timeslot_view_unique_visits
**Timeslot Finance:** doctor_cost(decimal), appointment_fees(decimal), total_thc_margin, total_retail_revenue

### AffiliateProgram (SDK: `ThcAffiliateProgram`) — 22 fields
**Other:** id(PK), select_an_email_to_send_id(FK→Message), buyers, commission_amount(currency), created_at(ts), customers, last_modified_at(ts), leads, link_number, link_units, name, new_affiliates, notify_partner_when_they_have_earned_a_commission_with_an_email(enum:Do Not Notify|Send Email Notification), partners, program_type(enum:1 Tier|2 Tier), sales, select_how_much_information_on_referrals_to_share_with_partners(enum:Contact Id|None - Sales are anonymous|Share first name and last initial|Share full name|Share full name and email address), settings, show_partners_complete_purchase_history_for_each_referred_client(bool), show_partners_information_on_declined_charges(bool), total(currency), visits

### Appointment (SDK: `ThcAppointment`) — 54 fields
**System Information:** id(PK), halaxyid, last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Appointment Information:** paid(bool), type(enum:Follow Up Consultation|In Patient Consultation|Initial Consultation), order, status(enum:7 values), fee_paid(currency), date_paid(ts), doctor_id(FK→Contact), patient_id(FK→Contact), date_booked(ts), timeslot_id(FK→Timeslot), script_count, draft_scripts, appointment_time(ts), date_rescheduled(ts), patient_comments(longtext), patient_didn_t_show(bool), timeslot_start_time(ts)
**PATIENT: Appointment Status:** patient_appointment_status_url(url), patient_appointment_status_visits, patient_appointment_status_published(bool), patient_appointment_status_unique_visits
**DOCTOR: Appointment View:** doctor_appointment_view_url(url), doctor_appointment_view_visits, doctor_appointment_view_published(bool), doctor_appointment_view_unique_visits
**Doctor Payment Information:** date_doctor_paid(ts), dr_pay_reference, id_billing_invoice, date_billing_invoice(ts), doctor_payment_status(enum:Awaiting Payment - Billed|Awaiting Payment - Unbilled|Paid|Pending Completion|Sent to Xero), doctor_consultation_fee(currency)
**Internal Notes Section:** conditions(longtext), process_steps(enum:1. Ask Preferences|2. Select Medicine(s)|3. Open Halaxy and Process ERX|4. Close Appointment|5. Completed), additional_notes(longtext), triage_nurse_notes
**AI Processing Fields:** condition(longtext), conditions_to_support
**Script Finance:** total_thc_margin, total_retail_revenue
**Formulary Information:** failed_message

### BlogComment (SDK: `ThcBlogComment`) — 17 fields
**System Information:** id(PK), last_note, unique_id, ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Blog Comment Info:** status(enum:Approved|New|Spam), comment(longtext), created_at(ts), blog_post_id(FK→BlogPost), commenter_id(FK→Contact)

### Invoice (SDK: `ThcInvoice`) — 36 fields
**Other:** id(PK), contact_id(FK→Contact), order_id(FK→Order), balance(currency), bindex, contact_name, created_at(ts), currency, customer_note, due_date(ts), external_order_id, hidden(bool), internal_note, invoice_date(ts), last_modified_at(ts), last_recharged_at(ts), offer_data, recharge(bool), recharge_attempts, shipping_amount(currency), status(enum:8 values), subtotal(currency), tax_city, tax_city_amount(currency), tax_county, tax_county_amount(currency), tax_postal_code, tax_state, tax_state_amount(currency), template_id, total(currency), total_paid(currency), total_tax(currency), transaction_amount_original(currency), type(enum:Invoice|Refund receipt), unique_id

### ItemBenefitsOption (SDK: `ThcItemBenefitsOption`) — 2 fields
**Other:** id(PK), recordId(FK→Item)

### ItemConditionsOption (SDK: `ThcItemConditionsOption`) — 2 fields
**Other:** id(PK), recordId(FK→Item)

### ItemDominantTerpenesOption (SDK: `ThcItemDominantTerpenesOption`) — 2 fields
**Other:** id(PK), recordId(FK→Item)

### ClinicalNote (SDK: `ThcClinicalNote`) — 11 fields
**System Information:** id(PK), unique_id, created_at(ts), last_modified_at(ts)
**Clinical Notes Information:** title, upload(json), content, author_id(FK→Contact), patient_id(FK→Contact), date_created(ts), appointment_id(FK→Appointment)

### Purchase (SDK: `ThcPurchase`) — 25 fields
**Other:** id(PK), affiliate_id(FK→Affiliate), contact_id(FK→Contact), invoice_id(FK→Invoice), order_id(FK→Order), product_id(FK→Product), affiliate_name, coupon_code, coupon_name, created_at(ts), currency, description(longtext), discount(currency), last_modified_at(ts), level1_commission_amount(currency), level2_commission_amount(currency), name, package_id, price(currency), price_original(currency), quantity, sku, status(enum:7 values), total_purchase(currency), type(enum:One-time purchase|Payment plan|Subscription|Trial payment)

### Script (SDK: `ThcScript`) — 64 fields
**System Information:** id(PK), trigger, last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Script Information:** reset(bool), dispenses, doctor_id(FK→Contact), remaining, can_dispense(bool), supply_limit, script_status(enum:8 values), appointment_id(FK→Appointment), thc_to_process(bool), next_dispense_date(ts), last_time_dispensed(ts), last_time_requested(ts), reason_can_t_dispense(enum:8 values)
**PATIENT: Script Payment Form:** patient_script_payment_form_url(url), patient_script_payment_form_visits, patient_script_payment_form_published(bool), patient_script_payment_form_unique_visits
**DOCTOR: Script Edit:** doctor_script_edit_url(url), doctor_script_edit_visits, doctor_script_edit_published(bool), doctor_script_edit_unique_visits
**Treatment Plan:** ai_attempts, treatment_plan
**Halaxy:** repeats, erx_code, valid_until(ts), e_script_link(url), interval_days, manual_script(json), dispense_quantity, create_task_for_erx(bool), dosage_instructions(longtext), additional_instructions(longtext), route_of_administration, doctor_notes_to_pharmacy(longtext)
**Medicine Information:** drug_id(FK→Item), new_item_link(url)
**PAtient Information:** condition(longtext), patient_id(FK→Contact)
**System:** formularyjson(longtext)
**Dispense Revenue:** total_thc_margin(decimal), total_retail_sales(decimal), total_item_thc_margin(decimal)
**Create Dispense:** script_in_cart, ai_agent_actions(enum:Add an Unpaid Dispense to the Cart|Create a Paid Dispense), create_paid_dispense(bool), create_dispense_override(bool)
**Doctor Actions:** date_archived(ts), doctor_archive_action(bool)
**Release to External Pharmacy:** release_to_external_pharmacy(bool)

### AffiliateCommission (SDK: `ThcAffiliateCommission`) — 15 fields
**Other:** id(PK), contact_id(FK→Contact), partner_id(FK→Contact), product_id(FK→Product), program_id(FK→AffiliateProgram), purchase_id(FK→Purchase), commission(currency), created_at(ts), date_paid(ts), date_processed(ts), last_modified_at(ts), status(enum:Approved|Paid|Pending|Refund Approved|Refund Paid|Refund Pending), subid, total_sales_amount(currency), type(enum:Flat Rate|Percent)

### Dispense (SDK: `ThcDispense`) — 59 fields
**System Information:** id(PK), last_note, unique_id, created_at(ts), ip_address, last_activity(ts), last_sms_sent(ts), profile_image(imageUrl), last_email_sent(ts), last_call_logged(ts), last_modified_at(ts), last_sms_received(ts), last_email_received(ts)
**Dispense Information:** total(currency), quantity, script_id(FK→Script), flower_grams, tracking_link(url), dispense_status(enum:11 values), item_retail_gst(currency), item_thc_margin(currency), tracking_number, shipping_company(enum:Startrack), dispensed_item_id(FK→Item), item_retail_price(currency), patient_to_pay_id(FK→Contact), item_wholesale_price(currency), pharmacy_to_dispense_id(FK→Contact), dispense_number_on_script
**PHARMACY: Dispense Add Tracking:** pharmacy_dispense_add_tracking_url(url), pharmacy_dispense_add_tracking_visits, pharmacy_dispense_add_tracking_published(bool), pharmacy_dispense_add_tracking_unique_visits
**Batch Information:** date_paid(ts), time_confirmed(ts), time_fulfilled(ts), batch_date_sent, time_set_on_hold(ts), time_tracking_added(ts), date_pharmacy_notified(ts)
**System Fields:** notify_thc(bool), pharmacy_action_button(enum:Dispense|Ready to Ship|Review|Take OFF Hold)
**MAchShip:** eta_datetime(ts), ms_fuel_levy(currency), consignmentid, ms_tax_amount(currency), ms_shipping_cost(currency), check_consignment(bool), consignment_status
**Feedback Information:** rating_text(enum:1⭐ Poor|2⭐ Fair|3⭐ Okay|4⭐ Good|5⭐ Outstanding), rating_number, feedback_comment(longtext), time_rating_given(ts)
**Feedback Request:** feedback_request_url(url), feedback_request_visits, feedback_request_published(bool), feedback_request_unique_visits
**Last time checked CATALYST:** catalyst_checked(bool), last_time_checked(ts)

<!-- SCHEMA:END -->

<!-- RESEARCH:START — Auto-generated by research.cjs. Do not edit manually. -->
_Run the research script to populate this section with business intelligence._
<!-- RESEARCH:END -->
