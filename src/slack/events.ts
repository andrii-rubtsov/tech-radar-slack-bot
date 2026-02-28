import type { Env, SlackMessageEvent, SlackEventPayload } from '../types.js';
import { verifySlackSignature } from './verify.js';
import { readCanvas } from './canvas.js';
import { postMessage } from './post.js';
import {
  CANVAS_NAME,
  FALLBACK_PROMPT,
  parseRadarConfig,
  buildSystemPrompt,
} from '../services/config.js';
import { fetchMarkdown } from '../services/browser.js';
import { callClaude } from '../services/claude.js';
import { extractUrls } from '../utils/urls.js';
import { truncateMarkdown } from '../utils/truncate.js';

export async function handleSlackEvent(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Reject retries immediately — Slack will keep retrying if we don't 200 fast enough
  if (request.headers.get('X-Slack-Retry-Num')) {
    return new Response('ok');
  }

  const body = await request.text();

  const signature = request.headers.get('X-Slack-Signature') || '';
  const timestamp = request.headers.get('X-Slack-Request-Timestamp') || '';
  const isValid = await verifySlackSignature(env.SLACK_SIGNING_SECRET, signature, timestamp, body);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const payload = JSON.parse(body) as SlackEventPayload;

  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    const event = payload.event;

    // Bot joined a channel → post setup instructions
    if (
      event?.type === 'member_joined_channel' &&
      event.user === payload.authorizations?.[0]?.user_id
    ) {
      ctx.waitUntil(postSetupInstructions(event.channel, env));
      return new Response('ok');
    }

    // Message posted in channel
    if (event?.type === 'message') {
      ctx.waitUntil(processMessageEvent(event as SlackMessageEvent, env));
      return new Response('ok');
    }
  }

  return new Response('ok');
}

async function processMessageEvent(event: SlackMessageEvent, env: Env): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[events] processMessageEvent channel=${event.channel} user=${event.user || 'unknown'} ts=${event.ts}`,
  );

  // Skip bot messages to prevent loops
  if (event.bot_id || event.subtype === 'bot_message') {
    console.log('[events] skip bot message');
    return;
  }

  const urls = extractUrls(event.text || '');
  console.log(`[events] extracted urls=${urls.length}`);
  if (urls.length === 0) return;

  // Read and parse TechRadar canvas
  const tomlContent = await readCanvas(env.SLACK_BOT_TOKEN, event.channel, CANVAS_NAME);
  console.log(`[events] canvas text length=${tomlContent?.length ?? 0}`);
  if (!tomlContent) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      '⚠️ TechRadar canvas not found. Run `/tech-radar-setup` for instructions.',
    );
    return;
  }

  let systemPrompt: string;
  try {
    const config = parseRadarConfig(tomlContent);
    console.log(
      `[events] parsed config auto_summary=${config.features.auto_summary} digest=${config.features.digest} sources=${config.digest.source.length}`,
    );
    if (!config.features.auto_summary) return;
    systemPrompt = buildSystemPrompt(config);
    console.log(`[events] system prompt length=${systemPrompt.length}`);
  } catch (err) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      `⚠️ Could not parse TechRadar canvas: ${String(err)}. Fix the canvas and try again.`,
    );
    return;
  }

  for (const url of urls) {
    try {
      const urlStart = Date.now();
      console.log(`[events] processing url=${url}`);
      const markdown = await fetchMarkdown(url, env);
      if (!markdown || markdown.length < 100) continue;
      console.log(`[events] fetched markdown len=${markdown.length}`);

      const content = truncateMarkdown(markdown, 15000);
      console.log(`[events] truncated markdown len=${content.length}`);
      const userMessage = event.text
        ? `Summarize this article:\n\n<article>\n${content}\n</article>\n\nUser's note: ${event.text}`
        : `Summarize this article:\n\n<article>\n${content}\n</article>`;

      const summary = await callClaude(
        env.ANTHROPIC_API_KEY,
        env.CLAUDE_MODEL_SUMMARIZE || 'claude-haiku-4-5-20251001',
        systemPrompt,
        userMessage,
        1024,
      );
      console.log(`[events] summary length=${summary.length}`);

      // Prepend intro line with article title link and poster
      const title = extractTitle(markdown) || url;
      const poster = event.user ? `<@${event.user}>` : 'someone';
      const noteText = event.text
        ? event.text.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').trim()
        : '';
      let intro = `${poster} shares <${url}|${title}>`;
      if (noteText) intro += `\nand says: ${noteText}`;
      intro += '\n\n';

      await postMessage(env.SLACK_BOT_TOKEN, event.channel, intro + summary);
      console.log(`[events] posted summary url=${url} durationMs=${Date.now() - urlStart}`);
    } catch (err) {
      console.error(`Error processing ${url}:`, err);
    }
  }

  console.log(`[events] processMessageEvent done durationMs=${Date.now() - startedAt}`);
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export async function postSetupInstructions(channelId: string, env: Env): Promise<void> {
  const text = [
    '👋 *Tech Radar Bot is here!*',
    '',
    'To get started, create a `TechRadar` canvas in this channel:',
    '1. Click the *+* tab at the top of the channel → select *Canvas*',
    '2. Title it exactly: `TechRadar` (case-sensitive)',
    '3. Paste your TOML config — run `/tech-radar-setup` to see the template',
    '',
    "Once the canvas is ready, just post any URL and I'll summarize it for your team. 🚀",
  ].join('\n');

  await postMessage(env.SLACK_BOT_TOKEN, channelId, text);
}

export { FALLBACK_PROMPT };
