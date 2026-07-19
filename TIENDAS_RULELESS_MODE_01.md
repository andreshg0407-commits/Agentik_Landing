# TIENDAS-RULELESS-MODE-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 21/21 PASS

---

## Problema

BODEGA CENTRO no tiene reglas de surtido configuradas.
El sistema mostraba "Sin reglas" pero simultaneamente:
- Faltantes: 779
- Sugerencias: 779
- Cobertura subgrupos: 8/8

**Contradiccion:** Sin reglas, Agentik NO sabe que deberia tener esa tienda.
No puede haber faltantes si no hay definicion de lo esperado.

---

## Solucion

SIN REGLAS = modo descriptivo. Se muestra el inventario existente pero:
- **NO** se calculan faltantes
- **NO** se generan sugerencias
- **NO** se computa cobertura de subgrupos
- **NO** se generan oportunidades de surtido
- **NO** se permite crear propuestas de surtido
- KPIs operativos muestran "—" (dash, no cero)

---

## Cambios por archivo

### `lib/comercial/tiendas/active-inventory.ts`

| Cambio | Detalle |
|---|---|
| `isExpectedAssortment` | Guard `storeRules.length === 0 → return false` ANTES de `currentUnits > 0` check |
| `computeStoreReplenishmentOpportunities` | Guard `storeRules.length === 0 → return []` al inicio |

### `lib/comercial/tiendas/store-replenishment-engine.ts`

| Cambio | Detalle |
|---|---|
| `calculateStoreHealth` | `sgCoverage` y `opportunities` solo se computan si `hasRules` |
| Production messages | "Escalar a planeacion" → "Requiere revision comercial" |

### `lib/comercial/tiendas/store-replenishment-service.ts`

| Cambio | Detalle |
|---|---|
| `getStoreDetail` | `generateDefaultAssortmentRules` solo se usa si `storeHasRules` |
| `assortmentNeeds` | Retorna `[]` para tiendas sin reglas |

### `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx`

| Cambio | Detalle |
|---|---|
| Card KPIs | Cobertura, Oportunidades, Transferencias guarded por `health.hasRules` |
| Drawer KPIs | Cobertura, Oportunidades, Transferencias guarded por `health.hasRules` |
| Tab counts | Faltantes y Sugerencias counts guarded por `health.hasRules` |
| ShortagesTab | Empty state: "no tiene reglas de surtido configuradas" |
| SuggestionsTab | Empty state: "Sin reglas de surtido configuradas no es posible generar sugerencias" |
| Crear propuesta | Button hidden when `!health.hasRules` |
| Fallback text | "Escalar a planeacion" → "Requiere revision comercial" |

---

## Comportamiento esperado por estado

| Estado | Faltantes | Sugerencias | Cobertura | Oportunidades | Propuestas |
|---|---|---|---|---|---|
| Sin reglas + sin sync | — | — | — | — | Oculto |
| Sin reglas + con sync | Empty state | Empty state | — | — | Oculto |
| Con reglas + sin sync | — | — | — | — | Visible |
| Con reglas + con sync | Calculados | Calculadas | X/Y | N | Visible |

---

## Validaciones

```
=== Results: 21 PASS / 0 FAIL / 21 TOTAL ===
```

Validaciones previas tambien pasan:
- validate-tiendas-assortment-rules-engine: 45/45 PASS
- validate-tiendas-active-inventory: 37/37 PASS
