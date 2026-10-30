import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Dominio por definir; se sobreescribe con la variable SITE_URL al desplegar.
  site: process.env.SITE_URL || "https://parchemos.netlify.app",
  integrations: [preact()],
  vite: { plugins: [tailwindcss()] },
  build: { format: "directory" },
});
