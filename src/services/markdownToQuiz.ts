// @ts-nocheck
// services/markdownToQuiz.ts
//
// Tách câu hỏi từ text OCR/Word (Markdown) → danh sách câu hỏi cho quiz tương tác.
// Port từ extractQuestionsFromTextEnhanced (code.gs), thêm bước đổi ảnh Markdown
// ![](data:...) → <img class="quiz-img"> để bộ quiz (innerHTML) hiển thị được.
//
// Trả về mảng { type, question, options?, correct?, statements?, correctAnswers?, correct_answer? }
// khớp hình dạng mà interactiveQuizHtml cần.

export function extractQuizFromText(rawText: string): any[] {
  // Đổi ảnh Markdown → <img> để hiển thị trong quiz (quiz dùng innerHTML)
  let cleaned = (rawText || '')
    .replace(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g, '<img class="quiz-img" src="$1">')
    .replace(/^-{2,}\s*Trang\s*\d+\s*-{2,}$/gm, '')
    .replace(/^Trang\s+\d+\/\d+\s*[-–—].*$/gm, '')
    .trim()

  // Ép các phương án A. B. C. D. và a) b) c) d) xuống dòng riêng
  cleaned = cleaned.replace(/(\s)(A|B|C|D)(\s*[.)]\s+)/g, '\n$2$3')
  cleaned = cleaned.replace(/(\s)(a|b|c|d)(\s*\)\s+)/g, '\n$2$3')

  const PAT = {
    MC:     /^\s*\*{0,2}#?\*{0,2}\s*([A-D])\s*[.\)]\s*(.*)/,
    TF:     /^\s*\*{0,2}#?\*{0,2}\s*([a-d])\s*\)\s*(.*)/,
    UL:     /underline/i,
    SOL:    /^\s*\*{0,2}(?:Lời\s*giải|Gi[aả]i|Solution|Hướng\s*dẫn|HD)\*{0,2}[:\s.]*(.*)/i,
    ANS:    /^\s*(?:Đáp\s*án|ĐA|Chọn)[:\s.]*\s*([A-D①②③④])\b/i,
    TF_ANS: /^\s*(?:Đáp\s*án|ĐA)[:\s]+((?:[a-d]\s*[:\-]\s*(?:Đúng|Sai|T|F|Đ|S)[,;\s]*)+)/i,
  }

  const lines = cleaned.split(/\n+/).filter((l) => l.trim())
  const qs: any[] = []
  let cur: any = null

  function finish() {
    if (!cur) return

    // Auto-heal: cắt nhầm câu hỏi thành phương án → hạ về trả lời ngắn
    if (cur.type === 'multiple_choice' && cur.options.length < 2) {
      cur.type = 'short_answer'
      cur.raw.push(...cur.options.map((o: any) => o.letter + '. ' + o.text))
      cur.options = []
    } else if (cur.type === 'true_false' && cur.statements.length < 2) {
      cur.type = 'short_answer'
      cur.raw.push(...cur.statements.map((s: any) => s.letter + ') ' + s.text))
      cur.statements = []
    }

    const q: any = { type: cur.type, question: cur.raw.join('\n').trim() }
    const solText = cur.solution.join('\n').trim()

    if (q.type === 'multiple_choice') {
      q.options = cur.options.map((o: any) => o.text)
      q.correct = cur.correctFromPdf || cur.correct || null
      if (!q.correct && solText) {
        const match = solText.match(/(?:Chọn|Đáp\s*án|ĐA|Vậy)[^\wA-D①②③④]*([A-D①②③④])/i)
        if (match) {
          let ansChar = match[1].toUpperCase()
          const mapCircle: any = { '①': 'A', '②': 'B', '③': 'C', '④': 'D' }
          if (mapCircle[ansChar]) ansChar = mapCircle[ansChar]
          q.correct = ansChar.charCodeAt(0) - 64
        }
      }
    } else if (q.type === 'true_false') {
      q.statements = cur.statements.map((s: any) => s.text)
      const combined = new Set([...cur.correctAnswers, ...(cur.correctAnswersFromPdf || [])])
      if (solText) {
        const summaryMatch = solText.match(/(?:Chọn|Đáp\s*án)[^\w]*(a\s*(?:đúng|sai).*?d\s*(?:đúng|sai))/i)
        if (summaryMatch) {
          const parts = [...summaryMatch[1].matchAll(/([a-d])\s*(đúng|sai|t|f|đ|s)/gi)]
          parts.forEach((p) => {
            if (['đúng', 't', 'đ'].includes(p[2].toLowerCase())) combined.add(p[1].toLowerCase().charCodeAt(0) - 97)
          })
        } else {
          cur.solution.forEach((sl: string) => {
            const m = sl.match(/(?:^|\s)([a-d])\s*[\).*].*?(Đúng|Sai|T|F|Đ|S)\b/i)
            if (m && ['đúng', 't', 'đ'].includes(m[2].toLowerCase())) {
              combined.add(m[1].toLowerCase().charCodeAt(0) - 97)
            }
          })
        }
      }
      q.correctAnswers = [...combined].sort((a: number, b: number) => a - b)
    } else {
      const m = q.question.match(/(?:Đáp án|Answer)[:\s]+(.*?)(?:\.|$)/i)
      if (m) {
        q.correct_answer = m[1].trim()
        q.question = q.question.replace(m[0], '').trim()
      }
    }

    if (solText) {
      q.correct_answer = (q.correct_answer ? q.correct_answer + '\n\n' : '') + solText
    }

    if (q.question) qs.push(q)
    cur = null
  }

  function detectQStart(line: string): string | null {
    let m = line.match(/^(?:<[^>]*>|\*{1,2})?\s*(?:C[aâ]u|CAU|Cau|Question|B[aà]i)\s*\d+\s*[.:\)]\**\s*/i)
    if (m) return line.slice(m[0].length).trim()
    m = line.match(/^(\d{1,3})[.)]\s+\S/)
    if (m) return line.replace(/^\d{1,3}[.)]\s+/, '').trim()
    return null
  }

  lines.forEach((l) => {
    const qContent = detectQStart(l)
    if (qContent !== null) {
      finish()
      cur = {
        raw: qContent ? [qContent] : [], type: 'short_answer', options: [], statements: [],
        correct: null, correctFromPdf: null, correctAnswers: [], correctAnswersFromPdf: [], solution: [], inSolution: false,
      }
      return
    }
    if (!cur) return

    if (cur.inSolution) { cur.solution.push(l); return }

    const solMatch = l.match(PAT.SOL)
    if (solMatch) { cur.inSolution = true; if (solMatch[1]) cur.solution.push(solMatch[1].trim()); return }

    const ansMatch = l.match(PAT.ANS)
    if (ansMatch && cur.type !== 'true_false') {
      let ansChar = ansMatch[1].toUpperCase()
      const mapCircle: any = { '①': 'A', '②': 'B', '③': 'C', '④': 'D' }
      if (mapCircle[ansChar]) ansChar = mapCircle[ansChar]
      cur.correctFromPdf = ansChar.charCodeAt(0) - 64
      const rest = l.replace(PAT.ANS, '').trim()
      if (rest) { cur.inSolution = true; cur.solution.push(rest) }
      return
    }

    const tfAnsMatch = l.match(PAT.TF_ANS)
    if (tfAnsMatch && cur.type === 'true_false') {
      [...tfAnsMatch[1].matchAll(/([a-d])\s*[:\-]\s*(Đúng|Sai|T|F|Đ|S)/gi)].forEach((p) => {
        if (['đúng', 't', 'đ'].includes(p[2].toLowerCase())) {
          cur.correctAnswersFromPdf.push(p[1].toLowerCase().charCodeAt(0) - 97)
        }
      })
      return
    }

    const mcMatch = l.match(PAT.MC)
    if (mcMatch) {
      const letter = mcMatch[1].toUpperCase()
      if (cur.type === 'multiple_choice' && cur.options.some((o: any) => o.letter === letter)) {
        cur.inSolution = true; cur.solution.push(l); return
      }
      cur.type = 'multiple_choice'
      const isC = /#/.test(l) || PAT.UL.test(l)
      cur.options.push({ letter, text: mcMatch[2].trim(), isCorrect: isC })
      if (isC && !cur.correct) cur.correct = cur.options.length
      return
    }

    const tfMatch = l.match(PAT.TF)
    if (tfMatch) {
      const letter = tfMatch[1].toLowerCase()
      if (cur.type === 'true_false' && cur.statements.some((s: any) => s.letter === letter)) {
        cur.inSolution = true; cur.solution.push(l); return
      }
      cur.type = 'true_false'
      const isC = /#/.test(l) || PAT.UL.test(l)
      cur.statements.push({ letter, text: tfMatch[2].trim(), isCorrect: isC })
      if (isC) cur.correctAnswers.push(cur.statements.length - 1)
      return
    }

    cur.raw.push(l)
  })

  finish()
  return qs
}
