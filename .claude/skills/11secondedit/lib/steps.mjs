// The editing pipeline, in order. `kind` says who does the work:
//   script        — deterministic Node/FFmpeg/API code: `11se run <job> <step>`
//   claude        — a judgement call: `11se context <job> <step>`, then `11se decide <job> <step> <file>`
//   claude+script — Claude decides (context/decide), then a script executes (`run`)
export const STEP_DEFS = [
  { id: "prepare", label: "Prepare footage", kind: "script", always: true },
  { id: "enhanceAudio", label: "Enhance audio", kind: "script", feature: "enhanceAudio" },
  { id: "transcribe", label: "Transcribe with word timestamps", kind: "script", always: true },
  { id: "badTakes", label: "Remove bad takes and false starts", kind: "claude", feature: "badTakes" },
  { id: "fillers", label: "Remove filler words", kind: "claude", feature: "fillers" },
  { id: "silences", label: "Remove silences", kind: "script", feature: "silences" },
  { id: "broll", label: "Add b-roll", kind: "claude", feature: "broll" },
  { id: "zooms", label: "Add zoom cuts", kind: "claude", feature: "zooms" },
  { id: "color", label: "Auto color correction", kind: "script", feature: "color" },
  { id: "hook", label: "Text hook at the start", kind: "claude", feature: "hook" },
  { id: "cta", label: "Call to action card at the end", kind: "claude", feature: "cta" },
  { id: "captions", label: "Animated word-by-word captions", kind: "script", feature: "captions" },
  { id: "music", label: "Background music", kind: "claude+script", feature: "music" },
  { id: "sfx", label: "Sound effects", kind: "script", feature: "sfx" },
  { id: "compose", label: "Build the edit", kind: "script", always: true },
];

export function stepsFor(job) {
  const f = job.settings.features;
  return STEP_DEFS.filter((s) => s.always || f[s.feature]).map((s) => {
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

// What Claude should write for each judgement step. Shown by `11se context`.
export const DECISION_SPECS = {
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
  broll: {
    example: { placements: [{ file: "beach.mp4", from: 40, to: 52, reason: "talks about the beach" }] },
    rules: [
      "Only use files from the B-ROLL list. Look at their thumbnails (paths given) before deciding.",
      "Place a clip over the words it illustrates. 1.5–4 s per placement, never over the first 2 s (hook) or overlapping another placement.",
      "Leave the speaker on screen for emotional or direct-to-camera lines.",
      "Each file can be used more than once, but prefer variety.",
    ],
  },
  zooms: {
    example: { zooms: [{ from: 18, to: 26, scale: 1.18 }] },
    rules: [
      "A zoom cut is a punch-in held over a phrase, then a cut back to wide. Use them on emphasis, punchlines and new ideas.",
      "scale between 1.08 and 1.35. Roughly one every 4–8 seconds of final video; never two back to back on the same phrase.",
      "Ranges must not overlap.",
    ],
  },
  hook: {
    example: { text: "I quit my job to travel for a year" },
    rules: [
      "One line, max 60 characters, in the language of the video.",
      "It must create curiosity in the first second and match what the video actually delivers. No clickbait the video does not pay off.",
    ],
  },
  cta: {
    example: { text: "Follow for part 2", sub: "New travel tips every week" },
    rules: ["text: max 40 characters. sub: optional, max 60 characters. Same language as the video."],
  },
  music: {
    example: { prompt: "Upbeat lo-fi hip hop, warm keys, soft drums, 95 bpm, instrumental, no vocals" },
    rules: [
      "A prompt for ElevenLabs Music describing genre, mood, instrumentation and tempo that fits the video's tone.",
      "Always instrumental. It sits under speech, so avoid busy leads.",
    ],
  },
};

const isInt = (n) => Number.isInteger(n) && n >= 0;

function rangeCheck(r, nWords, where) {
  if (!isInt(r.from) || !isInt(r.to)) throw new Error(`${where}: "from" and "to" must be word indices (integers).`);
  if (r.from > r.to) throw new Error(`${where}: from (${r.from}) is after to (${r.to}).`);
  if (r.to >= nWords) throw new Error(`${where}: word index ${r.to} is out of range (transcript has ${nWords} words).`);
}

function noOverlap(list, label) {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) {
      throw new Error(`${label}: ranges ${sorted[i - 1].from}-${sorted[i - 1].to} and ${sorted[i].from}-${sorted[i].to} overlap.`);
    }
  }
  return sorted;
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
    case "broll": {
      if (!Array.isArray(data.placements)) throw new Error('Expected {"placements": [...]}.');
      const files = new Set(ctx.brollFiles);
      data.placements.forEach((p, i) => {
        rangeCheck(p, n, `placements[${i}]`);
        if (!files.has(p.file)) throw new Error(`placements[${i}]: "${p.file}" is not an uploaded b-roll file (${[...files].join(", ") || "none"}).`);
      });
      return { placements: noOverlap(data.placements, "broll").map((p) => ({ file: p.file, from: p.from, to: p.to, reason: String(p.reason || "") })) };
    }
    case "zooms": {
      if (!Array.isArray(data.zooms)) throw new Error('Expected {"zooms": [...]}.');
      data.zooms.forEach((z, i) => {
        rangeCheck(z, n, `zooms[${i}]`);
        const s = Number(z.scale ?? 1.15);
        if (!(s >= 1.05 && s <= 1.5)) throw new Error(`zooms[${i}]: scale ${z.scale} must be between 1.05 and 1.5.`);
      });
      return { zooms: noOverlap(data.zooms, "zooms").map((z) => ({ from: z.from, to: z.to, scale: Number(z.scale ?? 1.15) })) };
    }
    case "hook": {
      const text = String(data.text || "").trim();
      if (!text) throw new Error('Expected {"text": "..."}.');
      if (text.length > 80) throw new Error("hook text is longer than 80 characters.");
      return { text };
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
