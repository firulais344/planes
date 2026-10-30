import { getCollection } from "astro:content";
import { aPublico, type PlanPublico } from "./publico";
import { optimizar } from "./imagenes";

/** Todos los planes listos para enviar al navegador, con sus imágenes ya optimizadas. */
export async function cargarPlanes(): Promise<PlanPublico[]> {
  const entradas = await getCollection("planes");
  return Promise.all(entradas.map(async (e) => ({ ...aPublico(e.data), imagenOpt: await optimizar(e.data.imagen) })));
}
