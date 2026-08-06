# Tiendas Copilot Domain Contract

**Sprint:** AGENTIK-COPILOT-STORES-READINESS-01
**Date:** 2026-08-06
**Status:** AUDIT + CONTRACT ONLY — no implementation

---

## 1. Fact Capabilities

### 1.1 Inventory

| Capability | Server Authority | Signature | Status |
|---|---|---|---|
| Store inventory by line | `store-inventory-by-line.ts` | `loadStoreInventoryByLine(orgId, req)` | READY |
| Inventory line counts | `store-inventory-by-line.ts` | `getInventoryLineCounts(orgId, storeId)` | READY |
| Inventory variants | `store-inventory-by-line.ts` | `loadInventoryVariants(orgId, storeId, ref)` | READY |
| Store inventory (variant-level) | `store-replenishment-service.ts` | `getStoreInventory(orgId, storeId)` | READY |
| Main warehouse availability | `store-replenishment-service.ts` | `getMainWarehouseAvailability(orgId)` | READY |
| Distribution data (all stores) | `store-distribution-service.ts` | `loadDistributionData(orgId)` | READY |
| Canonical store detail | `store-distribution-service.ts` | `getCanonicalStoreDetail(orgId, storeId)` | READY |
| Network inventory snapshot | `store-network-inventory.ts` | `buildStoreNetworkSnapshot(orgId)` | READY |

### 1.2 Product / Reference

| Capability | Server Authority | Status |
|---|---|---|
| Reference with price (PE.price) | `store-distribution-service.ts` → `priceByRef` map | READY |
| Reference classification (line/group/subgroup) | `store-distribution-service.ts` → `grupoByRef`, `sizeClassByRef` | READY |
| Hero images | `store-distribution-service.ts` → `loadHeroImageMap(orgId)` | READY |
| Product detail (SAG enrichment) | `lib/inventory/product-detail-loader.ts` → `loadProductDetail(orgId, sku)` | READY |
| Canonical reference lookup | `lib/inventory/canonical-reference-lookup.ts` → `loadCanonicalReferencesByReferenceList()` | READY |

### 1.3 Variants

| Capability | Server Authority | Status |
|---|---|---|
| Variant size/color resolution | `variant-attribute-resolver.ts` → `resolveVariantSizeColor()` | READY |
| Per-variant inventory (store) | PIL join through `getCanonicalStoreDetail()` | READY |
| Per-variant inventory (main) | PIL join through `loadDistributionData()` | READY |

### 1.4 Price

| Capability | Server Authority | Status |
|---|---|---|
| Retail base price (detal excl. IVA) | `ProductEntity.price` via `priceByRef` map | READY |
| SAG PV3 (detal incl. IVA) | `sag-direct-commercial-product-data-source.ts` → `fetchPriceForSingle()` | READY |
| SAG PV4 (wholesale) | Same SOAP adapter | READY |
| Discount tier by aging | `store-discount-types.ts` → `resolveDiscountTier(daysInStore)` | READY |

### 1.5 Needs

| Capability | Server Authority | Status |
|---|---|---|
| Store needs (snapshot-based) | `store-presentation-assembler.ts` → `buildOperativeNeedsPresentation()` | READY |
| Needs by line (paginated) | `store-needs-by-line.ts` → `loadStoreNeedsByLine(orgId, req)` | READY |
| Warehouse-first needs | `store-warehouse-first-needs.ts` → `loadWarehouseFirstNeeds(orgId, storeId)` | READY |
| Unit needs | `store-unit-needs-service.ts` → `loadStoreUnitNeeds(orgId, storeId)` | READY |
| Eligible need universe | `store-needs-eligible-universe.ts` → `loadEligibleStoreNeeds(orgId, storeId)` | READY |

### 1.6 Coverage

| Capability | Server Authority | Status |
|---|---|---|
| Coverage rule projection | `coverage-rule-projection.ts` → `buildCoverageRuleProjection()` | READY |
| Store coverage | `store-coverage-service.ts` → `loadStoreCoverage(orgId, storeId)` | READY |
| Coverage candidates | `store-coverage-service.ts` → `loadStoreCoverageCandidates(orgId, storeId)` | READY |
| Textile coverage engine | `textile-coverage-engine.ts` → `computeTextileCoverage()` | READY |
| Derrotero coverage | `store-derrotero-service.ts` → `getStoreDerroteroCoverage(orgId, storeSlug)` | READY |
| All stores coverage summary | `store-derrotero-service.ts` → `getAllStoresDerroteroCoverageSummary(orgId)` | READY |
| Structure availability | `store-structure-availability-service.ts` → `resolveStructureAvailability()` | READY |

### 1.7 Effective Rules

| Capability | Server Authority | Status |
|---|---|---|
| Effective store config | `store-distribution-actions.ts` → `getEffectiveStoreConfig(orgId, storeId)` | READY |
| Effective rule registry | `store-effective-rule-registry.ts` → `buildEffectiveStoreRules()` | READY |
| Store policies | `store-policy-service.ts` → `listStorePolicies(orgId)` | READY |
| Policy pack config | `store-policy-pack-config.ts` → `CASTILLITOS_STORE_POLICY_PACK_CONFIG` | READY |
| Rule catalog | `store-replenishment-service.ts` → `getStoreRuleCatalog(orgId)` | READY |

### 1.8 Discounts

| Capability | Server Authority | Status |
|---|---|---|
| Store discount evaluation | `store-discount-service.ts` → `loadStoreDiscounts(orgId, storeId)` | READY |
| SAG active discounts | `store-sag-discount-adapter.ts` → `fetchActiveSagDiscounts()` | READY |
| SAG vs Agentik comparison | `store-sag-discount-comparison.ts` → `buildBatchComparisons()` | READY |
| Discount aging facts | `store-discount-aging-service.ts` → `loadStoreDiscountAgingFacts()` | READY |

### 1.9 Sales History

| Capability | Server Authority | Status |
|---|---|---|
| Store revenue (document-level) | `store-sales-service.ts` → `loadStoreSales(orgId, storeId, months)` | READY |
| All stores revenue | `store-sales-service.ts` → `loadAllStoresSales(orgId, months)` | READY |
| Product-level sales (per store) | `store-sale-line-service.ts` → `loadStoreProductSales(orgId, storeId, from, to)` | READY |
| Product-level facts (per store) | `store-sale-line-service.ts` → `loadStoreProductSaleFacts(orgId, storeId, from, to)` | READY |

### 1.10 Product Intelligence

| Capability | Server Authority | Status |
|---|---|---|
| Store product intelligence | `store-product-intelligence-engine.ts` → `buildStoreProductIntelligence(opts)` | READY |
| Certified store intelligence | `store-certified-intelligence-service.ts` → `loadCertifiedStoreIntelligence()` | READY |
| Intelligence history | `store-intelligence-history-service.ts` → `loadIntelligenceHistoryBundle()` | READY |
| Momentum calculation | `store-product-intelligence-engine.ts` → `computeMomentumStatus()` | READY |

### 1.11 Supply Plans

| Capability | Server Authority | Status |
|---|---|---|
| Create replenishment documents | `store-replenishment-document-service.ts` → `createReplenishmentDocuments()` | READY |
| List documents | `store-replenishment-document-service.ts` → `listReplenishmentDocuments()` | READY |
| Get document detail | `store-replenishment-document-service.ts` → `getReplenishmentDocument()` | READY |
| Export (PDF/XML/XLSX) | `store-replenishment-document-service.ts` → `exportReplenishmentDocument()` | READY |

### 1.12 Reservations

| Capability | Server Authority | Status |
|---|---|---|
| Reserve inventory | `store-plan-reservation-service.ts` → `reserveStorePlan()` | READY |
| Release reservations | `store-plan-reservation-service.ts` → `releaseStorePlanReservations()` | READY |
| Reservation summary | `store-plan-reservation-service.ts` → `getDocumentReservationSummary()` | READY |
| Workflow transitions | `store-replenishment-workflow-service.ts` → `transitionReplenishmentDocument()` | READY |

### 1.13 Store Metadata

| Capability | Server Authority | Status |
|---|---|---|
| Active stores | `store-governance-service.ts` → `resolveActiveStores(orgId)` | READY |
| Inactive stores | `store-governance-service.ts` → `resolveInactiveStores(orgId)` | READY |
| Store location (id, name, city, SAG code, type) | `StoreLocation` in `store-replenishment-types.ts` | READY |
| Store network topology | `store-network.ts` → `buildStoreNetwork()` | READY |
| Warehouse config | `store-warehouse-config-service.ts` → `listWarehouseConfigs(orgId)` | READY |
| Store snapshot (full state) | `store-snapshot-service.ts` → `getStoreSnapshot(orgId)` | READY |

---

## 2. Open-Ended Analytics Certification

### "How has reference X sold during the last year?"

| Requirement | Authority | Status |
|---|---|---|
| Per-reference sales by date range | `loadStoreProductSaleFacts(orgId, storeId, dateFrom, dateTo)` | READY |
| Cross-store aggregation | `aggregateProductSalesAcrossStores()` in `store-copilot-domain-tools.ts` | READY |
| Monthly time series | `buildProductTimeSeries()` in `store-copilot-domain-tools.ts` | READY |

### "Which products lost momentum in Gran Plaza?"

| Requirement | Authority | Status |
|---|---|---|
| Momentum status per product | `buildStoreProductIntelligence()` → `momentum[]` | READY |
| Filter by DECLINING/LOST | `MomentumEntry.status` = `DECLINING` or `LOST` | READY |

### "Which store is selling this reference fastest?"

| Requirement | Authority | Status |
|---|---|---|
| Per-store sales rate for a reference | `buildStoreProductIntelligence()` per store → find reference in `salesRates[]` | READY |
| Cross-store comparison | `rankStoresByProductRate()` in `store-copilot-domain-tools.ts` | READY |

### "What changed in Gran Plaza during the last 30 days?"

| Requirement | Authority | Status |
|---|---|---|
| 30d vs prior-30d comparison | `buildStoreProductIntelligence()` with `windowId: "LAST_30_DAYS"` → has comparison windows | READY |
| New references entering store | No explicit "new arrivals" detector yet | SEMANTIC_LAYER_REQUIRED |
| Stock level changes over time | No historical PIL snapshots — current state only | DATA_SOURCE_MISSING |

### "What products have stock but no recent sales?"

| Requirement | Authority | Status |
|---|---|---|
| No-sales analysis | `buildStoreProductIntelligence()` → `noSales` result | READY |
| Classification | `NoSalesEntry.classification`: `NO_RECENT_SALES` / `NEVER_SOLD` / `NEW_ARRIVAL` | READY |

### Gap Summary

| Gap | Type | Description |
|---|---|---|
| Cross-store product sales aggregator | READY | `aggregateProductSalesAcrossStores()` in `store-copilot-domain-tools.ts` |
| Monthly time series builder | READY | `buildProductTimeSeries()` in `store-copilot-domain-tools.ts` |
| Cross-store product rate ranker | READY | `rankStoresByProductRate()` in `store-copilot-domain-tools.ts` |
| New arrivals detector | SEMANTIC_LAYER_REQUIRED | Compare current PIL refs vs prior snapshot (no historical PIL today) |
| Historical inventory snapshots | DATA_SOURCE_MISSING | PIL is current-state only — no time-travel for stock levels |

---

## 3. Semantic Tool Contract

### 3.1 Fact Tools (READ)

```typescript
// Store-level
getStoreList(orgId: string): StoreLocation[]
getStoreDetail(orgId: string, storeId: string): CanonicalStoreDetail
getStoreSnapshot(orgId: string): StoreSnapshot

// Inventory
getStoreInventory(orgId: string, storeId: string, line: InventoryLine, page?: number): StoreInventoryByLineResponse
getStoreInventoryLineCounts(orgId: string, storeId: string): InventoryLineCount[]
getProductVariants(orgId: string, storeId: string, referenceCode: string): InventoryVariant[]
getMainWarehouseStock(orgId: string): MainWarehouseAvailability[]

// Product
getProduct(orgId: string, sku: string): ProductDetailEnrichment
getProductPrice(orgId: string, sku: string): { priceDetal: number | null, pricePV3: number | null, pricePV4: number | null }

// Needs & Coverage
getStoreNeeds(orgId: string, storeId: string, line?: string): StoreNeedsByLineResponse
getStoreCoverage(orgId: string, storeId: string): StoreCoverageResult
getEffectiveStoreRules(orgId: string, storeId: string): EffectiveStoreConfig

// Discounts
getStoreDiscountStatus(orgId: string, storeId: string): StoreDiscountResponse

// Sales
getStoreProductSales(orgId: string, storeId: string, dateFrom: string, dateTo: string): StoreProductSalesSummary
getStoreRevenue(orgId: string, storeId: string, months: number): StoreSalesMonth[]

// Intelligence
getProductIntelligence(orgId: string, storeId: string, windowId?: WindowId): StoreProductIntelligence
getCertifiedIntelligence(orgId: string, storeId: string): CertifiedStoreIntelligenceResponse

// Supply Plans
getSupplyPlans(orgId: string): ReplenishmentDocument[]
getSupplyPlan(orgId: string, documentId: string): ReplenishmentDocument
getReservationStatus(orgId: string, documentId: string): DocumentReservationSummary
```

### 3.2 Analytic Tools (ANALYZE)

```typescript
// Time series
buildProductTimeSeries(orgId: string, storeId: string, referenceCode: string, months: number): MonthlySalesEntry[]

// Comparison
comparePeriods(orgId: string, storeId: string, windowId: WindowId): { current: SalesSummary, prior: SalesSummary, delta: DeltaSummary }

// Rankings
rankProductsByRevenue(orgId: string, storeId: string, dateFrom: string, dateTo: string, topN: number): RankedProduct[]
rankProductsBySalesRate(orgId: string, storeId: string, windowId: WindowId, topN: number): SalesRateEntry[]
rankProductsByMomentum(orgId: string, storeId: string, filter?: MomentumStatus): MomentumEntry[]
findNoSalesProducts(orgId: string, storeId: string, windowDays: number): NoSalesEntry[]

// Cross-store
compareProductAcrossStores(orgId: string, referenceCode: string, windowId: WindowId): StoreProductComparison[]

// Aggregation
aggregateStoreSales(orgId: string, months: number): AllStoresSalesResult
```

### 3.3 Implementation Notes

- **No free SQL.** Every tool wraps a certified server authority.
- **No SOAP at query time.** Product intelligence uses local DB (StoreSaleLineRecord, ProductInventoryLevel). SAG SOAP only for price enrichment (PV3/PV4) when explicitly requested.
- **Caching respected.** Tools call existing cached services (2-3 min TTL). No cache bypass.

---

## 4. Attention Signals

### 4.1 Signal Definitions

| Signal | Trigger | Severity | Entity | Evidence | Suggested Action | Dedup Key |
|---|---|---|---|---|---|---|
| `STORE_SUPPLY_REQUIRED` | Needs count > 0 for any active store | `warning` | Store | `{ storeId, needCount, topRef }` | "Review needs tab and generate supply plan" | `supply:{orgId}:{storeId}` |
| `STORE_COVERAGE_CRITICAL` | Coverage < 50% for any line in a store | `critical` | Store + Line | `{ storeId, line, coveragePercent }` | "Review coverage tab, adjust rules or restock" | `coverage:{orgId}:{storeId}:{line}` |
| `DISCOUNT_ADJUSTMENT_REQUIRED` | Pending discount adjustments > 0 in current store | `info` | Store | `{ storeId, pendingCount, topTier }` | "Review discounts tab" | `discount:{orgId}:{storeId}` |
| `SAG_DISCOUNT_REVIEW_REQUIRED` | SAG comparison shows AMBIGUOUS_SAG action | `warning` | Store + Ref | `{ storeId, referenceCode, sagAction }` | "Review SAG discount configuration" | `sag_disc:{orgId}:{storeId}:{ref}` |
| `SUPPLY_PLAN_READY` | Replenishment document in BORRADOR status | `info` | Document | `{ documentId, storeId, suggestionCount }` | "Review and reserve supply plan" | `plan:{orgId}:{documentId}` |
| `RESERVATION_EXPIRING` | Reserved document older than 24h without dispatch | `warning` | Document | `{ documentId, reservedAt, hoursElapsed }` | "Export and dispatch or release reservation" | `reserve:{orgId}:{documentId}` |
| `SUPPLY_PLAN_PENDING_DISPATCH` | Reserved document not yet exported | `info` | Document | `{ documentId, reservedAt }` | "Export PDF/XML and send to warehouse" | `dispatch:{orgId}:{documentId}` |
| `PRODUCT_MOMENTUM_LOST` | Product with status LOST in intelligence engine | `warning` | Store + Ref | `{ storeId, referenceCode, priorRate, currentRate }` | "Investigate why this product stopped selling" | `momentum:{orgId}:{storeId}:{ref}` |
| `STORE_NO_SALES_ALERT` | Products with stock but no sales > 30 days | `warning` | Store | `{ storeId, noSalesCount, totalStockUnits }` | "Review no-sales products for discount or transfer" | `nosales:{orgId}:{storeId}` |
| `STORE_SYNC_STALE` | lastSyncAt older than 24h | `warning` | Store | `{ storeId, lastSyncAt, hoursStale }` | "Check SAG sync pipeline" | `sync:{orgId}:{storeId}` |

### 4.2 Signal Sources

| Signal | Data Source for Trigger | Status |
|---|---|---|
| `STORE_SUPPLY_REQUIRED` | `buildOperativeNeedsPresentation()` → `hasSuggestions` | READY |
| `STORE_COVERAGE_CRITICAL` | `buildCoverageTabPresentation()` → structural sections | READY |
| `DISCOUNT_ADJUSTMENT_REQUIRED` | `loadStoreDiscounts()` → classify by current store | READY |
| `SAG_DISCOUNT_REVIEW_REQUIRED` | `buildBatchComparisons()` → filter AMBIGUOUS_SAG | READY |
| `SUPPLY_PLAN_READY` | `listReplenishmentDocuments()` → filter status BORRADOR | READY |
| `RESERVATION_EXPIRING` | `detectExpiringReservations()` in `store-copilot-domain-tools.ts` | READY |
| `SUPPLY_PLAN_PENDING_DISPATCH` | `listReplenishmentDocuments()` → filter RESERVADO + no export | READY |
| `PRODUCT_MOMENTUM_LOST` | `buildStoreProductIntelligence()` → momentum[].status | READY |
| `STORE_NO_SALES_ALERT` | `buildStoreProductIntelligence()` → noSales result | READY |
| `STORE_SYNC_STALE` | `StoreLocation.lastSyncAt` from snapshot | READY |

### 4.3 Existing Signal Infrastructure

`store-replenishment-service.ts` already exports `getStoreCopilotSignals(orgId)` returning `StoreCopilotSignal[]`. This produces top-3 priority signals from the replenishment engine. The signal contract above extends this with discount, intelligence, and sync signals.

---

## 5. Action Capabilities

| Action | Authority | Classification | Status |
|---|---|---|---|
| Generate supply plan | `createReplenishmentDocuments()` | PREPARE | READY |
| Reserve inventory | `reserveStorePlan()` | WRITE | READY |
| Release reservation | `releaseStorePlanReservations()` | WRITE | READY |
| Export plan (PDF/XML/XLSX) | `exportReplenishmentDocument()` | READ | READY |
| Transition document workflow | `transitionReplenishmentDocument()` | WRITE | READY |
| Save rule change | `saveDistributionConfig()` | WRITE | READY |
| Preview rule impact | `previewRuleImpact()` | ANALYZE | READY |
| Add/remove store rule | `addRuleToStore()` / `removeRuleFromStore()` | WRITE | READY |
| Save aging discount rules | `saveAgingDiscountRulesBatch()` | WRITE | READY |
| Activate/deactivate store | `activateStore()` / `deactivateStore()` | WRITE | READY |
| Generate warehouse guide | `generateGuides()` | PREPARE | READY |
| Create transfer proposal | `createProposalFromSuggestions()` | PREPARE | READY |
| Approve/reject proposal | `approveProposal()` / `rejectProposal()` | APPROVAL_REQUIRED | READY |

### Action Classification Legend

| Class | Meaning | Copilot Behavior |
|---|---|---|
| READ | No side effects | Execute freely within permission boundary |
| ANALYZE | Computation, no persistence | Execute freely |
| PREPARE | Creates draft/preview, reversible | Execute with user confirmation |
| WRITE | Persists changes | Require explicit user approval |
| APPROVAL_REQUIRED | Business-critical mutation | Require explicit approval + audit trail |

---

## 6. Permission Boundary

Every Copilot tool MUST enforce:

| Boundary | Enforcement Point | Mechanism |
|---|---|---|
| `organizationId` | Every service function takes `orgId` as first parameter | Prisma WHERE clause |
| User permissions | API route checks `org-auth.ts` → `assertOrgAccess()` | Server-side before tool dispatch |
| Module availability | Module nav config checks tenant module access | Route-level guard |
| Store scope | `assertStoreActive(orgId, storeId)` | Per-store governance check |
| Role-based writes | `canEditDistributionConfig(role)`, `canManageStoreGovernance(role)` | Role check before mutation |

### Rules

1. The LLM does NOT decide authorization. Authorization is evaluated server-side BEFORE tool execution.
2. No cross-tenant access. `orgId` is resolved from authenticated session, never from LLM input.
3. Store governance is respected. Deactivated stores return empty results, never error.
4. Write tools require explicit user confirmation in the Copilot UI layer.
5. APPROVAL_REQUIRED actions (proposal approval, store deactivation) require additional governance check.

---

## 7. Data vs Memory vs Policy

| Category | Examples | Source of Truth | Copilot Authority |
|---|---|---|---|
| **FACT** | Current inventory, sales history, product prices, store locations, variant sizes/colors | Operational DB (Prisma) + SAG sync | READ — Copilot can query and report |
| **POLICY** | Min/ideal/max thresholds, discount tiers, special product rules, aging policy, scarcity params | `store-policy-service.ts`, `store-policy-pack-config.ts`, `store-effective-rule-registry.ts` | READ — Copilot can explain. PREPARE — can preview changes. WRITE — requires user approval |
| **MEMORY** | Future: strategic memory, historical decisions, learning patterns | Not yet available for Tiendas | NOT_AVAILABLE — Copilot must not use conversational memory to override formal store policy |

### Critical Rule

> Copilot MUST NOT use conversational memory or LLM inference to override, contradict, or reinterpret formal store policy (Derrotero rules, discount tiers, min/max thresholds). Policy changes flow exclusively through the certified write path with user approval.

---

## 8. Readiness Gaps

| # | Capability | Status | Notes |
|---|---|---|---|
| 1 | Store inventory (per line) | READY | `loadStoreInventoryByLine()` |
| 2 | Product detail + price | READY | `priceByRef` + `loadProductDetail()` |
| 3 | Variant detail | READY | `loadInventoryVariants()` |
| 4 | Store needs | READY | `buildOperativeNeedsPresentation()` |
| 5 | Coverage evaluation | READY | `loadStoreCoverage()` |
| 6 | Effective rules | READY | `getEffectiveStoreConfig()` |
| 7 | Discount status | READY | `loadStoreDiscounts()` |
| 8 | Store revenue (document-level) | READY | `loadStoreSales()` |
| 9 | Product-level sales (per store) | READY | `loadStoreProductSales()` |
| 10 | Product intelligence (per store) | READY | `buildStoreProductIntelligence()` |
| 11 | Supply plan lifecycle | READY | Create/reserve/release/export |
| 12 | Store metadata | READY | Governance + snapshot |
| 13 | Cross-store product sales aggregator | READY | `aggregateProductSalesAcrossStores()` in `store-copilot-domain-tools.ts` |
| 14 | Monthly time series builder | READY | `buildProductTimeSeries()` in `store-copilot-domain-tools.ts` |
| 15 | Cross-store product rate ranker | READY | `rankStoresByProductRate()` in `store-copilot-domain-tools.ts` |
| 16 | Reservation expiry detector | READY | `detectExpiringReservations()` in `store-copilot-domain-tools.ts` |
| 17 | Attention signal emitter | READY | `emitStoreAttentionSignals()` in `store-copilot-domain-tools.ts` |
| 18 | New arrivals detector | SEMANTIC_LAYER_REQUIRED | No historical PIL snapshots |
| 19 | Historical inventory time-travel | DATA_SOURCE_MISSING | PIL is current-state only |

### Summary

- **READY:** 17 of 19 capabilities
- **SMALL_ADAPTER_REQUIRED:** 0 (all 5 closed in AGENTIK-COPILOT-STORES-TOOLS-01)
- **SEMANTIC_LAYER_REQUIRED:** 1 (new arrivals — needs historical comparison)
- **DATA_SOURCE_MISSING:** 1 (historical PIL snapshots)
- **ACTION_NOT_CERTIFIED:** 0

---

## 9. Final Contract Summary

### Available Facts (12 domains)
Inventory, Product/Reference, Variants, Price, Needs, Coverage, Effective Rules, Discounts, Sales History (document + product level), Product Intelligence, Supply Plans, Reservations, Store Metadata.

### Analytic Capabilities
Rankings (revenue, rate, momentum), period comparison, no-sales detection, cross-store comparison, time series aggregation. All READY.

### Attention Signals
10 deterministic signals defined. All data sources READY. Unified emitter: `emitStoreAttentionSignals()` in `store-copilot-domain-tools.ts`.

### Actions
13 certified actions across READ/ANALYZE/PREPARE/WRITE/APPROVAL_REQUIRED classifications. All server authorities exist and are tested.

### Approval Boundaries
- READ/ANALYZE: freely executable within permission boundary
- PREPARE: user confirmation required
- WRITE: explicit user approval required
- APPROVAL_REQUIRED: governance check + audit trail

### Permission Boundaries
orgId (session-derived), role-based access, module availability, store governance, no cross-tenant.

### Known Gaps
1 semantic layer (new arrivals — no historical PIL snapshots). 1 missing data source (historical PIL — current-state only). Neither blocks Copilot launch.

### Tool Registry
28 tools registered in `STORES_DOMAIN_TOOL_REGISTRY` (`store-copilot-domain-tools.ts`). 13 READ, 6 ANALYZE, 3 PREPARE, 4 WRITE, 2 APPROVAL_REQUIRED.

---

## FINAL VERDICT

**A. STORES_COPILOT_READY**

17 of 19 capabilities READY. 5 adapter gaps closed in AGENTIK-COPILOT-STORES-TOOLS-01. 28 domain tools registered with structured input/output, provenance, approval metadata, and tenant isolation. 2 remaining gaps (new arrivals, historical PIL) are outside Tiendas scope and do not block Copilot launch.
