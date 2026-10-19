# Polyspeech Studio

A Frame.io-style review board for Polyspeech motion-graphics ads. You review and comment; Claude revises in the background and renders the next version.

**Run:** `npm start`, then open http://127.0.0.1:4430. In the Claude desktop app this is the `polyspeech-studio` launch config.

## Setup after cloning
1. `npm install`, then `npm --prefix engine install`.
2. `node engine/fetch-audio.mjs` downloads the music and sound effects from [Mixkit](https://mixkit.co) into `engine/audio/`.
   - They aren't in this repo because Mixkit's free license allows using them in your videos, ads included, but not redistributing the files.
   - The track is "Pop Track 03" by Lily J. The effects are listed with their Mixkit IDs in the script.
3. Rendering needs Google Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Change `CHROME` in `engine/render.mjs` on other systems.
4. Sign in to Claude (Claude desktop app or Claude Code) so background revisions can run.

**Visual spec:** `knowledge/visual-spec.md` stays local and isn't in this repo. It's a detailed spec of the private Polyspeech app's screens and AI prompt formats. To recreate it, ask Claude to rebuild it from the `ai-language-tutor` code on `main`. Revisions still run without it, but app screens are more accurate with it.

## Flow
1. **Brief:** press New ad, then **Make v1 with Claude**.
2. **Rendering:** Claude edits, checks stills and renders. The card shows live progress.
3. **Needs review:** leave comments. There are five types:
   - **Frame:** a single moment.
   - **Range:** from one time to another (R, then I / O to set in and out).
   - **Pin:** click a spot on the frame.
   - **Area:** drag a box on the frame.
   - **Whole video:** applies to the entire ad.

   You can draw on the frame with the pen, arrow or box, reply to comments, and mark any comment as a lesson.
4. **Send back to revision:** every open comment goes to Claude with its timestamp, the matching build time, its position and the marked frame. Claude renders v2, v3 and so on, and every version stays in the Versions tab with its source.
5. **Approve** moves the ad to **Ready to upload**: download the final file, draft captions with Claude, then **Mark uploaded**.

## How Claude runs
`worker.mjs` uses the Claude Agent SDK with your signed-in Claude account. The `ANTHROPIC_API_KEY` env variable is removed, so no API key is used. Only one job runs at a time, and the rest wait in Revision requested. Logs go to `projects/<ad>/requests/*.log`.

This is a personal tool on this machine. If it's ever shared with other people, switch it to an API key: Anthropic doesn't allow third-party products to offer claude.ai login.

## Where things live
- **`engine/`:** renderer (`render.mjs`), UI kit rebuilt from the Polyspeech code (`kit/`), sounds (`audio/`), and starting templates (`templates/`).
- **`engine/work/<ad>/`:** each ad's current source (`clip.html` + `clip.json`).
- **`projects/<ad>/`:** renders (`vN.mp4`), the source behind each one (`vN-src/`), marked frames (`_review/`) and requests.
- **`knowledge/`:** what Claude reads every round: `product.md` (features and what never to claim), `style.md` (look, pacing, build rules), `learnings.md` and `visual-spec.md`.
