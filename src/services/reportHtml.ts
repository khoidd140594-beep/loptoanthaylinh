// =============================================================================
// reportHtml.ts  —  Sinh HTML phiếu kết quả "Thầy Phúc Toán (TPT)"
//
// HÀM THUẦN: không import React, không import firebase.
// => Dùng được ở cả client (PhieuGrader) lẫn Vercel Serverless Function (/api).
//
// Mọi công thức toán phải nằm dưới dạng LaTeX bọc trong $...$ (inline)
// hoặc $$...$$ (display). MathJax được nhúng sẵn trong trang trả về.
// =============================================================================

// ---- Kiểu dữ liệu khớp với StudentResult trong PhieuGrader.tsx ----
export interface RHSub { student: string; correct: string; ok: boolean; }
export interface RHP1 { student: string; correct: string; ok: boolean; }
export interface RHP2 { subs: RHSub[]; qScore: number; }
export interface RHP3 { student: string; correct: string; ok: boolean; }
export interface RHP4Step { text: string; ok: boolean; }
export interface RHP4Detail { q: number; score: number; max: number; steps: RHP4Step[]; comment: string; }

export interface ReportData {
  studentName: string;
  examTitle: string;                 // vd: "Đề 07 Thầy Phúc chấm"
  weights: { p1: number; p2: number; p3: number; p4: number };
  total: number;                     // tổng /10
  p1: { score: number; results: RHP1[] };
  p2: { score: number; results: RHP2[] };
  p3: { score: number; results: RHP3[] };
  p4: { score: number; feedback: string; detail?: RHP4Detail[] };
  comments?: string[];               // nhận xét chung (tuỳ chọn)
  advice?: string;                   // lời khuyên (tuỳ chọn, có thể chứa $...$)
}

const BRAND = {
  name: 'THẦY PHÚC TOÁN (TPT)',
  slogan: 'Trước khi bỏ cuộc, hãy nghĩ đến lý do bắt đầu',
  hotline: '0985 692 879',
};

export function gradeRank(total: number): string {
  if (total >= 9) return 'Xuất sắc';
  if (total >= 8) return 'Giỏi';
  if (total >= 6.5) return 'Khá';
  if (total >= 5) return 'Trung bình';
  return 'Cần cố gắng';
}

// đổi 9.25 -> "9,25" theo kiểu VN
const vn = (n: number, d = 2) => Number(n).toFixed(d).replace('.', ',');
// escape text thường (KHÔNG escape phần $...$ vì cần giữ nguyên cho MathJax)
const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Cho phép text chứa $...$ đi qua nguyên vẹn; chỉ escape phần ngoài công thức.
function withMath(s: string): string {
  if (!s) return '';
  // tách theo $$...$$ rồi $...$, giữ nguyên phần công thức
  const parts = s.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts
    .map(p => (p.startsWith('$') ? p : esc(p).replace(/\n/g, '<br>')))
    .join('');
}

// Chuẩn hoá đáp án Đúng/Sai: mọi biến thể (D, true, 1...) -> "Đ" hoặc "S"
function dungSai(v: string): string {
  const t = String(v ?? '').trim().toLowerCase();
  if (['d', 'đ', 'dung', 'đúng', 'true', 't', '1', 'y', 'yes'].includes(t)) return 'Đ';
  if (['s', 'sai', 'false', 'f', '0', 'n', 'no'].includes(t)) return 'S';
  return esc(v); // giá trị lạ thì giữ nguyên
}

export function buildReportHtml(d: ReportData): string {
  const max = d.weights.p1 + d.weights.p2 + d.weights.p3 + d.weights.p4;
  const percent = max ? (d.total / max) * 100 : 0;
  const rank = gradeRank(d.total);

  // đánh số câu liên tục giữa các phần
  let n = 0;
  const p1Nums = d.p1.results.map(() => ++n);
  const p2Nums = d.p2.results.map(() => ++n);
  const p3Nums = d.p3.results.map(() => ++n);
  const p4Nums = (d.p4.detail || []).map(() => ++n);

  const p1Correct = d.p1.results.filter(r => r.ok).length;
  const p3Correct = d.p3.results.filter(r => r.ok).length;

  // ---- Bảng phần I: trắc nghiệm ----
  const p1Table = `
    <table>
      <tr><th>Câu</th>${p1Nums.map(q => `<th>${q}</th>`).join('')}<th>Kết quả</th></tr>
      <tr><th>Đáp án</th>${d.p1.results.map(r => `<td>${esc(r.correct)}</td>`).join('')}
        <td rowspan="3" style="font-weight:900;font-size:18px">${p1Correct}/${d.p1.results.length}<br>câu đúng</td></tr>
      <tr><th>Bài làm</th>${d.p1.results.map(r => `<td class="${r.ok ? '' : 'wrong'}">${esc(r.student)}</td>`).join('')}</tr>
      <tr><th>Kết quả</th>${d.p1.results.map(r => `<td class="${r.ok ? 'right' : 'wrong'}">${r.ok ? '✓' : '×'}</td>`).join('')}</tr>
    </table>`;

  // ---- Phần II: đúng/sai ----
  const p2Boxes = d.p2.results.map((g, i) => {
    const rows = g.subs.map((s, j) => {
      const lbl = ['a', 'b', 'c', 'd'][j] || String(j + 1);
      return `<tr><td>${lbl}</td><td>${dungSai(s.correct)}</td><td>${dungSai(s.student)}</td>
        <td class="${s.ok ? 'right' : 'wrong'}">${s.ok ? '✓' : '×'}</td></tr>`;
    }).join('');
    const ok = g.subs.filter(s => s.ok).length;
    return `<div class="mini-box"><h3>Câu ${p2Nums[i]}</h3>
      <table><tr><th>Ý</th><th>Đáp án</th><th>Bài làm</th><th>KQ</th></tr>${rows}
      <tr><td colspan="4" style="font-weight:900;color:#0c7a38">${ok}/${g.subs.length} ý đúng</td></tr></table></div>`;
  }).join('');

  // ---- Phần III: trả lời ngắn ----
  const p3Rows = d.p3.results.map((r, i) =>
    `<tr><td>${p3Nums[i]}</td><td>${withMath(r.correct)}</td><td>${withMath(r.student)}</td>
      <td class="${r.ok ? 'right' : 'wrong'}">${r.ok ? '✓' : '×'}</td></tr>`).join('');

  // ---- Phần IV: tự luận ----
  const essayRows = (d.p4.detail || []).map((q, i) =>
    `<tr><td style="font-weight:900">${p4Nums[i]}</td>
      <td style="text-align:left">${q.steps.map(s => `${s.ok ? '✅' : '❌'} ${withMath(s.text)}`).join('<br>')}</td>
      <td style="font-weight:900">${vn(q.max)}</td>
      <td class="score-cell">${vn(q.score)}</td>
      <td style="text-align:left">${withMath(q.comment)}</td></tr>`).join('');

  const essayTable = (d.p4.detail && d.p4.detail.length)
    ? `<table class="essay-table">
        <tr><th>Câu</th><th>Lời giải / Bước</th><th>Tối đa</th><th>Điểm chấm</th><th>Nhận xét</th></tr>
        ${essayRows}
        <tr><td colspan="2" style="font-weight:900">TỔNG</td>
          <td style="font-weight:900">${vn(d.weights.p4)}</td>
          <td class="score-cell">${vn(d.p4.score)}</td><td></td></tr>
       </table>`
    : `<div style="padding:14px">${withMath(d.p4.feedback)}</div>`;

  const comments = (d.comments && d.comments.length ? d.comments : [
    `Tổng điểm ${vn(d.total)}/${vn(max)} – xếp loại ${rank}.`,
  ]).map(c => `<li><span class="check">✓</span><span>${withMath(c)}</span></li>`).join('');

  const bar = (s: number, m: number) => (m ? Math.max(6, (s / m) * 150) : 6);

  return `<!DOCTYPE html>
<html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.studentName)} – ${esc(d.examTitle)} | ${BRAND.name}</title>
<meta property="og:title" content="Phiếu kết quả: ${esc(d.studentName)} — ${vn(d.total)}/10">
<meta property="og:description" content="${esc(d.examTitle)} • Xếp loại ${rank} • ${BRAND.name}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&display=swap" rel="stylesheet">
<script>
  window.MathJax = {
    tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$'],['\\\\[','\\\\]']], processEscapes: true },
    options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
  };
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
<style>
  :root{--font:'Nunito',-apple-system,'Segoe UI',sans-serif;--navy:#073b80;--navy2:#0b3b78;--red:#d90416;--teal:#0f766e}
  *{box-sizing:border-box;font-family:var(--font)}
  body{margin:0;font-family:var(--font);background:#eaf7ff;color:#08224a;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  .report{max-width:1080px;margin:0 auto;background:linear-gradient(180deg,#eefaff,#fff);padding:18px 22px;border:1px solid #c8dff0}
  .header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .brand-name{font-weight:900;color:#0b3b78;font-size:22px}
  .slogan{font-size:14px;font-weight:700;font-style:italic;color:#0f766e}
  .student-name{font-size:clamp(28px,5vw,54px);font-weight:900;color:#09275b;text-transform:uppercase;text-align:center}
  .exam-title{display:inline-block;margin-top:10px;background:#d90416;color:#fff;font-weight:900;font-size:clamp(16px,2.5vw,26px);padding:10px 28px;border-radius:6px}
  .grid{display:grid;grid-template-columns:340px 1fr;gap:18px}
  @media(max-width:820px){.grid{grid-template-columns:1fr}}
  .card{background:#fff;border:2px solid #0d3d7a;border-radius:10px;overflow:hidden;margin-bottom:14px}
  .card-title{background:#073b80;color:#fff;font-weight:900;padding:9px 14px;text-align:center;text-transform:uppercase}
  .card-body{padding:14px}
  .score-big{text-align:center;color:#d90416;font-size:60px;font-weight:900;line-height:1}
  .percent{text-align:center;color:#083b84;font-size:24px;font-weight:900;margin-top:4px}
  .rank{color:#d90416;font-size:34px;font-weight:900;text-align:center;margin-top:8px}
  .chart{height:190px;display:flex;align-items:end;justify-content:space-around;gap:10px;padding-top:8px;border-left:2px solid #08224a;border-bottom:2px solid #08224a;margin-left:14px}
  .bar-wrap{text-align:center;flex:1;font-weight:800;font-size:12px}
  .bar{width:42px;margin:0 auto 6px;border-radius:6px 6px 0 0;color:#fff;font-weight:900;padding-top:3px;font-size:12px}
  .b1{background:#3298d3}.b2{background:#64bd32}.b3{background:#ff9f1a}.b4{background:#4b46b9}
  .note-list{list-style:none;padding:0;margin:0;font-size:15px}
  .note-list li{margin-bottom:10px;display:flex;gap:8px}
  .check{background:#20a64a;color:#fff;width:24px;height:24px;min-width:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:900}
  .section{border-radius:10px;overflow:hidden;margin-bottom:12px;border:1.5px solid #b8c7d8;background:#fff}
  .section-title{color:#fff;font-weight:900;font-size:19px;padding:8px 14px;text-transform:uppercase}
  .blue{background:#0956b5}.green{background:#0d985a}.orange{background:#ef8500}.purple{background:#6b2bb8}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{border:1px solid #cbd6e2;padding:7px 5px;text-align:center}
  th{background:#f0f6ff;font-weight:900}
  .right{color:#15a34a;font-weight:900}.wrong{color:#d90416;font-weight:900}
  .wrong-text{color:#d90416;font-weight:900;padding:8px 12px;font-size:14px}
  .small-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}
  @media(max-width:520px){.small-grid{grid-template-columns:1fr}}
  .mini-box{border:1.5px solid #7ec89b;border-radius:8px;overflow:hidden}
  .mini-box h3{margin:0;padding:6px;color:#0c7a38;text-align:center;font-size:16px}
  .score-cell{color:#d90416;font-weight:900}
  .essay-table td:nth-child(2){text-align:left}
  .footer{margin:16px -22px -18px;background:#073b80;color:#fff;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:12px 22px;font-weight:900;font-size:14px}
  .footer span{color:#ffd32a}
</style></head>
<body><div class="report">
  <header class="header">
    <div>
      <div class="brand-name">${BRAND.name}</div>
      <div class="slogan">“${BRAND.slogan}”</div>
    </div>
    <div style="font-weight:900">☎ ${BRAND.hotline}</div>
  </header>

  <div class="student-name">${esc(d.studentName)}</div>
  <div style="text-align:center"><div class="exam-title">★ ${esc(d.examTitle)} ★</div></div>

  <main class="grid" style="margin-top:18px">
    <aside>
      <section class="card"><div class="card-title">⭐ Tổng kết bài làm</div><div class="card-body">
        <div class="score-big">${vn(d.total)}/${vn(max)}</div>
        <div class="percent">(${vn(percent, 1)}%)</div>
        <div class="rank">${rank.toUpperCase()} 🏆</div>
      </div></section>

      <section class="card"><div class="card-title">Biểu đồ điểm</div><div class="card-body">
        <div class="chart">
          <div class="bar-wrap"><div class="bar b1" style="height:${bar(d.p1.score, d.weights.p1)}px">${vn(d.p1.score)}</div>TN<br>(${vn(d.weights.p1)}đ)</div>
          <div class="bar-wrap"><div class="bar b2" style="height:${bar(d.p2.score, d.weights.p2)}px">${vn(d.p2.score)}</div>Đ/S<br>(${vn(d.weights.p2)}đ)</div>
          <div class="bar-wrap"><div class="bar b3" style="height:${bar(d.p3.score, d.weights.p3)}px">${vn(d.p3.score)}</div>TLN<br>(${vn(d.weights.p3)}đ)</div>
          <div class="bar-wrap"><div class="bar b4" style="height:${bar(d.p4.score, d.weights.p4)}px">${vn(d.p4.score)}</div>TL<br>(${vn(d.weights.p4)}đ)</div>
        </div>
      </div></section>

      <section class="card"><div class="card-title">Nhận xét chung</div>
        <div class="card-body"><ul class="note-list">${comments}</ul></div></section>

      ${d.advice ? `<section class="card"><div class="card-title">💡 Lời khuyên</div>
        <div class="card-body" style="font-size:15px">${withMath(d.advice)}</div></section>` : ''}
    </aside>

    <section>
      <section class="section"><div class="section-title blue">I. Trắc nghiệm – ${vn(d.p1.score)}/${vn(d.weights.p1)} điểm</div>
        ${p1Table}
      </section>

      <section class="section"><div class="section-title green">II. Đúng / Sai – ${vn(d.p2.score)}/${vn(d.weights.p2)} điểm</div>
        <div class="small-grid">${p2Boxes}</div></section>

      <section class="section"><div class="section-title orange">III. Trả lời ngắn – ${vn(d.p3.score)}/${vn(d.weights.p3)} điểm</div>
        <table><tr><th>Câu</th><th>Đáp án đúng</th><th>Bài làm</th><th>KQ</th></tr>${p3Rows}</table>
        <div class="wrong-text" style="color:#0c7a38">${p3Correct}/${d.p3.results.length} câu đúng</div></section>

      <section class="section"><div class="section-title purple">IV. Tự luận – ${vn(d.p4.score)}/${vn(d.weights.p4)} điểm</div>
        ${essayTable}</section>
    </section>
  </main>

  <footer class="footer">
    <div>☎ HOTLINE: <span>${BRAND.hotline}</span></div>
    <div>⭐ ${BRAND.name}</div>
  </footer>
</div></body></html>`;
}
