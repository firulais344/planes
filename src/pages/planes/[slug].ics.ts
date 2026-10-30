import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { aPublico } from "../../lib/publico";
import { calendarioICS, esAgendable } from "../../lib/ics";

export async function getStaticPaths() {
  const planes = (await getCollection("planes")).map((e) => aPublico(e.data)).filter(esAgendable);
  return planes.map((plan) => ({ params: { slug: plan.slug }, props: { plan } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const plan = props.plan as ReturnType<typeof aPublico>;
  const url = new URL(`/planes/${plan.slug}/`, site).href;
  return new Response(calendarioICS([{ plan, url }], new Date()), {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
};
