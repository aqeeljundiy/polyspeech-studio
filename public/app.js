// Polyspeech Studio front end: board (#/), ad review (#/a/<id>), knowledge (#/knowledge).
const COLS = [
  { k: 'brief', label: 'Brief', sub: 'Ideas waiting for v1', c: '#9A9EA8' },
  { k: 'rendering', label: 'Rendering', sub: 'Claude is working on it', c: '#2563EB' },
  { k: 'review', label: 'Needs review', sub: 'Your turn', c: '#B45309' },
  { k: 'revision', label: 'Revision requested', sub: 'Queued for Claude', c: '#F04070' },
  { k: 'ready', label: 'Ready to upload', sub: 'Approved', c: '#7FB800' },
  { k: 'uploaded', label: 'Uploaded', sub: 'Live', c: '#15803D' },
];
const STATUS_STYLE = { brief: ['#F3F1EC', '#5C6170'], rendering: ['#EAF1FE', '#2563EB'], review: ['#FBF1E2', '#B45309'], revision: ['#FDE8EE', '#C2185B'], ready: ['#F2FBD9', '#4D7C0F'], uploaded: ['#E8F6EE', '#15803D'] };
const KIND = { frame: ['clock', 'Frame'], range: ['move-horizontal', 'Range'], pin: ['map-pin', 'Pin'], area: ['square-dashed', 'Area'], draw: ['pen-line', 'Draw'], video: ['film', 'Whole video'] };
const FPS = 30;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; return s < 45 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const tcf = t => { const f = Math.round(t * FPS), s = Math.floor(f / FPS); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`; };
const tcs = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const media = (p, f, dl) => `/media?p=${p}&f=${encodeURIComponent(f)}${dl ? '&dl=1' : ''}`;
const icons = () => window.lucide && lucide.createIcons();
const ic = (n, s = 18) => `<i data-lucide="${n}" style="width:${s}px;height:${s}px"></i>`;
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600); }
const statusPill = s => { const [bg, fg] = STATUS_STYLE[s] || STATUS_STYLE.brief; return `style="background:${bg};color:${fg}"`; };
const jobActive = j => j && ['queued', 'working', 'rendering'].includes(j.state);
function jobPill(p, big) {
  const j = p.job; if (!j) return '';
  const pct = p.progress ? p.progress.pct : null;
  const cls = j.state === 'ready' ? 'ok' : j.state === 'failed' ? 'bad' : j.state === 'queued' ? 'q' : '';
  const label = { queued: 'Queued for Claude', working: 'Claude is editing', rendering: pct != null ? `Rendering v${j.next} · ${pct}%` : `Rendering v${j.next}`, ready: `v${j.next} ready`, failed: 'Needs attention' }[j.state];
  if (j.state === 'ready' && !big) return '';
  return `<div class="job ${cls}"><div class="l">${jobActive(j) ? '<span class="spin"></span>' : j.state === 'failed' ? ic('alert-circle', 14) : ic('check', 14)}${label}</div>${j.state === 'rendering' || (j.state === 'working' && pct != null) ? `<div class="bar"><i style="width:${pct || 3}%"></i></div>` : ''}</div>`;
}

// ---------- sidebar: what Claude is doing ----------
async function claudeBox(list) {
  const ps = list || await api('/api/projects').catch(() => []);
  const run = ps.find(p => p.job && ['working', 'rendering'].includes(p.job.state)), q = ps.filter(p => p.job?.state === 'queued').length;
  const el = $('#claudeBox'); el.className = 'claude' + (run ? ' on' : '');
  el.innerHTML = `<div class="h"><span class="pulse"></span>${run ? 'Claude is working' : 'Claude is idle'}</div>
    <div class="muted">${run ? `<a href="#/a/${run.id}"><b>${esc(run.title)}</b></a> · ${esc(run.job.note || '')}${run.progress ? ` · ${run.progress.pct}%` : ''}` : 'Send an ad back to revision and Claude picks it up here.'}</div>
    ${q ? `<div class="muted">${q} more in the queue</div>` : ''}`;
  $$('.nav a').forEach(a => a.classList.toggle('on', (location.hash.startsWith('#/knowledge') ? 'knowledge' : 'board') === a.dataset.nav));
}

// ---------- board ----------
async function board() {
  const ps = await api('/api/projects'); claudeBox(ps);
  const count = k => ps.filter(p => p.status === k).length;
  app.innerHTML = `<div class="head enter"><div><h1>Ads</h1><p class="muted" style="margin:4px 0 0">Drag a card to move it. Open one to review, comment and send it back to Claude.</p></div>
    <div class="stats"><span><b>${ps.length}</b>ads</span><span><b>${count('review')}</b>to review</span><span><b>${ps.reduce((a, p) => a + p.openComments, 0)}</b>open comments</span></div></div>
    <div class="board">${COLS.map((c, ci) => `<section class="col enter" style="animation-delay:${ci * 40}ms" data-k="${c.k}"><div class="col-h"><span><i class="dot" style="background:${c.c}"></i>${c.label}</span><span class="n">${count(c.k)}</span></div><div class="col-sub">${c.sub}</div>
      ${ps.filter(p => p.status === c.k).sort((a, b) => b.updated.localeCompare(a.updated)).map(card).join('') || '<div class="empty">Nothing here</div>'}</section>`).join('')}</div>`;
  icons();
  $$('.card').forEach(el => {
    el.onclick = () => { location.hash = '#/a/' + el.dataset.id; };
    el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
  $$('.col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('over'); await api('/api/projects/' + e.dataTransfer.getData('text/plain'), { method: 'PATCH', body: { status: col.dataset.k } }); board(); });
  });
}
const card = p => `<article class="card" draggable="true" data-id="${p.id}">
  <div class="thumb ${p.format === '16:9' ? 'wide' : ''}">${p.latest ? `<video src="${media(p.id, p.latest.name)}#t=4" preload="metadata" muted></video><span class="vb">v${p.latest.v}</span>` : `<div class="ph">${ic('file-text', 22)}<br>Brief only</div>`}<span class="fmt">${p.format}</span></div>
  <div class="card-b"><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.persona || '')}</span>${p.lang ? `<span class="chip">${esc(p.lang)}</span>` : ''}</div>
    <div class="meta"><span>${ago(p.updated)}</span>${p.openComments ? `<span class="chip c">${ic('message-circle', 12)}${p.openComments}</span>` : ''}</div>${jobPill(p)}</div></article>`;

// ---------- ad review ----------
let cur = null, curV = null, cmpV = null, tab = 'Comments';
let mode = 'frame', draft = {}, filt = { state: 'open', scope: 'this' };
const isWide = () => cur?.format === '16:9';
const dims = () => isWide() ? [1920, 1080] : [1080, 1920];

async function ad(id, keep) {
  const prevT = $('#vid')?.currentTime || 0;
  cur = await api('/api/projects/' + id); claudeBox();
  const vs = cur.versions; if (!keep || !vs.find(v => v.v === curV)) curV = vs[0]?.v ?? null;
  if (cmpV != null && (!vs.find(v => v.v === cmpV) || cmpV === curV)) cmpV = null;
  const ver = vs.find(v => v.v === curV), cmp = vs.find(v => v.v === cmpV), open = cur.comments.filter(c => !c.resolved).length;
  app.innerHTML = `<div class="crumbs"><a href="#/">${ic('arrow-left', 16)} Board</a><span>/</span><span>${esc(cur.title)}</span></div>
  <div class="p-head"><h1>${esc(cur.title)}</h1>
    <select class="status" id="statusSel" ${statusPill(cur.status)} aria-label="Status">${COLS.map(c => `<option value="${c.k}" ${c.k === cur.status ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
    <span class="chip">${esc(cur.persona || '')}</span><span class="chip">${esc(cur.lang || '')}</span><span class="chip">${cur.format}</span><span class="sp"></span>
    ${vs.length ? `<button class="btn ghost" id="revBtn" ${jobActive(cur.job) ? 'disabled' : ''}>${ic('rotate-ccw')}Send back to revision${open ? ` · ${open}` : ''}</button>
      ${cur.status === 'ready' ? `<button class="btn primary" id="upBtn">${ic('upload')}Mark uploaded</button>` : cur.status === 'uploaded' ? '' : `<button class="btn lime" id="okBtn">${ic('check')}Approve</button>`}`
      : `<button class="btn primary" id="genBtn" ${jobActive(cur.job) ? 'disabled' : ''}>${ic('sparkles')}Make v1 with Claude</button>`}
  </div>
  <div id="jobslot">${jobBar(cur)}</div>
  <div class="grid ${isWide() ? 'wide' : ''}"><div>
    ${ver ? `<div class="player" id="pl">
      <div class="stages ${cmp ? 'cmp' : ''}">
        <div class="stage ${isWide() ? 'wide' : ''}" id="stage"><span class="stag">v${ver.v}</span><video id="vid" src="${media(cur.id, ver.name)}" playsinline preload="auto"></video><canvas id="ann" width="${dims()[0]}" height="${dims()[1]}"></canvas><div class="ov" id="ov"></div></div>
        ${cmp ? `<div class="stage ${isWide() ? 'wide' : ''}"><span class="stag old">v${cmp.v}</span><video id="vid2" src="${media(cur.id, cmp.name)}" playsinline preload="auto" muted></video></div>` : ''}
      </div>
      <div class="drawbar" id="drawbar" hidden>${['pen', 'arrow', 'box'].map(t => `<button type="button" class="tool" data-tool="${t}" aria-pressed="${t === 'arrow'}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        ${['#F04070', '#B5F000', '#2563EB', '#FFFFFF'].map((c, i) => `<button type="button" class="sw" data-color="${c}" aria-pressed="${i === 0}" style="background:${c}" aria-label="Colour"></button>`).join('')}
        <span class="sp"></span><button type="button" class="tool" id="drawUndo">Undo</button><button type="button" class="tool" id="drawClear">Clear</button></div>
      <div class="scrub" id="scrub"><div class="tr"></div><div class="fill" id="fill"></div><i class="hd" id="hd"></i></div>
      <div class="ctrls"><button class="cb" id="bPrev" title="Back one frame (←)">${ic('chevron-left')}</button><button class="cb play" id="bPlay" title="Play / pause (Space)">${ic('play')}</button><button class="cb" id="bNext" title="Forward one frame (→)">${ic('chevron-right')}</button>
        <span class="tcode" id="tcode">0:00:00</span><span class="tdur" id="tdur"></span><span class="sp"></span>
        <select id="speed" class="mini" aria-label="Speed"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
        <button class="cb" id="bMute" title="Mute">${ic('volume-2')}</button></div>
      <div class="vrow"><div class="row" style="gap:6px">${vs.map(v => `<button class="vtab" data-v="${v.v}" aria-pressed="${v.v === curV}">v${v.v}</button>`).join('')}</div>
        ${vs.length > 1 ? `<label class="cmpsel">Compare with <select id="cmpSel" class="mini"><option value="">off</option>${vs.filter(v => v.v !== curV).map(v => `<option value="${v.v}" ${v.v === cmpV ? 'selected' : ''}>v${v.v}</option>`).join('')}</select></label>` : ''}</div>
      <p class="keys">Space play · ← → frame · Shift ← → second · F frame · R range · P pin · A area · D draw · W whole video · I / O range in / out</p>
    </div>` : `<div class="kcard" style="text-align:center;padding:60px 20px">${ic('clapperboard', 34)}<h2 style="margin-top:12px">No render yet</h2><p class="muted">Write the brief, then press <b>Make v1 with Claude</b>.</p></div>`}
  </div>
  <div class="panel"><div class="tabs">${['Comments', 'Versions', 'Brief', 'Upload', 'Activity'].map(t => `<button class="tab" data-t="${t}" aria-selected="${t === tab}">${t}</button>`).join('')}</div><div class="tabp" id="tabp"></div></div></div>`;
  icons();
  $('#statusSel').onchange = async e => { await api('/api/projects/' + cur.id, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated'); ad(cur.id, true); };
  $('#okBtn') && ($('#okBtn').onclick = async () => { await api('/api/projects/' + cur.id, { method: 'PATCH', body: { status: 'ready' } }); tab = 'Upload'; toast('Approved. Ready to upload'); ad(cur.id, true); });
  $('#upBtn') && ($('#upBtn').onclick = async () => { await api('/api/projects/' + cur.id, { method: 'PATCH', body: { status: 'uploaded' } }); toast('Marked as uploaded'); ad(cur.id, true); });
  $('#revBtn') && ($('#revBtn').onclick = openRevision);
  $('#genBtn') && ($('#genBtn').onclick = async () => { try { await api(`/api/projects/${cur.id}/request`, { method: 'POST', body: {} }); toast('Claude is on it'); ad(cur.id, true); } catch (e) { toast(e.message); } });
  $$('.vtab').forEach(b => b.onclick = () => { const t = $('#vid')?.currentTime || 0; curV = +b.dataset.v; if (cmpV === curV) cmpV = null; resetDraft(); ad(cur.id, true).then(() => seek(t)); });
  $('#cmpSel') && ($('#cmpSel').onchange = e => { const t = $('#vid')?.currentTime || 0; cmpV = e.target.value ? +e.target.value : null; ad(cur.id, true).then(() => seek(t)); });
  $$('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; $$('.tab').forEach(x => x.setAttribute('aria-selected', x === b)); renderTab(); });
  renderTab(); wirePlayer(); wireJob();
  if (keep && prevT) seek(prevT);
}

// ---------- job bar ----------
function jobBar(p) {
  const j = p.job; if (!j) return '';
  const cls = j.state === 'ready' ? 'ok' : j.state === 'failed' ? 'bad' : j.state === 'queued' ? 'q' : '';
  const pct = p.progress?.pct;
  const t = { queued: 'Queued for Claude', working: 'Claude is editing', rendering: `Rendering v${j.next}`, ready: `v${j.next} is ready`, failed: 'Revision needs attention' }[j.state];
  return `<div class="jobbar ${cls}" id="jobbar">${jobActive(j) ? '<span class="spin"></span>' : ic(j.state === 'failed' ? 'alert-circle' : 'check-circle-2')}
    <span class="t">${t}</span><span class="n">${esc(j.state === 'ready' && j.summary ? j.summary : j.note || '')}</span><span class="sp"></span>
    ${pct != null && jobActive(j) ? `<div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b>` : ''}
    <button class="linkbtn" id="logBtn">${ic('terminal', 14)} Log</button>
    ${jobActive(j) ? '<button class="linkbtn" id="cancelBtn">Cancel</button>' : '<button class="linkbtn" id="dismissBtn">Dismiss</button>'}</div><div id="logBox"></div>`;
}
function wireJob() {
  $('#logBtn') && ($('#logBtn').onclick = async () => { const b = $('#logBox'); if (b.innerHTML) return (b.innerHTML = ''); const { text } = await api(`/api/projects/${cur.id}/log`); b.innerHTML = `<div class="log" style="margin:-6px 0 16px">${esc(text || 'Nothing logged yet.')}</div>`; const l = $('.log', b); l.scrollTop = l.scrollHeight; });
  $('#cancelBtn') && ($('#cancelBtn').onclick = async () => { await api(`/api/projects/${cur.id}/job`, { method: 'POST', body: { state: 'cancel' } }); toast('Cancelled'); ad(cur.id, true); });
  $('#dismissBtn') && ($('#dismissBtn').onclick = async () => { await api(`/api/projects/${cur.id}/job`, { method: 'POST', body: { state: 'none' } }); $('#jobslot').innerHTML = ''; });
}

// ---------- player ----------
const V = () => $('#vid');
function seek(t) { const v = V(); if (!v) return; const go = () => { v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 1 / FPS)); syncCmp(); }; v.readyState >= 1 ? go() : v.addEventListener('loadedmetadata', go, { once: true }); }
function syncCmp() { const a = V(), b = $('#vid2'); if (a && b && Math.abs(b.currentTime - a.currentTime) > .05) b.currentTime = Math.min(a.currentTime, (b.duration || 1e9) - .04); }
function step(n) { const v = V(); if (!v) return; v.pause(); v.currentTime = Math.max(0, Math.min((Math.round(v.currentTime * FPS) + n) / FPS + .001, v.duration - 1 / FPS)); }
function togglePlay() { const v = V(); if (!v) return; if (v.paused) { v.play(); $('#vid2')?.play(); } else { v.pause(); $('#vid2')?.pause(); } }
function wirePlayer() {
  const v = V(); if (!v) return; const v2 = $('#vid2');
  const paint = () => {
    if (!v.isConnected) return v.pause();
    const d = v.duration || 1, pct = v.currentTime / d * 100;
    $('#fill').style.width = pct + '%'; $('#hd').style.left = pct + '%';
    $('#tcode').textContent = tcf(v.currentTime); $('#tdur').textContent = ' / ' + tcf(d);
    const pb = $('#bPlay'), st = v.paused ? 'p' : 'z'; if (pb.dataset.st !== st) { pb.dataset.st = st; pb.innerHTML = ic(v.paused ? 'play' : 'pause'); icons(); }
    overlay(); updateWhere();
  };
  wirePlayer.markers = () => {
    const sc = $('#scrub'); if (!sc) return; $$('.mk,.rg', sc).forEach(m => m.remove()); const d = v.duration || 1;
    cur.comments.filter(c => c.v === curV && c.kind !== 'video').forEach(c => {
      if (c.kind === 'range') { const r = document.createElement('i'); r.className = 'rg'; r.style.left = (c.t / d * 100) + '%'; r.style.width = ((c.t2 - c.t) / d * 100) + '%'; sc.appendChild(r); }
      const m = document.createElement('i'); m.className = 'mk' + (c.resolved ? ' res' : ''); m.style.left = (c.t / d * 100) + '%'; m.title = tcs(c.t) + ' · ' + c.text;
      m.onclick = e => { e.stopPropagation(); v.pause(); v2?.pause(); v.currentTime = c.t; syncCmp(); focusComment(c.id); }; sc.appendChild(m);
    });
    if (mode === 'range' && draft.t != null) { const r = document.createElement('i'); r.className = 'rg draft'; r.style.left = (draft.t / d * 100) + '%'; r.style.width = (Math.max(0, (draft.t2 ?? v.currentTime) - draft.t) / d * 100) + '%'; sc.appendChild(r); }
  };
  const loop = () => { paint(); if (!v.paused) requestAnimationFrame(loop); };
  v.addEventListener('play', loop); v.addEventListener('pause', paint); v.addEventListener('seeked', () => { paint(); syncCmp(); wirePlayer.markers(); });
  v.addEventListener('loadedmetadata', () => { paint(); wirePlayer.markers(); });
  v.addEventListener('click', () => { if (!['pin', 'area', 'draw'].includes(mode)) togglePlay(); });
  if (v2) { v.addEventListener('pause', () => { v2.pause(); syncCmp(); }); v.addEventListener('ratechange', () => { v2.playbackRate = v.playbackRate; }); }
  const sc = $('#scrub'); let drag = false; const at = x => { const r = sc.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * (v.duration || 0); };
  sc.addEventListener('pointerdown', e => { drag = true; sc.setPointerCapture(e.pointerId); v.pause(); at(e.clientX); });
  sc.addEventListener('pointermove', e => drag && at(e.clientX)); sc.addEventListener('pointerup', () => { drag = false; syncCmp(); });
  $('#bPlay').onclick = togglePlay; $('#bPrev').onclick = () => step(-1); $('#bNext').onclick = () => step(1);
  $('#speed').onchange = e => { v.playbackRate = +e.target.value; };
  $('#bMute').onclick = () => { v.muted = !v.muted; $('#bMute').innerHTML = ic(v.muted ? 'volume-x' : 'volume-2'); icons(); };
  wireStage(); if (v.readyState >= 1) { paint(); wirePlayer.markers(); }
}
document.addEventListener('keydown', e => {
  if (!V() || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || $('dialog[open]')) return;
  const v = V(), k = e.key.toLowerCase();
  if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? (v.pause(), v.currentTime = Math.max(0, v.currentTime - 1)) : step(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? (v.pause(), v.currentTime = Math.min(v.duration, v.currentTime + 1)) : step(1); }
  else if (k === 'j') { v.pause(); v.currentTime = Math.max(0, v.currentTime - 2); }
  else if (k === 'l') { v.playbackRate = 1; if (v.paused) togglePlay(); }
  else if ({ f: 'frame', r: 'range', p: 'pin', a: 'area', d: 'draw', w: 'video' }[k]) { e.preventDefault(); setMode({ f: 'frame', r: 'range', p: 'pin', a: 'area', d: 'draw', w: 'video' }[k]); }
  else if (k === 'i' && mode === 'range') { draft.t = v.currentTime; updateWhere(); wirePlayer.markers(); }
  else if (k === 'o' && mode === 'range') { draft.t2 = v.currentTime; if (draft.t == null) draft.t = 0; updateWhere(); wirePlayer.markers(); }
  else if (k === 'escape') resetDraft();
  else if (k === 'c') { e.preventDefault(); $('#ctext')?.focus(); }
});

// ---------- stage: pins, areas, drawing ----------
let tool = 'arrow', color = '#F04070', live = null;
function wireStage() {
  const stage = $('#stage'), cv = $('#ann'); if (!stage) return;
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  let start = null;
  cv.addEventListener('pointerdown', e => {
    if (!['pin', 'area', 'draw'].includes(mode)) return; V().pause(); cv.setPointerCapture(e.pointerId); const [x, y] = pt(e);
    if (mode === 'pin') { draft.pin = { x, y }; draft.t = V().currentTime; overlay(); updateWhere(); $('#ctext')?.focus(); }
    if (mode === 'area') { start = [x, y]; draft.box = { x, y, w: 0, h: 0 }; draft.t = V().currentTime; }
    if (mode === 'draw') { const [W, H] = dims(); live = tool === 'pen' ? { type: 'pen', color, pts: [[x * W, y * H]] } : { type: tool, color, x1: x * W, y1: y * H, x2: x * W, y2: y * H }; draft.t = V().currentTime; }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = pt(e);
    if (mode === 'area' && start) { draft.box = { x: Math.min(start[0], x), y: Math.min(start[1], y), w: Math.abs(x - start[0]), h: Math.abs(y - start[1]) }; overlay(); }
    if (mode === 'draw' && live) { const [W, H] = dims(); if (live.type === 'pen') live.pts.push([x * W, y * H]); else { live.x2 = x * W; live.y2 = y * H; } redraw(); }
  });
  cv.addEventListener('pointerup', () => {
    if (mode === 'area' && start) { start = null; if (draft.box.w < .02 || draft.box.h < .02) draft.box = null; overlay(); updateWhere(); $('#ctext')?.focus(); }
    if (mode === 'draw' && live) { const tiny = live.type === 'pen' ? live.pts.length < 3 : Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 14; if (!tiny) (draft.shapes = draft.shapes || []).push(live); live = null; redraw(); updateWhere(); }
  });
  $$('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; $$('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $$('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; $$('[data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#drawUndo').onclick = () => { draft.shapes?.pop(); redraw(); updateWhere(); };
  $('#drawClear').onclick = () => { draft.shapes = []; redraw(); updateWhere(); };
}
function drawShapes(ctx, list, k = 1) {
  for (const s of list) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 12 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10 * k;
    if (s.type === 'pen') { ctx.beginPath(); s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)); ctx.stroke(); }
    if (s.type === 'box') ctx.strokeRect(Math.min(s.x1, s.x2) * k, Math.min(s.y1, s.y2) * k, Math.abs(s.x2 - s.x1) * k, Math.abs(s.y2 - s.y1) * k);
    if (s.type === 'arrow') { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), h = 46; ctx.beginPath(); ctx.moveTo(s.x1 * k, s.y1 * k); ctx.lineTo(s.x2 * k, s.y2 * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x2 * k, s.y2 * k); ctx.lineTo((s.x2 - h * Math.cos(a - .45)) * k, (s.y2 - h * Math.sin(a - .45)) * k); ctx.lineTo((s.x2 - h * Math.cos(a + .45)) * k, (s.y2 - h * Math.sin(a + .45)) * k); ctx.closePath(); ctx.fill(); }
  }
  ctx.shadowBlur = 0;
}
function redraw() { const cv = $('#ann'); if (!cv) return; const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
  const v = V(); const here = c => c.v === curV && c.shapes?.length && v && v.paused && Math.abs(c.t - v.currentTime) < .5 / FPS;
  drawShapes(x, [...(mode === 'draw' ? [] : cur.comments.filter(here).flatMap(c => c.shapes)), ...(draft.shapes || []), ...(live ? [live] : [])]); }
// existing pins/areas on this frame + the draft one
function overlay() {
  const ov = $('#ov'), v = V(); if (!ov || !v) return;
  const near = c => c.v === curV && v.paused && Math.abs(c.t - v.currentTime) < .5 / FPS;
  const list = cur.comments.filter(c => !c.resolved && near(c) && (c.pin || c.box));
  const num = c => cur.comments.filter(x => x.v === curV).sort((a, b) => a.t - b.t).indexOf(c) + 1;
  let h = list.map(c => c.pin ? `<div class="pin" style="left:${c.pin.x * 100}%;top:${c.pin.y * 100}%"><b>${num(c)}</b></div>` : `<div class="area" style="left:${c.box.x * 100}%;top:${c.box.y * 100}%;width:${c.box.w * 100}%;height:${c.box.h * 100}%"><b>${num(c)}</b></div>`).join('');
  if (mode === 'pin' && draft.pin) h += `<div class="pin draft" style="left:${draft.pin.x * 100}%;top:${draft.pin.y * 100}%"><b>+</b></div>`;
  if (mode === 'area' && draft.box) h += `<div class="area draft" style="left:${draft.box.x * 100}%;top:${draft.box.y * 100}%;width:${draft.box.w * 100}%;height:${draft.box.h * 100}%"><b>New</b></div>`;
  if (ov.innerHTML !== h) ov.innerHTML = h;
  redraw();
}
function setMode(m) {
  mode = m; draft = {}; const v = V();
  if (m === 'range' && v) draft.t = v.currentTime;
  $$('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('#stage')?.classList.toggle('picking', ['pin', 'area', 'draw'].includes(m));
  $('#drawbar') && ($('#drawbar').hidden = m !== 'draw');
  if (['pin', 'area', 'draw'].includes(m)) v?.pause();
  overlay(); updateWhere(); wirePlayer.markers?.();
}
function resetDraft() { draft = {}; if (mode === 'range' && V()) draft.t = V().currentTime; overlay(); updateWhere(); wirePlayer.markers?.(); }
function updateWhere() {
  const el = $('#where'); if (!el) return; const v = V(), t = v ? v.currentTime : 0;
  const hint = {
    frame: `<span class="tc">${tcf(t)}</span> Pinned to this frame`,
    range: `<span class="tc" id="inTc">${tcf(draft.t ?? t)}</span>→<span class="tc">${tcf(draft.t2 ?? t)}</span><button class="linkbtn" id="setIn">Set start</button><button class="linkbtn" id="setOut">Set end</button>`,
    pin: draft.pin ? `<span class="tc">${tcf(draft.t)}</span> Pin placed. Write what to change.` : 'Click on the video to drop a pin.',
    area: draft.box ? `<span class="tc">${tcf(draft.t)}</span> Area selected.` : 'Drag on the video to mark an area.',
    draw: draft.shapes?.length ? `<span class="tc">${tcf(draft.t)}</span> ${draft.shapes.length} mark${draft.shapes.length > 1 ? 's' : ''} drawn.` : 'Draw on the frame with the pen, arrow or box.',
    video: `<span class="tc whole">Whole video</span> Applies to the entire ad`,
  }[mode];
  if (el.dataset.h !== hint) { el.dataset.h = hint; el.innerHTML = hint; $('#setIn') && ($('#setIn').onclick = () => { draft.t = V().currentTime; updateWhere(); wirePlayer.markers(); }); $('#setOut') && ($('#setOut').onclick = () => { draft.t2 = V().currentTime; updateWhere(); wirePlayer.markers(); }); }
}
// frame + markup as an image, so Claude sees exactly what you mean
function snapshot() {
  const v = V(); if (!v || !(draft.pin || draft.box || draft.shapes?.length)) return null;
  const [W, H] = dims(), k = .5, c = document.createElement('canvas'); c.width = W * k; c.height = H * k; const x = c.getContext('2d');
  x.drawImage(v, 0, 0, c.width, c.height); if (draft.shapes) drawShapes(x, draft.shapes, k);
  x.lineWidth = 8; x.strokeStyle = '#F04070'; x.fillStyle = 'rgba(240,64,112,.15)';
  if (draft.box) { x.fillRect(draft.box.x * c.width, draft.box.y * c.height, draft.box.w * c.width, draft.box.h * c.height); x.strokeRect(draft.box.x * c.width, draft.box.y * c.height, draft.box.w * c.width, draft.box.h * c.height); }
  if (draft.pin) { x.fillStyle = '#F04070'; x.beginPath(); x.arc(draft.pin.x * c.width, draft.pin.y * c.height, 18, 0, 7); x.fill(); x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke(); }
  return c.toDataURL('image/jpeg', .85);
}

// ---------- tabs ----------
function renderTab() {
  const p = $('#tabp'); if (!p) return;
  if (tab === 'Comments') {
    p.innerHTML = `${curV != null ? `<form class="composer" id="cform">
        <div class="modes">${Object.entries(KIND).map(([k, [i, l]]) => `<button type="button" class="mode" data-m="${k}" aria-pressed="${k === mode}">${ic(i, 15)}${l}</button>`).join('')}</div>
        <div class="where" id="where"></div>
        <textarea id="ctext" rows="3" placeholder="What should change? Press C to jump here."></textarea>
        <div class="row"><span class="muted" style="font-size:12px">Comments go to Claude when you send this back.</span><span class="sp"></span><button class="btn primary sm" type="submit" id="cSubmit">Comment</button></div></form>` : ''}
      <div class="filters"><button class="fbtn" data-f="open" aria-pressed="${filt.state === 'open'}">Open</button><button class="fbtn" data-f="resolved" aria-pressed="${filt.state === 'resolved'}">Resolved</button><button class="fbtn" data-f="all" aria-pressed="${filt.state === 'all'}">All</button><span class="sp"></span>
        <button class="fbtn" data-s="this" aria-pressed="${filt.scope === 'this'}">v${curV ?? '–'}</button><button class="fbtn" data-s="all" aria-pressed="${filt.scope === 'all'}">All versions</button></div>
      <div id="clist" style="display:flex;flex-direction:column;gap:10px">${commentList()}</div>`;
    icons(); wireComments(); updateWhere();
    $$('.mode').forEach(b => b.onclick = () => setMode(b.dataset.m));
    $$('[data-f]').forEach(b => b.onclick = () => { filt.state = b.dataset.f; renderTab(); });
    $$('[data-s]').forEach(b => b.onclick = () => { filt.scope = b.dataset.s; renderTab(); });
    $('#ctext')?.addEventListener('focus', () => { V()?.pause(); });
    $('#cform') && ($('#cform').onsubmit = async e => {
      e.preventDefault(); const text = $('#ctext').value.trim(); if (!text) return toast('Write what should change');
      const v = V(), t = v ? v.currentTime : 0;
      if (mode === 'pin' && !draft.pin) return toast('Click on the video to drop the pin first');
      if (mode === 'area' && !draft.box) return toast('Drag on the video to mark the area first');
      const kind = mode === 'draw' ? 'frame' : mode;
      const body = { v: curV, kind, text, t: draft.t ?? t, t2: mode === 'range' ? (draft.t2 ?? t) : undefined, pin: draft.pin, box: draft.box, shapes: draft.shapes, snapshot: snapshot() };
      if (mode === 'range' && body.t2 <= body.t) return toast('Set an end time after the start');
      $('#cSubmit').disabled = true;
      try { const c = await api(`/api/projects/${cur.id}/comments`, { method: 'POST', body }); $('#ctext').value = ''; resetDraft(); await refresh(); focusComment(c.id); toast('Comment added'); }
      catch (err) { toast(err.message); } finally { $('#cSubmit') && ($('#cSubmit').disabled = false); }
    });
  }
  if (tab === 'Versions') {
    p.innerHTML = `<div class="vlist">${cur.versions.map(v => `<div class="vcard ${v.v === curV ? 'on' : ''}" data-v="${v.v}"><span class="vn">v${v.v}</span><div style="flex:1"><b>${new Date(v.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</b>
      <div class="muted" style="font-size:12.5px;margin-top:2px">${esc(v.note || 'No notes')}</div><div class="meta" style="margin-top:6px"><span class="chip">${(v.size / 1e6).toFixed(1)} MB</span><span class="chip">${cur.comments.filter(c => c.v === v.v).length} comments</span><a class="linkbtn" href="${media(cur.id, v.name, 1)}">${ic('download', 13)} Download</a></div></div></div>`).join('') || '<div class="empty">No versions yet</div>'}</div>`;
    icons(); $$('.vcard').forEach(b => b.onclick = e => { if (e.target.closest('a')) return; curV = +b.dataset.v; ad(cur.id, true); });
  }
  if (tab === 'Brief') {
    p.innerHTML = `<label class="field">Persona<input id="bPersona" value="${esc(cur.persona)}"></label><label class="field">Language<input id="bLang" value="${esc(cur.lang)}"></label>
      <label class="field">Brief<small>Claude reads this every round, with the knowledge pages.</small><textarea id="bBrief" rows="10">${esc(cur.brief)}</textarea></label>
      <div class="row"><span class="sp"></span><button class="btn primary sm" id="bSave">Save brief</button></div>`;
    $('#bSave').onclick = async () => { await api('/api/projects/' + cur.id, { method: 'PATCH', body: { brief: $('#bBrief').value, persona: $('#bPersona').value, lang: $('#bLang').value } }); toast('Brief saved'); cur = await api('/api/projects/' + cur.id); };
  }
  if (tab === 'Upload') {
    const latest = cur.versions[0], u = cur.upload || {};
    p.innerHTML = latest ? `<div class="upload-hero">${ic('package-check', 26)}<div><div class="b">${cur.status === 'uploaded' ? `Uploaded ${cur.uploadedAt ? ago(cur.uploadedAt) : ''}` : cur.status === 'ready' ? 'Approved and ready to upload' : 'Approve the ad to mark it ready'}</div><div class="muted" style="font-size:12.5px">Final file: Polyspeech - ${esc(cur.title)} - v${latest.v}.mp4 · ${(latest.size / 1e6).toFixed(1)} MB</div></div></div>
      <a class="btn primary" href="${media(cur.id, latest.name, 1)}">${ic('download')}Download v${latest.v}</a>
      <div class="row"><b>Captions</b><span class="sp"></span><button class="btn ghost sm" id="capBtn">${ic('sparkles', 15)}Draft with Claude</button></div>
      <label class="field">Instagram Reels caption<textarea id="uReels" rows="5">${esc(u.reelsCaption || '')}</textarea></label>
      <label class="field">YouTube title<input id="uYtT" value="${esc(u.youtubeTitle || '')}"></label>
      <label class="field">YouTube description<textarea id="uYtD" rows="4">${esc(u.youtubeDescription || '')}</textarea></label>
      <div class="row"><button class="btn ghost sm" id="uCopy">${ic('copy', 15)}Copy Reels caption</button><span class="sp"></span><button class="btn primary sm" id="uSave">Save</button></div>
      ${cur.status === 'ready' ? `<button class="btn lime" id="uDone">${ic('check-check')}Mark as uploaded</button>` : ''}` : '<div class="empty">Nothing to upload yet</div>';
    icons();
    if (!latest) return;
    const saveU = () => api('/api/projects/' + cur.id, { method: 'PATCH', body: { upload: { reelsCaption: $('#uReels').value, youtubeTitle: $('#uYtT').value, youtubeDescription: $('#uYtD').value } } });
    $('#uSave').onclick = async () => { await saveU(); toast('Saved'); };
    $('#uCopy').onclick = async () => { await navigator.clipboard.writeText($('#uReels').value); toast('Caption copied'); };
    $('#uDone') && ($('#uDone').onclick = async () => { await saveU(); await api('/api/projects/' + cur.id, { method: 'PATCH', body: { status: 'uploaded' } }); toast('Marked as uploaded'); ad(cur.id, true); });
    $('#capBtn').onclick = async () => { const b = $('#capBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Writing…';
      try { const u2 = await api(`/api/projects/${cur.id}/captions`, { method: 'POST', body: {} }); $('#uReels').value = u2.reelsCaption || ''; $('#uYtT').value = u2.youtubeTitle || ''; $('#uYtD').value = u2.youtubeDescription || ''; toast('Captions drafted'); }
      catch (e) { toast(e.message); } finally { b.disabled = false; b.innerHTML = ic('sparkles', 15) + 'Draft with Claude'; icons(); } };
  }
  if (tab === 'Activity') p.innerHTML = (cur.activity || []).map(a => `<div class="act"><time>${ago(a.at)}</time><span>${esc(a.text)}</span></div>`).join('') || '<div class="empty">No activity yet</div>';
}

// ---------- comments ----------
function visibleComments() {
  return cur.comments.filter(c => (filt.scope === 'all' || c.v === curV) && (filt.state === 'all' || (filt.state === 'open' ? !c.resolved : c.resolved)))
    .sort((a, b) => a.v - b.v || (a.kind === 'video') - (b.kind === 'video') || a.t - b.t);
}
function commentList() {
  const nums = Object.fromEntries(cur.comments.filter(c => c.v === curV).sort((a, b) => a.t - b.t).map((c, i) => [c.id, i + 1]));
  return visibleComments().map(c => {
    const [i, l] = KIND[c.kind] || KIND.frame;
    const when = c.kind === 'video' ? '<span class="tc whole">Whole video</span>' : c.kind === 'range' ? `<span class="tc" data-t="${c.t}">${tcs(c.t)}–${tcs(c.t2)}</span>` : `<span class="tc" data-t="${c.t}">${tcf(c.t)}</span>`;
    return `<div class="cmt ${c.resolved ? 'res' : ''} enter" data-cid="${c.id}">
      <div class="top"><span class="av">YO</span><span class="who">${esc(c.author)}</span><span class="when">${ago(c.at)}${c.edited ? ' · edited' : ''}</span><span class="sp"></span><span class="kind">${ic(i, 13)}${l}${nums[c.id] && (c.pin || c.box) ? ` ${nums[c.id]}` : ''}</span>${filt.scope === 'all' ? `<span class="chip">v${c.v}</span>` : ''}</div>
      <div class="row">${when}</div>
      ${c.snapshot ? `<img class="snap" src="${media(cur.id, c.snapshot)}" data-t="${c.t}" alt="Marked frame">` : ''}
      <p class="ctext">${esc(c.text)}</p>
      ${(c.replies || []).length ? `<div class="replies">${c.replies.map(r => `<div class="reply"><span class="av ${r.author === 'Claude' ? 'c' : ''}">${r.author === 'Claude' ? 'AI' : 'YO'}</span><div><b style="font-size:12.5px">${esc(r.author)}</b> <span class="when">${ago(r.at)}</span><p style="margin:2px 0 0">${esc(r.text)}</p></div></div>`).join('')}</div>` : ''}
      <div class="acts"><button class="linkbtn" data-reply="${c.id}">Reply</button><button class="linkbtn" data-edit="${c.id}">Edit</button>
        <button class="linkbtn ${c.learn ? 'lesson' : ''}" data-learn="${c.id}" title="Claude adds this to the learnings when it revises">${c.learn ? 'Lesson ✓' : 'Make it a lesson'}</button>
        <button class="linkbtn" data-res="${c.id}">${c.resolved ? 'Reopen' : 'Resolve'}</button><button class="linkbtn" data-del="${c.id}">Delete</button></div></div>`;
  }).join('') || `<div class="empty">${filt.state === 'open' ? 'No open comments. Pick a type above and leave the first one.' : 'Nothing here'}</div>`;
}
function wireComments() {
  const l = $('#clist'); if (!l) return;
  $$('[data-t]', l).forEach(b => b.onclick = () => { const v = V(); if (v) { v.pause(); v.currentTime = +b.dataset.t; syncCmp(); } });
  $$('[data-res]', l).forEach(b => b.onclick = async () => { const c = cur.comments.find(x => x.id === b.dataset.res); await api('/api/comments/' + c.id, { method: 'PATCH', body: { resolved: !c.resolved } }); refresh(); });
  $$('[data-learn]', l).forEach(b => b.onclick = async () => { const c = cur.comments.find(x => x.id === b.dataset.learn); await api('/api/comments/' + c.id, { method: 'PATCH', body: { learn: !c.learn } }); refresh(); toast(c.learn ? 'No longer a lesson' : 'Claude will save this as a lesson'); });
  $$('[data-del]', l).forEach(b => b.onclick = async () => { await api('/api/comments/' + b.dataset.del, { method: 'DELETE' }); refresh(); });
  $$('[data-edit]', l).forEach(b => b.onclick = () => {
    const box = b.closest('.cmt'), c = cur.comments.find(x => x.id === b.dataset.edit), pEl = $('.ctext', box);
    pEl.outerHTML = `<div class="replyform"><input class="edit-in" value="${esc(c.text)}"><button class="btn primary sm">Save</button></div>`;
    const inp = $('.edit-in', box); inp.focus(); const go = async () => { if (inp.value.trim()) await api('/api/comments/' + c.id, { method: 'PATCH', body: { text: inp.value } }); refresh(); };
    inp.onkeydown = e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') refresh(); }; $('.replyform .btn', box).onclick = go;
  });
  $$('[data-reply]', l).forEach(b => b.onclick = () => {
    const box = b.closest('.cmt'); if ($('.rf', box)) return;
    b.closest('.acts').insertAdjacentHTML('beforebegin', `<div class="replyform rf"><input placeholder="Reply…"><button class="btn primary sm">Reply</button></div>`);
    const inp = $('.rf input', box); inp.focus(); const go = async () => { if (!inp.value.trim()) return; await api(`/api/comments/${b.dataset.reply}/replies`, { method: 'POST', body: { text: inp.value } }); refresh(); };
    inp.onkeydown = e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') $('.rf', box).remove(); }; $('.rf .btn', box).onclick = go;
  });
}
function focusComment(id) { const el = $(`[data-cid="${id}"]`); if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); } }
async function refresh() {
  cur = await api('/api/projects/' + cur.id);
  const l = $('#clist'); if (l) { l.innerHTML = commentList(); icons(); wireComments(); }
  wirePlayer.markers?.(); overlay();
  const rb = $('#revBtn'); if (rb) { const n = cur.comments.filter(c => !c.resolved).length; rb.innerHTML = ic('rotate-ccw') + 'Send back to revision' + (n ? ` · ${n}` : ''); icons(); }
}

// ---------- send back to revision ----------
function openRevision() {
  const open = cur.comments.filter(c => !c.resolved).sort((a, b) => a.v - b.v || a.t - b.t);
  $('#revSum').textContent = open.length ? `Claude gets ${open.length} open comment${open.length > 1 ? 's' : ''} with their timestamps, positions and drawings, then renders v${(cur.versions[0]?.v || 0) + 1}.` : 'No open comments. Add overall notes so Claude knows what to change.';
  $('#revList').innerHTML = open.map(c => `<div><span class="tc ${c.kind === 'video' ? 'whole' : ''}">${c.kind === 'video' ? 'Whole' : c.kind === 'range' ? `${tcs(c.t)}–${tcs(c.t2)}` : tcf(c.t)}</span><span>${esc(c.text)}</span></div>`).join('');
  $('#revNotes').value = ''; $('#revDlg').showModal();
}
$('#revForm').onsubmit = async e => {
  e.preventDefault(); const notes = $('#revNotes').value.trim();
  if (!cur.comments.some(c => !c.resolved) && !notes) return toast('Add a comment or a note first');
  try { await api(`/api/projects/${cur.id}/request`, { method: 'POST', body: { notes } }); $('#revDlg').close(); toast('Sent to Claude'); ad(cur.id, true); } catch (err) { toast(err.message); }
};

// ---------- knowledge ----------
const md = t => { let out = '', list = false; for (const raw of esc(t).split('\n')) { const l = raw.trimEnd();
  if (/^\s*- /.test(l)) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + l.replace(/^\s*- /, '') + '</li>'; continue; }
  if (list) { out += '</ul>'; list = false; }
  if (l.startsWith('## ')) out += '<h2>' + l.slice(3) + '</h2>'; else if (l.startsWith('# ') || !l) continue; else out += '<p>' + l + '</p>'; }
  if (list) out += '</ul>'; return out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'); };
async function knowledge() {
  claudeBox(); const k = await api('/api/knowledge');
  app.innerHTML = `<div class="head enter"><div><h1>Knowledge</h1><p class="muted" style="margin:4px 0 0">What Claude reads before every revision. Lessons from your comments land in Learnings.</p></div></div>
  <div class="kgrid"><div class="kcard enter"><h2>Product</h2><p class="muted">Features the ads may show, and what they must never claim.</p><div class="md">${md(k.product)}</div></div>
  <div style="display:grid;gap:20px"><div class="kcard enter"><h2>Learnings</h2><form id="lf" class="composer" style="margin:10px 0"><textarea id="lt" rows="2" placeholder="e.g. Keep pills perfectly centred"></textarea><div class="row"><span class="sp"></span><button class="btn primary sm">Add</button></div></form><div class="md">${md(k.learnings)}</div></div>
    <div class="kcard enter"><h2>Style and pacing</h2><div class="md">${md(k.style)}</div></div></div></div>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); const t = $('#lt').value.trim(); if (!t) return; await api('/api/learnings', { method: 'POST', body: { text: t } }); toast('Learning added'); knowledge(); };
}

// ---------- new ad ----------
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#newBtn').onclick = async () => {
  $('#newForm').reset(); $('#newErr').hidden = true;
  const ts = await api('/api/templates').catch(() => []);
  $('#nTpl').innerHTML = '<option value="">Blank</option>' + ts.map(t => `<option value="${t.slug}">${esc(t.out || t.slug)}</option>`).join('');
  $('#newDlg').showModal();
};
$('#newForm').onsubmit = async e => {
  e.preventDefault();
  try { const p = await api('/api/projects', { method: 'POST', body: { title: $('#nTitle').value.trim(), persona: $('#nPersona').value.trim(), lang: $('#nLang').value, format: $('#nFormat').value, template: $('#nTpl').value, brief: $('#nBrief').value } });
    $('#newDlg').close(); toast('Brief created'); location.hash = '#/a/' + p.id; } catch (err) { $('#newErr').textContent = err.message; $('#newErr').hidden = false; }
};

// ---------- live updates ----------
setInterval(async () => {
  if ($('dialog[open]')) return;
  if (location.hash.startsWith('#/a/') && cur) {
    if (!jobActive(cur.job)) return;
    const p = await api('/api/projects/' + cur.id).catch(() => null); if (!p) return;
    const nv = p.versions[0]?.v, ov = cur.versions[0]?.v;
    if (nv !== ov) { toast(`v${nv} is ready to review`); curV = nv; tab = 'Comments'; filt.scope = 'this'; return ad(cur.id, true); }
    cur.job = p.job; cur.progress = p.progress;
    const slot = $('#jobslot'), openLog = $('#logBox')?.innerHTML; slot.innerHTML = jobBar(p); icons(); wireJob(); if (openLog) $('#logBtn').click();
    claudeBox();
  } else if (!location.hash.startsWith('#/knowledge')) {
    const ps = await api('/api/projects').catch(() => []); claudeBox(ps);
    if ($('.board') && ps.some(p => jobActive(p.job))) for (const p of ps) { const el = $(`.card[data-id="${p.id}"]`); if (el && el.closest('.col').dataset.k !== p.status) return board(); const j = el && $('.job', el); if (el) { const html = jobPill(p); if ((j?.outerHTML || '') !== html) { j ? j.outerHTML = html : $('.card-b', el).insertAdjacentHTML('beforeend', html); icons(); } } }
  }
}, 2000);

// ---------- router ----------
function route() {
  const h = location.hash; let m;
  const go = (m = h.match(/^#\/a\/(\w+)/)) ? (cur?.id !== m[1] && (mode = 'frame', draft = {}, tab = 'Comments', cmpV = null), ad(m[1])) : h.startsWith('#/knowledge') ? knowledge() : board();
  go.catch(e => { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
}
window.addEventListener('hashchange', route); route();
