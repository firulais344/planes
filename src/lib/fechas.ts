import type { Plan } from "./schema";

/**
 * Toda la lógica de "hoy / mañana / finde" usa America/Bogota (UTC-5, sin horario de verano)
 * y fechas ISO (AAAA-MM-DD) calculadas en UTC, para que no dependan de la zona del navegador.
 */
export const TZ = "America/Bogota";
export type Cuando = "todo" | "hoy" | "manana" | "finde" | "semana";
export type Rango = [string, string];

const FIN_DE_LOS_TIEMPOS = "2999-12-31";
const fmtISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

const aUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function hoyBogota(ahora: Date = new Date()): string {
  return fmtISO.format(ahora);
}

export function sumarDias(iso: string, n: number): string {
  return new Date(aUTC(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(iso: string): number {
  return new Date(aUTC(iso)).getUTCDay();
}

export function diasEntre(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / 86_400_000);
}

export function rango(cuando: Cuando, hoy: string): Rango {
  switch (cuando) {
    case "hoy":
      return [hoy, hoy];
    case "manana": {
      const m = sumarDias(hoy, 1);
      return [m, m];
    }
    case "finde": {
      const d = diaSemana(hoy);
      if (d === 0) return [hoy, hoy]; // domingo: solo queda hoy
      if (d >= 5) return [hoy, sumarDias(hoy, 7 - d)]; // vie o sáb: hasta el domingo
      return [sumarDias(hoy, 5 - d), sumarDias(hoy, 7 - d)]; // lun-jue: vie a dom
    }
    case "semana":
      return [hoy, sumarDias(hoy, 6)];
    default:
      return [hoy, FIN_DE_LOS_TIEMPOS];
  }
}

const DIAS_CLAVE = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

type ConFechas = Pick<Plan, "inicio" | "fin" | "recurrencia">;

/** Primer día dentro de `[a, b]` en que ocurre el plan, o null si no ocurre. */
export function primerDia(p: ConFechas, [a, b]: Rango): string | null {
  if (!p.inicio) return null;
  const fin = p.recurrencia?.hasta ?? p.fin ?? p.inicio;
  const desde = p.inicio > a ? p.inicio : a;
  const hasta = fin < b ? fin : b;
  if (desde > hasta) return null;
  if (!p.recurrencia) return desde;
  const dias = new Set<string>(p.recurrencia.dias);
  for (let d = desde, n = 0; d <= hasta && n < 800; d = sumarDias(d, 1), n++) {
    if (dias.has(DIAS_CLAVE[diaSemana(d)])) return d;
  }
  return null;
}

export const ocurreEn = (p: ConFechas, r: Rango) => primerDia(p, r) !== null;

/** Ya terminó: no queda ningún día de ocurrencia desde hoy. */
export function yaPaso(p: ConFechas, hoy: string): boolean {
  return p.inicio !== undefined && !ocurreEn(p, [hoy, FIN_DE_LOS_TIEMPOS]);
}

/** Termina en `dias` días o menos (hoy incluido) y ya empezó o empieza hoy. */
export function ultimosDias(p: ConFechas, hoy: string, dias = 2): boolean {
  if (!p.inicio || p.recurrencia) return false;
  const fin = p.fin ?? p.inicio;
  if (fin === p.inicio) return false;
  return p.inicio <= hoy && fin >= hoy && diasEntre(hoy, fin) <= dias;
}

const fmtLargo = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtCorto = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtSemana = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const enUTC = (iso: string) => new Date(aUTC(iso));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sinPunto = (s: string) => s.replace(/\./g, "").replace(/ de /g, " ");

/** "15:00" -> "3:00 pm" */
export function horaLegible(hhmm: string): string {
  const h = +hhmm.slice(0, 2);
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

export const diaLargo =(iso: string) => cap(fmtLargo.format(enUTC(iso)));
export const diaCorto = (iso: string) => sinPunto(fmtCorto.format(enUTC(iso)));

/** Etiqueta breve de fecha para la tarjeta. */
export function etiquetaFecha(p: ConFechas, hoy: string): string {
  if (!p.inicio) return "Siempre disponible";
  const fin = p.fin ?? p.inicio;
  if (p.recurrencia) {
    const dias = p.recurrencia.dias.map((d) => ({ lun: "lunes", mar: "martes", mie: "miércoles", jue: "jueves", vie: "viernes", sab: "sábados", dom: "domingos" })[d]);
    return cap(dias.join(" y "));
  }
  if (fin === p.inicio) {
    if (p.inicio === hoy) return "Hoy";
    if (p.inicio === sumarDias(hoy, 1)) return "Mañana";
    return cap(sinPunto(fmtSemana.format(enUTC(p.inicio))));
  }
  if (p.inicio <= hoy) return `En curso · hasta ${diaCorto(fin)}`;
  return `${diaCorto(p.inicio)} – ${diaCorto(fin)}`;
}

export function tituloDia(iso: string, hoy: string): { titulo: string; detalle: string } {
  if (iso === hoy) return { titulo: "Hoy", detalle: diaLargo(iso) };
  if (iso === sumarDias(hoy, 1)) return { titulo: "Mañana", detalle: diaLargo(iso) };
  return { titulo: diaLargo(iso), detalle: "" };
}
