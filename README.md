# Tech Radar Bot

AI-powered Slack bot that auto-summarizes tech articles and delivers daily curated digests — personalized to your team's context.

## Features

- **Auto-summarize** — post a URL in the channel, get an AI summary with relevance analysis for your team
- **Daily digest** — automated morning digest of top articles from configurable sources
- **Canvas-driven config** — system prompt and source list live in Slack Canvas tabs, editable by anyone on the team, no deploys needed
- **Slash command** — `/news <url>` for on-demand summaries

## How It Works

```
You post a link → CF Worker fetches content → Claude summarizes → Bot posts in channel
                         ↑                          ↑
              CF Browser Rendering         Prompt from Slack Canvas
              (URL → Markdown)             (your team's context)
```

All personalization (company context, priorities, output format, language) is defined in a Slack Canvas tab. Edit the canvas → bot behavior changes immediately.

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
5. **[Configure Canvases](docs/CANVAS_EXAMPLES.md)** — set your team's context and sources

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
| [CANVAS_EXAMPLES.md](docs/CANVAS_EXAMPLES.md) | Prompt and sources templates |
| [DEPLOY.md](docs/DEPLOY.md) | Deployment instructions |

## License

MIT
