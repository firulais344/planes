// FFmpeg/FFprobe helpers: probing, working copies, audio extraction, color analysis, SFX.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function run(cmd, args, { cwd, onLine, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: env || process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const feed = (chunk, sink) => {
      const s = chunk.toString();
      if (onLine) s.split(/\r?\n|\r/).filter(Boolean).forEach(onLine);
      return sink + s;
    };
    p.stdout.on("data", (c) => (out = feed(c, out)));
    p.stderr.on("data", (c) => (err = feed(c, err).slice(-20000)));
    p.on("error", (e) => reject(new Error(`${cmd} could not start: ${e.message}`)));
    p.on("close", (code) => {
      if (code === 0) return resolve({ out, err });
      const last = err.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[*\-]+$/.test(l)).pop() || "";
      reject(new Error(`${path.basename(cmd)} exited with ${code}${last ? `: ${last.slice(0, 300)}` : ""}\n${err.slice(-3000)}`));
    });
  });
}

export const ffmpeg = (args, opts) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], opts);

export async function probe(file) {
  const { out } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === "video" && !(s.disposition?.attached_pic));
  const a = j.streams.find((s) => s.codec_type === "audio");
  let rotation = 0;
  for (const sd of v?.side_data_list || []) if (typeof sd.rotation === "number") rotation = sd.rotation;
  if (v?.tags?.rotate) rotation = Number(v.tags.rotate);
  const [num, den] = String(v?.avg_frame_rate || "0/0").split("/").map(Number); // "30000/1001"
  const fps = num && den ? num / den : null;
  return {
    duration: Number(j.format.duration || v?.duration || a?.duration || 0),
    formatName: j.format.format_name,
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, pixFmt: v.pix_fmt, fps, rotation } : null,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels } : null,
  };
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
export const isImage = (f) => IMAGE_EXT.test(f);

/** A browser- and HyperFrames-friendly H.264 copy. Links the original when it already is one. */
export async function workingVideo(src, dest, info, { keepAudio = true, maxSide = 1920 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const v = info.video;
  const ok = v && v.codec === "h264" && v.pixFmt === "yuv420p" && !v.rotation && /mp4|mov/.test(info.formatName) && path.extname(src).toLowerCase() === ".mp4" && Math.max(v.width, v.height) <= 3840 && (!keepAudio || !info.audio || info.audio.codec === "aac");
  if (ok) {
    fs.rmSync(dest, { force: true });
    try {
      fs.linkSync(src, dest);
    } catch {
      fs.copyFileSync(src, dest);
    }
    return { transcoded: false };
  }
  const scale = `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`;
  const args = ["-i", src, "-map", "0:v:0", "-vf", `${scale},format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "30"];
  if (keepAudio && info.audio) args.push("-map", "0:a:0", "-c:a", "aac", "-b:a", "192k");
  else args.push("-an");
  args.push("-movflags", "+faststart", dest);
  await ffmpeg(args);
  return { transcoded: true };
}

export async function extractAudio(src, dest, { rate = 48000, mono = true, codec } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const args = ["-i", src, "-vn", "-ac", mono ? "1" : "2", "-ar", String(rate)];
  if (codec) args.push("-c:a", codec);
  args.push(dest);
  await ffmpeg(args);
}

/** One square thumbnail per media file (videos: a frame a third of the way in). */
export async function squareThumb(src, dest, info, size = 240) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const seek = isImage(src) ? [] : ["-ss", String(Math.max(0, (info.duration || 0) / 3))];
  await ffmpeg([...seek, "-i", src, "-vf", `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x202024`, "-frames:v", "1", "-q:v", "4", dest]);
}

/**
 * Contact sheets so Claude can SEE the uploaded media in one or two looks instead of opening
 * 40 files. Cells are in list order, left to right, top to bottom.
 */
export async function contactSheets(thumbs, dir, { cols = 6, rows = 4, size = 240 } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const per = cols * rows;
  const sheets = [];
  for (let k = 0; k * per < thumbs.length; k++) {
    const chunk = thumbs.slice(k * per, (k + 1) * per);
    const tmp = path.join(dir, `.cells${k}`);
    fs.mkdirSync(tmp, { recursive: true });
    chunk.forEach((t, i) => fs.copyFileSync(t, path.join(tmp, `${String(i).padStart(3, "0")}.jpg`)));
    const r = Math.ceil(chunk.length / cols);
    const file = path.join(dir, `sheet-${k + 1}.jpg`);
    await ffmpeg(["-framerate", "1", "-i", path.join(tmp, "%03d.jpg"), "-vf", `tile=${cols}x${r}:padding=6:margin=6:color=0x101014`, "-frames:v", "1", "-q:v", "3", file]);
    fs.rmSync(tmp, { recursive: true, force: true });
    sheets.push({ file, cols, rows: r, first: k * per, count: chunk.length, size });
  }
  return sheets;
}

/**
 * Two-pass loudness normalization of a finished render to the style's target (LUFS).
 * Video is copied untouched; only the audio is re-encoded.
 */
export async function normalizeLoudness(input, output, target) {
  const tp = -1;
  const { err } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vn", "-af", `loudnorm=I=${target}:TP=${tp}:LRA=11:print_format=json`, "-f", "null", "-"]);
  const json = err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1);
  let filter = `loudnorm=I=${target}:TP=${tp}:LRA=11`;
  let measured = null;
  try {
    const m = JSON.parse(json);
    measured = Number(m.input_i);
    if (Number.isFinite(measured)) filter += `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
  } catch {}
  await ffmpeg(["-i", input, "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
  return { measured, target };
}

/** Local cleanup used only when no Auphonic key is configured. */
export async function localEnhance(src, dest) {
  await ffmpeg(["-i", src, "-af", "highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", dest]);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Measure brightness, contrast and saturation over ~1 frame/second and turn them into a
 * CSS filter applied to the footage in the composition. Deterministic: same input, same grade.
 */
export async function analyzeColor(src, duration) {
  const fps = Math.min(1, 40 / Math.max(1, duration));
  const { out } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-vf", `fps=${fps},scale=320:-2,signalstats,metadata=print:file=-`, "-an", "-f", "null", "-"]);
  const get = (key) => [...out.matchAll(new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`, "g"))].map((m) => Number(m[1]));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const yavg = avg(get("YAVG"));
  const ylow = avg(get("YLOW"));
  const yhigh = avg(get("YHIGH"));
  const sat = avg(get("SATAVG"));
  if (yavg == null) return { filter: null, stats: null };
  const brightness = clamp(118 / yavg, 0.9, 1.25);
  const range = Math.max(1, (yhigh ?? 235) - (ylow ?? 16));
  const contrast = clamp(190 / range, 1, 1.18);
  const saturate = sat ? clamp(42 / sat, 1, 1.3) : 1.08;
  const f = (x) => Math.round(x * 100) / 100;
  const parts = [];
  if (Math.abs(brightness - 1) >= 0.02) parts.push(`brightness(${f(brightness)})`);
  if (contrast - 1 >= 0.02) parts.push(`contrast(${f(contrast)})`);
  if (saturate - 1 >= 0.02) parts.push(`saturate(${f(saturate)})`);
  return { filter: parts.join(" ") || null, stats: { yavg: f(yavg), ylow: f(ylow ?? 0), yhigh: f(yhigh ?? 0), sat: f(sat ?? 0) } };
}

/** Synthesized sound effects: no stock library or API needed, and identical on every run. */
export const SFX_RECIPES = {
  whoosh: { duration: 0.55, args: ["-f", "lavfi", "-i", "anoisesrc=d=0.55:c=pink:a=0.8:r=48000", "-af", "highpass=f=300,lowpass=f=5000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.25,volume=1.6"] },
  pop: { duration: 0.18, args: ["-f", "lavfi", "-i", "sine=f=620:d=0.18:r=48000", "-af", "asetrate=48000*1.6,aresample=48000,afade=t=out:st=0.02:d=0.16:curve=exp,volume=2"] },
  ding: { duration: 1.0, args: ["-f", "lavfi", "-i", "sine=f=1318:d=1.0:r=48000", "-f", "lavfi", "-i", "sine=f=1975:d=1.0:r=48000", "-filter_complex", "[0][1]amix=inputs=2,afade=t=out:st=0.03:d=0.95:curve=exp,volume=2"] },
};

export async function makeSfx(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, r] of Object.entries(SFX_RECIPES)) {
    const file = path.join(dir, `${name}.wav`);
    await ffmpeg([...r.args, "-ac", "1", file]);
    out[name] = { file, duration: r.duration };
  }
  return out;
}
