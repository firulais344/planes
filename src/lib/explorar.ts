import type { PlanPublico } from "./publico";
import { CATEGORIAS, CATEGORIA_NOMBRE, type Categoria } from "./schema";
import { ocurreEn, primerDia, rango, yaPaso, type Cuando } from "./fechas";
import { pasaPrecio, type FiltroPrecio } from "./precio";
import { coincide, tokenizar } from "./busqueda";

export type Ideal = PlanPublico["idealPara"][number];

export interface Estado {
  cuando: Cuando;
  cat: Categoria | "todas";
  precio: FiltroPrecio;
  con: Ideal | "todos";
  zona: string;
  q: string;
  siempre: boolean;
}

export const INICIAL: Estado = { cuando: "todo", cat: "todas", precio: "todos", con: "todos", zona: "todas", q: "", siempre: true };

export const CUANDO_VALORES: Cuando[] = ["todo", "hoy", "manana", "finde", "semana"];
const PRECIOS: FiltroPrecio[] = ["todos", "gratis", "economico"];
const IDEALES: (Ideal | "todos")[] = ["todos", "pareja", "amigos", "familia", "solo"];

// ---------- Búsqueda de texto ----------
const cacheTokens = new WeakMap<PlanPublico, string[]>();
function tokensDe(p: PlanPublico): string[] {
  let t = cacheTokens.get(p);
  if (!t) {
    t = tokenizar([p.titulo, p.lugar, p.zona.nombre, p.descripcionCorta, CATEGORIA_NOMBRE[p.categoria], ...p.etiquetas].join(" "));
    cacheTokens.set(p, t);
  }
  return t;
}

export function pasaComunes(p: PlanPublico, e: Estado): boolean {
  if (e.cat !== "todas" && p.categoria !== e.cat) return false;
  if (!pasaPrecio(p, e.precio)) return false;
  if (e.con !== "todos" && !p.idealPara.includes(e.con)) return false;
  if (e.zona !== "todas" && p.zona.nombre !== e.zona) return false;
  if (e.q && !coincide(tokensDe(p), e.q)) return false;
  return true;
}

export interface Resultado {
  grupos: { dia: string; items: PlanPublico[] }[];
  fijos: PlanPublico[];
  totalEventos: number;
}

export function filtrar(planes: PlanPublico[], e: Estado, hoy: string): Resultado {
  const r = rango(e.cuando, hoy);
  const grupos: Resultado["grupos"] = [];
  const eventos = planes
    .filter((p) => p.tipo === "evento" && p.estado !== "cancelado" && !yaPaso(p, hoy) && pasaComunes(p, e) && ocurreEn(p, r))
    .map((p) => ({ p, dia: primerDia(p, r)! }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.p.titulo.localeCompare(b.p.titulo, "es"));
  for (const { p, dia } of eventos) {
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.items.push(p);
    else grupos.push({ dia, items: [p] });
  }
  const fijos = e.siempre ? planes.filter((p) => p.tipo === "permanente" && p.estado !== "cancelado" && pasaComunes(p, e)) : [];
  return { grupos, fijos, totalEventos: eventos.length };
}

/** Cuántos filtros están activos respecto al estado sin filtros. */
export function contarFiltros(e: Estado): number {
  return [e.cuando !== "todo", e.cat !== "todas", e.precio !== "todos", e.con !== "todos", e.zona !== "todas", e.q !== "", !e.siempre].filter(Boolean).length;
}

export const mismoEstado = (a: Estado, b: Estado) => (Object.keys(a) as (keyof Estado)[]).every((k) => a[k] === b[k]);

// ---------- Estado <-> URL ----------
/** Lee los filtros de la URL sobre un estado base (el preset de la página). Valores inválidos se ignoran. */
export function estadoDesdeParams(base: Estado, params: URLSearchParams): Estado {
  const e = { ...base };
  const cuando = params.get("cuando");
  if (cuando && (CUANDO_VALORES as string[]).includes(cuando)) e.cuando = cuando as Cuando;
  const cat = params.get("cat");
  if (cat && (cat === "todas" || (CATEGORIAS as readonly string[]).includes(cat))) e.cat = cat as Estado["cat"];
  const precio = params.get("precio");
  if (precio && (PRECIOS as string[]).includes(precio)) e.precio = precio as FiltroPrecio;
  const con = params.get("con");
  if (con && (IDEALES as string[]).includes(con)) e.con = con as Estado["con"];
  const zona = params.get("zona");
  if (zona) e.zona = zona.slice(0, 60);
  const q = params.get("q");
  if (q !== null) e.q = q.slice(0, 80).trim();
  const siempre = params.get("siempre");
  if (siempre === "0" || siempre === "1") e.siempre = siempre === "1";
  return e;
}

/** Solo escribe lo que difiere del estado base, para URLs cortas y compartibles. */
export function paramsDesdeEstado(base: Estado, e: Estado): URLSearchParams {
  const p = new URLSearchParams();
  if (e.cuando !== base.cuando) p.set("cuando", e.cuando);
  if (e.cat !== base.cat) p.set("cat", e.cat);
  if (e.precio !== base.precio) p.set("precio", e.precio);
  if (e.con !== base.con) p.set("con", e.con);
  if (e.zona !== base.zona) p.set("zona", e.zona);
  if (e.q !== base.q && e.q) p.set("q", e.q);
  if (e.siempre !== base.siempre) p.set("siempre", e.siempre ? "1" : "0");
  return p;
}
