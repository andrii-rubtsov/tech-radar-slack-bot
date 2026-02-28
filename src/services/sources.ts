interface SlackConversationsResponse {
  ok: boolean;
  channels: Array<{ id: string; is_member: boolean }>;
  response_metadata?: { next_cursor?: string };
}

export async function listBotChannels(botToken: string): Promise<string[]> {
  const channels: string[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);

    const resp = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    const data = await resp.json<SlackConversationsResponse>();

    if (!data.ok) break;

    for (const ch of data.channels) {
      if (ch.is_member) channels.push(ch.id);
    }

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels;
}
