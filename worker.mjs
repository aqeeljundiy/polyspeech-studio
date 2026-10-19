// Runs Claude in the background (Claude Agent SDK) for one revision request, reporting back to the studio.
// node worker.mjs <projectId> <requestFile> <nextVersion> <port>
// Uses the signed-in Claude account: ANTHROPIC_API_KEY is removed from the environment so the
// subscription login is used instead of an API key.
import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const env = () => {
  const e = { ...process.env }; delete e.ANTHROPIC_API_KEY;
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (process.platform === 'win32' && !e.CLAUDE_CODE_GIT_BASH_PATH && fs.existsSync(gitBash)) e.CLAUDE_CODE_GIT_BASH_PATH = gitBash;
  return e;
};

// Short, tool-free call used by the upload step.
export async function captions(pr, product) {
  const prompt = `Write upload copy for this Polyspeech ad. Facts must come only from the product notes.
Ad: "${pr.title}" · persona: ${pr.persona} · language: ${pr.lang} · format: ${pr.format}
Brief: ${pr.brief}

Product notes:
${product}

Return JSON only, no markdown: {"reelsCaption": "Instagram Reels caption, 1-3 short lines, a hook first, max 2 emoji, then 4-6 hashtags on the last line", "youtubeTitle": "under 70 characters", "youtubeDescription": "2-3 short sentences plus a call to action"}`;
  let text = '';
  for await (const msg of query({ prompt, options: { cwd: ROOT, allowedTools: [], permissionMode: 'dontAsk', maxTurns: 1, env: env() } })) {
    if (msg.type === 'result' && msg.subtype === 'success') text = msg.result;
  }
  const j = text.match(/\{[\s\S]*\}/); if (!j) throw new Error('Claude didn’t return captions. Try again.');
  return JSON.parse(j[0]);
}

async function main() {
  const [pid, reqFile, next, port] = process.argv.slice(2);
  const post = async body => { try { await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/job`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch {} };
  const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
  const prompt = `You are the editor in Polyspeech Studio. Do one revision round on a Polyspeech motion-graphics ad, end to end, without asking questions.

1. Read the request: ${rel(reqFile)}. It names the working source (clip.html + clip.json), the output file and every open review comment. Comments marked [pin] or [area] give a position on the frame; open every "Frame with markup" image with Read to see exactly what the reviewer means. Timestamps are video time; the request also gives build time (video time × speed), which is what clip.html uses.
2. Read knowledge/style.md, knowledge/product.md and knowledge/learnings.md and follow them. When you rebuild app UI, take it from knowledge/visual-spec.md and engine/kit (kit.js, kit.css). Never claim anything listed under "Never claim".
3. Edit only that project's clip.html and clip.json (and engine/kit only if a fix belongs in the shared kit). Address every open comment; if one can't be done, say why in your summary.
   If the working folder has no clip.html yet (a brand-new brief asking for v1), build one from the brief: copy the closest ad in engine/templates/ as a starting point and rewrite its story, screens, captions and cues for this brief. Match the request's format: 9:16 is 1080×1920, 16:9 is 1920×1080 (set w and h in clip.json and lay the scene out for landscape: phone or desktop UI on one side, captions on the other).
4. Check your work before the full render: node engine/render.mjs --clip <working source folder> --stills <times in build seconds> writes engine/out/still_<t>.jpg. Look at one still per changed beat at full size (alignment, centering, cropping, overlap, readable text). Fix and re-check.
5. Render the full video with the exact render command from the request (it writes the output file and engine shows progress to the studio). Then copy clip.html and clip.json into the vN-src folder named in the request.
6. For each comment marked as a lesson, add one short line to the top of the list in knowledge/learnings.md ("- YYYY-MM-DD · lesson").
7. Finish with a 2-3 sentence plain summary of what changed in this version, for the reviewer.`;

  await post({ state: 'working', note: 'Claude is reading your comments' });
  let final = null, rendering = false;
  try {
    for await (const msg of query({ prompt, options: {
      cwd: ROOT,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'You run unattended inside Polyspeech Studio. Work only inside this folder. Keep the final message short.' },
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
      permissionMode: 'dontAsk',
      env: env(),
    } })) {
      if (msg.type === 'assistant') {
        for (const b of msg.message.content) {
          if (b.type === 'text' && b.text.trim()) console.log('[claude]', b.text.trim());
          if (b.type === 'tool_use') {
            const cmd = b.input?.command || b.input?.file_path || b.input?.pattern || '';
            console.log('[tool]', b.name, String(cmd).slice(0, 200));
            if (b.name === 'Bash' && /render\.mjs/.test(cmd) && !/--stills/.test(cmd) && !rendering) { rendering = true; await post({ state: 'rendering', note: `Rendering v${next}` }); }
            else if (b.name === 'Bash' && /--stills/.test(cmd)) await post({ state: 'working', note: 'Checking stills before rendering' });
            else if (b.name === 'Edit' || b.name === 'Write') await post({ state: 'working', note: 'Editing the ad' });
          }
        }
      } else if (msg.type === 'result') final = msg;
    }
  } catch (e) { console.error('[error]', e.message); await post({ state: 'failed', note: `Claude hit an error: ${e.message.slice(0, 160)}` }); process.exit(1); }
  const out = path.join(path.dirname(path.dirname(reqFile)), `v${next}.mp4`);
  console.log('[result]', final?.subtype, final?.total_cost_usd != null ? `~$${final.total_cost_usd.toFixed(2)}` : '');
  if (final?.subtype === 'success' && fs.existsSync(out)) await post({ state: 'ready', note: 'New version ready for review', summary: (final.result || '').slice(0, 600) });
  else await post({ state: 'failed', note: fs.existsSync(out) ? 'Claude stopped early. Check the log.' : `Claude finished without rendering v${next}. Check the log.` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) main();
