// 11 Second Edit — browser app. Talks only to the local server; Claude Code does the editing.
import { overlayHtml, overlayCss, fontFaceCss, svgDefs } from "/shared/overlay-html.mjs";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: opts.body && !(opts.body instanceof Blob) ? { "Content-Type": "application/json" } : {}, ...opts });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || data || res.statusText);
  return data;
};
const fmt = (t) => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function toast(msg, err = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${err ? " err" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), err ? 6000 : 2500);
}

// Feature copy. Which features exist, and their defaults, come from the style (server: lib/styles.mjs).
const FEATURES = {
  enhanceAudio: ["Enhance audio", "Auphonic: leveling, noise reduction, loudness"],
  badTakes: ["Remove bad takes and false starts", "Claude keeps your best take of each line"],
  fillers: ["Remove filler words", "um, uh, eh — and contextual ones like “o sea”, “like”"],
  silences: ["Remove silences", "Tightens pauses, never cuts mid-word"],
  visuals: { collage: ["Image collage", "Claude piles your images in the lower third, each on the word it illustrates"], wordmeme: ["Centre image", "One square image under the caption, swapped every 1–2.5 s"], cinematic: ["B-roll", "Your clips cover the video; fast word-by-word cuts when you list things"] },
  color: { collage: ["Auto color correction", "Measured exposure, contrast and saturation fix"], wordmeme: ["Auto color correction", "Measured exposure, contrast and saturation fix"], cinematic: ["Cinematic color grade", "Teal shadows, warm highlights, lifted blacks — on a-roll and b-roll"] },
  hook: ["Text hook at the start", "Big orange title for the first second", "hookText", "Leave empty and Claude writes it (1–2 words)"],
  captions: { collage: ["Captions", "Small, light, white — 2–4 words at chest height"], wordmeme: ["Captions", "Bold white, 1–2 words at a time"], cinematic: ["Captions", "One big word in the centre over b-roll; small italics when you are on camera"] },
  music: ["Background music", "Generated with ElevenLabs to fit the mood, kept under the voice"],
  sfx: ["Sound effects", "A whoosh on the whip transitions between blocks"],
  cta: ["Call to action card at the end", "Plain white text on black", "ctaText", "Leave empty and Claude writes it"],
};
const WIRES = {
  collage: `<div class="wire"><i class="img" style="left:20%;top:5%;width:60%;height:15%"></i><i class="head"></i><i class="body"></i><i class="txt" style="top:58%;width:40%"></i><i class="img" style="left:8%;top:63%;width:30%;height:20%"></i><i class="img b" style="left:36%;top:77%;width:30%;height:19%"></i><i class="img c" style="left:64%;top:65%;width:26%;height:17%"></i></div>`,
  wordmeme: `<div class="wire"><i class="head"></i><i class="body"></i><i class="txt" style="top:51%;width:34%;height:6px"></i><i class="img b" style="left:26%;top:56%;width:48%;aspect-ratio:1;border-radius:4px"></i></div>`,
  cinematic: `<div class="wire wide"><i class="txt" style="top:44%;width:46%;height:12px;border-radius:3px"></i></div>`,
};

const state = { job: null, model: null, health: null, style: "collage", format: "9:16", es: null, undo: [], uploading: false };
const styleDef = () => state.health?.styles.find((s) => s.id === state.style);

// ---------------- boot ----------------
async function boot() {
  state.health = await api("/api/health");
  const id = new URLSearchParams(location.hash.slice(1)).get("job");
  if (id) {
    try {
      state.job = await api(`/api/jobs/${id}`);
    } catch {
      location.hash = "";
    }
  }
  renderStyles();
  render();
  if (state.job) listen();
}

function setJob(job) {
  state.job = job;
  if (location.hash !== `#job=${job.id}`) history.replaceState(null, "", `#job=${job.id}`);
}

async function ensureJob() {
  if (!state.job) {
    setJob(await api("/api/jobs", { method: "POST" }));
    listen();
  }
  return state.job;
}

function listen() {
  state.es?.close();
  state.es = new EventSource(`/api/jobs/${state.job.id}/events`);
  state.es.onmessage = (e) => {
    const prev = state.job;
    state.job = JSON.parse(e.data);
    const inReview = ["review", "exported"].includes(state.job.status);
    if (inReview && state.job.hasModel && (!state.model || !["review", "exported"].includes(prev?.status))) loadModel();
    render();
  };
}

function render() {
  const s = state.job?.status || "draft";
  $("#view-setup").hidden = s !== "draft";
  $("#view-progress").hidden = !["queued", "processing", "error"].includes(s);
  $("#view-editor").hidden = !["review", "exported"].includes(s) || !state.model;
  $("#job-label").textContent = state.job?.source ? state.job.source.name : "";
  $("#new-edit").hidden = !state.job || s === "draft";
  if (s === "draft") renderSetup();
  else if (["queued", "processing", "error"].includes(s)) renderProgress();
  else renderExport();
}

// ---------------- 1 · setup ----------------
function renderStyles() {
  $("#styles").innerHTML = state.health.styles
    .map(
      (s) => `<button class="style-card${s.id === state.style ? " on" : ""}" data-style="${s.id}" role="radio" aria-checked="${s.id === state.style}">
        ${WIRES[s.id]}<h3>${s.name}</h3><p>${s.tagline}</p><p class="best">${s.bestFor}</p></button>`,
    )
    .join("");
  const st = styleDef();
  if (!st.formats.includes(state.format)) state.format = st.formats[0];
  $("#formats").innerHTML = st.formats.map((f) => `<button data-format="${f}" class="${f === state.format ? "on" : ""}" role="radio" aria-checked="${f === state.format}">${f}${f === "9:16" ? " Reel" : ""}</button>`).join("");
  const pick = (v) => (Array.isArray(v) ? v : v[st.id]);
  $("#features").innerHTML = state.health.featureKeys
    .filter((key) => key in st.features)
    .map((key) => {
      const [title, desc, textKey, ph] = pick(FEATURES[key]);
      return `<li>
        <div class="f-title">${title}</div>
        <label class="switch"><input type="checkbox" data-feature="${key}" ${st.features[key] ? "checked" : ""} aria-label="${title}" /><span></span></label>
        ${desc ? `<div class="f-desc">${desc}</div>` : ""}
        ${textKey ? `<div class="f-extra"><input type="text" data-text="${textKey}" maxlength="${key === "hook" ? 16 : 60}" placeholder="${ph}" /></div>` : ""}
      </li>`;
    })
    .join("");
  const isBroll = st.visuals.upload === "b-roll";
  $("#media-title").innerHTML = isBroll ? "Add your b-roll" : "Add your images";
  $("#media-drop").textContent = isBroll ? "Drop your b-roll clips" : "Drop images (clips work too)";
  $("#media-need").textContent = st.visuals.need;
  const notes = [];
  if (!state.health.keys.auphonic) notes.push("No AUPHONIC_API_KEY in .env — “Enhance audio” will use a local FFmpeg cleanup instead.");
  if (!state.health.keys.elevenlabs && "music" in st.features) notes.push("No ELEVENLABS_API_KEY in .env — “Background music” will be skipped.");
  $("#key-notes").innerHTML = notes.map((n) => `<div>⚠ ${n}</div>`).join("");
}

function renderSetup() {
  const job = state.job;
  const has = Boolean(job?.source) && !state.uploading;
  $("#edit-video").disabled = !has;
  $("#edit-hint").textContent = has ? "Claude Code will run each enabled step and show progress here." : state.uploading ? "Uploading…" : "Upload a video to start.";
  if (job?.source) {
    $("#drop-source .drop-empty").hidden = true;
    $("#drop-source .drop-file").hidden = false;
    $("#source-name").textContent = job.source.name;
    if (!state.uploading) {
      $("#source-meta").textContent = `${(job.source.size / 1e6).toFixed(1)} MB · uploaded`;
      $("#source-bar").style.width = "100%";
      const v = $("#source-thumb");
      const src = `/api/jobs/${job.id}/file/${job.source.file}#t=0.5`;
      if (v.dataset.src !== src) v.src = v.dataset.src = src;
    }
  }
  const list = job?.broll || [];
  const key = list.map((b) => b.name).join("|");
  if ($("#broll-list").dataset.key !== key) {
    $("#broll-list").dataset.key = key;
    $("#broll-list").innerHTML = list
      .map((b) => {
        const url = `/api/jobs/${job.id}/file/${b.file}`;
        const media = /\.(jpe?g|png|webp)$/i.test(b.name) ? `<img class="thumb" src="${url}" alt="" loading="lazy" />` : `<video class="thumb" src="${url}#t=0.5" muted preload="metadata"></video>`;
        return `<li>${media}<div class="name" title="${escapeHtml(b.original)}">${escapeHtml(b.original)}</div><button data-del="${escapeHtml(b.name)}" aria-label="Remove ${escapeHtml(b.original)}">×</button></li>`;
      })
      .join("");
  }
  const nImg = list.filter((b) => /\.(jpe?g|png|webp)$/i.test(b.name)).length;
  const st = styleDef();
  let msg = list.length ? `${nImg} image${nImg === 1 ? "" : "s"}, ${list.length - nImg} clip${list.length - nImg === 1 ? "" : "s"} uploaded.` : "";
  if (!list.length) msg = st.visuals.upload === "b-roll" ? "Without b-roll this style is just you on camera with small captions." : "Without images this style is only the captions over your video.";
  $("#media-count").textContent = msg;
}

function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(JSON.parse(xhr.responseText || "{}").error || xhr.statusText)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

async function uploadSource(file) {
  if (!file) return;
  const job = await ensureJob();
  state.uploading = true;
  $("#drop-source .drop-empty").hidden = true;
  $("#drop-source .drop-file").hidden = false;
  $("#source-name").textContent = file.name;
  $("#source-thumb").src = URL.createObjectURL(file);
  render();
  try {
    const updated = await upload(`/api/jobs/${job.id}/source?name=${encodeURIComponent(file.name)}`, file, (p) => {
      $("#source-bar").style.width = `${p * 100}%`;
      $("#source-meta").textContent = `Uploading ${(p * 100).toFixed(0)}% of ${(file.size / 1e6).toFixed(1)} MB`;
    });
    state.uploading = false;
    setJob(updated);
  } catch (e) {
    state.uploading = false;
    toast(e.message, true);
  }
  render();
}

async function uploadBroll(files) {
  const job = await ensureJob();
  let k = 0;
  for (const f of files) {
    toast(`Uploading ${++k}/${files.length}: ${f.name}`);
    try {
      setJob(await upload(`/api/jobs/${job.id}/broll?name=${encodeURIComponent(f.name)}`, f, () => {}));
    } catch (e) {
      toast(`${f.name}: ${e.message}`, true);
    }
    render();
  }
}

function wireDrop(el, input, onFiles) {
  input.addEventListener("change", () => {
    onFiles([...input.files]);
    input.value = "";
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("over");
    onFiles([...e.dataTransfer.files]);
  });
}

wireDrop($("#drop-source"), $("#file-source"), (fs) => uploadSource(fs[0]));
wireDrop($("#drop-broll"), $("#file-broll"), uploadBroll);
$("#broll-list").addEventListener("click", async (e) => {
  const name = e.target.dataset?.del;
  if (!name) return;
  e.preventDefault();
  setJob(await api(`/api/jobs/${state.job.id}/broll?name=${encodeURIComponent(name)}`, { method: "DELETE" }));
  render();
});
$("#styles").addEventListener("click", (e) => {
  const card = e.target.closest("[data-style]");
  if (!card) return;
  state.style = card.dataset.style;
  state.format = styleDef().formats[0]; // each style opens in the format it was designed for
  renderStyles();
  render();
});
$("#formats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-format]");
  if (!b) return;
  state.format = b.dataset.format;
  $$("#formats button").forEach((x) => {
    x.classList.toggle("on", x === b);
    x.setAttribute("aria-checked", String(x === b));
  });
});

$("#edit-video").addEventListener("click", async () => {
  const features = Object.fromEntries($$("[data-feature]").map((i) => [i.dataset.feature, i.checked]));
  if (features.visuals && !state.job.broll.length) features.visuals = false;
  const settings = { style: state.style, features, format: state.format, ...Object.fromEntries($$("[data-text]").map((i) => [i.dataset.text, i.value])) };
  try {
    setJob(await api(`/api/jobs/${state.job.id}/start`, { method: "POST", body: JSON.stringify({ settings }) }));
    render();
  } catch (e) {
    toast(e.message, true);
  }
});

$("#new-edit").addEventListener("click", () => {
  state.es?.close();
  location.hash = "";
  location.reload();
});

// ---------------- 2 · progress ----------------
function renderProgress() {
  const job = state.job;
  const done = job.steps.filter((s) => ["done", "skipped"].includes(s.status)).length;
  $("#progress-title").textContent = job.status === "queued" ? "Waiting for Claude Code…" : job.status === "error" ? "A step needs attention" : `Editing… ${done}/${job.steps.length}`;
  $("#progress-sub").textContent =
    job.status === "queued"
      ? "Keep the /11secondedit session open in Claude Code — it picks this up in a second."
      : job.status === "error"
        ? "Claude Code can retry or skip the failed step. Check your terminal."
        : "Claude decides what to cut and where things go. Scripts do the rest.";
  const icon = { done: "✓", skipped: "–", error: "!", running: "", pending: "" };
  $("#checklist").innerHTML = job.steps
    .map((s) => `<li class="${s.status}"><span class="ic">${icon[s.status]}</span><div>${s.label}${s.kind !== "script" ? '<span class="who">Claude</span>' : ""}</div>${s.message ? `<div class="msg">${escapeHtml(s.message)}</div>` : ""}</li>`)
    .join("");
}

// ---------------- 3 · editor ----------------
const pv = $("#pv");
const music = $("#pv-music");
const player = { playing: false, out: 0, tailStart: 0, raf: 0, inTail: false, items: [] };

async function loadModel() {
  try {
    setModel(await api(`/api/jobs/${state.job.id}/model`));
  } catch {
    return;
  }
  render();
}

function setModel(m) {
  state.model = m;
  state.edits = m.edits || { removed: [], restored: [] }; // manual edits, so undo/restore build on them
  const fileUrl = (p) => `/api/jobs/${state.job.id}/file/${p}`;
  $("#view-editor").classList.toggle("landscape", m.width > m.height);
  // The preview canvas has the render's real pixel size and is scaled down, so geometry is identical.
  const canvas = $("#canvas");
  canvas.style.width = `${m.width}px`;
  canvas.style.height = `${m.height}px`;
  $("#frame").style.aspectRatio = `${m.width} / ${m.height}`;
  fitCanvas();
  $("#ov-style").textContent = `${fontFaceCss("/fonts/")}\n${overlayCss("#canvas")}`;
  if (pv.dataset.src !== m.aroll.src) {
    pv.src = fileUrl(m.aroll.src);
    pv.dataset.src = m.aroll.src;
  }
  pv.style.filter = m.aroll.css || "";
  $("#ovs").innerHTML = svgDefs(m) + m.overlays.map((o) => overlayHtml(o, { srcBase: `/api/jobs/${state.job.id}/file/` })).join("");
  player.items = m.overlays.map((o) => ({ o, el: document.getElementById(o.id) }));
  for (const it of player.items) it.el.hidden = true;
  if (m.music) {
    if (music.dataset.src !== m.music.src) music.src = music.dataset.src = fileUrl(m.music.src);
    music.volume = Math.min(1, m.music.volume * 2.5);
  } else {
    music.removeAttribute("src");
    delete music.dataset.src;
  }
  renderTranscript();
  renderTimeline();
  renderStats();
  seek(Math.min(player.out, m.duration));
}

function fitCanvas() {
  const m = state.model;
  if (!m) return;
  const w = $("#frame").clientWidth;
  if (w) $("#canvas").style.transform = `scale(${w / m.width})`;
}
new ResizeObserver(fitCanvas).observe($("#frame"));

function renderStats() {
  const m = state.model;
  $("#stats").textContent = `${m.styleName} · ${fmt(m.sourceDuration)} raw → ${fmt(m.duration)} final · ${m.stats.cuts} cuts · ${m.stats.removedWords} words removed · ${m.stats.visuals} visuals`;
  $("#undo").disabled = !state.undo.length;
}

function renderTranscript() {
  const m = state.model;
  const parts = [];
  let para = [];
  m.words.forEach((w, k) => {
    const prev = m.words[k - 1];
    if (prev && w.s - prev.e > 1.2 && para.length) {
      parts.push(`<p>${para.join(" ")}</p>`);
      para = [];
    } else if (prev && w.s - prev.e > 0.6) para.push(`<span class="gap">·</span>`);
    para.push(`<span class="w${w.removed ? " removed" : ""}" data-i="${w.i}"${w.reason ? ` title="${escapeHtml(w.reason)}"` : ""}>${escapeHtml(w.w)}</span>`);
  });
  if (para.length) parts.push(`<p>${para.join(" ")}</p>`);
  $("#transcript").innerHTML = parts.join("");
}

function selectedIndices() {
  const sel = window.getSelection();
  const out = new Set($$("#transcript .w.sel").map((el) => Number(el.dataset.i)));
  if (sel && !sel.isCollapsed && $("#transcript").contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    $$("#transcript .w").forEach((el) => range.intersectsNode(el) && out.add(Number(el.dataset.i)));
  }
  return [...out].sort((a, b) => a - b);
}

let anchor = null;
$("#transcript").addEventListener("click", (e) => {
  const el = e.target.closest(".w");
  if (!el) return;
  const i = Number(el.dataset.i);
  if (!window.getSelection().isCollapsed) return; // a drag-selection is in progress; keep it
  if (e.shiftKey && anchor != null) {
    const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
    $$("#transcript .w").forEach((x) => x.classList.toggle("sel", Number(x.dataset.i) >= a && Number(x.dataset.i) <= b));
  } else {
    $$("#transcript .w.sel").forEach((x) => x.classList.remove("sel"));
    el.classList.add("sel");
    anchor = i;
    const w = state.model.words[i];
    if (w.os != null) seek(w.os + 0.001);
  }
});

async function applyEdit(indices, cut) {
  if (!indices.length) return toast("Select words first (click, shift+click, or drag).");
  const m = state.model;
  const removed = new Set(state.edits.removed);
  const restored = new Set(state.edits.restored);
  for (const i of indices) {
    const w = m.words[i];
    if (cut) {
      restored.delete(i);
      if (!w.removed) removed.add(i);
    } else {
      removed.delete(i);
      if (w.removed) restored.add(i);
    }
  }
  await saveEdits({ removed: [...removed], restored: [...restored] }, true);
}

async function saveEdits(edits, pushUndo) {
  const before = state.edits;
  try {
    const m = await api(`/api/jobs/${state.job.id}/edits`, { method: "POST", body: JSON.stringify(edits) });
    if (pushUndo) state.undo.push(before);
    window.getSelection()?.removeAllRanges();
    setModel(m);
  } catch (e) {
    toast(e.message, true);
  }
}

$("#cut-sel").addEventListener("click", () => applyEdit(selectedIndices(), true));
$("#restore-sel").addEventListener("click", () => applyEdit(selectedIndices(), false));
$("#undo").addEventListener("click", () => state.undo.length && saveEdits(state.undo.pop(), false));
document.addEventListener("keydown", (e) => {
  if ($("#view-editor").hidden || e.target.matches("input, textarea")) return;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedIndices().length) {
    e.preventDefault();
    applyEdit(selectedIndices(), true);
  } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && selectedIndices().length) {
    applyEdit(selectedIndices(), false);
  } else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    $("#undo").click();
  } else if (e.key === " " && e.target === document.body) {
    e.preventDefault();
    togglePlay();
  }
});

// ---------- preview player ----------
function srcToOut(t) {
  for (const s of state.model.segments) {
    if (t < s.s) return s.o;
    if (t <= s.e) return s.o + (t - s.s);
  }
  return state.model.mainDuration;
}
function outToSrc(t) {
  for (const s of state.model.segments) if (t <= s.o + (s.e - s.s)) return s.s + Math.max(0, t - s.o);
  const last = state.model.segments.at(-1);
  return last ? last.e : 0;
}

function seek(t) {
  const m = state.model;
  if (!m) return;
  player.out = Math.max(0, Math.min(t, m.duration));
  if (player.out < m.mainDuration) {
    player.inTail = false;
    pv.currentTime = outToSrc(player.out);
  } else {
    // Past the last word (outro shot / CTA card): the a-roll is over, a clock drives the time.
    player.inTail = true;
    player.tailStart = performance.now() - (player.out - m.mainDuration) * 1000;
    pv.pause();
  }
  if (music.dataset.src) music.currentTime = player.out;
  paint();
}

function togglePlay() {
  if (!state.model) return;
  if (player.playing) {
    player.playing = false;
    pv.pause();
    music.pause();
    $("#play").textContent = "▶";
    paint();
    return;
  }
  if (player.out >= state.model.duration - 0.05) seek(0);
  player.playing = true;
  $("#play").textContent = "❚❚";
  if (!player.inTail) pv.play().catch(() => {});
  else player.tailStart = performance.now() - (player.out - state.model.mainDuration) * 1000;
  if (music.dataset.src) music.play().catch(() => {});
  cancelAnimationFrame(player.raf);
  player.raf = requestAnimationFrame(tick);
}
$("#play").addEventListener("click", togglePlay);

function tick() {
  const m = state.model;
  if (!player.playing || !m) return;
  if (!player.inTail) {
    const t = pv.currentTime;
    const seg = m.segments.find((s) => t >= s.s - 0.01 && t < s.e);
    if (!seg) {
      const next = m.segments.find((s) => s.s > t);
      if (next) pv.currentTime = next.s; // jump over the cut
      else {
        pv.pause();
        player.inTail = true;
        player.tailStart = performance.now();
      }
    }
    player.out = player.inTail ? m.mainDuration : srcToOut(pv.currentTime);
  } else {
    player.out = m.mainDuration + (performance.now() - player.tailStart) / 1000;
  }
  if (player.out >= m.duration) {
    player.out = m.duration;
    togglePlay();
  }
  if (music.dataset.src && Math.abs(music.currentTime - player.out) > 0.3) music.currentTime = player.out;
  paint();
  player.raf = requestAnimationFrame(tick);
}

function paint() {
  const m = state.model;
  const t = player.out;
  $("#time").textContent = `${fmt(t)} / ${fmt(m.duration)}`;
  for (const { o, el } of player.items) {
    const on = t >= o.s && t < o.e;
    if (el.hidden === on) el.hidden = !on;
    if (o.kind === "video") {
      if (!on) {
        if (!el.paused) el.pause();
        continue;
      }
      const want = (o.mediaStart || 0) + (t - o.s);
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
      if (player.playing && el.paused) el.play().catch(() => {});
      if (!player.playing && !el.paused) el.pause();
    }
  }
  const cur = m.words.find((w) => w.os != null && t >= w.os && t < w.oe);
  const prevNow = $("#transcript .w.now");
  if (prevNow && (!cur || Number(prevNow.dataset.i) !== cur.i)) prevNow.classList.remove("now");
  if (cur) {
    const el = $(`#transcript .w[data-i="${cur.i}"]`);
    if (el && !el.classList.contains("now")) {
      el.classList.add("now");
      if (player.playing) el.scrollIntoView({ block: "nearest" });
    }
  }
  const ph = $("#timeline .tl-playhead");
  if (ph) ph.style.left = `calc(74px + 14px + (100% - 74px - 28px) * ${t / m.duration})`;
}

// ---------- timeline ----------
function renderTimeline() {
  const m = state.model;
  const pct = (t) => `${(t / m.duration) * 100}%`;
  const item = (cls, s, e, label = "", title = "") => `<div class="tl-item ${cls}" style="left:${pct(s)};width:${pct(Math.max(0.04, e - s))}" title="${escapeHtml(title || label)}">${escapeHtml(label)}</div>`;
  const step = m.duration > 120 ? 30 : m.duration > 40 ? 10 : 5;
  const ticks = [];
  for (let t = 0; t <= m.duration; t += step) ticks.push(`<span style="left:${pct(t)}">${fmt(t).replace(/\.\d$/, "")}</span>`);
  const visual = m.overlays.filter((o) => o.track === "visual");
  const texts = m.overlays.filter((o) => o.kind === "text");
  const label = (o) => o.text || (o.spans || []).map((s) => s.t).join(" ");
  const rows = [
    ["Video", m.segments.map((s, k) => item("seg", s.o, s.o + (s.e - s.s), "", `Segment ${k + 1}: source ${fmt(s.s)}–${fmt(s.e)}`)).join("")],
    [m.style === "cinematic" ? "B-roll" : "Images", visual.map((o) => item(o.role === "top" || o.role === "outro" ? "zoom" : "broll", o.s, o.e, o.file, `${o.file}${o.whip ? " · whip transition" : ""}`)).join("")],
    ["Text", texts.map((o) => item(o.role === "caption" ? "cap" : "hook", o.s, o.e, o.role === "caption" ? "" : label(o), label(o))).join("")],
    ["Audio", [m.music && item("music", 0, m.duration, "Music"), ...m.sfx.map((s) => item("sfx", s.s, s.e, "", s.kind))].filter(Boolean).join("")],
  ];
  $("#timeline").innerHTML = `<div class="tl-ruler">${ticks.join("")}</div>${rows
    .map(([name, html]) => `<div class="tl-row"><div class="tl-label">${name}</div><div class="tl-track">${html}</div></div>`)
    .join("")}<div class="tl-playhead"></div>`;
}

$("#timeline").addEventListener("click", (e) => {
  const track = e.target.closest(".tl-track");
  if (!track || !state.model) return;
  const r = track.getBoundingClientRect();
  seek(((e.clientX - r.left) / r.width) * state.model.duration);
});

// ---------- export ----------
function renderExport() {
  const ex = state.job.export;
  const panel = $("#export-panel");
  panel.hidden = !ex;
  $("#export").disabled = ex?.status === "rendering";
  if (!ex) return;
  $("#export-bar").style.width = `${ex.progress || 0}%`;
  $("#export-msg").textContent =
    ex.status === "done" ? `Rendered with HyperFrames${ex.loudness ? ` · ${ex.loudness.target} LUFS` : ""}` : ex.status === "error" ? ex.message : `Rendering… ${Math.round(ex.progress || 0)}% · ${ex.message || ""}`;
  const dl = $("#download");
  dl.hidden = ex.status !== "done";
  dl.href = `/api/jobs/${state.job.id}/download`;
}

$("#export").addEventListener("click", async () => {
  try {
    await api(`/api/jobs/${state.job.id}/export`, { method: "POST" });
    toast("Rendering with HyperFrames…");
  } catch (e) {
    toast(e.message, true);
  }
});

$("#studio").addEventListener("click", async () => {
  toast("Starting HyperFrames Studio…");
  try {
    const r = await api(`/api/jobs/${state.job.id}/studio`, { method: "POST" });
    window.open(r.url, "_blank");
  } catch (e) {
    toast(e.message, true);
  }
});

boot();
