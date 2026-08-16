# DATA-TRUST-REMEDIATION-01B — Evidence Closeout

**Status:** COMPLETE
**Date:** 2026-08-15
**Audit source:** DATA-TRUST-AUDIT-02.md
**Tests:** 63/63 PASS (136 assertions)
**Evidence:** `scripts/out/data-trust-remediation-01.json`

---

## 1. VENTAS — Real Evidence (500 rows from vw_agentik_ventas)

### Coverage Before → After

| Field | Before (legacy MOVIMIENTOS) | After (vw_agentik_ventas) | Count |
|---|---|---|---|
| productLine | 0% | 99.4% | 497/500 |
| productCode | 0% | 100.0% | 500/500 |
| sellerCode | 0% | 99.8% | 499/500 |
| sellerName | 0% | 99.8% | 499/500 |
| costo | 0.8% | 95.2% | 476/500 |
| units | 0% | 100.0% | 500/500 |

### Without Seller (VENDEDOR_ID=null): 1 record

Only `CONSUMIDOR FINAL` (POS cash sale, doc=1) — legitimately without seller assignment.

### Unresolved productLine: 0

All LINEA text values in sample resolved via LINEA_NAME_TO_CODE reverse mapping.

### Source → Canonical Example

```
SOURCE:  ID_DOCUMENTO=284602, TIPO_DOCUMENTO="Factura", CLIENTE="CONSUMIDOR FINAL",
         VENDEDOR_ID="25338", VENDEDOR="VERONICA RODAS PEREZ",
         CODIGO_PRODUCTO="CA-2621215B", LINEA="CASTILLITOS", VALOR_TOTAL=58176.3

CANONICAL: sourceId="VENTA-284602-3004103704", comprobante="213",
           sellerCode="25338", sellerName="VERONICA RODAS PEREZ",
           productCode="CA-2621215B", productLine="CS",
           productName="CONJUNTO BERMUDA CAMISETA NIÑO BEBÉ",
           channel="OTRO", amount=58176.3, units=1, unitPrice=83109, costo=20419.66
```

### Rules Verified

- LINEA conserves real dimension from vw_agentik_ventas (text → 2-letter code)
- Seller authority: vw_agentik_ventas.VENDEDOR_ID only (no heuristics)
- No invented data: all fields sourced directly from view

---

## 2. CARTERA — paidAmount NOT Invented (200 rows from vw_agentik_cartera)

### Transformation

```
SOURCE FIELDS:
  VALOR_DOCUMENTO   → originalAmount (authoritative)
  SALDO_PENDIENTE   → balanceDue (authoritative — SAG's residual balance)
  DIAS_MORA         → daysOverdue
  ESTADO_CARTERA    → status classification

TRANSFORMATION:
  paidAmount        = 0 (UNAVAILABLE)
  reductionAmount   = VALOR_DOCUMENTO - SALDO_PENDIENTE (stored in meta ONLY)
  paidAmountStatus  = "UNCLASSIFIED_REDUCTION"
  truthStatus       = CERTIFIED (castillitos via receivable-truth-status.ts)
```

### Why paidAmount = UNAVAILABLE

`VALOR_DOCUMENTO - SALDO_PENDIENTE` mixes:
- Actual payments (recaudos)
- Credit notes applied
- Accounting adjustments
- Tax retentions

Without vw_agentik_recaudos cross-reference to classify the decomposition, labeling the entire difference as "paidAmount" is incorrect. The raw reduction is preserved in `meta.reductionAmount` for future classification.

**vw_agentik_pagos is NOT used**: `sc_cobrar_pagar='P'` = Accounts Payable, not AR.

### Document Classification (200 rows, sorted by DIAS_MORA DESC)

| Status | Count |
|---|---|
| overdue | 200 |
| paid | 0 |
| open | 0 |
| negative (credit notes/adjustments) | 18 |

### balanceDue === SALDO_PENDIENTE: PASS

All 200 rows verified — balanceDue equals SAG SALDO_PENDIENTE exactly.

### Examples

**Partial (payment applied):**
```
documento=FE-2819, tipoDoc="Factura", customer="LUZ AMPARO POVEDA GUTIERREZ"
valorDocumento=10,282,145  saldoPendiente=1,832,830
reductionAmount=8,449,315  paidAmount=0 (UNAVAILABLE)
balanceDue=1,832,830       daysOverdue=1590  status=overdue
paidAmountStatus=UNCLASSIFIED_REDUCTION
```

**Credit note:**
```
documento=3D-15, tipoDoc="Nota Crédito", customer="KATERINE CADAVID"
valorDocumento=-54,899.46  saldoPendiente=-0.46
reductionAmount=-54,899    paidAmount=0 (UNAVAILABLE)
balanceDue=-0.46           daysOverdue=2103  status=overdue
```

---

## 3. Reports Fail-Closed

`runCarteraVencida` does NOT represent unavailability as zero debt.

When `isReceivableDataCertified()` returns false:
- Returns `dataStatus: "UNVERIFIED"` (new field on ReportResult)
- Returns KPI `{ label: "Estado", value: "Datos en validación" }`
- Returns `subtitle: UNVERIFIED_RECEIVABLE_LABEL`
- UI, reports, and Copilot can distinguish "no data" from "no debt"

`runClientes` suppresses `overdueReceivable` column and KPIs when not certified.

### Consumer Audit (29 files)

| Status | Count | Files |
|---|---|---|
| GATED | 9 | crm-alert-engine, collections/queue, reports/runners (2 fns), sales-rep-alerts, sales-rep-data-loader, sales-rep-business-decisions, order-decision-engine, customer360/service, cartera-kpis |
| SAFE | 6 | storage.ts (writes only), report-ownership (static), types-only files, barrel exports |
| NEEDS_REVIEW | 16 | See list below |

**NEEDS_REVIEW consumers** (read CustomerReceivable/overdueReceivable without certification gate):

| File | Risk |
|---|---|
| `lib/sales/reports.ts` | Generates sales reports with AR data |
| `lib/finance/reconciliation.ts` | Reconciliation engine |
| `lib/finance/relationship-graph.ts` | Financial relationship mapping |
| `lib/finance/receivables-snapshot.ts` | AR snapshot for dashboards |
| `lib/finance/payment-service.ts` | Payment processing |
| `lib/commercial-ledger/service.ts` | Commercial ledger |
| `lib/comercial/sales-reps/sales-rep-evidence.ts` | Rep evidence for decisions |
| `lib/comercial/sales-reps/sales-rep-policy-pack-config.ts` | Policy config with overdueReceivable |
| `lib/comercial/sales-reps/sales-rep-policy-pack.ts` | Policy pack execution |
| `lib/comercial/sales-reps/sales-rep-decision-engine.ts` | Decision engine with overdueReceivable |
| `lib/comercial/data-layer/domains/customer/index.ts` | Customer data layer |
| `lib/comercial/data-layer/domains/customer/customer-credit-profile.ts` | Credit decisions |
| `lib/collections/whatsapp-hooks.ts` | WhatsApp collection notifications |
| `lib/collections/auto-task.ts` | Auto-task for collections |
| `lib/collections/campaigns.ts` | Collection campaigns |
| `lib/collections/mila-memory.ts` | Mila agent memory |

---

## 4. Findings

### F6: Importación costo — BLOCKED_BY_SOURCE

- **ProductEntity with lineaSag="IMPORTACION":** 663
- **With costo > 0:** 5 (0.8% coverage)
- **Root cause:** `vw_agentik_productos.COSTO_PROMEDIO` sourced from `saldos_articulos` where `Bodega.sc_clase='P'` (production warehouses only). Import products have no production warehouse.
- **Mitigation:** `mapSagVentasRow()` reads per-line `COSTO` from `vw_agentik_ventas` → 95.2% coverage at transaction grain. This provides cost-of-goods-sold per sale but NOT catalog-level unit cost for unsold import products.
- **Status:** BLOCKED_BY_SOURCE — SAG architecture limitation, not a mapping bug.

### F7: 656 NULL productLine — SOURCE_MISSING

- **Prisma NULL productLine:** 656
- **SAG NULL LINEA (vw_agentik_productos):** 14,806 / 73,519
- **Classification:** SOURCE_MISSING — products lack `ss_linea` FK in SAG ARTICULOS table. This is upstream data quality, not a mapping loss.
- **Note:** The 656 in Prisma is a subset already synced. SAG has 14,806 products without LINEA assignment (20.1%).
- **Existing productLine distribution in Prisma:**
  - "1" (Latin Kids): 1,759
  - "2" (Castillitos): 1,490
  - "5" (Importación): 663
  - null: 656
  - Others: 27

### F8: JUPITER — CLEAN

- **Customer profiles:** 1 → "Jupiter Grupo Empresarial Sas", NIT=902046268, city=MEDELLIN, seller="INDUSTRIAS DIANA ALZATE SAS"
- **Receivables:** 2
- **Sales:** 2
- **Is Organization:** false
- **Is ProductLine:** false (productLine is 2-letter code, never "JUPITER")
- **Is Tenant:** false
- **Status:** CLEAN — JUPITER is a valid Castillitos customer, not a cross-tenant contamination. It does not appear as a tenant, organization, or product dimension.

---

## 5. SAG Views Runtime Matrix

| View | Status | Available | Fields | Note |
|---|---|---|---|---|
| vw_agentik_clientes | NOT_WIRED | Yes (23 fields) | 23 | Adapter uses TERCEROS direct query |
| vw_agentik_vendedores | NOT_WIRED | Yes (12 fields) | 12 | Used by commission service only |
| vw_agentik_productos | NOT_WIRED | Yes (19 fields) | 19 | Adapter uses ARTICULOS direct query |
| vw_agentik_ventas | WIRED_CERTIFIED | Yes (24 fields) | 24 | pullMovements() via mapSagVentasRow |
| vw_agentik_cartera | WIRED_CERTIFIED | Yes (13 fields) | 13 | pullReceivables() via mapSagCarteraViewRow |
| vw_agentik_pagos | NOT_WIRED | Yes (10 fields) | 10 | AP (cuentas por pagar), NOT AR |
| vw_agentik_recaudos | WIRED_CERTIFIED | Yes (12 fields) | 12 | Commission service, canonical-recaudos-service |
| vw_agentik_inventario | NOT_WIRED | Yes (13 fields) | 13 | Adapter uses SALDOS_ARTICULOS direct |
| vw_agentik_compras | NOT_WIRED | Yes (13 fields) | 13 | AP-scoped purchase orders |
| vw_agentik_produccion | NOT_WIRED | Yes (10 fields) | 10 | Production orders (OP/ET/CN) |

All 10 views are **available** in SAG CURRENT (LUDISAM). 3/10 are wired into the runtime adapter.

**Not included:** vw_agentik_bodegas, vw_agentik_sucursales (excluded per sprint constraint).

---

## 6. Files Modified

| File | Change |
|---|---|
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | paidAmount=0 (UNAVAILABLE), reductionAmount in meta, UNCLASSIFIED_REDUCTION status |
| `lib/connectors/adapters/sag-pya-soap/index.ts` | Wired mapSagVentasRow + mapSagCarteraViewRow into pull pipeline |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | Fixed ventasView.expectedFields to match actual view |
| `lib/connectors/adapters/sag-pya-soap/storage.ts` | Enriched field support (prior session) |
| `lib/connectors/core/types.ts` | Extended UnifiedMovement with optional enriched fields |
| `lib/reports/runners.ts` | ReportDataStatus type, UNVERIFIED fail-closed, overdueReceivable suppression |
| `lib/sag/logger.ts` | Added `soap:fallback` to SagEventCode union |
| `lib/sales/crm-alert-engine.ts` | F5 gate (prior sprint) |

## Files Created

| File | Purpose |
|---|---|
| `lib/auth/__tests__/data-trust-remediation-01.test.ts` | 63 contract tests (12 categories A-L) |
| `scripts/certify-data-trust-remediation-01.ts` | Real-data evidence script |
| `scripts/out/data-trust-remediation-01.json` | Machine-readable evidence |
| `docs/DATA-TRUST-REMEDIATION-01.md` | This document |

---

## Gates

| Gate | Result |
|---|---|
| Tests | 63/63 PASS, 136 assertions |
| npx tsc --noEmit | 263 total (all pre-existing), 0 in modified files |
| git diff --check | Clean (exit 0) |
| package.json | VALID JSON |
| Lockfile | Unchanged |
| No commit/push/deploy | Confirmed |
