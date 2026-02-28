import type { ArticleScoreResult, Env, ScoreDimension } from '../types.js';
import type { RadarConfig } from './config.js';
import { callClaude } from './claude.js';

interface RawScoreResponse {
  overall_score?: number;
  summary?: string;
  adoption_path?: string;
  dimension_scores?: Array<{
    name?: string;
    score?: number;
    reason?: string;
  }>;
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDimensions(
  raw: RawScoreResponse['dimension_scores'],
  fallbackNames: string[],
): ScoreDimension[] {
  const map = new Map<string, ScoreDimension>();
  for (const item of raw || []) {
    const name = (item.name || '').trim();
    if (!name) continue;
    map.set(name, {
      name,
      score: clampScore(Number(item.score ?? 0)),
      reason: (item.reason || '').trim(),
    });
  }

  const dimensions: ScoreDimension[] = [];
  for (const name of fallbackNames) {
    const dim = map.get(name) || { name, score: 0, reason: '' };
    dimensions.push(dim);
  }
  return dimensions;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export async function scoreArticleForDigest(
  env: Env,
  config: RadarConfig,
  url: string,
  markdown: string,
): Promise<ArticleScoreResult> {
  const dimensionNames = config.relevance.map((r) => r.name).filter(Boolean);
  const dimensionsHint =
    dimensionNames.length > 0
      ? dimensionNames.map((name) => `- ${name}`).join('\n')
      : '- Tech Relevance';

  const systemPrompt = [
    'You score article relevance for a tech radar digest.',
    'Return JSON only. No markdown.',
    'Scores are integers from 0 to 100.',
    'JSON schema:',
    '{',
    '  "overall_score": number,',
    '  "summary": string,',
    '  "adoption_path": string,',
    '  "dimension_scores": [{"name": string, "score": number, "reason": string}]',
    '}',
  ].join('\n');

  const userPrompt = [
    `Source URL: ${url}`,
    '',
    'Team context:',
    JSON.stringify(config.context),
    '',
    'Tech stack:',
    JSON.stringify(config.tech_stack),
    '',
    'Relevance dimensions to score:',
    dimensionsHint,
    '',
    'Article markdown:',
    '<article>',
    markdown,
    '</article>',
    '',
    'Respond with valid JSON only.',
  ].join('\n');

  const response = await callClaude(
    env.ANTHROPIC_API_KEY,
    env.CLAUDE_MODEL_DIGEST || env.CLAUDE_MODEL_SUMMARIZE || 'claude-haiku-4-5-20251001',
    systemPrompt,
    userPrompt,
    900,
  );

  let parsed: RawScoreResponse;
  try {
    parsed = JSON.parse(extractJsonObject(response)) as RawScoreResponse;
  } catch (err) {
    throw new Error(`Score JSON parse error: ${String(err)}`);
  }

  const dimensions = normalizeDimensions(parsed.dimension_scores, dimensionNames);
  const averageRelevance = average(dimensions.map((d) => d.score));
  const overall = clampScore(Number(parsed.overall_score ?? averageRelevance));

  return {
    overall_score: overall,
    average_relevance: averageRelevance,
    summary: (parsed.summary || '').trim(),
    adoption_path: (parsed.adoption_path || '').trim(),
    dimension_scores: dimensions,
  };
}
