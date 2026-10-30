# Parchemos · Planes en Medellín

Guía de planes en Medellín. En reconstrucción (Fases 1 y 2 de 7 listas): datos validados y diseño nuevo. Pendiente: páginas por plan, SEO, imágenes, verificación y automatización.

## Imágenes y verificación (Fase 5)

- Política de imágenes y créditos en `docs/IMAGENES.md`: solo fotos con licencia clara (Unsplash/Pexels, sin Unsplash+), sin personas identificables; si no hay foto, se usa la ilustración propia. Las fotos se optimizan en el build (AVIF, WebP, `srcset`, carga diferida).
- Informe de la verificación de los lugares permanentes contra sus sitios oficiales en `VERIFICACION.md`: qué se confirmó, qué cambió y qué sigue pendiente.

## SEO, analítica y privacidad (Fase 4)

- Metadatos únicos por página, Open Graph y Twitter Cards, `hreflang="es-CO"`, canonical y migas de pan (visibles y en JSON-LD).
- **Imágenes para redes** generadas en el build (`src/lib/og.ts`, satori + resvg): una por plan en `/og/<slug>.png` y una de inicio. Son ilustraciones propias con el texto convertido a trazos; no usan fotos de terceros.
- **Datos estructurados** (`src/lib/jsonld.ts`): `Event` para eventos, `Place`/`TouristAttraction` para lugares, `WebSite` con búsqueda. Solo se publica lo confirmado: sin precio verificado no hay `offers`, y sin coordenadas verificadas no hay `geo`.
- `sitemap-index.xml` (integración oficial de Astro) y `robots.txt`; `/mi-lista/`, `/gracias/` y el 404 quedan fuera.
- **Analítica con Umami**, sin cookies y respetando "No rastrear". Eventos: `busqueda`, `filtro`, `vista`, `sorprendeme`, `sorprendeme_otro`, `clic_fuente`, `como_llegar`, `calendario`, `compartir`, `favorito`, `exportar`, `boletin_envio`. No se envían datos personales.
- **Privacidad (Ley 1581 de 2012):** página `/privacidad/`, casilla de consentimiento obligatoria en los tres formularios. No hay aviso de cookies porque no se usan cookies de seguimiento (el tema y los favoritos se guardan solo en el dispositivo).
- **Boletín:** solo captura (Netlify Forms), sin envíos. Plan de integración en `docs/NEWSLETTER.md`.

### Variables de entorno

| Variable | Para qué |
|---|---|
| `SITE_URL` | Dominio final (canonical, sitemap, Open Graph). Sin ella usa `https://parchemos.netlify.app`. |
| `PUBLIC_UMAMI_ID` | ID del sitio en Umami. Sin él no se carga ningún script de analítica. |
| `PUBLIC_UMAMI_SRC` | Script de Umami. Por defecto `https://cloud.umami.is/script.js`. |
| `PUBLIC_BOLETIN=1` | Muestra el boletín en pruebas. En producción se activa al definir `SITIO.responsable` en `src/config/sitio.ts`. |

Antes del lanzamiento hay que completar `SITIO.responsable` (nombre y contacto de quien trata los datos) y pedir una revisión legal de la política de privacidad.

## Funcionalidad (Fase 3)

- Página por plan en `/planes/<slug>/`, con mapa (Leaflet + OpenStreetMap), "Cómo llegar", calendario `.ics`, compartir por WhatsApp y planes parecidos. Si el evento ya pasó no da 404: muestra un aviso con alternativas.
- Páginas indexables generadas desde `src/lib/presets.ts`: `/hoy/`, `/manana/`, `/fin-de-semana/`, `/proximos-7-dias/`, `/gratis/`, categorías, `/pareja/`, `/amigos/`, `/familia/`, `/solo/` y zonas con al menos 2 planes (`/poblado/`, `/centro/`…).
- Filtros combinables guardados en la URL (`?cuando=finde&precio=gratis&q=salsa&vista=mapa`).
- Búsqueda tolerante a tildes y errores de escritura (`src/lib/busqueda.ts`).
- Favoritos en `localStorage` y página `/mi-lista/` (compartible por enlace, exportable a texto y `.ics`).
- Las coordenadas (19 de 35 planes) son **aproximadas**, tomadas de OpenStreetMap/Nominatim (ODbL), y siguen marcadas como pendientes de verificar. El mapa lo dice en pantalla.

## Trabajar en una carpeta de iCloud Drive

Si el proyecto vive en iCloud Drive, `node_modules` (cientos de archivos) puede dejar a Node colgado mientras iCloud sincroniza. Mantén `node_modules`, `dist` y `.astro` fuera de la sincronización renombrándolos con el sufijo `.nosync` y dejando un enlace con el nombre original:

```bash
mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules
```

Lo más simple es clonar el repositorio en una carpeta fuera de iCloud (por ejemplo `~/Developer`).

## Diseño

- Tokens de color y tema claro/oscuro en `src/styles/global.css`; los pares de contraste se prueban contra WCAG AA en `tests/contraste.test.ts`.
- Fuentes autoalojadas: Bricolage Grotesque (títulos) e Inter (texto).
- Ilustraciones por categoría hechas en SVG propio (sin fotos de terceros).
- Las fechas ("hoy", "este finde") usan siempre America/Bogota: `src/lib/fechas.ts`.

## Stack

Astro 5 · TypeScript · Tailwind 4 · Preact (islas) · Zod · Vitest. Hosting en Netlify.

## Comandos

```bash
npm install
npm run dev        # servidor de desarrollo
npm run validate   # valida los planes (agrega --reporte para ver el estado de verificación)
npm test           # tests
npm run build      # valida y construye en dist/
```

## Datos

Cada plan es un archivo `src/content/planes/<slug>.json`. El modelo está en `src/lib/schema.ts`.
El build **falla** si un plan es inválido (fechas inexistentes, slug repetido, precio incoherente, etc.).

Regla principal: no se inventan datos.

- Un precio que no se pudo confirmar en la fuente es `por_confirmar` y `pendientes` incluye `"precio"`.
- El valor antiguo, si lo hay, queda en `precioPreliminar` y nunca se muestra como dato.
- `verificado: true` exige `ultimaVerificacion`, precio real y `pendientes` vacío.
- `pendientes` lista lo que falta confirmar (`fecha`, `horario`, `precio`, `direccion`, `coordenadas`).

## Despliegue

Netlify lee `netlify.toml`: comando `npm run build`, carpeta `dist`. El dominio se define con la variable `SITE_URL`.
