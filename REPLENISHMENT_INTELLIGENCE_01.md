# REPLENISHMENT-INTELLIGENCE-01

**Sprint:** Replenishment Intelligence
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)
**Date:** 2026-06-27

---

## Vision

Replenishment Intelligence es una capacidad transversal que determina que debe reponerse, desde donde, por que, y cual es la mejor recomendacion operativa. Consume Commercial Availability, Production Flow, LiveVendor, Inventory Locations y Transfers. No ejecuta acciones. Solo produce recomendaciones estructuradas reutilizables por Executive Dashboard, David, Decision Engine, Business Signals y futuras automatizaciones.

---

## Arquitectura

```
lib/replenishment-intelligence/
  replenishment-types.ts      -- NUEVO: domain model completo (Phase 1-2, 9-13)
  replenishment-engine.ts     -- NUEVO: motor principal (Phase 3-8, 10-13)
  replenishment-signals.ts    -- NUEVO: 7 signal types (Phase 9)
  replenishment-loader.ts     -- NUEVO: server-side loader (Phase 11-12)
  index.ts                    -- NUEVO: barrel exports

Dependencias consumidas (no modificadas):
  lib/commercial-intelligence/availability-types.ts
  lib/commercial-intelligence/availability-engine.ts
  lib/commercial-intelligence/report-loader.ts
  lib/commercial-intelligence/maleta-replacement-engine.ts
  lib/production-intelligence/production-flow-types.ts
  lib/production-intelligence/production-flow-loader.ts (dynamic import)
  lib/comercial/vendors/live-vendor-types.ts
  lib/comercial/vendors/live-vendor-loader.ts (dynamic import)
  lib/logistics/inventory-location-types.ts
  lib/business-signals/signal-builder.ts
```

---

## Phase 1: Domain Model

| Tipo | Descripcion |
|------|-------------|
| ReplenishmentSnapshot | Snapshot completo: recommendations[], summary, confidence |
| ReplenishmentRecommendation | Recomendacion individual: target, source, reason, action, reasoning, evidence, impact |
| ReplenishmentTarget | Donde se necesita reposicion: locationCode, locationType, entityId, currentStock, deficit |
| ReplenishmentSource | De donde puede venir: sourceType, locationCode, availableStock, netAvailable |
| ReplenishmentReason | Por que se genera: category, description, ceoRule, threshold |
| ReplenishmentReasoning | Razonamiento explicito: what/why/evidence/recommendation/impact/confidence |
| ReplenishmentEvidence | Evidencia: type, description, source, observedAt |
| ReplenishmentImpact | Impacto: vendorsAffected, storesAffected, isCommerciallyCritical |
| ReplenishmentConfidence | Confianza: score, reason, sourceCount |
| ReplenishmentReplacement | Candidato de reemplazo: referenceCode, subGrupo, existenciaBodega01, reason |
| ReplenishmentProductionContext | Contexto de produccion: hasActiveProduction, stageLabel, estimatedReadiness |
| ReplenishmentTransferContext | Contexto de transferencias: recentInboundCount, daysSinceLastInbound |
| ReplenishmentSummary | Resumen: totales por urgencia, accion, tipo de target |

---

## Phase 2: Targets

5 tipos de target soportados:

| Target | Descripcion | Ejemplo |
|--------|-------------|---------|
| PORTFOLIO | Maleta de vendedor | Bodegas 35-40 |
| STORE | Tienda propia | Bodegas 00, 02, 03, etc. |
| FRANCHISE | Franquicia | Bodegas 08-15 |
| MAIN_WAREHOUSE | Hub principal | Bodega 01 |
| PRODUCTION | Entrada a produccion | Bodega 04 |

---

## Phase 3: Portfolio Replenishment

Para cada vendedor con referencias criticas:

1. Lee portfolio de LiveVendor
2. Cruza con disponibilidad Bodega 01
3. Aplica reglas CEO (LATIN KIDS <= 30, CASTILLITOS <= 20)
4. Genera recomendacion por referencia critica

---

## Phase 4: Portfolio Replacement Intelligence

| Caso | Accion |
|------|--------|
| Agotada + hay reemplazo mismo SubGrupo | replace_reference |
| Agotada + sin reemplazo + sin produccion | suggest_production |
| Agotada + sin reemplazo + con produccion | wait_for_production |
| Critica + hay reemplazo | replace_reference |
| Critica + sin reemplazo | suggest_production |

Maximo 5 candidatos de reemplazo por referencia. Mismo SubGrupo, misma SubLinea, stock > umbral.

---

## Phase 5: Store/Warehouse Replenishment

Detecta referencias agotadas o criticas en Bodega 01 que NO estan cubiertas por recomendaciones de portfolio. Genera recomendaciones a nivel warehouse para decision de produccion o reemplazo.

---

## Phase 6: Production-Aware Replenishment

Integra ProductionFlowSnapshot para evitar duplicar logica:

| Condicion | Accion |
|-----------|--------|
| Agotado + OP activa + recovery soon | wait_for_production (urgency: medium) |
| Agotado + OP activa + delay risk | review_production (urgency: high) |
| Agotado + OP activa + normal | wait_for_production (urgency: high) |
| Agotado + sin OP + con reemplazo | replace_reference (urgency: critical) |
| Agotado + sin OP + sin reemplazo | suggest_production (urgency: critical) |

---

## Phase 7: Transfer-Aware Replenishment

Enriquece recomendaciones con contexto de TM transfers:

- recentInboundCount / recentOutboundCount
- daysSinceLastInbound
- isFrequentlySupplied (>= 3 TM)
- frequencyAssessment (texto)

Objetivo: evitar recomendar reposicion a vendedor que ya fue reabastecido recientemente.

---

## Phase 8: Replenishment Reasoning

Cada recomendacion responde 6 preguntas:

| Pregunta | Campo |
|----------|-------|
| Que ocurrio | whatHappened |
| Por que ocurrio | whyItHappened |
| Que evidencia existe | whatEvidenceExists |
| Que se recomienda | whatRecommendation |
| Que impacto tendria | whatImpact |
| Que confianza tiene | confidenceExplanation |

---

## Phase 9: Business Signals

7 signal types:

| Signal | Condicion | Severity |
|--------|-----------|----------|
| REPLENISHMENT_REQUIRED | Stock critico en target | high/critical |
| PORTFOLIO_REPLACEMENT_REQUIRED | Referencia agotada en maleta | high/critical |
| STORE_REPLENISHMENT_REQUIRED | Tienda con deficit | high |
| WAIT_FOR_PRODUCTION | Produccion activa para agotado | info |
| PRODUCTION_REQUIRED | Agotado sin produccion | high/critical |
| TRANSFER_RECOMMENDED | Transferencia sugerida | medium |
| ALTERNATIVE_REFERENCE_AVAILABLE | Reemplazo disponible | info |

---

## Phase 10: Decision Engine Integration

Cada recomendacion critica/high se convierte en ReplenishmentDecisionInput:

4 tipos de decision:
- replenish_or_wait: Stock critico, produccion activa — esperar o reponer?
- replace_or_produce: Agotado — reemplazar en maleta o producir mas?
- transfer_or_hold: Excedente/deficit — transferir o mantener?
- produce_or_skip: Sin produccion — crear OP o no?

Cada decision incluye opciones con pros/cons.

---

## Phase 11: Executive Intelligence Output

buildReplenishmentExecutiveReport() produce:

- toReplenish: refs para reponer desde bodega
- toRemoveFromPortfolios: refs para retirar de maletas
- withReplacements: refs con alternativas disponibles
- toWaitForProduction: refs con produccion activa
- toProduction: refs que necesitan nueva OP
- storesNeedingReplenishment: tiendas con deficit
- recommendedTransfers: transferencias sugeridas

---

## Phase 12: David Readiness

6 query types:

| Query | Descripcion |
|-------|-------------|
| what_to_replenish_today | Que reponer hoy (urgente) |
| vendor_most_critical | Vendedor con mas refs criticas |
| remove_from_portfolios | Refs que deberian salir de maletas |
| add_to_portfolios | Refs reemplazo que deberian entrar |
| out_of_stock_with_production | Agotados con produccion activa |
| out_of_stock_need_production | Agotados que necesitan OP |

---

## Phase 13: Knowledge Graph Relations

6 tipos de relacion:

- needs_replenishment (InventoryLocation -> ReplenishmentNeed)
- has_recommendation (Product -> ReplenishmentRecommendation)
- affects_vendor (Vendor -> ReplenishmentRecommendation)
- affects_store (Store -> ReplenishmentRecommendation)
- informed_by_production (ProductionFlow -> ReplenishmentDecision)
- informed_by_transfer (Transfer -> ReplenishmentDecision)

---

## Phase 14: Data Quality

| Hallazgo | Estado |
|----------|--------|
| ProductionFlow es optional (dynamic import) | Graceful fallback a null |
| LiveVendor es optional (dynamic import) | Graceful fallback a [] |
| SubLinea/SubGrupo inferidos por heuristicos | Puede fallar para nombres atipicos |
| Umbrales CEO hardcodeados como defaults | Configurables via MaletaReplacementRule[] |
| Store replenishment preparado pero sin datos per-store | Solo warehouse-level hoy |
| Transfer context depende de TM sync activo | Estara vacio si no hay InventoryTransfer |
| No hay datos de velocidad de venta | No se puede predecir agotamiento futuro |
| Franchise replenishment no implementado (solo preparado) | Tipo FRANCHISE definido |

Confidence scoring:
- 95: Disponibilidad + produccion + vendor
- 75: Disponibilidad + produccion
- 65: Disponibilidad + vendor
- 45: Solo disponibilidad
- 30: Solo vendor

---

## Limitaciones Actuales

1. No UI — solo modelo, engine, loaders
2. No ejecuta acciones — todas las recomendaciones suggestedOnly: true
3. No envia alertas — solo genera signal objects
4. No modifica Knowledge Graph — solo prepara relaciones
5. Store replenishment a nivel warehouse (no per-store inventory data yet)
6. Franchise replenishment no implementado
7. No hay demand forecasting — solo estado actual
8. Transfer optimization no implementado (no surplus detection)

---

## Roadmap

| Sprint | Objetivo |
|--------|----------|
| Replenishment UI | Workspace visual con recomendaciones por vendedor/tienda |
| David Integration | David consume answerReplenishmentDavidQuery() |
| Decision Engine Wire | Decision Engine consume buildReplenishmentDecisionInputs() |
| Signal Activation | Activar REPLENISHMENT_* signals en alert center |
| Store Per-Location | Store replenishment con datos per-tienda |
| Franchise Support | Franquicias con reglas diferenciadas |
| Transfer Optimization | Detectar excedentes y sugerir redistribucion |
| Demand Forecasting | Predecir agotamientos futuros |

---

## Archivos Creados

| Archivo | Lineas | Descripcion |
|---------|--------|-------------|
| `lib/replenishment-intelligence/replenishment-types.ts` | ~370 | Domain model: 25+ interfaces, 15+ type aliases |
| `lib/replenishment-intelligence/replenishment-engine.ts` | ~620 | Motor: portfolio, warehouse, production-aware, reasoning, decision, David, KG |
| `lib/replenishment-intelligence/replenishment-signals.ts` | ~165 | 7 signal types |
| `lib/replenishment-intelligence/replenishment-loader.ts` | ~110 | Server-side loader (dynamic imports) |
| `lib/replenishment-intelligence/index.ts` | ~50 | Barrel exports |
| `REPLENISHMENT_INTELLIGENCE_01.md` | ~200 | Documentacion completa |
