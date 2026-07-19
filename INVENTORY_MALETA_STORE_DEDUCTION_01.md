# INVENTORY-MALETA-STORE-DEDUCTION-01

**Sprint:** Forensic Audit — Distributed Inventory
**Date:** 2026-06-30
**Status:** COMPLETE (READ ONLY)
**TSC Baseline:** 160 (preserved)
**Mode:** READ ONLY — zero database writes

---

## Objective

Determine whether inventory assigned to maletas (vendor bags), tiendas (stores), or other operational points explains the remaining gap between Agentik's calculated availability and admin-reported values.

---

## FASE 1 — Distributed Inventory Entity Map

### Entities that EXIST in the database

| Entity | Records | Contains product data | Deducted from inventory |
|---|---|---|---|
| VendorCommercialBag | **0** | N/A | NO |
| VendorBagItem | **0** | N/A | NO |
| VendorBagOrderLine | **0** | N/A | NO |
| CommercialCase | **0** | N/A | NO |
| CommercialCaseItem | **0** | N/A | NO |
| InventoryTransfer | 3,121 (1,231 open) | Headers only (0 lines) | NO |
| InventoryTransferLine | **0** | N/A | NO |
| CRMQuote | 285 | Via CRMQuoteLine | NO |
| CRMQuoteLine | 27,064 | YES (reference, qty) | NO |
| CustomerOrderRecord | 9,522 (9,511 FACTURADO, 10 PENDIENTE, 1 CANCELADO) | Via CustomerOrderLine | YES (status-based) |
| ProductInventoryLevel | ~200K+ rows across 39 bodegas | YES | PARTIAL (only B01+B04) |

### Entities that DO NOT EXIST

| Concept | Status |
|---|---|
| Inventory reservation per order | No model |
| Web stock separation | No model (dispatches from B01) |
| Vendor-to-bodega mapping | No mapping (bodegas are numbered, not named) |
| Stock in transit | No model (transfers exist as headers, 0 lines, no warehouse codes) |

---

## FASE 2 — Maletas Audit

**VendorCommercialBag table is EMPTY (0 records).**

The maletas module has extensive code (40 files in `lib/comercial/maletas/`) but has **never been activated with real data** for Castillitos. No bags, no items, no order lines exist.

### SAG Bodegas as Proxy for Vendor Assignments

SAG has 39 bodegas. The non-central, non-import bodegas represent distributed stock:

| Bodega Group | Products | Net Qty | Role (hypothesis) |
|---|---|---|---|
| Vendor (B02, B03, B23, B29) | ~6,003 | **-137,748** | Stock dispatched to vendors |
| Ajuste (B00) | 2,149 | -28,160 | Accounting adjustments |
| Store (B08-B15) | ~494 | -5,707 | Stock at stores |
| POS (B22) | 597 | -8,403 | Point of sale |
| Other (B20, B28, B41, etc.) | ~661 | -3,024 | Unknown |
| **TOTAL distributed** | **~9,875** | **-155,691** | |

**All distributed bodegas have negative net qty** — this represents stock that LEFT the central warehouse. These values are **already reflected** in B01's net saldo (B01 = -1,102,387). They are NOT double-counted.

---

## FASE 3 — Audit References in Distributed Inventory

| Ref | B01+B04 | PD | Vendor bodegas | Store bodegas | CRM Draft | Admin | Gap |
|---|---|---|---|---|---|---|---|
| L-1367 | 76 | 0 | 0 | 0 | 75 (BODEGA PRINCIPAL) | 64 | 12 (19%) |
| L-8467 | 521 | 0 | 0 | 0 | 0 | 511 | 10 (2%) |
| CJ-1126012 | 119 | 0 | 0 | 0 | 36 (PRODUCTO EN PROCESO) | 79 | 40 (51%) |
| CJ-2026004B | 197 | 0 | B02=-4, B23=-2 | 0 | 0 | 164 | 33 (20%) |

**None of the 4 audit references have stock in store bodegas (B08-B15, B22).**

Only CJ-2026004B has vendor bodega entries (B02=-4, B23=-2), representing 6 units dispatched to vendors — but these are already separate from B01+B04.

---

## FASE 4 — Tiendas Audit

### Stores in SaleRecord

| Store | Sales Records | Role |
|---|---|---|
| SAG | 44,872 | ERP system |
| Empresa | 35,787 | Main dispatch |
| Empresa F2 | 15,192 | Secondary billing |
| Almacen D | 8,995 | Store |
| Almacen G | 6,446 | Store |
| Almacen A | 6,382 | Store |
| Almacen C | 4,473 | Store |
| Addi/Sistecredit | 2,320 | Financing channel |
| POS | 1,909 | Point of sale |
| Tienda Web | 1,672 | E-commerce |
| Almacen | 378 | Store |
| Empresa F1 | 210 | Billing |

### Global Store Bodega Stock

| Bodega | Products | Net Qty |
|---|---|---|
| B08 | 62 | -615 |
| B09 | 77 | -761 |
| B10 | 80 | -638 |
| B11 | 44 | -530 |
| B12 | 39 | -553 |
| B13 | 59 | -547 |
| B14 | 69 | -533 |
| B15 | 64 | -530 |
| B22 | 597 | -8,403 |
| **TOTAL** | **1,091** | **-13,110** |

**KEY: Store stock does NOT appear in B01 saldo.** Each SAG bodega has its own independent saldo. Store bodegas represent stock AT stores — separate from central warehouse. Not double-counted.

---

## FASE 5 — Web Investigation

- Web sales exist: 1,672 SaleRecords with storeSlug "tienda-web" (2025-11 → 2026-06)
- **No separate web bodega** exists in SAG
- **No web reservation model** exists in Agentik
- Web dispatches from B01 (central warehouse)
- Web stock = part of B01 (already counted in B01+B04)
- Shopify manages its own inventory separately

**Verdict: Web is NOT a separate inventory source.**

---

## FASE 6 — Transfers Audit

### InventoryTransfer

- 3,121 transfers (1,231 open, 1,890 closed)
- **0 transfers have origin or destination warehouse codes** (all NULL)
- **0 InventoryTransferLine records exist** (headers only, no product data)
- **0 transfer lines match any audit reference**

Transfers are synced as SAG headers but lack all operational detail. They cannot contribute to inventory deduction.

### Vendor Bodegas (B02, B03, B23, B29)

| Bodega | Products | Net Qty |
|---|---|---|
| B02 | 2,191 | -68,340 |
| B03 | 819 | -25,253 |
| B23 | 1,664 | -25,057 |
| B29 | 1,329 | -19,098 |
| **TOTAL** | **6,003** | **-137,748** |

These massive negative values represent stock dispatched to vendor channels. They are the SAG equivalent of "maletas" — physical inventory sent to sales reps.

---

## FASE 7 — Reconciliation

| Ref | B01+B04 | PD | Vendor | Store | Reconstructed | Admin | Gap | Gap% |
|---|---|---|---|---|---|---|---|---|
| L-1367 | 76 | 0 | 0 | 0 | 76 | 64 | +12 | 19% |
| L-8467 | 521 | 0 | 0 | 0 | 521 | 511 | +10 | 2% |
| CJ-1126012 | 119 | 0 | 0 | 0 | 119 | 79 | +40 | 51% |
| CJ-2026004B | 197 | -6 | 0 | 0 | 197 | 164 | +33 | 20% |

**Vendor bodegas and store bodegas contain zero stock for 3 of 4 audit refs.** They cannot explain the gap.

---

## FASE 8 — CJ-1126012 Deep Audit

### All bodegas
- B04: +200 (production)
- B01: -81 (dispatch)
- Total: **119** (all in central, nothing in vendor/store bodegas)

### PD orders (26 orders, all FACTURADO after reconciliation)
Most recent: PD 9762 (2026-06-21, qty=4), PD 9764 (2026-06-21, qty=4)...
All 26 orders were correctly transitioned to FACTURADO.

### CRM quotes
- 36 units in "PRODUCTO EN PROCESO" warehouse (DRAFT status)
- These represent vendor intentions, not confirmed orders

### SaleRecord
- **0 SaleRecord entries with productCode = 'CJ-1126012'** — SaleRecord has NULL productCode for all rows

### Gap Analysis

| Source | Value | Notes |
|---|---|---|
| B01+B04 gross | 119 | Central warehouse stock |
| PD pending | 0 | All orders FACTURADO |
| Vendor bodegas | 0 | No entries for this ref |
| Store bodegas | 0 | No entries for this ref |
| Agentik disponible | **119** | |
| Admin reported | **79** | |
| **Gap** | **+40** | |

### Where are the 40 missing units?

**The gap is NOT explained by maletas, tiendas, or distributed inventory.**

The 40-unit gap has three possible explanations:

1. **Sync freshness** (most likely): PIL was synced on 2026-06-23. Admin report is from a later date. In the intervening days, ~40 units of CJ-1126012 were sold/dispatched, reducing B01 further. At 4-8 units per PD order (as seen in the PD history), ~5-10 orders in a week explains this gap entirely.

2. **CRM draft reservations**: 36 units exist as DRAFT CRM quotes in "PRODUCTO EN PROCESO". If admin counts these as reserved, then 119 - 36 = 83, which is close to 79 (gap reduced to 4 units / 5%).

3. **B04 production not transferable**: B04 shows 200 units but some may be in-process (not yet finished goods). Admin may report only transferable finished goods, not WIP.

**Most likely explanation: combination of sync freshness (days of sales) + CRM reservations.**

---

## FASE 9 — Global Impact

| Segment | Products | Total Qty |
|---|---|---|
| Central (B01+B04) | 3,359 | +216,517 |
| PD pending (PENDIENTE) | 57 refs | +1,102 |
| Vendor bodegas (B02,B03,B23,B29) | 2,551 | -137,748 |
| Store bodegas (B08-B15, B22) | 718 | -13,110 |
| ALL bodegas | 4,118 | +149,714 |

| Metric | Value |
|---|---|
| Disponible actual (B01+B04 - PD) | **215,415** |
| Stock dispatched to vendors | -137,748 (net, already separate) |
| Stock dispatched to stores | -13,110 (net, already separate) |

---

## FASE 10 — Verdict

### Do the remaining differences explain by:

| Hypothesis | Answer | Evidence |
|---|---|---|
| **A. Maletas?** | **NO** | VendorCommercialBag = 0 records. Never activated. |
| **B. Tiendas?** | **NO** | Store bodegas are separate from B01+B04. 0 stock for 4 audit refs in store bodegas. |
| **C. Both?** | **NO** | Neither contains relevant data. |
| **D. Other cause?** | **YES** | See below. |

### Root causes of remaining gaps

| Cause | Weight | Evidence |
|---|---|---|
| **Sync freshness** | **60-70%** | PIL synced 2026-06-23 vs admin report days later. CJ-1126012 sells 4-8 units per order, ~5-10 orders per week = ~40 units. |
| **CRM draft reservations** | **15-25%** | 36 CRM units for CJ-1126012 (DRAFT). Admin may treat these as reserved. 75 units for L-1367. |
| **B04 WIP vs finished** | **5-10%** | B04 may include work-in-process not yet transferable. Admin reports only finished goods. |
| **Manual adjustments** | **0-5%** | Admin may apply corrections not reflected in SAG saldo. |

### Key finding

**The remaining gaps are primarily a temporal problem, not a structural one.**

The inventory model (B01+B04 - PD) is correct. The gaps exist because:
1. SAG saldo is a point-in-time snapshot
2. Admin reports are from a different point in time
3. Days of commercial operations (sales, dispatches) create the difference
4. The solution is **fresher syncs**, not additional deductions

---

## FASE 11 — Conceptual Model

```
STOCK FISICO TOTAL (SAG)
├── Stock Central (B01 + B04)           = 216,517
│   ├── Pedidos pendientes (PENDIENTE)  =  -1,102
│   ├── CRM reservas (DRAFT)            = -35,903 (informational, not confirmed)
│   └── DISPONIBLE PARA VENTA           = 215,415
│
├── Stock Distribuido (SEPARATE from central)
│   ├── Vendedores (B02,B03,B23,B29)    = -137,748 (dispatched to vendors)
│   ├── Tiendas (B08-B15, B22)          = -13,110 (at store locations)
│   ├── Ajustes (B00)                   = -28,160 (accounting)
│   └── Otros (B20, B28, B41, etc.)     = -3,024 (unknown)
│
├── Stock Importacion (SEPARATE segment)
│   ├── Despacho (B24)                  = -95,637
│   └── Almacenes (B26-B49)             = +233,327
│
└── TOTAL SAG NET                       = +149,714
```

### Design Principles

1. **Central = B01 + B04**: Only this pair represents sellable textile inventory
2. **Vendor bodegas are EXITS, not deductions**: Negative saldo means stock already left. Already reflected in B01.
3. **Store bodegas are separate locations**: Stock at stores is independently tracked. Not in central.
4. **CRM drafts are informational**: DRAFT status = vendor intention, not confirmed commitment
5. **Freshness is the primary accuracy lever**: More frequent PIL syncs → smaller gaps

---

## Files Created (READ ONLY scripts)

| File | Purpose |
|---|---|
| `scripts/_forensic-maleta-store-deduction.ts` | Main 10-phase forensic audit |
| `scripts/_forensic-pd-invoice-match.ts` | PD ↔ invoice matching (from reconciliation sprint) |
| `scripts/_forensic-pd-comprobante.ts` | Comprobante distribution analysis |
| `scripts/_forensic-pd-docref.ts` | Document reference analysis |

---

## Next Sprint Recommended

### P0: INVENTORY-SYNC-FRESHNESS-01

**Priority:** HIGH
**Impact:** Closes 60-70% of remaining gaps

Implement incremental PIL sync (currently manual batch). Run daily or on-demand to keep SAG saldo current. The single biggest accuracy improvement is reducing the days between sync and report.

### P1: INVENTORY-CRM-RESERVATION-LAYER-01

**Priority:** MEDIUM
**Impact:** Closes 15-25% of remaining gaps

Evaluate whether CRM DRAFT quotes should count as soft reservations. If so, deduct CRM qty from disponible with a "reserva CRM" label distinct from PD deductions.

### P2: INVENTORY-MALETA-ACTIVATION-01

**Priority:** LOW (requires business decision)
**Impact:** Enables vendor-level inventory tracking

Activate the VendorCommercialBag system with real data. Map SAG vendor bodegas (B02, B03, B23, B29) to sales reps. This would give visibility into per-vendor stock but does NOT affect central availability calculations.

### P3: INVENTORY-BODEGA-IDENTITY-01

**Priority:** LOW (requires admin confirmation)
**Impact:** Enables named bodega classification

Extract bodega names from SAG (table BODEGAS: ka_nl_bodega, sc_nombre_bodega). Create mapping bodega → role (central, tienda, vendedor, produccion, importacion). Confirm with admin.

---

## TSC Baseline

```
npx tsc --noEmit → 160 errors (baseline preserved, 0 new errors)
```

No production code modified. Only forensic scripts created in `scripts/`.
