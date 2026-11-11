// A fingerprint of the skill's code. The server reports it in /api/health; `11se start` compares it
// with its own, so an old server left running after an update is replaced instead of reused.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SKILL_DIR } from "./job.mjs";

const DIRS = ["lib", "app", "server", "bin", "assets"];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
}

export function buildId() {
  const files = [];
  for (const d of DIRS) if (fs.existsSync(path.join(SKILL_DIR, d))) walk(path.join(SKILL_DIR, d), files);
  const h = crypto.createHash("sha1");
  for (const f of files.sort()) h.update(`${path.relative(SKILL_DIR, f)}:${fs.statSync(f).size}:${fs.readFileSync(f).length}`);
  return h.digest("hex").slice(0, 12);
}
