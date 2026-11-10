---
name: 11secondedit
description: One-click AI video editor. Opens a local browser app where the user uploads raw talking-head footage plus images or b-roll, picks one of three styles (Collage, Word + meme, Cinematic) and clicks Edit Video; Claude Code then edits it into a Reel — cuts bad takes, fillers and silences, places every image or b-roll shot on the word it illustrates, writes the hook, adds captions, music and loudness — and hands back a HyperFrames composition to review and export. Use when the user types /11secondedit or asks to edit a talking-head video into a Reel.
allowed-tools:
  - Bash(node .claude/skills/11secondedit/bin/11se.mjs *)
  - Bash(node ~/.claude/skills/11secondedit/bin/11se.mjs *)
  - Read
  - Write
---

# 11 Second Edit

You are the editor. A local web app collects the footage and settings; you run the pipeline
step by step with the `11se` CLI and report progress to the page as you go. The user reviews
the result in the browser (transcript editing, timeline, preview) and clicks Export.

All commands run from the project root. `CLI` below means the skill's CLI:

- `node .claude/skills/11secondedit/bin/11se.mjs` if that file exists in the project, otherwise
- `node ~/.claude/skills/11secondedit/bin/11se.mjs` (skill installed globally).

Check once which one exists, then use that same prefix for every command, including the ones printed after `Next:`.

## Rules — never break these

1. **Never modify the original video.** Uploads are copied into `.11secondedit/jobs/<id>/source/` and made read-only. Never write, re-encode in place, or delete anything in `source/` or `broll/`.
2. **Never cut mid-word.** You only choose *word indices*; `build-edl` places every cut point between words and refuses to build an edit that violates this. Never hand-edit `edl.json`, `model.json` or `composition/index.html` — they are regenerated.
3. **Keep API keys in `.env`.** Never print, echo, commit or pass keys on the command line. If a key is missing, the step degrades or skips on its own — tell the user which key to add to `.env`.
4. **Deterministic work lives in scripts.** Probing, encoding, audio, color, captions, layout, timing maths, loudness and rendering are `run` steps. You only make the judgement calls: bad takes, ambiguous fillers, which image or shot goes on which word, hook text, CTA text, music prompt.
5. **Never mix styles and never add effects.** No zooms, no animated text, no outlines, no emojis — even if it seems like it would help.

## Workflow

### 1. Start the app

```bash
CLI start
```

Tell the user the URL it prints (default http://localhost:4111) and that you are waiting for them to click **Edit Video**.

### 2. Wait for the click

```bash
CLI wait
```

It blocks up to 9 minutes. If it prints `WAITING`, run it again (do not ask the user anything in between). When the user clicks Edit Video it prints `JOB <id>`, the settings and the first command.

### 3. Run the steps in order

Every command prints `Next: …` — the exact next command. Keep following it until it says all steps finished. Steps are of three kinds:

- **script** → `CLI run <job> <step>`. Just run it.
- **claude** → `CLI context <job> <step>` prints the transcript (with `[index]` labels) and the JSON format + rules. Think, write the JSON to `.11secondedit/jobs/<job>/decisions/<step>.input.json` with the Write tool, then `CLI decide <job> <step> <that file>`. If `decide` rejects it, fix the JSON and run `decide` again.
- **claude+script** (music) → `context` + `decide` (the prompt), then `run`.

`CLI plan <job>` shows the whole checklist with statuses at any time.

### The three styles

The user picks one on the page; `wait` prints it. Each style is a fixed look measured from a reference video — you never choose fonts, sizes or positions, only **which image/shot goes on which word**. One rule is common to all three and is what makes them look expensive:

> **Nothing animates in.** Text and images appear and disappear on a hard cut, in sync with the spoken word. No zooms, no bounces, no outlined or coloured captions. The rhythm comes from constant change, not from effects.

| Style | What it is | What you decide in `visuals` |
|---|---|---|
| **Collage** (`collage`) | Talking head; small light captions at chest height; 1–3 images piled in the lower third; an occasional wide still above the head | `groups` of images (one group per idea, each image anchored to a word) + `top` stills |
| **Word + meme** (`wordmeme`) | Talking head; 1–2 bold lowercase words; one square image under them, swapped every 1–2.5 s; orange title hook in the first second | `images` (one at a time, contiguous word ranges) + the `hook` |
| **Cinematic** (`cinematic`) | B-roll over ~80 % of the video with one big word in the centre; small italics when the speaker is on camera; word-by-word bursts; white flash + whip pan between blocks | `shots` (b-roll over word ranges), `transition`s, `calmFrom`, `outro` |

### How to make the judgement calls

- **badTakes** — Read the whole transcript first. A bad take is a sentence that is restarted later ("So today I want to… wait, let me start again. Today I want to…"): cut the failed attempt *and* the meta comment ("wait, let me start again"), keep the final complete version. Cut stumbles and abandoned phrases. Never cut something said only once. Prefer whole phrases over single words.
- **fillers** — AUTO fillers (um, uh, eh…) are removed for you. For each CANDIDATE, read the context: remove it only when it carries no meaning ("I, like, don't edit" → remove; "I like pizza" → keep). Spanish crutches ("o sea", "este", "tipo", "pues", "bueno" at the start of a thought) count too.
- **visuals** — `context` gives you the contact sheet path(s): open them with the Read tool and actually look at every image before placing anything. It also gives the target density for this video. Then:
  - Anchor each image/shot to the exact word that names or implies it. It will cut in on that word.
  - *Collage*: images illustrate the **concept** of the phrase, not the literal word. About one new image every 1–1.5 s. New group when the idea changes. `top` only for the single strongest reference, every 5–10 s, landscape images.
  - *Word + meme*: the image is a **reaction or joke** about the line. Keep ranges contiguous so there is always an image up; none stays more than 3 s.
  - *Cinematic*: the shot shows **literally** what the word names. 1–3 s shots; when the voice lists things, one shot per word (`from` = `to`). Keep the speaker on screen only for the opening line and one or two short beats. `transition: true` only where a new block starts (2–3 per video).
  - Use each image once. If there are not enough, cover the strongest lines and leave the rest empty — never hold one image for long to fill time.
  - After `decide`, read the summary line (images placed, coverage, seconds per image). If it is far from the reference numbers and there is unused media, improve the JSON and run `decide` again.
- **hook** (Word + meme only) — `title`: 1–2 words, ≤ 14 characters, the verb or the promise, shown huge for ~1.3 s. `plain` + `script`: a second line of 1–3 words; `script` is the part in handwriting. `proof`: up to 2 uploaded images that prove the claim, or `[]`. It must match what the video delivers.
- **cta** — Off by default. Short and specific to the content, plus an optional sub line. Plain white on black.
- **music** — Describe genre, mood, instrumentation, tempo. Always instrumental and calm enough to sit under speech.

### 4. Hand over

When the `compose` step finishes, the browser switches to the editor by itself. Tell the user, in a few lines:
- final length vs raw length and what you cut (bad takes, fillers, silences),
- the style used, how many images / shots you placed and how dense that is against the reference (the `visuals` summary line), and the hook text if any,
- if they uploaded too few images or clips for the style, say how many more would fill it,
- any step that was skipped or degraded and why (e.g. missing `ELEVENLABS_API_KEY`),
- that they can delete/restore words in the transcript (Delete / R keys) — the video re-cuts instantly and images stay on their words — and click **Export** to render the MP4 with HyperFrames at the style's loudness (or **Open in Studio** for the full HyperFrames preview).

### If something fails

The failing step is marked red in the browser. Read the error, fix the cause if you can (e.g. install WhisperX, add a key to `.env`), then `CLI retry <job> <step>` and continue with `CLI next <job>`. If it cannot be fixed, `CLI skip <job> <step> "reason"` — only for optional features; `prepare`, `transcribe` and `compose` are required.

## Requirements

Node.js ≥ 22, FFmpeg, Python with WhisperX (`pip install whisperx`, or set `WHISPERX_PYTHON` in `.env` to a venv's python). Optional keys in `.env`: `AUPHONIC_API_KEY`, `ELEVENLABS_API_KEY`. See `README.md` in this folder.
