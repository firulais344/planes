import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // Dominio por definir; se sobreescribe con la variable SITE_URL al desplegar.
  site: process.env.SITE_URL || "https://parchemos.netlify.app",
  trailingSlash: "always",
  integrations: [
    preact(),
    // Páginas personales o sin valor para buscadores quedan fuera del sitemap.
    sitemap({ filter: (url) => !/\/(mi-lista|gracias|404)\/?$/.test(url), lastmod: new Date() }),
  ],
  vite: { plugins: [tailwindcss()] },
  build: { format: "directory" },
});
