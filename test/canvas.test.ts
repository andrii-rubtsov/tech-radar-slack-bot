import { describe, it, expect, vi, afterEach } from 'vitest';
import { readCanvas } from '../src/slack/canvas.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readCanvas', () => {
  it('queries files.list with types=canvas and returns preview content', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return {
        json: async () => ({
          ok: true,
          files: [
            {
              id: 'F1',
              title: 'TechRadar',
              preview: '```toml\n[context]\nindustry = "SaaS"\n```',
            },
          ],
          paging: { page: 1, pages: 1 },
        }),
      } as Response;
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');

    expect(calls[0]).toContain('files.list');
    expect(calls[0]).toContain('types=canvas');
    expect(content).toContain('[context]');
  });

  it('falls back to files.info when files.list entry has no inline content', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('files.list')) {
        return {
          json: async () => ({
            ok: true,
            files: [{ id: 'F1', title: 'TechRadar' }],
            paging: { page: 1, pages: 1 },
          }),
        } as Response;
      }

      if (url.includes('canvases.sections.lookup')) {
        return {
          json: async () => ({
            ok: true,
            sections: [],
          }),
        } as Response;
      }

      if (!url.includes('files.info')) {
        throw new Error(`Unexpected URL: ${url}`);
      }
      return {
        json: async () => ({
          ok: true,
          file: {
            id: 'F1',
            title: 'TechRadar',
            preview: '[context]\nindustry = "Gaming"',
          },
        }),
      } as Response;
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');
    expect(content).toContain('industry = "Gaming"');
    expect(calls.some((url) => url.includes('files.info'))).toBe(true);
  });

  it('matches canvas title with normalized fallback', async () => {
    vi.stubGlobal('fetch', async () => {
      return {
        json: async () => ({
          ok: true,
          files: [{ id: 'F1', title: ' techradar ', preview: '[context]\nindustry = "Fintech"' }],
          paging: { page: 1, pages: 1 },
        }),
      } as Response;
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');
    expect(content).toContain('industry = "Fintech"');
  });

  it('retries files.list without types filter when types=canvas returns nothing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('files.list') && url.includes('types=canvas')) {
        return {
          json: async () => ({
            ok: true,
            files: [],
            paging: { page: 1, pages: 1 },
          }),
        } as Response;
      }

      if (url.includes('files.list')) {
        return {
          json: async () => ({
            ok: true,
            files: [{ id: 'F1', title: 'TechRadar', preview: '```toml\n[context]\nindustry = "Cloud"\n```' }],
            paging: { page: 1, pages: 1 },
          }),
        } as Response;
      }

      if (url.includes('canvases.sections.lookup')) {
        return {
          json: async () => ({
            ok: true,
            sections: [],
          }),
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');
    expect(content).toContain('industry = "Cloud"');
    expect(calls.filter((url) => url.includes('files.list')).length).toBeGreaterThanOrEqual(2);
    expect(calls.some((url) => url.includes('types=canvas'))).toBe(true);
    expect(calls.some((url) => url.includes('files.list') && !url.includes('types=canvas'))).toBe(
      true,
    );
  });

  it('ignores HTML preview and returns TOML from sections', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('files.list')) {
        return {
          json: async () => ({
            ok: true,
            files: [
              {
                id: 'F1',
                title: 'TechRadar',
                preview: "<div style='height: 200px; overflow: hidden'>",
              },
            ],
            paging: { page: 1, pages: 1 },
          }),
        } as Response;
      }

      if (url.includes('canvases.sections.lookup')) {
        return {
          json: async () => ({
            ok: true,
            sections: [{ markdown: '```toml\n[context]\nindustry = "Platform"\n```' }],
          }),
        } as Response;
      }

      return {
        json: async () => ({
          ok: false,
        }),
      } as Response;
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');
    expect(content).toContain('[context]');
    expect(content).toContain('industry = "Platform"');
  });

  it('extracts TOML from private HTML pre blocks with <br> tags', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('files.list')) {
        return {
          json: async () => ({
            ok: true,
            files: [
              {
                id: 'F1',
                title: 'TechRadar',
                preview: '',
                url_private: 'https://example.com/private/F1',
              },
            ],
            paging: { page: 1, pages: 1 },
          }),
        } as Response;
      }

      if (url.includes('canvases.sections.lookup')) {
        return {
          json: async () => ({
            ok: false,
            error: 'invalid_arguments',
            sections: [],
          }),
        } as Response;
      }

      if (url.includes('files.info')) {
        return {
          json: async () => ({
            ok: true,
            file: {
              id: 'F1',
              title: 'TechRadar',
              preview: '',
              url_private: 'https://example.com/private/F1',
            },
          }),
        } as Response;
      }

      if (url.includes('example.com/private/F1')) {
        return {
          ok: true,
          text: async () =>
            "<h1>TechRadar</h1><pre class='prettyprint'>[context]<br>industry = \"Gaming\"<br><br>[features]<br>digest = true</pre>",
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const content = await readCanvas('xoxb-token', 'C123', 'TechRadar');
    expect(content).toContain('[context]');
    expect(content).toContain('industry = "Gaming"');
    expect(content).toContain('[features]');
    expect(content).toContain('digest = true');
  });
});
