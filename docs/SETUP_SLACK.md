# Slack App Setup — Step by Step

## 1. Create a Test Workspace (if needed)

1. Go to https://slack.com/create
2. Enter your email → verify via code
3. Name your workspace (e.g. "Tech Lab")
4. Skip the invite step
5. Create a channel called `#tech-radar`

## 2. Create the Slack App

### Option A: From Manifest (recommended)

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From an app manifest"**
3. Select your test workspace
4. Switch to YAML tab and paste:

```yaml
display_information:
  name: Tech Radar Bot
  description: Auto-summarizes tech articles with team context
  background_color: "#1a1a2e"
  long_description: |
    Posts AI-powered summaries of tech articles shared in the channel.
    Runs a daily digest of top articles from configurable sources.
    All configuration (prompt, sources) lives in Slack Canvas tabs.

features:
  bot_user:
    display_name: tech-radar
    always_online: true
  slash_commands:
    - command: /news
      url: https://PLACEHOLDER.workers.dev/slack/commands
      description: Summarize a URL with team context
      usage_hint: "https://example.com/article"
      should_escape: false

oauth_config:
  scopes:
    bot:
      - channels:history
      - channels:read
      - chat:write
      - canvases:read
      - files:read
      - commands
      - links:read

settings:
  event_subscriptions:
    request_url: https://PLACEHOLDER.workers.dev/slack/events
    bot_events:
      - message.channels
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

5. Click **"Create"**

> ⚠️ The PLACEHOLDER URLs will fail verification — that's OK. You'll update them after deploying the worker.

### Option B: Manual Setup

1. Go to https://api.slack.com/apps → **"Create New App"** → **"From scratch"**
2. Name: `Tech Radar Bot`, select your workspace
3. Continue to step 3 below

## 3. Configure Permissions

Go to **OAuth & Permissions** in the left sidebar.

Under **Bot Token Scopes**, add these scopes:

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read messages in public channels |
| `channels:read` | Get channel info |
| `chat:write` | Post messages |
| `canvases:read` | Read canvas content |
| `files:read` | List canvases (they're file type) |
| `commands` | Slash commands |
| `links:read` | Detect URLs in messages |

## 4. Enable Event Subscriptions

Go to **Event Subscriptions** in the left sidebar.

1. Toggle **"Enable Events"** → On
2. **Request URL**: enter your worker URL (set this after deploying):
   ```
   https://tech-radar-bot.<your-subdomain>.workers.dev/slack/events
   ```
3. Slack will send a challenge request — your worker must respond (see SPEC.md)
4. Under **Subscribe to bot events**, add:
   - `message.channels`
5. Click **"Save Changes"**

## 5. Create Slash Command (optional)

Go to **Slash Commands** in the left sidebar.

1. Click **"Create New Command"**
2. Command: `/news`
3. Request URL: `https://tech-radar-bot.<your-subdomain>.workers.dev/slack/commands`
4. Short description: "Summarize a URL with team context"
5. Usage hint: `https://example.com/article`
6. Click **"Save"**

## 6. Install App to Workspace

Go to **Install App** in the left sidebar.

1. Click **"Install to Workspace"**
2. Review permissions → **"Allow"**
3. Copy the **Bot User OAuth Token** (`xoxb-...`) — you'll need this as a secret

## 7. Get Signing Secret

Go to **Basic Information** in the left sidebar.

1. Under **App Credentials**, find **Signing Secret**
2. Click **"Show"** and copy it — you'll need this as a secret

## 8. Invite Bot to Channel

In Slack:
1. Go to `#tech-radar`
2. Type `/invite @tech-radar` or click channel settings → Integrations → Add apps
3. The bot must be in the channel to receive events

## 9. Create Canvases

In the `#tech-radar` channel:

1. Click the **"+" tab** at the top of the channel (next to "Messages", "Files")
2. Select **"Canvas"**
3. Title it exactly: **`Prompt`** (must match env var `CANVAS_TITLE_PROMPT`)
4. Paste your system prompt (see CANVAS_EXAMPLES.md for templates)
5. Repeat: create another canvas tab titled **`Sources`**
6. Paste your source URLs list (see CANVAS_EXAMPLES.md)

> ℹ️ Canvas titles are case-sensitive. The bot looks for exact title match.

## 10. Collect Your Credentials

After setup, you should have:

| Secret | Where to find | Example |
|--------|--------------|---------|
| `SLACK_BOT_TOKEN` | Install App page | `xoxb-123-456-abc` |
| `SLACK_SIGNING_SECRET` | Basic Information → App Credentials | `a1b2c3d4e5f6...` |
| `SLACK_CHANNEL_ID` | Right-click channel name → "View channel details" → scroll to bottom | `C06ABCDEF` |

---

## Troubleshooting

### "url_verification failed"
Your worker isn't responding to the Slack challenge. Make sure the worker is deployed and the URL is correct. Check `wrangler tail` for logs.

### Bot doesn't respond to messages
1. Is the bot invited to the channel? (`/invite @tech-radar`)
2. Is Event Subscriptions enabled with `message.channels`?
3. Is the Request URL correct and verified (green checkmark)?
4. Check `wrangler tail` for incoming events

### "missing_scope" error
Go to OAuth & Permissions and add the missing scope. Then reinstall the app (Install App → Reinstall to Workspace).

### Canvas not found
1. Check canvas title matches exactly (case-sensitive)
2. Make sure the canvas is a **channel tab** canvas, not a standalone canvas
3. Verify `canvases:read` and `files:read` scopes are granted
