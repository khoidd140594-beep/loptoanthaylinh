// @ts-nocheck
// services/latexToMarkdownService.ts
//
// Chuyển đề LaTeX ex_test → Markdown để đưa vào pipeline trình chiếu.
//   - Nhận diện \begin{tikzpicture}...\end{tikzpicture} → compile PNG (compileExamTikz,
//     backend tikz-fly.fly.dev) → nhúng ![](data:image/png;base64,...).
//   - Parse \begin{ex}...\end{ex} với \choice / \choiceTF / \shortans / \loigiai / \True.
//   - Giữ math ($...$, \(...\), môi trường align/cases...) nguyên vẹn cho MathJax.
// Tái dùng logic parse của texParserService.ts nhưng đầu ra là MARKDOWN (không phải HTML)
// để nhất quán với luồng PDF/Word (bước duyệt/thay ảnh + AI chia slide).

import { compileExamTikz } from '@/services/compiletikz'

export interface LatexToMarkdownResult {
  markdown: string
  imageCount: number
  tikzCount: number
}

export async function latexToMarkdown(
  file: File,
  opts?: { onProgress?: (msg: string) => void },
): Promise<LatexToMarkdownResult> {
  const log = (m: string) => opts?.onProgress?.(m)
  let content = await file.text()

  // Chỉ lấy phần thân nếu có \begin{document}
  const bodyMatch = content.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/)
  if (bodyMatch) content = bodyMatch[1]

  // 1) TikZ → ảnh
  const { processed, images } = await extractAndCompileTikZ(content, log)

  // 2) Ex blocks → markdown (giữ placeholder TikZ)
  let md = documentToMarkdown(processed)

  // 3) Khôi phục placeholder TikZ thành ảnh markdown
  md = md.replace(/@@TIKZ_(\d+)@@/g, (_m, i) => {
    const img = images[Number(i)]
    return img ? `\n\n![hình](${img})\n\n` : ''
  })

  md = md.replace(/\n{3,}/g, '\n\n').trim()
  return { markdown: md, imageCount: images.length, tikzCount: images.length }
}

// ============================================================
// TIKZ: nhận diện + compile (tham khảo texParserService.ts)
// ============================================================
async function extractAndCompileTikZ(
  content: string,
  log: (m: string) => void,
): Promise<{ processed: string; images: string[] }> {
  const images: string[] = []
  let processed = content
  const matches = content.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g) || []
  if (!matches.length) return { processed, images }

  log(`Tìm thấy ${matches.length} hình TikZ, đang biên dịch...`)
  for (let i = 0; i < matches.length; i++) {
    const code = matches[i]
    log(`Compile hình TikZ ${i + 1}/${matches.length}...`)
    let dataUri = ''
    try {
      const r = await compileExamTikz(code, { format: 'png', density: 300, transparent: true, returnLog: true })
      if (r?.ok && r?.base64) {
        dataUri = r.base64.startsWith('data:') ? r.base64 : `data:image/png;base64,${r.base64}`
      } else {
        log(`Hình ${i + 1} lỗi compile: ${r?.detail || 'không rõ'}`)
      }
    } catch (e: any) {
      log(`Hình ${i + 1} lỗi: ${e?.message || e}`)
    }
    const idx = images.length
    images.push(dataUri) // giữ index cả khi rỗng để placeholder khớp
    // Thay 1 lần đúng đoạn tikz này
    processed = processed.replace(code, dataUri ? `@@TIKZ_${idx}@@` : `*(Hình ${i + 1} — lỗi compile)*`)
  }
  // Bỏ các phần tử rỗng khỏi mảng nhưng vẫn giữ đúng index đã đặt: lọc ở bước khôi phục.
  return { processed, images }
}

// ============================================================
// DOCUMENT → MARKDOWN (đi tuyến tính, giữ tiêu đề PHẦN + ex blocks)
// ============================================================
function documentToMarkdown(content: string): string {
  const exRe = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g
  const out: string[] = []
  let last = 0
  let num = 0
  let m: RegExpExecArray | null

  while ((m = exRe.exec(content)) !== null) {
    const between = content.slice(last, m.index)
    const btwMd = sectionText(between)
    if (btwMd) out.push(btwMd)
    num++
    out.push(exToMarkdown(m[1], num))
    last = m.index + m[0].length
  }
  const tail = sectionText(content.slice(last))
  if (tail) out.push(tail)

  // Không có ex nào → coi cả tài liệu là nội dung thường
  if (num === 0) return latexTextToMarkdown(content)

  return out.join('\n\n')
}

/** Text giữa các ex (thường là tiêu đề PHẦN) → markdown heading. */
function sectionText(t: string): string {
  const md = latexTextToMarkdown(t)
  if (!md.trim()) return ''
  return md.replace(/\*\*\s*(PH[ẦA]N[^*]+)\*\*/gi, '\n## $1\n').trim()
}

// ============================================================
// EX BLOCK → MARKDOWN
// ============================================================
function exToMarkdown(rawContent: string, num: number): string {
  const content = expandImmini(rawContent)
  const sol = extractCommandGroup(content, '\\loigiai')
  let body = sol.cleaned
  const solution = sol.group ? latexTextToMarkdown(sol.group) : ''

  const lines: string[] = []

  if (body.includes('\\choiceTF')) {
    const qEnd = body.indexOf('\\choiceTF')
    const question = latexTextToMarkdown(body.slice(0, qEnd).trim())
    const groups = parseBraceGroupsAfterCommand(body.slice(qEnd), '\\choiceTF', 4)
    lines.push(`**Câu ${num}.** ${question}`)
    const letters = ['a', 'b', 'c', 'd']
    groups.forEach((g, i) => {
      let txt = g.trim()
      const isTrue = /\\True/.test(txt)
      txt = txt.replace(/\\True\s*/g, '').trim()
      lines.push(`- **${letters[i]})** ${latexTextToMarkdown(txt)}${isTrue ? ' ✓ (Đúng)' : ''}`)
    })
  } else if (/\\choice(?!TF)/.test(body)) {
    const qEnd = body.search(/\\choice(?!TF)/)
    const question = latexTextToMarkdown(body.slice(0, qEnd).trim())
    const groups = parseBraceGroupsAfterCommand(body.slice(qEnd), '\\choice', 4)
    lines.push(`**Câu ${num}.** ${question}`)
    const letters = ['A', 'B', 'C', 'D']
    groups.forEach((g, i) => {
      let txt = g.trim()
      const isCorrect = /\\True/.test(txt)
      txt = txt.replace(/\\True\s*/g, '').trim()
      lines.push(`- **${letters[i]}.** ${latexTextToMarkdown(txt)}${isCorrect ? ' ✓' : ''}`)
    })
  } else if (body.includes('\\shortans')) {
    const ans = extractCommandGroup(body, '\\shortans')
    body = ans.cleaned
    const question = latexTextToMarkdown(body.trim())
    lines.push(`**Câu ${num}.** ${question}`)
    if (ans.group) lines.push(`**Đáp án:** ${latexTextToMarkdown(ans.group.trim())}`)
  } else {
    lines.push(`**Câu ${num}.** ${latexTextToMarkdown(body.trim())}`)
  }

  if (solution) lines.push(`**Lời giải.** ${solution}`)
  return lines.join('\n\n')
}

// ============================================================
// LATEX TEXT → MARKDOWN (giữ math nguyên vẹn)
// ============================================================
function latexTextToMarkdown(text: string): string {
  if (!text) return ''
  text = stripMetaCommands(text)
  text = preProcessEquationCommands(text)
  text = transformNonMath(text, (t) => t.replace(/%[^\n]*/g, '')) // bỏ comment ngoài math
  text = tabularToMarkdown(text)
  text = listsToMarkdown(text)
  text = transformNonMath(text, (t) => {
    t = t.replace(/\\begin\{center\}/g, '\n').replace(/\\end\{center\}/g, '\n')
    t = t.replace(/\\begin\{(flushleft|flushright)\}/g, '\n').replace(/\\end\{(flushleft|flushright)\}/g, '\n')
    t = t.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '**$1**')
    t = t.replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '*$1*')
    t = t.replace(/\\underline\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '**$1**')
    t = t.replace(/\{\\bf\s+([^}]+)\}/g, '**$1**')
    t = t.replace(/\{\\it\s+([^}]+)\}/g, '*$1*')
    t = t.replace(/\\\\/g, '\n')
    t = t.replace(/(?<!\\)~/g, ' ')
    t = t.replace(/\r?\n[ \t]*/g, ' ')
    return t
  })
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

function tabularToMarkdown(text: string): string {
  return text.replace(
    /\\begin\{tabular\}\s*\{[^}]+\}([\s\S]*?)\\end\{tabular\}/g,
    (_m, body: string) => {
      const rows = body.split(/\\\\/).map((r) => r.replace(/\\hline/g, '').trim()).filter(Boolean)
      if (!rows.length) return _m
      const toRow = (r: string) => '| ' + r.split('&').map((c) => c.trim()).join(' | ') + ' |'
      const cols = rows[0].split('&').length
      const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |'
      return '\n\n' + [toRow(rows[0]), sep, ...rows.slice(1).map(toRow)].join('\n') + '\n\n'
    },
  )
}

function listsToMarkdown(text: string): string {
  text = text.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_m, body: string) => {
    const items = body.split(/\\item\b/).filter((s) => s.trim())
    return '\n' + items.map((s) => `- ${s.trim()}`).join('\n') + '\n'
  })
  text = text.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_m, body: string) => {
    const items = body.split(/\\item\b/).filter((s) => s.trim())
    return '\n' + items.map((s) => `1. ${s.trim()}`).join('\n') + '\n'
  })
  return text
}

// ============================================================
// HELPERS (copy nguyên từ texParserService.ts)
// ============================================================
function splitMathNonMath(text: string): Array<{ content: string; isMath: boolean }> {
  const segments: Array<{ content: string; isMath: boolean }> = []
  const MATH_RE = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(?:align\*?|eqnarray\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\}[\s\S]*?\\end\{(?:align\*?|eqnarray\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\})/gs
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ content: text.slice(lastIndex, match.index), isMath: false })
    segments.push({ content: match[0], isMath: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ content: text.slice(lastIndex), isMath: false })
  return segments
}

function transformNonMath(text: string, fn: (t: string) => string): string {
  return splitMathNonMath(text).map((s) => (s.isMath ? s.content : fn(s.content))).join('')
}

function preProcessEquationCommands(text: string): string {
  return splitMathNonMath(text).map((seg) => {
    let t = seg.content
    const inMath = seg.isMath
    const repl: [string, (inner: string) => string][] = [
      ['\\heva', (inner) => {
        const clean = inner.replace(/^\s*&\s*/gm, '').replace(/&/g, '')
        return inMath ? `\\begin{cases}${clean}\\end{cases}` : `\\[\\begin{cases}${clean}\\end{cases}\\]`
      }],
      ['\\hoac', (inner) => {
        const clean = inner.replace(/^\s*&\s*/gm, '').replace(/&/g, '')
        return inMath ? `\\left[\\begin{array}{l}${clean}\\end{array}\\right.` : `\\[\\left[\\begin{array}{l}${clean}\\end{array}\\right.\\]`
      }],
    ]
    for (const [cmd, build] of repl) {
      let out = ''
      let i = 0
      while (i < t.length) {
        const idx = t.indexOf(cmd, i)
        if (idx === -1) { out += t.slice(i); break }
        out += t.slice(i, idx)
        let j = idx + cmd.length
        while (j < t.length && /[ \t\n]/.test(t[j])) j++
        if (j >= t.length || t[j] !== '{') { out += cmd; i = idx + cmd.length; continue }
        const parsed = readBraceGroup(t, j)
        if (!parsed) { out += cmd; i = idx + cmd.length; continue }
        out += build(parsed.group)
        i = parsed.nextIndex
      }
      t = out
    }
    return t
  }).join('')
}

function stripMetaCommands(text: string): string {
  return text
    .replace(/\\allowdisplaybreaks\b/g, '')
    .replace(/\\newpage\b/g, '').replace(/\\clearpage\b/g, '').replace(/\\pagebreak\b/g, '')
    .replace(/\\noindent\b/g, '')
    .replace(/\\medskip\b/g, '').replace(/\\bigskip\b/g, '').replace(/\\smallskip\b/g, '')
    .replace(/\\vspace\s*\{[^}]*\}/g, '').replace(/\\hspace\s*\{[^}]*\}/g, ' ')
    .replace(/\\phantom\s*\{[^}]*\}/g, '')
    .replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\ref\s*\{[^}]*\}/g, '')
    .replace(/\\linebreak\b/g, '')
}

function expandImmini(content: string): string {
  let result = content
  let searchFrom = 0
  while (true) {
    const idx = result.indexOf('\\immini', searchFrom)
    if (idx === -1) break
    const arg1 = readBraceGroup(result, idx + '\\immini'.length)
    if (!arg1) { searchFrom = idx + 1; continue }
    const arg2 = readBraceGroup(result, arg1.nextIndex)
    if (!arg2) { searchFrom = idx + 1; continue }
    const main = arg1.group
    const side = arg2.group
    const ci = main.search(/\\choice(?:TF)?\b|\\shortans\b/)
    const merged = ci !== -1
      ? main.substring(0, ci) + '\n\n' + side + '\n\n' + main.substring(ci)
      : main + '\n\n' + side
    result = result.substring(0, idx) + merged + result.substring(arg2.nextIndex)
    searchFrom = idx + merged.length
  }
  return result
}

function skipSpaces(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++
  return i
}

function readBraceGroup(s: string, startIndex: number): { group: string; nextIndex: number } | null {
  let i = skipSpaces(s, startIndex)
  if (i >= s.length || s[i] !== '{') return null
  i++
  let depth = 1
  const start = i
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
    if (depth === 0) return { group: s.substring(start, i - 1), nextIndex: i }
  }
  return null
}

function extractCommandGroup(input: string, command: string): { group: string | null; cleaned: string } {
  const idx = input.indexOf(command)
  if (idx === -1) return { group: null, cleaned: input }
  const braceStart = input.indexOf('{', idx + command.length)
  if (braceStart === -1) return { group: null, cleaned: input }
  const parsed = readBraceGroup(input, braceStart)
  if (!parsed) return { group: null, cleaned: input }
  return { group: parsed.group, cleaned: input.substring(0, idx) + input.substring(parsed.nextIndex) }
}

function parseBraceGroupsAfterCommand(input: string, command: string, maxGroups: number): string[] {
  const cmdRegex = new RegExp(command.replace(/\\/g, '\\\\') + '(?:\\[[^\\]]*\\])?')
  const cmdMatch = input.match(cmdRegex)
  if (!cmdMatch || cmdMatch.index === undefined) return []
  let i = cmdMatch.index + cmdMatch[0].length
  const groups: string[] = []
  for (let k = 0; k < maxGroups; k++) {
    i = skipSpaces(input, i)
    const bracePos = input.indexOf('{', i)
    if (bracePos === -1 || bracePos > i + 5) break
    const parsed = readBraceGroup(input, bracePos)
    if (!parsed) break
    groups.push(parsed.group)
    i = parsed.nextIndex
  }
  return groups
}
