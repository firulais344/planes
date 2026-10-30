/**
 * Chequeo de enlaces rotos sobre el sitio construido (dist/).
 *   npm run enlaces                # enlaces internos y anclas: falla si alguno está roto
 *   npm run enlaces -- --externos  # además prueba los enlaces externos (lento; semanal en CI)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Enlace {
  url: string;
  etiqueta: string;
}

const ATRIBUTO = (attrs: string, nombre: string) => new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs)?.slice(1).find(Boolean);

/** Enlaces que el navegador sigue o carga: <a href>, <img src>, <script src>, <source src> y hojas de estilo/íconos. */
export function extraerEnlaces(html: string): Enlace[] {
  const salida: Enlace[] = [];
  for (const m of html.matchAll(/<(a|img|script|source|link)\b([^>]*)>/gi)) {
    const etiqueta = m[1].toLowerCase();
    const attrs = m[2];
    if (etiqueta === "link" && !/\brel\s*=\s*["']?[^"'>]*(stylesheet|icon|preload)/i.test(attrs)) continue; // canonical y alternate no se siguen
    const url = ATRIBUTO(attrs, etiqueta === "a" || etiqueta === "link" ? "href" : "src");
    if (url) salida.push({ url, etiqueta });
  }
  return salida;
}

export const ids = (html: string): Set<string> => new Set([...html.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((m) => m[1] ?? m[2]));

const IGNORAR = /^(mailto:|tel:|javascript:|data:|blob:|#?$)/i;
export const esExterno = (url: string) => /^(https?:)?\/\//i.test(url);

/** Archivo de dist al que apunta una ruta interna (o null si no existe). */
export function archivoDe(dist: string, ruta: string): string | null {
  const limpia = decodeURIComponent(ruta.split(/[?#]/)[0]);
  const base = join(dist, limpia);
  for (const c of [base, join(base, "index.html"), `${base}.html`]) {
    if (c.startsWith(dist) && existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

export interface Roto {
  pagina: string;
  url: string;
  motivo: string;
}

export function revisarInternos(dist: string): { revisados: number; rotos: Roto[]; externos: Map<string, string> } {
  const paginas: string[] = [];
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (n.endsWith(".html")) paginas.push(p);
    }
  };
  recorrer(dist);

  const cacheIds = new Map<string, Set<string>>();
  const idsDe = (archivo: string) => {
    if (!cacheIds.has(archivo)) cacheIds.set(archivo, ids(readFileSync(archivo, "utf8")));
    return cacheIds.get(archivo)!;
  };

  const rotos: Roto[] = [];
  const externos = new Map<string, string>();
  let revisados = 0;

  for (const pagina of paginas) {
    const nombre = "/" + relative(dist, pagina).replace(/index\.html$/, "");
    for (const { url } of extraerEnlaces(readFileSync(pagina, "utf8"))) {
      if (IGNORAR.test(url)) continue;
      if (esExterno(url)) {
        if (!externos.has(url)) externos.set(url, nombre);
        continue;
      }
      revisados++;
      let destino: string | null;
      const [ruta, ancla] = url.split("#");
      if (ruta === "" || ruta === undefined) destino = pagina; // ancla en la misma página
      else {
        const absoluta = ruta.startsWith("/") ? ruta : resolve("/", nombre, ruta).replace(/\/+$/, "/");
        destino = archivoDe(dist, absoluta);
      }
      if (!destino) {
        rotos.push({ pagina: nombre, url, motivo: "no existe en dist" });
        continue;
      }
      if (ancla && destino.endsWith(".html") && !idsDe(destino).has(decodeURIComponent(ancla))) {
        rotos.push({ pagina: nombre, url, motivo: `no existe el ancla #${ancla}` });
      }
    }
  }
  return { revisados, rotos, externos };
}

// ---------- Enlaces externos ----------
const NO_REVISAR = [/^https:\/\/(www\.)?google\.com\/maps\//, /^https:\/\/wa\.me\//, /^https:\/\/tile\.openstreetmap\.org\//];

async function probar(url: string): Promise<{ ok: boolean; aviso?: boolean; estado: string }> {
  const intento = async (method: "HEAD" | "GET") => fetch(url, { method, redirect: "follow", headers: { "User-Agent": "ParchemosBot/1.0 (+https://github.com/firulais344/planes)" }, signal: AbortSignal.timeout(15_000) });
  try {
    let r = await intento("HEAD");
    if (r.status === 405 || r.status === 501 || r.status === 403) r = await intento("GET");
    if (r.status < 400) return { ok: true, estado: String(r.status) };
    // Muchos sitios bloquean a los bots: no se cuentan como rotos, pero se avisa.
    if ([401, 403, 429, 999].includes(r.status)) return { ok: true, aviso: true, estado: `${r.status} (bloquea bots)` };
    return { ok: false, estado: String(r.status) };
  } catch (e) {
    return { ok: false, estado: (e as Error).name === "TimeoutError" ? "tiempo agotado" : "sin respuesta" };
  }
}

async function main() {
  const dist = resolve(import.meta.dirname, "..", "dist");
  if (!existsSync(dist)) {
    console.error("No existe dist/. Ejecuta `npm run build` primero.");
    process.exit(2);
  }
  const { revisados, rotos, externos } = revisarInternos(dist);
  console.log(`Enlaces internos revisados: ${revisados}`);
  for (const r of rotos) console.error(`  ✖ ${r.pagina} → ${r.url} (${r.motivo})`);

  let externosRotos = 0;
  if (process.argv.includes("--externos")) {
    const lista = [...externos].filter(([u]) => !NO_REVISAR.some((re) => re.test(u)));
    console.log(`Enlaces externos a revisar: ${lista.length}`);
    const cola = [...lista];
    const trabajador = async () => {
      for (let par = cola.shift(); par; par = cola.shift()) {
        const [url, pagina] = par;
        const r = await probar(url);
        if (!r.ok) {
          externosRotos++;
          console.error(`  ✖ ${pagina} → ${url} (${r.estado})`);
        } else if (r.aviso) console.warn(`  ⚠ ${url} (${r.estado})`);
        await new Promise((ok) => setTimeout(ok, 400));
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
  }

  if (rotos.length || externosRotos) {
    console.error(`\n✖ ${rotos.length + externosRotos} enlace(s) roto(s)`);
    process.exit(1);
  }
  console.log("✔ Sin enlaces rotos");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
