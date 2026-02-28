const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_', 'ga_'];
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'ref',
  'ref_src',
  'source',
]);

export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = '';

    const params = [...url.searchParams.keys()];
    for (const key of params) {
      const lower = key.toLowerCase();
      if (
        TRACKING_PARAMS.has(lower) ||
        TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
      ) {
        url.searchParams.delete(key);
      }
    }

    // Keep host/path stable for dedupe.
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.endsWith('/') && url.pathname !== '/') {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return input.trim();
  }
}
