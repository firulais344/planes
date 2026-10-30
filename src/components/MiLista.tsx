import { useEffect, useMemo, useState } from "preact/hooks";
import type { PlanPublico } from "../lib/publico";
import { enlaceLista, guardarFavoritos, slugsDeParametro, useFavoritos } from "../lib/favoritos";
import { etiquetaFecha, hoyBogota } from "../lib/fechas";
import { calendarioICS, esAgendable } from "../lib/ics";
import PlanCard from "./PlanCard";

function descargar(nombre: string, tipo: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MiLista({ planes, hoyInicial }: { planes: PlanPublico[]; hoyInicial: string }) {
  const propios = useFavoritos();
  const [compartidos, setCompartidos] = useState<string[]>([]);
  const [hoy, setHoy] = useState(hoyInicial);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    setHoy(hoyBogota());
    setCompartidos(slugsDeParametro(new URLSearchParams(location.search).get("p")));
  }, []);

  const porSlug = useMemo(() => new Map(planes.map((p) => [p.slug, p])), [planes]);
  const viendoCompartida = compartidos.length > 0 && compartidos.join() !== propios.join();
  const slugs = compartidos.length > 0 ? compartidos : propios;
  const items = slugs.map((s) => porSlug.get(s)).filter((p): p is PlanPublico => !!p);

  const decir = (t: string) => {
    setAviso(t);
    window.setTimeout(() => setAviso(""), 4000);
  };
  const enlace = () => enlaceLista(items.map((p) => p.slug), location.origin);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace());
      decir("Enlace copiado. Quien lo abra verá esta lista.");
    } catch {
      decir("No se pudo copiar el enlace.");
    }
  }

  function exportarTexto() {
    const lineas = items.map((p) => `• ${p.titulo} — ${etiquetaFecha(p, hoy)} — ${p.lugar}\n  ${location.origin}/planes/${p.slug}/`);
    descargar("mi-lista-parchemos.txt", "text/plain;charset=utf-8", `Mi lista de planes en Medellín\n\n${lineas.join("\n\n")}\n`);
  }

  function exportarCalendario() {
    const agendables = items.filter(esAgendable).map((plan) => ({ plan, url: `${location.origin}/planes/${plan.slug}/` }));
    if (!agendables.length) return decir("Ningún plan de tu lista tiene fecha para agendar.");
    descargar("mi-lista-parchemos.ics", "text/calendar;charset=utf-8", calendarioICS(agendables));
  }

  function guardarCompartida() {
    guardarFavoritos([...new Set([...propios, ...compartidos])]);
    setCompartidos([]);
    history.replaceState(null, "", location.pathname);
    decir("Guardamos esos planes en tu lista.");
  }

  function verSoloMia() {
    setCompartidos([]);
    history.replaceState(null, "", location.pathname);
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`Mi lista de planes en Medellín: ${items.length ? enlace() : ""}`)}`;

  return (
    <div class="space-y-6">
      {viendoCompartida && (
        <div role="status" class="rounded-tarjeta border border-violeta bg-superficie p-5">
          <p class="font-display text-lg font-extrabold">Estás viendo una lista compartida</p>
          <p class="mt-1 text-suave">Alguien te pasó {compartidos.length} {compartidos.length === 1 ? "plan" : "planes"}. Puedes guardarlos en tu propia lista.</p>
          <div class="mt-4 flex flex-wrap gap-3">
            <button type="button" class="btn btn--primario" onClick={guardarCompartida}>Guardar en mi lista</button>
            <button type="button" class="btn" onClick={verSoloMia}>Ver solo mi lista</button>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <>
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Compartir y exportar">
            <button type="button" class="btn" onClick={copiar}>Copiar enlace</button>
            <a class="btn" href={wa} target="_blank" rel="noopener noreferrer">Compartir por WhatsApp<span class="solo-lectores"> (se abre en otra pestaña)</span></a>
            <button type="button" class="btn" onClick={exportarTexto}>Descargar texto</button>
            <button type="button" class="btn" onClick={exportarCalendario}>Descargar calendario (.ics)</button>
            {!viendoCompartida && (
              <button type="button" class="min-h-11 px-3 font-semibold text-acento hover:underline" onClick={() => confirm("¿Vaciar toda tu lista?") && guardarFavoritos([])}>Vaciar lista</button>
            )}
          </div>
          <p role="status" aria-live="polite" class="min-h-6 text-suave">{aviso}</p>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <PlanCard key={p.slug} plan={p} hoy={hoy} />)}
          </div>
        </>
      ) : (
        <div class="rounded-tarjeta border border-dashed border-linea-fuerte px-6 py-14 text-center">
          <p class="font-display text-2xl font-extrabold">Tu lista está vacía</p>
          <p class="mx-auto mt-2 max-w-md text-suave">Toca el corazón en cualquier plan para guardarlo aquí. Se guarda en este dispositivo, sin crear cuenta.</p>
          <a href="/" class="btn btn--primario mt-6">Explorar planes</a>
        </div>
      )}
    </div>
  );
}
