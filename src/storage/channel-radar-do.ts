import type { ArticleScoreResult, Env, StoredArticleRecord } from '../types.js';
import { normalizeUrl } from '../utils/normalize.js';

interface ReservePayload {
  channel_id: string;
  source_url: string;
  source_label: string;
  url: string;
}

interface StoreFetchedPayload {
  article_id: string;
  title: string;
  markdown: string;
  content_hash: string;
}

interface StoreScoredPayload {
  article_id: string;
  score: ArticleScoreResult;
}

interface MarkFailedPayload {
  article_id: string;
  stage: 'fetch' | 'score';
  error: string;
}

interface TopDigestPayload {
  top_n: number;
  lookback_hours: number;
}

interface SyncStatsPayload {
  discovered: number;
  reserved: number;
  enqueued?: number;
  fetched: number;
  scored: number;
  failed_fetch: number;
  failed_score: number;
  skipped_duplicate: number;
  stopped_early?: boolean;
  stop_reason?: string;
  claimed?: number;
  requeued?: number;
  processed?: number;
}

interface SourceStatePayload {
  source_url: string;
  source_label: string;
  discovered_count: number;
  reserved_count: number;
}

interface QueueItem {
  article_id: string;
  due_at_ms: number;
  attempts: number;
  enqueued_at: string;
}

interface EnqueuePayload {
  article_id: string;
  due_at_ms?: number;
  attempts?: number;
}

interface ClaimPayload {
  limit: number;
  now_ms?: number;
}

interface RequeuePayload {
  article_id: string;
  attempts: number;
  delay_ms: number;
}

function jsonResponse(payload: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function startsWithPrefix(value: string, prefix: string): boolean {
  return value.slice(0, prefix.length) === prefix;
}

export class ChannelRadarDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  private writeEvent(event: string, record: Record<string, unknown>): void {
    if (!this.env.ANALYTICS) return;
    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: [record.channel_id as string, event],
        doubles: [Date.now()],
        blobs: [JSON.stringify(record).slice(0, 512)],
      });
    } catch (err) {
      console.warn('[do] analytics write failed', err);
    }
  }

  private async getArticle(articleId: string): Promise<StoredArticleRecord | null> {
    const item = await this.state.storage.get<StoredArticleRecord>(`article:${articleId}`);
    return item || null;
  }

  private async putArticle(article: StoredArticleRecord): Promise<void> {
    article.updated_at = nowIso();
    await this.state.storage.put(`article:${article.id}`, article);
  }

  private queueByArticleKey(articleId: string): string {
    return `queue:article:${articleId}`;
  }

  private queueItemKey(dueAtMs: number, articleId: string): string {
    const due = String(Math.max(0, Math.floor(dueAtMs))).padStart(13, '0');
    const suffix = crypto.randomUUID().slice(0, 8);
    return `queue:item:${due}:${articleId}:${suffix}`;
  }

  private async reserve(payload: ReservePayload): Promise<Response> {
    const normalized = normalizeUrl(payload.url);
    const existingId = await this.state.storage.get<string>(`url:${normalized}`);
    if (existingId) {
      const existing = await this.getArticle(existingId);
      return jsonResponse({
        status: 'existing',
        article_id: existingId,
        article: existing,
      });
    }

    const id = crypto.randomUUID();
    const now = nowIso();
    const article: StoredArticleRecord = {
      id,
      channel_id: payload.channel_id,
      source_url: payload.source_url,
      source_label: payload.source_label,
      url: payload.url,
      normalized_url: normalized,
      title: '',
      markdown: '',
      status: 'reserved',
      discovered_at: now,
      updated_at: now,
    };

    await this.putArticle(article);
    await this.state.storage.put(`url:${normalized}`, id);

    this.writeEvent('reserved', {
      channel_id: payload.channel_id,
      article_id: id,
      normalized_url: normalized,
      source_url: payload.source_url,
    });

    return jsonResponse({ status: 'new', article_id: id });
  }

  private async enqueue(payload: EnqueuePayload): Promise<Response> {
    const article = await this.getArticle(payload.article_id);
    if (!article) return jsonResponse({ error: 'article_not_found' }, 404);

    if (article.status === 'scored' || article.status === 'duplicate') {
      return jsonResponse({ status: 'not_needed' });
    }

    const pointerKey = this.queueByArticleKey(article.id);
    const existingQueueKey = await this.state.storage.get<string>(pointerKey);
    if (existingQueueKey) {
      return jsonResponse({ status: 'already_queued' });
    }

    const dueAtMs = Math.max(Date.now(), payload.due_at_ms || Date.now());
    const attempts = Math.max(0, payload.attempts || 0);
    const queueKey = this.queueItemKey(dueAtMs, article.id);
    const item: QueueItem = {
      article_id: article.id,
      due_at_ms: dueAtMs,
      attempts,
      enqueued_at: nowIso(),
    };

    await this.state.storage.put(queueKey, item);
    await this.state.storage.put(pointerKey, queueKey);

    this.writeEvent('enqueued', {
      channel_id: article.channel_id,
      article_id: article.id,
      due_at_ms: dueAtMs,
      attempts,
    });

    return jsonResponse({ status: 'queued', due_at_ms: dueAtMs, attempts });
  }

  private async claim(payload: ClaimPayload): Promise<Response> {
    const nowMs = Math.max(0, Math.floor(payload.now_ms || Date.now()));
    const limit = Math.max(1, Math.min(payload.limit || 1, 50));

    const queued = await this.state.storage.list<QueueItem>({ prefix: 'queue:item:' });
    const items: Array<{
      article_id: string;
      url: string;
      source_url: string;
      source_label: string;
      attempts: number;
      due_at_ms: number;
    }> = [];

    for (const [queueKey, queuedItem] of queued.entries()) {
      if (items.length >= limit) break;
      if (!queuedItem || queuedItem.due_at_ms > nowMs) continue;

      await this.state.storage.delete(queueKey);
      await this.state.storage.delete(this.queueByArticleKey(queuedItem.article_id));

      const article = await this.getArticle(queuedItem.article_id);
      if (!article) continue;
      if (article.status === 'scored' || article.status === 'duplicate') continue;

      items.push({
        article_id: article.id,
        url: article.url,
        source_url: article.source_url,
        source_label: article.source_label,
        attempts: queuedItem.attempts,
        due_at_ms: queuedItem.due_at_ms,
      });
    }

    return jsonResponse({ items });
  }

  private async requeue(payload: RequeuePayload): Promise<Response> {
    const delayMs = Math.max(1000, Math.min(payload.delay_ms, 60 * 60 * 1000));
    return this.enqueue({
      article_id: payload.article_id,
      attempts: payload.attempts,
      due_at_ms: Date.now() + delayMs,
    });
  }

  private async storeFetched(payload: StoreFetchedPayload): Promise<Response> {
    const article = await this.getArticle(payload.article_id);
    if (!article) return jsonResponse({ error: 'article_not_found' }, 404);

    const existingByHash = payload.content_hash
      ? await this.state.storage.get<string>(`hash:${payload.content_hash}`)
      : null;
    if (existingByHash && existingByHash !== article.id) {
      article.status = 'duplicate';
      article.duplicate_of = existingByHash;
      article.error = 'duplicate_content';
      article.fetched_at = nowIso();
      await this.putArticle(article);
      this.writeEvent('duplicate', {
        channel_id: article.channel_id,
        article_id: article.id,
        duplicate_of: existingByHash,
      });
      return jsonResponse({ status: 'duplicate', duplicate_of: existingByHash });
    }

    if (payload.content_hash) {
      await this.state.storage.put(`hash:${payload.content_hash}`, article.id);
      article.content_hash = payload.content_hash;
    }

    article.title = payload.title;
    article.markdown = payload.markdown;
    article.fetched_at = nowIso();
    article.status = 'fetched';
    article.error = undefined;
    await this.putArticle(article);

    this.writeEvent('fetched', {
      channel_id: article.channel_id,
      article_id: article.id,
      markdown_len: payload.markdown.length,
    });

    return jsonResponse({ status: 'stored' });
  }

  private async storeScored(payload: StoreScoredPayload): Promise<Response> {
    const article = await this.getArticle(payload.article_id);
    if (!article) return jsonResponse({ error: 'article_not_found' }, 404);

    article.status = 'scored';
    article.scored_at = nowIso();
    article.overall_score = payload.score.overall_score;
    article.average_relevance = payload.score.average_relevance;
    article.summary = payload.score.summary;
    article.adoption_path = payload.score.adoption_path;
    article.dimension_scores = payload.score.dimension_scores;
    article.error = undefined;
    await this.putArticle(article);

    this.writeEvent('scored', {
      channel_id: article.channel_id,
      article_id: article.id,
      overall_score: payload.score.overall_score,
      average_relevance: payload.score.average_relevance,
    });

    return jsonResponse({ status: 'scored' });
  }

  private async markFailed(payload: MarkFailedPayload): Promise<Response> {
    const article = await this.getArticle(payload.article_id);
    if (!article) return jsonResponse({ error: 'article_not_found' }, 404);

    article.status = payload.stage === 'fetch' ? 'failed_fetch' : 'failed_score';
    article.error = payload.error.slice(0, 500);
    await this.putArticle(article);

    this.writeEvent(payload.stage === 'fetch' ? 'failed_fetch' : 'failed_score', {
      channel_id: article.channel_id,
      article_id: article.id,
      error: article.error,
    });

    return jsonResponse({ status: 'failed' });
  }

  private async getTopDigest(payload: TopDigestPayload): Promise<Response> {
    const now = Date.now();
    const lookbackMs = Math.max(1, payload.lookback_hours) * 60 * 60 * 1000;
    const minTs = now - lookbackMs;
    const topN = Math.max(1, Math.min(payload.top_n, 20));

    const all = await this.state.storage.list<StoredArticleRecord>({ prefix: 'article:' });
    const rows = [...all.values()]
      .filter((article) => article.status === 'scored' && article.scored_at)
      .filter((article) => new Date(article.scored_at || 0).getTime() >= minTs)
      .sort((a, b) => {
        const scoreDelta = (b.overall_score || 0) - (a.overall_score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return new Date(b.scored_at || 0).getTime() - new Date(a.scored_at || 0).getTime();
      })
      .slice(0, topN);

    return jsonResponse({ items: rows });
  }

  private async debugState(): Promise<Response> {
    const all = await this.state.storage.list<StoredArticleRecord>({ prefix: 'article:' });
    const counts: Record<string, number> = {};
    for (const article of all.values()) {
      counts[article.status] = (counts[article.status] || 0) + 1;
    }

    const recentFailed = [...all.values()]
      .filter((article) => startsWithPrefix(article.status, 'failed'))
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      .slice(0, 5)
      .map((article) => ({
        id: article.id,
        url: article.url,
        status: article.status,
        error: article.error || '',
      }));

    const lastSyncAt = (await this.state.storage.get<string>('meta:last_sync_at')) || null;
    const lastSyncStats =
      (await this.state.storage.get<Record<string, unknown>>('meta:last_sync_stats')) || null;

    const queue = await this.state.storage.list<QueueItem>({ prefix: 'queue:item:' });
    const now = Date.now();
    let ready = 0;
    for (const item of queue.values()) {
      if (item.due_at_ms <= now) ready += 1;
    }

    return jsonResponse({
      counts,
      total: all.size,
      queue: {
        total: queue.size,
        ready,
      },
      last_sync_at: lastSyncAt,
      last_sync_stats: lastSyncStats,
      recent_failed: recentFailed,
    });
  }

  private async storeSyncStats(payload: SyncStatsPayload): Promise<Response> {
    await this.state.storage.put('meta:last_sync_at', nowIso());
    await this.state.storage.put('meta:last_sync_stats', payload);
    return jsonResponse({ ok: true });
  }

  private async storeSourceState(payload: SourceStatePayload): Promise<Response> {
    const key = `source:${normalizeUrl(payload.source_url)}`;
    await this.state.storage.put(key, {
      source_url: payload.source_url,
      source_label: payload.source_label,
      discovered_count: payload.discovered_count,
      reserved_count: payload.reserved_count,
      synced_at: nowIso(),
    });
    return jsonResponse({ ok: true });
  }

  private async cleanup(retentionDays: number): Promise<Response> {
    const now = Date.now();
    const threshold = now - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;

    const all = await this.state.storage.list<StoredArticleRecord>({ prefix: 'article:' });
    let deleted = 0;
    for (const [key, article] of all.entries()) {
      const ts = new Date(article.updated_at).getTime();
      if (Number.isNaN(ts) || ts >= threshold) continue;

      await this.state.storage.delete(key);
      await this.state.storage.delete(`url:${article.normalized_url}`);
      const queuePointerKey = this.queueByArticleKey(article.id);
      const queueItemKey = await this.state.storage.get<string>(queuePointerKey);
      if (queueItemKey) {
        await this.state.storage.delete(queueItemKey);
        await this.state.storage.delete(queuePointerKey);
      }
      if (article.content_hash) {
        const owner = await this.state.storage.get<string>(`hash:${article.content_hash}`);
        if (owner === article.id) {
          await this.state.storage.delete(`hash:${article.content_hash}`);
        }
      }
      deleted += 1;
    }

    return jsonResponse({ deleted });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    try {
      if (request.method === 'POST' && path === '/reserve') {
        const payload: ReservePayload = await request.json();
        return this.reserve(payload);
      }

      if (request.method === 'POST' && path === '/enqueue') {
        const payload: EnqueuePayload = await request.json();
        return this.enqueue(payload);
      }

      if (request.method === 'POST' && path === '/claim') {
        const payload: ClaimPayload = await request.json();
        return this.claim(payload);
      }

      if (request.method === 'POST' && path === '/requeue') {
        const payload: RequeuePayload = await request.json();
        return this.requeue(payload);
      }

      if (request.method === 'POST' && path === '/store-fetched') {
        const payload: StoreFetchedPayload = await request.json();
        return this.storeFetched(payload);
      }

      if (request.method === 'POST' && path === '/store-scored') {
        const payload: StoreScoredPayload = await request.json();
        return this.storeScored(payload);
      }

      if (request.method === 'POST' && path === '/mark-failed') {
        const payload: MarkFailedPayload = await request.json();
        return this.markFailed(payload);
      }

      if (request.method === 'POST' && path === '/top-digest') {
        const payload: TopDigestPayload = await request.json();
        return this.getTopDigest(payload);
      }

      if (request.method === 'GET' && path === '/debug') {
        return this.debugState();
      }

      if (request.method === 'POST' && path === '/sync-stats') {
        const payload: SyncStatsPayload = await request.json();
        return this.storeSyncStats(payload);
      }

      if (request.method === 'POST' && path === '/source-state') {
        const payload: SourceStatePayload = await request.json();
        return this.storeSourceState(payload);
      }

      if (request.method === 'POST' && path === '/cleanup') {
        const payload: { retention_days: number } = await request.json();
        return this.cleanup(payload.retention_days);
      }
    } catch (err) {
      console.error('[do] request failed', err);
      return jsonResponse({ error: String(err) }, 500);
    }

    return jsonResponse({ error: 'not_found' }, 404);
  }
}
