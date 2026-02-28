export interface Env {
  // Vars (wrangler.toml)
  CLAUDE_MODEL_SUMMARIZE: string;
  CLAUDE_MODEL_DIGEST: string;
  INGEST_WINDOW_HOURS?: string;
  INGEST_MAX_SOURCE_LINKS?: string;
  INGEST_MAX_NEW_ARTICLES?: string;
  ARTICLE_RETENTION_DAYS?: string;
  // Channel is always taken from event context

  // Secrets
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ANTHROPIC_API_KEY: string;

  // Optional KV
  CACHE?: KVNamespace;

  // Persistent state and analytics
  CHANNEL_RADAR_DO: DurableObjectNamespace;
  ANALYTICS?: AnalyticsEngineDataset;
}

export interface SlackMessageEvent {
  type: string;
  channel: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  ts: string;
}

export interface SlackEventPayload {
  type: string;
  challenge?: string;
  event?: SlackMessageEvent & {
    type: string;
    user?: string;
    channel?: string;
  };
  authorizations?: Array<{ user_id: string; is_bot: boolean }>;
}

export interface ScoreDimension {
  name: string;
  score: number;
  reason: string;
}

export interface ArticleScoreResult {
  overall_score: number;
  average_relevance: number;
  summary: string;
  adoption_path: string;
  dimension_scores: ScoreDimension[];
}

export type ArticleStatus =
  | 'reserved'
  | 'fetched'
  | 'scored'
  | 'failed_fetch'
  | 'failed_score'
  | 'duplicate';

export interface StoredArticleRecord {
  id: string;
  channel_id: string;
  source_url: string;
  source_label: string;
  url: string;
  normalized_url: string;
  title: string;
  markdown: string;
  content_hash?: string;
  status: ArticleStatus;
  discovered_at: string;
  fetched_at?: string;
  scored_at?: string;
  updated_at: string;
  error?: string;
  duplicate_of?: string;
  overall_score?: number;
  average_relevance?: number;
  summary?: string;
  adoption_path?: string;
  dimension_scores?: ScoreDimension[];
}
