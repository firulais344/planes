import { useEffect, useState } from "preact/hooks";

/**
 * Favoritos sin cuenta: una lista de slugs en localStorage. Cada cambio emite un evento
 * para que botones, contador del encabezado y la página "Mi lista" se mantengan sincronizados.
 */
const CLAVE = "favoritos";
const EVENTO = "favoritos-cambio";
const MAX = 200;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function depurar(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((s): s is string => typeof s === "string" && SLUG.test(s)))].slice(0, MAX);
}

export function leerFavoritos(): string[] {
  try {
    return depurar(JSON.parse(localStorage.getItem(CLAVE) ?? "[]"));
  } catch {
    return [];
  }
}

export function guardarFavoritos(slugs: string[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(depurar(slugs)));
  } catch {
    /* modo privado o almacenamiento lleno: la lista vive solo en esta sesión */
  }
  window.dispatchEvent(new CustomEvent(EVENTO));
}

export function alternarFavorito(slug: string): string[] {
  const actual = leerFavoritos();
  const siguiente = actual.includes(slug) ? actual.filter((s) => s !== slug) : [...actual, slug];
  guardarFavoritos(siguiente);
  return siguiente;
}

export function suscribirFavoritos(cb: () => void): () => void {
  const alCambiar = (e: Event) => {
    if (e.type === EVENTO || (e as StorageEvent).key === CLAVE) cb();
  };
  window.addEventListener(EVENTO, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

export function useFavoritos(): string[] {
  const [lista, setLista] = useState<string[]>([]);
  useEffect(() => {
    const leer = () => setLista(leerFavoritos());
    leer();
    return suscribirFavoritos(leer);
  }, []);
  return lista;
}

/** Enlace para compartir una lista: /mi-lista/?p=slug1,slug2 */
export function enlaceLista(slugs: string[], origen: string): string {
  const u = new URL("/mi-lista/", origen);
  if (slugs.length) u.searchParams.set("p", depurar(slugs).join(","));
  return u.toString();
}

export function slugsDeParametro(valor: string | null): string[] {
  return valor ? depurar(valor.split(",").map((s) => s.trim())) : [];
}
