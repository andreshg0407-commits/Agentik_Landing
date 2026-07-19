# MALETAS-COMMERCIAL-INTELLIGENCE-01

Sprint: Transform Maletas from inventory viewer to commercial intelligence center.

## Architecture

Pure computation layer — no DB, no SAG, no side effects.
Built ON TOP of existing validated engines (Presence, F34, Subgrupo SAG, Replacement, OP Active Filter, Import Scarcity).

```
VendorSampleSnapshot[] + CoverageGapRef[]
        |
  buildCommercialIntelligence()
        |
  MaletasCommercialIntelligenceResult
    - per-vendor intelligence (score, coverage, opportunities, risk)
    - copilot contexts (PILAR 6)
```

## Files

| File | Purpose |
|---|---|
| `lib/comercial/maletas/maletas-commercial-intelligence-types.ts` | Pure types |
| `lib/comercial/maletas/maletas-commercial-intelligence.ts` | Computation service |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Wired intelligence into loader |
| `app/(app)/[orgSlug]/comercial/maletas/page.tsx` | Passes `intelligence` prop |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | UI: score, tabs, intelligence panel |
| `scripts/_validate-commercial-intelligence.ts` | Pilar 7 validation script |

## 8 Pillars

### Pilar 1: Coverage Analysis
Per-vendor subgrupo coverage vs full catalog (all vendors + coverage gaps).
`SubgrupoCoverage[]` — which subgrupos present, how many refs, central stock.

### Pilar 2: Risk of Depletion
Refs with `centralAvailable <= minimum * 1.5` are at risk.
- `critico`: centralAvailable <= minimum
- `alto`: centralAvailable <= minimum * 1.5
Accessories excluded (use import scarcity model instead).

### Pilar 3: Maleta Score (0-100)
Weighted composite:
- 40% coverage breadth (subgrupos present / catalog total)
- 35% healthy ratio (saludable / total refs)
- 15% replace penalty (reemplazar / total refs, inverted)
- 10% scarcity penalty (import escasez / import refs, inverted)

Grades: excelente (>=90), buena (>=70), debil (>=50), critica (<50).

### Pilar 4: Coverage Opportunities
High-stock catalog refs in subgrupos the vendor doesn't carry or underrepresents.
Max 10 opportunities per vendor, max 5 refs per opportunity.
Sorted by totalAvailableQty descending.

### Pilar 5: Executive Summary
Score circle + breakdown in drawer header.
VendorCard shows score badge and coverage % metric.

### Pilar 6: Copilot Context
`MaletaCommercialContext` per vendor: gap count, opportunities, replacement candidates, risk refs, import scarcity, score. Ready for David/Diego consumption.

### Pilar 7: Validation Results

```
ALL CHECKS PASSED (2026-07-02)

Orlando:      69/100 (debil)  — 27/29 subgrupos, 13 at-risk, 14 replace
Carlos Leon:  64/100 (debil)  — 27/29 subgrupos, 47 at-risk, 42 replace
Nestor:       66/100 (debil)  — 27/29 subgrupos, 33 at-risk, 32 replace
Carlos Villa: 65/100 (debil)  — 27/29 subgrupos, 49 at-risk, 39 replace
Luis:          0/100 (critica) — 0/29 subgrupos (empty maleta)
Fredy:         0/100 (critica) — 0/29 subgrupos (empty maleta)
```

Automated checks: score range, grade consistency, subgrupo math, coverage % math, risk threshold correctness, opportunity stock > 0, no duplicate risk refs.

### Pilar 8: This document

## UI Changes

### Vendor Card
- Score badge (color-coded by grade) replaces health badge
- Coverage % metric replaces old metric
- Accent bar uses score color

### Vendor Detail Drawer
- Score circle + breakdown in header
- Tab navigation: Referencias | Inteligencia
- Referencias tab: existing ref table (unchanged)
- Inteligencia tab: VendorIntelligencePanel
  - Coverage opportunities table (subgrupo, line, available refs, stock)
  - At-risk references table (ref, description, disponible, minimum, ratio, level)
  - Subgrupo coverage table with progress bars

## Constraints

- NO modification of existing validated engines
- NO new SAG queries
- NO Prisma changes
- NO side effects — pure functional transformation
- TSC baseline maintained at 160
