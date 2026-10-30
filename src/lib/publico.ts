import type { Plan } from "./schema";

/** Imagen ya optimizada en el build (AVIF/WebP/JPEG con varios anchos). */
export interface ImagenOptimizada {
  alt: string;
  licencia: string;
  credito?: string;
  origen?: string;
  ancho: number;
  alto: number;
  avif: string;
  webp: string;
  jpeg: string;
  src: string;
}

/** Lo que viaja al navegador: sin notas internas ni datos antiguos sin confirmar. */
export type PlanPublico = Omit<Plan, "notasInternas" | "precioPreliminar"> & { imagenOpt?: ImagenOptimizada };

export function aPublico(plan: Plan): PlanPublico {
  const { notasInternas: _n, precioPreliminar: _p, ...resto } = plan;
  return resto;
}
