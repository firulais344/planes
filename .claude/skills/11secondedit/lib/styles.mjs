// The three editing styles. Numbers were measured frame by frame on the reference videos
// (positions as fractions of the frame, so they hold at any resolution).
//
// Rule shared by all three: NOTHING animates in. Text and images appear and disappear on a
// hard cut, in sync with the spoken word. No zooms, no bounces, no outlined captions.

export const FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "3:2": { width: 1620, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export const FEATURE_KEYS = ["enhanceAudio", "badTakes", "fillers", "silences", "visuals", "color", "hook", "cta", "captions", "music", "sfx"];

export const STYLES = {
  collage: {
    id: "collage",
    name: "Collage",
    tagline: "Talking head + a collage of images in the lower third",
    bestFor: "Ideas, mindset, business — just you talking to camera",
    formats: ["9:16"],
    // feature → default on/off. A feature that is not listed does not exist in this style.
    features: { enhanceAudio: true, badTakes: true, fillers: true, silences: true, visuals: true, color: true, captions: true, music: false, cta: false },
    visuals: { label: "Image collage", upload: "images", need: "About 1 image per 1.2 s of final video (35–45 for 45 s). Film stills, concept art, anything that illustrates an idea." },
    loudness: -14,
    musicVolume: 0.05,
    caption: { maxWords: 4, maxChars: 24, cy: 0.583, size: 0.0255, weight: 300 },
    // Collage slots (x/y/w as fractions of the frame; h is capped, aspect ratio is kept).
    slots: [
      { anchor: "left", x: 0.08, y: 0.615, w: 0.31, maxH: 0.25 },
      { anchor: "center", x: 0.515, y: 0.77, w: 0.31, maxH: 0.205 },
      { anchor: "right", x: 0.9, y: 0.645, w: 0.26, maxH: 0.19 },
    ],
    top: { maxW: 0.93, maxH: 0.28, bottom: 0.31, maxSeconds: 3.5 },
    maxGroupSeconds: 8,
  },
  wordmeme: {
    id: "wordmeme",
    name: "Word + meme",
    tagline: "Talking head + one bold word and one square image",
    bestFor: "Quick tips and humour — just you talking to camera",
    formats: ["9:16"],
    features: { enhanceAudio: true, badTakes: true, fillers: true, silences: true, visuals: true, color: true, hook: true, captions: true, music: false, cta: false },
    visuals: { label: "Centre image", upload: "images", need: "About 1 image per 1.5 s of final video (12–14 for 20 s). Memes, reactions, characters." },
    loudness: -9,
    musicVolume: 0.08,
    caption: { maxWords: 2, maxChars: 14, cy: 0.528, size: 0.043, weight: 700, tracking: -0.04 },
    image: { x: 0.262, y: 0.555, w: 0.476, radius: 0.05, maxSeconds: 3, minSeconds: 0.4 },
    hook: { minSeconds: 1.2, maxSeconds: 1.7, color: "#F5A04A", titleSize: 0.093, titleCy: 0.526, lineCy: 0.577, plainSize: 0.043, scriptSize: 0.052, proof: { y: 0.594, w: 0.27, h: 0.26, xs: [0.167, 0.562] } },
  },
  cinematic: {
    id: "cinematic",
    name: "Cinematic",
    tagline: "B-roll with one big word in the centre, fast cuts on the beat of the voice",
    bestFor: "You have your own b-roll: travel, training, city",
    formats: ["3:2", "16:9", "9:16"],
    features: { enhanceAudio: true, badTakes: true, fillers: true, silences: true, visuals: true, color: true, captions: true, music: true, sfx: false, cta: false },
    visuals: { label: "B-roll", upload: "b-roll", need: "Your own clips. B-roll covers ~80 % of the video and should literally show what each word names." },
    loudness: -17,
    musicVolume: 0.16,
    caption: {
      broll: { maxWords: 2, maxChars: 13, cy: 0.505, size: 0.15, weight: 700, tracking: -0.02 },
      calm: { size: 0.05 },
      aroll: { maxWords: 3, maxChars: 22, cy: 0.935, size: 0.04, weight: 500, italic: true },
    },
    whipFrames: 5,
    maxOutroSeconds: 3,
  },
};

export const DEFAULT_STYLE = "collage";

export function getStyle(id) {
  return STYLES[id] || STYLES[DEFAULT_STYLE];
}

/** Output frame rate follows the footage (24/25/30); 50/60 fps sources render at half rate. */
export function pickFps(sourceFps) {
  if (!sourceFps) return 30;
  let f = sourceFps;
  while (f > 32) f /= 2;
  return [24, 25, 30].reduce((best, c) => (Math.abs(c - f) < Math.abs(best - f) ? c : best), 30);
}
