interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

const CLAUDE_TIMEOUT_MS = 20000;

export async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 1024,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  const startedAt = Date.now();
  console.log(
    `[claude] request start model=${model} maxTokens=${maxTokens} systemLen=${systemPrompt.length} userLen=${userMessage.length}`,
  );
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${error}`);
    }

    const data = await resp.json<ClaudeResponse>();
    const text = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    console.log(
      `[claude] request done model=${model} responseLen=${text.length} durationMs=${Date.now() - startedAt}`,
    );
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Claude request timed out after ${CLAUDE_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
