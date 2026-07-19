# TIENDAS-INVENTORY-AUDIT-01

**Tenant:** Castillitos (cmmpwstuf000dp5y58kj1daaj)
**Date:** 2026-07-05
**Status:** COMPLETE

---

## Executive Answer

**A) El inventario SI existe. Las reglas todavia no estan configuradas.**

Castillitos tiene 157,101 registros de inventario (ProductInventoryLevel) distribuidos en 39 bodegas SAG. De esas, 16 son tiendas retail activas con inventario real sincronizado. El sistema de surtido funciona con datos reales pero opera con defaults (min=4, ideal=8) porque no hay StoreReplenishmentRules configuradas por admin ni por politicas.

---

## 1. Total tiendas detectadas

**16 tiendas retail activas** pasan los filtros del adapter (`isRetailWarehouse` + `active`).

Hay 49 bodegas SAG en total, clasificadas asi:
- 1 MAIN (Bodega Principal, WH 10)
- 16 RETAIL activas (franquicias F-stores + bodegas nombradas)
- 1 RETAIL inactiva (Pagina Web, WH 30)
- 29 NON-RETAIL (produccion, importacion, vendedores, materia prima)
- 2 UNCLASSIFIED (Temporal Flamingo WH 28, IMPO CONETNEDOR 7-3 WH 57 — typo)

## 2-6. Inventario por tienda

| WH | Codigo SAG | Nombre | Productos | Variantes | Unidades | Ultima Sync |
|----|-----------|--------|-----------|-----------|----------|-------------|
| 11 | 02 | BODEGA SANDIEGO | 2,194 | 15,904 | 977 | 2026-06-30 |
| 12 | 03 | BODEGA MAYORCA | 819 | 7,477 | 808 | 2026-06-30 |
| 17 | 08 | F1 - PAQUE BERRIO | 62 | 383 | 0 | 2026-06-23 |
| 18 | 10 | F6 - BELLO | 80 | 434 | 20 | 2026-06-23 |
| 19 | 09 | F3 - BOLIVAR | 77 | 467 | 0 | 2026-06-23 |
| 20 | 11 | F7 - ARMENIA | 44 | 328 | 0 | 2026-06-23 |
| 21 | 12 | F9 - PEREIRA | 39 | 319 | 1 | 2026-06-23 |
| 22 | 13 | F16 - CENT MAY BOGOT | 59 | 344 | 5 | 2026-06-23 |
| 23 | 14 | F17 - MAYORCA | 69 | 342 | 0 | 2026-06-23 |
| 24 | 15 | F10 - IBAGUE | 64 | 353 | 10 | 2026-06-23 |
| 29 | 21 | F19 - MONTERIA | 0 | 0 | 0 | never |
| 31 | 00 | BODEGA CENTRO | 2,154 | 10,351 | 1,273 | 2026-06-30 |
| 32 | 23 | GRAN PLAZA | 1,669 | 8,015 | 930 | 2026-06-30 |
| 38 | 28 | PLAN SEPARE | 55 | 354 | 0 | 2026-06-23 |
| 39 | 29 | BODEGA CALDAS | 1,335 | 5,852 | 884 | 2026-06-30 |
| 52 | 41 | DEXCATO. MC | 220 | 354 | 0 | 2026-06-23 |

### Bodega principal (fuente de surtido)

| WH | Nombre | Productos | Variantes | Unidades | Ultima Sync |
|----|--------|-----------|-----------|----------|-------------|
| 10 | BODEGA PRINCIPAL | 3,340 | 50,422 | 20,938 | 2026-06-30 |

## 3. Tiendas con 0 variantes

**1 tienda:** F19 - MONTERIA (WH 29) — no tiene registros PIL. La bodega existe en SAG BODEGAS pero nunca fue sincronizada.

## 4. Tiendas con 0 unidades disponibles

**7 tiendas** tienen registros PIL pero 0 unidades netas (quantity - reservedQty <= 0):

| WH | Nombre | Registros PIL | Productos |
|----|--------|--------------|-----------|
| 17 | F1 - PAQUE BERRIO | 383 | 62 |
| 19 | F3 - BOLIVAR | 467 | 77 |
| 20 | F7 - ARMENIA | 328 | 44 |
| 23 | F17 - MAYORCA | 342 | 69 |
| 38 | PLAN SEPARE | 354 | 55 |
| 52 | DEXCATO. MC | 354 | 220 |
| 29 | F19 - MONTERIA | 0 | 0 |

Estas tiendas tienen registros de inventario (saben QUE referencias manejan) pero reportan 0 disponibles. Esto puede ser:
- Stock agotado legitimamente
- Sync desactualizada (ultima sync 2026-06-23, 12 dias atras)
- Cantidad negativa en PIL (se observaron valores de quantity como -2, -1, -18)

## 5. Top 5 tiendas por unidades

| # | WH | Nombre | Unidades |
|---|---|----|----------|
| 1 | 31 | BODEGA CENTRO | 1,273 |
| 2 | 11 | BODEGA SANDIEGO | 977 |
| 3 | 32 | GRAN PLAZA | 930 |
| 4 | 39 | BODEGA CALDAS | 884 |
| 5 | 12 | BODEGA MAYORCA | 808 |

## 6. Top 5 tiendas por referencias

| # | WH | Nombre | Productos |
|---|---|----|-----------|
| 1 | 11 | BODEGA SANDIEGO | 2,194 |
| 2 | 31 | BODEGA CENTRO | 2,154 |
| 3 | 32 | GRAN PLAZA | 1,669 |
| 4 | 39 | BODEGA CALDAS | 1,335 |
| 5 | 12 | BODEGA MAYORCA | 819 |

## 7. Hallazgos criticos

### 7.1 externalRef NO es una referencia de producto

PIL `externalRef` contiene el codigo SAG de bodega (`ss_codigo`), NO el SKU del producto:
- Valores: "00", "01", "02", ..., "49" (39 valores distintos = 39 bodegas)
- El adapter usaba `externalRef` como fallback para `referenceCode` — siempre resolvia a un solo "ref" por bodega

El SKU real viene de:
- `variant.sku` (e.g. "00276CH|GEN|GEN", "24-14|GEN|AM1")
- `product.sku` (e.g. "00276CH", "C-2401140")

**Impacto:** El primer audit run mostraba "1 ref" por bodega — esto era externalRef, no el SKU real. El adapter correcto (via `getStoreInventoryByWarehouse`) ya usa variant/product joins, no externalRef.

### 7.2 Variantes con talla/color

Atributos de ProductVariantAttribute confirman datos reales:
- Keys: `talla`, `color`
- Valores: "GEN" (generico), "GRIS", "GENERICO", etc.
- Formato variant SKU: `{ref}|{talla}|{color}` (e.g. "0672-4|GEN|GR1")

### 7.3 Cantidades negativas

Se observaron valores de `quantity` negativos en PIL (e.g. -2, -1, -18 en WH 10). El adapter usa `Math.max(0, quantity - reservedQty)` — correcto, pero indica datos SAG con inconsistencias.

### 7.4 Sin admin warehouse configs

0 registros `STORE_WAREHOUSE_CONFIG`. Todas las tiendas se descubren automaticamente via PIL + BODEGAS lookup. No hay configuracion manual de:
- Responsable de tienda
- Ciudad
- Tipo de tienda (todas default "tienda")

### 7.5 Sin reglas de reposicion

0 `StoreReplenishmentRule` configuradas. El adapter usa defaults fijos:
- `minUnits: 4`
- `idealUnits: 8`

Los motores de necesidades/sugerencias operan con estos defaults.

## 8. Sincronizacion

Dos grupos de sync:

| Grupo | Fecha | Bodegas |
|-------|-------|---------|
| Reciente | 2026-06-30 | WH 10, 11, 12, 13, 30, 31, 32, 33, 39 |
| Anterior | 2026-06-23 | WH 17-28, 36-60 |

Diferencia: 7 dias. Las franquicias (F-stores) no se sincronizaron en la ultima corrida.

---

## Recomendacion tecnica

### Conclusion: Escenario A confirmado

El inventario de tienda **SI fue importado desde SAG** y es real:
- 157,101 registros PIL con product/variant joins funcionales
- 4,565 productos y 53,338 variantes con SKUs reales
- BODEGAS lookup con 49 bodegas clasificadas
- 16 tiendas retail activas identificables

### Accion inmediata: nada que corregir en el adapter

El `sag-store-adapter.ts` ya resuelve correctamente las tiendas via PIL + BODEGAS lookup + isRetailWarehouse(). Los 16 stores se muestran en el dashboard.

### Acciones recomendadas (futuras, no bloqueantes)

1. **Configurar admin warehouse configs** — asignar responsables, ciudades, tipos a las 16 tiendas
2. **Configurar politicas de reposicion** — reemplazar defaults (min=4, ideal=8) con reglas por categoria/linea/tienda
3. **Investigar cantidades negativas** — 9 tiendas con 0 unidades disponibles puede indicar stock agotado o sync desactualizada
4. **Sincronizar F-stores** — las franquicias tienen datos del 2026-06-23, 12 dias mas antiguos que las bodegas principales
5. **F19 - MONTERIA** — existe en BODEGAS pero sin PIL data. Verificar si es una tienda nueva o inactiva
