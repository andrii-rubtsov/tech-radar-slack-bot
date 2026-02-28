import type { Env } from '../types.js';

const BROWSER_TIMEOUT_MS = 12000;

export interface MarkdownFetchResult {
  markdown: string | null;
  retryable: boolean;
  status?: number;
  reason: 'ok' | 'http' | 'timeout' | 'error';
}

export async function fetchMarkdownWithMeta(url: string, env: Env): Promise<MarkdownFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROWSER_TIMEOUT_MS);
  const startedAt = Date.now();
  console.log(`[browser] fetch start url=${url}`);

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/markdown`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          gotoOptions: { waitUntil: 'networkidle0' },
        }),
      },
    );

    if (!resp.ok) {
      console.error(`Browser Rendering failed for ${url}: ${resp.status}`);
      return {
        markdown: null,
        retryable: resp.status === 429 || resp.status >= 500,
        status: resp.status,
        reason: 'http',
      };
    }

    const data = await resp.json<{ success: boolean; result: string }>();
    const markdown = data.success ? data.result : null;
    console.log(
      `[browser] fetch done url=${url} success=${data.success} len=${markdown?.length ?? 0} durationMs=${Date.now() - startedAt}`,
    );
    return {
      markdown,
      retryable: !data.success,
      reason: data.success ? 'ok' : 'error',
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`Browser Rendering timed out for ${url} after ${BROWSER_TIMEOUT_MS}ms`);
      return {
        markdown: null,
        retryable: true,
        reason: 'timeout',
      };
    }
    console.error(`Browser Rendering error for ${url}:`, err);
    return {
      markdown: null,
      retryable: true,
      reason: 'error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMarkdown(url: string, env: Env): Promise<string | null> {
  const result = await fetchMarkdownWithMeta(url, env);
  return result.markdown;
}
