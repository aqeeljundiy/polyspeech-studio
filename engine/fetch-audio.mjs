// Downloads the music and sound effects the ads use from Mixkit into engine/audio/.
// They aren't in the repo: Mixkit's free license allows using them in videos (including ads),
// but not redistributing the files. Run: node engine/fetch-audio.mjs
import fs from 'fs';
import path from 'path';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'audio');
const MUSIC = { music_pop_track_03: 729 }; // "Pop Track 03" by Lily J
const SFX = {
  boing: 2894, bubble_click: 1124, bubble_pop: 2357, click_select: 1109, click_ui: 2568, coin: 216,
  correct_reward: 952, correct_tone: 2870, fairy_sparkle: 869, hard_pop: 2364, heartbeat_fast: 493,
  heartbeat_slow: 494, message_pop: 2354, riser_magic: 2638, sparkle: 2350, stutter: 787,
  sweep_small: 166, whoosh_cine: 1492, whoosh_fast: 1490, win: 269,
};
const jobs = [
  ...Object.entries(MUSIC).map(([n, id]) => [n, `https://assets.mixkit.co/music/${id}/${id}.mp3`]),
  ...Object.entries(SFX).map(([n, id]) => [n, `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`]),
];
fs.mkdirSync(DIR, { recursive: true });
for (const [name, url] of jobs) {
  const file = path.join(DIR, name + '.mp3');
  if (fs.existsSync(file)) { console.log('have', name); continue; }
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) { console.error('failed', name, r.status); continue; }
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log('got', name);
}
