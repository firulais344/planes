import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Comprueba que la política de seguridad de contenido (CSP) de netlify.toml no rompe el sitio.
 * `astro preview` no aplica las cabeceras de Netlify, así que se agregan aquí a cada documento HTML
 * y se vigilan las violaciones mientras se usan las funciones que cargan recursos externos.
 */
const toml = readFileSync(join(import.meta.dirname, "..", "..", "netlify.toml"), "utf8");
const CSP = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml)?.[1];

test.describe("CSP", () => {
  test("netlify.toml define una CSP con lo imprescindible", () => {
    expect(CSP, "falta Content-Security-Policy en netlify.toml").toBeTruthy();
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(CSP).toContain(d);
  });

  for (const ruta of ["/", "/planes/mamm/", "/mi-lista/", "/contacto/", "/privacidad/", "/gratis/?vista=mapa"]) {
    test(`sin violaciones en ${ruta}`, async ({ page, baseURL }) => {
      await page.route(
        (url) => url.origin === new URL(baseURL!).origin,
        async (route) => {
          const respuesta = await route.fetch();
          const headers = { ...respuesta.headers() };
          if ((headers["content-type"] ?? "").includes("text/html")) headers["content-security-policy"] = CSP!;
          await route.fulfill({ response: respuesta, headers });
        },
      );
      await page.addInitScript(() => {
        (window as unknown as { __csp: string[] }).__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ← ${e.blockedURI}`));
      });
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      if (ruta.startsWith("/planes/")) await page.getByRole("heading", { name: "Ubicación" }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const violaciones = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
      expect(violaciones).toEqual([]);
    });
  }
});
