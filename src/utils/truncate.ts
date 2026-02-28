export function truncateMarkdown(markdown: string, maxChars: number = 15000): string {
  if (markdown.length <= maxChars) return markdown;

  const truncated = markdown.slice(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');

  if (lastParagraph > maxChars * 0.8) {
    return truncated.slice(0, lastParagraph) + '\n\n[... truncated]';
  }
  return truncated + '\n\n[... truncated]';
}
