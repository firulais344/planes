// Edit decision list: which parts of the ORIGINAL video survive, and how source time maps
// to output time. Rule: a cut point may only sit between words, never inside one.

const EPS = 0.001;
const round = (n) => Math.round(n * 1000) / 1000;

export const EDL_DEFAULTS = {
  maxGap: 0.45, // silences longer than this get trimmed (when "Remove silences" is on)
  pad: 0.12, // breathing room kept before/after speech at every cut
  minCut: 0.08, // pure-silence cuts shorter than this are not worth a jump cut
  minSegment: 0.12,
};

/**
 * Collect every removed word index with the reason it was removed.
 * Later sources win, so a manual "restore" in the editor overrides an AI cut.
 */
export function removedWords({ words, badTakes, fillers, fillerAuto = [], edits }) {
  const reasons = new Map();
  for (const c of badTakes?.cuts || []) for (let i = c.from; i <= c.to; i++) reasons.set(i, `Bad take: ${c.reason}`);
  for (const i of fillerAuto) reasons.set(i, "Filler word");
  for (const i of fillers?.remove || []) reasons.set(i, "Filler word");
  for (const i of edits?.removed || []) reasons.set(i, "Deleted in editor");
  for (const i of edits?.restored || []) reasons.delete(i);
  for (const i of reasons.keys()) if (i < 0 || i >= words.length) reasons.delete(i);
  return reasons;
}

/**
 * Build the EDL.
 * @param words normalized words (sorted, non-overlapping)
 * @param removed Set or Map of removed word indices
 * @returns {{ segments: {s,e,o}[], cuts: {s,e,kind}[], duration, sourceDuration }}
 *   segments are kept source ranges; `o` is where the segment starts in the output.
 */
export function buildEdl(words, removed, { duration, silences = true, ...opts } = {}) {
  const o = { ...EDL_DEFAULTS, ...opts };
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("buildEdl: source duration is required");
  const isRemoved = (i) => removed.has(i);
  const kept = words.filter((w) => !isRemoved(w.i));
  if (!words.length) return finalize([{ s: 0, e: duration }], [], duration);
  if (!kept.length) throw new Error("Every word was removed — nothing left to edit.");

  const cuts = [];
  // Walk the word list; whenever we hit a run of removed words, cut it between its kept neighbours.
  let k = 0;
  while (k < words.length) {
    if (!isRemoved(words[k].i)) {
      k++;
      continue;
    }
    let j = k;
    while (j + 1 < words.length && isRemoved(words[j + 1].i)) j++;
    const prev = k > 0 ? words[k - 1] : null;
    const next = j + 1 < words.length ? words[j + 1] : null;
    const first = words[k];
    const last = words[j];
    let a;
    let b;
    if (prev) a = clamp(prev.e + o.pad, prev.e, first.s);
    else a = silences ? 0 : first.s;
    if (next) b = clamp(next.s - o.pad, last.e, next.s);
    else b = silences ? duration : last.e;
    if (b > a) cuts.push({ s: a, e: b, kind: "words" });
    k = j + 1;
  }

  if (silences) {
    // Long pauses between two kept words that sit next to each other.
    for (let k2 = 1; k2 < words.length; k2++) {
      const p = words[k2 - 1];
      const n = words[k2];
      if (isRemoved(p.i) || isRemoved(n.i)) continue;
      const gap = n.s - p.e;
      if (gap > Math.max(o.maxGap, 2 * o.pad + o.minCut)) cuts.push({ s: p.e + o.pad, e: n.s - o.pad, kind: "silence" });
    }
    const firstWord = words[0];
    const lastWord = words[words.length - 1];
    if (!isRemoved(firstWord.i) && firstWord.s - o.pad > o.minCut) cuts.push({ s: 0, e: firstWord.s - o.pad, kind: "silence" });
    if (!isRemoved(lastWord.i) && duration - (lastWord.e + o.pad) > o.minCut) cuts.push({ s: lastWord.e + o.pad, e: duration, kind: "silence" });
  }

  // Merge overlapping/touching cuts, drop silence cuts too short to matter.
  cuts.sort((x, y) => x.s - y.s);
  const merged = [];
  for (const c of cuts) {
    const top = merged[merged.length - 1];
    if (top && c.s <= top.e + EPS) {
      top.e = Math.max(top.e, c.e);
      if (c.kind === "words") top.kind = "words";
    } else merged.push({ ...c });
  }
  const finalCuts = merged.filter((c) => c.kind === "words" || c.e - c.s >= o.minCut);

  // Complement → kept segments.
  const segments = [];
  let t = 0;
  for (const c of finalCuts) {
    if (c.s - t > EPS) segments.push({ s: t, e: c.s });
    t = Math.max(t, c.e);
  }
  if (duration - t > EPS) segments.push({ s: t, e: duration });
  // Tiny slivers between two cuts (no full word inside) are glued into the cut.
  const segs = segments.filter((s) => s.e - s.s >= o.minSegment || words.some((w) => !isRemoved(w.i) && w.s >= s.s - EPS && w.e <= s.e + EPS));
  const edl = finalize(segs, finalCuts, duration);
  validateEdl(edl, words, removed);
  return edl;
}

function clamp(v, lo, hi) {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function finalize(segments, cuts, sourceDuration) {
  let o = 0;
  const segs = segments.map((s) => {
    const seg = { s: round(s.s), e: round(s.e), o: round(o) };
    o += seg.e - seg.s;
    return seg;
  });
  return { segments: segs, cuts: cuts.map((c) => ({ s: round(c.s), e: round(c.e), kind: c.kind })), duration: round(o), sourceDuration: round(sourceDuration) };
}

/** Hard guarantees. Throws if any cut lands inside a word or a removed word leaks into the output. */
export function validateEdl(edl, words, removed) {
  const bounds = [];
  for (const seg of edl.segments) {
    if (seg.s > EPS) bounds.push(seg.s);
    if (seg.e < edl.sourceDuration - EPS) bounds.push(seg.e);
  }
  for (const t of bounds) {
    const w = words.find((x) => t > x.s + EPS && t < x.e - EPS);
    if (w) throw new Error(`EDL invariant broken: cut at ${t}s falls inside word [${w.i}] "${w.w}" (${w.s}–${w.e})`);
  }
  for (const w of words) {
    const inside = edl.segments.some((seg) => w.s >= seg.s - EPS && w.e <= seg.e + EPS);
    const overlap = edl.segments.reduce((acc, seg) => acc + Math.max(0, Math.min(seg.e, w.e) - Math.max(seg.s, w.s)), 0);
    if (!removed.has(w.i) && !inside) throw new Error(`EDL invariant broken: kept word [${w.i}] "${w.w}" is not fully inside one segment`);
    if (removed.has(w.i) && overlap > 0.002) throw new Error(`EDL invariant broken: removed word [${w.i}] "${w.w}" is still audible`);
  }
}

/** Source time → output time. Times inside a cut snap to the start of the next kept segment. */
export function srcToOut(edl, t) {
  for (const seg of edl.segments) {
    if (t < seg.s) return seg.o;
    if (t <= seg.e) return round(seg.o + (t - seg.s));
  }
  return edl.duration;
}

export function outToSrc(edl, t) {
  for (const seg of edl.segments) {
    const len = seg.e - seg.s;
    if (t <= seg.o + len) return seg.s + Math.max(0, t - seg.o);
  }
  const last = edl.segments[edl.segments.length - 1];
  return last ? last.e : 0;
}

/** Kept words with output-time positions. */
export function outputWords(words, removed, edl) {
  return words.filter((w) => !removed.has(w.i)).map((w) => ({ ...w, os: srcToOut(edl, w.s), oe: srcToOut(edl, w.e) }));
}

/**
 * Map a word range (from AI decisions) to output time, tolerating ranges whose
 * edge words were cut later: it shrinks to the kept words inside the range.
 */
export function rangeToOut(words, removed, edl, from, to) {
  const keptIn = words.filter((w) => w.i >= from && w.i <= to && !removed.has(w.i));
  if (!keptIn.length) return null;
  const s = srcToOut(edl, keptIn[0].s);
  const e = srcToOut(edl, keptIn[keptIn.length - 1].e);
  return e > s ? { s, e } : null;
}
