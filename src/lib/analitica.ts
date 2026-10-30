/**
 * Eventos de analítica con Umami (sin cookies). Si el script no está cargado, no hace nada.
 * No se envían datos personales: solo acciones y valores de filtros.
 */
type Datos = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (evento: string, datos?: Datos) => void };
  }
}

export function track(evento: string, datos?: Datos): void {
  try {
    window.umami?.track(evento, datos);
  } catch {
    /* la analítica nunca debe romper la página */
  }
}
