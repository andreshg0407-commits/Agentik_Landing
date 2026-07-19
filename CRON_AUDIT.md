# CRON_AUDIT.md

**Sprint:** INVENTARIO-CRON-RECOVERY-01
**Date:** 2026-07-07
**Scope:** All Vercel Cron endpoints in `app/api/cron/`

---

## Cron endpoints audited

| Route | Schedule | maxDuration | Purpose |
|---|---|---|---|
| `/api/cron/inventory-refresh` | `0 5 * * *` (daily 5AM UTC) | 300s | SAG PIL sync + PD recon + CCS snapshot |
| `/api/cron/data-sync` | every 6h | 300s | SAG + CRM connector sync |
| `/api/cron/finance/runtime` | every 30m | 300s | Financial runtime generation |
| `/api/cron/video-render` | every 2m | 300s | Video render worker |

## Auth mechanism audit

**Vercel Cron behavior:** Vercel sends `Authorization: Bearer <CRON_SECRET>` header on every cron invocation. The env var used is `CRON_SECRET` (Vercel's standard name).

**Pre-fix auth checks (all 4 routes):**

| Check | Supported? |
|---|---|
| `x-internal-cron-secret` header | Yes |
| `?secret=` query param | Yes |
| `Authorization: Bearer` header | **NO** |

All 4 cron routes were silently returning 401 to Vercel because none checked the `Authorization: Bearer` header.

## Pipeline health audit

| Component | Status |
|---|---|
| `refreshInventoryPipeline()` | HEALTHY — executes in ~140s |
| SAG SOAP query (variant inventory) | HEALTHY — returns 4,118 products |
| PIL upsert (ProductInventoryLevel) | HEALTHY — 1,819 levels updated |
| CCS persist (CommercialCoverageSnapshot) | HEALTHY — 3,071 refs written |
| Prisma models / schema | HEALTHY — no schema issues |
| vercel.json cron config | CORRECT — path and schedule valid |

## Database freshness (pre-recovery)

| Table | Last update | Age at audit |
|---|---|---|
| ProductInventoryLevel.syncedAt | 2026-06-30 | 7 days stale |
| CommercialCoverageSnapshot.snapshotAt | 2026-06-30 | 7 days stale |
| ConnectorRun (inventory-related) | Manual triggers only | No cron-originated runs found |

## Database freshness (post-recovery)

| Table | Last update |
|---|---|
| ProductInventoryLevel.syncedAt | 2026-07-07 |
| CommercialCoverageSnapshot.snapshotAt | 2026-07-07 |

Pipeline was manually executed via `scripts/debug-inventory-refresh.ts` to restore freshness while the auth fix is deployed.
