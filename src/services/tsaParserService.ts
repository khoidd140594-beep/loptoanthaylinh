/**
 * tsaParserService.ts
 * Parser LaTeX → Dữ liệu đề thi TSA
 *
 * Hỗ trợ 6 dạng câu hỏi TSA:
 *  I.   Trắc nghiệm nhiều lựa chọn  → tsa_multiple_choice
 *  II.  Đúng / Sai                  → tsa_true_false
 *  III. Chọn nhiều đáp án đúng      → tsa_multiple_select
 *  IV.  Kéo thả                     → tsa_drag_drop
 *  V.   Điền khuyết                 → tsa_fill_blank
 *  VI.  Ghép đôi                    → tsa_matching
 */

import { compileExamTikz } from './compiletikz';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TSAQuestionType =
  | 'tsa_multiple_choice'   // I
  | 'tsa_true_false'        // II
  | 'tsa_multiple_select'   // III
  | 'tsa_drag_drop'         // IV
  | 'tsa_fill_blank'        // V
  | 'tsa_matching';         // VI

export type TSASectionId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

/** Một đáp án trong câu trắc nghiệm hoặc chọn nhiều */
export interface TSAChoiceOption {
  letter: string;   // A, B, C, D, E, F
  text: string;     // HTML (MathJax-ready)
  isCorrect: boolean;
}

/** Một mệnh đề trong câu Đúng/Sai */
export interface TSATFStatement {
  label: string;    // a, b, c, d, e, f
  text: string;     // HTML
  isTrue: boolean;
}

/** Một item trong bank kéo thả */
export interface TSADragItem {
  id: string;
  text: string;          // HTML
  correctSlot: number | null;  // null = mồi nhử (distractor)
}

/** Một ô điền trong câu điền khuyết */
export interface TSABlank {
  index: number;    // 1-based
  answer: string;   // đáp án đúng (raw text/LaTeX)
  width?: string;   // CSS width gợi ý từ \dien{w}{n}
}

/** Một cặp ghép đôi */
export interface TSAMatchPair {
  leftNum: number;
  rightLetter: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN QUESTION INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface TSAQuestion {
  id: string;                   // unique id, e.g. "q_I_1"
  number: number;               // số thứ tự toàn đề
  localNumber: number;          // số thứ tự trong phần
  sectionId: TSASectionId;
  sectionName: string;
  type: TSAQuestionType;
  text: string;                 // HTML - đề bài

  // ── Trắc nghiệm nhiều lựa chọn & Chọn nhiều đáp án ──
  choiceOptions?: TSAChoiceOption[];
  /** số đáp án: 4 | 5 | 6 */
  numChoices?: number;

  // ── Đúng / Sai ──
  tfStatements?: TSATFStatement[];
  /** số mệnh đề: 2 | 3 | 4 | 5 | 6 */
  numStatements?: number;

  // ── Kéo thả ──
  dragBank?: TSADragItem[];         // toàn bộ items trong bank
  dragTextWithSlots?: string;       // HTML với placeholder [SLOT_1], [SLOT_2]...
  dropCount?: number;               // số slot \drop{}

  // ── Điền khuyết ──
  blanks?: TSABlank[];
  fillTextWithBlanks?: string;      // HTML với placeholder [BLANK_1], [BLANK_2]...
  blankCount?: number;

  // ── Ghép đôi ──
  matchLeft?: Array<{ num: number; text: string }>;
  matchRight?: Array<{ letter: string; text: string }>;
  matchCorrect?: TSAMatchPair[];    // đáp án đúng

  solution: string;   // HTML - lời giải
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAM DATA
// ─────────────────────────────────────────────────────────────────────────────

export interface TSASection {
  id: TSASectionId;
  name: string;
  type: TSAQuestionType;
  description: string;
  questions: TSAQuestion[];
}

export interface TSAExamData {
  title: string;
  sections: TSASection[];
  /** Tất cả câu hỏi dạng phẳng (để dễ lookup) */
  questions: TSAQuestion[];
  images: ExtendedImageData[];
  /** Tổng số câu */
  totalQuestions: number;
}

export interface ExtendedImageData {
  id: string;
  filename: string;
  base64?: string;
  contentType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION METADATA
// ─────────────────────────────────────────────────────────────────────────────

const TSA_SECTIONS: Array<{
  id: TSASectionId;
  name: string;
  type: TSAQuestionType;
  description: string;
  /**
   * Regex để tìm tiêu đề phần trong nội dung LaTeX.
   * Dùng nhiều pattern vì cách viết có thể khác nhau.
   */
  headerPatterns: RegExp[];
  /** Lệnh đặc trưng dùng để nhận dạng câu hỏi trong phần này */
  commandSignatures: string[];
}> = [
  {
    id: 'I',
    name: 'Trắc nghiệm nhiều lựa chọn',
    type: 'tsa_multiple_choice',
    description: 'Chọn một phương án đúng trong 4, 5 hoặc 6 đáp án',
    headerPatterns: [
      /I\.\s*Trắc\s*nghiệm\s*nhiều\s*lựa\s*chọn/i,
      /PHẦN\s*I[.\s]/i,
    ],
    commandSignatures: ['\\choice'],
  },
  {
    id: 'II',
    name: 'Đúng / Sai',
    type: 'tsa_true_false',
    description: 'Chọn Đúng hoặc Sai cho mỗi mệnh đề (2–6 mệnh đề)',
    headerPatterns: [
      /II\.\s*Đúng\s*\/\s*Sai/i,
      /PHẦN\s*II[.\s]/i,
    ],
    commandSignatures: ['\\choiceTF'],
  },
  {
    id: 'III',
    name: 'Chọn nhiều đáp án đúng',
    type: 'tsa_multiple_select',
    description: 'Chọn tất cả các phương án đúng',
    headerPatterns: [
      /III\.\s*Chọn\s*nhiều\s*đáp\s*án\s*đúng/i,
      /PHẦN\s*III[.\s]/i,
    ],
    commandSignatures: ['\\choiceN'],
  },
  {
    id: 'IV',
    name: 'Kéo thả',
    type: 'tsa_drag_drop',
    description: 'Kéo đáp án phù hợp vào ô trống',
    headerPatterns: [
      /IV\.\s*Kéo\s*thả/i,
      /PHẦN\s*IV[.\s]/i,
    ],
    commandSignatures: ['\\drag', '\\drop'],
  },
  {
    id: 'V',
    name: 'Điền khuyết',
    type: 'tsa_fill_blank',
    description: 'Điền đáp án vào ô trống',
    headerPatterns: [
      /V\.\s*Điền\s*khuyết/i,
      /PHẦN\s*V[.\s]/i,
    ],
    commandSignatures: ['\\shortans', '\\dien'],
  },
  {
    id: 'VI',
    name: 'Ghép đôi',
    type: 'tsa_matching',
    description: 'Ghép mỗi ô cột trái với một ô cột phải',
    headerPatterns: [
      /VI\.\s*Ghép\s*đôi/i,
      /PHẦN\s*VI[.\s]/i,
    ],
    commandSignatures: ['\\ghepdoi', '\\begin{tabular}'],  // hỗ trợ cả 2 định dạng
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function parseTexToTSAExam(
  file: File,
  onProgress?: (message: string) => void
): Promise<TSAExamData> {
  const log = (msg: string) => {
    console.log(msg);
    onProgress?.(msg);
  };

  log('📄 Đang đọc file LaTeX TSA...');
  const rawContent = await file.text();

  log('🎨 Đang tìm và compile hình TikZ...');
  const { processedContent, images } = await extractAndCompileTikZ(rawContent, log);

  log('🔍 Đang xác định các phần trong đề thi...');
  const sectionRanges = detectTSASectionRanges(processedContent);

  const examData: TSAExamData = {
    title: file.name.replace(/\.tex$/i, ''),
    sections: [],
    questions: [],
    images,
    totalQuestions: 0,
  };

  let globalNum = 1;

  for (const meta of TSA_SECTIONS) {
    const range = sectionRanges.get(meta.id);
    if (!range) {
      log(`⚠️ Không tìm thấy phần ${meta.id}. ${meta.name}`);
      continue;
    }

    const sectionContent = processedContent.substring(range.start, range.end);
    log(`📝 Đang parse Phần ${meta.id}: ${meta.name}...`);

    const parsed = parseSectionQuestions(
      sectionContent,
      meta.id,
      meta.name,
      meta.type,
      globalNum,
      images
    );

    if (parsed.length === 0) {
      log(`   ⚠️ Không tìm thấy câu hỏi nào trong phần ${meta.id}`);
      continue;
    }

    globalNum += parsed.length;

    const section: TSASection = {
      id: meta.id,
      name: meta.name,
      type: meta.type,
      description: meta.description,
      questions: parsed,
    };

    examData.sections.push(section);
    examData.questions.push(...parsed);

    log(`   ✅ Phần ${meta.id}: ${parsed.length} câu`);
  }

  examData.totalQuestions = examData.questions.length;

  // Fallback: nếu không tìm được phần nào qua header, dùng command-based detection
  if (examData.questions.length === 0) {
    log('⚠️ Không tìm thấy header phần – chuyển sang nhận dạng theo lệnh...');
    return parseByCommandDetection(processedContent, file.name, images, log);
  }

  log(`✅ Hoàn tất: ${examData.totalQuestions} câu / ${examData.sections.length} phần`);
  return examData;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION RANGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

function detectTSASectionRanges(content: string): Map<TSASectionId, { start: number; end: number }> {
  const ranges = new Map<TSASectionId, { start: number; end: number }>();
  const found: Array<{ id: TSASectionId; index: number }> = [];

  for (const meta of TSA_SECTIONS) {
    let matchIndex = -1;
    for (const pattern of meta.headerPatterns) {
      const m = content.search(pattern);
      if (m !== -1) { matchIndex = m; break; }
    }
    if (matchIndex !== -1) {
      found.push({ id: meta.id, index: matchIndex });
    }
  }

  // Sort by position in document
  found.sort((a, b) => a.index - b.index);

  for (let i = 0; i < found.length; i++) {
    const start = found[i].index;
    const end = i + 1 < found.length ? found[i + 1].index : content.length;
    ranges.set(found[i].id, { start, end });
  }

  return ranges;
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK: COMMAND-BASED DETECTION
// ─────────────────────────────────────────────────────────────────────────────

async function parseByCommandDetection(
  content: string,
  filename: string,
  images: ExtendedImageData[],
  log: (m: string) => void
): Promise<TSAExamData> {
  const examData: TSAExamData = {
    title: filename.replace(/\.tex$/i, ''),
    sections: [],
    questions: [],
    images,
    totalQuestions: 0,
  };

  const allExBlocks: string[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  while ((match = exRegex.exec(content)) !== null) {
    allExBlocks.push(match[1]);
  }

  log(`🔎 Tìm thấy ${allExBlocks.length} khối \\begin{ex}...\\end{ex}`);

  const sectionMap = new Map<TSASectionId, TSAQuestion[]>();
  let globalNum = 1;

  for (const block of allExBlocks) {
    const type = detectQuestionTypeFromBlock(block);
    const meta = TSA_SECTIONS.find(s => s.type === type);
    if (!meta) continue;

    const list = sectionMap.get(meta.id) ?? [];
    const localNum = list.length + 1;

    const q = parseOneQuestion(block, meta.id, meta.name, type, globalNum, localNum, images);
    if (q) {
      list.push(q);
      sectionMap.set(meta.id, list);
      examData.questions.push(q);
      globalNum++;
    }
  }

  for (const meta of TSA_SECTIONS) {
    const qs = sectionMap.get(meta.id);
    if (!qs || qs.length === 0) continue;
    examData.sections.push({
      id: meta.id,
      name: meta.name,
      type: meta.type,
      description: meta.description,
      questions: qs,
    });
  }

  examData.totalQuestions = examData.questions.length;
  return examData;
}

function detectQuestionTypeFromBlock(block: string): TSAQuestionType {
  if (block.includes('\\choiceN')) return 'tsa_multiple_select';
  if (block.includes('\\choiceTF')) return 'tsa_true_false';
  if (block.includes('\\choice')) return 'tsa_multiple_choice';
  if (block.includes('\\drag') || block.includes('\\drop')) return 'tsa_drag_drop';
  if (block.includes('\\shortans') || block.includes('\\dien')) return 'tsa_fill_blank';
  // Ghép đôi: \ghepdoi (định dạng mới) hoặc tabular (định dạng cũ)
  if (block.includes('\\ghepdoi')) return 'tsa_matching';
  if (block.includes('\\begin{tabular}') && (block.includes('$1$.') || block.includes('$1$.'))) {
    return 'tsa_matching';
  }
  return 'tsa_fill_blank'; // default
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION-LEVEL PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseSectionQuestions(
  sectionContent: string,
  sectionId: TSASectionId,
  sectionName: string,
  type: TSAQuestionType,
  globalNumStart: number,
  images: ExtendedImageData[]
): TSAQuestion[] {
  const questions: TSAQuestion[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  let localNum = 1;

  while ((match = exRegex.exec(sectionContent)) !== null) {
    const block = match[1];

    // Skip blocks clearly belonging to different type
    if (type === 'tsa_multiple_choice' && (block.includes('\\choiceTF') || block.includes('\\choiceN'))) continue;
    if (type === 'tsa_true_false' && !block.includes('\\choiceTF')) continue;
    if (type === 'tsa_multiple_select' && !block.includes('\\choiceN')) continue;
    if (type === 'tsa_drag_drop' && !block.includes('\\drag') && !block.includes('\\drop')) continue;
    if (type === 'tsa_fill_blank' && !block.includes('\\shortans') && !block.includes('\\dien')) continue;
    if (type === 'tsa_matching' && !block.includes('\\ghepdoi') && !block.includes('\\begin{tabular}')) continue;

    const q = parseOneQuestion(
      block, sectionId, sectionName, type,
      globalNumStart + localNum - 1,
      localNum, images
    );
    if (q) { questions.push(q); localNum++; }
  }

  return questions;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE QUESTION DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function parseOneQuestion(
  rawBlock: string,
  sectionId: TSASectionId,
  sectionName: string,
  type: TSAQuestionType,
  globalNumber: number,
  localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const id = `q_${sectionId}_${localNumber}`;

  switch (type) {
    case 'tsa_multiple_choice':
      return parseMultipleChoice(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    case 'tsa_true_false':
      return parseTrueFalse(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    case 'tsa_multiple_select':
      return parseMultipleSelect(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    case 'tsa_drag_drop':
      return parseDragDrop(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    case 'tsa_fill_blank':
      return parseFillBlank(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    case 'tsa_matching':
      return parseMatching(rawBlock, id, sectionId, sectionName, globalNumber, localNumber, images);
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// I. TRẮC NGHIỆM NHIỀU LỰA CHỌN  (\choice, 4-6 đáp án)
// ─────────────────────────────────────────────────────────────────────────────

function parseMultipleChoice(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';

  // Tìm vị trí \choice (không phải \choiceTF, \choiceN)
  const choiceMatch = cleaned.match(/\\choice(?!TF|N)\b/);
  if (!choiceMatch || choiceMatch.index === undefined) return null;

  const questionRaw = cleaned.substring(0, choiceMatch.index).trim();
  const questionText = processLatexText(questionRaw, images);

  // Đọc tất cả brace groups sau \choice (có thể có [t] option)
  const afterChoice = cleaned.substring(choiceMatch.index);
  const groups = readAllBraceGroups(afterChoice.replace(/^\\choice(?:\[[^\]]*\])?/, ''));

  if (groups.length < 2) return null;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const choiceOptions: TSAChoiceOption[] = [];

  for (let i = 0; i < groups.length && i < 6; i++) {
    let text = groups[i].trim();
    const isCorrect = /\\True\b/.test(text);
    if (isCorrect) {
      text = text.replace(/\\True\s*/g, '').trim();
    }
    choiceOptions.push({
      letter: LETTERS[i],
      text: processLatexText(text, images),
      isCorrect,
    });
  }

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_multiple_choice',
    text: questionText,
    choiceOptions,
    numChoices: choiceOptions.length,
    solution,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// II. ĐÚNG / SAI  (\choiceTF, 2-6 mệnh đề)
// ─────────────────────────────────────────────────────────────────────────────

function parseTrueFalse(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';

  const tfMatch = cleaned.match(/\\choiceTF(?:\[[^\]]*\])?/);
  if (!tfMatch || tfMatch.index === undefined) return null;

  const questionRaw = cleaned.substring(0, tfMatch.index).trim();
  const questionText = processLatexText(questionRaw, images);

  const afterTF = cleaned.substring(tfMatch.index + tfMatch[0].length);
  const groups = readAllBraceGroups(afterTF);

  if (groups.length < 2) return null;

  const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];
  const tfStatements: TSATFStatement[] = [];

  for (let i = 0; i < groups.length && i < 6; i++) {
    let text = groups[i].trim();
    const isTrue = /\\True\b/.test(text);
    if (isTrue) text = text.replace(/\\True\s*/g, '').trim();
    tfStatements.push({
      label: LABELS[i],
      text: processLatexText(text, images),
      isTrue,
    });
  }

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_true_false',
    text: questionText,
    tfStatements,
    numStatements: tfStatements.length,
    solution,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// III. CHỌN NHIỀU ĐÁP ÁN ĐÚNG  (\choiceN)
// ─────────────────────────────────────────────────────────────────────────────

function parseMultipleSelect(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';

  const choiceMatch = cleaned.match(/\\choiceN\b/);
  if (!choiceMatch || choiceMatch.index === undefined) return null;

  const questionRaw = cleaned.substring(0, choiceMatch.index).trim();
  const questionText = processLatexText(questionRaw, images);

  const afterChoice = cleaned.substring(choiceMatch.index + '\\choiceN'.length);
  const groups = readAllBraceGroups(afterChoice);

  if (groups.length < 2) return null;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const choiceOptions: TSAChoiceOption[] = [];

  for (let i = 0; i < groups.length && i < 6; i++) {
    let text = groups[i].trim();
    const isCorrect = /\\True\b/.test(text);
    if (isCorrect) text = text.replace(/\\True\s*/g, '').trim();
    choiceOptions.push({
      letter: LETTERS[i],
      text: processLatexText(text, images),
      isCorrect,
    });
  }

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_multiple_select',
    text: questionText,
    choiceOptions,
    numChoices: choiceOptions.length,
    solution,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IV. KÉO THẢ  (\drag ... \drop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cú pháp \drag:
 *   [n]{text}  → đáp án đúng cho slot n (có thể thiếu [n] nếu chỉ 1 cặp đúng/sai)
 *   {text}     → mồi nhử (distractor)
 *
 * Cú pháp \drop{} → placeholder slot trong câu hỏi
 * Cú pháp \numboxans{n} → số box đáp án (không bắt buộc)
 *
 * Dạng 4b: \roundbox{text} làm bank items, \roundbox{\phantom{...}} làm blank
 */
function parseDragDrop(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';

  // ── Kiểm tra có dùng \drag không (Dạng 4a) ──
  const hasDrag = cleaned.includes('\\drag');

  if (hasDrag) {
    return parseDragDropAutoBank(cleaned, id, sectionId, sectionName, globalNumber, localNumber, solution, images);
  }

  // ── Dạng 4b: \roundbox bank ──
  if (cleaned.includes('\\roundbox')) {
    return parseDragDropRoundbox(cleaned, id, sectionId, sectionName, globalNumber, localNumber, solution, images);
  }

  return null;
}

/** Dạng 4a: \drag [n]{text} / {text} + \drop{} */
function parseDragDropAutoBank(
  cleaned: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  solution: string,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const dragIdx = cleaned.indexOf('\\drag');
  if (dragIdx === -1) return null;

  // Parse bank items sau \drag
  const dragBank: TSADragItem[] = [];
  let pos = dragIdx + '\\drag'.length;

  while (pos < cleaned.length) {
    pos = skipSpaces(cleaned, pos);
    if (pos >= cleaned.length) break;

    // Kiểm tra comment / newline
    if (cleaned[pos] === '%') {
      // Skip to next line
      const nl = cleaned.indexOf('\n', pos);
      pos = nl === -1 ? cleaned.length : nl + 1;
      continue;
    }

    let correctSlot: number | null = null;

    // Optional [n]
    if (cleaned[pos] === '[') {
      const closeB = cleaned.indexOf(']', pos);
      if (closeB !== -1) {
        const bracketContent = cleaned.substring(pos + 1, closeB).trim();
        correctSlot = parseInt(bracketContent, 10) || null;
        pos = closeB + 1;
      }
    }

    // Brace group {text}
    pos = skipSpaces(cleaned, pos);
    if (pos >= cleaned.length || cleaned[pos] !== '{') break;

    const gr = readBraceGroup(cleaned, pos);
    if (!gr) break;

    const itemText = gr.group.trim();
    dragBank.push({
      id: `item_${dragBank.length + 1}`,
      text: processLatexText(itemText, images),
      correctSlot,
    });
    pos = gr.nextIndex;
  }

  if (dragBank.length === 0) return null;

  // Phần câu hỏi sau các drag items: từ \drop đầu tiên trở đi (và text trước nó)
  // Thực ra câu hỏi là text GIỮA cuối bank và \drop cuối
  // Ta cắt từ vị trí sau bank items đến cuối
  const restOfCleaned = cleaned.substring(pos);

  // Thay thế \drop{} hoặc \drop (không có {}) bằng [SLOT_n]
  // File thực tế dùng cả 2 dạng: \drop{} và \drop, và \drop.
  let slotCounter = 0;
  const dragTextWithSlots = restOfCleaned.replace(
    /\\drop\s*(?:\{[^}]*\})?/g,
    () => `[SLOT_${++slotCounter}]`
  );
  const dropCount = slotCounter;

  const questionText = processLatexText(
    cleaned.substring(0, dragIdx).trim() + '\n' + dragTextWithSlots,
    images
  );

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_drag_drop',
    text: questionText,
    dragBank,
    dragTextWithSlots: processLatexText(dragTextWithSlots, images),
    dropCount,
    solution,
  };
}

/** Dạng 4b: Bank là \roundbox{text} trong \begin{center}..., blank là \roundbox{\phantom{...}} */
function parseDragDropRoundbox(
  cleaned: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  solution: string,
  images: ExtendedImageData[]
): TSAQuestion | null {
  // Tìm bank: \begin{center} chứa dãy \roundbox{...}
  const centerMatch = cleaned.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/);
  const bankItems: TSADragItem[] = [];

  if (centerMatch) {
    const centerContent = centerMatch[1];
    const rbRegex = /\\roundbox\{([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let m;
    while ((m = rbRegex.exec(centerContent)) !== null) {
      const text = m[1].trim();
      bankItems.push({
        id: `item_${bankItems.length + 1}`,
        text: processLatexText(text, images),
        correctSlot: null, // determined from solution
      });
    }
  }

  // Phần câu hỏi: thay \roundbox{\phantom{...}} bằng [SLOT_n]
  // Dùng regex hỗ trợ 1 cấp lồng nhau: ví dụ \phantom{$0{,}375$}
  let slotCounter = 0;
  const bodyWithSlots = cleaned.replace(
    /\\roundbox\{\\phantom\{(?:[^{}]|\{[^{}]*\})*\}\}/g,
    () => `[SLOT_${++slotCounter}]`
  );

  // Loại bỏ bank center block
  const cleanBody = bodyWithSlots.replace(/\\begin\{center\}[\s\S]*?\\end\{center\}/, '').trim();
  const questionText = processLatexText(cleanBody, images);

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_drag_drop',
    text: questionText,
    dragBank: bankItems,
    dragTextWithSlots: questionText,
    dropCount: slotCounter,
    solution,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// V. ĐIỀN KHUYẾT  (\shortans hoặc \dien)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * \shortans[display]{answer}  → 1 blank, đáp án rõ ràng
 * \dien{width}{n}             → blank thứ n, đáp án lấy từ loigiai
 */
function parseFillBlank(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';
  const solutionRaw = solRaw ?? '';

  const blanks: TSABlank[] = [];
  let blankCounter = 0;

  // ── Dạng 5a: \shortans[display]{answer} ──
  const hasShortans = cleaned.includes('\\shortans');
  const hasDien = cleaned.includes('\\dien');

  if (!hasShortans && !hasDien) return null;

  let bodyWithBlanks = cleaned;

  if (hasShortans) {
    // \shortans[...]{answer}  →  [BLANK_1]
    bodyWithBlanks = bodyWithBlanks.replace(
      /\\shortans\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g,
      (_, answer) => {
        const idx = ++blankCounter;
        blanks.push({ index: idx, answer: answer.trim() });
        return `[BLANK_${idx}]`;
      }
    );
  }

  if (hasDien) {
    // \dien{width}{n} → [BLANK_n]
    bodyWithBlanks = bodyWithBlanks.replace(
      /\\dien\s*\{([^}]*)\}\s*\{(\d+)\}/g,
      (_, width, numStr) => {
        const idx = parseInt(numStr, 10);
        blankCounter = Math.max(blankCounter, idx);
        const answer = extractDienAnswer(solutionRaw, idx);
        // Avoid duplicates
        if (!blanks.find(b => b.index === idx)) {
          blanks.push({ index: idx, answer, width });
        }
        return `[BLANK_${idx}]`;
      }
    );
    // Sort blanks by index
    blanks.sort((a, b) => a.index - b.index);
  }

  const questionText = processLatexText(bodyWithBlanks, images);

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_fill_blank',
    text: questionText,
    blanks,
    fillTextWithBlanks: questionText,
    blankCount: blanks.length,
    solution,
  };
}

/**
 * Trích đáp án \dien thứ n từ lời giải.
 * Pattern: $(n)\colon VALUE$ hoặc (n): VALUE
 */
function extractDienAnswer(solutionRaw: string, n: number): string {
  // Pattern: (n)\colon VALUE hoặc (n): VALUE
  const patterns = [
    new RegExp(`\\(${n}\\)\\\\colon\\s*([^$;\\\\]+)`, 'i'),
    new RegExp(`\\(${n}\\):\\s*([^;,.\\n]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const m = solutionRaw.match(pattern);
    if (m) return m[1].trim().replace(/^\$|\$$/g, '').trim();
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// VI. GHÉP ĐÔI  (\ghepdoi hoặc tabular)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatcher: chọn parser phù hợp dựa vào lệnh trong block.
 *
 * Định dạng \ghepdoi (mới):
 *   \ghepdoi
 *   {Left 1}{Right a}
 *   {Left 2}{Right b}
 *   ...
 *   Các brace groups theo cặp: odd = cột trái, even = cột phải.
 *   Right items tự động gán nhãn a, b, c, d, e, f theo thứ tự.
 *
 * Định dạng tabular (cũ):
 *   \begin{tabular}...$1$. text & a. text \\ ...
 */
function parseMatching(
  rawBlock: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const block = expandImmini(rawBlock);
  const { group: solRaw, cleaned } = extractCommandGroup(block, '\\loigiai');
  const solution = solRaw ? processLatexText(solRaw, images) : '';
  const solutionRaw = solRaw ?? '';

  if (cleaned.includes('\\ghepdoi')) {
    return parseMatchingGhepDoi(cleaned, id, sectionId, sectionName, globalNumber, localNumber, solution, solutionRaw, images);
  }
  return parseMatchingTabular(cleaned, id, sectionId, sectionName, globalNumber, localNumber, solution, solutionRaw, images);
}

/**
 * Parser cho \ghepdoi{left1}{right1}{left2}{right2}...
 * Nhãn phải: a, b, c, d, e, f gán theo vị trí xuất hiện.
 */
function parseMatchingGhepDoi(
  cleaned: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  solution: string, solutionRaw: string,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const ghepIdx = cleaned.indexOf('\\ghepdoi');
  if (ghepIdx === -1) return null;

  // Phần đề bài trước \ghepdoi
  const questionRaw = cleaned.substring(0, ghepIdx).trim();
  const questionText = processLatexText(questionRaw, images);

  // Đọc tất cả brace groups sau \ghepdoi
  const afterGhep = cleaned.substring(ghepIdx + '\\ghepdoi'.length);
  const groups = readAllBraceGroups(afterGhep);

  if (groups.length < 2) return null;

  const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];
  const matchLeft: Array<{ num: number; text: string }> = [];
  const matchRight: Array<{ letter: string; text: string }> = [];

  // Groups đi theo cặp: [0]=left1, [1]=right_a, [2]=left2, [3]=right_b, ...
  for (let i = 0; i < groups.length - 1; i += 2) {
    const pairIdx = i / 2;
    matchLeft.push({
      num: pairIdx + 1,
      text: processLatexText(groups[i].trim(), images),
    });
    matchRight.push({
      letter: LABELS[pairIdx] ?? String.fromCharCode(97 + pairIdx),
      text: processLatexText(groups[i + 1].trim(), images),
    });
  }

  const matchCorrect = parseMatchingAnswers(solutionRaw);

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_matching',
    text: questionText,
    matchLeft,
    matchRight,
    matchCorrect,
    solution,
  };
}

/**
 * Parser cho định dạng tabular cũ:
 *   $1$. text_left  &  a. text_right  \\
 */
function parseMatchingTabular(
  cleaned: string,
  id: string, sectionId: TSASectionId, sectionName: string,
  globalNumber: number, localNumber: number,
  solution: string, solutionRaw: string,
  images: ExtendedImageData[]
): TSAQuestion | null {
  const tabMatch = cleaned.match(/\\begin\{tabular\}\s*\{[^}]+\}([\s\S]*?)\\end\{tabular\}/);
  if (!tabMatch) return null;

  const tabBody = tabMatch[1];
  const tabStart = cleaned.indexOf(tabMatch[0]);
  const questionRaw = cleaned.substring(0, tabStart).trim();
  const questionText = processLatexText(questionRaw, images);

  // Parse rows từ tabular
  const rows = tabBody
    .split(/\\\\/)
    .map(r => r.replace(/\\hline/g, '').trim())
    .filter(r => r.includes('&'));

  const matchLeft: Array<{ num: number; text: string }> = [];
  const matchRight: Array<{ letter: string; text: string }> = [];

  for (const row of rows) {
    const [leftRaw, rightRaw] = row.split('&').map(s => s.trim());
    if (!leftRaw || !rightRaw) continue;

    // Left: "$1$. text" hoặc "1. text"
    const leftNumMatch = leftRaw.match(/^\$?(\d+)\$?\.\s*([\s\S]*)/);
    if (leftNumMatch) {
      matchLeft.push({
        num: parseInt(leftNumMatch[1], 10),
        text: processLatexText(leftNumMatch[2].trim(), images),
      });
    }

    // Right: "a. text" hoặc "$a$. text"
    const rightLetterMatch = rightRaw.match(/^\$?([a-f])\$?\.\s*([\s\S]*)/i);
    if (rightLetterMatch) {
      matchRight.push({
        letter: rightLetterMatch[1].toLowerCase(),
        text: processLatexText(rightLetterMatch[2].trim(), images),
      });
    }
  }

  // Parse đáp án từ solution: "1-b; 2-a; 3-c; ..."
  const matchCorrect = parseMatchingAnswers(solutionRaw);

  return {
    id, number: globalNumber, localNumber, sectionId, sectionName,
    type: 'tsa_matching',
    text: questionText,
    matchLeft,
    matchRight,
    matchCorrect,
    solution,
  };
}

/** Parse đáp án ghép đôi từ lời giải.
 * Hỗ trợ nhiều định dạng LaTeX:
 *   "1-b; 2-a"       (plain)
 *   "$1$-b;\;$2$-a"  (LaTeX math mode)
 *   "1→b, 2→a"       (arrow)
 *   "1.b  2.a"       (dấu chấm)
 */
function parseMatchingAnswers(solutionRaw: string): TSAMatchPair[] {
  const pairs: TSAMatchPair[] = [];
  // Cho phép $n$ hoặc n, rồi dấu phân cách bất kỳ, rồi $letter$ hoặc letter
  const pairRegex = /\$?(\d+)\$?\s*[-–—→\.]\s*\$?([a-f])\$?/gi;
  let m;
  while ((m = pairRegex.exec(solutionRaw)) !== null) {
    pairs.push({
      leftNum: parseInt(m[1], 10),
      rightLetter: m[2].toLowerCase(),
    });
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIKZ COMPILATION
// ─────────────────────────────────────────────────────────────────────────────

async function extractAndCompileTikZ(
  content: string,
  log: (msg: string) => void
): Promise<{ processedContent: string; images: ExtendedImageData[] }> {
  const images: ExtendedImageData[] = [];
  let processedContent = content;

  // Compile cả tikzpicture lẫn tkz-tab
  const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
  const tikzMatches = content.match(tikzRegex) ?? [];

  if (tikzMatches.length === 0) {
    log('ℹ️ Không tìm thấy hình TikZ');
    return { processedContent, images };
  }

  log(`🎨 Tìm thấy ${tikzMatches.length} hình TikZ`);

  for (let i = 0; i < tikzMatches.length; i++) {
    const tikzCode = tikzMatches[i];
    log(`   ⏳ Compile hình ${i + 1}/${tikzMatches.length}...`);
    try {
      const result = await compileExamTikz(tikzCode, {
        format: 'png', density: 300, transparent: true, returnLog: true,
      });
      if (result.ok && result.base64) {
        const imageId = `tikz_${i}`;
        images.push({ id: imageId, filename: `tikz_${i}.png`, base64: result.base64, contentType: 'image/png' });
        processedContent = processedContent.replace(tikzCode, `[TIKZ_IMAGE:${imageId}]`);
        log(`   ✅ Hình ${i + 1} OK`);
      } else {
        processedContent = processedContent.replace(tikzCode, `[HÌNH ${i + 1} - Lỗi compile]`);
        log(`   ⚠️ Hình ${i + 1}: ${result.detail ?? 'unknown error'}`);
      }
    } catch (e) {
      processedContent = processedContent.replace(tikzCode, `[HÌNH ${i + 1} - Lỗi]`);
      log(`   ❌ Hình ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processedContent, images };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT PROCESSING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function inlineTikzAsHtml(text: string, images: ExtendedImageData[]): string {
  return text.replace(/\[TIKZ_IMAGE:([^\]]+)\]/g, (_, imageId) => {
    const img = images.find(i => i.id === imageId);
    if (!img?.base64) return '';
    const src = img.base64.startsWith('data:')
      ? img.base64
      : `data:${img.contentType ?? 'image/png'};base64,${img.base64}`;
    return `<div style="text-align:center;margin:8px 0"><img src="${src}" alt="Hình" style="max-width:100%;max-height:400px;height:auto;border-radius:4px;" /></div>`;
  });
}

function stripMetaCommands(text: string): string {
  return text
    .replace(/\\allowdisplaybreaks\b/g, '')
    .replace(/\\(?:new|clear)page\b/g, '')
    .replace(/\\noindent\b/g, '')
    .replace(/\\(?:med|big|small)skip\b/g, '')
    .replace(/\\vspace\s*\{[^}]*\}/g, '')
    .replace(/\\hspace\s*\{[^}]*\}/g, ' ')
    .replace(/\\phantom\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/\\label\s*\{[^}]*\}/g, '')
    .replace(/\\ref\s*\{[^}]*\}/g, '')
    .replace(/\\(?:page|line)break\b/g, '')
    .replace(/\\OPTN\s*\{[^}]*\}/g, '')      // TSA-specific: \OPTN{kindDrag=1}
    .replace(/\\numboxans\s*\{[^}]*\}/g, ''); // TSA-specific: \numboxans{n}
}

/** Chia text thành đoạn math và non-math để xử lý riêng */
function splitMathNonMath(text: string): Array<{ content: string; isMath: boolean }> {
  const segments: Array<{ content: string; isMath: boolean }> = [];
  const MATH_RE = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(?:align\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\}[\s\S]*?\\end\{(?:align\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\})/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ content: text.slice(lastIndex, match.index), isMath: false });
    segments.push({ content: match[0], isMath: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ content: text.slice(lastIndex), isMath: false });
  return segments;
}

function transformNonMath(text: string, fn: (t: string) => string): string {
  return splitMathNonMath(text).map(s => s.isMath ? s.content : fn(s.content)).join('');
}

function convertTabularToHtml(text: string): string {
  return text.replace(
    /\\begin\{tabular\}\s*\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g,
    (_match, _colSpec, body) => {
      const rows = body.split(/\\\\/).map((r: string) => r.trim()).filter(Boolean);
      if (rows.length === 0) return _match;
      let html = '<table style="border-collapse:collapse;margin:8px auto;border:1px solid #777;font-size:0.95em;">';
      rows.forEach((row: string, rowIdx: number) => {
        const cleanRow = row.replace(/\\hline/g, '').trim();
        if (!cleanRow) return;
        const cells = cleanRow.split('&').map((c: string) => c.trim());
        html += '<tr>';
        cells.forEach((cell: string) => {
          const tag = rowIdx === 0 ? 'th' : 'td';
          const baseStyle = 'padding:6px 12px;text-align:left;border:1px solid #777;';
          const extra = rowIdx === 0 ? 'background:#f5f5f5;font-weight:600;' : '';
          html += `<${tag} style="${baseStyle}${extra}">${cell}</${tag}>`;
        });
        html += '</tr>';
      });
      html += '</table>';
      return html;
    }
  );
}

function processLatexText(text: string, images: ExtendedImageData[]): string {
  if (!text) return '';
  text = stripMetaCommands(text);
  // Strip comments (non-math only)
  text = transformNonMath(text, t => t.replace(/%[^\n]*/g, ''));
  text = convertTabularToHtml(text);
  // Lists
  text = text.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_, body) => '<ul style="padding-left:1.5em;margin:6px 0">' +
      body.split(/\\item\b/).filter((s: string) => s.trim()).map((s: string) => `<li>${s.trim()}</li>`).join('') +
      '</ul>'
  );
  text = text.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_, body) => '<ol style="padding-left:1.5em;margin:6px 0">' +
      body.split(/\\item\b/).filter((s: string) => s.trim()).map((s: string) => `<li>${s.trim()}</li>`).join('') +
      '</ol>'
  );
  // Replace \roundbox{text} hiển thị như tag pill
  text = text.replace(
    /\\roundbox\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_, inner) => `<span class="tsa-roundbox">${inner}</span>`
  );
  // Inline formatting
  text = transformNonMath(text, t => {
    t = t.replace(/\\begin\{center\}/g, '<div style="text-align:center">');
    t = t.replace(/\\end\{center\}/g, '</div>');
    t = t.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<strong>$1</strong>');
    t = t.replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<em>$1</em>');
    t = t.replace(/\\underline\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<u>$1</u>');
    t = t.replace(/\{\\bf\s+([^}]+)\}/g, '<strong>$1</strong>');
    t = t.replace(/\{\\it\s+([^}]+)\}/g, '<em>$1</em>');
    t = t.replace(/\\\\/g, '<br/>');
    t = t.replace(/(?<!\\)~/g, '\u00a0');
    // ── LaTeX spacing commands ngoài math context ──
    t = t.replace(/\\qquad\b/g, '\u2003\u2003');
    t = t.replace(/\\quad\b/g, '\u2003');
    t = t.replace(/\\enspace\b/g, '\u2002');
    t = t.replace(/\\;/g, '\u2009');
    t = t.replace(/\\:/g, '\u2009');
    t = t.replace(/\\,/g, '\u202f');   // thin space — hay gặp: $8\pi$\,(dm$^3$)
    t = t.replace(/\\!/g, '');         // negative thin space → bỏ
    t = t.replace(/\r?\n[ \t]*/g, ' ');
    // ── Render SLOT và BLANK placeholders ──
    t = t.replace(
      /\[SLOT_(\d+)\]/g,
      (_, n) => `<span class="tsa-slot" data-slot="${n}">▢${n}</span>`
    );
    t = t.replace(
      /\[BLANK_(\d+)\]/g,
      (_, n) => `<span class="tsa-blank" data-blank="${n}" style="display:inline-block;min-width:60px;border-bottom:2px solid #f43f5e;color:#f43f5e;font-weight:700;text-align:center;padding:0 4px;margin:0 2px;font-style:italic;">(${n})</span>`
    );
    return t;
  });
  text = inlineTikzAsHtml(text, images);
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// LATEX PARSING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function skipSpaces(s: string, i: number): number {
  while (i < s.length && /[\s]/.test(s[i])) i++;
  return i;
}

function readBraceGroup(s: string, startIndex: number): { group: string; nextIndex: number } | null {
  let i = skipSpaces(s, startIndex);
  if (i >= s.length || s[i] !== '{') return null;
  i++;
  let depth = 1;
  const start = i;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
    if (depth === 0) return { group: s.substring(start, i - 1), nextIndex: i };
  }
  return null;
}

/**
 * Đọc tất cả brace groups liên tiếp từ vị trí đầu chuỗi.
 * Dừng khi không còn '{' nữa hoặc có ký tự không phải whitespace ngăn cách.
 */
function readAllBraceGroups(input: string): string[] {
  const groups: string[] = [];
  let i = 0;

  while (i < input.length) {
    i = skipSpaces(input, i);
    if (i >= input.length) break;

    // Cho phép comment dòng bị bỏ qua
    if (input[i] === '%') {
      const nl = input.indexOf('\n', i);
      i = nl === -1 ? input.length : nl + 1;
      continue;
    }

    if (input[i] !== '{') break; // Không còn group nữa

    const gr = readBraceGroup(input, i);
    if (!gr) break;
    groups.push(gr.group);
    i = gr.nextIndex;
  }

  return groups;
}

function extractCommandGroup(input: string, command: string): { group: string | null; cleaned: string } {
  const idx = input.indexOf(command);
  if (idx === -1) return { group: null, cleaned: input };

  const braceStart = input.indexOf('{', idx + command.length);
  if (braceStart === -1) return { group: null, cleaned: input };

  const parsed = readBraceGroup(input, braceStart);
  if (!parsed) return { group: null, cleaned: input };

  return {
    group: parsed.group,
    cleaned: input.substring(0, idx) + input.substring(parsed.nextIndex),
  };
}

/**
 * Xử lý \immini[opt]{main}{side}:
 * Gộp nội dung phần main (đề bài) và side (hình vẽ) thành một chuỗi,
 * đặt hình vẽ trước lệnh \choice / \choiceTF / \choiceN / \shortans.
 */
function expandImmini(content: string): string {
  let result = content;
  let searchFrom = 0;

  while (true) {
    // Hỗ trợ \immini và \immini[thm] (và các option khác)
    const idx = result.indexOf('\\immini', searchFrom);
    if (idx === -1) break;

    let afterCmd = idx + '\\immini'.length;
    // Optional [...]
    if (result[afterCmd] === '[') {
      const closeB = result.indexOf(']', afterCmd);
      if (closeB !== -1) afterCmd = closeB + 1;
    }

    const arg1 = readBraceGroup(result, afterCmd);
    if (!arg1) { searchFrom = idx + 1; continue; }

    const arg2 = readBraceGroup(result, arg1.nextIndex);
    if (!arg2) { searchFrom = idx + 1; continue; }

    const mainContent = arg1.group;
    const sideContent = arg2.group;

    const choicePos = mainContent.search(/\\choice(?:TF|N)?\b|\\shortans\b|\\dien\b/);
    let merged: string;
    if (choicePos !== -1) {
      merged = mainContent.substring(0, choicePos) + '\n\n' + sideContent + '\n\n' + mainContent.substring(choicePos);
    } else {
      merged = mainContent + '\n\n' + sideContent;
    }

    result = result.substring(0, idx) + merged + result.substring(arg2.nextIndex);
    searchFrom = idx + merged.length;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export function validateTSAExamData(data: TSAExamData): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.questions || data.questions.length === 0) {
    errors.push('Không tìm thấy câu hỏi nào trong file');
    return { valid: false, errors, warnings };
  }

  for (const q of data.questions) {
    switch (q.type) {
      case 'tsa_multiple_choice':
        if (!q.choiceOptions || q.choiceOptions.length < 4) {
          warnings.push(`Câu ${q.number}: Trắc nghiệm cần ít nhất 4 đáp án`);
        }
        if (!q.choiceOptions?.some(o => o.isCorrect)) {
          warnings.push(`Câu ${q.number}: Không tìm thấy đáp án đúng (\\True)`);
        }
        break;

      case 'tsa_true_false':
        if (!q.tfStatements || q.tfStatements.length < 2) {
          warnings.push(`Câu ${q.number}: Đúng/Sai cần ít nhất 2 mệnh đề`);
        }
        break;

      case 'tsa_multiple_select':
        if (!q.choiceOptions?.some(o => o.isCorrect)) {
          warnings.push(`Câu ${q.number}: Chọn nhiều – không tìm thấy đáp án đúng`);
        }
        break;

      case 'tsa_drag_drop':
        if (!q.dragBank || q.dragBank.length === 0) {
          warnings.push(`Câu ${q.number}: Kéo thả – bank trống`);
        }
        if (!q.dropCount || q.dropCount === 0) {
          warnings.push(`Câu ${q.number}: Kéo thả – không tìm thấy slot \\drop{}`);
        }
        break;

      case 'tsa_fill_blank':
        if (!q.blanks || q.blanks.length === 0) {
          warnings.push(`Câu ${q.number}: Điền khuyết – không tìm thấy ô trống`);
        }
        break;

      case 'tsa_matching':
        if (!q.matchLeft || q.matchLeft.length === 0) {
          warnings.push(`Câu ${q.number}: Ghép đôi – không parse được cột trái`);
        }
        if (!q.matchCorrect || q.matchCorrect.length === 0) {
          warnings.push(`Câu ${q.number}: Ghép đôi – không tìm thấy đáp án trong lời giải`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: CORRECT ANSWER SUMMARY (dùng cho scoring)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trả về đáp án đúng dưới dạng chuẩn hoá cho từng loại câu hỏi.
 * Dùng trong scoringService.
 *
 * Trả về:
 *  - multiple_choice:  "B"
 *  - true_false:       { a: true, b: false, c: true, d: false }
 *  - multiple_select:  ["A", "C"]
 *  - drag_drop:        { slot_1: "item_id", slot_2: "item_id" }
 *  - fill_blank:       { 1: "64", 2: "164" }
 *  - matching:         { 1: "b", 2: "a", 3: "c" }
 */
export function getCorrectAnswer(q: TSAQuestion): unknown {
  switch (q.type) {
    case 'tsa_multiple_choice': {
      const correct = q.choiceOptions?.find(o => o.isCorrect);
      return correct?.letter ?? null;
    }

    case 'tsa_true_false': {
      const result: Record<string, boolean> = {};
      q.tfStatements?.forEach(s => { result[s.label] = s.isTrue; });
      return result;
    }

    case 'tsa_multiple_select': {
      return q.choiceOptions?.filter(o => o.isCorrect).map(o => o.letter) ?? [];
    }

    case 'tsa_drag_drop': {
      const result: Record<string, string> = {};
      q.dragBank?.forEach(item => {
        if (item.correctSlot !== null) {
          result[`slot_${item.correctSlot}`] = item.id;
        }
      });
      return result;
    }

    case 'tsa_fill_blank': {
      const result: Record<number, string> = {};
      q.blanks?.forEach(b => { result[b.index] = b.answer; });
      return result;
    }

    case 'tsa_matching': {
      const result: Record<number, string> = {};
      q.matchCorrect?.forEach(p => { result[p.leftNum] = p.rightLetter; });
      return result;
    }

    default:
      return null;
  }
}
