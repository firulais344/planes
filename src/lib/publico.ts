import type { Plan } from "./schema";

/** Lo que viaja al navegador: sin notas internas ni datos antiguos sin confirmar. */
export type PlanPublico = Omit<Plan, "notasInternas" | "precioPreliminar">;

export function aPublico(plan: Plan): PlanPublico {
  const { notasInternas: _n, precioPreliminar: _p, ...resto } = plan;
  return resto;
}
