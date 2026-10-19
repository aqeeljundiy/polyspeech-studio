// Polyspeech Studio front end: board (#/), ad review (#/a/<id>), knowledge (#/knowledge), settings (#/settings).
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
  const sec = location.hash.startsWith('#/knowledge') ? 'knowledge' : location.hash.startsWith('#/settings') ? 'settings' : 'board';
  $$('.nav a').forEach(a => a.classList.toggle('on', sec === a.dataset.nav));
}

// ---------- board ----------
async function board() {
  const [ps, st] = await Promise.all([api('/api/projects'), api('/api/settings').catch(() => null)]); claudeBox(ps);
  const missing = st && st.sounds.have < st.sounds.total;
  const count = k => ps.filter(p => p.status === k).length;
  app.innerHTML = `<div class="head enter"><div><h1>Ads</h1><p class="muted" style="margin:4px 0 0">Open an ad to review it, comment and send it back to Claude. Each step moves with its button.</p></div>
    <div class="stats"><span><b>${ps.length}</b>ads</span><span><b>${count('review')}</b>to review</span><span><b>${ps.reduce((a, p) => a + p.openComments, 0)}</b>open comments</span></div></div>
    ${missing ? `<div class="banner enter">${ic('music', 18)}<div><b>Sounds aren’t downloaded yet</b><div class="muted">The music and sound effects come from Mixkit and can’t ship in the repo. Renders need them.</div></div><span class="sp"></span><button class="btn primary sm" id="getSounds">${ic('download', 15)}Download sounds</button></div>` : ''}
    <div class="board">${COLS.map((c, ci) => `<section class="col enter" style="animation-delay:${ci * 40}ms" data-k="${c.k}"><div class="col-h"><span><i class="dot" style="background:${c.c}"></i>${c.label}</span><span class="n">${count(c.k)}</span></div><div class="col-sub">${c.sub}</div>
      ${ps.filter(p => p.status === c.k).sort((a, b) => b.updated.localeCompare(a.updated)).map(card).join('') || '<div class="empty">Nothing here</div>'}</section>`).join('')}</div>`;
  icons();
  $('#getSounds') && ($('#getSounds').onclick = () => downloadSounds($('#getSounds')).then(board));
  $$('.card').forEach(el => {
    const p = ps.find(x => x.id === el.dataset.id);
    el.onclick = e => { if (e.target.closest('[data-act],.more')) return; location.hash = '#/a/' + p.id; };
    el.oncontextmenu = e => { e.preventDefault(); adMenu(p, e.clientX, e.clientY, board); };
    $('.more', el).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); adMenu(p, r.right - 230, r.bottom + 4, board); };
    $('[data-act]', el) && ($('[data-act]', el).onclick = e => doStep(p, e.currentTarget.dataset.act, board));
  });
}

// ---------- steps: each move has its own button ----------
// Brief → (Make v1) → Rendering → Needs review → (Approve) → Ready to upload → (Mark uploaded) → Uploaded.
// Rendering and Revision requested are set by Claude's jobs, never by hand.
const NEXT = { brief: ['gen', 'sparkles', 'Make v1'], review: ['approve', 'check', 'Approve'], ready: ['upload', 'upload', 'Mark uploaded'] };
const nextStep = p => jobActive(p.job) ? null : p.job?.state === 'failed' ? ['retry', 'rotate-ccw', 'Send again'] : NEXT[p.status] || null;
async function doStep(p, act, after) {
  const patch = status => api('/api/projects/' + p.id, { method: 'PATCH', body: { status } });
  try {
    if (act === 'gen' || act === 'retry') { await api(`/api/projects/${p.id}/request`, { method: 'POST', body: {} }); toast('Claude is on it'); }
    else if (act === 'approve') { await patch('ready'); toast('Approved. Ready to upload'); }
    else if (act === 'upload') { await patch('uploaded'); toast('Marked as uploaded'); }
    else if (act === 'toReview') { await patch('review'); toast('Moved back to Needs review'); }
    else if (act === 'toReady') { await patch('ready'); toast('Moved back to Ready to upload'); }
    else if (act === 'cancel') { await api(`/api/projects/${p.id}/job`, { method: 'POST', body: { state: 'cancel' } }); toast('Job cancelled'); }
    else if (act === 'rename') {
      const t = await ask({ title: 'Rename ad', input: p.title, ok: 'Rename' }); if (t == null || !t.trim() || t.trim() === p.title) return;
      await api('/api/projects/' + p.id, { method: 'PATCH', body: { title: t } }); toast('Renamed');
    } else if (act === 'delete') {
      const n = p.versionCount ?? p.versions?.length ?? 0;
      if (await ask({ title: `Delete “${p.title}”?`, text: `This removes the ad${n ? `, its ${n} version${n > 1 ? 's' : ''}` : ''} and every comment from this PC. It can’t be undone.`, ok: 'Delete', danger: true }) == null) return;
      await api('/api/projects/' + p.id, { method: 'DELETE' }); toast('Ad deleted');
      if (location.hash.startsWith('#/a/')) { location.hash = '#/'; return; }
    }
    after && after();
  } catch (e) { toast(e.message); }
}
function adMenu(p, x, y, after) {
  const items = [];
  if (!location.hash.startsWith('#/a/')) items.push(['open', 'external-link', 'Open']);
  const onAd = location.hash.startsWith('#/a/'), nx = nextStep(p); if (nx && !onAd) items.push(nx); // the review page has its own step buttons
  if (p.status === 'ready' || p.status === 'uploaded') items.push(['toReview', 'undo-2', 'Move back to Needs review']);
  if (p.status === 'uploaded') items.push(['toReady', 'undo-2', 'Move back to Ready to upload']);
  if (jobActive(p.job)) items.push(['cancel', 'circle-stop', 'Cancel Claude’s job']);
  items.push(['rename', 'pencil', 'Rename'], ['-'], ['delete', 'trash-2', 'Delete', 'danger']);
  menu(items, x, y, act => act === 'open' ? (location.hash = '#/a/' + p.id) : doStep(p, act, after));
}
function menu(items, x, y, pick) {
  $('#menu')?.remove();
  const m = document.createElement('div'); m.id = 'menu'; m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map(([k, icon, label, cls]) => k === '-' ? '<hr>' : `<button type="button" role="menuitem" class="${cls || ''}" data-k="${k}">${ic(icon, 16)}${label}</button>`).join('');
  document.body.append(m); icons();
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const away = e => { if (!m.contains(e.target)) close(); }, onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 140); removeEventListener('pointerdown', away, true); removeEventListener('keydown', onKey); };
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', onKey); });
  $$('button', m).forEach(b => b.onclick = () => { close(); pick(b.dataset.k); });
}
// small confirm / prompt dialog: resolves to the typed text ('' for a confirm), or null when cancelled
function ask({ title, text = '', input = null, ok = 'OK', danger = false }) {
  const d = $('#askDlg'); $('#askT').textContent = title; $('#askX').textContent = text; $('#askX').hidden = !text;
  $('#askIn').hidden = input == null; $('#askIn').value = input ?? '';
  const b = $('#askOk'); b.textContent = ok; b.className = 'btn ' + (danger ? 'danger' : 'primary');
  d.returnValue = ''; d.showModal(); if (input != null) { $('#askIn').focus(); $('#askIn').select(); } else $('.btn.ghost', d).focus();
  return new Promise(res => { d.onclose = () => res(d.returnValue === 'ok' ? (input != null ? $('#askIn').value : '') : null); });
}
async function downloadSounds(btn) {
  btn.disabled = true; let st = await api('/api/sounds', { method: 'POST' });
  while (st.running) { btn.innerHTML = `<span class="spin"></span>Downloading ${st.have} of ${st.total}`; await new Promise(r => setTimeout(r, 700)); st = (await api('/api/settings')).sounds; }
  toast(st.have >= st.total ? 'Sounds downloaded' : st.error || 'Some sounds didn’t download'); return st;
}

const card = p => { const nx = nextStep(p); return `<article class="card" data-id="${p.id}"><button type="button" class="more" aria-label="More actions">${ic('more-horizontal', 16)}</button>
  <div class="thumb ${p.format === '16:9' ? 'wide' : ''}">${p.latest ? `<video src="${media(p.id, p.latest.name)}#t=4" preload="metadata" muted></video><span class="vb">v${p.latest.v}</span>` : `<div class="ph">${ic('file-text', 22)}<br>Brief only</div>`}<span class="fmt">${p.format}</span></div>
  <div class="card-b"><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.persona || '')}</span>${p.lang ? `<span class="chip">${esc(p.lang)}</span>` : ''}</div>
    <div class="meta"><span>${ago(p.updated)}</span>${p.openComments ? `<span class="chip c">${ic('message-circle', 12)}${p.openComments}</span>` : ''}${p.vo?.on ? `<span class="chip" title="Voiceover: ${esc(p.vo.voiceName)}">${ic('mic', 12)}VO</span>` : ''}</div>${jobPill(p)}
    ${nx ? `<button type="button" class="btn sm ghost cact" data-act="${nx[0]}">${ic(nx[1], 14)}${nx[2]}</button>` : ''}</div></article>`; };

// ---------- ad review ----------
let cur = null, curV = null, cmpV = null, tab = 'Comments';
let mode = 'frame', draft = {}, filt = { state: 'open', scope: 'this' }, pending = []; // pending = files attached to the next comment
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
    <span class="status" ${statusPill(cur.status)}>${COLS.find(c => c.k === cur.status)?.label || cur.status}</span>
    ${cur.persona ? `<span class="chip">${esc(cur.persona)}</span>` : ''}${cur.lang ? `<span class="chip">${esc(cur.lang)}</span>` : ''}<span class="chip">${cur.format}</span>${cur.vo?.on ? `<span class="chip">${ic('mic', 12)}${esc(cur.vo.voiceName || 'Voiceover')}</span>` : ''}<span class="sp"></span>
    <button class="icon-btn" id="moreBtn" aria-label="More actions">${ic('more-horizontal')}</button>
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
      <div class="drawbar" id="drawbar" hidden><span class="tool" aria-pressed="true" style="display:inline-flex;align-items:center;gap:6px">${ic('pen-line', 15)}Pen</span>
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
  $('#moreBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); adMenu(cur, r.right - 230, r.bottom + 6, () => ad(cur.id, true)); };
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
let tool = 'pen', color = '#F04070', live = null; // drawing is freehand pen only
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
    draw: draft.shapes?.length ? `<span class="tc">${tcf(draft.t)}</span> ${draft.shapes.length} stroke${draft.shapes.length > 1 ? 's' : ''} drawn.` : 'Draw on the frame with the pen.',
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
        <div class="atts" id="atts"></div>
        <div class="row"><label class="icon-btn" title="Attach a reference (image, video or PDF)">${ic('paperclip')}<input type="file" id="attIn" multiple accept="image/*,video/*,application/pdf" hidden></label>
          <span class="muted" style="font-size:12px">Comments go to Claude when you send this back.</span><span class="sp"></span><button class="btn primary sm" type="submit" id="cSubmit">Comment</button></div></form>` : ''}
      <div class="filters"><button class="fbtn" data-f="open" aria-pressed="${filt.state === 'open'}">Open</button><button class="fbtn" data-f="resolved" aria-pressed="${filt.state === 'resolved'}">Resolved</button><button class="fbtn" data-f="all" aria-pressed="${filt.state === 'all'}">All</button><span class="sp"></span>
        <button class="fbtn" data-s="this" aria-pressed="${filt.scope === 'this'}">v${curV ?? '–'}</button><button class="fbtn" data-s="all" aria-pressed="${filt.scope === 'all'}">All versions</button></div>
      <div id="clist" style="display:flex;flex-direction:column;gap:10px">${commentList()}</div>`;
    icons(); wireComments(); updateWhere();
    $$('.mode').forEach(b => b.onclick = () => setMode(b.dataset.m));
    $$('[data-f]').forEach(b => b.onclick = () => { filt.state = b.dataset.f; renderTab(); });
    $$('[data-s]').forEach(b => b.onclick = () => { filt.scope = b.dataset.s; renderTab(); });
    $('#ctext')?.addEventListener('focus', () => { V()?.pause(); });
    // reference files on the comment: previewed here, sent with the comment
    const renderAtts = () => { const el = $('#atts'); if (!el) return;
      el.innerHTML = pending.map((f, i) => `<div class="att">${f.type.startsWith('image/') ? `<img src="${f.url}" alt="">` : ic(f.type.startsWith('video/') ? 'film' : 'file-text', 18)}<span>${esc(f.name)}</span><button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove">${ic('x', 14)}</button></div>`).join('');
      icons(); $$('[data-rm]', el).forEach(b => b.onclick = () => { URL.revokeObjectURL(pending[+b.dataset.rm].url); pending.splice(+b.dataset.rm, 1); renderAtts(); }); };
    $('#attIn') && ($('#attIn').onchange = e => { for (const f of e.target.files) { if (f.size > 25e6) { toast(`${f.name} is over 25 MB`); continue; } pending.push({ file: f, name: f.name, type: f.type || 'application/octet-stream', url: URL.createObjectURL(f) }); } e.target.value = ''; renderAtts(); });
    renderAtts();
    $('#cform') && ($('#cform').onsubmit = async e => {
      e.preventDefault(); const text = $('#ctext').value.trim(); if (!text) return toast('Write what should change');
      const v = V(), t = v ? v.currentTime : 0;
      if (mode === 'pin' && !draft.pin) return toast('Click on the video to drop the pin first');
      if (mode === 'area' && !draft.box) return toast('Drag on the video to mark the area first');
      const kind = mode === 'draw' ? 'frame' : mode;
      const toData = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
      const attachments = await Promise.all(pending.map(async p => ({ name: p.name, data: await toData(p.file) })));
      const body = { v: curV, kind, text, t: draft.t ?? t, t2: mode === 'range' ? (draft.t2 ?? t) : undefined, pin: draft.pin, box: draft.box, shapes: draft.shapes, snapshot: snapshot(), attachments };
      if (mode === 'range' && body.t2 <= body.t) return toast('Set an end time after the start');
      $('#cSubmit').disabled = true;
      try { const c = await api(`/api/projects/${cur.id}/comments`, { method: 'POST', body }); $('#ctext').value = ''; pending.forEach(p => URL.revokeObjectURL(p.url)); pending = []; renderAtts(); resetDraft(); await refresh(); focusComment(c.id); toast('Comment added'); }
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
      <div id="bVo"></div>
      <div class="field">Learn from video examples<small>Approved cards from Knowledge that Claude follows for this ad.</small><div id="bEx"></div></div>
      <label class="field">Brief<small>Claude reads this every round, with the knowledge pages.</small><textarea id="bBrief" rows="10">${esc(cur.brief)}</textarea></label>
      <div class="row"><span class="sp"></span><button class="btn primary sm" id="bSave">Save brief</button></div>
      <div class="field" style="margin-top:6px">Source materials<small>Claude reads these every round. Files save as soon as you add them.</small></div><div id="bSrc"></div>`;
    sourcesBox($('#bSrc'), { pid: cur.id, existing: cur.sources || { references: [], footage: [] }, stack: true, onChange: sr => { if (sr) cur.sources = sr; } });
    let bVo = () => cur.vo || { on: false }; voControl($('#bVo'), cur.vo).then(g => { bVo = g; });
    let bEx = () => cur.examples || []; examplePicker($('#bEx'), cur.examples || []).then(g => { bEx = g; });
    $('#bSave').onclick = async () => { const vo = bVo(), voChanged = !!vo.on !== !!cur.vo?.on || (vo.on && vo.voice !== cur.vo?.voice);
      await api('/api/projects/' + cur.id, { method: 'PATCH', body: { brief: $('#bBrief').value, persona: $('#bPersona').value, lang: $('#bLang').value, examples: bEx(), ...(voChanged ? { vo } : {}) } }); toast('Brief saved'); cur = await api('/api/projects/' + cur.id); };
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
      ${(c.attachments || []).length ? `<div class="catts">${c.attachments.map(a => a.type.startsWith('image/') ? `<a href="${media(cur.id, a.file)}" target="_blank" rel="noopener" title="${esc(a.name)}"><img src="${media(cur.id, a.file)}" alt="${esc(a.name)}"></a>` : `<a class="att" href="${media(cur.id, a.file)}" target="_blank" rel="noopener">${ic(a.type.startsWith('video/') ? 'film' : 'file-text', 16)}<span>${esc(a.name)}</span></a>`).join('')}</div>` : ''}
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

// ---------- video examples (Knowledge) ----------
const EX_STATE = { processing: ['Breaking down', 'q'], draft: ['Draft · review it', 'warn'], approved: ['Approved', 'ok'], failed: ['Needs attention', 'bad'] };
const exStats = m => m.stats ? `${Math.round(m.stats.secs)}s · ${m.stats.cuts} ${/scene/.test(m.stats.cutKind || '') ? 'scene changes' : 'cuts'} · ${m.stats.avgShot}s average shot` : '';
const exTile = m => `<article class="extile enter" data-ex="${m.id}">
  <div class="exthumb">${m.thumb ? `<img src="/kmedia?id=${m.id}&f=${m.thumb}" alt="" loading="lazy">` : ic('film', 26)}</div>
  <div class="exb"><div class="row" style="gap:6px"><span class="expill ${EX_STATE[m.status]?.[1] || ''}">${m.status === 'processing' ? '<span class="spin"></span>' : ''}${EX_STATE[m.status]?.[0] || m.status}</span></div>
    <h3>${esc(m.title)}</h3>${m.stats ? `<span class="small">${exStats(m)}</span>` : ''}<p class="muted">${esc(m.status === 'processing' || m.status === 'failed' ? m.note : m.summary || m.name)}</p></div></article>`;
async function uploadExamples(files, btnHost) {
  const vids = [...files].filter(f => /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name));
  if (!vids.length) return toast('Drop a video file');
  let n = 0;
  for (const f of vids) {
    btnHost && (btnHost.innerHTML = `<span class="spin"></span>Uploading ${++n} of ${vids.length}`);
    const r = await fetch(`/api/examples?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
    if (!r.ok) toast((await r.json().catch(() => ({}))).error || `Couldn’t upload ${f.name}`);
  }
  toast(`${vids.length === 1 ? 'Video' : vids.length + ' videos'} added. Claude is breaking it down`);
}
function wireExamples(list) {
  const drop = $('#exDrop'), inp = $('#exIn');
  drop.onclick = () => inp.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  inp.onchange = async () => { await uploadExamples(inp.files, $('span', drop)); inp.value = ''; knowledge(); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); await uploadExamples(e.dataTransfer.files, $('span', drop)); knowledge(); };
  $$('[data-ex]').forEach(t => t.onclick = () => openExample(t.dataset.ex));
  clearTimeout(wireExamples.t);
  if (list.some(m => m.status === 'processing')) wireExamples.t = setTimeout(async () => {
    if (!location.hash.startsWith('#/knowledge') || $('#exDlg').open) return wireExamples(list);
    const fresh = await api('/api/examples').catch(() => list);
    for (const m of fresh) { const el = $(`[data-ex="${m.id}"]`); const html = exTile(m); if (el && el.outerHTML.replace(/ enter/, '') !== html.replace(/ enter/, '')) { el.outerHTML = html.replace(' enter', ''); } }
    icons(); wireExamples(fresh);
  }, 2500);
}
async function openExample(eid) {
  const m = await api('/api/examples/' + eid), d = $('#exDlg'), busy = m.status === 'processing';
  $('#exBody').innerHTML = `<div class="dlg-h"><h2>${esc(m.title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="exgrid"><div class="exmedia">
      <video src="/kmedia?id=${m.id}&f=${encodeURIComponent(m.file)}" controls playsinline preload="metadata"></video>
      <div class="small">${esc(m.name)}${m.stats ? ` · ${exStats(m)}` : ''}${m.cost != null ? ` · card cost about $${m.cost.toFixed(2)}` : ''}</div>
      ${m.sheets.length ? `<details><summary>Frames Claude looked at (${m.sheets.length} sheet${m.sheets.length > 1 ? 's' : ''})</summary><div class="sheets">${m.sheets.map(f => `<img src="/kmedia?id=${m.id}&f=sheets/${f}" alt="" loading="lazy">`).join('')}</div></details>` : ''}
      ${m.transcript ? `<details><summary>Transcript</summary><pre class="tx">${esc(m.transcript)}</pre></details>` : ''}
    </div><div class="excard">
      ${busy ? `<div class="state"><span class="spin"></span>${esc(m.note)}</div>` : m.status === 'failed' ? `<div class="note bad">${esc(m.note)}</div>` : ''}
      <label class="field">Title<input id="exTitle" value="${esc(m.title)}" ${busy ? 'disabled' : ''}></label>
      <label class="field">Why it works<input id="exSum" value="${esc(m.summary)}" ${busy ? 'disabled' : ''}></label>
      <label class="field">Card<small>What Claude reads when an ad uses this example. Edit anything that’s off.</small><textarea id="exCard" rows="16" ${busy ? 'disabled' : ''}>${esc(m.card)}</textarea></label>
      <label class="field">Note for Claude<small>Optional, used when you redo the card: what to look at in this video.</small><input id="exNote" value="${esc(m.userNote || '')}" placeholder="e.g. Study the hook and the caption timing"></label>
    </div></div>
    <div class="dlg-f"><button type="button" class="btn ghost danger-t" id="exDel">${ic('trash-2', 15)}Delete</button><span class="sp"></span>
      <button type="button" class="btn ghost" id="exRedo" ${busy ? 'disabled' : ''}>${ic('rotate-ccw', 15)}Redo card</button>
      ${m.status === 'approved' ? `<button type="button" class="btn ghost" id="exUn">Back to draft</button><button type="button" class="btn primary" id="exSave">Save</button>`
        : `<button type="button" class="btn ghost" id="exSave" ${busy ? 'disabled' : ''}>Save draft</button><button type="button" class="btn lime" id="exOk" ${busy || !m.card ? 'disabled' : ''}>${ic('check', 15)}Approve</button>`}</div>`;
  icons(); if (!d.open) d.showModal();
  $$('[data-close]', d).forEach(b => b.onclick = () => d.close());
  const body = extra => ({ title: $('#exTitle').value, summary: $('#exSum').value, card: $('#exCard').value, ...extra });
  const done = msg => { toast(msg); d.close(); knowledge(); };
  $('#exSave') && ($('#exSave').onclick = async () => { await api('/api/examples/' + eid, { method: 'PATCH', body: body() }); done('Saved'); });
  $('#exOk') && ($('#exOk').onclick = async () => { await api('/api/examples/' + eid, { method: 'PATCH', body: body({ status: 'approved' }) }); done('Approved. Ads can use this card now'); });
  $('#exUn') && ($('#exUn').onclick = async () => { await api('/api/examples/' + eid, { method: 'PATCH', body: body({ status: 'draft' }) }); done('Moved back to draft'); });
  $('#exRedo').onclick = async () => { try { await api(`/api/examples/${eid}/redo`, { method: 'POST', body: { note: $('#exNote').value } }); done('Claude is redoing the card'); } catch (e) { toast(e.message); } };
  $('#exDel').onclick = async () => {
    d.close();
    if (await ask({ title: `Delete “${m.title}”?`, text: 'This removes the video, its frames and its card from this PC, and from any ad that uses it.', ok: 'Delete', danger: true }) == null) return openExample(eid);
    await api('/api/examples/' + eid, { method: 'DELETE' }); toast('Example deleted'); knowledge();
  };
}
// pick approved example cards for an ad (new ad form and Brief tab); returns a getter for the ids
async function examplePicker(el, selected = []) {
  const all = (await api('/api/examples').catch(() => [])).filter(m => m.status === 'approved');
  const on = new Set(selected.filter(x => all.some(m => m.id === x)));
  el.className = 'expick';
  const draw = () => {
    el.innerHTML = all.length ? all.map(m => `<button type="button" class="exchip" data-id="${m.id}" aria-pressed="${on.has(m.id)}" title="${esc(m.summary)}">${on.has(m.id) ? ic('check', 13) : ic('film', 13)}${esc(m.title)}</button>`).join('')
      : `<span class="small">No approved video examples yet. Add one in <a href="#/knowledge" data-go>Knowledge</a>.</span>`;
    icons();
    $$('.exchip', el).forEach(b => b.onclick = () => { on.has(b.dataset.id) ? on.delete(b.dataset.id) : on.add(b.dataset.id); draw(); });
    $('[data-go]', el) && ($('[data-go]', el).onclick = () => el.closest('dialog')?.close());
  };
  draw();
  return () => [...on];
}

// ---------- knowledge ----------
const md = t => { let out = '', list = false; for (const raw of esc(t).split('\n')) { const l = raw.trimEnd();
  if (/^\s*- /.test(l)) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + l.replace(/^\s*- /, '') + '</li>'; continue; }
  if (list) { out += '</ul>'; list = false; }
  if (l.startsWith('## ')) out += '<h2>' + l.slice(3) + '</h2>'; else if (l.startsWith('# ') || !l) continue; else out += '<p>' + l + '</p>'; }
  if (list) out += '</ul>'; return out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'); };
async function knowledge() {
  claudeBox(); const [k, exs] = await Promise.all([api('/api/knowledge'), api('/api/examples').catch(() => [])]);
  app.innerHTML = `<div class="head enter"><div><h1>Knowledge</h1><p class="muted" style="margin:4px 0 0">What Claude reads before every revision. Lessons from your comments land in Learnings.</p></div></div>
  <section class="kcard enter exsec"><div class="row"><div><h2>Video examples</h2><p class="muted" style="margin:4px 0 0">Ads worth learning from. Claude breaks each one down into a card: hook, beats, pacing, captions and what to borrow. Approve a card, then pick it for an ad.</p></div></div>
    <div class="exwrap"><div class="drop exdrop" id="exDrop" tabindex="0" role="button" aria-label="Add a video example">${ic('upload-cloud', 22)}<span>Drop a video here or choose one</span><small class="small">mp4, mov or webm · stays on this PC</small><input type="file" id="exIn" accept="video/*" multiple hidden></div>
    ${exs.map(exTile).join('')}</div></section>
  <div class="kgrid"><div class="kcard enter"><h2>Product</h2><p class="muted">Features the ads may show, and what they must never claim.</p><div class="md">${md(k.product)}</div></div>
  <div style="display:grid;gap:20px"><div class="kcard enter"><h2>Learnings</h2><form id="lf" class="composer" style="margin:10px 0"><textarea id="lt" rows="2" placeholder="e.g. Keep pills perfectly centred"></textarea><div class="row"><span class="sp"></span><button class="btn primary sm">Add</button></div></form><div class="md">${md(k.learnings)}</div></div>
    <div class="kcard enter"><h2>Style and pacing</h2><div class="md">${md(k.style)}</div></div></div></div>`;
  wireExamples(exs);
  $('#lf').onsubmit = async e => { e.preventDefault(); const t = $('#lt').value.trim(); if (!t) return; await api('/api/learnings', { method: 'POST', body: { text: t } }); toast('Learning added'); knowledge(); };
}

// ---------- voiceover switch (new ad form and Brief tab) ----------
// Fills el and returns a getter for { on, voice, voiceName }. Needs an ElevenLabs key saved in Settings.
async function voControl(el, init = { on: false }) {
  const st = await api('/api/settings').catch(() => null), hasKey = !!st?.elevenlabs.set;
  el.className = 'vo';
  el.innerHTML = `<div class="vo-h"><div class="vo-t"><b>${ic('mic', 15)}Voiceover</b><small data-hint></small></div>
    <button type="button" class="switch" role="switch" aria-label="Voiceover" aria-checked="${!!(init.on && hasKey)}" ${hasKey ? '' : 'disabled'}><i></i></button></div>
    <div class="vo-pick" hidden><select data-voice aria-label="Voice"><option value="">Loading voices…</option></select></div>`;
  icons();
  const sw = $('.switch', el), pick = $('.vo-pick', el), sel = $('[data-voice]', el), hintEl = $('[data-hint]', el);
  let loaded = false;
  const sync = async () => {
    const on = sw.getAttribute('aria-checked') === 'true';
    pick.hidden = !on;
    hintEl.innerHTML = !hasKey ? 'Add your ElevenLabs key in <a href="#/settings" data-go>Settings</a> to turn this on.'
      : on ? 'Claude writes the lines, and the voice sets the pace.' : 'Off: music and UI sounds only.';
    $('[data-go]', el) && ($('[data-go]', el).onclick = () => el.closest('dialog')?.close());
    if (on && !loaded) {
      loaded = true;
      try {
        const vs = await api('/api/voices');
        sel.innerHTML = vs.map(v => `<option value="${v.id}" ${v.id === init.voice ? 'selected' : ''}>${esc(v.name)}${v.desc ? ` · ${esc(v.desc)}` : ''}</option>`).join('') || '<option value="">No voices on this account</option>';
      } catch (e) { loaded = false; sel.innerHTML = `<option value="">${esc(e.message)}</option>`; }
    }
  };
  sw.onclick = () => { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); sync(); };
  sync();
  return () => {
    const on = sw.getAttribute('aria-checked') === 'true' && !!sel.value;
    return on ? { on, voice: sel.value, voiceName: sel.selectedOptions[0]?.textContent.split(' · ')[0] || '' } : { on: false };
  };
}

// ---------- settings ----------
async function settingsPage() {
  claudeBox(); const st = await api('/api/settings');
  const keyForm = (k, set, hint, ph) => `<form class="keyrow" data-k="${k}"><input type="password" autocomplete="off" spellcheck="false" placeholder="${set ? `Saved (${hint}). Paste a new key to replace it` : ph}">
    <button class="btn primary sm">Save</button>${set ? `<button type="button" class="btn ghost sm" data-test>Test</button><button type="button" class="btn ghost sm" data-clear>Remove</button>` : ''}</form><p class="note" data-note hidden></p>`;
  const s = st.sounds, allSounds = s.have >= s.total;
  app.innerHTML = `<div class="head enter"><div><h1>Settings</h1><p class="muted" style="margin:4px 0 0">Keys are saved on this PC only (data/settings.json) and are never pushed to the repo.</p></div></div>
  <div class="sgrid">
    <section class="kcard enter"><div class="s-h">${ic('sparkles', 20)}<h2>Claude</h2></div>
      <p class="muted">Runs every revision and drafts the upload captions.</p>
      <div class="state ${st.anthropic.set ? 'on' : ''}"><span class="dot"></span>${st.anthropic.set ? `Using your Anthropic API key (${st.anthropic.hint})` : 'Using your signed-in Claude login on this PC'}</div>
      ${keyForm('anthropicKey', st.anthropic.set, st.anthropic.hint, 'Anthropic API key (sk-ant-…)')}
      <p class="small">Leave this empty on your own PC. If you give the tool to someone else, they add their own key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p></section>
    <section class="kcard enter" style="animation-delay:40ms"><div class="s-h">${ic('mic', 20)}<h2>ElevenLabs</h2></div>
      <p class="muted">Makes the voice for ads with voiceover turned on.</p>
      <div class="state ${st.elevenlabs.set ? 'on' : ''}"><span class="dot"></span>${st.elevenlabs.set ? `Key saved (${st.elevenlabs.hint})` : 'No key yet: voiceover is off for every ad'}</div>
      ${keyForm('elevenlabsKey', st.elevenlabs.set, st.elevenlabs.hint, 'ElevenLabs API key')}
      <p class="small">Get one at <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener">elevenlabs.io</a>. It needs text to speech and voice read access. Lines that don’t change between versions are reused, so revisions only use credits for new lines.</p></section>
    <section class="kcard enter" style="animation-delay:60ms"><div class="s-h">${ic('cpu', 20)}<h2>Models</h2></div>
      <p class="muted">Which Claude does the work. The names always mean the latest version.</p>
      <label class="field">Revisions and video cards<select id="mRev"><option value="sonnet">Sonnet · recommended</option><option value="opus">Opus · best, costs most</option><option value="haiku">Haiku · cheapest</option></select></label>
      <label class="field">Upload captions<select id="mQuick"><option value="haiku">Haiku · recommended</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option></select></label>
      <p class="small">Sonnet costs about a third of Opus. Haiku is cheapest but weaker at visual detail. On an API key cost follows the model; on your Claude login, a cheaper model uses up your plan’s limits more slowly.</p></section>
    <section class="kcard enter" style="animation-delay:80ms"><div class="s-h">${ic('music', 20)}<h2>Sounds</h2></div>
      <p class="muted">The music and sound effects from Mixkit. They can’t ship in the repo, so each PC downloads them once.</p>
      <div class="state ${allSounds ? 'on' : ''}"><span class="dot"></span>${s.have} of ${s.total} files downloaded</div>
      ${allSounds ? '' : `<button class="btn primary sm" id="getSounds">${ic('download', 15)}Download sounds</button>`}
      ${s.error ? `<p class="note bad">${esc(s.error)}</p>` : ''}</section>
  </div>`;
  icons();
  $$('.keyrow').forEach(f => {
    const k = f.dataset.k, note = f.nextElementSibling, which = k === 'anthropicKey' ? 'anthropic' : 'elevenlabs';
    const show = (t, bad) => { note.textContent = t; note.className = 'note' + (bad ? ' bad' : ' ok'); note.hidden = false; };
    const test = async () => { try { show((await api('/api/settings/test', { method: 'POST', body: { which } })).note); } catch (e) { show(e.message, true); } };
    f.onsubmit = async e => {
      e.preventDefault(); const v = $('input', f).value.trim(); if (!v) return;
      await api('/api/settings', { method: 'POST', body: { [k]: v } }); toast('Key saved');
      await settingsPage(); $(`.keyrow[data-k="${k}"] [data-test]`)?.click();
    };
    $('[data-test]', f) && ($('[data-test]', f).onclick = test);
    $('[data-clear]', f) && ($('[data-clear]', f).onclick = async () => {
      if (await ask({ title: 'Remove this key?', text: which === 'anthropic' ? 'The studio goes back to your signed-in Claude login.' : 'Voiceover turns off until you add a key again.', ok: 'Remove', danger: true }) == null) return;
      await api('/api/settings', { method: 'POST', body: { [k]: '' } }); toast('Key removed'); settingsPage();
    });
  });
  $('#getSounds') && ($('#getSounds').onclick = () => downloadSounds($('#getSounds')).then(settingsPage));
  $('#mRev').value = st.models.revision; $('#mQuick').value = st.models.quick;
  for (const [elId, k] of [['#mRev', 'revisionModel'], ['#mQuick', 'quickModel']]) $(elId).onchange = async e => { await api('/api/settings', { method: 'POST', body: { [k]: e.target.value } }); toast('Model saved'); };
}

// ---------- source materials: references (to learn from) and footage (to use in the ad) ----------
const SRC = {
  references: ['images', 'References', 'Looks and ideas Claude learns from, without copying them.'],
  footage: ['clapperboard', 'Footage and assets', 'Clips, images and logos Claude puts in the ad itself.'],
};
const fsize = n => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
const fileIcon = t => /^image/.test(t) ? 'image' : /^video/.test(t) ? 'film' : /^audio/.test(t) ? 'music' : /pdf/.test(t) ? 'file-text' : 'file';
const junk = n => /(^|\/)(\.|Thumbs\.db$|desktop\.ini$)/i.test(n);
// folders dropped on a zone: walk them and keep each file's path inside the folder
async function droppedFiles(dt) {
  const out = [], entries = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files].map(f => ({ file: f, rel: f.name }));
  const walk = async (e, pre) => {
    if (e.isFile) { const f = await new Promise((ok, bad) => e.file(ok, bad)); out.push({ file: f, rel: pre + f.name }); return; }
    const rd = e.createReader(); let batch;
    do { batch = await new Promise((ok, bad) => rd.readEntries(ok, bad)); for (const c of batch) await walk(c, pre + e.name + '/'); } while (batch.length);
  };
  for (const e of entries) await walk(e, '');
  return out;
}
async function uploadSources(pid, group, items, onStep) {
  let n = 0;
  for (const it of items) {
    onStep?.(++n, items.length, it.rel);
    const r = await fetch(`/api/projects/${pid}/sources?group=${group}&path=${encodeURIComponent(it.rel)}`, { method: 'POST', body: it.file });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn’t upload ${it.rel}`);
  }
  return api(`/api/projects/${pid}/sources/done`, { method: 'POST', body: { group, count: items.length } });
}
// Two drop zones. Without pid the files wait in memory (new ad form); with pid they upload at once.
// Returns { pending } so the new ad form can upload after the ad exists.
function sourcesBox(el, { pid = null, existing = { references: [], footage: [] }, onChange, stack = false } = {}) {
  const pending = { references: [], footage: [] }; let have = existing, busy = '';
  const draw = () => {
    el.className = 'srcs' + (stack ? ' one' : '');
    el.innerHTML = Object.entries(SRC).map(([g, [icon, title, sub]]) => {
      const rows = [...have[g].map(f => ({ ...f, saved: true })), ...pending[g].map((p, i) => ({ path: p.rel, size: p.file.size, type: p.file.type, i }))];
      return `<div class="src" data-g="${g}"><div class="src-h">${ic(icon, 17)}<div><b>${title}</b><small>${sub}</small></div></div>
        <div class="drop" tabindex="0" role="button" aria-label="Add ${title.toLowerCase()}">${ic('upload-cloud', 20)}<span>Drop files or folders here</span>
          <span class="drop-b"><button type="button" class="linkbtn" data-pick="files">Choose files</button> · <button type="button" class="linkbtn" data-pick="dir">Choose a folder</button></span>
          <input type="file" multiple hidden data-in="files"><input type="file" multiple webkitdirectory hidden data-in="dir"></div>
        ${busy && busy.startsWith(g) ? `<div class="src-busy"><span class="spin"></span>${esc(busy.slice(g.length + 1))}</div>` : ''}
        ${rows.length ? `<ul class="flist">${rows.slice(0, 60).map(r => `<li>${ic(fileIcon(r.type), 14)}<span class="fn" title="${esc(r.path)}">${esc(r.path)}</span><span class="fs">${fsize(r.size)}</span>
          <button type="button" class="x" aria-label="Remove ${esc(r.path)}" ${r.saved ? `data-del="${esc(r.path)}"` : `data-rm="${r.i}"`}>${ic('x', 13)}</button></li>`).join('')}
          ${rows.length > 60 ? `<li class="more-n">and ${rows.length - 60} more</li>` : ''}</ul>` : ''}</div>`;
    }).join('');
    icons();
    $$('.src', el).forEach(box => {
      const g = box.dataset.g, drop = $('.drop', box);
      const add = async items => {
        items = items.filter(it => !junk(it.rel) && it.file.size > 0); if (!items.length) return;
        const big = items.filter(it => it.file.size > 2e9); if (big.length) { toast(`${big[0].rel} is over 2 GB`); items = items.filter(it => it.file.size <= 2e9); }
        if (!pid) { pending[g].push(...items); draw(); onChange?.(); return; }
        try { have = await uploadSources(pid, g, items, (n, t, rel) => { busy = `${g}:Uploading ${n} of ${t} · ${rel}`; draw(); }); toast(`${items.length} file${items.length > 1 ? 's' : ''} added`); }
        catch (e) { toast(e.message); } finally { busy = ''; draw(); onChange?.(have); }
      };
      $$('[data-pick]', box).forEach(b => b.onclick = e => { e.stopPropagation(); $(`[data-in="${b.dataset.pick}"]`, box).click(); });
      drop.onclick = e => { if (!e.target.closest('[data-pick]')) $('[data-in="files"]', box).click(); };
      drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('[data-in="files"]', box).click(); } };
      $$('[data-in]', box).forEach(inp => inp.onchange = () => { add([...inp.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name }))); inp.value = ''; });
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); add(await droppedFiles(e.dataTransfer)); };
      $$('[data-rm]', box).forEach(b => b.onclick = () => { pending[g].splice(+b.dataset.rm, 1); draw(); onChange?.(); });
      $$('[data-del]', box).forEach(b => b.onclick = async () => {
        try { have = await api(`/api/projects/${pid}/sources?group=${g}&path=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); draw(); onChange?.(have); } catch (e) { toast(e.message); }
      });
    });
  };
  draw();
  return { pending, count: () => pending.references.length + pending.footage.length };
}

// ---------- dropdowns: the native <select> keeps the value; the studio draws the button and list ----------
const selProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
function enhanceSelect(sel) {
  if (sel.dataset.dd) return; sel.dataset.dd = '1';
  const btn = document.createElement('button'); btn.type = 'button';
  btn.className = 'dd' + (sel.classList.contains('mini') ? ' dark' : ''); btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  btn.innerHTML = `<span class="dd-v"></span>${ic('chevron-down', 16)}`;
  sel.classList.add('dd-native'); sel.tabIndex = -1; sel.after(btn); icons();
  const sync = () => { const o = sel.selectedOptions[0]; $('.dd-v', btn).textContent = o ? o.textContent : ''; btn.disabled = sel.disabled; };
  // keep the button in step with code that sets .value, swaps options or resets the form
  Object.defineProperty(sel, 'value', { configurable: true, get() { return selProto.get.call(this); }, set(v) { selProto.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  sel.addEventListener('change', sync); sel.form?.addEventListener('reset', () => setTimeout(sync));
  sel.addEventListener('focus', () => btn.focus());
  btn.onclick = () => ddOpen(sel, btn);
  btn.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ddOpen(sel, btn); } };
  sync();
}
function ddOpen(sel, btn) {
  if ($('.dd-list')) { $('.dd-list').remove(); }
  const host = btn.closest('dialog') || document.body, opts = [...sel.options];
  const list = document.createElement('div'); list.className = 'menu dd-list'; list.setAttribute('role', 'listbox');
  list.innerHTML = opts.map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${o.selected}" ${o.disabled ? 'disabled' : ''}><span>${esc(o.textContent)}</span>${o.selected ? ic('check', 15) : ''}</button>`).join('');
  host.append(list); icons(); btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(); list.style.minWidth = r.width + 'px';
  const lr = list.getBoundingClientRect(), below = innerHeight - r.bottom - 8;
  list.style.left = Math.max(8, Math.min(r.left, innerWidth - lr.width - 8)) + 'px';
  if (lr.height > below && r.top > below) { list.style.top = Math.max(8, r.top - lr.height - 6) + 'px'; list.style.transformOrigin = 'bottom left'; } else list.style.top = r.bottom + 6 + 'px';
  const items = $$('button', list), cur = Math.max(0, sel.selectedIndex);
  items[cur]?.focus(); items[cur]?.scrollIntoView({ block: 'nearest' });
  const close = refocus => { list.classList.add('out'); setTimeout(() => list.remove(), 140); btn.setAttribute('aria-expanded', 'false'); removeEventListener('pointerdown', away, true); if (refocus) btn.focus(); };
  const away = e => { if (!list.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
  setTimeout(() => addEventListener('pointerdown', away, true));
  const pick = i => { if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); } $('.dd-v', btn).textContent = sel.options[i].textContent; close(true); };
  items.forEach(b => b.onclick = () => pick(+b.dataset.i));
  list.onkeydown = e => {
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, at + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, at - 1)]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1) { const k = e.key.toLowerCase(); const j = items.findIndex((b, x) => x > at && b.textContent.trim().toLowerCase().startsWith(k)); const f = j >= 0 ? j : items.findIndex(b => b.textContent.trim().toLowerCase().startsWith(k)); if (f >= 0) items[f].focus(); }
  };
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.tagName === 'SELECT') enhanceSelect(n); else n.querySelectorAll?.('select').forEach(enhanceSelect); } })
  .observe(document.body, { childList: true, subtree: true });
$$('select').forEach(enhanceSelect);

// ---------- new ad ----------
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
let voGet = () => ({ on: false }), tpls = [], newSrc = null, exGet = () => [];
const tplAbout = () => { const t = tpls.find(x => x.slug === $('#nTpl').value); $('#nTplAbout').textContent = t ? `${t.about}. Claude rewrites it for your brief.` : 'Claude builds it from your brief, starting from the closest existing ad.'; };
$('#newBtn').onclick = async () => {
  $('#newForm').reset(); $('#newErr').hidden = true;
  tpls = await api('/api/templates').catch(() => []);
  $('#nTpl').innerHTML = '<option value="">Let Claude pick</option>' + tpls.map(t => `<option value="${t.slug}">${esc(t.label)} · ${esc(t.lang)} · ${t.format} · ${t.secs}s</option>`).join('');
  tplAbout(); $('#nTpl').onchange = tplAbout;
  voGet = await voControl($('#nVo'));
  newSrc = sourcesBox($('#nSrc'));
  exGet = await examplePicker($('#nEx'));
  $('#newDlg').showModal();
};
$('#newForm').onsubmit = async e => {
  e.preventDefault();
  try { const p = await api('/api/projects', { method: 'POST', body: { title: $('#nTitle').value.trim(), persona: $('#nPersona').value.trim(), lang: $('#nLang').value, format: $('#nFormat').value, template: $('#nTpl').value, brief: $('#nBrief').value, vo: voGet(), examples: exGet() } });
    const go = $('#newForm [type=submit]');
    if (newSrc?.count()) {
      go.disabled = true;
      try { for (const g of ['references', 'footage']) if (newSrc.pending[g].length) await uploadSources(p.id, g, newSrc.pending[g], (n, t) => { go.innerHTML = `<span class="spin"></span>Uploading ${g} ${n} of ${t}`; }); }
      catch (e2) { toast(e2.message + '. Add the rest in the Brief tab.'); }
      finally { go.disabled = false; go.textContent = 'Create brief'; }
    }
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
  } else if (!location.hash.startsWith('#/knowledge') && !location.hash.startsWith('#/settings')) {
    const ps = await api('/api/projects').catch(() => []); claudeBox(ps);
    if ($('.board') && ps.some(p => jobActive(p.job))) for (const p of ps) { const el = $(`.card[data-id="${p.id}"]`); if (el && el.closest('.col').dataset.k !== p.status) return board(); const j = el && $('.job', el); if (el) { const html = jobPill(p); if ((j?.outerHTML || '') !== html) { j ? j.outerHTML = html : $('.card-b', el).insertAdjacentHTML('beforeend', html); icons(); } } }
  }
}, 2000);

// ---------- router ----------
function route() {
  const h = location.hash; let m;
  const go = (m = h.match(/^#\/a\/(\w+)/)) ? (cur?.id !== m[1] && (mode = 'frame', draft = {}, tab = 'Comments', cmpV = null), ad(m[1])) : h.startsWith('#/knowledge') ? knowledge() : h.startsWith('#/settings') ? settingsPage() : board();
  go.catch(e => { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
}
window.addEventListener('hashchange', route); route();
