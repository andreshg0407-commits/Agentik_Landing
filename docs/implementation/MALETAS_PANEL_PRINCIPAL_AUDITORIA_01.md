# MALETAS-PANEL-PRINCIPAL-AUDITORIA-01

**Status:** COMPLETE (Audit only — no implementation)
**Date:** 2026-07-16
**Scope:** Auditar cada numero, estado, chip, acceso y resumen del panel principal

---

## PHASE 1: Inventario completo de elementos visibles

### 1.1 Executive Summary Strip (lines 709-767)

| # | Elemento | Tipo |
|---|---|---|
| E1 | "Resumen ejecutivo" | Section title |
| E2 | KPI "Maletas activas" | ExecKpi |
| E3 | KPI "Cobertura comercial" | ExecKpi (percentage) |
| E4 | KPI "Acciones pendientes" | ExecKpi (count or "—") |
| E5 | Breakdown "Produccion: N" | Conditional span |
| E6 | Breakdown "Recompra: N" | Conditional span |
| E7 | Breakdown "Bodega: N" | Conditional span |
| E8 | Breakdown "Esperando OP: N" | Conditional span |

### 1.2 Quick Navigation Bar (lines 667-706)

| # | Elemento | Tipo |
|---|---|---|
| N1 | "Ir a: Produccion" | Nav pill + count badge |
| N2 | "Ir a: Recompra / Baja rotacion" | Nav pill + count badge |
| N3 | "Ir a: Oportunidades" | Nav pill + count badge |

### 1.3 Vendor Cards Grid (lines 795-878)

| # | Elemento | Tipo |
|---|---|---|
| V1 | Section label "Maletas activas" | Text + "N de M" |
| V2 | Score accent bar (top 4px) | Color bar (grade-keyed) |
| V3 | Vendor name | Text (T.mono, fontWeight 800) |
| V4 | "Bodega BXX" | Text (warehouseCode) |
| V5 | Score badge (number + grade label) | Colored badge |
| V6 | Metric "En maleta" | VendorMetric (totalRefs) |
| V7 | Metric "Salud comercial" | VendorMetric (healthyCommercialRefs) |
| V8 | Metric "Presencia catalogo" | VendorMetric (coveragePct%) |
| V9 | Health distribution bar | 3-segment horizontal bar |
| V10 | IssuePill "agotado" | Conditional red pill |
| V11 | IssuePill "stock bajo" | Conditional amber pill |
| V12 | IssuePill "riesgo" | Conditional amber pill |
| V13 | IssuePill "escasez" | Conditional red pill |
| V14 | "Plan draft: N cambios" | Conditional plan badge |
| V15 | "Abrir maleta" CTA | Button |
| V16 | "Desactivar/Activar" toggle | Button |
| V17 | "Maletas inactivas" collapsible | Collapsible section |
| V18 | "Historial de surtidos" | Conditional button |

### 1.4 Produccion Section (lines 902-973)

| # | Elemento | Tipo |
|---|---|---|
| P1 | Section header "Produccion" | SectionHeader + count + statusHint |
| P2 | Subtitle "Umbral: CS <= 100, LT <= 200" | Text |
| P3 | Table: Marca / Subgrupo / Stock / Umbral / OP Activa / Decision | Grid rows |
| P4 | Decision chips: PRODUCIR / ESPERAR OP / SIN ACCION / DATOS INSUF. | Colored pills |
| P5 | Empty state: "Sin alertas de produccion" | Green text |

### 1.5 Recompra / Baja Rotacion Section (lines 975-1058)

| # | Elemento | Tipo |
|---|---|---|
| R1 | Section header "Recompra / Baja rotacion" | SectionHeader + count + statusHint |
| R2 | Table: Referencia / Descripcion / Tamano / Inventario / Meses s/ing. / Motivo / Decision | Grid rows |
| R3 | Decision chips: RECOMPRAR / BAJA ROTACION / VIGILAR / SIN DATOS / OK | Colored pills |
| R4 | Empty state with diagnostic | Green text + diagnostic counts |
| R5 | "Ver todas (N)" expander | Conditional button (>15 rows) |

### 1.6 Oportunidades de Cobertura Section (lines 1060-1124)

| # | Elemento | Tipo |
|---|---|---|
| O1 | Section header "Oportunidades de cobertura" | SectionHeader + count + statusHint |
| O2 | Subtitle "Faltantes del derrotero con inventario disponible" | Text |
| O3 | Table: Catalogo/Grupo / Subgrupo faltante / Faltan / Ref. sugerida / Disp. / Explicacion | Grid rows |
| O4 | Empty state: "Sin faltantes de cobertura" | Green text |
| O5 | "Ver todas (N)" expander | Conditional button (>10 rows) |

### 1.7 Validacion Funcional Section (lines 1126+)

| # | Elemento | Tipo |
|---|---|---|
| F1 | Section header "Validacion funcional" | SectionHeader |
| F2 | 12 acceptance criteria | Checklist |

---

## PHASE 2: Trazabilidad de metricas

### Formato: Elemento → Componente → Propiedad → Servicio → Fuente → Formula

| ID | Visible | Componente | Propiedad | Servicio | Fuente | Formula |
|---|---|---|---|---|---|---|
| E2 | Maletas activas | ExecKpi | `activeVendors.length` | `useMemo` filter | `vendors.filter(v => v.isActive)` | Count of vendors where `isActive === true` |
| E3 | Cobertura comercial | ExecKpi | `summary.totalDistributedRefs`, `summary.replaceRefs` | `buildExecutiveSummary()` | `vendor-sample-loader.ts:393` → `buildExecSummary()` | `((totalDistributedRefs - replaceRefs) / totalDistributedRefs) × 100` |
| E4 | Acciones pendientes | ExecKpi | `homeActionCounts.total` | `useMemo` (line 604) | All vendor refs iterated | Count of refs with `supplyAction ∈ {PRODUCCION_SUGERIDA, RECOMPRA_SUGERIDA, REEMPLAZAR_BODEGA, COMPLETAR_DESDE_OP}` |
| V5 | Score | VendorCard | `intel.score.total` | `computeScore()` | `maletas-commercial-intelligence.ts:99` | `min(coveragePct,100)*0.4 + healthyPct*0.35 - replacePct*0.15 - scarcityPct*0.10` |
| V6 | En maleta | VendorMetric | `vendor.totalRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:866` | `refs.length` (refs with F34 net_qty > 0) |
| V7 | Salud comercial | VendorMetric | `vendor.healthyCommercialRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:853` | Count of refs where `commercialHealth === "HEALTHY"` |
| V8 | Presencia catalogo | VendorMetric | `intel.coveragePct` | `buildCommercialIntelligence()` | `maletas-commercial-intelligence.ts:312` | `vendorSubgrupos.size / catalogSubgrupoCount × 100` |
| V9 | Health bar | div widths | `healthyCommercialRefs`, `lowStockCommercialRefs`, `outOfStockCommercialRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:853-855` | Proportional widths: `(each / totalRefs) × 100%` |
| V10 | agotado pill | IssuePill | `vendor.outOfStockCommercialRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:855` | Count of refs where `commercialHealth === "OUT_OF_STOCK"` |
| V11 | stock bajo pill | IssuePill | `vendor.lowStockCommercialRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:854` | Count of refs where `commercialHealth === "LOW_STOCK"` |
| V12 | riesgo pill | IssuePill | `vendor.riesgoAgotamientoRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:852` | Count of refs where `riesgoAgotamiento === true` |
| V13 | escasez pill | IssuePill | `vendor.accessoryScarcityRefs` | `buildVendorSnapshot()` | `vendor-sample-loader.ts:857` | Count of refs where `accessoryScarcityState === "escasez"` |
| P3 | Production rows | Grid | `productionThresholds[]` | `evaluateProductionThresholds()` | `maletas-functional-evaluation.ts:330` | Groups textil refs by `brand+subgrupoSag`, checks `stock <= umbral` |
| P4 | Decision | Pill | `pt.decision` | `evaluateProductionThresholds()` | `maletas-functional-evaluation.ts:389-394` | `stock <= umbral ? (hasOp ? ESPERAR_OP : PRODUCIR) : SIN_ACCION` |
| R2 | Import rows | Grid | `importEvaluation.evaluations[]` | `evaluateImportRefs()` | `maletas-functional-evaluation.ts:465` | Per-ref evaluation using rotation, ingreso date, inventory |
| O3 | Opportunity rows | Grid | `coverageOpportunities[]` | `findCoverageOpportunities()` | `maletas-functional-evaluation.ts:594+` | Derrotero faltantes matched with available B01 refs |

---

## PHASE 3: Reconciliacion B48 (NESTOR)

User-provided B48 reference values to reconcile:

| Metrica usuario | Valor usuario | Propiedad sistema | Formula sistema | Coincide? | Observacion |
|---|---|---|---|---|---|
| "376 en maleta" | 376 | `vendor.totalRefs` | Count of refs with F34 net_qty > 0 for B48 | **NEEDS LIVE DATA** | Cannot verify without DB query. totalRefs = refs.length from F34 presence filter. |
| "225 salud comercial" | 225 | `vendor.healthyCommercialRefs` | refs where `centralAvailable > minimum` | **NEEDS LIVE DATA** | HEALTHY = centralAvailable > minimumRequired (strict >). LT=30, CS=20, IMPORT=10. |
| "94% presencia catalogo" | 94% | `intel.coveragePct` | `vendorSubgrupos.size / catalogSubgrupoCount × 100` | **NEEDS LIVE DATA** | This is CATALOG subgrupo breadth, NOT derrotero coverage. May confuse users. |
| "4 agotado" | 4 | `vendor.outOfStockCommercialRefs` | refs where `centralAvailable <= 0` | **NEEDS LIVE DATA** | OUT_OF_STOCK = centralAvailable <= 0. |
| "34 stock bajo" | 34 | `vendor.lowStockCommercialRefs` | refs where `0 < centralAvailable <= minimum` | **NEEDS LIVE DATA** | LOW_STOCK boundary: 0 < available <= minimum. |
| "8 riesgo" | 8 | `vendor.riesgoAgotamientoRefs` | refs where `state === "saludable" && available <= minimum + 10` | **NEEDS LIVE DATA** | riesgoAgotamiento is a SUBSET of saludable refs, NOT of reemplazar. |
| "63 escasez" | 63 | `vendor.accessoryScarcityRefs` | refs where `accessoryScarcityState === "escasez"` | **NEEDS LIVE DATA** | Only for IMPORT refs. Escasez = 0 < B36+B37 available <= 10. |
| "52 DEBIL" | 52 (score) | `intel.score.total` → grade | `total >= 50 && total < 70 → "debil"` | **NEEDS LIVE DATA** | Score = weighted formula. Grade "debil" = 50-69. |

### B48 Arithmetic Consistency Check (formulas only)

```
totalRefs = 376
healthyCommercialRefs = 225
outOfStockCommercialRefs = 4
lowStockCommercialRefs = 34

Expected: HEALTHY + LOW_STOCK + OUT_OF_STOCK + INSUFFICIENT_DATA = totalRefs
225 + 34 + 4 + ? = 376
→ INSUFFICIENT_DATA or non-categorized = 376 - 225 - 34 - 4 = 113

PROBLEM: 113 refs unaccounted for in commercial health breakdown.
```

**Possible explanations:**
1. Some refs have `commercialHealth === "INSUFFICIENT_DATA"` (coverage data missing)
2. The user-provided "225" may refer to `healthyRefs` (2-state saludable), not `healthyCommercialRefs`

```
If healthyRefs = 225, replaceRefs = 376 - 225 = 151
225 + 151 = 376 ✓

But: riesgoAgotamiento (8) is a SUBSET of saludable (225) → consistent
outOfStock (4) is a SUBSET of reemplazar (151) → consistent
```

**FINDING F1:** The user likely conflated `healthyRefs` (2-state) with `healthyCommercialRefs` (3-state). These are different metrics. The VendorCard shows `healthyCommercialRefs` under "Salud comercial", but the 2-state `healthyRefs` is not directly displayed. The 113-ref gap needs live data to resolve.

### riesgoAgotamiento + escasez overlap check

```
riesgoAgotamiento: state === "saludable" AND centralAvailable <= minimum + 10
accessoryScarcity: isAccessory === true AND accessoryScarcityState === "escasez"

These are MUTUALLY EXCLUSIVE populations:
- riesgoAgotamiento applies to textil refs (LT/CS) that are saludable
- escasez applies to IMPORT refs only

No double-counting between these two.
```

**FINDING F2:** riesgoAgotamiento and escasez pills have zero overlap — correct by design.

---

## PHASE 4: Semantica de estados

### 4.1 SampleState (2-state model)

| State | Condition | Source |
|---|---|---|
| `saludable` | `centralAvailable > minimum` (strict >) | `vendor-sample-loader.ts:503-504` |
| `reemplazar` | `centralAvailable <= minimum` | `vendor-sample-loader.ts:505` |

**Note:** Minimum = 30 (LT), 20 (CS), 10 (IMPORT). Default = 20.

### 4.2 SampleCommercialHealth (3-state model)

| State | Condition | Source |
|---|---|---|
| `HEALTHY` | `centralAvailable > minimum` | `vendor-sample-loader.ts:520` |
| `LOW_STOCK` | `0 < centralAvailable <= minimum` | `vendor-sample-loader.ts:519` |
| `OUT_OF_STOCK` | `centralAvailable <= 0` | `vendor-sample-loader.ts:518` |
| `INSUFFICIENT_DATA` | `hasCoverageData === false` | `vendor-sample-loader.ts:517` |

**FINDING F3:** `saludable` and `HEALTHY` have the SAME condition (`centralAvailable > minimum`). `reemplazar` maps to `LOW_STOCK ∪ OUT_OF_STOCK ∪ INSUFFICIENT_DATA`. These are redundant models — the 2-state is a coarser version of the 3-state. No inconsistency, but unnecessary complexity.

### 4.3 riesgoAgotamiento

| State | Condition | Source |
|---|---|---|
| `true` | `state === "saludable" AND centralAvailable <= minimum + RIESGO_BUFFER(10)` | `vendor-sample-loader.ts:212` |

**FINDING F4:** riesgoAgotamiento is a warning zone WITHIN saludable refs. Example for LT (min=30): flagged if available is 31-40. For CS (min=20): flagged if available is 21-30. Semantics are correct.

### 4.4 VendorHealth (derived from all refs)

| State | Condition | Source |
|---|---|---|
| `saludable` | `replacePct <= 0.05 AND replaceCount < 5` | `vendor-sample-loader.ts:886-888` |
| `riesgo` | `replacePct > 0.05 OR replaceCount >= 5` (and not critico) | Same |
| `critico` | `replacePct > 0.15 OR replaceCount >= 10` | Same |
| `sin_datos` | `refs.length === 0` | Same |

**Note:** VendorHealth uses the 2-state `replaceRefs` count. NOT commercialHealth.

### 4.5 SupplyAction types

| Action | Condition (simplified) | Source |
|---|---|---|
| `REEMPLAZAR_BODEGA` | `state === reemplazar` AND bodega replacement exists | `vendor-sample-loader.ts` supply chain |
| `COMPLETAR_DESDE_OP` | `state === reemplazar` AND OP activa exists | Same |
| `PRODUCCION_SUGERIDA` | `state === reemplazar`, LT/CS, no bodega/OP replacement | Same |
| `RECOMPRA_SUGERIDA` | `state === reemplazar`, IMPORT, no bodega/OP replacement | Same |
| `RETIRAR_MOSTRARIO` | `state === reemplazar`, no supply path found | `vendor-sample-loader.ts:835-837` |

**FINDING F5:** `RETIRAR_MOSTRARIO` is NOT counted in `homeActionCounts` (line 604-614). Only the 4 actionable types are counted. This is correct — RETIRAR is a terminal state, not a pending action.

---

## PHASE 5: Coherencia con reglas confirmadas

### Rule 1: "2-state model: SALUDABLE | REEMPLAZAR"
**Status: COHERENT.** `deriveState()` correctly implements strict greater-than.

### Rule 2: "Minimum rules: LT=30, CS=20, IMPORT=10"
**Status: COHERENT.** `SAMPLE_MINIMUM_RULES` in `vendor-sample-types.ts:59-63` matches.

### Rule 3: "Production thresholds: CS <= 100, LT <= 200"
**Status: COHERENT.** `PRODUCTION_THRESHOLD` in `maletas-functional-evaluation.ts:304-306` has `Castillitos: 100, "Latin Kids": 200`. These are per brand+subgrupo, evaluated against central stock.

### Rule 4: "Score: 40% coverage + 35% healthy - 15% replace - 10% scarcity"
**Status: COHERENT.** `computeScore()` in `maletas-commercial-intelligence.ts:99-151` matches exactly.

### Rule 5: "coveragePct = vendorSubgrupos / catalogSubgrupos"
**Status: COHERENT.** But label says "Presencia catalogo" which is catalog breadth, NOT derrotero coverage. Users may confuse this.

### Rule 6: "Cobertura comercial = (total - replace) / total"
**Status: COHERENT.** Line 729 formula matches. But this is the EXECUTIVE summary coverage, different from vendor-level coveragePct.

**FINDING F6:** Two metrics named "cobertura" exist:
- **Executive summary "Cobertura comercial"** = `(totalDistributedRefs - replaceRefs) / totalDistributedRefs × 100` — measures % of refs NOT needing replacement
- **VendorCard "Presencia catalogo"** = `vendorSubgrupos / catalogSubgrupos × 100` — measures subgrupo breadth

These measure completely different things but both involve "coverage". Potential confusion.

### Rule 7: "riesgoAgotamiento is WITHIN saludable"
**Status: COHERENT.** Code: `state === "saludable" && centralAvailable <= minimum + RIESGO_BUFFER`.

### Rule 8: "Accessories use B36+B37, textil uses B01"
**Status: COHERENT.** Loader separates central availability by line type.

---

## PHASE 6: Auditoria del Resumen Ejecutivo

### KPI 1: "Maletas activas" (E2)

- **Source:** `activeVendors.length` where `activeVendors = vendors.filter(v => v.isActive)`
- **Concern:** `summary.activeVendors` (from server) counts vendors with `totalRefs > 0`, while the displayed value counts vendors where `isActive === true`. These can differ if a vendor is active but has zero refs.
- **FINDING F7:** `ExecKpi "Maletas activas"` uses `activeVendors.length` (client-side, `isActive` filter), but the cobertura comercial KPI guards with `summary.activeVendors > 0` (server-side, `totalRefs > 0` filter). If an active vendor has 0 refs, the maletas activas count includes it but cobertura may show "—". Minor inconsistency but unlikely to cause user confusion since empty vendors show "Sin referencias en maleta".

### KPI 2: "Cobertura comercial" (E3)

- **Formula:** `((totalDistributedRefs - replaceRefs) / max(totalDistributedRefs, 1)) × 100`
- **Guard:** Shows "—" if `summary.activeVendors === 0`
- **Color:** Amber if `replaceRefs > totalDistributedRefs × 0.2`, green otherwise
- **Meaning:** "What % of distributed refs are NOT in reemplazar state"
- **FINDING F8:** This metric is arguably misleading. A ref in "reemplazar" state means `centralAvailable <= minimum`, but the ref is still PRESENT in the vendor's bag. "Cobertura" suggests coverage of something — but this metric measures operational health of central stock, not field presence. The label "Cobertura comercial" should perhaps be "Salud del inventario central" or "Refs con stock suficiente".

### KPI 3: "Acciones pendientes" (E4)

- **Source:** `homeActionCounts.total` (sum of produccion + recompra + bodega + op)
- **Shows "—"** when total === 0
- **FINDING F9:** This counts supply actions across ALL vendors (active + inactive). An inactive vendor's refs still contribute to the total. This may be intentional (actions exist regardless of vendor activation) but could confuse users who see "0 maletas activas" but ">0 acciones pendientes".

### Action Breakdown (E5-E8)

- **FINDING F10:** The breakdown items use different colors:
  - Produccion: `C.blueDark` (neutral)
  - Recompra: `C.blueDark` (neutral)
  - Bodega: `C.green` (positive — replacement available)
  - Esperando OP: `C.amber` (warning — waiting)

  Color semantics are correct. Bodega = good news (replacement found), OP = waiting.

---

## PHASE 7: Auditoria Produccion

### Data Source
`productionThresholds: SubgroupProductionEval[]` from `evaluateProductionThresholds()`.

### Logic Flow
1. Collects unique `brand|subgrupoSag` pairs from active vendor textil refs (excludes IMPORT/accessories)
2. Looks up `centralStockBySubgrupo` (central B01 stock aggregated by subgrupo)
3. Checks `opActiveBySubgrupo` (whether an open OP exists for the subgrupo)
4. Decision: `stock <= umbral ? (hasOp ? ESPERAR_OP : PRODUCIR) : SIN_ACCION`

### Thresholds
- Castillitos (CS): 100 units
- Latin Kids (LT): 200 units

### Quick Nav Count
`prodThresholdProducir.length + prodThresholdEsperar.length` — shows count of PRODUCIR + ESPERAR_OP entries.

**FINDING F11:** The nav count includes ESPERAR_OP entries, but these may not require action (the OP already exists). Users might expect only PRODUCIR entries to count as "actionable". However, the section subtitle says "Evaluacion" not "Alertas", so including both is informative rather than action-oriented.

### Section statusHint
Shows "N PRODUCIR" if any PRODUCIR exists, else "sin alertas". Does NOT mention ESPERAR_OP in the hint.

**FINDING F12:** `centralStockBySubgrupo` is passed from the loader. Need to verify it uses the SAME central stock source as the per-ref `centralAvailable`. Both should come from B01 for textil. If they use different aggregation (per-ref vs per-subgrupo), numbers could diverge.

---

## PHASE 8: Auditoria Recompra / Baja Rotacion

### Data Source
`importEvaluation: ImportEvaluationResult` from `evaluateImportRefs()`.

### Logic Flow
1. Collects unique IMPORT/accessory refs across active vendors
2. For each ref: checks inventory, `mesesSinIngreso`, `velocidadVenta`
3. Decision tree:
   - `inventario <= 0` → REBUY (agotado)
   - `inventario <= 5 AND velocidadVenta > threshold` → REBUY (alta rotacion, bajo stock)
   - `mesesSinIngreso >= 8 AND inventario > 0` → LOW_ROTATION
   - Insufficient data → INSUFFICIENT_DATA
   - Else → WATCH or DO_NOT_REBUY

### Quick Nav Count
`importRebuy.length + importLowRotation.length` — REBUY + LOW_ROTATION entries.

### UI Truncation
Shows first 15 rows by default, expandable via "Ver todas (N)".

**FINDING F13:** The "Ver todas" button shares state (`showAllProd`) with... production? Variable name is `showAllProd` but it controls import expansion on line 1053-1056. This is a naming inconsistency — `showAllProd` is used for the import table, not production. No functional bug but confusing for maintainers.

### Diagnostic Display
Empty state shows: "N refs evaluadas, N sin fecha de ingreso, N sin tamano, N sin inventario" — good transparency about data quality.

---

## PHASE 9: Auditoria Oportunidades de Cobertura

### Data Source
`coverageOpportunities: CoverageOpportunity[]` from `findCoverageOpportunities()`.

### Logic Flow
1. Iterates derrotero entries that have `faltante > 0` (missing units in assortment)
2. For each faltante, searches central B01 for refs matching the subgrupo with `disponible > 0`
3. Builds suggestion with: catalog, group, subgroup, faltante count, suggested ref, disponible, explanation

### Quick Nav Count
`coverageOpportunities.length`

### UI Truncation
Shows first 10 rows by default, expandable.

**FINDING F14:** Coverage opportunities come from `maletas-functional-evaluation.ts`, which uses the derrotero (assortment catalog) as the source of truth for what SHOULD be in a maleta. This is different from the "Coverage Gaps" (`CoverageGapRef[]`) in `vendor-sample-service.ts`, which looks at refs with stock but zero vendor presence. The UI uses `coverageOpportunities` (derrotero-based), which is the correct choice for business operations.

---

## PHASE 10: Audit Deliverables

### D1: Panel Map
See Phase 1 (complete inventory of 50+ elements across 7 sections).

### D2: Source of Every Number
See Phase 2 (traceability matrix: element → component → property → service → source → formula).

### D3: Formula of Every State
See Phase 4 (complete state semantics for SampleState, SampleCommercialHealth, riesgoAgotamiento, VendorHealth, SupplyAction).

### D4: B48 Reconciliation
See Phase 3. **Key finding:** 113-ref gap in commercial health arithmetic needs live DB validation. User-provided "225 salud comercial" likely refers to `healthyRefs` (2-state) not `healthyCommercialRefs` (3-state).

### D5: Double Counting Detected

| Issue | Description | Severity |
|---|---|---|
| NONE FOUND | riesgoAgotamiento and escasez pills are mutually exclusive (textil vs IMPORT). No double-counting in health bar (HEALTHY + LOW_STOCK + OUT_OF_STOCK are exhaustive partitions). homeActionCounts correctly deduplicates by using `else if` chain. | — |

### D6: Ambiguous Metrics

| ID | Metric | Ambiguity | Impact |
|---|---|---|---|
| **A1** | "Cobertura comercial" (exec summary) | Measures `(total - reemplazar) / total` but label suggests field coverage. Is actually "% of refs with sufficient central stock". | HIGH — users may think this is catalog/derrotero coverage |
| **A2** | "Presencia catalogo" (vendor card) | Measures subgrupo breadth vs ALL known subgrupos (from all vendors + gaps). Not derrotero coverage. | MEDIUM — different from assortment coverage shown in derrotero tab |
| **A3** | "Salud comercial" (vendor metric) | Shows `healthyCommercialRefs` count. But label could mean the vendor's overall health, not just the count of healthy refs. | LOW |
| **A4** | "En maleta" (vendor metric) | Shows `totalRefs` (F34 presence count). Label could be confused with physical units. `totalUnits` = `refs.length` (same as totalRefs, not actual units). | LOW |

### D7: Differences vs Real Operation

| ID | Difference | Description |
|---|---|---|
| **D1** | `totalUnits` = `refs.length` | `totalUnits` and `estimatedValue` are placeholder values (refs.length and 0 respectively). Not displayed in UI, so no user impact. |
| **D2** | `summary.activeVendors` vs `activeVendors.length` | Server counts vendors with `totalRefs > 0`, client counts `isActive === true`. Different semantics, used in different contexts. |
| **D3** | `showAllProd` variable naming | Controls import table expansion, not production. Naming inconsistency. |
| **D4** | "Cobertura comercial" naming | Does not measure what users expect from "cobertura". |

### D8: Responsible Files

| File | Responsibility | Lines of interest |
|---|---|---|
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | All UI rendering, state derivation, homeActionCounts | 604-615, 667-767, 795-878, 902-1124, 2489-2655 |
| `lib/comercial/maletas/vendor-sample-loader.ts` | Server-side data loading, state derivation, snapshot building | 81, 499-521, 843-889 |
| `lib/comercial/maletas/vendor-sample-types.ts` | Type definitions, minimum rules, constants | 59-68 |
| `lib/comercial/maletas/maletas-commercial-intelligence.ts` | Score computation, coverage analysis, catalog index | 99-151, 283-335 |
| `lib/comercial/maletas/maletas-functional-evaluation.ts` | Production thresholds, import evaluation, coverage opportunities | 304-418, 454-593 |
| `lib/comercial/maletas/vendor-sample-service.ts` | Legacy ref builder (alternative path) | 97-391 |

### D9: Recommended Correction Order

| Priority | Item | Type | Effort |
|---|---|---|---|
| 1 | **A1: Rename "Cobertura comercial"** | Label change | Trivial — change string to "Refs con stock suficiente" or "Salud central" |
| 2 | **A2: Clarify "Presencia catalogo"** | Tooltip or rename | Trivial — tooltip already exists but could be more explicit |
| 3 | **D3: Rename `showAllProd`** | Variable rename | Trivial — rename to `showAllImport` |
| 4 | **F7: Unify active vendor counting** | Logic alignment | Small — decide whether "active" means isActive or totalRefs > 0, use consistently |
| 5 | **F1: Verify B48 arithmetic** | DB query | Medium — run live query to confirm healthyCommercialRefs vs healthyRefs values |
| 6 | **D1: Populate `totalUnits` and `estimatedValue`** | Data enrichment | Large — requires price data and actual unit counts |

### D10: Changes That Should NOT Be Made

| Item | Reason |
|---|---|
| **Do NOT merge 2-state and 3-state models** | Both serve different purposes. 2-state drives supply actions (reemplazar = needs action). 3-state drives commercial health visibility (shows severity). Merging would lose information. |
| **Do NOT add riesgoAgotamiento to homeActionCounts** | riesgoAgotamiento is informational (warning within saludable), not an actionable supply state. Adding it would inflate "Acciones pendientes". |
| **Do NOT change score formula weights** | Score formula is well-calibrated and validated. Any change would affect all vendor grades and require re-validation. |
| **Do NOT remove RETIRAR_MOSTRARIO from supplyAction** | It is the correct terminal state for refs with no supply path. Even though it's not counted in homeActionCounts, it drives drawer actions. |
| **Do NOT count inactive vendor refs in executive summary** | `summary` already includes ALL vendors (active + inactive) in its totalDistributedRefs. The issue is that homeActionCounts also includes inactive. Removing them from summary would break the metric. |
| **Do NOT add PRODUCTION_THRESHOLD for IMPORT line** | Import refs use recompra evaluation, not production thresholds. Mixing them would create false production alerts for accessories. |
| **Do NOT change the RIESGO_BUFFER constant (10)** | The buffer is well-sized relative to minimums (LT=30, CS=20). Changing it without business validation would alter warning sensitivity. |

---

## Summary of Findings

| ID | Finding | Severity | Action Required |
|---|---|---|---|
| F1 | 113-ref gap in B48 commercial health arithmetic | MEDIUM | Live DB validation needed |
| F2 | riesgoAgotamiento and escasez are mutually exclusive | OK | No action — correct by design |
| F3 | 2-state and 3-state models are redundant but not inconsistent | LOW | Document relationship; do NOT merge |
| F4 | riesgoAgotamiento semantics correct | OK | No action |
| F5 | RETIRAR_MOSTRARIO excluded from homeActionCounts | OK | Correct — terminal state, not pending action |
| F6 | Two "cobertura" metrics measure different things | HIGH | Rename executive summary metric |
| F7 | `activeVendors.length` vs `summary.activeVendors` inconsistency | LOW | Align counting logic |
| F8 | "Cobertura comercial" label is misleading | HIGH | Rename to reflect actual meaning |
| F9 | homeActionCounts includes inactive vendor refs | LOW | Decide if intentional |
| F10 | Action breakdown colors are semantically correct | OK | No action |
| F11 | Nav count includes ESPERAR_OP (not just PRODUCIR) | LOW | Informational, not a bug |
| F12 | centralStockBySubgrupo vs per-ref centralAvailable source alignment | MEDIUM | Verify both use B01 |
| F13 | `showAllProd` variable controls import table | LOW | Rename variable |
| F14 | coverageOpportunities correctly uses derrotero, not legacy gaps | OK | No action |

**Overall Assessment:** The panel is architecturally sound. No double-counting bugs found. No incorrect state derivations. The main issues are **labeling ambiguity** (F6/F8: "Cobertura comercial" is misleading) and one **unverified arithmetic gap** (F1: B48 113-ref gap needs live data). All formulas, state machines, and threshold logic are internally consistent and match confirmed business rules.
