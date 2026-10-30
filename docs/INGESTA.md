# Pipeline de ingesta

La ingesta trae planes nuevos, detecta cambios y cancelaciones y deja todo en un **pull request para que lo revises**. Nunca publica sola.

```
fuentes.json ──► permiso ──► conector ──► candidatos ──► deduplicar ──► nuevo / igual / dudoso
                  │ (solo autorizado)                                        │
                  ▼                                                          ▼
         omitida, con motivo                              planes + cola de revisión + reporte ──► PR
```

## Comandos

```bash
npm run ingesta            # aplica cambios en src/content/planes e ingesta/
npm run ingesta -- --dry   # solo muestra el reporte
npm run cola               # lista la cola de revisión
```

Con `--dry` o sin novedades no se escribe nada, así que el PR diario solo aparece cuando hay algo que revisar.

## Fuentes

Se declaran en `ingesta/fuentes.json` con su `permiso`. Solo `autorizado` y `abierto` se consultan. Estado y razones: `docs/FUENTES.md`.

Conectores disponibles:

- `manual`: lee `ingesta/entrantes/*.json` (uno o varios candidatos por archivo).
- `ics`: descarga un feed iCal (una petición por corrida, con `User-Agent: ParchemosBot`).
- `html`: **no implementado**; requiere autorización de la fuente.

### Formato de un candidato manual

```json
{
  "titulo": "Nombre del evento",
  "inicio": "2026-12-05",
  "fin": "2026-12-06",
  "horaInicio": "19:00",
  "horaFin": "23:00",
  "lugar": "Nombre del sitio",
  "direccion": "Calle 10 # 20-30",
  "url": "https://pagina-oficial.example/evento",
  "precioTexto": "Entrada libre",
  "descripcion": "Frase breve y propia."
}
```

Solo `titulo`, `inicio`, `lugar` y `url` son obligatorios.

## Qué hace con cada candidato

| Caso | Resultado |
|---|---|
| Se parece a un plan existente (puntaje ≥ 0,80) | Se actualiza lo que cambió (fecha, hora, lugar, cancelación) y se anota otra fuente si es distinta |
| Se parece pero no lo suficiente (0,55–0,80) | **Dudoso**: no se toca nada, va a la cola |
| No existe | **Nuevo**, con `verificado: false`; el precio solo se confirma si la fuente lo dijo claro |
| Evento recurrente | A la cola: se carga a mano |
| Datos inválidos | A la cola, con el motivo |
| Un evento de la fuente que ya no aparece | **Desaparecido**: a la cola; nunca se borra solo |
| Ya pasó | Se ignora |

Un plan nuevo se crea con zona «Medellín», «ideal para amigos» y una descripción genérica. La cola indica qué completar (categoría, zona, descripción).

## Cola de revisión

`ingesta/cola-revision.json`. Cada elemento tiene tipo (`nuevo`, `dudoso`, `cambio`, `cancelacion`, `desaparecido`, `invalido`), plan y detalle. **Para resolver uno, edita el plan y borra el elemento de la cola** en el mismo PR.

## Reporte

Cada corrida con novedades escribe `ingesta/reportes/AAAA-MM-DD.md` y lo usa como descripción del PR: nuevos, actualizados, cancelados, desaparecidos, dudosos, sin precio e inválidos.

## Automatización (GitHub Actions)

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `ingesta.yml` | Diario, 6:00 (Bogotá) y manual | Corre la ingesta, valida y abre un PR si hay cambios |
| `reconstruir.yml` | Diario, 5:05 (Bogotá) | Dispara una reconstrucción en Netlify, para que «hoy» y «este fin de semana» estén al día |
| `ci.yml` | En cada PR y push a `main` | Valida datos, tests, tipos y build |

### Configuración única (la haces tú)

1. En GitHub: **Settings → Actions → General → Workflow permissions**: «Read and write permissions» y marca **«Allow GitHub Actions to create and approve pull requests»**. Sin esto `ingesta.yml` no puede abrir el PR.
2. En Netlify: **Site configuration → Build & deploy → Build hooks → Add build hook**. Copia la URL y guárdala en GitHub como secreto `NETLIFY_BUILD_HOOK`. Sin el secreto, `reconstruir.yml` no hace nada.
3. Para probar: **Actions → Ingesta diaria de planes → Run workflow**.

## Límites conocidos

- Hoy solo hay conectores para carga manual e iCal. Ninguna fuente comercial está autorizada.
- La detección de duplicados usa similitud de título, fechas y lugar; puede equivocarse con eventos de nombre parecido (por eso existe la zona «dudoso»).
- No hay conector `html`: se escribirá cuando una fuente autorice y no ofrezca iCal.
