# PRODUCTION-OPERATIONS-AUDIT-01

**Sprint:** PRODUCTION-OPERATIONS-AUDIT-01
**Date:** 2026-06-30
**Mode:** READ ONLY
**TSC Baseline:** 160 (confirmed)

---

## FASE 1 — AUDITORIA DEL SNAPSHOT

### ProductionOperationsSnapshot — Campo por Campo

| Campo | Consumidor real en UI? | Estado |
|---|---|---|
| `orgSlug` | NO — recibido en Props pero NUNCA usado en produccion-client.tsx | MUERTO |
| `computedAt` | NO — nunca renderizado en la UI | MUERTO |
| `kpis` | SI — KPI strip consume los 8 campos | VIVO |
| `orders` | SI — tabla principal, filtros, paginacion | VIVO |
| `alerts` | SI — tab de alertas | VIVO |
| `dataQuality` | SI — banner de calidad + footer de eventos/timelines | VIVO |
| `stageMetrics` | SI — tab de etapas | VIVO |

### ProductionOrderOperationalRow — Campo por Campo

| Campo | Consumido en tabla? | Estado |
|---|---|---|
| `id` | SI — key de React | VIVO |
| `opNumber` | SI — columna OP | VIVO |
| `referenceCode` | SI — columna Referencia + busqueda | VIVO |
| `description` | SI — columna Descripcion + busqueda | VIVO |
| `totalQuantity` | NO — nunca renderizado en tabla ni KPIs | MUERTO |
| `materialCost` | SI — columna Costo mat. + filtro alto_costo | VIVO |
| `classification` | SI — badge Estado + filtros parciales/sin_consumo | VIVO |
| `classificationLabel` | SI — texto del badge Estado | VIVO |
| `quality` | SI — badge Calidad | VIVO |
| `startDate` | NO — nunca renderizado | MUERTO |
| `completionDate` | NO — nunca renderizado | MUERTO |
| `daysElapsed` | SI — columna Dias + filtro detenidas + color condicional | VIVO |
| `cycleDays` | SI — columna Dias (cuando isCompleted) | VIVO |
| `eventCount` | SI — columna Eventos | VIVO |
| `cnCount` | SI — columna Eventos detalle + filtro detenidas | VIVO |
| `etCount` | SI — columna Eventos detalle | VIVO |
| `gapLevel` | NO — nunca renderizado directamente en tabla | PARCIAL (solo via alertas) |
| `stageCompletionPct` | SI — columna Etapas % | VIVO |
| `urgencyScore` | NO — solo para sort, nunca visible al usuario | INFRAESTRUCTURA |
| `currentStage` | NO — nunca renderizado en la tabla actual | MUERTO |
| `currentStageLabel` | NO — nunca renderizado en la tabla actual | MUERTO |
| `currentStageStatus` | NO — nunca renderizado | MUERTO |
| `isCompleted` | SI — filtro completas + opacity + sort | VIVO |

### ProductionDataQualityIndicators — Campo por Campo

| Campo | Consumido? | Estado |
|---|---|---|
| `lastSync` | NO — nunca renderizado | MUERTO |
| `totalEvents` | SI — footer de banner | VIVO |
| `totalOrders` | NO — duplicado con totalTimelines | REDUNDANTE |
| `totalTimelines` | SI — header status + tab etapas + banner footer | VIVO |
| `completeTimelines` | NO — nunca renderizado directamente | MUERTO |
| `partialTimelines` | NO — nunca renderizado directamente | MUERTO |
| `incompleteTimelines` | NO — nunca renderizado directamente | MUERTO |
| `costCoveragePct` | SI — banner footer | VIVO |
| `chronologicalConsistencyPct` | SI — banner footer | VIVO |
| `warnings` | SI — banner principal | VIVO |

### Hallazgos Fase 1

**Campos muertos confirmados: 10**
- `orgSlug` (snapshot) — pasado pero no usado
- `computedAt` (snapshot) — no renderizado
- `totalQuantity` (order row) — la tabla V1 mostraba cantidad, esta no
- `startDate` (order row) — calculado pero invisible
- `completionDate` (order row) — calculado pero invisible
- `currentStage` (order row) — calculado pero invisible
- `currentStageLabel` (order row) — calculado pero invisible
- `currentStageStatus` (order row) — calculado pero invisible
- `lastSync` (data quality) — calculado pero invisible
- `completeTimelines`/`partialTimelines`/`incompleteTimelines` — solo contribuyen a warnings, no visibles

**Campo redundante: 1**
- `totalOrders` === `totalTimelines` (asignado identicamente en service, linea 354-355)

**Metricas duplicadas entre stageMetrics y orders: PARCIAL**
- `classificationDistribution` en stageMetrics duplica lo que se puede derivar contando `orders` por `classification`
- `gapDistribution` en stageMetrics duplica lo que se puede derivar contando `orders` por `gapLevel`

---

## FASE 2 — AUDITORIA DE KPIs

### opActivas

- **Operacionalmente util:** SI — primer numero que un jefe de produccion quiere ver
- **Accionable:** PARCIAL — dice cuantas hay, pero no cuales necesitan atencion
- **Puede inducir a error:** NO
- **Depende de datos incompletos:** SI — timelines INCOMPLETE cuentan como "activos" si no son full_flow/completed
- **Veredicto:** KEEP

### opCompletas

- **Operacionalmente util:** SI — mide output
- **Accionable:** BAJO — es un resultado, no una necesidad de accion
- **Puede inducir a error:** SI — "completed" incluye timelines con OP+ET sin CN (classification "completed"), que puede ser un timeline con datos faltantes, no una orden realmente completada
- **Depende de datos incompletos:** SI — timelines sin CN se clasifican "completed" si tienen ET
- **Veredicto:** IMPROVE — separar full_flow (genuinamente completas) de completed (faltan CN)

### opParciales

- **Operacionalmente util:** SI — "en proceso" es informacion clave
- **Accionable:** SI — son las que activamente necesitan seguimiento
- **Puede inducir a error:** MENOR — el nombre "parciales" es tecnico, "en proceso" es mejor
- **Depende de datos incompletos:** NO — materials_consumed requiere OP+CN
- **Veredicto:** KEEP (con label "En proceso" ya correcto en UI)

### opSinConsumo

- **Operacionalmente util:** SI — identifica OPs potencialmente abandonadas o sin iniciar
- **Accionable:** SI — cada una requiere verificacion
- **Puede inducir a error:** SI — incluye OPs recientes (<7 dias) donde aun es normal no tener CN
- **Depende de datos incompletos:** PARCIAL — order_only incluye OPs nuevas donde CN aun no se sincronizo
- **Veredicto:** IMPROVE — agregar filtro temporal (solo alarmar si >X dias sin consumo)

### opDetenidas

- **Operacionalmente util:** SI — alerta critica
- **Accionable:** SI — requiere accion inmediata
- **Puede inducir a error:** SI — el calculo usa `cnCount === 0 && daysElapsed > 30`, pero esto es identico a opSinConsumo con threshold diferente (30 vs sin limite). Una OP con CN pero sin movimiento en 60 dias NO se detecta como detenida
- **Depende de datos incompletos:** SI
- **Veredicto:** IMPROVE — "detenida" deberia significar "sin ningun evento reciente", no solo "sin CN". Una OP con CN pero sin ET en 90 dias tambien esta detenida. Necesita `lastEventDate` en la row

### costoMaterialTotal

- **Operacionalmente util:** SI — dimension financiera de produccion
- **Accionable:** BAJO — es un acumulado, no dirige accion
- **Puede inducir a error:** SI — es el total historico (todas las timelines, incluidas completadas). No distingue costo de produccion activa vs historico
- **Depende de datos incompletos:** NO — viene de CN lines con cost metadata (99%+ coverage)
- **Veredicto:** IMPROVE — separar costo material activas vs total

### diasPromedioProduccion

- **Operacionalmente util:** SI — benchmark clave
- **Accionable:** BAJO — es un promedio, no dirige accion individual
- **Puede inducir a error:** NO — viene de avgDaysOpToEt (solo COMPLETE timelines)
- **Depende de datos incompletos:** NO — solo usa timelines completas
- **Veredicto:** KEEP

### timelinesCompletosPct

- **Operacionalmente util:** BAJO — es un indicador de calidad de datos, no de produccion
- **Accionable:** NO — un jefe de produccion no puede mejorar la cobertura de datos
- **Puede inducir a error:** SI — "97% visibilidad" suena como "97% de la produccion esta bien"
- **Depende de datos incompletos:** N/A — es meta-dato
- **Veredicto:** REMOVE del KPI strip, mover a seccion de calidad de datos

### Resumen KPIs

| KPI | Veredicto |
|---|---|
| opActivas | KEEP |
| opCompletas | IMPROVE |
| opParciales | KEEP |
| opSinConsumo | IMPROVE |
| opDetenidas | IMPROVE |
| costoMaterialTotal | IMPROVE |
| diasPromedioProduccion | KEEP |
| timelinesCompletosPct | REMOVE (mover a data quality) |

---

## FASE 3 — AUDITORIA DE CLASIFICACIONES

### Mapeo a realidad operacional

| Clasificacion tecnica | Label actual | Realidad operacional | Label propuesto |
|---|---|---|---|
| `full_flow` | "Flujo completo" | OP creada + materiales consumidos + producto terminado ingresado. Ciclo productivo evidenciado completo. | "Completada" |
| `completed` | "Completada" | OP creada + ET sin CN. Posible dato faltante de consumos, o produccion express sin consumo formal. | "Terminada (sin consumos)" |
| `materials_consumed` | "En proceso" | OP creada + materiales consumidos pero sin entrada de PT. Produccion activa. | "En proceso" (correcto) |
| `order_only` | "Solo orden" | OP creada sin ningun otro evento. Puede ser nueva, abandonada, o con sync pendiente. | "Pendiente de iniciar" |
| `partial` | "Parcial" | Eventos sueltos sin OP. Posible error de datos o timeline sin OP sincronizada. | "Datos parciales" |

### Evaluacion

**full_flow vs completed:** La distincion es confusa para un usuario. Si una OP tiene OP+ET, se llama "Completada". Si tiene OP+CN+ET, se llama "Flujo completo". El jefe de produccion no entiende por que hay dos tipos de "terminada". Deberian fusionarse visualmente o al menos usar labels que expliquen la diferencia ("Completada" vs "Completada con consumos registrados").

**order_only:** "Solo orden" es tecnico. "Pendiente de iniciar" es operacional. Pero "pendiente de iniciar" es incorrecto para OPs de 200+ dias — esas estan abandonadas, no pendientes. Se necesita distincion temporal.

**partial:** Es un estado de error de datos, no un estado de produccion. Deberia mostrarse con indicador de calidad, no como clasificacion productiva.

### Veredicto Fase 3

Las clasificaciones representan estados de DATOS, no estados de PRODUCCION. Un jefe de produccion piensa en:
- **No iniciada** (orden sin actividad)
- **En proceso** (materiales consumidos, trabajo en curso)
- **En confeccion externa** (en talleres)
- **Terminada** (producto ingresado a bodega)

Las clasificaciones actuales mezclan dimension de datos (que eventos existen) con dimension operacional (que esta pasando). Esto funciona para analisis tecnico pero no para decision operacional.

---

## FASE 4 — AUDITORIA DE ALERTAS

### op_detenida (cnCount === 0 && daysElapsed > 60)

- **Utilidad real:** ALTA — identifica OPs genuinamente abandonadas
- **Riesgo de ruido:** MEDIO — 60 dias puede generar muchas alertas en un tenant con datos historicos
- **Falsos positivos:** SI — OPs importadas sin ciclo CN (import_reception profile) siempre disparan esta alerta
- **Falsos negativos:** SI — OPs con CN pero sin movimiento en 120 dias NO se detectan
- **Veredicto:** UTIL pero con riesgo de falsos positivos (importaciones)

### op_sin_consumo (order_only && 30 < daysElapsed <= 60)

- **Utilidad real:** MEDIA — ventana estrecha (30-60 dias), despues pasa a op_detenida
- **Riesgo de ruido:** BAJO — ventana corta limita volumen
- **Falsos positivos:** BAJO
- **Falsos negativos:** NO
- **Veredicto:** UTIL

### ciclo_largo (materials_consumed && daysElapsed > 90)

- **Utilidad real:** ALTA — identifica produccion atascada a mitad de flujo
- **Riesgo de ruido:** MEDIO — el promedio en Castillitos es 44 dias, 90 es >2x. Pero datos historicos desde 2020 incluyen muchas OPs antiguas
- **Falsos positivos:** SI — OPs historicas (2020-2024) cerradas operacionalmente pero sin ET en el sistema generan falso positivo
- **Falsos negativos:** NO
- **Veredicto:** UTIL pero ruidosa con datos historicos. Necesita filtro temporal (solo OPs del ultimo ano)

### gap_bloqueado (gapLevel === "BLOCKED")

- **Utilidad real:** BAJA para un jefe de produccion — "brecha en etapas requeridas" es lenguaje de sistema, no operacional
- **Riesgo de ruido:** ALTO — con textile_full profile y solo 3 etapas observables (OP, CN, ET), la mayoria de OPs sin ET son "BLOCKED" (falta finished_goods_entry que es requerida)
- **Falsos positivos:** MUY ALTO — esta alerta es redundante con la clasificacion. Si una OP tiene OP+CN pero no ET, ya es "materials_consumed" y ya tiene alerta "ciclo_largo" si >90d
- **Falsos negativos:** NO
- **Veredicto:** RUIDOSA — eliminar o fusionar con ciclo_largo

### calidad_datos (incompletePct > 20)

- **Utilidad real:** BAJA — informativa pero no accionable por el jefe de produccion
- **Riesgo de ruido:** BAJO — es una sola alerta
- **Falsos positivos:** NO
- **Falsos negativos:** NO
- **Veredicto:** UTIL como info, mover a seccion de calidad de datos

### Resumen Alertas

| Alerta | Veredicto |
|---|---|
| op_detenida | UTIL |
| op_sin_consumo | UTIL |
| ciclo_largo | UTIL (con filtro temporal) |
| gap_bloqueado | RUIDOSA (eliminar o fusionar) |
| calidad_datos | UTIL (reubicar) |

### Alerta faltante critica

**op_antigua tipo definido pero nunca generada.** `ProductionOperationalAlertType` incluye `"op_antigua"` pero `buildAlerts()` nunca la produce. Campo muerto en el tipo.

---

## FASE 5 — AUDITORIA DE TABLA OPERACIONAL

### Escenario: Jefe de produccion, 7 AM, abre Agentik

#### Decisiones que PUEDE tomar con la tabla actual:

1. **Identificar OPs sin actividad** — filtro "Sin consumo" + columna Dias con color rojo
2. **Ver costo material** — columna Costo mat.
3. **Buscar una OP especifica** — busqueda por numero o referencia
4. **Filtrar por estado** — 8 filtros disponibles

#### Informacion que FALTA:

1. **Cantidad ordenada vs cantidad producida** — la tabla V1 tenia `quantityOrdered`, `quantityInBodega01`, `completionPct`. La tabla V2 PERDIO estas columnas. `totalQuantity` existe en los datos pero nunca se renderiza. Un jefe de produccion necesita saber "se pidieron 500 unidades, se han producido 300".

2. **Etapa actual** — `currentStage` y `currentStageLabel` se calculan en el service pero NUNCA se muestran en la tabla. La tabla V1 tenia columna "Etapa" con la etapa actual. Esta se perdio en la migracion a V2.

3. **Fecha de ultimo movimiento** — la tabla V1 tenia `lastMovementDate`. En V2 no existe. Un jefe necesita saber "cuando fue la ultima actividad en esta OP".

4. **Riesgo de retraso** — la tabla V1 tenia una columna "Riesgo" con badge critico/alto/medio/bajo. En V2 se elimino. El equivalente es `urgencyScore` pero es invisible.

5. **Linea de producto / marca** — la tabla V1 tenia `subLinea` (Castillitos/Latin Kids/Importacion) con filtros por marca. En V2 se eliminaron estos filtros. Para un negocio con multiples marcas, esto es critico.

#### Informacion que SOBRA:

1. **Eventos (cnCount, etCount)** — `"3 (2cn 1et)"` es lenguaje tecnico. Un jefe de produccion no piensa en "eventos CN". Piensa en "se hicieron 2 retiros de material".

2. **Calidad (COMPLETO/PARCIAL/LIMITADO)** — es meta-dato del sistema. Un jefe no necesita saber si el timeline tiene "calidad completa". Le importa si la OP esta terminada o no.

3. **Etapas %** — el stageCompletionPct viene del activation engine. Con solo 3 etapas observables (OP, CN, ET de 13 totales en textile_full), el porcentaje es artificialmente bajo para OPs que en realidad estan avanzando bien. 23% de avance puede significar "todo el ciclo productivo ejecutado, solo que no tenemos datos ERP de las etapas intermedias".

#### Ordenamiento

El sort por urgencyScore es correcto en intencion pero tiene un defecto: los scores estan dominados por `daysElapsed`, lo que pone OPs historicas antiguas siempre arriba. Una OP de 2020 con 2000+ dias siempre tendra score maximo. Esto oculta OPs recientes que genuinamente necesitan atencion.

---

## FASE 6 — AUDITORIA DE ETAPAS

### Stages Tab — Evaluacion

#### Aporta valor operacional?
PARCIAL. La distribucion de etapas muestra cuantas OPs tienen evidencia en cada etapa canonica. Pero con solo 3 etapas observables ERP (production_order, material_consumption, finished_goods_entry), la tabla siempre muestra las mismas 3 etapas con numeros altos y todo lo demas vacio. No revela informacion nueva.

#### Aporta valor estrategico?
SI (limitado). Los KPIs de gap distribution y classification distribution son utiles para entender el estado global. "3200 full_flow, 50 materials_consumed, 130 order_only" es un resumen ejecutivo valido.

#### Es comprensible?
PARCIAL. Labels como "Production Order", "Material Consumption", "Finished Goods Entry" vienen de `formatStageLabel()` que hace title-case del code. Resultado: "Production Order" en ingles cuando toda la UI esta en espanol.

`formatStageLabel("finished_goods_entry")` produce "Finished Goods Entry", no "Entrada Producto Terminado". El catalogo tiene labels en espanol (`getStageDefinition(code).label`) pero el client no los usa — usa la funcion naive de title-case.

#### Esta demasiado tecnica?
SI. "Avance promedio 23%" y "Cobertura observable 60%" son metricas del activation engine, no metricas operacionales. El stageCompletionPct de 23% asusta cuando en realidad significa "solo observamos 3 de 13 etapas del ERP".

### Veredicto por componente

| Componente | Veredicto |
|---|---|
| stageDistribution (tabla con barras) | SIMPLIFY — usar labels espanol del catalogo, no title-case de codes |
| classificationDistribution (cards) | KEEP — informacion ejecutiva util |
| gapDistribution (KPIs) | SIMPLIFY — "READY/PARTIAL/BLOCKED" es tecnico, traducir a espanol operacional |
| avgCompletionPct KPI | REPLACE — engana cuando hay pocas etapas observables |
| avgCoverageRatio KPI | REPLACE — dato tecnico, no operacional |

---

## FASE 7 — AUDITORIA DE CALIDAD DE DATOS

### Indicadores evaluados

| Indicador | Ayuda al usuario final? | Debe permanecer visible? | Nivel adecuado |
|---|---|---|---|
| `totalEvents` | NO — "11,530 eventos" no dice nada a un jefe | SECUNDARIO | Admin |
| `totalTimelines` | SI — "3,387 ordenes analizadas" es comprensible | VISIBLE | Todos |
| `costCoveragePct` | NO — "99% cobertura de costos" es meta-dato | SECUNDARIO | Admin |
| `chronologicalConsistencyPct` | NO — "99% consistencia temporal" es irrelevante para operaciones | OCULTO | Solo debug |
| `warnings[]` | DEPENDE — algunas son operacionales, otras son tecnicas | FILTRAR | Separar |

### Recomendacion

El banner de calidad de datos mezcla mensajes operacionales ("Sin timelines de produccion") con mensajes tecnicos ("confeccion_externa not yet synced as stage source"). Deberia separarse en:

- **Nivel usuario:** "3,387 ordenes analizadas. Costo de materiales al 99%."
- **Nivel admin:** Warnings de readiness, blockers de stages, consistency metrics

Actualmente todo se muestra junto en un banner amber. Para un jefe de produccion, ver "confeccion_externa not yet synced as stage source" genera confusion y desconfianza en la herramienta.

---

## FASE 8 — AUDITORIA MULTI-ERP

### Dependencias SAG en el service layer

| Archivo | Linea | Dependencia SAG | Severidad |
|---|---|---|---|
| production-operations-service.ts | 22-23 | `import SAG_PYA_SOURCE_CONFIG, CASTILLITOS_STAGE_CONFIG` | ALTA |
| production-operations-service.ts | 56 | `sourceConfig: SAG_PYA_SOURCE_CONFIG` hardcoded | ALTA |
| production-operations-service.ts | 57 | `stageConfig: CASTILLITOS_STAGE_CONFIG` hardcoded | ALTA |
| production-operations-service.ts | 64 | `profileId: "textile_full"` hardcoded | MEDIA |
| production-operations-service.ts | 388 | `source: "sag_pya_soap"` en loadLastSync | ALTA |

### Dependencias SAG en la UI

| Archivo | Linea | Dependencia SAG | Severidad |
|---|---|---|---|
| produccion-client.tsx | — | NINGUNA | LIMPIA |

### Conclusion

La **UI esta completamente limpia** de SAG. No hay bodegas, fuentes, ni terminologia SAG visible.

El **service esta hardcoded a Castillitos/SAG**. Los imports `SAG_PYA_SOURCE_CONFIG` y `CASTILLITOS_STAGE_CONFIG` son directos, no parametrizados. Para otro tenant con Odoo, el service no funcionaria. Solucion: resolver config desde tenant, no hardcodear.

La funcion `loadLastSync()` busca `source: "sag_pya_soap"` directamente. Deberia ser parametrizable.

El `profileId: "textile_full"` hardcoded asume que todo tenant es textil. Deberia venir del tenant config.

**Nota:** Los presets `SAG_PYA_SOURCE_CONFIG` y `CASTILLITOS_STAGE_CONFIG` en `production-timeline-types.ts` estan bien disenados para multi-ERP. El problema es que el service no los inyecta desde tenant config sino que los hardcodea.

---

## FASE 9 — AUDITORIA PARA EXTRACCION TOTAL

### Dependencias funcionales con Comercial

- **Imports comercial en produccion:** 0 (verificado via grep)
- **Imports produccion en comercial:** 0 (verificado previamente en DOMAIN-EXTRACTION-01)
- **Shared types:** Ninguno
- **Shared services:** Ninguno
- **Veredicto:** LISTO

### Dependencias visuales con Comercial

- **Estilos compartidos:** Solo primitivas del design system (tokens, panel, panelHeader, dataRow)
- **Componentes compartidos:** Solo OperationalWorkspaceHeader (correcto — es un primitivo)
- **Colores/accents:** Produccion usa amber (#b45309), Comercial usa blue (#0369a1)
- **Veredicto:** LISTO

### Dependencias de navegacion

- **Produccion es dominio top-level** en module-nav-config.ts (confirmado DOMAIN-EXTRACTION-01)
- **"produccion" removido de pathKeys de Comercial** (confirmado)
- **Icono propio:** Factory (lucide-react)
- **Veredicto:** LISTO

### Dependencias de datos

- **Prisma models:** ProductionEvent, ProductionEventLine, ProductionOrder, ProductionOrderLine — todos independientes
- **Tablas compartidas:** ConnectorRun (transversal, no Comercial)
- **SAG adapter:** sag-pya-soap es compartido entre produccion y comercial, pero cada modulo tiene su propio sync pipeline
- **Veredicto:** LISTO

### Clasificacion general: **LISTO**

Produccion puede evolucionar 100% independientemente de Comercial. No hay dependencias funcionales, visuales, de navegacion, ni de datos que crucen los dominios.

---

## FASE 10 — GAP OPERACIONAL

**Pregunta: Que le falta a Produccion para ser una herramienta de uso diario?**

### P0 — Criticos (impiden uso diario)

1. **Cantidad ordenada vs producida.** La tabla V2 perdio las columnas de cantidad que la tabla V1 tenia (`quantityOrdered`, `quantityInBodega01`, `completionPct`). Un jefe de produccion necesita saber "pedi 500, van 300". Sin esto, la tabla es informativa pero no accionable. Los datos existen en `totalQuantity` del timeline pero se suman todos los eventos en vez de separar OP vs ET.

2. **Etapa actual visible en la tabla.** `currentStage` y `currentStageLabel` se calculan pero nunca se renderizan. La tabla V1 tenia columna "Etapa". Sin etapa visible, el jefe no puede responder "en que paso esta la OP 3380?".

3. **Filtro temporal por defecto.** La tabla muestra TODAS las OPs desde 2020 (6+ anos). Sin filtro temporal por defecto, las OPs de 2020-2024 dominan la vista y las alertas. Se necesita "ultimo ano" por defecto con opcion de expandir.

### P1 — Importantes (limitan efectividad)

4. **Fecha de ultimo movimiento.** No existe en V2. Un jefe necesita saber "la ultima vez que paso algo en esta OP fue hace 45 dias". Requiere agregar `lastEventDate` derivado de `events[events.length - 1].eventDate` del timeline.

5. **Indicador de riesgo simplificado.** La tabla V1 tenia badge de riesgo (critico/alto/medio/bajo). V2 tiene `urgencyScore` pero es invisible. Transformar en semaforo visual.

6. **Labels de etapas en espanol.** `formatStageLabel()` produce "Finished Goods Entry" en vez de usar `getStageDefinition(code).label` = "Entrada Producto Terminado". Inconsistencia de idioma.

7. **Alerta gap_bloqueado redundante.** Genera ruido sin valor adicional sobre las otras alertas. Eliminar o fusionar.

8. **Filtros por linea de producto.** La tabla V1 tenia filtros Castillitos/Latin Kids/Importacion. Eliminados en V2. Para un negocio multi-marca, son esenciales. Pero necesitan venir del tenant config, no hardcoded.

### P2 — Deseables (mejoran experiencia)

9. **Detalle de OP expandible.** Click en una OP deberia mostrar: timeline cronologico, desglose de materiales consumidos, etapas activadas. Actualmente la tabla es flat sin drill-down.

10. **KPI timelinesCompletosPct fuera del KPI strip.** Es meta-dato del sistema, no KPI operacional. Moverlo al banner de calidad de datos.

11. **Separar costo material activas vs total.** costoMaterialTotal incluye historico. Separar "costo en produccion activa" vs "costo total acumulado".

12. **Dashboard de produccion semanal/mensual.** Tendencia de OPs iniciadas vs completadas por semana. No existe ningun indicador temporal.

---

## FASE 11 — VEREDICTO

### Readiness Score

| Dimension | Score | Razon |
|---|---|---|
| Arquitectura | 9/10 | V2 universal, multi-ERP ready en diseno, limpio de Comercial |
| Tipos / Contratos | 7/10 | 10 campos muertos, 1 redundancia, campos calculados pero no renderizados |
| KPIs | 6/10 | 3 KEEP, 4 IMPROVE, 1 REMOVE. Mezcla metricas operacionales con meta-datos |
| Tabla operacional | 5/10 | Regresion vs V1: perdio cantidad, etapa, riesgo, filtros por marca |
| Alertas | 6/10 | 2 utiles, 1 ruidosa (gap_bloqueado), 1 tipo muerto (op_antigua), falta filtro temporal |
| Etapas | 5/10 | Labels en ingles (bug), metricas tecnicas no operacionales, stageCompletionPct engana |
| Calidad de datos | 6/10 | Mezcla mensajes usuario/admin, warnings tecnicos confunden |
| Multi-ERP | 7/10 | UI limpia, service hardcoded a SAG/Castillitos (3 imports hardcoded) |
| Independencia de Comercial | 10/10 | Cero dependencias, extraccion completa |
| Gap operacional | 4/10 | 3 P0 criticos que impiden uso diario real |

**Score promedio: 6.5/10**

### Veredicto: **APPROVED WITH CHANGES**

### Justificacion

**Lo que esta bien:**
- Arquitectura V2 es excelente. ProductionEvent -> ProductionTimeline -> ProductionStageActivation es un pipeline limpio, ERP-agnostico, bien separado.
- La UI esta 100% limpia de SAG. No hay bodegas, fuentes, ni terminologia ERP visible.
- La extraccion de Comercial esta completa. Cero dependencias cruzadas.
- El urgencyScore como criterio de sort es una buena idea.
- Los filtros V2 (alto_costo, con_alerta) son mas utiles que los filtros V1 por marca hardcoded.
- El data quality banner es una buena practica que otros modulos no tienen.

**Lo que esta mal:**
- La tabla V2 es una **regresion funcional** respecto a V1. Perdio columnas operacionales criticas (cantidad, etapa, riesgo) y gano columnas tecnicas (eventos cn/et, calidad timeline, etapas %).
- La tabla esta optimizada para un **analista de datos**, no para un **jefe de produccion**. Muestra "3 (2cn 1et)" y "COMPLETO" en lugar de "300 de 500 uds" y "Confeccion externa".
- Los campos `currentStage`, `currentStageLabel`, `startDate`, `completionDate` se calculan en el service pero **nunca se renderizan**. Es trabajo desperdiciado que evidencia que la UI se construyo sin consultar los datos disponibles.
- `formatStageLabel()` produce labels en **ingles** en una UI 100% espanol. Bug claro.
- El service esta **hardcoded a Castillitos/SAG** (3 imports directos de SAG_PYA_SOURCE_CONFIG + CASTILLITOS_STAGE_CONFIG + "sag_pya_soap"). La UI es multi-ERP pero el service no.
- Sin filtro temporal por defecto, alertas y urgencyScore estan **dominados por datos historicos** (OPs desde 2020).

**Conclusion:** El modulo esta **arquitectonicamente listo** pero **operacionalmente incompleto**. Es una representacion tecnicamente correcta de los datos universales, pero aun no es la herramienta que un jefe de produccion abriria a las 7 AM. Los P0 (cantidad, etapa visible, filtro temporal) deben resolverse antes de considerarlo operacional.

---

## Recomendaciones priorizadas

| # | Prioridad | Accion |
|---|---|---|
| 1 | P0 | Restaurar columnas cantidad ordenada / producida / % avance en la tabla |
| 2 | P0 | Renderizar currentStageLabel como columna visible en la tabla |
| 3 | P0 | Agregar filtro temporal por defecto ("ultimo ano") en el service |
| 4 | P1 | Agregar lastEventDate a la row y mostrar en tabla |
| 5 | P1 | Convertir urgencyScore en semaforo visible |
| 6 | P1 | Corregir formatStageLabel() para usar catalogo espanol |
| 7 | P1 | Eliminar alerta gap_bloqueado (redundante) |
| 8 | P1 | Parametrizar SAG configs desde tenant en vez de hardcode |
| 9 | P1 | Eliminar tipo op_antigua del tipo union (nunca generado) |
| 10 | P2 | Mover timelinesCompletosPct del KPI strip al banner de calidad |
| 11 | P2 | Agregar drill-down (drawer o expandible) por OP |
| 12 | P2 | Separar costoMaterial activas vs total |
| 13 | P2 | Limpiar campos muertos del snapshot (orgSlug, computedAt sin uso, etc) |
| 14 | P2 | Filtros por linea de producto (via tenant config, no hardcode) |

---

*Auditor: Claude Opus 4.6*
*Fecha: 2026-06-30*
*TSC Baseline: 160 (confirmado)*
