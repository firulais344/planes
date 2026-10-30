import type { PlanPublico } from "./publico";
import { primerDia } from "./fechas";

/**
 * Datos estructurados (schema.org). Regla de oro: solo se publica lo confirmado.
 * - Sin precio confirmado no hay `offers`.
 * - Con coordenadas pendientes de verificar no hay `geo`.
 * - Un horario no confirmado no se escribe en `startDate`.
 */
export interface Contexto {
  /** URL absoluta de la página del plan. */
  url: string;
  /** URL absoluta de la imagen Open Graph. */
  imagen: string;
}

const CONTEXTO = "https://schema.org";
const OFFSET = "-05:00"; // Bogotá no tiene horario de verano

const horaConfirmada = (p: PlanPublico) => (p.pendientes.includes("horario") ? undefined : p.horaInicio);
const finConfirmado = (p: PlanPublico) => (p.pendientes.includes("horario") ? undefined : p.horaFin);

function direccion(p: PlanPublico) {
  const fuera = p.zona.nombre === "Fuera de la ciudad";
  return {
    "@type": "PostalAddress",
    ...(p.direccion ? { streetAddress: p.direccion } : {}),
    addressLocality: fuera ? p.lugar : "Medellín",
    addressRegion: "Antioquia",
    addressCountry: "CO",
  };
}

function geo(p: PlanPublico) {
  if (p.lat === undefined || p.lng === undefined || p.pendientes.includes("coordenadas")) return undefined;
  return { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng };
}

function ofertas(p: PlanPublico, url: string) {
  const { tipo, minCOP } = p.precio;
  if (p.pendientes.includes("precio")) return undefined;
  if (tipo === "gratis") return { "@type": "Offer", url, price: 0, priceCurrency: "COP" };
  if (tipo === "rango" && minCOP !== undefined) return { "@type": "Offer", url, price: minCOP, priceCurrency: "COP" };
  return undefined;
}

export function jsonldPlan(p: PlanPublico, c: Contexto): Record<string, unknown> {
  const gratis = !p.pendientes.includes("precio") && p.precio.tipo === "gratis";

  if (p.tipo === "evento" && p.inicio) {
    const primero = p.recurrencia ? primerDia(p, [p.inicio, p.recurrencia.hasta ?? p.fin ?? p.inicio]) ?? p.inicio : p.inicio;
    const hi = horaConfirmada(p);
    const hf = finConfirmado(p);
    const fin = p.fin ?? p.inicio;
    const unDia = fin === p.inicio || !!p.recurrencia;
    return {
      "@context": CONTEXTO,
      "@type": "Event",
      name: p.titulo,
      description: p.descripcionCorta,
      startDate: hi ? `${primero}T${hi}:00${OFFSET}` : primero,
      ...(unDia ? (hi && hf ? { endDate: `${primero}T${hf}:00${OFFSET}` } : {}) : { endDate: fin }),
      eventStatus: `${CONTEXTO}/${p.estado === "cancelado" ? "EventCancelled" : "EventScheduled"}`,
      eventAttendanceMode: `${CONTEXTO}/OfflineEventAttendanceMode`,
      location: { "@type": "Place", name: p.lugar, address: direccion(p), geo: geo(p) },
      image: [c.imagen],
      url: c.url,
      inLanguage: "es-CO",
      ...(gratis ? { isAccessibleForFree: true } : {}),
      offers: ofertas(p, p.fuente.url),
    };
  }

  return {
    "@context": CONTEXTO,
    "@type": p.categoria === "fiesta" ? "Place" : "TouristAttraction",
    name: p.titulo,
    description: p.descripcionCorta,
    address: direccion(p),
    geo: geo(p),
    image: [c.imagen],
    url: c.url,
    ...(gratis ? { isAccessibleForFree: true } : {}),
  };
}

export function jsonldSitio(origen: string, nombre: string): Record<string, unknown> {
  return {
    "@context": CONTEXTO,
    "@type": "WebSite",
    name: nombre,
    url: origen,
    inLanguage: "es-CO",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origen.replace(/\/$/, "")}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function jsonldMigas(items: { nombre: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": CONTEXTO,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.nombre, item: it.url })),
  };
}

/** JSON seguro para incrustar en <script>: `<` se escapa para que nada cierre la etiqueta. */
export const serializar = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
