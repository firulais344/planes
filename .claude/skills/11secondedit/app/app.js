// 11 Second Edit — browser app. Talks only to the local server; Claude Code does the editing.
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
function toast(msg, err = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${err ? " err" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), err ? 6000 : 2500);
}

const FEATURES = [
  ["enhanceAudio", "Enhance audio", "Auphonic: leveling, noise reduction, loudness"],
  ["badTakes", "Remove bad takes and false starts", "Claude keeps your best take of each line"],
  ["fillers", "Remove filler words", "um, uh, eh — and contextual ones like “like”, “o sea”"],
  ["silences", "Remove silences", "Tightens pauses, never cuts mid-word"],
  ["broll", "Add b-roll", "Claude places your clips where they match what you say"],
  ["zooms", "Add zoom cuts", "Punch-ins on emphasis and punchlines"],
  ["color", "Auto color correction", "Measured exposure, contrast and saturation fix"],
  ["hook", "Text hook at the start", "", "hookText", "Leave empty and Claude writes it"],
  ["cta", "Call to action card at the end", "", "ctaText", "Leave empty and Claude writes it"],
  ["captions", "Animated word-by-word captions", "Bold captions that highlight each word"],
  ["music", "Background music", "Generated with ElevenLabs to fit the mood"],
  ["sfx", "Sound effects", "Whooshes on cuts, pop on hook, ding on CTA"],
];

const state = { job: null, model: null, health: null, format: "9:16", es: null, undo: [], uploading: false };

// ---------------- boot ----------------
async function boot() {
  state.health = await api("/api/health").catch(() => null);
  const id = new URLSearchParams(location.hash.slice(1)).get("job");
  if (id) {
    try {
      state.job = await api(`/api/jobs/${id}`);
    } catch {
      location.hash = "";
    }
  }
  renderFeatures();
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
    const becameReview = prev && !["review", "exported"].includes(prev.status) && ["review", "exported"].includes(state.job.status);
    if (becameReview || (state.job.hasModel && ["review", "exported"].includes(state.job.status) && !state.model)) loadModel();
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
function renderFeatures() {
  $("#features").innerHTML = FEATURES.map(
    ([key, title, desc, textKey, ph]) => `
    <li>
      <div class="f-title">${title}</div>
      <label class="switch"><input type="checkbox" data-feature="${key}" checked aria-label="${title}" /><span></span></label>
      ${desc ? `<div class="f-desc">${desc}</div>` : ""}
      ${textKey ? `<div class="f-extra"><input type="text" data-text="${textKey}" maxlength="${key === "hook" ? 80 : 60}" placeholder="${ph}" /></div>` : ""}
    </li>`,
  ).join("");
  const notes = [];
  if (state.health && !state.health.keys.auphonic) notes.push("No AUPHONIC_API_KEY in .env — “Enhance audio” will use a local FFmpeg cleanup instead.");
  if (state.health && !state.health.keys.elevenlabs) notes.push("No ELEVENLABS_API_KEY in .env — “Background music” will be skipped.");
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
  $("#broll-list").innerHTML = (job?.broll || [])
    .map((b) => {
      const url = `/api/jobs/${job.id}/file/${b.file}`;
      const media = /\.(jpe?g|png|webp)$/i.test(b.name) ? `<img class="thumb" src="${url}" alt="" />` : `<video class="thumb" src="${url}#t=0.5" muted preload="metadata"></video>`;
      return `<li>${media}<div class="name" title="${b.original}">${b.original}</div><button data-del="${b.name}" aria-label="Remove ${b.original}">×</button></li>`;
    })
    .join("");
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
  for (const f of files) {
    toast(`Uploading ${f.name}…`);
    try {
      setJob(await upload(`/api/jobs/${job.id}/broll?name=${encodeURIComponent(f.name)}`, f, () => {}));
    } catch (e) {
      toast(e.message, true);
    }
    render();
  }
}

function wireDrop(el, input, onFiles) {
  input.addEventListener("change", () => onFiles([...input.files]));
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
$$(".seg button").forEach((b) =>
  b.addEventListener("click", () => {
    state.format = b.dataset.format;
    $$(".seg button").forEach((x) => {
      x.classList.toggle("on", x === b);
      x.setAttribute("aria-checked", String(x === b));
    });
  }),
);

$("#edit-video").addEventListener("click", async () => {
  const features = Object.fromEntries($$("[data-feature]").map((i) => [i.dataset.feature, i.checked]));
  if (features.broll && !state.job.broll.length) features.broll = false;
  const settings = { features, format: state.format, ...Object.fromEntries($$("[data-text]").map((i) => [i.dataset.text, i.value])) };
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
    .map(
      (s) => `<li class="${s.status}"><span class="ic">${icon[s.status]}</span><div>${s.label}${s.kind !== "script" ? '<span class="who">Claude</span>' : ""}</div>${s.message ? `<div class="msg">${escapeHtml(s.message)}</div>` : ""}</li>`,
    )
    .join("");
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------- 3 · editor ----------------
const pv = $("#pv");
const music = $("#pv-music");
const player = { playing: false, out: 0, ctaStart: 0, raf: 0, inCta: false };

async function loadModel() {
  try {
    state.model = await api(`/api/jobs/${state.job.id}/model`);
  } catch {
    return;
  }
  const m = state.model;
  const editor = $("#view-editor");
  editor.classList.toggle("landscape", m.format === "16:9");
  const fileUrl = (p) => `/api/jobs/${state.job.id}/file/${p}`;
  if (pv.dataset.src !== m.aroll.src) {
    pv.src = fileUrl(m.aroll.src);
    pv.dataset.src = m.aroll.src;
  }
  $("#stage").style.filter = m.aroll.filter || "";
  if (m.music) {
    if (music.dataset.src !== m.music.src) music.src = music.dataset.src = fileUrl(m.music.src);
    music.volume = m.music.volume * 2.5;
  } else music.removeAttribute("src");
  state.edits = m.edits || { removed: [], restored: [] }; // manual edits, so undo/restore build on them
  renderTranscript();
  renderTimeline();
  renderStats();
  seek(Math.min(player.out, m.duration));
  render();
}

function renderStats() {
  const m = state.model;
  $("#stats").textContent = `${fmt(m.sourceDuration)} raw → ${fmt(m.duration)} final · ${m.stats.cuts} cuts · ${m.stats.removedWords} words removed`;
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
  const sel = window.getSelection();
  if (!sel.isCollapsed) return; // a drag-selection is in progress; keep it
  if (e.shiftKey && anchor != null) {
    const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
    $$("#transcript .w").forEach((x) => x.classList.toggle("sel", Number(x.dataset.i) >= a && Number(x.dataset.i) <= b));
  } else {
    $$("#transcript .w.sel").forEach((x) => x.classList.remove("sel"));
    el.classList.add("sel");
    anchor = i;
    const w = state.model.words[i];
    if (w.os != null) seek(w.os);
  }
});

async function applyEdit(indices, cut) {
  if (!indices.length) return toast("Select words first (click, shift+click, or drag).");
  const m = state.model;
  const cur = state.edits || { removed: [], restored: [] };
  const removed = new Set(cur.removed);
  const restored = new Set(cur.restored);
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
  const before = state.edits || { removed: [], restored: [] };
  try {
    state.model = await api(`/api/jobs/${state.job.id}/edits`, { method: "POST", body: JSON.stringify(edits) });
    if (pushUndo) state.undo.push(before);
    state.edits = edits;
    window.getSelection()?.removeAllRanges();
    renderTranscript();
    renderTimeline();
    renderStats();
    seek(Math.min(player.out, state.model.duration));
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
    player.inCta = false;
    pv.currentTime = outToSrc(player.out);
  } else {
    player.inCta = true;
    player.ctaStart = performance.now() - (player.out - m.mainDuration) * 1000;
    pv.pause();
  }
  if (music.src) music.currentTime = player.out;
  paintOverlays();
}

function togglePlay() {
  if (!state.model) return;
  if (player.playing) {
    player.playing = false;
    pv.pause();
    music.pause();
    $("#play").textContent = "▶";
    return;
  }
  if (player.out >= state.model.duration - 0.05) seek(0);
  player.playing = true;
  $("#play").textContent = "❚❚";
  if (!player.inCta) pv.play().catch(() => {});
  else player.ctaStart = performance.now() - (player.out - state.model.mainDuration) * 1000;
  if (music.src) music.play().catch(() => {});
  cancelAnimationFrame(player.raf);
  player.raf = requestAnimationFrame(tick);
}
$("#play").addEventListener("click", togglePlay);

function tick() {
  const m = state.model;
  if (!player.playing || !m) return;
  if (!player.inCta) {
    const t = pv.currentTime;
    const seg = m.segments.find((s) => t >= s.s - 0.01 && t < s.e);
    if (!seg) {
      const next = m.segments.find((s) => s.s > t);
      if (next) pv.currentTime = next.s; // jump over the cut
      else {
        pv.pause();
        player.inCta = true;
        player.ctaStart = performance.now();
      }
    }
    player.out = player.inCta ? m.mainDuration : srcToOut(pv.currentTime);
  } else {
    player.out = m.mainDuration + (performance.now() - player.ctaStart) / 1000;
  }
  if (player.out >= m.duration) {
    player.out = m.duration;
    togglePlay();
  }
  if (music.src && Math.abs(music.currentTime - player.out) > 0.3) music.currentTime = player.out;
  paintOverlays();
  player.raf = requestAnimationFrame(tick);
}

let lastBroll = null;
function paintOverlays() {
  const m = state.model;
  const t = player.out;
  $("#time").textContent = `${fmt(t)} / ${fmt(m.duration)}`;
  const z = m.zooms.find((x) => t >= x.s && t < x.e);
  $("#stage").style.transform = z ? `scale(${z.scale})` : "";
  const b = m.broll.find((x) => t >= x.s && t < x.e);
  const ov = $("#ov-broll");
  if (b !== lastBroll) {
    lastBroll = b;
    const url = b ? `/api/jobs/${state.job.id}/file/${b.src}` : "";
    ov.innerHTML = b ? (b.type === "image" ? `<img src="${url}" alt="" />` : `<video src="${url}" muted playsinline></video>`) : "";
  }
  const bv = ov.querySelector("video");
  if (bv && b) {
    const want = t - b.s;
    if (Math.abs(bv.currentTime - want) > 0.3) bv.currentTime = want;
    if (player.playing && bv.paused) bv.play().catch(() => {});
    if (!player.playing && !bv.paused) bv.pause();
  }
  $("#ov-hook").hidden = !(m.hook && t >= m.hook.s && t < m.hook.e);
  if (m.hook) $("#ov-hook > div").textContent = m.hook.text;
  const cta = $("#ov-cta");
  cta.hidden = !(m.cta && t >= m.cta.s);
  if (m.cta) {
    $(".cta-text", cta).textContent = m.cta.text;
    $(".cta-sub", cta).textContent = m.cta.sub || "";
  }
  const g = m.captions.find((x) => t >= x.s && t < x.e);
  $("#ov-cap").innerHTML = g ? g.words.map((w) => `<span class="${t >= w.s && t < w.e ? "on" : ""}">${escapeHtml(w.w)}</span>`).join(" ") : "";
  // transcript follow
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
  const item = (cls, s, e, label = "", title = "") => `<div class="tl-item ${cls}" style="left:${pct(s)};width:${pct(Math.max(0.05, e - s))}" title="${escapeHtml(title || label)}">${escapeHtml(label)}</div>`;
  const step = m.duration > 120 ? 30 : m.duration > 40 ? 10 : 5;
  const ticks = [];
  for (let t = 0; t <= m.duration; t += step) ticks.push(`<span style="left:${pct(t)}">${fmt(t).replace(/\.\d$/, "")}</span>`);
  const rows = [
    ["Video", m.segments.map((s, k) => item("seg", s.o, s.o + (s.e - s.s), "", `Segment ${k + 1}: source ${fmt(s.s)}–${fmt(s.e)}`)).join("")],
    ["B-roll", m.broll.map((b) => item("broll", b.s, b.e, b.file)).join("")],
    ["Zoom", m.zooms.map((z) => item("zoom", z.s, z.e, `${z.scale}×`)).join("")],
    ["Text", [m.hook && item("hook", m.hook.s, m.hook.e, "Hook", m.hook.text), m.cta && item("cta", m.cta.s, m.cta.e, "CTA", m.cta.text), ...m.captions.map((c) => item("cap", c.s, c.e, "", c.words.map((w) => w.w).join(" ")))].filter(Boolean).join("")],
    ["Audio", [m.music && item("music", 0, m.duration, "Music"), ...m.sfx.map((s) => item("sfx", s.s, s.e, "", s.kind))].filter(Boolean).join("")],
  ];
  $("#timeline").innerHTML = `<div class="tl-ruler">${ticks.join("")}</div>${rows
    .map(([label, html]) => `<div class="tl-row"><div class="tl-label">${label}</div><div class="tl-track">${html}</div></div>`)
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
  $("#export-msg").textContent = ex.status === "done" ? "Rendered with HyperFrames" : ex.status === "error" ? ex.message : `Rendering… ${Math.round(ex.progress || 0)}% · ${ex.message || ""}`;
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
