// @ts-nocheck
import { useEffect, useRef } from 'react'
import { Trash2, ClipboardPaste } from 'lucide-react'

/**
 * Giao diện xem trước trực quan cho nội dung Markdown OCR/Word:
 *   - Render công thức bằng MathJax, hiển thị ảnh đúng ngữ cảnh (trong câu hỏi).
 *   - Mỗi ảnh có nút Xoá / Thay ngay tại chỗ (rê chuột vào ảnh để hiện nút).
 * Nhận `markdown` + `onChange(newMarkdown)`. Nguồn dữ liệu vẫn là chuỗi markdown ở trang cha.
 */
export default function MarkdownReview({ markdown, onChange }: any) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Nạp MathJax một lần
  useEffect(() => {
    if ((window as any).MathJax) return
    ;(window as any).MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'global' },
    }
    const s = document.createElement('script')
    s.id = 'mathjax-script'; s.async = true
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
    document.head.appendChild(s)
  }, [])

  // Typeset lại mỗi khi nội dung đổi
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let n = 0
    const run = () => (window as any).MathJax?.typesetPromise?.([el]).catch(() => {})
    if ((window as any).MathJax?.typesetPromise) { const t = setTimeout(run, 30); return () => clearTimeout(t) }
    const iv = setInterval(() => { if ((window as any).MathJax?.typesetPromise || n++ > 40) { clearInterval(iv); run() } }, 150)
    return () => clearInterval(iv)
  }, [markdown])

  const segments = splitByImages(markdown || '')

  const deleteImage = (full: string) =>
    onChange((markdown || '').split(full).join('').replace(/\n{3,}/g, '\n\n'))

  const replaceImage = (full: string, file: File) => {
    const r = new FileReader()
    r.onload = () => onChange((markdown || '').split(full).join(`![hình](${String(r.result)})`))
    r.readAsDataURL(file)
  }

  return (
    <div ref={rootRef}
      className="markdown-review bg-white border border-gray-200 rounded-xl p-5 md:p-6 max-h-[62vh] overflow-y-auto leading-relaxed text-[15px] text-gray-800">
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <ImageBlock key={i} src={seg.src} alt={seg.alt}
            onDelete={() => deleteImage(seg.full)}
            onReplace={(f: File) => replaceImage(seg.full, f)} />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: mdChunkToHtml(seg.content) }} />
        ),
      )}
      {segments.length === 0 && <p className="text-gray-400 italic">Chưa có nội dung.</p>}
    </div>
  )
}

/** 1 ảnh trong nội dung + nút Xoá / Thay tại chỗ. */
function ImageBlock({ src, alt, onDelete, onReplace }: any) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'))
    const f = item?.getAsFile()
    if (f) { e.preventDefault(); onReplace(f) }
  }
  return (
    <div className="relative inline-block my-3 group focus:outline-none" tabIndex={0} onPaste={onPaste}
      title="Rê chuột để Xoá/Thay ảnh · bấm vào rồi Ctrl+V để dán ảnh mới">
      <img src={src} alt={alt || 'hình'} className="block max-h-72 max-w-full rounded-lg border-2 border-teal-100 shadow-sm" />
      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition">
        <button onClick={() => inputRef.current?.click()} title="Thay ảnh khác"
          className="p-2 rounded-lg bg-white/90 hover:bg-teal-600 hover:text-white text-teal-700 shadow border border-teal-200">
          <ClipboardPaste className="w-4 h-4" />
        </button>
        <button onClick={onDelete} title="Xoá ảnh này"
          className="p-2 rounded-lg bg-white/90 hover:bg-red-600 hover:text-white text-red-600 shadow border border-red-200">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.target.value = '' }} />
    </div>
  )
}

// ============================================================
// Tách markdown thành đoạn text / ảnh (giữ đúng thứ tự)
// ============================================================
function splitByImages(md: string) {
  const re = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|[^)]+)\)/g
  const segs: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) segs.push({ type: 'text', content: md.slice(last, m.index) })
    segs.push({ type: 'image', full: m[0], alt: m[1], src: m[2] })
    last = m.index + m[0].length
  }
  if (last < md.length) segs.push({ type: 'text', content: md.slice(last) })
  return segs
}

// ============================================================
// Markdown (đoạn text, không ảnh) → HTML, giữ $...$ cho MathJax
// ============================================================
function mdChunkToHtml(md: string): string {
  const latex: string[] = []
  let t = (md || '')
    .replace(/\$\$[\s\S]*?\$\$/g, (x) => { latex.push(x); return `@@L${latex.length - 1}@@` })
    .replace(/\$(?!\$)(?:\\.|[^$\n])+?\$/g, (x) => { latex.push(x); return `@@L${latex.length - 1}@@` })

  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // heading luôn thành block riêng
  t = t.replace(/(^|\n)(#{1,4}\s+[^\n]+)/g, '$1\n$2\n')

  const inl = (s: string) => s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

  const out: string[] = []
  for (const raw of t.split(/\n{2,}/)) {
    const b = raw.replace(/\n+$/, '')
    if (!b.trim()) continue
    const lines = b.split('\n')

    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|'))) { out.push(tableHtml(b, inl)); continue }
    const h = b.match(/^(#{1,4})\s+(.*)$/)
    if (h && !b.includes('\n')) { const lv = Math.min(4, h[1].length) + 1; out.push(`<h${lv}>${inl(h[2].trim())}</h${lv}>`); continue }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) { out.push('<ul>' + lines.map((l) => `<li>${inl(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>'); continue }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) { out.push('<ol>' + lines.map((l) => `<li>${inl(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>'); continue }
    out.push('<p>' + inl(b).replace(/\n/g, '<br>') + '</p>')
  }

  let html = out.join('\n')
  latex.forEach((v, i) => { html = html.split(`@@L${i}@@`).join(v) })
  return html
}

function tableHtml(block: string, inl: (s: string) => string): string {
  const rows = block.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'))
  if (rows.length < 2) return `<p>${inl(block)}</p>`
  const isSep = (l: string) => /^[|\-\s:]+$/.test(l.replace(/\|/g, ''))
  let html = '<div style="overflow-x:auto;margin:12px 0"><table class="mdr-table"><thead>'
  let body = false
  for (const r of rows) {
    if (isSep(r)) { if (!body) { html += '</thead><tbody>'; body = true } continue }
    const cells = r.slice(1, -1).split('|')
    const tag = body ? 'td' : 'th'
    html += '<tr>' + cells.map((c) => `<${tag}>${inl(c.trim())}</${tag}>`).join('') + '</tr>'
  }
  return html + (body ? '</tbody>' : '</thead>') + '</table></div>'
}
