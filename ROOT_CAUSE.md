# ROOT_CAUSE.md

**Sprint:** INVENTARIO-CRON-RECOVERY-01
**Date:** 2026-07-07

---

## Root cause

**Vercel Cron auth mismatch.** All 4 cron route handlers only checked two auth mechanisms:

1. Custom header: `x-internal-cron-secret`
2. Query parameter: `?secret=`

Vercel Cron sends authentication via a **third** mechanism: `Authorization: Bearer <CRON_SECRET>`.

Since no cron route checked the `Authorization` header, every Vercel-triggered cron invocation received a **401 Unauthorized** response. The pipeline code itself was never reached.

## Why it wasn't detected earlier

1. **No error logging on 401** — the 401 response is returned before any `console.error`, so Vercel logs show a clean 401 response, not a pipeline failure.
2. **Manual triggers worked** — the pipeline was occasionally triggered manually (via API or script), which used the `x-internal-cron-secret` header and succeeded.
3. **Silent degradation** — inventory data went stale over 7 days. The UI showed "DESACTUALIZADO" but this was treated as a freshness display bug (Sprint INVENTARIO-SYNC-FRESHNESS-01) rather than a pipeline failure.
4. **ConnectorRun table** — all successful runs were from manual triggers, not from cron. This was the key forensic signal.

## Timeline

- **~2026-06-30**: Last successful inventory refresh (manual trigger)
- **2026-06-30 to 2026-07-07**: All Vercel Cron invocations returned 401
- **2026-07-07**: Root cause identified, auth fix applied to all 4 cron routes, pipeline manually re-executed

## Affected routes

| File | Line range |
|---|---|
| `app/api/cron/inventory-refresh/route.ts` | 28-46 |
| `app/api/cron/data-sync/route.ts` | 41-59 |
| `app/api/cron/finance/runtime/route.ts` | 28-43 |
| `app/api/cron/video-render/route.ts` | 30-45 |

## Not the root cause

- Pipeline code (`refreshInventoryPipeline`) — executes correctly in ~140s
- SAG SOAP endpoint — responds with full data (4,118 products)
- Prisma schema / models — no issues
- vercel.json cron configuration — path and schedule are correct
- Environment variables — `INTERNAL_CRON_SECRET` is set correctly
