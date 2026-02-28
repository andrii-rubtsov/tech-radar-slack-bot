# Anthropic Claude API Setup

## 1. Create Account

1. Go to https://console.anthropic.com
2. Sign up / sign in

> ⚠️ This is the **API console**, separate from claude.ai subscription.
> A Claude Pro/Max subscription does NOT give you API access.

## 2. Add Credits

1. Go to https://console.anthropic.com/settings/billing
2. Click **"Add funds"**
3. Add **$5** (this will last months for this bot's usage)

Estimated usage:
- Auto-summarize (Haiku): ~$0.004 per article
- Daily digest scoring (Haiku): significantly lower than Sonnet
- 20 articles/day + digest scoring = **lower than Sonnet-based setup**

## 3. Create API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click **"Create Key"**
3. Name: `tech-radar-slack-bot`
4. Copy the key immediately — shown only once

Save this as `ANTHROPIC_API_KEY`.

## 4. Verify It Works

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
  }'
```

Expected: JSON response with `content[0].text` containing a greeting.

## 5. Model Selection

The bot uses two models (configurable via env vars):

| Use Case | Default Model | Why |
|----------|--------------|-----|
| Auto-summarize (single article) | `claude-haiku-4-5-20251001` | Fast, cheap, good enough for single article summary |
| Daily digest scoring | `claude-haiku-4-5-20251001` | Lower cost for testing and high-volume runs |

You can override these in `wrangler.toml`:
```toml
[vars]
CLAUDE_MODEL_SUMMARIZE = "claude-haiku-4-5-20251001"
CLAUDE_MODEL_DIGEST = "claude-haiku-4-5-20251001"
```

Or use the same model for both if you prefer consistency over cost optimization.

## 6. Rate Limits

Anthropic API rate limits (per API key):

| Tier | Requests/min | Tokens/min |
|------|-------------|------------|
| Tier 1 (new) | 50 | 40,000 |
| Tier 2 ($40+ spent) | 1,000 | 80,000 |

For this bot, Tier 1 is more than sufficient. You'd need to summarize 50 articles simultaneously to hit the limit.

---

## Credentials Summary

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
