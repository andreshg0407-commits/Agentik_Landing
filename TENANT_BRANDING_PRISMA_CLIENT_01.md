# TENANT-BRANDING-PRISMA-CLIENT-01 -- Hotfix Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

Saving branding produced:

```
Cannot read properties of undefined (reading 'upsert')
```

## Root Causes

### 1. Migrations not applied
Two migrations were pending on the database:
- `20260714000000_sag_write_source_ref_unique`
- `20260715000000_organization_branding`

The `OrganizationBranding` table did not exist in the database.

### 2. No defensive check before calling Prisma delegate
`upsertOrganizationBranding()` called `db().upsert()` where `db()` was
`(prisma as any).organizationBranding`. If the delegate was undefined
(stale cached PrismaClient in dev, or missing migration), the call
crashed with a cryptic "Cannot read properties of undefined" error.

### 3. Silent failure masking in reads
`getOrganizationBranding()` had a try/catch that silently returned
fallback data when the delegate was undefined or the table was missing.
This made the page appear to work (showing defaults) while writes crashed.

---

## Fixes

### Migration applied
```
npx prisma migrate deploy
```
Both pending migrations now applied. `OrganizationBranding` table exists.

### Defensive delegate accessor (`branding.ts`)

```typescript
function db() {
  const delegate = (prisma as any).organizationBranding;
  if (!delegate) {
    throw new Error(
      "Prisma Client no tiene el modelo OrganizationBranding. " +
      "Ejecuta: npx prisma generate && npx prisma migrate dev, luego reinicia el servidor.",
    );
  }
  return delegate;
}
```

- `upsertOrganizationBranding()` calls `db()` which throws with a clear message
- `getOrganizationBranding()` checks delegate separately and returns fallback if missing
- The error message tells the developer exactly what commands to run

### Recovery steps for future occurrences
If "Prisma Client no tiene el modelo OrganizationBranding" appears:
1. `npx prisma generate` — regenerate client with latest schema
2. `npx prisma migrate dev` — apply pending migrations
3. Restart dev server (`npm run dev`) — clear cached global PrismaClient

---

## Files Modified

| File | Change |
|------|--------|
| `lib/tenant/branding.ts` | Defensive `db()` with clear error message; read path checks delegate before use |
