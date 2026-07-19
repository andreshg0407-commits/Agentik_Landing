# FIX_APPLIED.md

**Sprint:** INVENTARIO-CRON-RECOVERY-01
**Date:** 2026-07-07

---

## Fix summary

Added `Authorization: Bearer` token check to the `isAuthorized()` function in all 4 cron routes. The fix checks both `INTERNAL_CRON_SECRET` and `CRON_SECRET` (Vercel's standard env var name) against the Bearer token.

## Code change (identical pattern in all 4 files)

```typescript
// BEFORE — only checked custom header and query param
function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;
  return false;
}

// AFTER — also checks Authorization: Bearer (Vercel Cron standard)
const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (CRON_SECRET && token === CRON_SECRET) return true;
    if (VERCEL_CRON_SECRET && token === VERCEL_CRON_SECRET) return true;
  }
  return false;
}
```

## Files modified

| File | Change |
|---|---|
| `app/api/cron/inventory-refresh/route.ts` | Added `VERCEL_CRON_SECRET` const + Bearer check |
| `app/api/cron/data-sync/route.ts` | Added `VERCEL_CRON_SECRET` const + Bearer check |
| `app/api/cron/finance/runtime/route.ts` | Added `VERCEL_CRON_SECRET` const + Bearer check |
| `app/api/cron/video-render/route.ts` | Added `VERCEL_CRON_SECRET` const + Bearer check |

## Immediate recovery action

Pipeline was manually executed via `scripts/debug-inventory-refresh.ts` to restore data freshness while waiting for deployment of the auth fix.

## Evidence

| Metric | Before | After |
|---|---|---|
| PIL max syncedAt | 2026-06-30 | 2026-07-07 |
| CCS max snapshotAt | 2026-06-30 | 2026-07-07 |
| Products processed | — | 4,118 |
| Variants updated | — | 53,332 |
| PIL levels updated | — | 1,819 |
| CCS refs written | — | 3,071 |
| Pipeline duration | — | ~140s |

## Deployment requirement

Ensure `CRON_SECRET` env var is set in Vercel dashboard. Vercel automatically injects this as `Authorization: Bearer <CRON_SECRET>` on cron invocations. If only `INTERNAL_CRON_SECRET` is set, set `CRON_SECRET` to the same value.

## TSC verification

TSC baseline: **160 errors** (unchanged). Zero regressions introduced.
