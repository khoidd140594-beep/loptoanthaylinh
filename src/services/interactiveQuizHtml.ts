// @ts-nocheck
// services/interactiveQuizHtml.ts
//
// Sinh HTML "bài trình chiếu tương tác" theo đúng giao diện teal của code.gs:
//   - Trắc nghiệm: hiện đủ 4 phương án, người dùng bấm chọn → "Kiểm tra" mới lộ đáp án đúng/sai + lời giải.
//   - Đúng/Sai: bật Đúng/Sai từng mệnh đề → "Kiểm tra".
//   - Trả lời ngắn / tự luận: ô nhập nháp, "Kiểm tra" hiện đáp án/lời giải.
//   - MathJax + tự dựng bảng Markdown.
//
// Cấu trúc câu hỏi đầu vào (mỗi phần tử questions[]):
//   { type: 'multiple_choice'|'true_false'|'short_answer',
//     question: string (HTML), options?: string[], correct?: number (1-based),
//     statements?: string[], correctAnswers?: number[] (0-based), correct_answer?: string (lời giải/đáp án) }

export function generateInteractiveQuizHtml(questions: any[], title: string): string {
  const cleanTitle = String(title || 'Bài trình chiếu').replace(/\.(pdf|tex|docx?)$/i, '');
  const safeJson   = JSON.stringify(questions).replace(/<\/script>/gi, '<\\/script>');
  const L: string[] = [], P = (s: string) => L.push(s);

  P('<!DOCTYPE html><html lang="vi"><head>');
  P('<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">');
  P('<title>' + cleanTitle + '</title>');
  P('<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">');
  P('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">');
  P('<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]]},svg:{fontCache:"global"}};<\/script>');
  P('<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script>');
  P('<style>');
  P(':root{--teal:#0d9488;--teal2:#14b8a6;--teal3:#5eead4;--bg-teal:#f0fdfa;--border-teal:rgba(94,234,212,.35);');
  P('  --grad:linear-gradient(135deg,#0d9488 0%,#14b8a6 50%,#5eead4 100%);');
  P('  --shadow:0 10px 25px rgba(13,148,136,.08),0 4px 10px rgba(0,0,0,.04);');
  P('  --text:#1f2937;--green:#16a34a;--amber:#d97706;--purple:#7c3aed;--red:#dc2626;--toolbar:74px;}');
  P('*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}');
  P('body{font-family:"Inter",sans-serif;background:linear-gradient(135deg,#ccfbf1 0%,#f0fdfa 50%,#d1fae5 100%);');
  P('  min-height:100vh;color:var(--text);display:flex;flex-direction:column;height:100vh;overflow:hidden;}');
  P('.topbar{background:var(--grad);color:white;height:56px;padding:0 28px;display:flex;align-items:center;');
  P('  justify-content:space-between;flex-shrink:0;box-shadow:0 4px 16px rgba(13,148,136,.3);}');
  P('.topbar-title{font-size:.95rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
  P('  max-width:60%;display:flex;align-items:center;gap:8px;}');
  P('.topbar-meta{font-size:.8rem;opacity:.88;white-space:nowrap;}');
  P('.pb-wrap{height:4px;background:rgba(255,255,255,.5);flex-shrink:0;}');
  P('.pb-fill{height:100%;background:linear-gradient(90deg,#0d9488,#14b8a6,#5eead4);transition:width .4s ease;}');
  P('.scroll{flex:1;overflow-y:auto;padding:28px 16px 20px;}');
  P('.scroll::-webkit-scrollbar{width:5px;}.scroll::-webkit-scrollbar-thumb{background:var(--teal3);border-radius:4px;}');
  P('.slide{display:none;max-width:860px;margin:0 auto;animation:fu .3s ease;}.slide.active{display:block;}');
  P('@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}');
  P('.q-card{background:rgba(255,255,255,.95);border:2px solid var(--border-teal);border-radius:20px;box-shadow:var(--shadow);overflow:hidden;}');
  P('.q-head{background:linear-gradient(135deg,var(--bg-teal) 0%,#e2e8f0 100%);padding:22px 26px;border-bottom:2px solid var(--border-teal);}');
  P('.q-num-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}');
  P('.q-num-pill{background:var(--grad);color:white;padding:8px 18px;border-radius:50px;font-weight:700;font-size:.9rem;display:inline-flex;align-items:center;gap:7px;}');
  P('.q-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:20px;font-size:.78rem;font-weight:700;}');
  P('.bmc{background:linear-gradient(135deg,#d97706,#f59e0b);color:white;}');
  P('.btf{background:linear-gradient(135deg,#16a34a,#22c55e);color:white;}');
  P('.bsa{background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;}');
  P('.q-text{font-size:1.12rem;font-weight:600;color:var(--text);line-height:1.75;}');
  P('.q-body{padding:24px 26px;}');
  P('.opts-grid{display:grid;gap:12px;}.opts-grid.c1{grid-template-columns:1fr;}.opts-grid.c2{grid-template-columns:1fr 1fr;}');
  P('.opt{background:var(--bg-teal);border:2px solid var(--border-teal);border-radius:14px;padding:16px 18px;');
  P('  display:flex;align-items:center;gap:14px;cursor:pointer;transition:all .25s;user-select:none;}');
  P('.opt:hover{border-color:var(--teal);background:#ccfbf1;transform:translateY(-2px) translateX(4px);box-shadow:var(--shadow);}');
  P('.opt.sel{border-color:var(--amber);background:rgba(245,158,11,.08);box-shadow:0 0 0 3px rgba(245,158,11,.2);}');
  P('.opt.ok{border-color:var(--green)!important;background:rgba(22,163,74,.07)!important;box-shadow:0 0 0 3px rgba(22,163,74,.15)!important;}');
  P('.opt.ok .ol{background:var(--green)!important;}.opt.ok .ri{display:flex!important;color:var(--green);}');
  P('.opt.ng{border-color:var(--red)!important;background:rgba(220,38,38,.06)!important;box-shadow:0 0 0 3px rgba(220,38,38,.12)!important;}');
  P('.opt.ng .ol{background:var(--red)!important;}.opt.ng .ri{display:flex!important;color:var(--red);}');
  P('.ol{width:38px;height:38px;border-radius:50%;background:var(--grad);color:white;display:flex;align-items:center;');
  P('  justify-content:center;font-weight:800;font-size:.95rem;flex-shrink:0;transition:background .2s;}');
  P('.ot{font-size:1.02rem;font-weight:600;color:#374151;flex:1;line-height:1.55;}');
  P('.ri{font-size:1.3rem;margin-left:auto;flex-shrink:0;display:none;align-items:center;}');
  P('.tft{width:100%;border:2px solid var(--border-teal);border-radius:16px;overflow:hidden;background:white;}');
  P('.tfh{display:grid;grid-template-columns:1fr 96px 96px;background:var(--bg-teal);border-bottom:2px solid var(--border-teal);}');
  P('.tfhc{padding:11px 14px;font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.7px;}');
  P('.tfhc:not(:first-child){text-align:center;border-left:1px solid var(--border-teal);}');
  P('.tfhc:nth-child(2){color:var(--green);}.tfhc:nth-child(3){color:var(--red);}');
  P('.tfrw{border-bottom:1px solid rgba(94,234,212,.2);}.tfrw:last-child{border-bottom:none;}');
  P('.tfr{display:grid;grid-template-columns:1fr 96px 96px;min-height:58px;}');
  P('.tfs{padding:13px 14px;display:flex;align-items:center;gap:10px;font-size:1.02rem;font-weight:500;color:#374151;line-height:1.5;}');
  P('.sl{width:28px;height:28px;border-radius:50%;background:var(--bg-teal);color:var(--teal);border:1.5px solid var(--teal3);');
  P('  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;flex-shrink:0;}');
  P('.tfb{display:flex;align-items:center;justify-content:center;cursor:pointer;border-left:1px solid var(--border-teal);transition:background .15s;}');
  P('.tfb:hover{background:rgba(13,148,136,.06);}');
  P('.tfb .ci{width:32px;height:32px;border-radius:50%;border:2px solid #d1d5db;display:flex;align-items:center;');
  P('  justify-content:center;font-size:.85rem;color:transparent;transition:all .18s;}');
  P('.tfb.aT .ci{background:var(--green);border-color:var(--green);color:white;}');
  P('.tfb.aF .ci{background:var(--red);border-color:var(--red);color:white;}');
  P('.tfrw.tfok .tfs{background:rgba(22,163,74,.05);}.tfrw.tfok .sl{background:#dcfce7;color:var(--green);border-color:#86efac;}');
  P('.tfrw.tfng .tfs{background:rgba(220,38,38,.04);}.tfrw.tfng .sl{background:#fee2e2;color:var(--red);border-color:#fca5a5;}');
  P('.sa{width:100%;border:2px solid var(--border-teal);border-radius:12px;padding:14px 18px;font-size:1.02rem;');
  P('  font-family:inherit;resize:vertical;min-height:100px;color:#374151;background:white;transition:border-color .2s,box-shadow .2s;}');
  P('.sa:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(13,148,136,.12);}');
  P('.sol{background:rgba(239,246,255,.9);border:2px solid #bfdbfe;border-radius:16px;padding:22px 24px;margin-top:20px;display:none;}');
  P('.sol.show{display:block;animation:fu .3s ease;}');
  P('.sol-t{font-size:.75rem;font-weight:800;color:#2563eb;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:8px;}');
  P('.sol-b{font-size:1rem;color:#1e3a8a;line-height:1.7;}');
  P('.toolbar{height:var(--toolbar);background:white;border-top:2px solid var(--border-teal);padding:0 24px;display:flex;');
  P('  align-items:center;justify-content:space-between;flex-shrink:0;box-shadow:0 -4px 20px rgba(13,148,136,.1);gap:10px;}');
  P('.btn{display:inline-flex;align-items:center;gap:8px;border:none;border-radius:50px;font-size:.95rem;font-weight:700;');
  P('  font-family:inherit;padding:11px 24px;cursor:pointer;transition:all .22s;white-space:nowrap;}');
  P('.bn{background:var(--bg-teal);color:var(--teal);border:2px solid var(--teal3);}');
  P('.bn:hover:not(:disabled){background:#ccfbf1;transform:translateY(-1px);box-shadow:var(--shadow);}');
  P('.bn:disabled{opacity:.38;cursor:not-allowed;}');
  P('.bc{background:var(--grad);color:white;box-shadow:0 4px 14px rgba(13,148,136,.3);min-width:136px;justify-content:center;}');
  P('.bc:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 22px rgba(13,148,136,.38);}');
  P('.bc:disabled{opacity:.4;cursor:not-allowed;transform:none;}');
  P('.bc.done{background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 4px 14px rgba(22,163,74,.3);}');
  P('.pp{font-weight:700;font-size:1rem;color:var(--teal);background:var(--bg-teal);padding:10px 20px;border-radius:50px;border:2px solid var(--teal3);}');
  P('.quiz-img{max-width:100%;max-height:300px;border-radius:10px;box-shadow:var(--shadow);margin:14px auto;display:block;border:2px solid var(--border-teal);}');
  P('table{width:100%;border-collapse:collapse;margin:14px 0;font-size:.97rem;}');
  P('table th,table td{border:1px solid var(--teal3);padding:9px 13px;text-align:center;}');
  P('table th{background:var(--bg-teal);font-weight:700;color:var(--teal);}');
  P('.md-table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(13,148,136,.1);font-size:.97rem;}');
  P('.md-table th{background:var(--grad);color:white;font-weight:700;padding:11px 16px;text-align:center;border:1px solid rgba(255,255,255,.2);}');
  P('.md-table td{background:white;padding:10px 16px;text-align:center;border:1px solid rgba(94,234,212,.3);color:var(--text);}');
  P('.md-table tr:nth-child(even) td{background:var(--bg-teal);}.md-table tr:hover td{background:#ccfbf1;transition:background .15s;}');
  P('@media(max-width:600px){.opts-grid.c2{grid-template-columns:1fr;}.toolbar{padding:0 12px;}');
  P('  .btn{padding:10px 14px;font-size:.85rem;}.q-head,.q-body{padding:16px;}}');
  P('</style></head><body>');

  P('<div class="topbar">');
  P('  <div class="topbar-title"><i class="fas fa-graduation-cap"></i>' + cleanTitle + '</div>');
  P('  <div class="topbar-meta" id="tbMeta"></div>');
  P('</div>');
  P('<div class="pb-wrap"><div class="pb-fill" id="pbFill"></div></div>');
  P('<div class="scroll" id="scrollEl"><div id="slidesContainer"></div></div>');
  P('<div class="toolbar">');
  P('  <button class="btn bn" id="btnPrev" onclick="prevSlide()"><i class="fas fa-chevron-left"></i> Câu trước</button>');
  P('  <div style="display:flex;align-items:center;gap:10px">');
  P('    <span class="pp" id="progText">1 / 1</span>');
  P('    <button class="btn bc" id="btnCheck" onclick="checkAnswer()" disabled>Kiểm tra <i class="fas fa-paper-plane"></i></button>');
  P('  </div>');
  P('  <button class="btn bn" id="btnNext" onclick="nextSlide()">Câu sau <i class="fas fa-chevron-right"></i></button>');
  P('</div>');

  P('<script type="application/json" id="qdata">' + safeJson + '<\/script>');
  P('<script>(function(){');
  P('var Q=JSON.parse(document.getElementById("qdata").textContent),cur=0,tot=Q.length;');
  P('function plain(s){return String(s).replace(/<[^>]*>/g,"").trim();}');
  P('function colClass(o){if(!o||o.length<2)return"c1";var m=0;o.forEach(function(x){var l=plain(x).length;if(l>m)m=l;});return m<=32?"c2":"c1";}');

  P('function build(){');
  P('  var frag=document.createDocumentFragment();');
  P('  Q.forEach(function(q,i){');
  P('    var MC=q.type==="multiple_choice",TF=q.type==="true_false";');
  P('    var el=document.createElement("div");el.className="slide";el.id="slide-"+i;el.dataset.checked="false";');
  P('    if(TF)el.dataset.ctf=JSON.stringify(q.correctAnswers||[]);');
  P('    var bc=MC?"bmc":(TF?"btf":"bsa"),bl=MC?"Trắc nghiệm":(TF?"Đúng / Sai":"Tự luận"),bi=MC?"fa-list-ul":(TF?"fa-check-double":"fa-pen-nib");');
  P('    var h=\'<div class="q-card"><div class="q-head"><div class="q-num-row">\'');
  P('      +\'<span class="q-num-pill"><i class="fas fa-circle-question"></i> Câu \'+(i+1)+\'</span>\'');
  P('      +\'<span class="q-badge \'+bc+\'"><i class="fas \'+bi+\'"></i> \'+bl+\'</span></div>\'');
  P('      +\'<div class="q-text">\'+q.question+\'</div></div><div class="q-body">\';');
  P('    if(MC){');
  P('      h+=\'<div class="opts-grid \'+colClass(q.options)+\'">\';');
  P('      (q.options||[]).forEach(function(o,j){');
  P('        h+=\'<div class="opt" id="oi-\'+i+\'-\'+(j+1)+\'" onclick="S(\'+i+\',\'+(j+1)+\')">\'');
  P('          +\'<div class="ol">\'+String.fromCharCode(65+j)+\'</div><div class="ot">\'+o+\'</div>\'');
  P('          +\'<div class="ri"><i class="fas fa-check-circle"></i></div></div>\';');
  P('      });');
  P('      h+=\'</div><input type="hidden" id="av-\'+i+\'" value=""><input type="hidden" id="cv-\'+i+\'" value="\'+(q.correct||"")+\'">\';');
  P('    }else if(TF){');
  P('      h+=\'<div class="tft"><div class="tfh"><div class="tfhc">Mệnh đề</div><div class="tfhc">Đúng</div><div class="tfhc">Sai</div></div>\';');
  P('      (q.statements||[]).forEach(function(s,k){');
  P('        h+=\'<div class="tfrw" id="tr-\'+i+\'-\'+k+\'"><div class="tfr">\'');
  P('          +\'<div class="tfs"><div class="sl">\'+String.fromCharCode(97+k)+\'</div><span>\'+s+\'</span></div>\'');
  P('          +\'<div class="tfb" id="tT-\'+i+\'-\'+k+\'" onclick="T(\'+i+\',\'+k+\',true)"><div class="ci"><i class="fas fa-check"></i></div></div>\'');
  P('          +\'<div class="tfb" id="tF-\'+i+\'-\'+k+\'" onclick="T(\'+i+\',\'+k+\',false)"><div class="ci"><i class="fas fa-times"></i></div></div>\'');
  P('          +\'</div></div>\';');
  P('      });h+=\'</div>\';');
  P('    }else{');
  P('      h+=\'<textarea class="sa" id="sa-\'+i+\'" placeholder="Nhập đáp án nháp..." oninput="SI(\'+i+\')"></textarea>\';');
  P('    }');
  P('    h+=\'<div class="sol" id="sol-\'+i+\'"><div class="sol-t"><i class="fas fa-lightbulb"></i> Lời giải / Đáp án</div>\'');
  P('      +\'<div class="sol-b">\'+( q.correct_answer||"Không có lời giải.")+\'</div></div></div></div>\';');
  P('    el.innerHTML=h;frag.appendChild(el);');
  P('  });');
  P('  document.getElementById("slidesContainer").appendChild(frag);');
  P('}');

  P('function convertMdTables(html){');
  P('  var store=[];');
  P('  html=html.replace(/(\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]*?\\$)/g,function(m){store.push(m);return"@@M"+(store.length-1)+"M@@";});');
  P('  html=html.replace(/((?:[ \\t]*\\|[^\\n]+\\|[ \\t]*\\n?){2,})/g,function(b){');
  P('    var ls=b.split("\\n").map(function(l){return l.trim();}).filter(function(l){return l.length>0&&l[0]==="|"&&l[l.length-1]==="|";});');
  P('    if(ls.length<2)return b;');
  P('    function sep(l){return/^[\\|\\-\\s:]+$/.test(l);}');
  P('    var o="<div style=\\"overflow-x:auto;margin:16px 0\\"><table class=\\"md-table\\"><thead>",ps=false;');
  P('    ls.forEach(function(ln){');
  P('      if(sep(ln.replace(/\\|/g,""))){if(!ps){o+="</thead><tbody>";ps=true;}return;}');
  P('      var cs=ln.split("|").slice(1,-1),tg=ps?"td":"th";');
  P('      o+="<tr>"+cs.map(function(c){return"<"+tg+">"+c.trim()+"</"+tg+">";}).join("")+"</tr>";');
  P('    });');
  P('    return o+(ps?"</tbody></table></div>":"</thead></table></div>");');
  P('  });');
  P('  return html.replace(/@@M(\\d+)M@@/g,function(_,k){return store[+k];});');
  P('}');

  P('function processAllTables(){document.querySelectorAll(".q-text,.ot,.sol-b,.tfs span").forEach(function(el){var c=convertMdTables(el.innerHTML);if(c!==el.innerHTML)el.innerHTML=c;});}');

  P('function updateUI(){');
  P('  document.querySelectorAll(".slide").forEach(function(s,i){s.classList.toggle("active",i===cur);});');
  P('  document.getElementById("btnPrev").disabled=cur===0;');
  P('  document.getElementById("btnNext").disabled=cur===tot-1;');
  P('  document.getElementById("progText").textContent=(cur+1)+" / "+tot;');
  P('  document.getElementById("tbMeta").textContent="Câu "+(cur+1)+" / "+tot;');
  P('  document.getElementById("pbFill").style.width=((cur+1)/tot*100)+"%";');
  P('  var sl=document.getElementById("slide-"+cur),done=sl.dataset.checked==="true";');
  P('  var btn=document.getElementById("btnCheck");');
  P('  if(done){btn.disabled=true;btn.className="btn bc done";btn.innerHTML=\'Đã kiểm tra <i class="fas fa-check"></i>\';}');
  P('  else{btn.className="btn bc";btn.innerHTML=\'Kiểm tra <i class="fas fa-paper-plane"></i>\';btn.disabled=!hasAns(cur);}');
  P('  document.getElementById("scrollEl").scrollTo({top:0,behavior:"smooth"});');
  P('}');

  P('function hasAns(i){');
  P('  var av=document.getElementById("av-"+i);if(av&&av.value!=="")return true;');
  P('  var sa=document.getElementById("sa-"+i);if(sa&&sa.value.trim()!=="")return true;');
  P('  var sl=document.getElementById("slide-"+i);return!!(sl&&sl.querySelector(".tfb.aT,.tfb.aF"));');
  P('}');

  P('window.nextSlide=function(){if(cur<tot-1){cur++;updateUI();}};');
  P('window.prevSlide=function(){if(cur>0){cur--;updateUI();}};');

  P('window.S=function(qi,oi){');
  P('  var sl=document.getElementById("slide-"+qi);if(sl.dataset.checked==="true")return;');
  P('  sl.querySelectorAll(".opt").forEach(function(e){e.classList.remove("sel");});');
  P('  document.getElementById("oi-"+qi+"-"+oi).classList.add("sel");');
  P('  document.getElementById("av-"+qi).value=oi;');
  P('  if(qi===cur)document.getElementById("btnCheck").disabled=false;');
  P('};');

  P('window.T=function(qi,si,isT){');
  P('  var sl=document.getElementById("slide-"+qi);if(sl.dataset.checked==="true")return;');
  P('  var bT=document.getElementById("tT-"+qi+"-"+si),bF=document.getElementById("tF-"+qi+"-"+si);');
  P('  bT.classList.remove("aT");bF.classList.remove("aF");');
  P('  var rw=document.getElementById("tr-"+qi+"-"+si);');
  P('  if(isT){bT.classList.add("aT");rw.dataset.ans="T";}else{bF.classList.add("aF");rw.dataset.ans="F";}');
  P('  if(qi===cur)document.getElementById("btnCheck").disabled=!hasAns(qi);');
  P('};');

  P('window.SI=function(i){if(i===cur)document.getElementById("btnCheck").disabled=!hasAns(i);};');

  P('window.checkAnswer=function(){');
  P('  var sl=document.getElementById("slide-"+cur);sl.dataset.checked="true";var q=Q[cur];');
  P('  if(q.type==="multiple_choice"){');
  P('    var ua=parseInt(document.getElementById("av-"+cur).value);');
  P('    var ca=parseInt(document.getElementById("cv-"+cur).value);');
  P('    sl.querySelectorAll(".opt").forEach(function(e){e.classList.remove("sel");});');
  P('    if(ca){var ce=document.getElementById("oi-"+cur+"-"+ca);if(ce)ce.classList.add("ok");}');
  P('    if(ua&&ua!==ca){var we=document.getElementById("oi-"+cur+"-"+ua);');
  P('      if(we){we.classList.add("ng");we.querySelector(".ri").innerHTML=\'<i class="fas fa-times-circle"></i>\';}}');
  P('  }');
  P('  if(q.type==="true_false"){');
  P('    var ctf=JSON.parse(sl.dataset.ctf||"[]");');
  P('    (q.statements||[]).forEach(function(_,k){');
  P('      var rw=document.getElementById("tr-"+cur+"-"+k);var uv=rw.dataset.ans;var sT=ctf.indexOf(k)!==-1;');
  P('      if(uv)rw.classList.add((sT&&uv==="T")||(!sT&&uv==="F")?"tfok":"tfng");');
  P('    });');
  P('  }');
  P('  var sol=document.getElementById("sol-"+cur);sol.classList.add("show");');
  P('  var sb=sol.querySelector(".sol-b");if(sb)sb.innerHTML=convertMdTables(sb.innerHTML);');
  P('  if(window.MathJax&&typeof MathJax.typesetPromise==="function")MathJax.typesetPromise([sol]).catch(function(){});');
  P('  updateUI();');
  P('};');

  P('document.addEventListener("keydown",function(e){');
  P('  if(e.target.tagName==="TEXTAREA")return;');
  P('  if(e.key==="ArrowRight"||e.key==="PageDown")window.nextSlide();');
  P('  else if(e.key==="ArrowLeft"||e.key==="PageUp")window.prevSlide();');
  P('  else if(e.key==="Enter"){var b=document.getElementById("btnCheck");if(!b.disabled)window.checkAnswer();}');
  P('});');

  P('document.addEventListener("DOMContentLoaded",function(){');
  P('  build();processAllTables();');
  P('  document.getElementById("tbMeta").textContent=tot+" câu hỏi";');
  P('  if(window.MathJax&&typeof MathJax.typesetPromise==="function")MathJax.typesetPromise([document.getElementById("slidesContainer")]).catch(function(){});');
  P('  updateUI();');
  P('});');
  P('})();<\/script></body></html>');

  return L.join('\n');
}
