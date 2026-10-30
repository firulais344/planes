# Despliegue

El sitio es estático: Netlify construye el repositorio de GitHub y publica `dist/`. Cada `git push` a `main` publica; cada PR genera una vista previa.

## 1. Conectar el repositorio (una vez)

1. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
2. Netlify lee `netlify.toml`: comando `npm run build`, carpeta `dist`, Node 22. No cambies nada más.
3. **Site configuration → Environment variables**:

| Variable | Valor |
|---|---|
| `SITE_URL` | El dominio final con `https://`, sin barra final (ej. `https://parchemos.co`). Define canonical, sitemap e imágenes de redes |
| `PUBLIC_UMAMI_ID` | ID del sitio en Umami (opcional hasta tener la cuenta) |
| `PUBLIC_UMAMI_SRC` | Solo si no usas Umami Cloud |

Después de cambiar variables hay que volver a desplegar (*Deploys → Trigger deploy*).

## 2. Dominio propio y HTTPS

1. **Domain management → Add a domain** y escribe el dominio comprado.
2. Elige cómo apuntarlo:
   - **Netlify DNS** (lo más simple): cambia los *nameservers* del dominio a los que Netlify indica.
   - **DNS externo**: crea un registro `ALIAS`/`ANAME` (o `A`) para el dominio raíz y un `CNAME` de `www` hacia `<tu-sitio>.netlify.app`, según indique Netlify.
3. Espera a que Netlify verifique el DNS. Después **HTTPS → Verify DNS configuration → Provision certificate** (Let's Encrypt, gratis y con renovación automática).
4. Activa **Force HTTPS**.
5. En *Domain management* marca el dominio sin `www` como **principal**: Netlify redirige `www` hacia él.
6. Cambia `SITE_URL` al dominio final y vuelve a desplegar.

El encabezado `Strict-Transport-Security` ya está en `netlify.toml`. No lo cambies a `preload` hasta estar seguro de que todo subdominio funcionará siempre con HTTPS.

## 3. Formularios (Netlify Forms)

Los formularios de contacto, «Publica tu plan» y boletín se detectan solos en el primer despliegue.

- **Forms → Form notifications → Add notification → Email**: elige a qué correo llega cada formulario. Sin esto los envíos solo quedan en el panel de Netlify.
- La casilla de spam (*honeypot*) ya está en los tres.
- Antes de recoger datos reales: definir `SITIO.responsable` en `src/config/sitio.ts` y pedir revisión legal de `/privacidad/`.

## 4. Automatización

Pasos únicos descritos en `docs/INGESTA.md`: permisos de Actions para abrir PR y el secreto `NETLIFY_BUILD_HOOK` para la reconstrucción diaria.

## 5. Después de publicar

- [ ] Abre el sitio con HTTPS y revisa que el candado esté bien en `www` y sin `www`.
- [ ] `https://tu-dominio/robots.txt` y `/sitemap-index.xml` responden con el dominio correcto.
- [ ] Envía el sitemap en Google Search Console y en Bing Webmaster Tools.
- [ ] Pega una página de plan en [la prueba de resultados enriquecidos de Google](https://search.google.com/test/rich-results) y confirma que `Event` sale sin errores.
- [ ] Comparte un enlace por WhatsApp y comprueba que se vea la imagen del plan.
- [ ] Envía un formulario de prueba y confirma que llega el correo.
- [ ] Crea la cuenta de Umami, configura `PUBLIC_UMAMI_ID`, vuelve a desplegar y verifica que aparezcan visitas.
- [ ] Revisa `VERIFICACION.md`: lo marcado como pendiente sigue mostrando «Confirma … en la fuente».

## Volver atrás

*Deploys* guarda cada versión: abre una anterior y pulsa **Publish deploy**. Si el problema es de datos, `git revert` del commit.

## Calidad en CI

Cada PR corre: validación de datos, tests, tipos, build, enlaces rotos, pruebas de Playwright (móvil y escritorio) y Lighthouse CI (umbral 95). El workflow `enlaces.yml` revisa los enlaces externos cada lunes.
