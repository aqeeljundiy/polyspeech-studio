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
  return `- [${c.kind}] v${c.v} @ ${where}${pos}: ${c.text}${c.snapshot ? `\n    - Frame with markup: ${path.join(dirOf(db.projects.find(x => x.id === c.project)), c.snapshot)}` : ''}${c.learn ? '\n    - Reviewer marked this as a lesson: add it to knowledge/learnings.md' : ''}${replies}`;
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
const readJson = req => new Promise((ok, bad) => { let b = ''; req.on('data', d => { b += d; if (b.length > 15e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };
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
const find = pid => db.projects.find(x => x.id === pid);

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const m = req.method; let mm;
  try {
    if (p === '/api/projects' && m === 'GET') return send(res, 200, db.projects.map(summary));
    if (p === '/api/templates' && m === 'GET') return send(res, 200, fs.readdirSync(TEMPLATES).filter(d => fs.existsSync(path.join(TEMPLATES, d, 'clip.json'))).map(d => ({ slug: d, ...JSON.parse(fs.readFileSync(path.join(TEMPLATES, d, 'clip.json'), 'utf8')), cues: undefined, music: undefined })));
    if (p === '/api/projects' && m === 'POST') {
      // new ad from a brief, optionally starting from a template's source
      const b = await readJson(req); if (!b.title) return send(res, 400, { error: 'Give the ad a title.' });
      let s = slug(b.title); while (db.projects.some(x => x.slug === s)) s += '-2';
      const pr = { id: id(), slug: s, title: b.title, persona: b.persona || '', lang: b.lang || '', format: b.format === '16:9' ? '16:9' : '9:16', brief: b.brief || '', status: 'brief', created: now(), updated: now(), activity: [], upload: {} };
      fs.mkdirSync(dirOf(pr), { recursive: true }); fs.mkdirSync(workOf(pr), { recursive: true });
      if (b.template && fs.existsSync(path.join(TEMPLATES, b.template))) for (const f of ['clip.html', 'clip.json']) fs.copyFileSync(path.join(TEMPLATES, b.template, f), path.join(workOf(pr), f));
      log(pr, 'Brief created'); db.projects.push(pr); save(); return send(res, 201, summary(pr));
    }
    if ((mm = p.match(/^\/api\/projects\/(\w+)$/))) {
      const pr = find(mm[1]); if (!pr) return send(res, 404, { error: 'Ad not found' });
      if (m === 'GET') return send(res, 200, { ...summary(pr), versions: versions(pr), comments: db.comments.filter(c => c.project === pr.id), speed: clipCfg(pr).speed || 1 });
      if (m === 'PATCH') {
        const b = await readJson(req);
        if (b.status && STATUSES.includes(b.status) && b.status !== pr.status) { log(pr, `Moved to ${b.status}`); pr.status = b.status; if (b.status === 'uploaded') pr.uploadedAt = now(); }
        for (const k of ['title', 'brief', 'persona', 'lang']) if (typeof b[k] === 'string' && b[k] !== pr[k]) { pr[k] = b[k]; if (k === 'brief') log(pr, 'Brief updated'); }
        if (b.upload && typeof b.upload === 'object') pr.upload = { ...(pr.upload || {}), ...b.upload };
        save(); return send(res, 200, summary(pr));
      }
      if (m === 'DELETE') { db.projects = db.projects.filter(x => x !== pr); db.comments = db.comments.filter(c => c.project !== pr.id); save(); return send(res, 200, { ok: true }); }
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

// a job left mid-run by a restart is marked failed so it can be resent
for (const pr of db.projects) if (pr.job && ['working', 'rendering'].includes(pr.job.state)) { pr.job = { ...pr.job, state: 'failed', note: 'The studio restarted while Claude was working. Send it again.', at: now() }; pr.status = 'revision'; }
save();
server.listen(PORT, '127.0.0.1', () => { console.log(`Polyspeech Studio running at http://127.0.0.1:${PORT}`); pump(); });
