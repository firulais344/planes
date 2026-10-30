# Parchemos · Planes en Medellín

Guía de planes en Medellín: fiestas, conciertos, aire libre, comida y cultura, para encontrar qué hacer hoy, mañana o el fin de semana. Sitio estático, rápido, accesible y pensado para móvil.

**Regla del proyecto:** no se inventan datos. Un precio, horario o dirección que no se pudo confirmar en la fuente se marca como pendiente y la interfaz dice «Confirma … en la fuente».

## Stack

Astro 5 · TypeScript · Tailwind 4 · Preact (islas) · Zod · Leaflet/OpenStreetMap · Vitest · Playwright · Netlify.

## Empezar

```bash
npm install
npm run dev          # servidor de desarrollo
npm run verificar    # validar datos, tests, tipos, build y enlaces
npm run e2e          # pruebas de Playwright (requiere `npm run build` antes)
```

> **Si el proyecto está en iCloud Drive** (o Dropbox, OneDrive…), `node_modules` puede dejar a Node colgado mientras se sincroniza. Lo más simple es clonar el repositorio fuera de esas carpetas (por ejemplo `~/Developer`). Si no, renombra `node_modules`, `dist` y `.astro` con el sufijo `.nosync` y deja un enlace simbólico con el nombre original.

## Mapa del repositorio

| Ruta | Qué hay |
|---|---|
| `src/content/planes/*.json` | Los planes (un archivo por plan). **Aquí se editan los datos** |
| `src/lib/schema.ts` | Modelo y reglas de validación de un plan (Zod) |
| `src/lib/fechas.ts`, `precio.ts`, `explorar.ts`, `busqueda.ts` | Lógica de fechas (siempre America/Bogota), precios, filtros y búsqueda |
| `src/lib/jsonld.ts`, `ics.ts`, `og.ts`, `presets.ts` | Datos estructurados, calendario, imágenes para redes, páginas de aterrizaje |
| `src/components/`, `src/layouts/`, `src/pages/` | Interfaz y rutas |
| `src/styles/global.css` | Tokens de diseño (tema oscuro/claro) |
| `src/config/sitio.ts` | Responsable de datos personales, analítica |
| `scripts/` | Validación de planes, ingesta y chequeo de enlaces |
| `ingesta/` | Fuentes, cargas manuales, cola de revisión y reportes |
| `tests/` | Tests unitarios (Vitest) y `tests/e2e/` (Playwright) |
| `docs/` | Guías: fuentes, ingesta, imágenes, boletín, despliegue |
| `VERIFICACION.md` | Qué datos de lugares permanentes están confirmados y cuáles no |

## Agregar o editar un plan

1. Crea `src/content/planes/<slug>.json` (o edita uno). El esquema y las reglas están en `src/lib/schema.ts`; un plan existente sirve de plantilla.
2. Campos clave: `tipo` (`evento` con `inicio`/`fin`, o `permanente`), `categoria`, `precio`, `pendientes` (lo que falta confirmar), `fuente` (nombre y URL) y `verificado`.
3. **Precio:** si la fuente no lo dice, `{"tipo": "por_confirmar"}` y `"precio"` en `pendientes`. Nunca pongas un precio de memoria.
4. `npm run validate` revisa todo. El build **falla** si un plan es inválido.
5. Para marcar un plan como `verificado: true` debe tener `ultimaVerificacion`, precio real y `pendientes` vacío.

Cuando un plan tiene datos pendientes, la tarjeta y la página del plan lo dicen.

## Ingesta automática

Un pipeline trae eventos, deduplica y detecta cambios y cancelaciones, y los deja en un **PR para revisar**; nunca publica solo. **Solo consulta fuentes con permiso explícito**: hoy funcionan la carga manual y los feeds iCal de aliados; Medellín Travel, Eventario, La Tiquetera, Tuboleta y la Alcaldía están omitidas hasta tener autorización (`docs/FUENTES.md`, plantilla en `docs/SOLICITUD_PERMISO.md`).

```bash
npm run ingesta -- --dry   # ver qué haría
npm run ingesta            # aplicar
npm run cola               # ver la cola de revisión
```

Detalles en `docs/INGESTA.md`.

## Calidad

- **Tests unitarios** (`npm test`): modelo de datos, fechas y zona horaria, filtros, búsqueda difusa, precios, contraste de colores (WCAG AA), calendario, datos estructurados, ingesta y enlaces.
- **Playwright** (`npm run e2e`): flujos críticos en móvil y escritorio, con el reloj fijado para que «hoy» sea estable. Incluye una prueba de que la CSP de `netlify.toml` no bloquea nada.
- **Enlaces rotos** (`npm run enlaces`): revisa los enlaces internos y las anclas de `dist/`. Con `-- --externos` también los externos (semanal en CI).
- **Lighthouse CI** (`lighthouserc.cjs`): móvil, umbral 95 en rendimiento, accesibilidad, buenas prácticas y SEO.
- **CI** (`.github/workflows/ci.yml`): todo lo anterior en cada PR.

## Imágenes

Solo con licencia clara y sin personas identificables; si no, ilustración propia. Política y créditos en `docs/IMAGENES.md`.

## SEO, analítica y privacidad

Metadatos por página, Open Graph, `hreflang es-CO`, JSON-LD (`Event`, `Place`, `TouristAttraction`), sitemap y robots, imágenes para redes generadas en el build. Analítica con Umami sin cookies. Política de privacidad (Ley 1581 de 2012) y consentimiento en los formularios. El boletín solo captura datos: plan en `docs/NEWSLETTER.md`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `SITE_URL` | Dominio final (canonical, sitemap, Open Graph). Sin ella: `https://parchemos.netlify.app` |
| `PUBLIC_UMAMI_ID` / `PUBLIC_UMAMI_SRC` | Analítica. Sin ID no se carga ningún script |
| `PUBLIC_BOLETIN=1` | Muestra el boletín en pruebas. En producción se activa al definir `SITIO.responsable` |

## Desplegar

Guía completa (Netlify, dominio propio, HTTPS, formularios y lista de comprobación): `docs/DESPLIEGUE.md`.

## Antes del lanzamiento

- [ ] Elegir el **dominio** y configurar `SITE_URL`.
- [ ] Definir `SITIO.responsable` (nombre y contacto) en `src/config/sitio.ts` y pedir **revisión legal** de `/privacidad/`.
- [ ] Crear la cuenta de **Umami** y configurar `PUBLIC_UMAMI_ID`.
- [ ] Configurar los **ajustes de GitHub y Netlify** de la ingesta (`docs/INGESTA.md`).
- [ ] **Pedir permiso** a las fuentes de eventos (`docs/SOLICITUD_PERMISO.md`).
- [ ] Completar los datos pendientes de `VERIFICACION.md` y las coordenadas aproximadas.
