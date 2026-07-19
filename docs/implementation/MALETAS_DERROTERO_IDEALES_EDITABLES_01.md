# MALETAS-DERROTERO-IDEALES-EDITABLES-01

**Status:** COMPLETE
**Validated by:** User (manual visual validation in authenticated environment)
**Date:** 2026-07-16

## Objective

Allow inline editing of IDEAL values per derrotero row. Formula: `idealEffective = customIdeal ?? officialIdeal`. Persist by tenant. Show confirmation popup. Support restore to official. Full recalculation after save. Audit trail.

## Deliverables

### Backend

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `AssortmentIdealOverride` model with unique constraint `[organizationId, catalogId, groupCode, subgroupCode]` |
| `prisma/migrations/20260717000000_assortment_ideal_overrides/migration.sql` | Manual migration (shadow DB conflict prevented `prisma migrate dev`). Applied via `prisma migrate deploy`. |
| `lib/comercial/maletas/maletas-functional-evaluation.ts` | Added `IdealOverrideMap` type, `idealOverrideKey()` helper, `officialIdeal` and `isCustomIdeal` fields on `AssortmentEntryEval`. `evaluateCatalog()` applies overrides: `idealEffective = (override ?? entry.targetUnits)`. |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Loads overrides from `db.assortmentIdealOverride.findMany()` before evaluation, passes `idealOverrides` map to `evaluateVendorAssortment()`. |
| `app/api/orgs/[orgSlug]/comercial/maletas/ideal-overrides/route.ts` | NEW. GET/POST/DELETE endpoints. POST upserts with validation (non-negative integer). DELETE removes override (restores official). Auth via `requireOrgAccess`. |

### Frontend (`maletas-client.tsx`)

| Feature | Implementation |
|---|---|
| Click-to-edit | Click ideal number opens inline `<input type="number">`. Enter to confirm, Escape to cancel. |
| Confirmation modal | Fixed overlay. Save: "pasara de ideal X a Y, afecta solo este tenant". Restore: "volvera al ideal oficial". |
| Custom indicator | Custom ideals in amber with dashed underline + `↩` restore icon. |
| Restore official | Click `↩` opens restore confirmation, DELETE API call. |
| Optimistic update | `applyIdealOverride()` recalculates delta/complete/excess/group%/catalog% locally. |
| Feedback toast | Reuses existing toast for success/error messages. |
| Audit trail | API stores `updatedBy` (user ID) and `updatedAt` automatically. |

### Helper function

`applyIdealOverride()` — Pure function that optimistically recalculates the entire `VendorAssortmentResult` tree (entry delta/complete/excess, group completion, catalog totals and overall completion) after a save or restore, without requiring a server round-trip.

## Validation

Validated manually by user in authenticated environment:

- Inline editing works
- Confirmation popup works
- Cancel does not modify data
- Save persists correctly
- Coverage/faltan/exceso recalculate immediately
- Page refresh preserves changes
- Restore to official value works
- No visual regressions detected

## TSC

Zero new TypeScript errors introduced. All errors in TSC output are pre-existing (open-design TS2307, scripts/).
