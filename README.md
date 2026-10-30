# Parchemos · Planes en Medellín

Guía de planes en Medellín. En reconstrucción (Fase 1 de 7): el sitio antiguo fue reemplazado por un proyecto Astro; el diseño nuevo llega en la Fase 2.

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
