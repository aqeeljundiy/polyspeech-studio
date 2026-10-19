// Renders a clip.html frame by frame in headless Chrome, then encodes (and mixes audio) with ffmpeg.
// node render.mjs --clip work/<slug> [--outfile <path.mp4>] [--stills 0.5,1.6,...] [--frames-only]
// Polyspeech Studio copy: writes <clip>/progress.json while rendering so the studio can show live progress.
// A clip folder holds clip.html and optional clip.json: { dur, w, h, out, music?, cues? }.
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import FF from 'ffmpeg-static';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// --clip may be relative to the current folder (how the studio passes it) or to engine/
const clipArg = arg('--clip', '.');
const CLIP = fs.existsSync(path.resolve(clipArg)) ? path.resolve(clipArg) : path.resolve(DIR, clipArg);
const cfg = fs.existsSync(path.join(CLIP, 'clip.json')) ? JSON.parse(fs.readFileSync(path.join(CLIP, 'clip.json'), 'utf8')) : {};
// speed > 1 plays the clip's timeline faster: frames sample render(t*SPEED), cue times divide by SPEED.
const SPEED = cfg.speed || 1;
const FPS = 30, DUR = (cfg.dur || 7) / SPEED, W = cfg.w || 1080, H = cfg.h || 1920, NF = Math.round(FPS * DUR);
const OUTD = path.join(DIR, 'out');
const FR = path.join(CLIP, 'frames');
const NAME = arg('--out', cfg.out || 'lumen-test-v1');
const STILLS = arg('--stills') ? arg('--stills').split(',').map(Number) : null;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = 'file:///' + path.join(CLIP, 'clip.html').replace(/\\/g, '/');

async function open() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 180000, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--allow-file-access-from-files'] });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  return { browser, page, cdp: await page.createCDPSession() };
}
const shot = async (cdp, file) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, fromSurface: true });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
};

fs.mkdirSync(OUTD, { recursive: true });
if (STILLS) {
  const { browser, page, cdp } = await open();
  for (const t of STILLS) { await page.evaluate(t => window.render(t), t); await shot(cdp, path.join(OUTD, `still_${t.toFixed(2)}.jpg`)); }
  await browser.close();
  console.log('stills', STILLS.join(', '));
  process.exit(0);
}

if (!process.argv.includes('--audio-only')) {
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const WORKERS = 4, per = Math.ceil(NF / WORKERS), t0 = Date.now();
  let done = 0; const PROG = path.join(CLIP, 'progress.json');
  const progress = (phase, pct) => { try { fs.writeFileSync(PROG, JSON.stringify({ phase, pct: Math.round(pct), at: Date.now() })); } catch {} };
  progress('frames', 0);
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    await new Promise(r => setTimeout(r, w * 800));
    const { browser, page, cdp } = await open();
    // warm-up: lay out this worker's first frame once so late-painting glyphs (emoji) are ready
    await page.evaluate(t => window.render(t), (w * per) / FPS * SPEED); await new Promise(res => setTimeout(res, 150));
    for (let f = w * per; f < Math.min(NF, (w + 1) * per); f++) {
      await page.evaluate(t => window.render(t), f / FPS * SPEED);
      await shot(cdp, path.join(FR, `f${String(f).padStart(5, '0')}.jpg`));
      if (++done % 15 === 0) progress('frames', done / NF * 90);
    }
    await browser.close();
  }));
  console.log('frames', NF, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
if (process.argv.includes('--frames-only')) process.exit(0);

// ---- audio: music bed + SFX cues ----
const inputs = ['-framerate', String(FPS), '-i', path.join(FR, 'f%05d.jpg')];
let fc = '', idx = 1, mix = [];
const AUD = path.join(DIR, 'audio');
if (cfg.music) {
  const m = cfg.music; // { file, offset, vol, muffleUntil, fadeOut }
  inputs.push('-ss', String(m.offset || 0), '-t', String(DUR + 0.5), '-i', path.join(AUD, m.file));
  if (m.muffle) { // muffle: [from, to] — lowpassed and quieter only inside that window
    const [a, b] = m.muffle.map(x => x / SPEED), w = `between(t,${a.toFixed(2)},${b.toFixed(2)})`, fo = m.fadeOut || 1.2;
    fc += `[${idx}:a]aresample=48000,atrim=0:${DUR},asetpts=PTS-STARTPTS,asplit=2[mF][mL];`;
    fc += `[mF]volume='${m.vol ?? 0.5}*(1-${w})':eval=frame[mF2];[mL]lowpass=f=550,volume='${m.muffleVol ?? 0.35}*${w}':eval=frame[mL2];`;
    fc += `[mF2][mL2]amix=inputs=2:normalize=0,afade=t=out:st=${(DUR - fo).toFixed(2)}:d=${fo}[mus];`; idx++;
  } else {
  const mu = (m.muffleUntil || 0) / SPEED;
  fc += `[${idx}:a]aresample=48000,asplit=2[mA][mB];`;
  fc += `[mA]atrim=0:${mu + 0.15},asetpts=PTS-STARTPTS,lowpass=f=550,volume=${m.muffleVol ?? 0.35},afade=t=out:st=${mu}:d=0.15[mA2];`;
  fc += `[mB]atrim=${mu}:${DUR},asetpts=PTS-STARTPTS,volume=${m.vol ?? 0.5},afade=t=in:d=0.05,afade=t=out:st=${(DUR - mu - (m.fadeOut || 1.2)).toFixed(2)}:d=${m.fadeOut || 1.2},adelay=${Math.round(mu * 1000)}|${Math.round(mu * 1000)}[mB2];`;
  fc += `[mA2][mB2]amix=inputs=2:normalize=0[mus];`; idx++;
  }
}
// Cues: SFX from the shared audio folder ({f}), or voice clips cut from a take in the clip folder
// ({src, ss, to}); voice cues duck the music.
const voices = [];
(cfg.cues || []).forEach((c, k) => {
  inputs.push('-i', c.src ? path.join(CLIP, c.src) : path.join(AUD, c.f + '.mp3'));
  const ms = Math.max(0, Math.round(c.t / SPEED * 1000));
  const trim = c.src ? `,atrim=${c.ss || 0}:${c.to},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, c.to - (c.ss || 0) - 0.06).toFixed(3)}:d=0.06`
    : c.dur ? `,atrim=0:${c.dur},afade=t=out:st=${Math.max(0, c.dur - 0.2)}:d=0.2` : '';
  fc += `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo${trim},volume=${c.v ?? 0.6},adelay=${ms}|${ms}[s${k}];`;
  (c.src ? voices : mix).push(`[s${k}]`); idx++;
});
if (voices.length) {
  // Voice clarity: cut rumble, lift presence, even out levels, then duck the music hard under it.
  const vg = cfg.voice?.gain ?? 1;
  fc += `${voices.join('')}amix=inputs=${voices.length}:normalize=0,highpass=f=90,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,acompressor=threshold=0.08:ratio=3:attack=4:release=90:makeup=1.4,volume=${vg},asplit=2[vbus][vsc];`;
  if (cfg.music) fc += `[mus][vsc]sidechaincompress=threshold=0.008:ratio=14:attack=10:release=550:makeup=1[duck];`;
  else fc += `[vsc]anullsink;`;
  mix.push('[vbus]');
  if (cfg.music) mix.push('[duck]');
} else if (cfg.music) mix.push('[mus]');
let maps = ['-map', '0:v'];
if (mix.length) {
  // Two-pass loudness: measure the raw mix, then normalise linearly so quiet moments stay quiet.
  const base = `${fc}${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,atrim=0:${DUR}`;
  const gfile = path.join(CLIP, 'graph.txt');
  // The measuring pass reads audio inputs only, so input indexes shift down by one (no frame sequence).
  const ain = inputs.slice(4);
  fs.writeFileSync(gfile, `${base},loudnorm=I=-14:TP=-2:LRA=11:print_format=json[aout]`.replace(/\[(\d+):a\]/g, (_, n) => `[${n - 1}:a]`));
  const res = spawnSync(FF, ['-hide_banner', '-y', ...ain, '-filter_complex_script', gfile, '-map', '[aout]', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const j = JSON.parse(res.slice(res.lastIndexOf('{'), res.lastIndexOf('}') + 1));
  fs.writeFileSync(gfile, `${base},loudnorm=I=-14:TP=-2:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,alimiter=limit=0.8:level=false[aout]`);
  inputs.push('-filter_complex_script', gfile);
  maps.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
}const OUT = arg('--outfile') ? path.resolve(arg('--outfile')) : path.join(OUTD, NAME + '.mp4');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
try { fs.writeFileSync(path.join(CLIP, 'progress.json'), JSON.stringify({ phase: 'encode', pct: 92, at: Date.now() })); } catch {}
execFileSync(FF, ['-v', 'error', '-y', ...inputs, ...maps, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', String(DUR), '-movflags', '+faststart', OUT], { stdio: 'inherit' });
try { fs.writeFileSync(path.join(CLIP, 'progress.json'), JSON.stringify({ phase: 'done', pct: 100, out: OUT, at: Date.now() })); } catch {}
console.log('done', OUT);
