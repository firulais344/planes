import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModel, captionGroups } from "../lib/model.mjs";
import { renderCompositionHtml } from "../lib/composition.mjs";
import { validateDecision, stepsFor } from "../lib/steps.mjs";
import { DEFAULT_SETTINGS } from "../lib/job.mjs";

const text = "So today I want to show you how I edit my videos um in eleven seconds and it is like really easy".split(" ");
const words = text.map((w, i) => ({ i, w, s: 0.5 + i * 0.4, e: 0.5 + i * 0.4 + 0.3 }));

function inputs(over = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  Object.assign(settings, over.settings || {});
  return {
    job: { id: "t", settings },
    words,
    assets: {
      aroll: "media/aroll.mp4", voice: "media/voice.wav", sourceDuration: 10, colorFilter: "brightness(1.1)",
      broll: { "b.mp4": { type: "video", src: "media/broll/b.mp4", duration: 3 } },
      sfx: { whoosh: { src: "media/sfx/whoosh.wav", duration: 0.55 }, pop: { src: "media/sfx/pop.wav", duration: 0.18 }, ding: { src: "media/sfx/ding.wav", duration: 1 } },
      music: "media/music.mp3",
    },
    edits: { removed: [], restored: [] },
    decisions: {
      badTakes: { cuts: [{ from: 0, to: 1, reason: "restart" }] },
      fillers: { remove: [19] },
      broll: { placements: [{ file: "b.mp4", from: 8, to: 12 }] },
      zooms: { zooms: [{ from: 13, to: 15, scale: 1.2 }] },
      hook: { text: "Edit in 11 seconds" },
      cta: { text: "Follow for more", sub: "New tips weekly" },
      music: { prompt: "lofi" },
      ...over.decisions,
    },
  };
}

test("model removes AI cuts + auto fillers and places everything in output time", () => {
  const m = computeModel(inputs());
  const removed = m.words.filter((w) => w.removed).map((w) => w.i);
  assert.deepEqual(removed, [0, 1, 12, 19]); // bad take, "um" (auto), "like" (Claude)
  assert.ok(m.hook && m.hook.s === 0);
  assert.ok(m.cta && Math.abs(m.cta.s - m.mainDuration) < 1e-9 && m.duration > m.mainDuration);
  assert.equal(m.broll.length, 1);
  assert.ok(m.broll[0].s >= m.hook.e, "b-roll never covers the hook");
  assert.ok(m.broll[0].e - m.broll[0].s <= 3, "b-roll never longer than the clip");
  assert.equal(m.zooms.length, 1);
  assert.ok(m.sfx.some((s) => s.kind === "pop") && m.sfx.some((s) => s.kind === "ding"));
  for (const g of m.captions) for (const w of g.words) assert.ok(w.s >= g.s - 1e-9 && w.s < g.e);
});

test("disabled features leave no trace", () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const k of Object.keys(settings.features)) settings.features[k] = false;
  const m = computeModel(inputs({ settings }));
  assert.equal(m.words.filter((w) => w.removed).length, 0);
  assert.equal(m.segments.length, 1);
  assert.deepEqual([m.hook, m.cta, m.music, m.aroll.voice, m.aroll.filter], [null, null, null, null, null]);
  assert.equal(m.captions.length + m.zooms.length + m.broll.length + m.sfx.length, 0);
});

test("editor restore brings back a word Claude cut", () => {
  const i = inputs();
  i.edits = { removed: [5], restored: [1] };
  const m = computeModel(i);
  assert.equal(m.words[1].removed, false);
  assert.equal(m.words[5].removed, true);
  assert.equal(m.words[5].reason, "Deleted in editor");
});

test("composition HTML is a valid HyperFrames root with one clip per kept segment", () => {
  const m = computeModel(inputs());
  const html = renderCompositionHtml(m);
  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /window\.__timelines\["main"\] = tl/);
  assert.equal((html.match(/class="clip aroll"/g) || []).length, m.segments.length);
  assert.equal((html.match(/<audio id="v\d+"/g) || []).length, m.segments.length, "enhanced voice follows the same cuts");
  assert.match(html, /muted data-start/); // video muted because enhanced voice carries the speech
  assert.match(html, /width=1080, height=1920/);
  assert.ok(!/Math\.random|Date\.now/.test(html), "deterministic");
  const m169 = computeModel(inputs({ settings: { format: "16:9" } }));
  assert.match(renderCompositionHtml(m169), /width=1920, height=1080/);
});

test("captions group at most 3 words and break on punctuation and length", () => {
  const ow = ["Hi,", "this", "is", "a", "test", "of", "captions."].map((w, i) => ({ w, os: i * 0.3, oe: i * 0.3 + 0.25 }));
  const g = captionGroups(ow, 3);
  assert.deepEqual(g.map((x) => x.words.map((w) => w.w).join(" ")), ["Hi", "this is a", "test of", "captions."]);
});

test("decision validation rejects bad indices, overlaps and unknown b-roll", () => {
  const ctx = { words, brollFiles: ["b.mp4"] };
  assert.throws(() => validateDecision("badTakes", { cuts: [{ from: 3, to: 99 }] }, ctx), /out of range/);
  assert.throws(() => validateDecision("zooms", { zooms: [{ from: 1, to: 4 }, { from: 4, to: 6 }] }, ctx), /overlap/);
  assert.throws(() => validateDecision("zooms", { zooms: [{ from: 1, to: 4, scale: 3 }] }, ctx), /scale/);
  assert.throws(() => validateDecision("broll", { placements: [{ file: "nope.mp4", from: 1, to: 2 }] }, ctx), /not an uploaded/);
  assert.deepEqual(validateDecision("fillers", { remove: [3, 3, 1] }, ctx), { remove: [1, 3] });
});

test("user-provided hook/CTA text turns the step into a script step", () => {
  const settings = { ...structuredClone(DEFAULT_SETTINGS), hookText: "My hook" };
  const steps = stepsFor({ settings });
  assert.equal(steps.find((s) => s.id === "hook").kind, "script");
  assert.equal(steps.find((s) => s.id === "cta").kind, "claude");
});
