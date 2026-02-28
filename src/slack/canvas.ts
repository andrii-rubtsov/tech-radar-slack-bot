interface SlackFilesListResponse {
  ok: boolean;
  files?: SlackCanvasFile[];
  paging?: { page?: number; pages?: number };
  error?: string;
}

interface SlackCanvasFile {
  id: string;
  title?: string;
  filetype?: string;
  mimetype?: string;
  preview?: string;
  url_private?: string;
  url_private_download?: string;
}

interface SlackFileInfoResponse {
  ok: boolean;
  file?: SlackCanvasFile;
  error?: string;
}

interface SlackSectionsResponse {
  ok: boolean;
  sections?: Array<Record<string, unknown>>;
  error?: string;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function previewForLog(value: string, max: number = 180): string {
  return value.replace(/\s+/g, ' ').slice(0, max);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function looksLikeToml(candidate: string): boolean {
  return /^\s*(\[\[[A-Za-z0-9_.-]+\]\]|\[[A-Za-z0-9_.-]+\]|[A-Za-z0-9_.-]+\s*=)/m.test(candidate);
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|pre|code)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function extractTomlCodeBlock(raw: string): string | null {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const fencedToml = normalized.match(/```toml\s*([\s\S]*?)```/i);
  if (fencedToml?.[1]?.trim()) return fencedToml[1].trim();

  const fencedBlocks = normalized.matchAll(/```\s*([\s\S]*?)```/g);
  for (const match of fencedBlocks) {
    const block = match[1]?.trim() || '';
    if (/^\s*(\[\[[A-Za-z0-9_.-]+\]\]|\[[A-Za-z0-9_.-]+\])\s*$/m.test(block)) {
      return block;
    }
  }

  const htmlCodeBlocks = normalized.matchAll(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi);
  for (const match of htmlCodeBlocks) {
    const decoded = decodeHtmlEntities(match[1] || '').trim();
    if (looksLikeToml(decoded)) {
      return decoded;
    }
  }

  // Slack canvas file.private often returns HTML like:
  // <pre ...>[context]<br>key = "value"<br>...</pre>
  const htmlPreBlocks = normalized.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
  for (const match of htmlPreBlocks) {
    const decoded = htmlToText(match[1] || '');
    if (looksLikeToml(decoded)) return decoded;
  }

  const fromFirstTable = normalized.search(/^\s*(\[\[[A-Za-z0-9_.-]+\]\]|\[[A-Za-z0-9_.-]+\])\s*$/m);
  if (fromFirstTable >= 0) {
    const candidate = normalized
      .slice(fromFirstTable)
      .split('\n')
      .filter((line) => !/^<\/?[a-z][\w:-]*(\s|>|$)/i.test(line.trim()))
      .join('\n')
      .trim();
    if (candidate) return candidate;
  }

  const htmlNormalized = htmlToText(normalized);
  if (htmlNormalized && looksLikeToml(htmlNormalized)) {
    const tableStart = htmlNormalized.search(
      /^\s*(\[\[[A-Za-z0-9_.-]+\]\]|\[[A-Za-z0-9_.-]+\])\s*$/m,
    );
    if (tableStart >= 0) {
      return htmlNormalized.slice(tableStart).trim();
    }
    return htmlNormalized;
  }

  return null;
}

async function listFiles(
  botToken: string,
  channelId: string,
  types?: string,
): Promise<SlackCanvasFile[]> {
  const files: SlackCanvasFile[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      channel: channelId,
      count: '200',
      page: String(page),
    });
    if (types) params.set('types', types);

    const url = `https://slack.com/api/files.list?${params.toString()}`;
    console.log(`[readCanvas] files.list request page=${page} types=${types || 'all'}`);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
    const data = await response.json<SlackFilesListResponse>();

    if (!data.ok || !data.files) {
      console.error(
        `[readCanvas] files.list failed page=${page} types=${types || 'all'} error=${data.error || 'unknown'}`,
      );
      return [];
    }

    files.push(...data.files);
    totalPages = data.paging?.pages || 1;
    console.log(
      `[readCanvas] files.list page=${page}/${totalPages} returned=${data.files.length} accumulated=${files.length}`,
    );
    page += 1;
  } while (page <= totalPages);

  return files;
}

async function fetchFileInfo(botToken: string, fileId: string): Promise<SlackCanvasFile | null> {
  const params = new URLSearchParams({ file: fileId });
  const url = `https://slack.com/api/files.info?${params.toString()}`;
  console.log(`[readCanvas] files.info request file=${fileId}`);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
  const data = await response.json<SlackFileInfoResponse>();
  if (!data.ok || !data.file) {
    console.warn(`[readCanvas] files.info failed file=${fileId} error=${data.error || 'unknown'}`);
    return null;
  }
  console.log(
    `[readCanvas] files.info ok file=${fileId} title="${data.file.title || ''}" previewLen=${data.file.preview?.length ?? 0}`,
  );
  return data.file;
}

async function fetchSections(
  botToken: string,
  canvasId: string,
  criteria: Record<string, unknown>,
): Promise<SlackSectionsResponse> {
  console.log(`[readCanvas] sections.lookup request canvas=${canvasId} criteria=${JSON.stringify(criteria)}`);
  const response = await fetch('https://slack.com/api/canvases.sections.lookup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ canvas_id: canvasId, criteria }),
  });
  const data = await response.json<SlackSectionsResponse>();
  const firstSectionKeys = data.sections?.[0] ? Object.keys(data.sections[0]).join(',') : 'none';
  console.log(
    `[readCanvas] sections.lookup response canvas=${canvasId} ok=${data.ok} sections=${data.sections?.length ?? 0} keys=${firstSectionKeys} error=${data.error || 'none'}`,
  );
  return data;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized) out.push(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, out);
    }
  }
}

function sectionToText(section: Record<string, unknown>): string {
  // Fast path for common Slack field names.
  const directFields = ['markdown', 'text', 'content', 'plain_text'];
  for (const key of directFields) {
    const value = section[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  // Fallback for nested section shapes.
  const strings: string[] = [];
  collectStrings(section, strings);
  if (strings.length === 0) return '';
  return strings.join('\n');
}

function sectionsToText(result: SlackSectionsResponse): string | null {
  if (!result.ok || !result.sections || result.sections.length === 0) return null;
  const text = result.sections.map((section) => sectionToText(section)).join('\n\n').trim();
  return text || null;
}

async function fetchPrivateText(botToken: string, url: string, label: string): Promise<string | null> {
  console.log(`[readCanvas] ${label} request`);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
  console.log(`[readCanvas] ${label} response status=${response.status}`);
  if (!response.ok) return null;
  const text = await response.text();
  console.log(`[readCanvas] ${label} bytes=${text.length} preview="${previewForLog(text)}"`);
  return text;
}

function findCanvasByTitle(files: SlackCanvasFile[], canvasTitle: string): SlackCanvasFile | null {
  const exact = files.find((file) => file.title === canvasTitle);
  if (exact) return exact;

  const normalized = normalizeTitle(canvasTitle);
  const normalizedMatch = files.find((file) => normalizeTitle(file.title || '') === normalized);
  if (normalizedMatch) return normalizedMatch;

  return files.find((file) => normalizeTitle(file.title || '').includes(normalized)) || null;
}

function uniqueCandidates(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function tryExtractToml(candidate: string | null | undefined, label: string): string | null {
  if (!candidate) {
    console.log(`[readCanvas] ${label}: empty candidate`);
    return null;
  }

  const normalized = candidate.trim();
  if (!normalized) {
    console.log(`[readCanvas] ${label}: blank candidate`);
    return null;
  }

  console.log(
    `[readCanvas] ${label}: len=${normalized.length} preview="${previewForLog(normalized)}"`,
  );
  const extracted = extractTomlCodeBlock(normalized);
  if (!extracted) {
    console.log(`[readCanvas] ${label}: no TOML block detected`);
    return null;
  }

  console.log(
    `[readCanvas] ${label}: extracted TOML len=${extracted.length} preview="${previewForLog(extracted)}"`,
  );
  return extracted;
}

export async function readCanvas(
  botToken: string,
  channelId: string,
  canvasTitle: string,
): Promise<string | null> {
  console.log(`[readCanvas] start channel=${channelId} title="${canvasTitle}"`);

  const typedFiles = await listFiles(botToken, channelId, 'canvas');
  let files = typedFiles;
  if (files.length === 0) {
    console.log('[readCanvas] no files from types=canvas, retrying without type filter');
    files = await listFiles(botToken, channelId);
  }

  if (files.length === 0) {
    console.warn(`[readCanvas] no files found in channel=${channelId}`);
    return null;
  }

  const titlePreview = files
    .slice(0, 15)
    .map((file) => `"${file.title || ''}"`)
    .join(', ');
  console.log(`[readCanvas] candidate file titles (${files.length}): ${titlePreview}`);

  const canvas = findCanvasByTitle(files, canvasTitle);
  if (!canvas) {
    console.warn(`[readCanvas] no canvas matched title="${canvasTitle}" in channel=${channelId}`);
    return null;
  }

  console.log(
    `[readCanvas] selected file id=${canvas.id} title="${canvas.title || ''}" filetype=${canvas.filetype || ''} mimetype=${canvas.mimetype || ''}`,
  );

  const bySectionsFiltered = sectionsToText(
    await fetchSections(botToken, canvas.id, { contains_text: '=' }),
  );
  const extractedFromFilteredSections = tryExtractToml(bySectionsFiltered, 'sections.contains_text');
  if (extractedFromFilteredSections) return extractedFromFilteredSections;

  const extractedFromPreview = tryExtractToml(canvas.preview, 'files.list.preview');
  if (extractedFromPreview) return extractedFromPreview;

  const info = await fetchFileInfo(botToken, canvas.id);
  const extractedFromInfoPreview = tryExtractToml(info?.preview, 'files.info.preview');
  if (extractedFromInfoPreview) return extractedFromInfoPreview;

  const byPrivateFromCanvas = canvas.url_private_download || canvas.url_private
    ? await fetchPrivateText(
        botToken,
        (canvas.url_private_download || canvas.url_private) as string,
        'file.private',
      )
    : null;
  const extractedFromPrivateCanvas = tryExtractToml(byPrivateFromCanvas, 'files.private');
  if (extractedFromPrivateCanvas) return extractedFromPrivateCanvas;

  const byPrivateFromInfo = info?.url_private_download || info?.url_private
    ? await fetchPrivateText(
        botToken,
        (info?.url_private_download || info?.url_private) as string,
        'file.info.private',
      )
    : null;
  const extractedFromPrivateInfo = tryExtractToml(byPrivateFromInfo, 'files.info.private');
  if (extractedFromPrivateInfo) return extractedFromPrivateInfo;

  const extraCandidates = uniqueCandidates([
    bySectionsFiltered,
    canvas.preview,
    info?.preview,
    byPrivateFromCanvas,
    byPrivateFromInfo,
  ]);
  console.log(`[readCanvas] exhausted candidates count=${extraCandidates.length}`);

  console.warn(`[readCanvas] no TOML block found for channel=${channelId} canvasId=${canvas.id}`);
  return null;
}
