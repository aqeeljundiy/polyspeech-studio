// One-time import of the first three Reels as projects at v1 (run with the studio stopped).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const OLD = path.join(ROOT, '..', 'pnp-studio', 'styles', 'saas-mograph', 'out');
const DB = path.join(ROOT, 'data', 'db.json');
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { projects: [], comments: [] };
const now = new Date().toISOString();
const ADS = [
  { slug: 'the-trip', tpl: 'a-trip', file: 'polyspeech-A-the-trip.mp4', title: 'The trip', persona: 'Traveler with a deadline', lang: 'Mandarin', brief: 'Maya flies to Shanghai in 14 days and can’t order dinner. Plans → lesson → word sheet → roleplay with "Need help replying?" → correction → dinner ordered. No voiceover, paced to read.' },
  { slug: 'grandmas-language', tpl: 'b-grandma', file: 'polyspeech-B-grandma.mp4', title: 'Grandma’s language', persona: 'Korean heritage learner', lang: 'Korean', brief: 'He understands grandma but answers in English. Live chat (tutor talks first) → say it in English → politeness correction → tutor memory → the Sunday call in Korean.' },
  { slug: 'nobody-listening', tpl: 'c-shy', file: 'polyspeech-C-nobody-listening.mp4', title: 'Nobody’s listening', persona: 'Shy learner', lang: 'Spanish', brief: 'Too shy to speak in class, practises at 1:12 AM. Find your level → Just listen → Type → Speak → recap → Week Warrior. Night palette.' },
];
for (const a of ADS) {
  if (db.projects.some(p => p.slug === a.slug)) continue;
  const dir = path.join(ROOT, 'projects', a.slug), work = path.join(ROOT, 'engine', 'work', a.slug), src = path.join(dir, 'v1-src');
  for (const d of [dir, work, src]) fs.mkdirSync(d, { recursive: true });
  for (const f of ['clip.html', 'clip.json']) { fs.copyFileSync(path.join(ROOT, 'engine', 'templates', a.tpl, f), path.join(work, f)); fs.copyFileSync(path.join(ROOT, 'engine', 'templates', a.tpl, f), path.join(src, f)); }
  fs.copyFileSync(path.join(OLD, a.file), path.join(dir, 'v1.mp4'));
  db.projects.push({ id: crypto.randomBytes(6).toString('hex'), slug: a.slug, title: a.title, persona: a.persona, lang: a.lang, format: '9:16', brief: a.brief, status: 'review', created: now, updated: now,
    versionMeta: { 1: { at: now, note: 'First cut: no voiceover, 1.3× pacing, components checked at zoom.', speed: 1.3 } }, upload: {}, activity: [{ at: now, text: 'Imported v1' }] });
  console.log('imported', a.title);
}
fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.writeFileSync(DB, JSON.stringify(db, null, 2));
