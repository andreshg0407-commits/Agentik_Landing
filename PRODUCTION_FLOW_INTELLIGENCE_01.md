# PRODUCTION-FLOW-INTELLIGENCE-01

**Sprint:** Production Flow Intelligence
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Vision

Production Flow Intelligence convierte datos de produccion existentes en inteligencia operativa reutilizable. No es una pantalla. Es una capacidad que permite a cualquier modulo (Executive, David, Decision Engine, LiveVendor, Replenishment) responder con evidencia si una referencia agotada debe esperar produccion, revisarse en produccion, mandarse a producir o reemplazarse temporalmente.

---

## Arquitectura

```
lib/production-intelligence/
  production-types.ts                  -- EXISTENTE: tipos SAG production (no modificado)
  production-stage-inference.ts        -- EXISTENTE: inferencia de etapas (no modificado)
  production-engine.ts                 -- EXISTENTE: motor de produccion (no modificado)
  production-signals.ts                -- EXISTENTE: signals originales (no modificado)
  report-loader.ts                     -- EXISTENTE: loader Prisma (no modificado)
  capability-catalog.ts                -- EXISTENTE: catalogo (no modificado)
  index.ts                             -- MODIFICADO: barrel exports extendido

  production-flow-types.ts             -- NUEVO: domain model completo (Phase 1-2, 5-12)
  production-document-mapping.ts       -- NUEVO: document type mapping formal (Phase 2)
  production-flow-engine.ts            -- NUEVO: motor principal (Phase 3-8, 11-12)
  production-flow-signals.ts           -- NUEVO: 6 signal types (Phase 9)
  production-flow-knowledge.ts         -- NUEVO: knowledge graph helpers (Phase 10)
  production-flow-loader.ts            -- NUEVO: server-side loader (Phase 11-12)

Dependencias consumidas (no modificadas):
  lib/commercial-intelligence/availability-types.ts
  lib/commercial-intelligence/availability-engine.ts
  lib/commercial-intelligence/report-loader.ts
  lib/commercial-intelligence/maleta-replacement-engine.ts
  lib/business-signals/signal-builder.ts
  lib/comercial/vendors/live-vendor-loader.ts (dynamic import, optional)
```

---

## Phase 1: Production Flow Domain Model

| Tipo | Descripcion |
|------|-------------|
| ProductionFlowSnapshot | Snapshot completo: referenceFlows[], summary, confidence |
| ProductionReferenceFlow | Flujo por referencia: orders, stage, availability, delay, recovery, recommendation |
| ProductionOrderFlow | Flujo por OP: opNumber, status, daysInProduction, stageInference |
| ProductionStageState | Estado de etapa: hasActiveOP, hasCN, hasET, hasRecentET, productionStatus |
| ProductionFlowStatus | 6 estados: active, completing, completed, stalled, indeterminate, no_production |
| ProductionAvailabilityImpact | Impacto comercial: existencia, pedidos, disponible, isOutOfStock, isCritical |
| ProductionDelayRisk | Riesgo de retraso: level, daysInProduction, isStalled, evidence |
| ProductionRecoverySignal | Senal de recuperacion: recoveryType, estimatedReadiness, expectedQuantity |
| ProductionFlowRecommendation | Recomendacion: action, description, urgency, replacementCandidates, suggestedOnly:true |
| ProductionFlowConfidence | Confianza: score, reason, sourceCount, hasProductionData, hasAvailabilityData |
| ProductionFlowSummary | Resumen: totales, agotados con/sin produccion, delay risk, recovery soon |
| ProductionFlowExecutiveReport | Reporte ejecutivo consumible |
| ProductionFlowDavidAnswer | Respuesta estructurada para David |

---

## Phase 2: Document Type Mapping

8 tipos de documento mapeados:

| DocType | Fuente | Label | Stage Evidence | Movement | Impact |
|---------|--------|-------|----------------|----------|--------|
| OP | 33 | Orden de Produccion | orden_produccion | neutral | creates_order |
| CN | 80 | Consumo de Insumos | consumo_insumos | in | increases_wip |
| PC | 99 | Salida a Confeccionistas | confeccion_externa | external | external_send |
| EC | 100 | Entrada de Confeccionistas | confeccion_externa | external | external_receive |
| T1 | 129 | Servicio T1 | servicios | internal | transforms_wip |
| T2 | 118 | Servicio T2 | servicios | internal | transforms_wip |
| Y1 | 119 | Servicio Y1 | servicios | internal | transforms_wip |
| ET | 116 | Entrada Producto Terminado | entrada_producto | out | decreases_wip |

---

## Phase 3: Stage Inference Improvement

Extiende el motor existente (production-stage-inference.ts) sin modificarlo. ProductionStageState enriquece con:

- hasActiveOP, hasCN, hasExternalProcessing, hasServiceDocuments, hasET, hasRecentET
- productionStatus derivado: active, completing, completed, stalled, indeterminate, no_production
- Etapa reciente ET (< 30 dias) indica "completing"

---

## Phase 4: Production Flow Snapshot

Por cada referencia, responde:

| Campo | Fuente |
|-------|--------|
| referenceCode, description, subGrupo, subLinea | ProductionRow |
| quantityInProduction | Suma de OPs activas |
| quantityRecentlyCompleted | Suma de OPs cerradas |
| quantityInBodega04 | Records con bodega="04" |
| activeOrders / closedOrders | Agrupadas por OP |
| stageState | Inferida de documentos |
| daysInProduction | Desde fecha de activacion OP |
| documentEvidence | Todos los documentos SAG |

---

## Phase 5: Agotados CON Produccion Activa

Detecta referencias con:
- existenciaBodega01 = 0 (o <= umbral CEO)
- OP activa existente

Responde:
- Tiene OP activa? Si
- Tiene ET reciente? (recovery signal)
- Produccion proxima a terminar? (readiness)
- Recomendacion: wait_for_production / review_production

---

## Phase 6: Agotados SIN Produccion Activa

Detecta referencias con:
- existenciaBodega01 = 0 (o <= umbral CEO)
- SIN OP activa
- SIN Bodega 04
- SIN ET reciente

Recomendacion: suggest_production / suggest_replacement

---

## Phase 7: Production Delay Risk

Umbrales configurables (DEFAULT_DELAY_CONFIG):

| Umbral | Dias | Nivel |
|--------|------|-------|
| Medium | 30 | medium |
| High | 45 | high |
| Critical | 90 | critical |
| Stalled | 30 sin movimiento | high+ |
| High WIP | 50+ unidades en B04 sin ET | medium+ |

---

## Phase 8: Replacement + Production Decision Support

6 acciones posibles:

| Action | Condicion |
|--------|-----------|
| wait_for_production | Agotado + OP activa + recovery soon |
| review_production | Agotado + OP activa + delay risk |
| suggest_production | Agotado + sin OP activa |
| suggest_replacement | Agotado + sin OP + hay alternativas SubGrupo |
| monitor | Stock adecuado + produccion en curso |
| no_action_needed | Todo OK |

Todas las recomendaciones tienen suggestedOnly: true.

---

## Phase 9: Business Signals

6 signal types:

| Signal | Condicion | Severity |
|--------|-----------|----------|
| PRODUCTION_IN_PROGRESS | OP activa | info |
| PRODUCTION_DELAY_RISK | Dias > umbral o stalled | high/critical |
| PRODUCTION_RECOVERY_AVAILABLE | Agotado + produccion que puede resolver | info/medium |
| PRODUCTION_MISSING_FOR_OUT_OF_STOCK | Agotado sin OP | high |
| PRODUCTION_STAGE_UNKNOWN | Etapa indeterminada | medium |
| PRODUCTION_READY_SOON | Produccion proxima a completar para ref critica | info |

---

## Phase 10: Knowledge Graph Relations

7 tipos de relacion:

- has_production_order (Product -> ProductionOrder)
- produces_in (ProductionOrder -> InventoryLocation 04)
- delivers_to (ProductionOrder -> InventoryLocation 01)
- evidenced_by (ProductionOrder -> ProductionDocument)
- impacts_availability (ProductionFlow -> CommercialAvailability)
- affects_vendor (ProductionFlow -> LiveVendor)
- produced_by (Product -> ProductionOrder, reverse)

---

## Phase 11: Executive Report Output

`buildProductionFlowExecutiveReport()` produce:

- productionByLine: resumen por SubLinea
- outOfStockWithProduction: agotados con OP activa
- outOfStockWithoutProduction: agotados sin OP
- delayRiskReferences: produccion retrasada
- recoverySoonReferences: proximas a completar

---

## Phase 12: David Readiness

5 query types soportados:

| Query | Descripcion |
|-------|-------------|
| out_of_stock_in_production | Agotados ya en produccion |
| out_of_stock_need_production | Agotados que necesitan OP |
| nearing_completion | Proximas a terminar |
| delayed_production | Produccion retrasada |
| replacement_candidates | Reemplazos disponibles |

Cada respuesta incluye: answer, references[], totalMatches, confidence, caveats.

---

## Phase 13: Data Quality

| Hallazgo | Estado |
|----------|--------|
| ProductionOrder lines tienen inferencia de SubLinea por nombre | Heuristico — puede fallar |
| SubGrupo inferido de descripcion via inferProductType() | Heuristico |
| Bodega 04 qty calculada de records, no de ProductInventoryLevel | Aproximacion |
| LiveVendor data es optional (dynamic import) | Graceful fallback |
| TM transfers no integrados aun en flow snapshot | Preparado pero no conectado |
| ET reciente = 30 dias — umbral arbitrario | Configurable en futuro |
| Sin datos V2 de ProductInventoryLevel para Bodega 04 | Datos limitados |

Confidence scoring:
- 95: ET confirmado
- 85: Multiples documentos + disponibilidad
- 70: Solo documentos de produccion
- 30: Solo disponibilidad sin produccion

---

## Phase 14: Limitaciones Actuales

1. No UI — solo modelo, engine, loaders
2. No ejecuta acciones — solo recomendaciones (suggestedOnly: true)
3. No envia alertas — solo genera signal objects
4. No modifica Knowledge Graph — solo prepara relaciones
5. SubLinea/SubGrupo inferidos por heuristicos (no campo formal en ProductionOrderLine)
6. TM transfers no integrados en el flow snapshot aun
7. Vendor data es optional — si LiveVendor no esta disponible, affectedVendors estara vacio
8. Umbrales de delay son configurables pero defaults son arbitrarios

---

## Roadmap

| Sprint | Objetivo |
|--------|----------|
| Production Flow UI | Workspace visual con produccion por linea, agotados, delays |
| David Integration | David consume answerDavidQuery() para responder preguntas de produccion |
| Signal Activation | Activar PRODUCTION_* signals en alert center |
| TM Transfer Integration | Enriquecer flow con datos de TM transfers |
| Knowledge Graph Write | Escribir relaciones de produccion al Knowledge Graph |
| V2 SubLinea/SubGrupo | Leer SubLinea/SubGrupo formal de ProductionOrderLine cuando exista |

---

## Archivos Creados/Modificados

| Archivo | Lineas | Accion |
|---------|--------|--------|
| `lib/production-intelligence/production-flow-types.ts` | ~340 | CREATED |
| `lib/production-intelligence/production-document-mapping.ts` | ~115 | CREATED |
| `lib/production-intelligence/production-flow-engine.ts` | ~530 | CREATED |
| `lib/production-intelligence/production-flow-signals.ts` | ~165 | CREATED |
| `lib/production-intelligence/production-flow-knowledge.ts` | ~85 | CREATED |
| `lib/production-intelligence/production-flow-loader.ts` | ~100 | CREATED |
| `lib/production-intelligence/index.ts` | ~100 | MODIFIED |
| `PRODUCTION_FLOW_INTELLIGENCE_01.md` | ~200 | CREATED |
