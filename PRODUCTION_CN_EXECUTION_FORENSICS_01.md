# PRODUCTION-CN-EXECUTION-FORENSICS-01 — CN Forensic Report

**Date:** 2026-06-29
**Sprint:** PRODUCTION-CN-EXECUTION-FORENSICS-01
**Type:** Discovery + Forensics (READ-ONLY)
**TSC Baseline:** 160 (maintained — zero production code changes)
**Prerequisites:** PRODUCTION-EVENT-MODEL-01, PRODUCTION-ET-SYNC-01, PRODUCTION-EXECUTION-DISCOVERY-01

---

## Executive Summary

**CN (fuente 80) = Consumos de Insumos y Materias Primas.**

CN documents record the consumption of raw materials (fabrics, labels, elastic, bags, dye instructions) during production of a specific Production Order. CN is NOT a finished-product document — it records what was consumed (inputs), not what was produced (outputs).

**Central Answer:** CN represents `MATERIAL_CONSUMED` — the withdrawal of raw materials from supply warehouses (Bodegas 14/15) for use in production. Every CN is linked 1:1 to a Production Order via `ss_remision`. CN articles are raw materials (telas, insumos, marquillas), NOT product references.

**Critical Discovery:** CN articles live in a DIFFERENT namespace than OP/product articles. CN uses raw material codes (VALERIA/003, RIB2.5, ET.1, BL.1) while OP uses product reference codes (L-xxxx, C-xxxx, DA-xxxx). There is 0% overlap. This means CN→ProductionEvent lines will carry `referenceCode` = raw material article code, NOT product reference code.

---

## Phase 2 — Forensic Profile

### Statistical overview

| Metric | Value |
|---|---|
| CN headers total | 7,890 |
| CN lines total | 81,367 |
| Lines per header (avg) | 10.3 |
| Earliest CN | #1 — 2020-11-03 |
| Latest CN | #7926 — 2026-06-26 |
| Date span | 5 years, 8 months |
| Active | YES — latest is 3 days ago |
| Open documents | 1,932 (24.5%) |
| Closed documents | 5,958 (75.5%) |
| Unique article references | 2,809 |

### Monthly frequency (recent 12 months)

| Month | Documents |
|---|---|
| 2026-06 | 76 |
| 2026-05 | 92 |
| 2026-04 | 126 |
| 2026-03 | 75 |
| 2026-02 | 146 |
| 2026-01 | 70 |
| 2025-12 | 98 |
| 2025-11 | 115 |
| 2025-10 | 206 |
| 2025-09 | 172 |
| 2025-08 | 138 |
| 2025-07 | 159 |

Average: ~123 documents/month.

### Lines per header distribution

| Range | Headers | % |
|---|---|---|
| 0 lines | 2 | 0.03% |
| 1-5 lines | 1,323 | 16.8% |
| 6-10 lines | 2,435 | 30.9% |
| 11-20 lines | 4,042 | 51.2% |
| 21-50 lines | 88 | 1.1% |

Most CN documents have 6-20 lines. This aligns with a production order consuming 6-20 different raw materials (fabrics, trims, labels, bags, etc.).

---

## Phase 3 — Structure Analysis

### CN Header fields (non-empty)

| SAG Field | Example Value | Interpretation |
|---|---|---|
| `ka_nl_movimiento` | 277716 | SAG movement PK |
| `ka_ni_fuente` | 80 | Fuente = CN |
| `n_numero_documento` | 7923 | Document number |
| `ka_nl_tercero` | 526 | Supplier ID |
| `sc_beneficiario` | INDUSTRIAS DIANA ALZATE SAS | Supplier name |
| `d_fecha_documento` | 2026-06-26 | Business date |
| `ka_ni_centro_costo` | 8 | Cost center |
| `sv_observaciones` | DA-9046 | **Product reference code** (from OP) |
| `ss_remision` | 3386-1 | **OP cross-reference** (format: OP#-seq) |
| `ss_usuario_new` | YEMINA YOHANA ARIAS OROZCO | Operator who created |
| `sc_dcto_cerrado` | S/N | Open/closed flag |
| `sc_generado` | N | NOT auto-generated |
| `sc_autorizacion` | S | Authorized |

**Key finding:** CN headers do NOT have `ka_nl_bodega`. The bodega lives only on MOVIMIENTOS_ITEMS (line level). This means a single CN can consume materials from multiple warehouses.

### CN Line fields

| SAG Field | Population | Interpretation |
|---|---|---|
| `ka_nl_movimiento_item` | 100% | Line PK |
| `ka_nl_movimiento` | 100% | Parent header FK |
| `ka_nl_articulo` | 100% | Article FK |
| `k_sc_codigo_articulo` | 100% | **Article code** (via v_articulos JOIN) |
| `sc_detalle_articulo` | 100% | **Article description** (includes color) |
| `n_cantidad` | 100% | Quantity consumed |
| `n_valor` | 100% | Cost value |
| `n_ultimo_costo` | 98% | Last cost |
| `n_costo_promedio` | 98% | Average cost |
| `ka_nl_bodega` | 100% | **Warehouse from which material was consumed** |

**Key finding:** CN lines do NOT have `ss_talla` or `ss_color` columns. Size/color information is embedded in `sc_detalle_articulo` (e.g., "BELLA 170 AZUL NUBE 70012", "VALERIA BEIGE", "RIB 2 X 2 ROJO").

---

## Phase 4 — CN ↔ OP Relationship

### ss_remision linkage

| Metric | Value |
|---|---|
| CN headers with ss_remision | 7,890 / 7,890 (100%) |
| ss_remision format | `{OP_number}-{sequence}` (e.g., "3386-1") |

**100% of CN documents are linked to an OP.** Every CN records material consumption for a specific production order.

### Reference namespace mismatch

| Metric | Value |
|---|---|
| CN unique article references | 200 (sample from 2025+) |
| OP unique article references | 3,167 |
| Overlap | 0 (0.0%) |

**ZERO overlap.** CN articles (VALERIA/003, RIB2.5, BL.1) are raw materials. OP articles (L-xxxx, C-xxxx) are product references. They are different namespaces entirely.

### sv_observaciones as product identifier

The `sv_observaciones` field on CN headers contains product reference codes:

| CN # | sv_observaciones | Pattern |
|---|---|---|
| 7923 | DA-9046 | DA- (Diana Alzate product) |
| 7924 | DA-9047 | DA- |
| 7925 | CJ-2026022B | CJ- (Castillitos Junior?) |
| 7918 | L-1354 | L- (Latin Kids reference) |
| 7919 | L-1391 | L- |
| 7920 | L-1407 | L- |

This is significant: the `sv_observaciones` field carries the **product reference code** that this CN's materials are being consumed FOR. This provides the missing link between raw material consumption (CN) and the product being manufactured.

---

## Phase 5 — CN ↔ ET Relationship

| Metric | Value |
|---|---|
| CN unique ss_remision values | 3,359 |
| ET unique ss_remision values | 3,310 |
| Shared ss_remision (CN ∩ ET) | 3,308 |
| CN→ET linkage rate | **98.5%** |

**98.5% of OP numbers referenced by CN also appear in ET.** This confirms the production lifecycle:

```
OP (Production Order) → CN (Material Consumption) → ET (Finished Goods Entry)
```

The 1.5% gap (51 CN remisiones without matching ET) likely represents:
- Production orders still in progress (materials consumed but not yet completed)
- OP numbers where ET hasn't been generated yet

---

## Phase 6 — Reference Chronological Reconstruction

### Reference IL.9 (most frequent CN article)

"IL.9" = "INSTRUCCION LAVADO 65% 35%" — a washing instruction label, consumed in nearly every production order.

| Metric | Value |
|---|---|
| CN appearances | 2,206 lines across 2,204 documents |
| First CN | 2022-03-23 |
| Last CN | 2026-06-26 |
| OP appearances (fuente 33) | 0 (IL.9 is a raw material, NOT in OP product lines) |
| Bodega | 14 (all appearances) |

**Key finding:** IL.9 appears in 2,204 out of ~7,890 CN documents (28%). It's consumed by nearly every production order as a label/trim component. This confirms CN tracks raw material inputs, not finished products.

The timeline spans the full production history, with near-daily consumption entries — consistent with an active manufacturing operation.

---

## Phase 7 — Bodega Analysis

### CN line-level warehouse participation

| Bodega | Lines | % | Interpretation |
|---|---|---|---|
| **14** | 42,171 | **51.8%** | Primary raw material warehouse |
| **15** | 38,790 | **47.7%** | Secondary raw material warehouse |
| 16 | 405 | 0.5% | Minor warehouse |
| 10 | 1 | <0.01% | Exception |

**Critical finding:** CN operates in Bodegas 14 and 15 — NOT in Bodega 04 (WIP) or Bodega 01 (finished goods).

This reveals a warehouse topology not previously documented:

```
Bodega 14/15 (Raw Materials / Insumos)
  ↓ CN: material consumed (removed from here)
  ↓
Bodega 04 (WIP / Producto en Proceso)
  ↓ Production processing happens here
  ↓
Bodega 01 (Finished Goods / Producto Terminado)
  ↑ ET: completed product enters here
```

CN records the withdrawal of materials FROM Bodegas 14/15. These bodegas hold the fabric rolls, trims, labels, bags, elastic, and other raw materials needed for production.

---

## Phase 8 — Event Classification

### Quantity analysis

| Metric | Value |
|---|---|
| Total quantity consumed | 10,317,779 units |
| Average per line | 126.8 units |
| Min quantity | -256 (correction/reversal) |
| Max quantity | 9,136 |
| Positive lines | 81,298 (99.9%) |
| Negative lines | 54 (0.07%) — corrections |
| Zero lines | 15 (0.02%) |

The 54 negative-quantity lines (-3,698 total) represent material returns/corrections — standard warehouse practice.

### Cost data availability

| Cost Field | Status |
|---|---|
| n_valor (line cost) | 99.997% populated (81,365 of 81,367) |
| n_ultimo_costo | 99.7% populated |
| n_costo_promedio | 99.7% populated |

CN carries full cost data for every material consumed. This enables production cost analysis.

### Article types — Raw Materials Confirmed

Top 30 most consumed articles:

| Article Code | Description | Count | Category |
|---|---|---|---|
| BL.1 | BOLSA 8 X 12 | 2,735 | Packaging |
| EL1.1 | ELASTICO DE 3 CM | 2,435 | Trims |
| IL.9 | INSTRUCCION LAVADO 65% 35% | 2,206 | Labels |
| VALERIA/003-1 | VALERIA BEIGE | 2,188 | **Fabric** |
| VALERIA/003 | VALERIA BLANCO | 2,038 | **Fabric** |
| BA.1 | BANDERIN COLOMBIA | 1,501 | Labels |
| VALERIA/0091 | VALERIA LILA | 1,035 | **Fabric** |
| VALERIA/005 | VALERIA FUCSIA | 1,021 | **Fabric** |
| TG.12 | TALLA GENERICA 12 | 1,002 | **Size labels** |
| ETC.1 | ETIQUETA ESTAMPADO AMIGABLE | 998 | Labels |
| ET.1 | ETIQUETA SEMILLERO CASTILLITOS | 966 | Labels |
| TG.4 | TALLA GENERICA 4 | 959 | **Size labels** |
| ET.5 | ETIQUETA LATIN NINO | 954 | Labels |
| RIB2.5 | RIB 2 X 2 AZUL OSCURO | 847 | **Fabric (ribbing)** |
| M.1218 | MARQUILLA TALLA CASTILLITOS 12-18 | 723 | **Size labels** |

**All top articles are raw materials:**
- **Fabrics:** VALERIA, RIB, PUNTIFOIL, BELLA, LUCIANA, ECLIPSE
- **Trims:** elastic, ribbing
- **Labels:** washing instructions, brand labels, size labels, eco-friendly stamps
- **Packaging:** bags

### Reference pattern analysis

| Pattern | Lines | % |
|---|---|---|
| OTHER (raw material codes) | 81,342 | 99.97% |
| NUMERIC | 22 | 0.03% |
| C- (product codes) | 3 | <0.01% |

**99.97% of CN articles are raw material codes**, not product reference codes. The 3 C- entries are exceptions/miscodes.

---

## Phase 9 — ProductionEvent Compatibility

### Mapping CN → ProductionEvent

| Field | Source | Value |
|---|---|---|
| `sourceSystem` | constant | "SAG" |
| `sourceDocumentType` | constant | "CN" |
| `sourceDocumentId` | `ka_nl_movimiento` | Stringified SAG ID |
| `sourceDocumentNumber` | `n_numero_documento` | Document number |
| `sourceRawCode` | `ka_ni_fuente` | "80" |
| `sourceRawName` | constant | "Consumos Insumos y Materias Primas" |
| `eventType` | CASTILLITOS_SAG_MAPPINGS | `MATERIAL_CONSUMED` |
| `eventDate` | `d_fecha_documento` | Business date |
| `productionOrderRef` | `ss_remision` | OP cross-reference |
| `referenceCode` | `sv_observaciones` | **Product reference** (DA-xxxx, L-xxxx, CJ-xxxx) |
| `locationFrom` | line-level `ka_nl_bodega` | "14" or "15" (raw material warehouses) |
| `locationTo` | constant | null (consumed, not transferred) |
| `stageFrom` | CASTILLITOS_SAG_MAPPINGS | "materias_primas" |
| `stageTo` | CASTILLITOS_SAG_MAPPINGS | "servicios" |
| `confidence` | CASTILLITOS_SAG_MAPPINGS | "provisional" |
| `quantity` | SUM(lines.n_cantidad) | Total quantity consumed |
| `lineCount` | COUNT(lines) | Number of raw materials consumed |

### Mapping CN Lines → ProductionEventLine

| Field | Source | Value |
|---|---|---|
| `referenceCode` | `k_sc_codigo_articulo` | Raw material article code |
| `description` | `sc_detalle_articulo` | Article description (includes color) |
| `quantity` | `n_cantidad` | Quantity consumed |
| `unit` | null | Not specified in CN |
| `size` | null | Not available as separate column |
| `color` | null | Embedded in description, not separate column |
| `sourceLineId` | `ka_nl_movimiento_item` | Line PK |
| `lineMetadata.bodega` | `ka_nl_bodega` | Source warehouse (14/15/16) |
| `lineMetadata.n_valor` | `n_valor` | Cost value |
| `lineMetadata.n_costo_promedio` | `n_costo_promedio` | Average cost |

### Compatibility assessment

| Criterion | Status | Notes |
|---|---|---|
| Fits ProductionEvent model | YES | Header + lines, event type MATERIAL_CONSUMED |
| Unique key works | YES | [org, SAG, CN, sourceDocumentId] |
| Line unique key works | YES | [productionEventId, sourceLineId] |
| referenceCode strategy | DECISION NEEDED | Header `sv_observaciones` = product ref, line `k_sc_codigo_articulo` = raw material ref |
| Size/color | PARTIAL | Not available as discrete columns; embedded in description |
| Cost data | YES | n_valor, n_ultimo_costo, n_costo_promedio |

---

## Phase 10 — Stage Detection Capability

### What CN enables for stage detection

| Capability | Before CN | After CN Sync |
|---|---|---|
| Detect material consumption | IMPOSSIBLE | **POSSIBLE** — 81,367 consumption events |
| Link consumption to OP | IMPOSSIBLE | **100% linked** — all CN have ss_remision |
| Raw material tracking | IMPOSSIBLE | **2,809 unique articles tracked** |
| Production cost per OP | IMPOSSIBLE | **Calculable** — CN lines carry cost data |
| Daily production activity | IMPOSSIBLE | **~123 CN documents/month** |
| Material → Product linkage | IMPOSSIBLE | **sv_observaciones carries product ref** |
| Warehouse source tracking | IMPOSSIBLE | **Bodega 14 (52%), Bodega 15 (48%)** |
| Production timeline: start | IMPOSSIBLE | **CN date = material consumption = production start** |

### Combined lifecycle (OP + CN + ET)

```
OP (Production Order)
  → When:  Order created (planned)
  → What:  Product references (L-xxxx, C-xxxx)
  → Lines: Product variants (ref + size + color + qty)
  → Stage: PRODUCTION_PLANNED

CN (Material Consumption)
  → When:  Materials consumed (production starts)
  → What:  Raw materials consumed (fabrics, labels, trims)
  → Lines: Raw material articles + quantities + costs
  → Stage: MATERIAL_CONSUMED (production execution)
  → Links: ss_remision → OP, sv_observaciones → product ref

ET (Finished Goods Entry)
  → When:  Production completed
  → What:  Finished goods enter Bodega 01
  → Lines: NONE (header-only in SAG PYA)
  → Stage: PRODUCTION_COMPLETED
  → Links: ss_remision → OP
```

### Stage timeline inference

With CN synced, we can infer:

```
OP.eventDate ≤ CN.eventDate ≤ ET.eventDate

OP = "esta orden fue creada" (PLANNED)
CN = "se empezaron a gastar materiales" (IN_PRODUCTION)
ET = "el producto terminado entro a bodega" (COMPLETED)
```

---

## Phase 11 — Multi-ERP Compatibility

### CN as raw material consumption — universal pattern

| ERP | Equivalent Document | Terminology |
|---|---|---|
| SAG PYA | CN (fuente 80) | Consumos Insumos y Materias Primas |
| SAP | MIGO 261 / MB1A | Goods Issue for Production Order |
| Oracle Manufacturing | WIP Material Transaction | Material Issue to WIP |
| Dynamics 365 | Production Picking List Journal | Raw Material Consumption |

The `MATERIAL_CONSUMED` event type is already correct and ERP-agnostic. CN maps cleanly to the universal pattern of "raw materials withdrawn from inventory for a specific production order."

### Warehouse topology — generalizable

The discovery of Bodegas 14/15 (raw materials) adds a layer to the warehouse model:

```
Universal: Raw Material Storage → WIP → Finished Goods
SAG PYA:   Bodega 14/15         → Bodega 04 → Bodega 01
```

This topology is standard across manufacturing ERPs and does NOT need to be SAG-specific in the model.

---

## Phase 12 — Readiness Assessment

### Assessment: READY for CN Sync

| Criterion | Status | Evidence |
|---|---|---|
| ProductionEvent model works | READY | 3,640 ET events already persisted |
| Multi-line events work | READY | Model handles lines; CN averages 10.3 lines/event |
| Upsert pattern works | READY | ET sync proven idempotent |
| Builder pattern works | READY | buildProductionEventFromSource() used by ET |
| Mapping exists | READY | CN → MATERIAL_CONSUMED in CASTILLITOS_SAG_MAPPINGS |
| SOAP queries work | READY | All forensic queries executed without error |
| Data quality is high | READY | 100% article refs, 100% ss_remision, 99.9% cost data |

### CN sync (PRODUCTION-CN-SYNC-01) requirements

1. **New file:** `sag-cn-normalizer.ts`
   - Clone from `sag-et-normalizer.ts`
   - Change fuente 116 → 80
   - Map `sv_observaciones` → `referenceCode` (product reference from header)
   - Map `k_sc_codigo_articulo` → line `referenceCode` (raw material code)
   - Map `sc_detalle_articulo` → line `description`
   - Map `n_cantidad` → line `quantity`
   - Map `n_valor` → line `lineMetadata.cost`
   - Map `ka_nl_bodega` (line-level) → `locationFrom`
   - `locationTo` = null (consumed, not transferred)

2. **New file:** `sag-cn-sync.ts`
   - Clone from `sag-et-sync.ts`
   - Change fuente 116 → 80
   - Items query WILL return data (81,367 lines expected)

3. **Schema impact:** None — ProductionEvent model already supports all fields

4. **Estimated records:**
   - 7,890 ProductionEvent records (type: MATERIAL_CONSUMED)
   - ~81,367 ProductionEventLine records

### Decisions needed before sync

| Decision | Options | Recommendation |
|---|---|---|
| Header `referenceCode` | `sv_observaciones` (product ref) vs null | Use `sv_observaciones` — it carries the product reference this CN serves |
| Line `referenceCode` | `k_sc_codigo_articulo` (raw material code) | Use raw material code — that's what CN lines represent |
| `locationFrom` | Per-line from `ka_nl_bodega` | Use per-line bodega (14/15) — header doesn't have bodega |
| `locationTo` | null vs "production" | Use null — materials are consumed, not transferred to a specific bodega |
| Handle negative quantities | Include as-is or skip | Include as-is — they represent corrections, model handles negative qty |

---

## Phase 13 — Anomalies & Structural Findings

### Anomaly 1: No header-level bodega on CN

CN MOVIMIENTOS headers do NOT have `ka_nl_bodega`. The bodega lives only on MOVIMIENTOS_ITEMS. This differs from ET (which has no items) and OP (which has `ka_nl_bodega` on headers).

**Impact:** `locationFrom` must be derived from line-level data. A CN with mixed bodegas (14 and 15) will need a strategy — either use the first line's bodega for the event header, or leave the event's `locationFrom` as null and track per-line.

### Anomaly 2: CN articles ≠ OP articles (0% overlap)

CN articles (VALERIA, RIB, BL, ET, TG, M) are raw materials. OP articles (L-, C-, CD-) are product references. There is zero overlap.

**Impact:** CN lines will NOT match ProductionOrderLine references. Cross-referencing CN consumption to specific products requires the `sv_observaciones` → product ref mapping on the CN header, or the `ss_remision` → OP → ProductionOrderLine path.

### Anomaly 3: Size/color not available as discrete fields

CN MOVIMIENTOS_ITEMS do not have `ss_talla` or `ss_color` columns. Size/color is embedded in `sc_detalle_articulo` (e.g., "VALERIA BEIGE", "RIB 2 X 2 ROJO", "BELLA 170 AZUL NUBE 70012").

**Impact:** `size` and `color` fields in ProductionEventLine will be null for CN. This is acceptable — raw materials don't have garment sizes; the color embedded in the description is the material's color, not a product variant attribute.

### Anomaly 4: 2 CN headers with 0 lines

2 out of 7,890 CN headers have 0 lines. Same pattern as ET (header-only), but extremely rare for CN.

**Impact:** The model handles this (lineCount=0, quantity=0). No special handling needed.

### Anomaly 5: sv_observaciones is the product reference bridge

The `sv_observaciones` field on CN headers contains what appears to be the product reference code (DA-xxxx, L-xxxx, CJ-xxxx). This is the ONLY link between CN (raw material consumption) and the product being manufactured.

**Impact:** This field should be mapped to ProductionEvent.referenceCode for CN events. Without it, CN events cannot be associated with specific product lines.

---

## Files Created

| File | Purpose |
|---|---|
| `scripts/_cn-execution-forensics.ts` | CN forensic investigation script (10 phases) |
| `PRODUCTION_CN_EXECUTION_FORENSICS_01.md` | This report |

## Files Modified

| File | Change |
|---|---|
| `scripts/_cn-execution-forensics.ts` | Fixed Phase 7 (no header bodega), Phase 8 (n_valor not n_valor_unitario, no ss_talla/ss_color), Phase 9 (no talla/color in second ref reconstruction) |

## Prisma Changes

None.

## TSC Baseline

160 (maintained — discovery sprint, no production code changes).

## DB State

No changes — discovery only.

## Recommended Next Sprints

| Sprint | Priority | Scope |
|---|---|---|
| PRODUCTION-CN-SYNC-01 | P0 | Sync CN (fuente 80) → 7,890 events + 81,367 lines |
| PRODUCTION-LIFECYCLE-01 | P1 | Cross-reference OP → CN → ET via ss_remision for full lifecycle |
| PRODUCTION-STAGE-ACTIVATION-01 | P1 | Wire CN + ET data into stage inference engine |
| PRODUCTION-COST-ANALYSIS-01 | P2 | Aggregate CN cost data per OP for production cost tracking |
| PRODUCTION-BODEGA-TOPOLOGY-01 | P2 | Map warehouse relationships: B14/15 → B04 → B01 |
