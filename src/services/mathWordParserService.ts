// @ts-nocheck
// services/mathWordParserService.ts
// VERSION 9 — SUPABASE EDITION + MATHTYPE OLE
//
// Dựa trên v8 (Supabase, DOM-based) + tích hợp MathType OLE từ v10:
//   ✅ Giữ nguyên toàn bộ logic Supabase (không dùng Firebase)
//   ✅ Giữ nguyên parsePart1WithUnderline, parsePart2, parsePart3
//   ✅ Giữ nguyên detectSections, convertToQuestion, validateExamData
//   ✅ THÊM: phát hiện MathType OLE → gọi backend Render → nhận LaTeX
//   ✅ THÊM: extractParagraphsRaw (raw XML) khi có MathType (giữ thứ tự token)
//   ✅ THÊM: findOptionMarkers (LaTeX-aware, không split B) trong $P(A|B)$)
//   ✅ Fallback: nếu server không reach được → tiếp tục với text-only (DOM path)

import JSZip from 'jszip';
import { ExamData, Question, QuestionOption, ImageData } from '../types';

// ============================================================
// CONFIG — backend Render xử lý MathType OLE
// Đặt biến môi trường: VITE_MATHTYPE_SERVER_URL=https://your-app.onrender.com
// ============================================================
const MATHTYPE_SERVER_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MATHTYPE_SERVER_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_MATHTYPE_SERVER_URL) ||
  'http://localhost:8000';

// ============================================================
// TYPES
// ============================================================
type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'writing' | 'unknown';

interface ParsedQuestion {
  number: number;
  globalIndex: number;
  part: number;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correctAnswer: string | null;
  solution: string;
  images: ImageData[];
  solutionImages: ImageData[];
}

interface ParagraphData {
  text: string;
  imageRIds: string[];
  hasUnderline: boolean;
  underlinedSegments: string[];
}

// ============================================================
// TEXT NORMALIZATION  (giữ nguyên từ v8)
// ============================================================

function normalizeVietnamese(text: string): string {
  if (!text) return '';
  return text.normalize('NFC');
}

function normalizeLatex(text: string): string {
  if (!text) return '';
  let s = text;
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$$$');
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
  s = s.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  s = s.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  s = s.replace(/\${3,}/g, '$$');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function escapeHtmlPreserveLaTeX(text: string): string {
  if (!text) return '';
  const blocks: string[] = [];
  const protect = (m: string): string => { blocks.push(m); return `__LB_${blocks.length - 1}__`; };
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, protect);
  text = text.replace(/\$(?!\$)([\s\S]*?)\$(?!\$)/g, protect);
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (let i = 0; i < blocks.length; i++) text = text.replace(`__LB_${i}__`, blocks[i]);
  return text;
}


function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// ============================================================
// OPTION PARSING UTILITIES — LaTeX-aware (v9)
// ============================================================

/**
 * Tìm vị trí option marker A./A) B./B) C./C) D./D)
 * CHỈ bên ngoài $...$  — fix trường hợp $P(A\|B)$ bị split tại B)
 */
function findOptionMarkers(
  text: string,
  startLetter: 'A' | 'C' = 'A',
): Array<{ markerStart: number; contentStart: number }> | null {
  const letters = startLetter === 'A' ? ['A', 'B', 'C', 'D'] : ['C', 'D'];
  const result: Array<{ markerStart: number; contentStart: number }> = [];
  let inDollar = false;
  let letterIdx = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) inDollar = !inDollar;

    if (!inDollar && letterIdx < letters.length) {
      const letter = letters[letterIdx];
      const charMatch = text[i].toUpperCase() === letter;
      const prevOk = i === 0 || /[\s$.)\]]/.test(text[i - 1]);
      const next = i + 1 < text.length ? text[i + 1] : '';
      const nextOk = next === '.' || next === ')';

      if (charMatch && prevOk && nextOk) {
        let contentStart = i + 2;
        while (contentStart < text.length && text[contentStart] === ' ') contentStart++;
        result.push({ markerStart: i, contentStart });
        letterIdx++;
        i = contentStart - 1;
      }
    }
  }
  return result.length === letters.length ? result : null;
}

/** Parse "A. ... B. ... C. ... D. ..." trên 1 dòng — LaTeX-aware */
function parseSingleLineOptions(text: string): QuestionOption[] | null {
  const t = text.trim();
  if (!/^A[.)]/i.test(t)) return null;
  const markers = findOptionMarkers(t, 'A');
  if (!markers || markers.length !== 4) return null;
  const letters = ['A', 'B', 'C', 'D'] as const;
  return letters.map((letter, i) => ({
    letter,
    text: t.slice(markers[i].contentStart, i < 3 ? markers[i + 1].markerStart : t.length)
           .trim().replace(/\.\s*$/, '').trim(),
  }));
}

/** Parse "A. ... B. ..." hoặc "C. ... D. ..." — LaTeX-aware */
function parseHalfLineOptions(text: string, start: 'A' | 'C'): QuestionOption[] | null {
  const t = text.trim();
  const [l1, l2] = start === 'A' ? (['A', 'B'] as const) : (['C', 'D'] as const);
  if (!new RegExp(`^${l1}[.)]`, 'i').test(t)) return null;
  const markers = findOptionMarkers(t, start);
  if (!markers || markers.length !== 2) return null;
  return [
    { letter: l1, text: t.slice(markers[0].contentStart, markers[1].markerStart).trim().replace(/\.\s*$/, '').trim() },
    { letter: l2, text: t.slice(markers[1].contentStart).trim().replace(/\.\s*$/, '').trim() },
  ];
}

function isSingleLineOptionPara(text: string): boolean {
  if (!/^A[.)]/i.test(text.trim())) return false;
  const m = findOptionMarkers(text.trim(), 'A');
  return m !== null && m.length >= 2;
}
function isFirstHalfOptionPara(text: string): boolean {
  if (!/^A[.)]/i.test(text.trim())) return false;
  const m = findOptionMarkers(text.trim(), 'A');
  if (!m || m.length < 2) return false;
  return findOptionMarkers(text.slice(m[1].contentStart).trim(), 'C') === null;
}
function isSecondHalfOptionPara(text: string): boolean {
  if (!/^C[.)]/i.test(text.trim())) return false;
  const m = findOptionMarkers(text.trim(), 'C');
  return m !== null && m.length >= 2;
}

// ============================================================
// MATHTYPE OLE — EXTRACT + CONVERT QUA BACKEND RENDER
// ============================================================

/**
 * Trích xuất các OLE item (rId → base64 binary) từ DOCX.
 * Chỉ lấy file .bin có type oleobject.
 */
async function extractOleItems(
  zip: JSZip
): Promise<Array<{ id: string; ole_b64: string }>> {
  const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (!relsContent) return [];

  const ridToPath = new Map<string, string>();
  const re = /<Relationship\b[^>]*\bId="(rId\d+)"[^>]*\bType="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsContent)) !== null) {
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

/**
 * Ping /health để wake up server Render (cold start ~50-60s).
 */
async function wakeUpServer(serverUrl: string, timeoutMs = 90_000): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/health`, {
      signal: AbortSignal.timeout?.(timeoutMs) ?? undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Gọi backend /v1/convert: gửi OLE base64, nhận LaTeX.
 * Trả về Map<rId, latexString>.
 * Nếu server không reach → trả về Map rỗng (graceful fallback).
 */
async function convertOleToLatex(
  items: Array<{ id: string; ole_b64: string }>,
  serverUrl: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!items.length) return result;

  try {
    console.log(`⏳ Kết nối MathType server... (có thể mất ~60s lần đầu)`);
    const alive = await wakeUpServer(serverUrl, 90_000);
    if (!alive) throw new Error('Server health check thất bại');

    const res = await fetch(`${serverUrl}/v1/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, wrap: true }),
      signal: AbortSignal.timeout?.(120_000) ?? undefined,
    });
    if (!res.ok) throw new Error(`Server trả về ${res.status}`);

    const data = await res.json();
    for (const r of data.results || []) {
      if (r.id && r.latex && !r.error) result.set(r.id, r.latex.trim());
    }
    console.log(`🔢 MathType: ${result.size}/${items.length} công thức đã chuyển đổi`);
  } catch (e) {
    console.warn(`⚠️  MathType server (${serverUrl}) không khả dụng — tiếp tục không có LaTeX:`, e);
  }
  return result;
}

// ============================================================
// EXTRACT PARAGRAPHS — RAW XML PATH (khi có MathType OLE)
// Dùng regex trên raw XML để giữ đúng thứ tự text + OLE token.
// ============================================================

function extractParagraphsRaw(
  documentXml: string,
  oleLatexMap: Map<string, string>
): ParagraphData[] {
  const paragraphs: ParagraphData[] = [];
  const paraRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  const runRe  = /<w:r\b[\s\S]*?<\/w:r>/g;

  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(documentXml)) !== null) {
    const pXml = pm[0];
    let text = '';
    let hasUnderline = false;
    const underlinedSegments: string[] = [];
    const imageRIds: string[] = [];

    let rm: RegExpExecArray | null;
    runRe.lastIndex = 0;
    while ((rm = runRe.exec(pXml)) !== null) {
      const runXml = rm[0];

      // underline detection
      const rPrBlock = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
      const isUnderlined = /<w:u\b/.test(rPrBlock);

      let runText = '';

      // w:t — văn bản thường
      const wtRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
      let wm: RegExpExecArray | null;
      while ((wm = wtRe.exec(runXml)) !== null) runText += decodeXmlEntities(wm[1]);

      // m:t — OMML equation text
      const mtRe = /<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g;
      while ((wm = mtRe.exec(runXml)) !== null) runText += wm[1];

      // tab / line break
      if (/<w:tab\b/.test(runXml)) runText += '\t';
      if (/<(?:w:br|w:cr)\b/.test(runXml)) runText += '\n';

      // OLE object → thay bằng LaTeX từ server
      const oleM = runXml.match(/<o:OLEObject\b[^>]+r:id="(rId\d+)"/);
      if (oleM) {
        const latex = oleLatexMap.get(oleM[1]) ?? '';
        if (latex) runText += ` ${latex} `;
      }

      // Ảnh — bỏ qua preview WMF của MathType (trong w:object)
      const runForImages = runXml.replace(/<w:object\b[\s\S]*?<\/w:object>/g, '');
      const blipRe = /r:embed="(rId\d+)"/g;
      while ((wm = blipRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1]);
      }
      const vImgRe = /(?:r:id|o:relid)="(rId\d+)"/g;
      while ((wm = vImgRe.exec(runForImages)) !== null) {
        if (!imageRIds.includes(wm[1])) imageRIds.push(wm[1]);
      }

      if (isUnderlined && runText.trim()) {
        hasUnderline = true;
        underlinedSegments.push(runText.trim());
      }
      text += runText;
    }

    // Markdown underline: [X]{.underline}
    const mdUlRe = /\[([A-Da-d])\]\{\.underline\}/g;
    let mdM: RegExpExecArray | null;
    while ((mdM = mdUlRe.exec(text)) !== null) {
      hasUnderline = true;
      underlinedSegments.push(mdM[1]);
    }
    text = text.replace(/\[([A-Da-d])\]\{\.underline\}/g, '$1');
    text = normalizeVietnamese(text.trim());
    text = normalizeLatex(text);
    text = text.replace(/[ \t]*\n[ \t]*/g, '\n').trim();

    if (text || imageRIds.length > 0) {
      paragraphs.push({ text, imageRIds, hasUnderline, underlinedSegments });
    }
  }
  return paragraphs;
}

// ============================================================
// EXTRACT PARAGRAPHS — DOM PATH (v8 gốc, không có MathType OLE)
// ============================================================

function extractParagraphsWithUnderline(
  xmlDoc: Document,
  _imageRelMap: Map<string, string>
): ParagraphData[] {
  const paragraphs: ParagraphData[] = [];
  const pElements = xmlDoc.getElementsByTagName('w:p');

  for (let i = 0; i < pElements.length; i++) {
    const p = pElements[i];
    let text = '';
    const imageRIds: string[] = [];
    let hasUnderline = false;
    const underlinedSegments: string[] = [];
    const runs = p.getElementsByTagName('w:r');

    for (let j = 0; j < runs.length; j++) {
      const run = runs[j];

      const blips = run.getElementsByTagName('a:blip');
      for (let k = 0; k < blips.length; k++) {
        const embed = blips[k].getAttribute('r:embed');
        if (embed) imageRIds.push(embed);
      }
      const vImg = run.getElementsByTagName('v:imagedata');
      for (let k = 0; k < vImg.length; k++) {
        const rid = vImg[k].getAttribute('r:id') || vImg[k].getAttribute('o:relid');
        if (rid) imageRIds.push(rid);
      }
      const drawings = run.getElementsByTagName('w:drawing');
      for (let k = 0; k < drawings.length; k++) {
        const inner = drawings[k].getElementsByTagName('a:blip');
        for (let l = 0; l < inner.length; l++) {
          const e = inner[l].getAttribute('r:embed');
          if (e && !imageRIds.includes(e)) imageRIds.push(e);
        }
      }

      const rPr = run.getElementsByTagName('w:rPr')[0];
      const isUnderlined = rPr ? rPr.getElementsByTagName('w:u').length > 0 : false;

      let runText = '';
      const wt = run.getElementsByTagName('w:t');
      for (let k = 0; k < wt.length; k++) runText += wt[k].textContent || '';
      const mt = run.getElementsByTagName('m:t');
      for (let k = 0; k < mt.length; k++) runText += mt[k].textContent || '';
      const brs = run.getElementsByTagName('w:br');
      if (brs.length > 0) runText += '\n'.repeat(brs.length);

      if (isUnderlined && runText.trim()) {
        hasUnderline = true;
        underlinedSegments.push(runText.trim());
      }
      text += runText;
    }

    text = normalizeVietnamese(text.trim());
    text = normalizeLatex(text);

    const mdUlRe = /\[([A-Da-d])\]\{\.underline\}/g;
    let mdM: RegExpExecArray | null;
    while ((mdM = mdUlRe.exec(text)) !== null) {
      hasUnderline = true;
      underlinedSegments.push(mdM[1]);
    }
    text = text.replace(/\[([A-Da-d])\]\{\.underline\}/g, '$1');
    text = text.replace(/[ \t]*\n[ \t]*/g, '\n').trim();

    if (text || imageRIds.length > 0) {
      paragraphs.push({ text, imageRIds, hasUnderline, underlinedSegments });
    }
  }
  return paragraphs;
}

// ============================================================
// MAIN EXPORT
// Tự động detect MathType OLE:
//   - Có OLE → gọi backend Render → extractParagraphsRaw
//   - Không có OLE → DOM path (v8 gốc)
// ============================================================

export const parseWordToExam = async (
  file: File,
  config?: { mathTypeServerUrl?: string }
): Promise<ExamData> => {
  console.log('📄 Parsing Word file:', file.name);
  const serverUrl = config?.mathTypeServerUrl ?? MATHTYPE_SERVER_URL;

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Extract images
  const { images, imageRelMap } = await extractImages(zip);
  console.log('🖼️  Extracted images:', images.length);

  // 2. Phát hiện MathType OLE
  const oleItems = await extractOleItems(zip);
  const hasMathType = oleItems.length > 0;
  console.log(
    hasMathType
      ? `🔢 MathType phát hiện: ${oleItems.length} OLE objects → gọi backend`
      : '✏️  Không có MathType OLE — dùng DOM parser'
  );

  // 3. Chuyển đổi OLE → LaTeX (nếu có)
  let oleLatexMap = new Map<string, string>();
  if (hasMathType) {
    oleLatexMap = await convertOleToLatex(oleItems, serverUrl);
  }

  // 4. Đọc document.xml
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Không tìm thấy document.xml trong file Word');

  // 5. Trích xuất paragraph theo đường dẫn phù hợp
  let paragraphs: ParagraphData[];
  if (hasMathType) {
    // Raw XML — giữ đúng thứ tự text + OLE (thay bằng LaTeX)
    paragraphs = extractParagraphsRaw(documentXml, oleLatexMap);
    console.log('📝 Paragraphs (raw/OLE path):', paragraphs.length);
  } else {
    // DOM-based (v8 gốc)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(documentXml, 'application/xml');
    paragraphs = extractParagraphsWithUnderline(xmlDoc, imageRelMap);
    console.log('📝 Paragraphs (DOM path):', paragraphs.length);
  }

  // 6. Parse câu hỏi (giữ nguyên logic v8)
  const examData = parseAllQuestions(paragraphs, images);
  examData.title = file.name.replace(/\.docx$/i, '');
  examData.images = images;

  console.log('✅ Câu hỏi đã parse:', examData.questions.length);
  console.log('📊 Sections:', examData.sections.length);
  return examData;
};

// ============================================================
// EXTRACT IMAGES  (giữ nguyên từ v8)
// ============================================================

async function extractImages(
  zip: JSZip
): Promise<{ images: ImageData[]; imageRelMap: Map<string, string> }> {
  const images: ImageData[] = [];
  const imageRelMap = new Map<string, string>();

  try {
    const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (relsContent) {
      const relPattern = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = relPattern.exec(relsContent)) !== null) {
        const rId = match[1];
        const target = match[2];
        if (target.includes('media/')) {
          imageRelMap.set(rId, target.split('/').pop() || '');
        }
      }
    }

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (path.startsWith('word/media/') && !zipEntry.dir) {
        const filename = path.split('/').pop() || '';
        const data = await zipEntry.async('base64');
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const types: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
        };
        let rId = '';
        for (const [rid, fname] of imageRelMap.entries()) {
          if (fname === filename) { rId = rid; break; }
        }
        images.push({
          id: `img_${images.length}`, filename, base64: data,
          contentType: types[ext] || 'image/png', rId,
        });
      }
    }
  } catch (err) {
    console.warn('⚠️  Lỗi khi trích xuất ảnh:', err);
  }
  return { images, imageRelMap };
}

// ============================================================
// DETECT SECTIONS  (giữ nguyên từ v8)
// ============================================================

interface SectionInfo {
  part1Start: number;
  part2Start: number;
  part3Start: number;
}

function detectSections(_fullText: string, paragraphs: ParagraphData[]): SectionInfo {
  const info: SectionInfo = { part1Start: -1, part2Start: -1, part3Start: -1 };

  const p1 = [/PHẦN\s*1/i, /PHAN\s*1/i, /PHẦN\s+I[.\s]/i, /Phần\s*1/i,
               /I\.\s*TRẮC\s*NGHIỆM/i, /I\.\s*TRAC\s*NGHIEM/i];
  const p2 = [/PHẦN\s*2/i, /PHAN\s*2/i, /PHẦN\s+II[.\s]/i, /Phần\s*2/i,
               /II\.\s*ĐÚNG\s*SAI/i, /II\.\s*DUNG\s*SAI/i, /ĐÚNG\s*SAI/i, /DUNG\s*SAI/i];
  const p3 = [/PHẦN\s*3/i, /PHAN\s*3/i, /PHẦN\s+III[.\s]/i, /Phần\s*3/i,
               /III\.\s*TRẢ\s*LỜI/i, /III\.\s*TRA\s*LOI/i, /TRẢ\s*LỜI\s*NGẮN/i, /TRA\s*LOI\s*NGAN/i];

  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i].text;
    if (info.part1Start === -1 && p1.some(re => re.test(t))) info.part1Start = i;
    if (info.part2Start === -1 && i > info.part1Start && p2.some(re => re.test(t))) info.part2Start = i;
    if (info.part3Start === -1 && i > Math.max(info.part1Start, info.part2Start) && p3.some(re => re.test(t))) info.part3Start = i;
  }

  if (info.part1Start === -1) info.part1Start = 0;
  if (info.part2Start === -1) info.part2Start = paragraphs.length;
  if (info.part3Start === -1) info.part3Start = paragraphs.length;
  return info;
}

// ============================================================
// PARSE ALL QUESTIONS  (giữ nguyên từ v8)
// ============================================================

function parseAllQuestions(paragraphs: ParagraphData[], images: ImageData[]): ExamData {
  const examData: ExamData = {
    title: '', timeLimit: 90, sections: [], questions: [], answers: {}, images: [],
  };

  const fullText = paragraphs.map(p => p.text).join('\n');
  const sectionInfo = detectSections(fullText, paragraphs);
  console.log('📊 Section info:', sectionInfo);

  const part1Qs = parsePart1WithUnderline(paragraphs, sectionInfo.part1Start, sectionInfo.part2Start, images);
  const part2Qs = parsePart2(paragraphs, sectionInfo.part2Start, sectionInfo.part3Start, images);
  const part3Qs = parsePart3(paragraphs, sectionInfo.part3Start, paragraphs.length, images);

  console.log(`📊 Parse kết quả: PHẦN 1=${part1Qs.length} PHẦN 2=${part2Qs.length} PHẦN 3=${part3Qs.length}`);

  let gi = 0;

  if (part1Qs.length > 0) {
    const qs: Question[] = [];
    for (const pq of part1Qs) {
      const q = convertToQuestion(pq, gi++);
      qs.push(q); examData.questions.push(q);
      if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
    }
    examData.sections.push({
      name: 'PHẦN 1. Trắc nghiệm nhiều lựa chọn',
      description: 'Thí sinh chọn một phương án đúng A, B, C hoặc D',
      points: '', questions: qs, sectionType: 'multiple_choice',
    });
  }

  if (part2Qs.length > 0) {
    const qs: Question[] = [];
    for (const pq of part2Qs) {
      const q = convertToQuestion(pq, gi++);
      qs.push(q); examData.questions.push(q);
    }
    examData.sections.push({
      name: 'PHẦN 2. Trắc nghiệm đúng sai',
      description: 'Thí sinh chọn Đúng hoặc Sai cho mỗi ý a), b), c), d)',
      points: '', questions: qs, sectionType: 'true_false',
    });
  }

  if (part3Qs.length > 0) {
    const shortQs  = part3Qs.filter(q => q.type === 'short_answer');
    const writingQs = part3Qs.filter(q => q.type === 'writing');

    if (shortQs.length > 0) {
      const qs: Question[] = [];
      for (const pq of shortQs) {
        const q = convertToQuestion(pq, gi++);
        qs.push(q); examData.questions.push(q);
        if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
      }
      examData.sections.push({
        name: 'PHẦN 3. Trắc nghiệm trả lời ngắn',
        description: 'Thí sinh điền đáp án số vào ô trống',
        points: '', questions: qs, sectionType: 'short_answer',
      });
    }

    if (writingQs.length > 0) {
      const qs: Question[] = [];
      for (const pq of writingQs) {
        const q = convertToQuestion(pq, gi++);
        qs.push(q); examData.questions.push(q);
      }
      examData.sections.push({
        name: 'PHẦN 4. Tự luận',
        description: 'Thí sinh trình bày lời giải chi tiết, có thể đính kèm hình ảnh bài làm',
        points: '', questions: qs, sectionType: 'writing' as any,
      });
    }
  }

  return examData;
}

// ============================================================
// PARSE PART 1: MULTIPLE CHOICE  (giữ nguyên từ v8 — parsePart1WithUnderline)
// ============================================================

function parsePart1WithUnderline(
  paragraphs: ParagraphData[],
  startIdx: number,
  endIdx: number,
  images: ImageData[]
): ParsedQuestion[] {
  if (startIdx < 0 || endIdx <= startIdx) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;

  let collectingContent = false;
  let contentBuffer: string[] = [];
  let inSolution = false;
  let solutionBuffer: string[] = [];
  let currentQuestionUnderlinedLetters: string[] = [];
  let currentOptionIndex = -1;
  let startedOptions = false;

  const questionPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const optionPattern   = /^\s*([A-D])\s*[.\)]\s*(.*)/i;
  const answerPattern   = /Ch(?:ọn|on)\s*([A-D])/i;

  const flushQ = () => {
    if (!currentQ) return;
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join(' ').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();
    if (!currentQ.correctAnswer && currentQuestionUnderlinedLetters.length > 0) {
      const ans = currentQuestionUnderlinedLetters.find(l => /^[A-D]$/i.test(l));
      if (ans) {
        currentQ.correctAnswer = ans.toUpperCase();
        console.log(`📝 Câu ${currentQ.number}: đáp án từ underline = ${currentQ.correctAnswer}`);
      }
    }
    if (currentQ.text) questions.push(currentQ);
  };

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const { text, imageRIds } = para;

    if (!text && imageRIds.length === 0) continue;
    if (/PHẦN\s*\d/i.test(text) || /PHAN\s*\d/i.test(text) ||
        /Trắc\s*nghiệm/i.test(text) || /Trac\s*nghiem/i.test(text)) continue;

    const qMatch = text.match(questionPattern);
    if (qMatch) {
      flushQ();
      const qNum = parseInt(qMatch[1]);
      currentQ = {
        number: qNum, globalIndex: 0, part: 1, type: 'multiple_choice',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      };
      collectingContent = true; inSolution = false;
      contentBuffer = qMatch[2].trim() ? [qMatch[2].trim()] : [];
      solutionBuffer = []; currentQuestionUnderlinedLetters = [];
      currentOptionIndex = -1; startedOptions = false;
      if (para.hasUnderline) currentQuestionUnderlinedLetters.push(...para.underlinedSegments);
      if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
      continue;
    }

    if (!currentQ) continue;

    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text)) {
      if (contentBuffer.length > 0 && !currentQ.text) { currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = []; }
      collectingContent = false; inSolution = true; solutionBuffer = [];
      continue;
    }

    const chonM = text.match(answerPattern);
    if (chonM) { currentQ.correctAnswer = chonM[1].toUpperCase(); continue; }

    // ── Single-line options "A. ... B. ... C. ... D. ..." (LaTeX-aware) ──
    if (collectingContent && isSingleLineOptionPara(text)) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = [];
      }
      const singleOpts = parseSingleLineOptions(text);
      if (singleOpts) {
        currentQ.options = singleOpts;
        startedOptions = true; currentOptionIndex = singleOpts.length - 1;
        if (para.hasUnderline) singleOpts.forEach(o => { if (o.text) currentQuestionUnderlinedLetters.push(o.letter); });
        if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
        continue;
      }
    }

    // ── Half-line: "A. ... B. ..." ──
    if (collectingContent && isFirstHalfOptionPara(text)) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = [];
      }
      const halfOpts = parseHalfLineOptions(text, 'A');
      if (halfOpts) {
        currentQ.options = halfOpts;
        startedOptions = true; currentOptionIndex = halfOpts.length - 1;
        if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
        continue;
      }
    }

    // ── Half-line: "C. ... D. ..." ──
    if (collectingContent && startedOptions && currentQ.options.length === 2 && isSecondHalfOptionPara(text)) {
      const halfOpts = parseHalfLineOptions(text, 'C');
      if (halfOpts) {
        currentQ.options.push(...halfOpts);
        currentOptionIndex = currentQ.options.length - 1;
        if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
        continue;
      }
    }

    // ── Option trên paragraph riêng: "A. ..." ──
    const optM = text.match(optionPattern);
    if (optM && collectingContent) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = [];
      }
      const letter = optM[1].toUpperCase();
      currentQ.options.push({ letter, text: (optM[2] || '').trim() });
      currentOptionIndex = currentQ.options.length - 1;
      startedOptions = true;
      if (para.hasUnderline) {
        currentQuestionUnderlinedLetters.push(letter);
        console.log(`🔍 Underline option ${letter} câu ${currentQ.number}`);
      }
      continue;
    }

    // Multiline option continuation
    if (collectingContent && startedOptions && currentOptionIndex >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        currentQ.options[currentOptionIndex].text =
          (currentQ.options[currentOptionIndex].text + ' ' + text).trim();
        if (para.hasUnderline) currentQuestionUnderlinedLetters.push(currentQ.options[currentOptionIndex].letter);
      }
      if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
      continue;
    }

    if (collectingContent && text && !inSolution && !startedOptions) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) { if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images); continue; }
      contentBuffer.push(text);
      if (para.hasUnderline) currentQuestionUnderlinedLetters.push(...para.underlinedSegments);
    }
    if (inSolution && text && !/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text);
    if (imageRIds.length > 0) attachImages(inSolution ? currentQ.solutionImages : currentQ.images, imageRIds, images);
  }

  flushQ();
  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// PARSE PART 2: TRUE/FALSE  (giữ nguyên từ v8)
// ============================================================

function parsePart2(
  paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ImageData[]
): ParsedQuestion[] {
  if (startIdx < 0 || endIdx <= startIdx || startIdx >= paragraphs.length) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;
  let collectingContent = false;
  let contentBuffer: string[] = [];
  let inSolution = false;
  let solutionBuffer: string[] = [];
  let currentQuestionTrueStatements: Set<string> = new Set();
  let currentStmtIndex = -1;
  let startedStatements = false;

  const questionPattern  = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const statementPattern = /^\s*([a-d])\s*[\)\.]\s*(.*)/i;

  const flushQ = () => {
    if (!currentQ) return;
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join(' ').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();
    if (!currentQ.correctAnswer && currentQuestionTrueStatements.size > 0) {
      currentQ.correctAnswer = Array.from(currentQuestionTrueStatements).sort().join(',');
      console.log(`📝 Câu ${currentQ.number} (Đúng/Sai): underline = ${currentQ.correctAnswer}`);
    }
    if (currentQ.text) questions.push(currentQ);
  };

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const { text, imageRIds } = para;

    if (!text && imageRIds.length === 0) continue;
    if (/PHẦN\s*\d/i.test(text) || /PHAN\s*\d/i.test(text)) continue;

    const qMatch = text.match(questionPattern);
    if (qMatch) {
      flushQ();
      currentQ = {
        number: parseInt(qMatch[1]), globalIndex: 0, part: 2, type: 'true_false',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      };
      collectingContent = true; inSolution = false;
      contentBuffer = qMatch[2].trim() ? [qMatch[2].trim()] : [];
      solutionBuffer = []; currentQuestionTrueStatements = new Set();
      currentStmtIndex = -1; startedStatements = false;
      if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
      continue;
    }

    if (!currentQ) continue;

    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text)) {
      if (contentBuffer.length > 0 && !currentQ.text) { currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = []; }
      collectingContent = false; inSolution = true; solutionBuffer = [];
      continue;
    }

    const stmtM = text.match(statementPattern);
    if (stmtM && collectingContent) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = [];
      }
      const letter = stmtM[1].toLowerCase();
      currentQ.options.push({ letter, text: (stmtM[2] || '').trim() });
      currentStmtIndex = currentQ.options.length - 1;
      startedStatements = true;
      if (para.hasUnderline) {
        currentQuestionTrueStatements.add(letter);
        console.log(`🔍 Underline statement ${letter} câu ${currentQ.number}`);
      }
      continue;
    }

    if (collectingContent && startedStatements && currentStmtIndex >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        currentQ.options[currentStmtIndex].text =
          (currentQ.options[currentStmtIndex].text + ' ' + text).trim();
        if (para.hasUnderline) currentQuestionTrueStatements.add(currentQ.options[currentStmtIndex].letter.toLowerCase());
      }
      if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
      continue;
    }

    if (collectingContent && text && !inSolution && !startedStatements) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) contentBuffer.push(text);
    }
    if (inSolution && text && !/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text);
    if (imageRIds.length > 0) attachImages(inSolution ? currentQ.solutionImages : currentQ.images, imageRIds, images);
  }

  flushQ();
  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// PARSE PART 3: SHORT ANSWER / WRITING  (giữ nguyên từ v8)
// ============================================================

function parsePart3(
  paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ImageData[]
): ParsedQuestion[] {
  if (startIdx < 0 || startIdx >= paragraphs.length) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;
  let collectingContent = false;
  let contentBuffer: string[] = [];
  let solutionBuffer: string[] = [];

  const questionPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const answerPattern   = /^[*\s]*(?:Đ|D)áp\s*(?:án|an)[:\s]*(.+)/i;

  const flushQ = () => {
    if (!currentQ) return;
    if (contentBuffer.length > 0) currentQ.text = contentBuffer.join(' ').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();
    if (!currentQ.correctAnswer) { currentQ.type = 'writing'; currentQ.part = 4; }
    if (currentQ.text) questions.push(currentQ);
  };

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const { text, imageRIds } = para;

    if (!text && imageRIds.length === 0) continue;
    if (/PHẦN\s*\d/i.test(text) || /PHAN\s*\d/i.test(text)) continue;

    const qMatch = text.match(questionPattern);
    if (qMatch) {
      flushQ();
      currentQ = {
        number: parseInt(qMatch[1]), globalIndex: 0, part: 3, type: 'short_answer',
        text: '', options: [], correctAnswer: null, solution: '', images: [], solutionImages: [],
      };
      collectingContent = true;
      contentBuffer = qMatch[2].trim() ? [qMatch[2].trim()] : [];
      solutionBuffer = [];
      if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images);
      continue;
    }

    if (!currentQ) continue;

    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text)) {
      if (contentBuffer.length > 0) { currentQ.text = contentBuffer.join(' ').trim(); contentBuffer = []; }
      collectingContent = false; solutionBuffer = [];
      continue;
    }

    const ansM = text.match(answerPattern);
    if (ansM) { currentQ.correctAnswer = ansM[1].trim(); continue; }

    if (collectingContent && text) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) { if (imageRIds.length > 0) attachImages(currentQ.images, imageRIds, images); continue; }
      contentBuffer.push(text);
    }
    if (!collectingContent && text && !/^C(?:âu|au)\s*\d+/.test(text)) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text) && !answerPattern.test(text)) solutionBuffer.push(text);
    }
    // collectingContent = đang ở thân câu hỏi → images; ngược lại đang ở lời giải → solutionImages
    if (imageRIds.length > 0) attachImages(collectingContent ? currentQ.images : currentQ.solutionImages, imageRIds, images);
  }

  flushQ();
  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// HELPERS  (giữ nguyên từ v8)
// ============================================================

// target: mảng đích — currentQ.images (ảnh đề) hoặc currentQ.solutionImages (ảnh lời giải)
function attachImages(target: ImageData[], rIds: string[], images: ImageData[]): void {
  for (const rId of rIds) {
    const img = images.find(i => i.rId === rId) ||
                images.find(i => i.filename && rId.includes(i.filename));
    if (img && !target.find(i => i.id === img!.id)) target.push(img);
  }
}

function convertToQuestion(pq: ParsedQuestion, globalIndex: number): Question {
  return {
    number: pq.part * 100 + pq.number,
    text: escapeHtmlPreserveLaTeX(pq.text),
    type: pq.type,
    options: pq.options.map(o => ({ ...o, text: escapeHtmlPreserveLaTeX(o.text) })),
    correctAnswer: pq.correctAnswer,
    part: `PHẦN ${pq.part}`,
    images: pq.images,
    solutionImages: pq.solutionImages,
    solution: pq.solution,
    section: { letter: String(pq.part), name: getPartName(pq.part), points: '' },
  };
}

function getPartName(part: number): string {
  switch (part) {
    case 1: return 'Trắc nghiệm nhiều lựa chọn';
    case 2: return 'Trắc nghiệm đúng sai';
    case 3: return 'Trắc nghiệm trả lời ngắn';
    case 4: return 'Tự luận';
    default: return '';
  }
}

// ============================================================
// VALIDATE  (giữ nguyên từ v8)
// ============================================================

export const validateExamData = (data: ExamData): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!data.questions || data.questions.length === 0)
    errors.push('Không tìm thấy câu hỏi nào trong file');

  let p1 = 0, p2 = 0, p3 = 0, p4 = 0, withAns = 0, noAns = 0;
  data.questions.forEach((q: Question) => {
    if (!q.text?.trim()) errors.push(`Câu ${q.number}: Thiếu nội dung câu hỏi`);
    const part = Math.floor(q.number / 100);
    if (part === 1) p1++; else if (part === 2) p2++; else if (part === 3) p3++; else p4++;
    q.correctAnswer ? withAns++ : noAns++;
  });
  console.log(`📊 PHẦN 1=${p1} PHẦN 2=${p2} PHẦN 3=${p3} PHẦN 4(TL)=${p4} | Có đáp án=${withAns} Chưa=${noAns}`);
  return { valid: errors.length === 0, errors };
};

// ============================================================
// UTILITIES  (giữ nguyên từ v8)
// ============================================================

export function isWebCompatibleImage(contentType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(contentType);
}

export function getImageDataUrl(img: { base64: string; contentType: string }): string {
  return img.base64 ? `data:${img.contentType};base64,${img.base64}` : '';
}
