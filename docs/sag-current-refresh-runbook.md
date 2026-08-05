# SAG CURRENT Data Refresh — Operational Runbook

**Sprint:** AGENTIK-SAG-CURSOR-RESET-01 + AGENTIK-CRON-HEALTH-01 + AGENTIK-SAG-SUBDAILY-AUTO-REFRESH-01
**Tenant:** Castillitos
**Source DB:** INDDIANAA_INDU-LUDISAM (CURRENT)

---

## Architecture: Primary + Fallback

| Layer | Platform | Schedule | Role |
|---|---|---|---|
| **Primary** | n8n Cloud | 5x daily (COT) | Sub-daily refresh with retry + alerting |
| **Fallback** | Vercel Cron | 1x daily (UTC) | Safety net — runs even if n8n is down |

Both layers call the same production API routes. SaleRecord upsert idempotency (`@@unique([organizationId, naturalKey])`) ensures overlapping runs are safe.

---

## Primary: n8n Workflow

| Field | Value |
|---|---|
| Workflow name | SAG CURRENT Sub-Daily Refresh — Castillitos |
| Workflow ID | `XR8u2zKG9aGPzdX7` |
| Project | AGENTIC (team) |
| Timezone | America/Bogota |
| Schedule | 08:00, 11:00, 14:00, 17:00, 20:00 COT |
| Retry policy | 1 retry after 5-minute wait (explicit Wait node) |
| Failure notification | Telegram (failure-only, no success spam) |
| Concurrency guard | Data Table mutex (`sag_refresh_lock`) |

### Execution Chain

```
Schedule (5x COT)
  → Read Lock → Lock Active?
    → [locked] → Skip (NoOp)
    → [unlocked] → Acquire Lock
      → SAG Data Sync (270s timeout)
        → OK? → Inventory Refresh (120s timeout)
          → OK? → Release Lock (silent success)
          → FAIL → Wait 5m → Retry Inventory
            → OK? → Release Lock
            → FAIL → Telegram Alert → Release Lock
        → FAIL → Wait 5m → Retry SAG
          → OK? → Inventory Refresh (shared path)
          → FAIL → Telegram Alert → Release Lock
```

### API Routes Called

| Step | Method | URL | Auth Header |
|---|---|---|---|
| SAG Data Sync | GET | `https://<production-domain>/api/cron/data-sync?source=sag_pya_soap` | `x-internal-cron-secret` |
| Inventory Refresh | GET | `https://<production-domain>/api/cron/inventory-refresh` | `x-internal-cron-secret` |

Both routes return `{ok: true/false}`. The workflow gates on `$json.ok === true`.

### Manual Execution via n8n

1. Open workflow `XR8u2zKG9aGPzdX7` in n8n Cloud
2. Click "Test workflow" — runs the full chain immediately
3. Check execution log for node-by-node results

### Inspecting Execution History

In n8n Cloud: Workflow > Executions tab. Each execution shows:
- Which nodes ran
- HTTP response from each API call
- Whether retry path was triggered
- Telegram notification (if failure)

---

## Fallback: Vercel Cron

| Entry | Schedule | Path |
|---|---|---|
| SAG data-sync | Daily 04:30 UTC | `GET /api/cron/data-sync?source=sag_pya_soap` |
| Inventory refresh | Daily 05:00 UTC | `GET /api/cron/inventory-refresh` |

Platform: Vercel Cron (Hobby — daily maximum frequency).
Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

The Vercel cron remains configured in `vercel.json` as a safety net. It runs at 04:30 UTC (11:30 PM COT), well outside n8n's 08:00-20:00 COT window. Even if n8n is completely down, data is refreshed at least once per day.

---

## How to Verify Last Success

Query the most recent ConnectorRun for the movements module:

```sql
SELECT status, "rowsImported", "startedAt"::text, "cursorAfter"
FROM "ConnectorRun"
WHERE "connectorId" = 'cmnhu4hky0000n4y50jlhkfib'
AND module = 'movements'
ORDER BY "startedAt" DESC
LIMIT 1;
```

**Expected healthy state (with n8n primary):**
- `status = 'SUCCESS'`
- `cursorAfter` starts with `date:` and date <= today
- `startedAt` within last 4 hours (during business hours) or within last 12 hours (overnight)

**Expected healthy state (Vercel fallback only):**
- `startedAt` within last 25 hours

---

## Expected ConnectorRun State

| Field | Normal value |
|---|---|
| status | SUCCESS |
| rowsRead | 0 (incremental, no new docs) or N (new docs since last cursor) |
| rowsImported | Same as rowsRead |
| rowsErrored | 0 |
| cursorAfter | `date:YYYY-MM-DDTHH:MM:SS.000Z` (never future-dated) |
| duration | ~160s (SAG SOAP fetch ~150s + DB write) |

---

## Emergency Manual Refresh

If both n8n and Vercel cron have stopped, invoke the production route manually:

```bash
curl -fsS \
  -H "x-internal-cron-secret: $INTERNAL_CRON_SECRET" \
  "https://<production-domain>/api/cron/data-sync?source=sag_pya_soap"
```

Or per-connector via the org API (requires authenticated session):

```
POST /api/orgs/castillitos/connectors/cmnhu4hky0000n4y50jlhkfib/sync
Body: {"module":"movements"}
```

**Required env:** `INTERNAL_CRON_SECRET` (for cron route) or session auth (for org route).

---

## How to Recognize Stale Data

**Backend:** `store-product-intelligence-engine.ts` computes `dataLagDays` from the latest StoreSaleLineRecord date. If > 3 days, status = `PARTIAL_DATA`.

**UI (Tiendas):** The presentation layer shows:
> "Datos parciales: ventas sincronizadas al {date} ({N} dias de atraso)"

**Quick SQL check:**

```sql
SELECT MAX("saleDate")::text as latest_sale,
       NOW()::date - MAX("saleDate")::date as lag_days
FROM "SaleRecord"
WHERE "organizationId" = '<orgId>'
AND "comprobanteCode" IN ('FG','NG','FC','NT','FD','NS','FA','NA');
```

With n8n sub-daily refresh: `lag_days > 1` is suspicious.
With Vercel fallback only: `lag_days > 2` is suspicious.

---

## Safety Guards

1. **Future-date cursor guard:** Documents with `saleDate > today` are excluded from the movement cache. They cannot be persisted as SaleRecords and cannot advance the cursor.
2. **Upsert idempotency:** All SaleRecords use `@@unique([organizationId, naturalKey])` — safe to re-run multiple times per day.
3. **Source routing:** The cron route passes `configOverrides: { sagSource: "CURRENT" }` to ensure LUDISAM database is used.
4. **Concurrency guard (n8n):** Data Table mutex `sag_refresh_lock` prevents overlapping executions. If a run is still in progress when the next schedule fires, the new execution skips silently.
5. **Retry with backoff (n8n):** Each API call gets one retry after a 5-minute wait. Only persistent failures trigger Telegram alerts.
