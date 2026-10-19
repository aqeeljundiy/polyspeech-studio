// Makes voiceover lines with ElevenLabs for one clip.
// node engine/tts.mjs --clip <clip folder> --voice <voice id> --lines <lines.json>
// lines.json: [{ "id": "l1", "text": "..." }, ...]. Writes <clip>/vo/<id>.mp3 and <clip>/vo/lines.json
// with each line's length in seconds. A line whose text and voice haven't changed is reused, so
// revisions only pay for new lines. Key: ELEVENLABS_API_KEY, or the one saved in the studio's Settings.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import FF from 'ffmpeg-static';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const clip = path.resolve(arg('--clip') || '.'), voice = arg('--voice'), linesFile = arg('--lines');
let key = process.env.ELEVENLABS_API_KEY;
if (!key) try { key = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'data', 'settings.json'), 'utf8')).elevenlabsKey; } catch {}
if (!key) { console.error('No ElevenLabs key. Add one in the studio under Settings.'); process.exit(1); }
if (!voice || !linesFile) { console.error('Usage: node engine/tts.mjs --clip <folder> --voice <id> --lines <lines.json>'); process.exit(1); }

const lines = JSON.parse(fs.readFileSync(path.resolve(linesFile), 'utf8'));
const out = path.join(clip, 'vo'); fs.mkdirSync(out, { recursive: true });
const prevFile = path.join(out, 'lines.json');
const prev = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : [];
const secs = f => { const m = spawnSync(FF, ['-i', f], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };

const result = [];
for (const l of lines) {
  const hash = crypto.createHash('sha1').update(voice + '|' + l.text).digest('hex').slice(0, 12);
  const file = path.join(out, `${l.id}.mp3`), old = prev.find(p => p.id === l.id);
  if (old?.hash === hash && fs.existsSync(file)) { result.push(old); console.log('reused', l.id, old.secs.toFixed(2) + 's'); continue; }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: l.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) { console.error('ElevenLabs failed on', l.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  const row = { id: l.id, text: l.text, hash, src: `vo/${l.id}.mp3`, secs: +secs(file).toFixed(2) };
  result.push(row); console.log('made', l.id, row.secs + 's');
}
fs.writeFileSync(prevFile, JSON.stringify(result, null, 1));
console.log('Cue each line in clip.json as { "src": "vo/<id>.mp3", "t": <build seconds>, "ss": 0, "to": <secs>, "v": 1 }.');
