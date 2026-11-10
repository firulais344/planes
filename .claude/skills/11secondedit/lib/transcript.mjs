// Word-level transcript helpers. A word is { i, w, s, e } with s/e in seconds of the
// ORIGINAL video. Everything downstream (cuts, captions, b-roll, zooms) is anchored to
// word indices, so the transcript must be clean: sorted, non-overlapping, every word timed.

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Convert WhisperX output ({segments:[{words:[{word,start,end,score}]}]}) into a clean word list.
 * - words WhisperX could not align (numbers, symbols) get interpolated timestamps
 * - overlapping words are split at the midpoint so no two words share time
 */
export function normalizeWhisperX(raw, duration) {
  const flat = [];
  for (const seg of raw.segments || []) {
    const segWords = seg.words && seg.words.length ? seg.words : [{ word: seg.text, start: seg.start, end: seg.end }];
    for (const w of segWords) {
      const text = String(w.word ?? "").trim();
      if (!text) continue;
      flat.push({
        w: text,
        s: Number.isFinite(w.start) ? w.start : null,
        e: Number.isFinite(w.end) ? w.end : null,
        segS: seg.start,
        segE: seg.end,
        conf: Number.isFinite(w.score) ? round(w.score) : null,
      });
    }
  }
  return normalizeWords(flat, duration);
}

export function normalizeWords(list, duration = Infinity) {
  const words = list.map((w) => ({ ...w }));
  // Interpolate missing timestamps from timed neighbours (or the segment bounds).
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.s != null && w.e != null) continue;
    let j = i;
    while (j < words.length && (words[j].s == null || words[j].e == null)) j++;
    const left = i > 0 ? words[i - 1].e : (w.segS ?? 0);
    const right = j < words.length ? words[j].s : (w.segE ?? Math.min(duration, left + 0.4 * (j - i)));
    const span = Math.max(0, right - left);
    const step = span / (j - i);
    for (let k = i; k < j; k++) {
      words[k].s = left + step * (k - i);
      words[k].e = left + step * (k - i + 1);
      words[k].interpolated = true;
    }
    i = j - 1;
  }
  words.sort((a, b) => a.s - b.s);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    w.s = Math.max(0, Math.min(w.s, duration));
    w.e = Math.max(w.s, Math.min(w.e, duration));
    if (i > 0) {
      const p = words[i - 1];
      if (w.s < p.e) {
        const mid = (Math.max(p.s, w.s) + Math.min(p.e, w.e)) / 2;
        p.e = Math.max(p.s, mid);
        w.s = Math.max(p.e, w.s);
        w.e = Math.max(w.s, w.e);
      }
    }
  }
  return words.map((w, i) => {
    const out = { i, w: w.w, s: round(w.s), e: round(w.e) };
    if (w.conf != null) out.conf = w.conf;
    if (w.interpolated) out.interpolated = true;
    return out;
  });
}

const clean = (w) => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}' ]/gu, "").trim();

// Pure hesitation sounds — never meaningful, removed automatically.
const AUTO_FILLERS = new Set([
  "um", "umm", "ummm", "uh", "uhh", "uhm", "uhmm", "erm", "er", "err", "ah", "ahh", "eh", "ehh", "ehm", "em", "emm",
  "mm", "mmm", "mhm", "hmm", "hm", "hmmm", "eeh", "eeeh", "aah", "mmh",
]);
// Words that are fillers only sometimes — Claude decides from context.
const CANDIDATE_SINGLE = new Set([
  "like", "so", "basically", "actually", "literally", "right", "okay", "ok", "well", "anyway", "just",
  "este", "esta", "bueno", "pues", "tipo", "entonces", "digamos", "vale", "osea", "nada", "mano", "parce", "listo",
]);
const CANDIDATE_PAIRS = [["you", "know"], ["i", "mean"], ["kind", "of"], ["sort", "of"], ["o", "sea"], ["o", "sea,"], ["es", "que"], ["como", "que"], ["no", "se"]];

export function detectFillers(words) {
  const auto = [];
  const candidates = [];
  const c = words.map((w) => clean(w.w));
  for (let i = 0; i < words.length; i++) {
    if (AUTO_FILLERS.has(c[i])) auto.push(i);
    else if (CANDIDATE_SINGLE.has(c[i])) candidates.push([i]);
    else if (i + 1 < words.length && CANDIDATE_PAIRS.some(([a, b]) => c[i] === a && c[i + 1] === clean(b))) candidates.push([i, i + 1]);
  }
  return { auto, candidates };
}

/** Group words into lines at sentence ends and pauses so Claude can read the transcript. */
export function transcriptLines(words, { pause = 0.6, maxWords = 18 } = {}) {
  const lines = [];
  let cur = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    cur.push(w);
    const next = words[k + 1];
    const endSentence = /[.!?…]$/.test(w.w);
    const gap = next ? next.s - w.e : 0;
    if (!next || endSentence || gap >= pause || cur.length >= maxWords) {
      lines.push({ from: cur[0].i, to: cur[cur.length - 1].i, s: cur[0].s, e: cur[cur.length - 1].e, gapAfter: next ? round(gap) : null, words: cur });
      cur = [];
    }
  }
  return lines;
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

/** Readable transcript with word indices: "[12]so [13]today ...". */
export function formatTranscript(words, removed = new Set()) {
  return transcriptLines(words)
    .map((l) => {
      const text = l.words.map((w) => `[${w.i}]${removed.has(w.i) ? `~~${w.w}~~` : w.w}`).join(" ");
      const gap = l.gapAfter != null && l.gapAfter >= 0.6 ? `   (pause ${l.gapAfter}s)` : "";
      return `${fmtTime(l.s)}–${fmtTime(l.e)}  ${text}${gap}`;
    })
    .join("\n");
}
