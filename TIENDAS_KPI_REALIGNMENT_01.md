# TIENDAS-KPI-REALIGNMENT-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 47/47 PASS

---

## Problema

Los KPIs del dashboard de Tiendas no reflejaban operaciones reales de retail:

- **"Historicas"**: contador de PILs con stock=0. Sin valor operativo — solo ruido.
- **"Produccion sugerida"**: las tiendas NO producen. Se surten desde bodega principal.

Estos KPIs ocupaban espacio visual sin generar accion.

---

## Nuevos KPIs

| KPI anterior | KPI nuevo | Por que |
|---|---|---|
| Activas / Faltantes esperados | **Inventario activo** | Refs con stock > 0. Siempre relevante. |
| Historicas / Advertencias | **Cobertura subgrupos** | % de subgrupos con al menos un item activo. Mide amplitud de surtido. |
| Enviar desde bodega | **Oportunidades surtido** | Subgrupos donde falta stock Y la bodega puede enviar. Accionable. |
| Produccion sugerida | **Transferencias** | Sugerencias pendientes de envio desde bodega. Reemplaza produccion. |

---

## Cobertura de subgrupos

Un subgrupo es "cubierto" si la tienda tiene al menos un item activo (currentUnits > 0) en el.

```
coveragePercent = (subgruposCubiertos / subgruposTotales) * 100
```

Si no hay subgrupos observados: `coveragePercent = -1` (UI muestra "—").

---

## Oportunidades de surtido

Una oportunidad existe cuando:
1. La tienda tiene un subgrupo con stock bajo o ausente
2. La bodega principal tiene stock disponible en ese subgrupo

Prioridades:
- **critica** — subgrupo completamente ausente (0 items activos)
- **alta** — subgrupo debajo del minimo (tiene algo pero poco)
- **media** — subgrupo debajo del ideal

"baja" se filtra (ruido).

---

## Umbrales de salud

| Status | Condicion |
|---|---|
| **sin_reglas** | Sin reglas de surtido configuradas |
| **Saludable** | Cobertura subgrupos >= 90% |
| **Atencion** | Cobertura subgrupos 70-89% |
| **Critica** | Cobertura subgrupos < 70% |

---

## Copilot signals

| Antes | Ahora |
|---|---|
| `production_needed`: "X unidades deberian pasar a produccion" | `opportunity_available`: "X oportunidades de surtido disponibles desde bodega principal" |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/active-inventory.ts` | Reemplaza `detectSubgroupGaps`/`SubgroupAssortmentGap` con `computeStoreSubgroupCoverage`/`SubgroupCoverageResult` + `computeStoreReplenishmentOpportunities`/`ReplenishmentOpportunity` |
| `lib/comercial/tiendas/store-replenishment-types.ts` | `StoreHealthSummary`: remueve `productionSuggestions`/`historicalZeroCount`, agrega `subgroupCoveragePercent`/`subgroupsCovered`/`subgroupsExpected`/`replenishmentOpportunities`. Copilot signal type: `opportunity_available` reemplaza `production_needed` |
| `lib/comercial/tiendas/store-replenishment-engine.ts` | `calculateStoreHealth` integra subgroup coverage + opportunities. `deriveStoreHealthStatus` usa umbrales de cobertura (90/70). Copilot signal `opportunity_available` reemplaza `production_needed` |
| `lib/comercial/tiendas/store-replenishment-service.ts` | `computeWorkspace` y `getStoreDetail` pasan `storeName` y `mainStock` al engine |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Card KPIs: Inventario activo, Cobertura subgrupos, Oportunidades surtido, Transferencias. Drawer KPIs: mismos. Status labels: Saludable/Atencion. SUGGESTION_LABEL: "Sin disponibilidad en bodega". Copilot signals: amber para oportunidades |
| `scripts/validate-tiendas-kpi-realignment.ts` | **NUEVO** — 47 checks |
| `scripts/validate-tiendas-active-inventory.ts` | Actualizado para reflejar Sprint 2 (FASE 4 superseded) |

---

## Validaciones

```
=== Results: 47 PASS / 0 FAIL / 47 TOTAL ===
```
