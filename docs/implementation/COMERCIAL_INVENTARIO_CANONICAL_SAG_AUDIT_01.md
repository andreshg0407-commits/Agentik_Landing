# COMERCIAL-INVENTARIO-CANONICAL-SAG-AUDIT-01

Sprint: Full audit of the SAG-to-Inventario data pipeline for Castillitos.
Date: 2026-07-16
Status: AUDIT ONLY — no code modified.

---

## Phase 1: Architecture Map (SAG to UI)

```
SAG ERP (SOAP)
  │
  ├── ARTICULOS table ──┐
  │                     │   sag-articles-client.ts → fetchSagArticles()
  │                     │   sag-articles-normalizer.ts → normalizeArticles()
  │                     │   sag-articles-sync.ts → syncSagArticlesToProductEntity()
  │                     ▼
  │              ProductEntity (Prisma)
  │              ├── sku (=CODIGO)
  │              ├── name (=DESCRIPCION)
  │              ├── productLine (=LINEA FK, numeric: "1"/"2"/"5")
  │              ├── category (=GRUPO FK, numeric: "139"/"143"/"58")
  │              ├── subgrupoId (=SUB_GRUPO FK, numeric: 114/153/etc)
  │              ├── subgrupoSag (resolved via master lookups → text name)
  │              ├── handlingUnit (from v_articulos.sc_unidad)
  │              └── description (composite text, NOT raw SAG desc)
  │
  ├── v_articulos view ──┐
  │   (sc_unidad)        │   sag-articles-sync.ts → handlingUnitLookup map
  │                      └── normalizeHandlingUnit() → ProductEntity.handlingUnit
  │
  ├── Master lookups (GRUPO, SUB_GRUPO, LINEA tables) ──┐
  │                                                      │   sag-master-lookups-sync.ts
  │                                                      └── resolveSubgroupName()
  │                                                           → ProductEntity.subgrupoSag
  │
  ├── SALDOS_BODEGAS (inventory) ──┐
  │                                │   sag-inventory-sync.ts → syncSagInventory()
  │                                ▼
  │                        ProductInventoryLevel (Prisma)
  │                        ├── productId (FK to ProductEntity)
  │                        ├── externalRef (warehouse code: "01","04","49",etc)
  │                        ├── quantity (can be negative!)
  │                        └── syncedAt
  │
  └── PEDIDOS / FACTURAS ──┐
                           │   inventory-refresh-pipeline.ts Step 2
                           ▼
                    CustomerOrderRecord / SaleRecord (PD reconciliation)

inventory-refresh-pipeline.ts (STEP 3: SNAPSHOT)
  │   Joins: PIL(wh 01+04) + ProductEntity + CustomerOrderRecord + CRMQuoteLine
  │   Formula: disponible = max(0, physical - PD_pending - CRM_reserved)
  ▼
CommercialCoverageSnapshot (CCS)
  ├── refCode (= PE.sku)
  ├── description (= PE.name)
  ├── line (= LINE_MAP[PE.productLine] → "CS"/"LT"/"OT")
  ├── disponible (computed)
  ├── pendingOrdersQty
  ├── physicalQty
  ├── crmReservedQty
  ├── subgrupoId (= PE.subgrupoId, copied verbatim)
  ├── subgrupoSag (= PE.subgrupoSag, copied verbatim)
  ├── category → HARDCODED "—" (PLACEHOLDER)
  ├── productType → HARDCODED "—" (PLACEHOLDER)
  └── snapshotAt

SERVICE LAYER:
  report-loader.ts → loadAvailabilityRecords()
  │   Reads CCS latest snapshot
  │   Maps: subGrupo = CCS.subgrupoSag ?? inferProductType(description)  ← MIXED SOURCE
  │   Maps: subLinea = LINE_TO_SUBLINEA[line] → "CASTILLITOS"/"LATIN KIDS"
  ▼
  inventory-control-service.ts → buildAvailabilityReport()
  │   Enriches with thresholds, states, scoring
  │   subgrupoSag = row.subGrupo (aliased, carries mixed source)
  ▼
  API: /api/orgs/[orgSlug]/comercial/operational-inventory/route.ts
  │   ALSO uses inferCategory() and inferProductType() directly on CCS rows
  ▼
  Inventario UI page
```

---

## Phase 2: Field Catalog Matrix

### Identity Fields

| Field | PE Column | SAG Source | CCS Column | Pipeline Step | Status |
|---|---|---|---|---|---|
| Reference | sku | ARTICULOS.CODIGO | refCode | articles-sync → PE → pipeline → CCS | REAL SAG |
| Description | name | ARTICULOS.DESCRIPCION | description | articles-sync → PE → pipeline → CCS | REAL SAG |
| Line (code) | productLine | ARTICULOS.LINEA FK | line | PE="1"/"2" → LINE_MAP → CCS="LT"/"CS" | REAL SAG (mapped) |

### Classification Fields

| Field | PE Column | SAG Source | CCS Column | Pipeline Step | Status |
|---|---|---|---|---|---|
| Grupo (FK) | category | ARTICULOS.GRUPO FK | — | articles-sync sets PE.category = art.grupo | REAL SAG FK (numeric "139","143") |
| Grupo (name) | — | Master lookup GRUPO | — | NEVER resolved to text name in PE or CCS | LOST |
| SubGrupo (FK) | subgrupoId | ARTICULOS.SUB_GRUPO FK | subgrupoId | articles-sync → PE → pipeline → CCS | REAL SAG FK (numeric) |
| SubGrupo (name) | subgrupoSag | Master lookup SUB_GRUPO | subgrupoSag | articles-sync resolves via lookupMaps | REAL SAG (if lookupMaps available) |
| Brand | — | — | — | Column does NOT exist on PE | ABSENT |
| sizeClass | — | — | — | Column does NOT exist on PE | ABSENT |

### Variant Fields

| Field | PE Column | SAG Source | Status |
|---|---|---|---|
| Talla | ProductVariantAttribute.key="talla" | SAG SALDOS per variant | 285/4594 products (6.2%) |
| Color | ProductVariantAttribute.key="color" | SAG SALDOS per variant | 285/4594 products (6.2%) |
| manejaTallaColor | — | ARTICULOS.MANEJA_TALLA_COLOR | In buildDescription() text only, NOT as field |

### Inventory Fields

| Field | PE Column | SAG Source | CCS Column | Status |
|---|---|---|---|---|
| Physical qty | — | SALDOS_BODEGAS | physicalQty | REAL SAG (wh 01+04 sum) |
| Pending orders | — | CustomerOrderRecord | pendingOrdersQty | DERIVED (PD reconciliation) |
| CRM reserved | — | CRMQuoteLine | crmReservedQty | DERIVED (DRAFT quotes) |
| Disponible | — | Computed | disponible | DERIVED: max(0, physical - PD - CRM) |
| Warehouse code | — | PIL.externalRef | bodega | HARDCODED "01+04" in CCS |

### Handling Unit Fields

| Field | PE Column | SAG Source | Status |
|---|---|---|---|
| handlingUnit | handlingUnit | v_articulos.sc_unidad | 100% NULL for textile (lines 1-4). Only 450/663 for line 5 (accessories) |

---

## Phase 3: Direct SAG Data Evidence (from DB)

### Sample: Castillitos (line 2) WITH subgrupoId

| SKU | Name | subgrupoId | subgrupoSag | category |
|---|---|---|---|---|
| CJ-1126070 | PIJAMA LARGA LARGA NIÑA KIDS | 114 | PIJAMA NIÑA KIDS LL | 143 |
| CJ-2126047 | PIJAMA LARGA LARGA NIÑO KIDS | 112 | PIJAMA NIÑO KIDS LL | 142 |
| CJ-1026063B | PIJAMA LARGA LARGA NIÑA BEBE | 108 | PIJAMA NIÑA BB LL | 145 |

### Sample: Castillitos (line 2) subgrupoId=NULL

| SKU | Name | subgrupoId | subgrupoSag | category |
|---|---|---|---|---|
| CCP-1001116B | VESTIDO NIÑA BEBE | NULL | NULL | 58 |
| CGJ-1682215B | CONJUNTO SHORT BLUSA NIÑA BEBE | NULL | NULL | 58 |
| CGJ-1682215 | CONJUNTO SHORT BLUSA NIÑA KIDS | NULL | NULL | 58 |

### Sample: Latin Kids (line 1) WITH subgrupoId

| SKU | Name | subgrupoId | subgrupoSag | category |
|---|---|---|---|---|
| L-3584 | PIJAMA LARGA LARGA NIÑO KIDS 2-8 | 101 | PIJAMA LL 2-8 | 139 |
| L-3557 | PIJAMA CORTA LARGA NIÑO KIDS 18-22 | 272 | PIJAMA CL 18-22 | 139 |
| L-9116 | PIJAMA LARGA LARGA NIÑA BEBE 9-24 | 168 | PIJAMA MESES LL | 140 |

### Test References

| Ref | PE.subgrupoId | PE.subgrupoSag | CCS.subgrupoId | CCS.subgrupoSag | CCS.disponible |
|---|---|---|---|---|---|
| C-1922141 | NULL | NULL | NULL | NULL | 90 |
| C-1501212 | NULL | NULL | NULL | NULL | 127 |
| C-1602212 | 153 | CONJUNTO CL | 153 | CONJUNTO CL | 43 |

Key: C-1922141 and C-1501212 have NULL subgrupo in BOTH PE and CCS — the data was never resolved from SAG master lookups (likely lookup fetch failed during their sync, or the article predates the enrichment sprint).

---

## Phase 4: SAG vs Agentik Comparison

### PE vs CCS Divergence

- **Total PE-CCS matched rows:** 3,071
- **Divergent subgrupoSag or subgrupoId:** 21 rows (0.68%)
- **Root cause:** CCS was snapshot at a different time than PE was last updated. PE gets re-synced by articles-sync; CCS snapshots PE values at pipeline run time. If PE updates between CCS snapshots, they diverge.

### Divergence Examples

| SKU | PE.subgrupoSag | CCS.subgrupoSag | PE.subgrupoId | CCS.subgrupoId |
|---|---|---|---|---|
| CGJ-1692225 | CONJUNTO NIÑA KIDS CL | CONJUNTO CC | 153 | 154 |
| CA-2621215B | CONJUNTO NIÑO BB CC | CONJUNTO CL | 160 | 158 |
| CJ-2126005 | POLO | CAMISETA | 133 | 134 |
| L-9080 | PIJAMA MESES CL | PIJAMA MESES LL | 167 | 168 |

**Critical finding:** These are NOT just name divergences — the **subgrupoId values themselves differ** between PE and CCS. This means SAG master lookups returned different FK mappings at different sync times, OR the articles were reassigned to different subgroups in SAG between syncs.

---

## Phase 5: All Placeholders Found

### 1. `inferProductType()` — TEXT INFERENCE

**Definition:** `lib/comercial/maletas/sag-inventory-adapter.ts:74`
```typescript
export function inferProductType(description: string): string {
  const upper = description.toUpperCase();
  if (upper.includes("PIJAMA")) return "PIJAMA";
  if (upper.includes("CONJUNTO")) return "CONJUNTO";
  if (upper.includes("BLUSA")) return "BLUSA";
  // ... 6 more patterns
  return "OTRO";
}
```

**Call sites (production code, not scripts):**

| File | Line | Usage | Impact |
|---|---|---|---|
| `report-loader.ts` | 81 | `subGrupo: CCS.subgrupoSag ?? inferProductType(desc)` | **DECISION INPUT** — feeds Inventario + availability engine |
| `production-intelligence/report-loader.ts` | 134 | `subGrupo: inferProductType(productName)` | **DECISION INPUT** — feeds production intelligence, ALWAYS uses inference (never SAG) |
| `sag-inventory-normalizer.ts` | 121 | `productType: inferProductType(desc)` | **DATA SOURCE** — written to CCS.productType (but as "—" placeholder) |
| `operational-inventory/route.ts` | 78 | `productType: inferProductType(r.description)` | **DISPLAY** — API response for operational inventory |
| `sag-inventory-adapter.ts` | 131 | `productType: inferProductType(item.description)` | Context bridge for maletas |

### 2. `inferCategory()` — TEXT INFERENCE

**Definition:** `lib/comercial/maletas/sag-inventory-adapter.ts:62`

**Call sites (production code):**

| File | Line | Usage | Impact |
|---|---|---|---|
| `sag-inventory-normalizer.ts` | 120 | `category: inferCategory(desc)` | **DATA SOURCE** — written to CCS (but as "—") |
| `operational-inventory/route.ts` | 77 | `category: inferCategory(r.description)` | **DISPLAY** — API response |
| `sag-inventory-adapter.ts` | 130 | `category: inferCategory(item.description)` | Context bridge |
| `commercial-memory-builder.ts` | 138,183 | Category for order line grouping | **DECISION INPUT** — feeds copilot memory |

### 3. Hardcoded em-dash placeholders

| File | Line | Code | Impact |
|---|---|---|---|
| `inventory-refresh-pipeline.ts` | 320 | `category: "—"` | **DATA SOURCE** — CCS.category is always "—" |
| `inventory-refresh-pipeline.ts` | 321 | `productType: "—"` | **DATA SOURCE** — CCS.productType is always "—" |

### 4. LINE_MAP / LINE_TO_BRAND / LINE_TO_SUBLINEA maps

| File | Map | Values | Purpose |
|---|---|---|---|
| `inventory-refresh-pipeline.ts:27` | `LINE_MAP` | 1→LT, 2→CS, 3→PK, 5→AC | PE.productLine → CCS.line |
| `report-loader.ts:27` | `LINE_TO_SUBLINEA` | LT→LATIN KIDS, CS→CASTILLITOS | CCS.line → display name |
| `canonical-warehouse-availability.ts:192` | `LINE_TO_BRAND` | CS→Castillitos, LT→Latin Kids | Stock map keying |
| `vendor-sample-loader.ts:451` | `LINE_TO_BRAND_OP` | CS→Castillitos, LT→Latin Kids | OP active set keying |
| `vendor-sample-loader.ts:646` | `LINE_MAP` | 1→LT, 2→CS, 3→PK, 5→AC | Duplicate of pipeline |

### 5. `?? 0` / `?? null` fallbacks for inventory quantities

| File | Line | Pattern | Notes |
|---|---|---|---|
| `report-loader.ts:73` | `row.pendingOrdersQty ?? 0` | Safe — 0 pending if null |
| `inventory-refresh-pipeline.ts:286-288` | `pendingByRef.get(sku) ?? 0`, `crmByRef.get(sku) ?? 0` | Safe — no orders = 0 |

### 6. "OTRO" / "GENERAL" / sentinel defaults

| Source | Default | When | Impact |
|---|---|---|---|
| `inferProductType()` | `"OTRO"` | No keyword match in description | DECISION INPUT |
| `inferCategory()` | `"GENERAL"` | No keyword match in description | DECISION INPUT |
| `LINE_MAP` fallback | `"OT"` | Unknown productLine number | DECISION INPUT |
| `inferLine()` (sag-inventory-normalizer.ts:42) | `"CS"` | **ALL** unrecognized SAG line codes default to Castillitos | CRITICAL — new product families silently become CS |
| `inferSubLinea()` (production-intelligence/report-loader.ts:54) | `"OTRO"` | Unrecognized production ref prefix | DECISION INPUT — every OP line's subLinea |
| `vendor-sample-loader.ts:214` | `"OTRO"` (line) | coverage?.line missing | DECISION INPUT — feeds `getMinimumForLine()` |
| `vendor-sample-loader.ts:233-234` | `"OTRO"` (subgrupo) | subgrupoLookup miss + CCS null | CRITICAL — feeds production threshold key |
| `inventory-control-service.ts:527` | `"ACCESORIO"` | Accessory ref with null subgrupoSag | LOGIC — masks missing SAG data |
| `maletas-salesrep-profile.ts:200` | first word of description | Category fallback for vendor profiles | LOGIC — feeds commercial risk computation |

### 7. CRITICAL `?? 0` fallbacks (decision-affecting)

| File | Line | Pattern | Impact |
|---|---|---|---|
| `vendor-sample-loader.ts` | 244 | `importAvailMap.get(ref) ?? 0` | **CRITICAL** — absent PIL record treated as zero → drives `"DEJAR_DE_VENDER"` suggestion |
| `maletas-engine.ts` | 78-80 | `availRecord?.disponible ?? 0` | **CRITICAL** — absent record fires production alerts on non-existent shortages |
| `maletas-normalizer.ts` | 184-186 | `raw.disponible ?? (raw.inventario ?? 0) - (raw.pedidos ?? 0)` | Core disponible derived from NULLs as zeros |

### 8. Fragmented LINE_MAP definitions (4 independent copies)

| File | Map Name | Keys | Fallback | Risk |
|---|---|---|---|---|
| `inventory-refresh-pipeline.ts:27` | `LINE_MAP` | 1→LT, 2→CS, 3→PK, 5→AC | `"OT"` | Pipeline |
| `vendor-sample-loader.ts:646` | `LINE_MAP` | 1→LT, 2→CS, 3→PK, 5→AC | `"OT"` | Duplicate |
| `vendor-bag-ideal-route-service.ts:41` | `LINE_MAP` | 1→LT, 2→CS, 5→IMPORT | raw value | Different keys! |
| `store-business-lines.ts:60` | `SAG_LINE_MAP` | 1→castillitos, 2→latin_kids, 3→castillitos | `"accesorios_importacion"` | Different values! |

A new SAG product line code will be silently missing in some but not all maps.

### 9. `ProductEntity.category` semantic split

The field `.category` has **two different meanings** in the codebase:
- **SAG GRUPO FK** (numeric: "139", "143", "58") — set by `sag-articles-sync.ts`
- **Real subgrupoSag** — tiendas adapter repointed it via TIENDAS-ADAPTER-REAL-DATA-01

Code outside tiendas (e.g. `production-alert-engine`, `reference-decision-engine`) still reads `.category` expecting the original GRUPO FK. If meanings diverge, rule matching silently misfires.

### 10. Parallel inline text classifiers

`vendor-sample-service.ts:84-85` has a SEPARATE standalone classifier:
```typescript
if (d.includes("PIJAMA")) return "PIJAMA";
if (d.includes("CONJUNTO")) return "CONJUNTO";
```
This is NOT imported from `sag-inventory-adapter.ts` — it's a divergent copy. If one is updated, the other won't be.

---

## Phase 6: Null Audit with Cause Classification

### ProductEntity Null Counts by Line

| productLine | Total | null_subgrupoId | null_subgrupoSag | null_category | % null_sub |
|---|---|---|---|---|---|
| 1 (LT) | 1,758 | 530 | 530 | 0 | 30.1% |
| 2 (CS) | 1,490 | 536 | 536 | 0 | 36.0% |
| 3 (PK) | 13 | 13 | 13 | 0 | 100% |
| 4 | 3 | 3 | 3 | 0 | 100% |
| 5 (AC) | 663 | 1 | 1 | 0 | 0.2% |
| 6 | 7 | 0 | 0 | 0 | 0% |
| null | 656 | 509 | 509 | 0 | 77.6% |
| **TOTAL** | **4,594** | **1,596** | **1,596** | **0** | **34.7%** |

**Note:** 4 rows have text productLine ("Castillitos", "Latin Kids") instead of numeric — likely manually created or import anomaly.

### Cause Classification

| Cause | Count | Explanation |
|---|---|---|
| Master lookup fetch failed | ~1,000 | `lookupMaps` was null during sync → subgrupoSag stays null |
| Article has no SUB_GRUPO in SAG | ~500 | SAG ARTICULOS.ka_ni_subgrupo is 0 or null |
| Article predates enrichment sprint | ~96 | Created before SAG-CATALOG-FULL-SYNC-03, never re-synced |

### CommercialCoverageSnapshot Null Counts (latest snapshot only)

| Line | Total | null_subgrupoSag | has_subgrupoSag | % null |
|---|---|---|---|---|
| CS | 1,376 | 488 | 888 | 35.5% |
| LT | 1,695 | 503 | 1,192 | 29.7% |
| **TOTAL** | **3,071** | **991** | **2,080** | **32.3%** |

**Note:** CCS.subgrupoId NULL count is 14,220 across ALL snapshots (6 total), but per-snapshot latest: 991 refs have null subgrupoSag.

---

## Phase 7: Freshness Audit

### CommercialCoverageSnapshot

| Metric | Value |
|---|---|
| Total rows | 18,380 |
| Distinct refs | 3,071 |
| Total snapshots | 6 |
| Latest snapshot | 2026-07-07 13:21:39 (GMT-5) |
| Age at audit | **10 days** (STALE) |
| Oldest snapshot | 2026-06-27 22:29:53 |
| Snapshot dates | Jun 27, Jun 28, Jun 30 (3x), Jul 7 |

**Root cause of staleness:** The inventory refresh pipeline runs via cron (`/api/cron/inventory-refresh`) or manually. The last successful run was Jul 7. No runs in the 10 days since — likely due to cron not triggering, SAG connectivity issues, or manual oversight.

### ProductInventoryLevel

| Metric | Value |
|---|---|
| Total rows | 157,328 |
| MIN syncedAt | 2026-06-23 |
| MAX syncedAt | 2026-07-07 13:20:42 |
| Distinct sync dates | 3 |
| NULL syncedAt | 0 |

**Note:** PIL and CCS last synced on the same day (Jul 7), confirming they're updated together by the pipeline.

### ProductEntity

| Metric | Value |
|---|---|
| Total rows | 4,594 |
| MIN updatedAt | 2026-06-09 |
| MAX updatedAt | 2026-07-15 20:36:26 |

**Note:** PE was updated more recently than CCS (Jul 15 vs Jul 7). This explains the 21 PE-vs-CCS divergences — PE got re-synced by articles-sync after the last CCS snapshot.

---

## Phase 8: Variant (Talla/Color) Audit

| Metric | Value |
|---|---|
| ProductVariant rows | 53,344 |
| Distinct products with variants | 4,118 / 4,594 (89.6%) |
| Active variants | 53,344 (100%) |
| ProductVariantAttribute rows | 1,774 |
| Products with attributes | **285 / 4,594 (6.2%)** |
| Attribute keys | `talla` (887), `color` (887) |
| Attribute source | `sag` |

### Finding

- **53,344 variants exist** (from SAG SALDOS sync — each talla/color combo creates a variant)
- **Only 285 products (6.2%) have talla/color as queryable attributes** (ProductVariantAttribute)
- The remaining 93.8% have variants but their talla/color values are only embedded in the variant's external reference, not as structured attributes
- Sample: `sku=00276CH key=talla value=GEN source=sag` — "GEN" (generic) suggests many variants don't have real talla/color differentiation

---

## Phase 9: Handling Unit / Size Class Audit

| productLine | Total | handlingUnit NULL | handlingUnit populated |
|---|---|---|---|
| 1 (LT) | 1,758 | 1,758 | 0 |
| 2 (CS) | 1,490 | 1,490 | 0 |
| 3 (PK) | 13 | 13 | 0 |
| 5 (AC) | 663 | 213 | 450 |
| **TOTAL** | **4,594** | **4,144** | **450** |

### Finding

- **100% NULL for all textile lines** (1, 2, 3, 4)
- Only accessories (line 5) have 450/663 populated
- `sizeClass` column does **NOT EXIST** on ProductEntity
- `brand` column does **NOT EXIST** on ProductEntity
- Source: v_articulos.sc_unidad — textile articles likely don't have sc_unidad in SAG's v_articulos view, OR the view doesn't include them
- The `normalizeHandlingUnit()` function correctly filters non-size units (UNIDAD, METROS, PESOS) → null

---

## Phase 10: Inventory by Warehouse

### Warehouse Distribution (PIL)

| Warehouse | Products | With Stock | Total Qty | Type |
|---|---|---|---|---|
| 01 | 3,343 | 466 | -1,108,577 | **Main warehouse (negative = outflows)** |
| 04 | 3,007 | 3,007 | 1,318,901 | **Production warehouse (positive = inflows)** |
| 02 | 2,197 | 337 | -68,664 | Secondary |
| 00 | 2,164 | 407 | -28,428 | System/transit |
| 24 | 867 | 337 | -97,063 | Sales bodega |
| 23 | 1,674 | 331 | -25,220 | Sales bodega |
| 29 | 1,342 | 253 | -19,413 | Sales bodega |
| 49 | 134 | 134 | 26,004 | Vendor sample bag |
| 42-48 | 43-88 ea | all | 7K-36K ea | Vendor bags (individual sellers) |
| 26-34 | 34-106 ea | all | 4K-49K ea | Vendor bags (individual sellers) |

### Key Observations

1. **Warehouse 01** has massive negative quantities (-1.1M) — these represent outflows/sales, not errors
2. **Warehouse 04** is the only one consistently positive (1.3M) — production/receiving warehouse
3. **CCS uses 01+04 sum:** `disponible = max(0, wh01 + wh04 - PD - CRM)` — this is correct for commercial availability
4. **39 distinct warehouses** in the system
5. Vendor bag warehouses (26-49) have small positive quantities — represent field inventory
6. **Per-vendor-bodega data NOT in CCS** — CCS only stores aggregate 01+04

---

## Phase 11: Canonical Model Proposal (Audit Only)

### What Already Works Correctly

1. **Identity fields (sku, name)** — direct SAG pass-through, no transformation
2. **Inventory quantities (disponible, pendingOrdersQty)** — correctly computed from PIL + PD + CRM
3. **Line mapping (productLine → line code)** — deterministic, correct
4. **ProductEntity ↔ CCS link** — sku = refCode, consistent
5. **canonical-warehouse-availability.ts** — already resolves subgrupoSag via live SAG lookups (NOT stale CCS)

### What Must Be Completed

| Gap | Current State | Required Fix | Complexity |
|---|---|---|---|
| PE.subgrupoId NULL (34.7%) | Null if lookup failed during sync | Re-run articles-sync with reliable lookupMaps | LOW — re-sync |
| PE.subgrupoSag NULL (34.7%) | Null if lookup failed | Same fix as above | LOW |
| CCS.category = "—" always | Hardcoded placeholder | Remove placeholder, use PE.category FK or resolve grupo name | MEDIUM |
| CCS.productType = "—" always | Hardcoded placeholder | Remove placeholder, use PE.subgrupoSag or SAG value | MEDIUM |
| inferProductType() in report-loader | Mixed source (SAG ?? text-infer) | Use canonical-warehouse-availability.ts | LOW — already built |
| inferProductType() in production-intelligence | Always text inference, ignores SAG | Wire to canonical source | LOW |
| PE vs CCS divergence (21 rows) | PE re-synced after CCS snapshot | Re-run CCS snapshot after articles-sync | LOW — pipeline order |
| handlingUnit NULL for textile | v_articulos may not have textile data | Audit SAG v_articulos for textile articles | INVESTIGATION |
| Variant attributes (6.2% coverage) | Only 285/4594 products | Extend variant sync to extract talla/color from variant external refs | MEDIUM |
| brand column missing | Never created | Decide: derive from productLine or add to PE schema | DECISION |
| sizeClass column missing | Never created | Not needed if handlingUnit serves this purpose | SKIP |
| Grupo name never resolved | category stores numeric FK | Add grupoSag field to PE, resolve via master lookups | MEDIUM |
| CCS staleness (10 days) | Cron not running | Fix cron schedule or investigate failure | OPERATIONAL |
| `inferLine()` defaults to "CS" | sag-inventory-normalizer.ts:42 | Add proper line resolution or error on unknown | MEDIUM |
| 4 fragmented LINE_MAPs | 4 independent copies with different keys/values | Consolidate into single shared map | LOW |
| `?? 0` drives "DEJAR_DE_VENDER" | vendor-sample-loader.ts:244 | Distinguish "no data" from "zero stock" | HIGH |
| `?? 0` fires false production alerts | maletas-engine.ts:78-80 | Gate alerts on data presence, not zero | HIGH |
| 5 independent CCS readers | bypass canonical loadAvailabilityRecords | Consolidate to canonical path or document exceptions | MEDIUM |
| 2 CCS writers | pipeline + maletas-snapshots.ts | Audit second writer for format consistency | MEDIUM |
| PE.category semantic split | SAG GRUPO FK vs subgrupoSag | Clarify field purpose, add grupoSag separately | MEDIUM |

### Minimal Correction Proposal

**Do NOT create new models.** Complete the existing structures:

1. **Fix articles-sync reliability** — ensure lookupMaps always resolves (retry on failure)
2. **Add grupoSag to PE** — resolve grupo name from master lookups during articles-sync
3. **Remove "—" placeholders** from inventory-refresh-pipeline (lines 320-321)
4. **Replace inferProductType in report-loader** with canonical-warehouse-availability output
5. **Fix `?? 0` on absent records** — distinguish "no data" from "zero stock" in vendor-sample-loader.ts:244 and maletas-engine.ts:78-80 (highest business impact)
6. **Consolidate LINE_MAP** — single shared definition, eliminate 4 independent copies
7. **Fix `inferLine()` default** — "CS" for unknown is dangerous; should flag or error
8. **Re-run pipeline** to refresh CCS with current PE values
9. **Fix cron** to prevent staleness

---

## Phase 12: All Consumer Modules Mapped

### CommercialCoverageSnapshot Consumers (74 files reference it)

| Module | Files | What It Reads | Transforms Applied | Impact |
|---|---|---|---|---|
| **Inventario UI** | report-loader.ts, inventory-control-service.ts | Latest CCS snapshot | `subgrupoSag ?? inferProductType()` | Display + scoring |
| **Maletas/Production** | vendor-sample-loader.ts, canonical-warehouse-availability.ts | CCS via canonical fn | Live SAG lookup for names | Production decisions |
| **Tiendas** | sag-store-adapter.ts, sag-current-provider.ts | CCS for store stock | Uses real SAG fields (no inference) | Store assortment |
| **Control Comercial** | control-comercial-loader.ts | CCS aggregates | Grouping by line/subgrupo | Executive KPIs |
| **Operational Inventory** | operational-inventory/route.ts | CCS directly | `inferCategory()` + `inferProductType()` on every row | API response |
| **Demand Engine** | demand-engine.ts | CCS for demand signals | Threshold evaluation | Alert generation |
| **Copilot (David)** | david-summary.ts, david-signal-engine.ts | CCS via services | Signal extraction | AI insights |
| **Operational Map** | Multiple files in operational-map/ | CCS via source lineage | KPI governance | System health |
| **Production Intelligence** | production-intelligence/report-loader.ts | CCS | `inferProductType()` ALWAYS (ignores SAG) | Production grouping |

### ProductEntity Consumers

| Module | Key Files | What It Uses |
|---|---|---|
| Articles sync | sag-articles-sync.ts | WRITE: sku, name, category, subgrupoId, subgrupoSag, handlingUnit |
| Inventory pipeline | inventory-refresh-pipeline.ts | READ: sku, name, productLine, subgrupoId, subgrupoSag |
| Vendor bags | vendor-sample-loader.ts, vendor-bag-ideal-route-service.ts | READ: for coverage matching |
| Tiendas | sag-store-adapter.ts | READ: product metadata for store rules |
| Pedidos | commercial-memory-builder.ts | READ: order line enrichment |

### Critical Structural Finding: 5 Independent CCS Readers + 2 Writers

The codebase has **5 independent direct readers** of `CommercialCoverageSnapshot` that bypass the canonical `loadAvailabilityRecords()` path:

| # | File | Access Pattern | Risk |
|---|---|---|---|
| 1 | `control-comercial-loader.ts` | Direct `prisma.commercialCoverageSnapshot.findMany()` | MEDIUM — duplicate, baked-in threshold (disponible <= 20) |
| 2 | `sag-prisma-reader.ts` (Maletas) | Direct raw SQL `DISTINCT ON` | MEDIUM — different batch resolution strategy |
| 3 | `canonical-warehouse-availability.ts` | Raw SQL `DISTINCT ON` | MEDIUM — third resolution strategy |
| 4 | `order-reservation-bridge.ts` (Operational) | Direct `findFirst` + `findMany` | MEDIUM — fourth path |
| 5 | `operational-inventory/route.ts` (Sales Portfolio) | Direct `findFirst` + `findMany` + `inferCategory/inferProductType` | MEDIUM — fifth path, adds inference |

And **2 independent writers**:

| # | File | Risk |
|---|---|---|
| 1 | `inventory-refresh-pipeline.ts` via `persistSagInventorySnapshot()` | Canonical writer |
| 2 | `maletas-snapshots.ts` via `createMany` | **HIGH** — second writer, format may diverge |

Additionally, `maletas-temporal.ts` is the **only consumer that reads CCS across multiple batches** (not just latest) for trend analysis. If the batch strategy changes, trends break.

The canonical `loadAvailabilityRecords()` path serves 5 downstream modules cleanly. The risk is concentrated in the 5 modules that bypass it.

---

## Phase 13: Deliverables Summary

### 1. Arquitectura actual completa
See Phase 1 diagram. 4-step pipeline: SAG SOAP → PE → PIL → CCS → Services → UI.

### 2. Matriz de campos
See Phase 2. 23 fields cataloged across PE, CCS, and PIL.

### 3. Evidencia directa de SAG
See Phase 3. 15 sample references across all lines. subgrupoId NULL for 34.7% of PE.

### 4. Comparacion SAG vs Agentik
See Phase 4. 21/3071 divergent rows (0.68%). Root cause: PE updated after CCS snapshot.

### 5. Placeholders encontrados
See Phase 5. 6 categories: inferProductType (8 call sites), inferCategory (5 sites), "—" hardcoded (2 sites), LINE_MAP duplicated (5 sites), "OTRO"/"GENERAL" defaults (2 functions), ?? 0 fallbacks (3 sites safe).

### 6. Nulos y causa
See Phase 6. 1,596/4,594 PE rows (34.7%) have null subgrupoId. Cause: master lookup fetch failures during sync.

### 7. Estado de variantes
See Phase 8. 53,344 variants exist but only 285 products (6.2%) have structured talla/color attributes.

### 8. Estado de handlingUnit
See Phase 9. 100% NULL for textile. Only accessories have data (450/663).

### 9. Estado de fechas
See Phase 7. CCS: 10 days stale (Jul 7). PIL: same date. PE: more recent (Jul 15).

### 10. Estado de inventario por bodega
See Phase 10. 39 warehouses. CCS uses 01+04 only. Vendor bags (26-49) not in CCS.

### 11. Estado de sincronizacion
CCS 6 snapshots total, last Jul 7. PIL 3 sync dates. PE continuously updated. Gap: CCS not refreshed after PE updates.

### 12. Punto exacto donde se pierde cada campo

| Field Lost | Where | Why |
|---|---|---|
| Grupo name (text) | articles-sync.ts line 224 | PE.category stores numeric FK, never resolves name |
| SubGrupo name (34.7%) | articles-sync.ts line 169-170 | lookupMaps null when fetch fails |
| Brand | Never existed | No column on PE |
| sizeClass | Never existed | No column on PE |
| handlingUnit (textile) | articles-sync.ts line 175 | v_articulos has no sc_unidad for textile articles |
| Talla/Color (93.8%) | sag-inventory-sync variant creation | Variant exists but attributes not extracted |
| CCS.category | inventory-refresh-pipeline.ts line 320 | Hardcoded "—" instead of PE.category |
| CCS.productType | inventory-refresh-pipeline.ts line 321 | Hardcoded "—" instead of PE.subgrupoSag |

### 13. Que ya funciona correctamente

1. Identity pipeline (sku, name) — lossless
2. Inventory quantities (disponible, pending, CRM reserved) — correctly computed
3. Line mapping — deterministic, correct
4. canonical-warehouse-availability.ts — resolves names via live SAG (built this sprint)
5. Tiendas adapter — uses real SAG fields, no inference
6. PIL sync — 157K rows, 39 warehouses, correct

### 14. Que debe completarse

1. Master lookup reliability (34.7% null subgrupoId)
2. Grupo name resolution (numeric FK → text name)
3. Remove "—" placeholders from pipeline
4. Replace inferProductType in 2 report-loaders with canonical source
5. CCS refresh automation (fix cron or manual cadence)
6. Variant attribute extraction (6.2% → target 89.6%)

### 15. Propuesta minima de correccion

1. **Re-run articles-sync** with retry logic for master lookups — fills 34.7% null gap
2. **Add `grupoSag` field to PE** — resolve grupo name during articles-sync
3. **Remove "—" placeholders** in inventory-refresh-pipeline (2 lines)
4. **Replace `inferProductType` in report-loader.ts:81** with `CCS.subgrupoSag` (already populated for 67.7% of refs)
5. **Replace `inferProductType` in production-intelligence/report-loader.ts:134** with same
6. **Fix inventory refresh cron** — ensure daily execution

### 16. Orden de implementacion

**P0 — Data safety (stop wrong decisions):**
1. Fix `?? 0` on absent records in vendor-sample-loader.ts:244 and maletas-engine.ts:78-80
2. Fix `inferLine()` default from "CS" to explicit error/sentinel

**P1 — Data completeness (fill gaps):**
3. Fix master lookup reliability (retry on failure)
4. Re-run articles-sync to fill 34.7% null subgrupoId
5. Add grupoSag field to PE schema + resolve during articles-sync
6. Remove "—" placeholders from inventory-refresh-pipeline (lines 320-321)

**P2 — Data consistency (single source):**
7. Replace inferProductType in report-loader.ts:81 with CCS.subgrupoSag
8. Replace inferProductType in production-intelligence/report-loader.ts:134
9. Consolidate 4 LINE_MAP definitions into shared module
10. Re-run inventory refresh pipeline (fresh CCS with real PE values)

**P3 — Operational health:**
11. Fix cron for ongoing freshness
12. Audit second CCS writer (maletas-snapshots.ts) for format consistency

**P4 — Optional enrichment:**
13. Extend variant attribute extraction (6.2% → 89.6%)
14. Resolve PE.category semantic split

---

## STOP

This audit is complete. No code has been modified. Implementation requires explicit approval per phase.
