import { describe, expect, it } from "vitest";
import { jsonldMigas, jsonldPlan, jsonldSitio, serializar } from "../src/lib/jsonld";
import type { PlanPublico } from "../src/lib/publico";

const C = { url: "https://x.test/planes/a/", imagen: "https://x.test/og/a.png" };
const base = {
  slug: "a",
  titulo: "Plan de prueba",
  descripcionCorta: "Descripción de prueba suficientemente larga.",
  categoria: "fiesta",
  zona: { nombre: "El Poblado" },
  lugar: "Un sitio",
  fuente: { nombre: "Fuente", url: "https://fuente.test/a" },
  estado: "activo",
};
const evento = (o: object) => ({ ...base, tipo: "evento", inicio: "2026-10-31", precio: { tipo: "por_confirmar" }, pendientes: ["precio", "horario", "coordenadas"], ...o }) as unknown as PlanPublico;
const perm = (o: object) => ({ ...base, tipo: "permanente", precio: { tipo: "por_confirmar" }, pendientes: ["precio"], ...o }) as unknown as PlanPublico;
const j = (p: PlanPublico) => jsonldPlan(p, C) as Record<string, any>;

describe("jsonldPlan: eventos", () => {
  it("campos obligatorios de Event", () => {
    const e = j(evento({}));
    expect(e["@type"]).toBe("Event");
    expect(e.name).toBe("Plan de prueba");
    expect(e.startDate).toBe("2026-10-31");
    expect(e.location.name).toBe("Un sitio");
    expect(e.location.address.addressLocality).toBe("Medellín");
    expect(e.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(e.image).toEqual([C.imagen]);
  });
  it("sin precio confirmado no publica ofertas", () => {
    expect(j(evento({})).offers).toBeUndefined();
    expect(j(evento({})).isAccessibleForFree).toBeUndefined();
  });
  it("gratis confirmado: precio 0 y acceso libre", () => {
    const e = j(evento({ precio: { tipo: "gratis" }, pendientes: [] }));
    expect(e.isAccessibleForFree).toBe(true);
    expect(e.offers).toMatchObject({ price: 0, priceCurrency: "COP", url: "https://fuente.test/a" });
  });
  it("rango con mínimo confirmado: precio desde", () => {
    expect(j(evento({ precio: { tipo: "rango", minCOP: 75800 }, pendientes: [] })).offers.price).toBe(75800);
  });
  it("no publica coordenadas pendientes de verificar", () => {
    expect(j(evento({ lat: 6.25, lng: -75.57 })).location.geo).toBeUndefined();
    expect(j(evento({ lat: 6.25, lng: -75.57, pendientes: [] })).location.geo).toMatchObject({ latitude: 6.25, longitude: -75.57 });
  });
  it("una hora no confirmada no entra en startDate; una confirmada sí, con zona de Bogotá", () => {
    expect(j(evento({ horaInicio: "19:00" })).startDate).toBe("2026-10-31");
    const e = j(evento({ horaInicio: "19:00", horaFin: "22:00", pendientes: ["precio"] }));
    expect(e.startDate).toBe("2026-10-31T19:00:00-05:00");
    expect(e.endDate).toBe("2026-10-31T22:00:00-05:00");
  });
  it("varios días: endDate es la fecha final", () => {
    expect(j(evento({ inicio: "2026-10-30", fin: "2026-11-01" })).endDate).toBe("2026-11-01");
  });
  it("evento recurrente: empieza en la primera ocurrencia", () => {
    const e = j(evento({ inicio: "2026-10-29", fin: "2026-11-22", recurrencia: { frecuencia: "semanal", dias: ["dom"], hasta: "2026-11-22" } }));
    expect(e.startDate).toBe("2026-11-01");
  });
  it("evento cancelado", () => {
    expect(j(evento({ estado: "cancelado" })).eventStatus).toBe("https://schema.org/EventCancelled");
  });
});

describe("jsonldPlan: lugares", () => {
  it("aire libre y cultura son TouristAttraction; fiesta es Place", () => {
    expect(j(perm({ categoria: "aire-libre" }))["@type"]).toBe("TouristAttraction");
    expect(j(perm({ categoria: "fiesta" }))["@type"]).toBe("Place");
  });
  it("un lugar fuera de la ciudad usa su propia localidad", () => {
    const l = j(perm({ zona: { nombre: "Fuera de la ciudad" }, lugar: "Guatapé" }));
    expect(l.address.addressLocality).toBe("Guatapé");
  });
  it("no incluye geo ni precio sin confirmar", () => {
    const l = j(perm({ lat: 6.2, lng: -75.5, pendientes: ["precio", "coordenadas"] }));
    expect(l.geo).toBeUndefined();
    expect(l.isAccessibleForFree).toBeUndefined();
  });
});

describe("otros", () => {
  it("WebSite con búsqueda que apunta a ?q=", () => {
    const s = jsonldSitio("https://x.test/", "Parchemos") as any;
    expect(s.potentialAction.target.urlTemplate).toBe("https://x.test/?q={search_term_string}");
  });
  it("migas con posiciones consecutivas", () => {
    const m = jsonldMigas([{ nombre: "Inicio", url: "https://x.test/" }, { nombre: "Plan", url: "https://x.test/p/" }]) as any;
    expect(m.itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
  });
  it("serializar escapa '<' para no cerrar el script", () => {
    expect(serializar({ t: "</script><b>" })).not.toContain("<");
    expect(JSON.parse(serializar({ t: "</script>" })).t).toBe("</script>");
  });
});
