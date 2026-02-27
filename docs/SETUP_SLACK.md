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
  description: AI-powered tech news feed, configurable per channel via a single Slack Canvas
  background_color: "#1a1a2e"
  long_description: |
    Summarizes tech articles shared in the channel and delivers a daily digest of top articles.
    Add the bot to any channel, create a TechRadar canvas with your team config, and it's live.
    No code changes, no redeploys — all configuration lives in the canvas.

features:
  bot_user:
    display_name: tech-radar
    always_online: true
  slash_commands:
    - command: /tech-radar-setup
      url: https://PLACEHOLDER.workers.dev/slack/commands
      description: Print canvas setup instructions and config template
      should_escape: false
    - command: /tech-radar-summarize
      url: https://PLACEHOLDER.workers.dev/slack/commands
      description: Summarize a URL and post to channel
      usage_hint: "[optional note] https://example.com/article"
      should_escape: false
    - command: /tech-radar-digest
      url: https://PLACEHOLDER.workers.dev/slack/commands
      description: Trigger today's digest immediately
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
      - conversations:read

settings:
  event_subscriptions:
    request_url: https://PLACEHOLDER.workers.dev/slack/events
    bot_events:
      - message.channels
      - member_joined_channel
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
| `conversations:read` | List channels for multi-channel digest |

## 4. Enable Event Subscriptions

Go to **Event Subscriptions** in the left sidebar.

1. Toggle **"Enable Events"** → On
2. **Request URL**: enter your worker URL (set this after deploying):
   ```
   https://tech-radar-slack-bot.<your-subdomain>.workers.dev/slack/events
   ```
3. Slack will send a challenge request — your worker must respond (see SPEC.md)
4. Under **Subscribe to bot events**, add:
   - `message.channels`
   - `member_joined_channel`
5. Click **"Save Changes"**

## 5. Slash Commands

Go to **Slash Commands** in the left sidebar. Create three commands:

### /tech-radar-setup
1. Click **"Create New Command"**
2. Command: `/tech-radar-setup`
3. Request URL: `https://tech-radar-slack-bot.<your-subdomain>.workers.dev/slack/commands`
4. Short description: "Print canvas setup instructions and config template"
5. Click **"Save"**

### /tech-radar-summarize
1. Click **"Create New Command"**
2. Command: `/tech-radar-summarize`
3. Request URL: `https://tech-radar-slack-bot.<your-subdomain>.workers.dev/slack/commands`
4. Short description: "Summarize a URL and post to channel"
5. Usage hint: `[optional note] https://example.com/article`
6. Click **"Save"**

### /tech-radar-digest
1. Click **"Create New Command"**
2. Command: `/tech-radar-digest`
3. Request URL: `https://tech-radar-slack-bot.<your-subdomain>.workers.dev/slack/commands`
4. Short description: "Trigger today's digest immediately"
5. Click **"Save"**

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
3. When the bot joins, it will automatically post setup instructions to the channel

## 9. Create TechRadar Canvas

In the `#tech-radar` channel:

1. Click the **"+" tab** at the top of the channel (next to "Messages", "Files")
2. Select **"Canvas"**
3. Title it exactly: **`TechRadar`** (must be exact, case-sensitive)
4. Paste your TOML config (see [CANVAS_EXAMPLES.md](CANVAS_EXAMPLES.md) for full examples, or run `/tech-radar-setup` for the minimal template)

> ℹ️ One canvas per channel. The bot looks for an exact title match: `TechRadar`.

## 10. Collect Your Credentials

After setup, you should have:

| Secret | Where to find | Example |
|--------|--------------|---------|
| `SLACK_BOT_TOKEN` | Install App page | `xoxb-123-456-abc` |
| `SLACK_SIGNING_SECRET` | Basic Information → App Credentials | `a1b2c3d4e5f6...` |

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
1. Run `/tech-radar-setup` for step-by-step instructions
2. Check canvas title is exactly `TechRadar` (case-sensitive)
3. Make sure the canvas is a **channel tab** canvas, not a standalone canvas
4. Verify `canvases:read` and `files:read` scopes are granted

### TOML parse error
The bot will post the parse error to the channel with a line reference. Check the canvas content, fix the TOML syntax, and try again.
