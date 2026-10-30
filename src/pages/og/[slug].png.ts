import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { aPublico, type PlanPublico } from "../../lib/publico";
import { imagenPlan } from "../../lib/og";

export async function getStaticPaths() {
  const planes = (await getCollection("planes")).map((e) => aPublico(e.data));
  return planes.map((plan) => ({ params: { slug: plan.slug }, props: { plan } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await imagenPlan(props.plan as PlanPublico);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
};
