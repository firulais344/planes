// Local server for the 11 Second Edit browser app. Zero dependencies: node:http only.
// It never decides anything about the edit — it stores uploads, queues the job for Claude
// Code, streams progress to the page, applies transcript edits (deterministic) and renders.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { SKILL_DIR, workdir, createJob, loadJob, updateJob, queueJob, listJobs, jobPath, readJson, writeJson } from "../lib/job.mjs";
import { buildModel } from "../lib/model.mjs";
import { writeComposition, HYPERFRAMES_VERSION } from "../lib/composition.mjs";
import { loadEnv, hasAuphonic, hasElevenLabs } from "../lib/apis.mjs";

loadEnv();
const PORT = Number(process.env.ELEVENSE_PORT || 4111);
const APP_DIR = path.join(SKILL_DIR, "app");
const WD = workdir();
fs.mkdirSync(WD, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac",
};

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const BROLL_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|jpe?g|png|webp)$/i;

function send(res, status, body, headers = {}) {
  const isObj = typeof body === "object" && !(body instanceof Buffer);
  res.writeHead(status, { "Content-Type": isObj ? "application/json" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function safeName(name, dir) {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const base = path.basename(name, path.extname(name)).normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
  let candidate = `${base}${ext}`;
  for (let k = 2; fs.existsSync(path.join(dir, candidate)); k++) candidate = `${base}-${k}${ext}`;
  return candidate;
}

function streamUpload(req, file) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = fs.createWriteStream(file, { flags: "wx" });
    req.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    req.on("error", reject);
    req.on("aborted", () => {
      out.destroy();
      fs.rmSync(file, { force: true });
      reject(new Error("Upload aborted"));
    });
  });
}

/** Static/media file with HTTP Range support (the video preview needs to seek). */
function serveFile(req, res, file) {
  let stat;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error();
  } catch {
    return send(res, 404, "Not found");
  }
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    if (!range[1]) end = stat.size - 1;
    if (start >= stat.size || start < 0 || end < start) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function jobView(id) {
  const job = loadJob(id);
  return {
    ...job,
    export: readJson(jobPath(id, "export.json"), null),
    hasModel: fs.existsSync(jobPath(id, "model.json")),
  };
}

// ---------------- export (HyperFrames render) ----------------
const renders = new Map();

function startExport(id) {
  if (renders.has(id)) return;
  const model = buildModel(id);
  writeComposition(id, model);
  const outFile = jobPath(id, "export", `11secondedit-${id}.mp4`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.rmSync(outFile, { force: true });
  const state = { status: "rendering", progress: 0, message: "Starting HyperFrames render", startedAt: new Date().toISOString(), duration: model.duration };
  writeJson(jobPath(id, "export.json"), state);
  const logFile = jobPath(id, "export", "render.log");
  const log = fs.createWriteStream(logFile);
  const child = spawn("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "render", "-o", outFile], {
    cwd: jobPath(id, "composition"),
    env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1", CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  renders.set(id, child);
  let last = 0;
  const onData = (chunk) => {
    const text = chunk.toString();
    log.write(text);
    // HyperFrames prints machine-readable `@hf-progress {"pct":..}` lines plus a human bar.
    const pcts = [...text.matchAll(/@hf-progress (\{.*\})/g)].map((m) => {
      try {
        return Number(JSON.parse(m[1]).pct);
      } catch {
        return NaN;
      }
    }).filter((p) => p >= 0 && p <= 100);
    const line = text
      .split(/\r?\n|\r/)
      .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/^[\s█░]+\d+%\s*/, "").trim())
      .filter((l) => l && !l.startsWith("@hf-") && !l.startsWith("[INFO]"))
      .pop();
    if (pcts.length || (line && Date.now() - last > 500)) {
      last = Date.now();
      if (pcts.length) state.progress = Math.max(state.progress, pcts[pcts.length - 1]);
      if (line) state.message = line.slice(0, 160);
      writeJson(jobPath(id, "export.json"), state);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    renders.delete(id);
    log.end();
    if (code === 0 && fs.existsSync(outFile)) {
      writeJson(jobPath(id, "export.json"), { ...state, status: "done", progress: 100, message: "Rendered", file: path.relative(jobPath(id), outFile), finishedAt: new Date().toISOString() });
      updateJob(id, (j) => (j.status = "exported"));
    } else {
      writeJson(jobPath(id, "export.json"), { ...state, status: "error", message: `Render failed (exit ${code}). Log: ${logFile}` });
    }
  });
}

// ---------------- HyperFrames Studio ----------------
async function startStudio(id) {
  const cwd = jobPath(id, "composition");
  return new Promise((resolve) => {
    const p = spawn("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "preview", "--background", "--port", "3002"], { cwd, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (out += c));
    p.on("close", () => {
      const url = out.match(/https?:\/\/localhost:\d+\/[^\s]*/)?.[0] || "http://localhost:3002";
      resolve({ url, output: out.slice(-800) });
    });
  });
}

// ---------------- routes ----------------
async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  let m;

  if (p === "/api/health") return send(res, 200, { ok: true, pid: process.pid, workdir: WD, keys: { auphonic: hasAuphonic(), elevenlabs: hasElevenLabs() } });

  if (p === "/api/jobs" && req.method === "GET") return send(res, 200, listJobs().map((j) => ({ id: j.id, status: j.status, createdAt: j.createdAt, source: j.source?.name })));
  if (p === "/api/jobs" && req.method === "POST") return send(res, 200, createJob());

  if ((m = p.match(/^\/api\/jobs\/([\w-]+)(\/.*)?$/))) {
    const id = m[1];
    const sub = m[2] || "";
    if (!fs.existsSync(jobPath(id, "job.json"))) return send(res, 404, { error: "No such job" });

    if (sub === "" && req.method === "GET") return send(res, 200, jobView(id));

    if (sub === "/source" && req.method === "PUT") {
      const job = loadJob(id);
      if (job.status !== "draft") return send(res, 409, { error: "This job already started." });
      const name = url.searchParams.get("name") || "video.mp4";
      if (!VIDEO_EXT.test(name)) return send(res, 400, { error: "Upload a video file (mp4, mov, m4v, webm, mkv)." });
      if (job.source) fs.rmSync(jobPath(id, job.source.file), { force: true });
      const dir = jobPath(id, "source");
      const file = safeName(name, dir);
      await streamUpload(req, path.join(dir, file));
      const size = fs.statSync(path.join(dir, file)).size;
      return send(res, 200, updateJob(id, (j) => (j.source = { name, file: `source/${file}`, size })));
    }

    if (sub === "/broll" && req.method === "PUT") {
      const job = loadJob(id);
      if (job.status !== "draft") return send(res, 409, { error: "This job already started." });
      const name = url.searchParams.get("name") || "broll.mp4";
      if (!BROLL_EXT.test(name)) return send(res, 400, { error: "B-roll must be a video or an image." });
      const dir = jobPath(id, "broll");
      const file = safeName(name, dir);
      await streamUpload(req, path.join(dir, file));
      return send(res, 200, updateJob(id, (j) => j.broll.push({ name: file, original: name, file: `broll/${file}` })));
    }

    if (sub === "/broll" && req.method === "DELETE") {
      const name = url.searchParams.get("name");
      return send(res, 200, updateJob(id, (j) => {
        if (j.status !== "draft") throw new Error("This job already started.");
        const b = j.broll.find((x) => x.name === name);
        if (b) fs.rmSync(jobPath(id, b.file), { force: true });
        j.broll = j.broll.filter((x) => x.name !== name);
      }));
    }

    if (sub === "/start" && req.method === "POST") {
      const body = await readBody(req);
      return send(res, 200, queueJob(id, body.settings || {}));
    }

    if (sub === "/events" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      let lastKey = "";
      const tick = () => {
        try {
          const files = ["job.json", "export.json", "model.json"].map((f) => {
            try {
              return fs.statSync(jobPath(id, f)).mtimeMs;
            } catch {
              return 0;
            }
          });
          const key = files.join(":");
          if (key !== lastKey) {
            lastKey = key;
            res.write(`data: ${JSON.stringify(jobView(id))}\n\n`);
          }
        } catch {}
      };
      tick();
      const timer = setInterval(tick, 400);
      const ka = setInterval(() => res.write(": ka\n\n"), 15000);
      req.on("close", () => {
        clearInterval(timer);
        clearInterval(ka);
      });
      return;
    }

    if (sub === "/model" && req.method === "GET") {
      const model = readJson(jobPath(id, "model.json"), null);
      return model ? send(res, 200, model) : send(res, 404, { error: "The edit is not built yet." });
    }

    if (sub === "/transcript" && req.method === "GET") {
      return send(res, 200, readJson(jobPath(id, "transcript.json"), { words: [] }));
    }

    // Transcript edits from the editor: deleting words cuts the video. Deterministic, no AI call.
    if (sub === "/edits" && req.method === "POST") {
      const body = await readBody(req);
      const clean = (a) => [...new Set((Array.isArray(a) ? a : []).filter((n) => Number.isInteger(n) && n >= 0))].sort((x, y) => x - y);
      const prev = readJson(jobPath(id, "edits.json"), { removed: [], restored: [] });
      const edits = { removed: clean(body.removed ?? prev.removed), restored: clean(body.restored ?? prev.restored) };
      writeJson(jobPath(id, "edits.json"), edits);
      try {
        const model = buildModel(id);
        writeComposition(id, model);
        return send(res, 200, model);
      } catch (e) {
        writeJson(jobPath(id, "edits.json"), prev); // reject edits that break the edit (e.g. every word removed)
        buildModel(id);
        return send(res, 400, { error: e.message });
      }
    }

    if (sub === "/export" && req.method === "POST") {
      startExport(id);
      return send(res, 200, readJson(jobPath(id, "export.json")));
    }

    if (sub === "/download" && req.method === "GET") {
      const ex = readJson(jobPath(id, "export.json"), null);
      if (!ex || ex.status !== "done") return send(res, 404, "Not rendered yet");
      const file = jobPath(id, ex.file);
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
      return serveFile(req, res, file);
    }

    if (sub === "/studio" && req.method === "POST") return send(res, 200, await startStudio(id));

    if (sub.startsWith("/file/") && (req.method === "GET" || req.method === "HEAD")) {
      const file = path.resolve(jobPath(id), decodeURIComponent(sub.slice(6)));
      if (!inside(jobPath(id), file) || /\.json$|\.log$/.test(file)) return send(res, 403, "Forbidden");
      return serveFile(req, res, file);
    }
    return send(res, 404, { error: "Unknown endpoint" });
  }

  // Static app
  const file = path.resolve(APP_DIR, p === "/" ? "index.html" : `.${decodeURIComponent(p)}`);
  if (!inside(APP_DIR, file) && file !== path.join(APP_DIR, "index.html")) return send(res, 403, "Forbidden");
  return serveFile(req, res, file);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!res.headersSent) send(res, 500, { error: e.message });
    else res.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  writeJson(path.join(WD, "server.json"), { pid: process.pid, port: PORT, startedAt: new Date().toISOString() });
  console.log(`11 Second Edit server on http://localhost:${PORT} (workdir ${WD})`);
});

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => {
  for (const child of renders.values()) child.kill("SIGTERM");
  process.exit(0);
});
