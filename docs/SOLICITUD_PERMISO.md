# Plantilla: solicitud de permiso para usar datos de eventos

Úsala (adaptándola) para escribir a Medellín Travel, la Alcaldía o una boletera. Completa lo que está entre corchetes. Esta plantilla no se envía sola.

---

**Asunto:** Solicitud de autorización para enlazar y mostrar la agenda de eventos de [FUENTE] en Parchemos

Hola, equipo de [FUENTE]:

Soy [NOMBRE], responsable de **Parchemos** ([DOMINIO]), una guía de planes en Medellín para saber qué hacer hoy, mañana o el fin de semana. Mostramos cada evento con un resumen breve escrito por nosotros y **siempre enlazamos a su página original** para que la gente compre o confirme allí.

Quisiéramos su **autorización por escrito** para reutilizar, de forma automatizada, solo datos básicos de los eventos que ustedes publican:

- título, fecha y hora, lugar y enlace a su página;
- precio, cuando esté indicado.

Lo que nos comprometemos a hacer:

- Atribuir y enlazar su página en cada evento.
- No copiar descripciones largas ni imágenes sin su permiso.
- Consultar su información como máximo una vez al día y con un identificador claro (`ParchemosBot`).
- Retirar o corregir un evento a su solicitud.

¿Podrían indicarnos si ofrecen un **feed iCal, JSON o una API**, y bajo qué condiciones podemos usarlo? Si prefieren otro formato de alianza, con gusto lo conversamos.

Quedo atento. Gracias,

[NOMBRE]
[CONTACTO]

---

## Después de que respondan

1. Guarda la respuesta (correo o documento) y anota fecha y condiciones.
2. En `ingesta/fuentes.json`, cambia el `permiso` de la fuente a `autorizado` y resume la evidencia en el campo `evidencia`.
3. Si respetan lo acordado sobre imágenes, actualiza `docs/IMAGENES.md`.
