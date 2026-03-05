# n8n Chat Widget Integration (Buddzee)

For apps that need a Buddzee chat interface via the n8n widget, integrate using this pattern. The widget connects to an n8n webhook workflow that drives Buddzee. See `docs/features/buddzee-ai-assistant.md` for the full Buddzee brand identity, voice guidelines, and system prompt template.

## Loading the Widget

Load as an ES module via inline `<script>` tag (NOT npm import — keeps the bundle clean):

```typescript
// In a ChatWidget component
useEffect(() => {
  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Buddzee brand overrides */
    :root {
      --chat--color-primary: #5284ff;
      --chat--color-secondary: #f0f4ff;
      --chat--border-radius: 12px;
      --chat--window--width: 400px;
    }
    @media (max-width: 600px) {
      :root { --chat--window--width: calc(100vw - 32px); }
    }
  `;
  document.head.appendChild(styleEl);

  // Load ES module
  const scriptEl = document.createElement('script');
  scriptEl.type = 'module';
  scriptEl.textContent = `
    import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js';
    createChat({
      webhookUrl: '${webhookUrl}',
      mode: 'window',
      initialMessages: ["Hey! I'm Buddzee, your business assistant. What can I help you with today?"],
    });
  `;
  document.body.appendChild(scriptEl);

  return () => { /* cleanup: remove style + script + widget elements */ };
}, []);
```

## Custom Reset Button

n8n chat v1.7.0 lacks a built-in reset/clear conversation button. Inject one via MutationObserver:

```typescript
const observer = new MutationObserver(() => {
  const header = document.querySelector('.chat-window-header');
  if (header && !header.querySelector('.chat-reset-btn')) {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'chat-reset-btn';
    resetBtn.textContent = 'New Chat';
    resetBtn.onclick = () => {
      // Clear n8n chat localStorage keys
      Object.keys(localStorage)
        .filter(k => k.startsWith('n8n-chat') || k.startsWith('chat-session'))
        .forEach(k => localStorage.removeItem(k));
      // Remove widget and re-initialize
    };
    header.appendChild(resetBtn);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

## Building the Backend Workflow
This doc covers the **frontend widget** only. The n8n workflow that powers the chat must be built separately using the n8n-builder project. See `docs/n8n-workflow-building.md` for the full workflow building process, and `docs/features/ai-chat-agent.md` for the Express SSE proxy that connects the widget to n8n.

## Key Notes
- Store webhook URL in environment variables (`VITE_N8N_CHAT_WEBHOOK_URL`)
- n8n chat stores conversation state in localStorage — clear keys starting with `n8n-chat` / `chat-session` to reset
- Mobile: Set `--chat--window--width: calc(100vw - 32px)` for responsive width
- The widget creates a floating toggle button — nudge positioning with CSS on mobile
