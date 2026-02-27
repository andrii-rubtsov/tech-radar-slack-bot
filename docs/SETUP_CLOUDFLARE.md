# Cloudflare Setup — Step by Step

## Prerequisites

- Cloudflare account (free plan works)
- Node.js 18+ installed
- Wrangler CLI installed: `npm install -g wrangler`

## 1. Login to Wrangler

```bash
wrangler login
```

This opens a browser window. Authorize wrangler to access your CF account.

Verify:
```bash
wrangler whoami
```

## 2. Get Your Account ID

```bash
wrangler whoami
```

Look for `Account ID` in the output. Or find it in the Cloudflare dashboard:
- Go to https://dash.cloudflare.com
- Click any domain (or Workers & Pages)
- Account ID is in the right sidebar

Save this — you'll need it as `CF_ACCOUNT_ID`.

## 3. Create API Token for Browser Rendering

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Token"**
3. Click **"Create Custom Token"**
4. Configure:
   - **Token name**: `tech-radar-browser-rendering`
   - **Permissions**:
     - Account → Browser Rendering → **Edit**
   - **Account Resources**:
     - Include → Your account
5. Click **"Continue to summary"** → **"Create Token"**
6. **Copy the token immediately** — it's shown only once

Save this as `CF_API_TOKEN`.

## 4. Verify Browser Rendering Works

Test that your token and account ID work:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/browser-rendering/markdown" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Expected response:
```json
{
  "success": true,
  "result": "# Example Domain\n\nThis domain is for use in illustrative examples..."
}
```

## 5. Browser Rendering Limits (Free Tier)

| Plan | Free Allowance | Overage |
|------|---------------|---------|
| Workers Free | 10 min/day, 3 concurrent | Hard limit (fails) |
| Workers Paid ($5/mo) | 10 hours/month, 10 concurrent | $0.09/browser hour |

For this bot: ~20 URLs/day × 5 sec each = ~1.5 min/day. Free tier is more than enough.

## 6. Workers KV (Optional, for caching)

If you want to cache canvas content or deduplicate URLs:

```bash
wrangler kv namespace create "CACHE"
```

Note the ID from the output. Add to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-namespace-id-here"
```

This is optional for v1 — the bot works fine without it.

---

## Credentials Summary

After this setup you should have:

| Secret | Value |
|--------|-------|
| `CF_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CF_API_TOKEN` | API token with Browser Rendering Edit permission |
