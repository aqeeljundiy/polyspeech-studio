// Polyspeech Studio: Frame.io-style review board for Polyspeech motion-graphics ads.
// Each project has a working source (engine/work/<slug>/clip.html + clip.json) and numbered renders
// (projects/<slug>/vN.mp4, with the source that made each one in vN-src/). Revisions run Claude in the
// background through the Agent SDK (worker.mjs), one job at a time.
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const PORT = +process.env.PORT || 4430;
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const PROJECTS = path.join(ROOT, 'projects');
const WORK = path.join(ROOT, 'engine', 'work');
const TEMPLATES = path.join(ROOT, 'engine', 'templates');
const KNOW = path.join(ROOT, 'knowledge');
export const STATUSES = ['brief', 'rendering', 'review', 'revision', 'ready', 'uploaded'];
const KINDS = ['frame', 'range', 'pin', 'area', 'video'];
for (const d of [PROJECTS, WORK, path.dirname(DB_FILE)]) fs.mkdirSync(d, { recursive: true });

// ---------- db ----------
const load = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return { projects: [], comments: [] }; } };
let db = load();
const save = () => { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); };
const id = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'ad';
const log = (p, text) => { p.activity = p.activity || []; p.activity.unshift({ at: now(), text }); p.updated = now(); };
const dirOf = p => path.join(PROJECTS, p.slug);
const workOf = p => path.join(WORK, p.slug);
const clipCfg = p => { try { return JSON.parse(fs.readFileSync(path.join(workOf(p), 'clip.json'), 'utf8')); } catch { return {}; } };

// ---------- settings (data/settings.json, never in the repo) ----------
// anthropicKey: when set, Claude runs on this key; when empty, on the signed-in Claude login.
// elevenlabsKey: for voiceover. Keys never leave this PC except to their own service.
const SETTINGS_FILE = path.join(ROOT, 'data', 'settings.json');
const settings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; } };
const hint = k => k ? '…' + k.slice(-4) : '';
const AUDIO = path.join(ROOT, 'engine', 'audio');
const soundList = () => { const src = fs.readFileSync(path.join(ROOT, 'engine', 'fetch-audio.mjs'), 'utf8'); return [...src.matchAll(/(\w+): \d+/g)].map(m => m[1]); };
const soundStatus = () => { const all = soundList(); const have = all.filter(n => fs.existsSync(path.join(AUDIO, n + '.mp3'))).length; return { have, total: all.length, running: !!soundJob, error: soundErr }; };
let soundJob = null, soundErr = '';
let voiceCache = null; // { key, at, list }
async function voices() {
  const key = settings().elevenlabsKey; if (!key) return [];
  if (voiceCache?.key === key && Date.now() - voiceCache.at < 600000) return voiceCache.list;
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(r.status === 401 ? 'ElevenLabs didn’t accept that key.' : `ElevenLabs returned ${r.status}.`);
  const list = (await r.json()).voices.map(v => ({ id: v.voice_id, name: v.name, desc: [v.labels?.gender, v.labels?.age, v.labels?.accent].filter(Boolean).join(', ') })).sort((a, b) => a.name.localeCompare(b.name));
  voiceCache = { key, at: Date.now(), list }; return list;
}

// ---------- source materials: projects/<slug>/_sources/{references,footage}/<folders…> ----------
// references: looks and ideas to learn from. footage: files Claude should put in the ad.
const GROUPS = ['references', 'footage'];
const srcDir = (p, g) => path.join(dirOf(p), '_sources', g);
const safeRel = r => String(r || '').split(/[\\/]+/).filter(x => x && x !== '.' && x !== '..').map(x => x.replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 120)).join('/');
function sources(p) {
  const out = {};
  for (const g of GROUPS) {
    const base = srcDir(p, g), list = [];
    const walk = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else list.push({ path: path.relative(base, f).replace(/\\/g, '/'), size: fs.statSync(f).size, type: MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); } };
    walk(base); out[g] = list.sort((a, b) => a.path.localeCompare(b.path));
  }
  return out;
}

// ---------- video examples: knowledge/_media/<id>/ (video, sheets, meta) and knowledge/examples/<id>.md once approved ----------
const KMEDIA = path.join(KNOW, '_media'), KEX = path.join(KNOW, 'examples');
for (const d of [KMEDIA, KEX]) fs.mkdirSync(d, { recursive: true });
const exMeta = eid => { try { return JSON.parse(fs.readFileSync(path.join(KMEDIA, eid, 'meta.json'), 'utf8')); } catch { return null; } };
const exSave = m => fs.writeFileSync(path.join(KMEDIA, m.id, 'meta.json'), JSON.stringify(m, null, 1));
const exList = () => fs.readdirSync(KMEDIA).map(exMeta).filter(Boolean).map(m => ({ ...m, card: undefined, thumb: fs.existsSync(path.join(KMEDIA, m.id, 'thumb.jpg')) ? 'thumb.jpg' : fs.existsSync(path.join(KMEDIA, m.id, 'sheets', 's01.jpg')) ? 'sheets/s01.jpg' : '' })).sort((a, b) => b.created.localeCompare(a.created));
const exFile = m => path.join(KEX, m.id + '.md');
const exWrite = m => { if (m.status === 'approved') fs.writeFileSync(exFile(m), `# ${m.title}\n\n${m.summary ? `${m.summary}\n\n` : ''}Source: ${m.name} · ${m.stats?.secs ?? '?'}s · ${m.stats?.cuts ?? '?'} cuts · average shot ${m.stats?.avgShot ?? '?'}s\n\n${m.card}\n`); else fs.rmSync(exFile(m), { force: true }); };
function digest(m) {
  m.status = 'processing'; m.note = 'Starting'; exSave(m);
  const logFile = path.join(KMEDIA, m.id, 'digest.log');
  spawn(process.execPath, [path.join(ROOT, 'engine', 'digest.mjs'), m.id, String(PORT)], { cwd: ROOT, stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')], windowsHide: true })
    .on('exit', code => { const cur = exMeta(m.id); if (cur && cur.status === 'processing') { cur.status = 'failed'; cur.note = `Stopped (code ${code}). See digest.log.`; exSave(cur); } });
}

// ---------- versions on disk ----------
function versions(p) {
  const d = dirOf(p); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => /^v\d+\.mp4$/i.test(f)).map(f => {
    const st = fs.statSync(path.join(d, f)); const v = +f.match(/\d+/)[0];
    const meta = (p.versionMeta || {})[v] || {};
    return { v, name: f, size: st.size, at: meta.at || st.mtime, note: meta.note || '', speed: meta.speed || 1 };
  }).sort((a, b) => b.v - a.v);
}
const summary = p => {
  const vs = versions(p);
  return { ...p, latest: vs[0] || null, versionCount: vs.length, openComments: db.comments.filter(c => c.project === p.id && !c.resolved).length,
    progress: liveProgress(p) };
};
// render progress written by engine/render.mjs while Claude renders
function liveProgress(p) {
  if (!p.job || !['working', 'rendering'].includes(p.job.state)) return null;
  try { const pr = JSON.parse(fs.readFileSync(path.join(workOf(p), 'progress.json'), 'utf8')); if (Date.now() - pr.at < 120000 && pr.phase !== 'done') return pr; } catch {}
  return null;
}

// ---------- revision requests ----------
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`;
function describe(c, speed) {
  const src = x => (x * speed).toFixed(2);
  const where = c.kind === 'video' ? 'whole video'
    : c.kind === 'range' ? `${fmt(c.t)}–${fmt(c.t2)} (build time ${src(c.t)}s–${src(c.t2)}s)`
    : `${fmt(c.t)} (build time ${src(c.t)}s)`;
  const pos = c.kind === 'pin' && c.pin ? ` · pinned at ${Math.round(c.pin.x * 100)}% across, ${Math.round(c.pin.y * 100)}% down`
    : c.kind === 'area' && c.box ? ` · area x ${Math.round(c.box.x * 100)}–${Math.round((c.box.x + c.box.w) * 100)}%, y ${Math.round(c.box.y * 100)}–${Math.round((c.box.y + c.box.h) * 100)}%` : '';
  const replies = (c.replies || []).map(r => `\n    - reply (${r.author}): ${r.text}`).join('');
  return `- [${c.kind}] v${c.v} @ ${where}${pos}: ${c.text}${c.snapshot ? `\n    - Frame with markup: ${path.join(dirOf(db.projects.find(x => x.id === c.project)), c.snapshot)}` : ''}${(c.attachments || []).map(a => `\n    - Attached reference (${a.type}): ${path.join(dirOf(db.projects.find(x => x.id === c.project)), a.file)}`).join('')}${c.learn ? '\n    - Reviewer marked this as a lesson: add it to knowledge/learnings.md' : ''}${replies}`;
}
function writeRequest(p, type, notes) {
  const vs = versions(p), next = (vs[0]?.v || 0) + 1, cfg = clipCfg(p), speed = cfg.speed || 1;
  const open = db.comments.filter(c => c.project === p.id && !c.resolved).sort((a, b) => a.v - b.v || a.t - b.t);
  const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
  const md = [
    `# ${type === 'generate' ? 'Make v1' : `Revise to v${next}`}: ${p.title}`, '',
    `- Project: ${p.id} (${p.persona || 'persona n/a'} · ${p.lang || ''} · ${p.format})`,
    `- Working source: ${rel(workOf(p))}/clip.html and clip.json (timeline speed ${speed}×: build time = video time × ${speed})`,
    `- Latest render: ${vs[0] ? rel(path.join(dirOf(p), vs[0].name)) : 'none yet'}`,
    `- Output: ${rel(path.join(dirOf(p), `v${next}.mp4`))}  (render: node engine/render.mjs --clip ${rel(workOf(p))} --outfile ${rel(path.join(dirOf(p), `v${next}.mp4`))})`,
    `- After rendering, copy clip.html and clip.json into ${rel(path.join(dirOf(p), `v${next}-src`))}/`, '',
    '## Brief', '', p.brief || '(none)', '',
    '## Voiceover', '', p.vo?.on ? `On. Voice: ${p.vo.voiceName || p.vo.voice} (id ${p.vo.voice}). Write the lines, make them with node engine/tts.mjs (see knowledge/style.md, Voiceover) and add them as cues. Keep every existing line that a comment doesn’t ask to change: tts.mjs reuses unchanged lines without new cost.` : 'Off. Music and UI sounds only; remove any voice cues if a template had them.', '',
    ...(() => { const sr = sources(p), list = g => sr[g].map(f => `- ${rel(path.join(srcDir(p, g), f.path))} (${f.type}, ${(f.size / 1e6).toFixed(1)} MB)`).join('\n');
      return [
        sr.references.length ? `## References (${sr.references.length})\n\nLooks, ideas and examples to learn from. Open each one with Read (images, PDFs) or look at stills from videos. Match the idea in the Polyspeech style; don't copy them into the ad.\n\n${list('references')}\n` : '',
        sr.footage.length ? `## Footage and assets (${sr.footage.length})\n\nFiles to use in the ad itself. Copy the ones you use into the working folder's assets/ and follow knowledge/style.md (Footage and assets). If one doesn't fit the story, say why in your summary.\n\n${list('footage')}\n` : '',
      ]; })(),
    (p.examples || []).map(exMeta).filter(m => m?.status === 'approved').length ? `## Example cards to learn from\n\nRead each card and use what its "Borrow for Polyspeech" section suggests, within the Polyspeech style.\n\n${(p.examples || []).map(exMeta).filter(m => m?.status === 'approved').map(m => `- ${rel(exFile(m))}: ${m.title}. ${m.summary || ''}`).join('\n')}\n` : '',
    notes ? `## Overall notes for this round\n\n${notes}\n` : '',
    open.length ? `## Open review comments (${open.length})\n\n${open.map(c => describe(c, speed)).join('\n')}\n` : '## Open review comments\n\n(none)\n',
  ].join('\n');
  const dir = path.join(dirOf(p), 'requests'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${type === 'generate' ? 'v1' : 'v' + next}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  fs.writeFileSync(file, md);
  return { file, next };
}

// ---------- background Claude: one job at a time ----------
let running = null; // project id
function pump() {
  if (running) return;
  const p = db.projects.filter(x => x.job?.state === 'queued').sort((a, b) => a.job.at.localeCompare(b.job.at))[0];
  if (!p) return;
  running = p.id;
  p.job = { ...p.job, state: 'working', note: 'Claude is reading your comments', at: now() }; p.status = 'rendering'; log(p, `Claude started on v${p.job.next}`); save();
  const logFile = p.job.file.replace(/\.md$/, '.log');
  const child = spawn(process.execPath, [path.join(ROOT, 'worker.mjs'), p.id, p.job.file, String(p.job.next), String(PORT)], { cwd: ROOT, stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')], windowsHide: true });
  p.job.pid = child.pid; save();
  child.on('exit', code => {
    const pr = db.projects.find(x => x.id === running); running = null;
    if (pr && pr.job && ['working', 'rendering'].includes(pr.job.state)) {
      const ok = fs.existsSync(path.join(dirOf(pr), `v${pr.job.next}.mp4`));
      if (ok) finish(pr, 'Claude finished. New version ready for review');
      else { pr.job = { ...pr.job, state: 'failed', note: `Claude stopped (code ${code}) before v${pr.job.next} was rendered. See the log.`, at: now() }; pr.status = 'revision'; log(pr, 'Revision failed'); save(); }
    }
    pump();
  });
}
function finish(p, note) {
  const v = p.job.next; p.versionMeta = p.versionMeta || {}; p.versionMeta[v] = { at: now(), note: p.job.summary || '', speed: clipCfg(p).speed || 1 };
  p.job = { ...p.job, state: 'ready', note, at: now() }; p.status = 'review'; log(p, `v${v} ready for review`); save();
}

// ---------- http helpers ----------
const send = (res, code, body, type = 'application/json', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readJson = req => new Promise((ok, bad) => { let b = ''; req.on('data', d => { b += d; if (b.length > 80e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.md': 'text/markdown; charset=utf-8', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.mov': 'video/quicktime', '.webm': 'video/webm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.otf': 'font/otf' };
function serveFile(req, res, file, download) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'Not found' });
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const extra = download ? { 'Content-Disposition': `attachment; filename="${download.replace(/"/g, '')}"` } : {};
  const range = req.headers.range;
  if (range && !download) {
    const [s, e] = range.replace('bytes=', '').split('-'); const start = +s || 0, end = Math.min(e ? +e : start + 8 * 1024 ** 2, size - 1);
    if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': size, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ...extra });
  fs.createReadStream(file).pipe(res);
}
const jobActive = p => p.job && ['queued', 'working', 'rendering'].includes(p.job.state);
const find = pid => db.projects.find(x => x.id === pid);

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const m = req.method; let mm;
  try {
    if (p === '/api/projects' && m === 'GET') return send(res, 200, db.projects.map(summary));
    if (p === '/api/templates' && m === 'GET') return send(res, 200, fs.readdirSync(TEMPLATES).filter(d => fs.existsSync(path.join(TEMPLATES, d, 'clip.json'))).map(d => { const c = JSON.parse(fs.readFileSync(path.join(TEMPLATES, d, 'clip.json'), 'utf8')); return { slug: d, label: c.label || d, lang: c.lang || '', format: c.h > c.w ? '9:16' : '16:9', secs: Math.round((c.dur || 0) / (c.speed || 1)), about: c.about || '' }; }));
    if (p === '/api/projects' && m === 'POST') {
      // new ad from a brief, optionally starting from a template's source
      const b = await readJson(req); if (!b.title) return send(res, 400, { error: 'Give the ad a title.' });
      let s = slug(b.title); while (db.projects.some(x => x.slug === s)) s += '-2';
      const pr = { id: id(), slug: s, title: b.title, persona: b.persona || '', lang: b.lang || '', format: b.format === '16:9' ? '16:9' : '9:16', brief: b.brief || '', examples: Array.isArray(b.examples) ? b.examples.filter(x => /^\w+$/.test(x)).slice(0, 12) : [], vo: b.vo?.on && b.vo.voice ? { on: true, voice: String(b.vo.voice), voiceName: String(b.vo.voiceName || '') } : { on: false }, status: 'brief', created: now(), updated: now(), activity: [], upload: {} };
      fs.mkdirSync(dirOf(pr), { recursive: true }); fs.mkdirSync(workOf(pr), { recursive: true });
      if (b.template && fs.existsSync(path.join(TEMPLATES, b.template))) for (const f of ['clip.html', 'clip.json']) fs.copyFileSync(path.join(TEMPLATES, b.template, f), path.join(workOf(pr), f));
      log(pr, 'Brief created'); db.projects.push(pr); save(); return send(res, 201, summary(pr));
    }
    if ((mm = p.match(/^\/api\/projects\/(\w+)$/))) {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      if (m === 'GET') return send(res, 200, { ...summary(pr), versions: versions(pr), comments: db.comments.filter(c => c.project === pr.id), speed: clipCfg(pr).speed || 1, sources: sources(pr) });
      if (m === 'PATCH') {
        const b = await readJson(req);
        // steps only move by their buttons: Rendering and Revision are set by Claude's jobs, never by hand
        const MOVES = { review: ['ready'], ready: ['review', 'uploaded'], uploaded: ['ready'] };
        if (b.status && b.status !== pr.status && !(MOVES[pr.status] || []).includes(b.status)) return send(res, 409, { error: 'That step can’t be changed by hand.' });
        if (b.status && STATUSES.includes(b.status) && b.status !== pr.status) { log(pr, `Moved to ${b.status}`); pr.status = b.status; if (b.status === 'uploaded') pr.uploadedAt = now(); }
        for (const k of ['title', 'brief', 'persona', 'lang']) if (typeof b[k] === 'string' && b[k] !== pr[k]) { if (k === 'title' && !b[k].trim()) continue; if (k === 'title') log(pr, `Renamed from “${pr.title}”`); pr[k] = k === 'title' ? b[k].trim() : b[k]; if (k === 'brief') log(pr, 'Brief updated'); }
        if (Array.isArray(b.examples)) { pr.examples = b.examples.filter(x => /^\w+$/.test(x)).slice(0, 12); log(pr, `Example cards: ${pr.examples.length}`); }
        if (b.vo && typeof b.vo === 'object') { pr.vo = b.vo.on && b.vo.voice ? { on: true, voice: String(b.vo.voice), voiceName: String(b.vo.voiceName || '') } : { on: false }; log(pr, pr.vo.on ? `Voiceover on (${pr.vo.voiceName})` : 'Voiceover off'); }
        if (b.upload && typeof b.upload === 'object') pr.upload = { ...(pr.upload || {}), ...b.upload };
        save(); return send(res, 200, summary(pr));
      }
      if (m === 'DELETE') { if (jobActive(pr)) return send(res, 409, { error: 'Claude is working on this ad. Cancel the job first.' }); fs.rmSync(dirOf(pr), { recursive: true, force: true }); fs.rmSync(workOf(pr), { recursive: true, force: true }); db.projects = db.projects.filter(x => x !== pr); db.comments = db.comments.filter(c => c.project !== pr.id); save(); return send(res, 200, { ok: true }); }
    }
    // source materials: one file per request, streamed (footage can be large); ?group=references|footage&path=folder/file.ext
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/sources$/)) && (m === 'POST' || m === 'DELETE')) {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      const g = url.searchParams.get('group'), r = safeRel(url.searchParams.get('path'));
      if (!GROUPS.includes(g) || !r) return send(res, 400, { error: 'Pick references or footage, and a file name.' });
      const file = path.join(srcDir(pr, g), r);
      if (m === 'DELETE') { fs.rmSync(file, { force: true }); log(pr, `Removed ${r} from ${g}`); save(); return send(res, 200, sources(pr)); }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await new Promise((ok, bad) => { const w = fs.createWriteStream(file); req.pipe(w); w.on('finish', ok); w.on('error', bad); req.on('error', bad); });
      pr.updated = now(); save(); return send(res, 201, { path: r, size: fs.statSync(file).size });
    }
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/sources\/done$/)) && m === 'POST') {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      const b = await readJson(req); if (b.count) { log(pr, `Added ${b.count} file${b.count > 1 ? 's' : ''} to ${b.group}`); save(); } return send(res, 200, sources(pr));
    }
    // comments: frame, range, pin, area or whole video; optional drawing; threaded replies
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/comments$/)) && m === 'POST') {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      const b = await readJson(req); if (!String(b.text || '').trim()) return send(res, 400, { error: 'Write a comment first.' });
      const kind = KINDS.includes(b.kind) ? b.kind : 'frame';
      const c = { id: id(), project: pr.id, v: +b.v || 0, kind, t: kind === 'video' ? 0 : +b.t || 0, text: String(b.text).trim(), author: b.author || 'You', resolved: false, at: now(), replies: [] };
      if (kind === 'range') c.t2 = Math.max(c.t, +b.t2 || c.t);
      if (kind === 'pin' && b.pin) c.pin = { x: +b.pin.x, y: +b.pin.y };
      if (kind === 'area' && b.box) c.box = { x: +b.box.x, y: +b.box.y, w: +b.box.w, h: +b.box.h };
      if (Array.isArray(b.shapes) && b.shapes.length) c.shapes = b.shapes.slice(0, 200);
      const snap = typeof b.snapshot === 'string' && b.snapshot.match(/^data:image\/(jpeg|png);base64,(.+)$/);
      if (snap) { const dir = path.join(dirOf(pr), '_review'); fs.mkdirSync(dir, { recursive: true }); const f = `v${c.v}_${String(Math.round(c.t * 30)).padStart(5, '0')}_${c.id}.jpg`; fs.writeFileSync(path.join(dir, f), Buffer.from(snap[2], 'base64')); c.snapshot = '_review/' + f; }
      // reference files attached to the comment (images, videos, PDFs), saved next to the project
      if (Array.isArray(b.attachments) && b.attachments.length) {
        const dir = path.join(dirOf(pr), '_attachments'); fs.mkdirSync(dir, { recursive: true }); c.attachments = [];
        for (const a of b.attachments.slice(0, 8)) {
          const mt = typeof a.data === 'string' && a.data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/); if (!mt) continue;
          const name = String(a.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
          const f = `${c.id}_${name}`; fs.writeFileSync(path.join(dir, f), Buffer.from(mt[2], 'base64'));
          c.attachments.push({ name, file: '_attachments/' + f, type: mt[1] });
        }
      }
      db.comments.push(c); log(pr, `Comment on v${c.v}`); save(); return send(res, 201, c);
    }
    if ((mm = p.match(/^\/api\/comments\/(\w+)$/))) {
      const c = db.comments.find(x => x.id === mm[1]); if (!c) return send(res, 404, { error: 'Comment not found' });
      if (m === 'PATCH') { const b = await readJson(req); if ('resolved' in b) c.resolved = !!b.resolved; if ('learn' in b) c.learn = !!b.learn; if (typeof b.text === 'string' && b.text.trim()) { c.text = b.text.trim(); c.edited = now(); } save(); return send(res, 200, c); }
      if (m === 'DELETE') { db.comments = db.comments.filter(x => x !== c); save(); return send(res, 200, { ok: true }); }
    }
    if ((mm = p.match(/^\/api\/comments\/(\w+)\/replies$/)) && m === 'POST') {
      const c = db.comments.find(x => x.id === mm[1]); if (!c) return send(res, 404, { error: 'Comment not found' });
      const b = await readJson(req); if (!String(b.text || '').trim()) return send(res, 400, { error: 'Write a reply first.' });
      const r = { id: id(), text: String(b.text).trim(), author: b.author || 'You', at: now() }; (c.replies = c.replies || []).push(r); save(); return send(res, 201, r);
    }
    // send back to revision (or make v1): writes the request and queues Claude
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/request$/)) && m === 'POST') {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      if (pr.job && ['queued', 'working', 'rendering'].includes(pr.job.state)) return send(res, 409, { error: 'Claude is already on this one.' });
      const b = await readJson(req); const type = versions(pr).length ? 'revision' : 'generate';
      if (!fs.existsSync(path.join(workOf(pr), 'clip.html')) && type === 'revision') return send(res, 409, { error: 'This ad has no working source yet.' });
      const { file, next } = writeRequest(pr, type, b.notes || '');
      pr.status = 'revision'; pr.job = { state: 'queued', type, next, note: running ? 'Waiting for the current job to finish' : 'Starting Claude…', file, at: now() };
      log(pr, type === 'generate' ? 'v1 requested' : `Sent back to revision (v${next})`); save(); pump();
      return send(res, 200, summary(pr));
    }
    // the worker reports here: working → rendering → ready / failed
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/job$/)) && m === 'POST') {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      const b = await readJson(req);
      if (b.state === 'cancel') { if (pr.job?.pid) try { process.kill(pr.job.pid); } catch {} pr.job = { ...pr.job, state: 'failed', note: 'Cancelled', at: now() }; pr.status = 'revision'; save(); return send(res, 200, pr.job); }
      if (b.state === 'none') { delete pr.job; save(); return send(res, 200, {}); }
      if (!['working', 'rendering', 'ready', 'failed'].includes(b.state)) return send(res, 400, { error: 'Unknown state' });
      if (b.summary) pr.job = { ...pr.job, summary: b.summary };
      if (b.state === 'ready') { if (fs.existsSync(path.join(dirOf(pr), `v${pr.job.next}.mp4`))) finish(pr, b.note || 'New version ready for review'); return send(res, 200, pr.job); }
      pr.job = { ...pr.job, state: b.state, note: b.note || pr.job?.note || '', at: now() }; save(); return send(res, 200, pr.job);
    }
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/log$/)) && m === 'GET') {
      const pr = find(mm[1]); if (!pr?.job?.file) return send(res, 200, { text: '' });
      const f = pr.job.file.replace(/\.md$/, '.log'); const txt = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      return send(res, 200, { text: txt.slice(-6000) });
    }
    // captions for the upload step, written by Claude (no tools) from the brief and knowledge
    if ((mm = p.match(/^\/api\/projects\/(\w+)\/captions$/)) && m === 'POST') {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      const { captions } = await import('./worker.mjs');
      const out = await captions(pr, fs.readFileSync(path.join(KNOW, 'product.md'), 'utf8'));
      pr.upload = { ...(pr.upload || {}), ...out }; log(pr, 'Captions drafted'); save(); return send(res, 200, pr.upload);
    }
    // settings
    if (p === '/api/settings' && m === 'GET') { const st = settings(); return send(res, 200, { anthropic: { set: !!st.anthropicKey, hint: hint(st.anthropicKey) }, elevenlabs: { set: !!st.elevenlabsKey, hint: hint(st.elevenlabsKey) }, sounds: soundStatus(), models: { revision: st.revisionModel || 'sonnet', quick: st.quickModel || 'haiku' } }); }
    if (p === '/api/settings' && m === 'POST') {
      const b = await readJson(req), st = settings();
      for (const k of ['anthropicKey', 'elevenlabsKey']) if (typeof b[k] === 'string') { const v = b[k].trim(); if (v) st[k] = v; else delete st[k]; }
      for (const k of ['revisionModel', 'quickModel']) if (['opus', 'sonnet', 'haiku'].includes(b[k])) st[k] = b[k];
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(st, null, 2)); voiceCache = null; return send(res, 200, { ok: true });
    }
    // checks a saved key against its service
    if (p === '/api/settings/test' && m === 'POST') {
      const b = await readJson(req), st = settings();
      if (b.which === 'elevenlabs') { voiceCache = null; const v = await voices().catch(e => { throw Object.assign(e, { status: 400 }); }); return send(res, 200, { ok: true, note: `Key works. ${v.length} voices available.` }); }
      if (!st.anthropicKey) return send(res, 200, { ok: true, note: 'No key saved: the studio uses your signed-in Claude login.' });
      const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': st.anthropicKey, 'anthropic-version': '2023-06-01' } });
      return r.ok ? send(res, 200, { ok: true, note: 'Key works.' }) : send(res, 400, { error: r.status === 401 ? 'Anthropic didn’t accept that key.' : `Anthropic returned ${r.status}.` });
    }
    if (p === '/api/voices' && m === 'GET') { try { return send(res, 200, await voices()); } catch (e) { return send(res, 400, { error: e.message }); } }
    // one-click sound download (Mixkit files can't ship in the repo)
    if (p === '/api/sounds' && m === 'POST') {
      if (!soundJob) { soundErr = ''; let out = ''; soundJob = spawn(process.execPath, [path.join(ROOT, 'engine', 'fetch-audio.mjs')], { cwd: ROOT, windowsHide: true });
        soundJob.stderr.on('data', d => { out += d; }); soundJob.on('exit', () => { soundJob = null; const st = soundStatus(); if (st.have < st.total) soundErr = out.trim().split(/\r?\n/).pop() || 'Some sounds didn’t download. Try again.'; }); }
      return send(res, 200, soundStatus());
    }
    // video examples
    if (p === '/api/examples' && m === 'GET') return send(res, 200, exList());
    if (p === '/api/examples' && m === 'POST') {
      const name = String(url.searchParams.get('name') || 'video.mp4').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
      if (!/\.(mp4|mov|webm|m4v|mkv)$/i.test(name)) return send(res, 400, { error: 'Upload a video file (mp4, mov, webm, m4v or mkv).' });
      const eid = id(), dir = path.join(KMEDIA, eid); fs.mkdirSync(dir, { recursive: true });
      const file = 'video' + path.extname(name).toLowerCase();
      await new Promise((ok, bad) => { const w = fs.createWriteStream(path.join(dir, file)); req.pipe(w); w.on('finish', ok); w.on('error', bad); req.on('error', bad); });
      const mt = { id: eid, name, file, note: '', userNote: String(url.searchParams.get('note') || '').slice(0, 500), title: name.replace(/\.\w+$/, ''), summary: '', card: '', status: 'processing', created: now() };
      exSave(mt); digest(mt); return send(res, 201, mt);
    }
    if ((mm = p.match(/^\/api\/examples\/(\w+)$/))) {
      const mt = exMeta(mm[1]); if (!mt) return send(res, 404, { error: 'Example not found' });
      const sheets = () => { const d = path.join(KMEDIA, mt.id, 'sheets'); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.jpg')).sort() : []; };
      if (m === 'GET') { const tf = path.join(KMEDIA, mt.id, 'transcript.txt'); return send(res, 200, { ...mt, sheets: sheets(), transcript: fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : '' }); }
      if (m === 'PATCH') {
        const b = await readJson(req);
        for (const k of ['title', 'summary', 'card']) if (typeof b[k] === 'string') mt[k] = b[k].trim();
        if (b.status === 'approved' || b.status === 'draft') { if (mt.status === 'processing') return send(res, 409, { error: 'Still breaking it down.' }); mt.status = b.status; }
        exSave(mt); exWrite(mt); return send(res, 200, mt);
      }
      if (m === 'DELETE') {
        fs.rmSync(path.join(KMEDIA, mt.id), { recursive: true, force: true }); fs.rmSync(exFile(mt), { force: true });
        for (const pr of db.projects) if (pr.examples?.includes(mt.id)) pr.examples = pr.examples.filter(x => x !== mt.id);
        save(); return send(res, 200, { ok: true });
      }
    }
    if ((mm = p.match(/^\/api\/examples\/(\w+)\/state$/)) && m === 'POST') {
      const mt = exMeta(mm[1]); if (!mt) return send(res, 404, { error: 'Example not found' });
      const b = await readJson(req);
      for (const k of ['status', 'note', 'title', 'summary', 'card', 'stats', 'cost']) if (b[k] !== undefined) mt[k] = b[k];
      exSave(mt); return send(res, 200, { ok: true });
    }
    if ((mm = p.match(/^\/api\/examples\/(\w+)\/redo$/)) && m === 'POST') {
      const mt = exMeta(mm[1]); if (!mt) return send(res, 404, { error: 'Example not found' });
      if (mt.status === 'processing') return send(res, 409, { error: 'Already breaking it down.' });
      const b = await readJson(req); if (typeof b.note === 'string') mt.userNote = b.note.slice(0, 500);
      fs.rmSync(exFile(mt), { force: true }); digest(mt); return send(res, 200, mt);
    }
    if (p === '/kmedia' && m === 'GET') {
      const eid = url.searchParams.get('id') || '', f = url.searchParams.get('f') || '';
      if (!/^\w+$/.test(eid) || f.includes('..')) return send(res, 404, { error: 'Not found' });
      return serveFile(req, res, path.join(KMEDIA, eid, f));
    }
    // knowledge
    if (p === '/api/knowledge' && m === 'GET') return send(res, 200, Object.fromEntries(['product', 'style', 'learnings'].map(k => [k, fs.readFileSync(path.join(KNOW, k + '.md'), 'utf8')])));
    if (p === '/api/learnings' && m === 'POST') {
      const b = await readJson(req); const text = String(b.text || '').trim().replace(/\s+/g, ' '); if (!text) return send(res, 400, { error: 'Write the learning first.' });
      const file = path.join(KNOW, 'learnings.md'), cur = fs.readFileSync(file, 'utf8'), at = cur.indexOf('\n- ');
      const line = `- ${now().slice(0, 10)} · ${text}`;
      fs.writeFileSync(file, at < 0 ? cur.trimEnd() + '\n\n' + line + '\n' : cur.slice(0, at + 1) + line + '\n' + cur.slice(at + 1));
      return send(res, 201, { line });
    }
    if (p === '/media' && m === 'GET') {
      const pr = find(url.searchParams.get('p')); const f = url.searchParams.get('f') || '';
      if (!pr || f.includes('..')) return send(res, 404, { error: 'Not found' });
      const dl = url.searchParams.get('dl') ? `Polyspeech - ${pr.title} - ${f.replace(/\.mp4$/, '')}.mp4` : null;
      return serveFile(req, res, path.join(dirOf(pr), f), dl);
    }
    if (p.startsWith('/brand/')) return serveFile(req, res, path.join(ROOT, 'engine', 'kit', p.slice(1).replace(/^brand\//, 'brand/')));
    if (p === '/mascot.png') return serveFile(req, res, path.join(ROOT, 'engine', 'kit', 'mascot.png'));
    if (p === '/lucide.js') return serveFile(req, res, path.join(ROOT, 'engine', 'kit', 'lucide.min.js'));
    const file = path.join(ROOT, 'public', p === '/' || !path.extname(p) ? 'index.html' : p);
    if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, { error: 'Forbidden' });
    return serveFile(req, res, file);
  } catch (e) { console.error(e); if (res.headersSent) res.destroy(); else send(res, 500, { error: e.message }); }
});

for (const mt of exList()) if (mt.status === 'processing') { const full = exMeta(mt.id); full.status = 'failed'; full.note = 'The studio restarted while this was running. Try again.'; exSave(full); }
// a job left mid-run by a restart is marked failed so it can be resent
for (const pr of db.projects) if (pr.job && ['working', 'rendering'].includes(pr.job.state)) { pr.job = { ...pr.job, state: 'failed', note: 'The studio restarted while Claude was working. Send it again.', at: now() }; pr.status = 'revision'; }
save();
server.listen(PORT, '127.0.0.1', () => { console.log(`Polyspeech Studio running at http://127.0.0.1:${PORT}`); pump(); });
