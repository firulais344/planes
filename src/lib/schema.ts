import { z } from "zod";

/**
 * Modelo de datos de un Plan.
 *
 * Regla de oro: no se inventan datos. Todo campo que no se pueda confirmar en la
 * fuente se deja vacío o como `por_confirmar`, y el plan queda con `verificado: false`.
 */

export const CATEGORIAS = ["fiesta", "aire-libre", "comida-cultura"] as const;
export const IDEAL_PARA = ["pareja", "amigos", "familia", "solo"] as const;
export const ESTADOS = ["activo", "agotado", "cancelado", "pasado"] as const;
export const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export const CAMPOS_VERIFICABLES = ["fecha", "horario", "precio", "direccion", "coordenadas"] as const;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD").refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, "Fecha inexistente");

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:mm");
const url = z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL http(s)");

export const PrecioSchema = z
  .object({
    tipo: z.enum(["gratis", "economico", "rango", "por_confirmar"]),
    minCOP: z.number().int().nonnegative().optional(),
    maxCOP: z.number().int().nonnegative().optional(),
    nota: z.string().max(200).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === "rango" && p.minCOP === undefined && p.maxCOP === undefined) {
      ctx.addIssue({ code: "custom", message: "Un precio de tipo 'rango' necesita minCOP o maxCOP" });
    }
    if (p.minCOP !== undefined && p.maxCOP !== undefined && p.minCOP > p.maxCOP) {
      ctx.addIssue({ code: "custom", message: "minCOP no puede ser mayor que maxCOP" });
    }
    if ((p.tipo === "gratis" || p.tipo === "por_confirmar") && (p.minCOP !== undefined || p.maxCOP !== undefined)) {
      ctx.addIssue({ code: "custom", message: `Un precio '${p.tipo}' no lleva minCOP/maxCOP` });
    }
  });

export const HorarioSchema = z.object({
  /** Texto libre mientras no haya horario por día confirmado. */
  texto: z.string().max(160).optional(),
  /** Horario por día; cada día admite varias franjas. Un día ausente = sin dato. */
  porDia: z
    .record(z.enum(DIAS), z.array(z.object({ abre: hora, cierra: hora })))
    .optional(),
});

export const RecurrenciaSchema = z.object({
  frecuencia: z.literal("semanal"),
  dias: z.array(z.enum(DIAS)).min(1),
  hasta: fecha.optional(),
});

export const ImagenSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1),
  licencia: z.string().min(1),
  credito: z.string().optional(),
  origen: url.optional(),
});

export const PlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id en minúsculas, números y guiones"),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug en minúsculas, números y guiones"),
    titulo: z.string().min(3).max(120),
    descripcionCorta: z.string().min(10).max(160),
    descripcionLarga: z.string().max(2000).optional(),
    tipo: z.enum(["evento", "permanente"]),
    categoria: z.enum(CATEGORIAS),
    etiquetas: z.array(z.string().min(2)).default([]),

    inicio: fecha.optional(),
    fin: fecha.optional(),
    horaInicio: hora.optional(),
    horaFin: hora.optional(),
    horario: HorarioSchema.optional(),
    recurrencia: RecurrenciaSchema.optional(),

    zona: z.object({ nombre: z.string().min(2), comuna: z.number().int().min(1).max(16).optional() }),
    lugar: z.string().min(2),
    direccion: z.string().optional(),
    lat: z.number().min(5.9).max(6.6).optional(),
    lng: z.number().min(-76).max(-75.2).optional(),

    precio: PrecioSchema,
    /** Dato antiguo sin confirmar: nunca se muestra como hecho, solo como pista. */
    precioPreliminar: z.enum(["gratis", "economico", "medio", "alto"]).optional(),

    idealPara: z.array(z.enum(IDEAL_PARA)).min(1),
    edadMinima: z.number().int().min(0).max(21).optional(),
    imagen: ImagenSchema.optional(),

    fuente: z.object({ nombre: z.string().min(2), url }),
    verificado: z.boolean(),
    ultimaVerificacion: fecha.optional(),
    /** Qué campos siguen sin confirmar. Alimenta la cola de revisión. */
    pendientes: z.array(z.enum(CAMPOS_VERIFICABLES)).default([]),
    estado: z.enum(ESTADOS).default("activo"),
    notasInternas: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (p.tipo === "evento" && !p.inicio) issue("inicio", "Un evento necesita fecha de inicio");
    if (p.tipo === "permanente" && (p.inicio || p.fin)) issue("inicio", "Un plan permanente no lleva fechas de inicio/fin");
    if (p.inicio && p.fin && p.fin < p.inicio) issue("fin", "La fecha de fin es anterior a la de inicio");
    if (p.recurrencia && p.tipo !== "evento") issue("recurrencia", "La recurrencia aplica a eventos");
    if (p.horaInicio && p.horaFin && !p.fin && !p.recurrencia && p.horaFin <= p.horaInicio) {
      issue("horaFin", "horaFin debe ser posterior a horaInicio en un evento de un día");
    }
    if ((p.lat === undefined) !== (p.lng === undefined)) issue("lat", "lat y lng van juntas");
    if (p.verificado) {
      if (!p.ultimaVerificacion) issue("ultimaVerificacion", "Un plan verificado necesita ultimaVerificacion");
      if (p.precio.tipo === "por_confirmar") issue("precio", "Un plan verificado no puede tener precio por_confirmar");
      if (p.pendientes.length) issue("pendientes", "Un plan verificado no puede tener campos pendientes");
    }
    // Un precio solo se publica como dato si está confirmado: `por_confirmar` <=> 'precio' pendiente.
    const precioPendiente = p.pendientes.includes("precio");
    if (p.precio.tipo === "por_confirmar" && !precioPendiente) {
      issue("pendientes", "Precio por_confirmar: agrega 'precio' a pendientes");
    }
    if (p.precio.tipo !== "por_confirmar" && precioPendiente) {
      issue("pendientes", "Precio concreto con 'precio' pendiente: déjalo por_confirmar hasta verificarlo (usa precioPreliminar)");
    }
  });

export type Plan = z.infer<typeof PlanSchema>;
export type Precio = z.infer<typeof PrecioSchema>;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_NOMBRE: Record<Categoria, string> = {
  "fiesta": "Fiestas y noche",
  "aire-libre": "Aire libre",
  "comida-cultura": "Comida y cultura",
};
