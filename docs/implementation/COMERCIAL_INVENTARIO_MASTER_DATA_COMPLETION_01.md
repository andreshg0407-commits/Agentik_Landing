# COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01

Sprint: Complete canonical inventory master data layer from SAG.
Severity: **CRITICAL**
Predecessor: COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 (IN_REVIEW, V1–V6 BLOCKED_BY_MASTER_DATA)

## Core rule

**Inventario debe ser la fuente canonica de datos comerciales.**

---

## FASE 1 — CONGELAR CONSUMIDORES

Status: **COMPLETE**

Safety Lock validations V1–V6 marked as `BLOCKED_BY_MASTER_DATA`.
Consumers remain protected:
- Produccion: gated by EN_VALIDACION
- Recompra: gated by SIN_DATOS
- Oportunidades: only canonical data
- Maletas: only known availability

---

## FASE 2 — INVENTARIO DE LO YA IMPLEMENTADO

### A. ProductEntity (Prisma model)

| Campo | Tipo | Fuente SAG | Estado | Consumidores |
|---|---|---|---|---|
| `name` | String | ARTICULOS.sc_detalle_articulo | FUNCIONAL | UI, search, exports |
| `sku` | String? | ARTICULOS.k_sc_codigo_articulo | FUNCIONAL | Identity, lookups |
| `category` | String? | ARTICULOS.ka_ni_grupo (numeric FK) | PARCIAL — stores numeric FK, NOT group name | Maletas, Production (as group key) |
| `productLine` | String? | ARTICULOS.ka_nl_linea (numeric FK) | FUNCIONAL | Line classification |
| `description` | String? | Built from sync metadata | FUNCIONAL | Display only |
| `price` | Float? | ARTICULOS.n_valor_venta_normal | FUNCIONAL | Pricing |
| `subgrupoId` | Int? | ARTICULOS.ka_ni_subgrupo | PARCIAL — 32.3% null in CCS | Maletas, Production |
| `subgrupoSag` | String? | SUBGRUPOS.sc_detalle_subgrupo via lookup | PARCIAL — depends on lookup success | Maletas, Production |
| `handlingUnit` | String? | v_articulos.sc_unidad | PARCIAL — depends on v_articulos fetch | Import size class |
| `externalSource` | String? | "sag" | FUNCIONAL | Identity |
| `externalId` | String? | CODIGO | FUNCIONAL | Identity |
| `commercialStatus` | String | Derived from activo+bloqueado | FUNCIONAL | Lifecycle |
| `status` | String | "approved" | FUNCIONAL | Lifecycle |

**MISSING from ProductEntity (not in schema):**

| Campo necesario | Fuente SAG | Estado |
|---|---|---|
| `grupoId` (Int?) | ka_ni_grupo | VACÍO — `category` stores the FK as string but no dedicated field |
| `grupoSag` (String?) | GRUPOS.sc_detalle_grupo via lookup | VACÍO — never resolved |
| `lineaId` (Int?) | ka_nl_linea | VACÍO — `productLine` stores FK as string |
| `lineaSag` (String?) | LINEAS.ss_linea via lookup | VACÍO — never resolved |
| `sublineaId` (Int?) | Not in SAG ARTICULOS | N/A — SAG has no sublínea FK |
| `sublineaSag` (String?) | Derived from line map | PLACEHOLDER — inferred, not from SAG |
| `createdAtSag` (DateTime?) | Not confirmed in ARTICULOS | VACÍO — SAG may not expose creation date |
| `lastPurchaseDateSag` (DateTime?) | MOVIMIENTOS by fuente | VACÍO — requires query |
| `lastSaleDateSag` (DateTime?) | MOVIMIENTOS by fuente | VACÍO — requires query |
| `barcode` (String?) | Not in ARTICULOS | VACÍO — may be in v_articulos or variant-level |
| `description2` (String?) | ss_detalle_artic2 | VACÍO — field exists in SAG but not persisted |
| `manejaTallaColor` (Boolean?) | sc_maneja_tallas | VACÍO — normalized but not persisted to ProductEntity |
| `costo` (Float?) | nd_costo_std | VACÍO — normalized but not persisted |

### B. ProductVariant (Prisma model)

| Campo | Tipo | Fuente SAG | Estado |
|---|---|---|---|
| `sku` | String? | ka_nl_sku | EXISTS but rarely populated from SAG |
| `name` | String | Display name | EXISTS |
| `attributes` | Json? | Legacy snapshot | EXISTS |
| `externalSource` | String? | "sag" | EXISTS |
| `externalId` | String? | SKU ID | EXISTS |

**Variant sync status: NO DB WRITES.** `syncSagVariants()` returns in-memory only (`dryRun: true` default). ProductVariant rows are NOT created from SAG data. Variants exist only from Marketing Studio / manual creation.

### C. ProductVariantAttribute (Prisma model)

| Campo | Tipo | Estado |
|---|---|---|
| `key` | String | "talla", "color" | EXISTS |
| `value` | String | Normalized value | EXISTS |
| `source` | String | "sag" / "manual" | EXISTS |
| `externalRef` | String? | Raw SAG value | EXISTS |

**Status: EMPTY from SAG.** No SAG variant sync writes to this model.

### D. ProductInventoryLevel (Prisma model)

| Campo | Tipo | Fuente SAG | Estado |
|---|---|---|---|
| `productId` | String | FK to ProductEntity | FUNCIONAL |
| `variantId` | String? | FK to ProductVariant | VACÍO — no variant-level inventory |
| `warehouseId` | String | Bodega code | FUNCIONAL |
| `quantity` | Int | Saldo actual | FUNCIONAL |
| `reservedQty` | Int | Reservado | PARCIAL |
| `source` | String | "sag" | FUNCIONAL |
| `externalRef` | String? | Bodega code | FUNCIONAL |
| `syncedAt` | DateTime? | Sync timestamp | FUNCIONAL |

**Status: FUNCIONAL at product level, VACÍO at variant level.**

### E. CommercialCoverageSnapshot (Prisma model)

| Campo | Tipo | Fuente SAG | Estado |
|---|---|---|---|
| `refCode` | String | CODIGO | FUNCIONAL |
| `description` | String | DESCRIPCION | FUNCIONAL |
| `line` | String | Resolved line code | FUNCIONAL |
| `disponible` | Int | Available stock | FUNCIONAL |
| `subgrupoId` | Int? | ka_ni_subgrupo | PARCIAL — 32.3% null |
| `subgrupoSag` | String? | Resolved name | PARCIAL |
| `pendingOrdersQty` | Int? | PD demand | FUNCIONAL |
| `physicalQty` | Int? | B01+B04 gross | FUNCIONAL |
| `snapshotAt` | DateTime | Batch timestamp | FUNCIONAL — last: Jul 7 (~10 days stale) |

**MISSING from CCS:** grupoId, grupoSag, handlingUnit, createdAtSag, warehouseCode breakdown, variant-level data.

### F. SAG Sync Infrastructure

| Componente | Archivo | Estado |
|---|---|---|
| Article sync | `sag-articles-sync.ts` | FUNCIONAL — writes ProductEntity |
| Article normalizer | `sag-articles-normalizer.ts` | FUNCIONAL |
| Article client | `sag-articles-client.ts` | FUNCIONAL |
| Master lookups sync | `sag-master-lookups-sync.ts` | FUNCIONAL — in-memory only, no DB |
| Master lookups normalizer | `sag-master-lookups-normalizer.ts` | FUNCIONAL |
| Variant sync | `sag-variants-sync.ts` | PARCIAL — in-memory only, no DB writes |
| Variant normalizer | `sag-variants-normalizer.ts` | FUNCIONAL |
| Variant inventory query | `sag-variants-types.ts` | FUNCIONAL — SQL confirmed |
| Inventory refresh pipeline | `inventory-refresh-pipeline.ts` | FUNCIONAL — writes PIL + CCS |
| Inventory storage | `sag-inventory-storage.ts` | FUNCIONAL — CCS writer |
| Inventory normalizer | `sag-inventory-normalizer.ts` | FUNCIONAL |

### G. SAG Tables Confirmed (LIVE — Jul 16 2026)

| Tabla/Vista | PK | Campos clave | Filas | Status |
|---|---|---|---|---|
| ARTICULOS | ka_nl_articulo / k_sc_codigo_articulo | 182 fields per row; DESCRIPCION, ka_ni_grupo, ka_ni_subgrupo, ka_nl_linea, sc_maneja_tallas, sc_activo, nd_costo_std, dd_fecha_ult_modificacion, ss_detalle_artic2, ss_codigo_barras, d_ultima_compra, d_ultima_venta | **10,509** | validated |
| v_articulos | ka_nl_articulo | sc_unidad (handling unit); PV3/PV4 NOT via n_valor_venta_promocion/nd_valor_venta4 (column names differ) | same | partial — column name mismatch |
| GRUPOS | ka_ni_grupo | sc_detalle_grupo | **31** | validated |
| SUBGRUPOS | ka_ni_subgrupo | sc_detalle_subgrupo, ka_ni_grupo (FK→GRUPOS) | **280** | validated |
| LINEAS | ka_nl_linea | ss_linea | **6** (LATIN KIDS, CASTILLITOS, OTROS, POWER, IMPORTACION, PIJAMAS DAMA) | validated |
| TALLAS | ka_nl_talla | ss_codigo, ss_talla | **36** | validated |
| COLORES | ka_nl_color | ss_codigo, ss_nombre | **89** | validated |
| BODEGAS | ka_nl_bodega | ss_codigo, ss_nombre | **49** | validated |
| MARCAS | ka_nl_marca | ss_marca | **3** | validated |
| MOVIMIENTOS | ka_nl_movimiento | d_fecha_documento, ka_ni_fuente, sc_anulado | many | validated |
| MOVIMIENTOS_ITEMS | ka_nl_movimiento + ka_nl_articulo | ss_talla, ss_color, ka_nl_bodega, n_cantidad, ka_nl_sku | many | validated |
| FUENTES | ka_ni_fuente | sc_signo_inventario, sc_afecta_inventario | ~100 | validated |

**NEW DISCOVERIES (Fase 3 audit):**
- ARTICULOS has **182 fields** per row (far more than initially documented)
- d_ultima_compra and d_ultima_venta exist directly in ARTICULOS (no MOVIMIENTOS query needed for dates)
- ss_codigo_barras exists in ARTICULOS (barcode IS available)
- 6 LINEAS not 5: line 4=POWER, line 6=PIJAMAS DAMA previously unknown
- v_articulos PV3/PV4 column names are NOT n_valor_venta_promocion/nd_valor_venta4 in SELECT — need column discovery

### H. Crons and Scripts

| Componente | Archivo | Estado |
|---|---|---|
| Inventory refresh cron | `app/api/cron/inventory-refresh/route.ts` | FUNCIONAL — daily 5AM UTC |
| Catalog sync script | `scripts/_sag-catalog-full-sync.ts` | FUNCIONAL — manual sync |
| Subgroup backfill | `scripts/_backfill-sag-subgroups.ts` | FUNCIONAL |
| Coverage resync | `scripts/_resync-coverage-snapshot.ts` | FUNCIONAL |
| Full inventory refresh | `scripts/_full-inventory-refresh.ts` | FUNCIONAL |
| Variant forensics | `scripts/_sag-variants-forensics.ts` | FUNCIONAL — diagnostic only |
| Catalog forensics | `scripts/_sag-catalog-forensics.ts` | FUNCIONAL — diagnostic only |

**NO article sync cron exists.** Article sync is manual-only via scripts.

### I. Key Gaps Summary

| Gap | Severity | Root Cause |
|---|---|---|
| **grupoId/grupoSag missing from ProductEntity** | CRITICAL | `category` stores numeric FK; grupo name never resolved/persisted |
| **Variants not persisted from SAG** | CRITICAL | `syncSagVariants()` is dryRun-only; no DB writes implemented |
| **Dates missing** | HIGH | SAG ARTICULOS has dd_fecha_ult_modificacion but no creation date; sale/purchase dates require MOVIMIENTOS query |
| **description2 not persisted** | MEDIUM | ss_detalle_artic2 available in normalizer but not passed to upsert |
| **manejaTallaColor not persisted** | HIGH | Normalized but not saved — needed to know which refs SHOULD have variants |
| **costo not persisted** | MEDIUM | Normalized but not saved to ProductEntity |
| **lineaSag (line name) not resolved** | MEDIUM | Numeric FK stored but name never looked up |
| **barcode not available** | LOW | Not in ARTICULOS; may exist at variant level (ka_nl_sku) |
| **Article sync not automated** | HIGH | No cron for catalog sync; only manual scripts |
| **CCS stale (Jul 7)** | HIGH | Cron may be failing; needs investigation |

---

## FASE 3 — AUDITORÍA DIRECTA DE SAG

Status: **COMPLETE** (Jul 16 2026)

Script: `scripts/_audit-master-data-completion.ts`

### Sample: 31 references (10 CS + 10 LT + 10 Import/Other + CL-2541363)

### Catalog size: **10,509 ARTICULOS** (previous estimate was ~3,000+)

### Distribution by line:
| Line FK | Line Name | Count |
|---|---|---|
| 2 | CASTILLITOS | 2,945 |
| 1 | LATIN KIDS | 2,453 |
| 5 | IMPORTACION | (part of 5,110) |
| 3 | OTROS | (part of 5,110) |
| 4 | POWER | (part of 5,110) |
| 6 | PIJAMAS DAMA | (part of 5,110) |
| (none) | No line assigned | ~6,301 (60%) |

### MANEJA_TALLA_COLOR distribution: 5,148 / 10,509 (49%)
| Line | Refs with talla/color |
|---|---|
| CASTILLITOS | 1,597 |
| LATIN KIDS | 1,889 |
| IMPORTACION | 662 |
| (no line) | 972 |
| POWER | 13 |
| PIJAMAS DAMA | 14 |

### Mandatory ref CL-2541363:
- SAG: grupo FK=142 → "CS NIÑO KIDS", subgrupo=188 → "BERMUDA", linea=2 → "CASTILLITOS"
- Agentik ProductEntity: category="142" (BUG — numeric FK stored as string)
- BUG CONFIRMED: category should be grupoSag="CS NIÑO KIDS"

### New SAG fields discovered in ARTICULOS (182 total fields):
| Field | Value | Notes |
|---|---|---|
| d_ultima_compra | DateTime | Last purchase date — NO MOVIMIENTOS query needed |
| d_ultima_venta | DateTime | Last sale date — NO MOVIMIENTOS query needed |
| ss_codigo_barras | String | Barcode IS available at article level |
| ss_detalle_artic2 | String | Secondary description (variant/color name) |
| dd_fch_primer_vez | DateTime | First creation date — confirmed available |

---

## FASE 4 — FIELD AVAILABILITY MATRIX

Status: **COMPLETE** (Jul 16 2026)

| Field | Total | With data | Coverage |
|---|---|---|---|
| codigo | 10,508 | 10,507 | 100% |
| descripcion | 10,508 | 10,508 | 100% |
| grupo (FK) | 10,508 | 10,508 | **100%** |
| subGrupo (FK) | 10,508 | 3,359 | **32%** |
| linea (FK) | 10,508 | 4,207 | **40%** |
| precio | 10,508 | 4,591 | **44%** |
| costo | 10,508 | 3,384 | **32%** |
| manejaTallaColor | 10,508 | 5,148 | **49%** |
| fechaModificacion | 10,508 | 10,508 | **100%** |
| handlingUnit (v_articulos) | 10,508 | 0 | **0%** — v_articulos SELECT failed (column name mismatch) |

---

## FASE 5 — SAG vs AGENTIK COMPARISON

Status: **COMPLETE** (Jul 16 2026)

### Comparison results (31 sample refs):
- ProductEntity matches: **16 / 31** (15 missing — non-commercial refs filtered during sync)
- CCS matches: **10 / 31**
- Total fields compared: **240**
- Matching: **128**
- Data loss: **108** instances

### Systematic data loss patterns (all 16 matched refs affected):

| Field | SAG has | Agentik has | Root cause |
|---|---|---|---|
| grupoId | FK value (e.g. 142) | EMPTY | NOT IN SCHEMA |
| grupoSag | Resolved name (e.g. "CS NIÑO KIDS") | EMPTY | NEVER RESOLVED |
| lineaId | FK value (e.g. 2) | EMPTY | NOT IN SCHEMA |
| lineaSag | Resolved name (e.g. "CASTILLITOS") | EMPTY | NEVER RESOLVED |
| costo | Cost value (e.g. 16319) | EMPTY | NOT PERSISTED |
| manejaTallaColor | S/N flag | EMPTY | NOT PERSISTED |
| fechaModificacion | ISO datetime | EMPTY | NOT PERSISTED |

---

## Sprint status: FASE 3+4+5 COMPLETE, FASE 6 NEXT

### Completed
- Fase 1: Consumers frozen, V1–V6 BLOCKED_BY_MASTER_DATA
- Fase 2: Complete infrastructure audit
- Fase 3: Direct SAG audit — 31 refs, 10,509 articles, 182 fields confirmed
- Fase 4: Field availability matrix — grupo 100%, subgrupo 32%, linea 40%
- Fase 5: SAG vs Agentik comparison — 108 data loss instances, 7 systematic patterns

### Next: Fase 7+ (schema migration applied, backfill pending)

---

## FASE 6 — FIX ARTICLE SYNC

Status: **COMPLETE** (Jul 16 2026)

### Prisma schema changes (ProductEntity):

| Field | Type | Source | Status |
|---|---|---|---|
| `grupoId` | Int? | ka_ni_grupo | NEW |
| `grupoSag` | String? | GRUPOS.sc_detalle_grupo via lookup | NEW |
| `lineaId` | Int? | ka_nl_linea | NEW |
| `lineaSag` | String? | LINEAS.ss_linea via lookup | NEW |
| `costo` | Float? | nd_costo_std | NEW |
| `manejaTallaColor` | Boolean | sc_maneja_tallas | NEW (default false) |
| `lastModifiedSag` | DateTime? | dd_fecha_ult_modificacion | NEW |
| `createdAtSag` | DateTime? | dd_fch_primer_vez | NEW |
| `lastPurchaseSag` | DateTime? | d_ultima_compra | NEW |
| `lastSaleSag` | DateTime? | d_ultima_venta | NEW |
| `barcode` | String? | ss_codigo_barras | NEW |
| `description2` | String? | ss_detalle_artic2 | NEW |

### Migration: `20260717100000_product_master_data_fields`

### Files modified:
| File | Change |
|---|---|
| `prisma/schema.prisma` | 12 new fields on ProductEntity |
| `sag-articles-types.ts` | Added fechaCreacion, ultimaCompra, ultimaVenta, descripcion2, codigoBarras to SagArticleNormalized |
| `sag-articles-normalizer.ts` | Extracts dd_fch_primer_vez, d_ultima_compra, d_ultima_venta, ss_detalle_artic2, ss_codigo_barras |
| `sag-articles-sync.ts` | Resolves grupoSag/lineaSag via lookups; persists all 12 new fields; imports resolveGroupName/resolveLineName |
| `line-map.ts` | Updated SAG_LINE_FK_MAP: 3→OT (was PK), 5→IM (was AC), added 4→PW, 6→PD |

### SAG_LINE_FK_MAP updated:
| FK | Old code | New code | SAG name |
|---|---|---|---|
| 1 | LT | LT | LATIN KIDS |
| 2 | CS | CS | CASTILLITOS |
| 3 | PK | OT | OTROS |
| 4 | — | PW | POWER |
| 5 | AC | IM | IMPORTACION |
| 6 | — | PD | PIJAMAS DAMA |
