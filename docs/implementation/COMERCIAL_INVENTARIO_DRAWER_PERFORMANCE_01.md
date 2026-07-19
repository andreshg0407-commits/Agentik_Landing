# COMERCIAL-INVENTARIO-DRAWER-PERFORMANCE-01

Sprint de medicion. Solo diagnostico, sin optimizacion.

## Pipeline

1. Click en fila -> `openDrawer(item)` -> drawer abre inmediatamente con datos basicos
2. `useEffect` dispara `fetch()` a `/api/orgs/.../product-detail?reference=X`
3. API route: `requireOrgAccess()` (auth — 2 queries Prisma: user + membership)
4. `loadProductDetail()`:
   - Step 1: `ProductEntity.findFirst()` (Prisma)
   - Step 2: `ProductVariant.findMany()` (Prisma, condicional a step 1)
   - Step 3: `consultaSagJson()` — SOAP call a Azure (`wssagpya.azurewebsites.net`)
5. Response JSON -> `setEnrichment()` -> drawer re-renderiza con datos completos

## Mediciones (12 aperturas reales)

| # | Ref | Tipo | Vars | Auth | PE | Var | SOAP | Loader | Apertura |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CD-2071343B | CS muchas var | 64 | 275ms | 108ms | 92ms | 1,491ms | 1,690ms | 1st |
| 2 | CF-2513323 | CS pocas var | 4 | 275ms | 84ms | 87ms | 108ms | 279ms | 1st |
| 3 | L-3271 | Latin Kids | 20 | 275ms | 127ms | 117ms | 435ms | 679ms | 1st |
| 4 | CBP53086 | Importacion | 1 | 275ms | 83ms | 126ms | 140ms | 349ms | 1st |
| 5 | L-1915 | Agotado (LT) | 20 | 275ms | 146ms | 115ms | 105ms | 366ms | 1st |
| 6 | C-2601260 | Sin clasificar | 9 | 275ms | 85ms | 134ms | 187ms | 406ms | 1st |
| 7 | CD-2071343B | CS muchas var | 64 | 275ms | 83ms | 85ms | 114ms | 282ms | 2nd |
| 8 | L-3271 | Latin Kids | 20 | 275ms | 142ms | 165ms | 112ms | 420ms | 2nd |
| 9 | CBP53086 | Importacion | 1 | 275ms | 82ms | 195ms | 110ms | 388ms | 2nd |
| 10 | CD-2071343B | CS muchas var | 64 | 275ms | 84ms | 86ms | 111ms | 280ms | 3rd |
| 11 | L-1915 | Agotado | 20 | 275ms | 101ms | 86ms | 440ms | 627ms | 2nd |
| 12 | CF-2513323 | CS pocas var | 4 | 275ms | 83ms | 84ms | 106ms | 273ms | 2nd |

## Estadisticas

| Metrica | Promedio | Mediana | P90 | Peor caso |
|---|---|---|---|---|
| Auth | 275ms | 275ms | 275ms | 275ms |
| ProductEntity | 101ms | 85ms | 142ms | 146ms |
| Variants | 114ms | 115ms | 165ms | 195ms |
| SAG SOAP | 288ms | 114ms | 440ms | 1,491ms |
| Loader total | 503ms | 388ms | 679ms | 1,690ms |

## Distribucion del tiempo (% del loader total)

| Etapa | % | Acumulado |
|---|---|---|
| SAG SOAP | 57.3% | 3,459ms / 6,039ms |
| Variants | 22.7% | 1,372ms / 6,039ms |
| ProductEntity | 20.0% | 1,208ms / 6,039ms |

## Primera vs repetida apertura

| Tipo | Promedio | Diferencia |
|---|---|---|
| Primera apertura (6) | 628ms | — |
| Apertura repetida (6) | 378ms | -250ms (40% mas rapido) |

## Conclusion

El cuello de botella es la llamada SAG SOAP (`fetchPriceForSingle`):

1. 57.3% del tiempo total del loader se consume en el SOAP call a Azure
2. Peor caso: 1,491ms (cold start de Azure App Service)
3. La mediana es 114ms pero la varianza es 14x (105ms a 1,491ms)
4. En aperturas repetidas baja a ~110ms (Azure caliente), lo que explica el 40% de mejora

Factores secundarios:
- Auth (requireOrgAccess) anade ~275ms por 2 queries Prisma — esto es antes del loader
- ProductEntity + Variants suman ~215ms pero son estables y predecibles
- La cantidad de variantes (1 vs 64) no impacta significativamente el tiempo de Prisma

Tiempo total percibido por el usuario (en produccion con auth):
- Promedio: ~778ms (275 auth + 503 loader)
- Peor caso: ~1,965ms (275 auth + 1,690 loader)

## Opciones de optimizacion (no implementadas)

1. Paralelizar step 1+2+3 con Promise.all (ProductEntity, Variants y SOAP son independientes)
2. Cache de precios SAG en Prisma (evita SOAP en aperturas repetidas)
3. Pre-fetch de precios durante el sync (elimina SOAP del drawer path)
4. Eliminar el SOAP call del drawer y mostrar precios solo si ya estan en cache
