// services/slideStructureService.ts
//
// Lượt AI thứ hai của luồng "PDF/Word → trình chiếu":
//   Markdown OCR/Word (đã có LaTeX + ảnh base64)  →  SlideDeck có cấu trúc.
//
// Ý tưởng: sau khi lượt 1 đã OCR/parse ra Markdown, lượt này gọi Gemini để
// CHIA bài giảng thành từng slide có ý nghĩa (giống NotebookLM), thay vì cắt
// cơ học theo trang.
//
// Điểm quan trọng về chi phí & độ ổn định:
//   - KHÔNG gửi base64 ảnh cho model (tốn token + model hay làm hỏng chuỗi
//     base64). Ta thay ảnh và công thức LaTeX bằng placeholder trước khi gửi,
//     rồi khôi phục nguyên văn sau khi nhận slide về.
//   - Ép model trả JSON thuần (responseMimeType), parse chắc tay.
//
// SDK dùng chung với aiService.ts hiện có: @google/genai.

import { GoogleGenAI } from '@google/genai';

// ============================================================
// MODEL — người dùng chọn ở giao diện, key lưu localStorage
// ============================================================
export const PRESENTATION_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
] as const;

export type PresentationModel = (typeof PRESENTATION_MODELS)[number];

export const DEFAULT_PRESENTATION_MODEL: PresentationModel = 'gemini-3.5-flash';

// ============================================================
// KIỂU DỮ LIỆU SLIDE
// ============================================================
export type SlideKind = 'title' | 'concept' | 'example' | 'practice' | 'summary' | 'content';

export interface Slide {
  /** Loại slide để renderer tô màu badge / bố cục khác nhau. */
  kind: SlideKind;
  /** Tiêu đề ngắn hiển thị đầu slide. */
  title: string;
  /**
   * Nội dung slide ở dạng Markdown rút gọn (heading nhỏ, gạch đầu dòng, bảng |..|,
   * công thức $...$/$$...$$, và ảnh ![](data:...) đã được khôi phục).
   */
  content: string;
  /** Ghi chú giảng dạy / gợi ý cho giáo viên (không bắt buộc). */
  notes?: string;
}

export interface SlideDeck {
  title: string;
  slides: Slide[];
  model: string;
}

export interface StructureOptions {
  apiKey: string;
  model: PresentationModel;
  markdown: string;
  /** Tiêu đề bài (nếu biết trước, vd tên file). */
  lessonTitle?: string;
  /** Yêu cầu bổ sung của người dùng (vd: "tối đa 12 slide", "thêm slide luyện tập"). */
  instruction?: string;
}

// ============================================================
// PROTECT / RESTORE: ảnh base64 + LaTeX
// ============================================================
interface Protected {
  text: string;
  images: string[];
  latex: string[];
}

function protectMarkdown(markdown: string): Protected {
  const images: string[] = [];
  const latex: string[] = [];
  let text = markdown;

  // 1) Ảnh Markdown có data URI (crop base64). Giữ nguyên, thay bằng token.
  text = text.replace(/!\[[^\]]*\]\(data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+\)/g, (m) => {
    images.push(m);
    return `@@IMG_${images.length - 1}@@`;
  });
  // Ảnh thường (URL http) cũng bảo vệ để model không viết lại sai.
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, (m) => {
    images.push(m);
    return `@@IMG_${images.length - 1}@@`;
  });

  // 2) LaTeX: $$...$$ trước, rồi $...$ để không nuốt nhầm.
  text = text.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    latex.push(m);
    return `@@LAT_${latex.length - 1}@@`;
  });
  text = text.replace(/\$(?!\$)(?:\\.|[^$\n])+?\$/g, (m) => {
    latex.push(m);
    return `@@LAT_${latex.length - 1}@@`;
  });

  return { text, images, latex };
}

function restoreString(value: string, prot: Protected): string {
  let out = value;
  // Khôi phục LaTeX trước, rồi ảnh (ảnh có thể chứa ký tự $ trong URL hiếm gặp).
  prot.latex.forEach((original, i) => {
    out = out.split(`@@LAT_${i}@@`).join(original);
  });
  prot.images.forEach((original, i) => {
    out = out.split(`@@IMG_${i}@@`).join(original);
  });
  return out;
}

// ============================================================
// PROMPT
// ============================================================
function buildPrompt(cleanText: string, lessonTitle: string, instruction?: string): string {
  return [
    'Bạn là trợ lý soạn bài. Hãy chia NỘI DUNG BÀI HỌC dưới đây thành các slide trình chiếu',
    'mạch lạc để giáo viên giảng trên lớp, theo phong cách NotebookLM.',
    '',
    'QUY TẮC BẮT BUỘC:',
    '1. Trả về DUY NHẤT một JSON hợp lệ, không kèm giải thích, không bọc trong ```.',
    '2. Cấu trúc: {"title": string, "slides": [{"kind": string, "title": string, "content": string, "notes": string}]}',
    '   - kind ∈ ["title","concept","example","practice","summary","content"].',
    '   - Slide đầu tiên nên là kind="title" giới thiệu bài; slide cuối nên là kind="summary".',
    '3. GIỮ NGUYÊN TUYỆT ĐỐI mọi token dạng @@IMG_N@@ và @@LAT_N@@ — không sửa, không xoá,',
    '   không thêm ký tự vào giữa token. Đặt token ảnh @@IMG_N@@ vào đúng slide mà nó minh hoạ.',
    '4. content viết bằng Markdown gọn: có thể dùng gạch đầu dòng "-", heading nhỏ "###",',
    '   bảng Markdown với dấu |, in đậm **. KHÔNG bọc content trong ```',
    '5. Không tự giải thêm bài, không bịa nội dung không có trong tài liệu. Được phép diễn đạt lại',
    '   cho dễ trình chiếu và tách ý thành nhiều slide.',
    '6. Mỗi slide gọn (khoảng 3–7 ý), tránh nhồi cả trang chữ vào một slide.',
    '7. notes là gợi ý giảng dạy ngắn cho giáo viên; nếu không có thì để chuỗi rỗng.',
    '',
    instruction?.trim() ? `YÊU CẦU THÊM CỦA NGƯỜI DÙNG: ${instruction.trim()}` : '',
    '',
    lessonTitle ? `TÊN BÀI (gợi ý): ${lessonTitle}` : '',
    'NỘI DUNG BÀI HỌC:',
    '"""',
    cleanText,
    '"""',
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================
// PARSE JSON AN TOÀN
// ============================================================
function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  // Phòng trường hợp model chèn chữ trước/sau JSON: lấy từ { đầu tiên đến } cuối.
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first >= 0 && last > first) return body.slice(first, last + 1);
  return body;
}

function coerceSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const content = typeof o.content === 'string' ? o.content : '';
  const title = typeof o.title === 'string' ? o.title : '';
  if (!content.trim() && !title.trim()) return null;

  const kindRaw = String(o.kind ?? 'content').toLowerCase();
  const kind: SlideKind = (
    ['title', 'concept', 'example', 'practice', 'summary', 'content'] as SlideKind[]
  ).includes(kindRaw as SlideKind)
    ? (kindRaw as SlideKind)
    : 'content';

  const notes = typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim() : undefined;
  return { kind, title: title.trim(), content: content.trim(), notes };
}

// ============================================================
// HÀM CHÍNH
// ============================================================
export async function structureMarkdownIntoSlides(options: StructureOptions): Promise<SlideDeck> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error('Chưa nhập Gemini API key.');
  if (!options.markdown.trim()) throw new Error('Chưa có nội dung Markdown để chia slide.');

  const prot = protectMarkdown(options.markdown);
  const lessonTitle = (options.lessonTitle ?? '').trim();
  const prompt = buildPrompt(prot.text, lessonTitle, options.instruction);

  const ai = new GoogleGenAI({ apiKey });
  let jsonText: string;
  try {
    const response = await ai.models.generateContent({
      model: options.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65_536,
      },
    });
    jsonText = extractText(response);
  } catch (error) {
    throw new Error(toReadableError(error, options.model));
  }

  if (!jsonText.trim()) {
    throw new Error(`Model ${options.model} không trả về nội dung slide.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(jsonText));
  } catch (e) {
    throw new Error(
      `Không đọc được JSON slide từ ${options.model}. ` +
        'Thử lại hoặc đổi model khác. Chi tiết: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  const root = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(root.slides) ? root.slides : [];
  const slides = rawSlides
    .map(coerceSlide)
    .filter((s): s is Slide => s !== null)
    .map((s) => ({
      ...s,
      title: restoreString(s.title, prot),
      content: restoreString(s.content, prot),
      notes: s.notes ? restoreString(s.notes, prot) : undefined,
    }));

  if (slides.length === 0) {
    throw new Error('AI không tạo được slide nào từ nội dung này.');
  }

  const deckTitle =
    (typeof root.title === 'string' && restoreString(root.title, prot).trim()) ||
    lessonTitle ||
    'Bài giảng';

  return { title: deckTitle, slides, model: options.model };
}

// ============================================================
// HELPERS (rút gọn từ aiService.ts)
// ============================================================
function extractText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const value = response as Record<string, unknown>;
  try {
    const direct = value.text;
    if (typeof direct === 'string' && direct.trim()) return direct;
  } catch {
    /* getter text có thể ném lỗi */
  }
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const out: string[] = [];
  for (const c of candidates) {
    const content = (c as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    for (const p of parts) {
      const t = (p as Record<string, unknown>)?.text;
      if (typeof t === 'string' && t) out.push(t);
    }
  }
  return out.join('');
}

function toReadableError(error: unknown, model: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(message))
    return 'Gemini API key không hợp lệ hoặc chưa được cấp quyền.';
  if (/429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(message))
    return `Đã vượt hạn mức/tốc độ gọi API của ${model}.`;
  if (/404|NOT_FOUND|model.*not found/i.test(message))
    return `Không tìm thấy model ${model} trong tài khoản hiện tại.`;
  if (/SAFETY|blocked|PROHIBITED_CONTENT/i.test(message))
    return `Nội dung bị bộ lọc an toàn của ${model} chặn.`;
  if (/fetch|network|Failed to fetch|CORS/i.test(message))
    return `Không kết nối được Gemini API khi dùng ${model}. Kiểm tra mạng và API key.`;
  return `Lỗi ${model}: ${message}`;
}
