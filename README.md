# Tech Radar Slack Bot

AI-powered Slack bot that auto-summarizes tech articles and delivers daily curated digests — personalized to your team's context.

## Features

- **Auto-summarize** — post a URL in the channel, get an AI summary with relevance analysis for your team
- **Daily digest** — automated morning digest of top articles from configurable sources
- **Canvas-driven config** — all configuration lives in a single `TechRadar` Slack Canvas in TOML format, editable by anyone on the team, no deploys needed
- **Multi-channel** — add the bot to any channel, each gets its own `TechRadar` canvas config
- **Self-provisioning** — when invited to a channel, the bot posts setup instructions automatically
- **Slash commands** — `/tech-radar-setup`, `/tech-radar-summarize`, `/tech-radar-digest`

## How It Works

```
You post a link → CF Worker fetches content → Claude summarizes → Bot posts in channel
                         ↑                          ↑
              CF Browser Rendering         TechRadar canvas (TOML)
              (URL → Markdown)             (your team's context + config)
```

All personalization (company context, tech stack, relevance criteria, output format, digest sources) is defined in a single `TechRadar` Slack Canvas in TOML format. Edit the canvas → bot behavior changes immediately.

## Stack

- **Cloudflare Workers** — runtime
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
