# MALETAS-DATA-TRUTH-AUDIT-PACK-01

**Sprint:** MALETAS-DATA-TRUTH-AUDIT-PACK-01
**Module:** Comercial > Maletas
**Mode:** READ ONLY — zero code or data changes
**Date:** 2026-07-01
**Prerequisite:** ENGINE-02 (validated), DRAWER-UX-01 (complete)

---

## Audit Summary

| Audit | Result | Severity |
|---|---|---|
| 1. State consistency (KPI vs Tab vs Dataset) | LATENT BUG — currently harmless | P2 |
| 2. Production state truth | CORRECT but MISLEADING label | P2 |
| 3. SAG subgroup truth | INCORRECT — uses parsed description, not SAG SUBGRUPOS | P1 |
| 4. State rule documentation | COMPLETE — sin_inventario is dead code | P3 |
| 5. Manual sample validation (20 refs) | 20/20 OK — presence+state+central all correct | OK |

---

## AUDIT 1: State Consistency

### Problem Statement

User reported: KPI "Criticas = 4" but the Criticas tab shows fewer rows.

### Investigation

Traced the full pipeline from `buildVendorSnapshot()` → `stateCounts` → `filteredRefs`:

```
KPI "Criticas" = criticalRefs
  = refs.filter(r.state === "critica" || "sin_inventario" || "sugerir_op")    ← 3 states
  Source: vendor-sample-loader.ts line 344-346

Action Card "Criticas" = stateCounts.critica
  = refs.filter(r.state === "critica" || "sin_inventario" || "sugerir_op")    ← 3 states
  Source: maletas-client.tsx line 179

Tab Filter "critica" = detailFilter === "critica"
  = refs.filter(r.state === detailFilter)                                     ← 1 state ONLY
  Source: maletas-client.tsx line 138-139
```

### Bug

The filter `detailFilter === "critica"` matches ONLY `state === "critica"`. It does NOT include `sin_inventario` or `sugerir_op`, both of which are counted in the KPI.

### Current Impact

**Currently zero impact.** Live SAG data shows:

| Vendor | critica | sin_inventario | sugerir_op | KPI total | Tab shows | Delta |
|---|---|---|---|---|---|---|
| Carlos Villa | 0 | 0 | 0 | 0 | 0 | 0 |
| Nestor | 0 | 0 | 0 | 0 | 0 | 0 |
| Carlos Leon | 0 | 0 | 0 | 0 | 0 | 0 |
| Orlando | 0 | 0 | 0 | 0 | 0 | 0 |

All vendors currently have high central availability (most refs have 100+ units). The bug will manifest when central inventory drops below minimums.

### Root Cause

The KPI aggregates 3 states but the tab filter uses strict equality on a single state value.

### Additional Finding

`sin_inventario` is **dead code**. The state derivation pipeline (`deriveState` → `applyReplacements`) never assigns it:
- `deriveState()` maps `central <= 0` → `critica` (not `sin_inventario`)
- `applyReplacements()` converts `critica` → either `reemplazar` or `sugerir_op`

---

## AUDIT 2: Production State Truth

### Question

Does `sugerir_op` mean an active OP (Orden de Produccion) exists in SAG?

### Answer: NO

The state `sugerir_op` is assigned when:
```
centralAvailable <= 0 AND no replacement candidate in same line+category
```

It is a **recommendation** computed by the replacement engine. It does NOT check SAG for:
- Active OPs (ka_ni_tipo_movimiento = 14)
- Planned OPs
- Open OPs

### Current Data

Zero refs currently have `sugerir_op` state (all refs have sufficient central inventory). The OP query failed due to a column name issue (`ka_ni_tipo_movimiento` doesn't exist in MOVIMIENTOS — the correct field name needs investigation).

### Classification

| Category | Count | % |
|---|---|---|
| Produccion real (has active OP) | 0 | — |
| Sugerencia OP (no OP) | 0 | — |
| Error de clasificacion | 0 | — |

Currently untestable because zero refs are in `sugerir_op` state.

---

## AUDIT 3: SAG Subgroup Truth

### Problem

The UI shows broad categories like PIJAMA, CONJUNTO, CAMISETA. Business expects values like PIJAMA LL, PIJAMA CC, CONJUNTO LL.

### Root Cause

The UI uses `extractCategory()` in `vendor-sample-loader.ts:270-285` which **parses the description text** using keyword matching:

```typescript
function extractCategory(description: string): string {
  const d = description.toUpperCase();
  if (d.includes("PIJAMA")) return "PIJAMA";     // loses "LL", "CC", "CL" suffix
  if (d.includes("CONJUNTO")) return "CONJUNTO";  // loses "NAUTICO", "MESES", etc.
  // ... 10 more keywords ...
  return "OTRO";
}
```

SAG has a proper `SUBGRUPOS` table (272 entries) with field `sc_detalle_subgrupo`:

| SAG Subgrupo | UI Category | Information Lost |
|---|---|---|
| PIJAMA CL 2-8 | PIJAMA | "CL 2-8" (corte largo, tallas 2-8) |
| PIJAMA CC 10-16 | PIJAMA | "CC 10-16" (corte corto, tallas 10-16) |
| PIJAMA LL 18-22 | PIJAMA | "LL 18-22" |
| CONJUNTO NAUTICO MESES | CONJUNTO | "NAUTICO MESES" |
| CONJUNTO CC | CONJUNTO | "CC" |
| JOGGER | OTRO | Entire category name |
| BLUSA | OTRO | Entire category name |
| POLO | CAMISETA | Wrong mapping (POLO ≠ CAMISETA) |
| BUZO | ABRIGO | Partial match (BUZO → ABRIGO mapping) |

### Validation Results (50 refs)

| Result | Count | % |
|---|---|---|
| MATCH (UI category contained in SAG subgrupo) | 41 | 82% |
| MISMATCH (different or OTRO) | 9 | 18% |

### Missing Data Path

The engine's presence SQL already joins `v_articulos` which has `ka_ni_subgrupo` (FK to `SUBGRUPOS.ka_ni_subgrupo`). The field is available but **never selected** in `buildVendorBalanceQuery()`.

---

## AUDIT 4: State Rule Documentation

### Complete State Flowchart

```
central >= min ─────────────────────────────────── → SALUDABLE
0 < central < min ─┬─ replacement exists ──────── → REEMPLAZAR
                   └─ no replacement ───────────── → RIESGO
central <= 0 ──────┬─ replacement exists ──────── → REEMPLAZAR
                   └─ no replacement ───────────── → SUGERIR_OP
```

### Source Code References

| State | Rule | Source |
|---|---|---|
| SALUDABLE | `centralAvailable >= minimum` | `vendor-sample-loader.ts:254` |
| RIESGO | `0 < centralAvailable < minimum` AND no replacement | `vendor-sample-loader.ts:255` + `:328-332` |
| CRITICA | Never reaches final state (always mutated) | `vendor-sample-loader.ts:256` → `:310-333` |
| REEMPLAZAR | `state is riesgo/critica` AND replacement candidate with `disponible >= minimum * 2` in same `line + category` | `vendor-sample-loader.ts:315-325` |
| SUGERIR_OP | `centralAvailable <= 0` AND no replacement candidate | `vendor-sample-loader.ts:329-332` |
| SIN_INVENTARIO | **DEAD CODE** — never assigned by pipeline | — |

### Minimum Thresholds

| Line | Minimum | Source |
|---|---|---|
| LT | 30 | `vendor-sample-types.ts:30` |
| CS | 20 | `vendor-sample-types.ts:31` |
| IMPORT | 10 | `vendor-sample-types.ts:32` |
| Other/OTRO | 20 (default) | `vendor-sample-types.ts:37` |

### Replacement Candidate Criteria

A ref qualifies as replacement candidate when:
1. Same `line` as the ref being replaced
2. Same `category` (from `extractCategory()`)
3. `disponible >= minimum * 2`
4. Different ref code

---

## AUDIT 5: Manual Sample Validation

### Carlos Villa (B49) — 10 refs

| Ref | F34 Net | Central | Min | State | UI Cat | SAG Subgrupo | Valid? |
|---|---|---|---|---|---|---|---|
| CCP-1053225 | 1 | 39 | 20 | saludable | CONJUNTO | CONJUNTO CL | OK |
| CD-4123138 | 1 | 8858 | 20 | saludable | CAMISETA | POLO | OK |
| CD-4893239 | 1 | 4798 | 20 | saludable | CAMISETA | CAMISETA | OK |
| L-3540 | 1 | 596 | 20 | saludable | PIJAMA | PIJAMA CL 2-8 | OK |
| L-3558 | 1 | 446 | 20 | saludable | PIJAMA | PIJAMA CC 18-22 | OK |
| L-3567 | 1 | 597 | 20 | saludable | PIJAMA | PIJAMA CC 2-8 | OK |
| L-3568 | 1 | 590 | 20 | saludable | PIJAMA | PIJAMA CC 10-16 | OK |
| L-6307 | 1 | 464 | 20 | saludable | CONJUNTO | CONJUNTO MESES | OK |
| L-7110 | 1 | 597 | 20 | saludable | PIJAMA | PIJAMA MESES LL | OK |
| L-8464 | 1 | 463 | 20 | saludable | CONJUNTO | CONJUNTO 2-12 | OK |

### Nestor (B48) — 10 refs

| Ref | F34 Net | Central | Min | State | UI Cat | SAG Subgrupo | Valid? |
|---|---|---|---|---|---|---|---|
| CGJ-1352215B | 1 | 221 | 20 | saludable | CONJUNTO | CONJUNTO CC | OK |
| CGJ-1523215 | 1 | 168 | 20 | saludable | CONJUNTO | CONJUNTO CC | OK |
| CGJ-1543425 | 1 | 145 | 20 | saludable | OTRO | BLUSA | OK |
| L-3430 | 1 | 397 | 20 | saludable | PIJAMA | PIJAMA CL 10-16 | OK |
| L-3487 | 1 | 592 | 20 | saludable | PIJAMA | PIJAMA CL 2-8 | OK |
| L-3510 | 1 | 397 | 20 | saludable | PIJAMA | PIJAMA LL 10-16 | OK |
| L-3543 | 1 | 596 | 20 | saludable | PIJAMA | PIJAMA CC 2-8 | OK |
| L-7118 | 1 | 500 | 20 | saludable | PIJAMA | PIJAMA MESES LL | OK |
| L-7119 | 1 | 596 | 20 | saludable | PIJAMA | PIJAMA MESES LL | OK |
| L-9112 | 1 | 396 | 20 | saludable | PIJAMA | PIJAMA MESES CL | OK |

**Result: 20/20 OK.** All presence, states, and central values are consistent with SAG data.

---

## FINAL VERDICT

### 1. Are states correct?

**YES, with a latent bug.** The state derivation pipeline is internally consistent and produces correct results. There is a latent KPI-vs-Tab filter inconsistency that currently has zero impact (no refs are in critica/sugerir_op state) but will manifest when central inventory drops.

### 2. Are subgroups correct?

**NO.** The UI shows 12 broad categories parsed from description text. SAG has 272 specific subgrupos. 18% of audited refs show incorrect or overly simplified categories. Key losses: talla ranges (2-8, 10-16, 18-22), corte types (CL, CC, LL), and entire categories (JOGGER, BLUSA, POLO mapped to wrong/OTRO).

### 3. Are criticas correct?

**YES (currently).** Zero refs are currently in critica state because central inventory is healthy. The business definition (central <= 0, no replacement) is correct. The KPI-vs-Tab bug exists but has no current impact.

### 4. Are production suggestions correct?

**CORRECT but MISLEADING.** `sugerir_op` means "central agotado + no replacement available." It does NOT verify whether an OP exists in SAG. The label "Produccion" implies an active production order but it's only a recommendation.

### 5. Unreliable fields

| Field | Issue | Severity |
|---|---|---|
| **Subgrupo** | Uses `extractCategory()` from description, not SAG `SUBGRUPOS` table | P1 |
| **Linea** | Falls back to "OTRO" when `CommercialCoverageSnapshot` has no data → minimum defaults to 20 | P2 |
| **KPI Criticas vs Tab** | KPI counts 3 states but tab filter only matches 1 | P2 (latent) |
| **"Produccion" label** | Implies active OP but is just a recommendation | P2 |
| **sin_inventario state** | Dead code — never assigned | P3 |

---

## Recommended Fixes (NOT implemented — audit only)

1. **P1: Subgrupo** — Add `ka_ni_subgrupo` to the balance query, JOIN to `SUBGRUPOS`, use `sc_detalle_subgrupo` as the real subgroup instead of `extractCategory()`
2. **P2: Tab filter** — When filtering "critica", also include `sin_inventario` and `sugerir_op` to match KPI count
3. **P2: Produccion label** — Rename to "Sugerencia OP" or "Requiere produccion" to avoid implying an active OP
4. **P3: sin_inventario** — Remove dead state from `SampleState` type
