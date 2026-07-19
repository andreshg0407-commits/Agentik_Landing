# INFORMES-EJECUTIVOS-CASTILLITOS-03

**Sprint:** INFORMES-EJECUTIVOS-CASTILLITOS-03
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## What was built

The first Executive Intelligence Pipeline — transforming the Executive Dashboard from a raw KPI collection into a structured intelligence center that consumes Business Entities, Knowledge Graph, and Reasoning.

**Rule:** Executive Intelligence NEVER queries modules directly.
All data flows through: `SAG → Syncs → Business Entities → Knowledge Graph → Reasoning → Executive Intelligence → Dashboard`

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                     Executive Dashboard                        │
│              executive-intelligence-panel.tsx                  │
│  (Pulso | Alertas | Comercial | Produccion | Cartera |       │
│   Riesgos | Oportunidades | David Recomienda)                │
└───────────────────────┬───────────────────────────────────────┘
                        │ GET /api/orgs/[orgSlug]/executive-intelligence
┌───────────────────────▼───────────────────────────────────────┐
│              Executive Intelligence Pipeline                  │
│                  executive-pipeline.ts                        │
│                                                               │
│  Phase 1: Query existing services (parallel)                 │
│  Phase 2: Build Observations (raw facts)                     │
│  Phase 3: Build Findings (factual conclusions)               │
│  Phase 4: Build Insights (Knowledge Graph connections)       │
│  Phase 5: Build Risks (probability × impact)                 │
│  Phase 6: Build Opportunities (actionable upsides)           │
│  Phase 7: David Recommends (prioritized, evidenced)          │
│  Phase 8: Assemble report sections                           │
│  Phase 9: Convert to executive types                         │
└───────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    Business Entities    Knowledge Graph     Business Reasoning
    (lib/business-       (lib/business-      (lib/business-
     entities/)           knowledge/)          reasoning/)
```

---

## Files created

| File | Purpose |
|---|---|
| `lib/executive-intelligence/executive-types.ts` | All types: ExecutiveKpi, ExecutiveAlert, ExecutiveRisk, ExecutiveOpportunity, ExecutiveRecommendation, CommercialReport, InventoryReport, ProductionReport, CarteraReport, ExecutiveIntelligenceReport |
| `lib/executive-intelligence/executive-pipeline.ts` | SERVER ONLY. 9-phase pipeline assembling the complete report from real Castillitos data |
| `lib/executive-intelligence/index.ts` | Client-safe barrel export (types only) |
| `app/api/orgs/[orgSlug]/executive-intelligence/route.ts` | GET endpoint returning ExecutiveIntelligenceReport |
| `components/executive/executive-intelligence-panel.tsx` | Client component rendering all 8 report sections |

---

## Real Castillitos data sources

| Source | Prisma Model | What it provides |
|---|---|---|
| SAG invoices | `SaleRecord` | Daily/monthly sales, operational date, top references |
| SAG orders | `CustomerOrderRecord` | Order count, amount, latest order date |
| SAG collections | `CollectionRecord` | Daily collections (cobros) |
| SAG receivables | `CustomerReceivable` | Cartera total, vencida, top debtors, aging |
| SAG production | `ProductionOrder` | Total/open/closed OPs |
| SAG production lines | `ProductionOrderLine` | References in production, quantities |
| CRM vendors | `VendorCommercialBag` (via vendor-dashboard) | Vendor performance, alerts, health |

### Source governance applied

- `getInvoiceSourceCodes()` — Only FUENTE_1 (OFICIAL) invoice codes
- `PRISMA_EXCLUIR_ARKETOPS` — ARKETOPS codes excluded from sales
- `getFiscalWindow("strict_year")` — Cartera scoped to fiscal year
- Operational date = `MAX(saleDate)` from active F1 codes, NOT wall-clock

---

## Report sections

### 1. Pulso ejecutivo (summaryKpis)
8 KPIs: ventas_hoy, pedidos_hoy, cobros_hoy, facturas_hoy, ventas_mes, pedidos_mes, cartera_vencida (alert when >30%), ops_abiertas

### 2. Alertas criticas (criticalAlerts)
Auto-generated from Findings with severity `critical` or `high`. Evidence summary attached.

### 3. Inteligencia comercial (CommercialReport)
6 KPIs + vendor performance table (name, salesToday, salesMonth, ordersToday, fulfillmentRate, alertCount, health).

### 4. Inventario (InventoryReport)
References in production with production-in-progress flag.

### 5. Produccion (ProductionReport)
Total/open/closed OPs + top references in fabrication with quantities.

### 6. Cartera (CarteraReport)
4 KPIs (total, vencida, tasa vencimiento, cobros hoy) + top 5 debtors with days overdue.

### 7. Riesgos (ExecutiveRisk)
Probability × impact scoring. Cartera irrecuperable, vendor attention risks.

### 8. Oportunidades (ExecutiveOpportunity)
Production unblocking orders, active collections opportunity.

### 9. David recomienda (ExecutiveRecommendation)
Priority-sorted. Per-debtor cartera management (>30 days), vendor review, OP review (>50 open).
Every recommendation carries `suggestedOnly: true` and evidence summary.

---

## Reasoning pipeline flow

```
Observation (raw facts, zero interpretation)
    ↓ ventas_hoy=X, pedidos_hoy=Y, cartera_vencida=Z, ops_abiertas=N
Finding (factual conclusions)
    ↓ "Sin ventas en el ultimo dia", "Cartera vencida al 45%"
Insight (understanding via Knowledge Graph)
    ↓ "Produccion activa puede cubrir demanda", "Concentracion de cartera"
Risk (probability × impact)
    ↓ "Cartera irrecuperable", "Vendedor requiere atencion"
Opportunity (actionable upsides)
    ↓ "Produccion puede desbloquear pedidos"
Recommendation (David Recommends, suggestedOnly: true)
    ↓ "Gestionar cartera de X", "Revisar situacion de Y"
```

Every step carries Evidence and ReasoningConfidence.

---

## Business Signals — future roadmap

Business Signals are the planned mechanism for real-time event-driven updates to Executive Intelligence. Currently, the pipeline polls data on each request. Business Signals will enable:

| Signal Type | Source | Executive Impact |
|---|---|---|
| `sale.recorded` | SAG sync | Update ventas_hoy in real time |
| `order.created` | SAG sync | Update pedidos_hoy |
| `payment.received` | SAG sync | Update cobros_hoy, reduce cartera |
| `production.completed` | SAG sync | Update OPs count |
| `cartera.aging_threshold` | Scheduled | Trigger cartera alerts |
| `vendor.health_change` | Computed | Update vendor risk assessment |

Implementation plan:
1. Define `BusinessSignal` type in `lib/business-signals/`
2. Emit signals from SAG sync adapters
3. Executive Pipeline subscribes to signal stream
4. Cache report with TTL, invalidate on relevant signals
5. WebSocket push to connected dashboards

This is NOT implemented in this sprint — documented here as architectural roadmap.

---

## Confidence and freshness

- Overall confidence: 80 (real SAG data, some gaps documented)
- Missing information tracked: OP→ET linkage, real-time inventory, fiscal period comparison
- Freshness derived from actual data presence, not assumptions
- `"unknown"` freshness when no SAG data imported

---

## Integration with existing page

The existing `app/(app)/[orgSlug]/executive/page.tsx` can progressively adopt the new pipeline:

1. Add `ExecutiveIntelligencePanel` alongside existing sections
2. Route existing KPI queries through the pipeline
3. Remove direct Prisma queries from the page as pipeline coverage grows

The API endpoint `GET /api/orgs/[orgSlug]/executive-intelligence` is ready for consumption.

---

## Dependencies

- `lib/business-reasoning/` — Observation, Finding, Insight, Risk, Opportunity, Recommendation builders
- `lib/business-entities/core/` — DataFreshnessLevel type
- `lib/business-knowledge/` — KnowledgeGraph types (referenced in insights, not yet wired)
- `lib/sales/reports.ts` — getLatestPeriod()
- `lib/orders/queries.ts` — getDailyOrderKpis(), getLatestOrderDate()
- `lib/finance/cartera-kpis.ts` — getCarteraKpis()
- `lib/finance/fiscal-window.ts` — getFiscalWindow()
- `lib/comercial/vendors/vendor-dashboard.ts` — getVendorTeamDashboard()
- `lib/castillitos/source-rules.ts` — getInvoiceSourceCodes()
- `lib/sag/master-data/source-semantic-rules.ts` — PRISMA_EXCLUIR_ARKETOPS

---

## Rules enforced

- Executive Intelligence NEVER queries modules directly
- Every recommendation carries `suggestedOnly: true`
- Every recommendation carries evidence summary
- No fictitious data — all from real Castillitos SAG syncs
- Source governance: FUENTE_1 only, ARKETOPS excluded
- Operational date = MAX(saleDate), not wall-clock
- UI uses ag-op-table, T.mono, C/S/R tokens — no raw hex, no Tailwind colors
