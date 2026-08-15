# AGENTIK-SALES-PORTFOLIO-DOMAIN-AUDIT-01

**Sprint:** Pre-Implementation Audit — Maletas (Sales Portfolio)
**Tenant:** Castillitos
**Fecha:** 2026-08-06
**Alcance:** Audit only. NO implementation.

---

## 1. Current Architecture

### Domain Model Summary

The Maletas domain manages **vendor commercial portfolios** — real inventory assigned to 6 field sales reps (vendedores) who carry physical product samples ("maletas") to sell in the field.

**3-Layer Architecture:**

| Layer | Files | Purpose |
|---|---|---|
| **Repository** | `vendor-bag-repository.ts`, `replenishment-plan-service.ts`, `vendor-bag-ideal-route-service.ts`, `order-ingest-service.ts` | Prisma CRUD, atomic transactions |
| **Engine** (pure) | `maletas-engine.ts`, `maletas-decision-engine.ts`, `vendor-bag-engine.ts`, `maletas-coverage.ts`, `maletas-production.ts`, `production-alert-engine.ts`, `maletas-rules.ts`, `reference-decision-engine.ts`, `maletas-functional-evaluation.ts` | Deterministic computation, no DB, no side effects |
| **Intelligence** | `vendor-sample-loader.ts`, `vendor-sample-presence-engine.ts`, `maletas-sag-adapter.ts`, `maletas-commercial-intelligence.ts`, `maletas-copilot-signals.ts`, `maletas-salesrep-profile.ts` | SAG integration, signal generation, copilot surface |

**File Count:** 60+ TypeScript files in `lib/comercial/maletas/`, ~15,000 lines total.

### Prisma Models (6 dedicated + 2 config)

| Model | Lines | Purpose |
|---|---|---|
| `VendorCommercialBag` | 5752-5778 | Bag header. @@unique([organizationId, salesRepId, season]) |
| `VendorBagItem` | 5786-5833 | Line items. @@unique([bagId, reference]). Invariant: `availableToSellQty = assignedQty - soldQty` |
| `VendorBagOrderLine` | 5838-5874 | Immutable order audit trail |
| `MaletaReplenishmentPlan` | 9655-9681 | Lifecycle: draft -> pending_warehouse -> prepared -> shipped -> received -> cancelled |
| `MaletaReplenishmentItem` | 9684-9704 | Swap items (removedReference + addedReference) |
| `MaletaReplenishmentEvent` | 9707-9722 | Event audit trail |
| `VendorBagIdealRouteRule` | 9733-9760 | Minimum refs per subgroup per vendor |
| `AssortmentIdealOverride` | 9771-9796 | Per-tenant ideal unit overrides |

**Key observation:** Maletas does NOT use AgentExecution for persistence (unlike Pedidos). It has its own dedicated Prisma models.

### API Surface (11 public + 2 internal)

**Public routes** (`app/api/orgs/[orgSlug]/comercial/maletas/`):
- `bags/` — CRUD (GET list, POST create)
- `bags/[bagId]/` — GET/PATCH/DELETE single bag
- `bags/[bagId]/items/` — GET/POST items
- `bags/[bagId]/items/[itemId]/` — PATCH/DELETE single item
- `bags/[bagId]/ideal-route/` — GET/POST ideal route rules
- `bags/[bagId]/ideal-route/[ruleId]/` — PATCH/DELETE rule
- `bags/[bagId]/activation/` — POST activate bag
- `orders/ingest/` — POST order consumption
- `replenishment-plans/` — GET/POST plans
- `ideal-overrides/` — GET/POST overrides
- `portfolio/` — GET portfolio view

**Internal routes** (`app/api/internal/comercial/maletas/`):
- `sync/` — Sync trigger (INTERNAL_CRON_SECRET gated)
- `preview/` — Preview data (INTERNAL_API_SECRET gated)

All public routes use `requireOrgAccess()` for auth gating.

---

## 2. Workflow Status

### Bag Lifecycle (Status Machine)

```
borrador -(activar)-> activa -(pausar)-> pausada -(reactivar)-> activa
                                                  -(archivar)-> archivada
activa -(archivar)-> archivada
```

**Status:** IMPLEMENTED in Prisma + vendor-bag-repository.ts. Activation route exists at `bags/[bagId]/activation/`.

### Order Consumption Flow

```
CustomerOrderLine (from SAG/CRM)
  -> order-ingest-service.ts: matchOrderToVendorBag()
  -> vendor-bag-repository.ts: applyOrderLine() [atomic transaction]
  -> VendorBagItem.soldQty++ / VendorBagOrderLine created (immutable audit)
  -> availableToSellQty recomputed
```

**Status:** IMPLEMENTED. `applyOrderLine()` uses Prisma transactions for atomicity.

### Replenishment Flow

```
Coverage signal (ref below minimum)
  -> MaletaReplenishmentPlan (draft)
  -> MaletaReplenishmentItem[] (removedReference + addedReference)
  -> Approval (pending_warehouse)
  -> Warehouse prepares (prepared -> shipped -> received)
  -> MaletaReplenishmentEvent[] (audit trail)
```

**Status:** PARTIALLY IMPLEMENTED. Prisma models exist. `replenishment-plan-service.ts` handles lifecycle. But NO approval workflow integration (no connection to lib/approvals/).

### Vendor Sample Presence (SAG F34)

```
SAG movimientos_traslados (F34 transfers)
  -> vendor-sample-presence-engine.ts: getVendorPresence()
  -> GROUP BY reference (not variant) across all talla/color
  -> netBalance > 0 = present, else absent
  -> 6 vendors: ORLANDO(45), CARLOS_LEON(46), LUIS(47), NESTOR(48), CARLOS_VILLA(49), FREDY(50)
```

**Status:** IMPLEMENTED. ENGINE-02 corrected ENGINE-01 false-positive bug (ref-level grouping vs variant-level).

### Data Loading Pipeline

| Version | Method | Status |
|---|---|---|
| V1 | Excel bootstrap (`maletas-excel-bootstrap.ts`) | LEGACY — still importable |
| V2 | Prisma + SAG (`sag-prisma-reader.ts` + `vendor-sample-loader.ts`) | ACTIVE |

`vendor-sample-loader.ts` (~2000 lines) is the main orchestrator: loads canonical inventory, SAG presence, OP replacements, applies state machine per vendor.

---

## 3. Real Data Authority

### Stock Sources

| Data | Source | Canonical File | Quality |
|---|---|---|---|
| Central warehouse stock | ProductInventoryLevel (B01 main) | `canonical-warehouse-availability.ts` | CONFIRMED — real Prisma data |
| Vendor presence | SAG F34 `movimientos_traslados` | `vendor-sample-presence-engine.ts` | CONFIRMED — real SAG SOAP |
| Sales velocity | CustomerOrderLine (FACTURADO) | `maletas-sag-adapter.ts` | CONFIRMED — real Prisma data |
| Production orders | ProductionEvent (OP type) | `vendor-sample-loader.ts` | CONFIRMED — synced from SAG |
| Prices (PV3/PV4) | SAG SOAP v_articulos | via commercial-product-data-source.ts | CONFIRMED when SAG responds |
| Product catalog | ProductEntity | Prisma | CONFIRMED |

### SAG Source Code Semantics

| Code | Name | Meaning | Treatment |
|---|---|---|---|
| OFICIAL | Invoice sale | Real completed sale | COUNT as sale |
| REMISION | Remission sale | Real sale via remission doc | COUNT as sale |
| PD | Pending order | Demand signal, NOT a sale | COUNT as demand (separate) |
| AP | Order cleanup | Administrative cancellation | ALWAYS EXCLUDED |

**Implemented in:** `maletas-sag-adapter.ts` with 7 smoke tests (all PASS).

### Coverage Computation

```
coverageDays = disponible / dailyVelocity
```

| Band | Days | Status |
|---|---|---|
| alta | >30d | Green |
| estable | 15-30d | Normal |
| baja | 7-14d | Warning |
| ruptura_inminente | <7d | Critical |

**Implemented in:** `maletas-coverage.ts` — `computeCoverageStatus()`, `buildCoverageSignals()`, `computeOperationalScore()`.

### Vendor Registry Gap

**CRITICAL FINDING:** `getVendorRegistry()` in `maletas-normalizer.ts` returns `[]` (empty array). The hardcoded vendor list was removed because it only covered 50% of real sellers (6/8 in CRM). Until a `CommercialSalesRep` Prisma model is created and populated from CRM sync, the vendor registry is empty.

**Impact:** Any code path that depends on `getVendorRegistry()` gets zero vendors. The vendor-sample-presence-engine has its own hardcoded `VendorBodegaConfig[]` (6 vendors with bodega PKs 45-50) which works independently.

---

## 4. Business Law Findings

### Invariant: Available-to-Sell

```typescript
availableToSellQty = assignedQty - soldQty  // ALWAYS >= 0
```

Enforced in `vendor-bag-repository.ts` via `applyOrderLine()` atomic transaction. The repository rejects order lines that would make available negative.

### Rule Engine (9 Pure Functions)

`maletas-rules.ts` contains 9 deterministic rule functions:

1. `computeItemStatus()` — item operational status
2. `computeRecommendedAction()` — next action for item
3. `isStockCritical()` — stock below threshold
4. `shouldRequestProduction()` — production need
5. `computeReplacementPriority()` — replacement urgency
6. `hasExcessiveReturns()` — return rate check
7. `computeReplenishmentNeed()` — replenishment urgency
8. `isSlowMover()` — low rotation detection
9. `computeOverallBagHealth()` — bag-level health

All are pure functions — no DB, no side effects, no randomness.

### Decision Engine (4 Phases)

`maletas-decision-engine.ts` (482 lines) runs 4 sequential phases:

1. **Coverage decisions** — stock level assessment per reference
2. **Production decisions** — manufacturing need signals
3. **Replacement decisions** — swap recommendations
4. **Portfolio decisions** — bag-level health synthesis

Output: `CommercialDecision[]` with severity, reason, recommendedAction, operationalImpact.

### Production Alert Severity (5 Levels)

`production-alert-engine.ts` escalates through 5 levels:

| Level | Condition |
|---|---|
| critica | Stock = 0 + active demand |
| urgente | Stock < 3 days coverage |
| alta | Stock < 7 days coverage |
| preventiva | Stock < 15 days coverage |
| normal | Adequate stock |

### Supply Action Priority Chain

```
REEMPLAZAR_BODEGA (warehouse swap — fastest)
  -> COMPLETAR_DESDE_OP (fulfill from production order)
  -> PRODUCCION_SUGERIDA (suggest production — LT/CS lines only)
  -> RECOMPRA_SUGERIDA (suggest repurchase — IMPORT line only)
  -> RETIRAR_MOSTRARIO (remove from sample — last resort)
```

Implemented in `vendor-sample-loader.ts` with line-aware logic (textile vs import).

---

## 5. Inventory / Reservation Interaction

### Current State

- `ProductInventoryLevel` is READ-ONLY from Maletas perspective — never mutated.
- `OperationalReservation` schema model exists with `sourceType: "portfolio"` — but is **NOT used** by any Maletas code.
- Maletas tracks its own availability via `VendorBagItem.assignedQty/soldQty` — a shadow inventory model.

### Gap Analysis

| Aspect | Status | Risk |
|---|---|---|
| PIL read | IMPLEMENTED | None |
| PIL write | NOT DONE (correct — read-only) | None |
| OperationalReservation | NOT USED | MEDIUM — bags don't lock PIL stock |
| Cross-bag double-assignment | NO GUARD | HIGH — same ref can be assigned to multiple bags exceeding actual PIL stock |

**Architectural risk:** Without OperationalReservation integration, two bags could independently assign 100 units each of the same reference when only 150 exist in the warehouse. The system has no cross-bag stock ceiling enforcement.

---

## 6. UI Gaps

### Page Structure

- `app/(app)/[orgSlug]/comercial/maletas/page.tsx` (40 lines) — Server component calling `loadVendorSampleData()`
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` — **57KB** client component

### UI Assessment

| Component | Lines | Status |
|---|---|---|
| `maletas-client.tsx` | ~1,700 | OVERSIZED — needs decomposition |
| `MaletaPortfolioBuilder` (in maletas-client) | 666 | Production-ready portfolio constructor |
| Vendor sample tabs | in maletas-client | Per-vendor tabs with ref lists |
| Intelligence tab | in maletas-client | Coverage + production signals |
| Commercial product drawer | shared component | Reusable, already integrated |

### Identified UI Gaps

1. **57KB monolith** — `maletas-client.tsx` should be split into focused sub-components
2. **No MaletaReplenishmentPlan UI** — plans can be created via API but no management interface exists
3. **No approval workflow UI** — replenishment approval is not connected to the approvals module
4. **No production request creation UI** — `tools/create-production-request-draft.ts` exists but no surface
5. **Vendor registry empty** — UI shows 6 vendors from SAG presence engine, but vendor CRUD is not surfaced
6. **live-bag-types.ts contains PLACEHOLDER seed data** — template data for MaletaAssignment/MaletaCoverageState
7. **No operational dashboard/KPIs** — no aggregate view of all-vendor health, coverage gaps, pending actions

---

## 7. Copilot Readiness Gaps

### Existing Copilot Surface

| File | Purpose | Status |
|---|---|---|
| `maletas-copilot-signals.ts` | CopilotSignal generation from operational context | IMPLEMENTED |
| `maletas-memory.ts` | Memory hints for copilot context | IMPLEMENTED |
| `maletas-priority.ts` | Priority ordering for copilot display | IMPLEMENTED |
| `maletas-salesrep-profile.ts` | Per-vendor operational profile for copilot | IMPLEMENTED |

### Missing for Copilot Domain Tools

| Gap | Description | Effort |
|---|---|---|
| **No domain tool registry** | Unlike Tiendas (28 tools), Maletas has no `DomainToolDefinition[]` registry | MEDIUM |
| **No structured result types** | No `DataProvenance`-bearing result types for copilot consumption | MEDIUM |
| **No cross-vendor analytics** | Can't compare vendor X vs vendor Y performance in structured format | LOW |
| **No time-series adapter** | Sales velocity over time per vendor not surfaced as tool | LOW |
| **No bag lifecycle tool** | Copilot can't query "which bags are running low" in structured format | LOW |
| **No attention signal emitter** | Unlike Tiendas `emitStoreAttentionSignals()`, no unified attention for maletas | MEDIUM |

**Verdict:** Copilot signals exist but the formal domain tool layer (registry + structured types + provenance) is missing. The Tiendas pattern (`STORES-COPILOT-DOMAIN-CONTRACT.md`) should be replicated.

---

## 8. Candidate Attention Signals

Based on the decision engine and rule functions, these attention signals should be emitted:

| Signal | Severity | Source | Trigger |
|---|---|---|---|
| `bag_stock_depleted` | critical | vendor-bag-engine | availableToSellQty = 0 for active bag item |
| `coverage_ruptura_inminente` | critical | maletas-coverage | coverageDays < 7 |
| `production_needed` | alta | production-alert-engine | stock = 0 + active demand |
| `replacement_needed` | alta | reference-decision-engine | ref state = "reemplazar" |
| `bag_activation_pending` | warning | vendor-bag-repository | bag status = "borrador" for > 7 days |
| `replenishment_plan_stale` | warning | replenishment-plan-service | plan in "draft" for > 14 days |
| `vendor_health_critico` | critical | vendor-sample-loader | vendorHealth = "critico" |
| `slow_mover_detected` | info | maletas-rules | isSlowMover() = true |
| `excessive_returns` | warning | maletas-rules | hasExcessiveReturns() = true |
| `cross_bag_overcommit` | critical | NEW (not implemented) | sum(assignedQty) across bags > PIL quantity |

---

## 9. Action Gaps

### Implemented Actions

| Action | File | Status |
|---|---|---|
| Create bag | vendor-bag-repository.ts | DONE |
| Add/remove items | vendor-bag-repository.ts | DONE |
| Activate bag | activation route | DONE |
| Consume order | order-ingest-service.ts | DONE |
| Create replenishment plan | replenishment-plan-service.ts | DONE |
| Manage ideal route rules | vendor-bag-ideal-route-service.ts | DONE |
| Manage ideal overrides | ideal-overrides route | DONE |

### Missing Actions

| Action | Blocking? | Notes |
|---|---|---|
| **Approve replenishment plan** | YES | No connection to lib/approvals/ |
| **Create production request** | PARTIAL | Draft tool exists (`tools/create-production-request-draft.ts`) but no API route or UI |
| **Bulk bag assignment** | NO | Would accelerate seasonal bag creation |
| **Auto-replenishment trigger** | NO | Automatic plan creation when coverage < threshold |
| **Vendor deactivation** | NO | No way to mark vendor inactive from UI |
| **Cross-bag rebalance** | NO | Move units between bags to optimize |

---

## 10. Exact P0 Delivery Plan

### P0: Minimum Viable Maletas Module

The module is already functional for its core use case (vendor sample management with SAG presence). The P0 gaps are:

| # | Gap | Severity | Effort | Dependency |
|---|---|---|---|---|
| 1 | **Vendor registry returns []** | CRITICAL | LOW | Needs CommercialSalesRep model OR re-hardcode with all 8 sellers |
| 2 | **No cron entry for sync** | HIGH | LOW | vercel.json or external cron to call `/api/internal/comercial/maletas/sync` |
| 3 | **Replenishment approval not wired** | MEDIUM | MEDIUM | lib/approvals/ integration |
| 4 | **Cross-bag overcommit guard** | MEDIUM | MEDIUM | OperationalReservation or custom validation |
| 5 | **maletas-client.tsx decomposition** | LOW | HIGH | No blocker, just tech debt |
| 6 | **live-bag-types.ts placeholder data** | LOW | LOW | Replace with real data loader |
| 7 | **Copilot domain tools** | LOW | MEDIUM | Follow Tiendas pattern |

### Recommended Sequence

```
Phase 1 (Foundation):  #1 vendor registry + #2 cron entry
Phase 2 (Safety):      #4 cross-bag overcommit guard
Phase 3 (Workflow):    #3 replenishment approval
Phase 4 (UX):          #5 client decomposition + #6 placeholder cleanup
Phase 5 (Copilot):     #7 domain tools
```

---

## 11. Estimated Implementation Slices

| Slice | Files | New Lines | Modified Lines | Risk |
|---|---|---|---|---|
| **Vendor registry fix** | 1-2 files | ~30 | ~10 | LOW |
| **Cron entry** | 1 file (vercel.json or external) | ~5 | 0 | LOW |
| **Cross-bag overcommit** | 2-3 files | ~80 | ~20 | MEDIUM |
| **Replenishment approval** | 3-4 files | ~150 | ~50 | MEDIUM |
| **Client decomposition** | 5-8 files | ~1,200 (split) | ~1,700 (refactor) | HIGH (regression risk) |
| **Placeholder cleanup** | 1-2 files | ~20 | ~40 | LOW |
| **Copilot domain tools** | 3-4 files | ~400 | ~20 | MEDIUM |

---

## 12. Tests / Baseline / Regression

### Existing Tests

| File | Cases | Status |
|---|---|---|
| `__tests__/maletas-sag-sources.smoke.ts` | 7 | ALL PASS |
| `__tests__/production-alert.smoke.ts` | 5 | ALL PASS |
| **Total** | **12** | **12/12 PASS** |

### Code Quality

- **TSC baseline:** 162 pre-existing errors. Maletas files contribute 0 new errors.
- **Pure engines:** All computation engines are side-effect-free and testable in isolation.
- **Type safety:** Strong type contracts across all layers (vendor-bag-types, vendor-sample-types, maletas-types, maletas-intelligence-types).

### Regression Risks

| Risk | Mitigation |
|---|---|
| Vendor registry fix could break runtime calls | `getVendorRegistry()` already returns [], so any non-empty return is strictly additive |
| Client decomposition could break UI | Must preserve all tab/drawer/filter behavior |
| OperationalReservation integration could affect PIL reads | Maletas is read-only on PIL — reservation is a new write path |
| Cron sync could produce unexpected state | Sync route already exists and is tested — just needs scheduling |

---

## FINAL VERDICT

### B. DOMAIN_GAPS_REQUIRE_IMPLEMENTATION

**Rationale:**

The Maletas domain has a **mature and well-architected codebase** — 60+ files, 15,000 lines, 3-layer separation, pure computation engines, SAG integration, 6 dedicated Prisma models, complete API surface, and working smoke tests. The architecture is sound and the data authority is solid (real SAG + real Prisma, no mocks for core data).

However, it does NOT qualify for A (NEAR_DELIVERY_READY) due to:

1. **Vendor registry returns []** — a critical runtime gap that silently degrades multiple code paths
2. **No scheduled sync** — the sync endpoint exists but is never called automatically
3. **No cross-bag overcommit guard** — a data integrity risk that could cause real inventory conflicts
4. **Replenishment approval not wired** — the workflow is incomplete without approval integration

These are implementation gaps, not architectural gaps. The foundations are correct. The data sources are real. The engines are pure and testable. The fixes are bounded and well-scoped (estimated ~260 new lines for P0 Phase 1-2).

**Not C (DATA_AUTHORITY_GAPS)** because all core data comes from real sources (SAG SOAP, Prisma PIL, ProductEntity, CustomerOrderLine).

**Not D (WORKFLOW_ARCHITECTURE_GAPS)** because the bag lifecycle, order consumption, and replenishment plan models are architecturally complete — they just need wiring to the approval system.

**Not E (MULTIPLE_GAPS)** because the gaps are concentrated in the operational layer (runtime configuration), not spread across data/architecture/workflow.

---

*Audit completed: 2026-08-06. NO IMPLEMENTATION performed.*
