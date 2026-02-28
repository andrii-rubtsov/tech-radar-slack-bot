import { describe, it, expect } from 'vitest';
import { extractUrls } from '../src/utils/urls.js';

describe('extractUrls', () => {
  it('extracts plain URL', () => {
    expect(extractUrls('check https://example.com for details')).toEqual(['https://example.com']);
  });

  it('extracts Slack angle-bracket URL', () => {
    expect(extractUrls('<https://example.com>')).toEqual(['https://example.com']);
  });

  it('extracts Slack angle-bracket URL with label', () => {
    expect(extractUrls('<https://example.com|example.com>')).toEqual(['https://example.com']);
  });

  it('extracts multiple URLs', () => {
    expect(extractUrls('see <https://a.com|a> and <https://b.com> and https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('deduplicates URLs', () => {
    expect(extractUrls('<https://example.com> https://example.com')).toEqual([
      'https://example.com',
    ]);
  });

  it('returns empty array when no URLs', () => {
    expect(extractUrls('no links here')).toEqual([]);
  });

  it('ignores http-only mention in non-URL text', () => {
    expect(extractUrls('use http for insecure or https://example.com')).toEqual([
      'https://example.com',
    ]);
  });
});
