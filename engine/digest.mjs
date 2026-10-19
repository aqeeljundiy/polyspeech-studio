// Turns a reference video into a knowledge card Claude can use.
// node engine/digest.mjs <exampleId> <port>
// 1. contact sheets (frames in a 4×3 grid), scene cuts and pacing numbers with ffmpeg
// 2. a timestamped transcript with ElevenLabs speech to text, when a key is saved
// 3. Claude reads all of it and writes the card, which waits as a draft until approved in Knowledge
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import FF from 'ffmpeg-static';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env, models, ROOT } from '../worker.mjs';

const [id, port] = process.argv.slice(2);
const DIR = path.join(ROOT, 'knowledge', '_media', id);
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
const VIDEO = path.join(DIR, meta.file);
const post = async body => { try { await fetch(`http://127.0.0.1:${port}/api/examples/${id}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch {} };
const ff = args => spawnSync(FF, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64e6 });
const ts = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

try {
  await post({ status: 'processing', note: 'Breaking the video down' });
  // duration and size
  const info = ff(['-i', VIDEO]).stderr;
  const dm = info.match(/Duration: (\d+):(\d+):([\d.]+)/); if (!dm) throw new Error('That file doesn’t look like a video ffmpeg can read.');
  const dur = +dm[1] * 3600 + +dm[2] * 60 + +dm[3];
  const sz = info.match(/Video:.*?(\d{2,5})x(\d{2,5})/); const [w, h] = sz ? [+sz[1], +sz[2]] : [1080, 1920];
  const hasAudio = /Audio:/.test(info);
  // scene cuts → pacing
  // hard cuts first; motion graphics change scenes with animated transitions, so fall back to a softer
  // threshold when there are few hard cuts, and merge changes closer than 0.4s
  const scenes = th => [...ff(['-i', VIDEO, '-filter:v', `select='gt(scene,${th})',showinfo`, '-f', 'null', '-']).stderr.matchAll(/pts_time:([\d.]+)/g)]
    .map(m => +(+m[1]).toFixed(2)).filter((t, i, a) => !i || t - a[i - 1] >= 0.4);
  let cuts = scenes(0.3), cutKind = 'hard cuts';
  if (cuts.length < dur / 8) { cuts = scenes(0.1); cutKind = 'scene changes (animated transitions included)'; }
  const shots = [0, ...cuts, dur].map((t, i, a) => i ? t - a[i - 1] : null).filter(x => x != null && x > 0.05);
  const avgShot = shots.length ? shots.reduce((a, b) => a + b, 0) / shots.length : dur;
  // contact sheets: one frame every `step` seconds, 12 per sheet, at most ~12 sheets
  const step = Math.max(1, Math.ceil(dur / 144));
  const sheets = path.join(DIR, 'sheets'); fs.rmSync(sheets, { recursive: true, force: true }); fs.mkdirSync(sheets);
  const tw = w >= h ? 400 : 300;
  ff(['-i', VIDEO, '-vf', `fps=1/${step},scale=${tw}:-2,tile=4x3:padding=6:margin=6:color=white`, '-q:v', '4', path.join(sheets, 's%02d.jpg')]);
  ff(['-y', '-ss', String(Math.min(dur * 0.25, 8).toFixed(2)), '-i', VIDEO, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', path.join(DIR, 'thumb.jpg')]);
  const sheetFiles = fs.readdirSync(sheets).filter(f => f.endsWith('.jpg')).sort();
  if (!sheetFiles.length) throw new Error('Couldn’t pull frames from the video.');
  // transcript (optional)
  let transcript = '';
  const key = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8')).elevenlabsKey; } catch { return null; } })();
  if (hasAudio && key) {
    await post({ status: 'processing', note: 'Writing down what’s said' });
    const audio = path.join(DIR, 'audio.mp3');
    ff(['-y', '-i', VIDEO, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
    if (fs.existsSync(audio)) {
      const fd = new FormData(); fd.append('model_id', 'scribe_v1'); fd.append('file', new Blob([fs.readFileSync(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
      const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
      if (r.ok) {
        const j = await r.json(); const lines = []; let curr = null;
        for (const wd of (j.words || []).filter(x => x.type !== 'spacing')) {
          if (!curr || wd.start - curr.end > 0.8) { curr && lines.push(curr); curr = { start: wd.start, end: wd.end, text: '' }; }
          curr.text += (curr.text && wd.type === 'word' ? ' ' : '') + wd.text; curr.end = wd.end;
          if (/[.?!。？！]$/.test(wd.text)) { lines.push(curr); curr = null; }
        }
        curr && lines.push(curr);
        transcript = lines.map(l => `[${ts(l.start)}] ${l.text.trim()}`).join('\n') || (j.text || '').trim();
      } else console.error('speech to text failed', r.status, (await r.text()).slice(0, 200));
    }
  }
  if (transcript) fs.writeFileSync(path.join(DIR, 'transcript.txt'), transcript);
  const stats = { secs: +dur.toFixed(1), w, h, cuts: cuts.length, cutKind, avgShot: +avgShot.toFixed(2), step, sheets: sheetFiles.length, transcript: !!transcript };
  fs.writeFileSync(path.join(DIR, 'data.json'), JSON.stringify({ ...stats, cutTimes: cuts }, null, 1));
  await post({ status: 'processing', note: 'Claude is writing the card', stats });

  // Claude writes the card
  const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
  const prompt = `You are building a knowledge card from a reference video for Polyspeech ad production (motion-graphics ads for a language-learning app). Describe what the video does so future ads can learn from it.

Files (open every one with Read):
${sheetFiles.map((f, i) => `- ${rel(path.join(sheets, f))}: contact sheet ${i + 1}. 12 frames in a 4×3 grid, read left to right, top to bottom. Frame k (0-11) is at ${step === 1 ? '' : `${step} × `}(${i * 12} + k) seconds.`).join('\n')}
- ${rel(path.join(DIR, 'data.json'))}: duration ${stats.secs}s, ${w}×${h}, ${cuts.length} ${cutKind}, average shot ${stats.avgShot}s, cut times in seconds.
${transcript ? `- ${rel(path.join(DIR, 'transcript.txt'))}: what's said, with timestamps.` : '- No transcript (no speech found, or no ElevenLabs key).'}
${meta.userNote ? `\nThe reviewer's note about this video: ${meta.userNote}\n` : ''}
Return JSON only, no markdown fence: {"title": "short name for the video, max 6 words", "summary": "one line on why it works", "card": "the card in markdown"}.
The card has these sections, short and specific, with timestamps:
## Hook (first 3 seconds)
## Beats (one line each: time · what's on screen · text or voice)
## Pacing (average shot, cuts per 10 seconds, where it holds still and for how long)
## Text and captions (size, position, how long each stays, animation)
## Motion and transitions
## Sound (music, effects, voice; only what the transcript or visuals show)
## Borrow for Polyspeech (3-5 bullets, translated into the Polyspeech style: real app screens, Plus Jakarta Sans, readable pacing)
## Avoid (what wouldn't fit Polyspeech or its rules)
Describe only what you can see or read. Don't guess product claims, numbers or brand names you can't read.`;
  let out = '', cost = null;
  for await (const msg of query({ prompt, options: { cwd: ROOT, model: models().revision, allowedTools: ['Read'], permissionMode: 'dontAsk', maxTurns: sheetFiles.length + 6, env: env() } })) {
    if (msg.type === 'result') { if (msg.subtype !== 'success') throw new Error('Claude stopped before finishing the card.'); out = msg.result; cost = msg.total_cost_usd; }
  }
  const j = out.match(/\{[\s\S]*\}/); if (!j) throw new Error('Claude didn’t return a card. Try again.');
  const card = JSON.parse(j[0]);
  console.log('[result] card written', cost != null ? `~$${cost.toFixed(2)}` : '');
  await post({ status: 'draft', note: 'Ready for your review', title: card.title, summary: card.summary, card: card.card, stats, cost });
} catch (e) {
  console.error('[error]', e.message);
  await post({ status: 'failed', note: e.message.slice(0, 200) });
  process.exit(1);
}
