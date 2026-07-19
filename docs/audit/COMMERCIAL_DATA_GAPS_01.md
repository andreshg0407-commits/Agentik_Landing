# COMMERCIAL-DATA-GAPS-01 — All Gaps with Classification

**Sprint:** COMMERCIAL-DATA-COVERAGE-AUDIT-01
**Date:** 2026-07-14

---

## Gap Classification

| Priority | Meaning | Count |
|---|---|---|
| **P0** | Blocking — engine/feature is dead without this | 3 |
| **P1** | High — significant data quality or coverage loss | 5 |
| **P2** | Medium — degraded experience or missing enrichment | 4 |
| **P3** | Low — nice-to-have, no business impact today | 3 |

---

## P0 — Blocking Gaps

### P0-001: Three Decision Engines Have Zero Data Loaders

**Domains:** Vendedores, Importaciones, Produccion
**Evidence:**
- `lib/comercial/sales-reps/` has 5 engine/decision/policy files but 0 loaders
- `lib/comercial/importaciones/` has 6 engine/decision/policy files but 0 loaders
- `lib/comercial/produccion/` has 2 engine/decision/policy files but 0 loaders
- `grep -l "prisma\." lib/comercial/importaciones/*.ts` returns 0 files
- `grep -l "prisma\." lib/comercial/produccion/*.ts` returns 0 files
- Engine functions are pure (accept input types) but nothing constructs those inputs from Prisma data

**Impact:** BusinessDecision pipeline produces zero decisions for 3/6 commercial domains. CommercialDecisionAggregator returns empty arrays for VENDEDORES, IMPORTACIONES, PRODUCCION.

**Root cause:** Engines were designed API-first (define input types → implement logic) but loader sprint was never executed.

**Fix:** Build 3 data loaders (see FIX_BACKLOG P0-001).

---

### P0-002: SaleRecord.productCode Is NULL on All 129,045 Rows

**Model:** SaleRecord
**Field:** productCode
**Evidence:**
- SAG MOVIMIENTOS query returns header-level documents only
- No per-article detail lines are synced
- `import-service.ts` comments: "SaleRecord.productCode is null on all 129,045 rows"
- Importaciones module uses CustomerOrderLine as workaround for product-level sales

**Impact:**
- Cannot compute product-level sales velocity for ANY commercial domain
- Tiendas store rotation analysis uses static thresholds instead of real velocity
- Importaciones rotation is approximated from CustomerOrderLine (order data, not invoice data)
- No accurate gross margin computation possible

**Root cause:** SAG MOVIMIENTOS query (`SELECT * FROM MOVIMIENTOS`) returns document headers, not line items. A separate query for MOVIMIENTOS_DETALLE is needed.

**Fix:** Add SAG query for movement detail lines (see FIX_BACKLOG P0-002).

---

### P0-003: CRMQuote.customerId Is NULL on All 285 Quotes

**Model:** CRMQuote
**Field:** customerId
**Evidence:**
- SuiteCRM V8 API returns `billing_account_id` nested in quote JSON
- CRM adapter stores it in `rawCrmJson` but does not extract to FK
- `cliente-360-loader.ts` uses workaround: `rawCrmJson.raw.billing_account_id → CustomerProfile.crmId`

**Impact:**
- Cannot join quotes to customers via standard FK
- 360 view uses brittle rawCrmJson parsing
- SalesRep engine cannot correlate quotes to sellers efficiently

**Root cause:** CRM adapter was built before CustomerProfile existed; FK was never back-filled.

**Fix:** Migration to extract billing_account_id → customerId FK (see FIX_BACKLOG P0-003).

---

## P1 — High Impact Gaps

### P1-001: Order Policy Pack Disconnected from Pedidos UI

**Domain:** PEDIDOS
**Evidence:**
- `app/(app)/[orgSlug]/comercial/pedidos/page.tsx` imports from `order-service.ts`
- `order-service.ts` queries Prisma directly
- `order-decision-engine.ts` exists with 6 policy evaluations but NO page calls it
- `order-business-decisions.ts` bridge exists but has no consumer

**Impact:** Order page shows raw data (drafts, products, fulfillment) but no policy-driven insights (credit risk, delivery risk, readiness).

---

### P1-002: Receivable.paidAmount Always Zero

**Domain:** VENDEDORES, FINANZAS
**Evidence:**
- `mapSagReceivable()` in mappers.ts sets paidAmount from SAG `abono` field
- SAG CARTERA query does not return per-document payment breakdowns
- All 2,500+ receivable rows have paidAmount = 0

**Impact:** Cannot compute real collection rate, aging is approximate, seller performance metrics are incomplete.

---

### P1-003: 44/52 SAG Queries Not Validated

**Evidence:**
- `query-catalog.ts`: 8 validated, 29 pending, 15 placeholder
- Pending queries have correct structure but were never tested on Castillitos SAG
- Placeholder queries have assumed table/field names

**Impact:** Cannot safely expand data sync without risking runtime errors. New features blocked on query validation.

---

### P1-004: ProductEntity Missing Brand/Collection/Season

**Evidence:**
- `mapArticuloToProduct()` does not map ka_nl_marca, ka_nl_coleccion, ka_nl_temporada
- These SAG fields exist (in placeholder queries) but are not synced
- ProductEntity Prisma model has no brand/collection/season columns

**Impact:** No brand filtering, no collection grouping, no seasonal analysis in any commercial module.

---

### P1-005: Import-Service Bypasses Import Policy Pack

**Evidence:**
- `/comercial/importaciones/page.tsx` calls `listImportedReferences()` and `getImportSummary()` from `import-service.ts`
- `import-service.ts` queries Prisma directly with business logic inline
- `import-decision-engine.ts` and `import-policy-pack.ts` exist but are never called from the UI flow

**Impact:** Import intelligence uses hardcoded thresholds in service layer, not configurable policy rules.

---

## P2 — Medium Impact Gaps

### P2-001: ProductionEvent CN Articles Have 0% Overlap With OP Product Refs

**Evidence:**
- CN (consumo) articles are raw materials (telas, hilos, insumos)
- OP (orden de produccion) articles are finished goods (references like LT-1234)
- CN has no ss_talla/ss_color fields
- CN header has no ka_nl_bodega

**Impact:** Cannot trace raw material consumption to finished product output. Production cost analysis incomplete.

---

### P2-002: No Sales Velocity Computation for Any Domain

**Evidence:**
- Tiendas uses static rotation thresholds (0.5x, 70%, 90%)
- Importaciones uses static repurchase thresholds
- No domain computes actual units/day or units/week velocity

**Impact:** All rotation analysis is threshold-based, not velocity-based. Cannot detect acceleration/deceleration.

---

### P2-003: BusinessDecision Aggregator Has No UI Consumer

**Evidence:**
- `commercial-decision-aggregator.ts` built in COMMERCIAL-INTEGRATION-01
- `aggregateCommercialDecisions()`, `filterByDomain()`, etc. all exported
- Zero imports from any UI page, API route, or component

**Impact:** Unified commercial intelligence dashboard cannot render without consumer integration.

---

### P2-004: Control Comercial Dashboard Uses Raw Prisma, Not Engines

**Evidence:**
- `control-comercial-loader.ts` queries Prisma directly for KPIs
- Does not call any Policy Pack or Decision Engine
- KPIs are computed from raw counts/sums, not from decision outputs

**Impact:** Control dashboard shows data without policy-driven insights or alerts.

---

## P3 — Low Impact Gaps

### P3-001: 15 SAG Queries Are Placeholder

**Evidence:**
- `query-catalog.ts` has 15 entries with `status: "placeholder"`
- Table and field names are assumed, not confirmed with DBA
- Covers: some collections, accounts, advanced production, advanced inventory

**Impact:** These queries cannot be used until DBA confirms table structure. Low urgency since core sync works without them.

---

### P3-002: Commercial Intelligence Page Data Source Unknown

**Evidence:**
- `/comercial/inteligencia/page.tsx` exists
- Data source not traced in this audit

**Impact:** Minor — page may be stub or connected via route not in standard pattern.

---

### P3-003: Ventas Page Data Source Unknown

**Evidence:**
- `/comercial/ventas/page.tsx` exists
- Data source not traced in this audit

**Impact:** Minor — page may be stub or use SaleRecord directly.
