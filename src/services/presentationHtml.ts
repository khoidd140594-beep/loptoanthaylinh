// services/presentationHtml.ts
//
// Dựng file HTML trình chiếu SELF-CONTAINED từ SlideDeck.
//   - Theme bám test-notebooklm.html (xanh sky, Inter, topbar + progress + card).
//   - MathJax render $...$ / $$...$$.
//   - Điều hướng prev/next + phím ← → + F toàn màn hình.
//   - Ảnh crop base64 nhúng thẳng trong <img> nên tải về/offline vẫn chạy.
//
// Đầu ra là một chuỗi HTML → có thể tải về hoặc upload lên Supabase Storage.

import type { Slide, SlideDeck, SlideKind } from './slideStructureService';

const KIND_LABEL: Record<SlideKind, string> = {
  title: 'Mở đầu',
  concept: 'Khái niệm',
  example: 'Ví dụ',
  practice: 'Luyện tập',
  summary: 'Tổng kết',
  content: 'Nội dung',
};

// ============================================================
// MARKDOWN (rút gọn) → HTML, giữ nguyên LaTeX cho MathJax
// ============================================================
interface Held {
  latex: string[];
  images: string[];
}

function holdLatexAndImages(md: string): { text: string; held: Held } {
  const held: Held = { latex: [], images: [] };
  let text = md;

  text = text.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    held.latex.push(m);
    return `@@L${held.latex.length - 1}@@`;
  });
  text = text.replace(/\$(?!\$)(?:\\.|[^$\n])+?\$/g, (m) => {
    held.latex.push(m);
    return `@@L${held.latex.length - 1}@@`;
  });
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) => {
    held.images.push(
      `<img class="slide-img" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy">`,
    );
    return `@@I${held.images.length - 1}@@`;
  });

  return { text, held };
}

function restore(html: string, held: Held): string {
  let out = html;
  held.latex.forEach((v, i) => {
    out = out.split(`@@L${i}@@`).join(v);
  });
  held.images.forEach((v, i) => {
    out = out.split(`@@I${i}@@`).join(v);
  });
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(s: string): string {
  // Chạy sau khi đã escape HTML. In đậm / nghiêng / code inline.
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderTable(block: string): string {
  const rows = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (rows.length < 2) return '';
  const isSep = (l: string) => /^[|\-\s:]+$/.test(l.replace(/\|/g, ''));

  let html = '<div class="table-wrap"><table class="md-table"><thead>';
  let inBody = false;
  let headerDone = false;
  for (const r of rows) {
    if (isSep(r)) {
      if (!inBody) {
        html += '</thead><tbody>';
        inBody = true;
      }
      continue;
    }
    const cells = r.slice(1, -1).split('|');
    const tag = inBody ? 'td' : 'th';
    if (!inBody) headerDone = true;
    html += '<tr>' + cells.map((c) => `<${tag}>${inlineFormat(c.trim())}</${tag}>`).join('') + '</tr>';
  }
  html += inBody ? '</tbody>' : headerDone ? '</thead>' : '';
  return html + '</table></div>';
}

function mdToHtml(md: string): string {
  const { text, held } = holdLatexAndImages(md);
  let escaped = escapeHtml(text);

  // Đảm bảo dòng heading (#, ##, ###...) luôn là block riêng → tránh hiện "###" thô
  // khi AI đặt heading dính liền với dòng kế tiếp.
  escaped = escaped.replace(/(^|\n)(#{1,4}\s+[^\n]+)/g, '$1\n$2\n');

  // Tách theo dòng trống thành block.
  const blocks = escaped.split(/\n{2,}/);
  const out: string[] = [];

  for (const raw of blocks) {
    const block = raw.replace(/\n+$/,'');
    if (!block.trim()) continue;

    // Bảng Markdown
    const lines = block.split('\n');
    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|'))) {
      out.push(renderTable(block));
      continue;
    }

    // Heading
    const h = block.match(/^(#{1,4})\s+(.*)$/);
    if (h && !block.includes('\n')) {
      const level = Math.min(4, h[1].length) + 1; // ## -> h3 để không đè slide-title
      out.push(`<h${level}>${inlineFormat(h[2].trim())}</h${level}>`);
      continue;
    }

    // Danh sách không thứ tự
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(
        '<ul>' +
          lines.map((l) => `<li>${inlineFormat(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') +
          '</ul>',
      );
      continue;
    }

    // Danh sách có thứ tự
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      out.push(
        '<ol>' +
          lines.map((l) => `<li>${inlineFormat(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') +
          '</ol>',
      );
      continue;
    }

    // Đoạn văn (ảnh đứng riêng vẫn nằm trong <p>, không sao)
    out.push('<p>' + inlineFormat(block).replace(/\n/g, '<br>') + '</p>');
  }

  return restore(out.join('\n'), held);
}

// ============================================================
// SLIDE → HTML
// ============================================================
function renderSlide(slide: Slide, index: number, total: number): string {
  const badge = KIND_LABEL[slide.kind] ?? 'Nội dung';
  const body = mdToHtml(slide.content);
  const notes = slide.notes
    ? `<div class="slide-notes"><i class="fas fa-lightbulb"></i><div>${mdToHtml(slide.notes)}</div></div>`
    : '';
  const title = slide.title ? `<h2 class="slide-title">${escapeHtml(slide.title)}</h2>` : '';

  return [
    `<section class="slide kind-${slide.kind}" data-index="${index}">`,
    '  <div class="slide-content-card">',
    `    <div class="slide-eyebrow"><span class="kind-badge">${escapeHtml(badge)}</span>`,
    `      <span class="slide-counter">${index + 1} / ${total}</span></div>`,
    `    ${title}`,
    `    <div class="slide-body">${body}</div>`,
    `    ${notes}`,
    '  </div>',
    '</section>',
  ].join('\n');
}

// ============================================================
// EXPORT: HTML đầy đủ
// ============================================================
export function generatePresentationHtml(deck: SlideDeck): string {
  const total = deck.slides.length;
  const slidesHtml = deck.slides.map((s, i) => renderSlide(s, i, total)).join('\n');
  const safeTitle = escapeHtml(deck.title || 'Bài giảng');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script>
window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]],processEscapes:true},svg:{fontCache:"global"}};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<style>
:root{--primary:#0d9488;--primary-dark:#0f766e;--primary-light:#ccfbf1;--secondary:#14b8a6;--accent:#5eead4;
--bg-body:#f0fdfa;--bg-card:#fff;--text-main:#1f2937;--text-muted:#475569;--border:#99f6e4;
--radius-md:12px;--radius-lg:20px;--shadow:0 10px 15px -3px rgba(13,148,136,.12);}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',sans-serif;background:var(--bg-body);color:var(--text-main);height:100vh;
display:flex;flex-direction:column;overflow:hidden;line-height:1.6;}
.topbar{height:60px;background:var(--bg-card);display:flex;align-items:center;justify-content:space-between;
padding:0 24px;box-shadow:0 1px 3px rgba(0,0,0,.1);z-index:20;}
.topbar-left{display:flex;align-items:center;gap:12px;font-weight:600;color:var(--primary);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;}
.badge{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;padding:4px 10px;
border-radius:8px;font-size:13px;letter-spacing:.5px;flex-shrink:0;}
.topbar-right{font-weight:500;color:var(--text-muted);font-size:15px;display:flex;gap:14px;align-items:center;}
.icon-btn{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:6px;border-radius:8px;}
.icon-btn:hover{background:var(--primary-light);color:var(--primary);}
.progress-container{height:4px;background:var(--border);width:100%;}
.progress-bar{height:100%;width:0;background:linear-gradient(90deg,var(--primary),var(--accent));transition:width .35s ease;}
.stage{flex:1;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;padding:28px 20px;}
.slides-wrapper{width:100%;height:100%;max-width:960px;position:relative;}
.slide{position:absolute;inset:0;opacity:0;pointer-events:none;transform:translateY(14px);
transition:opacity .3s ease,transform .3s ease;overflow-y:auto;}
.slide.active{opacity:1;pointer-events:auto;transform:none;}
.slide-content-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);
box-shadow:var(--shadow);padding:32px 36px;min-height:100%;}
.slide-eyebrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.kind-badge{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--primary);
background:var(--primary-light);padding:5px 12px;border-radius:50px;}
.slide-counter{font-size:13px;color:var(--text-muted);font-weight:600;}
.slide-title{font-size:1.8rem;font-weight:800;color:var(--primary-dark);margin-bottom:18px;line-height:1.3;}
.kind-title .slide-title{font-size:2.3rem;}
.slide-body{font-size:1.08rem;color:var(--text-main);}
.slide-body h3,.slide-body h4,.slide-body h5{color:var(--primary-dark);margin:16px 0 8px;font-weight:700;}
.slide-body p{margin:10px 0;}
.slide-body ul,.slide-body ol{margin:10px 0 10px 24px;}
.slide-body li{margin:6px 0;}
.slide-body strong{color:var(--primary-dark);}
.slide-body code{background:var(--primary-light);padding:1px 6px;border-radius:6px;font-size:.92em;}
.slide-img{max-width:100%;max-height:340px;display:block;margin:16px auto;border-radius:var(--radius-md);
border:1px solid var(--border);box-shadow:var(--shadow);}
.table-wrap{overflow-x:auto;margin:14px 0;}
.md-table{width:100%;border-collapse:collapse;border-radius:var(--radius-md);overflow:hidden;font-size:.97rem;}
.md-table th{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;font-weight:700;
padding:10px 14px;text-align:center;}
.md-table td{background:#fff;padding:9px 14px;text-align:center;border:1px solid var(--border);}
.md-table tr:nth-child(even) td{background:var(--bg-body);}
.slide-notes{margin-top:20px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius-md);
display:flex;gap:10px;color:#92400e;font-size:.95rem;}
.slide-notes i{color:#f59e0b;margin-top:3px;}
.navbar{height:64px;background:var(--bg-card);border-top:1px solid var(--border);display:flex;
align-items:center;justify-content:space-between;padding:0 24px;box-shadow:0 -1px 3px rgba(0,0,0,.06);}
.nav-btn{display:inline-flex;align-items:center;gap:8px;background:var(--primary-light);color:var(--primary);
border:none;padding:11px 22px;border-radius:50px;font-size:.95rem;font-weight:700;font-family:inherit;cursor:pointer;}
.nav-btn.primary{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;}
.nav-btn:disabled{opacity:.4;cursor:not-allowed;}
.nav-dots{display:flex;gap:6px;flex-wrap:wrap;max-width:50%;justify-content:center;}
.dot{width:9px;height:9px;border-radius:50%;background:var(--border);cursor:pointer;transition:all .2s;}
.dot.active{background:var(--primary);transform:scale(1.35);}
@media(max-width:600px){.slide-content-card{padding:20px;}.slide-title{font-size:1.4rem;}.nav-dots{display:none;}}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left"><span class="badge">BÀI GIẢNG</span><span>${safeTitle}</span></div>
  <div class="topbar-right">
    <span id="topCounter">1 / ${total}</span>
    <button class="icon-btn" onclick="toggleFullscreen()" title="Toàn màn hình"><i class="fas fa-expand"></i></button>
  </div>
</div>
<div class="progress-container"><div class="progress-bar" id="progressBar"></div></div>
<div class="stage"><div class="slides-wrapper" id="slidesWrapper">
${slidesHtml}
</div></div>
<div class="navbar">
  <button class="nav-btn" id="prevBtn" onclick="prevSlide()"><i class="fas fa-chevron-left"></i> Trước</button>
  <div class="nav-dots" id="navDots"></div>
  <button class="nav-btn primary" id="nextBtn" onclick="nextSlide()">Sau <i class="fas fa-chevron-right"></i></button>
</div>
<script>
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var total=slides.length,cur=0;
  var dots=document.getElementById('navDots');
  slides.forEach(function(_,i){
    var d=document.createElement('div');d.className='dot';d.onclick=function(){go(i);};dots.appendChild(d);
  });
  var dotEls=[].slice.call(dots.children);
  function render(){
    slides.forEach(function(s,i){s.classList.toggle('active',i===cur);});
    dotEls.forEach(function(d,i){d.classList.toggle('active',i===cur);});
    document.getElementById('progressBar').style.width=((cur+1)/total*100)+'%';
    document.getElementById('topCounter').textContent=(cur+1)+' / '+total;
    document.getElementById('prevBtn').disabled=cur===0;
    document.getElementById('nextBtn').disabled=cur===total-1;
    var active=slides[cur];if(active)active.scrollTop=0;
    if(window.MathJax&&MathJax.typesetPromise)MathJax.typesetPromise([slides[cur]]).catch(function(){});
  }
  function go(i){cur=Math.max(0,Math.min(total-1,i));render();}
  window.nextSlide=function(){go(cur+1);};
  window.prevSlide=function(){go(cur-1);};
  window.toggleFullscreen=function(){
    if(!document.fullscreenElement)document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();
    else document.exitFullscreen&&document.exitFullscreen();
  };
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')window.nextSlide();
    else if(e.key==='ArrowLeft'||e.key==='PageUp')window.prevSlide();
    else if(e.key==='f'||e.key==='F')window.toggleFullscreen();
  });
  render();
})();
</script>
</body>
</html>`;
}
