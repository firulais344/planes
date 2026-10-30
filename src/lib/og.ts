import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { PlanPublico } from "./publico";
import { CATEGORIA_NOMBRE, type Categoria } from "./schema";
import { diaCorto, diaLargo } from "./fechas";

/**
 * Imágenes para redes sociales (1200×630) generadas en el build con satori + resvg.
 * Son ilustraciones propias: no usan fotos ni imágenes de terceros.
 * El texto se convierte en trazos, así que la marca se ve igual en cualquier red.
 */
const ANCHO = 1200;
const ALTO = 630;

const FONDO: Record<Categoria, string> = {
  "fiesta": "linear-gradient(135deg, #d6176f, #6d3be0)",
  "aire-libre": "linear-gradient(135deg, #0e8f66, #1a8fb0)",
  "comida-cultura": "linear-gradient(135deg, #c97a00, #c2410c)",
};

const MARCA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6176f"/><stop offset="1" stop-color="#6d3be0"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path d="M16 6l2.3 7.7L26 16l-7.7 2.3L16 26l-2.3-7.7L6 16l7.7-2.3z" fill="#fff"/></svg>`;
const MARCA_URI = `data:image/svg+xml;base64,${Buffer.from(MARCA).toString("base64")}`;

let fuentes: { name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[] | undefined;
function cargarFuentes() {
  if (!fuentes) {
    const base = join(process.cwd(), "node_modules", "@fontsource");
    fuentes = [
      { name: "Bricolage", data: readFileSync(join(base, "bricolage-grotesque", "files", "bricolage-grotesque-latin-800-normal.woff")), weight: 800, style: "normal" },
      { name: "Inter", data: readFileSync(join(base, "inter", "files", "inter-latin-600-normal.woff")), weight: 600, style: "normal" },
      { name: "Inter", data: readFileSync(join(base, "inter", "files", "inter-latin-400-normal.woff")), weight: 400, style: "normal" },
    ];
  }
  return fuentes;
}

type Nodo = { type: string; props: { style?: Record<string, unknown>; children?: unknown; [k: string]: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Nodo => ({ type, props: { style, children, ...extra } });

/** Fecha en texto absoluto: la imagen no cambia de significado con el paso de los días. */
export function fechaAbsoluta(p: PlanPublico): string {
  if (p.tipo !== "evento" || !p.inicio) return "Siempre disponible";
  if (p.recurrencia) return "Todos los " + p.recurrencia.dias.map((d) => ({ lun: "lunes", mar: "martes", mie: "miércoles", jue: "jueves", vie: "viernes", sab: "sábados", dom: "domingos" })[d]).join(" y ");
  const fin = p.fin ?? p.inicio;
  return fin === p.inicio ? diaLargo(p.inicio) : `${diaCorto(p.inicio)} – ${diaCorto(fin)}`;
}

function tamanoTitulo(t: string) {
  return t.length > 70 ? 50 : t.length > 48 ? 60 : t.length > 28 ? 72 : 88;
}

async function aPng(arbol: Nodo): Promise<Buffer> {
  const svg = await satori(arbol as never, { width: ANCHO, height: ALTO, fonts: cargarFuentes() });
  return new Resvg(svg, { fitTo: { mode: "width", value: ANCHO } }).render().asPng();
}

function marca() {
  return h("div", { display: "flex", alignItems: "center", gap: 16 }, [
    h("img", {}, undefined, { src: MARCA_URI, width: 64, height: 64 }),
    h("div", { display: "flex", fontFamily: "Bricolage", fontWeight: 800, fontSize: 44, color: "#f3f1ff" }, [
      h("span", {}, "parche"),
      h("span", { color: "#ff6fb5" }, "mos"),
    ]),
  ]);
}

const FONDO_BASE = "linear-gradient(135deg, #0b0a14 0%, #1d1a38 100%)";

export async function imagenPlan(p: PlanPublico): Promise<Buffer> {
  const donde = [p.lugar, p.zona.nombre !== p.lugar && p.zona.nombre !== "Medellín" ? p.zona.nombre : ""].filter(Boolean).join(" · ");
  return aPng(
    h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", width: ANCHO, height: ALTO, padding: 64, background: FONDO_BASE, color: "#f3f1ff", fontFamily: "Inter" }, [
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        h("div", { display: "flex", padding: "12px 26px", borderRadius: 999, background: FONDO[p.categoria], fontWeight: 600, fontSize: 28, color: "#fff" }, CATEGORIA_NOMBRE[p.categoria]),
        h("div", { display: "flex", fontWeight: 600, fontSize: 30, color: "#b8b3de" }, fechaAbsoluta(p)),
      ]),
      h("div", { display: "flex", flexDirection: "column", gap: 20 }, [
        h("div", { display: "flex", fontFamily: "Bricolage", fontWeight: 800, fontSize: tamanoTitulo(p.titulo), lineHeight: 1.05, letterSpacing: -2 }, p.titulo),
        h("div", { display: "flex", fontSize: 32, fontWeight: 400, color: "#b8b3de" }, donde),
      ]),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [marca(), h("div", { display: "flex", fontSize: 30, fontWeight: 600, color: "#b8b3de" }, "Planes en Medellín")]),
    ]),
  );
}

export async function imagenInicio(): Promise<Buffer> {
  return aPng(
    h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", width: ANCHO, height: ALTO, padding: 72, background: FONDO_BASE, color: "#f3f1ff", fontFamily: "Inter" }, [
      marca(),
      h("div", { display: "flex", flexDirection: "column", gap: 24 }, [
        h("div", { display: "flex", fontFamily: "Bricolage", fontWeight: 800, fontSize: 104, lineHeight: 1, letterSpacing: -3 }, "¿Qué hacemos hoy?"),
        h("div", { display: "flex", fontSize: 38, fontWeight: 400, color: "#b8b3de" }, "Fiestas, conciertos, aire libre, comida y cultura en Medellín."),
      ]),
      h("div", { display: "flex", gap: 16 }, ["Fiestas y noche", "Aire libre", "Comida y cultura"].map((t, i) =>
        h("div", { display: "flex", padding: "12px 26px", borderRadius: 999, background: FONDO[(["fiesta", "aire-libre", "comida-cultura"] as Categoria[])[i]], fontWeight: 600, fontSize: 28, color: "#fff" }, t),
      )),
    ]),
  );
}
