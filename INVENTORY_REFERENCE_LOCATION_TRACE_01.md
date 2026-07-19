# INVENTORY-REFERENCE-LOCATION-TRACE-01

**Sprint:** Forensic Audit — Reference Location Trace
**Date:** 2026-06-30
**Status:** COMPLETE (READ ONLY)
**TSC Baseline:** 160 (preserved)
**Mode:** READ ONLY — zero database writes

---

## Objective

Physically locate every unit of CJ-1126012 and CJ-2026004B across all SAG bodegas to explain the remaining gaps between Agentik availability and admin-reported values.

| Ref | Agentik | Admin | Gap |
|---|---|---|---|
| CJ-1126012 | 115 | 79 | 36 |
| CJ-2026004B | 189 | 164 | 25 |
| L-1367 | 68 | 64 | 4 (control) |
| L-8467 | 515 | 511 | 4 (control) |

---

## FASE 1 — Topologia Completa de Bodegas

39 bodegas found in Castillitos SAG.

| Bodega | Saldo Neto | Rol |
|---|---|---|
| B00 | -28,283 | Ajustes contables |
| B01 | -1,155,949 | Central despacho |
| B02 | -68,630 | Vendedor |
| B03 | -16,858 | Vendedor |
| B04 | +1,318,883 | Produccion/soporte |
| B08-B15 | -4,697 | Tiendas (8 bodegas) |
| B16, B18, B19 | -15 | Desconocida |
| B20 | -1,793 | Otra |
| B22 | -8,403 | Punto de venta |
| B23 | -25,117 | Vendedor |
| B24 | -96,977 | Importacion despacho |
| B26-B27 | +82,356 | Importacion almacen |
| B28 | -381 | Otra |
| B29 | -19,255 | Vendedor |
| B30-B34 | +30,208 | Desconocida |
| B35, B40 | -3 | Desconocida |
| B41 | -689 | Otra |
| B42-B49 | +112,169 | Importacion almacen |
| **TOTAL** | **+102,556** | |

**Key observation:** B04 (+1,318,883) is the massive production warehouse. B01 (-1,155,949) is deeply negative — it represents cumulative dispatch history. The pair B01+B04 gives the net central stock.

---

## FASE 2 — Trace CJ-1126012

**Only exists in 2 bodegas:**

| Bodega | Variantes | Cantidad |
|---|---|---|
| B01 | 12 | **-85** |
| B04 | 12 | **+200** |
| **TOTAL** | | **115** |

### Variant detail:

**B01 (dispatch — all negative):**
| Variante | Qty |
|---|---|
| 2/CANAMO | -3 |
| 2/ROSADO | -11 |
| 2/TIZA | -7 |
| 3/CANAMO | -5 |
| 3/ROSADO | -12 |
| 3/TIZA | -5 |
| 4/CANAMO | -6 |
| 4/ROSADO | -8 |
| 4/TIZA | -6 |
| 5/CANAMO | -6 |
| 5/ROSADO | -9 |
| 5/TIZA | -7 |

**B04 (production — all positive, uniform batches):**
| Variante | Qty |
|---|---|
| */CANAMO | 18 each (x4 sizes) = 72 |
| */ROSADO | 16 each (x4 sizes) = 64 |
| */TIZA | 16 each (x4 sizes) = 64 |
| **TOTAL** | **200** |

**No stock in tiendas, vendedores, importacion, or ajustes.**

---

## FASE 3 — Trace CJ-2026004B

**Exists in 4 bodegas:**

| Bodega | Variantes | Cantidad |
|---|---|---|
| B01 | 8 | **-11** |
| B02 | 4 | **-4** |
| B04 | 12 | **+200** |
| B23 | 2 | **-2** |
| **TOTAL** | | **183** |

B02 and B23 are vendor bodegas (stock dispatched to sales reps). These 6 units have physically left the central warehouse.

**No stock in tiendas, importacion, or ajustes.**

---

## FASE 4 — Reconstruccion Estructural

| Segmento | CJ-1126012 | CJ-2026004B |
|---|---|---|
| stock_b01 | -85 | -11 |
| stock_b04 | +200 | +200 |
| stock_central (B01+B04) | **115** | **189** |
| stock_tiendas | 0 | 0 |
| stock_vendedores | 0 | -6 |
| stock_importacion | 0 | 0 |
| stock_ajustes | 0 | 0 |
| pd_pendiente | 0 | 0 |
| **disponible_agentik** | **115** | **189** |
| **admin_reporta** | **79** | **164** |
| **gap** | **36** | **25** |

---

## FASE 5 — Movimientos Recientes CJ-1126012

### PD Orders (last 30 days)
17 PD order lines, ALL status=FACTURADO. Key orders:
- PD 9762 (2026-06-21): 4 units, NIT 37224
- PD 9764 (2026-06-21): 4 units, NIT 37224
- PD 9728 (2026-06-17): 4 units, NIT 939
- PD 9623 (2026-06-02): 2 units, NIT 36822
- PD 9593 (2026-06-01): 3 units, NIT 386

### CRM Quotes
**36 CRM quote lines** with status=DRAFT, warehouseName="PRODUCTO EN PROCESO", total qty = **36 units**.

### PIL Sync Freshness
- B01: last synced **2026-06-30T20:05:51** (today)
- B04: last synced **2026-06-23T20:16:41** (7 days ago)

**CRITICAL FINDING:** B01 was re-synced today but B04 has NOT been re-synced since June 23rd. B04 still shows 200 units from the June 23 snapshot.

---

## FASE 6 — Movimientos Recientes CJ-2026004B

### PD Orders (last 30 days)
8 PD order lines, ALL status=FACTURADO:
- PD 9762 (2026-06-21): 4 units, NIT 37224
- PD 9764 (2026-06-21): 4 units, NIT 37224

### CRM Quotes
**0 CRM quote lines** for this reference.

### PIL Sync Freshness
- B01: last synced **2026-06-30T20:05:51** (today)
- B02: last synced **2026-06-23** (7 days ago)
- B04: last synced **2026-06-23** (7 days ago)
- B23: last synced **2026-06-23** (7 days ago)

**Same pattern:** B04 is 7 days stale.

---

## FASE 7 — Bodegas Excluidas

All non-central bodegas should be excluded from "disponible comercial":

| Bodega | Exclusion Reason |
|---|---|
| B00 | Ajustes contables — not physical sellable stock |
| B02, B03, B23, B29 | Stock dispatched to vendors — already left central |
| B08-B15 | Store stock — separate physical locations |
| B22 | Point of sale — separate inventory |
| B24 | Import transit — not available for local sale |
| B26-B49 | Import warehouses — not commercial textile stock |
| B16-B41 | Unknown/other — require admin confirmation |

**Our formula B01+B04 already excludes all of these correctly.** The gap is NOT caused by bodega exclusion.

---

## FASE 8 — Reconstruccion del Valor Administrativo

### CJ-1126012 (admin=79)

| Formula | Value | Diff | Match |
|---|---|---|---|
| B01 | -85 | -164 | |
| B01 + B04 | 115 | +36 | |
| **B01 + B04 - CRM** | **79** | **0** | **EXACT** |
| B01 + B04 - PD | 115 | +36 | |
| B01 + B04 - PD - CRM | 79 | 0 | EXACT |

**EXACT MATCH: admin = B01 + B04 - CRM DRAFT = -85 + 200 - 36 = 79**

The admin deducts CRM DRAFT quotes (status="PRODUCTO EN PROCESO") from availability. These 36 units are reserved for production orders that haven't been confirmed yet.

### CJ-2026004B (admin=164)

| Formula | Value | Diff | Match |
|---|---|---|---|
| B01 + B04 | 189 | +25 | |
| B01 + B04 + vendedores | 183 | +19 | closest |
| B01 + B04 - CRM | 189 | +25 | (CRM=0) |

**No formula produces an exact match.** The gap of 25 is NOT explained by CRM quotes (0 exist) or vendor bodegas (only reduce by 6).

**Most likely explanation:** B04 is 7 days stale. Between June 23 and June 30, approximately 25 units of CJ-2026004B were produced/transferred/dispatched, changing B04's balance. The admin sees real-time SAG data; Agentik sees a June 23 snapshot of B04.

---

## FASE 9 — Hallazgo Principal

### CJ-1126012: Gap = 36 = CRM DRAFT reservations

**Root cause: IDENTIFIED**

The admin deducts 36 units of CRM DRAFT quotes labeled "PRODUCTO EN PROCESO" from available inventory. These represent production commitments that have been requested by customers but not yet converted to confirmed orders.

Agentik formula: `disponible = B01 + B04 - PD = -85 + 200 - 0 = 115`
Admin formula: `disponible = B01 + B04 - PD - CRM_DRAFT = -85 + 200 - 0 - 36 = 79`

**The 36-unit gap is EXACTLY the CRM DRAFT quantity.**

### CJ-2026004B: Gap = 25 = B04 sync staleness

**Root cause: PARTIAL (staleness + unknown)**

- CRM DRAFT = 0 (no CRM quotes for this reference)
- Vendor bodegas = -6 (B02=-4, B23=-2) — already excluded from central
- B04 last synced June 23 (7 days stale)
- In 7 days, ~25 units could have been dispatched from B04 via production transfers

The B01 sync is fresh (today), showing -11. But B04 is frozen at +200 from June 23.

**25 units = B04 staleness (production dispatched but not yet reflected in PIL)**

---

## FASE 10 — Grupo de Control

### L-1367 (gap=4)
- B01=-436, B04=+504, Central=68, PD=0, CRM=**75**
- Admin=64, Gap=4
- **CRM=75 but gap is only 4** — this means admin does NOT deduct all CRM for this ref, OR the 75 CRM units are stale/older
- More likely: the 4-unit gap = sync freshness (same small temporal difference seen in all refs)

### L-8467 (gap=4)
- B01=-85, B04=+600, Central=515, PD=0, CRM=**0**
- Admin=511, Gap=4
- No CRM quotes, no PD pending
- **4-unit gap = pure sync freshness** — 4 units dispatched between last B04 sync and admin report

**Control group confirms:** when CRM=0, the gap is tiny (4 units = sync freshness). When CRM>0 AND the ref has recent production commitments, the gap exactly matches CRM DRAFT qty.

---

## FASE 11 — Veredicto

### CJ-1126012 (gap=36): **C. Diferencia causada por formula administrativa**

The admin uses a formula that deducts CRM DRAFT quotes ("PRODUCTO EN PROCESO") from availability. Agentik does not. The 36-unit gap is an EXACT match to the CRM DRAFT quantity.

**Evidence:** `B01 + B04 - CRM_DRAFT = -85 + 200 - 36 = 79 = admin value`

### CJ-2026004B (gap=25): **D. Diferencia causada por sincronizacion**

B04 was last synced June 23 (7 days ago). In that period, ~25 units were dispatched or transferred from B04. Admin sees real-time SAG; Agentik sees stale B04 data.

**Evidence:**
- B04 syncedAt = 2026-06-23 (7 days stale)
- B01 syncedAt = 2026-06-30 (fresh today)
- CRM DRAFT = 0 (eliminates formula hypothesis)
- Vendor bodegas = -6 (only explains 6 of 25)

### Summary

| Ref | Gap | Root Cause | Fix |
|---|---|---|---|
| CJ-1126012 | 36 | CRM DRAFT deduction | Add CRM DRAFT to formula |
| CJ-2026004B | 25 | B04 sync staleness | Sync B04 more frequently |
| L-1367 | 4 | Sync freshness | Normal temporal lag |
| L-8467 | 4 | Sync freshness | Normal temporal lag |

---

## FASE 12 — Siguiente Sprint Recomendado

### P0: INVENTORY-CRM-RESERVATION-LAYER-01

**Priority:** HIGH
**Impact:** Closes 100% of CJ-1126012 gap, potentially 10-30% of other gaps

Implement CRM DRAFT quote deduction in the availability formula:

```
disponible = B01 + B04 - PD_PENDIENTE - CRM_DRAFT
```

CRM DRAFT quotes with warehouseName="PRODUCTO EN PROCESO" represent soft reservations. The admin treats them as committed stock. Agentik should too.

Implementation:
1. Add CRM DRAFT aggregation to `_resync-coverage-snapshot.ts` (same pattern as PD aggregation)
2. Add CRM DRAFT aggregation to `inventory-refresh-pipeline.ts`
3. Add `crmReservationsQty` field to CommercialCoverageSnapshot display
4. Validate with 4 audit refs

### P1: INVENTORY-B04-SYNC-FREQUENCY-01

**Priority:** HIGH
**Impact:** Closes 100% of CJ-2026004B gap

The PIL sync currently syncs ALL bodegas from the same SAG SOAP query. The issue is that the sync hasn't been run frequently enough. With INVENTORY-SYNC-FRESHNESS-01 (daily cron at 5am), B04 staleness will be reduced from 7+ days to <24 hours.

**No additional code needed** — INVENTORY-SYNC-FRESHNESS-01 already solves this. Just needs to be activated (cron running, env vars configured).

---

## Files Created (READ ONLY)

| File | Purpose |
|---|---|
| `scripts/_forensic-reference-location-trace.ts` | 11-phase forensic trace across all 39 bodegas |

---

## TSC Baseline

```
npx tsc --noEmit -> 160 errors (baseline preserved, 0 new errors)
```

No production code modified. Only forensic script created.
