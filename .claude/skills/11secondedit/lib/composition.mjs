// Renders the timeline model into ONE HyperFrames composition (composition/index.html).
// It previews in HyperFrames Studio and renders to MP4 with headless Chrome + FFmpeg.
import fs from "node:fs";
import path from "node:path";
import { jobPath, writeJson } from "./job.mjs";

export const HYPERFRAMES_VERSION = "0.9.30";
const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

const n = (x) => String(Math.round(x * 1000) / 1000);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderCompositionHtml(m) {
  const W = m.width;
  const H = m.height;
  const vertical = H > W;
  const capSize = vertical ? 86 : 64;
  const capTop = vertical ? Math.round(H * 0.66) : Math.round(H * 0.74);
  const hasVoice = Boolean(m.aroll.voice);
  const fade = 'data-fade-in="0.012" data-fade-out="0.012"';

  const aroll = m.segments
    .map((seg, k) => {
      const len = n(seg.e - seg.s);
      const audio = hasVoice ? "muted" : `data-has-audio="true" ${fade}`;
      return `        <video id="a${k}" class="clip aroll" src="${esc(m.aroll.src)}" playsinline ${audio} data-start="${n(seg.o)}" data-duration="${len}" data-media-start="${n(seg.s)}" data-track-index="0"></video>`;
    })
    .join("\n");

  const voice = hasVoice
    ? m.segments
        .map((seg, k) => `    <audio id="v${k}" src="${esc(m.aroll.voice)}" ${fade} data-start="${n(seg.o)}" data-duration="${n(seg.e - seg.s)}" data-media-start="${n(seg.s)}" data-track-index="1"></audio>`)
        .join("\n")
    : "";

  const broll = m.broll
    .map((b, k) =>
      b.type === "image"
        ? `    <img id="b${k}" class="clip broll" src="${esc(b.src)}" alt="" data-start="${n(b.s)}" data-duration="${n(b.e - b.s)}" data-track-index="2" />`
        : `    <video id="b${k}" class="clip broll" src="${esc(b.src)}" muted playsinline data-start="${n(b.s)}" data-duration="${n(b.e - b.s)}" data-media-start="0" data-track-index="2"></video>`,
    )
    .join("\n");

  const captions = m.captions
    .map(
      (g, k) =>
        `    <div id="c${k}" class="clip cap" data-start="${n(g.s)}" data-duration="${n(g.e - g.s)}" data-track-index="3"><span class="cap-line">${g.words
          .map((w, j) => `<span id="c${k}w${j}" class="w">${esc(w.w)}</span>`)
          .join(" ")}</span></div>`,
    )
    .join("\n");

  const hook = m.hook
    ? `    <div id="hook" class="clip" data-start="${n(m.hook.s)}" data-duration="${n(m.hook.e - m.hook.s)}" data-track-index="4"><span class="hook-box">${esc(m.hook.text)}</span></div>`
    : "";

  const cta = m.cta
    ? `    <div id="cta" class="clip" data-start="${n(m.cta.s)}" data-duration="${n(m.cta.e - m.cta.s)}" data-track-index="4">
      <span class="cta-card"><span class="cta-text">${esc(m.cta.text)}</span>${m.cta.sub ? `<span class="cta-sub">${esc(m.cta.sub)}</span>` : ""}<span class="cta-arrow">↓</span></span>
    </div>`
    : "";

  const music = m.music
    ? `    <audio id="music" src="${esc(m.music.src)}" data-start="0" data-duration="${n(m.duration)}" data-volume="${m.music.volume}" data-fade-in="0.5" data-fade-out="${m.music.fadeOut}" data-track-index="5"></audio>`
    : "";

  const sfx = m.sfx
    .map((s, k) => `    <audio id="s${k}" class="sfx" src="${esc(s.src)}" data-start="${n(s.s)}" data-duration="${n(s.e - s.s)}" data-volume="${s.volume}" data-track-index="6"></audio>`)
    .join("\n");

  // GSAP timeline: every animation is a pure function of time, so seeking is deterministic.
  const tl = [];
  tl.push(`tl.set("#stage", { scale: 1 }, 0);`);
  for (const z of m.zooms) {
    tl.push(`tl.set("#stage", { scale: ${z.scale} }, ${n(z.s)});`);
    tl.push(`tl.set("#stage", { scale: 1 }, ${n(z.e)});`);
  }
  m.broll.forEach((b, k) => {
    tl.push(`tl.fromTo("#b${k}", { scale: 1.06 }, { scale: 1, duration: ${n(Math.min(0.35, b.e - b.s))}, ease: "power2.out" }, ${n(b.s)});`);
    if (b.type === "image") tl.push(`tl.fromTo("#b${k}", { xPercent: 0 }, { xPercent: -3, duration: ${n(b.e - b.s)}, ease: "none" }, ${n(b.s)});`);
  });
  m.captions.forEach((g, k) => {
    tl.push(`tl.fromTo("#c${k} .cap-line", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.12, ease: "back.out(2)" }, ${n(g.s)});`);
    g.words.forEach((w, j) => {
      tl.push(`tl.set("#c${k}w${j}", { color: "#FFE14D", scale: 1.12 }, ${n(w.s)});`);
      if (j < g.words.length - 1) tl.push(`tl.set("#c${k}w${j}", { color: "#FFFFFF", scale: 1 }, ${n(g.words[j + 1].s)});`);
    });
  });
  if (m.hook) {
    tl.push(`tl.fromTo("#hook .hook-box", { y: -60, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, 0.05);`);
    tl.push(`tl.to("#hook .hook-box", { opacity: 0, y: -30, duration: 0.25, ease: "power2.in" }, ${n(Math.max(0.5, m.hook.e - 0.25))});`);
  }
  if (m.cta) {
    tl.push(`tl.fromTo("#cta .cta-card", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.6)" }, ${n(m.cta.s)});`);
    tl.push(`tl.fromTo("#cta .cta-arrow", { y: 0 }, { y: 18, duration: 0.4, repeat: 5, yoyo: true, ease: "sine.inOut" }, ${n(m.cta.s + 0.5)});`);
  }

  return `<!doctype html>
<!-- Generated by 11 Second Edit from model.json. Re-generated on every edit; change the edit, not this file. -->
<html lang="en" data-resolution="${vertical ? "portrait" : "landscape"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="${GSAP}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      body { font-family: "Montserrat", "Arial Black", "Helvetica Neue", Arial, sans-serif; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
      #stage { position: absolute; inset: 0; transform-origin: 50% 38%; ${m.aroll.filter ? `filter: ${m.aroll.filter};` : ""} }
      .aroll, .broll { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .broll { z-index: 2; }
      .cap { position: absolute; left: 0; right: 0; top: ${capTop}px; z-index: 5; display: flex; justify-content: center; padding: 0 ${Math.round(W * 0.07)}px; }
      .cap-line { display: block; text-align: center; font-weight: 900; font-size: ${capSize}px; line-height: 1.1; color: #fff; text-transform: uppercase; letter-spacing: -0.5px;
        -webkit-text-stroke: ${vertical ? 10 : 8}px #000; paint-order: stroke fill; text-shadow: 0 6px 18px rgba(0,0,0,.55); }
      .cap-line .w { display: inline-block; }
      #hook { position: absolute; left: 0; right: 0; top: ${vertical ? Math.round(H * 0.12) : Math.round(H * 0.08)}px; z-index: 6; display: flex; justify-content: center; padding: 0 ${Math.round(W * 0.06)}px; }
      .hook-box { display: block; background: #fff; color: #111; font-weight: 900; font-size: ${vertical ? 68 : 56}px; line-height: 1.12; text-align: center;
        padding: 26px 34px; border-radius: 22px; box-shadow: 0 18px 50px rgba(0,0,0,.35); max-width: 100%; }
      #cta { position: absolute; inset: 0; z-index: 7; display: flex; align-items: center; justify-content: center;
        background: radial-gradient(120% 90% at 50% 20%, #3b2bff 0%, #12122a 60%, #07070f 100%); }
      .cta-card { display: block; text-align: center; color: #fff; padding: 0 ${Math.round(W * 0.08)}px; }
      .cta-text { display: block; font-weight: 900; font-size: ${vertical ? 104 : 92}px; line-height: 1.05; }
      .cta-sub { display: block; margin-top: 28px; font-weight: 600; font-size: ${vertical ? 46 : 40}px; opacity: .85; font-family: "Helvetica Neue", Arial, sans-serif; }
      .cta-arrow { display: block; margin-top: 48px; font-size: ${vertical ? 110 : 90}px; line-height: 1; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${n(m.duration)}" data-width="${W}" data-height="${H}">
      <div id="stage">
${aroll}
      </div>
${[voice, broll, captions, hook, cta, music, sfx].filter(Boolean).join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tl.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

/** Link (or copy) a job file into the composition folder; the original is never written to. */
function linkInto(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const a = fs.statSync(src);
    const b = fs.statSync(dest);
    if (a.ino === b.ino || (a.size === b.size && b.mtimeMs >= a.mtimeMs)) return;
    fs.rmSync(dest);
  } catch {}
  try {
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
}

export function writeComposition(id, model) {
  const dir = jobPath(id, "composition");
  fs.mkdirSync(dir, { recursive: true });
  const media = new Set([model.aroll.src, model.aroll.voice, model.music?.src, ...model.broll.map((b) => b.src), ...model.sfx.map((s) => s.src)].filter(Boolean));
  for (const rel of media) linkInto(jobPath(id, rel), path.join(dir, rel));
  fs.writeFileSync(path.join(dir, "index.html"), renderCompositionHtml(model));
  writeJson(path.join(dir, "meta.json"), { id: `11se-${id}`, name: `11 Second Edit ${id}` });
  writeJson(path.join(dir, "hyperframes.json"), {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: "compositions", components: "compositions/components", assets: "media" },
    media: { autoProxy: true },
  });
  writeJson(path.join(dir, "package.json"), {
    name: `11se-${id}`,
    private: true,
    type: "module",
    scripts: {
      dev: `npx --yes hyperframes@${HYPERFRAMES_VERSION} preview`,
      check: `npx --yes hyperframes@${HYPERFRAMES_VERSION} check`,
      render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render`,
    },
  });
  return path.join(dir, "index.html");
}

