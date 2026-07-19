# TIENDAS-RULE-CATALOG-EMPTY-01

**Status:** COMPLETE
**TSC:** 160 (baseline preserved)
**Validation:** 17/17 PASS

---

## Problema

El formulario de reglas de surtido mostraba:

> "No se encontraron lineas/subgrupos sincronizados desde SAG."

A pesar de que ProductEntity.subgrupoSag y ProductEntity.productLine existian en Prisma.

## Causa raiz

`getStoreRuleCatalog()` construia el catalogo desde `resolveData(orgId).inventory`, que solo contenia inventario de **tiendas descubiertas** (warehouses retail configurados o auto-descubiertos por BODEGAS lookup). Si ningun warehouse retail existia, `inventory` era vacio → catalogo vacio → UI mostraba error.

Los datos reales existian en ProductInventoryLevel (157k+ registros) con joins a ProductEntity (4,565 productos con subgrupoSag al 65%).

## Solucion

### Nueva funcion: `buildRuleCatalogFromPrisma(orgId)`

Archivo: `lib/comercial/tiendas/store-rule-catalog.ts`

Consulta directa a Prisma:
```
ProductInventoryLevel
  → product { productLine, subgrupoSag }
```

- Extrae lineas desde `product.productLine` → label "Linea SAG 1", "Linea SAG 2", etc.
- Extrae subgrupos desde `product.subgrupoSag` → agrupados por linea
- Solo incluye subgrupos con valor real (no null)
- Fallback linea: "Sin linea SAG" cuando productLine es null
- Infiere productClass desde subgrupoSag real

### Service actualizado: `getStoreRuleCatalog(orgId)`

Archivo: `lib/comercial/tiendas/store-replenishment-service.ts`

1. Cache solo devuelve si tiene `lines.length > 0` (invalida catalogos vacios)
2. Primero intenta `buildRuleCatalogFromPrisma(orgId)` (consulta directa)
3. Si falla, cae a `buildRuleCatalog(data.inventory)` (store-filtered, original)

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `lib/comercial/tiendas/store-rule-catalog.ts` | Nueva `buildRuleCatalogFromPrisma()`, `emptyCatalog()`, import prisma |
| `lib/comercial/tiendas/store-replenishment-service.ts` | `getStoreRuleCatalog()` usa nueva funcion, cache invalida vacios |

## Archivos nuevos

| Archivo | Proposito |
|---|---|
| `scripts/validate-tiendas-rule-catalog-empty.ts` | 17 structural checks |

---

## Resultado esperado

Al abrir Reglas de surtido en castillitos:

- Lineas: "Linea SAG 1", "Linea SAG 2", "Linea SAG 5", etc.
- Subgrupos por linea: "PIJAMA CL 2-8", "CONJUNTO CC", "CAMISETA", etc.
- Clases de producto: Textil, Accesorio, Voluminoso, Otro
- Los nombres comerciales de lineas se resolveran en TIENDAS-SAG-LINE-RESOLVER-01

---

## Validaciones

```
=== Results: 17 PASS / 0 FAIL / 17 TOTAL ===
```
