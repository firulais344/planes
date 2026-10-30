import { describe, expect, it } from "vitest";
import { INICIAL, contarFiltros, estadoDesdeParams, filtrar, mismoEstado, paramsDesdeEstado } from "../src/lib/explorar";
import { construirPresets } from "../src/lib/presets";
import { depurar, enlaceLista, slugsDeParametro } from "../src/lib/favoritos";
import type { PlanPublico } from "../src/lib/publico";

const base = {
  descripcionCorta: "Descripción de prueba suficientemente larga.",
  categoria: "fiesta",
  etiquetas: [],
  zona: { nombre: "El Poblado" },
  lugar: "Sitio",
  precio: { tipo: "por_confirmar" },
  idealPara: ["amigos"],
  fuente: { nombre: "Fuente", url: "https://example.com" },
  verificado: false,
  pendientes: ["precio"],
  estado: "activo",
};
const plan = (o: object) => ({ ...base, id: "x", slug: "x", titulo: "Plan", tipo: "evento", inicio: "2026-10-31", ...o }) as unknown as PlanPublico;

const HOY = "2026-10-29";
const planes = [
  plan({ slug: "pasado", titulo: "Pasado", inicio: "2026-10-20" }),
  plan({ slug: "hoy", titulo: "Concierto de hoy", inicio: "2026-10-29" }),
  plan({ slug: "sabado", titulo: "Fiesta del sábado", inicio: "2026-10-31", precio: { tipo: "gratis" }, pendientes: [], idealPara: ["pareja"] }),
  plan({ slug: "cancelado", titulo: "Cancelado", inicio: "2026-10-31", estado: "cancelado" }),
  plan({ slug: "parque", titulo: "Parque", tipo: "permanente", inicio: undefined, categoria: "aire-libre", zona: { nombre: "Belén" } }),
];

describe("filtrar", () => {
  it("oculta eventos pasados y cancelados", () => {
    const r = filtrar(planes, INICIAL, HOY);
    expect(r.grupos.flatMap((g) => g.items.map((p) => p.slug))).toEqual(["hoy", "sabado"]);
  });
  it("agrupa por día y ordena por fecha", () => {
    expect(filtrar(planes, INICIAL, HOY).grupos.map((g) => g.dia)).toEqual(["2026-10-29", "2026-10-31"]);
  });
  it("filtra por día", () => {
    expect(filtrar(planes, { ...INICIAL, cuando: "hoy" }, HOY).totalEventos).toBe(1);
    expect(filtrar(planes, { ...INICIAL, cuando: "finde" }, HOY).grupos[0].items[0].slug).toBe("sabado");
  });
  it("los permanentes se pueden ocultar", () => {
    expect(filtrar(planes, INICIAL, HOY).fijos).toHaveLength(1);
    expect(filtrar(planes, { ...INICIAL, siempre: false }, HOY).fijos).toHaveLength(0);
  });
  it("combina categoría, precio, compañía y zona", () => {
    expect(filtrar(planes, { ...INICIAL, precio: "gratis" }, HOY).totalEventos).toBe(1);
    expect(filtrar(planes, { ...INICIAL, con: "pareja" }, HOY).grupos[0].items[0].slug).toBe("sabado");
    expect(filtrar(planes, { ...INICIAL, cat: "aire-libre" }, HOY).fijos).toHaveLength(1);
    expect(filtrar(planes, { ...INICIAL, zona: "Belén" }, HOY).totalEventos).toBe(0);
  });
  it("el texto tolera errores", () => {
    expect(filtrar(planes, { ...INICIAL, q: "conciero" }, HOY).totalEventos).toBe(1);
  });
});

describe("estado y URL", () => {
  it("ida y vuelta", () => {
    const e = { ...INICIAL, cuando: "finde" as const, precio: "gratis" as const, q: "salsa", siempre: false };
    const params = paramsDesdeEstado(INICIAL, e);
    expect(params.toString()).toBe("cuando=finde&precio=gratis&q=salsa&siempre=0");
    expect(estadoDesdeParams(INICIAL, params)).toEqual(e);
  });
  it("solo escribe lo que difiere del preset de la página", () => {
    const preset = { ...INICIAL, precio: "gratis" as const };
    expect(paramsDesdeEstado(preset, preset).toString()).toBe("");
    expect(paramsDesdeEstado(preset, { ...preset, precio: "todos" }).toString()).toBe("precio=todos");
  });
  it("ignora valores inválidos en la URL", () => {
    const p = new URLSearchParams("cuando=ayer&cat=zzz&precio=gratis&con=perro&siempre=2");
    expect(estadoDesdeParams(INICIAL, p)).toEqual({ ...INICIAL, precio: "gratis" });
  });
  it("cuenta filtros y compara estados", () => {
    expect(contarFiltros(INICIAL)).toBe(0);
    expect(contarFiltros({ ...INICIAL, cuando: "hoy", q: "x" })).toBe(2);
    expect(mismoEstado(INICIAL, { ...INICIAL })).toBe(true);
    expect(mismoEstado(INICIAL, { ...INICIAL, q: "a" })).toBe(false);
  });
});

describe("presets", () => {
  it("genera páginas de fecha, precio, categoría y compañía con slugs únicos", () => {
    const p = construirPresets(planes);
    const slugs = p.map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of ["hoy", "manana", "fin-de-semana", "gratis", "fiestas", "pareja", "familia"]) expect(slugs).toContain(s);
  });
  it("solo crea página de zona con suficientes planes y usa alias", () => {
    const muchos = [plan({ slug: "a" }), plan({ slug: "b" }), plan({ slug: "c", zona: { nombre: "Laureles" } }), plan({ slug: "d", zona: { nombre: "Medellín" } }), plan({ slug: "e", zona: { nombre: "Medellín" } })];
    const slugs = construirPresets(muchos).map((x) => x.slug);
    expect(slugs).toContain("poblado");
    expect(slugs).not.toContain("laureles"); // 1 plan
    expect(slugs).not.toContain("medellin"); // zona genérica
  });
});

describe("favoritos compartidos", () => {
  it("depura slugs inválidos y repetidos", () => {
    expect(depurar(["a-b", "a-b", "NO válido", 3, "ok"])).toEqual(["a-b", "ok"]);
    expect(slugsDeParametro("uno,dos, <script>,uno")).toEqual(["uno", "dos"]);
    expect(slugsDeParametro(null)).toEqual([]);
  });
  it("arma el enlace de la lista", () => {
    expect(enlaceLista(["a", "b"], "https://parchemos.test")).toBe("https://parchemos.test/mi-lista/?p=a%2Cb");
    expect(enlaceLista([], "https://parchemos.test")).toBe("https://parchemos.test/mi-lista/");
  });
});
