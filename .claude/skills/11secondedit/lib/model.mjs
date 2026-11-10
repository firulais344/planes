// The timeline model: everything placed in OUTPUT time. Built deterministically from the
// transcript + Claude's decisions + the user's edits. Both the HyperFrames composition and
// the browser editor are rendered from this one object, so they can never disagree.
import fs from "node:fs";
import { jobPath, loadJob, readJson, writeJson } from "./job.mjs";
import { buildEdl, removedWords, outputWords, rangeToOut } from "./edl.mjs";
import { detectFillers } from "./transcript.mjs";

const round = (n) => Math.round(n * 1000) / 1000;

export const FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export const HOOK_DURATION = 2.8;
export const CTA_DURATION = 3;

export function loadInputs(id) {
  const job = loadJob(id);
  const dec = (name) => readJson(jobPath(id, "decisions", `${name}.json`), null);
  const words = readJson(jobPath(id, "transcript.json"), null)?.words;
  if (!words) throw new Error("No transcript yet — run the transcribe step first.");
  return {
    job,
    words,
    assets: readJson(jobPath(id, "assets.json"), {}),
    edits: readJson(jobPath(id, "edits.json"), { removed: [], restored: [] }),
    decisions: {
      badTakes: dec("badTakes"),
      fillers: dec("fillers"),
      broll: dec("broll"),
      zooms: dec("zooms"),
      hook: dec("hook"),
      cta: dec("cta"),
      music: dec("music"),
    },
  };
}

export function computeModel({ job, words, assets, edits, decisions }) {
  const f = job.settings.features;
  const { width, height } = FORMATS[job.settings.format] || FORMATS["9:16"];
  const fillerAuto = f.fillers ? detectFillers(words).auto : [];
  const reasons = removedWords({
    words,
    badTakes: f.badTakes ? decisions.badTakes : null,
    fillers: f.fillers ? decisions.fillers : null,
    fillerAuto,
    edits,
  });
  const removed = new Set(reasons.keys());
  const edl = buildEdl(words, removed, { duration: assets.sourceDuration, silences: f.silences });
  const outWords = outputWords(words, removed, edl);
  const outByIndex = new Map(outWords.map((w) => [w.i, w]));
  const main = edl.duration;

  const hook = f.hook && (job.settings.hookText || decisions.hook?.text)
    ? { text: job.settings.hookText || decisions.hook.text, s: 0, e: round(Math.min(HOOK_DURATION, main)) }
    : null;

  const ctaText = job.settings.ctaText || decisions.cta?.text;
  const cta = f.cta && ctaText ? { text: ctaText, sub: job.settings.ctaText ? "" : decisions.cta?.sub || "", s: main, e: round(main + CTA_DURATION) } : null;
  const duration = cta ? cta.e : main;

  const zooms = [];
  if (f.zooms) {
    for (const z of decisions.zooms?.zooms || []) {
      const r = rangeToOut(words, removed, edl, z.from, z.to);
      if (r && r.e - r.s >= 0.4) zooms.push({ s: r.s, e: r.e, scale: z.scale, from: z.from, to: z.to });
    }
  }

  const broll = [];
  if (f.broll) {
    const minStart = hook ? hook.e : 0;
    for (const p of decisions.broll?.placements || []) {
      const info = assets.broll?.[p.file];
      const r = rangeToOut(words, removed, edl, p.from, p.to);
      if (!info || !r) continue;
      let s = Math.max(r.s, minStart);
      let e = r.e;
      if (info.type === "video" && info.duration) e = Math.min(e, s + info.duration - 0.05);
      const prev = broll[broll.length - 1];
      if (prev && s < prev.e) s = prev.e;
      if (e - s < 0.8) continue;
      broll.push({ file: p.file, src: info.src, type: info.type, s: round(s), e: round(e), from: p.from, to: p.to });
    }
  }

  const captions = f.captions ? captionGroups(outWords, main) : [];

  const music = f.music && assets.music ? { src: assets.music, volume: 0.12, fadeOut: 1.5 } : null;

  const sfx = [];
  if (f.sfx && assets.sfx) {
    const add = (kind, s) => {
      if (!assets.sfx[kind]) return;
      const t = round(Math.max(0, s));
      if (sfx.some((x) => Math.abs(x.s - t) < 0.35)) return;
      const { src, duration: len } = assets.sfx[kind];
      sfx.push({ kind, src, s: t, e: round(t + len), volume: kind === "whoosh" ? 0.35 : 0.45 });
    };
    if (hook) add("pop", 0.05);
    for (const b of broll) add("whoosh", b.s - 0.12);
    for (const z of zooms) add("whoosh", z.s - 0.05);
    if (cta) add("ding", cta.s + 0.1);
    sfx.sort((a, b) => a.s - b.s);
  }

  return {
    jobId: job.id,
    format: job.settings.format,
    width,
    height,
    duration: round(duration),
    mainDuration: main,
    sourceDuration: edl.sourceDuration,
    segments: edl.segments,
    cuts: edl.cuts,
    aroll: { src: assets.aroll, voice: f.enhanceAudio ? assets.voice || null : null, filter: f.color ? assets.colorFilter || null : null },
    words: words.map((w) => {
      const ow = outByIndex.get(w.i);
      return { i: w.i, w: w.w, s: w.s, e: w.e, removed: removed.has(w.i), reason: reasons.get(w.i) || null, os: ow ? ow.os : null, oe: ow ? ow.oe : null };
    }),
    captions,
    zooms,
    broll,
    hook,
    cta,
    music,
    sfx,
    edits: { removed: edits?.removed || [], restored: edits?.restored || [] },
    stats: {
      removedWords: removed.size,
      cutSeconds: round(edl.sourceDuration - main),
      cuts: edl.cuts.length,
    },
  };
}

/** Word-by-word caption groups: up to 3 words / ~16 chars, broken at punctuation and pauses. */
export function captionGroups(outWords, mainDuration) {
  const groups = [];
  let cur = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (let k = 0; k < outWords.length; k++) {
    const w = outWords[k];
    const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= 3 || len > 16 || w.os - cur[cur.length - 1].oe > 0.4)) flush();
    cur.push(w);
    if (/[.!?,;:…]$/.test(w.w)) flush();
  }
  flush();
  return groups.map((g, k) => {
    const next = groups[k + 1];
    const s = g[0].os;
    const lastEnd = g[g.length - 1].oe;
    const e = next ? Math.max(lastEnd, Math.min(next[0].os, lastEnd + 0.5)) : Math.min(mainDuration, lastEnd + 0.5);
    return {
      s: round(s),
      e: round(Math.max(e, s + 0.1)),
      words: g.map((w, j) => ({ w: w.w.replace(/^[¿¡"“]+|[,;:"”]+$/g, ""), s: round(w.os), e: round(g[j + 1] ? g[j + 1].os : Math.max(w.oe, w.os + 0.05)) })),
    };
  });
}

export function buildModel(id) {
  const model = computeModel(loadInputs(id));
  writeJson(jobPath(id, "model.json"), model);
  writeJson(jobPath(id, "edl.json"), { segments: model.segments, cuts: model.cuts, duration: model.mainDuration, sourceDuration: model.sourceDuration });
  return model;
}

export function hasTranscript(id) {
  return fs.existsSync(jobPath(id, "transcript.json"));
}
