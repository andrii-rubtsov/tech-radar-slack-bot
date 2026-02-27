# Implementation Details

Technical reference for the AI coding agent implementing this project.

---

## Environment & Types

### Env interface

```typescript
interface Env {
  // Vars (wrangler.toml)
  SLACK_CHANNEL_ID: string;
  CLAUDE_MODEL_SUMMARIZE: string;  // default: "claude-haiku-4-5-20251001"
  CLAUDE_MODEL_DIGEST: string;     // default: "claude-sonnet-4-6"
  CANVAS_TITLE_PROMPT: string;     // default: "Prompt"
  CANVAS_TITLE_SOURCES: string;    // default: "Sources"

  // Secrets
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ANTHROPIC_API_KEY: string;

  // Optional KV
  CACHE?: KVNamespace;
}
```

### wrangler.toml

```toml
name = "tech-radar-bot"
main = "src/index.ts"
compatibility_date = "2026-02-27"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 7 * * 1-5"]

[vars]
SLACK_CHANNEL_ID = ""
CLAUDE_MODEL_SUMMARIZE = "claude-haiku-4-5-20251001"
CLAUDE_MODEL_DIGEST = "claude-sonnet-4-6"
CANVAS_TITLE_PROMPT = "Prompt"
CANVAS_TITLE_SOURCES = "Sources"
```

---

## Worker Entry Point

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/slack/events') {
      return handleSlackEvent(request, env, ctx);
    }

    if (url.pathname === '/slack/commands') {
      return handleSlackCommand(request, env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyDigest(env));
  }
};
```

---

## Slack Event Handler

Critical requirements:
1. **Respond 200 within 3 seconds** — Slack retries otherwise
2. **Handle retries** — check `X-Slack-Retry-Num` header
3. **Handle url_verification** — Slack sends this when setting up
4. **Verify signature** — security requirement
5. **Process async** — use `ctx.waitUntil()`

```typescript
async function handleSlackEvent(
  request: Request, env: Env, ctx: ExecutionContext
): Promise<Response> {
  // 1. Reject retries immediately
  if (request.headers.get('X-Slack-Retry-Num')) {
    return new Response('ok');
  }

  // 2. Read body (needed for both verification and parsing)
  const body = await request.text();

  // 3. Verify Slack signature
  const signature = request.headers.get('X-Slack-Signature') || '';
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') || '';
  const isValid = await verifySlackSignature(
    env.SLACK_SIGNING_SECRET, signature, timestamp, body
  );
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 4. Parse payload
  const payload = JSON.parse(body);

  // 5. Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }

  // 6. Handle message event
  if (payload.type === 'event_callback' && payload.event?.type === 'message') {
    // Respond immediately, process async
    ctx.waitUntil(processMessageEvent(payload.event, env));
    return new Response('ok');
  }

  return new Response('ok');
}
```

---

## Slack Signature Verification

```typescript
async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(baseString)
  );
  const computed = `v0=${[...new Uint8Array(sig)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;

  return computed === signature;
}
```

---

## URL Extraction

Slack auto-formats URLs in message text. Both formats must be handled:

```typescript
// Slack formats: <https://example.com|example.com> or <https://example.com>
// Also handle plain URLs that aren't wrapped
const URL_REGEX = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>|(https?:\/\/[^\s>]+)/g;

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    urls.push(match[1] || match[2]);
  }
  // Deduplicate
  return [...new Set(urls)];
}
```

---

## Message Processing

```typescript
async function processMessageEvent(event: SlackMessageEvent, env: Env) {
  // Skip bot messages (prevent loops)
  if (event.bot_id || event.subtype === 'bot_message') return;

  // Skip if not in our target channel
  if (event.channel !== env.SLACK_CHANNEL_ID) return;

  // Extract URLs
  const urls = extractUrls(event.text || '');
  if (urls.length === 0) return;

  // Read canvas prompt
  const systemPrompt = await readCanvas(
    env.SLACK_BOT_TOKEN,
    env.SLACK_CHANNEL_ID,
    env.CANVAS_TITLE_PROMPT
  ) || FALLBACK_PROMPT;

  // Process each URL
  for (const url of urls) {
    try {
      // Fetch article content
      const markdown = await fetchMarkdown(url, env);
      if (!markdown || markdown.length < 100) continue; // Skip empty/tiny results

      // Truncate if too long
      const content = truncateMarkdown(markdown, 15000);

      // Get summary from Claude
      const userMessage = event.text
        ? `Summarize this article:\n\n<article>\n${content}\n</article>\n\nUser's note: ${event.text}`
        : `Summarize this article:\n\n<article>\n${content}\n</article>`;

      const summary = await callClaude(
        env.ANTHROPIC_API_KEY,
        env.CLAUDE_MODEL_SUMMARIZE || 'claude-haiku-4-5-20251001',
        systemPrompt,
        userMessage,
        1024
      );

      // Post to channel
      await postMessage(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, summary);

    } catch (err) {
      console.error(`Error processing ${url}:`, err);
    }
  }
}
```

---

## CF Browser Rendering

```typescript
async function fetchMarkdown(url: string, env: Env): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/markdown`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          gotoOptions: {
            waitUntil: 'networkidle0'
          }
        }),
      }
    );

    if (!resp.ok) {
      console.error(`Browser Rendering failed for ${url}: ${resp.status}`);
      return null;
    }

    const data = await resp.json() as { success: boolean; result: string };
    return data.success ? data.result : null;

  } catch (err) {
    console.error(`Browser Rendering error for ${url}:`, err);
    return null;
  }
}
```

---

## Claude API

```typescript
interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 1024
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${error}`);
  }

  const data = await resp.json() as ClaudeResponse;
  return data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}
```

---

## Slack Canvas Reading

```typescript
async function readCanvas(
  botToken: string,
  channelId: string,
  canvasTitle: string
): Promise<string | null> {
  // 1. List canvases in channel
  const listResp = await fetch(
    `https://slack.com/api/files.list?channel=${channelId}&types=canvas`,
    { headers: { Authorization: `Bearer ${botToken}` } }
  );
  const listData = await listResp.json() as {
    ok: boolean;
    files: Array<{ id: string; title: string }>;
  };

  if (!listData.ok || !listData.files) {
    console.error('Failed to list canvases:', listData);
    return null;
  }

  const canvas = listData.files.find(f => f.title === canvasTitle);
  if (!canvas) {
    console.warn(`Canvas "${canvasTitle}" not found in channel ${channelId}`);
    return null;
  }

  // 2. Read canvas sections
  const sectionsResp = await fetch('https://slack.com/api/canvases.sections.lookup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      canvas_id: canvas.id,
      criteria: { section_types: ['any_header'] },
    }),
  });
  const sectionsData = await sectionsResp.json() as {
    ok: boolean;
    sections: Array<{ id: string; markdown: string }>;
  };

  if (!sectionsData.ok) {
    console.error('Failed to read canvas sections:', sectionsData);
    return null;
  }

  // 3. Combine all sections
  return sectionsData.sections
    ?.map(s => s.markdown)
    .join('\n\n') || null;
}
```

> **Note**: The Canvas API may return content differently depending on
> Slack's version. Test this thoroughly. If `canvases.sections.lookup`
> doesn't return full content, try alternative approaches:
> - Use `conversations.canvases` endpoint
> - Access canvas via `files.info` with the canvas file ID
> - Store canvas IDs in env vars and use a different read method

---

## Slack Post Message

```typescript
async function postMessage(
  botToken: string,
  channelId: string,
  text: string
): Promise<void> {
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = await resp.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error('Failed to post message:', data.error);
  }
}
```

---

## Daily Digest

```typescript
async function runDailyDigest(env: Env): Promise<void> {
  // 1. Read canvases
  const systemPrompt = await readCanvas(
    env.SLACK_BOT_TOKEN,
    env.SLACK_CHANNEL_ID,
    env.CANVAS_TITLE_PROMPT
  ) || FALLBACK_PROMPT;

  const sourcesContent = await readCanvas(
    env.SLACK_BOT_TOKEN,
    env.SLACK_CHANNEL_ID,
    env.CANVAS_TITLE_SOURCES
  );

  if (!sourcesContent) {
    console.error('Sources canvas not found, skipping digest');
    return;
  }

  // 2. Parse source URLs
  const sourceUrls = parseSourceUrls(sourcesContent);
  if (sourceUrls.length === 0) {
    console.error('No source URLs found in canvas');
    return;
  }

  // 3. Fetch all sources (parallel, with timeout)
  const results = await Promise.allSettled(
    sourceUrls.map(async (url) => {
      const md = await fetchMarkdown(url, env);
      return { url, markdown: md ? truncateMarkdown(md, 5000) : null };
    })
  );

  // 4. Build source content for Claude
  const sources = results
    .filter((r): r is PromiseFulfilledResult<{ url: string; markdown: string | null }> =>
      r.status === 'fulfilled' && r.value.markdown !== null
    )
    .map(r => r.value);

  if (sources.length === 0) {
    console.error('All sources failed to fetch');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const sourceBlocks = sources
    .map(s => `<source url="${s.url}">\n${s.markdown}\n</source>`)
    .join('\n\n');

  const userMessage = `Today is ${today}. Below are articles from various tech sources.\n` +
    `Select the Top 5 most relevant for our team and summarize each ` +
    `according to the output format in your instructions.\n\n${sourceBlocks}`;

  // 5. Call Claude (use stronger model for multi-article ranking)
  const digest = await callClaude(
    env.ANTHROPIC_API_KEY,
    env.CLAUDE_MODEL_DIGEST || 'claude-sonnet-4-6',
    systemPrompt,
    userMessage,
    2048
  );

  // 6. Post digest
  const header = `📡 *Tech Radar — ${today}*\n\n`;
  await postMessage(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, header + digest);
}

function parseSourceUrls(markdown: string): string[] {
  const urls: string[] = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- http')) {
      urls.push(trimmed.slice(2).trim());
    }
  }
  return urls;
}
```

---

## Smart Truncation

```typescript
function truncateMarkdown(markdown: string, maxChars: number = 15000): string {
  if (markdown.length <= maxChars) return markdown;

  const truncated = markdown.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');

  if (lastParagraph > maxChars * 0.8) {
    return truncated.slice(0, lastParagraph) + '\n\n[... truncated]';
  }
  return truncated + '\n\n[... truncated]';
}
```

---

## Fallback Prompt

Used when canvas is not found:

```typescript
const FALLBACK_PROMPT = `You are a tech news analyst. Summarize articles concisely.
For each article provide:
1. Summary — 2-3 sentences
2. Key takeaways
3. Action items if any

Be direct and technical.`;
```

---

## Slash Command Handler

```typescript
async function handleSlackCommand(
  request: Request, env: Env, ctx: ExecutionContext
): Promise<Response> {
  const formData = await request.formData();
  const text = formData.get('text')?.toString().trim() || '';
  const responseUrl = formData.get('response_url')?.toString() || '';

  // Extract URL from command text
  const urls = extractUrls(text);

  if (urls.length === 0) {
    return Response.json({
      response_type: 'ephemeral',
      text: 'Usage: /news <url>',
    });
  }

  // Respond immediately (Slack needs response within 3 sec)
  ctx.waitUntil(processSlashCommand(urls[0], responseUrl, env));

  return Response.json({
    response_type: 'ephemeral',
    text: `⏳ Analyzing ${urls[0]}...`,
  });
}

async function processSlashCommand(
  url: string, responseUrl: string, env: Env
): Promise<void> {
  const systemPrompt = await readCanvas(
    env.SLACK_BOT_TOKEN,
    env.SLACK_CHANNEL_ID,
    env.CANVAS_TITLE_PROMPT
  ) || FALLBACK_PROMPT;

  const markdown = await fetchMarkdown(url, env);
  if (!markdown) {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `⚠️ Could not fetch ${url}` }),
    });
    return;
  }

  const content = truncateMarkdown(markdown, 15000);
  const summary = await callClaude(
    env.ANTHROPIC_API_KEY,
    env.CLAUDE_MODEL_SUMMARIZE || 'claude-haiku-4-5-20251001',
    systemPrompt,
    `Summarize this article:\n\n<article>\n${content}\n</article>`,
    1024
  );

  // Post via response_url (visible to everyone in channel)
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'in_channel',
      text: `🔍 ${summary}`,
    }),
  });
}
```
