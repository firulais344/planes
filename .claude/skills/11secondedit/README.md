# 11 Second Edit

One-click AI video editor that runs inside Claude Code. Raw talking-head footage in, edited Reel out, in one of three styles.

```
/11secondedit  →  browser opens  →  upload + style + toggles  →  Edit Video
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

## Styles

Three fixed looks, each measured frame by frame from a reference video (`lib/styles.mjs` holds the numbers). Shared rule: **nothing animates in** — text and images cut in and out on the spoken word. No zooms, no bounces, no outlined captions.

| Style | Format | Captions | Visuals | Loudness |
|---|---|---|---|---|
| **Collage** | 9:16 | Inter Light, 2.5 % of the height, 2–4 words at chest height | 1–3 images piled in the lower third (a new one every 1–1.5 s, the 4th replaces the 1st) + an occasional wide still above the head | −14 LUFS |
| **Word + meme** | 9:16 | Inter Bold, 4.3 %, 1–2 lowercase words, tight tracking | One square image with rounded corners under the caption, swapped every 1–2.5 s. Orange title hook for the first ~1.3 s | −9 LUFS |
| **Cinematic** | 3:2 (also 16:9, 9:16) | One big word in the centre over b-roll (15 %); small italics while you are on camera | Your b-roll over ~80 % of the video, word-by-word bursts, white frame + whip pan between blocks, teal/orange grade, closing shot without text | −17 LUFS |

What you upload decides how good A and B look: Collage wants roughly one image per 1.2 s of final video, Word + meme one per 1.5 s. Claude never downloads images; it only places the ones you give it, and leaves a phrase empty rather than holding one image too long.

Not replicated (yet): in the Collage reference the speaker is cut out and sits *in front of* the images and text. That needs per-frame person segmentation; here images are simply drawn on top, placed so they stay clear of the face.

Fonts are bundled (`assets/fonts`, SIL OFL): Inter and Dancing Script.

## How it works

| Piece | Job |
|---|---|
| `SKILL.md` | Tells Claude Code how to drive the pipeline and make the judgement calls |
| `bin/11se.mjs` | CLI Claude uses: `start`, `wait`, `next`, `run`, `context`, `decide`, `skip`, `retry` |
| `server/server.mjs` | Local server (no dependencies): uploads, live progress (SSE), transcript edits, export |
| `app/` | The single-page app: setup → progress checklist → editor |
| `lib/edl.mjs` | Edit decision list. Cut points only between words, verified on every build |
| `lib/styles.mjs` | The three styles: every position, size, cadence and loudness target |
| `lib/model.mjs` | Timeline model: every text and image resolved to output time and pixels |
| `lib/overlay-html.mjs` | Draws those overlays as HTML — imported by both the composition builder and the browser preview |
| `lib/composition.mjs` | Writes the HyperFrames composition (`composition/index.html`) |
| `lib/media.mjs`, `lib/apis.mjs` | FFmpeg (probe, encode, color analysis, synthesized SFX), Auphonic, ElevenLabs |
| `scripts/transcribe.py` | WhisperX transcription + word alignment |

**Who decides what.** Anything deterministic is a script. Claude only decides: bad takes and false starts, which ambiguous fillers to drop (pure "um/uh" are removed automatically), which image or b-roll shot goes on which word (it looks at contact sheets of your uploads), hook text, CTA text and the music prompt. Each decision is JSON validated by `11se decide` before it's saved, and everything is anchored to word indices, so deleting words in the editor moves images and captions with the speech.

**Never cut mid-word.** Claude picks word indices, not timestamps. `buildEdl` places each cut in the gap between words (with 120 ms of breathing room when there is room), then `validateEdl` checks that no cut lands inside any word and that no removed word is still audible. A randomized test exercises this over 800 generated transcripts.

**Never modify the original.** The browser uploads a copy; the copy is made read-only. Every derived file (H.264 working copy when needed, audio, composition) is new.

## Job folder

```
.11secondedit/jobs/<id>/
  source/              your upload (read-only)
  broll/               image and b-roll uploads (read-only)
  media/               working copies: aroll.mp4, voice.wav, img/, broll/, sheets/ (contact sheets), music.mp3
  transcript.json      words with [index], start, end
  decisions/*.json     Claude's calls (bad takes, fillers, visuals, hook, cta, music)
  edits.json           your transcript edits from the editor
  edl.json, model.json generated
  composition/         HyperFrames project (index.html) — open with `npx hyperframes preview`
  export/              rendered MP4
```

## Tests

```bash
cd .claude/skills/11secondedit && npm test
```
