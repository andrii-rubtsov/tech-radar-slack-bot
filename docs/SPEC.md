# Tech Radar Bot — Architecture & Specification

## What Is This

A Cloudflare Worker-based Slack bot that turns any Slack channel into a curated, AI-powered tech news feed.

Two features:
1. **Auto-summarize** — post a URL in the channel, bot fetches the article, generates a summary with your company context, posts it as a follow-up message
2. **Daily digest** — cron job fetches articles from configurable sources, AI picks the Top-N most relevant for your team, posts a formatted digest every morning

**All personalization lives in Slack Canvas tabs** — system prompt, company context, source list. Zero code changes to customize.

---

## Architecture

```
#tech-radar (Slack channel)
│
├── 📋 Canvas: "Prompt"     ← System prompt, company context, output format
├── 📋 Canvas: "Sources"    ← URLs for daily digest
│
│   User posts message with URL
│           │
│           ▼
│   Slack Event API → HTTP POST
│           │
│           ▼
│   CF Worker (/slack/events)
│     1. Verify Slack request signature
│     2. Respond 200 OK immediately
│     3. Async via ctx.waitUntil():
│        a. Extract URL(s) from message text
│        b. Read "Prompt" canvas → system prompt
│        c. CF Browser Rendering /markdown → article content
│        d. Claude API (system=canvas, user=article)
│        e. Slack chat.postMessage → summary in channel
│
│   Cron trigger (scheduled)
│           │
│           ▼
│   CF Worker (scheduled handler)
│     1. Read "Prompt" canvas → system prompt
│     2. Read "Sources" canvas → list of URLs
│     3. CF Browser Rendering /markdown × N sources
│     4. Claude API: "pick top-5, summarize each"
│     5. Slack chat.postMessage → formatted digest
```

---

## Components

### CF Worker

Single worker with two entry points:
- **`fetch` handler** — Slack events + slash commands
- **`scheduled` handler** — daily digest cron

Runtime: Cloudflare Workers, ES modules, TypeScript.

### External Services

| Service | Purpose | Auth |
|---------|---------|------|
| Slack Web API | Post messages, read canvas | Bot OAuth token (`xoxb-...`) |
| Slack Events API | Receive message events | Signing secret |
| CF Browser Rendering | URL → Markdown extraction | CF API token |
| Anthropic Claude API | Summarization + relevance analysis | API key |

---

## Data Flow: Auto-Summarize

### 1. Slack sends event

```json
{
  "type": "event_callback",
  "event": {
    "type": "message",
    "channel": "C0123TECH",
    "user": "U0123USER",
    "text": "https://blog.cloudflare.com/vinext/ interesting approach",
    "ts": "1709042400.000100"
  }
}
```

### 2. Worker processes (async)

```
a. Extract URLs from event.text (Slack wraps URLs in <url|label> format)
b. Skip if: no URLs, message from bot itself, Slack retry
c. Read "Prompt" canvas from channel → system prompt (once, before URL loop)
d. For each URL:
   - POST to CF Browser Rendering /markdown → get article as markdown
   - Truncate to ~15000 chars if needed (cut at paragraph boundary)
   - Call Claude API:
       system = canvas content
       user = "Summarize:\n<article>{markdown}</article>\nUser's note: {text}"
   - Post response to channel via chat.postMessage
```

### 3. Bot posts

```json
{
  "channel": "C0123TECH",
  "text": "🔍 *Article Title*\n\n*Summary:* ...\n\n*Relevance:* ...\n\n*Action items:* ...",
  "unfurl_links": false,
  "unfurl_media": false
}
```

---

## Data Flow: Daily Digest

### 1. Cron trigger

```toml
[triggers]
crons = ["0 7 * * 1-5"]  # Weekdays 07:00 UTC
```

### 2. Read canvases

- "Sources" canvas → parse URLs (lines starting with `- http`)
- "Prompt" canvas → system prompt

### 3. Fetch all sources

For each URL from Sources canvas:
- CF Browser Rendering `/markdown`
- Skip failures, truncate each to ~5000 chars
- Collect all content

### 4. Single Claude call

```
System: {canvas prompt}

User:
Today is {date}. Below are articles from tech sources.
Select the Top 5 most relevant for our team and summarize each
per the output format in your instructions.

<source url="https://...">
{markdown}
</source>
...
```

### 5. Post digest

```
📡 *Tech Radar — 28 Feb 2026*

1. ...
2. ...
```

---

## Project Structure

```
tech-radar-bot/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry: fetch + scheduled handlers
│   ├── slack/
│   │   ├── verify.ts         # Request signature verification
│   │   ├── events.ts         # Handle message events
│   │   ├── commands.ts       # Handle /news slash command
│   │   ├── canvas.ts         # Read canvas content by title
│   │   └── post.ts           # Post message to channel
│   ├── services/
│   │   ├── browser.ts        # CF Browser Rendering wrapper
│   │   ├── claude.ts         # Claude API wrapper
│   │   └── sources.ts        # Parse sources canvas, fetch content
│   ├── digest/
│   │   └── daily.ts          # Daily digest cron handler
│   └── utils/
│       ├── urls.ts           # URL extraction from Slack messages
│       └── truncate.ts       # Smart markdown truncation
├── test/
│   ├── urls.test.ts
│   ├── verify.test.ts
│   └── truncate.test.ts
└── docs/
    ├── SPEC.md               # This file
    ├── IMPLEMENTATION.md      # Code patterns and API contracts
    ├── SETUP_SLACK.md         # Slack app setup guide
    ├── SETUP_CLOUDFLARE.md    # CF setup guide
    ├── SETUP_CLAUDE.md        # Anthropic API setup
    ├── CANVAS_EXAMPLES.md     # Canvas templates
    └── DEPLOY.md              # Deployment instructions
```

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| Browser Rendering fails (timeout, 403) | Skip URL, optionally post "⚠️ Could not fetch {url}" |
| Claude API error (rate limit, 500) | Retry once after 2s, then skip |
| Canvas not found | Use hardcoded fallback prompt, log warning |
| Slack event retry | Check `X-Slack-Retry-Num` header, respond 200 immediately |
| Non-article URL (image, PDF, video) | Detect empty markdown, skip |
| Multiple URLs in one message | Process each separately, one summary per URL |
| Message from bot itself | Skip (prevent infinite loops) |

---

## Cost Estimate

### Per auto-summarize:
- Browser Rendering: free (within 10 min/day limit)
- Claude Haiku: ~2K input + ~500 output tokens → ~$0.004
- Slack API: free

### Per daily digest:
- Browser Rendering: ~10 sources × 5 sec = ~50 sec (free)
- Claude Sonnet: ~30K input + ~2K output tokens → ~$0.12

### Monthly (20 articles/day + daily digest, 22 workdays):
- **~$4-5/month total**

---

## Future Enhancements (out of scope for v1)

- Reaction-based trigger (📋 emoji → summarize)
- KV cache for already-summarized URLs (dedup)
- Weekly digest rollup
- Multi-channel support with per-channel canvases
- Rate limiting (max N summaries per hour)
- Analytics: track 👍 reactions on summaries
