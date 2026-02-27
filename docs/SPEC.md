# Tech Radar Bot — Architecture & Specification

## What Is This

A Cloudflare Worker-based Slack bot that turns any Slack channel into a curated, AI-powered tech news feed.

Two features:
1. **Auto-summarize** — post a URL in the channel, bot fetches the article, generates a summary with your team's context, posts it as a follow-up message
2. **Daily digest** — cron job fetches articles from configurable sources, AI picks the Top-N most relevant for your team, posts a formatted digest every morning

**All personalization lives in a single `TechRadar` Slack Canvas** — context, tech stack, relevance criteria, digest sources — in TOML format. Zero code changes to customize.

---

## Architecture

```
#tech-radar (Slack channel)
│
├── 📋 Canvas: "TechRadar"  ← TOML config: context, stack, relevance criteria, digest sources
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
│        b. Skip if bot message, retry, or no URLs
│        c. Read "TechRadar" canvas → parse TOML config
│        d. For each URL:
│           - CF Browser Rendering /markdown → article content
│           - Claude API (system=buildSystemPrompt(config), user=article)
│           - Slack chat.postMessage → summary in channel
│
│   member_joined_channel event (bot invited)
│           │
│           ▼
│   CF Worker (/slack/events)
│     Post welcome message + setup instructions + minimal TOML template
│
│   Cron trigger (scheduled)
│           │
│           ▼
│   CF Worker (scheduled handler)
│     For each channel where bot is a member:
│     1. Read "TechRadar" canvas → parse TOML → extract [[digest.source]] URLs
│     2. CF Browser Rendering /markdown × N sources
│     3. Claude API: "pick top-N, summarize each" (N from config.digest.top_n)
│     4. Slack chat.postMessage → formatted digest
│
│   Slash commands (/slack/commands)
│           │
│           ▼
│   CF Worker
│     /tech-radar-setup      → ephemeral: canvas instructions + minimal TOML template
│     /tech-radar-summarize  → ephemeral ack → in_channel summary
│     /tech-radar-digest     → ephemeral ack → in_channel digest
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
c. Read "TechRadar" canvas from channel → parse TOML config (once, before URL loop)
d. If config.features.auto_summary === false → return silently
e. For each URL:
   - POST to CF Browser Rendering /markdown → get article as markdown
   - Truncate to ~15000 chars if needed (cut at paragraph boundary)
   - Call Claude API:
       system = buildSystemPrompt(config)
       user = "Summarize:\n<article>{markdown}</article>\nUser's note: {text}"
   - Post response to channel via chat.postMessage
```

### 3. Bot posts

Example rendered message in Slack:

```
Auto-summary for *Spring Boot 3.4: Virtual Threads GA* posted by @alex.voronov

📝 *Summary*
Spring Boot 3.4 promotes Virtual Threads (Project Loom) to GA for both servlet and reactive stacks.
The upgrade from 3.3 requires a single property change with no code modifications.
Early benchmarks show 3× throughput improvement under high-concurrency workloads with identical heap.

🔧 *Tech Stack Relevance*  ⭐⭐⭐⭐⭐ 5/5
We run Spring Boot 3.3 across 12 services on EKS — this is a zero-risk, high-upside upgrade.
Virtual Threads could let us reduce pod replica counts while improving tail latency simultaneously.

🎯 *OKR Relevance*  ⭐⭐⭐⭐✩ 4/5
Directly targets "p99 latency below 200ms" and "cut AWS cost by 15%" — fewer pods means
lower EKS node cost, and more efficient threading reduces queuing under bursty traffic.

🚀 *Adoption Path*
1. Upgrade `spring-boot-starter-parent` to 3.4 in `notification-service` (lowest risk service)
2. Add `spring.threads.virtual.enabled=true` to application.yml
3. Load-test vs 3.3 baseline under 2× traffic; measure p99 and pod CPU
4. Roll out across remaining 11 services if metrics hold
```

The intro line is prepended by the worker (`Auto-summary for *{title}* posted by @{user}`).
Title is extracted from the first `# ` heading in the fetched markdown; user is resolved
from `event.user` via `<@USER_ID>` Slack mention format.

---

## Data Flow: Daily Digest

### 1. Cron trigger

```toml
[triggers]
crons = ["0 7 * * 1-5"]  # Weekdays 07:00 UTC
```

### 2. Read TechRadar canvas

For each channel where bot is a member:
- Read `TechRadar` canvas → parse TOML → extract `[[digest.source]]` URLs
- If `features.digest = false` → skip silently

### 3. Fetch all sources

For each URL from `[[digest.source]]`:
- CF Browser Rendering `/markdown`
- Skip failures, truncate each to ~5000 chars
- Collect all content

### 4. Single Claude call

```
System: buildSystemPrompt(config)

User:
Today is {date}. Below are articles from tech sources.
Select the Top {config.digest.top_n} most relevant for our team and summarize each
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

## Slash Commands

| Command | Behavior | Response visibility |
|---------|----------|---------------------|
| `/tech-radar-setup` | Post canvas name + minimal TOML template + step-by-step instructions | Ephemeral (caller only) |
| `/tech-radar-summarize [optional note] <url>` | Fetch URL, summarize, post to channel | Ephemeral ack → then `in_channel` summary |
| `/tech-radar-digest` | Run digest immediately for this channel | Ephemeral ack → then `in_channel` digest |

All three work regardless of `[features]` settings in the TOML config.

---

## Setup Flow

When bot receives `member_joined_channel` event for itself:
1. Post to channel: welcome message + step-by-step setup instructions + minimal TOML template

When bot receives a message event but `TechRadar` canvas is missing:
- Post once to channel: "⚠️ TechRadar canvas not found. Run `/tech-radar-setup` for instructions."
- Don't repeat on every message (use KV or channel history check to debounce)

---

## Project Structure

```
tech-radar-slack-bot/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry: fetch + scheduled handlers
│   ├── slack/
│   │   ├── verify.ts         # Request signature verification
│   │   ├── events.ts         # Handle message events
│   │   ├── commands.ts       # Handle /tech-radar-* slash commands
│   │   ├── canvas.ts         # Read and parse TechRadar TOML canvas
│   │   └── post.ts           # Post message to channel
│   ├── services/
│   │   ├── browser.ts        # CF Browser Rendering wrapper
│   │   ├── claude.ts         # Claude API wrapper
│   │   ├── sources.ts        # Extract digest sources from parsed config
│   │   └── config.ts         # Parse TOML, build RadarConfig, build system prompt
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
    ├── CANVAS_EXAMPLES.md     # TechRadar canvas TOML templates
    └── DEPLOY.md              # Deployment instructions
```

---

## Error Handling

| Scenario | Channel message |
|----------|----------------|
| `TechRadar` canvas not found | `⚠️ TechRadar canvas not found. Run /tech-radar-setup for instructions.` |
| TOML parse error | `⚠️ Could not parse TechRadar canvas: <error> (line N). Fix the canvas and try again.` |
| `features.auto_summary = false` | Silent — skip without posting |
| `features.digest = false` | Silent — skip without posting |
| No `[[digest.source]]` entries | `⚠️ Daily digest skipped: no [[digest.source]] entries found in TechRadar canvas.` |
| Browser Rendering failed | `⚠️ Could not fetch <url> — site may be paywalled or blocking crawlers.` |
| Claude API error (after retry) | `⚠️ AI service temporarily unavailable, will retry next run.` |
| Message from bot itself | Silent skip (prevent loops) |
| Slack event retry | Check `X-Slack-Retry-Num` header, respond 200 immediately |
| Non-article URL (image, PDF, video) | Detect empty markdown, skip |
| Multiple URLs in one message | Process each separately, one summary per URL |

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
- Rate limiting (max N summaries per hour)
- Analytics: track 👍 reactions on summaries
