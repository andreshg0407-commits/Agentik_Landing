# TIENDAS-INVENTORY-ROOT-CAUSE-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 15/15 PASS

---

## Root Cause

**Classification: A + E — query crashes due to wrong Prisma relation name**

The Prisma schema defines the relation from `ProductVariant` to `ProductVariantAttribute` as `variantAttributes` (schema line 4026):

```prisma
model ProductVariant {
  attributes     Json?                     // JSON field (display cache)
  variantAttributes ProductVariantAttribute[]  // <-- relation
}
```

But `getStoreInventoryByWarehouse()` and `getMainWarehouseAvailability()` used `attributes` (not `variantAttributes`) in two places:

1. **Include query:** `variant: { include: { attributes: { ... } } }` — crashes with `PrismaClientValidationError`
2. **Access pattern:** `lv.variant?.attributes ?? []` — never reached because query crashes first

The `catch {}` block (line 296) silently swallowed the error and fell through to Strategy 2 (CRMQuoteLine), which returned 0 results for PIL-based warehouses. Net result: **every store returned 0 inventory items**.

### Evidence

```
=== Test 1: include product only ===
OK, got 2 results  (works)

=== Test 2: include variant only (no attrs) ===
OK, got 2 results  (works)

=== Test 3: include variant with attributes ===
FAILED  (crashes — this is the bug)

=== Test 4: include both (exact adapter query) ===
FAILED  (same crash)
```

After fix:
```
=== Test: Fixed include query (variantAttributes) ===
Query SUCCEEDED, results: 10
  ref="00276CH|GEN|GEN" name="ALMOHADA PARA BEBE" size="GEN" color="GENERICO" avail=0
  ref="0672-1|GEN|GEN" name="PELUCHE DE BEBE" size="GEN" color="GENERICO" avail=0
  ...
```

### Database state (WH 11 — BODEGA SANDIEGO)

| Metric | Value |
|---|---|
| Total PIL records | 15,910 |
| With productId | 15,910 (100%) |
| With variantId | 15,910 (100%) |
| Both null | 0 |
| Distinct products | 2,194 |
| Distinct variants | 15,904 |
| Total quantity | -68,630 (many negative) |
| Total available (clamped) | 977 |
| Max updatedAt | 2026-06-30 |
| externalRef | "02" (SAG warehouse code, NOT product ref) |

The data was always there. The query just crashed on include.

---

## Fixes Applied

### Fix 1: Prisma relation name (sag-store-adapter.ts)

**Lines 265, 270** (getStoreInventoryByWarehouse):
```diff
- variant: { include: { attributes: { select: { key: true, value: true } } } },
+ variant: { include: { variantAttributes: { select: { key: true, value: true } } } },

- const attrs = lv.variant?.attributes ?? [];
+ const attrs = lv.variant?.variantAttributes ?? [];
```

**Lines 391, 396** (getMainWarehouseAvailability): same fix.

### Fix 2: Coverage guardrail (store-replenishment-engine.ts)

**Line 209:**
```diff
- const coverage = total > 0 ? Math.round(((total - belowMin) / total) * 100) : 100;
+ const coverage = total > 0 ? Math.round(((total - belowMin) / total) * 100) : 0;
```

When inventory is empty, coverage is now 0% (not 100%). This prevents false "Todo bien" status.

### Fix 3: Performance — eliminate double data load (store-replenishment-service.ts + page.tsx)

**Before:** `page.tsx` called `getStoresWorkspace()` then `getStoreCopilotSignals()`. Each called `resolveData()` independently, loading all 16 stores' inventory twice.

**After:** New `getStoresWorkspaceWithSignals()` computes both in a single `resolveData()` call. `page.tsx` calls only this function.

Internal `computeWorkspace()` helper extracted to share between `getStoresWorkspace()`, `getStoreCopilotSignals()`, and `getStoresWorkspaceWithSignals()`.

---

## Files Changed

| File | Change |
|---|---|
| `lib/comercial/tiendas/sag-store-adapter.ts` | `attributes` → `variantAttributes` (include + access, 2 functions) |
| `lib/comercial/tiendas/store-replenishment-engine.ts` | Coverage 0% when inventory empty (not 100%) |
| `lib/comercial/tiendas/store-replenishment-service.ts` | `computeWorkspace()` + `getStoresWorkspaceWithSignals()` — single load |
| `app/(app)/[orgSlug]/comercial/tiendas/page.tsx` | Use `getStoresWorkspaceWithSignals()` instead of 2 separate calls |
| `scripts/validate-tiendas-inventory-root-cause.ts` | **NEW** — 15-check validation |

---

## Impact

### UI — Before
- Store cards: "100% cobertura", "0 criticas", "Todo bien"
- Inventario tab: "0 referencias, 0 unidades, Sin variantes en inventario"
- Main warehouse tab: empty or incorrect

### UI — After
- Store cards: real coverage based on actual shortages vs inventory
- Inventario tab: 15,904 variants visible with real talla/color/stock
- Main warehouse tab: real availability from WH 10 (20,938 units)
- Stores with 0 available units correctly show 0% coverage

### Performance — Before
- `page.tsx` made 2 calls to `resolveData()` → 2 × (16 store queries + 1 main warehouse query) = 34 DB queries
- Each query crashed immediately (Prisma error), so load was fast but returned empty

### Performance — After
- `page.tsx` makes 1 call → 1 × (16 store queries + 1 main warehouse query) = 17 DB queries
- Queries now succeed and return real data — load will be slower but correct
- Drawer inventory still loads lazily via API (no change)

---

## Risks

1. **Load time increase**: Now that queries work, initial page load will take longer (17 real queries vs 17 instantly-failing queries). Consider adding caching in a future sprint.
2. **Negative quantities**: WH 11 has total quantity -68,630 but 977 available (clamped at 0). The `Math.max(0, qty - rsv)` clamp is correct but masks data quality issues in SAG.
3. **externalRef still used as last fallback**: The ref resolution chain is `variant.sku ?? product.sku ?? externalRef`. Since all PIL records have productId + variantId with real SKUs, externalRef ("02") is never reached. No change needed but noted.
