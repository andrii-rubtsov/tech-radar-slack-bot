# Tech Radar Slack Bot

AI-powered Slack bot that auto-summarizes tech articles and delivers curated digests from pre-scored sources, personalized to your team's context.

## Features

- **Auto-summarize** — post a URL in the channel, get an AI summary with relevance analysis for your team
- **Incremental ingest + scoring** — discover links from configured sources, deduplicate, fetch, and score continuously
- **Fast digest** — return top-scored recent articles from storage instead of one-shot fetch + analyze
- **Canvas-driven config** — all configuration lives in a single `TechRadar` Slack Canvas in TOML format, editable by anyone on the team, no deploys needed
- **Multi-channel** — add the bot to any channel, each gets its own `TechRadar` canvas config
- **Self-provisioning** — when invited to a channel, the bot posts setup instructions automatically
- **Slash commands** — `/tech-radar-setup`, `/tech-radar-summarize`, `/tech-radar-digest`, `/tech-radar-sync`, `/tech-radar-debug`, `/tech-radar-recent`

## How It Works

```
Summary path:
You post a link → Worker reads TechRadar canvas → fetch Markdown → Claude summarizes → post in channel

Digest path:
Hourly / /tech-radar-sync → read canvas sources → discover URLs → DO dedupe
                         → fetch Markdown → Claude scores (JSON) → store scored records
                         → /tech-radar-digest reads top-N recent scored records and posts digest
```

All personalization (company context, tech stack, relevance criteria, output format, digest sources) is defined in a single `TechRadar` Slack Canvas in TOML format. Canvas must contain valid TOML for summarize and digest flows.

## Stack

- **Cloudflare Workers** — runtime
- **Cloudflare Durable Objects (SQLite)** — per-channel ingest state, dedupe, and scored article store
- **CF Browser Rendering** — URL → Markdown extraction
- **Anthropic Claude API** — summarization and relevance analysis
- **Slack API** — events, canvas, messaging

## Quick Start

1. **[Setup Slack App](docs/SETUP_SLACK.md)** — create app, get tokens
2. **[Setup Cloudflare](docs/SETUP_CLOUDFLARE.md)** — API token for Browser Rendering
3. **[Setup Claude](docs/SETUP_CLAUDE.md)** — API key with credits
4. **[Deploy](docs/DEPLOY.md)** — deploy worker, connect to Slack
5. **Configure TechRadar Canvas** — invite the bot to a channel; it will post setup instructions automatically, or run `/tech-radar-setup`

## Cost

~$5/month total (20 articles/day + daily digest). Browser Rendering and Slack are free tier.

## Docs

| Document | Description |
|----------|-------------|
| [SPEC.md](docs/SPEC.md) | Architecture and data flows |
| [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Code patterns and API contracts |
| [SETUP_SLACK.md](docs/SETUP_SLACK.md) | Slack app setup guide |
| [SETUP_CLOUDFLARE.md](docs/SETUP_CLOUDFLARE.md) | Cloudflare setup guide |
| [SETUP_CLAUDE.md](docs/SETUP_CLAUDE.md) | Anthropic API setup |
| [CANVAS_EXAMPLES.md](docs/CANVAS_EXAMPLES.md) | TechRadar canvas TOML templates and field reference |
| [DEPLOY.md](docs/DEPLOY.md) | Deployment instructions |

## License

MIT
