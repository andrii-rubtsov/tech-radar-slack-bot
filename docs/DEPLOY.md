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

---

## 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/tech-radar-slack-bot.git
cd tech-radar-slack-bot
bun install
```

## 2. Configure wrangler.toml

The default `wrangler.toml` is ready to use:

```toml
name = "tech-radar-slack-bot"
main = "src/index.ts"
compatibility_date = "2026-02-28"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 * * * *"]

[vars]
CLAUDE_MODEL_SUMMARIZE = "claude-haiku-4-5-20251001"
CLAUDE_MODEL_DIGEST    = "claude-haiku-4-5-20251001"
INGEST_WINDOW_HOURS     = "24"
INGEST_MAX_SOURCE_LINKS = "20"
INGEST_MAX_NEW_ARTICLES = "25"
ARTICLE_RETENTION_DAYS  = "7"

[[durable_objects.bindings]]
name = "CHANNEL_RADAR_DO"
class_name = "ChannelRadarDO"

[[migrations]]
tag = "v1-channel-radar-do"
new_sqlite_classes = ["ChannelRadarDO"]
```

Optionally adjust the cron schedule, ingest limits, or model overrides. No channel ID or canvas title config is needed.

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

If this is an existing deployment, `wrangler deploy` will apply the `v1-channel-radar-do` Durable Object migration from `wrangler.toml`.

Note the output URL:
```
Published tech-radar-slack-bot (1.23 sec)
  https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev
```

## 5. Update Slack App URLs

Go to https://api.slack.com/apps → your app:

### Event Subscriptions
1. **Request URL**: `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/events`
2. Wait for green "Verified" checkmark
3. Save Changes

### Slash Commands
Update all commands with the same request URL:
- `/tech-radar-setup` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
- `/tech-radar-summarize` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
- `/tech-radar-digest` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
- `/tech-radar-sync` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
- `/tech-radar-debug` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
- `/tech-radar-recent` → `https://tech-radar-slack-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`

## 6. Create TechRadar Canvas in Slack

If you haven't already (see [SETUP_SLACK.md](./SETUP_SLACK.md#9-create-techradar-canvas)):

1. Invite the bot to your channel: `/invite @tech-radar`
   - The bot will automatically post setup instructions
2. Or run `/tech-radar-setup` for the minimal TOML template
3. Create a canvas tab → title exactly: **`TechRadar`**
4. Paste and customize the TOML config (see [CANVAS_EXAMPLES.md](./CANVAS_EXAMPLES.md))

## 7. Test

### Test auto-summarize:
Post a URL in `#tech-radar`:
```
https://blog.cloudflare.com/vinext/
```
The bot should reply within 10-15 seconds with a summary.

### Test setup command:
```
/tech-radar-setup
```
Should return an ephemeral message with the minimal TOML template and setup instructions.

### Test summarize command:
```
/tech-radar-summarize https://blog.cloudflare.com/vinext/
```
Should post a summary to the channel.

### Test digest command:
```
/tech-radar-digest
```
Should trigger a digest for the current channel and post the result from scored storage. If this is the first run, execute `/tech-radar-sync` first.

### Test manual sync:
```
/tech-radar-sync
```
Should discover source links, reserve deduplicated URLs, and enqueue async processing work.

### Test recent preview:
```
/tech-radar-recent 5
```
Should show top 5 scored recent links for the current ingest window.

### Test debug:
```
/tech-radar-debug
```
Should post JSON debug state (last sync stats, source state, counters).

### Test cron (manually):
```bash
# In local dev mode
wrangler dev

# In another terminal, trigger the cron:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
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

### Update config or sources:
Edit the `TechRadar` canvas in Slack. No deploy needed — changes take effect immediately.

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
- Canvas not found → check `TechRadar` canvas exists in the channel; run `/tech-radar-setup`
- Browser Rendering error → check `CF_API_TOKEN` has correct permissions
- No digest items returned → run `/tech-radar-sync` and check `/tech-radar-debug`

### "dispatch exception" in logs
Usually means an unhandled error in async processing. Check the full error in `wrangler tail --format=pretty`.

### Slack says "dispatch_failed"
Your worker responded with non-200 or took too long for the initial response. The worker MUST respond 200 within 3 seconds and process async via `ctx.waitUntil()`.

### Cron doesn't fire
Check `wrangler.toml` has `[triggers]` section. Verify in CF Dashboard → Workers → your worker → Triggers → Cron Triggers.

### Rate limited by Claude
Wait and retry. For sustained usage, add $40+ in credits to reach Tier 2 (1000 req/min).
