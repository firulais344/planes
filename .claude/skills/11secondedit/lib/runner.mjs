// Step implementations. Deterministic steps run here; judgement steps only produce context
// for Claude and validate what Claude decides.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR, jobPath, loadJob, readJson, writeJson, setStep, updateJob } from "./job.mjs";
import { stepDef, decisionSpec, validateDecision } from "./steps.mjs";
import { getStyle } from "./styles.mjs";
import { probe, workingVideo, extractAudio, squareThumb, contactSheets, localEnhance, analyzeColor, makeSfx, isImage, run, ffmpeg } from "./media.mjs";
import { auphonicEnhance, hasAuphonic, elevenLabsMusic, hasElevenLabs, env } from "./apis.mjs";
import { normalizeWhisperX, detectFillers, formatTranscript, transcriptLines, fmtTime } from "./transcript.mjs";
import { buildModel, computeModel, loadInputs } from "./model.mjs";
import { writeComposition } from "./composition.mjs";

const rel = (id, abs) => path.relative(jobPath(id), abs).split(path.sep).join("/");

function assets(id) {
  return readJson(jobPath(id, "assets.json"), {});
}
function saveAssets(id, patch) {
  writeJson(jobPath(id, "assets.json"), { ...assets(id), ...patch });
}

class Skip extends Error {}

/** The CLI as Claude should type it: relative inside a project, absolute when installed globally. */
function cliCommand() {
  const abs = path.join(SKILL_DIR, "bin", "11se.mjs");
  const r = path.relative(process.cwd(), abs);
  return `node ${r.startsWith("..") ? abs : r}`;
}

const SCRIPTS = {
  async prepare(id, job, say) {
    const src = jobPath(id, job.source.file);
    fs.chmodSync(src, 0o444); // the original is read-only from here on
    say("probing footage");
    const info = await probe(src);
    if (!info.video) throw new Error("The uploaded file has no video stream.");
    if (!info.audio) throw new Error("The uploaded file has no audio — 11 Second Edit needs a talking-head with sound.");
    writeJson(jobPath(id, "probe.json"), info);
    say(info.video.codec === "h264" ? "linking footage" : `converting ${info.video.codec} to H.264`);
    const aroll = jobPath(id, "media", "aroll.mp4");
    const { transcoded } = await workingVideo(src, aroll, info);
    const arInfo = transcoded ? await probe(aroll) : info;
    say("extracting audio");
    await extractAudio(aroll, jobPath(id, "media", "speech16k.wav"), { rate: 16000 });

    // Images and b-roll. Every file gets a clean working copy; the uploads stay read-only.
    const media = {};
    const thumbs = [];
    let k = 0;
    for (const b of job.broll) {
      say(`preparing media ${++k}/${job.broll.length}`);
      const bsrc = jobPath(id, b.file);
      fs.chmodSync(bsrc, 0o444);
      const base = b.name.replace(/\.[^.]+$/, "");
      const thumb = jobPath(id, "media", "thumbs", `${b.name}.jpg`);
      let entry;
      if (isImage(bsrc)) {
        // Normalized copy (max 1600 px) so the size we lay out with is the size Chrome draws.
        const dest = jobPath(id, "media", "img", `${base}${/\.png$/i.test(b.name) ? ".png" : ".jpg"}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        await ffmpeg(["-i", bsrc, "-vf", "scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease", "-frames:v", "1", "-q:v", "2", dest]);
        const pi = await probe(dest);
        if (!pi.video) continue;
        entry = { type: "image", src: rel(id, dest), width: pi.video.width, height: pi.video.height };
        await squareThumb(dest, thumb, {});
      } else {
        const bi = await probe(bsrc);
        if (!bi.video) continue;
        const dest = jobPath(id, "media", "broll", `${base}.mp4`);
        const { transcoded: t } = await workingVideo(bsrc, dest, bi, { keepAudio: false });
        const di = t ? await probe(dest) : bi;
        entry = { type: "video", src: rel(id, dest), duration: Math.round(di.duration * 1000) / 1000, width: di.video.width, height: di.video.height };
        await squareThumb(dest, thumb, di);
      }
      media[b.name] = { ...entry, thumb: rel(id, thumb) };
      thumbs.push(thumb);
    }
    const sheets = thumbs.length ? await contactSheets(thumbs, jobPath(id, "media", "sheets")) : [];
    saveAssets(id, { aroll: "media/aroll.mp4", sourceDuration: arInfo.duration, video: arInfo.video, media, sheets: sheets.map((sh) => ({ ...sh, file: rel(id, sh.file) })) });
    const count = Object.values(media);
    const nImg = count.filter((m) => m.type === "image").length;
    const nVid = count.length - nImg;
    return `${fmtTime(arInfo.duration)} · ${arInfo.video.width}×${arInfo.video.height}${transcoded ? " · converted to H.264" : ""}${nImg ? ` · ${nImg} image${nImg === 1 ? "" : "s"}` : ""}${nVid ? ` · ${nVid} clip${nVid === 1 ? "" : "s"}` : ""}`;
  },

  async enhanceAudio(id, job, say) {
    const out = jobPath(id, "media", "voice.wav");
    const srcAudio = jobPath(id, "media", "voice-source.flac");
    await extractAudio(jobPath(id, "media", "aroll.mp4"), srcAudio, { rate: 48000, codec: "flac" });
    let how;
    if (hasAuphonic()) {
      await auphonicEnhance(srcAudio, out, { title: `11se ${id}`, onStatus: say });
      how = "Auphonic: leveler, noise reduction, −16 LUFS";
    } else {
      say("no AUPHONIC_API_KEY — using local FFmpeg cleanup");
      await localEnhance(srcAudio, out);
      how = "No AUPHONIC_API_KEY in .env — used local FFmpeg cleanup instead";
    }
    const a = await probe(out);
    const drift = Math.abs(a.duration - assets(id).sourceDuration);
    if (drift > 0.25) throw new Error(`Enhanced audio is ${drift.toFixed(2)}s off the video length; refusing to use it (would drift out of sync).`);
    saveAssets(id, { voice: "media/voice.wav" });
    return how;
  },

  async transcribe(id, job, say) {
    const a = assets(id);
    let audio = jobPath(id, "media", "speech16k.wav");
    if (a.voice) {
      audio = jobPath(id, "media", "voice16k.wav");
      await extractAudio(jobPath(id, a.voice), audio, { rate: 16000 });
    }
    const python = env("WHISPERX_PYTHON") || "python3";
    const model = env("WHISPERX_MODEL") || "small";
    const args = [path.join(SKILL_DIR, "scripts", "transcribe.py"), audio, jobPath(id, "transcript.raw.json"), "--model", model];
    if (job.settings.language) args.push("--language", job.settings.language);
    if (env("WHISPERX_DEVICE")) args.push("--device", env("WHISPERX_DEVICE"));
    say(`WhisperX (${model})`);
    await run(python, args, { onLine: (l) => l.startsWith("PROGRESS ") && say(l.slice(9)) });
    const raw = readJson(jobPath(id, "transcript.raw.json"));
    const words = normalizeWhisperX(raw, a.sourceDuration);
    if (!words.length) throw new Error("WhisperX found no speech in this video.");
    writeJson(jobPath(id, "transcript.json"), { language: raw.language, words });
    return `${words.length} words · language: ${raw.language}`;
  },

  async silences(id) {
    const { words } = readJson(jobPath(id, "transcript.json"));
    const gaps = [];
    for (let k = 1; k < words.length; k++) if (words[k].s - words[k - 1].e > 0.45) gaps.push(words[k].s - words[k - 1].e);
    const lead = words[0].s;
    const tail = assets(id).sourceDuration - words[words.length - 1].e;
    const total = gaps.reduce((x, y) => x + y, 0) + Math.max(0, lead) + Math.max(0, tail);
    return `${gaps.length} pauses over 0.45 s (≈${total.toFixed(1)} s incl. start/end) will be tightened`;
  },

  async color(id, job) {
    if (job.settings.style === "cinematic") return "Teal shadows, warm highlights, lifted blacks — applied to a-roll and b-roll";
    const a = assets(id);
    const { filter, stats } = await analyzeColor(jobPath(id, a.aroll), a.sourceDuration);
    saveAssets(id, { colorFilter: filter, colorStats: stats });
    return filter ? `Measured correction: ${filter}` : "Footage is already well exposed — no correction needed";
  },

  async hook(id, job) {
    writeJson(jobPath(id, "decisions", "hook.json"), { title: job.settings.hookText, plain: "", script: "", proof: [], by: "user" });
    return `“${job.settings.hookText}”`;
  },

  async cta(id, job) {
    writeJson(jobPath(id, "decisions", "cta.json"), { text: job.settings.ctaText, sub: "", by: "user" });
    return `“${job.settings.ctaText}”`;
  },

  async captions(id) {
    const m = computeModel(loadInputs(id));
    return `${m.stats.captions} captions · ${m.words.filter((w) => !w.removed).length} words · hard cuts, no animation`;
  },

  async music(id, job, say) {
    const dec = readJson(jobPath(id, "decisions", "music.json"), null);
    if (!dec) throw new Error("No music prompt yet. Run `context` and `decide` for this step first.");
    if (!hasElevenLabs()) throw new Skip("No ELEVENLABS_API_KEY in .env — no music added");
    const m = computeModel(loadInputs(id));
    say(`composing ${Math.ceil(m.duration + 1)} s with ElevenLabs`);
    const out = jobPath(id, "media", "music.mp3");
    await elevenLabsMusic(dec.prompt, m.duration + 1, out);
    saveAssets(id, { music: "media/music.mp3" });
    return `ElevenLabs: “${dec.prompt.slice(0, 70)}${dec.prompt.length > 70 ? "…" : ""}”`;
  },

  async sfx(id) {
    const files = await makeSfx(jobPath(id, "media", "sfx"));
    const sfx = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { src: rel(id, v.file), duration: v.duration }]));
    saveAssets(id, { sfx });
    const m = computeModel(loadInputs(id));
    return m.sfx.length ? `${m.sfx.length} whoosh${m.sfx.length === 1 ? "" : "es"} on the whip transitions` : "No whip transitions in this edit — nothing to add";
  },

  async compose(id, job, say) {
    say("building timeline");
    const m = buildModel(id);
    const file = writeComposition(id, m);
    updateJob(id, (j) => {
      j.status = "review";
      j.reviewAt = new Date().toISOString();
    });
    const shown = path.relative(process.cwd(), file);
    return `${m.styleName} · ${fmtTime(m.duration)} final (cut ${m.stats.cutSeconds.toFixed(1)} s, ${m.stats.removedWords} words) · ${m.stats.visuals} visuals → ${shown.startsWith("..") ? file : shown}`;
  },
};

export async function runStep(id, stepId, log = console.log) {
  const def = stepDef(stepId);
  if (def.kind === "claude" && !(stepId === "hook" || stepId === "cta")) throw new Error(`"${stepId}" is a judgement step: use \`context\` then \`decide\`.`);
  const job = loadJob(id);
  const planned = job.steps.find((s) => s.id === stepId);
  if (!planned) throw new Error(`"${stepId}" is not enabled for this job.`);
  if (planned.kind === "claude") throw new Error(`"${stepId}" needs a decision: use \`context\` then \`decide\`.`);
  const say = (msg) => {
    setStep(id, stepId, "running", msg);
    log(`  … ${msg}`);
  };
  setStep(id, stepId, "running", "");
  try {
    const msg = await SCRIPTS[stepId](id, job, say);
    setStep(id, stepId, "done", msg || "");
    return { status: "done", message: msg };
  } catch (err) {
    if (err instanceof Skip) {
      setStep(id, stepId, "skipped", err.message);
      return { status: "skipped", message: err.message };
    }
    setStep(id, stepId, "error", err.message.split("\n")[0]);
    throw err;
  }
}

// ---------------- judgement steps ----------------

function currentRemoved(id) {
  try {
    return new Set(computeModel(loadInputs(id)).words.filter((w) => w.removed).map((w) => w.i));
  } catch {
    return new Set();
  }
}

export function stepContext(id, stepId) {
  const job = loadJob(id);
  if (!job.steps.find((s) => s.id === stepId)) throw new Error(`"${stepId}" is not enabled for this job.`);
  const style = getStyle(job.settings.style);
  const spec = decisionSpec(stepId, style.id);
  if (!spec) throw new Error(`"${stepId}" does not take a decision.`);
  const { words, language } = readJson(jobPath(id, "transcript.json"));
  const a = assets(id);
  setStep(id, stepId, "running", "Claude is reviewing the transcript");
  const removed = currentRemoved(id);
  const keptText = words.filter((w) => !removed.has(w.i)).map((w) => w.w).join(" ");
  const planned = job.steps.find((s) => s.id === stepId);
  let finalSeconds = null;
  try {
    finalSeconds = computeModel(loadInputs(id)).mainDuration;
  } catch {}
  const mediaList = () => {
    const names = Object.keys(a.media || {});
    const lines = [];
    for (const sh of a.sheets || []) lines.push(`Contact sheet (${sh.cols} columns, files ${sh.first + 1}–${sh.first + sh.count} in order, left to right, top to bottom): ${jobPath(id, sh.file)}`);
    names.forEach((name, k) => {
      const m = a.media[name];
      const cols = a.sheets?.[0]?.cols || 6;
      const per = cols * 4;
      lines.push(`${String(k + 1).padStart(2)}. ${name} · ${m.type} ${m.width}×${m.height}${m.duration ? ` · ${m.duration.toFixed(1)} s` : ""} · sheet ${Math.floor(k / per) + 1} row ${Math.floor((k % per) / cols) + 1} col ${(k % cols) + 1}`);
    });
    return lines.length ? lines : ["(nothing uploaded)"];
  };
  const out = [`# ${planned.label} — ${style.name} style — job ${id}`, `Language: ${language} · source ${fmtTime(a.sourceDuration)} · ${words.length} words`, ""];

  if (stepId === "badTakes") {
    out.push("## Transcript (start–end, [index]word)", formatTranscript(words));
  } else if (stepId === "fillers") {
    const { auto, candidates: all } = detectFillers(words);
    const candidates = all.filter((c) => !c.every((i) => removed.has(i))); // already cut as part of a bad take
    const around = (i) => words.slice(Math.max(0, i - 4), i + 5).map((w) => (w.i === i ? `**[${w.i}]${w.w}**` : w.w)).join(" ");
    out.push(`## AUTO (removed automatically): ${auto.map((i) => `[${i}]${words[i].w}`).join(" ") || "none"}`, "");
    out.push("## CANDIDATES (decide each from context)");
    out.push(candidates.length ? candidates.map((c) => `- [${c.join(",")}] …${around(c[0])}…`).join("\n") : "none");
    out.push("", "## Transcript (~~struck~~ = already cut)", formatTranscript(words, removed));
  } else if (stepId === "visuals") {
    const nMedia = Object.keys(a.media || {}).length;
    out.push("## MEDIA", ...mediaList(), "");
    out.push("## STATS");
    if (finalSeconds) {
      out.push(`Final spoken length ≈ ${finalSeconds.toFixed(1)} s · ${nMedia} file${nMedia === 1 ? "" : "s"} uploaded.`);
      if (style.id === "collage") out.push(`Reference density: one image every 1–1.5 s → about ${Math.round(finalSeconds / 1.2)} images for this video.`);
      if (style.id === "wordmeme") out.push(`Reference density: one image every 1–2.5 s → about ${Math.round(finalSeconds / 1.6)} images for this video.`);
      if (style.id === "cinematic") out.push(`Reference: b-roll on ~80 % of the video → about ${(finalSeconds * 0.8).toFixed(0)} s covered, in 1–3 s shots plus word-by-word bursts.`);
    }
    out.push("", "## Transcript (~~struck~~ = already cut)", formatTranscript(words, removed));
  } else if (stepId === "hook") {
    out.push("## MEDIA (for the optional `proof` images)", ...mediaList(), "", "## What the final video says", keptText);
  } else {
    out.push("## What the final video says", keptText);
    if (stepId === "music") {
      try {
        out.push("", `Final length ≈ ${computeModel(loadInputs(id)).duration.toFixed(1)} s`);
      } catch {}
    }
  }
  out.push("", "## Write your decision as JSON", "```json", JSON.stringify(spec.example, null, 2), "```", "Rules:", ...spec.rules.map((r) => `- ${r}`));
  out.push("", `Then run: ${cliCommand()} decide ${id} ${stepId} <file.json>`);
  return out.join("\n");
}

export function saveDecision(id, stepId, data) {
  const job = loadJob(id);
  const planned = job.steps.find((s) => s.id === stepId);
  if (!planned) throw new Error(`"${stepId}" is not enabled for this job.`);
  const { words } = readJson(jobPath(id, "transcript.json"));
  const mediaFiles = Object.keys(assets(id).media || {});
  const clean = validateDecision(stepId, data, { words, mediaFiles, style: getStyle(job.settings.style).id });
  writeJson(jobPath(id, "decisions", `${stepId}.json`), { ...clean, by: "claude", at: new Date().toISOString() });
  const summary = {
    badTakes: () => `${clean.cuts.length} cut${clean.cuts.length === 1 ? "" : "s"} (${clean.cuts.reduce((n, c) => n + c.to - c.from + 1, 0)} words)`,
    fillers: () => `${detectFillers(words).auto.length} automatic + ${clean.remove.length} by context`,
    visuals: () => visualsSummary(id, job),
    hook: () => `“${[clean.title, clean.plain, clean.script].filter(Boolean).join(" ")}”`,
    cta: () => `“${clean.text}”`,
    music: () => "prompt ready — generating",
  }[stepId]();
  if (planned.kind === "claude+script") setStep(id, stepId, "running", summary);
  else setStep(id, stepId, "done", summary);
  return { summary, next: planned.kind === "claude+script" ? "run" : null };
}

/** What actually made it on screen, so Claude can see if the density matches the style and redo it. */
function visualsSummary(id, job) {
  const m = computeModel(loadInputs(id));
  const style = getStyle(job.settings.style);
  const pct = Math.round(m.stats.visualCoverage * 100);
  if (style.id === "collage") {
    const every = m.stats.visuals ? (m.mainDuration / m.stats.visuals).toFixed(1) : "–";
    return `${m.stats.visuals} images placed · one every ${every} s (reference 1–1.5 s) · collage on screen ${pct} % of the time`;
  }
  if (style.id === "wordmeme") return `${m.stats.visuals} images placed · on screen ${pct} % of the time (reference: almost always)`;
  return `${m.stats.visuals} shots placed · b-roll covers ${pct} % (reference ~80 %)`;
}

/** Next thing to do, as an exact command. Lets Claude drive the pipeline with no guesswork. */
export function nextAction(id) {
  const job = loadJob(id);
  const cli = cliCommand();
  const step = job.steps.find((s) => s.status === "pending" || s.status === "running");
  if (job.status === "error") {
    const bad = job.steps.find((s) => s.status === "error");
    return { done: false, step: bad?.id, text: `Step "${bad?.id}" failed: ${bad?.message}\nFix the cause, then retry it with \`${cli} retry ${id} ${bad?.id}\`, or skip it with \`${cli} skip ${id} ${bad?.id} "reason"\`.` };
  }
  if (!step) return { done: true, text: `All steps finished. The editor is open for review at the 11 Second Edit page.` };
  const def = { ...stepDef(step.id), kind: step.kind };
  if (def.kind === "script") return { done: false, step: step.id, kind: def.kind, text: `${cli} run ${id} ${step.id}` };
  const decided = fs.existsSync(jobPath(id, "decisions", `${step.id}.json`));
  if (def.kind === "claude+script" && decided && step.status === "running") return { done: false, step: step.id, kind: def.kind, text: `${cli} run ${id} ${step.id}` };
  return { done: false, step: step.id, kind: def.kind, text: `${cli} context ${id} ${step.id}   # read it, write the JSON decision, then: ${cli} decide ${id} ${step.id} <file.json>` };
}

export function transcriptForHumans(id) {
  const { words } = readJson(jobPath(id, "transcript.json"));
  return transcriptLines(words).map((l) => l.words.map((w) => w.w).join(" ")).join("\n");
}
