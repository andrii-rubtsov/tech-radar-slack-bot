import { describe, it, expect } from 'vitest';
import { truncateMarkdown } from '../src/utils/truncate.js';

describe('truncateMarkdown', () => {
  it('returns unchanged string when under limit', () => {
    const text = 'short text';
    expect(truncateMarkdown(text, 100)).toBe(text);
  });

  it('truncates at paragraph boundary when one exists past 80% mark', () => {
    const para1 = 'a'.repeat(900);
    const para2 = 'b'.repeat(200);
    const input = para1 + '\n\n' + para2;
    const result = truncateMarkdown(input, 1000);
    expect(result).toContain('[... truncated]');
    expect(result).not.toContain(para2);
    expect(result.endsWith('\n\n[... truncated]')).toBe(true);
  });

  it('truncates at char limit when no good paragraph break exists', () => {
    const input = 'a'.repeat(2000);
    const result = truncateMarkdown(input, 1000);
    expect(result).toContain('[... truncated]');
    expect(result.length).toBeLessThan(1100);
  });

  it('respects custom maxChars', () => {
    const input = 'x'.repeat(500);
    const result = truncateMarkdown(input, 200);
    expect(result.startsWith('x'.repeat(200))).toBe(true);
  });
});
