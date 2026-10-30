# Política de imágenes

Principio: **solo se usa una imagen si tenemos permiso claro para hacerlo**. Si no, la tarjeta muestra la ilustración propia de su categoría.

## Qué se usa

| Origen | Se usa | Condición |
|---|---|---|
| Ilustración propia por categoría (SVG, `src/components/PlanCard.tsx`) | Sí, por defecto | Hecha para el proyecto; sin terceros |
| Imagen de Open Graph generada en el build (`src/lib/og.ts`) | Sí, en todas las páginas | Texto + ilustración propia |
| Foto libre de Unsplash (Unsplash License) o Pexels (Pexels License) | Sí, en todos los planes | Sin personas identificables y no de Unsplash+ (de pago). En lugares permanentes debe mostrar ese lugar. En eventos, o si no hay foto libre del lugar, se usa una vista de Medellín con un texto alternativo que **no** afirma que sea el lugar |
| Imagen oficial de un evento | **No, todavía** | Solo si la fuente lo permite por escrito. No se ha revisado ningún término de uso |
| Foto de redes sociales o de otros sitios | **Nunca** | |

## Fotos incluidas

| Plan | Archivo | Autor | Licencia | Fuente |
|---|---|---|---|---|
| Comuna 13: grafitis y escaleras eléctricas | `src/assets/planes/comuna-13.jpg` | Josseph Downs (@0zymanndias) | Unsplash License | https://unsplash.com/photos/a-bunch-of-graffiti-on-the-side-of-a-building-WOkl7pWtcE0 |
| Día en Guatapé y Piedra del Peñol | `src/assets/planes/guatape-penol.jpg` | eduardo-augusto-873660888 | Pexels License | https://www.pexels.com/photo/el-penol-rock-in-guatape-with-clear-blue-sky-31882522/ |
| Pueblito Paisa | `pueblito-paisa.jpg` | Camilo Ospina | Pexels License | https://www.pexels.com/photo/pueblito-paisa-in-medelin-18156722/ |
| Palacio de la Cultura (tertulias, Una noche en el Palacio) | `palacio-cultura.jpg` | Daniel G | Pexels License | https://www.pexels.com/photo/palace-of-culture-rafael-uribe-uribe-in-medellin-colombia-18314213/ |
| Parque Explora | `parque-explora.jpg` | Pinamon | Pexels License | https://www.pexels.com/photo/dinosaurs-in-the-parque-explora-in-medellin-colombia-19252044/ |
| Vista de Medellín (genérica; museos y teatros) | `museo-mural.jpg` | Daniel Velez | Pexels License | https://www.pexels.com/photo/stunning-mural-inside-medellin-s-historic-museum-33110225/ |
| Vista de Medellín (genérica; parques) | `parque-fuente.jpg` | Pinamon | Pexels License | https://www.pexels.com/photo/park-in-town-16012236/ |
| Vista de Medellín (genérica) | `medellin-valle.jpg` | Cesar Gaviria | Pexels License | https://www.pexels.com/photo/city-in-mountains-in-summer-16637436/ |
| Vista de Medellín (genérica) | `medellin-rio.jpg` | Juan Luna | Pexels License | https://www.pexels.com/photo/scenic-view-of-medellin-skyline-and-river-38345724/ |
| Vista de Medellín (genérica) | `medellin-poblado.jpg` | Roodzn | Pexels License | https://www.pexels.com/photo/skyline-of-medellin-colombia-with-mountain-backdrop-33944843/ |
| Vista de Medellín (genérica) | `medellin-amanecer.jpg` | Greg Gulik | Pexels License | https://www.pexels.com/photo/medellin-skyline-during-early-morning-light-32197893/ |
| Vista de Medellín (genérica) | `medellin-centro.jpg` | César Gaviria | Pexels License | https://www.pexels.com/photo/panoramic-view-of-medellin-city-skyline-39068368/ |

Las fotos genéricas de Medellín se reutilizan en varios planes (ver el campo `imagen` de cada JSON); en los planes con foto del lugar el pie de foto lo dice. Las que son vistas genéricas **no** muestran el lugar del plan: conviene reemplazarlas cuando haya una foto libre del sitio.

Descargadas el 2026-10-29 y 2026-10-30. Licencias: https://unsplash.com/license y https://www.pexels.com/license/.
Ninguna de las dos licencias exige atribución, pero se muestra el crédito en la página de cada plan.

## Cómo agregar una foto

1. Confirma la licencia en la página de la foto y que no sea de Unsplash+.
2. Mira la foto completa: debe ser del lugar, y sin personas identificables.
3. Guárdala (hasta ~1600 px de ancho) en `src/assets/planes/`.
4. En el JSON del plan, agrega:

```json
"imagen": {
  "src": "nombre-del-archivo.jpg",
  "alt": "Qué se ve en la foto, en una frase",
  "licencia": "Unsplash License",
  "credito": "Nombre del autor en Unsplash",
  "origen": "https://unsplash.com/photos/..."
}
```

5. Anótala en la tabla de arriba.

El build genera AVIF y WebP con varios anchos (`srcset`), un JPEG de respaldo y carga diferida. Si el archivo no existe, el build falla.

## Imágenes de eventos: qué falta

Para usar la imagen oficial de un evento hace falta permiso de quien la publica. Antes de la automatización (Fase 6) hay que revisar los términos de uso de medellin.travel, Tuboleta, La Tiquetera y Eventario, y pedir autorización donde haga falta.
