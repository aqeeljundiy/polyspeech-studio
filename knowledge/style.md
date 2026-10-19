# Polyspeech ad style: look, pacing, build rules

## Look
- **Tokens:** paper `#FAF9F6`, ink `#12141A`, blue `#2563EB` (actions), lime `#B5F000` (fill only; lime text uses `#4D7C0F`), berry `#F04070`, amber `#B45309` / `#FBF1E2`.
- **Fonts:** Plus Jakarta Sans for everything (house rule). Noto Sans SC/KR/JP for target scripts.
- **App UI:** rebuilt from the code via `engine/kit` (kit.js + kit.css), shown inside a floating 3D phone. Icons come from Lucide, which the app itself uses.
- **Brand marks:** official App Store and Google Play badges in `engine/kit/brand/`. Never draw store logos by hand. The mascot is `engine/kit/mascot.png` (official art) or `K.mascot(mood)`.
- **Taps:** the white touch dot with a ripple (`K.tapAt`). Never the glove cursor.
- **Overlays:** dim lightly (about 22%) so screens never look greyscale.

## Pacing (the middle ground the user approved)
- No voiceover unless the request turns it on. Music plus soft UI sounds.
- One idea per beat. Captions are 7 words or fewer and stay up about 1s + 0.3s per word (never under about 2.3s on screen).
- A UI result holds about 1.5–2s before the next beat. Transitions take about 0.6s.
- Build timelines at a calm "source" pace and set `"speed": 1.3` in clip.json. The renderer samples `render(t*speed)` and divides cue times by speed.
- Reels run 40–50s at 1080×1920. YouTube ads run 30s at 1920×1080.

## Build rules (learned the hard way)
- Camera keyframes ease from the previous framing to the current one, starting at each keyframe's time (`camAt`).
- A top scrim behind captions instead of clamping the camera.
- Sheets and backdrops sit above the tab bar (z-index). Keep the screen behind a sheet visible.
- Feeds scroll inside a clipped area below a fixed header (`feedY` with element offsets).
- Never rebuild DOM containing emoji every frame. Build once, then update text nodes.
- Call `K.preloadGlyphs('…all target text…')` after building, so hidden CJK text renders on its first frame.
- `K.show()` keeps an element's own inline display. Don't set `style.display=''` by hand.
- Korean text needs `word-break: keep-all` (already in kit.css).
- Before every full render, check one still per beat at full zoom: alignment, centering, cropping, overlap, icons. Then scan the final at one frame per second.

## Timestamps in comments
Reviewers comment on the rendered video, which runs at `speed` (usually 1.3). The build timeline time is **comment time × speed**. Revision requests list both.

## Voiceover (only when the request turns it on)
- The voice sets the pace. Write the lines first, make them with engine/tts.mjs, then time every beat to the real lengths it prints. Never guess a line's length.
- One short sentence per line, plain spoken words, in English unless the brief says otherwise. Target phrases the learner says stay in the target language.
- Leave about 0.6s of silence between lines and 1s or more before a new scene. Don't stack lines back to back.
- A line takes secs × speed of build time (the clip timeline runs at the speed in clip.json). Hold its caption for at least that long, plus 0.4s.
- Captions show the same words as the line, or a shorter version of them. They change only after the line ends.
- Cue each line as { "src": "vo/<id>.mp3", "t": <build seconds>, "ss": 0, "to": <secs>, "v": 1 }. The renderer cleans up the voice and lowers the music under it.
- Keep a line's id and text when a comment doesn't ask to change it. tts.mjs reuses it at no cost.

## Footage and assets (only when the request lists them)
- Copy each file you use into the working folder's assets/ and point clip.html at it with a relative path (assets/name.png). Never link into projects/.
- Images and logos: place them like any other element. Keep their aspect ratio, never stretch them, and crop with object-fit: cover inside a rounded frame when they sit next to app UI.
- Video clips: render(t) has to show the exact frame for t, so turn each clip into frames first: node -e "require('child_process').execFileSync(require('./engine/node_modules/ffmpeg-static'), ['-i','<clip>','-vf','fps=30,scale=1080:-2','-q:v','3','<working folder>/assets/<name>/f%04d.jpg'])". Then show frame floor(seconds into the clip × 30) + 1 in an <img>. render(t) may be async: await img.decode() before returning. Use only the seconds you need.
- Sound in footage is not used. Music and UI sounds stay as they are, and a voiceover still comes from engine/tts.mjs.
- Fonts in the files: copy them into assets/ and load them with @font-face only when the brief asks for that look. Plus Jakarta Sans stays the default.
