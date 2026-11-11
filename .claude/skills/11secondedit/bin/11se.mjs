#!/usr/bin/env node
// 11 Second Edit CLI — the hands Claude Code uses to drive the editor.
//
//   start                      start the local server and open the app
//   wait [--timeout 540]       block until the user clicks "Edit Video"; prints the job id
//   next <job>                 the exact next command to run
//   plan <job>                 every step with its status
//   run <job> <step>           run a deterministic step (FFmpeg, WhisperX, APIs, composition)
//   context <job> <step>       print what Claude needs for a judgement step
//   decide <job> <step> <file> validate + save Claude's JSON decision ("-" reads stdin)
//   skip <job> <step> [why]    mark a step skipped
//   retry <job> <step>         reset a failed step to pending
//   status <job>               job JSON
//   stop                       stop the server
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { SKILL_DIR, workdir, listJobs, loadJob, updateJob, setStep, jobPath } from "../lib/job.mjs";
import { runStep, stepContext, saveDecision, nextAction } from "../lib/runner.mjs";
import { loadEnv } from "../lib/apis.mjs";
import { buildId } from "../lib/build.mjs";

loadEnv();
const PORT = Number(process.env.ELEVENSE_PORT || 4111);
const URL = `http://localhost:${PORT}`;
const [cmd, ...args] = process.argv.slice(2);

function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/health`, { timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function openBrowser(url) {
  const [bin, ...a] = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try {
    spawn(bin, a, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {}
}

async function start() {
  const wd = workdir();
  fs.mkdirSync(wd, { recursive: true });
  let health = await ping();
  if (health && health.build !== buildId()) {
    // A server from an older install is still running: it would keep serving the old page. Replace it.
    console.log("An older 11 Second Edit server was running — restarting it with the current version.");
    try {
      process.kill(health.pid);
    } catch {}
    for (let i = 0; i < 25 && (await ping()); i++) await new Promise((r) => setTimeout(r, 200));
    health = await ping();
    if (health) die(`Could not stop the old server (pid ${health.pid}). Run: kill ${health.pid}`);
  }
  if (health && health.workdir !== wd) die(`Port ${PORT} is used by another 11 Second Edit server (workdir ${health.workdir}). Stop it with \`stop\` or set ELEVENSE_PORT.`);
  if (!health) {
    const log = fs.openSync(path.join(wd, "server.log"), "a");
    const child = spawn(process.execPath, [path.join(SKILL_DIR, "server", "server.mjs")], {
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, ELEVENSE_WORKDIR: wd, ELEVENSE_PORT: String(PORT) },
      cwd: process.cwd(),
    });
    child.unref();
    for (let i = 0; i < 50 && !health; i++) {
      await new Promise((r) => setTimeout(r, 200));
      health = await ping();
    }
    if (!health) die(`Server did not start. See ${path.join(wd, "server.log")}`);
  }
  if (!args.includes("--no-open")) openBrowser(URL);
  console.log(`11 Second Edit is running at ${URL}`);
  console.log(`Workdir: ${wd}`);
}

async function stop() {
  const health = await ping();
  if (!health) return console.log("Server is not running.");
  try {
    process.kill(health.pid);
    console.log("Server stopped.");
  } catch (e) {
    die(`Could not stop pid ${health.pid}: ${e.message}`);
  }
}

async function wait() {
  const i = args.indexOf("--timeout");
  const timeout = (i >= 0 ? Number(args[i + 1]) : 540) * 1000;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const job = listJobs().find((j) => j.status === "queued");
    if (job) {
      updateJob(job.id, (j) => (j.status = "processing"));
      const on = Object.entries(job.settings.features).filter(([, v]) => v).map(([k]) => k);
      console.log(`JOB ${job.id}`);
      const nImg = job.broll.filter((b) => /\.(jpe?g|png|webp)$/i.test(b.name)).length;
      console.log(`Video: ${job.source.name} · uploaded media: ${nImg} image(s), ${job.broll.length - nImg} clip(s)`);
      console.log(`Style: ${job.settings.style} · format: ${job.settings.format} · enabled: ${on.join(", ")}`);
      if (job.settings.hookText) console.log(`Hook text (from user): ${job.settings.hookText}`);
      if (job.settings.ctaText) console.log(`CTA text (from user): ${job.settings.ctaText}`);
      console.log(`\nNext: ${nextAction(job.id).text}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("WAITING — the user has not clicked Edit Video yet. Run `wait` again.");
  process.exit(3);
}

function need(n, usage) {
  if (args.length < n) die(`Usage: 11se ${usage}`);
}

function printNext(id) {
  const n = nextAction(id);
  console.log(n.done ? `\n✔ ${n.text}` : `\nNext: ${n.text}`);
}

async function main() {
  switch (cmd) {
    case "start":
      return start();
    case "stop":
      return stop();
    case "wait":
      return wait();
    case "next":
      need(1, "next <job>");
      return printNext(args[0]);
    case "plan": {
      need(1, "plan <job>");
      const job = loadJob(args[0]);
      const icon = { pending: "·", running: "…", done: "✔", skipped: "–", error: "✖" };
      job.steps.forEach((s, k) => console.log(`${String(k + 1).padStart(2)}. ${icon[s.status]} ${s.id.padEnd(13)} ${s.kind.padEnd(14)} ${s.label}${s.message ? ` — ${s.message}` : ""}`));
      return printNext(job.id);
    }
    case "run": {
      need(2, "run <job> <step>");
      const [id, step] = args;
      console.log(`▶ ${step}`);
      try {
        const r = await runStep(id, step);
        console.log(`${r.status === "done" ? "✔" : "–"} ${step}: ${r.message || r.status}`);
      } catch (e) {
        console.error(`✖ ${step}: ${e.message}`);
        printNext(id);
        process.exit(1);
      }
      return printNext(id);
    }
    case "context":
      need(2, "context <job> <step>");
      return console.log(stepContext(args[0], args[1]));
    case "decide": {
      need(3, "decide <job> <step> <file.json|->");
      const [id, step, file] = args;
      const text = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        die(`Not valid JSON: ${e.message}`);
      }
      try {
        const r = saveDecision(id, step, data);
        console.log(`✔ ${step}: ${r.summary}`);
      } catch (e) {
        die(`Decision rejected: ${e.message}\nFix the JSON and run decide again.`);
      }
      return printNext(id);
    }
    case "skip":
      need(2, "skip <job> <step> [reason]");
      setStep(args[0], args[1], "skipped", args.slice(2).join(" ") || "Skipped");
      updateJob(args[0], (j) => {
        if (j.status === "error") j.status = "processing";
      });
      return printNext(args[0]);
    case "retry":
      need(2, "retry <job> <step>");
      updateJob(args[0], (j) => {
        const s = j.steps.find((x) => x.id === args[1]);
        if (!s) die(`No step ${args[1]}`);
        s.status = "pending";
        s.message = "";
        j.status = "processing";
      });
      return printNext(args[0]);
    case "status":
      need(1, "status <job>");
      return console.log(JSON.stringify(loadJob(args[0]), null, 2));
    case "path":
      need(1, "path <job>");
      return console.log(jobPath(args[0]));
    default:
      console.log(fs.readFileSync(new globalThis.URL(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
}

main().catch((e) => die(e.stack || e.message));
