import type { Env } from '../types.js';
import { readCanvas } from '../slack/canvas.js';
import { postMessage } from '../slack/post.js';
import { CANVAS_NAME, parseRadarConfig } from '../services/config.js';
import { getTopDigestArticles, runSyncForAllChannels } from './pipeline.js';

interface DigestRunOptions {
  force?: boolean;
}

function getLookbackHours(env: Env): number {
  const parsed = Number(env.INGEST_WINDOW_HOURS || 24);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(168, Math.floor(parsed)));
}

function toScore(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function priorityFromScore(score: number): string {
  if (score >= 75) return '🟢 High — Strong recommendation';
  if (score >= 50) return '🟡 Medium — Worth evaluating';
  return '⚪ Low — Keep on radar';
}

function buildDigestMessage(items: Awaited<ReturnType<typeof getTopDigestArticles>>): string {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const overallScore = toScore(item.overall_score);
    const averageRelevance = toScore(item.average_relevance);
    const score = overallScore ?? averageRelevance ?? 0;
    const dimensions = (item.dimension_scores || [])
      .map((d) => `${d.name}: ${d.score}/100`)
      .join(' | ');

    lines.push(
      `${i + 1}. <${item.url}|${item.title || item.url}>`,
      `*Relevance Score (overall):* ${score}/100`,
      averageRelevance !== null ? `*Average Relevance (dimensions):* ${averageRelevance}/100` : '',
      `*Priority:* ${priorityFromScore(score)}`,
      dimensions ? `*Dimension Breakdown:* ${dimensions}` : '',
      item.summary ? `*Summary:* ${item.summary}` : '',
      item.adoption_path ? `*Adoption Path:* ${item.adoption_path}` : '',
      `*Source Feed:* ${item.source_label || item.source_url}`,
      '',
    );
  }
  return lines.join('\n').trim();
}

// Scheduled entry now performs incremental ingest/sync only.
export async function runAllDigests(env: Env): Promise<void> {
  await runSyncForAllChannels(env);
}

export async function runDailyDigest(
  env: Env,
  channelId: string,
  options: DigestRunOptions = {},
): Promise<void> {
  const canvas = await readCanvas(env.SLACK_BOT_TOKEN, channelId, CANVAS_NAME);
  if (!canvas) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channelId,
      '⚠️ TechRadar canvas not found. Run `/tech-radar-setup` for instructions.',
    );
    return;
  }

  let config;
  try {
    config = parseRadarConfig(canvas);
  } catch (err) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channelId,
      `⚠️ Could not parse TechRadar canvas: ${String(err)}. Fix the canvas and try again.`,
    );
    return;
  }

  if (!options.force && !config.features.digest) return;

  const lookbackHours = getLookbackHours(env);
  const items = await getTopDigestArticles(env, channelId, config.digest.top_n, lookbackHours);

  if (items.length === 0) {
    await postMessage(
      env.SLACK_BOT_TOKEN,
      channelId,
      `⚠️ No scored articles available in the last ${lookbackHours} hour(s). Run \`/tech-radar-sync\` first.`,
    );
    return;
  }

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const body = buildDigestMessage(items);
  await postMessage(env.SLACK_BOT_TOKEN, channelId, `📡 *Tech Radar — ${today}*\n\n${body}`);
}
