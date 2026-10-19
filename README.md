# Polyspeech Studio

A Frame.io-style review board for Polyspeech motion-graphics ads. You review and comment; Claude revises in the background and renders the next version.

**Run:** `npm start`, then open http://127.0.0.1:4430. In the Claude desktop app this is the `polyspeech-studio` launch config.

## Setup after cloning
1. Install Node.js and Google Chrome. Rendering expects Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`; change `CHROME` in `engine/render.mjs` on other systems.
2. `npm install`, then `npm --prefix engine install`, then `npm start`.
3. In the studio, open **Settings**:
   - **Claude:** paste your Anthropic API key (from console.anthropic.com). On your own PC you can leave it empty and the studio uses your signed-in Claude login instead.
   - **ElevenLabs** (optional): paste a key to make ads with voiceover.
   - **Models:** Sonnet does revisions and video cards by default, and Haiku writes upload captions. Switch to Opus for the hardest rounds.
   - **Sounds:** press **Download sounds**. The music and sound effects come from [Mixkit](https://mixkit.co). They aren't in this repo because Mixkit's free license allows using them in videos, ads included, but not sharing the files. The track is "Pop Track 03" by Lily J; the effects are listed with their Mixkit IDs in `engine/fetch-audio.mjs`. A revision also downloads any missing sounds before it starts.

Keys are saved in `data/settings.json` on your PC and are never pushed.

**Visual spec:** `knowledge/visual-spec.md` stays local and isn't in this repo. It's a detailed spec of the private Polyspeech app's screens and AI prompt formats. To recreate it, ask Claude to rebuild it from the `ai-language-tutor` code on `main`. Revisions still run without it, but app screens are more accurate with it.

## Flow
1. **Brief:** press **New ad**, then **Make v1**.
   - **Start from:** one of the three finished ads (The trip, Grandma’s language, Nobody’s listening), which Claude rewrites for your brief. They ship in `engine/templates/` as source files, not videos. **Let Claude pick** starts from the closest one.
   - **Source materials:** two drop zones that take files or whole folders. **References** are looks and ideas Claude learns from. **Footage and assets** are clips, images and logos Claude puts in the ad. They're saved in `projects/<ad>/_sources/`, listed in every request, and you can add or remove them later in the Brief tab.
   - **Voiceover:** off by default. Turn it on and pick an ElevenLabs voice: Claude writes the lines, `engine/tts.mjs` makes them, and the scenes are timed to the real line lengths. You can change it later in the Brief tab.
2. **Rendering:** Claude edits, checks stills and renders. The card shows live progress.
3. **Needs review:** leave comments. There are five types:
   - **Frame:** a single moment.
   - **Range:** from one time to another (R, then I / O to set in and out).
   - **Pin:** click a spot on the frame.
   - **Area:** drag a box on the frame.
   - **Whole video:** applies to the entire ad.

   You can draw on the frame with the pen, reply to comments, and mark any comment as a lesson.
4. **Send back to revision:** every open comment goes to Claude with its timestamp, the matching build time, its position and the marked frame. Claude renders v2, v3 and so on, and every version stays in the Versions tab with its source.
5. **Approve** moves the ad to **Ready to upload**: download the final file, draft captions with Claude, then **Mark uploaded**.

Cards move only with their step buttons (Make v1, Approve, Mark uploaded). Rendering and Revision requested are set by Claude's jobs. Right-click a card, or use its ⋯ button, to rename it, delete it, cancel a job or move an approved ad back to review.

## Video examples
In **Knowledge**, drop in an ad worth learning from. The studio pulls frames into contact sheets, measures cuts and pacing, and transcribes speech if an ElevenLabs key is saved. Claude then writes a card covering the hook, beats with timestamps, pacing, captions, motion, sound, what to borrow and what to avoid. Edit it, approve it, then pick it for an ad in the New ad form or the Brief tab. One card costs roughly 15–20 cents on Sonnet. The videos, frames and cards stay on your PC (`knowledge/_media/`, `knowledge/examples/`). Save videos as files first: YouTube links aren't supported.

## How Claude runs
`worker.mjs` uses the Claude Agent SDK. With an API key saved in Settings it runs on that key. Without one, it removes `ANTHROPIC_API_KEY` from the environment and uses the signed-in Claude login on this PC. Only one job runs at a time, and the rest wait in Revision requested. Logs go to `projects/<ad>/requests/*.log`.

Anyone you give the tool to should add their own API key: Anthropic doesn't allow tools shared with other people to run on claude.ai logins.

## Where things live
- **`engine/`:** renderer (`render.mjs`), voiceover (`tts.mjs`), UI kit rebuilt from the Polyspeech code (`kit/`), sounds (`audio/`), and starting templates (`templates/`).
- **`engine/work/<ad>/`:** each ad's current source (`clip.html` + `clip.json`).
- **`projects/<ad>/`:** renders (`vN.mp4`), the source behind each one (`vN-src/`), marked frames (`_review/`) and requests.
- **`knowledge/`:** what Claude reads every round: `product.md` (features and what never to claim), `style.md` (look, pacing, build rules), `learnings.md` and `visual-spec.md`.
