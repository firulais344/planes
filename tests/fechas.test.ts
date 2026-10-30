import { describe, expect, it } from "vitest";
import { diaSemana, etiquetaFecha, hoyBogota, ocurreEn, primerDia, rango, sumarDias, ultimosDias, yaPaso } from "../src/lib/fechas";
import { pasaPrecio, precioInfo } from "../src/lib/precio";

describe("hoyBogota", () => {
  it("usa la hora de Bogotá aunque en UTC ya sea el día siguiente", () => {
    // 2026-11-01 03:30 UTC = 2026-10-31 22:30 en Bogotá
    expect(hoyBogota(new Date("2026-11-01T03:30:00Z"))).toBe("2026-10-31");
  });
  it("no adelanta el día a las 23:59 de Bogotá", () => {
    expect(hoyBogota(new Date("2026-11-01T04:59:00Z"))).toBe("2026-10-31");
    expect(hoyBogota(new Date("2026-11-01T05:00:00Z"))).toBe("2026-11-01");
  });
});

describe("sumarDias y diaSemana", () => {
  it("cruza cambio de mes y de año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("calcula el día de la semana", () => {
    expect(diaSemana("2026-10-29")).toBe(4); // jueves
    expect(diaSemana("2026-11-01")).toBe(0); // domingo
  });
});

describe("rango", () => {
  it("hoy y mañana", () => {
    expect(rango("hoy", "2026-10-29")).toEqual(["2026-10-29", "2026-10-29"]);
    expect(rango("manana", "2026-10-31")).toEqual(["2026-11-01", "2026-11-01"]);
  });
  it("fin de semana desde un jueves: viernes a domingo", () => {
    expect(rango("finde", "2026-10-29")).toEqual(["2026-10-30", "2026-11-01"]);
  });
  it("fin de semana desde sábado y domingo", () => {
    expect(rango("finde", "2026-10-31")).toEqual(["2026-10-31", "2026-11-01"]);
    expect(rango("finde", "2026-11-01")).toEqual(["2026-11-01", "2026-11-01"]);
  });
  it("próximos 7 días cruza de mes", () => {
    expect(rango("semana", "2026-10-29")).toEqual(["2026-10-29", "2026-11-04"]);
  });
});

describe("ocurreEn / primerDia", () => {
  const unDia = { inicio: "2026-10-31" };
  const varios = { inicio: "2026-10-24", fin: "2026-11-02" };
  const domingos = { inicio: "2026-11-01", fin: "2026-11-22", recurrencia: { frecuencia: "semanal" as const, dias: ["dom" as const], hasta: "2026-11-22" } };

  it("evento de un día", () => {
    expect(ocurreEn(unDia, ["2026-10-31", "2026-10-31"])).toBe(true);
    expect(ocurreEn(unDia, ["2026-11-01", "2026-11-01"])).toBe(false);
  });
  it("evento de varios días en curso: el primer día visible es el inicio del rango", () => {
    expect(primerDia(varios, ["2026-10-29", "2026-10-29"])).toBe("2026-10-29");
  });
  it("evento recurrente solo ocurre los días indicados", () => {
    expect(ocurreEn(domingos, ["2026-10-29", "2026-10-29"])).toBe(false); // jueves
    expect(ocurreEn(domingos, ["2026-10-30", "2026-11-01"])).toBe(true); // incluye domingo 1
    expect(primerDia(domingos, ["2026-10-30", "2026-11-08"])).toBe("2026-11-01");
    expect(ocurreEn(domingos, ["2026-11-23", "2026-12-31"])).toBe(false); // ya terminó
  });
});

describe("yaPaso y ultimosDias", () => {
  it("un evento pasado no aparece", () => {
    expect(yaPaso({ inicio: "2026-10-25" }, "2026-10-29")).toBe(true);
    expect(yaPaso({ inicio: "2026-10-29" }, "2026-10-29")).toBe(false);
    expect(yaPaso({ inicio: undefined }, "2026-10-29")).toBe(false);
  });
  it("marca 'últimos días' en eventos de varios días", () => {
    const e = { inicio: "2026-10-24", fin: "2026-10-31" };
    expect(ultimosDias(e, "2026-10-29")).toBe(true);
    expect(ultimosDias(e, "2026-10-26")).toBe(false);
    expect(ultimosDias({ inicio: "2026-10-31" }, "2026-10-31")).toBe(false);
  });
});

describe("etiquetaFecha", () => {
  it("hoy, mañana y rangos", () => {
    expect(etiquetaFecha({ inicio: "2026-10-29" }, "2026-10-29")).toBe("Hoy");
    expect(etiquetaFecha({ inicio: "2026-10-30" }, "2026-10-29")).toBe("Mañana");
    expect(etiquetaFecha({ inicio: "2026-10-24", fin: "2026-11-02" }, "2026-10-29")).toMatch(/^En curso · hasta 2 nov/);
    expect(etiquetaFecha({}, "2026-10-29")).toBe("Siempre disponible");
  });
});

describe("precio", () => {
  const p = (precio: object) => ({ precio: precio as any });
  it("nunca muestra cifra si está por confirmar", () => {
    expect(precioInfo(p({ tipo: "por_confirmar" })).texto).toBe("Confirmar en la fuente");
  });
  it("formatea rangos en pesos colombianos", () => {
    expect(precioInfo(p({ tipo: "rango", minCOP: 75800 })).texto).toBe("Desde COP 75.800");
  });
  it("filtra gratis y económico", () => {
    expect(pasaPrecio(p({ tipo: "gratis" }), "gratis")).toBe(true);
    expect(pasaPrecio(p({ tipo: "por_confirmar" }), "gratis")).toBe(false);
    expect(pasaPrecio(p({ tipo: "rango", minCOP: 30000 }), "economico")).toBe(true);
    expect(pasaPrecio(p({ tipo: "rango", minCOP: 75800 }), "economico")).toBe(false);
  });
});
