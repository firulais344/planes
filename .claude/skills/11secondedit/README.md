# 11 Second Edit

One-click AI video editor that runs inside Claude Code. Raw talking-head footage in, edited 9:16 Reel (or 16:9) out.

```
/11secondedit  →  browser opens  →  upload + toggles  →  Edit Video
                                         │
             Claude Code runs each enabled step, progress shows live in the page
                                         │
             editor: preview · timeline · transcript (delete words = cut video)  →  Export MP4
```

## Setup

1. **Node.js ≥ 22** and **FFmpeg** on your PATH.
2. **WhisperX** (local transcription with word timestamps). WhisperX pins its own torch version, so a dedicated venv is easiest:

   ```bash
   python3 -m venv ~/.venvs/whisperx
   ~/.venvs/whisperx/bin/pip install whisperx
   ```

   CPU-only machine (no CUDA)? Pull the matching CPU wheels and avoid a multi-GB CUDA download:

   ```bash
   ~/.venvs/whisperx/bin/pip install whisperx "torch==2.8.0" "torchaudio==2.8.0" "torchvision==0.23.0" --extra-index-url https://download.pytorch.org/whl/cpu
   ```

   Then put `WHISPERX_PYTHON=~/.venvs/whisperx/bin/python` (absolute path) in `.env`. Python ≤ 3.13.
3. **Keys** (optional) in the project's `.env` — see `.env.example`:
   - `AUPHONIC_API_KEY` — audio enhancement. Without it, a local FFmpeg cleanup is used and the page says so.
   - `ELEVENLABS_API_KEY` — background music. Without it, music is skipped.
4. **HyperFrames** needs nothing installed: export and Studio run `npx hyperframes@0.9.30` (pinned) and use your local Chrome.

Then in Claude Code type `/11secondedit`.

## How it works

| Piece | Job |
|---|---|
| `SKILL.md` | Tells Claude Code how to drive the pipeline and make the judgement calls |
| `bin/11se.mjs` | CLI Claude uses: `start`, `wait`, `next`, `run`, `context`, `decide`, `skip`, `retry` |
| `server/server.mjs` | Local server (no dependencies): uploads, live progress (SSE), transcript edits, export |
| `app/` | The single-page app: setup → progress checklist → editor |
| `lib/edl.mjs` | Edit decision list. Cut points only between words, verified on every build |
| `lib/model.mjs` | Timeline model in output time — the single source for both the preview and the composition |
| `lib/composition.mjs` | Writes the HyperFrames composition (`composition/index.html`) |
| `lib/media.mjs`, `lib/apis.mjs` | FFmpeg (probe, encode, color analysis, synthesized SFX), Auphonic, ElevenLabs |
| `scripts/transcribe.py` | WhisperX transcription + word alignment |

**Who decides what.** Anything deterministic is a script. Claude only decides: bad takes and false starts, which ambiguous fillers to drop (pure "um/uh" are removed automatically), where b-roll goes (it looks at thumbnails), zoom moments, hook text, CTA text and the music prompt. Each decision is JSON validated by `11se decide` before it's saved.

**Never cut mid-word.** Claude picks word indices, not timestamps. `buildEdl` places each cut in the gap between words (with 120 ms of breathing room when there is room), then `validateEdl` checks that no cut lands inside any word and that no removed word is still audible. A randomized test exercises this over 800 generated transcripts.

**Never modify the original.** The browser uploads a copy; the copy is made read-only. Every derived file (H.264 working copy when needed, audio, composition) is new.

## Job folder

```
.11secondedit/jobs/<id>/
  source/              your upload (read-only)
  broll/               b-roll uploads (read-only)
  media/               working copies: aroll.mp4, voice.wav, music.mp3, sfx/, thumbs/
  transcript.json      words with [index], start, end
  decisions/*.json     Claude's calls (bad takes, fillers, b-roll, zooms, hook, cta, music)
  edits.json           your transcript edits from the editor
  edl.json, model.json generated
  composition/         HyperFrames project (index.html) — open with `npx hyperframes preview`
  export/              rendered MP4
```

## Tests

```bash
cd .claude/skills/11secondedit && npm test
```
