import { expect, test, type Page } from "@playwright/test";

/**
 * Flujos críticos. El reloj se fija el jueves 29 de octubre de 2026 (hora de Bogotá):
 * «hoy», «este finde» y «mañana» no dependen del día en que se corran las pruebas.
 */
const HOY = new Date("2026-10-29T12:00:00-05:00");

async function abrir(page: Page, ruta = "/") {
  await page.clock.setFixedTime(HOY);
  await page.goto(ruta);
  // Los islotes de Astro pierden el atributo `ssr` cuando terminan de hidratarse. Solo se espera a los
  // que cargan de inmediato: los `client:visible` (mapa, planes parecidos) esperan a verse en pantalla.
  await page.waitForFunction(() => ![...document.querySelectorAll('astro-island[client="load"]')].some((i) => i.hasAttribute("ssr")));
}

const resultados = (page: Page) => page.locator("#resultados article");
const titulo = (page: Page, texto: string | RegExp) => page.locator("#resultados article h3", { hasText: texto });
const atajo = (page: Page, nombre: string) => page.getByRole("group", { name: "Atajos" }).getByRole("button", { name: nombre, exact: true });

test.describe("home", () => {
  test("muestra los planes agrupados por día, empezando por hoy", async ({ page }) => {
    await abrir(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("¿Qué hacemos");
    await expect(page.locator("#resultados h2", { hasText: /^Hoy/ })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/eventos? para/);
  });

  test("el atajo «Hoy» filtra y actualiza la URL", async ({ page }) => {
    await abrir(page);
    await atajo(page, "Hoy").click();
    await expect(page).toHaveURL(/cuando=hoy/);
    await expect(titulo(page, "Una noche en el Palacio")).toBeVisible();
    await expect(titulo(page, "RITVALES 2026")).toHaveCount(0);
  });

  test("«Este finde» incluye viernes a domingo, incluidos los eventos recurrentes", async ({ page }) => {
    await abrir(page);
    await atajo(page, "Este finde").click();
    await expect(titulo(page, "RITVALES 2026").first()).toBeVisible();
    await expect(titulo(page, "Ponte Salsa en Familia").first()).toBeVisible(); // domingo 1 de noviembre
    await expect(titulo(page, "Chayanne")).toHaveCount(0);
  });

  test("«Gratis» solo muestra planes con precio gratuito confirmado y lo avisa", async ({ page }) => {
    await abrir(page);
    await atajo(page, "Gratis").click();
    await expect(page.getByText("Solo mostramos planes con precio confirmado")).toBeVisible();
    await expect(titulo(page, "Jardín Botánico de Medellín")).toBeVisible();
    await expect(titulo(page, "Beéle")).toHaveCount(0);
  });

  test("la búsqueda tolera errores de escritura", async ({ page }) => {
    await abrir(page);
    await page.locator("#buscar").fill("conciero");
    await expect(titulo(page, "Chayanne")).toBeVisible();
    await expect(page).toHaveURL(/q=conciero/);
  });

  test("una URL con filtros se abre con esos filtros (compartible)", async ({ page }) => {
    await abrir(page, "/?cuando=finde&q=salsa");
    await expect(page.locator("#buscar")).toHaveValue("salsa");
    await expect(atajo(page, "Este finde")).toHaveAttribute("aria-pressed", "true");
    await expect(titulo(page, "Ponte Salsa en Familia").first()).toBeVisible();
  });

  test("Sorpréndeme abre un plan al azar, permite repetir y se cierra con Escape", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Sorpréndeme" }).click();
    const dialogo = page.getByRole("dialog", { name: "Te toca este plan" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.locator("article")).toBeVisible(); // tras el esqueleto de carga
    await dialogo.getByRole("button", { name: "Otro plan" }).click();
    await expect(dialogo.locator("article")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
  });

  test("los filtros se adaptan: hoja inferior en móvil, panel fijo en escritorio", async ({ page, isMobile }) => {
    await abrir(page);
    const boton = page.getByRole("button", { name: /^Filtros/ });
    if (isMobile) {
      await boton.click();
      const hoja = page.getByRole("dialog", { name: "Filtros" });
      await expect(hoja).toBeVisible();
      await hoja.getByLabel("Precio").selectOption("gratis");
      await hoja.getByRole("button", { name: "Listo" }).click();
      await expect(hoja).toBeHidden();
      await expect(page).toHaveURL(/precio=gratis/);
    } else {
      await expect(boton).toBeHidden();
      await expect(page.getByLabel("Zona").first()).toBeVisible();
    }
  });

  test("no hay desplazamiento horizontal", async ({ page }) => {
    await abrir(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("página de un plan", () => {
  test("se llega desde una tarjeta y trae acciones, datos estructurados y migas", async ({ page }) => {
    await abrir(page);
    await resultados(page).first().getByRole("link", { name: /^Ver plan/ }).click();
    await expect(page).toHaveURL(/\/planes\/[^/]+\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Migas de pan" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cómo llegar/ })).toBeVisible();
    expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThanOrEqual(2);
  });

  test("un evento ofrece calendario .ics y un lugar con coordenadas muestra el mapa", async ({ page }) => {
    await abrir(page, "/planes/ponte-salsa-familia/");
    await expect(page.getByRole("link", { name: "Agregar al calendario" })).toHaveAttribute("href", "/planes/ponte-salsa-familia.ics");
    await abrir(page, "/planes/mamm/");
    await page.getByRole("heading", { name: "Ubicación" }).scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("un plan con foto muestra su crédito y licencia", async ({ page }) => {
    await abrir(page, "/planes/comuna-13/");
    await expect(page.locator("figure img")).toBeVisible();
    await expect(page.locator("figcaption")).toContainText("Unsplash License");
  });

  test("un evento que ya pasó no da 404: avisa y ofrece alternativas", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-30T12:00:00-05:00"));
    await page.goto("/planes/frankenstein/");
    await expect(page.getByText("Este evento ya pasó")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver todos los planes" })).toBeVisible();
  });
});

test.describe("favoritos, tema y páginas", () => {
  test("guardar un plan, verlo en Mi lista y que persista al recargar", async ({ page }) => {
    await abrir(page);
    const primera = resultados(page).first();
    const nombre = (await primera.locator("h3").innerText()).trim();
    await primera.getByRole("button", { name: /^Guardar/ }).click();
    await expect(primera.getByRole("button", { name: /^Quitar/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("header [data-fav-count]").first()).toHaveText("1");

    await abrir(page, "/mi-lista/");
    await expect(page.locator("article h3", { hasText: nombre })).toBeVisible();
    await page.reload();
    await expect(page.locator("article h3", { hasText: nombre })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Vaciar lista" }).click();
    await expect(page.getByText("Tu lista está vacía")).toBeVisible();
  });

  test("una lista compartida ignora identificadores inválidos y permite guardarla", async ({ page }) => {
    await abrir(page, "/mi-lista/?p=plaza-botero,%3Cscript%3E,mamm");
    await expect(page.getByText("Estás viendo una lista compartida")).toBeVisible();
    await expect(page.locator("article h3")).toHaveCount(2);
    await page.getByRole("button", { name: "Guardar en mi lista" }).click();
    await expect(page.locator("header [data-fav-count]").first()).toHaveText("2");
  });

  test("el cambio de tema se recuerda", async ({ page }) => {
    await abrir(page);
    const html = page.locator("html");
    const inicial = await html.getAttribute("data-theme");
    await page.getByRole("button", { name: "Cambiar entre modo oscuro y claro" }).click();
    const nuevo = await html.getAttribute("data-theme");
    expect(nuevo).not.toBe(inicial);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", nuevo!);
  });

  test("las páginas de aterrizaje traen su filtro precargado", async ({ page }) => {
    await abrir(page, "/gratis/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Planes gratis en Medellín");
    await expect(atajo(page, "Gratis")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Quitar filtros" })).toHaveCount(0);
  });

  test("el 404 es útil y responde con el código correcto", async ({ page }) => {
    const r = await page.goto("/no-existe/");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Aquí no hay parche" })).toBeVisible();
  });

  test("los formularios exigen consentimiento", async ({ page }) => {
    for (const ruta of ["/contacto/", "/publica-tu-plan/"]) {
      await abrir(page, ruta);
      expect(await page.locator('input[name="consentimiento"]').evaluate((el: HTMLInputElement) => el.required)).toBe(true);
      expect(await page.locator("form").getAttribute("data-netlify")).toBe("true");
    }
  });

  test("robots.txt apunta al sitemap y el sitemap existe", async ({ request }) => {
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
    expect((await request.get("/sitemap-index.xml")).status()).toBe(200);
  });
});
