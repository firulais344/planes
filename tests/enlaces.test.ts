import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivoDe, esExterno, extraerEnlaces, ids, revisarInternos } from "../scripts/enlaces";

describe("extraerEnlaces", () => {
  const html = `
    <link rel="canonical" href="https://sitio.test/x/">
    <link rel="alternate" hreflang="es-CO" href="https://sitio.test/x/">
    <link rel="stylesheet" href="/_astro/a.css"><link rel="icon" href="/favicon.svg">
    <a href="/planes/uno/">Uno</a> <a class="x" href='/hoy/#lista'>Hoy</a>
    <img src="/og/a.png" alt=""> <script src="/_astro/a.js"></script>
    <source type="image/avif" srcset="/a.avif 480w">`;
  const urls = extraerEnlaces(html).map((e) => e.url);
  it("toma enlaces, imágenes, scripts, estilos e íconos", () => expect(urls).toEqual(["/_astro/a.css", "/favicon.svg", "/planes/uno/", "/hoy/#lista", "/og/a.png", "/_astro/a.js"]));
  it("no sigue canonical ni alternate", () => expect(urls.some((u) => u.startsWith("https://sitio.test"))).toBe(false));
  it("reconoce ids y enlaces externos", () => {
    expect(ids('<h2 id="lista"></h2><p id=\'otro\'></p>')).toEqual(new Set(["lista", "otro"]));
    expect(esExterno("https://a.test")).toBe(true);
    expect(esExterno("//cdn.test/x.js")).toBe(true);
    expect(esExterno("/planes/")).toBe(false);
  });
});

describe("revisarInternos", () => {
  const dist = mkdtempSync(join(tmpdir(), "dist-"));
  const pagina = (ruta: string, html: string) => {
    mkdirSync(join(dist, ruta), { recursive: true });
    writeFileSync(join(dist, ruta, "index.html"), html);
  };
  pagina("", '<a href="/hoy/">ok</a><a href="/planes/x/">ok</a><a href="/hoy/#uno">ok</a><a href="/hoy/#falta">ancla rota</a><a href="/no-existe/">roto</a><a href="https://externo.test/a">ext</a><a href="mailto:a@b.co">m</a><a href="#arriba">misma</a><h1 id="arriba"></h1><img src="/og/a.png">');
  pagina("hoy", '<h2 id="uno">Hoy</h2><a href="../planes/x/">relativo</a><a href="#nada">ancla rota</a>');
  pagina("planes/x", "<p>plan</p>");
  mkdirSync(join(dist, "og"));
  writeFileSync(join(dist, "og", "a.png"), "png");

  const r = revisarInternos(dist);
  it("encuentra enlaces, anclas y recursos rotos", () => {
    expect(r.rotos.map((x) => `${x.pagina} ${x.url}`).sort()).toEqual(["/ /hoy/#falta", "/ /no-existe/", "/hoy/ #nada"].sort());
  });
  it("acepta rutas relativas, anclas válidas y archivos", () => expect(r.rotos.some((x) => x.url.includes("planes/x") || x.url === "/og/a.png")).toBe(false));
  it("junta los enlaces externos sin tocarlos", () => expect([...r.externos.keys()]).toEqual(["https://externo.test/a"]));
  it("no sale de dist con rutas como ../", () => expect(archivoDe(dist, "/../../etc/passwd")).toBeNull());
});
