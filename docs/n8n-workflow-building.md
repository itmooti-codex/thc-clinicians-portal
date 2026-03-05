# Building n8n Workflows for VitalStats Apps

This guide bridges the gap between **calling n8n from your app** (covered by this project's existing docs) and **building the n8n workflows themselves** (covered by the n8n-builder project).

## When to Build vs When to Call

| Scenario | What to Do |
|----------|-----------|
| App needs to trigger a webhook | **Call** — use `fetch`/Axios to POST to an existing n8n webhook URL |
| App needs an AI chat agent backend | **Build** — create the n8n workflow that handles chat, then integrate the widget |
| App needs email automation | **Build** — create the n8n workflow for email logic |
| App needs scheduled data sync | **Build** — create the n8n workflow with schedule trigger |
| App needs to process incoming webhooks from third parties | **Build** — create the n8n workflow to receive and process |
| App already has a working n8n workflow URL | **Call** — just integrate the endpoint |

**Rule of thumb:** If the n8n workflow doesn't exist yet, build it first using n8n-builder, then integrate the endpoint into the app.

## The n8n-builder Project

**Location:** `/Users/andrewwadsworth/Projects/n8n-builder`

This is the dedicated project for building, testing, and managing n8n workflows. It provides:

- **Comprehensive CLAUDE.md** with workflow building protocols, safety rules, and quality standards
- **Reference documentation** in `docs/` covering expressions, code patterns, embedded chat config, architecture patterns, MCP tool usage, and more
- **Workflow templates** and proven patterns from 2,709+ n8n templates
- **Self-testing architecture** — every new workflow includes error handling, test harness, and self-correction

### To import n8n-builder context into your current session

Add this to pull in the full n8n-builder instructions when you need to build workflows:

```
@/Users/andrewwadsworth/Projects/n8n-builder/CLAUDE.md
```

## Available n8n Tools

### n8n MCP Server

The n8n MCP server connects Claude directly to the n8n instance for workflow management. It provides:

- **Node discovery** — Search 1,084 nodes (537 core + 547 community) with documentation
- **Workflow management** — Create, read, update, execute, and validate workflows
- **Template library** — Search 2,709 workflow templates for patterns
- **Validation** — Check workflows against multiple profiles (use `ai-friendly` by default)

**n8n instance:** `https://automations.vitalstats.app`

**Setup:** If the MCP server isn't available in your session, run:
```bash
claude mcp add-from-claude-desktop
```
Select `n8n-mcp` and choose `user` scope to make it available across all projects.

### n8n Skills (7 skills, globally installed)

These are installed at `~/.claude/skills/` and activate automatically based on context:

| Skill | Activates When |
|-------|---------------|
| **n8n Expression Syntax** | Writing `{{ }}` expressions, troubleshooting expression errors |
| **n8n MCP Tools Expert** | Using MCP tools for node search, validation, workflow management |
| **n8n Workflow Patterns** | Designing workflow architecture (5 proven patterns) |
| **n8n Validation Expert** | Encountering validation errors, debugging |
| **n8n Node Configuration** | Configuring node properties, operation-specific dependencies |
| **n8n Code JavaScript** | Writing JavaScript in Code nodes |
| **n8n Code Python** | Considering Python Code nodes (JS recommended 95% of time) |

No manual invocation needed — they activate automatically when relevant.

## Common Workflow Types for VitalStats Apps

### AI Chat Agent Workflow

The most common integration. The app sends user messages to n8n, which orchestrates the AI response.

**App side** (already documented in `docs/features/ai-chat-agent.md`):
- Express backend SSE proxy required — streams n8n responses to frontend in real-time
- Frontend renders streaming responses with structured content blocks
- The chat widget alone (`docs/n8n-chat-widget.md`) is simpler but doesn't support structured content or SSE streaming

**n8n side** (build with n8n-builder):
- Chat Trigger node with `mode: "webhook"` and `responseMode: "lastNode"`
- AI Agent node with system prompt, tools, and memory
- Connected to OpenRouter/Claude for LLM responses
- Session-based memory for conversation continuity

**Critical n8n config for embedded chat:**
- `mode: "webhook"` — required for external embedding
- `responseMode: "lastNode"` — required or responses never reach the chat
- `allowedOrigins` — CORS with no trailing slashes, no spaces after commas

### Webhook Processor Workflow

For receiving webhooks from third-party services (Ontraport, Stripe, etc.).

**App side:** Configure the third party to POST to the n8n webhook URL.

**n8n side:**
- Webhook Trigger with authentication
- Validate input data
- Process and transform
- Respond with appropriate HTTP status codes
- Error handling with notifications

### Scheduled Automation Workflow

For recurring tasks (daily reports, data sync, cleanup).

**App side:** No app integration needed — n8n runs autonomously on schedule.

**n8n side:**
- Schedule Trigger (cron)
- Execution lock to prevent duplicates
- Per-item processing with error handling
- Summary reporting via Slack/email

### Email Automation Workflow

For transactional or automated emails (magic links, notifications, digests).

**App side:** Backend triggers n8n webhook with email data.

**n8n side:**
- Webhook Trigger receiving email request
- Template rendering (Code node)
- Send via Gmail/SMTP node
- Error handling with retry logic

## Workflow Building Process

When you need to build an n8n workflow for a child app, follow this process:

### 1. Design in the app project

Define what the workflow needs to do from the app's perspective:
- What data does the app send to the workflow?
- What response does the app expect?
- What trigger type (webhook, schedule, manual)?
- What external services does the workflow need?

### 2. Switch to n8n-builder context

Import the n8n-builder CLAUDE.md to get full workflow building capabilities:
```
@/Users/andrewwadsworth/Projects/n8n-builder/CLAUDE.md
```

Then follow the 5-phase protocol: Discovery -> Design -> Confirmation -> Implementation -> Validation.

### 3. Build the workflow

Use the n8n MCP tools to create and deploy the workflow directly to `https://automations.vitalstats.app`.

New workflows require 4 components:
1. **Main workflow** — core business logic
2. **Error handler** — catches and logs failures
3. **Test harness** — automated test cases
4. **Self-correction** — AI-powered error analysis and auto-fix

### 4. Integrate in the app

Once deployed, integrate the workflow endpoint:

**React/Mobile apps:**
```typescript
// .env
VITE_N8N_WEBHOOK_URL=https://automations.vitalstats.app/webhook/abc123

// Usage
const response = await fetch(import.meta.env.VITE_N8N_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

**Ontraport apps:**
```javascript
// In config.js
window.AppConfig = {
  n8nWebhookUrl: 'https://automations.vitalstats.app/webhook/abc123',
};

// Usage
fetch(window.AppConfig.n8nWebhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

### 5. Save workflow files

Store the workflow JSON files in the n8n-builder project:
```
/Users/andrewwadsworth/Projects/n8n-builder/workflows/[workflow-name]/
├── README.md
├── SETUP-GUIDE.md
├── workflow.json
├── workflow-error-handler.json
├── workflow-tests.json
└── workflow-autocorrect.json
```

## Key Gotchas

These are the most common issues when building n8n workflows for VitalStats apps:

1. **Webhook data is at `$json.body`** — not `$json` directly
2. **Code nodes must return `[{ json: data }]`** — array of objects with json wrapper
3. **Embedded chat needs `mode: "webhook"` and `responseMode: "lastNode"`** — without these, chat shows loading forever
4. **CORS domains: no trailing slashes, no spaces after commas**
5. **Never edit production workflows directly** — always copy first, test, then deploy
6. **Use `ai-friendly` validation profile** — reduces false positives
7. **VitalStats custom nodes** (`CUSTOM.vitalstats`, `CUSTOM.vitalstatsTool`) show as "unknown" in validation — these are false positives

## Reference

| Resource | Location |
|----------|----------|
| n8n-builder project | `/Users/andrewwadsworth/Projects/n8n-builder` |
| n8n-builder CLAUDE.md | `/Users/andrewwadsworth/Projects/n8n-builder/CLAUDE.md` |
| n8n reference guide | `/Users/andrewwadsworth/Projects/n8n-builder/docs/N8N-REFERENCE.md` |
| Workflow standards | `/Users/andrewwadsworth/Projects/n8n-builder/docs/WORKFLOW_STANDARDS.md` |
| n8n instance | `https://automations.vitalstats.app` |
| n8n skills (global) | `~/.claude/skills/n8n-*` |
| App-side chat widget | `docs/n8n-chat-widget.md` (this project) |
| App-side AI chat agent | `docs/features/ai-chat-agent.md` (this project) |
