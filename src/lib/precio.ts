import type { Plan } from "./schema";

export type TonoPrecio = "gratis" | "normal" | "pendiente";

/** Por debajo de este mínimo (COP) un plan con precio en rango se considera económico. */
export const UMBRAL_ECONOMICO_COP = 50_000;

const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * Texto de precio para la interfaz. Un precio sin confirmar nunca se muestra como cifra:
 * se dice que hay que confirmarlo en la fuente.
 */
export function precioInfo(p: Pick<Plan, "precio">): { texto: string; tono: TonoPrecio } {
  const { tipo, minCOP, maxCOP } = p.precio;
  switch (tipo) {
    case "gratis":
      return { texto: "Gratis", tono: "gratis" };
    case "economico":
      return { texto: "Económico", tono: "normal" };
    case "rango":
      if (minCOP !== undefined && maxCOP !== undefined) return { texto: `COP ${cop.format(minCOP)} – ${cop.format(maxCOP)}`, tono: "normal" };
      if (minCOP !== undefined) return { texto: `Desde COP ${cop.format(minCOP)}`, tono: "normal" };
      return { texto: `Hasta COP ${cop.format(maxCOP ?? 0)}`, tono: "normal" };
    default:
      return { texto: "Confirmar en la fuente", tono: "pendiente" };
  }
}

export type FiltroPrecio = "todos" | "gratis" | "economico";

export function pasaPrecio(p: Pick<Plan, "precio">, filtro: FiltroPrecio): boolean {
  if (filtro === "todos") return true;
  const { tipo, minCOP } = p.precio;
  if (filtro === "gratis") return tipo === "gratis";
  return tipo === "gratis" || tipo === "economico" || (tipo === "rango" && (minCOP ?? Infinity) <= UMBRAL_ECONOMICO_COP);
}
