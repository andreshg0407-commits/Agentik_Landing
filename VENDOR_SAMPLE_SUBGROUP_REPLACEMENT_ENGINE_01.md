# VENDOR-SAMPLE-SUBGROUP-REPLACEMENT-ENGINE-01

**Sprint:** VENDOR-SAMPLE-SUBGROUP-REPLACEMENT-ENGINE-01
**Priority:** P0
**Type:** Business Logic + UI Data Contract
**Status:** COMPLETE
**Date:** 2026-07-01
**TSC Baseline:** 160 (preserved)

---

## Business Rule

> When a reference runs out or falls below minimum, it is NOT necessarily replaced by the same reference. It is replaced by another reference from the same SAG subgroup. The subgrupo SAG is the primary unit of replacement decision.

---

## What Changed

### Previous Model (single option)

Each REEMPLAZAR ref had one replacement candidate:
- `replacementRef` / `replacementDesc` / `replacementAvailable`
- Found by matching subgrupo name string or line fallback

### New Model (multi-option engine)

Each REEMPLAZAR ref now has up to 10 replacement candidates:
- `replacementOptions: VendorReplacementOption[]` — bodega principal candidates
- `opReplacementOptions: VendorReplacementOption[]` — OP candidates (pending integration)
- `requiresProductionSuggestion: boolean` — true only for LT/CS with zero options

Legacy single-ref fields kept for backward compatibility (deprecated).

---

## Algorithm

For each ref with `state === "reemplazar"`:

### Priority 1: Same subgrupoId (numeric FK)

```
candidates = coverageCatalog
  .filter(c => c.subgrupoId === ref.subgrupoId)
  .filter(c => c.refCode !== ref.reference)
  .filter(c => c.disponible > minimumForLine)
  .sort(sameLinePriority, disponibleDesc)
  .slice(0, 10)
```

### Priority 2 (fallback): Same line

Only when `ref.subgrupoId === null`:

```
candidates = coverageCatalog
  .filter(c => c.line === ref.line)
  .filter(c => c.refCode !== ref.reference)
  .filter(c => c.disponible > minimumForLine)
  .sort(disponibleDesc)
  .slice(0, 10)
```

### Phase 4: OP

`opReplacementOptions = []` — pending integration. UI shows "OP como fuente pendiente de integracion".

### Phase 5: Production Suggestion

```
requiresProductionSuggestion = true
  WHEN replacementOptions.length === 0
  AND opReplacementOptions.length === 0
  AND (line === "LT" || line === "CS")
```

IMPORT is excluded from production suggestions.

---

## New Type

```typescript
export type ReplacementSource = "bodega_principal" | "op_activa";

export interface VendorReplacementOption {
  reference: string;
  description: string;
  subgrupoId: number | null;
  subgrupoSag: string;
  line: string;
  available: number;
  source: ReplacementSource;
}
```

## Updated Fields on VendorSampleRef

```typescript
replacementOptions: VendorReplacementOption[];      // bodega principal (up to 10)
opReplacementOptions: VendorReplacementOption[];     // OP (pending)
requiresProductionSuggestion: boolean;               // LT/CS only, no options
```

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-types.ts` | Added `VendorReplacementOption`, `ReplacementSource`, new fields on `VendorSampleRef` |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Multi-option replacement engine by subgrupoId, MAX_REPLACEMENT_OPTIONS=10 |
| `lib/comercial/maletas/vendor-sample-service.ts` | Updated ref construction with new fields, production filter uses `requiresProductionSuggestion` |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | `ReplacementDetailPanel` shows table of options, OP section, production suggestion |

---

## UI Changes

### ReplacementDetailPanel

- **Current reference**: reference, description, subgrupo SAG, line, disponible en bodega principal, minimo requerido
- **Reemplazos en bodega principal**: table with reference, description, subgrupo SAG, line, disponible (up to 10 rows)
- **Reemplazos en OP**: placeholder message (pending integration)
- **Sugerir produccion**: amber warning when no options exist (LT/CS only)

### Language

"Disponible central" changed to "Disponible en bodega principal" in the drawer detail panel.

---

## Validation Results

20 REEMPLAZAR refs sampled, 20/20 PASS (100% accuracy).

| Metric | Value |
|---|---|
| Total REEMPLAZAR refs | 127 |
| With bodega options | 124 (97.6%) |
| Avg options per ref | 8.4 |
| Requiring production | 3 |
| IMPORT in production | 0 (correct) |

All replacement options verified to share the same subgrupoId as the original ref.

---

## Limitations

- OP as replacement source not yet integrated (empty array)
- IMPORT refs with no replacement have no action (future: `requiresRebuySuggestion`)
- Candidate threshold: `disponible > minimumForLine` (not `>= 2x minimum` as before)

## NOT Touched

- Presence Engine F34
- Ledger
- Backfill scripts
- Migrations
- SAG sync base
- State derivation rules (2-state model)
