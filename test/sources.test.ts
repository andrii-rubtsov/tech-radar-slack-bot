import { describe, it, expect, vi, afterEach } from 'vitest';
import { listBotChannels } from '../src/services/sources.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(pages: object[]): void {
  let call = 0;
  vi.stubGlobal('fetch', async () => {
    const body = pages[call++] ?? { ok: false, channels: [] };
    return { json: async () => body } as Response;
  });
}

describe('listBotChannels', () => {
  it('returns channel IDs where is_member = true', async () => {
    mockFetch([
      {
        ok: true,
        channels: [
          { id: 'C001', is_member: true },
          { id: 'C002', is_member: false },
          { id: 'C003', is_member: true },
        ],
        response_metadata: { next_cursor: '' },
      },
    ]);

    const result = await listBotChannels('xoxb-token');
    expect(result).toEqual(['C001', 'C003']);
  });

  it('follows pagination cursors', async () => {
    mockFetch([
      {
        ok: true,
        channels: [{ id: 'C001', is_member: true }],
        response_metadata: { next_cursor: 'cursor-page-2' },
      },
      {
        ok: true,
        channels: [{ id: 'C002', is_member: true }],
        response_metadata: { next_cursor: '' },
      },
    ]);

    const result = await listBotChannels('xoxb-token');
    expect(result).toEqual(['C001', 'C002']);
  });

  it('returns empty array when API returns ok: false', async () => {
    mockFetch([{ ok: false }]);
    const result = await listBotChannels('xoxb-token');
    expect(result).toEqual([]);
  });

  it('returns empty array when no channels are member', async () => {
    mockFetch([
      {
        ok: true,
        channels: [
          { id: 'C001', is_member: false },
          { id: 'C002', is_member: false },
        ],
        response_metadata: { next_cursor: '' },
      },
    ]);

    const result = await listBotChannels('xoxb-token');
    expect(result).toEqual([]);
  });

  it('handles missing response_metadata gracefully', async () => {
    mockFetch([
      {
        ok: true,
        channels: [{ id: 'C001', is_member: true }],
        // no response_metadata
      },
    ]);

    const result = await listBotChannels('xoxb-token');
    expect(result).toEqual(['C001']);
  });

  it('passes the bot token in Authorization header', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return {
        json: async () => ({
          ok: true,
          channels: [],
          response_metadata: { next_cursor: '' },
        }),
      } as Response;
    });

    await listBotChannels('xoxb-test-token');
    expect(calls[0]).toContain('conversations.list');
    expect(calls[0]).toContain('types=public_channel');
    expect(calls[0]).toContain('exclude_archived=true');
  });
});
