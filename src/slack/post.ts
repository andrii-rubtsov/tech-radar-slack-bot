/** Convert markdown formatting to Slack mrkdwn */
export function toSlackMrkdwn(text: string): string {
  return (
    text
      // ## Heading or # Heading → *Heading* (bold)
      .replace(/^#{1,3}\s+(.+)$/gm, '*$1*')
      // **bold** → *bold*
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
  );
}

export async function postMessage(
  botToken: string,
  channelId: string,
  text: string,
): Promise<void> {
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: channelId,
      text: toSlackMrkdwn(text),
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = await resp.json<{ ok: boolean; error?: string }>();
  if (!data.ok) {
    console.error('Failed to post message:', data.error);
  }
}
