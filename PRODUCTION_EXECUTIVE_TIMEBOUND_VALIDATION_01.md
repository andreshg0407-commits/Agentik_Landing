# PRODUCTION-EXECUTIVE-TIMEBOUND-VALIDATION-01

**Sprint:** PRODUCTION-EXECUTIVE-TIMEBOUND-VALIDATION-01
**Fecha:** 2026-06-30
**Modo:** READ ONLY / Forensics + Validation
**TSC Baseline:** 160 (sin cambios)

---

## Veredicto Final

### Los KPIs ejecutivos actuales representan la operacion vigente?

## PARCIALMENTE

---

## Resumen Ejecutivo

La hipotesis se confirma: **los indicadores ejecutivos de Produccion estan contaminados por un defecto de frontera en el filtro temporal**. El filtro de 365 dias se aplica independientemente a OPs (por `documentDate`) y a eventos CN/ET (por `eventDate`). Esto produce timelines huerfanos que inflan artificialmente las metricas de produccion activa, detenida y alertas criticas.

| KPI | Valor mostrado | Valor real | Contaminacion |
|---|---|---|---|
| Produccion activa | 104 | 46 | 56% inflado |
| Produccion detenida | 59 | 6 | 90% inflado |
| Alertas criticas | 56 | 3 | 95% inflado |
| Produccion completada | 584 | 584 | 0% — CONFIABLE |
| Costo material activo | $4.7M | $3.9M | 18% inflado |

**La gerencia recibe senales incorrectas.** 56 alertas criticas suenan como una emergencia. En realidad son 3 problemas reales y 53 fantasmas generados por el filtro.

---

## FASE 1 — Trazabilidad Temporal

### Pipeline completo

```
ProductionExecutiveSnapshot    ← pura proyeccion, no filtra
  ↓ consume
ProductionOperationsSnapshot   ← buildProductionOperationsSnapshot()
  ↓ consume
ProductionTimeline[]           ← loadProductionTimelineSnapshot()
  ↓ construido desde
ProductionEvent[]              ← Prisma queries con sinceDate
```

### Donde se aplica el filtro

El filtro temporal se aplica en `production-timeline-loader.ts`, lineas 111-113 y 144-146:

```
loadProductionEvents():         WHERE eventDate >= sinceDate    → 2,179 eventos
loadProductionOrdersAsEvents(): WHERE documentDate >= sinceDate → 630 OPs
```

**Hallazgo critico:** Los filtros son **independientes**. No hay logica que vincule la ventana temporal entre OPs y eventos.

### Consecuencia

Una OP creada el 25-jun-2025 (un dia antes del corte) tiene:
- Evento OP: **EXCLUIDO** (documentDate < sinceDate)
- Evento ET del 15-jul-2025: **INCLUIDO** (eventDate >= sinceDate)

El timeline resultante tiene solo ET sin OP. Se clasifica como `partial`. `partial` no es `completed` ni `full_flow`, asi que se cuenta como **activa**.

Estas 58 OPs huerfanas son en realidad ordenes completadas (tienen ET) cuyo evento de creacion fue excluido por el corte.

### El filtro NO se aplica despues

- `buildProductionOperationsSnapshot()` no aplica filtro adicional.
- `buildProductionExecutiveSnapshot()` no aplica filtro — es proyeccion pura.
- El problema esta exclusivamente en la carga de datos.

---

## FASE 2 — Distribucion por Ano

### Datos totales en la base de datos

| Ano | OPs | CN | ET | Total eventos |
|---|---|---|---|---|
| 2020 | 81 | 150 | 46 | 196 |
| 2021 | 708 | 1,535 | 727 | 2,262 |
| 2022 | 607 | 1,257 | 661 | 1,918 |
| 2023 | 604 | 1,536 | 659 | 2,195 |
| 2024 | 456 | 1,219 | 513 | 1,732 |
| 2025 | 684 | 1,608 | 751 | 2,359 |
| 2026 | 236 | 585 | 283 | 868 |
| **TOTAL** | **3,376** | **7,890** | **3,640** | **11,530** |

### Datos en la ventana de 365 dias

| Fuente | En ventana | Total | Porcentaje |
|---|---|---|---|
| OPs (por documentDate) | 630 | 3,376 | 19% |
| Eventos CN/ET (por eventDate) | 2,179 | 11,530 | 19% |

### OPs en la ventana por ano

| Ano | OPs |
|---|---|
| 2025 | 394 |
| 2026 | 236 |
| **Total** | **630** |

---

## FASE 3 — Produccion Activa

### Composicion de las 104 OPs activas

| Clasificacion | Cantidad | Ano de creacion | Tipo |
|---|---|---|---|
| materials_consumed | 43 | 2026 | **REAL** — en proceso |
| materials_consumed | 2 | 2025 | **REAL** — antiguas en proceso |
| order_only | 1 | 2025 | **REAL** — sin inicio |
| partial (huerfano) | 49 | 2025 (OP excluida por filtro) | **FALSO** — completada, mal clasificada |
| partial (huerfano) | 9 | sin OP en sistema | **ANOMALO** — eventos sin OP |

### Resumen

| Tipo | Cantidad | Porcentaje |
|---|---|---|
| **Activas reales** | 46 | 44% |
| **Activas falsas** (huerfanos) | 58 | **56%** |

**Conclusion:** Mas de la mitad de la "produccion activa" son ordenes fantasma.

---

## FASE 4 — Produccion Detenida

### 59 ordenes detenidas (>30 dias sin evento)

| Banda de inactividad | Total | Huerfanos | Reales |
|---|---|---|---|
| 31-90 dias | 3 | 0 | 3 |
| 91-180 dias | 0 | 0 | 0 |
| 181-365 dias | 56 | 53 | 3 |
| 365+ dias | 0 | 0 | 0 |

### Detenidas reales (6 ordenes)

| OP | Creada | Ultimo evento | Dias sin mov. | Estado |
|---|---|---|---|---|
| 2862 | 2025-08-21 | 2025-08-21 | 313 | order_only |
| 2847 | 2025-08-14 | 2025-08-22 | 312 | materials_consumed |
| 2872 | 2025-08-26 | 2025-08-28 | 306 | materials_consumed |
| 3283 | 2026-04-10 | 2026-05-05 | 56 | materials_consumed |
| 3337 | 2026-05-13 | 2026-05-21 | 40 | materials_consumed |
| 3338 | 2026-05-14 | 2026-05-29 | 32 | materials_consumed |

Las 3 primeras (2847, 2862, 2872) son de agosto 2025 — genuinamente problematicas. Las 3 ultimas (3283, 3337, 3338) son de 2026 — problemas actuales.

### Detenidas huerfanas (53 ordenes)

Todas son OPs de junio 2025 cuyo documentDate cayo dias antes del corte. Su ultimo evento es de julio 2025 (ET de terminacion). Son ordenes **completadas** que aparecen como detenidas.

### Contaminacion: 90%

Solo 6 de 59 "detenidas" son problemas reales. 53 son fantasmas.

---

## FASE 5 — Alertas Criticas

### 56 alertas criticas (>60 dias sin evento)

| Clasificacion | Cantidad | Porcentaje |
|---|---|---|
| **ACTUAL** (problemas reales) | 3 | 5% |
| **HISTORICA** (huerfanos) | 53 | **95%** |

### Alertas ACTUALES (3)

| OP | Creada | Ultimo evento | Dias | Costo material |
|---|---|---|---|---|
| 2862 | 2025-08-21 | 2025-08-21 | 313 | $0 (sin consumo) |
| 2847 | 2025-08-14 | 2025-08-22 | 312 | $114,351 |
| 2872 | 2025-08-26 | 2025-08-28 | 306 | $41,571 |

Estas 3 ordenes son genuinamente problematicas: produccion iniciada en agosto 2025 y abandonada.

### Alertas HISTORICAS (53)

Todas son OPs de junio 2025 con ET en julio 2025. Produccion completada que el filtro rompio. No representan ningun problema operacional.

### Conclusion

**95% de las alertas criticas son ruido.** La gerencia veria 56 alertas criticas (emergencia) cuando en realidad hay 3 ordenes problematicas.

---

## FASE 6 — Produccion Completada

### 584 completadas — CONFIABLE

| Ano de creacion | Completadas |
|---|---|
| 2025 | 391 |
| 2026 | 193 |

Todas las 584 completadas tienen OP + CN + ET dentro de la ventana. Los datos son confiables porque la ventana contiene el ciclo completo (creacion y terminacion).

**La contaminacion NO afecta a las completadas.** Solo afecta a las activas.

---

## FASE 7 — Bottlenecks

### Distribucion de activas por etapa

| Etapa | Cantidad | % del total |
|---|---|---|
| partial_orphan (sin etapa real) | 58 | **56%** |
| material_consumption | 45 | 43% |
| production_order | 1 | 1% |

### Impacto en bottlenecks

Los cuellos de botella estan **severamente distorsionados**. 56% de las "activas" no tienen etapa real — son fantasmas. El dashboard muestra:

- "56% de produccion activa sin etapa identificada" — falso, son completadas mal clasificadas
- "43% en consumo de materiales" — este dato SI es real
- "0 ordenes en entrada de producto terminado" — correcto, pero la alarma de "0 OPs en ET" es menos urgente si solo hay 46 activas reales

### Comparacion por horizonte

| Horizonte | Activas con evento reciente (90d) | Total activas | Sin evento en 90d |
|---|---|---|---|
| 365 dias | 48 | 104 | 56 |

Los 56 sin evento en 90 dias son casi exactamente los 53 huerfanos + 3 OPs antiguas reales.

---

## FASE 8 — Costos

| Concepto | Valor |
|---|---|
| Costo material activas (total) | $4,730,438 |
| Costo material reales | $3,887,126 |
| Costo material huerfanos | $843,313 |
| **Contaminacion** | **18%** |

La contaminacion de costos es menor que la de activas/detenidas porque la mayoria de huerfanos solo tienen ET (sin CN con costos). Pero $843K COP en costos fantasma sigue siendo material para decision gerencial.

---

## FASE 9 — Data Trust

| KPI | Confianza | Razon |
|---|---|---|
| Produccion activa | **BAJO** | 58/104 son huerfanos (56%) |
| Produccion detenida | **BAJO** | 53/59 son huerfanos (90%) |
| Produccion completada | **ALTO** | 584 OPs con ciclo completo |
| Cuellos de botella | **BAJO** | Huerfanos distorsionan distribucion |
| Costos | **MEDIO** | $843K en huerfanos (18%) |
| Prioridades | **BAJO** | 53/56 alertas son historicas (95%) |

---

## FASE 10 — Horizonte Recomendado

### Analisis por horizonte

| Horizonte | OPs | Eventos | Huerfanos | Contaminacion |
|---|---|---|---|---|
| 90 dias | 113 | 414 | 63 | SI — peor |
| 180 dias | 236 | 868 | 79 | SI — peor |
| 365 dias | 630 | 2,179 | 58 | SI |

**Hallazgo: el problema NO se resuelve cambiando el horizonte.** Cualquier ventana temporal que corte por fecha produce huerfanos en la frontera.

### Solucion correcta

**Filtrar por fecha de OP, incluir TODOS los eventos de esas OPs.**

| Metrica | Valor |
|---|---|
| OPs en 365d | 630 |
| Todos sus eventos | 2,094 |
| Huerfanos | **0** |

En lugar de:
```
WHERE documentDate >= sinceDate    (OPs)
WHERE eventDate >= sinceDate       (eventos)
```

Debe ser:
```
1. Obtener OPs WHERE documentDate >= sinceDate → lista de opNumbers
2. Obtener eventos WHERE productionOrderRef IN (opNumbers) → todos los eventos de esas OPs
```

Esto garantiza que cada timeline tiene su OP y todos sus eventos, sin importar si algunos eventos caen fuera de la ventana.

### Horizonte recomendado: 365 dias (con filtro corregido)

365 dias es apropiado para Castillitos:
- Ciclo productivo promedio: 44 dias (mediana 40)
- OPs de agosto 2025 genuinamente detenidas: necesitan visibilidad
- 630 OPs en la ventana es un volumen manejable

---

## FASE 11 — Clasificacion Operacional

### Propuesta: ACTUAL / HISTORICA / ANOMALA

| Clasificacion | Definicion | Ejemplo |
|---|---|---|
| **ACTUAL** | OP con evento dentro del horizonte operativo | OP 3380: creada jun-2026, CN jun-2026 |
| **HISTORICA** | OP completada cuyos eventos cayeron fuera del ciclo util | OP 2695: creada jun-2025, ET jul-2025, no relevante hoy |
| **ANOMALA** | OP antigua que genuinamente deberia seguir abierta | OP 2847: creada ago-2025, CN ago-2025, sin ET, 312 dias |

### Beneficio

| Pregunta | Respuesta |
|---|---|
| Ayudaria a Produccion? | **SI** — distinguir 46 problemas reales de 58 fantasmas |
| Ayudaria a Gerencia? | **SI** — 3 alertas reales en vez de 56 |
| Reduciria ruido? | **SI** — eliminaria 95% de las alertas criticas falsas |

### Implementacion recomendada

No como nueva dimension en el modelo — sino como **correccion del filtro temporal** en el loader. Si el filtro es correcto, las clasificaciones `full_flow`/`completed`/`materials_consumed`/`order_only` ya son suficientes. Los huerfanos `partial` desaparecen.

---

## FASE 12 — Veredicto

### Los KPIs ejecutivos actuales representan la operacion vigente?

## PARCIALMENTE

### Hallazgos positivos

1. **Produccion completada (584) es 100% confiable.** Ciclos completos con OP+CN+ET. Distribucion temporal correcta (391 de 2025, 193 de 2026).

2. **La arquitectura del pipeline es correcta.** ProductionEvent -> ProductionTimeline -> ProductionStageActivation -> ProductionOperationsSnapshot -> ProductionExecutiveSnapshot funciona como disenado.

3. **La proyeccion ejecutiva es pura y determinista.** `buildProductionExecutiveSnapshot()` no introduce errores — refleja fielmente lo que recibe.

4. **El filtro temporal de 365 dias fue una mejora real.** Sin el, se mostrarian 3,376 OPs desde 2020. Con el, se muestran 688. La intencion es correcta.

5. **Los costos tienen solo 18% de contaminacion** — menor que otros KPIs gracias a que los huerfanos mayormente carecen de CN.

6. **La duracion promedio (44 dias) es confiable** — se calcula solo sobre timelines completos.

### Hallazgos criticos

1. **56% de "produccion activa" son ordenes fantasma.** 58 de 104 activas son timelines huerfanos — ordenes completadas cuyo evento OP fue excluido por el filtro temporal.

2. **90% de "produccion detenida" son fantasmas.** 53 de 59 detenidas son huerfanos. Solo 6 ordenes estan genuinamente detenidas.

3. **95% de alertas criticas son falsas.** 53 de 56 alertas criticas son huerfanos historicos. Solo 3 representan problemas reales (OPs de agosto 2025 abandonadas).

4. **Los cuellos de botella estan severamente distorsionados.** 56% de las activas aparecen como "sin etapa" (partial) — inflando artificialmente la senal de alarma.

5. **La causa raiz es un defecto de diseno en el filtro temporal**, no en los KPIs ni en la proyeccion ejecutiva. Los filtros independientes en el loader crean timelines huerfanos en la frontera de la ventana.

### Riesgos

| Riesgo | Severidad | Impacto |
|---|---|---|
| Gerencia toma decisiones basadas en 56 alertas criticas falsas | **CRITICO** | Accion innecesaria, desconfianza en la herramienta |
| "104 ordenes activas" sugiere carga productiva que no existe | **ALTO** | Planificacion de recursos incorrecta |
| "59 ordenes detenidas" sugiere crisis operacional inexistente | **ALTO** | Alarma innecesaria en direccion |
| Health banner CRITICAL permanente por alertas falsas | **MEDIO** | Desensibilizacion a alertas reales |

### Hechos verificados

- 3,376 OPs totales, 11,530 eventos CN/ET en la base de datos
- 630 OPs con documentDate en los ultimos 365 dias
- 2,179 eventos con eventDate en los ultimos 365 dias
- 58 timelines huerfanos generados por el filtro independiente
- 49 de esos huerfanos son OPs de junio 2025 con ET en julio 2025
- 9 huerfanos son eventos sin OP correspondiente en el sistema
- 0 contaminacion en las 584 completadas

### Inferencias

- La contaminacion empeora con el tiempo: cada dia que pasa, la frontera del filtro avanza y puede capturar mas ET de OPs recien excluidas
- Con un horizonte de 90 dias el problema es PEOR (63 huerfanos) porque la frontera del filtro es mas agresiva
- La solucion no es cambiar el horizonte sino cambiar la estrategia de filtrado

### Recomendaciones

| # | Prioridad | Recomendacion |
|---|---|---|
| 1 | **P0** | Corregir filtro temporal: filtrar por fecha de OP, luego incluir TODOS los eventos de esas OPs |
| 2 | **P0** | Eliminar timelines `partial` de KPIs de "activas" y "detenidas" (mitigacion inmediata) |
| 3 | **P1** | Agregar indicador de huerfanos en data quality strip |
| 4 | **P2** | Considerar clasificacion ACTUAL/HISTORICA/ANOMALA como filtro visual |

### Horizonte recomendado

**365 dias con filtro corregido (OP-first).** El horizonte actual es apropiado para el ciclo productivo de Castillitos. El problema no es el horizonte sino la estrategia de filtrado.

---

## Validacion Tecnica

- `npx tsc --noEmit` — 160 errores (baseline mantenida, 0 nuevos)
- Sprint READ ONLY: ningun archivo de codigo modificado
- Script forense ejecutado y eliminado

---

*Sprint: PRODUCTION-EXECUTIVE-TIMEBOUND-VALIDATION-01*
*Fecha: 2026-06-30*
*Auditor: Claude Opus 4.6*
*TSC Baseline: 160 (confirmado)*
