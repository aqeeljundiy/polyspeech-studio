# Polyspeech ad style: look, pacing, build rules

## Look
- **Tokens:** paper `#FAF9F6`, ink `#12141A`, blue `#2563EB` (actions), lime `#B5F000` (fill only; lime text uses `#4D7C0F`), berry `#F04070`, amber `#B45309` / `#FBF1E2`.
- **Fonts:** Plus Jakarta Sans for everything (house rule). Noto Sans SC/KR/JP for target scripts.
- **App UI:** rebuilt from the code via `engine/kit` (kit.js + kit.css), shown inside a floating 3D phone. Icons come from Lucide, which the app itself uses.
- **Brand marks:** official App Store and Google Play badges in `engine/kit/brand/`. Never draw store logos by hand. The mascot is `engine/kit/mascot.png` (official art) or `K.mascot(mood)`.
- **Taps:** the white touch dot with a ripple (`K.tapAt`). Never the glove cursor.
- **Overlays:** dim lightly (about 22%) so screens never look greyscale.

## Pacing (the middle ground the user approved)
- No voiceover. Music plus soft UI sounds.
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
