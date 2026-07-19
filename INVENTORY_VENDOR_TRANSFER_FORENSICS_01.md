# INVENTORY-VENDOR-TRANSFER-FORENSICS-01

**Sprint:** Forensic Audit — Vendor Sample Lifecycle
**Date:** 2026-06-30
**Status:** COMPLETE (READ ONLY)
**TSC Baseline:** 160 (preserved)
**Mode:** READ ONLY — zero database writes

---

## Objective

Discover how SAG records the lifecycle of vendor samples: transfers, returns, aging, and eventual billing. Determine if a Vendor Sample Ledger can be reconstructed from existing Agentik data.

---

## FASE 1 — Fuentes de Transferencia

### SAG FUENTES Registry Analysis

161 fuentes in `lib/sag/master-data/source-semantic-rules.ts`. Key transfer-related fuentes:

| Fuente | Code | Name | In Agentik? | SaleRecord Count |
|---|---|---|---|---|
| F34 | TR | TRASLADO ENTRE BODEGAS | NO | 0 |
| F206 | TM | TRASLADO DE MALETAS | NO | 0 |
| F133 | M2 | ENTRADA DE MUESTRAS | YES | 83 |
| F76 | AI | AJUSTE DE INVENTARIO | YES | 930 |
| F117 | CM | CONSUMO DE MUESTRAS | NO | 0 |
| F127 | CV | CONSUMOS DE MUESTRAS Y VARIOS | NO | 0 |
| F126 | AD | ADICIONES Y FALTANTES | NO | 0 |
| F145 | SA | SALIDA DE ALMACEN | NO | 0 |

**Critical finding:** F34 (TR - TRASLADO ENTRE BODEGAS) is THE transfer fuente but is NOT synced to Agentik. Transfer movements between Central and Vendor bodegas are invisible to the platform.

Currently synced fuentes: F80 (CN), F116 (ET), F33 (OP), F40 (PD) only.

---

## FASE 2 — Evidencia en SaleRecord

### F133 (M2 - ENTRADA DE MUESTRAS)

- 83 records, ALL to NIT 526 (INDUSTRIAS DIANA ALZATE SAS = company self)
- Monthly entries — exactly 1 per month
- Values range $260K-$753K COP/month
- Pattern: monthly sample valuation entries, NOT transfer records

| Month | Entries | Value (COP) |
|---|---|---|
| 2026-06 | 1 | $488,406 |
| 2026-05 | 1 | $476,489 |
| 2026-04 | 1 | $367,931 |
| 2026-03 | 1 | $446,815 |
| 2026-02 | 1 | $653,672 |
| 2026-01 | 1 | $260,855 |

### F76 (AI - AJUSTE DE INVENTARIO)

- 930 records, 915 to NIT 526 (company self)
- Weekly adjustments
- Total value: $2,596M COP
- Pattern: periodic inventory adjustments (write-offs, corrections)

---

## FASE 3 — Evidencia de Transferencias en PIL

ProductInventoryLevel (PIL) stores only current saldo snapshots per product per bodega. No movement history.

| Bodega | Refs | Net Saldo | Outflow | Returns | Return Rate |
|---|---|---|---|---|---|
| B02 | 2,194 | -68,630 | 69,607 | 977 | 1.4% |
| B23 | 1,669 | -25,117 | 26,047 | 930 | 3.6% |
| B29 | 1,335 | -19,255 | 20,139 | 884 | 4.4% |
| B03 | 819 | -16,858 | 17,666 | 808 | 4.6% |

**Key insight:** PIL only shows cumulative results. The actual transfer movements (when product moved, how many, from where) are in F34 (TR) which is not synced.

---

## FASE 4 — Antiguedad

PIL `syncedAt` reflects Agentik fetch time (2026-06-23 to 2026-06-30), NOT the original SAG transfer date. Cannot determine sample age from existing data — would require F34 movement dates.

---

## FASE 5 — Seller-Bodega Correlation

### Overlap Analysis (CRM seller quotes vs PIL vendor refs)

| Seller | B02 | B03 | B23 | B29 |
|---|---|---|---|---|
| Naranjo | 66% | 3% | 55% | 46% |
| Alzate | 73% | 2% | 61% | 52% |
| Agudelo | 63% | 4% | 58% | 50% |
| Tamayo | 69% | 2% | 59% | 51% |
| Velez | 90% | 3% | 72% | 60% |
| Valencia | 0% | 0% | 0% | 0% |
| Ospina | 72% | 3% | 63% | 53% |

**Findings:**
- All sellers have similar overlap with B02, B23, B29 (45-90%)
- B03 uniquely has 0-4% overlap with ALL sellers — different profile (possibly a specialized bodega)
- Fredy Velez has highest B02 correlation (90%)
- No definitive 1:1 seller-to-bodega mapping possible from data alone
- Requires admin confirmation

---

## FASE 6 — Patrones de Referencia

### Most Distributed (excluding packaging)

| SKU | Name | B02 | B03 | B23 | B29 | Total |
|---|---|---|---|---|---|---|
| CD-4123138 | Camiseta Nino Polo | -168 | -71 | -25 | -37 | -301 |
| 34731-2 | Chupo para Frutas | -155 | — | -116 | -97 | -368 |
| 34852-1 | Babero de Silicona | -138 | — | -149 | -113 | -400 |
| 34731-1 | Porta Leche Bebe | -141 | — | -125 | -133 | -399 |
| TAP-002 | Tapabocas Nino | -152 | -16 | — | — | -168 |

### Return Evidence

Almost zero returns on high-outflow items. Example: CD-4123138 in B02 has 172 outflow, only 4 returns. Baby accessories (baberos, chupos, porta leche) have ZERO returns.

---

## FASE 7 — Facturacion

### Seller Invoices in SaleRecord

**F2 DISPATCH_REMISION to sellers** (sample dispatch documents):

| Seller | NIT | Remisiones | Period | Amount (COP) |
|---|---|---|---|---|
| Luis Orlando Naranjo | 280 | 151 | 2021-01 to 2026-04 | $93,890,769 |
| Nestor Fernando Alzate | 211 | 81 | 2021-01 to 2026-06 | $69,191,989 |
| Yuliana Ospina Tabares | 185 | 52 | 2020-06 to 2026-06 | $3,991,928 |
| Carlos Villa | 39268 | 2 | 2026-04 to 2026-06 | $490,450 |
| Fredy Norberto Velez | 37908 | 1 | 2026-02 | $70,000 |
| Manuela Tamayo | 39363 | 1 | 2026-03 | $15,900 |

**F98 CREDIT_NOTE to sellers** (return/adjustment credits):

| Seller | NIT | Notes | Period | Amount (COP) |
|---|---|---|---|---|
| Luis Orlando Naranjo | 280 | 106 | 2020-07 to 2025-04 | -$88,510,339 |
| Nestor Fernando Alzate | 211 | 28 | 2020-07 to 2025-03 | -$60,254,287 |
| Yuliana Ospina Tabares | 185 | 1 | 2025-09 | -$19,800 |

**Key finding:** Naranjo received $93.9M in remisiones, returned $88.5M in credit notes = NET $5.4M outstanding.
Alzate received $69.2M in remisiones, returned $60.3M in credit notes = NET $8.9M outstanding.
Ospina received $4.0M, returned $19.8K = NET $3.97M outstanding.

**These are header-level amounts (no product-line detail).** The F2 remisiones are the SAG-documented evidence of sample dispatch to vendors.

### Self-Billing (NIT 526 = Company)

| Fuente | Family | Records | Total (COP) |
|---|---|---|---|
| F76 (AI) | OTHER | 915 | $2,596,126,607 |
| F65 | OTHER | 307 | $4,364,372,283 |
| F2 | DISPATCH_REMISION | 101 | $22,412,398 |
| F133 (M2) | OTHER | 83 | $30,183,127 |
| F43 | OTHER | 77 | $678,717,918 |

### Alzate Name Disambiguation

"Alzate" in SaleRecord is overwhelmingly the COMPANY (INDUSTRIAS DIANA ALZATE SAS, NIT:526), not the seller. The actual seller is NESTOR FERNANDO ALZATE JIMENEZ (NIT:211) — only 119 of 6,570 "Alzate" matches.

BANCOLOMBIA DIANA ALZATE (NIT:14947) = bank account, 3,638 records = F150 banking entries.

---

## FASE 8 — Top Risks

### Highest Outflow Products (excluding packaging)

| Rank | SKU | Name | Total Vendor Saldo | Bodegas | Returns |
|---|---|---|---|---|---|
| 1 | 34852-1 | Babero de Silicona | -400 | B02/B23/B29 | 0 |
| 2 | 34731-1 | Porta Leche Bebe | -399 | B02/B23/B29 | 1 |
| 3 | 34731-2 | Chupo para Frutas | -368 | B02/B23/B29 | 0 |
| 4 | CD-4123138 | Camiseta Polo Kids | -301 | B02/B03/B23/B29 | 5 |
| 5 | TAP-002/004/007/008 | Tapabocas variants | ~-600 combined | B02/B03 | 12 |

**Risk pattern:** Baby accessories (baberos, chupos, porta leche) have massive cumulative outflow and ZERO returns. These are likely consumable samples that are never returned — they're sold or gifted by vendors.

### Packaging Outflow (operational, not sample risk)

BP (-17,992), BM (-10,668), BG (-5,384) = 34,044 units = 26% of total vendor outflow. These are bags distributed alongside products — operational supplies, not samples.

---

## FASE 9 — Reconstruction Feasibility

### CAN BUILD with existing data:

| Component | Source | Quality |
|---|---|---|
| VendorInventorySnapshot | PIL saldo per ref per bodega | HIGH — real SAG data |
| VendorDispatchHistory | F2 remisiones to seller NITs | MEDIUM — header-only (amounts, no product lines) |
| VendorReturnHistory | F98 credit notes to seller NITs | MEDIUM — header-only |
| SampleValuationLog | F133 (M2) monthly entries | HIGH — regular monthly cadence |
| AdjustmentLog | F76 (AI) inventory adjustments | HIGH — 930 records |

### CANNOT BUILD (missing data):

| Component | Missing Source | Impact |
|---|---|---|
| TransferLedger | F34 (TR) not synced | CRITICAL — no movement history |
| SampleConsumptionLog | F117 (CM) / F127 (CV) not synced | HIGH — no consumption tracking |
| ProductLevelDispatch | F2 has no product lines | HIGH — can't match dispatch to specific SKUs |
| SellerBodegaMapping | No mapping in SAG or CRM | MEDIUM — can't assign bodegas to sellers |
| SampleAgingReport | No transfer dates in PIL | HIGH — can't determine sample age |

### VERDICT: PARTIAL LEDGER POSSIBLE (~60%)

Current data supports:
- Balance snapshots (PIL) — YES
- Dispatch monetary amounts (F2) — YES (header-only)
- Return monetary amounts (F98) — YES (header-only)
- Sample monthly valuation (F133) — YES
- Transfer movements (F34) — NO (not synced)
- Product-level movement lines — NO

---

## FASE 10 — Data Gaps

### Missing SAG Fuentes (not synced to Agentik)

| Priority | Fuente | Code | Name | Impact |
|---|---|---|---|---|
| **P0** | F34 | TR | TRASLADO ENTRE BODEGAS | THE transfer fuente — unlocks full movement history |
| **P1** | F117 | CM | CONSUMO DE MUESTRAS | Sample consumption tracking |
| **P1** | F127 | CV | CONSUMOS DE MUESTRAS Y VARIOS | Combined sample/misc consumption |
| **P2** | F126 | AD | ADICIONES Y FALTANTES | Shortage/surplus adjustments |
| **P2** | F145 | SA | SALIDA DE ALMACEN | Warehouse exits |
| **P3** | F206 | TM | TRASLADO DE MALETAS | Maleta transfers (commercial use case) |

### Missing Data Points

1. **Seller-to-Bodega mapping** — 8 CRM sellers, 4 SAG vendor bodegas, no mapping table. Requires admin confirmation or SAG user-master query.
2. **PIL movement history** — Only snapshots, no temporal movements. SAG MOVIMIENTOS query with F34 would solve this.
3. **SaleRecord product lines for F2** — Remisiones are header-only in current SaleRecord grain. SAG LINEAS query for F2 documents would add product-level detail.
4. **Transfer document details** — What refs were moved, when, quantities. Locked behind F34.

---

## FASE 11 — Conceptual Model

### VendorSampleBalance

```typescript
interface VendorSampleBalance {
  bodega: "02" | "03" | "23" | "29";
  sku: string;
  description: string;
  line: "LT" | "CS" | "AC" | "PK" | "OT";
  currentSaldo: number;         // from PIL (always negative = cumulative outflow)
  totalOutflow: number;          // absolute outflow entries
  totalReturns: number;          // positive entries
  returnRate: number;            // returns / outflow
  snapshotAt: Date;              // PIL sync time
}
```

### VendorDispatchRecord

```typescript
interface VendorDispatchRecord {
  sellerNit: string;
  sellerName: string;
  saleDate: Date;
  amount: number;                // COP value from F2 remision
  sagFuente: 2;                  // F2 = REMISION
  sagDocumentFamily: "DISPATCH_REMISION";
  // Product lines NOT available — header-only grain
}
```

### VendorReturnRecord

```typescript
interface VendorReturnRecord {
  sellerNit: string;
  sellerName: string;
  saleDate: Date;
  amount: number;                // COP value from F98 (negative)
  sagFuente: 98;                 // F98 = NOTA CREDITO
  sagDocumentFamily: "CREDIT_NOTE";
}
```

### VendorSampleValuation

```typescript
interface VendorSampleValuation {
  month: string;                 // "2026-06"
  amount: number;                // COP monthly sample valuation
  sagFuente: 133;                // F133 = M2 ENTRADA DE MUESTRAS
  customerNit: "526";            // Always company self
}
```

### VendorSampleLedger (future — requires F34)

```typescript
interface VendorSampleMovement {
  bodegaFrom: string;            // e.g., "01" (central)
  bodegaTo: string;              // e.g., "02" (vendor)
  sku: string;
  quantity: number;
  movementDate: Date;
  sagFuente: 34;                 // F34 = TR TRASLADO ENTRE BODEGAS
  documentNumber: string;
}
```

---

## Resumen Final

### Key Findings

| # | Finding | Evidence |
|---|---|---|
| 1 | F34 (TR) is THE transfer fuente but NOT synced | source-semantic-rules.ts, 0 SaleRecord matches |
| 2 | F2 remisiones document sample dispatches to sellers | 288 F2 records to 6 known seller NITs |
| 3 | F98 credit notes document returns/adjustments | 135 F98 records to 3 sellers |
| 4 | Naranjo is the largest dispatch recipient | 151 remisiones, $93.9M COP |
| 5 | Baby accessories have zero returns | 34852-1, 34731-1, 34731-2: combined -1,167 outflow, 1 return |
| 6 | F133 (M2) provides monthly sample valuation | $260K-$753K COP/month, exactly 1 entry/month |
| 7 | B03 has unique profile — near-zero seller overlap | 0-4% overlap vs 45-90% for B02/B23/B29 |
| 8 | Partial ledger possible (~60%) | Balance + amounts YES, movements + product lines NO |

### Vendor Financial Summary

| Seller | NIT | F2 Dispatches | F98 Returns | Net Outstanding |
|---|---|---|---|---|
| Naranjo | 280 | $93,890,769 | -$88,510,339 | **$5,380,430** |
| Alzate | 211 | $69,191,989 | -$60,254,287 | **$8,937,702** |
| Ospina | 185 | $3,991,928 | -$19,800 | **$3,972,128** |
| Villa | 39268 | $490,450 | $0 | **$490,450** |
| Velez | 37908 | $70,000 | $0 | **$70,000** |
| Tamayo | 39363 | $15,900 | $0 | **$15,900** |
| **TOTAL** | | **$167,651,036** | **-$148,784,426** | **$18,866,610** |

---

## Proximos Sprints

### P0: INVENTORY-TRANSFER-SYNC-01
Sync F34 (TR - TRASLADO ENTRE BODEGAS) from SAG SOAP. This single fuente unlocks complete movement history between all bodegas — the most impactful single improvement for vendor sample tracking.

### P1: INVENTORY-VENDOR-DISPATCH-LINES-01
Query SAG LINEAS for F2 (REMISION) documents to add product-level detail to vendor dispatch records. Currently header-only.

### P2: INVENTORY-SAMPLE-CONSUMPTION-SYNC-01
Sync F117 (CM) and F127 (CV) — sample consumption tracking. Enables understanding of sample lifecycle beyond just dispatch/return.

### P3: INVENTORY-VENDOR-BODEGA-MAPPING-01
Admin UI to map sellerSlug to SAG bodega code. Once mapped, vendor coverage becomes part of the commercial intelligence surface.

### P4: INVENTORY-VENDOR-SAMPLE-LEDGER-01
Build the VendorSampleLedger model once F34 is synced. Combine PIL snapshots + F34 movements + F2 dispatches + F98 returns + F133 valuations into a unified vendor sample account.

---

## Files Created

| File | Purpose |
|---|---|
| `INVENTORY_VENDOR_TRANSFER_FORENSICS_01.md` | This document |

No scripts created, no production code modified. All queries run inline via `npx tsx -e`.

---

## TSC Baseline

```
npx tsc --noEmit -> 160 errors (baseline preserved, 0 new errors)
```
