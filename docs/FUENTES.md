# Fuentes de eventos: qué se puede consultar y qué no

Revisado el **2026-10-30** (términos de uso y `robots.txt`). Esto no es asesoría legal: ante cualquier duda, pedir permiso por escrito.

## Regla

El pipeline **solo consulta una fuente si su permiso es `autorizado` o `abierto`** en `ingesta/fuentes.json`. Que un `robots.txt` permita rastrear no es permiso de reutilización: se revisan además los términos de uso.

## Viabilidad por fuente

| Fuente | `robots.txt` | Términos de uso | Conector viable hoy | Qué hace falta |
|---|---|---|---|---|
| **Carga manual** (formulario «Publica tu plan», aliados) | no aplica | Los datos los aportan sus dueños | **Sí** (`manual`) | Nada: ya funciona |
| **Feed iCal de un aliado** | no aplica | Lo publica quien da el permiso | **Sí** (`ics`) | Un organizador o venue que comparta su feed y lo autorice por escrito |
| **Medellín Travel** (guía oficial) | Permite todo | No mencionan reutilizar el calendario | **No todavía** (zona gris) | Autorización escrita del Bureau o de la Alcaldía; pedir un feed o API |
| **Alcaldía de Medellín** (agenda) | Solo bloquea rutas administrativas | Falta leer la política de uso del portal | **No todavía** | Leer la política; preguntar si hay feed o datos abiertos (Medata) |
| **Eventario** | Bloquea API, feeds y listados paginados | «No pueden ser utilizados, reproducidos ni explotados sin autorización expresa y escrita» | **No** | Autorización escrita o alianza |
| **La Tiquetera** | Permite todo | Prohíben reproducir su contenido y usar «robot, araña, raspador u otro medio automatizado» sin permiso escrito | **No** | Autorización escrita o alianza |
| **Tuboleta** | No revisado | El contenido es de Ticket Fast o de los promotores | **No** | Autorización escrita o alianza |
| **Datos abiertos (Medata, datos.gov.co)** | no aplica | Licencia abierta | **No hay conjunto de eventos** | Reconsultar; pedir a la Alcaldía que publique la agenda cultural |

## Qué dicen las fuentes (extractos)

- **La Tiquetera:** «queda prohibida cualquier forma de reproducción, distribución, comunicación pública, transformación […] sin el expreso y previo consentimiento de LA TIQUETERA».
- **Eventario:** «Todos los contenidos de la plataforma […] no pueden ser utilizados, reproducidos ni explotados sin autorización expresa y escrita de Eventario».
- **Tuboleta:** «Todo el contenido disponible en nuestro sitio web, es propiedad de TICKET FAST o de los Promotores».
- **Medellín Travel:** la página de términos regula el uso de la plataforma; no trata la reutilización del calendario.

## Camino recomendado

1. **Ahora:** carga manual + el formulario «Publica tu plan». Cada organizador aporta sus propios datos.
2. **Pedir permiso** a Medellín Travel y a la Alcaldía (plantilla en `docs/SOLICITUD_PERMISO.md`). Preguntar por un feed iCal, JSON o API: es lo más estable y no depende de la estructura de ninguna página.
3. **Alianzas** con boleteras (Tuboleta, La Tiquetera, Eventario): un feed de eventos a cambio de tráfico y enlace a la venta.
4. **Aliados con iCal:** teatros, centros culturales y venues suelen publicar su agenda en iCal. Es el camino con menos fricción.

Cuando una fuente autorice, se cambia su `permiso` a `autorizado`, se anota la evidencia (correo, fecha) y, si no ofrece iCal, se escribe un conector `html` o `json` para ella. Mientras tanto el ejecutor la omite y lo dice en el reporte.

## Imágenes

Ninguna fuente autorizó todavía el uso de sus imágenes. Se mantiene la política de `docs/IMAGENES.md`: ilustración propia o fotos con licencia libre.
