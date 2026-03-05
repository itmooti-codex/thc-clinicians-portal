# Reusable Feature Patterns

This directory contains documented feature patterns extracted from production apps. Each file is a self-contained guide that Claude can read to implement the same feature in a new app.

## Available Features

### Brand & Identity
| Feature | Source App | File |
|---------|-----------|------|
| **Buddzee AI Assistant (Brand & Identity)** | **all apps** | **`buddzee-ai-assistant.md`** |

### Core CRM Infrastructure
| Feature | Source App | File |
|---------|-----------|------|
| Feature Flag System | phyx-nurse-admin | `feature-flags.md` |
| Collections System (Generic List Views) | phyx-nurse-admin | `collections-system.md` |
| Record Detail Views | phyx-nurse-admin | `record-detail-views.md` |
| Advanced Search & Filters | phyx-nurse-admin | `search-filters.md` |
| Bulk Actions Framework | phyx-nurse-admin | `bulk-actions.md` |
| Tag Management | phyx-nurse-admin | `tag-management.md` |
| Settings System (Encrypted) | phyx-nurse-admin | `settings-system.md` |

### Productivity & Pipeline
| Feature | Source App | File |
|---------|-----------|------|
| Tasks System | phyx-nurse-admin | `tasks-system.md` |
| Deal Pipeline / Kanban | phyx-nurse-admin | `deal-pipeline.md` |

### Communication
| Feature | Source App | File |
|---------|-----------|------|
| Call Logging | phyx-nurse-admin | `call-logging.md` |
| Conversation Thread Viewer | phyx-nurse-admin | `conversation-threads.md` |
| Ontraport Messaging (Email & SMS) | phyx-nurse-admin | `ontraport-messaging.md` |

### Buddzee AI Features
| Feature | Source App | File |
|---------|-----------|------|
| Unified Buddzee AI System (50+ tools) | phyx-nurse-admin | `unified-buddzee-ai.md` |
| Buddzee Chat (SSE + n8n) | phyx-nurse-admin | `ai-chat-agent.md` |
| Buddzee Dynamic Metrics | phyx-nurse-admin | `dynamic-metrics.md` |
| Buddzee Voice & Vision Assistant | phyx-nurse-admin | `voice-vision-assistant.md` |
| Buddzee Voice Conversation (Deepgram) | phyx-nurse-admin | `buddzee-voice-conversation.md` |
| Buddzee Frustration Detection | phyx-nurse-admin | `frustration-detection.md` |
| Buddzee Dashboard Builder | bb-dashboard | `buddzee-dashboard-builder.md` |
| Buddzee Automation Engine (VitalSync + n8n) | phyx-nurse-admin | `automation-engine.md` |
| Buddzee Feature Request Collection | phyx-nurse-admin | `feature-request-collection.md` |

### Mobile Features
| Feature | Source App | File |
|---------|-----------|------|
| OneSignal Push Notifications | phyx-nurse-admin | `onesignal-notifications.md` |
| Biometric Lock / Lock Screen | phyx-nurse-admin | `biometric-lock.md` |

### Analytics & Integrations
| Feature | Source App | File |
|---------|-----------|------|
| Google Analytics Integration | phyx-nurse-admin | `google-analytics.md` |
| n8n Workflow Browser | phyx-nurse-admin | `n8n-workflow-browser.md` |

### Data Operations
| Feature | Source App | File |
|---------|-----------|------|
| Contact History Restore | awesomate-admin | `contact-history-restore.md` |

### Content & Social
| Feature | Source App | File |
|---------|-----------|------|
| NanoBanana Image Generation | standalone CLI | `nanobana-image-generation.md` |
| Social Feed / MemberFeed | memberfeed-eventmx | `social-feed.md` |
| LMS Notifications & Courses | AWC-LMS | `lms-notifications-courses.md` |

## Contributing a Feature

When you build a significant new feature in a child app, document it using the template below and add it here. Then run `./scripts/sync-child.sh --all` to push it to all projects.

## Feature Doc Template

Every feature doc should follow this structure:

```markdown
# Feature Name

## Overview
One-paragraph description of what this feature does and why it's useful.

## Architecture
- How many files are involved
- High-level data flow (e.g., Frontend → Backend → External Service → Response)
- Key design decisions and why

## Files to Copy
List every file needed, grouped by layer:
- **Backend:** `server/src/routes/feature.ts`, ...
- **Frontend hooks:** `src/hooks/useFeature.ts`, ...
- **Frontend components:** `src/components/Feature.tsx`, ...
- **Stores:** `src/stores/useFeatureStore.ts`, ...
- **Types:** additions to `src/types/index.ts`

## Dependencies
npm packages to install (with versions if critical).

## Environment Variables
Any new env vars needed.

## Database Tables
SQL CREATE statements if applicable.

## Implementation Steps
Numbered steps to add this feature to a new app.

## Gotchas & Lessons Learned
Things that went wrong during development and how to avoid them.

## Example Usage
Key code snippets showing how the feature is used.
```
