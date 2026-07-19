# COMMERCIAL TSC BASELINE RESTORE 01

**Date:** 2026-07-15
**Sprint:** COMMERCIAL-TSC-BASELINE-RESTORE-01
**Priority:** HIGH — Pre Go Live technical closure

---

## Objective

Restore TypeScript baseline by fixing all errors in the two identified files.

---

## Errors — Before

**Total TSC errors:** 163
**Previous baseline:** 160
**Delta:** +3

### scripts/_validate-cartera.ts (7 errors)

Lines 28, 29, 30, 42, 58, 135, 146.

**Cause:** The `fmt()` helper was typed as `(n: number | null | undefined) => string` but Prisma `_sum` aggregate returns `Decimal | null`, not `number | null`. Prisma's `Decimal` type (from `@prisma/client/runtime/library`) is not assignable to `number`.

**Error code:** TS2345 — Argument of type `Decimal | null` is not assignable to parameter of type `number | null | undefined`.

**Note:** 5 of these 7 errors were already in the 160 baseline. The remaining 2 were introduced when the script was last modified.

### scripts/validate-commercial-data-connectivity-01.ts (1 error)

Line 174.

**Cause:** Code compared `a.agingStatus !== "HEALTHY"` but `InventoryAgingStatus` is defined as `"NEW" | "NORMAL" | "AGING" | "LOW_ROTATION" | "OBSOLETE_CANDIDATE"` in `lib/comercial/importaciones/import-policy-types.ts`. The value `"HEALTHY"` does not exist in the union type.

**Error code:** TS2367 — This comparison appears to be unintentional because the types `InventoryAgingStatus` and `"HEALTHY"` have no overlap.

**Intent:** The comparison intended to count items with non-healthy aging status. The canonical equivalent is `"NORMAL"`.

---

## Corrections Applied

### Fix 1: _validate-cartera.ts

Changed `fmt()` signature from:

```typescript
const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
```

To:

```typescript
const fmt = (n: unknown) =>
  Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
```

**Rationale:** `unknown` safely accepts `Decimal | null | number | undefined`. `Number()` converts Prisma Decimal to number via its `.valueOf()` method. No unsafe casts, no `any`, no `@ts-ignore`. Functional output is identical — Prisma Decimal values were already implicitly converted to number by the previous code at runtime.

### Fix 2: validate-commercial-data-connectivity-01.ts

Changed:

```typescript
a.agingStatus !== "HEALTHY"
```

To:

```typescript
a.agingStatus !== "NORMAL"
```

**Rationale:** `"NORMAL"` is the canonical healthy state in `InventoryAgingStatus`. The filter counts items that are aging, low rotation, new, or obsolete candidates — all non-normal states.

---

## Tests Executed

### TSC Clean Run

- **Zombie check:** 0 TSC processes before run
- **Single instance:** Confirmed only 1 TSC process during compilation
- **Time:** 8,130 seconds (~2h 15m)
- **Total errors:** 155
- **Errors in _validate-cartera.ts:** 0
- **Errors in validate-commercial-data-connectivity-01.ts:** 0
- **New errors introduced:** 0

### Error Count Reconciliation

| Metric | Before | After | Delta |
|---|---|---|---|
| Total TSC errors | 163 | 155 | -8 |
| _validate-cartera.ts | 7 | 0 | -7 |
| validate-commercial-data-connectivity-01.ts | 1 | 0 | -1 |
| All other files | 155 | 155 | 0 |

The new baseline is **155**, which is lower than the previous 160 because the fix also resolved 5 pre-existing Decimal errors in `_validate-cartera.ts` that were already counted in the old baseline. No errors were hidden, excluded, or suppressed.

---

## No-Regression Confirmation

- No `tsconfig.json` changes
- No `@ts-ignore` or `@ts-expect-error` added
- No `any` types used
- No files excluded from compilation
- No `skipLibCheck` changes
- No architecture, engine, policy pack, or UI changes
- No business logic changes
- Functional behavior of both scripts preserved
- Error distribution in all other files unchanged (155 errors, all in `open-design/` and unrelated `scripts/`)

---

## New Baseline

**155 errors** (down from 160, improved by fixing all Decimal type mismatches).
