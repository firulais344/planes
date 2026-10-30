import type { PlanPublico } from "./publico";
import { INICIAL, type Estado } from "./explorar";
import { slugify } from "./slug";

/** Páginas de aterrizaje indexables: cada una es una vista filtrada con URL limpia. */
export interface Preset {
  slug: string;
  /** Encabezado h1 de la página. */
  titulo: string;
  /** Texto de la etiqueta <title>. */
  metaTitulo: string;
  descripcion: string;
  intro: string;
  estado: Estado;
}

const crear = (slug: string, titulo: string, metaTitulo: string, descripcion: string, intro: string, parcial: Partial<Estado>): Preset => ({
  slug, titulo, metaTitulo, descripcion, intro, estado: { ...INICIAL, ...parcial },
});

/** Zonas genéricas que no sirven como página propia. */
const ZONAS_EXCLUIDAS = new Set(["Medellín", "Varias", "Fuera de la ciudad"]);
const ALIAS_ZONA: Record<string, string> = { "El Poblado": "poblado" };
/** Una zona necesita al menos este número de planes para tener página propia (evita páginas vacías). */
export const MIN_PLANES_ZONA = 2;

export function construirPresets(planes: PlanPublico[]): Preset[] {
  const presets: Preset[] = [
    crear("hoy", "Qué hacer en Medellín hoy", "Qué hacer en Medellín hoy · Parchemos", "Eventos, fiestas y planes para hoy en Medellín, más lugares que puedes visitar cualquier día.", "Los planes que ocurren hoy en la ciudad, ordenados por fecha. Abajo, lugares para ir cualquier día.", { cuando: "hoy" }),
    crear("manana", "Qué hacer en Medellín mañana", "Planes para mañana en Medellín · Parchemos", "Eventos y planes para mañana en Medellín: música, fiestas, cultura y aire libre.", "Lo que hay mañana en Medellín. Revisa el enlace de cada plan para confirmar horario y entradas.", { cuando: "manana" }),
    crear("fin-de-semana", "Planes para este fin de semana en Medellín", "Qué hacer este fin de semana en Medellín · Parchemos", "Fiestas, conciertos y planes para este fin de semana en Medellín. Filtra por precio y con quién vas.", "Del viernes al domingo: fiestas, conciertos, cultura y planes al aire libre.", { cuando: "finde" }),
    crear("proximos-7-dias", "Planes en Medellín los próximos 7 días", "Planes en Medellín esta semana · Parchemos", "Todo lo que pasa en Medellín en los próximos 7 días: eventos, fiestas y cultura.", "La semana completa, día por día.", { cuando: "semana" }),
    crear("gratis", "Planes gratis en Medellín", "Planes gratis en Medellín · Parchemos", "Planes gratis en Medellín: eventos con entrada libre y lugares sin costo. Solo mostramos precios confirmados.", "Solo aparecen planes cuyo precio gratuito está confirmado. Los que aún dicen “Confirmar en la fuente” no se incluyen.", { precio: "gratis" }),
    crear("fiestas", "Fiestas y vida nocturna en Medellín", "Fiestas y vida nocturna en Medellín · Parchemos", "Fiestas, conciertos y rumba en Medellín: eventos por fecha y zonas para salir de noche.", "Conciertos, fiestas temáticas, música en vivo y las zonas de rumba de la ciudad.", { cat: "fiesta" }),
    crear("aire-libre", "Planes al aire libre en Medellín", "Planes al aire libre en Medellín · Parchemos", "Senderismo, parques, miradores y excursiones en Medellín y sus alrededores.", "Parques, caminatas, miradores y salidas de un día.", { cat: "aire-libre" }),
    crear("comida-y-cultura", "Comida y cultura en Medellín", "Comida y cultura en Medellín · Parchemos", "Museos, teatro, cine, mercados y gastronomía en Medellín.", "Museos, teatro, cine, mercados y lugares para comer.", { cat: "comida-cultura" }),
    crear("pareja", "Planes en pareja en Medellín", "Qué hacer en pareja en Medellín · Parchemos", "Planes para ir en pareja en Medellín: música, teatro, miradores y salidas nocturnas.", "Ideas para salir de a dos.", { con: "pareja" }),
    crear("amigos", "Planes con amigos en Medellín", "Planes con amigos en Medellín · Parchemos", "Qué hacer con amigos en Medellín: fiestas, conciertos, excursiones y comida.", "Para el parche completo.", { con: "amigos" }),
    crear("familia", "Planes en familia en Medellín", "Planes en familia en Medellín · Parchemos", "Planes para ir en familia en Medellín: parques, museos, música y actividades para todas las edades.", "Planes pensados para ir con niños y adultos.", { con: "familia" }),
    crear("solo", "Planes para ir solo/a en Medellín", "Qué hacer solo en Medellín · Parchemos", "Planes para disfrutar solo/a en Medellín: cultura, naturaleza y eventos.", "Salir sin compañía también se disfruta.", { con: "solo" }),
  ];

  const porZona = new Map<string, number>();
  for (const p of planes) porZona.set(p.zona.nombre, (porZona.get(p.zona.nombre) ?? 0) + 1);
  const usados = new Set(presets.map((p) => p.slug));
  for (const [zona, n] of [...porZona].sort((a, b) => a[0].localeCompare(b[0], "es"))) {
    if (ZONAS_EXCLUIDAS.has(zona) || n < MIN_PLANES_ZONA) continue;
    const slug = ALIAS_ZONA[zona] ?? slugify(zona);
    if (usados.has(slug)) continue;
    usados.add(slug);
    presets.push(crear(slug, `Qué hacer en ${zona}, Medellín`, `Planes en ${zona}, Medellín · Parchemos`, `Eventos, fiestas y lugares para visitar en ${zona}, Medellín.`, `Planes y lugares en la zona de ${zona}.`, { zona }));
  }
  return presets;
}

/** Enlaces a otras vistas para mostrar al pie de cada página de aterrizaje. */
export function enlacesRelacionados(presets: Preset[], actual: string): Preset[] {
  return presets.filter((p) => p.slug !== actual);
}
