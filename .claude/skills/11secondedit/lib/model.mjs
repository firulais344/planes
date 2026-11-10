// The timeline model: everything resolved to OUTPUT time and to pixels. Built deterministically
// from the transcript + Claude's decisions + the user's transcript edits + the chosen style.
// The HyperFrames composition and the editor preview both draw `model.overlays` with the same
// renderer (overlay-html.mjs), so they cannot disagree.
import fs from "node:fs";
import { jobPath, loadJob, readJson, writeJson } from "./job.mjs";
import { buildEdl, removedWords, outputWords, rangeToOut, srcToOut } from "./edl.mjs";
import { detectFillers } from "./transcript.mjs";
import { FORMATS, getStyle, pickFps } from "./styles.mjs";

const round = (n) => Math.round(n * 1000) / 1000;
export const CTA_DURATION = 2.5;
// Cinematic grade as per-channel curves (shadow, mid, highlight): teal shadows, warm highlights, lifted blacks.
const GRADE = { r: "0.03 0.52 1", g: "0.07 0.5 0.96", b: "0.12 0.47 0.88" };

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
    decisions: { badTakes: dec("badTakes"), fillers: dec("fillers"), visuals: dec("visuals"), hook: dec("hook"), cta: dec("cta"), music: dec("music") },
  };
}

// ---------- text helpers ----------

/** Rough advance width of a string set in Inter. Only used to shrink text that would overflow. */
export function textWidth(text, size, weight = 400, tracking = 0) {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.27;
    else if ("iljtfíìIr.,;:!'¡|".includes(ch)) em += 0.3;
    else if ("mwMW".includes(ch)) em += 0.86;
    else if (ch !== ch.toLowerCase()) em += 0.68;
    else em += 0.56;
    em += tracking;
  }
  return em * size * (weight >= 600 ? 1.06 : weight <= 300 ? 0.95 : 1);
}

function fitSize(text, size, maxW, weight, tracking) {
  const w = textWidth(text, size, weight, tracking);
  return w > maxW ? (size * maxW) / w : size;
}

const FMT = {
  // Collage: as spoken, without a closing period/comma. Question and exclamation marks stay.
  collage: (w) => w.replace(/^[¿¡"“‘'(]+/, "").replace(/[.,;:"”’)…]+$/, ""),
  // Word + meme: lowercase, no punctuation at all.
  wordmeme: (w) => w.toLowerCase().replace(/[^\p{L}\p{N}'%$-]/gu, ""),
  // Cinematic: as spoken, keeps the period/comma that closes a phrase ("magia.").
  cinematic: (w) => w.replace(/^[¿¡"“‘'(]+/, "").replace(/["”’)]+/g, ""),
};

/**
 * Split kept words into caption groups.
 * @param limits (key) => { maxWords, maxChars }
 * @param keyOf  (word) => anything; a group never spans two keys (e.g. two different shots)
 */
export function captionGroups(outWords, { limits, keyOf = () => 0, fmt = (w) => w, gapBreak = 0.5 }) {
  const groups = [];
  let cur = [];
  let curKey;
  const flush = () => {
    if (cur.length) groups.push({ key: curKey, words: cur });
    cur = [];
  };
  for (const w of outWords) {
    const text = fmt(w.w);
    if (!text) continue;
    const key = keyOf(w);
    const L = limits(key);
    if (cur.length) {
      const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + text.length;
      if (key !== curKey || cur.length >= L.maxWords || len > L.maxChars || w.os - cur[cur.length - 1].oe > gapBreak) flush();
    }
    curKey = key;
    cur.push({ ...w, text });
    if (/[.!?,;:…]$/.test(w.w)) flush();
  }
  flush();
  return groups.map((g, k) => {
    const next = groups[k + 1];
    const lastEnd = g.words[g.words.length - 1].oe;
    // Hard cut straight into the next phrase; during a real pause the text leaves shortly after the word.
    const e = next && next.words[0].os - lastEnd <= 0.6 ? next.words[0].os : lastEnd + 0.3;
    return { key: g.key, s: g.words[0].os, e, text: g.words.map((w) => w.text).join(" "), from: g.words[0].i, to: g.words[g.words.length - 1].i };
  });
}

// ---------- the model ----------

export function computeModel({ job, words, assets, edits, decisions }) {
  const style = getStyle(job.settings.style);
  const f = job.settings.features;
  const format = style.formats.includes(job.settings.format) ? job.settings.format : style.formats[0];
  const { width: W, height: H } = FORMATS[format];
  const fps = pickFps(assets.video?.fps);
  const frame = 1 / fps;
  const q = (t) => Math.round(t * fps) / fps;

  const fillerAuto = f.fillers ? detectFillers(words).auto : [];
  const reasons = removedWords({ words, badTakes: f.badTakes ? decisions.badTakes : null, fillers: f.fillers ? decisions.fillers : null, fillerAuto, edits });
  const removed = new Set(reasons.keys());
  const edl = buildEdl(words, removed, { duration: assets.sourceDuration, silences: f.silences });
  const outWords = outputWords(words, removed, edl);
  const outByIndex = new Map(outWords.map((w) => [w.i, w]));
  const main = edl.duration;

  const media = assets.media || {};
  const out = (from, to) => rangeToOut(words, removed, edl, from, to);
  /** Output time at which word `i` starts (or the next kept word after it). */
  const wordStart = (i) => {
    for (let k = i; k < words.length; k++) if (outByIndex.has(k)) return outByIndex.get(k).os;
    return main;
  };
  const overlays = [];
  let n = 0;
  const add = (o) => {
    overlays.push({ id: `o${n++}`, ...o });
    return overlays[overlays.length - 1];
  };
  const vis = f.visuals ? decisions.visuals || {} : {};
  const stats = { removedWords: removed.size, cutSeconds: round(edl.sourceDuration - main), cuts: edl.cuts.length, visuals: 0, visualCoverage: 0 };
  let extra = 0; // seconds appended after the last word (outro, CTA)
  let grade = null;
  let arollCss = f.color && assets.colorFilter ? assets.colorFilter : "";
  const sfx = [];
  const whoosh = f.sfx && assets.sfx?.whoosh;
  const text = (o) => add({ kind: "text", track: "text", z: 40, ...o });
  const covered = [];

  if (style.id === "collage") {
    const c = style.caption;
    if (f.captions) {
      for (const g of captionGroups(outWords, { limits: () => c, fmt: FMT.collage })) {
        text({ s: g.s, e: Math.min(g.e, main), text: g.text, cx: W / 2, cy: H * c.cy, size: H * c.size, weight: c.weight, shadow: "0 1px 8px rgba(0,0,0,.35)", from: g.from, to: g.to, role: "caption" });
      }
    }
    // Lower-third collage: images pile up one by one (newest on top); the 4th replaces the 1st, and so on.
    const groups = (vis.groups || []).map((g) => ({ g, r: out(g.from, g.to) })).filter((x) => x.r).sort((a, b) => a.r.s - b.r.s);
    groups.forEach(({ g, r }, k) => {
      const next = groups[k + 1];
      let ge = next && next.r.s - r.e < 0.6 ? next.r.s : Math.min(r.e + 0.3, next ? next.r.s : main);
      ge = Math.min(ge, r.s + style.maxGroupSeconds, main);
      const imgs = (g.images || [])
        .map((im, j) => ({ im, info: media[im.file], t: j === 0 ? r.s : Math.max(r.s, wordStart(im.at)) }))
        .filter((x) => x.info && x.t < ge - 0.2)
        .sort((a, b) => a.t - b.t);
      imgs.forEach((x, j) => {
        const slot = style.slots[j % style.slots.length];
        const replacedAt = imgs[j + style.slots.length]?.t ?? ge;
        const ar = x.info.width && x.info.height ? x.info.width / x.info.height : 1;
        let w = slot.w * W;
        let h = w / ar;
        if (h > slot.maxH * H) {
          h = slot.maxH * H;
          w = h * ar;
        }
        const left = slot.anchor === "left" ? slot.x * W : slot.anchor === "right" ? slot.x * W - w : slot.x * W - w / 2;
        add({ kind: x.info.type, track: "visual", s: x.t, e: replacedAt, x: left, y: slot.y * H, w, h, z: 10 + j, src: x.info.src, file: x.im.file, mediaStart: 0 });
        covered.push([x.t, replacedAt]);
        stats.visuals++;
      });
    });
    // Occasional wide still above the head, for the strongest reference of the phrase.
    let lastTop = 0;
    for (const t of [...(vis.top || [])].sort((a, b) => a.from - b.from)) {
      const info = media[t.file];
      const r = out(t.from, t.to);
      if (!info || !r) continue;
      const s = Math.max(r.s, lastTop);
      const e = Math.min(Math.max(r.e, s + 0.8), s + style.top.maxSeconds, main);
      if (e - s < 0.5) continue;
      const scale = Math.min((style.top.maxW * W) / info.width, (style.top.maxH * H) / info.height);
      const w = info.width * scale;
      const h = info.height * scale;
      add({ kind: info.type, track: "visual", s, e, x: (W - w) / 2, y: style.top.bottom * H - h, w, h, z: 30, src: info.src, file: t.file, mediaStart: 0, role: "top" });
      lastTop = e;
      stats.visuals++;
    }
  }

  if (style.id === "wordmeme") {
    const c = style.caption;
    const hk = style.hook;
    let hookEnd = 0;
    const title = f.hook ? job.settings.hookText || decisions.hook?.title : "";
    if (title) {
      const firstAfter = outWords.find((w) => w.os >= hk.minSeconds);
      hookEnd = Math.min(firstAfter ? firstAfter.os : hk.minSeconds + 0.2, hk.maxSeconds, main);
      const T = title.toUpperCase();
      text({ s: 0, e: hookEnd, text: T, cx: W / 2, cy: H * hk.titleCy, size: fitSize(T, H * hk.titleSize, W * 0.88, 600, -0.04), weight: 600, tracking: -0.04, color: hk.color, shadow: `0 0 ${Math.round(H * 0.012)}px rgba(245,160,74,.55)`, role: "hook" });
      const d = job.settings.hookText ? {} : decisions.hook || {};
      const spans = [];
      if (d.plain) spans.push({ t: d.plain.toLowerCase(), size: H * hk.plainSize, weight: 700, tracking: -0.04 });
      if (d.script) spans.push({ t: d.script.toLowerCase(), family: "script", size: H * hk.scriptSize, weight: 700 });
      if (spans.length) text({ s: 0, e: hookEnd, spans, join: " ", cx: W / 2, cy: H * hk.lineCy, size: H * hk.plainSize, z: 41, role: "hook" });
      (d.proof || []).slice(0, 2).forEach((file, k, arr) => {
        const info = media[file];
        if (!info) return;
        const w = hk.proof.w * W;
        const x = arr.length === 1 ? (W - w) / 2 : hk.proof.xs[k] * W;
        add({ kind: info.type, track: "visual", s: 0, e: hookEnd, x, y: hk.proof.y * H, w, h: hk.proof.h * H, radius: w * 0.04, z: 2, src: info.src, file, mediaStart: 0, role: "proof" });
      });
    }
    if (f.captions) {
      for (const g of captionGroups(outWords.filter((w) => w.os >= hookEnd - 1e-6), { limits: () => c, fmt: FMT.wordmeme })) {
        text({ s: g.s, e: Math.min(g.e, main), text: g.text, cx: W / 2, cy: H * c.cy, size: fitSize(g.text, H * c.size, W * 0.9, c.weight, c.tracking), weight: c.weight, tracking: c.tracking, from: g.from, to: g.to, role: "caption" });
      }
    }
    const im = style.image;
    const list = (vis.images || []).map((x) => ({ x, info: media[x.file], r: out(x.from, x.to) })).filter((x) => x.info && x.r).sort((a, b) => a.r.s - b.r.s);
    let prevEnd = hookEnd;
    list.forEach(({ x, info, r }, k) => {
      const next = list[k + 1];
      const s = Math.max(r.s, prevEnd);
      let e = next && next.r.s - r.e < 0.5 ? next.r.s : r.e + 0.25;
      e = Math.min(e, s + im.maxSeconds, next ? next.r.s : main, main);
      if (e - s < im.minSeconds) return;
      const w = im.w * W;
      add({ kind: info.type, track: "visual", s, e, x: im.x * W, y: im.y * H, w, h: w, radius: w * im.radius, z: 2, src: info.src, file: x.file, mediaStart: 0 });
      covered.push([s, e]);
      prevEnd = e;
      stats.visuals++;
    });
  }

  if (style.id === "cinematic") {
    const c = style.caption;
    const u = Math.min(H, W * 0.66); // type scales with the short side so vertical exports still fit
    if (f.color) {
      grade = GRADE;
      arollCss = "url(#grade)";
    }
    const cursor = {};
    const place = (file, info, s, e, clipStart) => {
      let mediaStart = 0;
      if (info.type === "video") {
        if (e - s > info.duration - 0.05) e = s + Math.max(0.1, info.duration - 0.05);
        const maxStart = Math.max(0, info.duration - (e - s) - 0.05);
        let st = clipStart ?? cursor[file] ?? 0;
        if (st > maxStart) st = clipStart != null ? maxStart : 0;
        cursor[file] = st + (e - s) + 0.4;
        mediaStart = round(st);
      }
      return { mediaStart, e };
    };
    const shots = (vis.shots || []).map((sh) => ({ sh, info: media[sh.file], r: out(sh.from, sh.to) })).filter((x) => x.info && x.r).map((x) => ({ ...x, s: q(x.r.s), e: q(x.r.e) })).sort((a, b) => a.s - b.s);
    shots.forEach((x, k) => {
      const next = shots[k + 1];
      if (next && (next.s - x.e < 0.3 || x.e > next.s)) x.e = next.s; // no 2-frame flashes of the a-roll between shots
      x.e = Math.min(x.e, q(main));
    });
    const placed = [];
    for (const x of shots) {
      if (x.e - x.s < frame * 1.5) continue;
      const p = place(x.sh.file, x.info, x.s, x.e, x.sh.clipStart);
      const whip = Boolean(x.sh.transition) && x.s > 0.3;
      const o = add({ kind: x.info.type, track: "visual", s: x.s, e: p.e, x: 0, y: 0, w: W, h: H, z: 2, src: x.info.src, file: x.sh.file, mediaStart: p.mediaStart, grade: Boolean(grade), whip: whip ? { at: round(x.s + frame), seconds: round(style.whipFrames * frame) } : null });
      if (whip) {
        add({ kind: "solid", track: "fx", s: x.s, e: x.s + frame, x: 0, y: 0, w: W, h: H, color: "#fff", z: 35 }); // one pure white frame
        if (whoosh) sfx.push({ kind: "whoosh", src: whoosh.src, s: round(Math.max(0, x.s - 0.12)), e: round(Math.max(0, x.s - 0.12) + whoosh.duration), volume: 0.3 });
      }
      placed.push(o);
      covered.push([o.s, o.e]);
      stats.visuals++;
    }
    if (f.captions) {
      // Shots sit on the frame grid, words do not: a word that starts a hair before the cut still belongs to the new shot.
      const shotAt = (t) => placed.findIndex((o) => t + frame * 0.6 >= o.s && t + frame * 0.6 < o.e);
      const groups = captionGroups(outWords, { limits: (key) => (key >= 0 ? c.broll : c.aroll), keyOf: (w) => shotAt(w.os), fmt: FMT.cinematic });
      for (const g of groups) {
        const onBroll = g.key >= 0;
        const limit = onBroll ? placed[g.key].e : (placed.find((o) => o.s > g.s)?.s ?? main);
        const e = Math.min(g.e, limit, main);
        if (onBroll) g.s = Math.max(g.s, placed[g.key].s);
        if (onBroll) {
          const calm = vis.calmFrom != null && g.from >= vis.calmFrom;
          const size = (calm ? c.calm.size : c.broll.size) * u;
          text({ s: g.s, e, text: g.text, cx: W / 2, cy: H * c.broll.cy, size: fitSize(g.text, size, W * 0.9, c.broll.weight, c.broll.tracking), weight: c.broll.weight, tracking: c.broll.tracking, shadow: "0 2px 18px rgba(0,0,0,.18)", from: g.from, to: g.to, role: "caption" });
        } else {
          text({ s: g.s, e, text: g.text, cx: W / 2, cy: H * c.aroll.cy, size: c.aroll.size * u, weight: c.aroll.weight, italic: true, shadow: "0 1px 6px rgba(0,0,0,.45)", from: g.from, to: g.to, role: "caption" });
        }
      }
    }
    // Closing shot: one long plan with no text after the last word.
    const outro = vis.outro && media[vis.outro.file];
    if (outro) {
      const len = Math.min(Math.max(1, vis.outro.seconds || 2.5), style.maxOutroSeconds);
      const p = place(vis.outro.file, outro, q(main), q(main) + len, vis.outro.clipStart);
      add({ kind: outro.type, track: "visual", s: q(main), e: p.e, x: 0, y: 0, w: W, h: H, z: 2, src: outro.src, file: vis.outro.file, mediaStart: p.mediaStart, grade: Boolean(grade), role: "outro" });
      extra += p.e - q(main);
      stats.visuals++;
    }
  }

  // Optional end card. Static like everything else: it cuts in, it does not animate.
  const ctaText = f.cta ? job.settings.ctaText || decisions.cta?.text : "";
  if (ctaText) {
    const s = main + extra;
    const e = s + CTA_DURATION;
    const u = Math.min(H, W);
    add({ kind: "solid", track: "fx", s, e, x: 0, y: 0, w: W, h: H, color: "#000", z: 50 });
    text({ s, e, text: ctaText, cx: W / 2, cy: H * 0.48, size: u * 0.06, weight: 600, tracking: -0.02, wrap: true, maxW: W * 0.8, z: 51, role: "cta" });
    const sub = job.settings.ctaText ? "" : decisions.cta?.sub;
    if (sub) text({ s, e, text: sub, cx: W / 2, cy: H * 0.48 + u * 0.085, size: u * 0.03, weight: 300, wrap: true, maxW: W * 0.8, z: 51, role: "cta" });
    extra += CTA_DURATION;
  }

  const duration = q(main + extra);
  // Snap to the frame grid so hard cuts land on exact frames; drop anything shorter than a frame.
  const finalOverlays = overlays
    .map((o) => ({ ...o, s: round(q(o.s)), e: round(Math.min(q(o.e), duration)) }))
    .filter((o) => o.e - o.s >= frame * 0.9)
    .sort((a, b) => a.s - b.s || (a.z ?? 0) - (b.z ?? 0));

  // Share of the spoken part that has a visual on screen (union of intervals).
  covered.sort((a, b) => a[0] - b[0]);
  let cov = 0;
  let end = 0;
  for (const [s, e] of covered) {
    if (e > end) {
      cov += e - Math.max(s, end);
      end = e;
    }
  }
  stats.visualCoverage = main ? round(Math.min(1, cov / main)) : 0;
  stats.captions = finalOverlays.filter((o) => o.role === "caption").length;

  return {
    jobId: job.id,
    style: style.id,
    styleName: style.name,
    format,
    width: W,
    height: H,
    fps,
    duration: round(duration),
    mainDuration: main,
    sourceDuration: edl.sourceDuration,
    segments: edl.segments,
    cuts: edl.cuts,
    aroll: { src: assets.aroll, voice: f.enhanceAudio ? assets.voice || null : null, css: arollCss },
    grade,
    words: words.map((w) => {
      const ow = outByIndex.get(w.i);
      return { i: w.i, w: w.w, s: w.s, e: w.e, removed: removed.has(w.i), reason: reasons.get(w.i) || null, os: ow ? ow.os : null, oe: ow ? ow.oe : null };
    }),
    overlays: finalOverlays,
    music: f.music && assets.music ? { src: assets.music, volume: style.musicVolume, fadeOut: 1.5 } : null,
    sfx,
    loudness: style.loudness,
    edits: { removed: edits?.removed || [], restored: edits?.restored || [] },
    stats,
  };
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

export { srcToOut };
