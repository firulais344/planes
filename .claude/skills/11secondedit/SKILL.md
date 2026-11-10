---
name: 11secondedit
description: One-click AI video editor. Opens a local browser app where the user uploads raw talking-head footage (plus optional b-roll), picks features and clicks Edit Video; Claude Code then edits it into a 9:16 Reel (or 16:9) — cuts bad takes, fillers and silences, places b-roll and zoom cuts, writes the hook and CTA, adds captions, music and SFX — and hands back a HyperFrames composition to review and export. Use when the user types /11secondedit or asks to edit a talking-head video into a Reel.
allowed-tools:
  - Bash(node .claude/skills/11secondedit/bin/11se.mjs *)
  - Read
  - Write
---

# 11 Second Edit

You are the editor. A local web app collects the footage and settings; you run the pipeline
step by step with the `11se` CLI and report progress to the page as you go. The user reviews
the result in the browser (transcript editing, timeline, preview) and clicks Export.

All commands run from the project root. `CLI` below means:

```bash
node .claude/skills/11secondedit/bin/11se.mjs
```

(If this skill is installed somewhere else, e.g. `~/.claude/skills/11secondedit`, use that path.)

## Rules — never break these

1. **Never modify the original video.** Uploads are copied into `.11secondedit/jobs/<id>/source/` and made read-only. Never write, re-encode in place, or delete anything in `source/` or `broll/`.
2. **Never cut mid-word.** You only choose *word indices*; `build-edl` places every cut point between words and refuses to build an edit that violates this. Never hand-edit `edl.json`, `model.json` or `composition/index.html` — they are regenerated.
3. **Keep API keys in `.env`.** Never print, echo, commit or pass keys on the command line. If a key is missing, the step degrades or skips on its own — tell the user which key to add to `.env`.
4. **Deterministic work lives in scripts.** Probing, encoding, audio, color, captions, SFX, timing maths and rendering are `run` steps. You only make the judgement calls: bad takes, ambiguous fillers, b-roll placement, zoom moments, hook text, CTA text, music prompt.

## Workflow

### 1. Start the app

```bash
node .claude/skills/11secondedit/bin/11se.mjs start
```

Tell the user the URL it prints (default http://localhost:4111) and that you are waiting for them to click **Edit Video**.

### 2. Wait for the click

```bash
node .claude/skills/11secondedit/bin/11se.mjs wait
```

It blocks up to 9 minutes. If it prints `WAITING`, run it again (do not ask the user anything in between). When the user clicks Edit Video it prints `JOB <id>`, the settings and the first command.

### 3. Run the steps in order

Every command prints `Next: …` — the exact next command. Keep following it until it says all steps finished. Steps are of three kinds:

- **script** → `CLI run <job> <step>`. Just run it.
- **claude** → `CLI context <job> <step>` prints the transcript (with `[index]` labels) and the JSON format + rules. Think, write the JSON to `.11secondedit/jobs/<job>/decisions/<step>.input.json` with the Write tool, then `CLI decide <job> <step> <that file>`. If `decide` rejects it, fix the JSON and run `decide` again.
- **claude+script** (music) → `context` + `decide` (the prompt), then `run`.

`CLI plan <job>` shows the whole checklist with statuses at any time.

### How to make the judgement calls

- **badTakes** — Read the whole transcript first. A bad take is a sentence that is restarted later ("So today I want to… wait, let me start again. Today I want to…"): cut the failed attempt *and* the meta comment ("wait, let me start again"), keep the final complete version. Cut stumbles and abandoned phrases. Never cut something said only once. Prefer whole phrases over single words.
- **fillers** — AUTO fillers (um, uh, eh…) are removed for you. For each CANDIDATE, read the context: remove it only when it carries no meaning ("I, like, don't edit" → remove; "I like pizza" → keep). Spanish crutches ("o sea", "este", "tipo", "pues", "bueno" at the start of a thought) count too.
- **broll** — Open each thumbnail path with the Read tool to see what the clip shows. Place a clip over the words it illustrates, 1.5–4 s, not during the first 2 s, no overlaps. If nothing matches, return `{"placements": []}`; a wrong b-roll is worse than none.
- **zooms** — Punch-ins on emphasis, punchlines, numbers, the "turn" of the story. About one every 4–8 s of final video, scale 1.1–1.25 for subtle, up to 1.35 for a punchline.
- **hook** — The first line on screen. ≤ 60 chars, same language as the video, creates curiosity that the video actually pays off. Don't just repeat the first sentence.
- **cta** — Short and specific to the content (e.g. "Follow for the full itinerary"), plus an optional sub line.
- **music** — Describe genre, mood, instrumentation, tempo. Always instrumental and calm enough to sit under speech.

### 4. Hand over

When the `compose` step finishes, the browser switches to the editor by itself. Tell the user, in a few lines:
- final length vs raw length and what you cut (bad takes, fillers, silences),
- where b-roll and zooms went, the hook and CTA text,
- any step that was skipped or degraded and why (e.g. missing `ELEVENLABS_API_KEY`),
- that they can delete/restore words in the transcript (Delete / R keys) — the video re-cuts instantly — and click **Export** to render the MP4 with HyperFrames (or **Open in Studio** for the full HyperFrames preview).

### If something fails

The failing step is marked red in the browser. Read the error, fix the cause if you can (e.g. install WhisperX, add a key to `.env`), then `CLI retry <job> <step>` and continue with `CLI next <job>`. If it cannot be fixed, `CLI skip <job> <step> "reason"` — only for optional features; `prepare`, `transcribe` and `compose` are required.

## Requirements

Node.js ≥ 22, FFmpeg, Python with WhisperX (`pip install whisperx`, or set `WHISPERX_PYTHON` in `.env` to a venv's python). Optional keys in `.env`: `AUPHONIC_API_KEY`, `ELEVENLABS_API_KEY`. See `README.md` in this folder.
