import { sumarDias } from "../../src/lib/fechas";

/** Lector mínimo de iCalendar (RFC 5545) para feeds de aliados. Ignora lo que no necesita. */
export interface EventoICS {
  uid?: string;
  titulo: string;
  descripcion?: string;
  lugar?: string;
  url?: string;
  inicio: string;
  fin?: string;
  horaInicio?: string;
  horaFin?: string;
  cancelado: boolean;
  recurrente: boolean;
}

const desescapar = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function parseValor(valor: string, params: string): { fecha: string; hora?: string } | null {
  const v = valor.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (/VALUE=DATE(?!-)/i.test(params) || hh === undefined) return { fecha: `${y}-${mo}-${d}` };
  if (z) {
    // UTC -> Bogotá (UTC-5, sin horario de verano)
    const iso = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi) - 5 * 3_600_000).toISOString();
    return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
  }
  return { fecha: `${y}-${mo}-${d}`, hora: `${hh}:${mi}` };
}

export function parsearICS(texto: string): EventoICS[] {
  const lineas = texto.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const eventos: EventoICS[] = [];
  let actual: Record<string, { valor: string; params: string }> | null = null;

  for (const linea of lineas) {
    if (linea === "BEGIN:VEVENT") {
      actual = {};
      continue;
    }
    if (linea === "END:VEVENT" && actual) {
      const ini = actual.DTSTART ? parseValor(actual.DTSTART.valor, actual.DTSTART.params) : null;
      const titulo = actual.SUMMARY ? desescapar(actual.SUMMARY.valor).trim() : "";
      if (ini && titulo) {
        const fin = actual.DTEND ? parseValor(actual.DTEND.valor, actual.DTEND.params) : null;
        let fechaFin: string | undefined;
        let horaFin: string | undefined;
        if (fin) {
          if (ini.hora === undefined) {
            const f = sumarDias(fin.fecha, -1); // en eventos de día completo DTEND es exclusivo
            if (f > ini.fecha) fechaFin = f;
          } else {
            if (fin.fecha > ini.fecha) fechaFin = fin.fecha;
            horaFin = fin.hora;
          }
        }
        eventos.push({
          uid: actual.UID?.valor.trim(),
          titulo,
          descripcion: actual.DESCRIPTION ? desescapar(actual.DESCRIPTION.valor).trim() : undefined,
          lugar: actual.LOCATION ? desescapar(actual.LOCATION.valor).trim() : undefined,
          url: actual.URL?.valor.trim(),
          inicio: ini.fecha,
          fin: fechaFin,
          horaInicio: ini.hora,
          horaFin,
          cancelado: actual.STATUS?.valor.trim().toUpperCase() === "CANCELLED",
          recurrente: "RRULE" in actual,
        });
      }
      actual = null;
      continue;
    }
    if (!actual) continue;
    const i = linea.indexOf(":");
    if (i < 0) continue;
    const [nombre, ...resto] = linea.slice(0, i).split(";");
    actual[nombre.toUpperCase()] = { valor: linea.slice(i + 1), params: resto.join(";") };
  }
  return eventos;
}
