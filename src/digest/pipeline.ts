import type { Env, StoredArticleRecord } from '../types.js';
import { CANVAS_NAME, parseRadarConfig } from '../services/config.js';
import type { RadarConfig } from '../services/config.js';
import { readCanvas } from '../slack/canvas.js';
import { discoverSourceArticleUrls } from '../services/discovery.js';
import { fetchMarkdownWithMeta } from '../services/browser.js';
import { truncateMarkdown } from '../utils/truncate.js';
import { scoreArticleForDigest } from '../services/scoring.js';
import { sha256Hex } from '../utils/hash.js';
import { listBotChannels } from '../services/sources.js';

interface ReserveResponse {
  status: 'new' | 'existing';
  article_id: string;
}

interface EnqueueResponse {
  status: 'queued' | 'already_queued' | 'not_needed';
}

interface ClaimResponse {
  items: Array<{
    article_id: string;
    url: string;
    source_url: string;
    source_label: string;
    attempts: number;
    due_at_ms: number;
  }>;
}

interface StoreFetchedResponse {
  status: 'stored' | 'duplicate';
  duplicate_of?: string;
}

interface TopDigestResponse {
  items: StoredArticleRecord[];
}

export interface SyncRunStats {
  discovered: number;
  reserved: number;
  enqueued: number;
  fetched: number;
  scored: number;
  failed_fetch: number;
  failed_score: number;
  skipped_duplicate: number;
  stopped_early?: boolean;
  stop_reason?: string;
}

export interface ProcessRunStats {
  claimed: number;
  fetched: number;
  scored: number;
  failed_fetch: number;
  failed_score: number;
  skipped_duplicate: number;
  requeued: number;
  stopped_early?: boolean;
  stop_reason?: string;
}

interface ChannelSyncOptions {
  force?: boolean;
  maxNewArticles?: number;
  maxSources?: number;
  timeBudgetMs?: number;
}

interface ChannelProcessOptions {
  maxItems?: number;
  maxAttempts?: number;
  timeBudgetMs?: number;
}

function doStub(env: Env, channelId: string): DurableObjectStub {
  const id = env.CHANNEL_RADAR_DO.idFromName(channelId);
  return env.CHANNEL_RADAR_DO.get(id);
}

async function callDo<T>(
  env: Env,
  channelId: string,
  path: string,
  method: 'GET' | 'POST',
  payload?: unknown,
): Promise<T> {
  const stub = doStub(env, channelId);
  const resp = await stub.fetch(`https://channel-radar${path}`, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!resp.ok) {
    throw new Error(`DO ${path} failed: ${resp.status}`);
  }
  return (await resp.json()) as T;
}

function getConfigNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function extractTitle(markdown: string, fallbackUrl: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallbackUrl;
}

function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt));
}

async function loadChannelConfig(env: Env, channelId: string): Promise<RadarConfig> {
  const canvas = await readCanvas(env.SLACK_BOT_TOKEN, channelId, CANVAS_NAME);
  if (!canvas) {
    throw new Error('TechRadar canvas not found or TOML block could not be extracted');
  }
  return parseRadarConfig(canvas);
}

function isDeadlineExceeded(deadlineMs: number | null): boolean {
  return deadlineMs !== null && Date.now() >= deadlineMs;
}

export async function runChannelSync(
  env: Env,
  channelId: string,
  options: ChannelSyncOptions = {},
): Promise<SyncRunStats> {
  console.log(`[sync] discovery start channel=${channelId}`);
  const config = await loadChannelConfig(env, channelId);
  if (!options.force && !config.features.digest) {
    return {
      discovered: 0,
      reserved: 0,
      enqueued: 0,
      fetched: 0,
      scored: 0,
      failed_fetch: 0,
      failed_score: 0,
      skipped_duplicate: 0,
    };
  }

  const maxLinksPerSource = getConfigNumber(env.INGEST_MAX_SOURCE_LINKS, 20, 1, 100);
  const configuredMaxNewArticles = getConfigNumber(env.INGEST_MAX_NEW_ARTICLES, 25, 1, 100);
  const maxNewArticles = options.maxNewArticles
    ? Math.max(1, Math.min(configuredMaxNewArticles, options.maxNewArticles))
    : configuredMaxNewArticles;
  const maxSources = options.maxSources
    ? Math.max(1, Math.min(config.digest.source.length || 1, options.maxSources))
    : config.digest.source.length;
  const retentionDays = getConfigNumber(env.ARTICLE_RETENTION_DAYS, 7, 1, 30);
  const deadlineMs =
    options.timeBudgetMs && options.timeBudgetMs > 0 ? Date.now() + options.timeBudgetMs : null;

  const stats: SyncRunStats = {
    discovered: 0,
    reserved: 0,
    enqueued: 0,
    fetched: 0,
    scored: 0,
    failed_fetch: 0,
    failed_score: 0,
    skipped_duplicate: 0,
  };

  let processedNew = 0;
  let processedSources = 0;
  let stopReason: string | null = null;

  for (const source of config.digest.source) {
    if (processedSources >= maxSources) {
      stopReason = stopReason || 'source_cap';
      break;
    }
    if (processedNew >= maxNewArticles) {
      stopReason = stopReason || 'article_cap';
      break;
    }
    if (isDeadlineExceeded(deadlineMs)) {
      stopReason = stopReason || 'time_budget';
      break;
    }

    const candidates = await discoverSourceArticleUrls(source.url, env, maxLinksPerSource);
    stats.discovered += candidates.length;
    let sourceReserved = 0;

    for (const candidate of candidates) {
      if (processedNew >= maxNewArticles) {
        stopReason = stopReason || 'article_cap';
        break;
      }
      if (isDeadlineExceeded(deadlineMs)) {
        stopReason = stopReason || 'time_budget';
        break;
      }

      const reserve = await callDo<ReserveResponse>(env, channelId, '/reserve', 'POST', {
        channel_id: channelId,
        source_url: source.url,
        source_label: source.label,
        url: candidate,
      });

      if (reserve.status !== 'new') continue;

      sourceReserved += 1;
      stats.reserved += 1;
      processedNew += 1;

      const enqueue = await callDo<EnqueueResponse>(env, channelId, '/enqueue', 'POST', {
        article_id: reserve.article_id,
      });
      if (enqueue.status === 'queued') {
        stats.enqueued += 1;
      }
    }

    await callDo(env, channelId, '/source-state', 'POST', {
      source_url: source.url,
      source_label: source.label,
      discovered_count: candidates.length,
      reserved_count: sourceReserved,
    });

    processedSources += 1;
  }

  if (stopReason) {
    stats.stopped_early = true;
    stats.stop_reason = stopReason;
  }

  await callDo(env, channelId, '/sync-stats', 'POST', stats);
  await callDo(env, channelId, '/cleanup', 'POST', { retention_days: retentionDays });
  console.log(
    `[sync] discovery done channel=${channelId} discovered=${stats.discovered} reserved=${stats.reserved} enqueued=${stats.enqueued} stopped=${stats.stopped_early ? stats.stop_reason : 'no'}`,
  );
  return stats;
}

export async function processChannelInbox(
  env: Env,
  channelId: string,
  options: ChannelProcessOptions = {},
): Promise<ProcessRunStats> {
  console.log(`[sync] inbox start channel=${channelId}`);
  const config = await loadChannelConfig(env, channelId);
  const maxItems = Math.max(1, Math.min(options.maxItems || 4, 25));
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts || 3, 10));
  const deadlineMs =
    options.timeBudgetMs && options.timeBudgetMs > 0 ? Date.now() + options.timeBudgetMs : null;

  const stats: ProcessRunStats = {
    claimed: 0,
    fetched: 0,
    scored: 0,
    failed_fetch: 0,
    failed_score: 0,
    skipped_duplicate: 0,
    requeued: 0,
  };

  const claim = await callDo<ClaimResponse>(env, channelId, '/claim', 'POST', {
    limit: maxItems,
    now_ms: Date.now(),
  });

  stats.claimed = claim.items.length;
  console.log(`[sync] inbox claimed channel=${channelId} count=${stats.claimed}`);
  for (let i = 0; i < claim.items.length; i += 1) {
    const item = claim.items[i];

    if (isDeadlineExceeded(deadlineMs)) {
      stats.stopped_early = true;
      stats.stop_reason = 'time_budget';
      // Requeue the current and remaining items so nothing is lost.
      for (let j = i; j < claim.items.length; j += 1) {
        const pending = claim.items[j];
        await callDo(env, channelId, '/requeue', 'POST', {
          article_id: pending.article_id,
          attempts: pending.attempts,
          delay_ms: 1000,
        });
        stats.requeued += 1;
      }
      console.log(`[sync] inbox stopped early channel=${channelId} reason=time_budget`);
      break;
    }

    const fetched = await fetchMarkdownWithMeta(item.url, env);
    if (!fetched.markdown || fetched.markdown.length < 100) {
      stats.failed_fetch += 1;
      await callDo(env, channelId, '/mark-failed', 'POST', {
        article_id: item.article_id,
        stage: 'fetch',
        error: fetched.status
          ? `fetch_${fetched.reason}_${fetched.status}`
          : `fetch_${fetched.reason}`,
      });

      const nextAttempt = item.attempts + 1;
      if (fetched.retryable && nextAttempt < maxAttempts) {
        await callDo(env, channelId, '/requeue', 'POST', {
          article_id: item.article_id,
          attempts: nextAttempt,
          delay_ms: retryDelayMs(nextAttempt),
        });
        stats.requeued += 1;
        console.log(
          `[sync] inbox requeue fetch channel=${channelId} article=${item.article_id} attempt=${nextAttempt} reason=${fetched.reason} status=${fetched.status ?? 0}`,
        );
      }
      continue;
    }

    const articleMarkdown = truncateMarkdown(fetched.markdown, 12000);
    const title = extractTitle(fetched.markdown, item.url);
    const contentHash = await sha256Hex(`${title}\n${articleMarkdown.slice(0, 2000)}`);

    const stored = await callDo<StoreFetchedResponse>(env, channelId, '/store-fetched', 'POST', {
      article_id: item.article_id,
      title,
      markdown: articleMarkdown,
      content_hash: contentHash,
    });

    if (stored.status === 'duplicate') {
      stats.skipped_duplicate += 1;
      continue;
    }

    stats.fetched += 1;

    try {
      const score = await scoreArticleForDigest(env, config, item.url, articleMarkdown);
      await callDo(env, channelId, '/store-scored', 'POST', {
        article_id: item.article_id,
        score,
      });
      stats.scored += 1;
    } catch (err) {
      stats.failed_score += 1;
      await callDo(env, channelId, '/mark-failed', 'POST', {
        article_id: item.article_id,
        stage: 'score',
        error: String(err),
      });

      const nextAttempt = item.attempts + 1;
      if (nextAttempt < maxAttempts) {
        await callDo(env, channelId, '/requeue', 'POST', {
          article_id: item.article_id,
          attempts: nextAttempt,
          delay_ms: retryDelayMs(nextAttempt),
        });
        stats.requeued += 1;
        console.log(
          `[sync] inbox requeue score channel=${channelId} article=${item.article_id} attempt=${nextAttempt}`,
        );
      }
    }
  }

  console.log(
    `[sync] inbox done channel=${channelId} claimed=${stats.claimed} fetched=${stats.fetched} scored=${stats.scored} failed_fetch=${stats.failed_fetch} failed_score=${stats.failed_score} requeued=${stats.requeued}`,
  );
  return stats;
}

export async function runSyncForAllChannels(env: Env): Promise<void> {
  const channels = await listBotChannels(env.SLACK_BOT_TOKEN);
  console.log(`[sync] scheduled start channels=${channels.length}`);

  for (const channelId of channels) {
    try {
      const discoverStats = await runChannelSync(env, channelId);
      const processStats = await processChannelInbox(env, channelId, {
        maxItems: 8,
        maxAttempts: 3,
        timeBudgetMs: 45_000,
      });
      console.log(
        `[sync] scheduled channel done id=${channelId} reserved=${discoverStats.reserved} enqueued=${discoverStats.enqueued} claimed=${processStats.claimed} scored=${processStats.scored}`,
      );
    } catch (err) {
      console.error(`[sync] channel failed id=${channelId}`, err);
    }
  }
  console.log('[sync] scheduled done');
}

export async function getTopDigestArticles(
  env: Env,
  channelId: string,
  topN: number,
  lookbackHours: number,
): Promise<StoredArticleRecord[]> {
  const response = await callDo<TopDigestResponse>(env, channelId, '/top-digest', 'POST', {
    top_n: topN,
    lookback_hours: lookbackHours,
  });
  return response.items;
}

export async function getChannelDebugState(
  env: Env,
  channelId: string,
): Promise<Record<string, unknown>> {
  return callDo<Record<string, unknown>>(env, channelId, '/debug', 'GET');
}
