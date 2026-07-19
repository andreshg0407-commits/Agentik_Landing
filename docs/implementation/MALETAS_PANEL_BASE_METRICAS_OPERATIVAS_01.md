# MALETAS-PANEL-BASE-METRICAS-OPERATIVAS-01

Sprint: Correccion y validacion de las 6 metricas base del panel principal de Maletas.

## Regla central

Una referencia pertenece a la maleta solo cuando `net_qty > 0` en la bodega del vendedor (ya aplicada por `buildVendorBalanceQuery()` en `vendor-sample-presence-engine.ts`). Referencias retiradas quedan excluidas de toda logica operacional.

---

## 1. Tabla de auditoria (Phase 1)

| Metrica | Fuente anterior | Formula anterior | Fuente correcta | Formula correcta |
|---|---|---|---|---|
| A. En maleta | `vendor.totalRefs` | count de refs con net_qty > 0 | `vendor.totalRefs` | Sin cambio (ya correcto) |
| B. Salud comercial | `vendor.healthyCommercialRefs` | count de refs con commercialHealth=HEALTHY | `SUM(idealEffective)` de derroteros activos | `effectiveIdealTotal` de `getVendorMalletBaseMetrics()` |
| C. Presencia catalogo | `intel.coveragePct` | breadth SAG catalog (refs con stock / total refs) | Cobertura consolidada de derroteros | `completedRouteEntries / totalRouteEntries * 100` |
| D. Maleta activa (card) | `v.isActive` | Solo flag administrativo | `v.isActive && v.totalRefs > 0` | Requiere presencia real |
| E. Maletas activas (exec) | `activeVendors.length` (old filter) | Solo `v.isActive` | `activeVendors.length` (new filter) | `v.isActive && v.totalRefs > 0` |
| F. Cobertura comercial (exec) | `(totalRefs - replaceRefs) / totalRefs` | Ratio de refs saludables | Cobertura ponderada de derroteros | `SUM(completedRouteEntries) / SUM(totalRouteEntries) * 100` across active vendors |

---

## 2. Reconciliacion B48 (Phase 2)

Datos de presencia vendedor provienen de SAG via `buildVendorBalanceQuery()` (line 90, `vendor-sample-presence-engine.ts`), que ya filtra `WHERE net_qty > 0`. La reconciliacion contra Prisma no aplica: los saldos por bodega son exclusivamente SAG.

Vendedores activos confirmados: ORLANDO (B45), NESTOR (B48).
Vendedores inactivos: CARLOS_LEON (B46), LUIS (B47), CARLOS_VILLA (B49), FREDY (B50).

---

## 3. Catalogos de surtido (Phase 3)

Catalogos hardcoded en `castillitos-mallet-assortment-catalog.ts`:

| Catalogo | Entries | Ideal oficial |
|---|---|---|
| CS Textil (Nina Bebe + Nino Bebe + Nina Kids + Nino Kids) | 32 | 63 |
| LT Textil | 11 | 38 |
| Import Accesorios | 3 | 23 |
| **Total** | **46** | **124** |

`idealEffective = customIdeal ?? officialIdeal` (overrides en `AssortmentIdealOverride` Prisma model).

---

## 4. Archivos modificados

### `lib/comercial/maletas/maletas-functional-evaluation.ts`
- Added `VendorMalletBaseMetrics` interface
- Added `getVendorMalletBaseMetrics()` domain function

### `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx`
- `activeVendors` filter: `v.isActive && v.totalRefs > 0`
- `inactiveVendors` filter: `!v.isActive || (v.isActive && v.totalRefs === 0)`
- `liveAssortmentEvals` state + `useEffect` sync from props
- `baseMetricsMap` useMemo computing metrics per vendor
- Executive summary "Cobertura comercial" uses derrotero-based IIFE
- Executive summary "Maletas activas" uses new filter
- `ExecKpi` component: added `tooltip` prop
- `VendorMetric` component: added `tooltip` prop
- VendorCard "En maleta" -> `baseMetrics.activeReferenceCount`
- VendorCard "Salud comercial" -> `baseMetrics.effectiveIdealTotal`
- VendorCard "Presencia catalogo" -> `baseMetrics.routeCoveragePct`
- `DerroteroIdealPanel`: `onEvalChange` prop wired in both `saveIdealOverride` and `restoreOfficialIdeal`
- Optimistic propagation: ideal edits update parent `liveAssortmentEvals` -> `baseMetricsMap` -> VendorCard metrics immediately

---

## 5. Tooltips (Phase 7)

| Metrica | Tooltip |
|---|---|
| Maletas activas (exec) | "Maletas administrativamente activas con al menos una referencia presente." |
| Cobertura comercial (exec) | "Cobertura consolidada de los derroteros de las maletas activas." |
| En maleta (card) | "Referencias actualmente presentes en la bodega del vendedor. No incluye referencias retiradas ni registros del Vault." |
| Salud comercial (card) | "Cantidad optima de muestras definida por los derroteros activos de esta maleta." |
| Presencia catalogo (card) | "Porcentaje de necesidades del derrotero actualmente cubiertas." |

---

## 6. Flujo de actualizacion optimista (Phase 8)

```
DerroteroIdealPanel.saveIdealOverride()
  -> applyIdealOverride(prev, ...) -> updated: VendorAssortmentResult
  -> setLocalEval(updated)  // local panel state
  -> onEvalChange(updated)  // propagate to parent
    -> setLiveAssortmentEvals(prev.map(...))  // parent state
      -> baseMetricsMap recalculates (useMemo)
        -> VendorCard re-renders with new effectiveIdealTotal + routeCoveragePct
        -> Executive summary re-renders with new global coverage
```

Same flow for `restoreOfficialIdeal()`.

---

## 7. Exclusiones explicitas (no modificado)

- Chips: Agotado / Stock bajo / Riesgo / Escasez
- Score DEBIL / ACEPTABLE / SALUDABLE
- Acciones pendientes
- Produccion / Recompra / Oportunidades
- Derroteros (section content, only wiring changed)
- Referencias (drawer content)
- Health bar visualization (green/amber/red proportions)

---

## 8. Validacion visual (Phase 9)

Para verificar en el browser:

1. **Maletas activas**: Debe mostrar solo vendedores con `isActive=true` Y al menos 1 referencia. Vendedores activos sin referencias van a la seccion "Inactivas / sin datos".
2. **Cobertura comercial**: Porcentaje consolidado de entradas de derrotero cubiertas. Con 46 entradas totales por maleta, si una maleta cubre 30/46 = 65%.
3. **En maleta (card)**: Numero de referencias con net_qty > 0 en bodega del vendedor.
4. **Salud comercial (card)**: Suma de ideales efectivos de todos los derroteros. Base: 124 (sin overrides).
5. **Presencia catalogo (card)**: `completedEntries / totalEntries * 100`. 46 entradas base.
6. **Editar ideal**: Al cambiar un ideal en el panel de derroteros, "Salud comercial" y "Presencia catalogo" deben recalcularse inmediatamente sin recargar.

---

## 9. TSC

TSC run launched. Baseline: 155 errors (all pre-existing). No new type errors expected — all changes are type-safe (`applyIdealOverride` returns `VendorAssortmentResult`, `onEvalChange` accepts `VendorAssortmentResult`).
