# Buddzee Voice & Vision AI Assistant

> Reusable feature pattern for AppBuilder (React + Mobile Apps). **All voice/vision AI interactions are branded as Buddzee.** See `docs/features/buddzee-ai-assistant.md` for the full brand identity, voice guidelines, animated logo states, and system prompt template.

## Overview

Buddzee's extensible voice & vision layer lets small business users interact with their app using **voice**, **camera**, and **natural language** to perform actions that would otherwise require manual data entry. The system is modular — each business configures which **capabilities** (called "actions") are enabled based on their workflow needs.

Buddzee doesn't just transcribe — it **understands intent, extracts structured data, confirms with the user, and executes actions** against VitalSync.

---

## Core Concept: Action Registry

The system is built around a pluggable **Action Registry**. Each action is a self-contained module that defines:

- What triggers it (intent detection)
- What data it needs to extract
- What VitalSync mutations or external calls it performs
- What confirmation UI to show the user

Businesses enable/disable actions per client app via configuration. This means the same framework powers a tradie's quoting app, a clinic's patient intake, and a retailer's inventory check — they just have different actions enabled.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Mobile App (Capacitor)            │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   Voice  │  │  Camera  │  │  Text / Chat UI   │  │
│  │  Button  │  │  Button  │  │                   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │             │
│       ▼              ▼                 │             │
│  ┌─────────┐  ┌───────────┐           │             │
│  │ Speech  │  │  Image    │           │             │
│  │ to Text │  │  Capture  │           │             │
│  └────┬────┘  └─────┬─────┘           │             │
│       │              │                 │             │
│       ▼              ▼                 ▼             │
│  ┌──────────────────────────────────────────────┐   │
│  │          Unified Input Normalizer            │   │
│  │   (text transcript / base64 image / both)    │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │                               │
│                     ▼                               │
│  ┌──────────────────────────────────────────────┐   │
│  │              Express Backend                 │   │
│  │                                              │   │
│  │  ┌────────────────────────────────────────┐  │   │
│  │  │         AI Processing Pipeline         │  │   │
│  │  │                                        │  │   │
│  │  │  1. Intent Classification              │  │   │
│  │  │  2. Entity Extraction                  │  │   │
│  │  │  3. Action Matching (registry lookup)  │  │   │
│  │  │  4. Data Validation                    │  │   │
│  │  │  5. Structured Output                  │  │   │
│  │  └────────────────────────────────────────┘  │   │
│  │                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │   │
│  │  │ VitalSync│  │  n8n     │  │  External  │  │   │
│  │  │ GraphQL  │  │ Webhooks │  │  APIs      │  │   │
│  │  └──────────┘  └──────────┘  └───────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │           Confirmation UI                    │   │
│  │  "I'll create a contact for John Smith at    │   │
│  │   Acme Corp. Phone: 0412 345 678"           │   │
│  │                                              │   │
│  │   [✓ Confirm]  [✎ Edit]  [✗ Cancel]         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Input Modes

### 1. Voice Input

The primary interaction mode. User taps a mic button and speaks naturally.

**Two voice modes:**

| Mode | Use Case | How It Works |
|------|----------|-------------|
| **Command** | Short instructions ("Create a contact for John Smith, 0412 345 678") | Single utterance → process → confirm |
| **Conversation** | Extended dialogue (meeting with a client, phone call) | Continuous listening → real-time entity extraction → progressive display |

**Implementation — Command Mode:**
- Capacitor plugin: `@capacitor-community/speech-recognition` or Apple Speech framework via custom plugin
- On-device speech-to-text for speed and privacy
- Single transcript sent to backend for processing

**Implementation — Conversation Mode:**
- Streaming audio via WebSocket to backend
- Backend uses Whisper or Deepgram for continuous transcription with speaker diarization
- Periodic entity extraction as transcript grows
- Live preview UI showing extracted data building up in real-time
- User can correct/confirm entities as they appear

### 2. Camera / Photo Input

User points camera at physical objects to extract data.

| Input | What Gets Extracted |
|-------|-------------------|
| Business card | Name, company, phone, email, address, title, website |
| Handwritten note | Text content, action items, dates mentioned |
| Whiteboard | Meeting notes, diagrams (as image attachment), action items |
| Product label / barcode | Product name, SKU, price, description |
| Invoice / receipt | Line items, totals, dates, vendor info, ABN |
| Vehicle rego / licence plate | Registration number, state, vehicle lookup |
| Licence / ID card | Name, DOB, address, licence number, expiry |
| Damaged property (insurance/trades) | Description of damage, location, severity, photo attachment |
| Job site / property | Address estimation, condition notes, measurements from photo |

**Implementation:**
- Capacitor Camera plugin for photo capture
- Image sent as base64 to backend
- Claude vision API extracts structured data from the image
- Same confirmation flow as voice

### 3. Text / Chat Input

For users who prefer typing or need to refine what they said.

- Standard chat interface (you already have the AI Chat Agent feature pattern)
- Same backend pipeline processes typed input
- Can also paste content (email text, copied address, etc.)

### 4. Combined Input

The real power — combining modes in a single interaction:

- "Take a photo of this business card" → camera captures → AI extracts contact → voice: "Add them as a lead for the kitchen renovation project" → AI links contact to project
- Voice describes a job while camera captures photos of the site
- Voice note during a client meeting + photo of their current setup

---

## Action Registry

### How It Works

Each action is a TypeScript module that implements the `AssistantAction` interface:

```typescript
interface AssistantAction {
  // Identity
  id: string;                          // e.g., 'create-contact'
  name: string;                        // e.g., 'Create Contact'
  category: ActionCategory;            // 'contacts' | 'quoting' | 'scheduling' | 'notes' | 'email' | 'inventory' | 'custom'
  
  // Intent matching
  intentKeywords: string[];            // Keywords that suggest this action
  intentDescription: string;           // Natural language description for AI intent classification
  
  // Schema
  requiredFields: FieldDefinition[];   // Fields the action needs
  optionalFields: FieldDefinition[];   // Nice-to-have fields
  
  // VitalSync mapping
  entityType: string;                  // VitalSync entity (e.g., 'Contact', 'Quote')
  mutationType: 'create' | 'update' | 'link' | 'custom';
  
  // Execution
  buildMutation(data: ExtractedData): GraphQLMutation;
  
  // UI
  confirmationTemplate: string;        // React component name for confirmation UI
  successMessage: string;
}

interface FieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'email' | 'phone' | 'address' | 'currency' | 'enum';
  vitalSyncField: string;             // Maps to the actual VitalSync schema field
  enumOptions?: string[];              // For enum types
  validationRules?: ZodSchema;
}
```

### Configuration Per Client App

In the app's config (environment or VitalSync settings):

```typescript
// assistant-config.ts
export const assistantConfig: AssistantConfig = {
  enabledActions: [
    'create-contact',
    'create-quote',
    'add-note-to-contact',
    'send-email',
    'log-site-visit',
  ],
  voiceModes: ['command', 'conversation'],
  cameraEnabled: true,
  defaultAction: 'add-note-to-contact',  // Fallback when intent is ambiguous
  
  // Business-specific context fed to the AI
  businessContext: {
    industry: 'electrical-contractor',
    terminology: {
      'job': 'A customer project or service request',
      'defect': 'A safety issue found during inspection',
    },
    commonProducts: ['switchboard upgrade', 'safety switch install', 'rewire'],
  },
};
```

---

## Screen Context Awareness

The assistant doesn't operate in a vacuum — it always knows **where the user is in the app** and **what record they're looking at**. This eliminates redundant questions and makes interactions dramatically faster.

### How It Works

The `AssistantProvider` subscribes to the app's navigation/routing state and maintains a `ScreenContext` object that is automatically included with every AI request:

```typescript
interface ScreenContext {
  // Where the user is
  screen: string;                    // e.g., 'contact-detail', 'quote-list', 'dashboard'
  entityType?: string;               // e.g., 'Contact', 'Quote', 'Job'
  
  // What record is loaded (if viewing a specific record)
  recordId?: string;                 // VitalSync record ID
  recordSummary?: Record<string, any>; // Key fields for AI context (name, email, status, etc.)
  
  // What related records are visible
  relatedEntities?: {
    entityType: string;
    recordId: string;
    relationship: string;            // e.g., 'quotes-for-contact', 'line-items-on-quote'
  }[];
  
  // What the user was doing
  activeTab?: string;                // e.g., 'notes', 'quotes', 'activity'
  selectedItems?: string[];          // If multi-select is active (e.g., selected invoices)
}
```

### Context Provider Hook

Each screen in the app registers its context via a hook:

```typescript
// Inside a Contact Detail screen component
useAssistantContext({
  screen: 'contact-detail',
  entityType: 'Contact',
  recordId: contact.id,
  recordSummary: {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
  },
  relatedEntities: [
    ...contact.quotes.map(q => ({
      entityType: 'Quote', recordId: q.id, relationship: 'quotes-for-contact'
    })),
    ...contact.jobs.map(j => ({
      entityType: 'Job', recordId: j.id, relationship: 'jobs-for-contact'
    })),
  ],
  activeTab: currentTab, // 'notes' | 'quotes' | 'activity' | 'details'
});
```

### What Context Changes

#### 1. Pre-filled targets — No need to say WHO

| Without context | With context |
|----------------|-------------|
| "Add a note to John Smith" | "Add a note" |
| "Create a quote for Acme Corp" | "Create a quote" |
| "Email Sarah at sarah@acme.com" | "Send her an email" |
| "Log a call with contact #4521" | "Log a call" |

The AI receives the `recordSummary` and automatically fills in the target contact/entity.

#### 2. Pre-filtered actions — Smarter action ranking

The action registry uses the screen context to **re-rank** which actions are most likely:

```typescript
function rankActionsForContext(
  enabledActions: AssistantAction[],
  context: ScreenContext
): AssistantAction[] {
  return enabledActions.sort((a, b) => {
    const aRelevance = getContextRelevance(a, context);
    const bRelevance = getContextRelevance(b, context);
    return bRelevance - aRelevance;
  });
}

function getContextRelevance(action: AssistantAction, context: ScreenContext): number {
  let score = 0;
  
  // Action targets the same entity type as current screen
  if (action.entityType === context.entityType) score += 3;
  
  // Action creates a child of the current entity (e.g., Note for Contact)
  if (action.parentEntityType === context.entityType) score += 5;
  
  // Active tab hints at intent (on "Notes" tab → add-note is top action)
  if (context.activeTab && action.contextTabHints?.includes(context.activeTab)) score += 4;
  
  // Action matches a related entity type
  if (context.relatedEntities?.some(r => r.entityType === action.entityType)) score += 2;
  
  return score;
}
```

**Example: User is on Contact Detail, "Notes" tab:**
1. `add-note-to-contact` (score: 5+4 = 9) ← most likely
2. `log-interaction` (score: 5) 
3. `voice-memo` (score: 5)
4. `draft-email` (score: 5)
5. `create-quote` (score: 2)
6. `create-task` (score: 0)

**Example: User is on Quote Detail:**
1. `create-invoice` (score: 5) ← convert quote to invoice
2. `draft-email` (score: 5) ← send quote to client
3. `add-note-to-contact` (score: 2) ← note on related contact

#### 3. Implicit actions — Context IS the command

When the context makes the intent obvious, the assistant can skip intent classification entirely:

```typescript
// If user is on contact detail → notes tab → taps mic and just starts talking
// The system can infer: this is a note for this contact
const implicitAction = getImplicitAction(context);

function getImplicitAction(context: ScreenContext): string | null {
  // Contact notes tab + voice input → almost certainly adding a note
  if (context.screen === 'contact-detail' && context.activeTab === 'notes') {
    return 'add-note-to-contact';
  }
  // Quote detail + voice input → probably adding/modifying line items
  if (context.screen === 'quote-detail') {
    return 'update-quote';
  }
  // Dashboard → no implicit action, use full intent classification
  return null;
}
```

When an implicit action is detected, the assistant can **skip the classification step** and go straight to entity extraction, making the response near-instant. The confirmation UI still shows so the user can override if the guess was wrong.

#### 4. Richer AI context — Better extraction

The `recordSummary` is included in the Claude prompt, giving the AI context for smarter extraction:

```
You are assisting a user who is currently viewing a Contact record:
- Name: John Smith
- Company: Acme Electrical
- Email: john@acme.com.au
- Phone: 0412 345 678

The user is on the "Notes" tab.

The user's voice input will likely relate to this contact. 
Do not ask for contact details — use the above.
If the user mentions a quote or job, check if it relates to this contact's 
existing quotes: Q-2024-0145 (Switchboard Upgrade, $4,200), Q-2024-0189 (Safety Audit, $800).
```

This means the AI can resolve references like "update the switchboard quote" to the correct quote ID without asking.

#### 5. Navigation suggestions — Post-action routing

After an action completes, the assistant can suggest navigating to the newly created record:

```typescript
interface ActionResult {
  success: boolean;
  recordId: string;
  entityType: string;
  // Suggest navigation if the new record is on a different screen
  suggestNavigation?: {
    screen: string;
    label: string;  // "View Quote Q-2024-0201"
  };
}
```

### Screen Context for Common Screens

| Screen | Entity Type | Implicit Action | Top Ranked Actions |
|--------|------------|-----------------|-------------------|
| Contact Detail (Notes tab) | Contact | `add-note-to-contact` | add-note, log-interaction, voice-memo |
| Contact Detail (Quotes tab) | Contact | — | create-quote, draft-email |
| Contact Detail (Activity tab) | Contact | `log-interaction` | log-interaction, create-follow-up |
| Quote Detail | Quote | — | draft-email (send quote), create-invoice, add-note |
| Job/Project Detail | Job | `add-note-to-contact` | document-site, log-material-usage, add-note |
| Contact List | — | — | create-contact, scan-business-card |
| Dashboard | — | — | full action list, no pre-filtering |
| Calendar/Schedule | — | `create-appointment` | create-appointment, create-follow-up |
| Inventory | — | `stock-check` | stock-check, scan-barcode, log-material-usage |

---

## Standard Actions Library

These are the actions that ship with the framework. Each client enables the ones they need.

### Contacts & CRM

#### `create-contact` — Create a New Contact
**Triggers:** "New contact", "Add contact", "Save this person", photo of business card, photo of ID
**Extracts:** First name, last name, email, phone, company, title, address, website, source
**VitalSync:** Creates a Contact record
**Notes:** Deduplication check before creating — searches existing contacts by email/phone and warns if match found

#### `update-contact` — Update Existing Contact
**Triggers:** "Update John's phone number", "Change the email for Acme Corp"
**Extracts:** Contact identifier (name/email/phone) + fields to update
**VitalSync:** Searches for contact, presents match for confirmation, then updates
**Notes:** Shows current vs. new values in confirmation UI

#### `add-note-to-contact` — Add a Note to a Contact
**Triggers:** "Add a note to John Smith", "Note for Acme Corp", "Save this to the client file"
**Extracts:** Contact identifier + free-text note content
**VitalSync:** Creates a Note record linked to the Contact
**Notes:** In conversation mode, the entire conversation can be saved as a note with AI-generated summary

#### `log-interaction` — Log a Call/Meeting/Visit
**Triggers:** "Log a call with Sarah", "Just had a meeting with the client", "Site visit completed"
**Extracts:** Contact identifier, interaction type, date/time, duration, summary, outcome, follow-up needed
**VitalSync:** Creates an Activity/Interaction record linked to Contact
**Notes:** In conversation mode, can auto-detect when the conversation ends and prompt to log it

#### `scan-business-card` — Scan and Create from Business Card
**Triggers:** Photo taken with business card detected, "Scan this card", "Read this business card"
**Extracts:** All contact fields from card image via Claude vision
**VitalSync:** Creates Contact with extracted data
**Notes:** Should handle various card layouts, vertical cards, cards with logos. Extracts both Latin and non-Latin text.

#### `scan-id-document` — Extract Info from ID/Licence
**Triggers:** Photo of driver's licence, Medicare card, passport, or other ID
**Extracts:** Full name, DOB, address, document number, expiry date
**VitalSync:** Populates Contact fields or a verification record
**Notes:** Privacy-sensitive — should warn user about data handling, never store the raw ID image unless explicitly configured

### Quoting & Sales

#### `create-quote` — Create a Quote/Estimate
**Triggers:** "Quote for John", "Create an estimate", "Price up a switchboard upgrade for Acme"
**Extracts:** Contact/company, line items (description, quantity, unit price), discount, notes, validity period
**VitalSync:** Creates a Quote record with QuoteLineItems, linked to Contact
**Notes:** Can pull from a product/service catalog if configured. Conversation mode is powerful here — listens to the back-and-forth and builds the quote progressively.

#### `create-invoice` — Create an Invoice
**Triggers:** "Invoice Acme for the switchboard job", "Bill John for today's work"
**Extracts:** Contact/company, line items, payment terms, due date, reference number
**VitalSync:** Creates an Invoice record with InvoiceLineItems
**Notes:** Can auto-populate from an existing Quote if referenced

#### `scan-receipt` — Capture an Expense/Receipt
**Triggers:** Photo of receipt, "Log this expense", "Save this receipt"
**Extracts:** Vendor, date, total, tax (GST), line items, payment method, category
**VitalSync:** Creates an Expense record, attaches receipt image
**Notes:** Critical for tradies and field workers. GST extraction important for Australian businesses.

### Scheduling & Tasks

#### `create-appointment` — Schedule an Appointment
**Triggers:** "Book John in for Thursday 2pm", "Schedule a site visit", "Set up a meeting"
**Extracts:** Contact, date/time, duration, location, description, appointment type
**VitalSync:** Creates an Appointment/Event record
**Notes:** Should check for conflicts if calendar data is available. Can suggest available slots.

#### `create-task` — Create a To-Do/Task
**Triggers:** "Remind me to follow up with John", "Task: order parts for the Smith job", "Don't forget to send the quote"
**Extracts:** Description, due date, priority, assigned to, linked contact/project
**VitalSync:** Creates a Task record
**Notes:** Good fallback action when intent is unclear — "just save this as a task"

#### `create-follow-up` — Schedule a Follow-Up
**Triggers:** "Follow up with John next week", "Chase up the quote in 3 days", "Remind me to call Sarah on Friday"
**Extracts:** Contact, follow-up type (call/email/visit), date, notes
**VitalSync:** Creates a Task or Activity record with future date
**Notes:** Natural language date parsing is critical ("next Tuesday", "in 3 days", "end of month")

### Communication

#### `draft-email` — Draft an Email
**Triggers:** "Email John about the quote", "Send Sarah the project update", "Write an email to confirm the appointment"
**Extracts:** Recipient (contact lookup), subject, body content, tone, attachments to include
**Output:** Generates email draft shown in the app for review, then sends via backend email service or opens native mail
**Notes:** Can auto-attach relevant documents (quotes, invoices) if referenced. Should adapt tone to business context.

#### `draft-sms` — Draft a Text Message
**Triggers:** "Text John that I'm running 15 minutes late", "Send a reminder SMS to tomorrow's appointments"
**Extracts:** Recipient, message body
**Output:** Generates SMS draft, sends via SMS gateway or opens native messaging
**Notes:** Keep concise. Can do bulk messaging for appointment reminders.

#### `generate-summary-email` — Summarize and Send Meeting Notes
**Triggers:** "Send John a summary of what we discussed", "Email the meeting notes"
**Extracts:** Contact, conversation context, key decisions, action items
**Output:** Structured email with summary, decisions, next steps
**Notes:** Best used after conversation mode — takes the full transcript and produces a professional summary

### Documentation & Notes

#### `voice-memo` — Save a Voice Memo
**Triggers:** "Save a voice memo", "Record a note", "Just save what I'm saying"
**Extracts:** Raw transcript + AI-generated summary + tags/categories
**VitalSync:** Creates a Note record, optionally linked to a Contact or Project
**Notes:** Lowest-friction action — useful when the user just wants to capture something without classifying it

#### `document-site` — Document a Job Site / Property
**Triggers:** "Document this site", "Take photos of the damage", "Record the property condition"
**Extracts:** Photos + voice descriptions, location (GPS), date, condition notes, measurements mentioned
**VitalSync:** Creates a SiteVisit or Inspection record with attached photos and notes
**Notes:** Combines camera + voice. GPS from Capacitor Geolocation plugin. Critical for tradies, property managers, insurance.

#### `dictate-report` — Dictate a Report or Form
**Triggers:** "Fill out the inspection report", "Dictate the job completion form"
**Extracts:** Structured fields based on a configured form/report template
**VitalSync:** Creates or updates a record matching the form template
**Notes:** The AI maps spoken answers to specific form fields. Works with any VitalSync entity.

### Inventory & Products

#### `scan-barcode` — Scan a Product Barcode
**Triggers:** Photo of barcode/QR code, "Scan this product"
**Extracts:** Barcode value → product lookup from VitalSync catalog
**Output:** Shows product details, stock levels, price
**Notes:** Requires a product catalog in VitalSync. Uses a barcode detection library on-device.

#### `stock-check` — Check Stock Levels
**Triggers:** "How many switchboards do we have?", "Check stock on safety switches"
**Extracts:** Product identifier
**VitalSync:** Queries product/inventory records
**Output:** Shows current stock, reorder point, recent usage

#### `log-material-usage` — Log Materials Used on a Job
**Triggers:** "Used 3 safety switches on the Smith job", "Log materials"
**Extracts:** Product, quantity, job/project reference
**VitalSync:** Creates a MaterialUsage record, decrements stock
**Notes:** Useful for tradies tracking materials per job for accurate invoicing

---

## Predictive Lifecycle Intelligence

The VitalSync SDK can run fast queries across tens of thousands of records, including full field-change history on any contact. This enables a **predictive lifecycle engine** — a system that understands where every contact is in their journey, what typically happens next based on patterns across all contacts, and what the business user should do (and say) right now.

This is not just analytics — it produces **actionable prompts** that appear as buttons and suggested scripts directly in the app UI, personalized to each contact's current state.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Background Processing                     │
│                                                             │
│  Triggers:                                                  │
│  • Contact field change (status, tag, custom field)         │
│  • Email opened / link clicked                              │
│  • Form submitted                                           │
│  • Appointment completed                                    │
│  • Quote viewed / accepted / declined                       │
│  • Inactivity threshold reached (e.g., 14 days no contact)  │
│  • Manual trigger from app                                  │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │              n8n Webhook Trigger                   │      │
│  │  (VitalSync automation fires on field change)     │      │
│  └──────────────────────┬────────────────────────────┘      │
│                         │                                   │
│                         ▼                                   │
│  ┌───────────────────────────────────────────────────┐      │
│  │         Lifecycle Analysis Pipeline               │      │
│  │                                                   │      │
│  │  1. Fetch contact's full field-change history     │      │
│  │     (VitalSync SDK — fast query across all logs)  │      │
│  │                                                   │      │
│  │  2. Fetch contact's activity timeline             │      │
│  │     (emails, calls, forms, appointments, quotes)  │      │
│  │                                                   │      │
│  │  3. Build contact's lifecycle position             │      │
│  │     (current stage + time in stage + velocity)    │      │
│  │                                                   │      │
│  │  4. Query cohort patterns                         │      │
│  │     (what did similar contacts do next?)          │      │
│  │                                                   │      │
│  │  5. Generate next-best-action + talk track        │      │
│  │     (Claude with full context)                    │      │
│  │                                                   │      │
│  │  6. Write prompts back to contact record          │      │
│  │     (VitalSync mutation → custom fields)          │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

                         │
                         ▼

┌─────────────────────────────────────────────────────────────┐
│                    App UI (Contact Detail)                    │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │  🟢 Next Step: Send follow-up quote               │      │
│  │                                                   │      │
│  │  "John viewed the quote 3 days ago but hasn't     │      │
│  │   responded. Similar clients who went quiet at    │      │
│  │   this stage converted 68% of the time after a    │      │
│  │   casual check-in within 5 days."                 │      │
│  │                                                   │      │
│  │  Suggested message:                               │      │
│  │  "Hi John, just checking in on the switchboard    │      │
│  │   quote — happy to answer any questions or        │      │
│  │   adjust the scope if needed."                    │      │
│  │                                                   │      │
│  │  [📧 Send Email]  [💬 Send SMS]  [🎤 Call Script] │      │
│  │  [⏭ Dismiss]  [⏰ Remind Me Later]               │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │  💡 Insight: John matches the "slow decider"      │      │
│  │  pattern — avg 11 days to commit. He's at day 8.  │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Lifecycle Position Calculation

The engine builds a **lifecycle snapshot** for each contact by analyzing their field-change history:

```typescript
interface LifecycleSnapshot {
  contactId: string;
  
  // Current position
  currentStage: string;              // e.g., 'quote-sent', 'negotiation', 'won', 'inactive'
  stageEnteredAt: Date;
  daysInCurrentStage: number;
  
  // Journey so far
  stageHistory: {
    stage: string;
    enteredAt: Date;
    exitedAt: Date | null;
    durationDays: number;
    exitTrigger?: string;            // What caused the transition (email reply, form submit, etc.)
  }[];
  
  // Velocity metrics
  totalJourneyDays: number;          // Days since first contact
  averageStageDuration: number;      // How long they typically spend per stage
  velocityTrend: 'accelerating' | 'steady' | 'stalling' | 'stalled';
  
  // Engagement signals
  lastActivity: Date;
  daysSinceLastActivity: number;
  recentEngagement: {
    emailsOpened: number;            // Last 30 days
    linksClicked: number;
    formsSubmitted: number;
    appointmentsAttended: number;
    quotesViewed: number;
  };
  
  // Risk assessment
  churnRisk: 'low' | 'medium' | 'high';
  churnRiskFactors: string[];        // e.g., ["12 days no activity", "quote viewed but not accepted"]
}
```

### Cohort Pattern Analysis

This is where the power of querying across all contacts comes in. The engine identifies **what typically happens next** for contacts in a similar position:

```typescript
interface CohortAnalysis {
  // Contacts who were in the same stage with similar characteristics
  cohortSize: number;
  
  // What they did next
  outcomes: {
    nextStage: string;
    percentage: number;              // e.g., 68% went to 'won'
    averageDaysToTransition: number;
    commonTriggers: string[];        // What actions preceded the transition
  }[];
  
  // What the business DID that correlated with success
  successPatterns: {
    action: string;                  // e.g., 'follow-up-call-within-5-days'
    conversionRate: number;
    averageRevenueImpact?: number;
    sampleSize: number;
  }[];
  
  // What correlated with failure/churn
  riskPatterns: {
    indicator: string;               // e.g., 'no-response-after-14-days'
    churnRate: number;
    sampleSize: number;
  }[];
}
```

**Example cohort query logic (runs in n8n):**

```
1. Current contact: Stage = "quote-sent", daysInStage = 5, industry = "residential"
2. Query all contacts who were EVER in stage "quote-sent" with industry "residential"
3. For each, check: what stage did they transition to? How long did it take? What happened right before?
4. Aggregate: 68% → won (avg 8 days), 22% → lost (avg 21 days), 10% → still pending
5. Of the 68% who won, 74% received a follow-up call within 5 days of quote being sent
6. Of the 22% who lost, 85% had NO follow-up after 7 days
```

### Next-Best-Action Generation

Once the lifecycle position and cohort patterns are known, the engine calls Claude to generate a **specific, actionable prompt** for the business user:

```typescript
interface NextBestAction {
  // Primary recommendation
  action: string;                    // Internal action ID (maps to assistant action registry)
  priority: 'urgent' | 'recommended' | 'suggested';
  headline: string;                  // "Send follow-up quote"
  
  // Why this action
  reasoning: string;                 // "John viewed the quote 3 days ago but hasn't responded..."
  dataPoints: string[];              // Specific stats backing the recommendation
  
  // How to do it — talk track
  suggestedMessage?: {
    channel: 'email' | 'sms' | 'call';
    subject?: string;                // For email
    body: string;                    // The actual suggested words
    tone: string;                    // "casual", "professional", "urgent"
    personalization: string[];       // What was personalized (e.g., "referenced their quote amount")
  };
  
  // Alternative actions
  alternatives?: {
    action: string;
    headline: string;
    reasoning: string;
  }[];
  
  // Integration with assistant actions
  quickActions: {
    label: string;
    icon: string;
    assistantAction: string;         // Maps to action registry ID
    prefillData: Record<string, any>; // Pre-populated data for the action
  }[];
  
  // Dismiss/snooze
  snoozeOptions: string[];           // "1 hour", "Tomorrow", "Next week", "After they respond"
}
```

**The Claude prompt for generating next-best-actions:**

```typescript
function buildNextBestActionPrompt(
  contact: ContactRecord,
  lifecycle: LifecycleSnapshot,
  cohort: CohortAnalysis,
  businessContext: BusinessContext,
  communicationHistory: CommunicationLog[],
  knowledgeBase?: string,            // Business's role-specific knowledge base
): string {
  return `You are a sales/service advisor for a ${businessContext.industry} business.

## Contact
${JSON.stringify(contact, null, 2)}

## Lifecycle Position
- Current stage: ${lifecycle.currentStage} (${lifecycle.daysInCurrentStage} days)
- Velocity: ${lifecycle.velocityTrend}
- Churn risk: ${lifecycle.churnRisk} — factors: ${lifecycle.churnRiskFactors.join(', ')}
- Last activity: ${lifecycle.daysSinceLastActivity} days ago

## What Similar Contacts Did
${cohort.outcomes.map(o => `- ${o.percentage}% moved to "${o.nextStage}" (avg ${o.averageDaysToTransition} days)`).join('\n')}

## What Worked for Similar Contacts
${cohort.successPatterns.map(p => `- "${p.action}" → ${(p.conversionRate * 100).toFixed(0)}% conversion (n=${p.sampleSize})`).join('\n')}

## Recent Communications With This Contact
${communicationHistory.slice(-5).map(c => `[${c.date}] ${c.channel}: ${c.summary}`).join('\n')}

${knowledgeBase ? `## Business Knowledge Base\n${knowledgeBase}` : ''}

## Task
Recommend the single best next action for this contact right now. Include:
1. What to do (specific action)
2. Why (backed by the cohort data)
3. A suggested message they could send — personalized to this contact, referencing specific details from their record and communication history
4. The right tone based on the relationship stage and communication history
5. 1-2 alternative actions if the primary doesn't fit

Keep the suggested message natural and human — not corporate or templated. 
Match the communication style of previous messages to this contact.
Australian English. Casual but professional.`;
}
```

### Talk Track Generation

The suggested messages are the killer feature. They're not generic templates — they're **personalized scripts** generated from:

1. **Contact data** — their name, company, what they enquired about, specific quote amounts
2. **Communication history** — matches the tone and style of previous conversations with this contact
3. **Cohort patterns** — references what worked for similar contacts ("a quick check-in at this point tends to work well")
4. **Business knowledge base** — role-specific language, product details, common objections and responses
5. **Channel** — email is longer and more detailed, SMS is brief and casual, call script has talking points not a verbatim script

**Examples by stage:**

| Stage | Situation | Suggested Action | Talk Track Style |
|-------|-----------|-----------------|-----------------|
| Quote sent, 3 days, viewed | Client looked but hasn't responded | Casual check-in email | "Hi [name], just checking in on the quote — happy to adjust if needed" |
| Quote sent, 10 days, not viewed | Client may not have seen it | Resend with SMS nudge | SMS: "Hey [name], sent through that quote last week — want me to resend?" |
| Post-appointment, no quote requested | Client is evaluating | Send value-add content | Email with relevant case study or FAQ |
| Won, job completed, 30 days | Ripe for review/referral | Request review | "Thanks again for choosing us for [job] — if you've got a moment, a Google review would mean a lot" |
| Inactive 60 days, was hot lead | Re-engagement needed | Personal re-engagement | "Hi [name], [rep] here — we spoke back in [month] about [project]. Still on the radar?" |
| New lead, just enquired | Fast response critical | Immediate call + follow-up email | Call script: key questions to ask. Email: confirm details discussed. |

### Contact Record Fields for Prompts

The n8n pipeline writes its output to custom fields on the contact record in VitalSync. The app reads these fields and renders the prompt UI:

```typescript
// Fields written by the n8n lifecycle pipeline
interface LifecyclePromptFields {
  // Core prompt data (stored as JSON string in a VitalSync text field)
  ai_next_action: string;            // JSON: NextBestAction object
  ai_next_action_updated: string;    // ISO timestamp of last calculation
  
  // Quick-access fields for list views and filtering
  ai_lifecycle_stage: string;        // Current stage label
  ai_churn_risk: string;             // 'low' | 'medium' | 'high'
  ai_days_in_stage: number;
  ai_recommended_action: string;     // Short label: "Follow up", "Send quote", "Re-engage"
  ai_action_priority: string;        // 'urgent' | 'recommended' | 'suggested'
}
```

This means you can also build **dashboard views** that show:
- All contacts with `ai_action_priority = 'urgent'` → "These need attention today"
- All contacts with `ai_churn_risk = 'high'` → "At risk of dropping off"
- Contacts sorted by `ai_days_in_stage` descending → "Stuck in the pipeline"

### Trigger Architecture (n8n)

```
VitalSync Automation Rule (on field change / activity)
  │
  ├─► Webhook → n8n "Lifecycle Trigger" workflow
  │     │
  │     ├── Fetch contact's full field-change history (VitalSync GraphQL)
  │     ├── Fetch contact's activity log (VitalSync GraphQL)
  │     ├── Fetch communication history (emails, SMS, call logs)
  │     ├── Query cohort data (aggregate query across all contacts)
  │     ├── Call Claude API with full context
  │     ├── Write NextBestAction JSON to contact record (VitalSync mutation)
  │     └── Optionally: trigger push notification if urgent
  │
  ├─► Scheduled (daily 6am) → n8n "Lifecycle Sweep" workflow
  │     │
  │     ├── Query all contacts with stale ai_next_action (>24h old)
  │     ├── Query all contacts with no recent activity (inactivity detection)
  │     ├── Batch process through the same pipeline
  │     └── Update all affected contact records
  │
  └─► App manual trigger → n8n "Lifecycle Refresh" workflow
        │
        ├── Single contact refresh (user taps "Refresh" on a contact)
        └── Runs same pipeline for one contact, returns result immediately
```

### Integration with Voice Assistant

The lifecycle prompts connect directly to the voice/vision assistant via the action registry:

1. User views a contact with an active prompt: **"Send follow-up email"**
2. User taps the email quick-action button
3. The `draft-email` assistant action fires with **pre-filled data**:
   - Recipient: already set (from contact record)
   - Subject: already drafted (from the NextBestAction)
   - Body: already written (from the talk track)
4. User reviews in the confirmation UI, edits if needed, sends
5. The send event triggers the lifecycle pipeline to recalculate the next action

Or with voice:
1. User is on the contact, sees the prompt
2. Taps mic: "Yeah, send that email" or "Call them instead"
3. Screen context + lifecycle prompt context means the assistant knows exactly what "that email" or "them" refers to
4. Action executes with full context

### Feedback Loop

Every action taken (or dismissed) feeds back into the cohort analysis:

```typescript
interface ActionOutcome {
  contactId: string;
  actionTaken: string;              // What the user actually did
  actionSuggested: string;          // What the AI recommended
  followed: boolean;                // Did they follow the recommendation?
  outcome?: string;                 // What happened after (e.g., "contact replied", "quote accepted")
  outcomeTimeDays?: number;         // How long until the outcome
}
```

Over time, this data improves the cohort patterns:
- "Follow-up emails sent within 3 days have 72% response rate vs 31% after 7 days"
- "SMS check-ins convert better than emails for contacts under 35"
- "The 'casual check-in' tone outperforms 'professional follow-up' for residential clients"

These refined patterns feed back into the Claude prompt for next-best-action generation, creating a **self-improving system**.

---



### Prompt Architecture

The backend sends a carefully structured prompt to Claude that includes:

1. **System context**: Business type, terminology, enabled actions with their schemas
2. **Conversation history**: Previous turns in the current session (for multi-step interactions)
3. **Input**: The transcript, image, or text from the user
4. **Tools**: Each enabled action defined as a Claude tool

```typescript
// Simplified example of the prompt construction
function buildPrompt(input: AssistantInput, config: AssistantConfig): ClaudeMessage {
  const enabledActions = config.enabledActions
    .map(id => actionRegistry.get(id))
    .filter(Boolean);

  const tools = enabledActions.map(action => ({
    name: action.id,
    description: action.intentDescription,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        [...action.requiredFields, ...action.optionalFields].map(f => [
          f.key,
          { type: zodToJsonSchemaType(f.type), description: f.label }
        ])
      ),
      required: action.requiredFields.map(f => f.key),
    },
  }));

  return {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a business assistant for a ${config.businessContext.industry} company.
Your job is to understand what the user wants to do and call the appropriate tool with extracted data.
If the input is an image of a business card, extract all visible contact information.
If the input is a conversation transcript, extract relevant business data.
Always extract Australian phone formats (04xx xxx xxx) and ABNs where present.
Industry terminology: ${JSON.stringify(config.businessContext.terminology)}`,
    tools,
    messages: [
      {
        role: 'user',
        content: input.type === 'image'
          ? [
              { type: 'image', source: { type: 'base64', media_type: input.mimeType, data: input.imageData } },
              { type: 'text', text: input.transcript || 'Extract all relevant information from this image.' }
            ]
          : input.transcript,
      },
    ],
  };
}
```

### Multi-Step Interactions

Some actions need follow-up questions:

1. User: "Create a quote for John" → AI identifies `create-quote` action, knows contact is "John"
2. AI: "I found John Smith at Acme Corp. What items should I include in the quote?"
3. User: "Switchboard upgrade, $2,400, and a safety switch install, $350"
4. AI: Calls `create-quote` tool with complete data
5. Confirmation UI shown

The conversation history is maintained in the session and sent with each subsequent request.

### Confidence and Disambiguation

The AI should return a confidence level with each extraction:

```typescript
interface ExtractionResult {
  action: string;
  confidence: number;        // 0-1
  extractedData: Record<string, any>;
  ambiguities?: {
    field: string;
    options: string[];       // "Did you mean X or Y?"
    reason: string;
  }[];
  missingRequired?: string[]; // Fields that couldn't be extracted
}
```

- **High confidence (>0.85)**: Show confirmation UI directly
- **Medium confidence (0.5-0.85)**: Show confirmation UI with highlighted uncertain fields
- **Low confidence (<0.5)**: Ask clarifying question before proceeding
- **Multiple intents detected**: Show action picker ("Did you want to create a contact or add a note?")

---

## 1Brain Knowledge Integration

The AI assistant doesn't just know about contacts and lifecycle data — it has access to the business's **entire operational brain** via 1Brain, which contains:

- **Standard Operating Procedures (SOPs)** — step-by-step processes for every business function
- **Role descriptions** — what each role is responsible for, KPIs, decision authority
- **Policies** — HR, compliance, customer service, escalation, pricing rules
- **Training materials** — onboarding docs, product knowledge, objection handling
- **Playbooks** — sales scripts, service recovery procedures, upsell frameworks

This transforms the assistant from "here's what to do next for this contact" to **"here's what to do next, here's the exact process your role should follow to do it, and here's the relevant policy context."**

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     AI Context Assembly                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  VitalSync   │  │  1Brain     │  │  User Session        │ │
│  │              │  │             │  │                      │ │
│  │ • Contact    │  │ • SOPs      │  │ • Logged-in user     │ │
│  │ • Lifecycle  │  │ • Policies  │  │ • Their role         │ │
│  │ • Cohort     │  │ • Role docs │  │ • Their permissions  │ │
│  │   patterns   │  │ • Playbooks │  │ • Their KPIs         │ │
│  │ • Activity   │  │ • Training  │  │ • Their active tasks │ │
│  │   history    │  │ • FAQs      │  │ • Screen context     │ │
│  └──────┬───────┘  └──────┬──────┘  └──────────┬───────────┘ │
│         │                 │                     │            │
│         └────────────┬────┴─────────────────────┘            │
│                      │                                       │
│                      ▼                                       │
│         ┌─────────────────────────┐                          │
│         │    Claude API Call      │                          │
│         │    (full context from   │                          │
│         │     all three sources)  │                          │
│         └─────────────────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

### How 1Brain Context Enhances Every Feature

#### Voice Assistant + 1Brain

Without 1Brain, the assistant extracts data and performs actions. With 1Brain, it also **coaches the user through the process:**

| Scenario | Without 1Brain | With 1Brain |
|----------|---------------|-------------|
| "Create a quote for this client" | Extracts line items, creates quote | Also: "Your pricing policy requires 15% margin minimum on residential jobs. The switchboard upgrade is currently at 12%. SOP says to check with your manager before discounting below threshold." |
| "Log a complaint from this customer" | Creates a note tagged as complaint | Also: "Per your Service Recovery SOP, complaints require: 1) Acknowledge within 2 hours, 2) Assign to team lead, 3) Resolution within 48 hours. Would you like me to create the escalation task and notify [team lead]?" |
| "What should I do next with this lead?" | Lifecycle engine suggests follow-up | Also: "As an Account Manager, your role KPI is 24-hour lead response time. This lead came in 6 hours ago. Your sales playbook recommends a discovery call first — here are the 5 qualifying questions from your playbook." |
| New employee asks "How do I process a refund?" | Can't help without business knowledge | Retrieves the refund SOP, walks them through step by step, and can action each step via the assistant |

#### Lifecycle Prompts + 1Brain

The next-best-action generation now includes role-specific process context in the Claude prompt:

```
## Your Role
Account Manager: Manages client relationships from quote through to completion.
Key responsibilities: Lead follow-up, quote generation, client communication, upselling
KPIs: Response time <4hrs, Quote conversion >35%, Monthly revenue target $80,000
Decision authority: Can discount up to 10%, escalate above to Sales Manager

## Relevant Procedures
### Quote Follow-Up SOP
1. Send quote within 24 hours of enquiry
2. Follow up by phone within 48 hours of sending
3. If no response after 5 days, send check-in email
4. If no response after 10 days, offer modified scope or discount (within authority)
5. If no response after 21 days, mark as cold and schedule 90-day re-engagement

## Applicable Policies
- Minimum margin 15% on residential, 12% on commercial
- Quotes valid for 30 days unless specified
- Discounts above 10% require Sales Manager approval

## Playbook Guidance
### Handling Price Objections
Acknowledge → Reframe around value → Offer phased approach → Last resort: offer scope reduction
```

#### Talk Tracks + 1Brain

Suggested messages now draw from the business's actual playbooks:

- **Objection handling**: "If the client says it's too expensive, your playbook suggests: acknowledge the concern, reframe around value, offer a phased approach"
- **Upsell scripts**: "Based on the job scope, your playbook identifies safety switch installation as the natural add-on — here's the recommended way to position it"
- **Compliance language**: "Your policy requires this specific disclaimer in quotes over $10,000"

### 1Brain API Integration

```typescript
interface OneBrainService {
  // Search across all knowledge
  search(query: string, filters?: {
    categories?: string[];          // 'sop' | 'policy' | 'role' | 'playbook' | 'training'
    roles?: string[];               // Filter to specific roles
    departments?: string[];
  }): Promise<OneBrainDocument[]>;
  
  // Get documents relevant to a specific action and role
  getRelevantDocs(params: {
    action: string;                 // Assistant action ID
    role: string;                   // Current user's role
    entityType?: string;            // VitalSync entity being acted on
    stage?: string;                 // Lifecycle stage
  }): Promise<{
    sops: SOPDocument[];
    policies: PolicyDocument[];
    playbooks: PlaybookSection[];
  }>;
  
  // Get role definition with KPIs and authority
  getRole(roleId: string): Promise<RoleDescription>;
}
```

### Environment Variables

```env
# 1Brain integration
ONEBRAIN_API_URL=https://api.1brain.com/v1
ONEBRAIN_API_KEY=...
ONEBRAIN_ORG_ID=...
```

---

## Role-Based Adaptive Dashboards

The app includes dashboards **personalized to the logged-in user's role**, showing metrics that matter specifically to them. Combined with the AI assistant, users can add new metrics by simply asking for them in natural language.

### How It Works

Each user has a role (from 1Brain or VitalSync user record). The dashboard loads a **metric configuration** specific to that role:

```typescript
interface RoleDashboardConfig {
  roleId: string;
  roleName: string;                  // e.g., 'Account Manager', 'Service Technician'
  
  defaultMetrics: MetricConfig[];    // Pre-configured metrics for this role
  userAddedMetrics: MetricConfig[];  // Metrics the user added via AI or settings
  
  refreshInterval: number;           // How often to re-query (seconds)
  layout: 'grid' | 'list';
  columns: number;
}

interface MetricConfig {
  id: string;
  title: string;                     // "Open Quotes This Month"
  
  // Query (uses existing Dynamic Metrics QueryConfig pattern)
  queryConfig: QueryConfig;          // English → QueryConfig → GraphQL
  
  // Display
  visualization: 'number' | 'trend' | 'bar-chart' | 'line-chart' | 'list' | 'progress';
  format?: 'currency' | 'percentage' | 'number' | 'duration';
  
  // Context
  comparison?: 'previous-period' | 'target' | 'team-average';
  target?: number;                   // KPI target (can come from 1Brain role definition)
  
  // Alerts
  alertThreshold?: {
    condition: 'above' | 'below' | 'change-percent';
    value: number;
    severity: 'info' | 'warning' | 'critical';
    message: string;
  };
  
  position: number;
  pinned: boolean;
}
```

### Default Metrics by Role

| Role | Default Metrics |
|------|----------------|
| **Sales / Account Manager** | Open quotes (count + value), Quote conversion rate, Revenue this month vs target, Leads awaiting first contact, Average response time, Pipeline by stage |
| **Service Technician** | Jobs assigned today, Jobs completed this week, Average job duration, Parts used this month, Customer satisfaction score, Overdue jobs |
| **Office Admin** | Invoices awaiting payment, Overdue invoices (count + value), New contacts this week, Appointments today, Tasks due today |
| **Business Owner** | Total revenue (month/quarter/year), Cash flow, Team performance summary, Customer acquisition cost, Top clients by revenue, Growth trend |
| **Project Manager** | Active projects by status, Projects at risk, Team utilization, Milestones due this week, Budget vs actual |

### Voice-Driven Metric Creation

The user talks to the assistant and a new metric appears on their dashboard. This leverages the existing **Dynamic Metrics** feature pattern:

```
User (on dashboard): "Show me how many quotes I sent last month 
                      that haven't been responded to"
     │
     ▼
Voice Assistant recognizes this as a metric request
     │
     ▼
Dynamic Metrics engine: English → QueryConfig → GraphQL
     │
     ▼
Metric added to user's dashboard with live data
     │
     ▼
"You have 14 unresponded quotes from last month worth $47,200.
 Pinned to your dashboard."
```

**New assistant action: `add-dashboard-metric`**

```typescript
const addDashboardMetric: AssistantAction = {
  id: 'add-dashboard-metric',
  name: 'Add Dashboard Metric',
  category: 'dashboard',
  intentKeywords: ['show me', 'how many', 'what is my', 'track', 'add a metric', 'add to dashboard'],
  intentDescription: 'User wants to see a specific metric or add a new data visualization to their dashboard',
  entityType: 'UserDashboardMetric',
  mutationType: 'custom',
  
  requiredFields: [
    { key: 'naturalLanguageQuery', label: 'What to measure', type: 'string', vitalSyncField: '' },
  ],
  optionalFields: [
    { key: 'visualization', label: 'Chart type', type: 'enum', vitalSyncField: '', 
      enumOptions: ['number', 'trend', 'bar-chart', 'line-chart', 'list', 'progress'] },
    { key: 'comparison', label: 'Compare to', type: 'enum', vitalSyncField: '', 
      enumOptions: ['previous-period', 'target', 'team-average'] },
    { key: 'pinned', label: 'Pin to top', type: 'boolean', vitalSyncField: '' },
  ],
  
  confirmationTemplate: 'MetricPreviewCard',
  successMessage: 'Metric added to your dashboard',
};
```

**Conversational metric refinement:**

> User: "Show me my revenue this quarter"
> Assistant: *adds metric, shows $142,000*
> User: "Break that down by month"
> Assistant: *changes visualization to bar chart with monthly breakdown*
> User: "Compare it to last quarter"
> Assistant: *adds previous-period comparison, shows +18% growth*
> User: "Set a target of $200K"
> Assistant: *adds target line, shows 71% progress*

Each refinement updates the metric config in place.

### Dashboard + Lifecycle Prompts Combined

The dashboard also surfaces **lifecycle action items** as a dedicated section:

```
┌────────────────────────────────────────────────┐
│  📊 Your Dashboard — Account Manager           │
│                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Open     │ │ Revenue  │ │ Response │       │
│  │ Quotes   │ │ This Mo  │ │ Time Avg │       │
│  │   23     │ │ $47,200  │ │  3.2 hrs │       │
│  │ ▲ +4     │ │ 62% of   │ │ ✅ Under │       │
│  │ vs last  │ │ target   │ │ 4hr KPI  │       │
│  └──────────┘ └──────────┘ └──────────┘       │
│                                                │
│  🔥 Needs Your Attention (3)                   │
│  ┌────────────────────────────────────────┐    │
│  │ 🔴 John Smith — Follow up on quote     │    │
│  │    Quote viewed 5 days ago, no response│    │
│  │    [📧 Send Email] [📞 Call]           │    │
│  ├────────────────────────────────────────┤    │
│  │ 🟡 Sarah Chen — Discovery call overdue │    │
│  │    Lead assigned 26 hours ago          │    │
│  │    [📞 Call Now] [⏰ Reschedule]       │    │
│  ├────────────────────────────────────────┤    │
│  │ 🟡 Acme Corp — Quote expiring tomorrow │    │
│  │    $12,400 switchboard upgrade         │    │
│  │    [📧 Remind Client] [📝 Extend]     │    │
│  └────────────────────────────────────────┘    │
│                                                │
│  🎤 "Add a metric..."                         │
└────────────────────────────────────────────────┘
```

The action items come from the lifecycle engine (filtered by the logged-in user's assigned contacts), and the quick-action buttons wire directly into the voice assistant's action registry.

---

## Frontend Components

### AssistantFAB (Floating Action Button)

The main entry point — a persistent floating button with expandable options:

```
  [🎤]  ← Tap: command voice mode. Long-press: conversation mode
  [📷]  ← Camera capture
  [💬]  ← Open chat interface
```

### AssistantOverlay

Full-screen overlay that appears when the assistant is active:

- **Listening indicator**: Animated waveform showing active recording
- **Live transcript**: Real-time text appearing as user speaks
- **Entity chips**: Extracted data appearing as colored chips (name, phone, email, etc.)
- **Action badge**: Shows which action was detected ("Creating Contact...")
- **Cancel button**: Stop and discard

### ConfirmationCard

Standardized confirmation UI that every action uses:

- Shows extracted data in a clean, editable form
- Highlights low-confidence fields in amber
- Shows which VitalSync entity will be created/updated
- Three actions: Confirm, Edit (opens editable form), Cancel
- Optional: "Also do..." suggestions (e.g., after creating a contact: "Also create a follow-up task?")

### ConversationPanel

For conversation mode — a side panel or bottom sheet showing:

- Rolling transcript with speaker labels (if diarization is available)
- Progressive entity extraction displayed alongside
- Ability to pin/unpin extracted entities
- "Process" button to trigger action creation from the accumulated data

---

## Backend API Endpoints

```
POST /api/assistant/process
  Body: { type: 'voice' | 'image' | 'text', transcript?: string, image?: string, sessionId: string }
  Returns: { action, confidence, extractedData, ambiguities, missingRequired }

POST /api/assistant/confirm
  Body: { sessionId: string, action: string, data: Record<string, any> }
  Returns: { success: boolean, recordId?: string, error?: string }
  Action: Executes the VitalSync mutation

POST /api/assistant/clarify
  Body: { sessionId: string, response: string }
  Returns: Same as /process (continues the conversation)

GET /api/assistant/actions
  Returns: List of enabled actions with their schemas (for client-side validation)

POST /api/assistant/transcribe
  Body: FormData with audio file
  Returns: { transcript: string, speakers?: SpeakerSegment[] }
  Action: Server-side transcription for conversation mode
```

---

## Implementation Sequence

### Phase 1: Foundation
1. Camera capture → business card scanning → create contact
2. Voice command mode → create contact, add note
3. Confirmation UI component
4. Action registry with 3-4 core actions
5. Express backend endpoint with Claude tool use

### Phase 2: Core Actions
6. Quote creation (voice + manual)
7. Email drafting
8. Task/follow-up creation
9. Receipt/expense scanning
10. Contact search and update

### Phase 3: Conversation Mode
11. Continuous voice transcription
12. Progressive entity extraction
13. Meeting summary generation
14. Multi-action extraction from single conversation

### Phase 4: Advanced
15. Speaker diarization
16. Barcode scanning
17. Site documentation (photo + voice)
18. Form/report dictation
19. Bulk operations (SMS reminders, etc.)
20. Offline mode with sync queue

### Phase 5: Predictive Lifecycle Engine
21. Contact lifecycle snapshot calculation (field-change history queries)
22. Cohort pattern analysis (aggregate queries across all contacts)
23. n8n pipeline: trigger-based lifecycle recalculation
24. Next-best-action prompt UI on contact detail screen
25. Talk track generation with Claude (personalized suggested messages)
26. Quick-action buttons wired to assistant action registry
27. Dashboard views: urgent actions, at-risk contacts, stuck pipeline
28. Daily sweep workflow for stale/inactive contacts
29. Feedback loop: track action outcomes to refine cohort patterns
30. Self-improving pattern detection (outcome data feeds back into recommendations)

### Phase 6: 1Brain + Role-Based Dashboards
31. 1Brain API integration service
32. Role-based context injection into all Claude prompts
33. SOP/policy retrieval for action-specific guidance
34. Role-based default dashboard configurations
35. Voice-driven metric creation (`add-dashboard-metric` action)
36. Conversational metric refinement (change visualization, add comparisons)
37. Dashboard lifecycle action items section
38. KPI targets from 1Brain role definitions → dashboard alert thresholds
39. Playbook-enhanced talk tracks in lifecycle prompts

---

## Dependencies

### Capacitor Plugins (add to mobile template)
- `@capacitor-community/speech-recognition` — On-device speech-to-text
- `@capacitor/camera` — Photo capture (already likely included)
- `@capacitor-community/barcode-scanner` — For product scanning
- `@capacitor/geolocation` — GPS for site documentation

### Backend
- `@anthropic-ai/sdk` — Claude API for AI processing (or direct fetch)
- `multer` — File upload handling for audio/images
- `sharp` — Image preprocessing before sending to Claude

### Optional Cloud Services
- **Deepgram** or **AssemblyAI** — For conversation mode with speaker diarization
- **Whisper API** — Alternative STT for conversation mode

---

## Environment Variables

```env
# .env (Express backend)
ANTHROPIC_API_KEY=sk-ant-...
ASSISTANT_MODEL=claude-sonnet-4-20250514
ASSISTANT_MAX_TOKENS=2048

# Optional: cloud transcription for conversation mode
DEEPGRAM_API_KEY=...

# 1Brain knowledge base
ONEBRAIN_API_URL=https://api.1brain.com/v1
ONEBRAIN_API_KEY=...
ONEBRAIN_ORG_ID=...

# VitalSync (already exists in mobile template)
VITALSYNC_API_KEY=...
VITALSYNC_SLUG=...
```

```env
# .env (Frontend — VITE_ prefix)
VITE_ASSISTANT_ENABLED=true
VITE_ASSISTANT_VOICE_ENABLED=true
VITE_ASSISTANT_CAMERA_ENABLED=true
VITE_ASSISTANT_CONVERSATION_MODE=true
```

---

## Schema Integration

Each client app already has a VitalSync schema XML. The action registry should be generated or configured based on this schema:

1. Parse the client's schema XML (using your existing `docs/schema-format.md` patterns)
2. Map entity types to available actions (if the schema has a `Quote` entity, enable quoting actions)
3. Map field names to extraction targets (the AI needs to know that `f_first_name` is where "first name" goes)
4. Include enum values so the AI can validate (e.g., `status` field with options `New`, `In Progress`, `Completed`)

This means the system auto-configures itself based on the client's data model — minimal manual setup per client.

---

## Privacy & Compliance

### Recording Consent
- Australia requires **one-party consent** for private conversations in most states (the person recording is the consenting party)
- However, best practice is to inform all parties: show a visible recording indicator in the UI
- Add a consent prompt on first use explaining what data is captured and how it's processed
- Never record without the user explicitly initiating it (no ambient listening)

### Data Handling
- Audio is transcribed and discarded — never store raw audio unless explicitly configured
- Images of IDs/licences should be processed and discarded — store only extracted text fields
- All data transits to Claude API for processing — ensure this is disclosed in privacy policy
- Business card images can optionally be stored as contact photo (with consent toggle)

### Australian Privacy Principles (APPs)
- APP 3: Only collect information necessary for the business function
- APP 5: Notify individuals about collection (the consent prompt covers this)
- APP 6: Only use data for the purpose it was collected
- APP 11: Secure storage — encrypted at rest in VitalSync, TLS in transit

---

## Testing Strategy

### Unit Tests
- Action registry: each action correctly maps intents to tools
- Entity extraction: mock Claude responses, verify field mapping
- VitalSync mutation building: verify GraphQL output for each action

### Integration Tests
- End-to-end: voice input → transcription → AI processing → VitalSync mutation
- Business card image → contact creation
- Multi-step conversation → quote creation

### Test Fixtures
- Sample business cards (various layouts, industries)
- Sample voice transcripts (accented Australian English, industry jargon)
- Sample receipts and invoices (Australian format with GST)

---

## Files Involved (in a client app)

```
src/
  features/
    assistant/
      AssistantProvider.tsx          # React context — session state, action registry
      AssistantFAB.tsx               # Floating action button (mic, camera, chat)
      AssistantOverlay.tsx           # Full-screen listening/processing overlay
      ConfirmationCard.tsx           # Generic confirmation UI
      ConversationPanel.tsx          # Conversation mode side panel
      EntityChip.tsx                 # Extracted data display chip
      
      actions/                       # Action modules
        index.ts                     # Registry — loads enabled actions from config
        create-contact.ts
        scan-business-card.ts
        create-quote.ts
        add-note.ts
        draft-email.ts
        create-task.ts
        create-follow-up.ts
        scan-receipt.ts
        log-interaction.ts
        voice-memo.ts
        document-site.ts
        create-appointment.ts
        create-invoice.ts
        stock-check.ts
        log-material-usage.ts
        dictate-report.ts
        draft-sms.ts
        update-contact.ts
        generate-summary-email.ts
        scan-barcode.ts
      
      hooks/
        useVoiceInput.ts             # Speech recognition hook
        useCameraInput.ts            # Camera capture hook  
        useAssistantSession.ts       # Session management, conversation history
        useEntityExtraction.ts       # Progressive extraction for conversation mode
        useAssistantContext.ts       # Screen context registration hook
      
      lifecycle/
        LifecyclePromptCard.tsx      # The "Next Step" prompt UI on contact detail
        LifecycleInsightBadge.tsx    # Compact insight badge for list views
        LifecycleDashboard.tsx       # Dashboard: urgent actions, at-risk, stuck pipeline
        lifecycle-types.ts           # LifecycleSnapshot, CohortAnalysis, NextBestAction
        parse-lifecycle-fields.ts    # Parse ai_next_action JSON from contact record
      
      dashboard/
        RoleDashboard.tsx            # Main dashboard component (role-aware)
        MetricCard.tsx               # Individual metric display (number, chart, progress)
        MetricPreviewCard.tsx        # Confirmation UI for voice-added metrics
        ActionItemsSection.tsx       # Lifecycle action items on dashboard
        dashboard-types.ts           # RoleDashboardConfig, MetricConfig
        default-metrics.ts           # Default metric configs per role
      
      utils/
        prompt-builder.ts            # Constructs Claude prompts with tools + screen context
        schema-mapper.ts             # Maps VitalSync schema to action field definitions
        confidence-scorer.ts         # Calculates extraction confidence
        australian-formats.ts        # Phone, ABN, address parsing/validation
        context-ranker.ts            # Ranks actions based on screen context
        implicit-actions.ts          # Resolves implicit actions from context
      
      types.ts                       # AssistantAction, FieldDefinition, etc.
      config.ts                      # Per-client assistant configuration

api/
  routes/
    assistant.ts                     # Express routes for /api/assistant/*
  services/
    ai-processor.ts                  # Claude API integration
    transcription.ts                 # Speech-to-text service (on-device or cloud)
    vitalsync-executor.ts            # Executes confirmed actions against VitalSync
    onebrain.ts                      # 1Brain API service (SOPs, policies, roles, playbooks)
    dashboard-store.ts               # User dashboard metric config persistence

# n8n Workflows (deployed separately)
#   lifecycle-trigger.json           # Webhook-triggered: single contact recalculation
#   lifecycle-sweep.json             # Scheduled daily: batch recalculation for stale/inactive
#   lifecycle-refresh.json           # Manual trigger: immediate single-contact refresh from app
```
