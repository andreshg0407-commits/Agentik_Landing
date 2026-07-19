# MALLETS-GO-LIVE-COMPLETION-01

**Sprint**: P0 Go Live
**Status**: Complete
**Date**: 2026-07-15

## Scope

Complete the Maletas module for Castillitos Go Live. All rules must work correctly when the user opens Maletas.

## Changes by Phase

### Phase 2: Vendor Activation/Deactivation

- **Activation persistence**: Reuses `VendorBagIdealRouteRule` model with `line="__ACTIVATION__"`, `subgrupoSag="__STATE__"`, `minimumRefs=1` (active) / `0` (inactive)
- **API**: `POST /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/activation` — toggles vendor state
- **UI**: VendorCard shows Activar/Desactivar button; drawer subtitle shows activation state
- **Defaults**: Orlando + Nestor = Activo, Carlos Villa + Carlos Leon = Inactivo

Files:
- `lib/comercial/maletas/vendor-bag-ideal-route-service.ts` — `loadVendorActivationOverrides()`, `setVendorActivation()`
- `lib/comercial/maletas/vendor-sample-presence-engine.ts` — `applyActivationOverrides()`
- `app/api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/activation/route.ts` — new
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` — activation toggle, filtering by `isActive`

### Phase 3: Product Enrichment

- **Fields added to VendorSampleRef**: `group`, `brand`, `sizeClass`
- **Brand resolution**: `productLine 1→Latin Kids`, `2→Castillitos`, `5→Importacion`
- **Size class**: Import refs classified as PEQUENO/MEDIANO/GRANDE from category/segment
- **UI**: Description cell shows brand, group, sizeClass as secondary line

Files:
- `lib/comercial/maletas/vendor-sample-types.ts` — added `group`, `brand`, `sizeClass` to VendorSampleRef; `isActive` to VendorSampleSnapshot
- `lib/comercial/maletas/vendor-sample-loader.ts` — `loadProductEnrichment()`, `resolveImportSizeClass()`, `BRAND_FROM_LINE`

### Phase 5: Production Thresholds

- **Batch minimums**: CS (Castillitos) = 100 units, LT (Latin Kids) = 200 units
- `suggestedQty = max(shortfall, batchMinimum)` — ensures production orders meet minimum batch sizes

Files:
- `lib/comercial/maletas/vendor-sample-loader.ts` — `PRODUCTION_BATCH_MINIMUM` constant

### Phase 8: Auto-Refresh

- 15-minute auto-refresh via `setInterval` + `window.location.reload()`
- Source indicator shows "Auto-refresh: 15 min"

Files:
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx`

### Phase 9: KPI Recalculation

- Executive summary `activeVendors` count now filters by `isActive` (not just `totalRefs > 0`)

Files:
- `lib/comercial/maletas/vendor-sample-loader.ts`

### Bug Fixes

- Fixed `vendorIsActive` used-before-declared in loader loop (empty vendors would crash)
- Moved `vendorConfig` resolution before the `if (items.length === 0)` early return

## QA Script

```bash
npx tsx scripts/test-mallets-go-live-completion-01.ts
```

## TSC Baseline

No new TypeScript errors introduced. Pre-existing baseline: 155 errors.
