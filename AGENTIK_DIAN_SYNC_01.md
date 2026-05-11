# AGENTIK-DIAN-SYNC-01
## Fiscal Synchronization Infrastructure Layer

**Sprint closed:** 2026-05-10
**New files:** 6
**Modified files:** 0
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Build secure, multi-tenant fiscal synchronization infrastructure for the DIAN integration layer:

```
FOUNDATION-01:    Types + SOAP + WS-Security config + XML pipeline
MULTITENANT-01:   Per-tenant certificate ownership + vault abstraction
SECURE-VAULT-01:  AES-256-GCM encryption for all secrets
SECURITY-01:      PKCS#12 parsing + RSA-SHA256 signing + HTTP dispatch
SYNC-01 (this):   Sync orchestrator + job tracking + fiscal memory
                  + idempotency + retry policy + observability + internal API
```

---

## File Changes

```
lib/integrations/dian/sync/
├── dian-sync-types.ts           NEW — all type definitions
├── dian-sync-registry.ts        NEW — typed operation registry
├── dian-sync-observability.ts   NEW — structured audit events
├── dian-sync-fiscal-memory.ts   NEW — fiscal sync memory (Integration.metaJson)
└── dian-sync-orchestrator.ts    NEW — multi-tenant sync coordinator

app/api/internal/dian/sync/
└── route.ts                     NEW — internal POST endpoint
```

---

## Architecture

### SyncJob as Anchor

Uses the existing `SyncJob` model (linked to `Integration`) — not `ConnectorRun` (linked to `Connector`).

```
SyncJob.type         = "dian.get_acquirer" | "dian.get_status" | ...
SyncJob.status       = QUEUED | RUNNING | SUCCEEDED | FAILED
SyncJob.inputJson    = { operation, environment, triggeredBy, requestHash }
SyncJob.outputJson   = { responseStatus, durationMs, retryCount, metadata }
SyncJob.errorJson    = { code, message, retryable, attempt, durationMs }
SyncJob.integrationId → Integration (DIAN provider)
```

No new Prisma models required.

### Fiscal Memory Storage

Stored in `Integration.metaJson` (unclaimed field) under key `fiscalSync`:

```json
{
  "version": "1",
  "fiscalSync": {
    "GetAcquirer": {
      "habilitacion": {
        "lastRunAt": "2026-05-10T...",
        "lastStatus": "succeeded",
        "successCount": 5,
        "failureCount": 1,
        "avgLatencyMs": 1200,
        "p99LatencyMs": 2300,
        "recentLatencies": [1100, 1200, 1300, ...]
      }
    }
  }
}
```

No new Prisma schema changes.

---

## Operation Registry

| Operation | Status | SyncJob type | Retry |
|-----------|--------|--------------|-------|
| `GetAcquirer` | **live** | `dian.get_acquirer` | 2 attempts, 2s base |
| `GetStatus` | future | `dian.get_status` | 2 attempts |
| `GetStatusZip` | future | `dian.get_status_zip` | 2 attempts |
| `SendBillAsync` | future | `dian.send_bill_async` | 2 attempts, 5s base |
| `SendBillSync` | future | `dian.send_bill_sync` | **no retry** (double-submit risk) |
| `SendTestSetAsync` | future | `dian.send_test_set_async` | 2 attempts |

---

## Orchestrator Pipeline

`runDianSync(req)` — always returns `DianSyncOutcome`, never throws:

```
1. Validate operation is live (registry check)
2. loadTenantDianIntegration() — confirm DIAN integration exists
3. Concurrency gate — query RUNNING SyncJob for same (org, operation)
   → if found: return { status: "skipped" }
4. Compute requestHash = SHA-256(orgId + operation + payload)[0:32]
5. Create SyncJob(status=RUNNING) — audit trail anchor
6. Emit SYNC_STARTED audit event
7. loadTenantDianContext() — per-tenant cert + vault + endpoints
   → if fails: finalizeFailed() → return { status: "failed" }
8. DianClient.forTenant(ctx) — isolated per-tenant client
9. Retry loop (up to maxAttempts per operation registry):
   a. dispatchOperation() → DianClient.getAcquirer()
   b. If success: update SyncJob(SUCCEEDED), update fiscal memory, emit SYNC_COMPLETED
   c. If retryable error (HTTP_TIMEOUT, HTTP_ERROR) AND attempts remain:
      → emit SYNC_RETRY, exponential backoff, continue
   d. If non-retryable (SOAP_FAULT, CERTIFICATE_*, WSSE_SIGNING_FAILED):
      → finalizeFailed() immediately
10. Exhausted attempts: finalizeFailed()
```

---

## Retry Policy

### Non-retryable error codes (always terminal)

| Code | Reason |
|------|--------|
| `CERTIFICATE_INVALID` | Config error — won't self-heal |
| `CERTIFICATE_LOAD_FAILED` | Filesystem error — won't self-heal |
| `WSSE_SIGNING_FAILED` | Crypto error — retrying re-signs but stays invalid |
| `SOAP_BUILD_FAILED` | Code bug — won't self-heal |
| `SOAP_FAULT` | DIAN business/auth rejection — server intentional |
| `NOT_FOUND` | DIAN lookup miss — retrying same input = same result |
| `RESPONSE_INVALID` | Non-XML response — retry unlikely to help |

### Retryable error codes

| Code | Reason |
|------|--------|
| `HTTP_TIMEOUT` | Transient network congestion |
| `HTTP_ERROR` | DIAN server 5xx (DianClient already retried 1x internally) |

**Note:** DianClient retries HTTP 5xx once internally (low-level). The orchestrator adds one high-level retry on top for HTTP_TIMEOUT and HTTP_ERROR after the full client call fails. Total worst-case: 4 actual HTTP calls (2 client-level × 2 orchestrator-level).

---

## Concurrency Safety

| Concern | Mitigation |
|---------|-----------|
| Two requests for same org + operation | Prisma query checks for RUNNING SyncJob before creating a new one |
| Shared state between tenants | DianClient.forTenant() creates an isolated instance per call |
| Cross-tenant vault access | SecureVault enforces organizationId match before decrypt |
| Certificate sharing | Each tenant-context loads its own cert path + password |

---

## XML / Secret Safety Policy

```typescript
// NEVER persist or log:
["signedXml", "xmlBody", "privateKeyPem", "certBuffer", "certPassword",
 "bstXml", "signatureXml", "certDer"]

// Persist only hash (SHA-256 first 32 chars):
["requestParams", "responseBody"]

// Safe to persist:
["requestHash", "responseStatus", "httpStatus", "durationMs",
 "soapAction", "retryCount", "errorCode", "avgLatencyMs"]
```

---

## Observability

Audit events emitted to stderr as single-line JSON prefixed with `[DIAN_SYNC_AUDIT]`:

| Event | When |
|-------|------|
| `SYNC_STARTED` | Job created, operation dispatched |
| `SYNC_COMPLETED` | Operation succeeded |
| `SYNC_FAILED` | Terminal failure after all attempts |
| `SYNC_SKIPPED` | Concurrent lock held by another job |
| `SYNC_RETRY` | Transient failure, retrying |
| `SOAP_FAULT` | DIAN returned a SOAP Fault element |
| `HTTP_TIMEOUT` | AbortController timeout |
| `CERT_EXPIRED` | Certificate is past validUntil |
| `CERT_EXPIRING_SOON` | Certificate expires within 30 days |
| `VAULT_DENIED` | SecureVault rejected role-based access |
| `VAULT_ERROR` | SecureVault read/decrypt failure |
| `TENANT_NOT_FOUND` | No DIAN Integration for the org |

All events include: `organizationId`, `operation`, `environment`, `syncJobId`, `at` (ISO timestamp).
Never include: signed XML, private keys, vault URIs, raw error messages with embedded tokens.

---

## Internal API Endpoint

`POST /api/internal/dian/sync`

```
Auth:    x-internal-cron-secret header OR ?secret= query param
         → INTERNAL_CRON_SECRET env var
Runtime: nodejs
Timeout: 60s (maxDuration)
```

Request body:
```json
{
  "organizationId": "org_xxx",
  "environment":    "habilitacion",
  "operation":      "GetAcquirer",
  "payload":        { "identificationType": 31, "identificationNumber": "3199991" },
  "traceId":        "optional-trace-id"
}
```

Response (always HTTP 200 — application-level outcomes):
```json
{
  "success":    true,
  "syncJobId":  "cuid...",
  "status":     "succeeded",
  "durationMs": 1234
}
```

Error cases return `{ "success": false, "status": "failed"|"skipped", "error": "summary" }`.

---

## Fiscal Memory

Tracks per-operation, per-environment sync health:

- **Rolling latency buffer**: last 20 samples (ring buffer)
- **P99 approximation**: max of the last 20 samples
- **Counters**: `successCount`, `failureCount` (cumulative)
- **Last error code**: code only, no raw message
- **Cert expiry**: populated when `parseCertificateFromBuffer()` succeeds

Updated atomically after every sync job completion via `Integration.metaJson`.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | DianSyncJob / DianSyncResult / DianSyncFailure / DianSyncMetadata types | ✅ `dian-sync-types.ts` |
| 2 | DianSyncStatus / DianSyncOperation union types | ✅ `dian-sync-types.ts` |
| 3 | DianSyncRetryPolicy with retryable / non-retryable classification | ✅ `dian-sync-types.ts` |
| 4 | DianXmlSafetyPolicy declarative constant | ✅ `dian-sync-types.ts` |
| 5 | DianFiscalMemory type + DianFiscalMemoryEntry (ring buffer) | ✅ `dian-sync-types.ts` |
| 6 | Typed operation registry (GetAcquirer live + 5 future ops) | ✅ `dian-sync-registry.ts` |
| 7 | `SendBillSync` no-retry policy (double-submit risk) | ✅ `dian-sync-registry.ts` |
| 8 | 11 structured audit event types + sanitized message builder | ✅ `dian-sync-observability.ts` |
| 9 | Rolling latency buffer + P99 approximation + counter tracking | ✅ `dian-sync-fiscal-memory.ts` |
| 10 | Fiscal memory stored in Integration.metaJson (no new Prisma model) | ✅ `dian-sync-fiscal-memory.ts` |
| 11 | Concurrency gate (RUNNING SyncJob check before create) | ✅ `dian-sync-orchestrator.ts` |
| 12 | Request hash (SHA-256 idempotency token) | ✅ `dian-sync-orchestrator.ts` |
| 13 | Full 10-step pipeline with retry loop | ✅ `dian-sync-orchestrator.ts` |
| 14 | Per-tenant isolated DianClient.forTenant() | ✅ `dian-sync-orchestrator.ts` |
| 15 | Never logs signed XML, private keys, vault URIs | ✅ observability sanitizer |
| 16 | Internal POST endpoint with INTERNAL_CRON_SECRET auth | ✅ `route.ts` |
| 17 | `export const runtime = "nodejs"` + `maxDuration = 60` | ✅ `route.ts` |
| 18 | Always returns HTTP 200 — application-level outcome in body | ✅ `route.ts` |
| 19 | Zero new TypeScript errors | ✅ 162 → 162 |

---

## What Was NOT Implemented

- `GetStatus`, `GetStatusZip`, `SendBillAsync`, `SendBillSync`, `SendTestSetAsync` — scaffolded in registry, not wired in DianClient
- Certificate expiry auto-population in fiscal memory (requires successful PKCS#12 parse call)
- Vercel Cron schedule configuration (`vercel.json` entry)
- Multi-org batch sync endpoint (trigger sync for all orgs in a group)
- Tenant migration script (v1 → v2 SecureVault envelopes for DIAN integration)
- Alert escalation on repeated sync failures (requires alert layer integration)

---

## What Was NOT Touched

- SAG connector layer — zero modifications
- Reconciliation — zero modifications
- Financial memory (`/api/internal/financial-memory`) — zero modifications
- Executive dashboards — zero modifications
- Prisma schema — zero modifications
- Marketing studio — zero modifications

---

## Next Sprint Recommendation

**AGENTIK-DIAN-OPERATIONS-01 — Live GetAcquirer + Habilitación Validation**

Prerequisites:
- A valid DIAN habilitación `.p12` certificate for at least one tenant
- Tenant `Integration` row with `configJson` (v1) + `secretsJson` (v2 SecureVault) configured

Steps:
1. Seed Castillitos with DIAN habilitación `Integration` row
2. POST to `/api/internal/dian/sync` with `operation: "GetAcquirer"` + DIAN test NIT range (3199991–31999910)
3. Verify SyncJob record created + status SUCCEEDED
4. Verify fiscal memory updated in `Integration.metaJson`
5. Implement `GetStatus` + `SendTestSetAsync` (same signing layer, same orchestrator)
6. Implement certificate expiry auto-population in `recordSyncOutcome()`
