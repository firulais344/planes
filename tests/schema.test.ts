import { describe, expect, it } from "vitest";
import { PlanSchema } from "../src/lib/schema";

const base = {
  id: "plan-de-prueba",
  slug: "plan-de-prueba",
  titulo: "Plan de prueba",
  descripcionCorta: "Descripción corta de un plan de prueba.",
  tipo: "evento",
  categoria: "fiesta",
  inicio: "2026-11-01",
  zona: { nombre: "El Poblado", comuna: 14 },
  lugar: "Un sitio",
  precio: { tipo: "por_confirmar" },
  idealPara: ["amigos"],
  fuente: { nombre: "Fuente", url: "https://example.com/x" },
  verificado: false,
  pendientes: ["precio"],
};

const ok = (o: object) => PlanSchema.safeParse({ ...base, ...o });
const mensajes = (o: object) => {
  const r = ok(o);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("PlanSchema", () => {
  it("acepta un plan mínimo válido", () => {
    expect(ok({}).success).toBe(true);
  });

  it("exige fecha de inicio en eventos", () => {
    expect(ok({ inicio: undefined }).success).toBe(false);
  });

  it("rechaza fechas inexistentes y con formato incorrecto", () => {
    expect(ok({ inicio: "2026-02-30" }).success).toBe(false);
    expect(ok({ inicio: "01/11/2026" }).success).toBe(false);
  });

  it("rechaza fin anterior al inicio", () => {
    expect(mensajes({ fin: "2026-10-31" })).toContain("La fecha de fin es anterior a la de inicio");
  });

  it("no permite fechas en planes permanentes", () => {
    expect(ok({ tipo: "permanente" }).success).toBe(false);
    expect(ok({ tipo: "permanente", inicio: undefined }).success).toBe(true);
  });

  it("limita la descripción corta a 160 caracteres", () => {
    expect(ok({ descripcionCorta: "a".repeat(161) }).success).toBe(false);
    expect(ok({ descripcionCorta: "a".repeat(160) }).success).toBe(true);
  });

  it("valida el formato de hora", () => {
    expect(ok({ horaInicio: "25:00" }).success).toBe(false);
    expect(ok({ horaInicio: "19:30", horaFin: "23:00" }).success).toBe(true);
    expect(ok({ horaInicio: "23:00", horaFin: "19:30" }).success).toBe(false);
  });

  it("un rango de precio necesita mínimo o máximo y debe ser coherente", () => {
    expect(ok({ precio: { tipo: "rango" }, pendientes: [] }).success).toBe(false);
    expect(ok({ precio: { tipo: "rango", minCOP: 50000, maxCOP: 10000 }, pendientes: [] }).success).toBe(false);
    expect(ok({ precio: { tipo: "rango", minCOP: 50000 }, pendientes: [] }).success).toBe(true);
  });

  it("un precio por_confirmar debe figurar como pendiente", () => {
    expect(ok({ pendientes: [] }).success).toBe(false);
  });

  it("no deja publicar un precio concreto marcado como pendiente", () => {
    expect(ok({ precio: { tipo: "gratis" }, pendientes: ["precio"] }).success).toBe(false);
    expect(ok({ precio: { tipo: "gratis" }, pendientes: [] }).success).toBe(true);
  });

  it("un plan verificado necesita fecha de verificación, precio real y nada pendiente", () => {
    const v = { verificado: true, precio: { tipo: "gratis" }, pendientes: [] };
    expect(ok(v).success).toBe(false);
    expect(ok({ ...v, ultimaVerificacion: "2026-10-29" }).success).toBe(true);
    expect(ok({ ...v, ultimaVerificacion: "2026-10-29", pendientes: ["direccion"] }).success).toBe(false);
  });

  it("lat y lng van juntas y dentro del área de Medellín", () => {
    expect(ok({ lat: 6.25 }).success).toBe(false);
    expect(ok({ lat: 6.25, lng: -75.57 }).success).toBe(true);
    expect(ok({ lat: 4.7, lng: -74.07 }).success).toBe(false); // Bogotá
  });

  it("exige al menos un 'ideal para'", () => {
    expect(ok({ idealPara: [] }).success).toBe(false);
  });

  it("acepta recurrencia semanal en eventos", () => {
    expect(ok({ recurrencia: { frecuencia: "semanal", dias: ["dom"] } }).success).toBe(true);
    expect(ok({ recurrencia: { frecuencia: "semanal", dias: [] } }).success).toBe(false);
  });
});
