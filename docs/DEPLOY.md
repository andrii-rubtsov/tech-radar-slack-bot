# Deployment — Step by Step

## Prerequisites

Complete these guides first:
1. [SETUP_SLACK.md](./SETUP_SLACK.md) — Slack app created, bot token and signing secret ready
2. [SETUP_CLOUDFLARE.md](./SETUP_CLOUDFLARE.md) — CF account, API token, wrangler logged in
3. [SETUP_CLAUDE.md](./SETUP_CLAUDE.md) — Anthropic API key with credits

You should have these 5 secrets ready:

| Secret | Example |
|--------|---------|
| `SLACK_BOT_TOKEN` | `xoxb-123-456-abcdef` |
| `SLACK_SIGNING_SECRET` | `a1b2c3d4e5f6g7h8` |
| `CF_ACCOUNT_ID` | `1234567890abcdef` |
| `CF_API_TOKEN` | `AbCdEf123456...` |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |

Plus one config value:

| Config | How to get |
|--------|-----------|
| `SLACK_CHANNEL_ID` | In Slack: right-click `#tech-radar` → "View channel details" → scroll to bottom |

---

## 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/tech-radar-bot.git
cd tech-radar-bot
npm install
```

## 2. Configure wrangler.toml

Edit `wrangler.toml` and set your channel ID:

```toml
[vars]
SLACK_CHANNEL_ID = "C06YOUR_CHANNEL_ID"
```

Optionally adjust:
```toml
# Cron schedule (default: weekdays at 07:00 UTC)
[triggers]
crons = ["0 7 * * 1-5"]

# Model overrides
[vars]
CLAUDE_MODEL_SUMMARIZE = "claude-haiku-4-5-20251001"
CLAUDE_MODEL_DIGEST = "claude-sonnet-4-6"

# Canvas title overrides (if your canvases have different names)
CANVAS_TITLE_PROMPT = "Prompt"
CANVAS_TITLE_SOURCES = "Sources"
```

## 3. Set Secrets

```bash
# Each command will prompt for the value (paste it, press Enter)
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put CF_ACCOUNT_ID
wrangler secret put CF_API_TOKEN
wrangler secret put ANTHROPIC_API_KEY
```

## 4. Deploy

```bash
wrangler deploy
```

Note the output URL:
```
Published tech-radar-bot (1.23 sec)
  https://tech-radar-bot.YOUR_SUBDOMAIN.workers.dev
```

## 5. Update Slack App URLs

Go to https://api.slack.com/apps → your app:

### Event Subscriptions
1. **Request URL**: `https://tech-radar-bot.YOUR_SUBDOMAIN.workers.dev/slack/events`
2. Wait for green "Verified" checkmark
3. Save Changes

### Slash Commands
1. Edit `/news` command
2. **Request URL**: `https://tech-radar-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
3. Save

## 6. Create Canvases in Slack

If you haven't already (see [SETUP_SLACK.md](./SETUP_SLACK.md#9-create-canvases)):

1. In `#tech-radar`, click **"+"** tab → Canvas → title: **"Prompt"**
2. Paste system prompt from [CANVAS_EXAMPLES.md](./CANVAS_EXAMPLES.md)
3. Create another canvas tab → title: **"Sources"**
4. Paste source URLs list

## 7. Test

### Test auto-summarize:
Post a URL in `#tech-radar`:
```
https://blog.cloudflare.com/vinext/
```
The bot should reply within 10-15 seconds with a summary.

### Test slash command:
```
/news https://github.blog/changelog/
```

### Test cron (manually):
```bash
# In local dev mode
wrangler dev

# In another terminal, trigger the cron:
curl "http://localhost:8787/__scheduled?cron=0+7+*+*+1-5"
```

### Watch logs:
```bash
wrangler tail
```

---

## Local Development

### Run locally:
```bash
wrangler dev
```

This starts a local server at `http://localhost:8787`.

### Expose to Slack (Slack needs a public URL for events):

Option A — Cloudflare Tunnel (recommended):
```bash
# Install cloudflared if not already
brew install cloudflare/cloudflare/cloudflared

# Create a quick tunnel
cloudflared tunnel --url http://localhost:8787
```

This gives you a public `*.trycloudflare.com` URL. Use it in Slack Event Subscriptions temporarily.

Option B — ngrok:
```bash
ngrok http 8787
```

### Local secrets:

Create `.dev.vars` file (gitignored):
```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
ANTHROPIC_API_KEY=sk-ant-your-key
```

---

## Updating

### Update prompt or sources:
Edit the canvas in Slack. No deploy needed — changes take effect immediately.

### Update code:
```bash
git pull
wrangler deploy
```

### Update secrets:
```bash
wrangler secret put SECRET_NAME
# paste new value
```

---

## Troubleshooting

### Bot doesn't respond
```bash
wrangler tail
```
Check for errors. Common issues:
- Slack signing verification failing → check `SLACK_SIGNING_SECRET`
- Canvas not found → check canvas title matches env var exactly
- Browser Rendering error → check `CF_API_TOKEN` has correct permissions

### "dispatch exception" in logs
Usually means an unhandled error in async processing. Check the full error in `wrangler tail --format=pretty`.

### Slack says "dispatch_failed"
Your worker responded with non-200 or took too long for the initial response. The worker MUST respond 200 within 3 seconds and process async via `ctx.waitUntil()`.

### Cron doesn't fire
Check `wrangler.toml` has `[triggers]` section. Verify in CF Dashboard → Workers → your worker → Triggers → Cron Triggers.

### Rate limited by Claude
Wait and retry. For sustained usage, add $40+ in credits to reach Tier 2 (1000 req/min).
