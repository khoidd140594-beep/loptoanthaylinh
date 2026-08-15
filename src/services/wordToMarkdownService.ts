// @ts-nocheck
// services/wordToMarkdownService.ts
//
// Chuyển .docx → Markdown (giữ thứ tự) để đưa vào lượt "chia slide".
// Tái dùng phần lõi của mathWordParserService.ts:
//   - MathType OLE → LaTeX qua backend Render (VITE_MATHTYPE_SERVER_URL)
//   - Ảnh inline (a:blip / v:imagedata) → ![](data:...)
//   - Công thức OMML (m:t) giữ nguyên chữ
// KHÁC mathWordParser: KHÔNG parse thành đề thi/câu hỏi — chỉ trả Markdown thô.

import JSZip from 'jszip';

const MATHTYPE_SERVER_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MATHTYPE_SERVER_URL) ||
  'http://localhost:8000';

export interface WordToMarkdownResult {
  markdown: string;
  imageCount: number;
  mathTypeCount: number;
}

export async function wordToMarkdown(
  file: File,
  config?: { mathTypeServerUrl?: string },
): Promise<WordToMarkdownResult> {
  const serverUrl = config?.mathTypeServerUrl ?? MATHTYPE_SERVER_URL;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const imageByRId = await extractImages(zip); // rId → dataUri
  const oleItems = await extractOleItems(zip);
  let oleLatex = new Map<string, string>();
  if (oleItems.length) oleLatex = await convertOleToLatex(oleItems, serverUrl);

  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Không tìm thấy document.xml trong file Word.');

  const markdown = paragraphsToMarkdown(documentXml, imageByRId, oleLatex);
  return { markdown, imageCount: imageByRId.size, mathTypeCount: oleLatex.size };
}

// ============================================================
// PARAGRAPH → MARKDOWN (raw XML, giữ đúng thứ tự token)
// ============================================================
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function paragraphsToMarkdown(
  documentXml: string,
  imageByRId: Map<string, string>,
  oleLatexMap: Map<string, string>,
): string {
  const lines: string[] = [];
  const paraRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g;

  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(documentXml)) !== null) {
    const pXml = pm[0];

    // Heading: <w:pStyle w:val="Heading1".. > → thêm dấu #
    const styleMatch = pXml.match(/<w:pStyle\b[^>]*w:val="Heading(\d)"/i);
    const headingLevel = styleMatch ? Math.min(4, Number(styleMatch[1]) || 1) : 0;

    let text = '';
    const imageRIds: string[] = [];

    let rm: RegExpExecArray | null;
    runRe.lastIndex = 0;
    while ((rm = runRe.exec(pXml)) !== null) {
      const runXml = rm[0];
      let runText = '';

      // Văn bản thường
      const wtRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
      let wm: RegExpExecArray | null;
      while ((wm = wtRe.exec(runXml)) !== null) runText += decodeXmlEntities(wm[1]);

      // OMML equation text
      const mtRe = /<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g;
      while ((wm = mtRe.exec(runXml)) !== null) runText += wm[1];

      if (/<w:tab\b/.test(runXml)) runText += '\t';
      if (/<(?:w:br|w:cr)\b/.test(runXml)) runText += '\n';

      // MathType OLE → LaTeX
      const oleM = runXml.match(/<o:OLEObject\b[^>]+r:id="(rId\d+)"/);
      if (oleM) {
        const latex = oleLatexMap.get(oleM[1]) ?? '';
        if (latex) runText += ` ${latex} `;
      }

      // Ảnh (bỏ preview WMF trong w:object của MathType)
      const runForImages = runXml.replace(/<w:object\b[\s\S]*?<\/w:object>/g, '');
      const blipRe = /r:embed="(rId\d+)"/g;
      while ((wm = blipRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1]);
      }
      const vImgRe = /(?:r:id|o:relid)="(rId\d+)"/g;
      while ((wm = vImgRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1]);
      }

      text += runText;
    }

    text = text.normalize('NFC').replace(/[ \t]*\n[ \t]*/g, '\n').trim();

    if (text) {
      lines.push(headingLevel ? `${'#'.repeat(headingLevel + 1)} ${text}` : text);
    }
    // Ảnh của đoạn: đặt sau text, mỗi ảnh một dòng riêng
    for (const rId of imageRIds) {
      const uri = imageByRId.get(rId);
      if (uri) lines.push(`![hình](${uri})`);
    }
  }

  // Ghép: đoạn cách nhau một dòng trống để lượt chia slide tách ý dễ hơn
  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ============================================================
// EXTRACT IMAGES → rId → dataUri
// ============================================================
async function extractImages(zip: JSZip): Promise<Map<string, string>> {
  const rIdToFile = new Map<string, string>(); // rId → filename
  const map = new Map<string, string>(); // rId → dataUri

  const rels = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (rels) {
    const re = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rels)) !== null) {
      if (m[2].includes('media/')) rIdToFile.set(m[1], m[2].split('/').pop() || '');
    }
  }

  const types: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  };

  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path.startsWith('word/media/') || (entry as any).dir) continue;
    const filename = path.split('/').pop() || '';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    // Bỏ WMF/EMF (preview MathType) — trình duyệt không hiển thị được.
    if (ext === 'wmf' || ext === 'emf') continue;
    const base64 = await (entry as any).async('base64');
    const dataUri = `data:${types[ext] || 'image/png'};base64,${base64}`;
    for (const [rId, fname] of rIdToFile.entries()) {
      if (fname === filename) map.set(rId, dataUri);
    }
  }
  return map;
}

// ============================================================
// MATHTYPE OLE (copy rút gọn từ mathWordParserService.ts)
// ============================================================
async function extractOleItems(zip: JSZip): Promise<Array<{ id: string; ole_b64: string }>> {
  const rels = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (!rels) return [];
  const ridToPath = new Map<string, string>();
  const re = /<Relationship\b[^>]*\bId="(rId\d+)"[^>]*\bType="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rels)) !== null) {
    const [, id, type, target] = m;
    if (target.toLowerCase().endsWith('.bin') && type.toLowerCase().includes('oleobject')) {
      ridToPath.set(id, 'word/' + target.replace(/^\.?\//, ''));
    }
  }
  const items: Array<{ id: string; ole_b64: string }> = [];
  for (const [rId, filePath] of ridToPath.entries()) {
    const f = zip.file(filePath);
    if (f) items.push({ id: rId, ole_b64: await f.async('base64') });
  }
  return items;
}

async function wakeUpServer(serverUrl: string, timeoutMs = 90_000): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/health`, {
      signal: (AbortSignal as any).timeout?.(timeoutMs) ?? undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function convertOleToLatex(
  items: Array<{ id: string; ole_b64: string }>,
  serverUrl: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!items.length) return result;
  try {
    const alive = await wakeUpServer(serverUrl, 90_000);
    if (!alive) throw new Error('MathType server health check thất bại');
    const res = await fetch(`${serverUrl}/v1/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, wrap: true }),
      signal: (AbortSignal as any).timeout?.(120_000) ?? undefined,
    });
    if (!res.ok) throw new Error(`Server trả về ${res.status}`);
    const data = await res.json();
    for (const r of data.results || []) {
      if (r.id && r.latex && !r.error) result.set(r.id, r.latex.trim());
    }
  } catch (e) {
    console.warn(`MathType server (${serverUrl}) không khả dụng — bỏ qua công thức OLE:`, e);
  }
  return result;
}
