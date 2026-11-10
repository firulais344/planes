// External APIs. Keys come from .env (project root, then the skill folder) — never from code.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./job.mjs";

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const file of [path.join(process.cwd(), ".env"), path.join(SKILL_DIR, ".env")]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

export function env(name) {
  loadEnv();
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(res, what) {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  throw new Error(`${what} failed: HTTP ${res.status} ${body.slice(0, 400)}`);
}

// ---------- Auphonic: audio enhancement ----------
// https://auphonic.com/help/api/  (create production → upload → start → poll → download)
const AUPHONIC = "https://auphonic.com/api";

function auphonicAuth() {
  const key = env("AUPHONIC_API_KEY");
  if (key) return { Authorization: `Bearer ${key}` };
  const user = env("AUPHONIC_USERNAME");
  const pass = env("AUPHONIC_PASSWORD");
  if (user && pass) return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
  return null;
}

export const hasAuphonic = () => Boolean(auphonicAuth());

export async function auphonicEnhance(inputFile, outputFile, { title = "11 Second Edit", onStatus = () => {} } = {}) {
  const auth = auphonicAuth();
  if (!auth) throw new Error("No AUPHONIC_API_KEY in .env");
  const create = await check(
    await fetch(`${AUPHONIC}/productions.json`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { title },
        // Leveler + noise/reverb reduction + loudness to -16 LUFS. Silence cutting stays OFF:
        // the enhanced track must stay sample-aligned with the original video.
        algorithms: { leveler: true, filtering: true, denoise: true, denoiseamount: 0, normloudness: true, loudnesstarget: -16, maxpeak: -1 },
        output_files: [{ format: "wav", ending: "wav" }],
      }),
    }),
    "Auphonic create production",
  );
  const uuid = (await create.json()).data.uuid;
  onStatus("uploading audio to Auphonic");
  const form = new FormData();
  form.append("input_file", await fs.openAsBlob(inputFile), path.basename(inputFile));
  await check(await fetch(`${AUPHONIC}/production/${uuid}/upload.json`, { method: "POST", headers: auth, body: form }), "Auphonic upload");
  await check(await fetch(`${AUPHONIC}/production/${uuid}/start.json`, { method: "POST", headers: auth }), "Auphonic start");
  const started = Date.now();
  for (;;) {
    await sleep(4000);
    const data = (await (await check(await fetch(`${AUPHONIC}/production/${uuid}.json`, { headers: auth }), "Auphonic status")).json()).data;
    if (data.status === 3) {
      const url = data.output_files?.[0]?.download_url;
      if (!url) throw new Error("Auphonic finished without an output file");
      const res = await check(await fetch(url, { headers: auth }), "Auphonic download");
      fs.writeFileSync(outputFile, Buffer.from(await res.arrayBuffer()));
      return { uuid };
    }
    if (data.status === 2) throw new Error(`Auphonic error: ${data.error_message || data.status_string}`);
    onStatus(`Auphonic: ${data.status_string || "processing"}`);
    if (Date.now() - started > 20 * 60 * 1000) throw new Error("Auphonic took longer than 20 minutes");
  }
}

// ---------- ElevenLabs: background music ----------
// https://elevenlabs.io/docs/api-reference/music/compose
export const hasElevenLabs = () => Boolean(env("ELEVENLABS_API_KEY"));

export async function elevenLabsMusic(prompt, seconds, outputFile) {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) throw new Error("No ELEVENLABS_API_KEY in .env");
  const ms = Math.round(Math.min(300, Math.max(10, seconds)) * 1000);
  const res = await check(
    await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: ms, model_id: "music_v1", force_instrumental: true }),
    }),
    "ElevenLabs music",
  );
  fs.writeFileSync(outputFile, Buffer.from(await res.arrayBuffer()));
}
