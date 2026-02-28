import type { Env } from '../types.js';
import { fetchMarkdown } from './browser.js';
import { extractUrls } from '../utils/urls.js';
import { normalizeUrl } from '../utils/normalize.js';

function parseFeedLinks(xml: string): string[] {
  const links = new Set<string>();

  const itemLinkMatches = xml.matchAll(/<item[\s\S]*?<link>([^<]+)<\/link>/gi);
  for (const match of itemLinkMatches) {
    if (match[1]) links.add(match[1].trim());
  }

  const atomLinkMatches = xml.matchAll(
    /<entry[\s\S]*?<link[^>]*href=["']([^"']+)["'][^>]*>/gi,
  );
  for (const match of atomLinkMatches) {
    if (match[1]) links.add(match[1].trim());
  }

  return [...links];
}

async function fetchText(url: string): Promise<{ text: string; contentType: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    return { text, contentType };
  } catch (err) {
    console.error(`[discovery] failed to fetch source ${url}:`, err);
    return null;
  }
}

function isLikelyFeed(url: string, contentType: string, text: string): boolean {
  const loweredUrl = url.toLowerCase();
  if (
    loweredUrl.includes('rss') ||
    loweredUrl.endsWith('.xml') ||
    loweredUrl.endsWith('.atom') ||
    loweredUrl.endsWith('/feed')
  ) {
    return true;
  }

  const loweredType = contentType.toLowerCase();
  if (
    loweredType.includes('rss') ||
    loweredType.includes('atom') ||
    loweredType.includes('xml')
  ) {
    return true;
  }

  const head = text.slice(0, 500).toLowerCase();
  return head.includes('<rss') || head.includes('<feed');
}

function filterCandidateUrls(
  sourceUrl: string,
  candidates: string[],
  maxLinks: number,
): string[] {
  const normalizedSource = normalizeUrl(sourceUrl);
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) continue;
    const normalized = normalizeUrl(raw);
    if (normalized === normalizedSource) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
    if (deduped.length >= maxLinks) break;
  }

  return deduped;
}

export async function discoverSourceArticleUrls(
  sourceUrl: string,
  env: Env,
  maxLinks: number,
): Promise<string[]> {
  const response = await fetchText(sourceUrl);
  if (response && isLikelyFeed(sourceUrl, response.contentType, response.text)) {
    const links = parseFeedLinks(response.text);
    return filterCandidateUrls(sourceUrl, links, maxLinks);
  }

  // Fallback for plain pages and sources where feed parsing failed.
  const markdown = await fetchMarkdown(sourceUrl, env);
  if (!markdown) return [];
  const urls = extractUrls(markdown);
  return filterCandidateUrls(sourceUrl, urls, maxLinks);
}
