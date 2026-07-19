# PRODUCTION-EVENT-MODEL-01 — Universal Production Event Model

**Date:** 2026-06-29
**Sprint:** PRODUCTION-EVENT-MODEL-01
**Type:** Domain Model + Persistence + Documentation
**TSC Baseline:** 160 (maintained — zero new errors)

---

## Executive Summary

Agentik now has a **universal, ERP-agnostic production event model**. Any ERP system (SAG, Siigo, Alegra, Odoo, SAP, Business Central, custom) can normalize its production documents into `ProductionEvent` + `ProductionEventLine`.

SAG documents (OP, CN, ET, PC, EC, T1, T2, Y1) are **source metadata**, never domain-level identifiers. The domain speaks universal language: `PRODUCTION_ORDER_CREATED`, `MATERIAL_CONSUMED`, `PRODUCTION_COMPLETED`, etc.

**No UI built. No sync connected. No data inserted.** This sprint creates the domain foundation only.

---

## Architecture

```
ERP Source Documents (SAG CN, Siigo Receipt, Odoo MO, ...)
  |
  v
ProductionEventSourceMapping (per-ERP mapping registry)
  |
  v
buildProductionEventFromSource() (builder)
  |
  v
ProductionEvent + ProductionEventLine (universal model)
  |
  v
ProductionFlow / ProductionStage / ProductionControlCenter
  |
  v
Executive Intelligence / David / Business Events
```

### Key Principle

```
SAG Document Source
  -> ProductionEvent (universal)
    -> ProductionFlow
      -> ProductionStage
        -> ProductionControlCenter
          -> Executive Intelligence
```

The domain Production de Agentik **never depends directly on SAG names**.

---

## Difference: SAG Documents vs ProductionEvent

| SAG Document | SAG Code | Universal Event Type | What Agentik Understands |
|---|---|---|---|
| Orden de Produccion | OP (fuente 33) | PRODUCTION_ORDER_CREATED | A production cycle was initiated |
| Consumo de Insumos | CN (fuente 80) | MATERIAL_CONSUMED | Raw materials were consumed for production |
| Entrada Producto Terminado | ET (fuente 116) | PRODUCTION_COMPLETED | Finished goods entered commercial inventory |
| Salida a Confeccionistas | PC (fuente 99) | EXTERNAL_SERVICE_STARTED | Work was sent to an external processor |
| Entrada de Confeccionistas | EC (fuente 100) | EXTERNAL_SERVICE_COMPLETED | Work was received back from processor |
| Gastos Terceros T1 | T1 (fuente 129) | PRODUCTION_MOVED_STAGE | Production progressed through services |
| Gastos Terceros T2 | T2 (fuente 118) | PRODUCTION_MOVED_STAGE | Production progressed through services |
| Causacion Servicios | Y1 (fuente 119) | PRODUCTION_MOVED_STAGE | Production progressed through services |
| Traslado Movimientos PDN | MV (fuente 115) | PRODUCTION_TRANSFERRED | Materials moved internally |

A future Siigo tenant would have different documents, but they normalize to the SAME universal types.

---

## Domain Model

### Files Created

| File | Purpose |
|---|---|
| `lib/production-events/production-event-types.ts` | Universal event types, status, confidence, source systems |
| `lib/production-events/production-event-source.ts` | Source origin metadata (ERP-specific identifiers) |
| `lib/production-events/production-event.ts` | ProductionEvent + ProductionEventLine domain interfaces |
| `lib/production-events/production-event-mapping.ts` | Universal source mapping contract + Castillitos SAG mappings |
| `lib/production-events/production-event-builders.ts` | Factory functions for building events from explicit inputs or source |
| `lib/production-events/production-event-utils.ts` | Classification helpers (isCompletionEvent, isMaterialEvent, etc.) |
| `lib/production-events/index.ts` | Public barrel export |

### Universal Event Types (17)

| Event Type | Category | Description |
|---|---|---|
| PRODUCTION_ORDER_CREATED | Order | Production cycle initiated |
| PRODUCTION_ORDER_UPDATED | Order | Production order modified |
| PRODUCTION_ORDER_CANCELLED | Order | Production order cancelled |
| MATERIAL_RESERVED | Material | Materials set aside for production |
| MATERIAL_CONSUMED | Material | Raw materials consumed |
| PRODUCTION_STARTED | Progress | Production execution began |
| PRODUCTION_MOVED_STAGE | Progress | Production advanced to next stage |
| EXTERNAL_SERVICE_STARTED | External | Work sent to third-party processor |
| EXTERNAL_SERVICE_COMPLETED | External | Work received back from processor |
| PRODUCTION_PARTIALLY_COMPLETED | Completion | Some variants finished |
| PRODUCTION_COMPLETED | Completion | All production finished |
| FINISHED_GOODS_RECEIVED | Completion | Finished goods in commercial bodega |
| QUALITY_CHECK_STARTED | Quality | QC process initiated |
| QUALITY_CHECK_COMPLETED | Quality | QC process passed |
| PRODUCTION_TRANSFERRED | Logistics | Internal material movement |
| PRODUCTION_DELAY_DETECTED | Anomaly | Production behind schedule |
| UNKNOWN_PRODUCTION_EVENT | Catch-all | Unmappable source document |

### Source Mapping Contract

Each ERP adapter provides `ProductionEventSourceMapping[]`:

```typescript
{
  sourceSystem: "SAG",
  sourceDocumentType: "CN",
  eventType: "MATERIAL_CONSUMED",
  confidence: "provisional",
  businessMeaning: "Consumo de insumos y telas...",
  affectsProduction: true,
  affectsInventory: true,
  affectsStage: true,
  defaultStageFrom: "orden_produccion",
  defaultStageTo: "consumo_insumos",
}
```

---

## Castillitos SAG Mapping (Initial)

17 fuentes mapped to universal event types:

| Fuente | Code | Universal Event | Confidence | SAG Movements | Status |
|---|---|---|---|---|---|
| 33 | OP | PRODUCTION_ORDER_CREATED | confirmed | 3,376 | SYNCED |
| 80 | CN | MATERIAL_CONSUMED | provisional | 7,876 | NOT SYNCED |
| 116 | ET | PRODUCTION_COMPLETED | provisional | 3,638 | NOT SYNCED |
| 99 | PC | EXTERNAL_SERVICE_STARTED | provisional | 296 | NOT SYNCED |
| 100 | EC | EXTERNAL_SERVICE_COMPLETED | provisional | 296 | NOT SYNCED |
| 129 | T1 | PRODUCTION_MOVED_STAGE | provisional | 80 | NOT SYNCED |
| 118 | T2 | PRODUCTION_MOVED_STAGE | provisional | 9,596 | NOT SYNCED |
| 119 | Y1 | PRODUCTION_MOVED_STAGE | provisional | 8,521 | NOT SYNCED |
| 115 | MV | PRODUCTION_TRANSFERRED | provisional | 8,320 | NOT SYNCED |
| 81 | PT | FINISHED_GOODS_RECEIVED | provisional | 0 | INACTIVE |
| 114 | 04 | PRODUCTION_STARTED | provisional | 1 | NOT SYNCED |
| 117 | CM | MATERIAL_CONSUMED | provisional | 0 | INACTIVE |
| 126 | AD | UNKNOWN_PRODUCTION_EVENT | provisional | 92 | NOT SYNCED |
| 127 | CV | MATERIAL_CONSUMED | provisional | 411 | NOT SYNCED |
| 133 | M2 | FINISHED_GOODS_RECEIVED | provisional | 83 | NOT SYNCED |
| 140 | SR | UNKNOWN_PRODUCTION_EVENT | provisional | 2 | NOT SYNCED |

Mappings are "provisional" until validated with real synced data. OP is "confirmed" because it's already synced and validated.

---

## Prisma Models

### ProductionEvent

```prisma
model ProductionEvent {
  id                   String   @id @default(cuid())
  organizationId       String
  eventType            String   // Universal type
  sourceSystem         String   // SAG, SIIGO, etc.
  sourceDocumentType   String   // ERP-native code
  sourceDocumentId     String   // Stable ERP PK
  sourceDocumentNumber String   // Human-readable doc number
  sourceRawCode        String   // ERP raw code
  sourceRawName        String   // ERP raw name
  productionOrderRef   String?  // Parent OP reference
  referenceCode        String   // Product SKU
  description          String
  line                 String?  // Commercial line
  subGroup             String?  // Product sub-group
  locationFrom         String?  // Origin bodega
  locationTo           String?  // Destination bodega
  stageFrom            String?  // Stage before
  stageTo              String?  // Stage after
  quantity             Float
  eventDate            DateTime // Business date
  detectedAt           DateTime // Sync date
  status               String   // active|superseded|cancelled|historical
  confidence           String   // confirmed|inferred|provisional|unknown
  evidence             Json
  metadata             Json
  lines                ProductionEventLine[]

  @@unique([organizationId, sourceSystem, sourceDocumentType, sourceDocumentId])
}
```

### ProductionEventLine

```prisma
model ProductionEventLine {
  id                String @id @default(cuid())
  organizationId    String
  productionEventId String
  referenceCode     String
  description       String?
  size              String?
  color             String?
  quantity          Float
  unit              String   @default("unidades")
  sourceLineId      String?  // ERP line item PK
  variantId         String?  // Agentik variant link
  productId         String?  // Agentik product link
  lineMetadata      Json
  evidence          Json

  @@unique([productionEventId, sourceLineId])
}
```

### Idempotency

- **Events:** `organizationId + sourceSystem + sourceDocumentType + sourceDocumentId` — one event per source document per tenant.
- **Lines:** `productionEventId + sourceLineId` — one line per source item per event.

---

## Builders

| Function | Purpose |
|---|---|
| `buildProductionEvent(input)` | Build event from explicit inputs |
| `buildProductionEventLine(input)` | Build line from explicit inputs |
| `buildProductionEventFromSource(input)` | Build event from source + mapping registry — auto-resolves eventType, confidence, stages |
| `mapSourceDocumentToProductionEventType(mappings, system, docType)` | Pure mapping lookup |

---

## Utils

| Function | Returns | Purpose |
|---|---|---|
| `isCompletionEvent(type)` | boolean | Is this PARTIALLY/FULLY completed or GOODS_RECEIVED? |
| `isMaterialEvent(type)` | boolean | Is this RESERVED or CONSUMED? |
| `isStageMovementEvent(type)` | boolean | Does this indicate stage progression? |
| `isExternalServiceEvent(type)` | boolean | Is this external processing? |
| `isInventoryReceivingEvent(type)` | boolean | Does this receive goods into commercial stock? |
| `eventAffectsInventory(type)` | boolean | Does this change inventory levels? |
| `eventAffectsProductionStage(type)` | boolean | Does this change the production stage? |
| `eventConfidenceLabel(conf)` | string | Human-readable confidence label |
| `eventConfidenceScore(conf)` | number | Numeric confidence score (0-100) |

---

## Relation with ProductionOrder

ProductionOrder is NOT eliminated. It represents the OP document specifically.

```
ProductionOrder (OP document — existing, stays)
  |
  v
ProductionEvent[] (any lifecycle event within this OP)
  |
  v
ProductionEventLine[] (variant-level detail per event)
```

A single OP can have many events: OP created, CN consumed, T2 service applied, ET completed.
The `productionOrderRef` field on ProductionEvent links events to their parent OP.

---

## Relation with BusinessEvent Engine

- `ProductionEvent` = domain-specific production lifecycle event
- `BusinessEvent` = transversal system event (signals, transitions)

In the future, a ProductionEvent can trigger a BusinessEvent:
- `PRODUCTION_COMPLETED` -> `production_finished_goods_entered`
- `MATERIAL_CONSUMED` -> `production_stage_entered`

This bridge is NOT implemented in this sprint. The BusinessEvent types already exist in `lib/business-events/event-types.ts` (lines 73-79).

---

## Relation with Future Data Warehouse

The model supports two ingestion modes:

1. **Raw source events** — ERP adapter syncs raw documents, Agentik normalizes via `buildProductionEventFromSource()`
2. **Pre-normalized events** — Data warehouse delivers already-normalized events, Agentik stores directly via `buildProductionEvent()`

Both paths write to the same `ProductionEvent` table. The `sourceSystem` field distinguishes origin.

---

## Migration

- File: `prisma/migrations/20260712000000_production_event_model/migration.sql`
- Tables created: `ProductionEvent`, `ProductionEventLine`
- Relations: FK to Organization (CASCADE)
- Indexes: 7 on ProductionEvent, 4 on ProductionEventLine
- No data inserted

---

## Validation

| Check | Result |
|---|---|
| `npx prisma generate` | OK |
| `npx tsc --noEmit` | 160 errors (baseline maintained, zero new) |
| New domain files compile | OK |
| Prisma schema valid | OK |
| Migration SQL valid | OK |

---

## Roadmap

| Sprint | Name | Scope | Prerequisite |
|---|---|---|---|
| **S2** | PRODUCTION-ET-SYNC-01 | Build ET sync adapter (fuente 116) → ProductionEvent | This sprint |
| **S3** | PRODUCTION-CN-SYNC-01 | Build CN sync adapter (fuente 80) → ProductionEvent | This sprint |
| **S4** | PRODUCTION-STAGE-ACTIVATION-01 | Wire CN+ET data into stage inference via ProductionEvent | S2, S3 |
| **S5** | PRODUCTION-SERVICES-SYNC-01 | Build T2/Y1/T1 sync adapters → ProductionEvent | This sprint |
| **S6** | PRODUCTION-EXTERNAL-SYNC-01 | Build PC/EC sync adapters → ProductionEvent | This sprint |
| **S7** | PRODUCTION-LIFECYCLE-01 | Cross-reference OP→CN→ET via articulo+talla+color | S2, S3 |
| **S8** | PRODUCTION-MODULE-01 | Extract Production from Comercial as standalone module | S4 |

---

## Files Created

| File | Purpose |
|---|---|
| `lib/production-events/production-event-types.ts` | 17 universal event types + status + confidence + source systems |
| `lib/production-events/production-event-source.ts` | ERP origin metadata interface |
| `lib/production-events/production-event.ts` | ProductionEvent + ProductionEventLine domain interfaces |
| `lib/production-events/production-event-mapping.ts` | Source mapping contract + 17 Castillitos SAG mappings |
| `lib/production-events/production-event-builders.ts` | 3 builder functions |
| `lib/production-events/production-event-utils.ts` | 9 classification + confidence helpers |
| `lib/production-events/index.ts` | Public barrel export |
| `prisma/schema.prisma` | ProductionEvent + ProductionEventLine models added |
| `prisma/migrations/20260712000000_production_event_model/migration.sql` | DDL migration |

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added ProductionEvent + ProductionEventLine models; added relation arrays to Organization |

## DB Changes

| Table | Action |
|---|---|
| ProductionEvent | CREATE |
| ProductionEventLine | CREATE |

## TSC Baseline

160 (maintained — zero new errors).
