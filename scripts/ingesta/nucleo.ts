import { z } from "zod";
import { CATEGORIAS, PlanSchema, type Categoria, type Plan, type Precio } from "../../src/lib/schema";
import { distancia, tokenizar } from "../../src/lib/busqueda";
import { slugify } from "../../src/lib/slug";
import { yaPaso } from "../../src/lib/fechas";

/**
 * Núcleo del pipeline de ingesta. Todo aquí es puro (sin red ni disco) para poder probarlo.
 * Regla: una fuente solo se consulta si su permiso lo autoriza (ver docs/FUENTES.md).
 */

// ---------- Fuentes y permisos ----------
export const PERMISOS = ["autorizado", "abierto", "no_solicitado", "solicitado", "denegado", "por_revisar"] as const;

export const FuenteSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nombre: z.string().min(2),
  tipo: z.enum(["manual", "ics", "html"]),
  url: z.string().url().optional(),
  permiso: z.enum(PERMISOS),
  /** Qué dicen sus términos / robots.txt y de dónde sale el permiso. */
  evidencia: z.string().min(10),
  /** Solo con permiso explícito: copiar la descripción de la fuente (si no, se redacta a mano). */
  copiarDescripcion: z.boolean().default(false),
});
export type Fuente = z.infer<typeof FuenteSchema>;

/** Solo estos permisos permiten consultar una fuente. */
export const puedeConsultar = (f: Pick<Fuente, "permiso">) => f.permiso === "autorizado" || f.permiso === "abierto";

// ---------- Candidatos ----------
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const horaIso = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const CandidatoSchema = z.object({
  fuenteId: z.string(),
  idExterno: z.string().optional(),
  titulo: z.string().min(3).max(120),
  descripcion: z.string().optional(),
  inicio: fechaIso,
  fin: fechaIso.optional(),
  horaInicio: horaIso.optional(),
  horaFin: horaIso.optional(),
  lugar: z.string().min(2),
  direccion: z.string().optional(),
  url: z.string().url(),
  categoria: z.enum(CATEGORIAS).optional(),
  precioTexto: z.string().optional(),
  cancelado: z.boolean().optional(),
  recurrente: z.boolean().optional(),
});
export type Candidato = z.infer<typeof CandidatoSchema>;

// ---------- Similitud (deduplicación) ----------
const STOP = new Set(["de", "la", "el", "en", "los", "las", "y", "a", "con", "del", "al", "un", "una", "por", "para", "tour", "vivo"]);
const tokensTitulo = (s: string) => tokenizar(s).filter((t) => !STOP.has(t) && !/^20\d\d$/.test(t));
const iguales = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && distancia(a, b) <= 1);

/** Coeficiente de Dice entre dos conjuntos de palabras, tolerando una letra de diferencia. */
export function dice(a: string[], b: string[]): number {
  const A = [...new Set(a)];
  const B = [...new Set(b)];
  if (!A.length || !B.length) return 0;
  const m = A.filter((x) => B.some((y) => iguales(x, y))).length;
  return (2 * m) / (A.length + B.length);
}
export const similitudTitulo = (x: string, y: string) => dice(tokensTitulo(x), tokensTitulo(y));
const similitudLugar = (x: string, y: string) => dice(tokenizar(x), tokenizar(y));

const seSolapan = (c: Candidato, p: Plan) => !!p.inicio && c.inicio <= (p.fin ?? p.inicio) && (c.fin ?? c.inicio) >= p.inicio;

export interface Hallazgo {
  veredicto: "igual" | "dudoso" | "nuevo";
  plan?: Plan;
  puntaje: number;
  titulo: number;
}

/** Busca entre los eventos existentes el que más se parece al candidato. */
export function buscarSimilar(c: Candidato, planes: Plan[]): Hallazgo {
  let mejor: Hallazgo = { veredicto: "nuevo", puntaje: 0, titulo: 0 };
  for (const p of planes) {
    if (p.tipo !== "evento") continue;
    const t = similitudTitulo(c.titulo, p.titulo);
    const puntaje = 0.6 * t + 0.25 * (seSolapan(c, p) ? 1 : 0) + 0.15 * similitudLugar(c.lugar, p.lugar);
    if (puntaje > mejor.puntaje) mejor = { veredicto: "nuevo", plan: p, puntaje, titulo: t };
  }
  if (!mejor.plan) return mejor;
  if (mejor.puntaje >= 0.8 && mejor.titulo >= 0.7) return { ...mejor, veredicto: "igual" };
  if (mejor.puntaje >= 0.55) return { ...mejor, veredicto: "dudoso" };
  return { ...mejor, veredicto: "nuevo", plan: undefined };
}

// ---------- Cambios ----------
export interface Cambio {
  slug: string;
  campo: "inicio" | "fin" | "horaInicio" | "horaFin" | "lugar" | "estado";
  antes?: string;
  despues?: string;
}

export function calcularCambios(plan: Plan, c: Candidato): Cambio[] {
  const cambios: Cambio[] = [];
  const add = (campo: Cambio["campo"], antes?: string, despues?: string) => cambios.push({ slug: plan.slug, campo, antes, despues });
  if (c.cancelado && plan.estado !== "cancelado") add("estado", plan.estado, "cancelado");
  if (!plan.recurrencia) {
    if (c.inicio !== plan.inicio) add("inicio", plan.inicio, c.inicio);
    const finC = c.fin && c.fin !== c.inicio ? c.fin : undefined;
    const finP = plan.fin && plan.fin !== plan.inicio ? plan.fin : undefined;
    if (finC !== finP) add("fin", finP, finC);
  }
  if (c.horaInicio && c.horaInicio !== plan.horaInicio) add("horaInicio", plan.horaInicio, c.horaInicio);
  if (c.horaFin && c.horaFin !== plan.horaFin) add("horaFin", plan.horaFin, c.horaFin);
  if (similitudLugar(c.lugar, plan.lugar) < 0.5) add("lugar", plan.lugar, c.lugar);
  return cambios;
}

/** Devuelve el plan actualizado, o un error si el resultado dejaría de ser válido. */
export function aplicarCambios(plan: Plan, c: Candidato, cambios: Cambio[], hoy: string, fuente?: Pick<Fuente, "nombre">): { plan?: Plan; error?: string } {
  const sig: Plan = { ...plan, ultimaVerificacion: hoy };
  for (const cb of cambios) {
    if (cb.campo === "estado") sig.estado = "cancelado";
    if (cb.campo === "inicio") sig.inicio = c.inicio;
    if (cb.campo === "fin") sig.fin = cb.despues;
    if (cb.campo === "lugar") sig.lugar = c.lugar;
    if (cb.campo === "horaInicio") {
      sig.horaInicio = c.horaInicio;
      sig.pendientes = sig.pendientes.filter((x) => x !== "horario");
    }
    if (cb.campo === "horaFin") sig.horaFin = c.horaFin;
  }
  if (sig.fin === undefined) delete sig.fin;
  // El mismo plan visto en otra página: se guarda como fuente adicional.
  if (fuente && c.url !== plan.fuente.url && !(plan.otrasFuentes ?? []).some((o) => o.url === c.url)) {
    sig.otrasFuentes = [...(plan.otrasFuentes ?? []), { nombre: fuente.nombre, url: c.url }];
  }
  const r = PlanSchema.safeParse(sig);
  return r.success ? { plan: r.data } : { error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

// ---------- Candidato -> Plan nuevo ----------
const PALABRAS: Record<Categoria, string[]> = {
  "fiesta": ["concierto", "fiesta", "rumba", "dj", "festival", "baile", "salsa", "reggaeton", "electronica", "techno", "noche", "orquesta"],
  "aire-libre": ["senderismo", "caminata", "parque", "ciclovia", "mirador", "bicicleta", "excursion", "trekking", "deporte", "carrera", "naturaleza"],
  "comida-cultura": ["teatro", "museo", "cine", "exposicion", "galeria", "gastronomia", "comida", "feria", "libro", "taller", "danza", "opera", "arte", "cultura"],
};

/** Adivina la categoría por palabras clave. `segura` solo si una única categoría tiene coincidencias. */
export function inferirCategoria(texto: string): { categoria: Categoria; segura: boolean } {
  const tokens = new Set(tokenizar(texto));
  const aciertos = CATEGORIAS.map((c) => ({ c, n: PALABRAS[c].filter((p) => tokens.has(p)).length })).filter((x) => x.n > 0);
  if (aciertos.length === 1) return { categoria: aciertos[0].c, segura: true };
  if (aciertos.length > 1) return { categoria: aciertos.sort((a, b) => b.n - a.n)[0].c, segura: false };
  return { categoria: "comida-cultura", segura: false };
}

/** Interpreta un texto de precio. Solo da un precio concreto si el texto lo dice con claridad. */
export function interpretarPrecio(texto?: string): { precio: Precio; confirmado: boolean } {
  if (!texto) return { precio: { tipo: "por_confirmar" }, confirmado: false };
  if (/\b(gratis|gratuito|gratuita|entrada libre|ingreso libre|sin costo)\b/i.test(texto)) return { precio: { tipo: "gratis" }, confirmado: true };
  const montos = [...texto.matchAll(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,7})/g)].map((m) => parseInt(m[1].replace(/[.,]/g, ""), 10)).filter((n) => n >= 1000);
  if (montos.length) return { precio: { tipo: "rango", minCOP: Math.min(...montos), maxCOP: Math.max(...montos) }, confirmado: true };
  return { precio: { tipo: "por_confirmar" }, confirmado: false };
}

export function truncar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return corte.slice(0, corte.lastIndexOf(" ") > 40 ? corte.lastIndexOf(" ") : max - 1).trimEnd() + "…";
}

export function slugUnico(titulo: string, inicio: string, existentes: Set<string>): string {
  const base = slugify(titulo).slice(0, 60).replace(/-+$/, "") || "plan";
  for (const s of [base, `${base}-${inicio}`]) if (!existentes.has(s)) return s;
  for (let n = 2; ; n++) if (!existentes.has(`${base}-${inicio}-${n}`)) return `${base}-${inicio}-${n}`;
}

export interface PlanNuevo {
  plan?: Plan;
  /** Campos editoriales que un humano debe completar antes de publicar con confianza. */
  porCompletar: string[];
  errores: string[];
}

export function aPlanNuevo(c: Candidato, fuente: Fuente, existentes: Set<string>, hoy: string): PlanNuevo {
  const porCompletar: string[] = [];
  const cat = c.categoria ? { categoria: c.categoria, segura: true } : inferirCategoria(`${c.titulo} ${c.descripcion ?? ""}`);
  if (!cat.segura) porCompletar.push("categoría");

  const copiar = fuente.copiarDescripcion && !!c.descripcion;
  if (!copiar) porCompletar.push("descripción (redactar con palabras propias)");
  const descripcionCorta = truncar(copiar ? c.descripcion! : `${c.titulo} en ${c.lugar}.`, 160);

  const { precio, confirmado } = interpretarPrecio(c.precioTexto);
  const pendientes: Plan["pendientes"] = ["coordenadas"];
  if (!c.horaInicio) pendientes.push("horario");
  if (!c.direccion) pendientes.push("direccion");
  if (!confirmado) pendientes.push("precio");
  porCompletar.push("zona", "ideal para");

  const slug = slugUnico(c.titulo, c.inicio, existentes);
  const borrador = {
    id: slug,
    slug,
    titulo: c.titulo,
    descripcionCorta,
    tipo: "evento",
    categoria: cat.categoria,
    etiquetas: [],
    inicio: c.inicio,
    ...(c.fin && c.fin !== c.inicio ? { fin: c.fin } : {}),
    ...(c.horaInicio ? { horaInicio: c.horaInicio } : {}),
    ...(c.horaFin ? { horaFin: c.horaFin } : {}),
    zona: { nombre: "Medellín" },
    lugar: c.lugar,
    ...(c.direccion ? { direccion: c.direccion } : {}),
    precio,
    idealPara: ["amigos"],
    fuente: { nombre: fuente.nombre, url: c.url },
    fuenteId: fuente.id,
    verificado: false,
    ultimaVerificacion: hoy,
    pendientes,
    estado: c.cancelado ? "cancelado" : "activo",
    notasInternas: `Ingerido de ${fuente.nombre} el ${hoy}. Por completar: ${porCompletar.join(", ")}.`,
  };
  const r = PlanSchema.safeParse(borrador);
  return r.success ? { plan: r.data, porCompletar, errores: [] } : { porCompletar, errores: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

// ---------- Desaparecidos ----------
/** Eventos futuros de una fuente que ya no aparecen en ella. Nunca se borran solos: pasan a la cola. */
export function detectarDesaparecidos(planes: Plan[], fuenteId: string, vistos: Set<string>, hoy: string): Plan[] {
  return planes.filter((p) => p.fuenteId === fuenteId && p.tipo === "evento" && p.estado === "activo" && !yaPaso(p, hoy) && !vistos.has(p.slug));
}

// ---------- Cola de revisión ----------
export interface ItemCola {
  id: string;
  tipo: "nuevo" | "dudoso" | "cambio" | "cancelacion" | "desaparecido" | "invalido";
  slug?: string;
  titulo?: string;
  fuenteId?: string;
  detalle: string;
  creado: string;
}

export const idCola = (tipo: ItemCola["tipo"], clave: string) => `${tipo}:${clave}`;

export function fusionarCola(actual: ItemCola[], nuevos: ItemCola[]): ItemCola[] {
  const ids = new Set(actual.map((i) => i.id));
  return [...actual, ...nuevos.filter((n) => !ids.has(n.id))];
}

// ---------- Reporte ----------
export interface Resumen {
  fecha: string;
  consultadas: string[];
  omitidas: { id: string; motivo: string }[];
  nuevos: { slug: string; titulo: string; precioConfirmado: boolean }[];
  actualizados: { slug: string; cambios: Cambio[] }[];
  sinCambios: number;
  cancelados: string[];
  desaparecidos: string[];
  dudosos: { titulo: string; similarA: string; puntaje: number }[];
  invalidos: { titulo: string; errores: string[] }[];
  enCola: number;
}

export function reporteMarkdown(r: Resumen): string {
  const L: string[] = [`# Reporte de ingesta ${r.fecha}`, ""];
  const sec = (t: string, filas: string[]) => L.push(`## ${t}`, "", ...(filas.length ? filas : ["Ninguno."]), "");

  L.push("| Indicador | Cantidad |", "|---|---|");
  L.push(`| Planes nuevos | ${r.nuevos.length} |`, `| Planes actualizados | ${r.actualizados.length} |`, `| Sin cambios | ${r.sinCambios} |`);
  L.push(`| Cancelados | ${r.cancelados.length} |`, `| Desaparecidos de su fuente | ${r.desaparecidos.length} |`, `| Dudosos (posible duplicado) | ${r.dudosos.length} |`);
  L.push(`| Sin precio confirmado (nuevos) | ${r.nuevos.filter((n) => !n.precioConfirmado).length} |`, `| Inválidos | ${r.invalidos.length} |`, `| Pendientes en la cola de revisión | ${r.enCola} |`, "");

  sec("Fuentes consultadas", r.consultadas.map((f) => `- ${f}`));
  sec("Fuentes omitidas", r.omitidas.map((o) => `- **${o.id}**: ${o.motivo}`));
  sec("Nuevos", r.nuevos.map((n) => `- \`${n.slug}\`: ${n.titulo}${n.precioConfirmado ? "" : " (sin precio)"}`));
  sec("Actualizados", r.actualizados.map((a) => `- \`${a.slug}\`: ${a.cambios.map((c) => `${c.campo} ${c.antes ?? "—"} → ${c.despues ?? "—"}`).join("; ") || "otra fuente añadida"}`));
  sec("Cancelados", r.cancelados.map((s) => `- \`${s}\``));
  sec("Desaparecidos de su fuente (revisar, no se borran)", r.desaparecidos.map((s) => `- \`${s}\``));
  sec("Dudosos: posible duplicado", r.dudosos.map((d) => `- «${d.titulo}» se parece a \`${d.similarA}\` (${d.puntaje.toFixed(2)})`));
  sec("Inválidos", r.invalidos.map((i) => `- «${i.titulo}»: ${i.errores.join("; ")}`));
  L.push("Los planes nuevos entran con `verificado: false` y precio sin confirmar si la fuente no lo dio. Revisa la cola en `ingesta/cola-revision.json` antes de aprobar.");
  return L.join("\n") + "\n";
}
