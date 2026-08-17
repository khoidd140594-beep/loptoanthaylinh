// @ts-nocheck
// services/similarQuestionService.ts

const STORAGE_KEY = 'similar_question_gemini_key'

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || ''
}
export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export interface SimilarQuestion {
  text: string
  type: string
  options?: { letter: string; text: string }[]
  correctAnswer: string
  solution?: string
}

// ─── Strip HTML tags ──────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ─── Chuyển câu hỏi gốc thành plain text ─────────────────────────────────────
function questionToText(q: any): string {
  let out = `Nội dung: ${stripHtml(q.text)}\n`
  if (q.options?.length > 0) {
    out += 'Lựa chọn:\n'
    q.options.forEach((opt: any) => {
      out += `  ${opt.letter.toUpperCase()}. ${stripHtml(opt.text)}\n`
    })
  }
  if (q.correctAnswer) out += `Đáp án đúng: ${q.correctAnswer}\n`
  if (q.solution)      out += `Lời giải: ${stripHtml(q.solution)}\n`
  return out
}

// ─── Parse delimiter-based response ──────────────────────────────────────────
// Format mỗi câu:
// ##BEGIN_QUESTION##
// TYPE: multiple_choice
// TEXT: ...
// OPTION_A: ...   (chỉ có với trắc nghiệm / đúng sai)
// ANSWER: B
// SOLUTION: ...
// ##END_QUESTION##

function parseDelimitedResponse(raw: string, expectedType: string): SimilarQuestion[] {
  const questions: SimilarQuestion[] = []

  // Tách từng block ##BEGIN_QUESTION## ... ##END_QUESTION##
  const blockRegex = /##BEGIN_QUESTION##([\s\S]*?)##END_QUESTION##/g
  let match: RegExpExecArray | null

  while ((match = blockRegex.exec(raw)) !== null) {
    const block = match[1].trim()
    const q = parseOneBlock(block, expectedType)
    if (q) questions.push(q)
  }

  return questions
}

function getField(block: string, field: string): string {
  // Lấy giá trị từ "FIELD: value" — hỗ trợ multiline đến field tiếp theo
  const regex = new RegExp(`^${field}:[ \\t]*(.+?)(?=\\n[A-Z_]+:|$)`, 'ms')
  const m = block.match(regex)
  return m ? m[1].trim() : ''
}

function parseOneBlock(block: string, expectedType: string): SimilarQuestion | null {
  try {
    const type = getField(block, 'TYPE') || expectedType

    const text = getField(block, 'TEXT')
    if (!text) return null

    const answer   = getField(block, 'ANSWER')
    const solution = getField(block, 'SOLUTION')

    // Parse options (A-F)
    const LETTERS = ['A','B','C','D','E','F']
    const options: { letter: string; text: string }[] = []

    if (type === 'multiple_choice' || type === 'true_false') {
      // multiple_choice: OPTION_A ... OPTION_D
      // true_false: OPTION_A ... OPTION_D (nhưng letter thường lowercase trong answer)
      for (const L of LETTERS) {
        const val = getField(block, `OPTION_${L}`)
        if (val) options.push({ letter: L, text: val })
      }
    }

    return { text, type, options, correctAnswer: answer, solution }
  } catch {
    return null
  }
}

// ─── Prompt theo loại câu ─────────────────────────────────────────────────────
function buildPrompt(sourceQuestion: any, count: number): string {
  const qType    = sourceQuestion.type || 'multiple_choice'
  const sourceText = questionToText(sourceQuestion)

  const typeBlock: Record<string, string> = {
    multiple_choice: `
TYPE: multiple_choice
TEXT: [Nội dung câu hỏi]
OPTION_A: [Lựa chọn A — không có "A." ở đầu]
OPTION_B: [Lựa chọn B]
OPTION_C: [Lựa chọn C]
OPTION_D: [Lựa chọn D]
ANSWER: [Chữ cái đáp án đúng, VD: B]
SOLUTION: [Lời giải ngắn gọn]`.trim(),

    true_false: `
TYPE: true_false
TEXT: [Nội dung câu hỏi giới thiệu bối cảnh]
OPTION_A: [Mệnh đề a]
OPTION_B: [Mệnh đề b]
OPTION_C: [Mệnh đề c]
OPTION_D: [Mệnh đề d]
ANSWER: [Các chữ thường của mệnh đề ĐÚNG, cách nhau bởi dấu phẩy. VD: a,c]
SOLUTION: [Giải thích từng mệnh đề]`.trim(),

    short_answer: `
TYPE: short_answer
TEXT: [Nội dung câu hỏi]
ANSWER: [Kết quả chính xác, VD: 2 hoặc $\\sqrt{3}$]
SOLUTION: [Lời giải từng bước]`.trim(),

    writing: `
TYPE: writing
TEXT: [Nội dung câu hỏi tự luận]
ANSWER:
SOLUTION: [Hướng dẫn giải chi tiết từng bước]`.trim(),
  }

  const template = typeBlock[qType] || typeBlock.multiple_choice

  return `Bạn là chuyên gia biên soạn đề thi Việt Nam (Toán, Lý, Hóa).

====== CÂU HỎI GỐC ======
${sourceText}
=========================

NHIỆM VỤ: Tạo ${count} câu hỏi TƯƠNG TỰ — cùng dạng, cùng mức độ, cùng chủ đề kiến thức, nhưng THAY ĐỔI số liệu, dữ kiện, cách hỏi.

QUY TẮC BẮT BUỘC:
✅ Công thức toán học PHẢI bọc trong $...$, ví dụ: $x^2 + 1$, $\\sqrt{3}$, $\\frac{1}{2}$
✅ Phương trình riêng dòng dùng $$...$$
✅ Số liệu thay đổi phải hợp lý, có nghiệm đẹp
✅ Lời giải ghi đầy đủ các bước, dùng $\\Rightarrow$ khi suy ra
❌ KHÔNG sao chép số liệu gốc
❌ KHÔNG tạo bài vô nghiệm hoặc đáp án bất hợp lý
❌ KHÔNG thêm "A." "B." vào trong nội dung OPTION

FORMAT TRẢ VỀ — lặp lại đúng ${count} lần, không thêm bất cứ text nào ngoài các block:

##BEGIN_QUESTION##
${template}
##END_QUESTION##`
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateSimilarQuestions(
  sourceQuestion: any,
  count: number = 3,
  model: string = 'gemini-3.5-flash',
  apiKey?: string,
  onProgress?: (msg: string) => void
): Promise<SimilarQuestion[]> {
  const key = apiKey || getApiKey()
  if (!key) throw new Error('Chưa có Gemini API Key')

  const log = (msg: string) => onProgress?.(msg)

  log('📋 Đang chuẩn bị câu hỏi gốc...')
  const prompt = buildPrompt(sourceQuestion, count)

  log('🤖 Đang gọi Gemini API...')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 66536 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || `HTTP ${res.status}`
    if (res.status === 429) throw new Error('Quá giới hạn API. Vui lòng thử lại sau vài giây.')
    if (res.status === 400) throw new Error('API Key không hợp lệ hoặc model không tồn tại.')
    throw new Error(msg)
  }

  const data = await res.json()
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!raw) throw new Error('Gemini trả về phản hồi rỗng. Thử lại hoặc đổi model.')

  log('🔍 Đang phân tích kết quả...')
  const questions = parseDelimitedResponse(raw, sourceQuestion.type)

  if (questions.length === 0) {
    // Fallback: log raw để debug
    console.warn('Parse thất bại, raw response:', raw)
    throw new Error(`Không parse được câu hỏi nào. Thử lại hoặc đổi model.`)
  }

  log(`✅ Tạo thành công ${questions.length} câu hỏi`)
  return questions
}

// ─── Test API key ─────────────────────────────────────────────────────────────
export async function testApiKey(
  key: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    })
    return res.ok
      ? { ok: true }
      : { ok: false, error: `HTTP ${res.status}` }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

// ─── Helper sửa lỗi JSON LaTeX của LLM ─────────────────────────────────────────
function repairLlmJson(raw: string): any {
  let clean = raw.replace(/```json/gi, '').replace(/```/gi, '').trim()
  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1)
  }

  // 1. Thử parse trực tiếp
  try {
    return JSON.parse(clean)
  } catch (e) {
    // 2. Sửa lỗi backslash đơn trong công thức LaTeX (\frac, \sqrt, \Rightarrow...)
    const repaired = clean.replace(/\\/g, (match, offset, string) => {
      const nextChar = string[offset + 1]
      // Nếu là \" hoặc \\ thì giữ nguyên \
      if (nextChar === '"' || nextChar === '\\') return '\\'
      return '\\\\'
    })

    try {
      return JSON.parse(repaired)
    } catch (e2) {
      // 3. Xóa bớt ký tự điều khiển ẩn và parse lần nữa
      const stripped = repaired.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      return JSON.parse(stripped)
    }
  }
}

// ─── Gọi API Gemini để sinh đề thi tương tự (Thay số & tạo bài toán mới) ───────
export async function generateSimilarExamWithAI({
  examTitle,
  questions,
  apiKey,
  model = 'gemini-2.0-flash',
  onProgress
}: {
  examTitle: string;
  questions: any[];
  apiKey: string;
  model?: string;
  onProgress?: (msg: string) => void;
}): Promise<{ title: string; questions: any[] }> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Vui lòng nhập Gemini API Key để thực hiện sinh đề thi AI thay số!");
  }

  onProgress?.("📋 Đang phân tích cấu trúc đề thi gốc...");

  const questionsPromptText = (questions || []).map((q: any, i: number) => {
    let qStr = `CÂU ${q.number || i + 1} (${q.type || 'multiple_choice'}):\n${stripHtml(q.text || '')}\n`;
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt: any) => {
        qStr += `  ${opt.letter || 'A'}. ${stripHtml(opt.text || '')}\n`;
      });
    }
    if (q.correctAnswer) qStr += `Đáp án đúng: ${q.correctAnswer}\n`;
    if (q.solution) qStr += `Lời giải: ${stripHtml(q.solution || '')}\n`;
    return qStr;
  }).join("\n---\n");

  const systemPrompt = `Bạn là chuyên gia biên soạn đề thi Toán/Khoa học hàng đầu Việt Nam.

TÊN ĐỀ THI GỐC: "${examTitle}"

DANH SÁCH CÂU HỎI ĐỀ THI GỐC:
${questionsPromptText}

NHIỆM VỤ:
Tạo 1 ĐỀ THI MỚI HOÀN TOÀN TƯƠNG TỰ đề thi gốc bằng cách:
1. Giữ nguyên dạng toán, chủ đề kiến thức và cấu trúc từng câu.
2. THAY ĐỔI TOÀN BỘ SỐ LIỆU, ĐẦU BÀI, THAY ĐỔI BỐI CẢNH để tạo nên các BÀI TOÁN MỚI HOÀN TOÀN.
3. Tính toán lại CHÍNH XÁC kết quả, tạo nghiệm đẹp, tính lại đáp án đúng (A/B/C/D) và viết LỜI GIẢI CHI TIẾT từng bước.
4. Mọi công thức Toán phải dùng LaTeX: bọc $...$ cho công thức trong dòng, và $$...$$ cho công thức riêng dòng.
5. LƯU Ý QUAN TRỌNG VỀ JSON: Tất cả dấu gạch chéo ngược \\ trong LaTeX phải ghi kép thành \\\\ (ví dụ: \\\\frac{a}{b}, \\\\sqrt{x}).

ĐỊNH DẠNG KẾT QUẢ TRẢ VỀ (CHỈ TRẢ VỀ JSON HỢP LỆ, KHÔNG MỞ ĐẦU HOẶC KẾT THÚC BẰNG BẤT KỲ VĂN BẢN NÀO KHÁC):
{
  "title": "[Đề thay số AI] ${examTitle}",
  "questions": [
    {
      "number": 1,
      "text": "Nội dung bài toán mới với số liệu đã thay đổi...",
      "type": "multiple_choice",
      "options": [
        { "letter": "A", "text": "Đáp án A mới" },
        { "letter": "B", "text": "Đáp án B mới" },
        { "letter": "C", "text": "Đáp án C mới" },
        { "letter": "D", "text": "Đáp án D mới" }
      ],
      "correctAnswer": "A",
      "solution": "Lời giải chi tiết từng bước..."
    }
  ]
}`;

  onProgress?.("🤖 Đang gọi Gemini API để sáng tạo bài toán mới & thay số...");

  // Thử model được chọn trước, nếu lỗi thì tự động fallback thử các model tiếp theo
  const modelsToTry = Array.from(new Set([
    model,
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-2.5-flash'
  ]));

  let rawText = '';
  let lastErrMessage = '';

  for (const m of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 65536
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        lastErrMessage = err?.error?.message || `HTTP ${res.status}`;
        console.warn(`Model ${m} chưa hỗ trợ:`, lastErrMessage);
        continue;
      }

      const jsonRes = await res.json();
      rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (rawText) break;
    } catch (e: any) {
      lastErrMessage = e.message || 'Lỗi kết nối';
    }
  }

  if (!rawText) {
    throw new Error(`Lỗi gọi Gemini API: ${lastErrMessage}`);
  }

  onProgress?.("🔍 Đang tổng hợp đề thi mới...");
  const parsed = repairLlmJson(rawText);

  return {
    title: parsed.title || `[Đề thay số AI] ${examTitle}`,
    questions: parsed.questions || []
  };
}

