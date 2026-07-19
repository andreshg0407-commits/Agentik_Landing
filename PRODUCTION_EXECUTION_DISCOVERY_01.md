# PRODUCTION-EXECUTION-DISCOVERY-01 — Execution Discovery Report

**Date:** 2026-06-29
**Sprint:** PRODUCTION-EXECUTION-DISCOVERY-01
**Type:** Discovery / Archaeology — READ ONLY
**TSC Baseline:** 160 (maintained — no code changes)
**Prerequisites:** PRODUCTION_DATA_FORENSICS_01.md, PRODUCTION_STAGE_MAPPING_01.md

---

## Executive Summary

SAG PYA does NOT use dedicated production tables. All production events live in `MOVIMIENTOS` + `MOVIMIENTOS_ITEMS`, differentiated by `ka_ni_fuente`. The full production lifecycle is **17 document types** across 42,588 total movements and 310,171 lines in SAG.

Agentik currently syncs **only 1 of 17** production fuentes (OP, fuente 33). The remaining 16 fuentes — including CN (material consumption), ET (finished goods entry), PC/EC (external manufacturing), T1/T2/Y1 (services), and MV (internal transfers) — exist in SAG with real data but have **no sync adapter, no Prisma model, and no API route**.

The infrastructure pattern is proven: `sag-production-sync.ts` already queries `MOVIMIENTOS WHERE ka_ni_fuente = 33` and writes to `ProductionOrder/Line`. The same pattern can be replicated for each missing fuente — the SAG query structure is identical, only the `ka_ni_fuente` value changes.

---

## Phase 1 — Source Archaeology

### Fuentes with code references

| Fuente | ka_ni | Code | Name | Code Files | Sync Status |
|---|---|---|---|---|---|
| 33 | OP | Orden de Produccion | `sag-production-sync.ts`, `sag-production-normalizer.ts`, `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **SYNCED** — 3,376 records in DB |
| 34 | TR | Traslado entre Bodegas | `sag-transfer-sync.ts`, `sag-transfer-normalizer.ts` | **SYNCED** — 2,973 headers, 0 lines |
| 80 | CN | Consumos Insumos y Telas | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only, no adapter |
| 81 | PT | Entrada PT | `castillitos-fuentes.ts` | **NOT SYNCED** — 0 movements in SAG |
| 99 | PC | Salida Confeccionistas | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 100 | EC | Entrada Confeccionistas | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 114 | 04 | Producto en Proceso | `castillitos-fuentes.ts` | **NOT SYNCED** |
| 115 | MV | Traslado Movimientos PDN | `castillitos-fuentes.ts` | **NOT SYNCED** — 8,320 headers, 0 lines in SAG |
| 116 | ET | Entrada Producto Terminado | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 117 | CM | Consumo de Muestras | `castillitos-fuentes.ts` | **NOT SYNCED** — 0 movements in SAG |
| 118 | T2 | Gastos de Terceros | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 119 | Y1 | Causacion de Servicios T | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 126 | AD | Adiciones y Faltantes | `castillitos-fuentes.ts` | **NOT SYNCED** |
| 127 | CV | Consumos Muestras y Varios | `castillitos-fuentes.ts` | **NOT SYNCED** |
| 129 | T1 | Gastos Terceros | `castillitos-fuentes.ts`, `production-document-mapping.ts`, `production-stage-inference.ts` | **NOT SYNCED** — type defined only |
| 133 | M2 | Entrada de Muestras | `castillitos-fuentes.ts` | **NOT SYNCED** |
| 140 | SR | Saldo Inicial Retazos | `castillitos-fuentes.ts` | **NOT SYNCED** |
| 206 | TM | Traslado de Maletas | `sag-transfer-sync.ts`, `sag-transfer-normalizer.ts` | **SYNCED** — 148 headers, 0 lines |

### Table destinations

| Sync Target | Prisma Model | Headers | Lines | Status |
|---|---|---|---|---|
| ProductionOrder | ProductionOrder | 3,376 | — | OP only |
| ProductionOrderLine | ProductionOrderLine | — | 56,586 | OP only |
| InventoryTransfer | InventoryTransfer | 3,121 | — | TR + TM only |
| InventoryTransferLine | InventoryTransferLine | — | **0** | Never synced |
| *CN/ET/PC/EC/T1/T2/Y1* | *None* | *0* | *0* | **No model exists** |

---

## Phase 2 — SAG Production Document Catalog

### Complete production document lifecycle (from PRODUCTION_FORENSICS_REPORT.md)

| # | Document | Fuente | SAG Movements | SAG Lines | Creates OP? | Consumes OP? | Indicates Progress? | Indicates Completion? | Affects Bodega? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | OP — Orden de Produccion | 33 | 3,376 | 56,586 | **YES** | — | — | — | Creates WIP in B04 |
| 2 | CN — Consumo Insumos y Telas | 80 | 7,876 | 81,174 | — | YES (consumes materials) | **YES** — confirms production started | — | Decreases raw materials |
| 3 | PC — Salida Confeccionistas | 99 | 296 | 296 | — | YES (sends to external) | **YES** — materials sent out | — | External send |
| 4 | EC — Entrada Confeccionistas | 100 | 296 | 5,318 | — | YES (receives from external) | **YES** — materials returned | — | External receive |
| 5 | T1 — Gastos Terceros | 129 | 80 | 81 | — | YES (service cost) | **YES** — services applied | — | Transforms WIP |
| 6 | T2 — Gastos de Terceros | 118 | 9,596 | 9,702 | — | YES (service cost) | **YES** — services applied | — | Transforms WIP |
| 7 | Y1 — Causacion de Servicios T | 119 | 8,521 | 137,446 | — | YES (service causation) | **YES** — services registered | — | Transforms WIP |
| 8 | MV — Traslado Movimientos PDN | 115 | 8,320 | 0* | — | YES (internal transfer) | **YES** — internal movement | — | Internal transfer |
| 9 | ET — Entrada Producto Terminado | 116 | 3,638 | 0** | — | YES (closes production) | — | **YES** — production complete | B04 → B01 |
| 10 | 04 — Producto en Proceso | 114 | 1 | 248 | — | — | — | — | Tracks WIP |
| 11 | AD — Adiciones y Faltantes | 126 | 92 | 809 | — | — | — | — | Adjustments |
| 12 | CV — Consumos Muestras y Varios | 127 | 411 | 15,489 | — | — | — | — | Sample consumption |
| 13 | M2 — Entrada de Muestras | 133 | 83 | 2,916 | — | — | — | — | Sample receipt |
| 14 | SR — Saldo Inicial Retazos | 140 | 2 | 106 | — | — | — | — | Initial balance |
| 15 | PT — Entrada PT | 81 | 0 | 0 | — | — | — | — | Inactive |
| 16 | CM — Consumo de Muestras | 117 | 0 | 0 | — | — | — | — | Inactive |

*\* MV (115) has 8,320 headers but 0 lines returned — may use a different JOIN relationship*
*\*\* ET (116) has 3,638 headers but 0 lines returned — same issue, may need investigation*

### Volume summary

| Category | Movements | Lines |
|---|---|---|
| Total production (all 16 fuentes) | 42,588 | 310,171 |
| Currently synced (OP only) | 3,376 | 56,586 |
| **Missing from sync** | **39,212** | **253,585** |
| Coverage | 7.9% | 18.2% |

---

## Phase 3 — Adapter Audit

### Existing adapters (ACTIVE)

| File | Fuentes | Tables Written | Status |
|---|---|---|---|
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts` | 33 (OP) | ProductionOrder, ProductionOrderLine | **ACTIVE** — ran 2026-06-25 |
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-normalizer.ts` | 33 (OP) | — (mapper only) | **ACTIVE** |
| `lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-sync.ts` | 34 (TR), 206 (TM) | InventoryTransfer, InventoryTransferLine | **PARTIAL** — headers synced, 0 lines |
| `lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-normalizer.ts` | 34, 206 | — (mapper only) | **ACTIVE** |

### Existing type definitions (CODE EXISTS, NEVER EXECUTED)

| File | Defines | Used By | Executed? |
|---|---|---|---|
| `lib/production-intelligence/production-document-mapping.ts` | Mappings for OP, CN, PC, EC, T1, T2, Y1, ET | `production-flow-engine.ts` | **NO** — no data for CN/PC/EC/T1/T2/Y1/ET |
| `lib/production-intelligence/production-stage-inference.ts` | 5 stages with doc type indicators | `production-engine.ts` | **YES** but always returns stage 1 |
| `lib/production-intelligence/production-types.ts` | `SagProductionDocType` = OP/CN/PC/EC/ET/T1/T2/Y1 | Multiple files | **YES** but only OP data exists |
| `lib/sag/master-data/castillitos-fuentes.ts` | 17 PRODUCCION fuentes registered | Lookup functions | **YES** — registry only, no sync |

### Missing adapters (NO CODE EXISTS)

| Missing Adapter | Fuente | SAG Query Pattern | Estimated Effort |
|---|---|---|---|
| CN sync adapter | 80 | `WHERE ka_ni_fuente = 80` | Low — clone OP adapter |
| ET sync adapter | 116 | `WHERE ka_ni_fuente = 116` | Low — clone OP adapter |
| PC/EC sync adapter | 99, 100 | `WHERE ka_ni_fuente IN (99,100)` | Low — clone OP adapter |
| T1/T2/Y1 sync adapter | 129, 118, 119 | `WHERE ka_ni_fuente IN (129,118,119)` | Low — clone OP adapter |
| MV sync adapter | 115 | `WHERE ka_ni_fuente = 115` | Medium — 0 lines issue |
| Transfer LINES sync | 34, 206 | Already in code, but items query returns 0 | Medium — investigate JOIN |

### Key technical insight

All SAG production data lives in the SAME two tables: `MOVIMIENTOS` (headers) and `MOVIMIENTOS_ITEMS` (lines). The existing sync pattern in `sag-production-sync.ts` already demonstrates:

1. Header query: `SELECT * FROM MOVIMIENTOS WHERE ka_ni_fuente = {X}`
2. Items query: `SELECT mi.*, v.k_sc_codigo_articulo FROM MOVIMIENTOS_ITEMS mi LEFT JOIN v_articulos v ON ... WHERE mi.ka_nl_movimiento IN ({ids})`
3. Normalize into snapshots
4. Upsert via Prisma

The SAME pattern works for ALL production fuentes. Only the `ka_ni_fuente` filter value changes.

---

## Phase 4 — Database Audit

### Evidence of CN/ET/PC/EC/T1/T2/Y1 in Agentik DB

| Document Type | In ProductionOrder? | In InventoryTransfer? | In Any Other Table? | Status |
|---|---|---|---|---|
| CN (fuente 80) | NO | NO | NO | **ZERO records in DB** |
| ET (fuente 116) | NO | NO | NO | **ZERO records in DB** |
| PC (fuente 99) | NO | NO | NO | **ZERO records in DB** |
| EC (fuente 100) | NO | NO | NO | **ZERO records in DB** |
| T1 (fuente 129) | NO | NO | NO | **ZERO records in DB** |
| T2 (fuente 118) | NO | NO | NO | **ZERO records in DB** |
| Y1 (fuente 119) | NO | NO | NO | **ZERO records in DB** |
| MV (fuente 115) | NO | NO | NO | **ZERO records in DB** |

### What IS in the DB

| Model | sourceCode Values | Records | Coverage |
|---|---|---|---|
| ProductionOrder | OP only | 3,376 | Fuente 33 only |
| ProductionOrderLine | — (child of OP) | 56,586 | Fuente 33 only |
| InventoryTransfer | TR, TM | 3,121 | Fuentes 34, 206 |
| InventoryTransferLine | — | **0** | Lines never synced |

### rawJson analysis

Both `ProductionOrder.rawJson` and `InventoryTransfer.rawJson` contain the full MOVIMIENTOS row from SAG. Key fields:
- `ka_ni_fuente` — document type (always 33 for OP, 34/206 for transfers)
- `ka_nl_movimiento` — unique movement ID
- `ka_nl_bodega` — warehouse code (NULL at header level for OPs)
- `sc_dcto_cerrado` — closed flag (N/S)
- `d_fecha_documento` — document date
- `ss_remision` — cross-reference number

---

## Phase 5 — Lifecycle Reconstruction

### Attempting to trace OP #3378 (most recent OP, created 2026-06-23)

From PRODUCTION_FORENSICS_REPORT.md Phase 3, the forensic queries against SAG revealed:

| Step | Document | Fuente | Date | SAG mov_id | In Agentik DB? |
|---|---|---|---|---|---|
| 1 | OP created | 33 (OP) | 2026-06-23 | 277252 | **YES** — ProductionOrder |
| 2 | Material consumed | 80 (CN) | — | — | **NO** — no CN adapter |
| 3 | Internal transfer | 115 (MV) | — | — | **NO** — no MV adapter |
| 4 | Third-party costs | 118 (T2) | — | — | **NO** — no T2 adapter |
| 5 | Service causation | 119 (Y1) | — | — | **NO** — no Y1 adapter |
| 6 | Finished goods entry | 116 (ET) | 2026-01-22* | 257166 | **NO** — no ET adapter |

*Note: The ET date (2026-01-22) predates OP #3378's creation (2026-06-23). This confirms the forensics finding: `n_numero_documento` is NOT globally unique — document number 3378 as ET refers to a different production run than OP #3378. Cross-referencing must use `ka_nl_articulo + ss_talla + ss_color`, NOT `n_numero_documento`.*

### What's missing for lifecycle reconstruction

| Missing Element | Impact | Resolution |
|---|---|---|
| CN records | Cannot know when materials were consumed | Sync fuente 80 |
| ET records | Cannot know when finished goods were entered | Sync fuente 116 |
| OP→CN→ET linkage | Cannot trace lifecycle by document number | Link via `ka_nl_articulo + ss_talla + ss_color + date range` |
| Transfer lines | Cannot see bodega-to-bodega movement | Sync MOVIMIENTOS_ITEMS for transfers |

---

## Phase 6 — Execution Map

```
OP (fuente 33)                    ← CONFIRMED — 3,376 movements synced to DB
  ↓
CN (fuente 80)                    ← SIN EVIDENCIA en DB — 7,876 movements exist in SAG
  ↓
PC (fuente 99) → External        ← SIN EVIDENCIA en DB — 296 movements in SAG
  ↓
EC (fuente 100) ← External       ← SIN EVIDENCIA en DB — 296 movements in SAG
  ↓
MV (fuente 115) Internal transfer ← SIN EVIDENCIA en DB — 8,320 movements in SAG
  ↓
T1 (fuente 129) Service           ← SIN EVIDENCIA en DB — 80 movements in SAG
  ↓
T2 (fuente 118) Service           ← SIN EVIDENCIA en DB — 9,596 movements in SAG
  ↓
Y1 (fuente 119) Service           ← SIN EVIDENCIA en DB — 8,521 movements in SAG
  ↓
ET (fuente 116)                   ← SIN EVIDENCIA en DB — 3,638 movements in SAG
  ↓
Bodega 01 (finished goods)        ← CONFIRMED — 469 products, 67,950 units
```

### Status per stage

| Stage | Document | Status | SAG Evidence | DB Evidence | Confidence |
|---|---|---|---|---|---|
| 1. OP Created | OP (33) | **CONFIRMADO** | 3,376 movements | 3,376 records | HIGH |
| 2. Material Consumed | CN (80) | **SIN EVIDENCIA** | 7,876 movements in SAG | 0 records | NONE |
| 3. External Manufacturing | PC/EC (99/100) | **SIN EVIDENCIA** | 592 movements in SAG | 0 records | NONE |
| 4. Internal Transfers | MV (115) | **SIN EVIDENCIA** | 8,320 movements in SAG | 0 records | NONE |
| 5. Services Applied | T1/T2/Y1 (129/118/119) | **SIN EVIDENCIA** | 18,197 movements in SAG | 0 records | NONE |
| 6. Finished Goods Entry | ET (116) | **SIN EVIDENCIA** | 3,638 movements in SAG | 0 records | NONE |
| 7. In Bodega 01 | — (cross-reference) | **PROBABLE** | 150 refs overlap | 469 products | MEDIUM |

---

## Phase 7 — Execution Bodegas

### Bodegas confirmed in production data

| Bodega | warehouseId | externalRef | Units | Role in Production |
|---|---|---|---|---|
| Bodega 04 (PRODUCTO EN PROCESO) | 13 | 04 | 1,318,904 | **Primary WIP** — all OP lines target this bodega |
| Bodega 01 (PRODUCTO TERMINADO) | 10 | 01 | 67,950 | **Finished goods** — ET destination |

### Bodegas per production stage (from SAG data model analysis)

| Stage | Expected Bodegas | Evidence |
|---|---|---|
| Corte (cutting) | Bodega 04 (WIP) — materials consumed | CN (fuente 80) would show raw material bodegas → WIP |
| Estampacion (printing) | Bodega 04 (WIP) | T1/T2 services operate within WIP |
| Bordado (embroidery) | Bodega 04 (WIP) | T1/T2 services operate within WIP |
| Confeccion (assembly) | External → Bodega 04 | PC sends out, EC receives back to WIP |
| Terminacion (finishing) | Bodega 04 (WIP) | Y1 services within WIP |
| Producto Terminado | Bodega 04 → Bodega 01 | ET (fuente 116) moves from WIP to finished |

**Key finding:** Castillitos uses a **single WIP bodega** (04/13). There are no separate bodegas for cutting, printing, embroidery, etc. The production stage is tracked by **document type**, not by warehouse code. This means stage inference MUST come from document evidence (CN/PC/EC/T1/T2/Y1/ET), not from bodega movements.

---

## Phase 8 — Sync Gaps

### P0 — Critical (Stage inference impossible without these)

| Gap | Fuente | SAG Data Available | Effort | Impact |
|---|---|---|---|---|
| **CN — Material Consumption** | 80 | 7,876 movements, 81,174 lines | Low — clone OP adapter pattern | Distinguishes "ordered" from "in production". Confirms production has started. |
| **ET — Finished Goods Entry** | 116 | 3,638 movements, 0 lines* | Low — clone OP adapter pattern | Distinguishes "in production" from "complete". Only reliable completion signal. |
| **Transfer LINES** | 34, 206 | Headers synced, 0 lines | Medium — fix items query JOIN | Enables bodega-to-bodega movement tracking. |

*\* ET has 3,638 header movements but 0 lines returned from MOVIMIENTOS_ITEMS JOIN. Need to investigate if ET uses a different line relationship or if items truly don't exist.*

### P1 — High Value (Full pipeline visibility)

| Gap | Fuente | SAG Data Available | Effort | Impact |
|---|---|---|---|---|
| **T2 — Third-party Costs** | 118 | 9,596 movements, 9,702 lines | Low | Services/finishing applied. Cost tracking. |
| **Y1 — Service Causation** | 119 | 8,521 movements, 137,446 lines | Low | Largest line count. Complete service audit trail. |
| **MV — Internal Transfers** | 115 | 8,320 movements, 0 lines* | Medium | Internal material movement between production stages. |

### P2 — Supporting (Completeness)

| Gap | Fuente | SAG Data Available | Effort | Impact |
|---|---|---|---|---|
| PC/EC — External Manufacturing | 99, 100 | 592 movements, 5,614 lines | Low | External confection tracking. |
| T1 — Gastos Terceros | 129 | 80 movements, 81 lines | Low | Additional service costs. |
| AD — Adjustments | 126 | 92 movements, 809 lines | Low | Production adjustments. |
| CV — Sample Consumption | 127 | 411 movements, 15,489 lines | Low | Sample material tracking. |
| M2 — Sample Entry | 133 | 83 movements, 2,916 lines | Low | Sample receipt tracking. |

### Prisma Model Gap

Currently, CN/ET/PC/EC/T1/T2/Y1/MV documents have **no Prisma model**. Options:

**Option A: Extend ProductionOrder** — Add all production document types to the existing `ProductionOrder` model by relaxing the `sourceCode` field to accept CN/ET/PC/EC/etc. Pros: no migration. Cons: semantic pollution (an ET is not an "order").

**Option B: New ProductionEvent model** — Create a generic `ProductionEvent` model that stores any production-related MOVIMIENTOS document. Pros: clean semantics, single model for all production evidence. Cons: requires migration.

**Recommendation: Option B** — A `ProductionEvent` model with `eventType` (CN/ET/PC/EC/T1/T2/Y1/MV) provides clean domain separation and enables the stage inference engine to work as designed.

```
ProductionEvent (proposed)
  id                String @id @default(cuid())
  organizationId    String
  erpMovId          Int          // ka_nl_movimiento
  eventType         String       // CN, ET, PC, EC, T1, T2, Y1, MV
  fuente            Int          // ka_ni_fuente (80, 116, 99, etc.)
  documentNumber    String       // n_numero_documento
  documentDate      DateTime     // d_fecha_documento
  isClosed          Boolean
  rawJson           Json?
  syncedAt          DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  lines             ProductionEventLine[]
  @@unique([organizationId, erpMovId])
  @@index([organizationId, eventType])

ProductionEventLine (proposed)
  id                  String @id @default(cuid())
  organizationId      String
  productionEventId   String
  erpItemId           Int        // ka_nl_movimiento_item
  referenceCode       String     // k_sc_codigo_articulo
  productName         String?
  size                String?    // ss_talla
  color               String?    // ss_color
  quantity            Int        // n_cantidad
  warehouseCode       String?    // ka_nl_bodega
  rawJson             Json?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  event               ProductionEvent @relation(...)
  @@unique([organizationId, erpItemId])
```

---

## Phase 9 — Module Readiness Assessment

### What can be built TODAY (with current data)

| Module Feature | Feasible? | Data Available | Quality |
|---|---|---|---|
| Production Dashboard (OP list) | **YES** | 3,352 open OPs, 56K lines | HIGH |
| OP Detail (reference, size, color, qty) | **YES** | 100% coverage | HIGH |
| OP Age Analysis | **YES** | documentDate available | HIGH |
| SubLinea Distribution | **YES** | referenceCode prefix inference | MEDIUM |
| Reference Velocity | **YES** | OP count per referenceCode | HIGH |
| WIP Inventory (Bodega 04) | **YES** | 1.32M units, 48K variants | HIGH |

### What CANNOT be built (missing documents)

| Module Feature | Blocked By | Required Fuentes |
|---|---|---|
| Production Workflow (pipeline view) | No stage data beyond OP | CN (80), ET (116) minimum |
| Production Timeline (event timeline) | No execution events | CN (80), T2 (118), Y1 (119), ET (116) |
| Production Bottlenecks (stage duration) | No stage transition dates | CN (80), PC/EC (99/100), T1/T2/Y1, ET (116) |
| Production Monitoring (real-time status) | No completion signal | ET (116) minimum |
| Production Completion Rate | No ET data | ET (116) |
| Production Cost Tracking | No CN/T1/T2/Y1 costs | CN (80), T1 (129), T2 (118), Y1 (119) |
| Bodega Movement Tracking | Transfer lines never synced | InventoryTransferLine sync |

### Minimum viable production module

To build a useful Production module beyond the current OP list, the **absolute minimum** is:

1. **ET sync (fuente 116)** — answers "is this OP done?"
2. **CN sync (fuente 80)** — answers "has this OP started producing?"

With just these two, the stage inference engine can determine 3 of 5 stages:
- Stage 1: Has OP, no CN → "Ordered"
- Stage 2: Has CN, no ET → "In Production"
- Stage 5: Has ET → "Complete"

---

## Phase 10 — Architectural Recommendation

### Can Production become independent from Comercial?

**YES — with conditions.**

### Evidence FOR independence

| # | Evidence | Source |
|---|---|---|
| 1 | **Own data model**: ProductionOrder + ProductionOrderLine — not shared with orders or CRM | Prisma schema |
| 2 | **Own bodegas**: Bodega 04 (WIP) = 1.32M units. Bodega 01 (commercial) = 67K units. | ProductInventoryLevel |
| 3 | **Own reference system**: referenceCode in OP lines maps to ProductEntity.sku (94.9% overlap with B04) | Cross-reference query |
| 4 | **Own scale**: Production is 20x larger than commercial inventory by unit volume | DB counts |
| 5 | **Own document types**: 17 production fuentes in SAG, all category=PRODUCCION | castillitos-fuentes.ts |
| 6 | **Own lifecycle**: OP→CN→PC/EC→T1/T2/Y1→ET — completely separate from sales/CRM | PRODUCTION_FORENSICS_REPORT |
| 7 | **Own consumers**: production-intelligence engines are distinct from commercial intelligence | Codebase |
| 8 | **Proven sync pattern**: sag-production-sync.ts demonstrates the full MOVIMIENTOS→Prisma pipeline | Adapter code |
| 9 | **SAG data exists**: 42,588 production movements and 310,171 lines available in SAG | SAG forensics |

### Conditions for independence

| Condition | Status | Resolution |
|---|---|---|
| ET sync (completion signal) | **BLOCKED** | Build ET adapter — clone OP pattern with `ka_ni_fuente = 116` |
| CN sync (start signal) | **BLOCKED** | Build CN adapter — clone OP pattern with `ka_ni_fuente = 80` |
| ProductionEvent Prisma model | **BLOCKED** | Create migration for ProductionEvent + ProductionEventLine |
| OP→CN→ET cross-reference | **BLOCKED** | Link via `ka_nl_articulo + ss_talla + ss_color`, NOT `n_numero_documento` |
| ET items investigation | **BLOCKED** | ET has 3,638 headers but 0 lines — may need different query |

### Verdict

**YES — Production can and should be independent from Comercial.**

The domain boundaries are clear, the data model is separate, the SAG infrastructure is proven, and the data volume justifies a dedicated module. The primary blocker is not architectural — it's operational: we need to sync 2-3 additional SAG fuentes to enable stage inference.

---

## Phase 11 — Next Sprints

### Recommended sprint sequence

| Sprint | Name | Scope | Prerequisite |
|---|---|---|---|
| **S1** | PRODUCTION-EVENT-MODEL-01 | Create ProductionEvent + ProductionEventLine Prisma models, migration | None |
| **S2** | PRODUCTION-ET-SYNC-01 | Build ET sync adapter (fuente 116), investigate 0-lines issue, sync to ProductionEvent | S1 |
| **S3** | PRODUCTION-CN-SYNC-01 | Build CN sync adapter (fuente 80), sync to ProductionEvent | S1 |
| **S4** | PRODUCTION-STAGE-ACTIVATION-01 | Wire CN+ET data into stage inference engine, enable 3-stage detection | S2, S3 |
| **S5** | PRODUCTION-TRANSFER-LINES-01 | Fix InventoryTransferLine sync (items query returns 0) | None |
| **S6** | PRODUCTION-SERVICES-SYNC-01 | Build T2/Y1/T1 sync adapters (fuentes 118/119/129) | S1 |
| **S7** | PRODUCTION-EXTERNAL-SYNC-01 | Build PC/EC sync adapters (fuentes 99/100) | S1 |
| **S8** | PRODUCTION-LIFECYCLE-01 | Cross-reference OP→CN→ET via articulo+talla+color, build lifecycle timeline | S2, S3 |

---

## Summary of Findings

| Question | Answer | Evidence |
|---|---|---|
| Where does execution live in SAG? | `MOVIMIENTOS + MOVIMIENTOS_ITEMS` with `ka_ni_fuente` differentiation | PRODUCTION_FORENSICS_REPORT, adapter code |
| How many production fuentes exist? | **17** (all category=PRODUCCION in castillitos-fuentes.ts) | castillitos-fuentes.ts |
| How many are synced? | **1 of 17** (OP only, fuente 33) | sag-production-sync.ts |
| How many SAG movements are missing? | **39,212 movements** (92.1% of production data) | SAG forensics counts |
| Can we build stage inference? | **Not yet** — needs CN (80) and ET (116) minimum | Phase 6 analysis |
| Can we reuse the OP sync pattern? | **YES** — same MOVIMIENTOS query, different `ka_ni_fuente` | Adapter code review |
| Does a target Prisma model exist? | **NO** — need ProductionEvent model | Schema audit |
| Can Production be independent? | **YES** — own model, own bodegas, own lifecycle, 20x scale | Phase 10 analysis |
| What's the minimum viable sync? | **ET + CN** — enables 3-stage detection | Phase 9 analysis |

---

## Files Consulted (READ ONLY)

| File | Purpose |
|---|---|
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts` | OP sync adapter (fuente 33 only) |
| `lib/connectors/adapters/sag-pya-soap/production/sag-production-normalizer.ts` | OP normalizer |
| `lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-sync.ts` | Transfer sync adapter (fuentes 34, 206) |
| `lib/connectors/adapters/sag-pya-soap/transfers/sag-transfer-normalizer.ts` | Transfer normalizer |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | SAG query catalog (production = placeholder) |
| `lib/sag/master-data/castillitos-fuentes.ts` | Complete 127-fuente registry (17 PRODUCCION) |
| `lib/production-intelligence/production-document-mapping.ts` | 8 production doc type mappings (code exists, no data) |
| `lib/production-intelligence/production-stage-inference.ts` | 5-stage inference engine (works, but only stage 1 has data) |
| `lib/production-intelligence/production-types.ts` | SagProductionDocType definitions |
| `lib/production-intelligence/report-loader.ts` | Production data loader (fixed in FORENSICS-01) |
| `scripts/_production-sync-01a.ts` | OP sync execution script |
| `scripts/_production-stage-forensics.ts` | Stage mapping forensic queries |
| `prisma/schema.prisma` | All relevant models |
| `PRODUCTION_FORENSICS_REPORT.md` | SAG production forensics (42,588 movements documented) |
| `PRODUCTION_DATA_FORENSICS_01.md` | Query timeout root cause |
| `PRODUCTION_STAGE_MAPPING_01.md` | Stage mapping findings |
| `CASTILLITOS_OPERATIONAL_DOMAIN_ALIGNMENT_01.md` | Domain boundaries |
| `CASTILLITOS_SAG_BODEGA_DISCOVERY_01.md` | Bodega mapping |
| `CASTILLITOS_SAG_TRANSFER_DISCOVERY_01.md` | Transfer data gaps |

## Files Changed

None. This sprint is discovery only.

## DB Changes

None.

## TSC Baseline

160 (maintained — no code changes in this sprint).
