import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PlanPublico } from "../lib/publico";
import { CATEGORIAS, CATEGORIA_NOMBRE, type Categoria } from "../lib/schema";
import { hoyBogota, ocurreEn, primerDia, rango, tituloDia, yaPaso, type Cuando } from "../lib/fechas";
import { pasaPrecio, type FiltroPrecio } from "../lib/precio";
import PlanCard from "./PlanCard";
import Sorprendeme from "./Sorprendeme";

type Ideal = PlanPublico["idealPara"][number];
interface Estado {
  cuando: Cuando;
  cat: Categoria | "todas";
  precio: FiltroPrecio;
  con: Ideal | "todos";
  zona: string;
  q: string;
  siempre: boolean;
}
const INICIAL: Estado = { cuando: "todo", cat: "todas", precio: "todos", con: "todos", zona: "todas", q: "", siempre: true };

const CUANDO_TXT: Record<Cuando, string> = { todo: "lo que viene", hoy: "hoy", manana: "mañana", finde: "este fin de semana", semana: "los próximos 7 días" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function coincideTexto(p: PlanPublico, q: string) {
  const texto = norm([p.titulo, p.lugar, p.zona.nombre, p.descripcionCorta, CATEGORIA_NOMBRE[p.categoria], ...p.etiquetas].join(" "));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => texto.includes(w));
}

function pasaComunes(p: PlanPublico, e: Estado) {
  if (e.cat !== "todas" && p.categoria !== e.cat) return false;
  if (!pasaPrecio(p, e.precio)) return false;
  if (e.con !== "todos" && !p.idealPara.includes(e.con)) return false;
  if (e.zona !== "todas" && p.zona.nombre !== e.zona) return false;
  if (e.q && !coincideTexto(p, e.q)) return false;
  return true;
}

function filtrar(planes: PlanPublico[], e: Estado, hoy: string) {
  const r = rango(e.cuando, hoy);
  const grupos: { dia: string; items: PlanPublico[] }[] = [];
  const eventos = planes
    .filter((p) => p.tipo === "evento" && p.estado !== "cancelado" && !yaPaso(p, hoy) && pasaComunes(p, e) && ocurreEn(p, r))
    .map((p) => ({ p, dia: primerDia(p, r)! }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.p.titulo.localeCompare(b.p.titulo, "es"));
  for (const { p, dia } of eventos) {
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.items.push(p);
    else grupos.push({ dia, items: [p] });
  }
  const fijos = e.siempre ? planes.filter((p) => p.tipo === "permanente" && pasaComunes(p, e)) : [];
  return { grupos, fijos, totalEventos: eventos.length };
}

function contarFiltros(e: Estado) {
  return [e.cuando !== "todo", e.cat !== "todas", e.precio !== "todos", e.con !== "todos", e.zona !== "todas", e.q !== "", !e.siempre].filter(Boolean).length;
}

interface PanelProps {
  e: Estado;
  set: (parcial: Partial<Estado>) => void;
  zonas: string[];
  pref: string;
}

function Panel({ e, set, zonas, pref }: PanelProps) {
  const etiqueta = "mb-1 block text-sm font-semibold text-suave";
  return (
    <div class="grid gap-4">
      <div role="group" aria-label="Categoría" class="flex flex-wrap gap-2">
        <button type="button" class="chip" aria-pressed={e.cat === "todas"} onClick={() => set({ cat: "todas" })}>Todas</button>
        {CATEGORIAS.map((c) => (
          <button key={c} type="button" class="chip" aria-pressed={e.cat === c} onClick={() => set({ cat: e.cat === c ? "todas" : c })}>
            {CATEGORIA_NOMBRE[c]}
          </button>
        ))}
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class={etiqueta} for={`${pref}-cuando`}>Cuándo</label>
          <select id={`${pref}-cuando`} class="campo" value={e.cuando} onChange={(ev) => set({ cuando: (ev.currentTarget as HTMLSelectElement).value as Cuando })}>
            {(Object.keys(CUANDO_TXT) as Cuando[]).map((c) => (
              <option value={c} key={c}>{c === "todo" ? "Todo lo que viene" : c === "hoy" ? "Hoy" : c === "manana" ? "Mañana" : c === "finde" ? "Este fin de semana" : "Próximos 7 días"}</option>
            ))}
          </select>
        </div>
        <div>
          <label class={etiqueta} for={`${pref}-precio`}>Precio</label>
          <select id={`${pref}-precio`} class="campo" value={e.precio} onChange={(ev) => set({ precio: (ev.currentTarget as HTMLSelectElement).value as FiltroPrecio })}>
            <option value="todos">Cualquiera</option>
            <option value="gratis">Solo gratis</option>
            <option value="economico">Gratis o económico</option>
          </select>
        </div>
        <div>
          <label class={etiqueta} for={`${pref}-con`}>¿Con quién?</label>
          <select id={`${pref}-con`} class="campo" value={e.con} onChange={(ev) => set({ con: (ev.currentTarget as HTMLSelectElement).value as Ideal | "todos" })}>
            <option value="todos">Con cualquiera</option>
            <option value="pareja">En pareja</option>
            <option value="amigos">Con amigos</option>
            <option value="familia">En familia</option>
            <option value="solo">Solo/a</option>
          </select>
        </div>
        <div>
          <label class={etiqueta} for={`${pref}-zona`}>Zona</label>
          <select id={`${pref}-zona`} class="campo" value={e.zona} onChange={(ev) => set({ zona: (ev.currentTarget as HTMLSelectElement).value })}>
            <option value="todas">Toda la ciudad</option>
            {zonas.map((z) => <option value={z} key={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <label class="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
        <input type="checkbox" class="h-5 w-5 accent-[var(--acento-fuerte)]" checked={e.siempre} onChange={(ev) => set({ siempre: (ev.currentTarget as HTMLInputElement).checked })} />
        Incluir lugares y planes de siempre
      </label>
    </div>
  );
}

function Vacio({ onQuitar, onTodo }: { onQuitar: () => void; onTodo: () => void }) {
  return (
    <div class="rounded-tarjeta border border-dashed border-linea-fuerte px-6 py-14 text-center">
      <svg class="mx-auto mb-4" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M44 38A18 18 0 1 1 26 14a14 14 0 0 0 18 24z" fill="var(--violeta)" opacity=".85" />
        <circle cx="46" cy="16" r="2.5" fill="var(--acento)" />
        <circle cx="54" cy="28" r="1.8" fill="var(--cian)" />
      </svg>
      <p class="font-display text-2xl font-extrabold">Por aquí está quieto el parche</p>
      <p class="mx-auto mt-2 max-w-md text-suave">No hay planes con esos filtros. Prueba con otro día, otra zona, o mira todo lo que viene.</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" class="btn btn--primario" onClick={onTodo}>Ver todo lo que viene</button>
        <button type="button" class="btn" onClick={onQuitar}>Quitar filtros</button>
      </div>
    </div>
  );
}

export default function Explorador({ planes, hoyInicial }: { planes: PlanPublico[]; hoyInicial: string }) {
  const [e, setE] = useState<Estado>(INICIAL);
  const [hoy, setHoy] = useState(hoyInicial);
  const [hoja, setHoja] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const hojaRef = useRef<HTMLDialogElement>(null);

  const set = (parcial: Partial<Estado>) => setE((prev) => ({ ...prev, ...parcial }));
  const reset = () => setE(INICIAL);

  // "Hoy" se calcula en el navegador con hora de Bogotá y se refresca al volver a la pestaña.
  useEffect(() => {
    const actualizar = () => setHoy(hoyBogota());
    actualizar();
    document.addEventListener("visibilitychange", actualizar);
    return () => document.removeEventListener("visibilitychange", actualizar);
  }, []);

  useEffect(() => {
    const d = hojaRef.current;
    if (!d) return;
    if (hoja && !d.open) d.showModal();
    if (!hoja && d.open) d.close();
  }, [hoja]);

  const zonas = useMemo(() => [...new Set(planes.map((p) => p.zona.nombre))].sort((a, b) => a.localeCompare(b, "es")), [planes]);
  const { grupos, fijos, totalEventos } = useMemo(() => filtrar(planes, e, hoy), [planes, e, hoy]);
  const pool = useMemo(() => [...grupos.flatMap((g) => g.items), ...fijos], [grupos, fijos]);
  const nFiltros = contarFiltros(e);
  const sinFiltros = nFiltros === 0;

  const destacados = useMemo(
    () =>
      planes
        .filter((p) => p.destacado && !yaPaso(p, hoy))
        .sort((a, b) => (primerDia(a, rango("todo", hoy)) ?? "9999").localeCompare(primerDia(b, rango("todo", hoy)) ?? "9999"))
        .slice(0, 4),
    [planes, hoy],
  );

  const total = totalEventos + fijos.length;
  const resumen = total
    ? [totalEventos ? `${totalEventos} ${totalEventos === 1 ? "evento" : "eventos"} para ${CUANDO_TXT[e.cuando]}` : "", fijos.length ? `${fijos.length} ${fijos.length === 1 ? "plan de siempre" : "planes de siempre"}` : ""].filter(Boolean).join(" + ")
    : "Sin resultados";

  const atajo = (clave: "hoy" | "finde" | "gratis" | "pareja") => {
    if (clave === "hoy") set({ cuando: e.cuando === "hoy" ? "todo" : "hoy" });
    if (clave === "finde") set({ cuando: e.cuando === "finde" ? "todo" : "finde" });
    if (clave === "gratis") set({ precio: e.precio === "gratis" ? "todos" : "gratis" });
    if (clave === "pareja") set({ con: e.con === "pareja" ? "todos" : "pareja" });
  };

  return (
    <div>
      <section aria-label="Buscar planes" class="mx-auto w-[min(1120px,100%-2rem)]">
        <div class="flex flex-col gap-3 sm:flex-row">
          <div class="flex-1">
            <label for="buscar" class="solo-lectores">Buscar planes</label>
            <input
              id="buscar"
              type="search"
              class="campo"
              placeholder="Busca: salsa, teatro, Poblado, concierto…"
              autocomplete="off"
              value={e.q}
              onInput={(ev) => set({ q: (ev.currentTarget as HTMLInputElement).value.trim() })}
            />
          </div>
          <button type="button" class="btn btn--primario sm:min-w-44" onClick={() => setSorpresa(true)}>
            Sorpréndeme
          </button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Atajos">
          <button type="button" class="chip" aria-pressed={e.cuando === "hoy"} onClick={() => atajo("hoy")}>Hoy</button>
          <button type="button" class="chip" aria-pressed={e.cuando === "finde"} onClick={() => atajo("finde")}>Este finde</button>
          <button type="button" class="chip" aria-pressed={e.precio === "gratis"} onClick={() => atajo("gratis")}>Gratis</button>
          <button type="button" class="chip" aria-pressed={e.con === "pareja"} onClick={() => atajo("pareja")}>En pareja</button>
          <button type="button" class="chip md:!hidden" onClick={() => setHoja(true)} aria-haspopup="dialog">
            Filtros{nFiltros ? ` (${nFiltros})` : ""}
          </button>
        </div>

        <div class="mt-5 hidden rounded-tarjeta border border-linea bg-superficie p-5 md:block">
          <Panel e={e} set={set} zonas={zonas} pref="d" />
        </div>
      </section>

      <section id="resultados" aria-label="Resultados" class="mx-auto mt-8 w-[min(1120px,100%-2rem)]">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" class="text-suave">{resumen}</p>
          {nFiltros > 0 && <button type="button" class="font-semibold text-acento underline-offset-4 hover:underline" onClick={reset}>Quitar filtros</button>}
        </div>

        {(e.precio !== "todos") && (
          <p class="mb-5 rounded-xl border border-linea bg-superficie px-4 py-3 text-sm text-suave">
            Solo mostramos planes con precio confirmado. Muchos aún dicen “Confirmar en la fuente” y por eso no aparecen en este filtro.
          </p>
        )}

        {sinFiltros && destacados.length > 0 && (
          <div class="mb-12">
            <h2 class="mb-4 font-display text-2xl font-extrabold">Destacados</h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {destacados.map((p) => <PlanCard key={p.slug} plan={p} hoy={hoy} />)}
            </div>
          </div>
        )}

        {total === 0 && <Vacio onQuitar={reset} onTodo={() => set({ cuando: "todo" })} />}

        {grupos.map((g) => {
          const t = tituloDia(g.dia, hoy);
          return (
            <div key={g.dia} class="mb-10">
              <h2 class="mb-4 flex flex-wrap items-baseline gap-3 font-display text-2xl font-extrabold">
                {t.titulo}
                {t.detalle && <small class="font-sans text-base font-medium text-suave">{t.detalle}</small>}
              </h2>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((p) => <PlanCard key={p.slug} plan={p} hoy={hoy} />)}
              </div>
            </div>
          );
        })}

        {fijos.length > 0 && (
          <div class="mb-10">
            <h2 class="mb-4 flex flex-wrap items-baseline gap-3 font-display text-2xl font-extrabold">
              Lugares y planes de siempre
              <small class="font-sans text-base font-medium text-suave">Disponibles cualquier día</small>
            </h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fijos.map((p) => <PlanCard key={p.slug} plan={p} hoy={hoy} />)}
            </div>
          </div>
        )}
      </section>

      <dialog
        ref={hojaRef}
        onClose={() => setHoja(false)}
        onClick={(ev) => ev.target === hojaRef.current && setHoja(false)}
        aria-labelledby="hoja-titulo"
        class="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-linea-fuerte bg-fondo p-0 text-texto backdrop:bg-black/70 [animation:subir-hoja_.25s_ease-out]"
      >
        {hoja && (
          <div class="space-y-5 p-5">
            <div class="flex items-center justify-between">
              <h2 id="hoja-titulo" class="font-display text-2xl font-extrabold">Filtros</h2>
              <button type="button" class="btn !min-h-11" onClick={() => setHoja(false)}>Listo</button>
            </div>
            <Panel e={e} set={set} zonas={zonas} pref="m" />
            <div class="flex gap-3">
              <button type="button" class="btn flex-1" onClick={reset}>Quitar filtros</button>
              <button type="button" class="btn btn--primario flex-1" onClick={() => setHoja(false)}>Ver {total}</button>
            </div>
          </div>
        )}
      </dialog>

      <Sorprendeme abierto={sorpresa} pool={pool} hoy={hoy} onCerrar={() => setSorpresa(false)} onQuitarFiltros={reset} hayFiltros={nFiltros > 0} />
    </div>
  );
}
