/**
 * Ingesta de planes. Uso:
 *   npm run ingesta            # aplica los cambios en src/content/planes y en ingesta/
 *   npm run ingesta -- --dry   # solo muestra el reporte
 *   npm run cola               # imprime la cola de revisión
 *
 * Solo consulta fuentes con permiso «autorizado» o «abierto» (ingesta/fuentes.json).
 * Nunca borra planes: lo que desaparece de una fuente pasa a la cola de revisión.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PlanSchema, type Plan } from "../../src/lib/schema";
import { hoyBogota } from "../../src/lib/fechas";
import { parsearICS } from "./ics";
import {
  CandidatoSchema,
  FuenteSchema,
  aPlanNuevo,
  aplicarCambios,
  buscarSimilar,
  calcularCambios,
  detectarDesaparecidos,
  fusionarCola,
  idCola,
  puedeConsultar,
  reporteMarkdown,
  type Fuente,
  type ItemCola,
  type Resumen,
} from "./nucleo";

const RAIZ = join(import.meta.dirname, "..", "..");
const PLANES = join(RAIZ, "src", "content", "planes");
const INGESTA = join(RAIZ, "ingesta");
const ARCHIVO_COLA = join(INGESTA, "cola-revision.json");
const UA = "ParchemosBot/1.0 (+https://github.com/firulais344/planes)";

const dry = process.argv.includes("--dry");

function leerCola(): ItemCola[] {
  return existsSync(ARCHIVO_COLA) ? (JSON.parse(readFileSync(ARCHIVO_COLA, "utf8")) as ItemCola[]) : [];
}

if (process.argv.includes("--cola")) {
  const cola = leerCola();
  console.log(cola.length ? `${cola.length} pendiente(s) en la cola de revisión:\n` : "La cola de revisión está vacía.");
  for (const i of cola) console.log(`- [${i.tipo}] ${i.titulo ?? i.slug ?? i.id} (${i.creado}): ${i.detalle}`);
  process.exit(0);
}

const leerRaw = (slug: string) => JSON.parse(readFileSync(join(PLANES, `${slug}.json`), "utf8")) as Record<string, unknown>;
const planes: Plan[] = readdirSync(PLANES)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => PlanSchema.parse(JSON.parse(readFileSync(join(PLANES, f), "utf8"))));

async function obtenerCrudos(f: Fuente): Promise<unknown[]> {
  if (f.tipo === "manual") {
    const dir = join(INGESTA, "entrantes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .flatMap((n) => {
        const j = JSON.parse(readFileSync(join(dir, n), "utf8"));
        return (Array.isArray(j) ? j : [j]).map((c: object) => ({ ...c, fuenteId: f.id }));
      });
  }
  if (f.tipo === "ics") {
    if (!f.url) throw new Error("La fuente ics necesita url");
    const r = await fetch(f.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parsearICS(await r.text()).map((e) => ({
      fuenteId: f.id,
      idExterno: e.uid,
      titulo: e.titulo,
      descripcion: e.descripcion,
      inicio: e.inicio,
      fin: e.fin,
      horaInicio: e.horaInicio,
      horaFin: e.horaFin,
      lugar: e.lugar ?? "Por confirmar",
      url: e.url ?? f.url,
      cancelado: e.cancelado,
      recurrente: e.recurrente,
    }));
  }
  throw new Error("Conector «html» sin implementar: hace falta autorización y un acuerdo con la fuente (docs/FUENTES.md)");
}

const hoy = hoyBogota();
const fuentes = FuenteSchema.array().parse(JSON.parse(readFileSync(join(INGESTA, "fuentes.json"), "utf8")));
const slugs = new Set(planes.map((p) => p.slug));

const resumen: Resumen = { fecha: hoy, consultadas: [], omitidas: [], nuevos: [], actualizados: [], sinCambios: 0, cancelados: [], desaparecidos: [], dudosos: [], invalidos: [], enCola: 0 };
const cola: ItemCola[] = [];
const escribir = new Map<string, { plan: Plan; original?: Plan }>();
const item = (tipo: ItemCola["tipo"], clave: string, detalle: string, extra: Partial<ItemCola> = {}): ItemCola => ({ id: idCola(tipo, clave), tipo, detalle, creado: hoy, ...extra });

for (const f of fuentes) {
  if (!puedeConsultar(f)) {
    resumen.omitidas.push({ id: f.id, motivo: `permiso «${f.permiso}». ${f.evidencia}` });
    continue;
  }
  let crudos: unknown[];
  try {
    crudos = await obtenerCrudos(f);
  } catch (e) {
    resumen.omitidas.push({ id: f.id, motivo: `error al consultar: ${(e as Error).message}` });
    continue;
  }
  resumen.consultadas.push(`${f.nombre} (${crudos.length} candidatos)`);
  const vistos = new Set<string>();

  for (const crudo of crudos) {
    const r = CandidatoSchema.safeParse(crudo);
    const tituloCrudo = String((crudo as { titulo?: unknown })?.titulo ?? "(sin título)");
    if (!r.success) {
      const errores = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      resumen.invalidos.push({ titulo: tituloCrudo, errores });
      cola.push(item("invalido", `${f.id}:${tituloCrudo}`, errores.join("; "), { titulo: tituloCrudo, fuenteId: f.id }));
      continue;
    }
    const c = r.data;
    if (c.recurrente) {
      const motivo = "Evento recurrente: no se importa automáticamente; cárgalo a mano con su recurrencia.";
      resumen.invalidos.push({ titulo: c.titulo, errores: [motivo] });
      cola.push(item("invalido", `${f.id}:${c.titulo}`, motivo, { titulo: c.titulo, fuenteId: f.id }));
      continue;
    }
    if ((c.fin ?? c.inicio) < hoy) continue; // ya pasó

    const h = buscarSimilar(c, planes);
    if (h.veredicto === "igual" && h.plan) {
      vistos.add(h.plan.slug);
      const cambios = calcularCambios(h.plan, c);
      const ap = aplicarCambios(h.plan, c, cambios, hoy, f);
      if (!ap.plan) {
        resumen.invalidos.push({ titulo: c.titulo, errores: [ap.error ?? "no se pudo aplicar"] });
        cola.push(item("invalido", `${h.plan.slug}:cambio`, ap.error ?? "no se pudo aplicar", { slug: h.plan.slug, titulo: c.titulo, fuenteId: f.id }));
        continue;
      }
      // Si solo cambió la fecha de verificación no se reescribe el archivo: evita un PR diario vacío.
      const sinFecha = JSON.stringify({ ...ap.plan, ultimaVerificacion: h.plan.ultimaVerificacion });
      if (sinFecha === JSON.stringify(h.plan)) {
        resumen.sinCambios++;
        continue;
      }
      escribir.set(h.plan.slug, { plan: ap.plan, original: h.plan });
      planes[planes.findIndex((p) => p.slug === h.plan!.slug)] = ap.plan;
      resumen.actualizados.push({ slug: h.plan.slug, cambios });
      if (cambios.some((x) => x.campo === "estado")) {
        resumen.cancelados.push(h.plan.slug);
        cola.push(item("cancelacion", h.plan.slug, `La fuente marca «${c.titulo}» como cancelado.`, { slug: h.plan.slug, titulo: c.titulo, fuenteId: f.id }));
      } else if (cambios.length) {
        cola.push(item("cambio", `${h.plan.slug}:${c.inicio}:${c.horaInicio ?? ""}`, cambios.map((x) => `${x.campo}: ${x.antes ?? "—"} → ${x.despues ?? "—"}`).join("; "), { slug: h.plan.slug, titulo: c.titulo, fuenteId: f.id }));
      }
    } else if (h.veredicto === "dudoso" && h.plan) {
      resumen.dudosos.push({ titulo: c.titulo, similarA: h.plan.slug, puntaje: h.puntaje });
      cola.push(item("dudoso", `${f.id}:${c.titulo}:${c.inicio}`, `Se parece a «${h.plan.slug}» (puntaje ${h.puntaje.toFixed(2)}). ¿Es el mismo evento, cambió de fecha o es otra edición?`, { slug: h.plan.slug, titulo: c.titulo, fuenteId: f.id }));
    } else {
      const n = aPlanNuevo(c, f, slugs, hoy);
      if (!n.plan) {
        resumen.invalidos.push({ titulo: c.titulo, errores: n.errores });
        cola.push(item("invalido", `${f.id}:${c.titulo}`, n.errores.join("; "), { titulo: c.titulo, fuenteId: f.id }));
        continue;
      }
      slugs.add(n.plan.slug);
      planes.push(n.plan);
      vistos.add(n.plan.slug);
      escribir.set(n.plan.slug, { plan: n.plan });
      resumen.nuevos.push({ slug: n.plan.slug, titulo: n.plan.titulo, precioConfirmado: n.plan.precio.tipo !== "por_confirmar" });
      cola.push(item("nuevo", n.plan.slug, `Plan nuevo. Por completar: ${n.porCompletar.join(", ")}.`, { slug: n.plan.slug, titulo: n.plan.titulo, fuenteId: f.id }));
    }
  }

  for (const p of detectarDesaparecidos(planes, f.id, vistos, hoy)) {
    resumen.desaparecidos.push(p.slug);
    cola.push(item("desaparecido", p.slug, `«${p.titulo}» ya no aparece en ${f.nombre}. Puede haberse cancelado o movido; no se borra automáticamente.`, { slug: p.slug, titulo: p.titulo, fuenteId: f.id }));
  }
}

// Una novedad es algo que cambia archivos: un plan escrito o un elemento nuevo en la cola.
// Un dudoso o inválido que sigue en la fuente y ya está en la cola no abre un PR todos los días.
const colaActual = leerCola();
const colaFinal = fusionarCola(colaActual, cola);
const hayNovedades = escribir.size > 0 || colaFinal.length > colaActual.length;
resumen.enCola = colaFinal.length;
const reporte = reporteMarkdown(resumen);

if (!hayNovedades) {
  console.log(`Sin novedades (${hoy}). Consultadas: ${resumen.consultadas.length}; omitidas: ${resumen.omitidas.length}.`);
  for (const o of resumen.omitidas) console.log(`  - omitida ${o.id}: ${o.motivo}`);
  process.exit(0);
}

console.log(reporte);
if (dry) {
  console.log("(--dry: no se escribió nada)");
  process.exit(0);
}

for (const [slug, { plan, original }] of escribir) {
  let salida: Record<string, unknown> = plan as unknown as Record<string, unknown>;
  if (original) {
    // Conserva el orden de las claves del archivo: solo se tocan los campos que cambiaron.
    salida = leerRaw(slug);
    for (const k of new Set([...Object.keys(plan), ...Object.keys(original)])) {
      const nuevo = (plan as unknown as Record<string, unknown>)[k];
      if (JSON.stringify(nuevo) === JSON.stringify((original as unknown as Record<string, unknown>)[k])) continue;
      if (nuevo === undefined) delete salida[k];
      else salida[k] = nuevo;
    }
  }
  writeFileSync(join(PLANES, `${slug}.json`), JSON.stringify(salida, null, 2) + "\n");
}
writeFileSync(ARCHIVO_COLA, JSON.stringify(colaFinal, null, 2) + "\n");
mkdirSync(join(INGESTA, "reportes"), { recursive: true });
writeFileSync(join(INGESTA, "reportes", `${hoy}.md`), reporte);
console.log(`Escritos ${escribir.size} plan(es), la cola (${colaFinal.length}) y el reporte ${hoy}.md`);
