# CLIENTES PERFORMANCE HOTFIX — Sprint Report

**Sprint:** CLIENTES-PERFORMANCE-HOTFIX-01
**Priority:** P0
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## Root Cause

`loadClientesSummary()` loaded **33,203 CustomerProfile rows** including `rawCrmJson` (100% populated, avg 2.3 KB each = **76 MB total transfer**). PostgreSQL executed in 65ms but Prisma deserialization + network transfer caused **Query read timeout**.

The `rawCrmJson` was selected only to extract a single field: `billing_address_city` for DANE city resolution.

---

## Performance Results

| Operation | BEFORE | AFTER | Improvement |
|---|---|---|---|
| Summary KPIs | **TIMEOUT** | 1,292ms | Fixed |
| Page (25 rows) | **TIMEOUT** | 144ms | Fixed |
| CRM city resolution | Embedded in 76 MB blob | 157ms (targeted JSON path) | ~500x less data |
| Seller linking | All 33K profiles | 120ms (page crmIds only) | ~1300x less work |
| Search | Client-side (33K in memory) | 133ms (DB ILIKE) | Server-side |
| Filter cartera | Client-side (33K in memory) | 111ms (DB WHERE) | Server-side |
| Filter vendedor | Client-side (33K in memory) | 134ms (DB EXISTS) | Server-side |
| rawCrmJson loaded | YES (76 MB) | NO | Eliminated |
| Rows transferred | 33,203 | 25 | 1,328x fewer |

---

## Architecture Changes

### Phase 1-2: Remove rawCrmJson, targeted city resolution

**Before:** `findMany` with `rawCrmJson: true` → 76 MB transfer, timeout.

**After:** `findMany` without `rawCrmJson`. City resolution via targeted SQL:
```sql
SELECT id, "rawCrmJson"->'raw'->>'billing_address_city' AS crm_city
FROM "CustomerProfile"
WHERE "organizationId" = $1
  AND id = ANY($2::text[])
  AND "rawCrmJson" IS NOT NULL
```
Only extracts the single JSON path for the 25 visible rows.

### Phase 3-4: Separated loaders with server-side pagination

| Loader | Purpose | Data |
|---|---|---|
| `loadClientesSummary(orgId)` | KPI aggregates only | SQL COUNT + FILTER, no rows |
| `loadClientesPage(orgId, params)` | Paginated rows | take/skip, DB filters, 25-50 rows max |
| `loadCliente360(orgId, clienteId)` | Detail view | Unchanged, single profile |

`ClientesSummary` no longer contains `clients[]` — only aggregate numbers.

New `ClientesPageResult` type:
```typescript
interface ClientesPageResult {
  clients: ClienteRow[];
  totalFiltered: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Phase 5: Server-side search

Search by name and NIT uses Prisma `contains` with `mode: "insensitive"` (translates to `ILIKE`).

City and seller search deferred — requires JSON path queries or denormalization.

### Phase 6: Scoped seller linking

Seller resolution only for the current page's `crmIds` (typically 10-15 out of 25 rows):
```sql
SELECT "rawCrmJson"->'raw'->>'billing_account_id' AS billing_id, "sellerName" AS seller
FROM "CRMQuote"
WHERE "organizationId" = $1
  AND "sellerName" IS NOT NULL
  AND "rawCrmJson"->'raw'->>'billing_account_id' = ANY($2::text[])
```

### Phase 7: Indexes verified

Existing indexes cover all query patterns:
- `CustomerProfile_organizationId_status_idx` — filter activos
- `CustomerProfile_organizationId_nit_idx` — NIT search
- `CustomerProfile_organizationId_lastPurchaseAt_idx` — ordering
- `CRMQuote_organizationId_sellerSlug_idx` — seller queries

No new indexes needed.

### Phase 8: Error handling

Both loaders return safe defaults on failure:
- `loadClientesSummary`: returns zeros
- `loadClientesPage`: returns empty clients array

Errors logged as `[PERF][CLIENTES][ERROR]`.

### Phase 9: Performance logging

```
[PERF][CLIENTES] summary 1292ms — total=33203 active=33203 withSeller=145 rawJsonLoaded=false
[PERF][CLIENTES] page 144ms — page=1/1329 rows=25 totalFiltered=33203 rawJsonLoaded=false
```

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/clientes/client-loader.ts` | Complete rewrite: split into `loadClientesSummary` (aggregates) + `loadClientesPage` (paginated). Removed rawCrmJson from findMany. Added targeted JSON path query for city. Scoped seller linking. DB-level search/filter. |
| `app/(app)/[orgSlug]/comercial/clientes/page.tsx` | Reads `searchParams` for page/search/filter. Calls both loaders in parallel. Passes new props. |
| `app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx` | Receives server-side pagination results. Navigation via URL searchParams. Search triggers on Enter. Filter/page changes update URL → server re-render. |

---

## Files NOT Changed

| File | Why |
|---|---|
| `lib/comercial/clientes/cliente-360-loader.ts` | Detail view — loads single profile, no performance issue |
| `app/.../clientes/[clienteId]/page.tsx` | Detail route — unchanged |
| `app/.../clientes/[clienteId]/cliente-360-client.tsx` | Detail UI — unchanged |
| `lib/comercial/clientes/city-resolver.ts` | Pure functions — unchanged |

---

## Limitations

1. **City/seller search** — currently name+NIT only at DB level. City search requires denormalized `resolvedCity` column. Seller search requires denormalized `resolvedSeller` column.
2. **withSeller KPI** — uses EXISTS subquery with JSON path extraction (134ms). If CRMQuote volume grows, may need a materialized view or denormalized column.
3. **con_vendedor filter** — uses raw SQL with JSON path join. Slower than Prisma filters but still <200ms for 285 quotes.
4. **Sort** — currently name ASC only. Adding sort columns would need additional index coverage.
