# TIENDAS-ACTIVE-INVENTORY-AND-ASSORTMENT-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 37/37 PASS

---

## Causa del ruido

El motor de Tiendas trataba TODOS los registros de `ProductInventoryLevel` como inventario operativo activo. Con 15,910 PIL records para WH 11, de los cuales solo 977 tenían stock disponible, el sistema generaba:

- 15,328 "sin stock"
- 15,742 "criticas"
- ~4% cobertura

Esto es historial agotado — no surtido faltante real.

---

## Diferencia entre inventario historico y activo

| Concepto | Definicion | Ejemplo |
|---|---|---|
| **Inventario activo** | PIL con `availableQty > 0` | ALMOHADA PARA BEBE: 3 uds |
| **Inventario historico** | PIL con `availableQty = 0`, sin regla aplicable | PELUCHE descontinuado: 0 uds, sin regla de surtido |
| **Faltante esperado** | PIL con `availableQty = 0` Y regla de surtido activa | Pijama corta que la tienda DEBE tener: 0 uds, regla dice min=1 |

El historial no genera alertas. Solo el surtido esperado (definido por reglas) genera faltantes.

---

## Nueva definicion de faltante operativo

Un faltante solo existe cuando:

1. **Stock > 0 pero bajo minimo** — item activo debajo del umbral de la regla aplicable
2. **Stock = 0 con regla aplicable** — el surtido esperado dice que la tienda debe tener este producto

NO es faltante cuando:

- Stock = 0 sin regla (historial agotado)
- Stock = 0 sin reglas configuradas para la tienda (neutral)
- Item no pertenece al surtido esperado

---

## Resolucion de umbrales

Cuando existe una `StorePolicyRule` aplicable, se usa:
- `rule.minQty` en vez del hardcoded `minUnits: 4` del adapter
- `rule.idealQty` en vez del hardcoded `idealUnits: 8` del adapter

Cuando no existe regla:
- Items con stock > 0: se evaluan con los defaults del adapter
- Items con stock = 0: se ignoran (no son surtido esperado)

Cadena de resolucion de reglas (mas especifica gana):
1. `variant_override` — ref + talla + color exactos
2. `reference` — ref exacta
3. `line_subgroup` — linea + subgrupo
4. `subgroup` — subgrupo solo
5. `line` — linea sola
6. `class_size` — clase de producto + tamaño
7. `productClass` — clase de producto sola
8. `store` — default de tienda

---

## Deteccion de gaps por subgrupo

Nuevo concepto: `SubgroupAssortmentGap`

Una tienda tiene un gap de subgrupo cuando:
- Tiene 0 items activos en un subgrupo/categoria
- Bodega principal tiene stock disponible en ese subgrupo
- Net disponible en bodega = `availableUnits - reservedUnits > 0`

Ejemplo:
> "San Diego no tiene surtido activo en PIJAMA CORTA CORTA. Bodega principal tiene 5 referencias disponibles (23 uds). Sugerido surtir."

Esto NO nace del historial de la tienda. Nace de la diferencia entre lo que la bodega puede ofrecer y lo que la tienda tiene.

---

## Cobertura

### Antes
```
coverage = (total_PIL - belowMin) / total_PIL * 100
// Con 15910 items y 15328 con stock=0: ~4% → "Critica"
```

### Ahora
```
Si no hay reglas: coverage = -1 → UI muestra "Sin reglas" (neutral)
Si hay reglas: coverage = (items_cubiertos / items_esperados) * 100
  - items_esperados = items con regla aplicable
  - items_cubiertos = items con regla aplicable Y stock >= minQty
```

---

## Impacto UI

### Store cards

| Campo | Antes | Ahora (sin reglas) | Ahora (con reglas) |
|---|---|---|---|
| Cobertura | "4%" (rojo) | "Sin reglas" (neutral) | "85%" (real) |
| Status badge | "Critica" (rojo) | "Sin reglas" (gris) | "Todo bien" / "Critica" |
| Metrica izquierda | "Criticas: 15742 refs" | "Activas: 582 refs" | "Faltantes esperados: 3 refs" |
| Metrica derecha | "Advertencias: X" | "Historicas: 15328 refs" | "Advertencias: 1 refs" |

### Drawer — Inventario tab

| Aspecto | Antes | Ahora |
|---|---|---|
| Default | Muestra las 15,910 refs | Muestra solo refs con stock > 0 |
| Summary | "Referencias: 15910 / Unidades: 977 / Sin stock: 15328" | "Refs activas: 582 / Unidades: 977 / Agotados historicos: 15328" |
| Toggle | No existe | "Mostrar agotados historicos (15328)" — desactivado por defecto |
| Copy "Sin stock" | Alarma roja | "Agotados historicos" — gris neutro |

### Copilot signals

| Antes | Ahora |
|---|---|
| "BODEGA SANDIEGO tiene 15742 referencias criticas." | "BODEGA SANDIEGO no tiene reglas de surtido configuradas. Configure reglas para activar alertas de faltantes." |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/active-inventory.ts` | **NUEVO** — helpers: isActiveInventoryItem, hasApplicableRule, findApplicableRule, isExpectedAssortment, filterActiveInventory, detectSubgroupGaps, inferProductClass |
| `lib/comercial/tiendas/store-replenishment-types.ts` | `StoreHealthSummary` +hasRules/activeItemCount/historicalZeroCount. `StoreHealthStatus` +sin_reglas |
| `lib/comercial/tiendas/store-replenishment-engine.ts` | `calculateStoreShortages` acepta policyRules, filtra con isExpectedAssortment, usa umbrales de regla. `calculateStoreHealth` cobertura por surtido esperado, -1 sin reglas. `deriveStoreHealthStatus` devuelve sin_reglas. `buildStoreSuggestions` señal neutral sin reglas |
| `lib/comercial/tiendas/store-replenishment-service.ts` | `computeWorkspace` carga listStorePolicies en paralelo, pasa policyRules al engine. `getStoreDetail` y `getStoreSuggestions` tambien cargan policy rules |
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | STATUS_LABEL/COLOR +sin_reglas. InventarioTab: filtro activo por defecto, toggle historicos, summary "Refs activas". Cards: cobertura "Sin reglas", metricas adaptativas. Drawer: healthStatus rule-aware |
| `scripts/validate-tiendas-active-inventory.ts` | **NUEVO** — 37 checks |

---

## Validaciones

```
=== Results: 37 PASS / 0 FAIL / 37 TOTAL ===
```

1. Registro PIL con availableQty 0 sin regla no genera faltante ✓
2. Registro PIL con availableQty > 0 aparece en inventario activo ✓
3. Variante con regla aplicable y stock 0 si genera faltante ✓
4. Subgrupo objetivo sin stock tienda pero con stock bodega genera oportunidad ✓
5. Subgrupo sin regla no genera miles de criticas ✓
6. Bodega principal con stock 0 no genera oportunidad ✓
7. Inventario tab oculta historicos por defecto ✓
8. Cobertura sin reglas no muestra 100% ni 0% critica; muestra sin reglas ✓
9. TSC baseline 160 ✓
