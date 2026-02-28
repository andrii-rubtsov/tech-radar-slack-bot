import { describe, it, expect } from 'vitest';
import { verifySlackSignature } from '../src/slack/verify.js';

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

describe('verifySlackSignature', () => {
  const secret = 'test-signing-secret';
  const body = '{"type":"event_callback"}';

  it('returns true for a valid signature', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await makeSignature(secret, timestamp, body);
    expect(await verifySlackSignature(secret, sig, timestamp, body)).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(await verifySlackSignature(secret, 'v0=invalid', timestamp, body)).toBe(false);
  });

  it('returns false for a timestamp older than 5 minutes', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 400);
    const sig = await makeSignature(secret, timestamp, body);
    expect(await verifySlackSignature(secret, sig, timestamp, body)).toBe(false);
  });

  it('returns false for wrong signing secret', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await makeSignature('wrong-secret', timestamp, body);
    expect(await verifySlackSignature(secret, sig, timestamp, body)).toBe(false);
  });
});
