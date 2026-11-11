# 11 Second Edit — project notes for Claude

One-click AI video editor that runs inside Claude Code. Raw talking-head footage in, edited Reel out, in one of three styles (Collage, Word + meme, Cinematic). `/11secondedit` starts a local Node server and opens a browser app; Claude Code runs the pipeline with the `11se` CLI; the page shows progress, then an editor (preview, timeline, transcript where deleting words cuts the video) and an Export button that renders with HyperFrames.

Read `README.md` (setup, styles, architecture) and `SKILL.md` (how Claude drives a job) first.

## Rules that must never break

1. **Never modify the original video.** Uploads are copied and made read-only.
2. **Never cut mid-word.** Cuts are placed between words and verified on every build (`lib/edl.mjs`, randomized test).
3. **API keys only in `.env`**, never in code, logs or command lines.
4. **Deterministic work lives in scripts.** Claude only makes judgement calls (bad takes, ambiguous fillers, which image/shot goes on which word, hook, CTA, music prompt), as JSON validated by `11se decide`.
5. **Nothing animates in.** Text and images hard-cut on the spoken word. No zooms, bounces, outlined or coloured captions. The only motion is the whip pan in Cinematic.

## Layout

- `lib/styles.mjs` — every measured number of the three styles (positions, sizes, cadence, loudness)
- `lib/model.mjs` — resolves transcript + decisions + edits + style into overlays in output time and pixels
- `lib/overlay-html.mjs` — draws overlays as HTML; shared by the composition builder and the browser preview
- `lib/composition.mjs` — writes the HyperFrames composition; `server/server.mjs` — uploads, SSE, edits, export + loudness pass
- `lib/runner.mjs`, `lib/steps.mjs` — pipeline steps, per-style contexts and decision validation
- `bin/11se.mjs` — CLI; `start` restarts a server left over from an older version (`lib/build.mjs` fingerprint)
- Tests: `npm test` (node:test, no dependencies)

## Verified vs not verified

Verified end to end (UI → pipeline → HyperFrames render → loudness) with **synthetic** material only: generated English speech (Piper), generated images and clips, local WhisperX `base`. Frames were compared against the three reference videos.

**Not verified:** real Spanish speech, real footage, real images; Auphonic and ElevenLabs with real keys; behaviour and render time on a MacBook Air.

## Known gaps / backlog (rough priority)

1. Run everything on real footage and fix what that shows (first priority).
2. Index the user's own b-roll library once (Claude describes each clip) so clips can be found by content.
3. Spanish tuning: filler list, punctuation, numbers.
4. Person cut-out so the speaker sits in front of the images (Collage reference does this).
5. Build a style from any reference video automatically (measure rhythm, caption size/position, cadence).
6. Reel title/description/hashtags; auto-reframe horizontal → vertical.
7. Decide image sourcing: user library only, free stock API, or generated. Never auto-download memes or film stills (copyright).
8. If it should work without Claude Code, the decision steps need the Anthropic API instead of a Claude Code session.

## Working here

- Test with real files whenever possible: `ELEVENSE_WORKDIR=<scratch> node bin/11se.mjs start`, then drive the page.
- Fonts are bundled in `assets/fonts` (Inter, Dancing Script, SIL OFL). Do not add fonts without a licence.
- HyperFrames is pinned (`HYPERFRAMES_VERSION` in `lib/composition.mjs`); upgrade deliberately and re-render all three styles.
- The user prefers direct answers, honest limits over reassurance, and the reasoning behind decisions. Spanish.
