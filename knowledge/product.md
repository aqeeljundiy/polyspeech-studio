# Polyspeech: what the app really does

Source of truth: `ai-language-tutor` on `origin/main`. The visual spec (`visual-spec.md`) lists every screen, string, colour and size taken from the code. When in doubt, read the code, not the website.

## Features ads may show
- **5 languages:** Mandarin, Korean, Japanese, Spanish, French. The UI is in English.
- **Chat (Live mode):** voice only. The tutor speaks first and every line out loud. Each turn shows the script, the reading (pinyin, romanization, romaji), the English and a play button. Word chips like "+ 咖啡 (kāfēi) — coffee" save words.
- **Feedback:** sits inside the learner's own blue bubble. "Evaluating your response...", then a lime "Nice, nothing to fix" or an amber "See correction" that opens:
  - the errors, struck through in red, each with an issue chip (e.g. "word order", "politeness"), a why and a suggestion;
  - a lime **CORRECT WAY** box with audio;
  - Save correction → Saved.
- **Need help replying? (the "?" button):** you say your reply in English and get a **SUGGESTED REPLY** in the target language, with audio. It's a literal translation.
- **Roleplay:** 100 scenarios in 10 categories. "Exchange 1 of 3 — talking to Waiter". It ends with "Scenario Complete! Goal achieved: …" and +50 XP. Roleplay feedback shows only CORRECT WAY, never an errors list.
- **Lessons:** "What should we work on today?", with Focus (Mix/Words/Phrases/Grammar) and Length (Quick ~3 min / Standard / Deep).
  - The tutor greets you out loud.
  - Cards labelled PHRASE / NEW WORD / SENTENCE with **REPEAT AFTER ME** and karaoke highlighting.
  - Answer modes: Speak / Type / Just listen, plus tutor nudges ("Ready to say the next one out loud?").
  - Verdict stamps: Got it! / Close / Try again.
  - Word sheet: tones, *Hear it slowly*, Save to Library.
  - Recap: "LESSON COMPLETE", "You nailed 3 of 3".
- **Basics path:** 21 beginner units. "Build this sentence", then "Correct! Now say it out loud."
- **Placement:** "Find your level", a spoken check. Result shows level n / 10, a descriptor, CEFR, and bars for Fluency / Grammar / Vocabulary / Pronunciation / Response Relevance, then "Apply & start talking".
- **Plans:** "New plan" → type a goal → **Plan it for me** → 4–7 steps (lessons + chats). Plus 6 templates and ready-made courses.
- **Library:** Words / Chats / Lessons, Review Cards (flip), collections, CSV/PDF export.
- **Progress:** day streak, Total XP, Exchanges, and achievements (First Steps, On a Roll, Week Warrior, Word Collector…).
- **Tutor memory:** "What your tutor knows about you". Why you're learning, About you facts, What your tutor noticed.
- **Price:** free gives 10 responses a day; Premium is unlimited, with a 7-day free trial.

## Never claim
- Real pronunciation or accent scoring. It checks what speech recognition heard.
- Karaoke "synced to the voice". It runs on a timer.
- A "Help me answer" label (the app shows a "?" button), "Great job!" cards (website mockups only), or typing in Live chat.
- That Premium gives "advanced feedback". It only means unlimited responses.
- Testimonials, user counts or ratings (the website ones are placeholders), or referrals.
- XP amounts other than the real rules: exchange +15, save +3, scenario +50, lesson +40.

## Content
The AI writes lesson and chat content live, so ads make it up following the prompt formats in `visual-spec.md` Part C. A native speaker should check target-language lines before paid use.
