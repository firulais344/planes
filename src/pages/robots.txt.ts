import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site).href;
  const cuerpo = ["User-agent: *", "Allow: /", "Disallow: /mi-lista/", "Disallow: /gracias/", "", `Sitemap: ${sitemap}`, ""].join("\n");
  return new Response(cuerpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
