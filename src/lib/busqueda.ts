/**
 * Búsqueda tolerante a tildes, mayúsculas y errores leves de escritura.
 * Una palabra de la consulta coincide con una palabra del texto si es prefijo suyo
 * o si la distancia de edición (con transposición de letras vecinas) es pequeña.
 */

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

export function tokenizar(s: string): string[] {
  return normalizar(s).split(/\s+/).filter(Boolean);
}

/** Distancia de edición con transposiciones adyacentes (Damerau-Levenshtein "OSA"). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array<number>(m).fill(0)]);
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

/** Errores permitidos según el largo de la palabra buscada. */
export const tolerancia = (largo: number) => (largo <= 3 ? 0 : largo <= 7 ? 1 : 2);

export function coincidePalabra(tokens: string[], palabra: string): boolean {
  const tol = tolerancia(palabra.length);
  return tokens.some((t) => {
    if (t.startsWith(palabra)) return true;
    if (tol === 0) return false;
    if (distancia(t, palabra) <= tol) return true;
    return t.length > palabra.length && distancia(t.slice(0, palabra.length), palabra) <= tol;
  });
}

/** Todas las palabras de la consulta deben coincidir con alguna palabra del texto. */
export function coincide(texto: string | string[], consulta: string): boolean {
  const palabras = tokenizar(consulta);
  if (!palabras.length) return true;
  const tokens = Array.isArray(texto) ? texto : tokenizar(texto);
  return palabras.every((p) => coincidePalabra(tokens, p));
}
