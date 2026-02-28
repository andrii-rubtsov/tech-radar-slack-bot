import type { Env } from '../types.js';
import { readCanvas } from './canvas.js';
import { postMessage, toSlackMrkdwn } from './post.js';
import { verifySlackSignature } from './verify.js';
import {
  CANVAS_NAME,
  parseRadarConfig,
  buildSystemPrompt,
} from '../services/config.js';
import { fetchMarkdown } from '../services/browser.js';
import { callClaude } from '../services/claude.js';
import { extractUrls } from '../utils/urls.js';
import { truncateMarkdown } from '../utils/truncate.js';
import { runDailyDigest } from '../digest/daily.js';
import {
  getChannelDebugState,
  getTopDigestArticles,
  processChannelInbox,
  runChannelSync,
} from '../digest/pipeline.js';

const MINIMAL_TOML_TEMPLATE = `\`\`\`toml
# ─────────────────────────────────────────────
#  TechRadar — channel configuration
#  Canvas name must be exactly: TechRadar
#
#  Slash commands (always work, ignore [features] settings):
#    /tech-radar-setup               → print this template (only you see it)
#    /tech-radar-summarize [note] <url>  → summarize URL, post to channel
#    /tech-radar-digest              → trigger digest now, post to channel
#    /tech-radar-sync                → ingest sources and enqueue async processing
#    /tech-radar-debug               → show pipeline status
#    /tech-radar-recent [N]          → preview scored top-N
# ─────────────────────────────────────────────

[context]
industry = "Your industry"
language = "English"
tone     = "direct, technical"

# Keys are arbitrary — use whatever labels fit your team
[tech_stack]
backend = "Your backend stack"
infra   = "Your infrastructure"

[features]
auto_summary = true
digest       = true

[filter]
focus  = ["topics you care about"]
ignore = ["noise to skip"]

[[relevance]]
name        = "Tech Stack"
emoji       = "🔧"
sentences   = 2
description = "How this relates to our current tools"

[[relevance]]
name        = "Goals"
emoji       = "🎯"
sentences   = 2
description = "Our current team priorities or OKRs"

[output]
summary_sentences = 3
adoption_path     = true

[digest]
top_n = 5

[[digest.source]]
url   = "https://hnrss.org/best?count=30"
label = "Hacker News"
\`\`\``;

export async function handleSlackCommand(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Ignore Slack retries to avoid duplicate command execution.
  if (request.headers.get('X-Slack-Retry-Num')) {
    console.log('[commands] ignoring retry request');
    return new Response('ok');
  }

  const body = await request.text();

  const signature = request.headers.get('X-Slack-Signature') || '';
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') || '';
  const isValid = await verifySlackSignature(env.SLACK_SIGNING_SECRET, signature, timestamp, body);
  if (!isValid) {
    console.warn('[commands] invalid Slack signature');
    return new Response('Invalid signature', { status: 401 });
  }

  const formData = new URLSearchParams(body);
  const command = formData.get('command')?.toString() || '';
  const text = formData.get('text')?.toString().trim() || '';
  const channelId = formData.get('channel_id')?.toString() || '';
  const userId = formData.get('user_id')?.toString() || '';
  const responseUrl = formData.get('response_url')?.toString() || '';
  console.log(
    `[commands] command=${command} channel=${channelId} user=${userId} textLen=${text.length}`,
  );

  if (command === '/tech-radar-setup') {
    return handleSetupCommand();
  }

  if (command === '/tech-radar-summarize') {
    return handleSummarizeCommand(text, channelId, userId, responseUrl, env, ctx);
  }

  if (command === '/tech-radar-digest') {
    return handleDigestCommand(channelId, env, ctx);
  }

  if (command === '/tech-radar-sync') {
    return handleSyncCommand(channelId, env, ctx);
  }

  if (command === '/tech-radar-debug') {
    return handleDebugCommand(channelId, responseUrl, env, ctx);
  }

  if (command === '/tech-radar-recent') {
    return handleRecentCommand(channelId, text, env, ctx);
  }

  return Response.json({ response_type: 'ephemeral', text: 'Unknown command.' });
}

function handleSetupCommand(): Response {
  const text = [
    '*TechRadar Bot Setup*',
    '',
    '1. In this channel, click the *+* tab at the top → select *Canvas*',
    '2. Title it exactly: `TechRadar` (case-sensitive)',
    '3. Paste the TOML config below and customize for your team',
    '4. Post any URL to test auto-summarize',
    '',
    MINIMAL_TOML_TEMPLATE,
  ].join('\n');

  return Response.json({ response_type: 'ephemeral', text });
}

function handleSummarizeCommand(
  text: string,
  channelId: string,
  userId: string,
  responseUrl: string,
  env: Env,
  ctx: ExecutionContext,
): Response {
  const urls = extractUrls(text);

  if (urls.length === 0) {
    return Response.json({
      response_type: 'ephemeral',
      text: 'Usage: `/tech-radar-summarize [optional note] https://example.com/article`',
    });
  }

  const url = urls[0];
  // Strip the URL (and any Slack angle-bracket wrapping) to get just the note text
  const note = text
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();

  ctx.waitUntil(processSummarizeCommand(url, note, channelId, userId, responseUrl, env));

  return Response.json({ response_type: 'ephemeral', text: `⏳ Analyzing ${url}…` });
}

async function processSummarizeCommand(
  url: string,
  note: string,
  channelId: string,
  userId: string,
  responseUrl: string,
  env: Env,
): Promise<void> {
  const startedAt = Date.now();
  console.log(`[commands] summarize start channel=${channelId} url=${url} noteLen=${note.length}`);
  // Canvas + valid TOML config are mandatory for summarize command.
  const tomlContent = await readCanvas(env.SLACK_BOT_TOKEN, channelId, CANVAS_NAME);
  console.log(`[commands] summarize canvas length=${tomlContent?.length ?? 0}`);
  if (!tomlContent) {
    await postViaResponseUrl(
      responseUrl,
      'ephemeral',
      '⚠️ TechRadar canvas not found. Run `/tech-radar-setup` for instructions.',
    );
    return;
  }

  let systemPrompt: string;
  try {
    const config = parseRadarConfig(tomlContent);
    systemPrompt = buildSystemPrompt(config);
    console.log(`[commands] summarize config loaded promptLen=${systemPrompt.length}`);
  } catch (err) {
    await postViaResponseUrl(
      responseUrl,
      'ephemeral',
      `⚠️ Could not parse TechRadar canvas: ${String(err)}. Fix the canvas and try again.`,
    );
    console.warn('[commands] summarize config parse failed');
    return;
  }

  const markdown = await fetchMarkdown(url, env);
  if (!markdown) {
    await postViaResponseUrl(
      responseUrl,
      'in_channel',
      `⚠️ Could not fetch ${url} — site may be paywalled or blocking crawlers.`,
    );
    return;
  }
  console.log(`[commands] summarize markdown len=${markdown.length}`);

  const content = truncateMarkdown(markdown, 15000);
  const userMessage = note
    ? `Summarize this article:\n\n<article>\n${content}\n</article>\n\nNote: ${note}`
    : `Summarize this article:\n\n<article>\n${content}\n</article>`;

  let summary: string;
  try {
    summary = await callClaude(
      env.ANTHROPIC_API_KEY,
      env.CLAUDE_MODEL_SUMMARIZE || 'claude-haiku-4-5-20251001',
      systemPrompt,
      userMessage,
      1024,
    );
  } catch (err) {
    await postViaResponseUrl(
      responseUrl,
      'ephemeral',
      '⚠️ AI service temporarily unavailable, will retry next run.',
    );
    console.error('Claude error in summarize command:', err);
    return;
  }
  console.log(`[commands] summarize response len=${summary.length}`);

  const title = extractTitle(markdown) || url;
  const poster = userId ? `<@${userId}>` : 'someone';
  let intro = `${poster} shares <${url}|${title}>`;
  if (note) intro += `\nand says: ${note}`;
  intro += '\n\n';

  await postViaResponseUrl(responseUrl, 'in_channel', toSlackMrkdwn(intro + summary));
  console.log(`[commands] summarize done durationMs=${Date.now() - startedAt}`);
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function handleDigestCommand(channelId: string, env: Env, ctx: ExecutionContext): Response {
  // Slash command runs on-demand and should ignore [features].digest toggles.
  console.log(`[commands] digest start channel=${channelId}`);
  ctx.waitUntil(runDailyDigest(env, channelId, { force: true }));
  return Response.json({ response_type: 'ephemeral', text: '⏳ Running digest for this channel…' });
}

function handleSyncCommand(channelId: string, env: Env, ctx: ExecutionContext): Response {
  console.log(`[commands] sync start channel=${channelId}`);
  ctx.waitUntil(processSyncCommand(channelId, env));
  return Response.json({
    response_type: 'ephemeral',
    text: '⏳ Running source sync and queueing async processing…',
  });
}

async function processSyncCommand(channelId: string, env: Env): Promise<void> {
  try {
    const stats = await runChannelSync(env, channelId, {
      force: true,
      // Slash command path should be fast: enqueue work and return.
      maxSources: 6,
      maxNewArticles: 20,
      timeBudgetMs: 15_000,
    });
    const warmup = await processChannelInbox(env, channelId, {
      maxItems: 1,
      maxAttempts: 3,
      timeBudgetMs: 20_000,
    });
    const text = [
      '✅ Sync queued.',
      `Discovered: ${stats.discovered}`,
      `Reserved: ${stats.reserved}`,
      `Enqueued: ${stats.enqueued}`,
      `Warm batch: claimed=${warmup.claimed}, scored=${warmup.scored}, requeued=${warmup.requeued}`,
      stats.stopped_early ? `Stopped early: ${stats.stop_reason}` : '',
      'Background processing runs asynchronously from the DO inbox.',
      'Use `/tech-radar-debug` to check queue depth and recent failures.',
    ].join('\n');
    await postMessage(env.SLACK_BOT_TOKEN, channelId, text);
  } catch (err) {
    await postMessage(env.SLACK_BOT_TOKEN, channelId, `⚠️ Sync failed: ${String(err)}`);
  }
}

function handleDebugCommand(
  channelId: string,
  responseUrl: string,
  env: Env,
  ctx: ExecutionContext,
): Response {
  ctx.waitUntil(processDebugCommand(channelId, responseUrl, env));
  return Response.json({ response_type: 'ephemeral', text: '⏳ Collecting pipeline debug state…' });
}

async function processDebugCommand(channelId: string, responseUrl: string, env: Env): Promise<void> {
  try {
    const debug = await getChannelDebugState(env, channelId);
    const text = [
      '*TechRadar Pipeline Debug*',
      '```json',
      JSON.stringify(debug, null, 2),
      '```',
    ].join('\n');
    if (responseUrl) {
      await postViaResponseUrl(responseUrl, 'ephemeral', text);
    } else {
      await postMessage(env.SLACK_BOT_TOKEN, channelId, text);
    }
  } catch (err) {
    const errorText = `⚠️ Debug read failed: ${String(err)}`;
    if (responseUrl) {
      await postViaResponseUrl(responseUrl, 'ephemeral', errorText);
    } else {
      await postMessage(env.SLACK_BOT_TOKEN, channelId, errorText);
    }
  }
}

function handleRecentCommand(
  channelId: string,
  text: string,
  env: Env,
  ctx: ExecutionContext,
): Response {
  const requested = Number(text || 5);
  const topN = Number.isFinite(requested) ? Math.max(1, Math.min(10, Math.floor(requested))) : 5;
  ctx.waitUntil(processRecentCommand(channelId, topN, env));
  return Response.json({
    response_type: 'ephemeral',
    text: `⏳ Loading top ${topN} scored articles from recent window…`,
  });
}

async function processRecentCommand(channelId: string, topN: number, env: Env): Promise<void> {
  const lookback = Number(env.INGEST_WINDOW_HOURS || 24);
  const lookbackHours = Number.isFinite(lookback) ? Math.max(1, Math.min(168, lookback)) : 24;
  try {
    const items = await getTopDigestArticles(env, channelId, topN, lookbackHours);
    if (items.length === 0) {
      await postMessage(
        env.SLACK_BOT_TOKEN,
        channelId,
        `⚠️ No scored articles in last ${lookbackHours} hour(s). Run \`/tech-radar-sync\`.`,
      );
      return;
    }

    const lines = items.map(
      (item, idx) =>
        `${idx + 1}. ${(item.overall_score ?? item.average_relevance ?? 0).toFixed(0)}/100 <${item.url}|${item.title || item.url}>`,
    );
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channelId,
      `*Top ${items.length} Recent Scored Articles*\n${lines.join('\n')}`,
    );
  } catch (err) {
    await postMessage(env.SLACK_BOT_TOKEN, channelId, `⚠️ Recent query failed: ${String(err)}`);
  }
}

async function postViaResponseUrl(
  responseUrl: string,
  responseType: 'ephemeral' | 'in_channel',
  text: string,
): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: responseType, text }),
  });
}

// Re-export for use in digest posting to channel
export { postMessage };
