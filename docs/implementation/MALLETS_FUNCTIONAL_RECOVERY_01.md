# MALLETS-FUNCTIONAL-RECOVERY-01

**Sprint**: P0 Functional Recovery
**Status**: Complete
**Date**: 2026-07-15

## Scope

Correct the previous sprint (MALLETS-GO-LIVE-COMPLETION-01) which did NOT meet functional criteria.
All 9 phases must be visibly correct at `/castillitos/comercial/maletas`.

## Key Corrections

### REGLA 1: 100/200 are ACTIVATION THRESHOLDS, not batch minimums

- **Before (WRONG)**: `PRODUCTION_BATCH_MINIMUM` used 100/200 as minimum production quantities with `suggestedQty = Math.max(shortfall, batchMin)`
- **After (CORRECT)**: 100/200 are stock thresholds that trigger production suggestion. If `stock <= threshold AND no active OP -> PRODUCIR`. Implemented in `evaluateProductionThresholds()`.
- `PRODUCTION_BATCH_MINIMUM` constant REMOVED from `vendor-sample-loader.ts`

## Changes by Phase

### Phase 1: Diagnosis

Integration gaps identified:
- `evaluateMalletAssortment()` engine existed but had zero UI consumers
- 3 assortment catalogs defined but never used
- Recompra deliberately unimplemented
- DerroteroIdealPanel showed flat manual rules editor, not catalog evaluation

### Phase 2: Derrotero replaced with hierarchical catalog view

- DerroteroIdealPanel now receives `assortmentEval: VendorAssortmentResult` prop
- Shows 3 catalogs hierarchically: CS Textil (4 groups), LT Textil (6 groups), Import (3 sizes)
- Columns: Subgrupo, Ideal, Actual, Faltan, Estado
- Summary strip with Completos/Faltan/Exceso/Cobertura per catalog

### Phase 3: Import evaluation by sizeClass

- Import refs evaluated by PEQUENO=10, MEDIANO=10, GRANDE=3 targets
- Unresolved refs (no sizeClass) shown separately in derrotero panel

### Phase 4: Ref table columns

- Textil: Referencia, Descripcion, Grupo, Subgrupo, Linea, Disponible, Estado
- Import: adds Tamano column (PEQUENO/MEDIANO/GRANDE)
- Removed "brand · group · sizeClass" secondary text pattern

### Phase 5: Production by threshold

- Production section replaced with threshold-based evaluation
- Columns: Marca, Subgrupo, Stock, Umbral, OP Activa, Decision
- Decisions: PRODUCIR, ESPERAR OP, SIN ACCION, DATOS INSUFICIENTES

### Phase 6: Recompra / Baja Rotacion

- New section with import ref evaluation
- Decisions: RECOMPRAR, BAJA ROTACION, VIGILAR, SIN DATOS, OK
- Diagnostic shown when no evaluations
- LOW_ROTATION threshold: 8 months

### Phase 7: Coverage Opportunities

- Derived from derrotero faltantes, not generic "inventario sin presencia"
- Matched by exact classification (subgrupoSag for textil, sizeClass for import)

### Phase 8: KPIs from active vendors

- Executive summary counts only isActive vendors (unchanged from prior sprint)
- Validation check confirms Orlando+Nestor active, Carlos Villa+Carlos Leon inactive

### Phase 9: Visible validation

- 12-criteria PASS/FAIL section at bottom of page
- Sprint INCOMPLETE if any fail

## New Files

- `lib/comercial/maletas/maletas-functional-evaluation.ts` — 4 evaluation functions:
  - `evaluateVendorAssortment()` — per vendor, against CS/LT/Import catalogs
  - `evaluateProductionThresholds()` — brand+subgrupo threshold decisions
  - `evaluateImportRefs()` — recompra/baja rotacion
  - `findCoverageOpportunities()` — derrotero faltante-derived opportunities

## Modified Files

- `lib/comercial/maletas/vendor-sample-loader.ts` — wired evaluation pipeline, removed PRODUCTION_BATCH_MINIMUM
- `lib/comercial/maletas/vendor-sample-types.ts` — unchanged (types already existed)
- `app/(app)/[orgSlug]/comercial/maletas/page.tsx` — passes new props
- `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` — rewrote production, recompra, coverage, derrotero sections

## TSC Baseline

Pre-existing: 155 errors. No new errors introduced.
