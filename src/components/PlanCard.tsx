import type { ImagenOptimizada, PlanPublico } from "../lib/publico";
import { CATEGORIA_NOMBRE, type Categoria } from "../lib/schema";
import { etiquetaFecha, horaLegible, ocurreEn, ultimosDias, yaPaso } from "../lib/fechas";
import { precioInfo } from "../lib/precio";
import BotonFavorito from "./BotonFavorito";

const IDEAL: Record<string, string> = { pareja: "Pareja", amigos: "Amigos", familia: "Familia", solo: "Solo/a" };
const PENDIENTE_TXT: Record<string, string> = { horario: "horario", precio: "precio", direccion: "dirección", fecha: "fecha" };

const FONDO: Record<Categoria, string> = {
  "fiesta": "linear-gradient(135deg,#d6176f,#6d3be0)",
  "aire-libre": "linear-gradient(135deg,#0e8f66,#1a8fb0)",
  "comida-cultura": "linear-gradient(135deg,#c97a00,#c2410c)",
};

/** Ilustración propia por categoría (sin fotos de terceros hasta la Fase 5). Decorativa. */
export function Arte({ categoria, alto = 104 }: { categoria: Categoria; alto?: number }) {
  return (
    <div class="relative overflow-hidden" style={{ background: FONDO[categoria], height: `${alto}px` }} aria-hidden="true">
      <svg class="absolute inset-0 h-full w-full" viewBox="0 0 400 104" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#fff" stroke-width="2">
        {categoria === "fiesta" && (
          <g opacity=".4">
            <circle cx="310" cy="46" r="26" />
            <circle cx="310" cy="46" r="46" />
            <circle cx="310" cy="46" r="68" />
            <path d="M70 28l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#fff" stroke="none" />
            <path d="M150 70l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="#fff" stroke="none" />
          </g>
        )}
        {categoria === "aire-libre" && (
          <g opacity=".42">
            <circle cx="320" cy="30" r="16" fill="#fff" stroke="none" />
            <path d="M0 104l80-62 56 44 70-70 90 88z" fill="#fff" stroke="none" />
            <path d="M0 104l60-34 50 34z" fill="#fff" stroke="none" opacity=".6" />
          </g>
        )}
        {categoria === "comida-cultura" && (
          <g opacity=".4">
            <path d="M40 104V44a30 30 0 0 1 60 0v60M120 104V44a30 30 0 0 1 60 0v60M200 104V44a30 30 0 0 1 60 0v60M280 104V44a30 30 0 0 1 60 0v60" />
            <circle cx="372" cy="22" r="10" fill="#fff" stroke="none" />
          </g>
        )}
      </svg>
    </div>
  );
}

/** Foto optimizada: AVIF y WebP con srcset, JPEG de respaldo, tamaño fijo para evitar saltos de diseño. */
export function Foto({ img, alto, sizes, prioridad = false }: { img: ImagenOptimizada; alto: number; sizes: string; prioridad?: boolean }) {
  const extra: Record<string, string> = prioridad ? { fetchpriority: "high" } : {};
  return (
    <picture>
      <source type="image/avif" srcset={img.avif} sizes={sizes} />
      <source type="image/webp" srcset={img.webp} sizes={sizes} />
      <img
        src={img.src}
        srcset={img.jpeg}
        sizes={sizes}
        alt={img.alt}
        width={img.ancho}
        height={img.alto}
        loading={prioridad ? "eager" : "lazy"}
        decoding="async"
        class="w-full object-cover"
        style={{ height: `${alto}px` }}
        {...extra}
      />
    </picture>
  );
}

export function PlanSkeleton() {
  return (
    <div class="overflow-hidden rounded-tarjeta border border-linea bg-superficie" aria-hidden="true">
      <div class="skeleton h-[104px] !rounded-none" />
      <div class="space-y-3 p-5">
        <div class="skeleton h-3 w-1/3" />
        <div class="skeleton h-6 w-4/5" />
        <div class="skeleton h-4 w-2/3" />
        <div class="skeleton h-4 w-full" />
        <div class="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Texto de horario solo si está confirmado; nunca se muestra uno sin verificar. */
export function horarioVisible(plan: PlanPublico): string | undefined {
  if (plan.pendientes.includes("horario")) return undefined;
  if (plan.horaInicio) return horaLegible(plan.horaInicio) + (plan.horaFin ? ` – ${horaLegible(plan.horaFin)}` : "");
  return plan.horario?.texto;
}

interface Props {
  plan: PlanPublico;
  hoy: string;
}

export default function PlanCard({ plan, hoy }: Props) {
  const precio = precioInfo(plan);
  const esEvento = plan.tipo === "evento";
  const ocurreHoy = esEvento && ocurreEn(plan, [hoy, hoy]);
  const ultimos = esEvento && ultimosDias(plan, hoy);
  const pasado = esEvento && yaPaso(plan, hoy);
  const pendientes = plan.pendientes.filter((c) => c in PENDIENTE_TXT).map((c) => PENDIENTE_TXT[c]);

  // En la tarjeta solo se muestra la hora de los eventos; el horario de un lugar va en su página.
  const horaTxt = esEvento ? horarioVisible(plan) : undefined;
  const donde = [plan.lugar, plan.zona.nombre !== plan.lugar ? plan.zona.nombre : ""].filter(Boolean).join(" · ");

  const insignia = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold";
  const tonoPrecio =
    precio.tono === "gratis" ? "bg-gratis-bg text-gratis-texto" : precio.tono === "pendiente" ? "bg-alerta-bg text-alerta-texto" : "bg-neutro-bg text-neutro-texto";

  return (
    <article id={`plan-${plan.slug}`} class="group flex flex-col overflow-hidden rounded-tarjeta border border-linea bg-superficie transition hover:-translate-y-1 hover:border-violeta hover:shadow-tarjeta">
      <div class="relative">
        {plan.imagenOpt ? <Foto img={plan.imagenOpt} alto={150} sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" /> : <Arte categoria={plan.categoria} />}
        <div class="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span class="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: "var(--velo)" }}>{CATEGORIA_NOMBRE[plan.categoria]}</span>
          <span class="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: "var(--velo)" }}>{etiquetaFecha(plan, hoy)}</span>
        </div>
        <BotonFavorito slug={plan.slug} titulo={plan.titulo} class="absolute bottom-2 right-2" />
      </div>

      <div class="flex flex-1 flex-col gap-2.5 p-5">
        <div class="flex flex-wrap gap-1.5">
          {pasado && <span class={`${insignia} bg-neutro-bg text-neutro-texto`}>Ya pasó</span>}
          {ocurreHoy && <span class={`${insignia} bg-hoy-bg text-hoy-texto`}>Hoy</span>}
          {ultimos && <span class={`${insignia} bg-alerta-bg text-alerta-texto`}>Últimos días</span>}
          <span class={`${insignia} ${tonoPrecio}`}>{precio.texto}</span>
        </div>

        <h3 class="font-display text-xl font-extrabold leading-tight tracking-tight">
          <a href={`/planes/${plan.slug}/`} class="hover:underline">{plan.titulo}</a>
        </h3>
        <p class="text-sm text-suave">
          {donde}
          {horaTxt ? ` · ${horaTxt}` : ""}
        </p>
        <p class="text-[0.95rem]">{plan.descripcionCorta}</p>

        {plan.precio.nota && !plan.pendientes.includes("precio") && <p class="text-sm text-suave">{plan.precio.nota}</p>}

        <div class="mt-auto flex flex-wrap gap-1.5 pt-1">
          {plan.idealPara.map((c) => (
            <span key={c} class="rounded-full border border-linea px-2.5 py-0.5 text-xs font-semibold text-suave">{IDEAL[c]}</span>
          ))}
        </div>

        {pendientes.length > 0 && <p class="text-xs text-suave">Confirma {pendientes.join(", ")} en la fuente.</p>}

        <div class="flex flex-wrap gap-x-5">
          <a href={`/planes/${plan.slug}/`} class="inline-flex min-h-11 items-center font-bold text-acento hover:underline">
            Ver plan
            <span class="solo-lectores">: {plan.titulo}</span>
          </a>
          <a href={plan.fuente.url} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center font-semibold text-suave hover:text-texto hover:underline" data-umami-event="clic_fuente" data-umami-event-plan={plan.slug} data-umami-event-fuente={plan.fuente.nombre}>
            {plan.fuente.nombre} ↗
            <span class="solo-lectores">: {plan.titulo} (se abre en otra pestaña)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
