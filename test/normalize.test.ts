import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../src/utils/normalize.js';

describe('normalizeUrl', () => {
  it('removes tracking params and hash', () => {
    const input = 'https://Example.com/path/?utm_source=x&fbclid=abc&id=1#section';
    expect(normalizeUrl(input)).toBe('https://example.com/path?id=1');
  });

  it('trims trailing slash for non-root path', () => {
    expect(normalizeUrl('https://example.com/news/')).toBe('https://example.com/news');
  });

  it('returns original on invalid URL', () => {
    expect(normalizeUrl('not-url')).toBe('not-url');
  });
});
