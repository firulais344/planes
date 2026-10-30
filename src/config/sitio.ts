/**
 * Configuración del sitio que no son datos de planes.
 * Lo marcado como "por completar" lo define quien opera el sitio antes del lanzamiento.
 */
export const SITIO = {
  nombre: "Parchemos",
  ciudad: "Medellín",

  /**
   * Responsable del tratamiento de datos personales (Ley 1581 de 2012).
   * POR COMPLETAR: nombre o razón social y un medio de contacto para ejercer derechos.
   * Mientras `nombre` esté vacío, el boletín queda desactivado y la política de privacidad lo indica.
   */
  responsable: { nombre: "", contacto: "" },

  /** Última vez que se revisó el texto de la política de privacidad (AAAA-MM-DD). */
  politicaActualizada: "2026-10-29",

  /** Analítica de privacidad (Umami). Sin ID configurado no se carga ningún script. */
  analitica: {
    id: (import.meta.env.PUBLIC_UMAMI_ID as string | undefined) ?? "",
    src: (import.meta.env.PUBLIC_UMAMI_SRC as string | undefined) ?? "https://cloud.umami.is/script.js",
  },
} as const;

export const responsableDefinido = () => SITIO.responsable.nombre.trim() !== "";

/** El boletín solo recoge datos cuando hay un responsable identificado (o en pruebas con PUBLIC_BOLETIN=1). */
export const boletinActivo = () => responsableDefinido() || import.meta.env.PUBLIC_BOLETIN === "1";
