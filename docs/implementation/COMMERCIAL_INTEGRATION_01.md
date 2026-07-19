# COMMERCIAL-INTEGRATION-01 — Commercial Module Integration

**Sprint:** COMMERCIAL-INTEGRATION-01
**Tenant:** Castillitos
**Status:** COMPLETE
**TSC Impact:** 0 new errors (baseline: 162)
**QA:** 79/79 passed
**Validation:** 181/181 passed

---

## What it does

Integrates all 6 commercial decision engines into a unified BusinessDecision pipeline. Every commercial module now emits standardized BusinessDecision objects for consumption by Torre de Control, Copilot, and UI.

---

## Architecture

```
Maletas Decision Engine ─────┐
Store Decision Engine ───────┤
Order Decision Engine ───────┤─── BusinessDecision[] ─── CommercialDecisionAggregator
SalesRep Decision Engine ────┤                                      │
Import Decision Engine ──────┤                          CommercialDecisionSummary
Production Planning Engine ──┘                           (grouped by domain)
```

Each domain has a bridge file that converts its engine results to the shared BusinessDecision contract.

---

## New files

| File | Purpose |
|---|---|
| `lib/comercial/business-policy/business-decision-types.ts` | Shared BusinessDecision, CommercialDomain, evidence, aggregation types |
| `lib/comercial/business-policy/commercial-decision-aggregator.ts` | Groups decisions by domain, filters, sorts |
| `lib/comercial/tiendas/store-business-decisions.ts` | Store engine -> BusinessDecision bridge |
| `lib/comercial/pedidos/order-business-decisions.ts` | Order engine -> BusinessDecision bridge |
| `lib/comercial/sales-reps/sales-rep-business-decisions.ts` | SalesRep engine -> BusinessDecision bridge |
| `lib/comercial/importaciones/import-business-decisions.ts` | Import engine -> BusinessDecision bridge |
| `lib/comercial/maletas/maletas-business-decisions.ts` | Maletas engine -> BusinessDecision bridge |
| `lib/comercial/produccion/production-business-decisions.ts` | Production engine -> BusinessDecision bridge |
| `scripts/_test-commercial-integration-01.ts` | 79 QA tests |
| `scripts/_validate-commercial-integration-01.ts` | 181 structural validations |

## Modified files

| File | Change |
|---|---|
| `lib/comercial/business-policy/index.ts` | Added BusinessDecision + aggregator exports |
| `lib/comercial/produccion/index.ts` | Added production BusinessDecision bridge export |
| `lib/comercial/sales-reps/index.ts` | Added salesrep BusinessDecision bridge export |
| `lib/comercial/importaciones/import-policy-index.ts` | Added import BusinessDecision bridge export |
| `lib/comercial/pedidos/order-policy-pack-config.ts` | Added StockThresholdsConfig section |
| `lib/comercial/pedidos/order-product-types.ts` | Replaced hardcoded thresholds with config |
| `lib/comercial/pedidos/order-fulfillment.ts` | Replaced hardcoded threshold with config |

---

## BusinessDecision universal contract

```typescript
interface BusinessDecision {
  decisionId: string;
  tenantId: string;
  domain: CommercialDomain;        // MALETAS | TIENDAS | PEDIDOS | VENDEDORES | IMPORTACIONES | PRODUCCION
  engine: string;                  // which pack produced it
  policy: string;                  // policy ID
  severity: BusinessDecisionSeverity;
  priority: BusinessDecisionPriority; // CRITICAL | HIGH | MEDIUM | LOW
  title: string;
  summary: string;
  recommendedAction: string;
  status: BusinessDecisionStatus;
  confidence: number;
  evidence: BusinessDecisionEvidence;
  generatedAt: string;
  expiresAt: string | null;
}
```

---

## CommercialDecisionAggregator

Pure aggregation — NOT an engine. Functions:

| Function | Purpose |
|---|---|
| `aggregateCommercialDecisions()` | Groups all decisions by domain, counts priorities |
| `aggregateByDomain()` | Returns Map<CommercialDomain, BusinessDecision[]> |
| `filterByDomain()` | Filter decisions for one domain |
| `filterByPriority()` | Filter decisions at or above a priority level |
| `filterPending()` | Only pending decisions |
| `sortByPriority()` | Sort CRITICAL first, LOW last |

---

## Threshold extraction

Hardcoded thresholds moved from inline code to `order-policy-pack-config.ts`:

| Threshold | Old Location | New Location | Value |
|---|---|---|---|
| Line minimum LT | order-product-types.ts:102 | StockThresholdsConfig.lineMinimums | 30 |
| Line minimum CS | order-product-types.ts:103 | StockThresholdsConfig.lineMinimums | 20 |
| Last units | order-product-types.ts:158 | StockThresholdsConfig.lastUnitsThreshold | 10 |
| Few variants | order-product-types.ts:170 | StockThresholdsConfig.fewVariantsThreshold | 1 |
| Low stock fulfillment | order-fulfillment.ts:81 | StockThresholdsConfig.lowStockUnits | 10 |

---

## Per-domain bridge mapping

| Domain | Engine Result Type | Bridge Function | Filters |
|---|---|---|---|
| MALETAS | CommercialDecision[] | buildAllMaletasBusinessDecisions() | All decisions |
| TIENDAS | StoreDecisionEvaluationResult | buildAllStoreBusinessDecisions() | below_minimum, below_ideal, transfer_out, markdown, slow_rotation |
| PEDIDOS | OrderDecisionEvaluationResult | buildAllOrderBusinessDecisions() | blocked/warning credit, partial/backorder delivery, blocked/warning readiness |
| VENDEDORES | SalesRepDailyState | buildAllSalesRepBusinessDecisions() | out-of-stock, overdue receivables, inactive customers |
| IMPORTACIONES | Individual result arrays | buildAllImportBusinessDecisions() | low rotation, REBUY/WATCH, HIGH/MEDIUM container, AGING+ |
| PRODUCCION | ProductionNeedResult[] | buildAllProductionBusinessDecisions() | PRODUCE, WAIT_EXISTING_OP |

---

## Remaining gaps (Phase 13 discovery)

| Area | Status | Notes |
|---|---|---|
| Maletas: 10+ hardcoded thresholds in loader/engine | NOT EXTRACTED | Would require engine refactor (out of scope) |
| Tiendas: 5 hardcoded thresholds in engines | NOT EXTRACTED | store-replenishment-engine.ts: 70%, 90%, 0.5x |
| Tiendas: active-inventory.ts thresholds | NOT EXTRACTED | Priority thresholds 3, 5 |
| UI component: commercial-product-drawer.tsx | NOT EXTRACTED | 24h staleness, <= 10 low stock |
| Produccion: alto_costo percentile calc | NOT EXTRACTED | Dynamic percentile in UI (minor) |
| Vendedores UI | CLEAN | No violations |
| Importaciones UI | CLEAN | No violations |
| Produccion UI | CLEAN | 1 minor violation |

---

## Design decisions

1. **Shared BusinessDecision has `domain` field** — identifies which commercial module produced it, enabling aggregation
2. **Evidence is a generic envelope** — `BusinessDecisionEvidence` has common fields (policyId, activationReason, dataUsed, etc.) without domain-specific types
3. **Bridge pattern** — each domain converts its own result types to BusinessDecision, preserving domain isolation
4. **Aggregator is NOT an engine** — pure grouping/filtering, zero decision-making
5. **No modification to existing engines** — bridges consume results without changing how engines work
6. **Config extraction is incremental** — order thresholds extracted first (most impactful), remaining domains in future sprints

---

## Constraints verified

- NO new engines created
- NO new Decision Engines created
- NO new Policy Packs created
- NO new contracts created (BusinessDecision already existed in production-planning-types.ts, generalized)
- NO Business Policy Engine modifications
- NO Commercial Data Layer modifications
- NO architecture changes
- NO UI redesign
- NO new features added
- TSC baseline: 162 (preserved)
