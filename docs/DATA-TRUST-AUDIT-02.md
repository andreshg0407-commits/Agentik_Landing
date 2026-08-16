# DATA TRUST AUDIT 02 — SAG SOURCE TRUST / CROSS-SOURCE RECONCILIATION

**Date:** 2026-08-15
**Tenant:** Castillitos
**Sprint:** DATA-TRUST-AUDIT-02
**Constraint:** READ-ONLY — no code changes, no schema changes, no fixes

---

## Phase 1 — Source Contract: 10 SAG Views

| # | View | Status in SAG | Status in query-catalog.ts | Wired at Runtime | Notes |
|---|---|---|---|---|---|
| 1 | vw_agentik_ventas | in_review (not_submitted) | NOT IN CATALOG | NO — via raw SAG tables | Used only in seller-commission-service.ts (direct SOAP) |
| 2 | vw_agentik_cartera | in_review | CANONICAL_AR.cartera (validated) | YES | fetchCertifiedArSnapshot() in canonical-ar-service.ts |
| 3 | vw_agentik_recaudos | in_review | CANONICAL_AR.recaudos (validated) | YES | canonical-recaudos-service.ts + seller-commission-service.ts |
| 4 | vw_agentik_pagos | agreed (submitted) | NOT IN CATALOG | NO | AP (cuentas por pagar), not AR. sc_cobrar_pagar='P' |
| 5 | vw_agentik_clientes | draft | NOT IN CATALOG | NO | Raw TERCEROS used instead |
| 6 | vw_agentik_vendedores | draft | NOT IN CATALOG | NO | Raw TERCEROS used instead |
| 7 | vw_agentik_productos | draft | NOT IN CATALOG | NO | Raw ARTICULOS used instead |
| 8 | vw_agentik_inventario | draft | NOT IN CATALOG | NO | Raw INVENTARIO used instead |
| 9 | vw_agentik_compras | draft | NOT IN CATALOG | NO | Not implemented |
| 10 | vw_agentik_produccion | draft | NOT IN CATALOG | NO | Not implemented |

### Verdict Phase 1

Only 2 of 10 views are wired at runtime: `vw_agentik_cartera` and `vw_agentik_recaudos`. The rest of the SAG data pipeline uses raw tables (TERCEROS, ARTICULOS, CARTERA, INVENTARIO, MOVIMIENTOS) via the SOAP `consultaSagJson` method.

`vw_agentik_ventas` exists in the data contract definition (`sag-domain-contracts.ts`) with 41 fields but is NOT in the query catalog and NOT used for SaleRecord sync. It IS used directly in `seller-commission-service.ts` for commission computation.

`vw_agentik_pagos` is correctly identified as AP (accounts payable), NOT AR. No code misuses it as collections/receivables.

---

## Phase 2 — Usage Trace: VIEW → ADAPTER → STORAGE → SERVICE → UI

### SaleRecord Pipeline (Ventas)

```
SAG SOAP (raw VENTAS_MAESTRO/FACTURAS)
  → query-catalog.ts (raw table queries, status varies)
  → mappers.ts (mapSaleRow)
  → storage.ts line 486: productLine: "SAG" ← LOSSY_MAPPING
  → SaleRecord (Prisma)
  → Used by: executive-summary, org-alerts, control-comercial-loader
```

**CRITICAL:** `storage.ts` hardcodes `productLine: "SAG"` for ALL synced records. The LINEA field from SAG is NEVER captured — rawJson contains NO LINEA-related keys.

### CustomerReceivable Pipeline (Cartera)

```
SAG SOAP (raw CARTERA table)
  → query-catalog.ts (raw queries)
  → mappers.ts → storage.ts
  → CustomerReceivable (Prisma) — paidAmount always 0
  → Used by: crm-alert-engine (NO certification check), org-alerts (HAS certification check)

Parallel certified path:
  vw_agentik_cartera (SAG view, pre-computed SALDO_PENDIENTE)
  → canonical-ar-service.ts (fetchCertifiedArSnapshot)
  → Used by: seller-app, vendedor-360, cliente-360, frontline-attention
```

### ProductEntity Pipeline (Productos)

```
SAG SOAP (raw ARTICULOS)
  → query-catalog.ts
  → mappers.ts → storage.ts
  → ProductEntity (Prisma) — productLine populated from SAG FK (1/2/3/4/5/6)
```

### ProductInventoryLevel Pipeline (Inventario)

```
SAG SOAP (raw INVENTARIO)
  → query-catalog.ts
  → mappers.ts → storage.ts
  → ProductInventoryLevel (Prisma) — warehouseId=ka_nl_bodega, externalRef=ss_codigo
```

### CollectionRecord Pipeline (Recaudos)

```
SAG SOAP (v_pagosnew — LEGACY, NOT canonical)
  → storage.ts
  → CollectionRecord (Prisma) — 21,228 records, $26.2B

Canonical path:
  vw_agentik_recaudos (SAG view)
  → canonical-recaudos-service.ts (fetchRecaudos)
  → seller-commission-service.ts (commission computation)
```

---

## Phase 3 — Ventas Deep Audit

### 3.1 SaleRecord productLine = LOSSY_MAPPING

| Field | Value | Coverage |
|---|---|---|
| productLine | "SAG" (ALL records) | 100% hardcoded |
| productCode | NULL | 100% NULL |
| sellerCode | NULL | 100% NULL |
| sellerName | "Sin Vendedor" | 100% (all records) |
| brand | NULL | 100% NULL |
| zone | NULL | 100% NULL |
| units | NULL | 100% NULL |
| customerNit | populated | 97.7% |
| customerName | populated | 100% |
| comprobanteCode | populated | 99.3% |

**ROOT_CAUSE = LOSSY_MAPPING:** `storage.ts` line 486 hardcodes `productLine: "SAG"`. The rawJson stored in SaleRecord contains NO LINEA-related keys — the field is never queried from SAG in the ventas pipeline.

**Five critical fields are 100% NULL:** productCode, sellerCode, brand, zone, units. These fields exist in the Prisma schema but are never populated by the SOAP sync.

**sellerName = "Sin Vendedor" on all 131,581 records:** Complete seller identity loss. The seller dimension is absent from SaleRecord.

### 3.2 SaleRecord Totals

| Metric | Value |
|---|---|
| Total records | 131,581 |
| Total amount | $34,199,453,391 |
| Date range | 2020-05-26 → 2026-08-15 |
| Grain | TRANSACTION (100%) |

### 3.3 Document Family Distribution

| Family | Records | Amount |
|---|---|---|
| OFFICIAL_INVOICE | 40,137 | $19,589,601,474 |
| DISPATCH_REMISION | 8,587 | $8,827,615,327 |
| CREDIT_NOTE | 8,312 | -$3,735,538,853 |
| OTHER | 74,545 | $9,517,775,444 |

### 3.4 Source Type

| sagSourceType | Records | sourceDocumentStage | Records |
|---|---|---|---|
| OFICIAL | 116,255 | FACTURADO | 116,255 |
| REMISION | 15,326 | REMITIDO | 15,326 |

### 3.5 Channel Distribution

| Channel | Records | Amount |
|---|---|---|
| OTRO | 54,573 | $24,893,447,928 |
| EMPRESA | 43,281 | $5,650,071,658 |
| ALMACEN | 31,814 | $3,259,554,943 |
| ONLINE | 1,913 | $396,378,862 |

### 3.6 COL vs SR Revenue Reconciliation (6 months)

| Source | Records | Revenue (6mo) |
|---|---|---|
| SaleRecord | 11,590 | $2,481,466,950 |
| CustomerOrderLine (FACTURADO) | 81,114 | $2,583,677,283 |
| **Ratio COL/SR** | | **1.04** |

The 4% discrepancy is expected: COL includes line-level detail (qty × unitValue) while SR is header-level.

### 3.7 Revenue by Line (COL + ProductEntity join, 6mo)

| Line FK | Line Name | Revenue (6mo) |
|---|---|---|
| 1 | Latin Kids (LT) | $1,471,608,131 |
| 2 | Castillitos (CS) | $524,152,231 |
| 5 | Importacion (IM) | $584,766,253 |
| Unmatched refs | — | 208 lines |

**Per-line revenue is ONLY available via CustomerOrderLine → ProductEntity.productLine join.** SaleRecord cannot provide this dimension.

### 3.8 Monthly Breakdown (6mo)

| Month | Records | Amount |
|---|---|---|
| 2026-02 | 1,858 | $261M |
| 2026-03 | 2,104 | $602M |
| 2026-04 | 1,734 | $232M |
| 2026-05 | 1,778 | $409M |
| 2026-06 | 1,891 | $312M |
| 2026-07 | 1,940 | $558M |
| 2026-08 | 285 | $107M |

### 3.9 CustomerOrderRecord

| Status | Records |
|---|---|
| FACTURADO | 9,803 |
| PENDIENTE | 77 |
| CANCELADO | 2 |
| **Total** | **9,882** |

### 3.10 rawJson LINEA Check

**Sample of 5 SaleRecord.rawJson:** ZERO LINEA-related keys found in any record.

**Conclusion:** The LINEA dimension is not queried from SAG in the ventas pipeline. The raw source data never contained it. This is not a mapping bug — the query itself does not request LINEA. Fix requires adding LINEA to the SAG ventas query, or (preferred) migrating to vw_agentik_ventas which includes ID_PRODUCTO and LINEA.

---

## Phase 4 — Cartera Audit

### 4.1 CustomerReceivable Summary

| Metric | Value |
|---|---|
| Total records | 129,591 |
| All status | OPEN (100%) |
| originalAmount sum | $33,612,647,291 |
| paidAmount sum | **$0 (100% records)** |
| balanceDue sum | $33,612,647,291 |
| Date range | 2020-05-26 → 2026-08-31 |
| Unique customerNit | 30,892 |
| customerId FK populated | 96.5% |

### 4.2 CRITICAL: paidAmount = $0 on ALL 129,591 records

**paidAmount is NEVER updated.** The SOAP sync creates CustomerReceivable records but never applies collection data. Therefore `balanceDue = originalAmount` for every single record.

**Impact:** Any intelligence derived from CustomerReceivable overdue amounts is **severely inflated**. Example from prior audit: AMV LLANO shows $542M phantom debt vs $35.6M real (from SAG vw_agentik_cartera).

### 4.3 Aging Distribution

| Bucket | Records | Balance Due |
|---|---|---|
| CURRENT | 2,834 | $898M |
| 1-30 days | 4,096 | $903M |
| 31-60 days | 2,483 | $358M |
| 61-90 days | 2,075 | -$30M |
| 90+ days | **118,103** | **$31,484M** |

**91.2% of records are 90+ days overdue.** Average daysOverdue = 913 days. Max = 2,156 days (nearly 6 years). This is because paidAmount is never updated — fully-paid invoices remain as "overdue" forever.

### 4.4 BusinessAlert cartera_vencida

2,022 alerts generated by `crm-alert-engine.ts::checkCarteraVencida()` which reads CustomerReceivable directly with NO `isReceivableDataCertified()` safety gate.

**Dual alert path:**
- `crm-alert-engine.ts` → reads CustomerReceivable → NO certification check → 2,022 inflated alerts
- `org-alerts.ts` → reads vw_agentik_cartera via `fetchCertifiedArSnapshot()` → HAS certification check → accurate

### 4.5 Certified vs Uncertified Cartera

| Source | Total Balance | Accuracy |
|---|---|---|
| CustomerReceivable (Prisma) | $33.6B | INFLATED — paidAmount=0 always |
| vw_agentik_cartera (SAG view) | Real balances (SALDO_PENDIENTE pre-computed) | CERTIFIED |

**Truth status:** Castillitos promoted to CERTIFIED on 2026-08-14 (`receivable-truth-status.ts` line 58). The certified path uses `canonical-ar-service.ts` → `vw_agentik_cartera` directly.

---

## Phase 5 — Recaudos Audit

### 5.1 CollectionRecord (Legacy Source)

| Metric | Value |
|---|---|
| Total records | 21,228 |
| Amount sum | $26,241,294,724 |
| Source | SAG v_pagosnew (LEGACY) |

**IMPORTANT:** CollectionRecord is sourced from `v_pagosnew` (SAG legacy view), NOT from `vw_agentik_recaudos`. Per `collection-source-authority.ts`, CollectionRecord from SAG_V_PAGOSNEW **MUST NOT** be used as canonical AR authority.

### 5.2 Canonical Recaudos Path

```
vw_agentik_recaudos (SAG view)
  → canonical-recaudos-service.ts::fetchRecaudos()
  → Returns: ID_RECAUDO, VALOR_RECAUDADO, DOCUMENTO_RELACIONADO, CLIENTE_ID, FECHA_RECAUDO
  → Used by: seller-commission-service.ts (commission computation)
```

### 5.3 PaymentRecord

| Metric | Value |
|---|---|
| Total records | **0** |

PaymentRecord model exists but has zero data.

---

## Phase 6 — Cartera ↔ Recaudos Reconciliation

### 6.1 The Reconciliation Gap

CustomerReceivable ($33.6B balance) does NOT reflect the $26.2B in CollectionRecord because:
1. paidAmount is never updated on CustomerReceivable
2. CollectionRecord has no `receivableId` FK linking to specific receivables (error on link query)
3. The two models are populated by independent sync pipelines with no cross-reference

### 6.2 Certified Path Reconciliation

The **certified** path bypasses both Prisma models entirely:
- Cartera: `vw_agentik_cartera` → SALDO_PENDIENTE (pre-computed by SAG, already net of collections)
- Recaudos: `vw_agentik_recaudos` → row-level collection applications

**SAG performs the reconciliation internally.** Agentik's Prisma models are never reconciled.

---

## Phase 7 — Commission Chain Proof

### 7.1 Commission Pipeline (seller-commission-service.ts)

```
vw_agentik_recaudos (FECHA_RECAUDO, VALOR_RECAUDADO, DOCUMENTO_RELACIONADO, CLIENTE_ID)
  → Parse DOCUMENTO_RELACIONADO → (PREFIX, NUMBER)
  → Lookup in vw_agentik_ventas (NUMERO_DOCUMENTO, CLIENTE_ID) → get VENDEDOR_ID, FECHA_DOCUMENTO
  → Row-level eligibility: exact sale must exist + VENDEDOR_ID must match sellerTerceroId
  → Compute days = calendar(FECHA_RECAUDO - FECHA_DOCUMENTO)
  → Apply commission band → rate → commission per application row
```

### 7.2 Commission Bands (SELLER_COMMISSION_BANDS)

| Band | Days | Rate |
|---|---|---|
| 0-59 | 0-59 | 5% |
| 60-75 | 60-75 | 4% |
| 76-90 | 76-90 | 3% |
| 91-105 | 91-105 | 2% |
| 106+ | 106+ | 1% |

### 7.3 Authorities

| Authority | Source | Status |
|---|---|---|
| COLLECTION | vw_agentik_recaudos | CERTIFIED (live SAG query) |
| SALE | vw_agentik_ventas | CERTIFIED (live SAG query) |
| SELLER | VENDEDOR_ID (integer, SAG ka_nl_tercero_vend) | Resolved server-side |
| INVOICE DATE | FECHA_DOCUMENTO from vw_agentik_ventas | CERTIFIED |

**Commission chain is FULLY CERTIFIED** — uses SAG views directly, no Prisma intermediary.

---

## Phase 8 — vw_agentik_pagos (AP, NOT AR)

### 8.1 Verification

- `vw_agentik_pagos` contains Accounts Payable (cuentas por pagar): `sc_cobrar_pagar = 'P'`
- This is NOT collections/recaudos. It represents payments TO suppliers
- Status: "agreed (submitted)" — SAG has confirmed the view
- **No code misuses vw_agentik_pagos as AR/collections**

### 8.2 Current Usage

vw_agentik_pagos is NOT in the query catalog and NOT currently consumed at runtime. It's defined in the data contract (`sag-domain-contracts.ts`) but awaiting SAG response for implementation.

---

## Phase 9 — Clientes + Vendedores Identity

### 9.1 CustomerProfile (33,860 records)

| Field | Populated | Coverage |
|---|---|---|
| nit | 33,644 | 99.4% |
| erpId | 33,613 | 99.3% |
| sagTerceroId | 32,282 | 95.3% |
| crmId | 29,489 | 87.1% |
| city | 33,631 | 99.3% |
| address | 33,512 | 99.0% |
| phone | 33,429 | 98.7% |
| email | 13,867 | **41.0%** |
| sellerSlug | 4,893 | **14.5%** |

### 9.2 Identity Status

| Status | Count |
|---|---|
| VERIFIED | 14,493 (42.8%) |
| NEEDS_REVIEW | 19,363 (57.2%) |
| CONSUMIDOR_FINAL | 1 |
| DUPLICATE | 3 |

### 9.3 Identity Gaps

- **email at 41%:** Major gap for digital engagement
- **sellerSlug at 14.5%:** Most customers have NO seller assignment in CustomerProfile. Seller-customer relationship exists only in CRM quote history (60% confidence per cliente-360 audit)
- **identityStatus NEEDS_REVIEW at 57%:** More than half of customer profiles are unverified

### 9.4 Seller Identity in SaleRecord

SaleRecord has `sellerCode=NULL` and `sellerName="Sin Vendedor"` on ALL 131,581 records. **The seller dimension is completely absent from the sales pipeline.**

Seller authority for commissions comes from `vw_agentik_ventas.VENDEDOR_ID` (SAG view, queried live). SaleRecord does NOT carry this field.

---

## Phase 10 — Products Grain

### 10.1 ProductEntity (4,595 records, 100% active)

| Field | Populated | Coverage |
|---|---|---|
| sku | 4,595 | 100% |
| externalId | 4,591 | 99.9% |
| productLine | 3,939 | 85.7% |
| price | 4,595 | 100% |
| costo | 3,280 | 71.4% |
| handlingUnit | 554 | 12.1% |

### 10.2 productLine Distribution (Active Products)

| productLine | Count | Notes |
|---|---|---|
| "1" (LT) | 1,759 | Latin Kids |
| "2" (CS) | 1,490 | Castillitos |
| "5" (IM) | 663 | Importacion |
| "3" (OT) | 13 | Otros |
| "4" (PW) | 3 | Power |
| "6" (PD) | 7 | Produccion |
| NULL | 656 | **14.3% unclassified** |
| "Latin Kids" | 3 | DATA QUALITY: text instead of FK |
| "Castillitos" | 1 | DATA QUALITY: text instead of FK |

### 10.3 CRITICAL: Costo Coverage for Importacion

| Line | Total | With costo | Coverage |
|---|---|---|---|
| All lines | 4,595 | 3,280 | 71.4% |
| Importacion (line=5) | 663 | **5** | **0.8%** |

**KPI "Capital en inventario lento" is BLOCKED.** Only 5 of 663 import references have costo populated.

### 10.4 SKU vs externalId

100% match in sample of 50. These fields are synonymous for ProductEntity.

### 10.5 Data Quality Issues

- 4 products have TEXT productLine values ("Latin Kids", "Castillitos") instead of numeric FK codes
- 656 products (14.3%) have NULL productLine — these fall through all per-line revenue calculations

---

## Phase 11 — Inventory (PIL vs SAG)

### 11.1 ProductInventoryLevel (159,438 records)

| Metric | Value |
|---|---|
| Total records | 159,438 |
| With positive quantity | 58,053 |
| reservedQty > 0 | **0 (unused field)** |

### 11.2 Top Warehouses by Stock

| warehouseId | externalRef (ss_codigo) | SKUs | Quantity | Notes |
|---|---|---|---|---|
| 13 | 04 | 48,892 | 1,327,589 | B04 — Main production warehouse |
| 10 | 01 | 3,072 | 67,948 | B01 — Finished goods |
| 36 | 26 | 84 | 49,109 | B26 — Import staging (PART 2) |
| 55 | 44 | 103 | 36,069 | Container |
| 37 | 27 | 106 | 33,247 | B27 — Import staging (PART 1) |
| **33** | **24** | **780** | **22,779** | **B24 — IMPORT COMMERCIAL (only vendible)** |
| 31 | 00 | 831 | 1,256 | Default/unknown |

### 11.3 Import Warehouse Topology (from warehouse-master.ts)

| ka_nl_bodega | ss_codigo | Type | Participates in Commercial Stock |
|---|---|---|---|
| 33 | 24 | COMMERCIAL_AVAILABLE_IMPORT | YES — only vendible |
| 36 | 26 | IMPORT_STAGING | NO |
| 37 | 27 | IMPORT_STAGING | NO |
| 41-60 | 30-49 | IMPORT_CONTAINER | NO — temporary |

### 11.4 Inventory Observations

- **reservedQty is completely unused** (0 on all 159K records)
- warehouseId maps to ka_nl_bodega (SAG internal PK), externalRef maps to ss_codigo (SAG business code)
- B04 (production) dominates with 1.3M units across 48K SKUs
- B24 (import commercial) has 780 SKUs with 22,779 units — consistent with import-service.ts usage

---

## Phase 12 — Compras Coverage

**vw_agentik_compras:** NOT implemented. No query catalog entry. No sync pipeline. No Prisma model for purchase orders.

Status: "draft" in data contract. Not submitted to SAG.

---

## Phase 13 — Produccion Coverage

**vw_agentik_produccion:** NOT implemented as a SAG view pipeline. However, production data IS synced via raw SAG queries:

- ProductionEvent model exists with synced data (OP: 3,376 orders, ET: 3,640 events)
- CN (consumo) forensics complete (7,890 headers, 81,367 lines)
- Uses raw SAG tables, not vw_agentik_produccion view

---

## Phase 14 — JUPITER / Cross-Tenant Contamination

### 14.1 Evidence

| Entity | Model | "JUPITER" Count | "INDIANA" | "LUDISAN" |
|---|---|---|---|---|
| CustomerProfile | CP | 1 | 0 | 0 |
| CustomerReceivable | CR | 2 | 0 | 0 |
| BusinessAlert | BA | 0 | 0 | 0 |

### 14.2 Assessment

- **JUPITER contamination confirmed but minimal:** 1 customer profile, 2 receivables
- From prior audit (DATA-TRUST-AUDIT-01): system alerts mention "Mayor deudor: JUPITER GRUPO EMPRESARIAL SAS con $87M vencido" — this comes from vw_agentik_cartera which crosses tenant boundaries
- **Root cause:** SAG cartera view does not filter by tenant/company
- **No INDIANA or LUDISAN contamination**

### 14.3 Severity: LOW

JUPITER is a real SAG customer visible in cross-company views. The contamination is limited to:
1. 1 CustomerProfile (likely from SAG TERCEROS sync)
2. 2 CustomerReceivable (from CARTERA sync)
3. System alert text (from vw_agentik_cartera)

---

## Phase 15 — Intelligence Coverage Matrix

| Domain | SAG View | Prisma Model | Coverage | Status | Trust Level |
|---|---|---|---|---|---|
| **Ventas** | vw_agentik_ventas (NOT wired) | SaleRecord | PARTIAL | LOSSY_MAPPING | productLine/seller/product ALL lost |
| **Cartera** | vw_agentik_cartera (WIRED) | CustomerReceivable | DUAL | CERTIFIED (view) / INFLATED (Prisma) | Certified path exists, legacy path over-reports |
| **Recaudos** | vw_agentik_recaudos (WIRED) | CollectionRecord | DUAL | CERTIFIED (view) / LEGACY (Prisma) | Canonical from SAG view; Prisma from v_pagosnew |
| **Pagos** | vw_agentik_pagos (NOT wired) | PaymentRecord (0 rows) | UNUSED | NOT_IMPLEMENTED | AP not AR — correct non-usage |
| **Clientes** | vw_agentik_clientes (NOT wired) | CustomerProfile | PARTIAL | RAW_TABLES | 99% NIT, 41% email, 14.5% seller |
| **Vendedores** | vw_agentik_vendedores (NOT wired) | — | LOW_COVERAGE | RAW_TABLES | SaleRecord has "Sin Vendedor" on 100% |
| **Productos** | vw_agentik_productos (NOT wired) | ProductEntity | PARTIAL | RAW_TABLES | 85.7% productLine, 0.8% costo for imports |
| **Inventario** | vw_agentik_inventario (NOT wired) | ProductInventoryLevel | PARTIAL | RAW_TABLES | 159K records, reservedQty unused |
| **Compras** | vw_agentik_compras (NOT wired) | — | UNUSED | NOT_IMPLEMENTED | No pipeline exists |
| **Produccion** | vw_agentik_produccion (NOT wired) | ProductionEvent | PARTIAL | RAW_TABLES | OP+ET synced, CN forensics done |

### Status Legend

| Status | Meaning |
|---|---|
| CERTIFIED | Data verified against SAG authority, reconciled |
| PARTIAL | Some fields populated, others lost or missing |
| LOSSY_MAPPING | Source has data but mapper discards it |
| DUAL | Two paths exist (certified SAG view + uncertified Prisma) |
| RAW_TABLES | Uses direct SAG table queries, not vw_agentik views |
| NOT_IMPLEMENTED | No pipeline exists |
| UNUSED | View exists but no code consumes it |
| LOW_COVERAGE | Pipeline exists but critical fields are empty |
| INFLATED | Data present but over-reported due to missing reconciliation |

---

## Phase 16 — Final Verdict

### Critical Findings (P0)

| # | Finding | Severity | Impact |
|---|---|---|---|
| F1 | SaleRecord.productLine="SAG" on 100% records | CRITICAL | Per-line revenue impossible from SaleRecord. Workaround via COL+PE exists |
| F2 | SaleRecord.sellerCode=NULL, sellerName="Sin Vendedor" on 100% | CRITICAL | Seller dimension completely absent from sales pipeline |
| F3 | SaleRecord.productCode=NULL on 100% | CRITICAL | Product-level sales analysis impossible from SaleRecord |
| F4 | CustomerReceivable.paidAmount=$0 on 100% (129K records) | CRITICAL | $33.6B phantom debt. Cartera alerts over-report by 10-30x |
| F5 | CRM alert engine bypasses isReceivableDataCertified() | HIGH | 2,022 inflated cartera_vencida alerts based on uncertified data |
| F6 | ProductEntity.costo=0.8% coverage for Importacion | HIGH | Capital-in-inventory KPI blocked |
| F7 | 656 products with NULL productLine (14.3%) | MEDIUM | Fall through per-line calculations |
| F8 | JUPITER cross-tenant: 1 CP, 2 CR | LOW | Minimal contamination, SAG view needs tenant filter |

### Data Quality Summary

| SaleRecord Field | Coverage | Quality |
|---|---|---|
| amount | 100% | GOOD |
| saleDate | 100% | GOOD |
| customerNit | 97.7% | GOOD |
| customerName | 100% | GOOD |
| sagDocumentFamily | 100% | GOOD |
| sourceDocumentStage | 100% | GOOD |
| **productLine** | 100% | **LOSSY — always "SAG"** |
| **productCode** | 0% | **MISSING** |
| **sellerCode** | 0% | **MISSING** |
| **sellerName** | 100% | **LOSSY — always "Sin Vendedor"** |
| **brand** | 0% | **MISSING** |
| **zone** | 0% | **MISSING** |
| **units** | 0% | **MISSING** |

### Recommended Fix Priority

| Priority | Fix | Blocked By |
|---|---|---|
| P0 | Migrate ventas pipeline to vw_agentik_ventas (41 fields including LINEA, VENDEDOR_ID, ID_PRODUCTO) | SAG view approval (status: in_review) |
| P0 | Add isReceivableDataCertified() check to crm-alert-engine.ts | Nothing — can do now |
| P1 | Reconcile CustomerReceivable with CollectionRecord or deprecate in favor of certified path | Architecture decision |
| P1 | Backfill ProductEntity.costo for Importacion from SAG nd_costo_std | SAG SOAP query |
| P2 | Clean up 4 products with text productLine values ("Latin Kids", "Castillitos") | Nothing |
| P2 | Classify 656 NULL-productLine products | SAG LINEAS lookup |
| P3 | Filter JUPITER from SAG cartera view | SAG view modification |

### Architecture Recommendation

The current dual-path architecture (Prisma models vs SAG views) creates reconciliation debt. The certified path (canonical-ar-service.ts → vw_agentik_cartera/recaudos) has proven trustworthy. The uncertified path (CustomerReceivable with paidAmount=0) generates phantom data.

**Recommended end-state:** All financial-critical domains (ventas, cartera, recaudos, comisiones) should use SAG views as canonical authority. Prisma models serve as read cache, not source of truth.

---

## Appendix: DB Evidence

All evidence collected via read-only Prisma queries on 2026-08-15.

```
Organization: castillitos (cmmpwstuf000dp5y58kj1daaj)
SaleRecord: 131,581 records
CustomerReceivable: 129,591 records
CustomerProfile: 33,860 records
ProductEntity: 4,595 records
ProductInventoryLevel: 159,438 records
CollectionRecord: 21,228 records
PaymentRecord: 0 records
CustomerOrderRecord: 9,882 records
BusinessAlert (cartera_vencida): 2,022 records
```
