import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PlanPublico } from "../lib/publico";
import { CATEGORIAS, CATEGORIA_NOMBRE } from "../lib/schema";
import { hoyBogota, primerDia, rango, tituloDia, yaPaso, type Cuando } from "../lib/fechas";
import type { FiltroPrecio } from "../lib/precio";
import { INICIAL, contarFiltros, estadoDesdeParams, filtrar, mismoEstado, paramsDesdeEstado, type Estado, type Ideal } from "../lib/explorar";
import PlanCard from "./PlanCard";
import Sorprendeme from "./Sorprendeme";
import Mapa, { type Punto } from "./Mapa";

const CUANDO_TXT: Record<Cuando, string> = { todo: "lo que viene", hoy: "hoy", manana: "mañana", finde: "este fin de semana", semana: "los próximos 7 días" };
const CUANDO_OPCION: Record<Cuando, string> = { todo: "Todo lo que viene", hoy: "Hoy", manana: "Mañana", finde: "Este fin de semana", semana: "Próximos 7 días" };

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
            {(Object.keys(CUANDO_OPCION) as Cuando[]).map((c) => <option value={c} key={c}>{CUANDO_OPCION[c]}</option>)}
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

interface Props {
  planes: PlanPublico[];
  hoyInicial: string;
  /** Filtros con los que arranca la página (p. ej. /gratis). La URL puede refinarlos. */
  preset?: Estado;
}

export default function Explorador({ planes, hoyInicial, preset = INICIAL }: Props) {
  const [e, setE] = useState<Estado>(preset);
  const [hoy, setHoy] = useState(hoyInicial);
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
  const [hoja, setHoja] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const [aviso, setAviso] = useState("");
  const [leidoDeUrl, setLeidoDeUrl] = useState(false);
  const hojaRef = useRef<HTMLDialogElement>(null);

  const set = (parcial: Partial<Estado>) => setE((prev) => ({ ...prev, ...parcial }));
  const reset = () => setE(preset);

  // "Hoy" se calcula en el navegador con hora de Bogotá y se refresca al volver a la pestaña.
  useEffect(() => {
    const actualizar = () => setHoy(hoyBogota());
    actualizar();
    document.addEventListener("visibilitychange", actualizar);
    return () => document.removeEventListener("visibilitychange", actualizar);
  }, []);

  // Filtros <-> URL: se leen al cargar y al navegar atrás/adelante; se escriben al cambiar.
  useEffect(() => {
    const leer = () => {
      const params = new URLSearchParams(location.search);
      setE(estadoDesdeParams(preset, params));
      setVista(params.get("vista") === "mapa" ? "mapa" : "lista");
    };
    leer();
    setLeidoDeUrl(true);
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  useEffect(() => {
    if (!leidoDeUrl) return;
    const params = paramsDesdeEstado(preset, e);
    if (vista === "mapa") params.set("vista", "mapa");
    const qs = params.toString();
    const destino = location.pathname + (qs ? `?${qs}` : "") + location.hash;
    if (destino !== location.pathname + location.search + location.hash) history.replaceState(null, "", destino);
  }, [e, vista, leidoDeUrl]);

  useEffect(() => {
    const d = hojaRef.current;
    if (!d) return;
    if (hoja && !d.open) d.showModal();
    if (!hoja && d.open) d.close();
  }, [hoja]);

  const zonas = useMemo(() => [...new Set(planes.map((p) => p.zona.nombre))].sort((a, b) => a.localeCompare(b, "es")), [planes]);
  const { grupos, fijos, totalEventos } = useMemo(() => filtrar(planes, e, hoy), [planes, e, hoy]);
  const pool = useMemo(() => [...grupos.flatMap((g) => g.items), ...fijos], [grupos, fijos]);
  const puntos = useMemo<Punto[]>(
    () => pool.filter((p) => p.lat !== undefined && p.lng !== undefined).map((p) => ({ slug: p.slug, titulo: p.titulo, lat: p.lat!, lng: p.lng!, categoria: p.categoria })),
    [pool],
  );
  const nFiltros = contarFiltros(e);
  const hayCambios = !mismoEstado(e, preset);
  const sinFiltros = mismoEstado(e, INICIAL) && vista === "lista";

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

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(location.href);
      setAviso("Enlace copiado. Quien lo abra verá estos mismos filtros.");
    } catch {
      setAviso("No se pudo copiar. Copia la dirección desde la barra del navegador.");
    }
    window.setTimeout(() => setAviso(""), 4000);
  }

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
              onInput={(ev) => set({ q: (ev.currentTarget as HTMLInputElement).value.trimStart() })}
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
          <p role="status" aria-live="polite" class="text-suave">{aviso || resumen}</p>
          <div class="flex flex-wrap items-center gap-2">
            {hayCambios && <button type="button" class="min-h-11 px-2 font-semibold text-acento underline-offset-4 hover:underline" onClick={reset}>Quitar filtros</button>}
            {hayCambios && <button type="button" class="min-h-11 px-2 font-semibold text-acento underline-offset-4 hover:underline" onClick={copiarEnlace}>Copiar enlace</button>}
            <div role="group" aria-label="Tipo de vista" class="flex gap-2">
              <button type="button" class="chip" aria-pressed={vista === "lista"} onClick={() => setVista("lista")}>Lista</button>
              <button type="button" class="chip" aria-pressed={vista === "mapa"} onClick={() => setVista("mapa")}>Mapa</button>
            </div>
          </div>
        </div>

        {e.precio !== "todos" && (
          <p class="mb-5 rounded-xl border border-linea bg-superficie px-4 py-3 text-sm text-suave">
            Solo mostramos planes con precio confirmado. Muchos aún dicen “Confirmar en la fuente” y por eso no aparecen en este filtro.
          </p>
        )}

        {vista === "mapa" && (
          <div class="mb-10">
            <Mapa puntos={puntos} alto="min(70dvh, 560px)" etiqueta="Mapa con los planes filtrados" />
            <p class="mt-3 text-sm text-suave">
              {puntos.length} de {pool.length} planes tienen ubicación en el mapa. Las ubicaciones son aproximadas y vienen de OpenStreetMap: confirma la dirección en la fuente de cada plan.
            </p>
          </div>
        )}

        {sinFiltros && destacados.length > 0 && (
          <div class="mb-12">
            <h2 class="mb-4 font-display text-2xl font-extrabold">Destacados</h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {destacados.map((p) => <PlanCard key={p.slug} plan={p} hoy={hoy} />)}
            </div>
          </div>
        )}

        {total === 0 && <Vacio onQuitar={reset} onTodo={() => setE({ ...preset, cuando: "todo" })} />}

        {vista === "lista" && grupos.map((g) => {
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

        {vista === "lista" && fijos.length > 0 && (
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

      <Sorprendeme abierto={sorpresa} pool={pool} hoy={hoy} onCerrar={() => setSorpresa(false)} onQuitarFiltros={reset} hayFiltros={hayCambios} />
    </div>
  );
}
