import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModel, captionGroups } from "../lib/model.mjs";
import { renderCompositionHtml } from "../lib/composition.mjs";
import { validateDecision, stepsFor } from "../lib/steps.mjs";
import { defaultSettings, mergeSettings } from "../lib/job.mjs";
import { STYLES, pickFps } from "../lib/styles.mjs";

const text = "So today I want to show you how I edit my videos um in eleven seconds. And it is like really easy, you only need three things: light, sound and a story.".split(" ");
const words = text.map((w, i) => ({ i, w, s: 0.5 + i * 0.4, e: 0.5 + i * 0.4 + 0.3 }));
const img = (name, w = 800, h = 1000) => [name, { type: "image", src: `media/img/${name}`, width: w, height: h }];
const clip = (name, d = 6) => [name, { type: "video", src: `media/broll/${name}`, width: 1920, height: 1080, duration: d }];
const media = Object.fromEntries([img("a.jpg"), img("b.jpg", 1000, 1000), img("c.jpg"), img("d.jpg"), img("wide.jpg", 1600, 900), clip("city.mp4"), clip("hands.mp4", 3)]);

function inputs(style, { features = {}, settings = {}, decisions = {}, edits } = {}) {
  const s = mergeSettings(defaultSettings(style), { style, features, ...settings });
  return {
    job: { id: "t", settings: s },
    words,
    assets: { aroll: "media/aroll.mp4", voice: "media/voice.wav", sourceDuration: 14, video: { fps: 30 }, colorFilter: "brightness(1.1)", media, sfx: { whoosh: { src: "media/sfx/whoosh.wav", duration: 0.55 } }, music: "media/music.mp3" },
    edits: edits || { removed: [], restored: [] },
    decisions: { badTakes: { cuts: [{ from: 0, to: 1, reason: "restart" }] }, fillers: { remove: [18] }, ...decisions },
  };
}

const collageDecision = {
  groups: [
    { from: 2, to: 14, images: [{ file: "a.jpg", at: 2 }, { file: "b.jpg", at: 6 }, { file: "c.jpg", at: 10 }, { file: "d.jpg", at: 13 }] },
  ],
  top: [{ file: "wide.jpg", from: 3, to: 8 }],
};

test("collage: images pile up on their word, the 4th replaces the 1st, nothing overflows the frame", () => {
  const m = computeModel(inputs("collage", { decisions: { visuals: collageDecision } }));
  assert.equal(m.style, "collage");
  assert.deepEqual([m.width, m.height], [1080, 1920]);
  const removed = m.words.filter((w) => w.removed).map((w) => w.i);
  assert.deepEqual(removed, [0, 1, 12, 18]); // bad take, "um" (auto), "like" (Claude)
  const imgs = m.overlays.filter((o) => o.track === "visual" && o.role !== "top");
  assert.equal(imgs.length, 4);
  assert.ok(imgs[0].s < imgs[1].s && imgs[1].s < imgs[2].s && imgs[2].s < imgs[3].s, "one after another");
  assert.ok(Math.abs(imgs[0].e - imgs[3].s) < 0.05, "the 4th image takes the slot of the 1st");
  assert.ok(Math.abs(imgs[3].x - imgs[0].x) < 1);
  for (const o of imgs) {
    assert.ok(o.y >= 1920 * 0.6 && o.y + o.h <= 1920 * 0.985, "inside the lower third");
    assert.ok(o.x >= 0 && o.x + o.w <= 1080);
    assert.ok(!o.radius, "straight corners");
  }
  const top = m.overlays.find((o) => o.role === "top");
  assert.ok(top && top.y + top.h <= 1920 * 0.32 && top.e - top.s <= 3.5 + 1e-6);
  const caps = m.overlays.filter((o) => o.role === "caption");
  assert.ok(caps.length > 3);
  for (const c of caps) {
    assert.ok(c.text.split(" ").length <= 4, `"${c.text}" has more than 4 words`);
    assert.ok(!/[.,]$/.test(c.text), "no closing period");
    assert.equal(c.weight, 300);
  }
});

test("word + meme: one image at a time, max 3 s, lowercase 1–2 word captions, hook first", () => {
  const visuals = { images: [{ file: "a.jpg", from: 4, to: 9 }, { file: "b.jpg", from: 10, to: 16 }, { file: "c.jpg", from: 17, to: 30 }] };
  const m = computeModel(inputs("wordmeme", { decisions: { visuals, hook: { title: "Edita", plain: "en", script: "once segundos", proof: ["a.jpg", "b.jpg"] } } }));
  const hook = m.overlays.filter((o) => o.role === "hook");
  assert.equal(hook.length, 2);
  assert.equal(hook[0].text, "EDITA");
  assert.equal(hook[0].s, 0);
  const hookEnd = hook[0].e;
  assert.ok(hookEnd >= 1.2 && hookEnd <= 1.7);
  assert.equal(m.overlays.filter((o) => o.role === "proof").length, 2);
  const imgs = m.overlays.filter((o) => o.track === "visual" && !o.role);
  for (let k = 0; k < imgs.length; k++) {
    const o = imgs[k];
    assert.ok(o.s >= hookEnd - 1e-6, "no image under the hook");
    assert.ok(o.e - o.s <= 3 + 1e-6, "never on screen more than 3 s");
    assert.ok(Math.abs(o.w - o.h) < 0.01 && o.radius > 0, "square with rounded corners");
    if (k) assert.ok(o.s >= imgs[k - 1].e - 1e-6, "one at a time");
  }
  for (const c of m.overlays.filter((o) => o.role === "caption")) {
    assert.ok(c.s >= hookEnd - 1e-6);
    assert.ok(c.text.split(" ").length <= 2);
    assert.equal(c.text, c.text.toLowerCase());
    assert.ok(!/[.,:;!?]/.test(c.text), `"${c.text}" has punctuation`);
  }
});

test("cinematic: shots never overlap, big centre word on b-roll, italics on a-roll, whip + outro", () => {
  const visuals = {
    shots: [
      { file: "city.mp4", from: 5, to: 11 },
      { file: "hands.mp4", from: 27, to: 27, transition: true },
      { file: "city.mp4", from: 28, to: 28 },
      { file: "hands.mp4", from: 29, to: 32 },
    ],
    calmFrom: 29,
    outro: { file: "city.mp4", seconds: 2 },
  };
  const m = computeModel(inputs("cinematic", { features: { sfx: true }, decisions: { visuals } }));
  assert.deepEqual([m.width, m.height], [1620, 1080]);
  const shots = m.overlays.filter((o) => o.track === "visual" && o.role !== "outro");
  assert.equal(shots.length, 4);
  for (let k = 1; k < shots.length; k++) assert.ok(shots[k].s >= shots[k - 1].e - 1e-6, "shots do not overlap");
  assert.ok(Math.abs(shots[1].e - shots[2].s) < 1e-6, "burst shots are butted together");
  assert.ok(shots[2].mediaStart > 0, "a reused clip continues instead of restarting");
  for (const o of shots) assert.ok(o.mediaStart + (o.e - o.s) <= media[o.file].duration + 1e-6, "never reads past the end of a clip");
  assert.ok(shots[1].whip && !shots[0].whip);
  assert.equal(m.overlays.filter((o) => o.kind === "solid" && o.color === "#fff").length, 1, "one white frame per whip");
  assert.equal(m.sfx.length, 1);
  assert.ok(m.grade && m.aroll.css === "url(#grade)");
  const caps = m.overlays.filter((o) => o.role === "caption");
  const onBroll = (c) => shots.some((o) => c.s >= o.s - 1e-6 && c.s < o.e);
  const big = caps.filter((c) => onBroll(c) && !c.italic);
  const small = caps.filter((c) => !onBroll(c));
  assert.ok(big.length && small.length);
  for (const c of small) assert.ok(c.italic && c.cy > 1080 * 0.9);
  for (const c of big) assert.ok(Math.abs(c.cy - 1080 * 0.505) < 1 && c.text.split(" ").length <= 2);
  assert.ok(big.some((c) => /\.$/.test(c.text)), "keeps the period that closes a phrase");
  const sizes = big.map((c) => c.size);
  assert.ok(Math.min(...sizes) < Math.max(...sizes) / 2, "calm section drops to small text");
  const said = m.words.filter((w) => !w.removed).map((w) => w.w.replace(/[^\p{L}\p{N}]/gu, "")).join(" ");
  const shown = caps.map((c) => c.text.replace(/[^\p{L}\p{N} ]/gu, "")).join(" ");
  assert.equal(shown, said, "every spoken word is captioned exactly once, even at shot boundaries");
  const outro = m.overlays.find((o) => o.role === "outro");
  assert.ok(outro && Math.abs(outro.s - m.mainDuration) < 0.05 && m.duration > m.mainDuration + 1.9);
  assert.ok(!m.overlays.some((o) => o.kind === "text" && o.e > outro.s + 1e-6), "no text over the closing shot");
});

test("overlays sit on the frame grid and inside the video", () => {
  for (const [style, visuals] of [["collage", collageDecision], ["wordmeme", { images: [{ file: "a.jpg", from: 4, to: 9 }] }], ["cinematic", { shots: [{ file: "city.mp4", from: 5, to: 11 }] }]]) {
    const m = computeModel(inputs(style, { decisions: { visuals } }));
    for (const o of m.overlays) {
      assert.ok(Math.abs(o.s * m.fps - Math.round(o.s * m.fps)) < 1e-3, `${style}: start on a frame`);
      assert.ok(o.e > o.s && o.e <= m.duration + 1e-6);
    }
  }
});

test("disabled features leave no trace", () => {
  const off = Object.fromEntries(Object.keys(STYLES.cinematic.features).map((k) => [k, false]));
  const m = computeModel(inputs("cinematic", { features: off, decisions: { visuals: { shots: [{ file: "city.mp4", from: 5, to: 11 }] } } }));
  assert.equal(m.words.filter((w) => w.removed).length, 0);
  assert.equal(m.segments.length, 1);
  assert.deepEqual([m.music, m.aroll.voice, m.aroll.css, m.grade], [null, null, "", null]);
  assert.equal(m.overlays.length + m.sfx.length, 0);
});

test("a style cannot switch on a feature it does not have", () => {
  const s = mergeSettings(defaultSettings("collage"), { style: "collage", features: { hook: true, sfx: true, zooms: true }, format: "16:9", hookText: "x" });
  assert.ok(!("hook" in s.features) && !("sfx" in s.features) && !("zooms" in s.features));
  assert.equal(s.format, "9:16");
  assert.equal(s.hookText, "");
  assert.ok(!stepsFor({ settings: s }).some((st) => ["hook", "sfx", "zooms"].includes(st.id)));
  assert.equal(mergeSettings(defaultSettings("cinematic"), { style: "cinematic", format: "16:9" }).format, "16:9");
});

test("editor restore brings back a word Claude cut", () => {
  const m = computeModel(inputs("collage", { edits: { removed: [5], restored: [1] } }));
  assert.equal(m.words[1].removed, false);
  assert.equal(m.words[5].removed, true);
  assert.equal(m.words[5].reason, "Deleted in editor");
});

test("composition is a valid HyperFrames root with hard cuts only", () => {
  const m = computeModel(inputs("collage", { decisions: { visuals: collageDecision } }));
  const html = renderCompositionHtml(m);
  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /data-fps="30"/);
  assert.match(html, /window\.__timelines\["main"\] = tl/);
  assert.equal((html.match(/class="clip aroll"/g) || []).length, m.segments.length);
  assert.equal((html.match(/<audio id="v\d+"/g) || []).length, m.segments.length, "enhanced voice follows the same cuts");
  assert.match(html, /font-family: "Inter"; font-weight: 300/);
  assert.ok(!/Math\.random|Date\.now/.test(html), "deterministic");
  assert.ok(!/tl\.(from|to|fromTo)\(/.test(html), "no animation at all outside the cinematic whip");
  assert.ok(!/text-stroke|#FFE14D/i.test(html), "no outlined or highlighted captions");
  for (const tag of html.match(/<(?:div|img|video)[^>]*class="clip ov[^>]*>/g)) {
    const style = tag.match(/ style="([^"]*)"/)[1];
    assert.ok(/z-index:\d+(;|$)/.test(style), `integer z-index in ${tag.slice(0, 40)}`);
    if (tag.includes("ov-text")) assert.ok(style.includes("font-size:") && style.includes("color:#fff"), "text styles survive inside the style attribute");
  }
  const c = computeModel(inputs("cinematic", { decisions: { visuals: { shots: [{ file: "city.mp4", from: 5, to: 11 }, { file: "hands.mp4", from: 20, to: 24, transition: true }] } } }));
  const ch = renderCompositionHtml(c);
  assert.match(ch, /<filter id="grade"/);
  assert.equal((ch.match(/tl\.fromTo\(/g) || []).length, 2, "the whip is the only motion");
  assert.match(ch, /width=1620, height=1080/);
});

test("caption groups respect word and character limits and break on punctuation", () => {
  const ow = ["Hi,", "this", "is", "a", "test", "of", "captions."].map((w, i) => ({ i, w, os: i * 0.3, oe: i * 0.3 + 0.25 }));
  const g = captionGroups(ow, { limits: () => ({ maxWords: 3, maxChars: 16 }), fmt: (w) => w.replace(/[.,]$/, "") });
  assert.deepEqual(g.map((x) => x.text), ["Hi", "this is a", "test of captions"]);
  assert.ok(Math.abs(g[0].e - g[1].s) < 1e-9, "hard cut straight into the next phrase");
});

test("decision validation is style-aware and rejects bad input", () => {
  const ctx = (style) => ({ words, mediaFiles: Object.keys(media), style });
  assert.throws(() => validateDecision("badTakes", { cuts: [{ from: 3, to: 99 }] }, ctx("collage")), /out of range/);
  assert.throws(() => validateDecision("visuals", { images: [{ file: "nope.jpg", from: 1, to: 2 }] }, ctx("wordmeme")), /not an uploaded/);
  assert.throws(() => validateDecision("visuals", { images: [{ file: "a.jpg", from: 1, to: 4 }, { file: "b.jpg", from: 4, to: 6 }] }, ctx("wordmeme")), /overlap/);
  assert.throws(() => validateDecision("visuals", { groups: [{ from: 2, to: 9, images: [{ file: "a.jpg", at: 12 }] }] }, ctx("collage")), /inside the group/);
  assert.throws(() => validateDecision("visuals", { shots: [1, 2, 3, 4].map((k) => ({ file: "city.mp4", from: k * 2, to: k * 2, transition: true })) }, ctx("cinematic")), /too many/);
  assert.throws(() => validateDecision("hook", { title: "This title is far too long" }, ctx("wordmeme")), /too long/);
  assert.deepEqual(validateDecision("fillers", { remove: [3, 3, 1] }, ctx("collage")), { remove: [1, 3] });
  assert.deepEqual(validateDecision("visuals", collageDecision, ctx("collage")).top, collageDecision.top);
});

test("output fps follows the footage", () => {
  assert.deepEqual([23.976, 25, 29.97, 30, 50, 59.94, undefined].map(pickFps), [24, 25, 30, 30, 25, 30, 30]);
});

test("user-typed hook text turns the hook into a script step", () => {
  const s = mergeSettings(defaultSettings("wordmeme"), { style: "wordmeme", hookText: "Publica" });
  assert.equal(stepsFor({ settings: s }).find((st) => st.id === "hook").kind, "script");
});
