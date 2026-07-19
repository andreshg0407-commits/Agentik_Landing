# PRODUCTION-STAGE-MAPPING-01 — Production Domain Forensic Report

**Date:** 2026-06-29
**Sprint:** PRODUCTION-STAGE-MAPPING-01
**Type:** Discovery / Archaeology — READ ONLY
**TSC Baseline:** 160 (maintained — no code changes)

---

## Executive Summary

Castillitos has a **massive production operation** hidden in plain sight: 3,352 open OPs with 1.38M units across 3,143 unique references. Bodega 04 (WIP) holds 1.32M units across 48,349 variants — 19x larger than Bodega 01 (finished goods: 67,950 units). Production is the dominant operational domain by volume.

However, **stage inference is fundamentally blocked**: only OP documents (fuente 33) are synced. Stages 2-5 (CN, PC/EC, T1/T2/Y1, ET) have zero data. Every OP is inferred as stage 1 ("Orden de Produccion"). Transfer lines were never synced (0 InventoryTransferLine records). This means the production pipeline is opaque — Agentik can see what was ordered but cannot track where anything is in the manufacturing process.

**Verdict:** YES — sufficient evidence exists to extract Production from Comercial as a standalone module. Production has its own data model, its own bodegas, its own reference system, and its own lifecycle. It shares reference codes with inventory but NOT the same data paths.

---

## Phase 1 — Bodega Inventory Map

| Bodega | warehouseId | externalRef | Products | Variants | Units | Domain |
|---|---|---|---|---|---|---|
| Bodega 01 | 10 | 01 | 469 | 3,075 | 67,950 | Commercial (finished goods) |
| Bodega 04 | 13 | 04 | 3,007 | 48,349 | 1,318,904 | Production (WIP) |

**Key finding:** Bodega 04 has **19.4x** more units than Bodega 01.
This is a manufacturing-heavy operation where the vast majority of inventory is in-process.

---

## Phase 2 — Transfer Routing

| Metric | Value |
|---|---|
| InventoryTransfer records | 3,121 |
| Transfer type TR (traslados) | 2,973 |
| Transfer type TM (movimientos) | 148 |
| InventoryTransferLine records | **0** |
| Origin/destination warehouse on transfers | **ALL NULL** |

**Critical gap:** Transfer headers exist but warehouse routing lives in line items (MOVIMIENTOS_ITEMS), which were never synced. This means:
- Cannot trace product movement between bodegas
- Cannot determine when items move from Bodega 04 → Bodega 01
- Cannot validate stage transitions via transfer evidence

---

## Phase 3 — Stage Identification from Movements

### Document Types in DB

| Source | sourceCode | Total | Open | Fuente |
|---|---|---|---|---|
| ProductionOrder | OP | 3,376 | 3,352 | 33 |
| InventoryTransfer | TR | 2,973 | — | Unknown |
| InventoryTransfer | TM | 148 | — | Unknown |

### Stage Evidence Availability

| Stage | Doc Types | Fuente | Synced | Records | Status |
|---|---|---|---|---|---|
| 1. Orden de Produccion | OP | 33 | YES | 3,376 | AVAILABLE |
| 2. Consumo de Insumos | CN | 80 | NO | 0 | BLOCKED |
| 3. Confeccion Externa | PC, EC | 99, 100 | NO | 0 | BLOCKED |
| 4. Servicios | T1, T2, Y1 | 129, 118, 119 | NO | 0 | BLOCKED |
| 5. Entrada Producto | ET | 116 | NO | 0 | BLOCKED |

**Result:** 100% of OPs are inferred as stage 1 because no other doc types exist. The stage inference engine (`production-stage-inference.ts`) works correctly — it simply has no evidence for stages 2-5.

---

## Phase 4 — Reference Traceability

### Overall Statistics

| Metric | Value |
|---|---|
| Unique references (open OPs) | 3,143 |
| Unique OPs (open) | 3,352 |
| Total units ordered | 1,377,921 |
| Average units per line | 24 |
| Total OP lines | 56,294 |

### OP Distribution per Reference

| OPs per reference | Reference count | % |
|---|---|---|
| 1 OP | 3,102 | 98.7% |
| 2 OPs | 26 | 0.8% |
| 3+ OPs | 15 | 0.5% |

93% of references have exactly 1 OP. The top reference (CD-4123138) has 28 OPs spanning Nov 2020 to Nov 2025 — this is a perennial product with repeated production runs.

### SubLinea Distribution

| SubLinea | References | OPs | Units | % of Units |
|---|---|---|---|---|
| LATIN KIDS (L-*) | 1,751 | 1,766 | 943,136 | 68.4% |
| CASTILLITOS (C-*) | 531 | 532 | 158,987 | 11.5% |
| CASTILLITOS-D (CD-*) | 18 | 199 | 59,736 | 4.3% |
| CV-* | 105 | 105 | 22,750 | 1.7% |
| CG-* | 98 | 98 | 26,464 | 1.9% |
| CGJ-* | 95 | 96 | 21,184 | 1.5% |
| CA-* | 91 | 91 | 22,542 | 1.6% |
| CF-* | 79 | 79 | 23,598 | 1.7% |
| CP-* | 70 | 71 | 20,648 | 1.5% |
| CT-* | 64 | 64 | 13,832 | 1.0% |
| Other (CC, CJ, H, P, CL, DA, CR, SAL, CCP, REP) | 141 | 144 | 65,044 | 4.7% |

LATIN KIDS dominates with 68% of production units. CD-* (CASTILLITOS-D) has only 18 unique refs but 199 OPs — these are high-velocity perennial products.

### Size/Color Data Availability

| Metric | Value |
|---|---|
| Total OP lines | 56,294 |
| With size data | 56,282 (100%) |
| With color data | 56,282 (100%) |
| Unique sizes | 33 |
| Unique colors | 79 |

Size and color data is essentially complete. Only 12 lines (0.02%) lack size/color — likely header or summary lines.

### Lines per OP Distribution

| Lines per OP | OP Count | % | Avg Lines |
|---|---|---|---|
| 1-5 lines | 63 | 1.9% | 4 |
| 6-10 lines | 252 | 7.5% | 8 |
| 11-20 lines | 2,622 | 78.2% | 16 |
| 21-50 lines | 414 | 12.3% | 29 |
| 50+ lines | 1 | 0.03% | 52 |

78% of OPs have 11-20 lines, meaning a typical OP covers 4 sizes x 4 colors = 16 SKU variants.

### Cross-Reference: Production vs Inventory

| Comparison | Production Refs | Inventory SKUs | Overlap | Overlap % |
|---|---|---|---|---|
| Production vs Bodega 04 (WIP) | 3,143 | 3,007 | **2,983** | **94.9%** |
| Production vs Bodega 01 (Finished) | 3,143 | 469 | 150 | 4.8% |

**Critical finding:**
- 94.9% of production references exist in Bodega 04 (WIP inventory)
- Only 4.8% exist in Bodega 01 (finished goods)
- 160 production refs have NO inventory in either bodega (never materialized or reference mismatch)
- This confirms Bodega 04 IS the production domain's inventory, and Bodega 01 IS the commercial domain's inventory

---

## Phase 5 — Bottleneck Identification

### OP Age Distribution

| Age Bucket | OPs | % | Units | % |
|---|---|---|---|---|
| 0-30 days | 26 | 0.8% | 7,124 | 0.5% |
| 31-90 days | 99 | 3.0% | 36,593 | 2.7% |
| 91-180 days | 111 | 3.3% | 43,022 | 3.1% |
| 181-365 days | 394 | 11.8% | 161,472 | 11.7% |
| 1-2 years | 514 | 15.3% | 198,624 | 14.4% |
| **2+ years** | **2,208** | **65.9%** | **931,086** | **67.6%** |

**Bottleneck analysis:**
- **66% of open OPs are 2+ years old** — Castillitos almost never closes OPs in SAG
- Only 26 OPs (0.8%) are from the last 30 days — production ordering is slow
- This is NOT a bottleneck in the manufacturing sense — it's a **data hygiene problem**
- OPs remain "open" in SAG even after the product has been manufactured and sold
- The 931K units in 2yr+ OPs are likely **already manufactured** but their OPs were never closed

### Implications for Stage Inference

Without CN/PC/EC/T1/T2/ET documents, we cannot distinguish:
1. OPs that are genuinely in early production (material ordered, not yet cut)
2. OPs that are complete but never closed in SAG
3. OPs that are partially complete (some sizes/colors done, others pending)

The **only proxy** for completion is cross-referencing OP references against Bodega 01 inventory:
- If an OP reference appears in Bodega 01 with stock → likely complete
- If it only appears in Bodega 04 → likely in production
- If it appears in neither → unknown

---

## Phase 6 — Stage Inference Validation

### Current Engine Analysis

`production-stage-inference.ts` defines 5 stages with correct doc type mappings:
1. OP (fuente 33) — **only stage with data**
2. CN (fuente 80) — no data
3. PC/EC (fuente 99/100) — no data
4. T1/T2/Y1 (fuente 129/118/119) — no data
5. ET (fuente 116) — no data

The engine is **architecturally correct** but **empirically useless** — every OP will always be inferred as stage 1 with confidence score 50 (base match, 1 doc type, 1 stage with evidence).

### What Would Fix It

To make stage inference work, Castillitos needs to sync additional SAG fuentes:

| Priority | Fuente | Doc Type | What It Unlocks |
|---|---|---|---|
| P0 | 80 | CN (Consumo Insumos) | Know when materials were consumed — distinguishes "ordered" from "in production" |
| P1 | 116 | ET (Entrada Producto) | Know when finished product entered bodega — distinguishes "in production" from "complete" |
| P2 | 99, 100 | PC, EC (Confeccion Externa) | Know when items went to/from external manufacturers |
| P3 | 129, 118, 119 | T1, T2, Y1 (Servicios) | Know when third-party services (embroidery, printing) happened |

Also needed:
- InventoryTransferLine sync (MOVIMIENTOS_ITEMS for transfers) to track bodega-to-bodega movement
- OP closure tracking (why do 99.3% of OPs remain open?)

---

## Phase 7 — Future Model Proposal

### Production as Standalone Module

Production should be extracted from Comercial and established as an independent domain:

**Evidence for independence:**
1. **Own data model**: ProductionOrder + ProductionOrderLine — not shared with orders, inventory, or CRM
2. **Own bodegas**: Bodega 04 (WIP) is exclusively production. Bodega 01 is exclusively commercial.
3. **Own reference system**: referenceCode links production to inventory but the lifecycle is separate
4. **Own scale**: 1.38M units in production vs 67K in commercial inventory — production is 20x larger
5. **Own lifecycle**: OP creation → material consumption → manufacturing → services → finished goods entry
6. **Own KPIs**: OP age, stage distribution, completion rate, reference velocity — none of these are commercial metrics
7. **Own consumers**: production-intelligence engines, production-flow-engine, production-control-service — all distinct from commercial intelligence

**Proposed module structure:**

```
/[orgSlug]/produccion/
  ├── Control Center (existing, needs stage data)
  ├── Ordenes de Produccion (OP list, filter, detail)
  ├── Flujo de Produccion (stage pipeline view — BLOCKED until fuentes synced)
  ├── Referencias (reference lifecycle across OPs)
  └── Inteligencia (production KPIs, bottleneck analysis)
```

**Proposed data model extensions:**

```
ProductionStageEvent (NEW — requires CN/PC/EC/T1/T2/ET sync)
  - productionOrderId
  - referenceCode
  - stageId
  - docType
  - fuente
  - eventDate
  - quantity
  - bodegaOrigin / bodegaDestination
  - evidence (JSON)
```

### Blockers for Full Independence

| Blocker | Impact | Resolution |
|---|---|---|
| Only OP fuente synced | Stage inference returns stage 1 for everything | Sync CN (80), ET (116), PC/EC (99/100), T1/T2/Y1 (129/118/119) |
| 0 InventoryTransferLines | Cannot trace bodega movement | Sync MOVIMIENTOS_ITEMS for transfers |
| 99.3% OPs never closed | Cannot distinguish "complete" from "in progress" | Either sync closure events or infer from Bodega 01 presence |
| No OP-to-OP linking | Cannot trace re-production of same reference | Cross-reference via referenceCode (available) |

---

## Phase 8 — Summary

### Key Metrics

| Metric | Value |
|---|---|
| Open OPs | 3,352 |
| Unique references | 3,143 |
| Total units ordered | 1,377,921 |
| Bodega 04 (WIP) units | 1,318,904 |
| Bodega 01 (finished) units | 67,950 |
| Production/Inventory overlap (B04) | 94.9% |
| OPs older than 2 years | 66% |
| Stage inference coverage | 1/5 stages (20%) |
| Transfer line data | 0 records |
| Size/color coverage | 100% |
| Dominant SubLinea | LATIN KIDS (68%) |

### Answers to Sprint Questions

| Question | Answer |
|---|---|
| Does Bodega 04 = Production? | YES — 94.9% overlap with production references, 1.32M units WIP |
| Does Bodega 01 = Commercial? | YES — only 4.8% overlap with production, 67K units finished goods |
| Can we determine production stage? | NO — only OP (stage 1) data synced. Stages 2-5 blocked. |
| Where is the bottleneck? | Data, not manufacturing. 66% of OPs are 2yr+ old but never closed. |
| Can Production become standalone? | YES — own model, own bodegas, own lifecycle, own KPIs, 20x scale vs commercial |
| What blocks full independence? | Sync of CN/ET/PC/EC/T1/T2/Y1 fuentes + InventoryTransferLine |

### Files Used (READ ONLY)

| File | Purpose |
|---|---|
| `lib/production-intelligence/production-stage-inference.ts` | Stage inference engine (5 stages, only stage 1 has data) |
| `lib/production-intelligence/production-types.ts` | Domain types for production records |
| `lib/production-intelligence/report-loader.ts` | Production data loader (fixed in FORENSICS-01) |
| `lib/production-intelligence/production-engine.ts` | Production report builder |
| `lib/production-intelligence/production-flow-engine.ts` | Flow snapshot builder |
| `prisma/schema.prisma` | ProductionOrder, ProductionOrderLine, ProductInventoryLevel, ProductEntity, ProductVariant, InventoryTransfer, InventoryTransferLine |
| `scripts/_production-stage-forensics.ts` | Forensic queries (created for this sprint) |

### Files Changed

None. This sprint is discovery only.

### DB Changes

None.

### TSC Baseline

160 (maintained — no code changes in this sprint).

---

## References

- PRODUCTION_DATA_FORENSICS_01.md — Root cause of 0 OPs (query timeout)
- CASTILLITOS_OPERATIONAL_DOMAIN_ALIGNMENT_01.md — Domain boundaries
- CASTILLITOS_SAG_BODEGA_DISCOVERY_01.md — Bodega mapping
- CASTILLITOS_SAG_TRANSFER_DISCOVERY_01.md — Transfer data gaps
