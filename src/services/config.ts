import { parse } from 'smol-toml';

export const CANVAS_NAME = 'TechRadar';

export const FALLBACK_PROMPT = `You are a tech news analyst. Summarize articles concisely.
For each article provide:
📝 **Summary** — 2-3 sentences, what happened
🔧 **Tech Relevance** — ⭐⭐⭐✩✩ X/5, why this matters technically
🚀 **Adoption Path** — concrete next steps, or "Not applicable"

Be direct and technical.`;

export interface RadarConfig {
  context: Record<string, string>;
  tech_stack: Record<string, string>;
  features: {
    auto_summary: boolean;
    digest: boolean;
  };
  filter: {
    focus: string[];
    ignore: string[];
  };
  relevance: Array<{
    name: string;
    emoji: string;
    sentences: number;
    description: string;
  }>;
  adoption_path: {
    name: string;
    emoji: string;
    sentences: number;
    description: string;
  };
  output: {
    summary_sentences: number;
  };
  digest: {
    top_n: number;
    source: Array<{ url: string; label: string }>;
  };
}

function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:toml)?\n?/gim, '').replace(/^```\s*$/gim, '');
}

function looksLikeHtmlTagLine(line: string): boolean {
  const trimmed = line.trim();
  return /^<\/?[a-z][\w:-]*(\s|>|$)/i.test(trimmed);
}

function pushCandidate(candidates: string[], seen: Set<string>, candidate: string): void {
  const normalized = candidate.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  candidates.push(normalized);
}

function buildTomlCandidates(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const candidates: string[] = [];
  const seen = new Set<string>();

  // 1) Prefer explicitly fenced TOML blocks.
  const fencedToml = normalized.matchAll(/```toml\s*([\s\S]*?)```/gi);
  for (const match of fencedToml) {
    pushCandidate(candidates, seen, match[1]);
  }

  // 2) Fallback to any fenced code block.
  const fencedAny = normalized.matchAll(/```\s*([\s\S]*?)```/g);
  for (const match of fencedAny) {
    pushCandidate(candidates, seen, match[1]);
  }

  // 3) Legacy behavior: remove fences in-place.
  pushCandidate(candidates, seen, stripMarkdownFences(normalized));

  // 4) If mixed content, try from the first TOML table header and drop obvious HTML lines.
  const tableStart = normalized.search(/^\s*(\[\[[A-Za-z0-9_.-]+\]\]|\[[A-Za-z0-9_.-]+\])\s*$/m);
  if (tableStart >= 0) {
    const fromFirstTable = normalized
      .slice(tableStart)
      .split('\n')
      .filter((line) => !looksLikeHtmlTagLine(line))
      .join('\n');
    pushCandidate(candidates, seen, fromFirstTable);
  }

  return candidates;
}

function parseTomlWithFallback(content: string): Record<string, unknown> {
  const candidates = buildTomlCandidates(content);
  console.log(`[config] TOML parse candidates=${candidates.length}`);
  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    console.log(`[config] trying candidate[${i}] len=${candidate.length}`);
    try {
      const parsed = parse(candidate) as Record<string, unknown>;
      console.log(`[config] parsed candidate[${i}] successfully`);
      return parsed;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[config] candidate[${i}] parse failed: ${message}`);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}

function ensureTomlExists(content: string): void {
  if (!content.trim()) {
    throw new Error('TechRadar canvas is empty or does not contain TOML');
  }
}

function normalizeRelevance(raw: unknown[]): RadarConfig['relevance'] {
  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    const desc = r.description;
    return {
      name: (r.name as string) || '',
      emoji: (r.emoji as string) || '',
      sentences: (r.sentences as number) || 2,
      description: Array.isArray(desc) ? (desc as string[]).join('\n') : typeof desc === 'string' ? desc : '',
    };
  });
}

export function parseRadarConfig(toml: string): RadarConfig {
  console.log(`[config] parseRadarConfig inputLen=${toml.length}`);
  ensureTomlExists(toml);
  const raw = parseTomlWithFallback(toml);

  const get = <T>(obj: unknown, key: string, fallback: T): T => {
    if (obj && typeof obj === 'object' && key in obj) {
      return (obj as Record<string, unknown>)[key] as T;
    }
    return fallback;
  };

  const context = get<Record<string, string>>(raw, 'context', {});
  const tech_stack = get<Record<string, string>>(raw, 'tech_stack', {});
  const features = get<Record<string, unknown>>(raw, 'features', {});
  const filter = get<Record<string, unknown>>(raw, 'filter', {});
  const output = get<Record<string, unknown>>(raw, 'output', {});
  const digest = get<Record<string, unknown>>(raw, 'digest', {});
  const ap = get<Record<string, unknown>>(raw, 'adoption_path', {});

  const apDesc = ap.description;

  return {
    context: typeof context === 'object' ? context : {},
    tech_stack: typeof tech_stack === 'object' ? tech_stack : {},
    features: {
      auto_summary: get<boolean>(features, 'auto_summary', true),
      digest: get<boolean>(features, 'digest', true),
    },
    filter: {
      focus: get<string[]>(filter, 'focus', []),
      ignore: get<string[]>(filter, 'ignore', []),
    },
    relevance: normalizeRelevance(get<unknown[]>(raw, 'relevance', [])),
    adoption_path: {
      name: get<string>(ap, 'name', 'Adoption Path'),
      emoji: get<string>(ap, 'emoji', '🚀'),
      sentences: get<number>(ap, 'sentences', 4),
      description: Array.isArray(apDesc)
        ? (apDesc as string[]).join('\n')
        : typeof apDesc === 'string'
          ? apDesc
          : 'Can we try this now? What\'s the effort? Quick win or long-term investment?',
    },
    output: {
      summary_sentences: get<number>(output, 'summary_sentences', 3),
    },
    digest: {
      top_n: get<number>(digest, 'top_n', 5),
      source: get<RadarConfig['digest']['source']>(digest, 'source', []),
    },
  };
}

export function buildSystemPrompt(config: RadarConfig): string {
  const contextLines = Object.entries(config.context)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const stackLines = Object.entries(config.tech_stack)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const relevanceInstructions = config.relevance
    .map(
      (r) =>
        `- ${r.emoji} **${r.name}** — rate 1–5 using star emoji (⭐ for filled, ✩ for empty) ` +
        `followed by (X/5), all on ONE line. Then ${r.sentences} sentence(s) on the next line.\n` +
        `  Context: ${r.description}`,
    )
    .join('\n');

  const focusList = config.filter.focus.map((f) => `- ${f}`).join('\n');
  const ignoreList = config.filter.ignore.map((f) => `- ${f}`).join('\n');

  const ap = config.adoption_path;
  const adoptionSection =
    `\n${ap.emoji} **${ap.name}** — ${ap.sentences} sentence(s), no star rating.\n` +
    `  Context: ${ap.description}`;

  return `${contextLines}

## Our Tech Stack
${stackLines}

## What to Focus On
${focusList}

## Ignore
${ignoreList}

## Output Format
For each article:
📝 **Summary** — ${config.output.summary_sentences} sentences, what happened

Relevance dimensions (each dimension header must be a SINGLE line with emoji, bold name, stars, and score):
${relevanceInstructions}
${adoptionSection}

Example relevance line format:
🔧 **Technology** ⭐⭐⭐⭐✩ (4/5)

Tone: ${config.context.tone || 'direct, technical'}
Language: ${config.context.language || 'English'}
If an article is not relevant at all, say so in one sentence and skip the rest.`;
}
