// Slack wraps URLs in <url|label> or <url> format; plain URLs also appear
const URL_REGEX = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>|(https?:\/\/[^\s>]+)/g;

export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    urls.push(match[1] || match[2]);
  }
  return [...new Set(urls)];
}
