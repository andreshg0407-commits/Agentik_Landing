# VENDOR-SAMPLE-OP-LINKING-01

**Sprint:** VENDOR-SAMPLE-OP-LINKING-01
**Priority:** P0
**Type:** Business Logic + UI Data Contract
**Status:** COMPLETE
**Date:** 2026-07-01
**TSC Baseline:** 160 (preserved)

---

## Business Rule

> When a reference needs replacement (REEMPLAZAR), active production orders (OP) from the same SAG subgroup are a valid replacement source. OP activas sit between bodega principal candidates and production suggestions in priority.

**Replacement priority chain:**
1. Bodega principal (same subgrupo SAG) — immediate availability
2. OP activa (same subgrupo SAG) — future availability
3. Sugerir produccion (LT/CS only, when no bodega + no OP)

---

## What Changed

### Previous Model (ENGINE-01)

- `opReplacementOptions: VendorReplacementOption[]` was always `[]`
- UI showed placeholder: "OP como fuente pendiente de integracion"
- `requiresProductionSuggestion` only checked bodega options

### New Model (OP-LINKING-01)

- `opReplacementOptions: VendorOpReplacementOption[]` — real OP data from ProductionOrder
- `loadOpBySubgrupo()` queries open OPs, aggregates lines, resolves subgrupoId via ProductEntity
- OP options filtered to same subgrupoId, different reference, capped at 10
- `requiresProductionSuggestion = true` only when BOTH bodega AND OP options are empty (LT/CS)
- When OP exists but no bodega: `suggestedAction = "En produccion"`, `replacementSource = "OP activa"`

---

## OP Activa Definition

```sql
status = 'open' AND "isClosed" = false
```

Source tables: `ProductionOrder` + `ProductionOrderLine`
Subgrupo resolution: `ProductionOrderLine.referenceCode` -> `ProductEntity.sku` -> `ProductEntity.subgrupoId`

---

## New Type

```typescript
export interface VendorOpReplacementOption {
  reference: string;
  description: string;
  subgrupoId: number | null;
  subgrupoSag: string;
  line: string;
  opNumber: string;
  orderedQty: number;
  producedQty: number;
  pendingQty: number;
  createdAt: string;
  source: "op_activa";
}
```

---

## Algorithm: loadOpBySubgrupo()

```
1. Query open ProductionOrders with their lines
2. GROUP BY referenceCode, documentNumber, productName, documentDate
3. SUM quantityOrdered per group
4. Resolve subgrupoId for each ref via ProductEntity.sku
5. Index options by subgrupoId
6. Sort each subgrupo's options by pendingQty DESC
```

## Algorithm: applyReplacements() — OP section

```
For each ref with state === "reemplazar":
  opOptions = opOptionsBySubgrupoId.get(ref.subgrupoId)
    .filter(o => o.reference !== ref.reference)
    .slice(0, 10)

  if (bodegaOptions.length === 0 && opOptions.length > 0):
    suggestedAction = "En produccion"
    replacementSource = "OP activa"

  requiresProductionSuggestion = true
    ONLY WHEN bodegaOptions.length === 0
    AND opOptions.length === 0
    AND (line === "LT" || line === "CS")
```

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-types.ts` | Added `VendorOpReplacementOption` interface |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Added `loadOpBySubgrupo()`, updated `applyReplacements()` with OP index + production logic |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | OP table in `ReplacementDetailPanel` (amber accent), `formatDate()` helper |

---

## UI Changes

### ReplacementDetailPanel — OP Section

- **Header:** "OP activas del mismo subgrupo" (amber accent)
- **Table columns:** OP, Referencia, Descripcion, Subgrupo SAG, Pendiente, Fecha
- **Empty state:** "Sin OP activa del mismo subgrupo"
- **Color scheme:** amber accent (vs blue for bodega principal)

---

## Validation Results

20 REEMPLAZAR refs sampled, 20/20 PASS (100% accuracy).

| Metric | Value |
|---|---|
| Total REEMPLAZAR refs | 100 |
| With OP options (same subgrupo) | 60 (60%) |
| Subgrupos with OP | 105 |
| Open OP lines (aggregated) | 3,352 |
| OP refs with subgrupo resolved | 2,083 (82% match rate) |
| IMPORT in production suggestions | 0 (correct) |

### Checks verified per ref:
1. OP options only from same subgrupoId
2. All OP documentNumbers verified as open (status=open, isClosed=false)
3. No cross-subgrupo contamination
4. No production suggestion when OP or bodega exists
5. IMPORT excluded from production suggestions

---

## Data Flow

```
ProductionOrder (open, !isClosed)
  -> ProductionOrderLine (referenceCode, quantityOrdered)
    -> ProductEntity (sku -> subgrupoId)
      -> Map<subgrupoId, VendorOpReplacementOption[]>
        -> applyReplacements() filters by ref.subgrupoId
          -> ref.opReplacementOptions
```

---

## Limitations

- `producedQty` is always 0 (ET reconciliation not yet integrated)
- `pendingQty` = `orderedQty` (no ET offset)
- OP closed detection relies on `isClosed` boolean + `status` field
- Refs without ProductEntity match (18%) are excluded from OP linking

## NOT Touched

- Presence Engine F34
- Ledger
- Backfill scripts
- Migrations
- SAG sync base
- State derivation rules (2-state model)
- Bodega principal replacement engine (ENGINE-01)
