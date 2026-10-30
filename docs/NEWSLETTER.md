# Boletín "Los mejores planes del finde, cada jueves": integración propuesta

Estado: **solo captura**. El sitio recoge correos (y WhatsApp opcional) con Netlify Forms; **no se envía nada** todavía.

## Qué está implementado

- Formulario `boletin` en la home (`src/components/Boletin.astro`), con campo trampa anti-spam y casilla de consentimiento obligatoria.
- Los envíos quedan en Netlify (Forms → `boletin`), con los campos `correo`, `whatsapp` y `consentimiento`.
- El formulario **no se muestra** hasta que `SITIO.responsable.nombre` esté definido en `src/config/sitio.ts` (Ley 1581 exige identificar al responsable). Para probarlo antes: `PUBLIC_BOLETIN=1`.
- Analítica: el evento `boletin_envio` cuenta clics en el botón, sin datos personales.

## Elección recomendada: Buttondown

| | Buttondown | Resend (Audiences) |
|---|---|---|
| Pensado para | Boletines | Correo transaccional/API |
| Doble confirmación (double opt-in) | Incluida | Hay que construirla |
| Baja de un clic y pie legal | Incluidos | Hay que construirlos |
| Archivo público de ediciones | Sí | No |
| Costo | Plan gratuito limitado; revisar tarifas vigentes | Plan gratuito limitado; revisar tarifas vigentes |

Recomendación: **Buttondown**, porque ya resuelve confirmación, baja y archivo, que son los requisitos legales y de confianza más fáciles de olvidar.

## Cómo conectarlo (cuando se decida activar)

1. Crear la cuenta de Buttondown y una clave de API. Guardarla como variable de entorno en Netlify (`BUTTONDOWN_API_KEY`), **nunca** en el repositorio.
2. Crear una función de Netlify (`netlify/functions/suscribir.ts`) que reciba el envío del formulario (webhook de Netlify Forms "submission created") y llame a la API de suscriptores de Buttondown. Consultar la documentación vigente de Buttondown para los nombres de los campos.
3. Activar la doble confirmación en Buttondown para que nadie quede suscrito sin confirmar su correo.
4. Probar con un correo propio y revisar que la baja funcione.
5. Antes de la primera edición: definir `SITIO.responsable` y revisar la política de privacidad con asesoría legal.

## WhatsApp

Se guarda el número solo si la persona lo escribe, y **no se usa para enviar nada**. Enviar mensajes de difusión exige activar WhatsApp Business con plantillas aprobadas y consentimiento específico. Decisión pendiente: si se quiere ese canal, evaluar el costo y las reglas de Meta antes de prometerlo en el sitio.

## Qué no hace (a propósito)

- No envía correos ni mensajes.
- No sincroniza con ningún proveedor.
- No promete una fecha de inicio: el texto del formulario dice que se avisará cuando arranque.
