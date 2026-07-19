# TIENDAS-INVENTORY-02 — Sprint Report

## Objetivo
Construir el Motor de Necesidades Reales para Tiendas. Detectar correctamente las necesidades de surtido de cada tienda usando inventario real (PIL), politicas configurables, e inventario de bodega principal.

NO genera transferencias, ordenes, guias ni reemplazos. Solo deteccion.

## Arquitectura

```
PIL (real inventory)     Policy Rules          Main Warehouse Stock
       |                      |                        |
       v                      v                        v
  InventoryItem[]    StorePolicyRule[]      MainWarehouseStock[]
       |                      |                        |
       +----------+-----------+------------------------+
                  |
           calculateStoreNeeds()
                  |
                  v
           StoreNeed[]
                  |
     +------------+------------+
     |            |            |
groupByStore  groupByLine  groupBySubgroup
     |            |            |
     v            v            v
 Summaries    Summaries    Summaries
```

## Flujo Completo

1. `loadStoreNeeds(orgId)` carga datos SAG via `SagCurrentProvider`
2. Carga politicas via `listStorePolicies(orgId)`
3. Para cada tienda, mapea `StoreInventoryVariant[]` → `InventoryItem[]`
4. Infiere `productClass` por heuristicas (size+color = textile, categoria = bulky/accessory)
5. Ejecuta `calculateStoreNeeds()` por tienda
6. Agrega resultados y ordena por prioridad

## Reglas de Evaluacion

### Textil (ref + talla + color)
| Inventario | Regla min=2 | Status | Necesita |
|---|---|---|---|
| 0 | min 2 | **out** | 2 |
| 1 | min 2 | **low** | 1 |
| 2 | min 2, max 3 | **healthy** | 0 |
| 5 | max 3 | **overstock** | 0 |

### Voluminoso/Importacion (por referencia)
| Inventario | Regla min=1 | Status | Necesita |
|---|---|---|---|
| 0 | min 1, max 1 | **out** | 1 |
| 1 | max 1 | **healthy** | 0 |
| 2 | max 1 | **overstock** | 0 |

## Score de Prioridad

| Factor | Puntos |
|---|---|
| Base: out | +100 |
| Base: low | +50 |
| Base: healthy | 0 |
| Base: overstock | -10 |
| Hay stock en bodega principal | +10 |
| Pertenece a linea (no vacia) | +10 |
| Faltante total (qty=0) | +10 |
| Sin stock en bodega principal | -20 |

Ejemplo: Agotado + stock en bodega + linea asignada + faltante total = 130 puntos.

## New Files

| File | Purpose |
|---|---|
| `lib/comercial/tiendas/store-needs-types.ts` | Domain types: StoreNeed, NeedStatus, NeedPolicySource, summaries, engine inputs |
| `lib/comercial/tiendas/store-needs-engine.ts` | Pure engine: calculateStoreNeeds(), groupNeedsByStore/Line/Subgroup(), filterNeeds() |
| `lib/comercial/tiendas/store-needs-service.ts` | Server loader: loadStoreNeeds() — bridges SAG + policies → needs |
| `app/api/orgs/[orgSlug]/comercial/tiendas/needs/route.ts` | API: POST action=load |
| `scripts/validate-store-needs-engine.ts` | 27-check validation |

## Modified Files

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Added "Necesidades" workspace view with table, filters, summaries |

## Not Modified
- No Prisma schema changes
- No SAG adapter changes
- No existing engine changes (store-replenishment-engine.ts untouched)
- No existing types changes (store-replenishment-types.ts untouched)
- No policy engine changes
- No Maletas changes
- No transfer/proposal changes

## Validation Results

```
27 PASS / 0 FAIL

1.  Textile qty=0 → status=out                              PASS
2.  Textile qty=0 → neededQty=2                              PASS
3.  Textile qty=1 → status=low                               PASS
4.  Textile qty=1 → neededQty=1                              PASS
5.  Textile qty=2 → status=healthy                           PASS
6.  Textile qty=5 → status=overstock                         PASS
7.  Bulky uses ref (no talla/color)                          PASS
8.  Bulky mainWarehouseQty resolved by ref (=2)              PASS
9.  Policy source = line_subgroup                            PASS
10. Bulky policy source = class_size                         PASS
11. min=2 from Latin Kids/Camisetas rule                     PASS
12. ideal=2 from Latin Kids/Camisetas rule                   PASS
13. max=3 from Latin Kids/Camisetas rule                     PASS
14. OUT sorted before LOW                                    PASS
15. OUT priority > LOW priority (130 > 70)                   PASS
16. Main stock = 8 for ROJO                                  PASS
17. Main stock = 0 for NEGRO                                 PASS
18. Score higher with main stock than without (130 > 100)    PASS
19. Group by store: 2 stores                                 PASS
20. San Diego: 1 out, 1 healthy                              PASS
21. Group by line: Latin Kids has needs                      PASS
22. Group by subgroup: at least 1                            PASS
23. Filter status=out returns only out                       PASS
24. Filter by store returns correct store                    PASS
25. Global default policy source                             PASS
26. Default textile: min=1, ideal=1, max=2                   PASS
27. Total: 27 PASS / 0 FAIL                                 PASS
```

## TSC Baseline
160 errors (unchanged)

## Lo que ahora podemos responder

- Que necesita cada tienda? → StoreNeed[] por tienda
- Que talla/color esta faltando? → size + color en cada StoreNeed
- Cuantas unidades necesita? → neededQty
- Que tan urgente es? → priorityScore (OUT+stock+linea = 130, OUT sin stock = 100)
- Existe inventario en bodega principal? → mainWarehouseQty
- Donde estan las mayores oportunidades? → sorted by priorityScore desc

## Proximo Sprint Recomendado

**TIENDAS-REPLENISHMENT-SUGGESTIONS-01**: Tomar las necesidades detectadas y convertirlas en sugerencias de reposicion, reemplazo por agotados, y recomendaciones operativas para bodega.
