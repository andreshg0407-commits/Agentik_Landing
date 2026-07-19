# COMMERCIAL-DATA-FIX-BACKLOG-01 — Prioritized Fix Backlog

**Sprint:** COMMERCIAL-DATA-COVERAGE-AUDIT-01
**Date:** 2026-07-14

---

## Priority Legend

| Priority | Urgency | Effort |
|---|---|---|
| **P0** | Block other work | S=small, M=medium, L=large |
| **P1** | Next sprint | |
| **P2** | Planned | |
| **P3** | Backlog | |

---

## P0 Fixes (Blocking)

### FIX-P0-001: Build Data Loaders for 3 Orphaned Engines

**Gap:** P0-001 (Vendedores, Importaciones, Produccion engines have no loaders)
**Effort:** L (3 separate loaders)

**Sub-tasks:**

| ID | Task | Effort | Dependencies |
|---|---|---|---|
| P0-001a | **Vendedores Loader** — Build `sales-rep-data-loader.ts` in `lib/comercial/sales-reps/`. Query: CustomerProfile (by sellerCode) + CRMQuote (by assignedUser) + Receivable (by customerNit). Output: `SalesRepDailyState` per seller. | M | None |
| P0-001b | **Importaciones Loader** — Build `import-data-loader.ts` in `lib/comercial/importaciones/`. Refactor `import-service.ts` to produce engine-compatible input types. Query: ProductEntity (line=5) + ProductInventoryLevel (warehouses 24,42-46) + CustomerOrderLine (product sales). Output: Import engine input arrays. | M | None |
| P0-001c | **Produccion Loader** — Build `production-data-loader.ts` in `lib/comercial/produccion/`. Query: ProductionEvent (OP type, status=active) + ProductEntity (referenced products) + ProductInventoryLevel (current stock). Output: `ProductionNeedResult[]`. | M | None |
| P0-001d | **Wire loaders to API routes** — Create or update API routes that call loaders → engines → BusinessDecision bridges. | S | P0-001a,b,c |
| P0-001e | **Wire BusinessDecision output to Control Comercial** — Update `control-comercial-loader.ts` to consume aggregated BusinessDecisions. | S | P0-001d |

**Acceptance:** All 6 domains produce non-empty BusinessDecision arrays when run against Castillitos data.

---

### FIX-P0-002: SAG Movement Detail Lines Sync

**Gap:** P0-002 (SaleRecord.productCode always NULL)
**Effort:** M

| ID | Task | Effort |
|---|---|---|
| P0-002a | Validate SAG query for MOVIMIENTOS_DETALLE (detail lines with article codes) | S |
| P0-002b | Add mapper `mapMovimientoDetalleToSaleLine()` | S |
| P0-002c | Add Prisma model `SaleRecordLine` (or extend SaleRecord) | S |
| P0-002d | Wire into connector sync pipeline | M |

**Acceptance:** SaleRecord (or new SaleRecordLine) has product-level detail with non-null productCode.

---

### FIX-P0-003: CRMQuote Customer FK Backfill

**Gap:** P0-003 (CRMQuote.customerId always NULL)
**Effort:** S

| ID | Task | Effort |
|---|---|---|
| P0-003a | Write migration script: extract `rawCrmJson.raw.billing_account_id` → match against CustomerProfile.crmId → set customerId FK | S |
| P0-003b | Update CRM adapter to populate customerId on future syncs | S |

**Acceptance:** `CRMQuote.customerId` populated on 80%+ of quotes.

---

## P1 Fixes (High Impact)

### FIX-P1-001: Wire Order Policy Pack to Pedidos UI

**Gap:** P1-001
**Effort:** M

| ID | Task | Effort |
|---|---|---|
| P1-001a | Build `order-data-loader.ts` that constructs `OrderDecisionInput` from order-service data | M |
| P1-001b | Add API route `/comercial/pedidos/decisions` that returns OrderDecisionEvaluationResult | S |
| P1-001c | Add policy decision cards to Pedidos UI (credit risk, delivery risk, readiness) | M |

---

### FIX-P1-002: Receivable Payment Data

**Gap:** P1-002
**Effort:** M

| ID | Task | Effort |
|---|---|---|
| P1-002a | Explore SAG ABONOS table structure with DBA | S |
| P1-002b | Add SAG query for payment detail per document | S |
| P1-002c | Update Receivable model and mapper | M |

---

### FIX-P1-003: SAG Query Validation Sprint

**Gap:** P1-003
**Effort:** L (29 queries to validate)

| ID | Task | Effort |
|---|---|---|
| P1-003a | Create test harness that runs each pending query against Castillitos SAG | M |
| P1-003b | Execute and document results per query | L |
| P1-003c | Update query-catalog.ts statuses | S |

---

### FIX-P1-004: Product Entity Enrichment

**Gap:** P1-004
**Effort:** M

| ID | Task | Effort |
|---|---|---|
| P1-004a | Validate SAG queries for ka_nl_marca, ka_nl_coleccion, ka_nl_temporada | S |
| P1-004b | Add Prisma migration: brand, collection, season columns on ProductEntity | S |
| P1-004c | Update `SAG article storage handler` to map new fields | S |
| P1-004d | Run full product re-sync | S |

---

### FIX-P1-005: Wire Import Policy Pack to Importaciones UI

**Gap:** P1-005
**Effort:** M

| ID | Task | Effort |
|---|---|---|
| P1-005a | Refactor import-service.ts to produce engine-compatible inputs (reuse from P0-001b) | M |
| P1-005b | Add policy decision rendering to importaciones-client.tsx | M |

---

## P2 Fixes (Medium Impact)

### FIX-P2-001: Production CN-to-OP Material Tracing

**Gap:** P2-001
**Effort:** L

Build a mapping layer between CN raw materials and OP finished goods. Requires SAG domain knowledge to map material codes to product references.

---

### FIX-P2-002: Sales Velocity Engine

**Gap:** P2-002
**Effort:** M

Build a reusable `sales-velocity-engine.ts` that computes units/day per product/warehouse. Requires FIX-P0-002 (product-level sales data) first.

---

### FIX-P2-003: BusinessDecision Aggregator UI Consumer

**Gap:** P2-003
**Effort:** M

Build a commercial intelligence dashboard (or update Control Comercial) that renders CommercialDecisionSummary from the aggregator. Requires P0-001 (all engines producing data) first.

---

### FIX-P2-004: Control Comercial Engine Integration

**Gap:** P2-004
**Effort:** S

Update `control-comercial-loader.ts` to consume BusinessDecision arrays from all 6 engines instead of raw Prisma queries.

---

## P3 Fixes (Backlog)

### FIX-P3-001: Validate Placeholder SAG Queries

15 queries with assumed table/field names. Requires DBA access to SAG PYA instance.

### FIX-P3-002: Audit Inteligencia Page Data Source

Trace data flow for `/comercial/inteligencia/page.tsx`.

### FIX-P3-003: Audit Ventas Page Data Source

Trace data flow for `/comercial/ventas/page.tsx`.

---

## Dependency Graph

```
P0-002 (Sale detail lines) ──────────────────────┐
                                                   ├── P2-002 (Sales velocity)
P0-001 (3 engine loaders) ────┐                   │
                               ├── P2-003 (Aggregator UI)
P1-001 (Order pack → UI) ────┘                   │
                                                   └── P2-004 (Control engine integration)
P0-003 (CRM FK backfill) ──── P1-001 (better order data)

P1-003 (Query validation) ──── P1-004 (Product enrichment)
                           └── P3-001 (Placeholder queries)

P1-002 (Payment data) ──── standalone (SAG ABONOS)
```

---

## Estimated Sprint Roadmap

| Sprint | Fixes | Effort | Dependencies |
|---|---|---|---|
| **Sprint A** | P0-001 (3 loaders), P0-003 (CRM FK) | L | None |
| **Sprint B** | P0-002 (sale lines), P1-001 (order pack → UI), P1-005 (import pack → UI) | L | Sprint A |
| **Sprint C** | P1-003 (query validation), P1-004 (product enrichment) | L | None (parallel) |
| **Sprint D** | P1-002 (payments), P2-002 (velocity), P2-003 (aggregator UI) | L | Sprint A+B |
| **Backlog** | P2-001, P2-004, P3-* | M | Sprint D |
