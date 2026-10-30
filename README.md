# Parchemos · Planes en Medellín

Sitio estático (HTML, CSS y JavaScript, sin build) para encontrar fiestas, conciertos, planes al aire libre, comida y cultura en Medellín. Filtra por día, categoría, precio, con quién vas y zona.

## Publicar en Netlify

1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
3. No necesita comando de build. El directorio de publicación es la raíz (`.`), ya definido en `netlify.toml`.

Cada `git push` vuelve a publicar el sitio.

## Probar en local

Abre `index.html` en el navegador, o levanta un servidor:

```bash
python3 -m http.server 8000
```

Para probar con otra fecha: `http://localhost:8000/?hoy=2026-11-01`.

## Editar los planes

Todos los planes están en `planes.js`. Al principio del archivo hay un comentario con los campos. Los eventos usan `tipo: "evento"` con `inicio` y `fin` (`AAAA-MM-DD`); los lugares de siempre usan `tipo: "permanente"`. Los eventos pasados se ocultan solos.

Los datos se recopilaron el 2026-10-29 desde medellin.travel, Tuboleta, La Tiquetera y Eventario. Los precios marcados como "por confirmar" no aparecían en las fuentes.

## Archivos

- `index.html`: estructura de la página
- `styles.css`: estilos (tema nocturno)
- `app.js`: filtros y renderizado
- `planes.js`: los datos
- `netlify.toml`: configuración de Netlify
