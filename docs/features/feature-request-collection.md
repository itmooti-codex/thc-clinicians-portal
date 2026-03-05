# Buddzee Feature Request & Bug Report Collection

> **Buddzee-powered scope collection system.** When users encounter limitations or bugs, Buddzee interviews them like an expert BA, asks for a Loom video, then submits a structured Markdown document via n8n → email + GitHub storage. See `buddzee-ai-assistant.md` for Buddzee's brand identity and voice guidelines.

## Architecture

```
User asks Buddzee to do something it can't do (or reports a bug)
  → Buddzee: "That's not something I can do yet. Want me to submit a feature request?" [Yes] [No]
  → User: "Yes"
  → Buddzee enters scope collection mode (expert BA interviewer)
  → Buddzee asks for Loom video with link + instructions
  → Buddzee calls submit_feature_request tool
  → Server: DB insert + n8n webhook (with full transcript)
  → n8n: Claude analyzes against feature pipeline → Markdown → GitHub → email
```

## Files (3 new, 2 modified)

### New Files
| File | Purpose |
|------|---------|
| `server/src/lib/tools/feature-request-tool.ts` | `submit_feature_request` tool — DB insert + n8n webhook |
| n8n workflow (Feature Request Processor) | Claude analysis → Markdown → GitHub → email |
| System prompt section (in n8n AI agent) | Detection rules, interview questions, Loom script |

### Modified Files
| File | Change |
|------|--------|
| `server/src/lib/tool-registry.ts` | Register `...featureRequestTools` in `serverTools` |
| `server/src/seed.ts` | Add `feature_requests` table |

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS feature_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  app_name VARCHAR(128) NOT NULL,
  request_type ENUM('feature', 'bug', 'enhancement') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  user_verbatim TEXT DEFAULT NULL,
  user_impact TEXT DEFAULT NULL,
  frequency VARCHAR(64) DEFAULT NULL,
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  acceptance_criteria TEXT DEFAULT NULL,
  loom_url VARCHAR(512) DEFAULT NULL,
  related_screens VARCHAR(512) DEFAULT NULL,
  interview_transcript JSON DEFAULT NULL,
  n8n_webhook_sent BOOLEAN DEFAULT FALSE,
  github_url VARCHAR(512) DEFAULT NULL,
  status ENUM('new', 'reviewing', 'planned', 'in_progress', 'completed', 'declined') DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_type (request_type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Environment Variables

```env
# Add to server/.env
N8N_FEATURE_REQUEST_WEBHOOK_URL=https://automations.vitalstats.app/webhook/feature-request
APP_NAME=your-app-name
```

## Tool Implementation

### `server/src/lib/tools/feature-request-tool.ts`

```typescript
import type { ToolDefinition, ToolContext } from '../tool-registry';
import pool from '../../db';

export const featureRequestTools: ToolDefinition[] = [
  {
    name: 'submit_feature_request',
    isClientSide: false,
    openaiTool: {
      type: 'function',
      function: {
        name: 'submit_feature_request',
        description:
          'Submit a feature request or bug report on behalf of the user. ' +
          'Call this AFTER you have interviewed the user and collected all relevant details. ' +
          'Include the full scope of what they need, their business impact, acceptance criteria, ' +
          'and the Loom video URL if they provided one.',
        parameters: {
          type: 'object',
          properties: {
            request_type: {
              type: 'string',
              enum: ['feature', 'bug', 'enhancement'],
              description: 'Type of request',
            },
            title: {
              type: 'string',
              description: 'Short title (3-10 words) summarizing the request',
            },
            description: {
              type: 'string',
              description:
                'Full description of what the user needs, written as if you are an expert BA writing a requirements document. Be thorough and structured.',
            },
            user_verbatim: {
              type: 'string',
              description: 'Key direct quotes from the user in their own words',
            },
            user_impact: {
              type: 'string',
              description:
                'How this affects their business or workflow. Include time savings, pain points, and workarounds.',
            },
            frequency: {
              type: 'string',
              description: 'How often they need this (daily, weekly, occasionally, etc.)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description:
                'Inferred priority based on conversation. critical = blocking their work, high = significant daily pain, medium = would be nice, low = minor improvement.',
            },
            acceptance_criteria: {
              type: 'string',
              description:
                'What "done" looks like from the user perspective. Write as bullet points.',
            },
            loom_url: {
              type: 'string',
              description: 'Loom video URL if the user provided one. Empty string if not.',
            },
            related_screens: {
              type: 'string',
              description: 'Which screens or sections of the app this relates to',
            },
          },
          required: ['request_type', 'title', 'description', 'priority', 'acceptance_criteria'],
        },
      },
    },
    execute: async (args: Record<string, unknown>, context?: ToolContext) => {
      const userId = context?.userId;
      const userName = context?.userName || 'Unknown User';
      const sessionKey = (args._sessionKey as string) || '';
      const appName = process.env.APP_NAME || 'unknown-app';

      if (!userId) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        // Get session ID from session key
        const [sessions] = await pool.execute(
          'SELECT id FROM ai_chat_sessions WHERE session_key = ? LIMIT 1',
          [sessionKey]
        );
        const sessionId = (sessions as any[])[0]?.id;
        if (!sessionId) {
          return { success: false, error: 'Session not found' };
        }

        // Fetch conversation transcript for context
        const [messages] = await pool.execute(
          'SELECT role, content, created_at FROM ai_chat_messages WHERE session_id = ? ORDER BY created_at ASC',
          [sessionId]
        );

        // Insert feature request
        const [result] = await pool.execute(
          `INSERT INTO feature_requests
           (session_id, session_key, user_id, user_name, app_name, request_type, title, description,
            user_verbatim, user_impact, frequency, priority, acceptance_criteria, loom_url,
            related_screens, interview_transcript)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            sessionKey,
            userId,
            userName,
            appName,
            args.request_type,
            args.title,
            args.description,
            args.user_verbatim || null,
            args.user_impact || null,
            args.frequency || null,
            args.priority,
            args.acceptance_criteria,
            args.loom_url || null,
            args.related_screens || null,
            JSON.stringify(messages),
          ]
        );

        const requestId = (result as any).insertId;

        // Fire n8n webhook (non-blocking)
        const webhookUrl = process.env.N8N_FEATURE_REQUEST_WEBHOOK_URL;
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId,
              appName,
              requestType: args.request_type,
              title: args.title,
              description: args.description,
              userVerbatim: args.user_verbatim || '',
              userImpact: args.user_impact || '',
              frequency: args.frequency || '',
              priority: args.priority,
              acceptanceCriteria: args.acceptance_criteria,
              loomUrl: args.loom_url || '',
              relatedScreens: args.related_screens || '',
              userId,
              userName,
              sessionKey,
              transcript: messages,
              createdAt: new Date().toISOString(),
            }),
          })
            .then(async () => {
              await pool.execute(
                'UPDATE feature_requests SET n8n_webhook_sent = TRUE WHERE id = ?',
                [requestId]
              );
            })
            .catch((err: Error) => {
              console.error('[feature-request] n8n webhook failed:', err.message);
            });
        }

        const typeLabel =
          args.request_type === 'bug'
            ? 'bug report'
            : args.request_type === 'enhancement'
              ? 'enhancement request'
              : 'feature request';

        return {
          success: true,
          requestId,
          message: `Your ${typeLabel} has been submitted successfully. Our development team will review it shortly.`,
        };
      } catch (err: any) {
        console.error('[feature-request] Error:', err);
        return { success: false, error: 'Failed to submit request. Please try again.' };
      }
    },
  },
];
```

### Register in `server/src/lib/tool-registry.ts`

```typescript
import { featureRequestTools } from './tools/feature-request-tool';

const serverTools: ToolDefinition[] = [
  // ... existing tools
  ...featureRequestTools,
];
```

### Add to `server/src/seed.ts`

Add the CREATE TABLE statement from the Database Schema section above.

### Tool Status Label in AI Store

In the frontend AI store, add:
```typescript
const TOOL_STATUS_LABELS: Record<string, string> = {
  // ... existing labels
  submit_feature_request: 'Submitting your request...',
};
```

## System Prompt Section

Add this to the n8n AI agent's system prompt for EVERY app:

```
## Feature Request & Bug Report Collection

You have a tool called submit_feature_request. Here is when and how to use it:

### When to Trigger

1. **Feature Request**: When the user asks you to do something you cannot do, or asks about functionality that doesn't exist in this app.
2. **Bug Report**: When the user reports something that isn't working correctly, shows unexpected behavior, or describes an error.
3. **Enhancement**: When the user suggests an improvement to existing functionality.

### Detection Flow

When you detect any of the above:

1. Acknowledge what they're asking for honestly. Do NOT pretend you can do it.
2. Say: "That's not something I can do yet, but it sounds like a great idea. Would you like me to submit a feature request to our development team? I'll make sure they understand exactly what you need."
3. For bugs: "I'm sorry you're experiencing that issue. Would you like me to submit a bug report so our team can fix it? I'll collect the details to make sure they can reproduce and resolve it quickly."
4. Show Yes/No action buttons.

### If the User Says Yes — Scope Collection Mode

You become an expert business analyst. Your goal is to collect enough detail that a developer could build this feature without any follow-up questions. Ask these questions ONE AT A TIME (not all at once):

1. "Can you walk me through exactly what you're trying to achieve? What would the ideal outcome look like?"
2. "How often do you need to do this? Is it something you'd use daily, weekly, or occasionally?"
3. "What are you currently doing as a workaround? How much time does that take?"
4. "Is there any specific data or information that needs to be involved?"
5. "How would this impact your business if we built it? What would it save you?"
6. "Is there anything else I should know about how this should work?"

For BUG REPORTS, ask instead:
1. "What exactly happened? Walk me through step by step."
2. "What did you expect to happen instead?"
3. "Does this happen every time, or only sometimes?"
4. "When did you first notice this?"
5. "Were you doing anything specific when it happened?"

Adapt based on the conversation — skip questions the user has already answered. Be conversational, not robotic.

### Loom Video Request (IMPORTANT — Always Ask)

After collecting the verbal details, ALWAYS ask for a Loom video. Be encouraging and explain why:

"One last thing that would really help our team — could you record a quick Loom video showing what you need? Even 60 seconds makes a huge difference because our developers can see exactly what you're describing.

Here's how:
1. Open Loom: https://www.loom.com/screen-recordings
2. Click 'New Recording' and choose 'Screen & Camera' or just 'Screen'
3. Show the part of the app you're talking about while explaining what you need
4. When done, copy the share link and paste it here

A screen recording helps us build exactly what you want — it eliminates any miscommunication and means we can get it right the first time."

If they provide a Loom URL, include it in the tool call. If they decline or want to skip, that's fine — submit without it.

### Submission

Once you have enough detail, summarize what you've collected in a clear list and ask: "Does this capture everything? Anything you'd like to add or change before I submit?"

When confirmed, call the submit_feature_request tool with ALL collected information:
- Write the description as an expert BA — thorough, structured, and clear
- Include user_verbatim with their key quotes in their own words
- Write acceptance_criteria as actionable bullet points
- Set priority based on urgency and business impact

After submission: "I've submitted your [feature request/bug report] to our development team. They'll review it and you may hear from them if they need any clarification. Thank you for helping us make the app better!"
```

## n8n Workflow: Feature Request Processor

### Webhook

`POST /webhook/feature-request`

### Workflow Nodes

1. **Webhook Trigger** — Receives POST payload with all request data + transcript
2. **Claude Analysis** (HTTP Request → OpenRouter):
   - Prompt includes the feature pipeline overview + existing features list
   - Analyzes: overlap with planned features, implementation effort, suggested approach
3. **Build Markdown** (Code node):
   - Generates the structured Markdown document (format below)
4. **Store in GitHub** (GitHub node):
   - Repo: `itmooti/feature-requests`
   - Path: `requests/{appName}/{date}-{slug}.md`
5. **Send Email** (Gmail node):
   - To: andrew@itmooti.com (or configurable)
   - Subject: `[{appName}] {type}: {title} — from {userName}`
   - Body: The Markdown rendered as HTML

### Generated Markdown Format

```markdown
# {Type}: {Title}

**App:** {appName}
**Submitted by:** {userName} (User ID: {userId})
**Date:** {date}
**Priority:** {priority}
**Type:** {requestType}
**Chat Session:** {sessionKey}

---

## What the User Wants

{AI-written BA-quality description}

## User's Own Words

> "{userVerbatim}"

## Business Impact

- **Frequency:** {frequency}
- **Current workaround:** {extracted from description}
- **Impact:** {userImpact}

## Acceptance Criteria

{acceptanceCriteria as checkbox list}

## Related Screens

{relatedScreens}

## Loom Video

{loomUrl ? "[Watch the recording]({loomUrl})" : "No video provided"}

---

## Implementation Analysis (AI-Generated)

### Overlap with Existing Features
{Claude analysis of which existing features relate}

### Suggested Approach
{Claude's recommended implementation approach}

### Estimated Effort
{Claude's effort estimate}

### Pipeline Phase
{Which phase of the master rollout plan this aligns with}

---

## Full Conversation Transcript

{Formatted transcript with timestamps}
```

## Adding to a New App (Checklist)

1. Copy `server/src/lib/tools/feature-request-tool.ts` to the child app
2. Add `feature_requests` table to `seed.ts` (copy CREATE TABLE from above)
3. Register tool in `tool-registry.ts` — `import { featureRequestTools } from './tools/feature-request-tool'` then spread `...featureRequestTools` into `serverTools`
4. Ensure `_sessionKey` is injected into tool args in `routes/ai-chat.ts` `executeTool` (should already exist from frustration detection)
5. Add `APP_NAME` to `server/.env` if not already present
6. Add the **Feature Request & Bug Report Collection** section to the n8n AI agent's system prompt
7. Add tool status label: `submit_feature_request` → `'Submitting your request...'` in the AI store
8. Set `N8N_FEATURE_REQUEST_WEBHOOK_URL` in `server/.env` and `docker-compose.yml`
9. Create `feature_requests` table on production DB (credentials from `~/.claude/infrastructure.env`):
   ```bash
   source ~/.claude/infrastructure.env
   ssh ${SERVER_USER}@${SERVER_HOST} "docker exec $DB_CONTAINER mysql -u $DB_APP_USER -p'$DB_APP_PASSWORD' DB_NAME -e 'CREATE TABLE IF NOT EXISTS feature_requests (...)'"
   ```
10. Create or reuse the n8n Feature Request Processor workflow

## Dependencies

No additional dependencies — uses existing `mysql2`, `node:fetch`, and n8n infrastructure.

## Gotchas

- **Tool context**: The `_sessionKey` and `userId`/`userName` must be injected into the tool execution context by the AI chat route handler. The frustration tool already established this pattern — ensure the same injection applies to this tool.
- **Deduplication**: Unlike frustration detection (one per session), feature requests can have multiple per session (a user might report a bug AND request a feature in the same conversation). No dedup needed.
- **Transcript size**: Large conversations may produce large transcript JSON. The `interview_transcript` column is JSON type which handles this, but the n8n webhook payload should be reasonable (truncate very long transcripts if needed).
- **GitHub repo**: The `itmooti/feature-requests` repo must exist and the n8n GitHub credential must have write access.
- **Production table**: Remember to create the table on production — `seed.ts` only runs locally.
