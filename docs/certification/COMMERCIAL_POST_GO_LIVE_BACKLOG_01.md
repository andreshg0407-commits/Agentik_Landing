# COMMERCIAL POST GO LIVE BACKLOG 01

**Date:** 2026-07-14
**Tenant:** Castillitos
**Prerequisite:** GO LIVE APPROVED WITH CONDITIONS

---

## Priority 1 -- Immediate (First 2 Sprints)

### POST-001: Wire Order Policy Pack to Pedidos UI

- **Why:** 6 order policies produce BusinessDecision but Pedidos page does not consume them
- **Scope:** Add order readiness panel, credit warning badge, size distribution preview to Pedidos create/detail views
- **Effort:** 1 sprint
- **Files:** `app/(app)/[orgSlug]/comercial/pedidos/` client components
- **Dependencies:** None (engine and bridge already exist)

### POST-006: CRMQuote.customerId FK Backfill

- **Why:** All 285+ CRMQuotes have NULL customerId despite `billing_account_id` in rawCrmJson
- **Scope:** Update CRM adapter to extract and store FK. Run backfill migration.
- **Effort:** 0.5 sprint
- **Files:** `lib/connectors/adapters/castillitos-crm/storage.ts`
- **Dependencies:** None

---

## Priority 2 -- Short Term (Sprints 3-5)

### POST-005: SAG MOVIMIENTOS_DETALLE Query

- **Why:** SaleRecord.productCode is always NULL; need line-level sales data from SAG
- **Scope:** New SAG SOAP query + SaleRecordLine Prisma model + storage function
- **Effort:** 1 sprint
- **Files:** `lib/connectors/adapters/sag-pya-soap/query-catalog.ts`, `storage.ts`, `prisma/schema.prisma`
- **Dependencies:** SAG DBA access for query definition

### POST-007: Payment History Sync (SAG ABONOS)

- **Why:** Cannot evaluate customer payment patterns or show payment timeline
- **Scope:** New SAG ABONOS query + PaymentRecord Prisma model + storage + client-loader update
- **Effort:** 1 sprint
- **Files:** `lib/connectors/adapters/sag-pya-soap/`, `prisma/schema.prisma`
- **Dependencies:** SAG DBA access

### POST-002: Decision Feed UI

- **Why:** BusinessDecision objects are produced but only visible in Control summary and API
- **Scope:** New page `/comercial/decisiones` with domain filters, priority badges, action buttons
- **Effort:** 1 sprint
- **Files:** New page + client component
- **Dependencies:** None (decisions API exists)

### POST-004: Inline BusinessDecision in Module UIs

- **Why:** Each module page should show relevant decisions inline (not just in Control)
- **Scope:** Decision card component + per-module integration (Maletas, Tiendas, Vendedores, Importaciones)
- **Effort:** 1 sprint
- **Files:** Per-module page.tsx files + shared decision card component
- **Dependencies:** POST-002 (shared components)

---

## Priority 3 -- Medium Term (Sprints 6-8)

### POST-003: Commercial Copilot (David Agent Integration)

- **Why:** Manager should be able to ask "Que debo producir?" and get evidence-backed answers
- **Scope:** Wire David agent to BusinessDecision API. Build commercial domain prompts. Evidence rendering.
- **Effort:** 2 sprints
- **Files:** `lib/copilot/david/`, `components/copilot/`
- **Dependencies:** POST-002

### POST-010: Production CN Material Tracing

- **Why:** Cannot trace raw materials from CN consumption notes to production orders
- **Scope:** CN article -> OP reference mapping via SAG ss_remision
- **Effort:** 1 sprint
- **Files:** `lib/production-events/`
- **Dependencies:** None

### POST-011: SAG ZONA -> Seller Territory Mapping

- **Why:** Cannot auto-assign geographic territory to sellers
- **Scope:** Map SAG ZONA codes to seller identities in CRM
- **Effort:** 0.5 sprint
- **Files:** `lib/comercial/sales-reps/`, CRM adapter
- **Dependencies:** Business rules for zone -> seller assignment

---

## Priority 4 -- Long Term (Post Sprint 8)

### POST-008: Analytics & Reporting Dashboard

- **Why:** Need historical trends, comparative analysis, seasonal forecasting
- **Scope:** New analytics module consuming SaleRecord, CustomerOrderLine, engine results
- **Effort:** 2 sprints

### POST-009: Control Tower Real-Time

- **Why:** Live operational map with streaming sync status
- **Scope:** WebSocket or SSE for real-time updates to Control dashboard
- **Effort:** 2 sprints

### POST-012: Historical Trend Analysis

- **Why:** Identify seasonal patterns, growth trends, customer lifecycle stages
- **Scope:** Time-series analysis on sales, orders, inventory data
- **Effort:** 1 sprint

---

## NOT in Backlog (Explicitly Out of Scope)

These are NOT planned and should not be confused with the backlog:

- AI-generated business rules (all rules are human-defined)
- Automatic order execution (all actions require human confirmation)
- Multi-tenant commercial module (Castillitos only for now)
- Real-time SAG WebSocket integration (not supported by SAG SOAP)
- ERP write-back from Agentik to SAG (beyond sag-write-layer scope)
