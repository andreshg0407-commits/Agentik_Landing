# PRODUCTION-EVENT-MODEL-REVIEW-01 — Architectural Review

**Date:** 2026-06-29
**Sprint:** PRODUCTION-EVENT-MODEL-REVIEW-01
**Type:** Architectural Review + Model Adjustment
**TSC Baseline:** 160 (maintained — zero new errors)

---

## Executive Summary

Audited the `ProductionEvent` model before populating it with real data. Found one **critical issue** (header `referenceCode` was NOT NULL — wrong for multi-line documents) and two **secondary issues** (redundant fields in source model). All fixed.

The model is now ready to receive real SAG documents (CN, ET, T2, Y1, PC, EC) and future ERP data without structural problems.

---

## Phase 1 — Audit Findings

### CRITICAL: referenceCode NOT NULL on header

**Problem**: `referenceCode String` (required) on `ProductionEvent` header.

**Why it's wrong**: In SAG, `MOVIMIENTOS` headers have NO referenceCode — the reference lives only in `MOVIMIENTOS_ITEMS` (lines). A single CN document (fuente 80) can consume materials for 16+ variants across multiple references. Same for ET, T2, Y1.

**Evidence**: `ProductionOrder` (the existing OP model) also has NO referenceCode at the header level. Only `ProductionOrderLine` has referenceCode. The pattern was correct in the existing model but broken in the new one.

**Fix**: Made `referenceCode` nullable (`String?`). When set, it's the primary/first reference from lines. The full detail lives in `ProductionEventLine`.

### SECONDARY: Redundant fields in ProductionEventSource

**Problem 1**: `sourceMovementId: number | null` duplicated `sourceDocumentId: string`. Both represent SAG `ka_nl_movimiento`. Removed `sourceMovementId`.

**Problem 2**: `sourceLineId: number | null` at header level was misplaced. Line IDs belong at the `ProductionEventLine` level (where `sourceLineId` already exists on the Prisma model). Removed from `ProductionEventSource`.

### SECONDARY: description as NOT NULL with default

**Problem**: `description String @default("")` — an empty string is semantically different from "no description". Multi-line documents and status events may genuinely have no description.

**Fix**: Made `description` nullable (`String?`). No default.

---

## Phase 2 — Header vs Lines Decision

### Formal rule

| Field | Lives in | Rationale |
|---|---|---|
| eventType | Header | One event type per document |
| sourceSystem / sourceDocumentType / sourceDocumentId | Header | One source per document |
| productionOrderRef | Header | Document-level reference to parent OP |
| referenceCode | **Header (nullable) + Lines (required)** | Header = primary/first reference or NULL. Lines = actual per-variant reference. |
| description | **Header (nullable) + Lines (nullable)** | Header = document description or NULL. Lines = product description. |
| quantity | **Header (aggregate) + Lines (detail)** | Header = SUM of line quantities. Lines = per-variant quantity. |
| lineCount | Header | Quick hint: how many lines exist |
| size, color | Lines only | Variant-level detail never belongs at header |
| locationFrom, locationTo | Header | Document-level origin/destination |
| stageFrom, stageTo | Header | Document-level stage transition |
| line, subGroup | Header (nullable) | Inferred from primary reference or NULL for multi-ref documents |

### Why NOT rename to primaryReferenceCode / totalQuantity

Evaluated and decided against renaming:
- `referenceCode` as nullable already communicates "optional, primary when present"
- `quantity` as `@default(0)` already communicates "aggregate, zero for status events"
- Renaming would break alignment with `ProductionEventLine.referenceCode` and `ProductionEventLine.quantity`
- The Prisma convention across the codebase uses `referenceCode` consistently (ProductionOrderLine, InventoryTransferLine)

---

## Phase 3 — Multi-Line Validation

| Case | Header referenceCode | Header quantity | Lines | Supported? |
|---|---|---|---|---|
| OP with 16 lines (4 sizes x 4 colors) | First reference from lines or NULL | SUM of line quantities | 16 ProductionEventLine rows | YES |
| CN consuming materials for 3 references | NULL | SUM of all lines | N lines per reference x variant | YES |
| ET with 0 lines (header only — SAG anomaly) | NULL | 0 | Empty | YES |
| Status event (PRODUCTION_DELAY_DETECTED) | NULL or specific reference | 0 | Empty | YES |
| Transfer with single item | Item's reference | Item quantity | 1 line | YES |
| Data warehouse pre-normalized event | Provided by warehouse | Provided | May have 0 or N lines | YES |

---

## Phase 4 — Idempotency Review

### Current unique constraint

```
@@unique([organizationId, sourceSystem, sourceDocumentType, sourceDocumentId])
```

**Assessment: SUFFICIENT for current needs.**

- `sourceDocumentId` = SAG `ka_nl_movimiento` (unique within SAG per fuente)
- `sourceDocumentType` = "CN", "ET", etc. (differentiates fuente sequences)
- Together with `organizationId`, this prevents duplicate ingestion

**Cases considered:**

| Case | Handled? | How? |
|---|---|---|
| Same document synced twice | YES | Unique constraint → upsert |
| Document updated in ERP | YES | Upsert updates existing row |
| Document reissued with new ID | YES | New sourceDocumentId → new event |
| Same doc number across fuentes | YES | sourceDocumentType differentiates |
| Multi-tenant isolation | YES | organizationId in unique key |

**NOT needed now:**
- `sourceRevision` — SAG doesn't version documents. Add when an ERP does.
- `sourceEventKey` — sourceDocumentId is already the key.
- Hash-based dedup — Prisma unique constraint is simpler and sufficient.

### Line idempotency

```
@@unique([productionEventId, sourceLineId])
```

**Assessment: CORRECT.**

- When `sourceLineId` is NOT NULL: prevents duplicate lines per event
- When `sourceLineId` IS NULL: Postgres allows multiple NULLs in unique constraints → lines without source IDs can be freely inserted (expected for data warehouse events)

---

## Phase 5 — Source Model Review

### Fields kept

| Field | Kept? | Reason |
|---|---|---|
| sourceSystem | YES | Essential — which ERP |
| sourceDocumentType | YES | Essential — ERP-native doc code |
| sourceDocumentId | YES | Essential — stable unique ID |
| sourceDocumentNumber | YES | Essential — human-readable number |
| sourceRawCode | YES | Useful — ERP raw code (fuente number for SAG) |
| sourceRawName | YES | Useful — human-readable ERP name |
| sourceTimestamp | YES | Essential — when source created it |
| sourceMetadata | YES | Essential — extensible bag for ERP-specific fields |

### Fields removed

| Field | Removed? | Reason |
|---|---|---|
| sourceMovementId | **REMOVED** | Redundant with sourceDocumentId (both = ka_nl_movimiento) |
| sourceLineId | **REMOVED** | Belongs at ProductionEventLine level, not header source |

### Fields evaluated but NOT added

| Field | Added? | Reason |
|---|---|---|
| sourceTenantCode | NO | organizationId already isolates tenants. sourceMetadata can carry ERP tenant code if needed. |
| sourceCompanyCode | NO | sourceMetadata can carry this. Not all ERPs have multi-company. |
| sourceWarehouseCode | NO | locationFrom/locationTo on the event already capture this universally. |
| sourceUser | NO | sourceMetadata can carry this. Not critical for event processing. |
| sourceCreatedAt / sourceUpdatedAt | NO | sourceTimestamp covers creation. Updates handled by upsert. |

---

## Phase 6 — Stage Model Review

### Fields assessed

| Field | Purpose | Sufficient? |
|---|---|---|
| locationFrom | Origin bodega/warehouse/processor | YES — covers all movement types |
| locationTo | Destination bodega/warehouse | YES — covers all movement types |
| stageFrom | Production stage before event | YES — set from mapping defaults or NULL |
| stageTo | Production stage after event | YES — set from mapping defaults or NULL |

### Cases validated

| Case | locationFrom | locationTo | stageFrom | stageTo |
|---|---|---|---|---|
| Bodega movement (04 → 01) | "04" | "01" | "servicios" | "entrada_producto" |
| Stage change without bodega | NULL | NULL | "orden_produccion" | "consumo_insumos" |
| External send (to confeccionista) | "04" | "CONFECCIONISTA_X" | "consumo_insumos" | "confeccion_externa" |
| Quality check | NULL | NULL | NULL | NULL |
| Finished goods entry | "04" | "01" | "servicios" | "entrada_producto" |
| Status event (delay) | NULL | NULL | NULL | NULL |

**Assessment: SUFFICIENT.** No additional fields needed.

---

## Phase 7 — ProductionOrder Relationship

### Decision: REFERENCE-BASED, NOT FK-BASED

`productionOrderRef String?` — stores OP document number or equivalent.

**Why not a Prisma FK to ProductionOrder?**
1. ProductionEvent is ERP-agnostic. A Siigo tenant won't have ProductionOrder records.
2. CN/ET documents reference OPs via `ka_nl_articulo + ss_talla + ss_color + date range`, NOT by direct FK. There's no `ka_nl_orden_produccion` in SAG MOVIMIENTOS.
3. The cross-reference is inference-based, not structural. A hard FK would force all events to have a matching ProductionOrder.
4. `productionOrderRef` as nullable string allows: OP number, null (no OP), or any ERP-specific reference.

---

## Phase 8 — BusinessEvent Relationship

### Boundary

| Layer | Purpose | Creates? |
|---|---|---|
| ProductionEvent | Domain-specific production lifecycle event | Sync adapters create |
| BusinessEvent | Transversal system event for signals/transitions | ProductionEvent can EMIT |

### Rules
- Not every ProductionEvent is a BusinessEvent (e.g., MATERIAL_CONSUMED is production-internal)
- A ProductionEvent CAN generate a BusinessEvent when it crosses domain boundaries:
  - `PRODUCTION_COMPLETED` → `production_finished_goods_entered` BusinessEvent
  - `PRODUCTION_DELAY_DETECTED` → `production_delayed` BusinessEvent
- The bridge is NOT implemented in this sprint. BusinessEvent types already exist in `lib/business-events/event-types.ts` (lines 73-79).

---

## Phase 9 — Data Warehouse Compatibility

### Two ingestion modes validated

| Mode | Source | referenceCode | sourceDocumentId | sourceLineId | Works? |
|---|---|---|---|---|---|
| Raw ERP source | SAG adapter | From first line or NULL | ka_nl_movimiento | ka_nl_movimiento_item | YES |
| Pre-normalized | Data warehouse | Provided or NULL | Warehouse event ID | Warehouse line ID or NULL | YES |

### Key: sourceSystem differentiates

A data warehouse would use `sourceSystem = "CUSTOM"` (or a dedicated value). The idempotency constraint `[orgId, sourceSystem, sourceDocumentType, sourceDocumentId]` works for both paths because the warehouse provides its own stable IDs.

### Key: nullable referenceCode supports both

- Raw ERP: referenceCode is NULL at header (derived from lines)
- Pre-normalized: referenceCode may be pre-set by the warehouse

---

## Phase 10 — Prisma Changes Applied

| Change | Before | After | Reason |
|---|---|---|---|
| referenceCode | `String` (NOT NULL) | `String?` (nullable) | Multi-line documents have no single reference |
| description | `String @default("")` | `String?` (nullable) | Status events and multi-line docs may have none |
| lineCount | Not present | `Int @default(0)` | Quick hint for consumers |

Migration: `20260712100000_production_event_review`

---

## Phase 11 — Builders Review

### Changes applied

| Builder | Change |
|---|---|
| `BuildProductionEventInput.referenceCode` | `string` → `string \| null` (optional) |
| `BuildProductionEventInput.description` | `string` → `string \| null` (optional) |
| `BuildProductionEventInput.quantity` | `number` → `number` (optional, defaults to 0) |
| `BuildFromSourceInput.referenceCode` | `string` → `string \| null` (optional) |
| `BuildFromSourceInput.description` | `string` → `string \| null` (optional) |
| `BuildFromSourceInput.quantity` | `number` → `number` (optional, defaults to 0) |
| `buildProductionEvent()` | Now computes `lineCount` from `lines.length` |

---

## Phase 12 — Mapping Review

### Castillitos SAG mapping confidence audit

| Mapping | Confidence | Correct? | Notes |
|---|---|---|---|
| OP → PRODUCTION_ORDER_CREATED | confirmed | YES | Synced and validated with 3,376 records |
| CN → MATERIAL_CONSUMED | provisional | YES | Not synced yet, semantics are clear from SAG docs |
| ET → PRODUCTION_COMPLETED | provisional | YES | Not synced, 3,638 headers exist but 0 lines (anomaly) |
| PC → EXTERNAL_SERVICE_STARTED | provisional | YES | 296 movements, clear semantics |
| EC → EXTERNAL_SERVICE_COMPLETED | provisional | YES | 296 movements, clear semantics |
| T1/T2/Y1 → PRODUCTION_MOVED_STAGE | provisional | YES | Services = stage movement |
| MV → PRODUCTION_TRANSFERRED | provisional | YES | Internal transfer |
| PT/CM → provisional | provisional | YES | 0 movements — inactive fuentes |
| AD/CV/M2/SR → provisional | provisional | YES | Supporting fuentes, low priority |

**No changes needed.** All mappings correctly reflect their validation status.

---

## Phase 13 — Utils Review

All 9 utility functions audited:

| Function | SAG-dependent? | Assessment |
|---|---|---|
| isCompletionEvent | NO | Uses universal event type constants |
| isMaterialEvent | NO | Uses universal event type constants |
| isStageMovementEvent | NO | Uses universal event type constants |
| isExternalServiceEvent | NO | Uses universal event type constants |
| isInventoryReceivingEvent | NO | Uses universal event types |
| eventAffectsInventory | NO | Uses universal event type constants |
| eventAffectsProductionStage | NO | Uses universal event types |
| eventConfidenceLabel | NO | Returns Spanish labels (Agentik language) |
| eventConfidenceScore | NO | Pure mapping |

**No changes needed.** All utilities are ERP-agnostic.

---

## Phase 14 — Source Model Changes

### ProductionEventSource (domain type)

**Removed:**
- `sourceMovementId: number | null` — redundant with `sourceDocumentId`
- `sourceLineId: number | null` — belongs at `ProductionEventLine` level

**Kept:** 8 fields (sourceSystem, sourceDocumentType, sourceDocumentId, sourceDocumentNumber, sourceRawCode, sourceRawName, sourceTimestamp, sourceMetadata)

### Impact: NONE

These fields were not persisted in Prisma — they're in-memory domain types. The Prisma model already had sourceRawCode and sourceRawName as separate columns. The `sourceMetadata` bag carries any additional ERP-specific data (warehouse codes, remisionRef, createdBy, isClosed, rawJson).

---

## Risks Avoided

| Risk | How Avoided |
|---|---|
| Multi-line CN/ET crashes sync on NOT NULL referenceCode | Made nullable |
| Status events (DELAY_DETECTED) fail on required description | Made nullable |
| Duplicate sourceMovementId confuses future ERPs | Removed redundant field |
| sourceLineId at header misleads sync builders | Removed from header source |
| Over-engineering with lineCount | Added as `@default(0)` — cheap and useful |

---

## Model Final State (Approved)

### ProductionEvent (Prisma)

| Field | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| id | String | NO | cuid() | PK |
| organizationId | String | NO | — | Tenant boundary |
| eventType | String | NO | — | Universal type |
| sourceSystem | String | NO | — | ERP system |
| sourceDocumentType | String | NO | — | ERP doc code |
| sourceDocumentId | String | NO | — | Stable ERP PK |
| sourceDocumentNumber | String | NO | — | Human doc number |
| sourceRawCode | String | NO | "" | ERP raw code |
| sourceRawName | String | NO | "" | ERP raw name |
| productionOrderRef | String | YES | — | Parent OP reference |
| **referenceCode** | **String** | **YES** | — | **Primary reference (nullable for multi-line)** |
| **description** | **String** | **YES** | — | **Primary description (nullable)** |
| **lineCount** | **Int** | **NO** | **0** | **Number of line items** |
| line | String | YES | — | Commercial line |
| subGroup | String | YES | — | Product sub-group |
| locationFrom | String | YES | — | Origin location |
| locationTo | String | YES | — | Destination location |
| stageFrom | String | YES | — | Stage before event |
| stageTo | String | YES | — | Stage after event |
| quantity | Float | NO | 0 | Total quantity (aggregate) |
| eventDate | DateTime | NO | — | Business date |
| detectedAt | DateTime | NO | now() | Sync date |
| status | String | NO | "active" | Processing status |
| confidence | String | NO | "provisional" | Mapping confidence |
| evidence | Json | NO | {} | Structured evidence |
| metadata | Json | NO | {} | Additional metadata |

### ProductionEventLine (unchanged)

No changes needed. The line model was already correctly designed with:
- Required `referenceCode` (lines always have a reference)
- Nullable `description`, `size`, `color`
- Required `quantity`
- Nullable `sourceLineId` (correct idempotency behavior)

---

## Validation

| Check | Result |
|---|---|
| `npx prisma generate` | OK |
| `npx tsc --noEmit` | 160 errors (baseline maintained) |
| Domain types compile | OK |
| Builders compile | OK |
| Utils compile | OK |
| Migration SQL valid | OK |

---

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | referenceCode nullable, description nullable, added lineCount |
| `lib/production-events/production-event.ts` | referenceCode/description nullable, added lineCount |
| `lib/production-events/production-event-source.ts` | Removed sourceMovementId and sourceLineId |
| `lib/production-events/production-event-builders.ts` | referenceCode/description/quantity optional in inputs, lineCount computed |

## Files Created

| File | Purpose |
|---|---|
| `prisma/migrations/20260712100000_production_event_review/migration.sql` | Schema adjustments |

## TSC Baseline

160 (maintained — zero new errors).
