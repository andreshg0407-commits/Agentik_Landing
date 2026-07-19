# COMERCIAL-OPERATIONAL-INTEGRATION-01 — Real Operational Pipeline Validation

**Sprint:** COMERCIAL-OPERATIONAL-INTEGRATION-01
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained, zero regressions)

---

## What was built

The first end-to-end operational pipeline connecting real Castillitos data through all foundational engines: Business Entities → Signals → Events → Knowledge Graph → Reasoning.

This sprint validates that Agentik's operational nervous system works with real data — no placeholders, no simulated data, no AI/LLM calls.

---

## Architecture — Full Flow

```
SAG Inventory (ProductEntity + ProductInventoryLevel)
SAG Orders (CustomerOrderRecord)
SAG Production (ProductionOrder + ProductionOrderLine)
Maletas (VendorBagItem + VendorCommercialBag)
    ↓
discoverCriticalReferences()                 ← find real out-of-stock/critical refs
    ↓
Per reference:
    ├─ getInventoryForReference()            ← inventory snapshot
    ├─ getOrdersForReference()               ← affected orders
    ├─ getCustomersForReference()            ← affected customers
    ├─ getVendorsForReference()              ← vendors with this ref in portfolio
    ├─ getPortfoliosForReference()           ← maletas containing this ref
    ├─ getProductionForReference()           ← production orders
    └─ getAlternativeInventory()             ← inventory in other warehouses
    ↓
generateReferenceSignals()                   ← Business Signals
    ↓
generateReferenceEvents()                    ← Business Events (with correlation)
    ↓
buildReferenceRelations()                    ← Knowledge Graph edges
summarizeReferenceGraph()                    ← graph summary
    ↓
generateReferenceReasoning()                 ← Full reasoning chain
    ├─ Observations (6 per reference)
    ├─ Findings
    ├─ Insights (cross-entity, KG-enriched)
    ├─ Risks (with probability × impact)
    ├─ Opportunities
    └─ Recommendations (suggestedOnly: true)
    ↓
CommercialOperationalResult                  ← complete pipeline output
```

---

## Files created

| File | Purpose |
|---|---|
| `lib/comercial/operational-integration/commercial-operational-types.ts` | ReferenceOperationalAnalysis, CommercialOperationalResult, affected entity types |
| `lib/comercial/operational-integration/commercial-operational-entities.ts` | SERVER ONLY. Real Prisma queries: inventory, orders, customers, vendors, portfolios, production, alternative inventory, critical ref discovery |
| `lib/comercial/operational-integration/commercial-operational-signals.ts` | Signal generation: inventory_out_of_stock, stock_critical, order_blocked, vendor_portfolio_out_of_stock, portfolio_needs_update, production_open |
| `lib/comercial/operational-integration/commercial-operational-events.ts` | Event generation: inventory_out_of_stock_detected, commercial_order_blocked, vendor_portfolio_reference_out_of_stock, inventory_stock_critical_detected, production_order_created — all with correlation chains |
| `lib/comercial/operational-integration/commercial-operational-knowledge.ts` | Knowledge Graph relations: Product→Portfolio, Portfolio→Vendor, Product→Order, Order→Customer, Product→ProductionOrder, Vendor→Customer (inferred) |
| `lib/comercial/operational-integration/commercial-operational-reasoning.ts` | Full reasoning chain: 6 observations, findings, cross-entity insights, risks with value-at-risk, opportunities (production, transfers), recommendations |
| `lib/comercial/operational-integration/commercial-operational-pipeline.ts` | SERVER ONLY. Main pipeline: discover refs → analyze each → aggregate |
| `lib/comercial/operational-integration/commercial-operational-utils.ts` | Filtering, summary, aggregation utilities |
| `lib/comercial/operational-integration/index.ts` | Client-safe barrel export |
| `app/api/orgs/[orgSlug]/commercial-operational-intelligence/route.ts` | GET endpoint returning CommercialOperationalResult |

---

## Signals generated per reference

| Signal | Category | Type | When |
|---|---|---|---|
| Referencia agotada | inventory | absence_detected | totalAvailable = 0 |
| Stock critico | inventory | threshold_breach | 0 < totalAvailable ≤ 10 |
| Pedidos afectados | commercial | absence_detected | out of stock + orders exist |
| Vendedor sin stock en maleta | vendor | absence_detected | vendor has ref in portfolio, stock = 0 |
| Maleta necesita actualización | portfolio | state_change | active maleta contains depleted ref |
| Producción abierta para ref | production | pattern_detected | open OPs exist for critical ref |

---

## Events generated per reference

| Event | Category | Correlation |
|---|---|---|
| inventory_out_of_stock_detected | inventory | root event |
| commercial_order_blocked | commercial | caused by root, same correlationId |
| vendor_portfolio_reference_out_of_stock | vendor | caused by root, same correlationId |
| inventory_stock_critical_detected | inventory | same correlationId |
| production_order_created | production | same correlationId |

All events share a `correlationId` per reference, enabling downstream consumers to understand the full causal chain.

---

## Knowledge Graph relations built

| Source → Target | Relation | Strength |
|---|---|---|
| Product → Portfolio | belongs_to | strong |
| Portfolio → Vendor | owned | strong |
| Product → Vendor | sold_by | strong |
| Product → Order | contains | strong |
| Order → Customer | ordered_by | strong |
| Vendor → Customer | assigned_to | inferred |
| Product → ProductionOrder | produced_by | strong |

---

## Reasoning chain per reference

```
Observation: inventory_available = 0
Observation: affected_orders = N
Observation: affected_vendors = M
Observation: active_portfolios = P
Observation: open_production_orders = K
Observation: alternative_inventory = Q

Finding: "Referencia X agotada" (severity: critical)
Finding: "N pedido(s) bloqueados" (severity: high)

Insight: "X conecta M vendedor(es), P maleta(s), N pedido(s), C cliente(s), K OP(s)"
Insight: "Produccion activa puede reabastecer" (if OPs open)
Insight: "Inventario alternativo disponible" (if alt warehouses have stock)

Risk: "Riesgo comercial por agotamiento" (probability 90, impact 7, value at risk = order total)
Risk: "Multiples vendedores afectados" (probability 80, impact 5)

Opportunity: "Produccion en curso puede resolver" (effort: low)
Opportunity: "Traslado de inventario" (effort: medium)

Recommendation: "Actualizar maletas con referencia agotada" (priority 1, suggestedOnly: true)
Recommendation: "Evaluar traslado desde bodegas alternativas" (priority 2, suggestedOnly: true)
Recommendation: "Dar seguimiento a produccion" (priority 3, suggestedOnly: true)
```

---

## Validation with real Castillitos data

The pipeline queries these real Prisma models:
- `ProductEntity` (SAG-synced products, commercialStatus: "active")
- `ProductInventoryLevel` (warehouse × variant inventory levels)
- `CustomerOrderRecord` (SAG orders with referenceCode)
- `VendorBagItem` + `VendorCommercialBag` (maletas)
- `ProductionOrder` + `ProductionOrderLine` (production with referenceCode)

### Per reference, the pipeline reports:
- Reference code and product name
- Inventory available (total and per warehouse)
- Affected orders (count, amounts, customers)
- Affected vendors (with portfolio assignment data)
- Affected portfolios (maletas with status and quantities)
- Related production (open/closed OPs with quantities)
- Alternative inventory (other warehouses)
- All signals, events, observations, findings, insights, risks, opportunities, recommendations generated

---

## Known data gaps

| Gap | Impact | Resolution |
|---|---|---|
| `CustomerOrderRecord.referenceCode` may not be populated for all orders | Affected orders count may be 0 even when orders exist | Requires SAG sync to populate referenceCode |
| ProductEntity may not exist for all SAG references | ProductId = null, reduced confidence | Requires full product catalog sync |
| VendorBagItem data depends on maletas being configured | Vendor/portfolio impact may be incomplete | Configure maletas in production |
| Production OP dates may be null | Cannot determine if OP is delayed | SAG data quality |

These gaps are documented as `missingInformation` in each analysis's `confidence` field.

---

## API endpoint

```
GET /api/orgs/[orgSlug]/commercial-operational-intelligence
```

Returns `CommercialOperationalResult` with all analyses.

---

## Architectural validation

This sprint proves:

1. **Modules do NOT call each other.** Inventory, Orders, Maletas, Vendors, Production are all queried via shared Prisma models, not via each other's service layers.

2. **Relations are resolved via Knowledge Graph.** `buildReferenceRelations()` creates `BusinessEntityRelation` edges connecting all entity types without importing between modules.

3. **Signals and Events carry evidence and trace.** No signal without evidence, no event without traceability.

4. **Events are correlated.** All events for a reference share a `correlationId`, enabling causal chain reconstruction.

5. **Reasoning is structured and auditable.** Every recommendation carries evidence and confidence. No AI/LLM interpretation.

6. **Missing data is explicitly declared.** The `missingInformation` field in confidence tracks what's unknown.

---

## Recommended next sprint

Based on this sprint's findings:

1. **BUSINESS-RULE-ENGINE-01** — Define rules like "IF agotado + maleta activa + pedidos abiertos THEN suggest withdraw + production review". The pipeline produces all the signals and events; now rules can evaluate them.

2. **EXECUTIVE-OPERATIONAL-DASHBOARD-04** — Wire the pipeline results into the Executive Dashboard to show reference-level operational intelligence (not just KPI aggregates).

3. **PRODUCTION-OPERATIONAL-INTEGRATION-01** — Similar pipeline for production domain: OP lifecycle tracking, production-to-inventory-to-order flow.

The recommendation is **BUSINESS-RULE-ENGINE-01** because it's the natural next consumer of the signals and events this sprint produces. Rules formalize the business logic that's currently embedded in the reasoning chain.

---

## Rules enforced

- No direct module-to-module calls
- Every signal carries evidence
- Every event carries trace and correlation
- Every recommendation carries `suggestedOnly: true`
- No fictitious data — all from real Castillitos SAG syncs
- Missing data documented as `missingInformation`
- BusinessEntity Isolation Rule maintained
- TSC baseline maintained at 160
