import type { APIRoute } from "astro";
import { imagenInicio } from "../../lib/og";

export const GET: APIRoute = async () =>
  new Response(new Uint8Array(await imagenInicio()), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
