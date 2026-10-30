import { useEffect, useRef, useState } from "preact/hooks";
import type { Categoria } from "../lib/schema";
import { CATEGORIA_NOMBRE } from "../lib/schema";

export interface Punto {
  slug: string;
  titulo: string;
  lat: number;
  lng: number;
  categoria: Categoria;
  /** true (por defecto) si la coordenada aún no se cruzó con una dirección oficial. */
  aprox?: boolean;
}

const COLOR: Record<Categoria, string> = { "fiesta": "#d6176f", "aire-libre": "#0e8f66", "comida-cultura": "#c97a00" };
const CENTRO_MEDELLIN: [number, number] = [6.2442, -75.5812];

interface Props {
  puntos: Punto[];
  alto?: string;
  /** Si es true, el mapa se centra en un único punto sin enlazar al plan. */
  detalle?: boolean;
  etiqueta?: string;
}

/**
 * Mapa con Leaflet y teselas de OpenStreetMap. Se carga solo cuando el componente aparece.
 * Los marcadores son círculos dibujados (sin imágenes), y el contenido de los popups se arma con
 * el DOM, nunca con HTML en texto, para que ningún dato pueda inyectar código.
 */
export default function Mapa({ puntos, alto = "420px", detalle = false, etiqueta = "Mapa de planes" }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const estado = useRef<{ L: typeof import("leaflet"); mapa: import("leaflet").Map; capa: import("leaflet").LayerGroup } | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelado || !contenedor.current) return;
        const mapa = L.map(contenedor.current, { scrollWheelZoom: false }).setView(CENTRO_MEDELLIN, 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapa);
        estado.current = { L, mapa, capa: L.layerGroup().addTo(mapa) };
        setListo(true);
      } catch {
        if (!cancelado) setError(true);
      }
    })();
    return () => {
      cancelado = true;
      estado.current?.mapa.remove();
      estado.current = null;
    };
  }, []);

  useEffect(() => {
    const e = estado.current;
    if (!listo || !e) return;
    const { L, mapa, capa } = e;
    capa.clearLayers();
    for (const p of puntos) {
      const m = L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: COLOR[p.categoria], fillOpacity: 0.95 });
      const caja = document.createElement("div");
      const titulo = document.createElement(detalle ? "strong" : "a");
      titulo.textContent = p.titulo;
      if (!detalle) (titulo as HTMLAnchorElement).href = `/planes/${p.slug}/`;
      const cat = document.createElement("div");
      cat.textContent = CATEGORIA_NOMBRE[p.categoria];
      const aprox = document.createElement("small");
      aprox.textContent = p.aprox === false ? "Ubicación cruzada con la dirección oficial." : "Ubicación aproximada: confirma la dirección en la fuente.";
      caja.append(titulo, cat, aprox);
      m.bindPopup(caja);
      m.bindTooltip(p.titulo);
      m.addTo(capa);
    }
    if (puntos.length === 1) mapa.setView([puntos[0].lat, puntos[0].lng], 15);
    else if (puntos.length > 1) mapa.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
    else mapa.setView(CENTRO_MEDELLIN, 12);
  }, [listo, puntos]);

  return (
    <div>
      <div ref={contenedor} role="region" aria-label={etiqueta} class="w-full overflow-hidden rounded-tarjeta border border-linea-fuerte bg-superficie-2" style={{ height: alto }} />
      {!listo && !error && <p class="mt-2 text-sm text-suave" aria-live="polite">Cargando mapa…</p>}
      {error && <p class="mt-2 text-sm text-alerta-texto">No se pudo cargar el mapa. Usa la vista de lista.</p>}
    </div>
  );
}
