# AGENTIK-SALES-PORTFOLIO-RULES-AUDIT-01

**Sprint:** Maletas Business Rules Authority Audit
**Tenant:** Castillitos
**Fecha:** 2026-08-06
**Mode:** READ ONLY — No implementation, no refactoring, no constant changes.

---

## 1. CURRENT AUTHORITIES IDENTIFIED

### 1A. Threshold Constants — Complete Registry

| # | Constant | Value | File | Line | H/C | Consumers |
|---|---|---|---|---|---|---|
| 1 | `SAMPLE_MINIMUM_RULES` LT | 30 | vendor-sample-types.ts | 67 | HARDCODED | getMinimumForLine(), deriveState(), applyReplacements() |
| 2 | `SAMPLE_MINIMUM_RULES` CS | 20 | vendor-sample-types.ts | 68 | HARDCODED | getMinimumForLine(), deriveState(), applyReplacements() |
| 3 | `SAMPLE_MINIMUM_RULES` IMPORT | 10 | vendor-sample-types.ts | 69 | HARDCODED | getMinimumForLine(), deriveState(), applyReplacements() |
| 4 | `getMinimumForLine` default fallback | 20 | vendor-sample-types.ts | 74 | HARDCODED | All callers when line not found |
| 5 | `IMPORT_SCARCITY_MINIMUM` | 10 | vendor-sample-types.ts | 43 | HARDCODED | vendor-sample-loader.ts import scarcity check |
| 6 | `DEFAULT_SUBGROUP_IDEAL_REFS` | 3 | vendor-sample-types.ts | 56 | HARDCODED | Derrotero fallback |
| 7 | `DEFAULT_SUBGROUP_MINIMUM_REFS` | 3 | vendor-sample-types.ts | 57 | CONFIGURABLE (via Prisma VendorBagIdealRouteRule) | Motor 2 trigger, derroteroMap |
| 8 | `RETIRO_THRESHOLDS` CS_TEXTILE | 20 | vendor-sample-types.ts | 95 | HARDCODED | isCandidateForRemoval() |
| 9 | `RETIRO_THRESHOLDS` LT_TEXTILE | 30 | vendor-sample-types.ts | 96 | HARDCODED | isCandidateForRemoval() |
| 10 | `RETIRO_THRESHOLDS` CS_IMPORT | 10 | vendor-sample-types.ts | 97 | HARDCODED | isCandidateForRemoval() |
| 11 | `RETIRO_THRESHOLDS` UNKNOWN | 0 | vendor-sample-types.ts | 98 | HARDCODED | isCandidateForRemoval() |
| 12 | `RIESGO_BUFFER` | 10 | vendor-sample-loader.ts | 226 | HARDCODED | riesgoAgotamiento flag |
| 13 | `MAX_REPLACEMENT_OPTIONS` | 10 | vendor-sample-loader.ts | 1377 | HARDCODED | Bodega + OP candidate cap |
| 14 | `DEFAULT_OP_ACTIVE_WINDOW_MONTHS` | 6 | vendor-sample-loader.ts | 1219 | HARDCODED | OP zombie filter |
| 15 | `COVERAGE_ELIGIBILITY_THRESHOLDS` CS | 20 | maletas-functional-evaluation.ts | 706 | HARDCODED | Coverage opportunity candidates |
| 16 | `COVERAGE_ELIGIBILITY_THRESHOLDS` LT | 30 | maletas-functional-evaluation.ts | 707 | HARDCODED | Coverage opportunity candidates |
| 17 | `COVERAGE_ELIGIBILITY_THRESHOLDS` IMPORT | 10 | maletas-functional-evaluation.ts | 708 | HARDCODED | Coverage opportunity candidates |
| 18 | `PRODUCTION_THRESHOLD` CS | 100 | maletas-functional-evaluation.ts | 341 | HARDCODED | Subgroup-level production trigger |
| 19 | `PRODUCTION_THRESHOLD` LT | 200 | maletas-functional-evaluation.ts | 342 | HARDCODED | Subgroup-level production trigger |
| 20 | `OP_COVERAGE_MAX_AGE_DAYS` | 60 | maletas-functional-evaluation.ts | 713 | HARDCODED | OP coverage freshness gate |
| 21 | `MALETA_REMOVAL_LIMITS` CS | 20 | maletas-canonical-inventory.ts | 359 | HARDCODED | resolveMaletaRemovalReason() |
| 22 | `MALETA_REMOVAL_LIMITS` LT | 30 | maletas-canonical-inventory.ts | 360 | HARDCODED | resolveMaletaRemovalReason() |
| 23 | `MALETA_REMOVAL_LIMITS` IMPORT | 10 | maletas-canonical-inventory.ts | 361 | HARDCODED | resolveMaletaRemovalReason() |
| 24 | `MALETA_COVERAGE_MINIMUMS` CS | 100 | maletas-canonical-inventory.ts | 366 | HARDCODED | isEligibleForMaletaCoverage() |
| 25 | `MALETA_COVERAGE_MINIMUMS` LT | 200 | maletas-canonical-inventory.ts | 367 | HARDCODED | isEligibleForMaletaCoverage() |
| 26 | `MALETA_COVERAGE_MINIMUMS` IMPORT | 10 | maletas-canonical-inventory.ts | 368 | HARDCODED | isEligibleForMaletaCoverage() |
| 27 | `PRODUCTION_SUBGROUP_THRESHOLDS` CS | 100 | maletas-canonical-inventory.ts | 373 | HARDCODED | Canonical production decision |
| 28 | `PRODUCTION_SUBGROUP_THRESHOLDS` LT | 200 | maletas-canonical-inventory.ts | 374 | HARDCODED | Canonical production decision |
| 29 | Coverage gap minimum disponible | 20 | vendor-sample-loader.ts | 539 | HARDCODED | Coverage gap view (legacy Motor 2) |
| 30 | Coverage gap max results | 30 | vendor-sample-loader.ts | 541 | HARDCODED | Coverage gap view cap |
| 31 | Production suggestion max results | 30 | vendor-sample-loader.ts | 643 | HARDCODED | Production suggestion view cap |
| 32 | Urgency "alta" shortfall | >= 50 | vendor-sample-loader.ts | 619 | HARDCODED | Production urgency classification |
| 33 | Urgency "alta" vendors | >= 3 | vendor-sample-loader.ts | 619 | HARDCODED | Production urgency classification |
| 34 | Urgency "media" shortfall | >= 20 | vendor-sample-loader.ts | 620 | HARDCODED | Production urgency classification |
| 35 | Urgency "media" vendors | >= 2 | vendor-sample-loader.ts | 620 | HARDCODED | Production urgency classification |
| 36 | `LOW_ROTATION_MONTHS` | 8 | maletas-functional-evaluation.ts | 572 | HARDCODED | Import recompra classification |
| 37 | `DEAD_COVERAGE_EXCESS_DAYS` | 90 | maletas-deadstock.ts | 28 | HARDCODED | Dead stock detection |
| 38 | `DEAD_NO_SALE_DAYS` | 30 | maletas-deadstock.ts | 29 | HARDCODED | Dead stock detection |
| 39 | `DEAD_HIGH_STOCK_THRESHOLD` | 10 | maletas-deadstock.ts | 30 | HARDCODED | Dead stock suspicion |
| 40 | Production safety multiplier | 1.5x | maletas-rules.ts | 145 | HARDCODED | computeSuggestedProductionQty() |
| 41 | Vendor health "critico" pct | > 0.15 | vendor-sample-loader.ts | 1577 | HARDCODED | Vendor health badge |
| 42 | Vendor health "critico" abs | >= 10 | vendor-sample-loader.ts | 1577 | HARDCODED | Vendor health badge |
| 43 | Vendor health "riesgo" pct | > 0.05 | vendor-sample-loader.ts | 1578 | HARDCODED | Vendor health badge |
| 44 | Vendor health "riesgo" abs | >= 5 | vendor-sample-loader.ts | 1578 | HARDCODED | Vendor health badge |

### 1B. Authoritative Functions

| Function | File | Purpose | Test Coverage |
|---|---|---|---|
| `getMinimumForLine()` | vendor-sample-types.ts:72 | Per-reference viability threshold by line | Smoke tests (indirect) |
| `isCandidateForRemoval()` | vendor-sample-types.ts:127 | Retiro decision | Smoke tests (indirect) |
| `isEligibleForProductionSuggestion()` | vendor-sample-types.ts:372 | Production suggestion gate | None |
| `deriveState()` | vendor-sample-loader.ts:1177 | 2-state model (saludable/reemplazar/sin_datos) | Smoke tests (indirect) |
| `applyReplacements()` | vendor-sample-loader.ts:1388 | Motor 2 supply cascade | Smoke tests (indirect) |
| `evaluateVendorAssortment()` | maletas-functional-evaluation.ts:131 | Full coverage evaluation per catalog | None |
| `evaluateProductionDecisions()` | maletas-functional-evaluation.ts:390 | Subgroup-level production trigger | None |
| `productionStockKey()` | maletas-functional-evaluation.ts:350 | CS: grupo\|subgrupo; LT: subgrupo only | None |
| `isEligibleForMaletaCoverage()` | maletas-canonical-inventory.ts:438 | Canonical coverage opportunity gate | None |
| `matchesMaletaCoverageNeed()` | maletas-canonical-inventory.ts:494 | Need-candidate matching per world | None |
| `resolveMaletaRemovalReason()` | maletas-canonical-inventory.ts:586 | 9-level removal reason precedence | None |
| `resolveMaletaSupplyAction()` | maletas-canonical-inventory.ts:695 | Canonical supply waterfall | None |
| `isReferenceEligibleForMaletasRuntime()` | maletas-commercial-scope.ts:31 | Runtime participation gate | None |
| `buildProductionAlertsFromRules()` | production-alert-engine.ts:70 | Motor B preventive production alerts | Smoke tests (5 phases, 30 cases) |

---

## 2. HARD WORLD SEPARATION

### Certified Partition

| World | Lines | ProductEntity.productLine | Brand | Warehouse Authority |
|---|---|---|---|---|
| **Castillitos Textile** | CS | "2" | "Castillitos" | B01 (ka_nl=10, ss_codigo=01) |
| **Latin Kids Textile** | LT | "1" | "Latin Kids" | B01 (ka_nl=10, ss_codigo=01) |
| **Import / Accesorios** | IMPORT | "5" | "Importacion" | B24 (ka_nl=33, ss_codigo=24) |

### World Resolution Logic

```
vendor-sample-loader.ts:433-440
  importRefSet = ProductEntity WHERE productLine = "5"
  isAccessory = importRefSet.has(item.reference)

  line = isAccessory ? "IMPORT"
       : coverage?.line
         ?? (enrichment?.productLine === "1" ? "LT"
           : enrichment?.productLine === "2" ? "CS"
           : "OTRO")
```

### Cross-World Prohibition

**CONFIRMED:** No cross-world candidates exist in code.

- `maletas-functional-evaluation.ts:142-161`: Catalogs are built per-world. Castillitos Textil, Latin Kids Textil, and Import/Accesorios each get their own catalog. Refs are filtered by `brand === "Castillitos" && line !== "IMPORT"`, `brand === "Latin Kids" && line !== "IMPORT"`, or `line === "IMPORT"`.
- `maletas-canonical-inventory.ts:494-519`: `matchesMaletaCoverageNeed()` requires `canonicalLine` match (CASTILLITOS, LATIN_KIDS, IMPORTACION). A CASTILLITOS need can ONLY be satisfied by a CASTILLITOS candidate.
- `vendor-sample-loader.ts:1424-1432`: Bodega replacement candidates are indexed by `subgrupoId` — since subgrupos are line-specific (CS subgrupos never have the same ID as LT subgrupos), cross-world collisions are structurally impossible.

### Vendor Bodega Mapping

| Vendor | ka_nl_bodega | ss_codigo | Default Active | File:Line |
|---|---|---|---|---|
| ORLANDO | 45 | 35 | true | vendor-sample-presence-engine.ts:57 |
| CARLOS_LEON | 46 | 36 | false | vendor-sample-presence-engine.ts:58 |
| LUIS | 47 | 37 | false | vendor-sample-presence-engine.ts:59 |
| NESTOR | 48 | 38 | true | vendor-sample-presence-engine.ts:60 |
| CARLOS_VILLA | 49 | 39 | false | vendor-sample-presence-engine.ts:61 |
| FREDY | 50 | 40 | false | vendor-sample-presence-engine.ts:62 |

All vendors share the SAME central warehouse per world. The vendor bodegas (45-50) are F34 presence bodegas, not central availability bodegas.

---

## 3. TEXTILE MATCHING DIMENSIONS

### Castillitos Textile

**Composite key: `canonicalLine + grupoSag + subgrupoSag`**

All three dimensions are REQUIRED. Both `grupoSag` and `subgrupoSag` must be non-null.

```typescript
// maletas-canonical-inventory.ts:502-505
case "CASTILLITOS":
  if (!need.grupoSag || !need.subgrupoSag) return false;
  return candidate.grupoSag === need.grupoSag && candidate.subgrupoSag === need.subgrupoSag;
```

This prevents collisions between subgrupos with the same name in different grupos (e.g., "PIJAMA CL" in "CS NINA BEBE" vs "CS NINA KIDS").

**Functional evaluation also uses grupo-aware matching:**

```typescript
// maletas-functional-evaluation.ts:322-326
// Castillitos: grupo + subgrupo required
return refs.filter(
  (r) => r.grupoSag === group.sagGrupo && sagValues.includes(r.subgrupoSag),
);
```

**Motor 2 (vendor-sample-loader.ts) uses `subgrupoId` (numeric FK)** for replacement lookups, which is intrinsically unique across grupos. The `subgrupoSag` string grouping for trigger evaluation (line 1404-1410) uses `ref.subgrupoSag || "OTRO"`.

### Latin Kids Textile

**Composite key: `canonicalLine + subgrupoSag` (NO grupo constraint)**

```typescript
// maletas-canonical-inventory.ts:507-510
case "LATIN_KIDS":
  if (!need.subgrupoSag) return false;
  return candidate.subgrupoSag === need.subgrupoSag;

// maletas-functional-evaluation.ts:329-332
// Latin Kids: subgrupo only (sagGrupo is null in catalog)
return refs.filter(
  (r) => sagValues.includes(r.subgrupoSag),
);
```

### Production Decision Key

```typescript
// maletas-functional-evaluation.ts:350-358
export function productionStockKey(brand, grupoSag, subgrupoSag): string {
  if (brand === "Castillitos" && grupoSag) {
    return `${grupoSag}|${subgrupoSag}`;  // grupo|subgrupo
  }
  return subgrupoSag;  // subgrupo only for LT
}
```

---

## 4. ACCESSORY / IMPORT MATCHING

### Matching Key: `canonicalLine + sizeClass`

```typescript
// maletas-canonical-inventory.ts:512-515
case "IMPORTACION":
  if (!need.sizeClass) return false;
  return candidate.sizeClass === need.sizeClass;

// maletas-functional-evaluation.ts:307-311
if (world === "IMPORTACION") {
  return refs.filter(
    (r) => r.sizeClass !== null && r.sizeClass === entry.subgroupCode,
  );
}
```

### Eligible Sizes

| Size | Target Refs | File:Line |
|---|---|---|
| PEQUENO | 10 | castillitos-mallet-assortment-catalog.ts:170 |
| MEDIANO | 10 | castillitos-mallet-assortment-catalog.ts:171 |
| GRANDE | 3 | castillitos-mallet-assortment-catalog.ts:172 |

**Canonical size set:** `CANONICAL_SIZE_CLASSES = new Set(["PEQUENO", "MEDIANO", "GRANDE"])` (vendor-sample-loader.ts:1754).

All three sizes are eligible. There is NO exclusion of GRANDE in current code. The business note "Maletas use SMALL/MEDIUM and do NOT use LARGE" is NOT reflected in the implementation.

### sizeClass Resolution

```typescript
// vendor-sample-loader.ts:1724-1737
// Source: ProductEntity.handlingUnit (SAG "Unidad de manejo")
// NO fallback inference from description/grupo/subgrupo (disabled per IMPORT-SIZECLASS-FROM-SAG-01)
if (p.handlingUnit && isCanonicalSizeClass(p.handlingUnit)) {
  sizeClass = p.handlingUnit;
} else {
  sizeClass = null;  // unmapped or missing
}
```

### Warehouse Authority

**B24 only** (ka_nl=33, externalRef="24"). Stock = `Math.max(0, quantity - reservedQty)`.

### Candidate Threshold

**IMPORT: disponible > 10** (from `COVERAGE_ELIGIBILITY_THRESHOLDS.IMPORTACION = 10`, comparator: strict `>`).

### Current Matching Function

`matchesMaletaCoverageNeed()` in `maletas-canonical-inventory.ts:494`.

---

## 5. DERROTERO COVERAGE LAW

### Effective Derrotero Source

The Derrotero is defined in the **assortment catalog** (`castillitos-mallet-assortment-catalog.ts`) with targets per group/subgroup. Per-vendor overrides are stored in `VendorBagIdealRouteRule` Prisma model.

### Resolution Priority

1. Active `VendorBagIdealRouteRule` for specific vendor+line+subgrupo -> **CONFIGURABLE** (Prisma DB)
2. Assortment catalog `targetUnits` (e.g., CS PIJAMA CL = 3 refs) -> **HARDCODED** in catalog builder
3. Fallback: `DEFAULT_SUBGROUP_MINIMUM_REFS = 3` -> **HARDCODED**

### Configured Targets (Castillitos Tenant)

**CS Textil — 4 groups, 32 entries, 63 total target refs:**

| Group | Subgrupos | Total Targets |
|---|---|---|
| CS Nina Bebe | PIJAMA CL(3), PIJAMA LL(2), CONJUNTO CC(3), CONJUNTO CL(2), BLUSAS(2), VESTIDO(3), CAMISETA(1), MAMELUCO(1), BUZO/CAMIBUSO(1) | 18 |
| CS Nino Bebe | PIJAMA CL(3), PIJAMA LL(2), CONJUNTO CC(2), CONJUNTO CL(3), CAMISETA(2), MAMELUCO(1), BUZO/CAMIBUSO(1), POLO(1) | 15 |
| CS Nina Kids | PIJAMA CL(3), PIJAMA LL(2), CONJUNTO CC(2), CONJUNTO CL(2), BLUSA(2), VESTIDO(3), CAMISETA(1), BUZO/CAMIBUSO(1) | 16 |
| CS Nino Kids | PIJAMA CL(3), PIJAMA LL(2), CONJUNTO CC(2), CONJUNTO CL(3), CAMISETA(2), BUZO/CAMIBUSO(1), POLO(1) | 14 |

**LT Textil — 1 group (no sagGrupo), 11 entries, 38 total target refs:**

| Subgrupo | Target |
|---|---|
| PIJAMA CC 10-16 | 3 |
| PIJAMA CC 2-8 | 4 |
| PIJAMA CL 10-16 | 4 |
| PIJAMA CL 2-8 | 5 |
| PIJAMA LL 10-16 | 2 |
| PIJAMA LL 2-8 | 3 |
| PIJAMA CL 18-22 | 2 |
| PIJAMA CC 18-22 | 2 |
| CONJUNTO 2-12 | 5 |
| CONJUNTO NAUTICO MESES | 5 |
| CONJUNTO MESES | 3 |

**Import/Accesorios — 1 group, 3 entries, 23 total target refs:**

| Size | Target |
|---|---|
| PEQUENO | 10 |
| MEDIANO | 10 |
| GRANDE | 3 |

### Coverage Trigger Condition

**Motor 2 (vendor-sample-loader.ts:1414-1421):**

```typescript
const minRefs = derroteroMap?.get(`${line}|${sg}`) ?? DEFAULT_SUBGROUP_MINIMUM_REFS;
const activeCount = sgRefs.filter((r) => r.state === "saludable").length;
if (activeCount <= minRefs && sgRefs.some((r) => r.state === "reemplazar")) {
  subgroupsNeedingCoverage.add(sg);
}
```

**Trigger condition:** `saludableCount <= minRefs AND atLeastOneReemplazar`

Both conditions must be true:
1. Active healthy refs at OR below the configured minimum
2. At least one ref in the subgroup is in "reemplazar" state

**Assortment evaluator (mallet-assortment-evaluator.ts:151,176):**

```typescript
const complete = currentUnits >= entry.targetUnits;
// If !complete -> deficit -> ADD suggestions generated
```

**Trigger condition:** `currentReferences < targetUnits`

---

## 6. COVERAGE OPPORTUNITY LAW

### Verified Cascade

```
DERROTERO POSITION NEEDS COVERAGE (currentRefs < targetRefs AND hasReemplazar)
        |
        v
Step 1: eligible BODEGA candidate?
        Filter: same subgrupo, disponible > getMinimumForLine(line), not self, not in vendor bag
        Ranking: disponible DESC, max 10 options
        -> REEMPLAZAR_BODEGA
        |  no
        v
Step 2: eligible active OP candidate?
        Filter: same subgrupoId, active within 6mo window, not self, not in vendor bag
        Ranking: pendingQty DESC, max 10 options
        -> COMPLETAR_DESDE_OP
        |  no
        v
Step 3a (TEXTILE only): -> PRODUCCION_SUGERIDA
Step 3b (IMPORT only):  -> RECOMPRA_SUGERIDA
```

### Exhausted Ref NOT Creating Coverage Deficit

**CONFIRMED:** An exhausted ref whose subgroup is NOT in `subgroupsNeedingCoverage` does NOT trigger replacement, production suggestion, or coverage opportunity.

```typescript
// vendor-sample-loader.ts:1442-1447
if (!subgroupsNeedingCoverage.has(ref.subgrupoSag || "OTRO")) {
  ref.supplyAction = "RETIRAR_MOSTRARIO";
  // NO replacement options, NO production suggestion, NO coverage opportunity
  continue;
}
```

```typescript
// vendor-sample-loader.ts:1519-1523 (catch-all)
if (ref.state === "reemplazar" && ref.supplyAction === null) {
  ref.supplyAction = "RETIRAR_MOSTRARIO";
}
```

This is correct business behavior: only Derrotero-driven deficits create coverage opportunities.

---

## 7. CANDIDATE AVAILABILITY THRESHOLDS

### Two Threshold Systems (DIFFERENT PURPOSES)

**System A — Per-reference VIABILITY threshold (state derivation + replacement candidates):**

| Line | Threshold | Comparator | Source | Purpose |
|---|---|---|---|---|
| CS | 20 | `>` for saludable, `<=` for reemplazar | `SAMPLE_MINIMUM_RULES` | State: "Is this ref healthy in the maleta?" |
| LT | 30 | `>` for saludable, `<=` for reemplazar | `SAMPLE_MINIMUM_RULES` | State: "Is this ref healthy in the maleta?" |
| IMPORT | 10 | `>` for saludable, `<=` for reemplazar | `SAMPLE_MINIMUM_RULES` | State: "Is this ref healthy in the maleta?" |

Bodega replacement candidate filter uses the SAME thresholds (strict `>`):
```typescript
// vendor-sample-loader.ts:1426-1427
const min = getMinimumForLine(cr.line);
if (cr.disponible <= min) continue;  // only candidates ABOVE minimum
```

**System B — Per-reference COVERAGE OPPORTUNITY threshold (new maleta entry):**

| Line | Threshold | Comparator | Source | Purpose |
|---|---|---|---|---|
| CASTILLITOS | 100 | strict `>` | `MALETA_COVERAGE_MINIMUMS` | "Can this ref ENTER a maleta as a new sample?" |
| LATIN_KIDS | 200 | strict `>` | `MALETA_COVERAGE_MINIMUMS` | "Can this ref ENTER a maleta as a new sample?" |
| IMPORTACION | 10 | strict `>` | `MALETA_COVERAGE_MINIMUMS` | "Can this ref ENTER a maleta as a new sample?" |

System B is STRICTER than System A because entering a maleta requires confidence the ref can sustain wholesale field sales.

**Business meaning:** The 20/30/10 thresholds answer "Should this ref remain viable in the field?" The 100/200/10 thresholds answer "Is there enough inventory to justify adding this as a NEW product to the vendor portfolio?" These are NOT quantities assigned to the seller.

---

## 8. PRODUCTION THRESHOLDS

### Current Authority: VERSION B

**Subgroup-aggregate production trigger:**

| Brand | Threshold | Comparator | Source File | Purpose |
|---|---|---|---|---|
| Castillitos | **<= 100** | `stock <= umbral` | maletas-functional-evaluation.ts:341 | When subgroup-aggregate stock falls to/below 100 -> evaluate production |
| Latin Kids | **<= 200** | `stock <= umbral` | maletas-functional-evaluation.ts:342 | When subgroup-aggregate stock falls to/below 200 -> evaluate production |

```typescript
// maletas-functional-evaluation.ts:500-505
if (stock <= umbral) {
  decision = hasOp ? "ESPERAR_OP" : "PRODUCIR";
} else {
  decision = "SIN_ACCION";
}
```

**Dual definition (ALIGNED):** The same values exist in `maletas-canonical-inventory.ts`:

```typescript
// maletas-canonical-inventory.ts:372-375
export const PRODUCTION_SUBGROUP_THRESHOLDS: Record<string, number> = {
  CASTILLITOS: 100,
  LATIN_KIDS: 200,
};
```

Both files contain the same values (100/200). These are SUBGROUP-AGGREGATE thresholds, NOT per-reference thresholds.

### Stale Data Guard

```typescript
// maletas-functional-evaluation.ts:484-498
if (snapshotIsStale) {
  decision = "EN_VALIDACION";  // NEVER produces "PRODUCIR" from stale data
}
```

### Missing Data Guard

```typescript
// maletas-functional-evaluation.ts:462-476
if (stockValue === undefined) {
  decision = "EN_VALIDACION";  // dataState: "SIN_CORRESPONDENCIA"
  // Missing is NEVER treated as zero
}
```

### OP Suppression

```typescript
// If stock <= threshold but there IS an active OP:
decision = "ESPERAR_OP"  // Not "PRODUCIR"
```

### Target Production Quantity

**~600 is NOT encoded as a rule.** Three different formulas exist:

| Source | Formula | File:Line |
|---|---|---|
| maletas-rules.ts | `Math.max(1, Math.ceil(totalMissing * 1.5))` — 1.5x safety | maletas-rules.ts:145 |
| reference-decision-engine.ts | `Math.max(0, idealQty - disponible)` — exact deficit | reference-decision-engine.ts:277 |
| vendor-sample-loader.ts | `shortfall` — exact shortfall, no multiplier | vendor-sample-loader.ts:622 |
| coverage-rule-types.ts | `suggestedProductionQty = idealWarehouseQty` (16-40 range) | coverage-rule-types.ts:91 |

~600 is likely an emergent aggregate or an informational business practice, NOT a configured rule.

---

## 9. TWO PRODUCTION MOTORS

### Confirmed: Two Separate Motors

**Motor A — COVERAGE-DRIVEN PRODUCTION (Derrotero gap -> production suggestion):**

```
Derrotero position missing (saludableCount <= minRefs AND hasReemplazar)
  + no eligible bodega candidate
  + no eligible OP candidate
  -> supplyAction = "PRODUCCION_SUGERIDA" (textile only)
  -> requiresProductionSuggestion = true
```

**File:** vendor-sample-loader.ts:1500-1513 (Motor 2 supply cascade step 3)
**Scope:** Per-reference, per-vendor. Only fires for textile lines (LT/CS).
**Aggregation:** vendor-sample-loader.ts:570-643 groups production needs across vendors by line+subgrupoSag.

**Motor B — PREVENTIVE INVENTORY PRODUCTION (subgroup-level stock threshold):**

```
Subgroup-aggregate central stock <= PRODUCTION_THRESHOLD (CS:100 / LT:200)
  + no active OP for subgroup
  -> decision = "PRODUCIR"
  OR
  + active OP exists
  -> decision = "ESPERAR_OP"
```

**File:** maletas-functional-evaluation.ts:390-528 (`evaluateProductionDecisions()`)
**Scope:** Per-subgroup-per-brand, NOT per-vendor. Independent of which vendor's maleta has the gap.

**Motor C — WAREHOUSE-LEVEL ALERT ENGINE (separate severity system):**

```
CommercialCoverageRule[].minWarehouseQty vs item.availableForCases
  -> 5-level severity: critica/urgente/alta/preventiva/normal
```

**File:** production-alert-engine.ts:70-132 (`buildProductionAlertsFromRules()`)
**Scope:** Per-coverage-rule (line+category+productType). Uses configurable CommercialCoverageRule defaults.

**These three motors are FULLY SEPARATE — different input sources, different output types, different files. They MUST NOT be merged in Plan de Surtido.**

---

## 10. OP SEMANTICS

### OP Eligibility

| Criterion | Value | File:Line | Hardcoded |
|---|---|---|---|
| Status filter | `status = 'open' AND isClosed = false` | vendor-sample-loader.ts:1274-1278 | YES |
| Temporal window | 6 months (created OR last event within window) | vendor-sample-loader.ts:1219,1283-1298 | YES |
| Remaining quantity | `pendingQty = orderedQty` (producedQty hardcoded to 0) | vendor-sample-loader.ts:1339-1341 | YES |
| Subgroup matching | By `subgrupoId` (numeric FK) | vendor-sample-loader.ts:1474-1478 | YES |
| OP coverage freshness | `<= 60 days` (OP_COVERAGE_MAX_AGE_DAYS) | maletas-functional-evaluation.ts:713,757 | YES |
| Ranking | `pendingQty DESC` within subgrupo | vendor-sample-loader.ts:1351-1354 | YES |
| Max options | 10 per ref | vendor-sample-loader.ts:1377 | YES |
| Self-exclusion | Cannot replace self | vendor-sample-loader.ts:1476 | YES |
| Vendor exclusion | Cannot already be in vendor bag | vendor-sample-loader.ts:1476 | YES |

### OP Date Resolution

```typescript
// maletas-functional-evaluation.ts:734-739
const raw = op.lastEventDate ?? op.createdAt ?? null;
```

Uses `lastEventDate` first, falls back to `createdAt`.

### SEMANTIC_GAP: "Near Production"

**Determination of "near production" has NO deterministic date/window threshold beyond the 6-month zombie filter and 60-day OP coverage max age.** There is no explicit "expected arrival" field or "days until delivery" computation.

**VERDICT: SEMANTIC_GAP** — "near production" is approximated by OP being active (not zombie) and not stale (OP_COVERAGE_MAX_AGE_DAYS), but there is no delivery date estimate.

---

## 11. RETIRO LAW

### Textile Retiro

| Condition | Result | Comparator | File:Line |
|---|---|---|---|
| `stockDataState !== "CERTIFIED"` | RETIRO (audit) | Existence check | vendor-sample-types.ts:129 |
| `domain === "UNKNOWN"` | RETIRO | Identity check | vendor-sample-types.ts:137 |
| CS: `compatibleCommercialStock <= 20` | RETIRO | `<=` | vendor-sample-types.ts:95,140 |
| LT: `compatibleCommercialStock <= 30` | RETIRO | `<=` | vendor-sample-types.ts:96,140 |

### Import Retiro

| Condition | Result | Comparator | File:Line |
|---|---|---|---|
| CS_IMPORT: `compatibleCommercialStock <= 10` | RETIRO | `<=` | vendor-sample-types.ts:97,140 |

**Comparator is `<=` (less-than-or-equal), NOT `<`.**

So for Import: a ref with `centralAvailable = 10` IS a candidate for removal (`10 <= 10 = true`).

### RETIRO and Coverage Interaction

An exhausted ref that is a retiro candidate triggers a coverage opportunity ONLY IF its subgroup is in `subgroupsNeedingCoverage`. If the subgroup has enough healthy refs remaining (saludableCount > minRefs), the retiro ref gets `RETIRAR_MOSTRARIO` with NO replacement.

### Canonical Removal Reason Precedence (9 levels)

```
1. EXTERNAL_INTEGRATION  (excluded by integration)
2. DOMAIN_MISMATCH       (unknown/wrong domain)
3. ARCHIVE_REVIEW        (>730 days inactive)
4. DORMANT_REFERENCE     (366-730 days inactive)
5. UNKNOWN_ACTIVITY      (unknown status)
6. NON_COMMERCIAL_STOCK  (stock=0 in commercial, >0 in production/staging)
7. OUT_OF_STOCK          (stock=0 everywhere)
8. BELOW_OPERATIONAL_LIMIT (stock <= threshold)
9. null                  (no removal needed)
```

File: maletas-canonical-inventory.ts:586-621.

---

## 12. CANDIDATE RANKING

### Bodega Replacement Candidates

```typescript
// vendor-sample-loader.ts:1456-1459
const valid = subCandidates
  .filter((c) => c.refCode !== ref.reference && !vendorRefSet.has(c.refCode))
  .sort((a, b) => b.disponible - a.disponible)   // descending stock
  .slice(0, MAX_REPLACEMENT_OPTIONS);             // max 10
```

**Ranking factors (actual, not inferred):**
1. `disponible` descending (ONLY factor)

No sales behavior, no proximity, no "already in another vendor's bag" weight. Pure stock ranking.

### OP Replacement Candidates

```typescript
// vendor-sample-loader.ts:1351-1354
options.sort((a, b) => b.pendingQty - a.pendingQty);  // descending pending qty
```

**Ranking factors (actual):**
1. `pendingQty` descending (ONLY factor)

### Coverage Opportunity Ranking (Functional Evaluation)

```typescript
// maletas-functional-evaluation.ts:1071-1085
// BODEGA first, then OP_ACTIVA
// Within each: more targets first, then higher quantity
```

### Candidate Confidence Scoring

```typescript
// maletas-functional-evaluation.ts:946,993
const ratio = disponible / threshold;
confidence: ratio > 3 ? "ALTA" : ratio > 1.5 ? "MEDIA" : "BAJA"
```

---

## 13. OPORTUNIDADES DE COBERTURA

### Verified: Derived from Derrotero Deficits

**Motor 2 (vendor-sample-loader.ts:538-551):**

Coverage gaps are filtered from `runtimeCoverageRows` — refs with `disponible >= 20` and NOT in any vendor's bag. However, this is a flat list with a HARDCODED threshold of 20, which does NOT come from the Derrotero configuration.

**Functional Evaluation (maletas-functional-evaluation.ts:856-1064):**

Coverage opportunities ARE derived from effective Derrotero deficits:
1. For each catalog entry where `currentReferences < targetUnits` -> deficit
2. For each deficit -> search bodega candidates with `disponible > COVERAGE_ELIGIBILITY_THRESHOLDS[line]`
3. If no bodega -> search OP candidates (textile only, <= 60 days)
4. If no OP -> urgent production need (textile only)

**CONFLICT:** Motor 2 coverage gaps (vendor-sample-loader.ts:538) use a flat `disponible >= 20` filter that does NOT respect Derrotero structure. The functional evaluation system (maletas-functional-evaluation.ts) correctly derives from catalog deficits. See Section 16 for conflict classification.

---

## 14. SAMPLE INVENTORY SEMANTICS

### What the Maleta Represents

A Maleta is a WHOLESALE SAMPLE PORTFOLIO measured in DISTINCT REFERENCES (not units). The 20/30/10 thresholds are central warehouse viability minimums, NOT quantities assigned to the seller.

```typescript
// derrotero-semantics.ts:50-53
export const MEASUREMENT_UNIT_BY_SCOPE: Record<DerroteroScope, DerroteroMeasurementUnit> = {
  STORE: "UNITS",
  SALES_PORTFOLIO: "REFERENCES",
} as const;
```

### Physical Sample Inventory Movement

**There is NO evidence in code that sending a sample:**
- Consumes a physical unit from PIL
- Creates an inventory movement in SAG
- Creates a reservation or allocation

The VendorCommercialBag system tracks `assignedQty / soldQty / availableToSellQty` as a LOGICAL abstraction. The F34 presence engine reads SAG `movimientos_traslados` to verify physical presence, but Maletas code NEVER writes to PIL or creates SAG movements.

### Verdict on Cross-Bag Overcommit

**NO_RESERVATION_REQUIRED**

The "cross-bag overcommit" finding from the previous audit is NOT a P0 bug because:
1. `assignedQty` in VendorBagItem represents wholesale selling capacity, not physical sample allocation
2. The viability thresholds (20/30/10) already ensure the central warehouse has enough stock to sustain MULTIPLE vendors' portfolios
3. The coverage opportunity thresholds (100/200/10) are specifically designed to prevent entering a ref into a maleta unless central stock is substantial enough for wholesale confidence
4. There is no SAG integration that tracks sample unit movement — the maleta system is advisory, not transactional with physical inventory

---

## 15. FULL RULE MATRIX

| # | World | Line | Derrotero Dimension | Coverage Trigger | Candidate Stock (Viability) | Candidate Stock (New Entry) | Candidate Source | OP Fallback | Production Fallback | Preventive Production | Retiro Threshold | Size Restriction | Authority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Castillitos Textile | CS | grupo + subgrupo | saludable <= min AND hasReemplazar | > 20 | > 100 | B01 (ka_nl=10) | YES (subgrupoId, 6mo, 60d) | YES (PRODUCCION_SUGERIDA) | <= 100 (subgroup agg) | <= 20 | N/A | vendor-sample-types + maletas-functional-evaluation + maletas-canonical-inventory |
| 2 | Latin Kids Textile | LT | subgrupo only | saludable <= min AND hasReemplazar | > 30 | > 200 | B01 (ka_nl=10) | YES (subgrupoId, 6mo, 60d) | YES (PRODUCCION_SUGERIDA) | <= 200 (subgroup agg) | <= 30 | N/A | vendor-sample-types + maletas-functional-evaluation + maletas-canonical-inventory |
| 3 | Import / Accesorios | IMPORT | sizeClass | saludable <= min AND hasReemplazar | > 10 | > 10 | B24 (ka_nl=33) | YES (subgrupoId, 6mo, 60d) | RECOMPRA_SUGERIDA (never production) | N/A (textile only) | <= 10 | PEQUENO, MEDIANO, GRANDE | vendor-sample-types + maletas-functional-evaluation + maletas-canonical-inventory |

---

## 16. CONFLICT REPORT

### CONFLICT 1: COVERAGE_ELIGIBILITY_THRESHOLDS vs MALETA_COVERAGE_MINIMUMS

| Aspect | maletas-functional-evaluation.ts | maletas-canonical-inventory.ts |
|---|---|---|
| Constant name | `COVERAGE_ELIGIBILITY_THRESHOLDS` | `MALETA_COVERAGE_MINIMUMS` |
| CS value | 20 | 100 |
| LT value | 30 | 200 |
| IMPORT value | 10 | 10 |
| Comparator | strict `>` | strict `>` |
| Purpose | Replacement candidate for existing Derrotero deficit | NEW coverage opportunity entry into maleta |

**Classification: CODE_IS_CURRENT_AUTHORITY — INTENTIONAL DUAL THRESHOLD**

These are NOT duplicates. They answer different questions:
- `COVERAGE_ELIGIBILITY_THRESHOLDS` (20/30/10): "Can this ref serve as a replacement when a Derrotero position already has a deficit?" (lower bar — the maleta NEEDS a replacement)
- `MALETA_COVERAGE_MINIMUMS` (100/200/10): "Can this ref be proactively ADDED to a maleta as a new sample?" (higher bar — requires wholesale confidence)

The functional evaluation file explicitly documents this distinction (lines 696-703). **No business decision required.**

### CONFLICT 2: RETIRO_THRESHOLDS vs SAMPLE_MINIMUM_RULES vs MALETA_REMOVAL_LIMITS

| Location | CS | LT | IMPORT |
|---|---|---|---|
| vendor-sample-types.ts `SAMPLE_MINIMUM_RULES` | 20 | 30 | 10 |
| vendor-sample-types.ts `RETIRO_THRESHOLDS` | 20 | 30 | 10 |
| maletas-canonical-inventory.ts `MALETA_REMOVAL_LIMITS` | 20 | 30 | 10 |

**Classification: CODE_IS_CURRENT_AUTHORITY — ALIGNED (NO CONFLICT)**

All three definitions have identical values. The triple definition exists because each serves a different consumer chain (state derivation, removal candidacy, canonical removal reason). They are intentionally aligned but independently maintained. **Risk: if one is updated without the others, they will silently diverge.**

### CONFLICT 3: PRODUCTION_THRESHOLD vs PRODUCTION_SUBGROUP_THRESHOLDS

| Location | CS | LT |
|---|---|---|
| maletas-functional-evaluation.ts `PRODUCTION_THRESHOLD` | 100 | 200 |
| maletas-canonical-inventory.ts `PRODUCTION_SUBGROUP_THRESHOLDS` | 100 | 200 |

**Classification: CODE_IS_CURRENT_AUTHORITY — ALIGNED (NO CONFLICT)**

Identical values in two files. Same risk as Conflict 2 — silent divergence if updated independently.

### CONFLICT 4: Coverage Gap Filter (Motor 2) vs Derrotero-Driven Opportunities

| Aspect | vendor-sample-loader.ts:538-541 | maletas-functional-evaluation.ts:856+ |
|---|---|---|
| Source | Flat filter: `disponible >= 20 && !allVendorRefs.has()` | Derrotero catalog deficits |
| Threshold | Hardcoded `>= 20` (CS-like, ignores LT/IMPORT differences) | Per-line: CS>20, LT>30, IMPORT>10 |
| Structure | No grupo/subgrupo matching | Full Derrotero structure |

**Classification: LEGACY_DEAD_RULE (Motor 2 coverage gap)**

The flat `disponible >= 20` filter in vendor-sample-loader.ts is a V1 legacy artifact. The functional evaluation system (`maletas-functional-evaluation.ts`) provides the correct Derrotero-driven implementation. Plan de Surtido should consume `maletas-functional-evaluation.ts`, NOT the legacy coverage gap list.

### CONFLICT 5: GRANDE Size — Business Note vs Code

| Aspect | Business Note (audit request) | Code |
|---|---|---|
| GRANDE eligible? | "Maletas do NOT use LARGE" | GRANDE has target = 3 refs in catalog |
| Source | Sprint request Section 4 | castillitos-mallet-assortment-catalog.ts:172 |

**Classification: BUSINESS_DECISION_REQUIRED**

The assortment catalog includes GRANDE with `targetUnits = 3`. The audit request states "Maletas use SMALL, MEDIUM and do NOT use LARGE." The code contradicts the business note. **This requires business confirmation: should GRANDE remain in the import assortment catalog?**

### CONFLICT 6: OP Remaining Quantity — Hardcoded Zero producedQty

```typescript
// vendor-sample-loader.ts:1340
producedQty: 0,  // no ET reconciliation yet
```

**Classification: RULE_IMPLEMENTATION_GAP**

OP `pendingQty` always equals `orderedQty` because `producedQty` is hardcoded to 0. This means OP candidates are NEVER reduced by production events. A fully produced OP will still appear as a candidate with its full ordered quantity. **This is a known gap documented in code ("no ET reconciliation yet").**

---

## 17. TESTS

### Test Execution Results

```
maletas-sag-sources.smoke.ts:  ALL PASS (7 cases)
production-alert.smoke.ts:     ALL PASS (30 cases across 5 phases)
Total:                         37/37 PASS, 0 FAIL
```

### TSC Baseline

Maletas files contribute 0 new TSC errors above the 162 pre-existing baseline.

### Coverage Gaps

| Area | Test Coverage |
|---|---|
| SAG source semantics (OFICIAL/REMISION/PD/AP) | Smoke tests: 7 cases |
| Production alert severity (5 levels) | Smoke tests: 30 cases |
| getMinimumForLine() | Indirect via smoke |
| isCandidateForRemoval() | Indirect via smoke |
| deriveState() (2-state model) | Indirect via smoke |
| applyReplacements() (Motor 2 cascade) | Indirect via smoke |
| evaluateVendorAssortment() | **NONE** |
| evaluateProductionDecisions() | **NONE** |
| isEligibleForMaletaCoverage() | **NONE** |
| matchesMaletaCoverageNeed() | **NONE** |
| resolveMaletaRemovalReason() | **NONE** |
| resolveMaletaSupplyAction() | **NONE** |
| isReferenceEligibleForMaletasRuntime() | **NONE** |
| Dead stock engine | **NONE** |
| Reference decision engine | **NONE** |

---

## 18. FINAL VERDICT

### Summary

| # | Item | Status |
|---|---|---|
| 1 | World separation | CERTIFIED — CS(grupo+subgrupo), LT(subgrupo), IMPORT(sizeClass). No cross-world candidates. |
| 2 | Derrotero dimensions | CERTIFIED — Catalogs with 32+11+3 entries. Per-vendor overrides via Prisma. Default fallback = 3. |
| 3 | Coverage trigger | CERTIFIED — `saludableCount <= minRefs AND hasReemplazar` (Motor 2). `currentRefs < targetUnits` (evaluator). |
| 4 | Candidate thresholds CS/LT/ACC | CERTIFIED — Viability: CS>20, LT>30, IMP>10. New entry: CS>100, LT>200, IMP>10. |
| 5 | Production thresholds CS/LT | CERTIFIED — CS<=100, LT<=200 (subgroup aggregate). OP suppresses to ESPERAR_OP. |
| 6 | Production target semantics | CERTIFIED — No 600-unit rule. Three formulas: 1.5x, exact deficit, or idealQty. |
| 7 | OP semantics | CERTIFIED with GAP — Active (open, not closed, 6mo window, 60d freshness). SEMANTIC_GAP: no delivery date. producedQty hardcoded to 0. |
| 8 | Retiro semantics | CERTIFIED — CS<=20, LT<=30, IMP<=10 (all `<=`). Comparator verified. |
| 9 | Candidate ranking | CERTIFIED — Bodega: disponible DESC. OP: pendingQty DESC. Max 10 each. |
| 10 | Coverage opportunity law | CERTIFIED — Functional evaluation derives from Derrotero deficits. Legacy Motor 2 gap list is LEGACY_DEAD_RULE. |
| 11 | Sample inventory semantics | CERTIFIED — NO_RESERVATION_REQUIRED. Maletas are advisory, not transactional. |
| 12 | Full rule matrix | DELIVERED (Section 15) |
| 13 | Conflicts | 6 found: 0 requiring code fix, 1 BUSINESS_DECISION_REQUIRED (GRANDE size), 1 IMPLEMENTATION_GAP (OP producedQty), 1 LEGACY_DEAD_RULE |
| 14 | Authoritative functions/files | 14 functions across 7 files (Section 1B) |
| 15 | Tests | 37/37 PASS. Significant coverage gaps in functional-evaluation and canonical-inventory functions. |

### FINAL: B. RULE_CONFLICT_REQUIRES_BUSINESS_DECISION

**Rationale:**

The Maletas business rules are overwhelmingly certifiable. World separation is clean. Thresholds are consistent across redundant definitions. The two production motors are properly separated. Retiro semantics are unambiguous.

However, verdict A (MALETAS_RULES_CERTIFIED) cannot be issued because:

1. **BUSINESS_DECISION_REQUIRED (GRANDE):** The assortment catalog includes GRANDE with target=3, but the business has stated maletas do not use LARGE. This must be resolved before Plan de Surtido consumes the catalog.

2. **IMPLEMENTATION_GAP (OP producedQty=0):** OP candidates always show full ordered quantity because ET reconciliation is not implemented. This means Plan de Surtido could suggest OP candidates that are already fully produced.

3. **LEGACY_DEAD_RULE (Motor 2 coverage gaps):** The flat `disponible >= 20` filter must NOT be consumed by Plan de Surtido. Only the Derrotero-driven functional evaluation should be used.

None of these block audit completion, but item 1 requires a business decision before Plan de Surtido implementation can proceed safely.

---

*Audit completed: 2026-08-06. READ ONLY. No files modified.*
