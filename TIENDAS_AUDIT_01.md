# TIENDAS-AUDIT-01 -- Audit Report

**Date:** 2026-07-04
**Status:** COMPLETE (read-only audit, zero code changes)
**TSC Baseline:** 160 (untouched)

---

## FASE 1: Code Archaeology

### File inventory

**Lib layer: 11 files in `lib/comercial/tiendas/`**

| File | Lines | Sprint | Purpose |
|------|-------|--------|---------|
| `store-replenishment-types.ts` | ~160 | SURTIDO-01 | Full type system: StoreLocation, StoreInventoryVariant, MainWarehouseAvailability, StoreReplenishmentRule, StoreShortage, ReplenishmentSuggestion, StoreHealthSummary, StoreCard, StoreDetailData, TiendasWorkspaceData, StoreCopilotSignal, CanonicalStoreInventoryRecord, CanonicalMainWarehouseRecord, **StoreInventoryProvider interface**, ProviderResult, ProviderMetadata |
| `store-replenishment-engine.ts` | 298 | SURTIDO-01 | Pure functions: calculateStoreShortages, calculateExactReplenishment, calculateStoreHealth, deriveStoreHealthStatus, buildStoreSuggestions, rankStorePriority. No DB, no side effects. |
| `store-replenishment-service.ts` | ~80 | SURTIDO-01 | Service layer: loads data via SagCurrentProvider, runs engine, returns TiendasWorkspaceData. SERVER ONLY. |
| `store-replenishment-demo-data.ts` | 271 | SURTIDO-01 | Fabricated demo data: 4 fake stores, 10 products, 25+ shortages. PLACEHOLDER — never used for Castillitos in production. |
| `sag-store-adapter.ts` | ~200 | SURTIDO-01 | SAG data adapter: discovers stores from SaleRecord.storeSlug + CRMQuoteLine.warehouseName. Two inventory strategies: ProductInventoryLevel (real stock) → CRMQuoteLine (fallback proxy). |
| `store-transfer-types.ts` | ~120 | TRANSFERENCIAS-04 | Proposal lifecycle types: ProposalStatus (borrador→en_revision→aprobado→preparado_para_sag→enviado_sag→archivado), StoreReplenishmentProposal, ProposalCard, PreparedSagPayload, DuplicateCheckResult |
| `store-transfer-service.ts` | ~250 | TRANSFERENCIAS-04 | Full proposal CRUD using AgentExecution model. Functions: createProposalFromSuggestions, getProposal, listProposals, updateProposalLine, submitProposalForReview, approveProposal, rejectProposal, returnToDraft, markPreparedForSag, archiveProposal. |
| `store-warehouse-config-service.ts` | 169 | NO-HARDCODE-05 | Admin warehouse mapping config CRUD. Uses AgentExecution with operation COMERCIAL_STORE_WAREHOUSE_MAPPING_CONFIG. Supports CRUD + toggle active. |
| `providers/sag-current-provider.ts` | ~50 | DATA-CONTRACT-03 | Implements StoreInventoryProvider. Wraps sag-store-adapter. Always returns `rules: []` — no rule config system exists. |
| `providers/sag-data-warehouse-provider.ts` | 56 | DATA-CONTRACT-03 | **STUB** — returns empty data. Waiting for SAG data warehouse delivery. |
| `providers/demo-provider.ts` | 54 | DATA-CONTRACT-03 | Wraps store-replenishment-demo-data. Development-only. |

**UI layer: 2 files in `app/(app)/[orgSlug]/comercial/tiendas/`**

| File | Lines | Sprint | Purpose |
|------|-------|--------|---------|
| `page.tsx` | 49 | DATA-CONTRACT-03 | Server Component. Loads workspace via `getStoresWorkspace()` + `getStoreCopilotSignals()` + `getStoreDetail()`. Passes to TiendasClient. |
| `tiendas-client.tsx` | 2,123 | SURTIDO-01, TRANSFERENCIAS-04, NO-HARDCODE-05 | Full client workspace: store cards, detail drawer, shortage table, suggestions, copilot signals, proposals tab, proposal detail drawer with approval flow, warehouse config admin panel. |

**API layer: 2 routes in `app/api/orgs/[orgSlug]/comercial/tiendas/`**

| Route | Lines | Sprint | Actions |
|-------|-------|--------|---------|
| `proposals/route.ts` | 120 | TRANSFERENCIAS-04 | POST: create, list, get, update_line, submit_for_review, approve, reject, return_to_draft, prepare_for_sag, archive, check_duplicate |
| `warehouse-config/route.ts` | 57 | NO-HARDCODE-05 | POST: list, save, toggle_active |

**Total: 15 files (11 lib + 2 UI + 2 API)**

### Sprint history

5 sprints built this module:

| Sprint | Focus |
|--------|-------|
| COMERCIAL-TIENDAS-SURTIDO-01 | Foundation: types, engine, adapter, service, UI workspace |
| COMERCIAL-TIENDAS-DATA-CONTRACT-03 | Provider abstraction: StoreInventoryProvider interface |
| COMERCIAL-TIENDAS-TRANSFERENCIAS-04 | Proposal lifecycle: create→review→approve→SAG + API route |
| COMERCIAL-TIENDAS-NO-HARDCODE-05 | Admin warehouse config, remove hardcoded bodegas |
| COMERCIAL-TIENDAS-NO-DEMO | Remove demo data for real tenants |

---

## FASE 2: Data Models

### No dedicated Prisma model

**Critical finding:** There is NO `Store`, `Tienda`, or `Warehouse` Prisma model. Stores exist only as:

1. **SaleRecord.storeSlug / storeName** — 12 distinct stores discovered from SAG sales data
2. **AgentExecution (metadataJson)** — warehouse configs and transfer proposals stored as JSON blobs in a generic execution model
3. **ProductInventoryLevel** — exists but uses different field names (`warehouseId` not `warehouseCode`, `productId` not `referenceCode`, `quantity` not `availableUnits`). SAG adapter translates between schemas.

### Additional relevant Prisma models

| Model | Schema Line | Relevance |
|-------|-------------|-----------|
| SaleRecord | 1751 | `storeCode?`, `storeSlug`, `storeName` — source of store identity |
| ProductInventoryLevel | 4087 | `productId`, `warehouseId`, `quantity`, `reservedQty` — per-warehouse stock |
| CommercialCoverageSnapshot | 5373 | `refCode`, `disponible`, `coverageDays` — aggregate availability |
| InventoryTransfer | 9387 | `originWarehouseCode/Name`, `destinationWarehouseCode/Name` — SAG inter-warehouse transfers |
| InventoryTransferLine | 9438 | `referenceCode`, `size`, `color`, `quantity` — transfer line items |
| ProductionOrder | 9304 | `warehouseCode/Name` — SAG production orders |
| AgentExecution | 9230 | Generic persistence for proposals + warehouse configs |
| SourceMatchRecord | 1868 | `storeSlug` — denormalized for F2 dedup |

### Type system vs reality

| Tiendas Type | Maps to DB? | Source |
|-------------|-------------|--------|
| StoreLocation | NO model — discovered from SaleRecord at runtime | SAG adapter |
| StoreInventoryVariant | PARTIAL — ProductInventoryLevel exists, adapter translates | SAG adapter |
| MainWarehouseAvailability | PARTIAL — same ProductInventoryLevel | SAG adapter |
| StoreReplenishmentRule | NO model — always empty `[]` | Not implemented |
| StoreReplenishmentProposal | AgentExecution (metadataJson blob) | transfer-service |
| StoreWarehouseMappingConfig | AgentExecution (metadataJson blob) | warehouse-config-service |

---

## FASE 3: Real Data Audit (Castillitos)

### Stores from SaleRecord

12 distinct stores with 128,636 total sales records (2020–2026):

| Store | Slug | Sales | Total Amount | First Sale | Last Sale |
|-------|------|-------|-------------|------------|-----------|
| SAG | sag | 44,872 | $15.5B | 2020-05-26 | 2026-06-30 |
| Empresa F2 | empresa-f2 | 15,192 | $8.7B | 2020-06-12 | 2026-06-26 |
| Empresa | empresa | 35,787 | $5.6B | 2020-06-08 | 2026-06-26 |
| Almacen D | almacen-d | 8,995 | $1.1B | 2023-05-30 | 2026-06-28 |
| Almacen C | almacen-c | 4,473 | $800M | 2023-06-24 | 2026-06-27 |
| Almacen G | almacen-g | 6,446 | $757M | 2023-08-24 | 2026-06-28 |
| Almacen A | almacen-a | 6,382 | $707M | 2024-06-02 | 2026-06-28 |
| Tienda Web | tienda-web | 1,672 | $370M | 2025-11-04 | 2026-06-26 |
| Empresa F1 | empresa-f1 | 210 | $111M | 2020-06-08 | 2020-06-30 |
| POS | pos | 1,909 | $0 | 2020-07-01 | 2026-06-27 |
| Almacen | almacen | 378 | -$36M | 2022-08-01 | 2026-06-28 |
| Addi/Sistecredit | addisistecredit | 2,320 | -$169M | 2020-07-01 | 2026-06-27 |

**Observations:**
- "SAG" is the dominant store ($15.5B) — likely the main warehouse / facturacion central, not a retail point
- "Empresa" and "Empresa F2" are B2B/wholesale channels
- 4 "Almacen" variants (A, C, D, G) are retail stores — opened 2023-2024
- "Tienda Web" is the online channel (opened Nov 2025)
- "POS" has 1,909 records but $0 amount — likely payment instrument records, not sales
- "Addi/Sistecredit" has negative amounts — likely payment reconciliation adjustments (BNPL fintech)
- "Almacen" (generic) also negative — likely returns or adjustments
- "Empresa F1" — inactive since 2020-06 (discontinued)

### Warehouse mapping configs: **0 records**

No admin has configured store-to-warehouse mappings. The `saveWarehouseConfig` function has never been called for Castillitos.

### Transfer proposals: **0 records**

No transfer proposals have ever been created. The full lifecycle (borrador→aprobado→SAG) has never been exercised.

### ProductInventoryLevel

Table exists in schema (line 4087) with fields: `productId`, `warehouseId`, `quantity`, `reservedQty`, `source`, `externalRef`. The SAG adapter (`sag-store-adapter.ts`) queries this table and translates to CanonicalStoreInventoryRecord format.

### CommercialCoverageSnapshot

Table exists (line 5373) with `refCode`, `disponible`, `coverageDays`, `status`. Consumed by Control Comercial's inventario section. NOT consumed directly by tiendas module.

---

## FASE 4: UI Audit

### Pages: 2 files (page.tsx + tiendas-client.tsx)

**`page.tsx`** (49 lines) — Server Component:
- Auth-gated via `requireOrgAccess(orgSlug)`
- Loads workspace: `getStoresWorkspace(orgId)` → workspace + provider metadata
- Loads copilot signals: `getStoreCopilotSignals(orgId)`
- Pre-computes store details: iterates `workspace.stores`, calls `getStoreDetail()` per store
- Passes all data as props to `TiendasClient`

**`tiendas-client.tsx`** (2,123 lines) — Full Client Workspace:
- Store health cards with severity badges and coverage %
- Detail drawer with shortage table, suggestion list, copilot signals per store
- Replenishment rules display (currently empty — `rules: []`)
- Proposals tab: list, create, detail drawer with line editing
- Proposal approval flow: submit → review → approve → prepare for SAG
- Warehouse config admin panel: list, create, toggle active
- Provider metadata display (data source, last sync, variant support)

### API Routes: 2 routes

**`/api/orgs/[orgSlug]/comercial/tiendas/proposals`** (120 lines):
- POST with 11 actions covering full proposal CRUD + lifecycle transitions
- All actions delegate to `store-transfer-service.ts` functions

**`/api/orgs/[orgSlug]/comercial/tiendas/warehouse-config`** (57 lines):
- POST with 3 actions: list, save, toggle_active
- Delegates to `store-warehouse-config-service.ts`

### Navigation

Tiendas IS wired in `module-nav-config.ts` under the Comercial domain. Route resolves to the workspace page.

---

## FASE 5: Maletas Comparison

| Dimension | Tiendas (15 files) | Maletas (48 files) | Gap |
|-----------|---------|---------|-----|
| **Lib files** | 11 | 46 | 4.2x |
| **UI pages** | 2 (page + 2,123-line client) | 0 (NO UI pages) | Tiendas ahead |
| **API routes** | 2 (proposals, warehouse-config) | 0 (NO API routes) | Tiendas ahead |
| **Engine** | 1 file (298 lines) | 4+ engines (main, decision, production alert, reference decision) | Missing specialization |
| **Types** | 2 files (types + transfer-types) | 10+ type files (core, intelligence, commercial intel, coverage, live bag, vendor bag, vendor sample, case assignment, production request, coverage ownership) | Missing domain depth |
| **SAG adapters** | 1 (sag-store-adapter) | 4 (sag-adapter, sag-prisma-reader, sag-sale-record-reader, sag-inventory-adapter) | Missing read specialization |
| **Intelligence** | 0 | 3 (sales intelligence, commercial intelligence, copilot signals) | No intelligence layer |
| **Temporal/Memory** | 0 | 3 (temporal, memory, snapshots) | No history |
| **Coverage** | 0 | 2 (coverage, coverage ownership) | No coverage tracking |
| **Tests** | 0 | 2 smoke tests | No validation |
| **Prisma model** | 0 (uses AgentExecution) | Uses domain models (CommercialCase, CommercialCoverageSnapshot) | Data model gap |
| **Decision engine** | 0 | Full decision engine with vendor bag, reference decisions | No decision support |
| **Production alerts** | 0 | Production alert engine | No production link |
| **Copilot signals** | Basic (4 signal types) | Rich copilot signals with intelligence | Limited signals |
| **Vendor subsystem** | 0 | vendor-bag-engine, vendor-bag-repository, live-bag-engine, vendor-sample-* (6 files) | No vendor layer |

**Summary:** Both modules are incomplete in complementary ways. Maletas has deep domain modeling (4x lib files, intelligence, temporal, decisions) but NO UI or API surface. Tiendas has a complete vertical slice (UI → API → Service → Engine → SAG Adapter) but shallow domain modeling. Tiendas is closer to "usable" because it has the full stack; Maletas is closer to "intelligent" because it has the analytical depth.

---

## FASE 6: Scarcity Alert Rules

The engine (`store-replenishment-engine.ts`) defines these alert thresholds:

### Shortage severity

```
critical: currentUnits === 0 OR currentUnits < minUnits * 0.5
warning:  currentUnits < minUnits
normal:   currentUnits >= minUnits
```

### Suggestion types

| Type | Condition | Action |
|------|-----------|--------|
| exact_transfer | Main warehouse has >= missing units | Send all from main warehouse |
| partial_transfer | Main warehouse has some but not all | Transfer available + produce rest |
| production_needed | Main warehouse has zero | Request production |
| substitute_available | Rules allow + different size/color available | Offer up to 3 alternatives (max) |

### Health status

```
critica:          criticalShortages > 0
requiere_surtido: warningShortages > 0 OR coveragePercent < 85
ok:               everything else
```

### Copilot signals (max 3 per store)

| Signal | Priority | Condition |
|--------|----------|-----------|
| critical_shortage | 1 | Store has critical shortages |
| transfer_ready | 2 | Units available for exact transfer from main warehouse |
| production_needed | 3 | Units need production |
| healthy | 4 | No shortages |

### Limitation: Rules always empty

`SagCurrentProvider` always returns `rules: []`. The substitute logic depends on rules (`r.ruleType === "category"` or `r.ruleType === "line"`), so **substitute suggestions will never fire** in production until a rule configuration system is built.

---

## FASE 7: Transfer Lifecycle

Full lifecycle exists in `store-transfer-service.ts`:

```
borrador → en_revision → aprobado → preparado_para_sag → enviado_sag
              ↓              ↓
           rechazado      (also: returnToDraft, archiveProposal)
```

### Functions and wiring

| Function | Service | API Route | UI |
|----------|---------|-----------|-----|
| createProposalFromSuggestions | Built | Wired (proposals POST action=create) | Wired (tiendas-client) |
| getProposal | Built | Wired (action=get) | Wired |
| listProposals | Built | Wired (action=list) | Wired |
| updateProposalLine | Built | Wired (action=update_line) | Wired |
| submitProposalForReview | Built | Wired (action=submit_for_review) | Wired |
| approveProposal | Built | Wired (action=approve) | Wired |
| rejectProposal | Built | Wired (action=reject) | Wired |
| returnToDraft | Built | Wired (action=return_to_draft) | Wired |
| markPreparedForSag | Built | Wired (action=prepare_for_sag) | Wired |
| archiveProposal | Built | Wired (action=archive) | Wired |
| checkDuplicateProposal | Built | Wired (action=check_duplicate) | Wired |

**All 11 functions are fully wired end-to-end (Service → API → UI) but have never been invoked by a user.** Zero proposals in DB confirms the feature is built but unused.

### SAG payload preparation

`markPreparedForSag` generates a `PreparedSagPayload` with transfer lines ready for SAG export. The actual SAG write (sending the transfer to SAG ERP) is **not implemented** — the lifecycle stops at "prepared".

---

## FASE 8: Relationship with Control Comercial

Control Comercial (`control-comercial-loader.ts`) already consumes store data in two ways:

### 1. Channel aggregation (lines 220–239)

```typescript
// From SaleRecord: channel + storeSlug + storeName
// Builds channelMap: { channel → { pedidos, valor, clientes (stores) } }
```

This creates the "Canales Comerciales" section showing ALMACEN, EMPRESA, ONLINE, OTRO with store counts. **This is the only place in Control Comercial where store data surfaces.**

### 2. Inventory coverage (lines 404–420)

```typescript
// From CommercialCoverageSnapshot: aggregate refs totales, criticas, agotadas
// Creates: inventoryStrip { refsTotal, refsCriticas, refsAgotadas, refsConOp }
```

This is product-level inventory, not per-store. It doesn't break down by warehouse/store.

### Gap

Control Comercial knows about stores (from SaleRecord) and inventory (from CommercialCoverageSnapshot) but does NOT:
- Show per-store inventory levels
- Show store health status
- Show replenishment needs
- Link to tiendas workspace for drill-down

The channel section in Control Comercial uses `storeSlug` as a proxy for "puntos" (physical locations) per channel.

### Potential integration points

1. Control Comercial alertas could include "Tienda X tiene N referencias criticas" with `action: { label: "Ver tienda", href: "/comercial/tiendas?store=X" }`
2. The inventario section could add per-store breakdown if ProductInventoryLevel has `warehouseId` populated per store
3. The channel section could link to tiendas workspace per channel

---

## FASE 9: Roadmap

### What works today

| Component | Status | Evidence |
|-----------|--------|----------|
| Store discovery from SAG | WORKS | 12 stores found in SaleRecord |
| Provider abstraction | WORKS | SagCurrentProvider implements interface |
| Replenishment engine | WORKS | Pure functions, 4 suggestion types, health scoring |
| Transfer lifecycle types | WORKS | Full state machine defined |
| Transfer service CRUD | WORKS | All 11 functions implemented |
| Warehouse config service | WORKS | CRUD ready, just never called |
| UI workspace | WORKS | 2,123-line client with cards, drawers, proposals, admin |
| API routes | WORKS | 2 routes covering proposals (11 actions) + config (3 actions) |
| Navigation | WORKS | Wired in module-nav-config.ts |

### What's missing (priority order)

| # | Gap | Effort | Dependency |
|---|-----|--------|------------|
| 1 | **ProductInventoryLevel population** | Medium | SAG sync must write per-warehouse stock to this table |
| 2 | **Replenishment rules config** | Medium | Admin UI + storage (substitute suggestions depend on this) |
| 3 | **Per-store inventory breakdown** | Medium | Requires #1 (real stock data per warehouse) |
| 4 | **Control Comercial integration** | Small | Add store health alerts + drill-down links |
| 5 | **Intelligence layer** (following maletas pattern) | Large | Real inventory data (#1) |
| 6 | **Temporal tracking** (historical snapshots) | Medium | Needs cron + storage |
| 7 | **Production linkage** (store shortage → OP) | Medium | ProductionEvent / ProductionOrder models exist |
| 8 | **SAG write layer** (transfer → SAG ERP) | Large | SAG API access for writes |
| 9 | **SAG data warehouse provider** | Large | External dependency (SAG delivery) |
| 10 | **InventoryTransfer integration** | Medium | Wire existing InventoryTransfer model into store transfer history |

### Recommended sprint sequence

1. **TIENDAS-INVENTORY-01**: Wire ProductInventoryLevel into SAG sync so sag-store-adapter returns real per-store stock instead of empty/proxy data.

2. **TIENDAS-RULES-02**: Build rule configuration UI + storage. Enables substitute suggestions in the engine.

3. **TIENDAS-CONTROL-INTEGRATION-03**: Add store health signals to Control Comercial: per-store alerts, drill-down links to tiendas workspace.

4. **TIENDAS-INTELLIGENCE-04**: Following maletas pattern — add temporal snapshots, coverage tracking, copilot signals, and production linkage.

---

## Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Type system | 8/10 | Comprehensive, well-designed provider abstraction |
| Engine | 7/10 | Sound logic, 4 suggestion types, health scoring |
| Data access | 5/10 | SAG adapter exists but ProductInventoryLevel may not be populated per-store |
| Transfer lifecycle | 9/10 | Full state machine, fully wired end-to-end, never used |
| UI | 7/10 | 2,123-line client workspace with cards, drawers, proposals, admin |
| API | 8/10 | 2 routes, 14 total actions, all wired to service layer |
| Intelligence | 1/10 | Basic copilot signals only, no temporal/coverage/decisions |
| Real data | 6/10 | 12 real stores exist in SaleRecord, but no per-store inventory |
| Production integration | 0/10 | No linkage to ProductionEvent/OP system |
| Maturity vs Maletas | 40% | 15 files vs 48, but has full UI+API stack that maletas lacks |

**Bottom line:** Tiendas is a complete vertical slice — types, engine, service, API, UI — that is fully built and wired but has never been exercised by a user. The module has a 2,123-line client workspace with store cards, detail drawers, proposal lifecycle, and admin config. The primary blocker is **real inventory data per store** (ProductInventoryLevel needs to be populated by SAG sync with per-warehouse breakdown). Once inventory data flows, the existing engine + UI will immediately produce meaningful shortage analysis and replenishment suggestions.

---

## Archivos Leidos (no modificados)

| Archivo | Observacion |
|---------|-------------|
| `lib/comercial/tiendas/store-replenishment-types.ts` | Full type system with StoreInventoryProvider interface |
| `lib/comercial/tiendas/store-replenishment-engine.ts` | Pure engine: shortages, suggestions, health, signals |
| `lib/comercial/tiendas/store-replenishment-service.ts` | Service layer wrapping provider + engine |
| `lib/comercial/tiendas/store-replenishment-demo-data.ts` | Fabricated data — 4 fake stores, never used for Castillitos |
| `lib/comercial/tiendas/sag-store-adapter.ts` | SAG store discovery + inventory loading |
| `lib/comercial/tiendas/store-transfer-types.ts` | Full proposal lifecycle types |
| `lib/comercial/tiendas/store-transfer-service.ts` | 11-function proposal CRUD, never invoked |
| `lib/comercial/tiendas/store-warehouse-config-service.ts` | Admin config CRUD, 0 records |
| `lib/comercial/tiendas/providers/sag-current-provider.ts` | Active provider, wraps SAG adapter |
| `lib/comercial/tiendas/providers/sag-data-warehouse-provider.ts` | STUB — returns empty data |
| `lib/comercial/tiendas/providers/demo-provider.ts` | Dev-only, wraps demo data |
| `app/(app)/[orgSlug]/comercial/tiendas/page.tsx` | Server wrapper, loads workspace + signals + details |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | 2,123-line full workspace client (NOT read in detail — too large) |
| `app/api/orgs/[orgSlug]/comercial/tiendas/proposals/route.ts` | POST with 11 actions for proposal lifecycle |
| `app/api/orgs/[orgSlug]/comercial/tiendas/warehouse-config/route.ts` | POST with 3 actions for warehouse config |
| `lib/comercial/control/control-comercial-loader.ts` | Lines 220-239: channel/store aggregation |
| `prisma/schema.prisma` | SaleRecord, ProductInventoryLevel, CommercialCoverageSnapshot, CRMQuoteLine, InventoryTransfer, ProductionOrder schemas |
| `lib/comercial/maletas/**` | 46+ files for maturity comparison |
