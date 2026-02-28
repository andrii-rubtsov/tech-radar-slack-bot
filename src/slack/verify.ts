export async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(baseString));
  const computed = `v0=${[...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;

  return computed === signature;
}
