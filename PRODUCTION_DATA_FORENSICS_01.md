# PRODUCTION-DATA-FORENSICS-01 — Forensic Report

**Date:** 2026-06-29
**Sprint:** PRODUCTION-DATA-FORENSICS-01
**TSC Baseline:** 160 (maintained)

---

## Executive Summary

Production Control Center showed 0 OPs because the `report-loader.ts` query timed out
loading 3,352 open ProductionOrders with 56K+ lines via `include: { lines: true }`.
The bare `catch` block silently returned empty records, masking the timeout error.

**Root cause:** Query timeout (Neon 30s `query_timeout`), NOT missing data.
**Fix:** Split into two separate queries (orders + lines). Duration: ~6s (vs 30s+ timeout).

---

## Phase 2 — Production Model Map

| Model / Type | In Schema | In DB | Records | Latest Date | Source | Consumer |
|---|---|---|---|---|---|---|
| ProductionOrder | YES | YES | 3,376 | 2026-06-23 | SAG fuente 33 via `_production-sync-01a.ts` | report-loader.ts |
| ProductionOrderLine | YES | YES | 56,586 | 2026-06-23 | SAG MOVIMIENTOS_ITEMS via sync script | report-loader.ts |
| SagProductionRecord | Type only | N/A | N/A | N/A | Mapped from ProductionOrder+Line | production-engine.ts |
| ProductionFlowSnapshot | Type only | N/A | N/A | N/A | Built in memory | production-flow-engine.ts |
| ProductionControlSnapshot | Type only | N/A | N/A | N/A | Built in memory | production-control-service.ts |

There is ONE production model: `ProductionOrder` + `ProductionOrderLine`.
`SagProductionRecord` is an in-memory mapped type, not a DB table.

---

## Phase 3 — Real DB Counts

| Metric | Value |
|---|---|
| ProductionOrder total | 3,376 |
| ProductionOrder open (isClosed=false) | 3,352 (99.3%) |
| ProductionOrder closed (isClosed=true) | 24 (0.7%) |
| ProductionOrderLine total | 56,586 |
| Earliest OP date | 2020-11-02 (OP #10) |
| Latest OP date | 2026-06-23 (OP #3378) |
| Latest createdAt (sync date) | 2026-06-25 |
| Organization | castillitos (cmmpwstuf000dp5y58kj1daaj) |
| All orders in one org | YES — 100% castillitos |

---

## Phase 4 — Origin of 3,376 Figure

The figure comes from `scripts/_production-sync-01a.ts`, which ran on 2026-06-25.

**Query:** `syncProductionOrders()` in `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts`
**Table:** `ProductionOrder` (Prisma model)
**Field:** `COUNT(*)` of all synced production orders
**Status:** Real data, correctly synced, verified against DB.

Referenced in: PRODUCTION_SYNC_01A.md, CASTILLITOS_DATA_FRESHNESS_FORENSICS_01.md,
CASTILLITOS_DATA_TRUST_AUDIT_01.md, PRODUCTION_FORENSICS_REPORT.md, and 8 other documents.

---

## Phase 5 — Production Control Center Lineage

```
/castillitos/produccion (page.tsx)
  └── buildProductionControlSnapshot() [production-control-service.ts]
        └── loadProductionFlowSnapshot() [production-flow-loader.ts]
              ├── loadProductionRecords() [report-loader.ts]     ← TIMEOUT HERE
              │     └── db.productionOrder.findMany({ include: { lines: true } })
              │           └── 3,352 orders × ~17 lines each = 56K+ rows
              │           └── Neon query_timeout: 30,000ms
              │           └── catch {} → returns { records: [] }   ← SILENT FAILURE
              └── loadAvailabilityRecords() [commercial-intelligence/report-loader.ts]
```

**Why zero:** The `findMany({ include: { lines: true } })` query exceeds 30s for 3,352 orders
with 56K lines. The bare `catch` block returns empty records. All downstream engines
(production-engine, production-flow-engine, production-control-service) correctly process
zero records → zero KPIs.

---

## Phase 6 — Production Intelligence Lineage

Same loader: `loadProductionRecords()` in `report-loader.ts`.
Same timeout. Same silent failure.

Every consumer of Production Intelligence (executive reports, David queries, business signals,
knowledge graph) also gets zero data for the same reason.

---

## Phase 7 — Source Comparison

| Source | Records | OP activas | Unidades | Ultima fecha | Consumidor | Confiabilidad |
|---|---|---|---|---|---|---|
| ProductionOrder (DB) | 3,376 | 3,352 | 1,386,210+ | 2026-06-23 | report-loader.ts | HIGH (real SAG data) |
| SagProductionRecord (mapped) | 0* | 0* | 0* | N/A | production-engine.ts | N/A (timeout) |

*Zero due to query timeout, not missing data.

**Official source:** ProductionOrder + ProductionOrderLine. There is only one source.

---

## Phase 8 — Field Validation (ProductionOrder)

| Field | Available | Source |
|---|---|---|
| OP Number | YES — `documentNumber` | SAG `ka_nl_numero_documento` |
| Reference | YES — `ProductionOrderLine.referenceCode` | SAG MOVIMIENTOS_ITEMS |
| Description | YES — `ProductionOrderLine.productName` | SAG MOVIMIENTOS_ITEMS |
| Quantity OP | YES — `ProductionOrderLine.quantityOrdered` | SAG MOVIMIENTOS_ITEMS |
| Activation date | YES — `documentDate` | SAG `sd_fecha_documento` |
| Status (closed) | YES — `isClosed` | SAG `sc_dcto_cerrado` |
| Warehouse code | NULL on 100% | SAG `ka_nl_bodega` (always NULL for OP fuente 33) |
| Last movement | NOT AVAILABLE | Would need cross-reference with other fuentes |
| SubLinea | INFERRED | From reference code prefix (L-=LATIN KIDS, C-=CASTILLITOS) |
| SubGrupo | INFERRED | From product name via `inferProductType()` |

---

## Phase 9 — Stage Inference Validation

Current stage inference uses SAG document types (OP, CN, PC, EC, T1, T2, Y1, ET).
Only fuente 33 (OP) is currently synced. Other fuentes are NOT in ProductionOrder table.

| Stage | Doc Type | Fuente | Synced | Inference possible |
|---|---|---|---|---|
| Orden de Produccion | OP | 33 | YES | YES — all 3,352 open OPs |
| Consumo de Insumos | CN | 80 | NO | NO |
| Confeccion Externa | PC/EC | 99/100 | NO | NO |
| Servicios (T1/T2/Y1) | T1/T2/Y1 | 129/118/119 | NO | NO |
| Entrada Producto | ET | 116 | NO | NO |

**Result:** All OPs will be inferred as stage "Orden de Produccion" (stage 1 of 5)
because no CN/PC/EC/T1/T2/ET documents exist in the synced data.

---

## Phase 10 — Root Cause Classification

**Primary: A + E (Query timeout masked by silent catch)**

- A. Table ProductionOrder NOT empty — has 3,376 records.
- B. Loader connected to CORRECT table (ProductionOrder).
- C. No other production table exists.
- D. Production data IS synced (Jun 25 via standalone script).
- **E. Query times out loading 3,352 orders with 56K lines in a single include query.**
- F. No field misinterpretation.
- G. Model is correctly migrated and populated.
- H. Data IS available.

**Secondary: Silent error handling**

The bare `catch {}` in report-loader.ts silently returns empty records for ANY error,
including query timeouts. This masks the real problem.

---

## Phase 11 — Minimal Fix Applied

**Fix:** Split `findMany({ include: { lines: true } })` into two separate queries:
1. Load orders without lines (select only needed fields) — ~300ms
2. Load all lines with `{ in: orderIds }` — ~4.7s
3. Index lines by `productionOrderId` in a Map for O(1) lookup

**Performance:**
- Before: >30s (timeout) → catch → empty records
- After: ~6s → 3,352 orders, 56,294 records built successfully

**Additional fix:** Changed bare `catch {}` to `catch (err)` with `console.error` to
surface future errors instead of silently swallowing them.

**File changed:** `lib/production-intelligence/report-loader.ts`

---

## Phase 12 — Summary

| Question | Answer |
|---|---|
| Why does Production Control Center show 0 OPs? | Query timeout loading 56K lines via include |
| Where did the 3,376 figure come from? | ProductionOrder table, synced by `_production-sync-01a.ts` |
| What is the real production data source? | ProductionOrder + ProductionOrderLine (only source) |
| What correction was applied? | Split into two queries (orders + lines separately) |
| Is stage inference complete? | No — only OP (fuente 33) is synced. Other stages require CN/PC/EC/T1/T2/ET syncs. |
| TSC baseline? | 160 (maintained) |

---

## Files Changed

| File | Change |
|---|---|
| `lib/production-intelligence/report-loader.ts` | Split include query into two separate queries; added error logging to catch block |

## DB Changes

None.
