# SAG CURRENT Data Refresh — Operational Runbook

**Sprint:** AGENTIK-SAG-CURSOR-RESET-01 + AGENTIK-CRON-HEALTH-01
**Tenant:** Castillitos
**Source DB:** INDDIANAA_INDU-LUDISAM (CURRENT)

---

## Automatic Schedule

| Entry | Schedule | Path |
|---|---|---|
| SAG data-sync | Daily 04:30 UTC | `GET /api/cron/data-sync?source=sag_pya_soap` |
| Inventory refresh | Daily 05:00 UTC | `GET /api/cron/inventory-refresh` |

Platform: Vercel Cron (Hobby — daily maximum frequency).
Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

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

**Expected healthy state:**
- `status = 'SUCCESS'`
- `cursorAfter` starts with `date:` and date <= today
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

If automatic sync has stopped, invoke the same production route manually:

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
> "Datos parciales: ventas sincronizadas al {date} ({N} días de atraso)"

**Quick SQL check:**

```sql
SELECT MAX("saleDate")::text as latest_sale,
       NOW()::date - MAX("saleDate")::date as lag_days
FROM "SaleRecord"
WHERE "organizationId" = '<orgId>'
AND "comprobanteCode" IN ('FG','NG','FC','NT','FD','NS','FA','NA');
```

If `lag_days > 2`: sync may have stopped.

---

## Safety Guards

1. **Future-date cursor guard:** Documents with `saleDate > today` are excluded from the movement cache. They cannot be persisted as SaleRecords and cannot advance the cursor.
2. **Upsert idempotency:** All SaleRecords use `@@unique([organizationId, naturalKey])` — safe to re-run.
3. **Source routing:** The cron route passes `configOverrides: { sagSource: "CURRENT" }` to ensure LUDISAM database is used.
