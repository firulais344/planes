// Job state on disk. Every job lives in <workdir>/jobs/<id>/ and is plain files,
// so the CLI (driven by Claude Code) and the local server can both read it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { stepsFor } from "./steps.mjs";
import { DEFAULT_STYLE, getStyle } from "./styles.mjs";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function workdir() {
  return path.resolve(process.env.ELEVENSE_WORKDIR || path.join(process.cwd(), ".11secondedit"));
}

export function jobsDir() {
  return path.join(workdir(), "jobs");
}

export function jobDir(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid job id: ${id}`);
  return path.join(jobsDir(), id);
}

export function jobPath(id, ...parts) {
  return path.join(jobDir(id), ...parts);
}

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined && (err.code === "ENOENT" || err instanceof SyntaxError)) return fallback;
    throw err;
  }
}

/** Atomic write: never leaves a half-written JSON file for the other process to read. */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function newJobId() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function defaultSettings(styleId = DEFAULT_STYLE) {
  const style = getStyle(styleId);
  return { style: style.id, features: { ...style.features }, format: style.formats[0], hookText: "", ctaText: "", language: "" };
}

export const DEFAULT_SETTINGS = defaultSettings();

export function createJob() {
  const id = newJobId();
  const job = {
    id,
    createdAt: new Date().toISOString(),
    status: "draft",
    source: null,
    broll: [],
    settings: defaultSettings(),
    steps: [],
  };
  fs.mkdirSync(jobPath(id, "source"), { recursive: true });
  fs.mkdirSync(jobPath(id, "broll"), { recursive: true });
  writeJson(jobPath(id, "job.json"), job);
  return job;
}

export function loadJob(id) {
  return readJson(jobPath(id, "job.json"));
}

export function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  writeJson(jobPath(job.id, "job.json"), job);
  return job;
}

export function updateJob(id, fn) {
  const job = loadJob(id);
  fn(job);
  return saveJob(job);
}

export function listJobs() {
  if (!fs.existsSync(jobsDir())) return [];
  return fs
    .readdirSync(jobsDir())
    .filter((d) => fs.existsSync(path.join(jobsDir(), d, "job.json")))
    .map((d) => loadJob(d))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Queue the job: freeze settings and lay out the checklist the page shows. */
export function queueJob(id, settings) {
  return updateJob(id, (job) => {
    if (!job.source) throw new Error("Upload a video first.");
    job.settings = mergeSettings(job.settings, settings);
    job.steps = stepsFor(job).map((s) => ({ id: s.id, label: s.label, kind: s.kind, status: "pending", message: "" }));
    job.status = "queued";
    job.queuedAt = new Date().toISOString();
  });
}

/** Settings are always normalized against the style: a feature the style does not have cannot be on. */
export function mergeSettings(base, incoming = {}) {
  const style = getStyle(incoming.style || base?.style);
  const out = defaultSettings(style.id);
  for (const key of Object.keys(style.features)) {
    const v = incoming.features?.[key] ?? (base?.style === style.id ? base.features?.[key] : undefined);
    if (v !== undefined) out.features[key] = Boolean(v);
  }
  const format = incoming.format || base?.format;
  if (style.formats.includes(format)) out.format = format;
  for (const key of ["hookText", "ctaText", "language"]) {
    const v = incoming[key] ?? base?.[key];
    if (typeof v === "string") out[key] = v.trim().slice(0, 140);
  }
  if (!out.features.hook) out.hookText = "";
  return out;
}

export function setStep(id, stepId, status, message = "") {
  return updateJob(id, (job) => {
    const step = job.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Step "${stepId}" is not part of this job's plan.`);
    step.status = status;
    step.message = message;
    if (status === "running") step.startedAt = new Date().toISOString();
    if (["done", "skipped", "error"].includes(status)) step.finishedAt = new Date().toISOString();
    if (status === "error") job.status = "error";
    else if (job.status === "queued" || job.status === "error") job.status = "processing";
  });
}
