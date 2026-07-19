# PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01

**Sprint:** PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01
**Date:** 2026-06-30
**TSC Baseline:** 160 (maintained)
**Prerequisite:** PRODUCTION-OPERATIONS-AUDIT-01 (readiness score 6.5/10)

---

## Problemas Corregidos

### P0 — Criticos

#### 1. Columnas operativas restauradas
**Antes:** La tabla V2 perdio las columnas de cantidad que V1 tenia. `totalQuantity` existia pero nunca se renderizaba.
**Ahora:** Columna "Cantidad" muestra `quantityCompleted / quantityOrdered (%)` cuando ambos estan disponibles, solo `quantityCompleted term.` cuando solo hay ET, o em-dash cuando no hay datos.
- `quantityOrdered` — de eventos OP (null si lines no estan cargadas, que es el caso actual con SAG)
- `quantityCompleted` — suma de cantidades de eventos ET
- `completionPct` — derivado, null si quantityOrdered no disponible

**Nota:** OP headers se sintetizan sin lines (performance en Neon free tier), asi que quantityOrdered es null. Cuando se carguen OP lines en el futuro, este campo se poblara automaticamente.

#### 2. Etapa actual visible en la tabla
**Antes:** `currentStage` y `currentStageLabel` se calculaban en el service pero nunca se renderizaban.
**Ahora:** Columna "Etapa actual" muestra la etapa en espanol del catalogo. Labels vienen de `getStageDefinition(code).label` en el service, y de `STAGE_LABELS` map en el client.

#### 3. Filtro temporal por defecto
**Antes:** Todas las OPs desde 2020 (~6 anos) dominaban la vista. OPs historicas inflaban alertas y urgencyScore.
**Ahora:** Default de 365 dias via `resolveProductionOperationsConfig().defaultRangeDays`. El loader ya soportaba `sinceDate` — ahora se usa por defecto.

### P1 — Importantes

#### 4. Stage labels en espanol
**Antes:** `formatStageLabel("finished_goods_entry")` producia "Finished Goods Entry" (title-case de codigo en ingles).
**Ahora:** Service usa `getStageDefinition(code)?.label` del catalogo. Client usa `STAGE_LABELS` map con los 15 nombres canonicos en espanol. `formatStageLabel()` eliminada.

#### 5. Alerta gap_bloqueado eliminada
**Antes:** Generaba ruido — redundante con clasificacion y otras alertas. Con solo 3 etapas ERP observables, la mayoria de OPs sin ET eran "BLOCKED".
**Ahora:** Tipo `gap_bloqueado` removido del union type. `buildAlerts()` ya no lo genera.

#### 6. Tipo op_antigua eliminado
**Antes:** Definido en `ProductionOperationalAlertType` pero nunca generado por `buildAlerts()`.
**Ahora:** Removido del union type. Campo muerto eliminado.

#### 7. Config SAG encapsulada
**Antes:** 3 imports hardcoded en service: `SAG_PYA_SOURCE_CONFIG`, `CASTILLITOS_STAGE_CONFIG`, `"sag_pya_soap"`, `"textile_full"`.
**Ahora:** `resolveProductionOperationsConfig(orgSlug)` devuelve `{ sourceConfig, stageConfig, connectorSource, profileId, defaultRangeDays }`. Service solo importa el resolver. Para Castillitos devuelve la config SAG. Para otros tenants devuelve defaults seguros.

#### 8. Urgency score recency-weighted
**Antes:** Score dominado por `daysElapsed` (total age). OPs de 2020 con 2000+ dias siempre al tope.
**Ahora:** Signal primaria = `daysSinceLastEvent` (inactividad reciente). OP de 2020 con ultimo evento hace 5 dias tiene urgency baja. OP de 2025 con ultimo evento hace 90 dias tiene urgency alta.

#### 9. lastEventDate + daysSinceLastEvent
**Antes:** No existia. No se podia saber "cuando fue la ultima actividad".
**Ahora:** `lastEventDate` = ultimo evento del timeline. `daysSinceLastEvent` = dias desde ese evento. Renderizado en columna "Ult. evento".

### P2 — Limpieza

#### 10. Campos muertos eliminados del snapshot
- `orgSlug` — removido de `ProductionOperationsSnapshot` (ya se pasa como prop separado)
- `totalOrders` — removido de `ProductionDataQualityIndicators` (era identico a `totalTimelines`)
- `completeTimelines` / `partialTimelines` / `incompleteTimelines` — removidos (nunca renderizados)

#### 11. Campos muertos del order row
- `totalQuantity` — reemplazado por `quantityOrdered` + `quantityCompleted` + `completionPct`

#### 12. KPI Visibilidad removido
- `timelinesCompletosPct` — removido del KPI strip (era meta-dato, no KPI operacional)
- `costoMaterialActivas` — agregado (costo de OPs activas, mas accionable que total historico)

#### 13. Data quality mejorado
- Ahora muestra: Ordenes, Ult. OP, Ult. consumo, Ult. entrada PT, Costos %, Sync
- Strip compacto en lugar de banner grande con warnings tecnicos
- Last event dates per type (OP/CN/ET) dan contexto temporal al jefe

#### 14. Classification labels operacionales
- `full_flow` → "Completada" (era "Flujo completo")
- `completed` → "Terminada" (era "Completada")
- `order_only` → "Pendiente" (era "Solo orden")
- `partial` → "Datos parciales" (era "Parcial")

---

## Columnas de la tabla (nuevo)

| Columna | Campo | Descripcion |
|---|---|---|
| OP | opNumber | Numero de orden de produccion |
| Referencia | referenceCode | Codigo de referencia del producto |
| Descripcion | description | Descripcion del primer evento |
| Cantidad | quantityCompleted / quantityOrdered | Cantidad terminada vs ordenada |
| Costo mat. | materialCost | Costo de materiales consumidos |
| Etapa actual | currentStageLabel | Ultima etapa con evidencia (espanol) |
| Dias | daysElapsed o cycleDays | Dias desde inicio (activas) o ciclo total (completas) |
| Ult. evento | daysSinceLastEvent | Dias desde ultimo evento de cualquier tipo |
| Estado | classification | Badge de estado operacional |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/production/production-operations-config.ts` | NUEVO — Config resolver tenant-aware |
| `lib/production/production-operations-types.ts` | Campos muertos eliminados, nuevos campos agregados |
| `lib/production/production-operations-service.ts` | Config via resolver, filtro temporal, quantities, urgency v2 |
| `app/(app)/[orgSlug]/produccion/produccion-client.tsx` | Tabla con columnas operativas, stage labels espanol, data quality strip |

---

## Validacion

- `npx tsc --noEmit` — 160 errores (baseline mantenida, 0 nuevos)
- Ningun cambio en: ProductionEvent, ProductionTimeline, ProductionStageDomain, Prisma, SAG adapters

---

## Riesgos restantes

| Riesgo | Mitigacion |
|---|---|
| `quantityOrdered` es null (OP lines no cargadas por performance) | Cuando se carguen OP lines, el campo se poblara automaticamente |
| Filtro 365 dias excluye OPs antiguas que podrian estar genuinamente activas | Opcion `sinceDate: null` disponible para all-time |
| `STAGE_LABELS` en client es copia estatica del catalogo | Aceptable — catalogo es estable (15 stages canonicos) |
| Solo 3 etapas ERP observables — columna "Etapa actual" limitada | Mejora con futuros syncs de confeccion_externa, servicios |

---

## Readiness Score Actualizado

| Dimension | Antes | Ahora | Razon |
|---|---|---|---|
| Arquitectura | 9/10 | 9/10 | Sin cambios |
| Tipos / Contratos | 7/10 | 9/10 | Campos muertos eliminados, nuevos campos utiles |
| KPIs | 6/10 | 8/10 | Removido meta-dato, agregado costo activas |
| Tabla operacional | 5/10 | 8/10 | Cantidad, etapa, ultimo evento, labels operacionales |
| Alertas | 6/10 | 8/10 | Removido ruido, basadas en inactividad real |
| Etapas | 5/10 | 7/10 | Labels espanol, removido metricas enganosas |
| Calidad de datos | 6/10 | 8/10 | Strip compacto con fechas por tipo, sin warnings tecnicos |
| Multi-ERP | 7/10 | 9/10 | Config resolver encapsulado |
| Independencia | 10/10 | 10/10 | Sin cambios |
| Gap operacional | 4/10 | 7/10 | 3 P0 resueltos, lastEvent agregado |

**Score promedio: 8.3/10** (antes 6.5/10)

---

*Sprint: PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01*
*Fecha: 2026-06-30*
*TSC Baseline: 160 (confirmado)*
