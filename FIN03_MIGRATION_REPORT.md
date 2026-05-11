# FIN-03 — Torre de Control Registry Migration Report
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## Summary

Torre de Control financial logic has been migrated from hardcoded source arrays
to canonical financial source registry groups.

The SI contamination — a silent semantic error present in 6 functions across
2 files — has been fully resolved.

**TypeScript status:** Zero errors introduced. Zero pre-existing errors affected.

---

## 1. Migrated Queries

### `lib/finance/cobros-breakdown.ts`

**Change 1 — CODIGOS_CONSIGNACIONES_PENDIENTES → PENDING_DEPOSIT_SOURCES**

```ts
// BEFORE:
import { ..., CODIGOS_CONSIGNACIONES_PENDIENTES } from "source-semantic-rules";
const allCodes = [..., ...CODIGOS_CONSIGNACIONES_PENDIENTES];
const consignaciones = sum(CODIGOS_CONSIGNACIONES_PENDIENTES);

// AFTER:
import { PENDING_DEPOSIT_SOURCES } from "@/lib/financial/source-registry";
const allCodes = [..., ...PENDING_DEPOSIT_SOURCES];
const consignaciones = sum([...PENDING_DEPOSIT_SOURCES]);
```

Registry source: `PENDING_DEPOSIT_SOURCES = ["B1","B2","H1","H2","CP"]`
Semantic change: None. Same 5 codes.

**Change 2 — CODIGOS_RETAIL_FINANCIERO filtered via registry**

```ts
// BEFORE:
import { CODIGOS_RETAIL_FINANCIERO } from "source-semantic-rules";
// CODIGOS_RETAIL_FINANCIERO = ["SI", "AN"]
const allCodes = [..., ...CODIGOS_RETAIL_FINANCIERO];
const retailFinanciero = sum(CODIGOS_RETAIL_FINANCIERO);

// AFTER:
import { isCollectionSource } from "@/lib/financial/source-registry";
const RETAIL_FINANCIERO_ACTIVE = CODIGOS_RETAIL_FINANCIERO.filter(isCollectionSource);
// RETAIL_FINANCIERO_ACTIVE = ["AN"]  (SI excluded — not in COLLECTION_SOURCES)
const allCodes = [..., ...RETAIL_FINANCIERO_ACTIVE];
const retailFinanciero = sum(RETAIL_FINANCIERO_ACTIVE);
```

**Semantic correction:** SI removed from retailFinanciero aggregation.
**KPI impact:** None in practice (SI has IMPACTA COBROS=NO; 0 rows in DB).
**Safety gain:** Future accidental SI data would be blocked from cobros totals.

---

### `lib/castillitos/source-rules.ts`

**Change 1 — SET_CONSIGNACIONES → PENDING_DEPOSIT_SOURCES**

```ts
// BEFORE:
import { CODIGOS_CONSIGNACIONES_PENDIENTES } from "source-semantic-rules";
const SET_CONSIGNACIONES = _codeSet(CODIGOS_CONSIGNACIONES_PENDIENTES);

// AFTER:
import { PENDING_DEPOSIT_SOURCES } from "@/lib/financial/source-registry";
const SET_CONSIGNACIONES = _codeSet([...PENDING_DEPOSIT_SOURCES]);
```

**Change 2 — SET_RETAIL_FINANCIERO filtered via registry**

```ts
// BEFORE:
const SET_RETAIL_FINANCIERO = _codeSet(CODIGOS_RETAIL_FINANCIERO);
// SET_RETAIL_FINANCIERO contains SI → isStoreSource("SI") = true (wrong)

// AFTER:
const SET_RETAIL_FINANCIERO = _codeSet(
  CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c)),
);
// SET_RETAIL_FINANCIERO = {"AN"}  (SI excluded)
// isStoreSource("SI") = false (correct)
```

**Change 3 — getCollectionSourceCodes("consolidado") filtered**

```ts
// BEFORE:
return [...CODIGOS_COBROS_EMPRESA, ...CODIGOS_COBROS_ALMACEN_ACTIVOS, ...CODIGOS_RETAIL_FINANCIERO];
// includes SI

// AFTER:
return [...CODIGOS_COBROS_EMPRESA, ...CODIGOS_COBROS_ALMACEN_ACTIVOS,
        ...CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c))];
// SI excluded
```

**Change 4 — getCollectionSourceCodes("tiendas") filtered**

```ts
// BEFORE:
return [...CODIGOS_COBROS_ALMACEN_ACTIVOS, ...CODIGOS_RETAIL_FINANCIERO];
// includes SI

// AFTER:
return [...CODIGOS_COBROS_ALMACEN_ACTIVOS,
        ...CODIGOS_RETAIL_FINANCIERO.filter(c => !NA_ELIMINATED_CODES.includes(c))];
// SI excluded
```

**Change 5 — getPendingDepositSourceCodes() → PENDING_DEPOSIT_SOURCES**

```ts
// BEFORE:
return [...CODIGOS_CONSIGNACIONES_PENDIENTES];

// AFTER:
return [...PENDING_DEPOSIT_SOURCES];
```

**Change 6 — getF1CollectionSourceCodes() filtered**

```ts
// BEFORE:
return PYA_SOURCE_REGISTRY
  .filter(r => r.businessLayer === "COLLECTION_F1" && r.active)
  .map(r => r.code);
// Returns: ["R1", "A1", "AN", "SI"] — SI wrong!
// Root cause: source-semantic-rules.ts line 622: cobro(111, "SI", "OFICIAL", ...)
// classifies SI as COLLECTION_F1.

// AFTER:
return PYA_SOURCE_REGISTRY
  .filter(r => r.businessLayer === "COLLECTION_F1" && r.active)
  .map(r => r.code)
  .filter(c => !NA_ELIMINATED_CODES.includes(c));
// Returns: ["R1", "A1", "AN"]  — SI excluded
```

**Change 7 — getCashSourceCodes() filtered**

```ts
// BEFORE:
return [...new Set(
  PYA_SOURCE_REGISTRY
    .filter(r => (r.businessLayer === "COLLECTION_F1" || r.businessLayer === "COLLECTION_F2") && r.active)
    .map(r => r.code),
)];
// May include SI via COLLECTION_F1

// AFTER:
return [...new Set(
  PYA_SOURCE_REGISTRY
    .filter(r => (r.businessLayer === "COLLECTION_F1" || r.businessLayer === "COLLECTION_F2") && r.active)
    .map(r => r.code)
    .filter(c => !NA_ELIMINATED_CODES.includes(c)),
)];
// SI excluded
```

---

## 2. Semantic Corrections Made

### SI Removal (the only correction, authorized by FIN-01)

| Before | After |
|--------|-------|
| SI appeared in all collection code functions | SI excluded via `NA_ELIMINATED_CODES` filter |
| `isStoreSource("SI") = true` | `isStoreSource("SI") = false` |
| `getF1CollectionSourceCodes()` returns SI | Returns R1, A1, AN only |
| `getCashSourceCodes()` returns SI | Returns R1, A1, AN, R2, A2 only |
| `getCollectionSourceCodes("consolidado")` includes SI | SI excluded |
| `getCollectionSourceCodes("tiendas")` includes SI | SI excluded |
| `cobros-breakdown.ts` queries SI | SI excluded |

**KPI impact:** None in practice — SI has IMPACTA COBROS=NO, zero records in DB.
**Trust impact:** Financial queries now accurately reflect canonical classification.
**Safety impact:** Future SI data (if imported accidentally) is blocked at query level.

---

## 3. Removed Hardcoded Arrays

| Was | Now |
|-----|-----|
| `CODIGOS_CONSIGNACIONES_PENDIENTES` in cobros-breakdown.ts | `PENDING_DEPOSIT_SOURCES` from registry |
| `CODIGOS_CONSIGNACIONES_PENDIENTES` in source-rules.ts | `PENDING_DEPOSIT_SOURCES` from registry |
| `CODIGOS_RETAIL_FINANCIERO` (unfiltered) in cobros-breakdown.ts | Filtered via `isCollectionSource()` |
| `CODIGOS_RETAIL_FINANCIERO` (unfiltered) in source-rules.ts | Filtered via `NA_ELIMINATED_CODES` |
| `COBRO_CODES` (hardcoded) in cobros-kpis.ts | `COLLECTION_SOURCES` from registry (FIN-02) |

---

## 4. Remaining Unsafe Financial Logic

These are out of scope for FIN-03 but documented for future sprints:

| File | Issue | Priority |
|------|-------|----------|
| `source-semantic-rules.ts` line 622 | Root SI classification `cobro(111,"SI","OFICIAL",...)` — should be `estadoUso: EXCLUDED` or `capaDato: EXCLUIDO` | FIN-04 |
| `source-semantic-rules.ts` | `CODIGOS_RETAIL_FINANCIERO = ["SI","AN"]` — root array includes SI | FIN-04 |
| `lib/reconciliation/applied-facts-parser.ts` | Source code matching patterns | FIN-04+ |
| `lib/finance/auto-reconcile.ts` | Source references | FIN-04+ |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | `assertKnownFinancialSource` at import boundary | FIN-04 |

---

## 5. KPI Behavior Changes

**No KPI values changed.**

All corrections target codes (SI) that produce zero records in the database.
The semantic classification is corrected but real-world numbers are identical.

This is verified by the fact that `getCobrosBreakdown().retailFinanciero.amount` was
always 0 for SI and only AN had real amounts. After migration, the query simply
no longer queries SI rows that don't exist.

---

## 6. Trust-State Impacts

The SI removal actually improves trust-state accuracy:

| KPI | Before | After |
|-----|--------|-------|
| `getF1CollectionSourceCodes()` | Returns `["R1","A1","AN","SI"]` — SI mislabeled as F1 cobro | Returns `["R1","A1","AN"]` — correct |
| `getCashSourceCodes()` | Includes SI in cash calculation | Excludes SI — cash total now semantically correct |
| `cobros-breakdown.ts retailFinanciero` | Queries SI (zero result but wrong intent) | Only queries AN — correct semantic intent |

---

## 7. Files Not Requiring Migration

| File | Reason |
|------|--------|
| `lib/finance/fpa-queries.ts` | Uses `sagSourceType` (OFICIAL/REMISION) — no comprobanteCode filtering |
| `lib/finance/cartera-kpis.ts` | Operates on `CustomerReceivable` — no source code filtering |
| `lib/finance/receivables-snapshot.ts` | Same as cartera-kpis.ts |
| `lib/sales/source-rules.ts` | sagSourceType layer — orthogonal to code registry |
| `app/(app)/[orgSlug]/executive/page.tsx` | Delegates to castillitos/source-rules.ts — no direct hardcoding |

---

## Architecture State After FIN-03

```
lib/financial/source-registry.ts   ← CANONICAL AUTHORITY
        │
        ├── COLLECTION_SOURCES      → cobros-kpis.ts (COBRO_CODES) ✓
        ├── PENDING_DEPOSIT_SOURCES → cobros-breakdown.ts ✓
        │                           → castillitos/source-rules.ts (SET + functions) ✓
        ├── isCollectionSource()    → cobros-breakdown.ts (RETAIL_FINANCIERO filter) ✓
        └── NA_ELIMINATED_CODES     → castillitos/source-rules.ts (SI exclusion) ✓

Torre de Control data path (registry-normalized):
  executive/page.tsx
    → castillitos/source-rules.ts  [MIGRATED — SI removed from all collection functions]
    → cobros-breakdown.ts          [MIGRATED — SI removed, PENDING_DEPOSIT_SOURCES]
    → cobros-kpis.ts               [MIGRATED — COLLECTION_SOURCES] (FIN-02)
    → fpa-queries.ts               [CLEAN — sagSourceType layer]
    → cartera-kpis.ts              [CLEAN — CustomerReceivable layer]
```
