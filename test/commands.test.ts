import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../src/types.js';

const { runDailyDigestMock } = vi.hoisted(() => ({
  runDailyDigestMock: vi.fn(),
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

function makeContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe('handleSlackCommand', () => {
  beforeEach(() => {
    runDailyDigestMock.mockReset().mockResolvedValue(undefined);
  });

  it('ignores Slack retry requests to prevent duplicate runs', async () => {
    const request = new Request('https://example.com/slack/commands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Slack-Retry-Num': '1',
      },
      body: 'command=%2Ftech-radar-digest&channel_id=C123',
    });

    const response = await handleSlackCommand(request, makeEnv(), makeContext());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(runDailyDigestMock).not.toHaveBeenCalled();
  });

  it('rejects request with invalid signature', async () => {
    const body = 'command=%2Ftech-radar-setup&channel_id=C123';
    const request = new Request('https://example.com/slack/commands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      },
      body,
    });

    const response = await handleSlackCommand(request, makeEnv(), makeContext());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Invalid signature');
  });

  it('accepts valid signature for /tech-radar-setup', async () => {
    const body = 'command=%2Ftech-radar-setup&channel_id=C123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await makeSignature(makeEnv().SLACK_SIGNING_SECRET, timestamp, body);

    const request = new Request('https://example.com/slack/commands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': signature,
      },
      body,
    });

    const response = await handleSlackCommand(request, makeEnv(), makeContext());
    const payload = await response.json<{ response_type: string; text: string }>();

    expect(response.status).toBe(200);
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('TechRadar Bot Setup');
  });

  it('forces digest run for /tech-radar-digest regardless of feature flags', async () => {
    const env = makeEnv();
    const body = 'command=%2Ftech-radar-digest&channel_id=C123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await makeSignature(env.SLACK_SIGNING_SECRET, timestamp, body);
    const waitUntil = vi.fn();
    const ctx = {
      waitUntil,
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const request = new Request('https://example.com/slack/commands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': signature,
      },
      body,
    });

    const response = await handleSlackCommand(request, env, ctx);
    const payload = await response.json<{ response_type: string; text: string }>();

    expect(response.status).toBe(200);
    expect(payload.response_type).toBe('ephemeral');
    expect(runDailyDigestMock).toHaveBeenCalledWith(env, 'C123', { force: true });
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
