# Informe de verificación: planes permanentes

Fecha: **2026-10-29**. Método: búsqueda web y lectura de la página oficial de cada lugar. Solo se escribió en los datos lo que la fuente decía de forma explícita; lo demás quedó como pendiente.

## Resumen

- **Planes:** 35 (22 eventos, 13 permanentes).
- **Planes marcados `verificado: true`:** 0. Ninguno tiene todos sus campos confirmados todavía; el que más se acerca es el Jardín Botánico, al que solo le falta la coordenada.
- **Precios confirmados:** 7 de 35 (antes 2). Cinco son de lugares permanentes.
- **Pendientes tras esta fase** (planes afectados): coordenadas 33, dirección 30, precio 28, horario 26.

## Confirmado

| Plan | Qué se confirmó | Fuente |
|---|---|---|
| Jardín Botánico de Medellín | Entrada **gratuita** (salvo eventos especiales); Casa de las Mariposas $10.000; Sendero de plantas prehistóricas $6.000; horario martes a viernes 9:30–16:00 y sábados, domingos y festivos 9:00–16:00; dirección Calle 73 # 51D-14 | botanicomedellin.org |
| MAMM | Entrada general **$18.000**; mayores de 60, menores de 12 y estudiantes **$12.000**; horario martes a viernes 11:00–19:00, sábados, domingos y festivos 11:00–18:00; cierra lunes y martes posteriores a festivo | elmamm.org |
| Parque Arví | Senderismo in situ: **$30.000** extranjeros, **$20.000** nacionales, **$10.000** beneficiarios Sisbén IV del Área Metropolitana; menores de 5 años no pagan; servicios turísticos miércoles a lunes 9:30–17:30 | parquearvi.org |
| Pueblito Paisa | Entrada **sin costo**; abierto todos los días 5:30–22:00; acceso por la carrera 63B (Avenida 33) | medellin.travel |
| Comuna 13 | Las escaleras eléctricas públicas son **gratuitas** | medellin.travel |
| Museo de Antioquia (Plaza Botero) | Dirección Carrera 52 # 52–43; horario lunes a sábado 9:40–17:30, domingos y festivos 10:00–17:00 | museodeantioquia.co |
| Parque Explora | Horario martes a viernes 8:30–17:30 (taquilla cierra 16:00); fines de semana y festivos 10:00–18:30 (taquilla cierra 17:00) | parqueexplora.org |
| Mercado del Río | Dirección Calle 24 # 48-28; abierto 7 días; cocinas y restaurantes: dom–mar 12:00–21:00, mié–jue hasta 22:00, vie–sáb hasta 23:00 | mercadodelrio.com.co |
| Ciclovía | Domingos y festivos: Estadio, Avenida del Río y El Poblado 7:00–13:00; Cerro El Volador 7:00–12:00; Las Palmas 5:30–10:00 | Inder (PDF de 2025) |

**Coordenadas cruzadas con la dirección oficial:** Museo de Antioquia/Plaza Botero (a 35 m) y Mercado del Río (0 m). Esos dos pines dejaron de ser "aproximados".

## Lo que cambió respecto de lo que había escrito de memoria

| Plan | Antes | Ahora |
|---|---|---|
| Parque Arví | Precio sin dato ("revisa tarifas") | Rango $10.000–$30.000 por la actividad de senderismo |
| Pueblito Paisa | Zona Guayabal, comuna 15 | **Belén, comuna 16** (OpenStreetMap); la zona de memoria era incorrecta |
| Jardín Botánico | Zona "Centro" | **Aranjuez, comuna 4** (OpenStreetMap y dirección oficial en Calle 73) |
| Jardín Botánico | Descripción con "orquideorama" | Reescrita con lo que dice la fuente |
| Parque Explora | "Museo interactivo de ciencia y tecnología" | "Museo de ciencias con planetario y acuario" |
| Mercado del Río | Descripción genérica | Cifras de la fuente: más de 24 restaurantes, bares, cervecerías y tejo |
| Ciclovía | "Domingos y festivos, mañana" | Horarios por trayecto, con aviso de que el documento es de 2025 |

## Sigue pendiente

| Plan | Qué falta | Por qué |
|---|---|---|
| Museo de Antioquia / Plaza Botero | Precio | Las tarifas se publican como **imagen**; no se pueden leer como texto. La gratuidad de la plaza no figura en la fuente |
| Parque Explora | Precio, dirección | Las tarifas A/B/C aparecen sin explicar a qué corresponden |
| MAMM | Dirección | No aparece en las páginas revisadas |
| Parque Arví | Dirección; si el ingreso general al parque cuesta | La página de "costo de ingreso" no devolvió texto legible |
| Mercado del Río | Precio; horario de los bares | La página lista otro horario hasta la 1:00 a. m. (viernes y sábado) sin decir a qué locales corresponde |
| Comuna 13 | Horario, dirección | La guía oficial no los incluye |
| Ciclovía | Precio | El documento no indica costo; también hay ciclovías barriales con otros horarios |
| Cerro Tres Cruces | Todo | No se encontró fuente oficial (solo AllTrails y redes) |
| Día en Guatapé y Piedra del Peñol | Todo | Las fuentes se contradicen: tarifa de 18.000–20.000 vs 35.000 COP, horario 7:00–18:00 vs 8:00–17:00; ninguna es claramente oficial |
| Parque Lleras y Provenza, La 70 en Laureles | Todo | Son zonas con muchos locales, no un sitio con horario o tarifa propios. No hay fuente oficial que verificar |
| Jardín Botánico | Coordenadas | La dirección oficial no se pudo geocodificar (tres variantes sin resultado) |

## Eventos (22)

No se verificó ninguno en esta fase. Sus fechas y lugares vienen de los listados de medellin.travel, Eventario y La Tiquetera (leídos el 2026-10-29), pero casi ningún listado incluía precio. Para verificarlos hay que leer las páginas de venta (Tuboleta, La Tiquetera), lo que requiere revisar antes sus términos de uso (Fase 6).

## Advertencias

- Los precios y horarios cambian. Cada plan lleva `ultimaVerificacion` y el enlace a su fuente; la interfaz sigue diciendo "Confirma … en la fuente" mientras haya campos pendientes.
- Algunas respuestas se extrajeron con una herramienta que lee la página; las cifras de precios se contrastaron con los fragmentos de búsqueda cuando fue posible (MAMM, Arví, Jardín Botánico, Parque Explora, Museo de Antioquia). Una revisión humana de las cifras antes de lanzar es recomendable.
- Las notas con el detalle de cada comprobación están en `notasInternas` de cada JSON (no se muestran en el sitio).
