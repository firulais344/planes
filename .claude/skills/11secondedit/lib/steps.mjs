// The editing pipeline, in order. `kind` says who does the work:
//   script        — deterministic Node/FFmpeg/API code: `11se run <job> <step>`
//   claude        — a judgement call: `11se context <job> <step>`, then `11se decide <job> <step> <file>`
//   claude+script — Claude decides (context/decide), then a script executes (`run`)
import { getStyle } from "./styles.mjs";

export const STEP_DEFS = [
  { id: "prepare", label: "Prepare footage", kind: "script", always: true },
  { id: "enhanceAudio", label: "Enhance audio", kind: "script", feature: "enhanceAudio" },
  { id: "transcribe", label: "Transcribe with word timestamps", kind: "script", always: true },
  { id: "badTakes", label: "Remove bad takes and false starts", kind: "claude", feature: "badTakes" },
  { id: "fillers", label: "Remove filler words", kind: "claude", feature: "fillers" },
  { id: "silences", label: "Remove silences", kind: "script", feature: "silences" },
  { id: "visuals", label: "Place images / b-roll", kind: "claude", feature: "visuals" },
  { id: "color", label: "Color", kind: "script", feature: "color" },
  { id: "hook", label: "Text hook at the start", kind: "claude", feature: "hook" },
  { id: "cta", label: "Call to action card at the end", kind: "claude", feature: "cta" },
  { id: "captions", label: "Captions", kind: "script", feature: "captions" },
  { id: "music", label: "Background music", kind: "claude+script", feature: "music" },
  { id: "sfx", label: "Sound effects", kind: "script", feature: "sfx" },
  { id: "compose", label: "Build the edit", kind: "script", always: true },
];

export function stepsFor(job) {
  const f = job.settings.features;
  const style = getStyle(job.settings.style);
  return STEP_DEFS.filter((s) => s.always || f[s.feature]).map((s) => {
    if (s.id === "visuals") return { ...s, label: style.visuals.label };
    if (s.id === "color") return { ...s, label: style.id === "cinematic" ? "Cinematic color grade" : "Auto color correction" };
    if (s.id === "captions") return { ...s, label: `${style.name} captions` };
    // If the user typed the hook / CTA text themselves there is nothing to decide.
    if (s.id === "hook" && job.settings.hookText) return { ...s, kind: "script" };
    if (s.id === "cta" && job.settings.ctaText) return { ...s, kind: "script" };
    return s;
  });
}

export function stepDef(id) {
  const s = STEP_DEFS.find((d) => d.id === id);
  if (!s) throw new Error(`Unknown step "${id}". Steps: ${STEP_DEFS.map((d) => d.id).join(", ")}`);
  return s;
}

const SHARED_VISUAL_RULES = [
  "Only use files from the MEDIA list, with the exact file name. Look at the contact sheet(s) with the Read tool before deciding.",
  "Word indices come from the [index] labels in the transcript. Never anchor to a ~~struck~~ (cut) word.",
  "Everything cuts in exactly on the word you anchor it to — pick the word that names or implies the image.",
];

// What Claude should write for each judgement step. Shown by `11se context`.
const SPECS = {
  badTakes: {
    example: { cuts: [{ from: 12, to: 25, reason: "restarted the sentence" }] },
    rules: [
      "Word indices are inclusive and come from the [index] labels in the transcript.",
      "Cut the earlier, failed attempt and keep the last complete take of a sentence.",
      "Cut false starts (a phrase abandoned mid-way and restarted), stumbles and off-script asides ('wait, let me redo that').",
      "Do not cut content that is said only once. When unsure, keep it — the user can delete words in the editor.",
      'Return {"cuts": []} if there is nothing to cut.',
    ],
  },
  fillers: {
    example: { remove: [4, 31, 77] },
    rules: [
      "Words listed under AUTO are pure fillers (um, uh, eh...) and are removed regardless; you do not need to list them.",
      "From CANDIDATES, list only the ones used as a verbal tic, not as meaning ('like' in 'I like it' stays; 'o sea' as a crutch goes).",
      "Also list any other filler you spot that the detector missed.",
    ],
  },
  "visuals:collage": {
    example: {
      groups: [
        { from: 0, to: 14, images: [{ file: "mirror.jpg", at: 0 }, { file: "chess.jpg", at: 5 }, { file: "maze.jpg", at: 10 }] },
        { from: 15, to: 27, images: [{ file: "runner.jpg", at: 15 }, { file: "door.jpg", at: 21 }] },
      ],
      top: [{ file: "matrix-pills.jpg", from: 0, to: 6 }],
    },
    rules: [
      ...SHARED_VISUAL_RULES,
      "A group is one idea (3–7 s of speech). Its images pile up in the lower third: the first appears on the group's first word, each next one on the word (`at`) it illustrates, about one every 1–1.5 s.",
      "Up to 3 are visible at once; a 4th replaces the oldest, so a group can hold 1–6 images. Start a new group when the idea changes — the whole collage is swapped.",
      "Images illustrate a concept of the phrase, not the literal word (\"losers take what happens to them\" → a man in a broken mirror).",
      "`top` is the occasional wide still above the head (every 5–10 s, 2–3 s long): the one strong reference of the phrase, e.g. a film still. Use landscape images for it. Never two back to back.",
      "Use each image once. Aim for the density in STATS; if there are too few images, leave some phrases with no collage rather than holding one image for long.",
    ],
  },
  "visuals:wordmeme": {
    example: { images: [{ file: "phone-glow.jpg", from: 6, to: 10 }, { file: "eye.jpg", from: 11, to: 13 }, { file: "sticky-notes.jpg", from: 14, to: 19 }] },
    rules: [
      ...SHARED_VISUAL_RULES,
      "One square image at a time under the caption. Each stays 1–2.5 s (2–5 words) and is cut to the next; it is never on screen more than 3 s.",
      "Consecutive ranges should touch (next `from` = previous `to` + 1) so there is always an image up. The hook covers the first ~1.3 s, so start after it.",
      "The image is a reaction or a joke about what is being said: memes, recognisable characters, a striking photo. Images are cropped square from the centre.",
      "Use each image once. If there are too few, cover the strongest lines and leave the rest with just the caption.",
    ],
  },
  "visuals:cinematic": {
    example: {
      shots: [
        { file: "shibuya.mp4", from: 4, to: 11 },
        { file: "gym.mp4", from: 12, to: 16, transition: true },
        { file: "hands.mp4", from: 17, to: 17 },
        { file: "eye.mp4", from: 18, to: 18 },
        { file: "plate.mp4", from: 19, to: 19, clipStart: 2.5 },
      ],
      calmFrom: 58,
      outro: { file: "portrait.mp4", seconds: 2.5 },
    },
    rules: [
      ...SHARED_VISUAL_RULES,
      "B-roll should cover about 80 % of the video. Leave the speaker on screen only for short stretches (1.5–2 s): the opening line and one or two direct-to-camera beats.",
      "Normal shots last 1–3 s. The shot shows literally what the word names (leaves, window, steps).",
      "Bursts: when the voice lists things (\"show hands, textures, light…\"), give each word its own shot (`from` = `to`), 0.1–0.5 s each.",
      "`transition: true` puts a white flash + whip pan on the cut INTO that shot. Use it only when a new block of ideas starts (2–3 times per video), never on every cut.",
      "`clipStart` (seconds into the clip) is optional; without it, repeated uses of a clip automatically continue from where the last one ended.",
      "`calmFrom`: optional word index where the big centre word drops to small text to lower the intensity before the close (usually the last sentence or two).",
      "`outro`: optional closing shot with no text, 2–3 s, after the last word. Pick the calmest, most beautiful clip.",
      "Shots must not overlap. A clip can be reused, but vary them.",
    ],
  },
  hook: {
    example: { title: "PUBLICA", plain: "todo", script: "dos veces", proof: ["video-a.jpg", "video-b.jpg"] },
    rules: [
      "Shown from the very first frame for ~1.3 s, then cut. It is read in one glance, so it must be tiny.",
      "`title`: 1–2 words, max 14 characters, set huge in orange capitals. The verb or the promise.",
      "`plain` + `script`: the second line, 1–3 words total; `script` is the 1–2 words set in handwriting for emphasis. Either can be empty.",
      "`proof`: optional, up to 2 files from the MEDIA list shown side by side as visual proof (screenshots, results). Use [] if nothing fits.",
      "Same language as the video. It must match what the video actually delivers.",
    ],
  },
  cta: {
    example: { text: "Follow for part 2", sub: "New travel tips every week" },
    rules: ["text: max 40 characters. sub: optional, max 60 characters. Same language as the video. Shown as plain white text on black, no animation."],
  },
  music: {
    example: { prompt: "Warm cinematic ambient, soft piano and pads, slow build, 80 bpm, instrumental, no vocals" },
    rules: [
      "A prompt for ElevenLabs Music describing genre, mood, instrumentation and tempo that fits the video's tone.",
      "Always instrumental. It sits under speech, so avoid busy leads.",
    ],
  },
};

export function decisionSpec(step, styleId) {
  return SPECS[`${step}:${styleId}`] || SPECS[step] || null;
}

const isInt = (n) => Number.isInteger(n) && n >= 0;

function rangeCheck(r, nWords, where) {
  if (!r || !isInt(r.from) || !isInt(r.to)) throw new Error(`${where}: "from" and "to" must be word indices (integers).`);
  if (r.from > r.to) throw new Error(`${where}: from (${r.from}) is after to (${r.to}).`);
  if (r.to >= nWords) throw new Error(`${where}: word index ${r.to} is out of range (transcript has ${nWords} words).`);
}

function noOverlap(list, label) {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) throw new Error(`${label}: ranges ${sorted[i - 1].from}-${sorted[i - 1].to} and ${sorted[i].from}-${sorted[i].to} overlap.`);
  }
  return sorted;
}

function fileCheck(file, ctx, where) {
  if (!ctx.mediaFiles.includes(file)) throw new Error(`${where}: "${file}" is not an uploaded file. Available: ${ctx.mediaFiles.join(", ") || "none"}.`);
}

function validateVisuals(data, ctx) {
  const n = ctx.words.length;
  if (ctx.style === "collage") {
    if (!Array.isArray(data.groups)) throw new Error('Expected {"groups": [...], "top": [...]}.');
    const groups = data.groups.map((g, i) => {
      rangeCheck(g, n, `groups[${i}]`);
      if (!Array.isArray(g.images) || !g.images.length) throw new Error(`groups[${i}]: needs at least one image.`);
      if (g.images.length > 6) throw new Error(`groups[${i}]: at most 6 images per group — start a new group.`);
      const images = g.images.map((im, j) => {
        fileCheck(im.file, ctx, `groups[${i}].images[${j}]`);
        const at = im.at ?? g.from;
        if (!isInt(at) || at < g.from || at > g.to) throw new Error(`groups[${i}].images[${j}]: "at" (${im.at}) must be a word index inside the group (${g.from}–${g.to}).`);
        return { file: im.file, at };
      });
      return { from: g.from, to: g.to, images: images.sort((a, b) => a.at - b.at) };
    });
    const top = (data.top || []).map((t, i) => {
      rangeCheck(t, n, `top[${i}]`);
      fileCheck(t.file, ctx, `top[${i}]`);
      return { file: t.file, from: t.from, to: t.to };
    });
    return { groups: noOverlap(groups, "groups"), top: noOverlap(top, "top") };
  }
  if (ctx.style === "wordmeme") {
    if (!Array.isArray(data.images)) throw new Error('Expected {"images": [...]}.');
    const images = data.images.map((im, i) => {
      rangeCheck(im, n, `images[${i}]`);
      fileCheck(im.file, ctx, `images[${i}]`);
      return { file: im.file, from: im.from, to: im.to };
    });
    return { images: noOverlap(images, "images") };
  }
  if (!Array.isArray(data.shots)) throw new Error('Expected {"shots": [...]}.');
  const shots = data.shots.map((s, i) => {
    rangeCheck(s, n, `shots[${i}]`);
    fileCheck(s.file, ctx, `shots[${i}]`);
    const out = { file: s.file, from: s.from, to: s.to };
    if (s.clipStart != null) {
      if (!(Number(s.clipStart) >= 0)) throw new Error(`shots[${i}]: clipStart must be seconds ≥ 0.`);
      out.clipStart = Number(s.clipStart);
    }
    if (s.transition) out.transition = true;
    return out;
  });
  const result = { shots: noOverlap(shots, "shots") };
  const whips = result.shots.filter((s) => s.transition).length;
  if (whips > Math.max(3, Math.ceil(result.shots.length / 6))) throw new Error(`${whips} transitions is too many — the whip is only for a change of block (2–3 per video).`);
  if (data.calmFrom != null) {
    if (!isInt(data.calmFrom) || data.calmFrom >= n) throw new Error("calmFrom must be a word index.");
    result.calmFrom = data.calmFrom;
  }
  if (data.outro) {
    fileCheck(data.outro.file, ctx, "outro");
    result.outro = { file: data.outro.file, seconds: Math.min(3, Math.max(1, Number(data.outro.seconds) || 2.5)) };
    if (data.outro.clipStart != null) result.outro.clipStart = Math.max(0, Number(data.outro.clipStart) || 0);
  }
  return result;
}

/** Validate and normalize Claude's decision for a step. Throws a readable error. */
export function validateDecision(step, data, ctx) {
  const n = ctx.words.length;
  if (!data || typeof data !== "object") throw new Error("Decision must be a JSON object.");
  switch (step) {
    case "badTakes": {
      if (!Array.isArray(data.cuts)) throw new Error('Expected {"cuts": [...]}.');
      data.cuts.forEach((c, i) => rangeCheck(c, n, `cuts[${i}]`));
      return { cuts: data.cuts.map((c) => ({ from: c.from, to: c.to, reason: String(c.reason || "bad take").slice(0, 200) })) };
    }
    case "fillers": {
      if (!Array.isArray(data.remove)) throw new Error('Expected {"remove": [...]}.');
      for (const i of data.remove) if (!isInt(i) || i >= n) throw new Error(`fillers: ${i} is not a valid word index.`);
      return { remove: [...new Set(data.remove)].sort((a, b) => a - b) };
    }
    case "visuals":
      return validateVisuals(data, ctx);
    case "hook": {
      const title = String(data.title || "").trim();
      if (!title) throw new Error('Expected {"title": "...", "plain": "...", "script": "...", "proof": []}.');
      if (title.length > 16) throw new Error(`hook title "${title}" is too long (${title.length} characters, max 16). It is read in one second.`);
      const plain = String(data.plain || "").trim();
      const script = String(data.script || "").trim();
      if ((plain + " " + script).trim().split(/\s+/).filter(Boolean).length > 4) throw new Error("hook second line: at most 4 words in total.");
      const proof = Array.isArray(data.proof) ? data.proof.slice(0, 2) : [];
      proof.forEach((p, i) => fileCheck(p, ctx, `proof[${i}]`));
      return { title, plain, script, proof };
    }
    case "cta": {
      const text = String(data.text || "").trim();
      if (!text) throw new Error('Expected {"text": "...", "sub": "..."}.');
      if (text.length > 60) throw new Error("cta text is longer than 60 characters.");
      return { text, sub: String(data.sub || "").trim().slice(0, 80) };
    }
    case "music": {
      const prompt = String(data.prompt || "").trim();
      if (prompt.length < 5) throw new Error('Expected {"prompt": "..."}.');
      return { prompt: prompt.slice(0, 2000) };
    }
    default:
      throw new Error(`Step "${step}" does not take a decision.`);
  }
}
