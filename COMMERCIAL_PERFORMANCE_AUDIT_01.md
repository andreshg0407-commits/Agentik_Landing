# COMMERCIAL PERFORMANCE AUDIT — Sprint Report

**Sprint:** COMMERCIAL-PERFORMANCE-AUDIT-01
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## Executive Summary

Only **Clientes** had a critical performance issue (Query read timeout from 76 MB rawCrmJson transfer). This was fixed in CLIENTES-PERFORMANCE-HOTFIX-01. All other Comercial modules operate within acceptable limits.

---

## Risk Matrix

| Module | Risk | Status | Key Metric |
|---|---|---|---|
| **Clientes** | FIXED | Was TIMEOUT → now <400ms | 33,203 profiles, 76 MB rawCrmJson eliminated |
| **Pedidos** | LOW | Acceptable | 285 CRM quotes, 755 KB payload, take:500 bounded |
| **Maletas** | LOW | Acceptable | SAG SOAP is the bottleneck, not DB |
| **Tiendas** | LOW | No stores configured | Sequential detail loads would need Promise.all when stores exist |
| **Vendedores** | LOW | No dedicated page loader | Data from snapshots (0 rows currently) |
| **Inventario** | LOW | Acceptable | 4,565 products, paginated reads |
| **Foundation** | LOW | Acceptable | 285 CRM quotes, 755 KB JSON manageable |

---

## Module-by-Module Findings

### CLIENTES (FIXED)

**Root cause:** `loadClientesSummary()` loaded 33,203 CustomerProfile rows with `rawCrmJson: true` → 76 MB transfer → Query read timeout.

**Fix applied (CLIENTES-PERFORMANCE-HOTFIX-01):**
- Split into `loadClientesSummary()` (SQL aggregates, no rows) + `loadClientesPage()` (25 rows, paginated)
- `rawCrmJson` removed from list queries
- City resolution via targeted `"rawCrmJson"->'raw'->>'billing_address_city'` for visible rows only
- Seller linking scoped to page's crmIds
- DB-level search (ILIKE) and filtering

| Metric | Before | After |
|---|---|---|
| Summary | TIMEOUT | 88ms |
| Page (25 rows) | TIMEOUT | 381ms |
| rawCrmJson transferred | 76 MB | 0 |
| Rows transferred | 33,203 | 25 |

### PEDIDOS

**Queries audited:**
- `getOrderStats()` — `take: 500`, rawCrmJson included. 285 rows, 755 KB payload, 1.2s. Bounded and small.
- `listSagOrders()` — `take: 500`, include quoteLines count. 285 rows, 896 KB, 1.5s. Bounded.
- `crmQuoteToOrderDraft()` — single quote detail. Fast.
- `searchCustomers()` — customer search with ILIKE. Fast.

**Verdict:** No action needed now. CRMQuote count (285) is small. Monitor if CRM sync resumes and count grows past 1,000.

**Future optimization (if count grows):** Replace `rawCrmJson: true` in `getOrderStats()` with JSON path extraction for `stage` field.

### MALETAS

**Queries audited:**
- `CommercialCoverageSnapshot` — 15,309 rows total, 3,071 unique refs. DISTINCT ON query: 172ms.
- `loadPreviousState()` — 4 unbounded findMany calls. Filtered by specific snapshotAt or resolved=false. Narrow selects. Data volumes small (0-15K).
- SAG SOAP calls (F34 presence engine) — sequential per vendor, rate-limited. This is the real bottleneck (~10-15s per full reload).
- `ProductEntity` — 4,565 rows. `ProductInventoryLevel` — 157,101 rows. Queries bounded by ref list (IN clause).

**Verdict:** No DB optimization needed. SAG SOAP rate limits are the bottleneck. Coverage snapshot growth should be monitored — at 15K rows it's fine but could grow with more snapshots.

### TIENDAS

**Queries audited:**
- `getStoresWorkspace()` — workspace loader, currently no stores configured.
- `getStoreDetail()` — called sequentially per store in a for loop (page.tsx:33-36).

**Verdict:** No stores exist yet. When stores are configured, the sequential `getStoreDetail()` pattern should be converted to `Promise.all()`. Not urgent until stores are active.

**Future optimization:**
```typescript
// Current (sequential)
for (const card of workspace.stores) {
  const detail = await getStoreDetail(orgId, card.store.id);
}

// Better (parallel)
await Promise.all(workspace.stores.map(card => getStoreDetail(orgId, card.store.id)));
```

### VENDEDORES

No dedicated vendedores loader or page found. Seller data comes from CRM quote history via foundation layer (`client-seller-linker.ts`, `seller-directory.ts`).

**Verdict:** No action needed.

### INVENTARIO

**Queries audited:**
- `ProductEntity` — 4,565 rows. Paginated reads (take:25) at 180ms.
- `inventory-read-service.ts` — uses warehouse-scoped queries.
- `inventory-coverage.ts` — uses CommercialCoverageSnapshot.

**Verdict:** No action needed. Product catalog is manageable size.

### FOUNDATION (Cross-cutting)

**Files with rawCrmJson access:**
- `lib/comercial/foundation/commercial-identity-map.ts` — loads all CRM quotes with rawCrmJson for identity mapping
- `lib/comercial/foundation/client-seller-linker.ts` — loads CRM quotes for seller resolution
- `lib/comercial/foundation/seller-directory.ts` — seller directory from CRM quotes
- `lib/comercial/clientes/cliente-360-loader.ts` — detail view, single profile

**Verdict:** At 285 CRM quotes / 755 KB, this is fine. Foundation scripts are batch operations, not page loaders. If CRM sync resumes and count grows past 5,000, these should switch to JSON path queries.

---

## Dangerous Patterns Found (No Fix Needed Now)

| Pattern | Location | Current Volume | Risk Threshold |
|---|---|---|---|
| `rawCrmJson: true` in list | `order-service.ts:817` | 285 rows, 755 KB | >5,000 rows |
| Unbounded findMany | `maletas-events.ts:279-295` | 0-15K rows, narrow select | >100K rows |
| Sequential await in loop | `tiendas/page.tsx:33-36` | 0 stores | >10 stores |
| N+1 variant inventory | `order-product-search.ts:347` | Low usage | High search volume |
| Full CRM quotes in foundation | `foundation/*.ts` | 285 rows | >5,000 rows |

---

## Quick Wins Applied

None needed beyond CLIENTES-PERFORMANCE-HOTFIX-01. All other modules are within acceptable performance limits for current data volumes.

---

## Recommended Future Hotfixes (Priority Order)

| Priority | Module | Fix | Trigger |
|---|---|---|---|
| P1 | Pedidos | Replace rawCrmJson in getOrderStats with JSON path | CRMQuote > 1,000 |
| P2 | Tiendas | Promise.all for getStoreDetail calls | Stores > 10 |
| P2 | Foundation | JSON path queries for CRM quote data | CRMQuote > 5,000 |
| P3 | Maletas | Add take limits to loadPreviousState findMany | Snapshots > 100K |
| P3 | Pedidos | Batch inventory lookups in order-product-search | High POS usage |

---

## Index Coverage

### CustomerProfile (33,203 rows)
Existing indexes cover all query patterns:
- `organizationId_status_idx` — filter activos
- `organizationId_nit_idx` — NIT search
- `organizationId_lastPurchaseAt_idx` — ordering
- `organizationId_slug_key` — unique constraint
- `organizationId_crmId` — not indexed, but crmId queries are scoped to page (25 rows)

### CRMQuote (285 rows)
- `organizationId_crmId_key` — unique
- `organizationId_issuedAt_idx` — ordering
- `organizationId_sellerSlug_idx` — seller queries

**Missing index (future):** `CRMQuote."rawCrmJson"->'raw'->>'billing_account_id'` — GIN index on JSON path. Not needed at 285 rows but recommended if count grows past 5,000.

---

## Conclusion

The Comercial domain has one confirmed performance issue (Clientes, now fixed) and no other critical issues at current data volumes. The main growth risk is CustomerProfile (33K, growing from SAG sync) and CRMQuote (285, frozen since Mar 2026 but will resume). Monitoring thresholds documented above.
