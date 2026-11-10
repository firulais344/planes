// Turns the model's resolved overlays into HTML. Pure and dependency-free on purpose:
// the HyperFrames composition (Node) and the editor preview (browser) both import this
// file, so what you review is drawn by the same code that gets rendered.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const px = (n) => `${Math.round(n * 100) / 100}px`;

export const FONT_FILES = [
  ["Inter", 300, "normal", "inter-latin-300-normal.woff2"],
  ["Inter", 400, "normal", "inter-latin-400-normal.woff2"],
  ["Inter", 600, "normal", "inter-latin-600-normal.woff2"],
  ["Inter", 700, "normal", "inter-latin-700-normal.woff2"],
  ["Inter", 500, "italic", "inter-latin-500-italic.woff2"],
  ["Dancing Script", 700, "normal", "dancing-script-latin-700-normal.woff2"],
];

const FAMILY = {
  // Single quotes only: these go inside double-quoted style="" attributes.
  sans: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  script: "'Dancing Script', 'Snell Roundhand', cursive",
};

export function fontFaceCss(base) {
  return FONT_FILES.map(([family, weight, style, file]) => `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${style}; font-display: block; src: url("${base}${file}") format("woff2"); }`).join("\n");
}

/** CSS shared by composition and preview. `scope` prefixes every selector (e.g. "#root"). */
export function overlayCss(scope = "") {
  const s = scope ? `${scope} ` : "";
  return [
    `${s}.ov { position: absolute; margin: 0; padding: 0; box-sizing: border-box; }`,
    `${s}.ov-media { object-fit: cover; display: block; }`,
    `${s}.ov-text { transform: translate(-50%, -50%); white-space: nowrap; text-align: center; line-height: 1.12; font-kerning: normal; }`,
    `${s}.ov-text.wrap { white-space: normal; }`,
    `${s}.ov-text span { display: inline; }`,
  ].join("\n");
}

function textStyle(o) {
  const st = [
    `left:${px(o.cx)}`,
    `top:${px(o.cy)}`,
    `z-index:${o.z ?? 5}`,
    `font-family:${FAMILY[o.family || "sans"]}`,
    `font-size:${px(o.size)}`,
    `font-weight:${o.weight || 400}`,
    `font-style:${o.italic ? "italic" : "normal"}`,
    `color:${o.color || "#fff"}`,
  ];
  if (o.tracking) st.push(`letter-spacing:${o.tracking}em`);
  if (o.shadow) st.push(`text-shadow:${o.shadow}`);
  if (o.maxW) st.push(`max-width:${px(o.maxW)}`, `width:max-content`);
  return st.join(";");
}

function spanHtml(sp) {
  const st = [];
  if (sp.family) st.push(`font-family:${FAMILY[sp.family]}`);
  if (sp.size) st.push(`font-size:${px(sp.size)}`);
  if (sp.weight) st.push(`font-weight:${sp.weight}`);
  if (sp.italic != null) st.push(`font-style:${sp.italic ? "italic" : "normal"}`);
  if (sp.color) st.push(`color:${sp.color}`);
  if (sp.tracking != null) st.push(`letter-spacing:${sp.tracking}em`);
  return st.length ? `<span style="${st.join(";")}">${esc(sp.t)}</span>` : esc(sp.t);
}

/**
 * @param o overlay from model.overlays
 * @param opts.attrs extra attributes (the composition adds data-start/data-duration here)
 * @param opts.srcBase prefix for media URLs ("" in the composition, "/api/jobs/<id>/file/" in the preview)
 */
export function overlayHtml(o, { attrs = "", srcBase = "" } = {}) {
  const a = attrs ? ` ${attrs}` : "";
  if (o.kind === "text") {
    const body = (o.spans || [{ t: o.text }]).map(spanHtml).join(o.join ?? " ");
    return `<div id="${o.id}" class="clip ov ov-text${o.wrap ? " wrap" : ""}" style="${textStyle(o)}"${a}>${body}</div>`;
  }
  const box = [`left:${px(o.x)}`, `top:${px(o.y)}`, `width:${px(o.w)}`, `height:${px(o.h)}`, `z-index:${o.z ?? 2}`];
  if (o.kind === "solid") return `<div id="${o.id}" class="clip ov" style="${box.join(";")};background:${o.color}"${a}></div>`;
  if (o.radius) box.push(`border-radius:${px(o.radius)}`);
  const filters = [o.grade ? "url(#grade)" : "", o.whip ? `url(#${o.id}-whip)` : ""].filter(Boolean).join(" ");
  if (filters) box.push(`filter:${filters}`);
  const src = esc(srcBase + o.src);
  if (o.kind === "image") return `<img id="${o.id}" class="clip ov ov-media" src="${src}" alt="" style="${box.join(";")}"${a} />`;
  return `<video id="${o.id}" class="clip ov ov-media" src="${src}" muted playsinline preload="auto" style="${box.join(";")}"${a}></video>`;
}

/** SVG filter definitions: the cinematic grade and one directional-blur filter per whip transition. */
export function svgDefs(model) {
  const defs = [];
  if (model.grade) {
    // Teal shadows, warm highlights, lifted blacks, soft contrast.
    defs.push(
      `<filter id="grade" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="${model.grade.r}"/><feFuncG type="table" tableValues="${model.grade.g}"/><feFuncB type="table" tableValues="${model.grade.b}"/></feComponentTransfer></filter>`,
    );
  }
  for (const o of model.overlays) {
    if (o.whip) defs.push(`<filter id="${o.id}-whip" x="-20%" width="140%" color-interpolation-filters="sRGB"><feGaussianBlur id="${o.id}-whipblur" stdDeviation="0 0"/></filter>`);
  }
  return defs.length ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs.join("")}</defs></svg>` : "";
}
