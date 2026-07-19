# VENDOR-SAMPLE-REPLACEMENT-DRAWER-ACTIONS-01

**Sprint:** VENDOR-SAMPLE-REPLACEMENT-DRAWER-ACTIONS-01
**Mode:** UX FIX / NO DATA MODEL CHANGES
**Status:** COMPLETE
**Date:** 2026-07-01
**TSC Baseline:** 160 (preserved)

---

## Objective

Make the maletas drawer's REEMPLAZAR state actionable: clicking a row with state REEMPLAZAR opens an inline detail panel showing the current reference info and available replacement options.

## What Changed

### File Modified

`app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx`

### Phase 1 — Scroll

- Drawer content restructured into two zones: **sticky header** (action cards, KPIs, search, filters) and **scrollable body** (reference table).
- Table container uses `flex: 1`, `overflowY: auto`, `minHeight: 0` for proper scroll.
- Table header row uses `position: sticky; top: 0` to stay visible during scroll.
- Filter pills and results count merged into one row to reduce vertical space.

### Phase 2 — Click on REEMPLAZAR

- Added `expandedRef` state tracking which row is expanded.
- REEMPLAZAR rows have `cursor: pointer` and a chevron affordance (`>`) that rotates on expand.
- Clicking a REEMPLAZAR row toggles an inline `ReplacementDetailPanel` below the row.
- Panel shows: reference, description, subgrupo SAG, line, disponible central, minimum required.

### Phase 3 — Replacement Options

The expanded panel shows three sections:

**A. Replacement in bodega principal**
- If `replacementRef` exists: shows reference, description, disponible, source (mismo subgrupo / misma linea).
- Bordered card with blue accent.

**B. Replacements from OP**
- Static message: "OP como fuente pendiente de integracion"
- Shown always — placeholder until OP integration is wired.

**C. No replacement available**
- If no `replacementRef` and `suggestedAction === "Sugerir produccion"`: amber warning card.
- Shows: "Sin reemplazo disponible" + "Accion sugerida: Sugerir produccion".

### Phase 4 — Existing Data

Uses existing `VendorSampleRef` fields only:
- `replacementRef`, `replacementDesc`, `replacementAvailable`, `replacementSource`, `suggestedAction`
- No new data fetching or API calls.

### Phase 5 — CTA Cards

- Action cards (Reemplazar / Riesgo agotamiento / Saludables) **only filter** the list and reset `expandedRef`.
- Individual row click opens that specific reference's options.

### Phase 6 — Table

- Columns preserved: Ref, Descripcion, Subgrupo SAG, Linea, Disp., Estado.
- REEMPLAZAR rows show a chevron indicator as visual affordance.
- Expanded row has subtle blue highlight background.

## What Was NOT Touched

- Presence Engine / F34
- Subgrupo SAG enrichment
- Backfill scripts
- State derivation rules (2-state model)
- Data loader (`vendor-sample-loader.ts`)
- Types (`vendor-sample-types.ts`)
- OperationalSideDrawer component
