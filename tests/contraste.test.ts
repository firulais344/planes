import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "..", "src", "styles", "global.css"), "utf8");

function tokens(bloque: RegExp): Record<string, string> {
  const m = css.match(bloque);
  if (!m) throw new Error("Bloque de tokens no encontrado");
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [x[1], x[2]]));
}

const oscuro = tokens(/:root \{([\s\S]*?)\n\}/);
const claro = { ...oscuro, ...tokens(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/) };

function luminancia(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [texto, fondo, mínimo]. 4.5 = texto normal AA; 3 = componentes de interfaz y texto grande.
const PARES: [string, string, number][] = [
  ["texto", "fondo", 4.5],
  ["texto", "superficie", 4.5],
  ["texto", "superficie-2", 4.5],
  ["suave", "fondo", 4.5],
  ["suave", "superficie", 4.5],
  ["acento", "fondo", 4.5],
  ["acento", "superficie", 4.5],
  ["violeta", "fondo", 4.5],
  ["cian", "fondo", 4.5],
  ["sobre-fuerte", "acento-fuerte", 4.5],
  ["sobre-fuerte", "violeta-fuerte", 4.5],
  ["gratis-texto", "gratis-bg", 4.5],
  ["hoy-texto", "hoy-bg", 4.5],
  ["alerta-texto", "alerta-bg", 4.5],
  ["neutro-texto", "neutro-bg", 4.5],
  ["linea-fuerte", "fondo", 3],
  ["linea-fuerte", "superficie", 3],
];

describe.each([
  ["oscuro", oscuro],
  ["claro", claro],
] as const)("contraste WCAG AA, tema %s", (_nombre, t) => {
  it.each(PARES)("%s sobre %s ≥ %s", (fg, bg, min) => {
    expect(t[fg], `falta --${fg}`).toBeDefined();
    expect(t[bg], `falta --${bg}`).toBeDefined();
    expect(contraste(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
