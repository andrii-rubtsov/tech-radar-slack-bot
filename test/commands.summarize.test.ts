import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Env } from '../src/types.js';

const {
  readCanvasMock,
  parseRadarConfigMock,
  buildSystemPromptMock,
  fetchMarkdownMock,
  callClaudeMock,
  runDailyDigestMock,
} = vi.hoisted(() => ({
  readCanvasMock: vi.fn(),
  parseRadarConfigMock: vi.fn(),
  buildSystemPromptMock: vi.fn(),
  fetchMarkdownMock: vi.fn(),
  callClaudeMock: vi.fn(),
  runDailyDigestMock: vi.fn(),
}));

vi.mock('../src/slack/canvas.js', () => ({
  readCanvas: readCanvasMock,
}));

vi.mock('../src/services/config.js', () => ({
  CANVAS_NAME: 'TechRadar',
  parseRadarConfig: parseRadarConfigMock,
  buildSystemPrompt: buildSystemPromptMock,
}));

vi.mock('../src/services/browser.js', () => ({
  fetchMarkdown: fetchMarkdownMock,
}));

vi.mock('../src/services/claude.js', () => ({
  callClaude: callClaudeMock,
}));

vi.mock('../src/digest/daily.js', () => ({
  runDailyDigest: runDailyDigestMock,
}));

import { handleSlackCommand } from '../src/slack/commands.js';

async function makeSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const baseString = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(baseString));
  return `v0=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function makeEnv(): Env {
  return {
    CLAUDE_MODEL_SUMMARIZE: 'claude-haiku-4-5-20251001',
    CLAUDE_MODEL_DIGEST: 'claude-sonnet-4-6',
    SLACK_BOT_TOKEN: 'xoxb-token',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    CF_ACCOUNT_ID: 'cf-account',
    CF_API_TOKEN: 'cf-token',
    ANTHROPIC_API_KEY: 'anthropic-token',
    CHANNEL_RADAR_DO: {} as DurableObjectNamespace,
  };
}

function makeContext(waitUntil: ReturnType<typeof vi.fn>): ExecutionContext {
  return {
    waitUntil,
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function validConfig(): object {
  return {
    context: { industry: 'SaaS' },
    tech_stack: {},
    features: { auto_summary: true, digest: true },
    filter: { focus: [], ignore: [] },
    relevance: [],
    adoption_path: {
      name: 'Adoption Path',
      emoji: '🚀',
      sentences: 4,
      description: 'Can we try this now?',
    },
    output: { summary_sentences: 3 },
    digest: { top_n: 5, source: [] },
  };
}

async function makeSummarizeRequest(signingSecret: string, text: string): Promise<Request> {
  const body = new URLSearchParams({
    command: '/tech-radar-summarize',
    text,
    channel_id: 'C123',
    user_id: 'U123',
    response_url: 'https://hooks.slack.test/response',
  }).toString();

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await makeSignature(signingSecret, timestamp, body);

  return new Request('https://example.com/slack/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Slack-Request-Timestamp': timestamp,
      'X-Slack-Signature': signature,
    },
    body,
  });
}

describe('/tech-radar-summarize strict canvas requirements', () => {
  beforeEach(() => {
    readCanvasMock.mockReset();
    parseRadarConfigMock.mockReset().mockReturnValue(validConfig());
    buildSystemPromptMock.mockReset().mockReturnValue('system-prompt');
    fetchMarkdownMock.mockReset().mockResolvedValue('# Title\n\nArticle body');
    callClaudeMock.mockReset().mockResolvedValue('Summary text');
    runDailyDigestMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails summarize when TechRadar canvas is missing', async () => {
    const env = makeEnv();
    readCanvasMock.mockResolvedValue(null);
    let postedBody = '';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = String(init?.body || '');
      return { ok: true } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await makeSummarizeRequest(
      env.SLACK_SIGNING_SECRET,
      'check this https://example.com/article',
    );
    const waitUntil = vi.fn();
    const response = await handleSlackCommand(request, env, makeContext(waitUntil));
    const ack = await response.json<{ response_type: string; text: string }>();

    expect(response.status).toBe(200);
    expect(ack.response_type).toBe('ephemeral');
    expect(ack.text).toContain('Analyzing');
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await waitUntil.mock.calls[0][0];

    expect(parseRadarConfigMock).not.toHaveBeenCalled();
    expect(fetchMarkdownMock).not.toHaveBeenCalled();
    expect(callClaudeMock).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(postedBody || '{}') as {
      response_type: string;
      text: string;
    };
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('TechRadar canvas not found');
  });

  it('fails summarize when TechRadar canvas TOML is invalid', async () => {
    const env = makeEnv();
    readCanvasMock.mockResolvedValue('[context]\ninvalid =');
    parseRadarConfigMock.mockImplementation(() => {
      throw new Error('Invalid TOML');
    });
    let postedBody = '';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = String(init?.body || '');
      return { ok: true } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await makeSummarizeRequest(
      env.SLACK_SIGNING_SECRET,
      'check this https://example.com/article',
    );
    const waitUntil = vi.fn();
    const response = await handleSlackCommand(request, env, makeContext(waitUntil));
    const ack = await response.json<{ response_type: string; text: string }>();

    expect(response.status).toBe(200);
    expect(ack.response_type).toBe('ephemeral');
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await waitUntil.mock.calls[0][0];

    expect(parseRadarConfigMock).toHaveBeenCalledTimes(1);
    expect(fetchMarkdownMock).not.toHaveBeenCalled();
    expect(callClaudeMock).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(postedBody || '{}') as {
      response_type: string;
      text: string;
    };
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('Could not parse TechRadar canvas');
  });
});
