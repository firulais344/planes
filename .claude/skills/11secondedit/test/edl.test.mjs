import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEdl, srcToOut, outToSrc, validateEdl, removedWords } from "../lib/edl.mjs";
import { normalizeWords, normalizeWhisperX, detectFillers } from "../lib/transcript.mjs";

// Deterministic PRNG so failures are reproducible.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function fakeWords(r, count) {
  const words = [];
  let t = 0.2 + r() * 1.5;
  for (let i = 0; i < count; i++) {
    const len = 0.05 + r() * 0.6;
    words.push({ i, w: `w${i}`, s: +t.toFixed(3), e: +(t + len).toFixed(3) });
    t += len + (r() < 0.2 ? r() * 2 : r() * 0.15);
  }
  return { words, duration: +(t + r() * 2).toFixed(3) };
}

test("never cuts mid-word, never leaks removed words (randomized)", () => {
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const { words, duration } = fakeWords(r, 5 + Math.floor(r() * 80));
    const removed = new Set(words.filter(() => r() < 0.3).map((w) => w.i));
    if (removed.size === words.length) removed.delete(0);
    for (const silences of [true, false]) {
      const edl = buildEdl(words, removed, { duration, silences });
      validateEdl(edl, words, removed); // throws on violation
      let o = 0;
      for (const seg of edl.segments) {
        assert.ok(seg.e > seg.s);
        assert.ok(Math.abs(seg.o - o) < 0.002);
        o += seg.e - seg.s;
      }
      assert.ok(edl.duration <= duration + 1e-6);
    }
  }
});

test("removes long silences but keeps padding around speech", () => {
  const words = [
    { i: 0, w: "hello", s: 1.0, e: 1.4 },
    { i: 1, w: "world", s: 3.0, e: 3.5 },
  ];
  const edl = buildEdl(words, new Set(), { duration: 6, silences: true });
  assert.deepEqual(edl.segments.map((s) => [s.s, s.e]), [[0.88, 1.52], [2.88, 3.62]]);
  const off = buildEdl(words, new Set(), { duration: 6, silences: false });
  assert.equal(off.segments.length, 1);
});

test("source/output time mapping round-trips inside kept segments", () => {
  const words = [
    { i: 0, w: "a", s: 0.5, e: 0.9 },
    { i: 1, w: "um", s: 1.0, e: 1.3 },
    { i: 2, w: "b", s: 1.4, e: 1.8 },
  ];
  const edl = buildEdl(words, new Set([1]), { duration: 2.5, silences: true });
  const t = srcToOut(edl, 1.5);
  assert.ok(Math.abs(outToSrc(edl, t) - 1.5) < 1e-6);
  assert.ok(Math.abs(srcToOut(edl, 1.1) - edl.segments[1].o) < 1e-9); // inside a cut → next segment start
});

test("editor restore overrides an AI cut", () => {
  const words = Array.from({ length: 6 }, (_, i) => ({ i, w: `w${i}`, s: i, e: i + 0.5 }));
  const reasons = removedWords({ words, badTakes: { cuts: [{ from: 1, to: 3, reason: "x" }] }, edits: { removed: [5], restored: [2] } });
  assert.deepEqual([...reasons.keys()].sort(), [1, 3, 5]);
});

test("normalizes overlapping and untimed WhisperX words", () => {
  const raw = { segments: [{ start: 0, end: 3, words: [
    { word: "I", start: 0.1, end: 0.5 },
    { word: "have", start: 0.4, end: 0.8 },
    { word: "25" },
    { word: "dogs", start: 1.6, end: 2.0 },
  ] }] };
  const w = normalizeWhisperX(raw, 3);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].s >= w[i - 1].e, `word ${i} overlaps`);
  assert.equal(w[2].interpolated, true);
  assert.ok(w[2].s >= 0.45 && w[2].e <= 1.6);
});

test("detects fillers in English and Spanish", () => {
  const words = normalizeWords(["Um,", "so", "o", "sea", "I", "like", "eh", "pizza"].map((w, i) => ({ w, s: i, e: i + 0.5 })));
  const { auto, candidates } = detectFillers(words);
  assert.deepEqual(auto, [0, 6]);
  assert.deepEqual(candidates, [[1], [2, 3], [5]]);
});
