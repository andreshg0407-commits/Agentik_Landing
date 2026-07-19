# TIENDAS-ADAPTER-REAL-DATA-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 34/34 PASS

---

## Problema

El adapter de Tiendas usaba heuristicas (`inferCategory`, `inferProductType`) para clasificar productos. El audit TIENDAS-CATALOG-AUDIT-01 confirmo:

- Match inferCategory vs productLine real: **0%**
- Match inferProductType vs subgrupoSag real: **13%**
- `category` en ProductEntity contiene IDs SAG numericos (58, 148), NO subgrupos
- `subgrupoSag` contiene los nombres comerciales reales ("PIJAMA CL 2-8", "CONJUNTO CC")

**Toda la inteligencia de surtido operaba sobre datos ficticios.**

---

## Solucion

### Clasificacion anterior vs nueva

| Dimension | Antes (heuristica) | Ahora (real) |
|---|---|---|
| **Subgrupo** (`category` field) | `inferCategory(name)` → "NIÑA KIDS", "NIÑO BEBE" | `ProductEntity.subgrupoSag` → "PIJAMA CL 2-8", "CONJUNTO CC" |
| **Linea** (`line` field) | `inferProductType(name)` → "PIJAMA", "VESTIDO" | `ProductEntity.productLine` → "1", "2", "5" |
| **Talla** | `variantAttributes.talla` (sin normalizar) | `variantAttributes.talla` (trim + uppercase) |
| **Color** | `variantAttributes.color` (sin normalizar) | `variantAttributes.color` (trim + uppercase) |
| **Fallback subgrupo** | "GENERAL" (generico) | "SIN_SUBGRUPO_SAG" (explicito) |
| **Fallback linea** | "OTRO" (generico) | "SIN_LINEA_SAG" (explicito) |
| **Fallback talla** | "" (vacio) | "SIN_TALLA" (explicito) |
| **Fallback color** | "" (vacio) | "SIN_COLOR" (explicito) |

### Joins implementados

```
ProductInventoryLevel
  → include: product { select: name, sku, subgrupoSag, productLine }
  → include: variant { include: variantAttributes { key, value } }
```

3 sitios de construccion de inventario actualizados:
1. `getStoreInventoryByWarehouse` — Strategy 1 (PIL single-store)
2. `getStoreInventoryByWarehouse` — Strategy 2 (CRM fallback)
3. `loadBatchStoreInventory` — batch PIL for all stores

### Clasificacion de producto actualizada

`inferProductClass()` en 3 archivos actualizada para:
- Usar `subgrupoSag` real (que contiene nombres como "PIJAMA CL 2-8", "CUNA", "BOLSO")
- Usar SAG `productLine` IDs (1/2/3 = textile, 5 = import)
- Eliminar heuristica "LATIN"/"CASTILLITO" en `line` (ya no aplica — line es ID numerico)
- Reconocer sentinelas SIN_TALLA/SIN_COLOR para evitar falsos positivos en textile

---

## Clasificaciones eliminadas

| Heuristica | Archivo | Estado |
|---|---|---|
| `inferCategory(name)` import | `sag-store-adapter.ts` | **ELIMINADA** |
| `inferProductType(name)` import | `sag-store-adapter.ts` | **ELIMINADA** |
| `line.includes("LATIN")` | `active-inventory.ts` | **ELIMINADA** |
| `line.includes("CASTILLITO")` | `active-inventory.ts` | **ELIMINADA** |
| `line.includes("LATIN")` | `store-needs-service.ts` | **ELIMINADA** |
| `line.includes("CASTILLITO")` | `store-needs-service.ts` | **ELIMINADA** |
| `category: true` (SAG group ID) | `store-suggestions-service.ts` | **REEMPLAZADA** por `subgrupoSag: true` |
| `p.category` como subgrupo | `store-suggestions-service.ts` | **REEMPLAZADO** por `p.subgrupoSag` |

`inferCategory()` y `inferProductType()` siguen existiendo en `lib/comercial/maletas/sag-inventory-adapter.ts` para el modulo Maletas (fuera de scope).

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/sag-store-adapter.ts` | Reemplazo de inferCategory/inferProductType por subgrupoSag/productLine reales. Sentinelas de fallback. Normalizacion talla/color. |
| `lib/comercial/tiendas/active-inventory.ts` | `inferProductClass()` actualizada: usa subgrupoSag real, SAG line IDs, sentinelas SIN_TALLA/SIN_COLOR. |
| `lib/comercial/tiendas/assortment-engine.ts` | `inferSizeClass()` actualizada: usa subgrupoSag real para bulky/accessory. |
| `lib/comercial/tiendas/store-rule-catalog.ts` | `inferProductClass()` actualizada: usa subgrupoSag real, SAG line IDs. |
| `lib/comercial/tiendas/store-needs-service.ts` | `inferProductClass()` actualizada. Mapping subgroup/category comentado con origen real. |
| `lib/comercial/tiendas/store-suggestions-service.ts` | Query cambiada de `category` a `subgrupoSag`. Mapping actualizado. |

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `scripts/validate-tiendas-adapter-real-data.ts` | 34 structural checks |
| `scripts/audit-tiendas-classification-coverage.ts` | Read-only coverage metrics against production data |

## Archivos NO modificados (consumidores downstream — ya reciben datos correctos)

| Archivo | Razon |
|---|---|
| `store-replenishment-engine.ts` | Consume `v.category` y `v.line` del adapter. Ahora recibe subgrupoSag/productLine reales. Sin cambios necesarios. |
| `textile-coverage-engine.ts` | Usa `v.category || v.line` como subgrupo. Ahora recibe datos reales. Sin cambios necesarios. |
| `store-replacement-engine.ts` | Compara `.line` y `.category` entre items. Ahora compara datos reales. Sin cambios necesarios. |
| `store-policy-engine.ts` | Matching contra reglas usando `.line` y `.category`. Ahora matchea datos reales. Sin cambios necesarios. |
| `store-replenishment-service.ts` | Capa de servicio que invoca provider. Sin cambios necesarios. |
| `providers/sag-current-provider.ts` | Wrapper del adapter. Sin cambios necesarios. |

---

## Riesgos restantes

1. **35% de productos sin subgrupoSag** — 1,605 productos tendran "SIN_SUBGRUPO_SAG". Requiere sprint TIENDAS-CATALOG-COVERAGE-01 para backfill desde SAG.

2. **productLine son IDs SAG (1, 2, 5)** — funcional pero no legible. Requiere sprint TIENDAS-SAG-LINE-RESOLVER-01 para mapear a nombres comerciales.

3. **58% de tallas son "GEN"** — productos sin variacion de talla. El motor textil las procesa pero la cobertura textil sera baja. Requiere sprint TIENDAS-GEN-TALLA-EXCLUSION-01.

4. **Reglas existentes pueden no matchear** — reglas creadas con el catalogo anterior (basado en heuristicas) pueden no matchear con subgrupoSag real. Usuarios deben recrear reglas.

---

## Validaciones

```
=== Results: 34 PASS / 0 FAIL / 34 TOTAL ===
```

Validaciones previas:
- validate-tiendas-performance-load: 52/52 PASS
- validate-tiendas-textile-size-color-coverage: 55/55 PASS
- validate-tiendas-rule-catalog-integration: 44/44 PASS
