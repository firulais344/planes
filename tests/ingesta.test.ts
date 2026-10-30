import { describe, expect, it } from "vitest";
import { PlanSchema, type Plan } from "../src/lib/schema";
import { parsearICS } from "../scripts/ingesta/ics";
import {
  CandidatoSchema,
  FuenteSchema,
  PERMISOS,
  aPlanNuevo,
  aplicarCambios,
  buscarSimilar,
  calcularCambios,
  detectarDesaparecidos,
  fusionarCola,
  idCola,
  inferirCategoria,
  interpretarPrecio,
  puedeConsultar,
  reporteMarkdown,
  slugUnico,
  truncar,
  type Candidato,
  type Fuente,
} from "../scripts/ingesta/nucleo";

const HOY = "2026-10-30";
const fuente: Fuente = { id: "aliado-teatro", nombre: "Teatro Aliado", tipo: "ics", url: "https://aliado.test/agenda.ics", permiso: "autorizado", evidencia: "Correo del 2026-10-01 autorizando el uso.", copiarDescripcion: false };

const plan = (o: object = {}): Plan =>
  PlanSchema.parse({
    id: "concierto-de-salsa",
    slug: "concierto-de-salsa",
    titulo: "Concierto de salsa en el parque",
    descripcionCorta: "Una noche de salsa al aire libre en Medellín.",
    tipo: "evento",
    categoria: "fiesta",
    inicio: "2026-11-14",
    zona: { nombre: "Medellín" },
    lugar: "Parque de los Deseos",
    precio: { tipo: "por_confirmar" },
    idealPara: ["amigos"],
    fuente: { nombre: "Otra fuente", url: "https://otra.test/e/1" },
    verificado: false,
    pendientes: ["precio", "horario", "coordenadas"],
    ...o,
  });

const cand = (o: Partial<Candidato> = {}): Candidato =>
  CandidatoSchema.parse({ fuenteId: "aliado-teatro", titulo: "Concierto de Salsa en el Parque", inicio: "2026-11-14", lugar: "Parque de los Deseos", url: "https://aliado.test/e/9", ...o });

describe("permisos", () => {
  it("solo 'autorizado' y 'abierto' permiten consultar una fuente", () => {
    const resultado = Object.fromEntries(PERMISOS.map((p) => [p, puedeConsultar({ permiso: p })]));
    expect(resultado).toEqual({ autorizado: true, abierto: true, no_solicitado: false, solicitado: false, denegado: false, por_revisar: false });
  });
  it("una fuente debe traer la evidencia de su permiso", () => {
    expect(FuenteSchema.safeParse({ ...fuente, evidencia: "" }).success).toBe(false);
  });
});

describe("parsearICS", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:a1@test",
    "SUMMARY:Noche de teatro\\, con invitados",
    "DTSTART;VALUE=DATE:20261105",
    "DTEND;VALUE=DATE:20261107",
    "LOCATION:Teatro Aliado",
    "URL:https://aliado.test/e/a1",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:a2@test",
    "SUMMARY:Concierto",
    "DTSTART;TZID=America/Bogota:20261110T190000",
    "DTEND;TZID=America/Bogota:20261110T223000",
    "DESCRIPTION:Linea muy larga que se pliega",
    "  y continúa aquí",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:a3@test",
    "SUMMARY:Evento en UTC",
    "DTSTART:20261112T010000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Clase semanal",
    "DTSTART:20261101T150000",
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20261101",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const e = parsearICS(ics);

  it("lee eventos y descarta los que no tienen título o fecha", () => expect(e).toHaveLength(4));
  it("en eventos de día completo el fin es inclusivo y se desescapan comas", () => {
    expect(e[0]).toMatchObject({ titulo: "Noche de teatro, con invitados", inicio: "2026-11-05", fin: "2026-11-06", lugar: "Teatro Aliado" });
    expect(e[0].horaInicio).toBeUndefined();
  });
  it("lee horas con zona horaria y pliega líneas largas", () => {
    expect(e[1]).toMatchObject({ inicio: "2026-11-10", horaInicio: "19:00", horaFin: "22:30" });
    expect(e[1].descripcion).toBe("Linea muy larga que se pliega y continúa aquí");
  });
  it("convierte UTC a hora de Bogotá, incluso cambiando de día", () => {
    expect(e[2]).toMatchObject({ inicio: "2026-11-11", horaInicio: "20:00", cancelado: true });
  });
  it("marca los eventos recurrentes", () => expect(e[3].recurrente).toBe(true));
});

describe("interpretarPrecio", () => {
  it("reconoce gratuidad explícita", () => expect(interpretarPrecio("Entrada libre")).toEqual({ precio: { tipo: "gratis" }, confirmado: true }));
  it("lee montos en pesos", () => {
    expect(interpretarPrecio("Desde $40.000")).toMatchObject({ precio: { tipo: "rango", minCOP: 40000, maxCOP: 40000 }, confirmado: true });
    expect(interpretarPrecio("Entre $30.000 y $120.000").precio).toMatchObject({ minCOP: 30000, maxCOP: 120000 });
  });
  it("sin dato claro queda por confirmar (no inventa)", () => {
    expect(interpretarPrecio(undefined).precio.tipo).toBe("por_confirmar");
    expect(interpretarPrecio("Consulta con el organizador")).toMatchObject({ confirmado: false });
    expect(interpretarPrecio("Cupo 120 personas").confirmado).toBe(false);
  });
});

describe("inferirCategoria", () => {
  it("segura con una sola categoría", () => expect(inferirCategoria("Obra de teatro y danza")).toEqual({ categoria: "comida-cultura", segura: true }));
  it("insegura con señales mezcladas o sin ellas", () => {
    expect(inferirCategoria("Festival de teatro").segura).toBe(false);
    expect(inferirCategoria("Algo sin pistas").segura).toBe(false);
  });
});

describe("buscarSimilar (deduplicación)", () => {
  const existentes = [plan(), plan({ slug: "otro", id: "otro", titulo: "Feria del libro", lugar: "Plaza Mayor", inicio: "2026-12-01" })];
  it("mismo evento en otra fuente, con título algo distinto", () => {
    const h = buscarSimilar(cand(), existentes);
    expect(h.veredicto).toBe("igual");
    expect(h.plan?.slug).toBe("concierto-de-salsa");
  });
  it("un evento distinto es nuevo", () => expect(buscarSimilar(cand({ titulo: "Exposición de fotografía", lugar: "Museo", inicio: "2026-11-20" }), existentes).veredicto).toBe("nuevo"));
  it("mismo título con otra fecha es dudoso (¿cambió de fecha o es otra edición?)", () => {
    expect(buscarSimilar(cand({ inicio: "2026-12-20" }), existentes).veredicto).toBe("dudoso");
  });
  it("ignora el año y las palabras vacías en el título", () => {
    const p = plan({ titulo: "RITVALES 2026", slug: "ritvales", id: "ritvales", lugar: "Parque Norte" });
    expect(buscarSimilar(cand({ titulo: "Ritvales", lugar: "Parque Norte" }), [p]).veredicto).toBe("igual");
  });
});

describe("cambios", () => {
  it("detecta cambio de fecha y de hora y los aplica sin romper el plan", () => {
    const p = plan();
    const c = cand({ inicio: "2026-11-15", horaInicio: "20:00", horaFin: "23:00" });
    const cambios = calcularCambios(p, c);
    expect(cambios.map((x) => x.campo)).toEqual(["inicio", "horaInicio", "horaFin"]);
    const r = aplicarCambios(p, c, cambios, HOY, fuente);
    expect(r.plan).toMatchObject({ inicio: "2026-11-15", horaInicio: "20:00", ultimaVerificacion: HOY });
    expect(r.plan?.pendientes).not.toContain("horario");
  });
  it("detecta una cancelación", () => {
    const c = cand({ cancelado: true });
    const r = aplicarCambios(plan(), c, calcularCambios(plan(), c), HOY);
    expect(r.plan?.estado).toBe("cancelado");
  });
  it("sin diferencias no hay cambios", () => expect(calcularCambios(plan(), cand())).toEqual([]));
  it("agrega la otra fuente una sola vez", () => {
    const c = cand();
    const una = aplicarCambios(plan(), c, [], HOY, fuente).plan!;
    expect(una.otrasFuentes).toEqual([{ nombre: "Teatro Aliado", url: "https://aliado.test/e/9" }]);
    expect(aplicarCambios(una, c, [], HOY, fuente).plan?.otrasFuentes).toHaveLength(1);
  });
  it("rechaza un resultado que dejaría el plan inválido", () => {
    const c = cand({ inicio: "2026-11-20", fin: "2026-11-18" });
    const r = aplicarCambios(plan(), c, calcularCambios(plan(), c), HOY);
    expect(r.plan).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
  it("no compara fechas en eventos recurrentes", () => {
    const p = plan({ fin: "2026-12-20", recurrencia: { frecuencia: "semanal", dias: ["dom"] } });
    expect(calcularCambios(p, cand({ inicio: "2026-11-22" })).some((x) => x.campo === "inicio")).toBe(false);
  });
});

describe("aPlanNuevo", () => {
  it("crea un plan válido, sin verificar y con lo que falta marcado", () => {
    const n = aPlanNuevo(cand({ titulo: "Exposición de fotografía", precioTexto: "Entrada libre", horaInicio: "10:00" }), fuente, new Set(), HOY);
    expect(n.errores).toEqual([]);
    expect(n.plan).toMatchObject({ verificado: false, fuenteId: "aliado-teatro", ultimaVerificacion: HOY, precio: { tipo: "gratis" } });
    expect(n.plan?.pendientes).toEqual(expect.arrayContaining(["coordenadas", "direccion"]));
    expect(n.plan?.pendientes).not.toContain("precio");
    expect(n.plan?.pendientes).not.toContain("horario");
    expect(n.porCompletar).toEqual(expect.arrayContaining(["zona", "ideal para"]));
  });
  it("no copia la descripción de la fuente si no hay permiso para ello", () => {
    const n = aPlanNuevo(cand({ descripcion: "Texto largo y propio de la fuente que no debemos copiar." }), fuente, new Set(), HOY);
    expect(n.plan?.descripcionCorta).toBe("Concierto de Salsa en el Parque en Parque de los Deseos.");
    expect(n.porCompletar.some((x) => x.startsWith("descripción"))).toBe(true);
  });
  it("copia la descripción (recortada a 160) solo con permiso", () => {
    const n = aPlanNuevo(cand({ descripcion: "palabra ".repeat(60) }), { ...fuente, copiarDescripcion: true }, new Set(), HOY);
    expect(n.plan!.descripcionCorta.length).toBeLessThanOrEqual(160);
  });
  it("sin precio claro queda por confirmar y pendiente", () => {
    const n = aPlanNuevo(cand(), fuente, new Set(), HOY);
    expect(n.plan?.precio.tipo).toBe("por_confirmar");
    expect(n.plan?.pendientes).toContain("precio");
  });
  it("un evento cancelado entra como cancelado", () => expect(aPlanNuevo(cand({ cancelado: true }), fuente, new Set(), HOY).plan?.estado).toBe("cancelado"));
});

describe("slugs y utilidades", () => {
  it("genera slugs únicos", () => {
    expect(slugUnico("Gran Concierto", "2026-11-01", new Set())).toBe("gran-concierto");
    expect(slugUnico("Gran Concierto", "2026-11-01", new Set(["gran-concierto"]))).toBe("gran-concierto-2026-11-01");
    expect(slugUnico("Gran Concierto", "2026-11-01", new Set(["gran-concierto", "gran-concierto-2026-11-01"]))).toBe("gran-concierto-2026-11-01-2");
  });
  it("recorta textos sin cortar palabras", () => {
    const t = truncar("uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete", 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("desaparecidos y cola", () => {
  const delAliado = plan({ fuenteId: "aliado-teatro", slug: "a", id: "a" });
  it("detecta eventos futuros de la fuente que ya no aparecen", () => {
    expect(detectarDesaparecidos([delAliado], "aliado-teatro", new Set(), HOY)).toHaveLength(1);
    expect(detectarDesaparecidos([delAliado], "aliado-teatro", new Set(["a"]), HOY)).toHaveLength(0);
  });
  it("ignora planes de otra fuente, pasados o cancelados", () => {
    expect(detectarDesaparecidos([plan({ slug: "b", id: "b" })], "aliado-teatro", new Set(), HOY)).toHaveLength(0);
    expect(detectarDesaparecidos([{ ...delAliado, inicio: "2026-10-01" }], "aliado-teatro", new Set(), HOY)).toHaveLength(0);
    expect(detectarDesaparecidos([{ ...delAliado, estado: "cancelado" }], "aliado-teatro", new Set(), HOY)).toHaveLength(0);
  });
  it("la cola no duplica elementos al repetir la ingesta", () => {
    const i = { id: idCola("nuevo", "a"), tipo: "nuevo" as const, detalle: "x", creado: HOY };
    expect(fusionarCola([i], [i, { ...i, id: idCola("nuevo", "b") }])).toHaveLength(2);
  });
});

describe("reporte", () => {
  it("resume la corrida y lista lo omitido", () => {
    const md = reporteMarkdown({
      fecha: HOY,
      consultadas: ["Teatro Aliado (3 candidatos)"],
      omitidas: [{ id: "eventario", motivo: "permiso «no_solicitado»" }],
      nuevos: [{ slug: "x", titulo: "Evento X", precioConfirmado: false }],
      actualizados: [{ slug: "y", cambios: [{ slug: "y", campo: "inicio", antes: "2026-11-01", despues: "2026-11-02" }] }],
      sinCambios: 2,
      cancelados: [],
      desaparecidos: ["z"],
      dudosos: [{ titulo: "Evento W", similarA: "w", puntaje: 0.62 }],
      invalidos: [],
      enCola: 4,
    });
    expect(md).toContain("# Reporte de ingesta 2026-10-30");
    expect(md).toContain("| Planes nuevos | 1 |");
    expect(md).toContain("| Sin precio confirmado (nuevos) | 1 |");
    expect(md).toContain("**eventario**");
    expect(md).toContain("inicio 2026-11-01 → 2026-11-02");
  });
});
