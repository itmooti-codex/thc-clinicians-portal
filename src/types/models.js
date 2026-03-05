/**
 * THC Clinicians Portal — JSDoc Type Definitions
 * Generated from thc-portal schema for clinician-relevant models only.
 */

/**
 * @typedef {Object} Contact
 * @property {number} id
 * @property {string} [first_name]
 * @property {string} [last_name]
 * @property {string} [email]
 * @property {string} [sms_number]
 * @property {string} [office_phone]
 * @property {string} [address]
 * @property {string} [address_2]
 * @property {string} [city]
 * @property {string} [state_au]
 * @property {string} [zip_code]
 * @property {string} [country]
 * @property {string} [title]
 * @property {number} [age]
 * @property {string} [birthday]
 * @property {'Male'|'Female'|'Other'|'Prefer not to say'} [sex]
 * @property {string} [profile_image]
 * @property {'Active'|'Application Approved'|'Application Pending'|'Application Received'|'Application Submitted'|'Deactivated'|'Flagged for Review'|'Rejected'|'Suspended'} [clinician_status]
 * @property {'Doctor'|'Nurse'|'Pharmacist'|'Admin'|'Practice Manager'|'Reception'|'Support'} [team_role]
 * @property {'Applied'|'Approved'|'Awaiting Approval'|'Consultation Booked'|'Consultation Completed'|'Draft'|'New'|'Rejected'|'Script Issued'|'Treatment Plan'} [application_status]
 * @property {'Active Treatment'|'Assessment'|'Completed'|'Initial Consultation'|'Maintenance'|'Not Started'|'On Hold'} [treatment_plan]
 * @property {'Eligible'|'Ineligible'|'Unkown'} [cannabis_outcome]
 * @property {number} [created_at]
 * @property {number} [last_modified_at]
 */

/**
 * @typedef {Object} Appointment
 * @property {number} id
 * @property {'Initial Consultation'|'Follow Up Consultation'} [type]
 * @property {'Booked'|'Cancelled'|'Completed'|'No Show'|'Paid'|'Pending Payment'|'Rescheduled'} [status]
 * @property {number} [appointment_time]
 * @property {number} [fee_paid]
 * @property {number} [doctor_id]
 * @property {number} [patient_id]
 * @property {number} [timeslot_id]
 * @property {number} [created_at]
 * @property {number} [last_modified_at]
 */

/**
 * @typedef {Object} ClinicalNote
 * @property {number} id
 * @property {string} [title]
 * @property {string} [content]
 * @property {number} [author_id]
 * @property {number} [patient_id]
 * @property {number} [appointment_id]
 * @property {number} [created_at]
 */

/**
 * @typedef {Object} Script
 * @property {number} id
 * @property {'Open'|'Fulfilled'|'Cancelled'|'Draft'|'External Processing'|'To Be Processed'|'Stock Issue'|'Archived'} [script_status]
 * @property {number} [repeats]
 * @property {number} [remaining]
 * @property {number} [doctor_id]
 * @property {number} [patient_id]
 * @property {number} [drug_id]
 * @property {number} [appointment_id]
 * @property {number} [created_at]
 * @property {number} [last_modified_at]
 */

/**
 * @typedef {Object} Item
 * @property {number} id
 * @property {string} [item_name]
 * @property {string} [brand]
 * @property {'Flower'|'Oil'|'Edible'|'Extract'|'Vape'|'Accessory'} [type]
 * @property {string} [description]
 * @property {string} [item_image]
 * @property {'In Stock'|'Unavailable'} [status]
 * @property {number} [retail_price]
 * @property {number} [wholesale_price]
 * @property {string} [thc]
 * @property {string} [cbd]
 * @property {string} [dominance]
 * @property {string} [sativa_indica]
 * @property {number} [created_at]
 */

/**
 * @typedef {Object} Timeslot
 * @property {number} id
 * @property {number} [doctor_id]
 * @property {number} [start_time]
 * @property {number} [end_time]
 * @property {'Open For Appointments'|'Cancelled'|'Completed Timeslot'|'Closed'} [timeslot_status]
 * @property {number} [max_appointments]
 * @property {number} [available_appointments]
 * @property {number} [created_at]
 */

/** Model metadata for VitalSync SDK queries */
var MODELS = {
  Contact: { sdkName: 'ThcContact', publicName: 'Contact' },
  Appointment: { sdkName: 'ThcAppointment', publicName: 'Appointment' },
  ClinicalNote: { sdkName: 'ThcClinicalNote', publicName: 'ClinicalNote' },
  Script: { sdkName: 'ThcScript', publicName: 'Script' },
  Item: { sdkName: 'ThcItem', publicName: 'Item' },
  Timeslot: { sdkName: 'ThcTimeslot', publicName: 'Timeslot' },
};
