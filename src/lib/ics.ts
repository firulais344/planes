import type { PlanPublico } from "./publico";
import { primerDia, sumarDias } from "./fechas";

/** Exportación a iCalendar (RFC 5545). Solo eventos con fecha; los permanentes no tienen qué agendar. */

const CRLF = "\r\n";
const TZ = "America/Bogota";
const BYDAY: Record<string, string> = { lun: "MO", mar: "TU", mie: "WE", jue: "TH", vie: "FR", sab: "SA", dom: "SU" };

const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const soloFecha = (iso: string) => iso.replace(/-/g, "");
const conHora = (iso: string, hhmm: string) => `${soloFecha(iso)}T${hhmm.replace(":", "")}00`;

/** Líneas de más de 75 caracteres se pliegan con un espacio al inicio de la continuación. */
function plegar(linea: string): string {
  const trozos: string[] = [];
  let resto = linea;
  while (resto.length > 74) {
    trozos.push(resto.slice(0, 74));
    resto = " " + resto.slice(74);
  }
  trozos.push(resto);
  return trozos.join(CRLF);
}

const marcaUTC = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export const esAgendable = (p: PlanPublico) => p.tipo === "evento" && !!p.inicio;

export function lineasEvento(p: PlanPublico, urlPlan: string, ahora: Date): string[] {
  if (!esAgendable(p)) return [];
  const inicio = p.inicio!;
  const fin = p.fin ?? inicio;
  const L: string[] = ["BEGIN:VEVENT", `UID:${p.slug}@parchemos`, `DTSTAMP:${marcaUTC(ahora)}`];

  const horaConfirmada = p.horaInicio && !p.pendientes.includes("horario");
  const recurrente = !!p.recurrencia;
  const unSoloDiaConHora = horaConfirmada && fin === inicio;

  if (horaConfirmada && (recurrente || unSoloDiaConHora)) {
    const primero = recurrente ? primerDia(p, [inicio, p.recurrencia?.hasta ?? fin]) ?? inicio : inicio;
    L.push(`DTSTART;TZID=${TZ}:${conHora(primero, p.horaInicio!)}`);
    if (p.horaFin) L.push(`DTEND;TZID=${TZ}:${conHora(primero, p.horaFin)}`);
    if (recurrente) {
      const dias = p.recurrencia!.dias.map((d) => BYDAY[d]).join(",");
      const hasta = p.recurrencia!.hasta ?? fin;
      L.push(`RRULE:FREQ=WEEKLY;BYDAY=${dias};UNTIL=${soloFecha(hasta)}T235959Z`);
    }
  } else {
    // Sin hora confirmada (o varios días): evento de día completo. DTEND es exclusivo.
    L.push(`DTSTART;VALUE=DATE:${soloFecha(inicio)}`, `DTEND;VALUE=DATE:${soloFecha(sumarDias(fin, 1))}`);
  }

  const donde = [p.lugar, p.direccion].filter(Boolean).join(", ");
  const nota = p.pendientes.some((c) => c === "horario" || c === "precio") ? "Confirma horario y precio en la fuente. " : "";
  L.push(
    `SUMMARY:${escapar(p.titulo)}`,
    `LOCATION:${escapar(donde ? `${donde}, Medellín` : "Medellín")}`,
    `DESCRIPTION:${escapar(`${p.descripcionCorta} ${nota}Fuente: ${p.fuente.nombre} ${p.fuente.url}`)}`,
    `URL:${urlPlan}`,
    "END:VEVENT",
  );
  return L;
}

export function calendarioICS(items: { plan: PlanPublico; url: string }[], ahora: Date = new Date()): string {
  const eventos = items.flatMap(({ plan, url }) => lineasEvento(plan, url, ahora));
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Parchemos//Planes en Medellin//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:-05",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...eventos,
    "END:VCALENDAR",
  ];
  return lineas.map(plegar).join(CRLF) + CRLF;
}
