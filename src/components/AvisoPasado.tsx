import { useEffect, useState } from "preact/hooks";
import type { PlanPublico } from "../lib/publico";
import { etiquetaFecha, hoyBogota, yaPaso } from "../lib/fechas";

interface Props {
  plan: Pick<PlanPublico, "inicio" | "fin" | "recurrencia" | "tipo">;
  alternativas: PlanPublico[];
  hoyInicial: string;
}

/**
 * La página de un evento nunca da 404: cuando el evento termina, muestra este aviso con
 * alternativas. La fecha se revisa en el navegador (hora de Bogotá), no solo al construir el sitio.
 */
export default function AvisoPasado({ plan, alternativas, hoyInicial }: Props) {
  const [hoy, setHoy] = useState(hoyInicial);
  useEffect(() => setHoy(hoyBogota()), []);

  if (plan.tipo !== "evento" || !yaPaso(plan, hoy)) return null;
  const otras = alternativas.filter((p) => !yaPaso(p, hoy)).slice(0, 3);

  return (
    <aside role="status" class="rounded-tarjeta border border-alerta-texto/40 bg-alerta-bg p-5 text-alerta-texto">
      <p class="font-display text-xl font-extrabold">Este evento ya pasó</p>
      <p class="mt-1">La información de abajo queda como referencia. Mira estos planes que sí vienen:</p>
      {otras.length > 0 && (
        <ul class="mt-3 grid gap-2">
          {otras.map((p) => (
            <li key={p.slug}>
              <a href={`/planes/${p.slug}/`} class="font-bold underline underline-offset-4">{p.titulo}</a>
              <span class="opacity-90"> · {etiquetaFecha(p, hoy)}</span>
            </li>
          ))}
        </ul>
      )}
      <a href="/" class="mt-4 inline-block font-bold underline underline-offset-4">Ver todos los planes</a>
    </aside>
  );
}
