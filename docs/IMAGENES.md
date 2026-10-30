# Política de imágenes

Principio: **solo se usa una imagen si tenemos permiso claro para hacerlo**. Si no, la tarjeta muestra la ilustración propia de su categoría.

## Qué se usa

| Origen | Se usa | Condición |
|---|---|---|
| Ilustración propia por categoría (SVG, `src/components/PlanCard.tsx`) | Sí, por defecto | Hecha para el proyecto; sin terceros |
| Imagen de Open Graph generada en el build (`src/lib/og.ts`) | Sí, en todas las páginas | Texto + ilustración propia |
| Foto libre de Unsplash (Unsplash License) o Pexels (Pexels License) | Sí, solo en lugares permanentes | La foto debe mostrar claramente ese lugar, sin personas identificables, y no ser de Unsplash+ (de pago) |
| Imagen oficial de un evento | **No, todavía** | Solo si la fuente lo permite por escrito. No se ha revisado ningún término de uso |
| Foto de redes sociales o de otros sitios | **Nunca** | |

## Fotos incluidas

| Plan | Archivo | Autor | Licencia | Fuente |
|---|---|---|---|---|
| Comuna 13: grafitis y escaleras eléctricas | `src/assets/planes/comuna-13.jpg` | Josseph Downs (@0zymanndias) | Unsplash License | https://unsplash.com/photos/a-bunch-of-graffiti-on-the-side-of-a-building-WOkl7pWtcE0 |
| Día en Guatapé y Piedra del Peñol | `src/assets/planes/guatape-penol.jpg` | eduardo-augusto-873660888 | Pexels License | https://www.pexels.com/photo/el-penol-rock-in-guatape-with-clear-blue-sky-31882522/ |

Descargadas el 2026-10-29. Licencias: https://unsplash.com/license y https://www.pexels.com/license/.
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
