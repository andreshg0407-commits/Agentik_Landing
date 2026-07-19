# INVENTORY-VENDOR-WAREHOUSE-TOPOLOGY-01

**Sprint:** Forensic Audit — Vendor Warehouse Topology
**Date:** 2026-06-30
**Status:** COMPLETE (READ ONLY)
**TSC Baseline:** 160 (preserved)
**Mode:** READ ONLY — zero database writes

---

## Objective

Discover and document the complete vendor warehouse topology for Castillitos. Understand how samples are distributed to salespeople, what references are covered, and where commercial opportunities exist.

---

## FASE 1 — Mapa Completo de Bodegas

39 bodegas in Castillitos SAG, classified:

| Category | Bodegas | Saldo | Pattern |
|---|---|---|---|
| **PRODUCCIÓN** | B04 | +1,318,883 | All positive — production input |
| **DESPACHO CENTRAL** | B01 | -1,155,949 | All negative — cumulative dispatch |
| **VENDEDORES** | B02, B03, B23, B29 | -129,860 | Deep negative — samples dispatched |
| **TIENDAS** | B08-B15 | -4,707 | Negative — retail dispatch |
| **PUNTO DE VENTA** | B22 | -8,403 | Negative — POS dispatch |
| **AJUSTES** | B00 | -28,283 | Mixed — accounting adjustments |
| **IMPORTACIÓN TRÁNSITO** | B24 | -96,977 | Negative — import dispatch |
| **IMPORTACIÓN ALMACÉN** | B26, B27, B42-B49 | +184,525 | Positive — import stock |
| **PRODUCCIÓN AUX** | B30-B34 | +26,208 | Positive — auxiliary production |
| **OTRAS** | B16, B18-B20, B28, B35, B40, B41 | -2,882 | Small/unknown |

**Key insight:** B04 is the only major positive bodega (+1.32M). B01 is the mirror dispatch (-1.16M). All vendor/store/POS bodegas are negative — they represent cumulative outflow history.

---

## FASE 2 — Identificación de Bodegas de Vendedores

### 4 Vendor Bodegas Confirmed

| Bodega | Refs | Saldo | Dominant Lines |
|---|---|---|---|
| B02 | 2,194 | -68,630 | CS (43%), PK (33%), AC (16%) |
| B03 | 819 | -16,858 | CS (63%), OT (32%) |
| B23 | 1,669 | -25,117 | CS (35%), AC (31%), PK (30%) |
| B29 | 1,335 | -19,255 | AC (42%), CS (31%), PK (26%) |

### 8 CRM Sellers Identified

| Seller | Quotes |
|---|---|
| Luis Orlando Naranjo | 91 |
| Nestor Fernando Alzate Jimenez | 74 |
| Carlos Villa | 34 |
| Carlos Agudelo | 32 |
| Manuela Tamayo Peréz | 26 |
| Fredy Velez | 25 |
| Juan Valencia | 2 |
| Yuliana Ospina Tabares | 1 |

### Seller → Bodega Mapping: NOT AVAILABLE

CRM does not store SAG bodega codes at the quote level. The `adm_bodega_id_c` field in CRM uses internal CRM IDs (10=BODEGA PRINCIPAL, 13=PRODUCTO EN PROCESO, 33=IMPORTACIÓN) which don't map to SAG B-codes.

**8 sellers vs 4 bodegas** — some sellers likely share bodegas, or some sellers don't have assigned bodegas. Requires admin confirmation for mapping.

---

## FASE 3 — Cobertura por Vendedor (Bodega)

### B02 (largest, -68,630)
| Line | Refs | Saldo |
|---|---|---|
| CS | 1,341 | -29,517 |
| PK | 12 | -22,805 |
| AC | 627 | -10,708 |
| OT | 185 | -5,542 |
| LT | 29 | -58 |

### B03 (smallest, -16,858)
| Line | Refs | Saldo |
|---|---|---|
| CS | 602 | -10,681 |
| OT | 198 | -5,399 |
| PK | 11 | -756 |
| AC | 8 | -22 |

### B23 (-25,117)
| Line | Refs | Saldo |
|---|---|---|
| CS | 779 | -8,854 |
| AC | 604 | -7,887 |
| PK | 5 | -7,494 |
| LT | 270 | -834 |

### B29 (-19,255)
| Line | Refs | Saldo |
|---|---|---|
| AC | 609 | -8,046 |
| CS | 631 | -5,881 |
| PK | 5 | -5,031 |
| LT | 85 | -253 |

**Key observation:** B02 is the dominant vendor bodega. PK (packaging/bolsas) has massive outflow (BP=-17,992, BM=-10,668, BG=-5,384) — bags are distributed alongside product samples.

---

## FASE 4 — Cobertura por Referencia

### Distribution across vendor bodegas

| Vendor Bodegas Present | Refs |
|---|---|
| 1 bodega | 388 |
| 2 bodegas | 907 |
| 3 bodegas | 1,229 |
| 4 bodegas (all) | 32 |

**Total: 2,556 unique refs** across vendor bodegas.

### Top refs in ALL 4 vendor bodegas

BP (Bolsa Pequeña), BM (Bolsa Mediana), BG (Bolsa Grande) — packaging distributed to all vendors. Product-wise: CD-4123138 (Camiseta Niño Polo), C-2483252, C-2643222 — Castillitos core products.

---

## FASE 5 — Referencias sin Cobertura

### Summary

| Metric | Value |
|---|---|
| Central refs with stock > 0 | 2,597 |
| With vendor coverage | 1,915 |
| **WITHOUT vendor coverage** | **682** |
| **Coverage rate** | **74%** |

**682 references with positive central stock have ZERO vendor presence.**

### Top uncovered refs (high stock, no vendor samples)

Almost entirely **L-prefix (Latin Kids/Lencería)** products:
- L-3544 (605), L-3479 (601), L-2419 (550), L-1405 (542), L-8467 (515)
- All pijamas, conjuntos náuticos, and textile products

**Critical finding:** Vendor bodegas are heavily CS (Castillitos) and AC (Accessories). **LT (Latin Kids) line has almost zero vendor distribution** — only 29 LT refs in B02, 270 in B23, 85 in B29. These are the same L-prefix pijamas that dominate central stock.

---

## FASE 6 — Referencias con Cobertura Excesiva

Top refs with >100 units dispatched to vendors:

| SKU | Vendor Saldo | Bods | Description |
|---|---|---|---|
| BP | -17,992 | 4 | Bolsa Pequeña |
| BM | -10,668 | 4 | Bolsa Mediana |
| BG | -5,384 | 4 | Bolsa Grande |
| BE | -774 | 3 | Bolsa Grande Ecológica |
| 34852-1 | -400 | 3 | Babero de Silicona |
| 34731-1 | -399 | 3 | Porta Leche para Bebé |

Packaging (bolsas) dominates vendor outflow — these are not samples but operational supplies distributed to all vendors.

---

## FASE 7 — Transferencias (Central → Vendedor)

### Evidence from ProductionEvent

Only 2 event types exist:
- MATERIAL_CONSUMED (CN): 7,890 events — raw material consumption
- PRODUCTION_COMPLETED (ET): 3,640 events — finished goods entry

**No transfer events** in ProductionEvent. Transfers Central→Vendor are handled directly by SAG movement documents not currently synced to Agentik.

ProductionOrder warehouse field is NULL for all 3,376 records.

---

## FASE 8 — Retornos (Vendedor → Central)

| Bodega | Negative Entries | Neg Qty | Positive Entries | Pos Qty | Return Rate |
|---|---|---|---|---|---|
| B02 | 15,328 | -69,607 | 582 | 977 | 4% |
| B03 | 6,950 | -17,666 | 533 | 808 | 8% |
| B23 | 7,409 | -26,047 | 606 | 930 | 8% |
| B29 | 5,312 | -20,139 | 540 | 884 | 10% |

**Return rates are 4-10%** — meaning for every 100 dispatch entries, 4-10 return entries exist. Returns DO happen but are relatively rare. The positive entries represent stock returning from vendors to central.

---

## FASE 9 — Conciliación Anual

### B00 (Ajustes Contables) Profile

| Line | Refs | Saldo | Positive | Negative |
|---|---|---|---|---|
| CS | 919 | -11,356 | 789 | -12,145 |
| AC | 607 | -7,364 | 432 | -7,796 |
| PK | 4 | -5,999 | 0 | -5,999 |
| LT | 604 | -3,084 | 47 | -3,131 |

B00 is net negative (-28,283) — adjustments mostly reduce inventory (write-offs, vendor billing for missing samples). The positive entries (789+432+47 = 1,268) represent inventory corrections/returns.

**Annual reconciliation is evidenced by B00 adjustments**, but we cannot determine periodicity or frequency from the current snapshot data (PIL only stores current saldo, not movement history).

---

## FASE 10 — Oportunidades Comerciales

### Top 30 Uncovered Refs with High PD Activity

| SKU | Stock | PD Orders | Description |
|---|---|---|---|
| L-8458 | 113 | 430 | Conjunto Náutico Niño |
| L-3487 | 116 | 400 | Pijama Niño CL |
| L-8466 | 105 | 374 | Conjunto Náutico Niño |
| L-3539 | 139 | 351 | Pijama Larga Niño Kids |
| L-1372 | 105 | 350 | Pijama Niña CC |

**All top opportunities are L-prefix (Latin Kids) pijamas and conjuntos** — high demand (300-430 PD orders), available stock (100-340 units), but ZERO vendor presence. These products sell through direct orders without sample distribution.

---

## Resumen Final

| Segment | Refs | Saldo |
|---|---|---|
| Central (B01+B04) | 3,360 | +162,934 |
| Vendedores (B02+B03+B23+B29) | 2,556 | -129,860 |
| Tiendas (B08-B15) | 131 | -4,707 |

**Vendor stock as % of central: 79.7%** — vendors have historically received samples equivalent to 80% of current central stock value.

---

## Hallazgos Operativos

### 1. LT Line Distribution Gap
Latin Kids (L-prefix) products are severely underrepresented in vendor bodegas despite being the highest-selling product line. Only B23 and B29 have meaningful LT presence.

### 2. Packaging Dominates Vendor Outflow
BP, BM, BG (bolsas) account for 34,044 of 129,860 total vendor outflow (26%). These are operational supplies, not product samples.

### 3. No Transfer Events
Central→Vendor transfers happen in SAG but are NOT captured in ProductionEvent. A transfer sync would require a new SAG MOVIMIENTOS query with the appropriate fuente code.

### 4. Low Return Rates
4-10% return rate suggests samples stay in the field for extended periods. Annual reconciliation evidence exists in B00 adjustments.

### 5. Seller→Bodega Mapping Missing
8 CRM sellers map to 4 SAG vendor bodegas, but the mapping is not stored in any Agentik table. Requires admin confirmation or SAG user master query.

---

## FASE 11 — Modelo Futuro (Conceptual)

### VendorInventoryProfile
```
vendorBodega: string       // "02" | "03" | "23" | "29"
sellerSlug?: string        // CRM seller if mapped
totalRefs: number          // distinct product refs
totalSaldo: number         // cumulative outflow
lineDistribution: Record<string, number>  // LT: X, CS: Y, AC: Z
returnRate: number         // positive/negative entry ratio
```

### VendorCoverageScore
```
sku: string
centralStock: number
vendorBodegas: number      // 0-4 bodegas present
vendorSaldo: number        // cumulative vendor outflow
pdOrders: number           // historical PD demand
coverageGap: boolean       // true if stock>0 but vendors=0
opportunityScore: number   // 0-100 based on stock*demand/coverage
```

### MissingCoverageAlert
```
sku: string
centralStock: number
pdDemand: number
suggestedVendors: string[] // bodegas that should carry this ref
reason: "HIGH_DEMAND_NO_SAMPLES" | "TOP_SELLER_NO_COVERAGE"
```

---

## Próximos Sprints

### P0: INVENTORY-VENDOR-PROFILE-SNAPSHOT-01
Create VendorInventoryProfile snapshot per bodega — same pattern as CommercialCoverageSnapshot but for vendor bodegas. Include line distribution, return rate, coverage depth.

### P1: INVENTORY-COVERAGE-GAP-DETECTOR-01
Compare central stock vs vendor coverage. Generate coverage gap alerts for refs with high demand + available stock + zero vendor presence.

### P2: INVENTORY-VENDOR-BODEGA-MAPPING-01
Admin UI to map sellerSlug → SAG bodega code. Once mapped, vendor coverage becomes part of the commercial intelligence surface.

### P3: INVENTORY-TRANSFER-SYNC-01
Sync SAG transfer movements (Central→Vendor, Vendor→Central) to track sample distribution history and return patterns.

---

## Files Created

| File | Purpose |
|---|---|
| `INVENTORY_VENDOR_WAREHOUSE_TOPOLOGY_01.md` | This document |

No scripts created, no production code modified. All queries run inline via `npx tsx -e`.

---

## TSC Baseline

```
npx tsc --noEmit -> 160 errors (baseline preserved, 0 new errors)
```
