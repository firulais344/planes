# Parchemos · Planes en Medellín

Guía de planes en Medellín. En reconstrucción (Fases 1 y 2 de 7 listas): datos validados y diseño nuevo. Pendiente: páginas por plan, SEO, imágenes, verificación y automatización.

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
