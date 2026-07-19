# MALETAS-SUGERENCIAS-PRODUCCION-REAL-SAG-01

Sprint: Fix production suggestions to use bodega principal, grupo-aware keys, and correct missing-data handling.

## 1. Bugs fixed

### Bug 1: centralStockBySubgrupo keyed by subgrupoSag only
- **File:** `lib/comercial/maletas/vendor-sample-loader.ts:434-442`
- **Before:** `centralStockBySubgrupo.set(cr.subgrupoSag, ...)` — all Castillitos subgrupos with same name (e.g., "BUZO" under "BUZOS NINO" vs "BUZOS NINA") merged into one stock total
- **After:** Uses `productionStockKey(brand, grupoSag, subgrupoSag)` — Castillitos keyed by `grupoSag|subgrupoSag`, Latin Kids by `subgrupoSag` only
- **Grupo resolution:** `subgrupoToGrupoLookup.get(cr.subgrupoId)` — already loaded from SAG at startup

### Bug 2: evaluateProductionThresholds groups by brand|subgrupoSag only
- **File:** `lib/comercial/maletas/maletas-functional-evaluation.ts:348`
- **Before:** `const key = \`\${ref.brand}|\${ref.subgrupoSag}\`` — merged Castillitos decision units that should be separate
- **After:** `const key = \`\${ref.brand}|\${productionStockKey(ref.brand, ref.grupoSag, ref.subgrupoSag)}\`` — Castillitos uses grupo+subgrupo, LT uses subgrupo only

### Bug 3: ?? 0 fallback masks missing stock data
- **File:** `lib/comercial/maletas/maletas-functional-evaluation.ts:386`
- **Before:** `const stock = centralStockBySubgrupo.get(data.subgrupoSag) ?? 0` — missing data treated as zero → false PRODUCIR decisions
- **After:** Explicit `undefined` check → `DATOS_INSUFICIENTES` decision when stock data is missing

### Bug 4: opActiveBySubgrupo keyed by subgrupoSag only
- **File:** `lib/comercial/maletas/vendor-sample-loader.ts:444-452`
- **Before:** `opActiveBySubgrupo.add(sg)` where sg = subgrupoSag — OP check not grupo-aware
- **After:** Uses `productionStockKey(brand, grupoSag, sg)` — consistent with stock map

## 2. New function

### `productionStockKey(brand, grupoSag, subgrupoSag): string`
- **File:** `lib/comercial/maletas/maletas-functional-evaluation.ts:314-322`
- Exported for use by both evaluation and loader
- Castillitos + grupoSag available: `grupoSag|subgrupoSag`
- Latin Kids or grupoSag null: `subgrupoSag`

## 3. UI changes

### Removed: "Validacion funcional" section
- **File:** `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx:1131-1222`
- Debug validation panel from MALLETS-FUNCTIONAL-RECOVERY-01 — no longer needed in production

### Updated: Production table adds "Grupo" column
- **File:** `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx:923-966`
- Grid changed from 6 to 7 columns: Marca | Grupo | Subgrupo | Stock | Umbral | OP Activa | Decision
- Grupo shows `pt.group` (resolved from SAG), em-dash when null
- Subtitle updated: "Evaluacion por marca + grupo + subgrupo"

## 4. Production decision logic (unchanged)

| Stock vs Umbral | OP Activa | Decision |
|---|---|---|
| stock <= umbral | No | PRODUCIR |
| stock <= umbral | Si | ESPERAR_OP |
| stock > umbral | * | SIN_ACCION |
| missing data | * | DATOS_INSUFICIENTES |

Thresholds: Castillitos = 100, Latin Kids = 200.

## 5. Data flow

```
CommercialCoverageSnapshot (B01+B04 stock)
  → subgrupoId + subgrupoSag per ref
  → subgrupoToGrupoLookup.get(subgrupoId) → grupoSag
  → productionStockKey(brand, grupoSag, subgrupoSag)
  → centralStockBySubgrupo Map

ProductionOrder (SAG OPs)
  → loadOpBySubgrupo() → Map<subgrupoId, options[]>
  → subgrupoToGrupoLookup.get(subgrupoId) → grupoSag
  → productionStockKey(brand, grupoSag, sg)
  → opActiveBySubgrupo Set

evaluateProductionThresholds()
  → groups refs by brand + productionStockKey()
  → lookups stock and OP using same key format
  → consistent decision across all three dimensions
```

## 6. Metrics NOT modified

| Metric | Status |
|---|---|
| En maleta (376) | No change |
| Salud comercial (124) | No change |
| Presencia catalogo (83%) | No change |
| Derroteros | No change |
| Ideales editables | No change |
| Recompra | No change |
| Oportunidades | No change |
| Agotado / Stock bajo chips | No change |
