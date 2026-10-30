import { useEffect, useRef, useState } from "preact/hooks";
import type { PlanPublico } from "../lib/publico";
import PlanCard, { PlanSkeleton } from "./PlanCard";
import { track } from "../lib/analitica";

interface Props {
  abierto: boolean;
  pool: PlanPublico[];
  hoy: string;
  onCerrar: () => void;
  onQuitarFiltros: () => void;
  hayFiltros: boolean;
}

const sinAnimacion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Sorprendeme({ abierto, pool, hoy, onCerrar, onQuitarFiltros, hayFiltros }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState<PlanPublico | null>(null);
  const [cargando, setCargando] = useState(false);
  const timer = useRef<number>();

  function sortear(evitarSlug?: string) {
    window.clearTimeout(timer.current);
    const candidatos = pool.length > 1 ? pool.filter((p) => p.slug !== evitarSlug) : pool;
    if (!candidatos.length) {
      setPlan(null);
      setCargando(false);
      return;
    }
    const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
    if (sinAnimacion()) {
      setPlan(elegido);
      setCargando(false);
      return;
    }
    setCargando(true);
    timer.current = window.setTimeout(() => {
      setPlan(elegido);
      setCargando(false);
    }, 700);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      sortear();
    } else if (!abierto && d.open) {
      d.close();
    }
    return () => window.clearTimeout(timer.current);
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => e.target === ref.current && onCerrar()}
      aria-labelledby="sorpresa-titulo"
      class="m-auto w-[min(30rem,calc(100%-2rem))] rounded-3xl border border-linea-fuerte bg-fondo p-0 text-texto backdrop:bg-black/70"
    >
      <div class="space-y-4 p-4">
        <div class="flex items-center justify-between gap-3">
          <h2 id="sorpresa-titulo" class="font-display text-2xl font-extrabold">Te toca este plan</h2>
          <button type="button" class="btn !min-h-11 !px-4" onClick={onCerrar} aria-label="Cerrar">Cerrar</button>
        </div>

        <div aria-live="polite" aria-busy={cargando}>
          {cargando && <PlanSkeleton />}
          {!cargando && plan && <PlanCard plan={plan} hoy={hoy} />}
          {!cargando && !plan && (
            <div class="rounded-tarjeta border border-dashed border-linea-fuerte p-6 text-center">
              <p class="font-display text-lg font-extrabold">Con esos filtros no hay nada para sortear.</p>
              {hayFiltros && (
                <button type="button" class="btn mt-4" onClick={() => { onQuitarFiltros(); }}>
                  Quitar filtros
                </button>
              )}
            </div>
          )}
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn--primario flex-1" onClick={() => { track("sorprendeme_otro"); sortear(plan?.slug); }} disabled={cargando || pool.length === 0}>
            Otro plan
          </button>
        </div>
        <p class="text-xs text-suave">Sorteamos entre los planes que ves con tus filtros actuales ({pool.length}).</p>
      </div>
    </dialog>
  );
}
