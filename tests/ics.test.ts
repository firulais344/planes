import { describe, expect, it } from "vitest";
import { calendarioICS, lineasEvento } from "../src/lib/ics";
import type { PlanPublico } from "../src/lib/publico";

const AHORA = new Date("2026-10-29T15:00:00Z");
const base = {
  slug: "ponte-salsa",
  titulo: "Ponte Salsa; en, Familia",
  descripcionCorta: "Baile dominical.",
  tipo: "evento",
  lugar: "Claustro Comfama",
  fuente: { nombre: "Medellín Travel", url: "https://example.com/x" },
  pendientes: ["direccion"],
};
const p = (o: object) => ({ ...base, ...o }) as unknown as PlanPublico;

describe("lineasEvento", () => {
  it("evento de un día sin hora confirmada: día completo con DTEND exclusivo", () => {
    const l = lineasEvento(p({ inicio: "2026-10-31", pendientes: ["horario"] }), "https://x/planes/a/", AHORA);
    expect(l).toContain("DTSTART;VALUE=DATE:20261031");
    expect(l).toContain("DTEND;VALUE=DATE:20261101");
  });
  it("varios días: el fin es exclusivo (día siguiente al último)", () => {
    const l = lineasEvento(p({ inicio: "2026-10-30", fin: "2026-10-31" }), "https://x/", AHORA);
    expect(l).toContain("DTEND;VALUE=DATE:20261101");
  });
  it("con hora confirmada usa la zona de Bogotá", () => {
    const l = lineasEvento(p({ inicio: "2026-11-05", horaInicio: "19:30", horaFin: "22:00" }), "https://x/", AHORA);
    expect(l).toContain("DTSTART;TZID=America/Bogota:20261105T193000");
    expect(l).toContain("DTEND;TZID=America/Bogota:20261105T220000");
  });
  it("una hora no confirmada no se usa", () => {
    const l = lineasEvento(p({ inicio: "2026-11-05", horaInicio: "19:30", pendientes: ["horario"] }), "https://x/", AHORA);
    expect(l.some((x) => x.includes("TZID"))).toBe(false);
  });
  it("evento semanal: arranca en el primer domingo y repite hasta el fin", () => {
    const l = lineasEvento(
      p({ inicio: "2026-10-29", fin: "2026-11-22", horaInicio: "15:00", horaFin: "17:00", recurrencia: { frecuencia: "semanal", dias: ["dom"], hasta: "2026-11-22" } }),
      "https://x/",
      AHORA,
    );
    expect(l).toContain("DTSTART;TZID=America/Bogota:20261101T150000");
    expect(l).toContain("RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261122T235959Z");
  });
  it("escapa comas y punto y coma en el título", () => {
    expect(lineasEvento(p({ inicio: "2026-10-31" }), "https://x/", AHORA)).toContain("SUMMARY:Ponte Salsa\\; en\\, Familia");
  });
  it("los planes permanentes no generan evento", () => {
    expect(lineasEvento(p({ tipo: "permanente" }), "https://x/", AHORA)).toEqual([]);
  });
});

describe("calendarioICS", () => {
  it("arma un calendario válido con CRLF y zona horaria", () => {
    const ics = calendarioICS([{ plan: p({ inicio: "2026-10-31" }), url: "https://x/" }], AHORA);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("TZID:America/Bogota");
    expect(ics).toContain("DTSTAMP:20261029T150000Z");
    expect(ics.split("\r\n").every((x) => x.length <= 75)).toBe(true);
  });
  it("pliega líneas largas", () => {
    const largo = p({ inicio: "2026-10-31", descripcionCorta: "a".repeat(300) });
    const ics = calendarioICS([{ plan: largo, url: "https://x/" }], AHORA);
    expect(ics.split("\r\n").every((x) => x.length <= 75)).toBe(true);
  });
});
