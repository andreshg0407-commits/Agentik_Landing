# SAG Dual-Database Routing

**Sprint:** AGENTIK-SAG-DUAL-DATABASE-ROUTER-01
**Date:** 2026-08-04
**Status:** Router implemented, consumers not yet migrated

---

## Business Context

SAG/PYA operates two databases for Castillitos:

| Source | Database | Authority |
|---|---|---|
| CURRENT | INDDIANAA_INDU-LUDISAM | 2026-07-21 inclusive onward |
| HISTORICAL | INDDIANAA_CASTILLO-ALZATE | Through 2026-07-20 inclusive |

## Cutoff Law

```
date <= 2026-07-20 → HISTORICAL
date >= 2026-07-21 → CURRENT
```

The cutoff is exactly contiguous: HISTORICAL ends 2026-07-20, CURRENT starts 2026-07-21. No gap, no overlap.

## Environment Variables

### Source-aware (required for dual-database routing)

| Variable | Purpose | Example |
|---|---|---|
| `PYA_SAG_BD_CURRENT` | CURRENT database name | `INDDIANAA_INDU-LUDISAM` |
| `PYA_SOAP_TOKEN_CURRENT` | CURRENT authentication token | (secret) |
| `PYA_SAG_BD_HISTORICAL` | HISTORICAL database name | `INDDIANAA_CASTILLO-ALZATE` |
| `PYA_SOAP_TOKEN_HISTORICAL` | HISTORICAL authentication token | (secret) |
| `PYA_SOAP_ENDPOINT` | Shared SOAP endpoint | `http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap` |

### Legacy (DEPRECATED — do not remove yet)

| Variable | Purpose | Status |
|---|---|---|
| `PYA_SAG_BD` | Single database name | DEPRECATED — used by unmigrated consumers |
| `PYA_SOAP_TOKEN` | Single authentication token | DEPRECATED — used by unmigrated consumers |

Legacy variables will be removed once all consumers are migrated to source-aware calls.

## Router API

**File:** `lib/connectors/pya/sag-source-router.ts`

### Types

```typescript
type SagSource = "CURRENT" | "HISTORICAL";
```

### Connection Resolution

```typescript
// Source-aware (preferred)
getSagConnection(source: SagSource): PyaApiConfig

// Diagnostic (safe for logging — no token)
describeSagConnection(source: SagSource): { source, database, endpoint }

// Legacy fallback (deprecated)
getLegacySagConnection(): PyaApiConfig
```

### Date Routing

```typescript
// Single date
resolveSagSourceForDate(date: string): SagSource

// Date range → segments
resolveSagSourcesForRange(from: string, to: string): SagRouteResult
```

### Range Contract

```typescript
interface SagRouteResult {
  sourcesUsed: SagSource[];     // ["HISTORICAL"] | ["CURRENT"] | ["HISTORICAL", "CURRENT"]
  splitAt: string | null;       // cutoff date or null if single-source
  segments: SagRouteSegment[];  // 1 or 2 contiguous segments
}

interface SagRouteSegment {
  source: SagSource;
  from: string;  // ISO date, inclusive
  to: string;    // ISO date, inclusive
}
```

### Constants

```typescript
SAG_CURRENT_START_DATE  = "2026-07-21"
SAG_HISTORICAL_END_DATE = "2026-07-20"
```

## Usage Examples

### Single date query

```typescript
import { resolveSagSourceForDate, getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { consultaSagJson } from "@/lib/connectors/pya/client";

const source = resolveSagSourceForDate("2026-07-25");
const config = getSagConnection(source);
const rows = await consultaSagJson(config, "SELECT ...");
```

### Range query (may split)

```typescript
import { resolveSagSourcesForRange, getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { consultaSagJson } from "@/lib/connectors/pya/client";

const route = resolveSagSourcesForRange("2026-07-01", "2026-08-01");
const allRows = [];

for (const segment of route.segments) {
  const config = getSagConnection(segment.source);
  const rows = await consultaSagJson(config,
    `SELECT ... WHERE d_fecha_documento >= '${segment.from}' AND d_fecha_documento <= '${segment.to}'`
  );
  allRows.push(...rows);
}
```

## Security Rules

1. Tokens are NEVER logged, serialized to errors, or returned in diagnostic output
2. Only source, database, and endpoint may appear in logs
3. No global mutable state — source is explicit per call
4. No cross-contamination: CURRENT DB always pairs with CURRENT token
5. `describeSagConnection()` is the only sanctioned diagnostic function

## Consumer Migration Priority

Based on audit AGENTIK-SAG-DUAL-DATABASE-ROUTING-AUDIT-01:

### P0 — Cron recovery (currently broken)

| Consumer | File | Current Source | Action |
|---|---|---|---|
| data-sync (movements) | `app/api/cron/data-sync/route.ts` | Connector.config (HISTORICAL DB) | Route via router per date range |
| inventory-refresh | `app/api/cron/inventory-refresh/route.ts` | ENV (PYA_SAG_BD=CURRENT) | Route to CURRENT explicitly |

### P1 — Sales & inventory

| Consumer | File | Current Source | Action |
|---|---|---|---|
| SAG adapter (all sync) | `lib/connectors/adapters/sag-pya-soap/index.ts` | Connector.config | Migrate to router |
| Enrichment (PV3/PV4) | `lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts` | ENV direct | Route to CURRENT |
| Customer master sync | `lib/comercial/clientes/sag-customer-master-sync.ts` | ENV direct | Route to CURRENT |
| Official balance loader | `lib/inventory/sag-official-balance-loader.ts` | ENV direct | Route to CURRENT |
| Seller resolution | `lib/comercial/pedidos/seller-resolution-service.ts` | ENV direct | Route to CURRENT |

### P2 — Historical backfills

| Consumer | Action |
|---|---|
| Historical movement backfill | Route to HISTORICAL for dates <= 2026-07-20 |
| Range queries (reports) | Use `resolveSagSourcesForRange()` for cross-cutoff ranges |

### P3 — View migration

| Action |
|---|
| Migrate to vw_agentik_ventas, vw_agentik_productos views (separate sprint) |
