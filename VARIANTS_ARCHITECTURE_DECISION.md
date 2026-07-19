# VARIANTS_ARCHITECTURE_DECISION.md

**Sprint:** SAG-VARIANTS-01 — Phase 9
**Date:** 2026-06-23
**Author:** Agentik Engineering
**Status:** APPROVED

---

## 1. Hallazgos

### 1.1 No existe tabla dedicada de inventario o variantes

Se probaron **56 nombres de tabla** en dos rondas de forensics:

**Ronda 1 (37 tablas):** INVENTARIO, EXISTENCIAS, KARDEX, STOCK, VARIANTES, SKU, ARTICULOS_TALLAS, ARTICULOS_COLORES, ARTICULOS_TALLAS_COLORES, ARTICULOS_VARIANTES, ARTICULOS_SKU, ARTICULOS_INVENTARIO, INVENTARIO_BODEGA, INVENTARIO_TALLAS, EXISTENCIAS_BODEGA, STOCK_BODEGA, KARDEX_BODEGA, SALDOS_INVENTARIO, REFERENCIAS, REFERENCIAS_TALLAS, PRODUCTOS, PRODUCTOS_TALLAS, EAN, BARRA, CODIGO_BARRAS, ARTICULOS_BARRA, LOTES, ARTICULOS_LOTES, COMBINACIONES, ARTICULOS_COMBINACIONES, PRECIOS_TALLAS, LISTA_PRECIOS_TALLAS, MOVIMIENTOS_KARDEX, KARDEX_ITEMS, INVENTARIO_ITEMS, STOCK_ITEMS, EXISTENCIAS_ITEMS

**Ronda 2 (19 tablas):** SALDOS_INV, SALDOS_INV_TALLA, SALDOS_INVENTARIO_TALLA, INV_SALDOS, INV_ARTICULOS, INV_TALLAS, INV_BODEGAS, TALLAS_X_COLOR, TALLAS_COLORES_ARTICULOS, ART_TALLAS, ART_COLORES, ART_TALLAS_COLORES, V_INVENTARIO, V_SALDOS_INV, V_EXISTENCIAS, V_STOCK, SALDOS_INV_TALLA_COLOR, SALDO_INV_ART_BOD_TAL_COL, SALDOS_INVENTARIO_BODEGA

**Resultado:** Todas retornaron `Invalid object name`. SAG PYA no mantiene una tabla de saldos de inventario.

### 1.2 La tabla SALDOS existe pero es contable

SALDOS tiene 1.16M filas con campos `k_sc_periodo` y `k_sc_codigo_cuenta`. Es una tabla de **balances contables**, no de inventario. No tiene `ka_nl_bodega`.

### 1.3 Las variantes viven en MOVIMIENTOS_ITEMS

MOVIMIENTOS_ITEMS (77 campos) contiene los campos de variante en cada linea de transaccion:

| Campo | Tipo | Ejemplo | Significado |
|---|---|---|---|
| `ka_nl_articulo` | int | 267 | FK al articulo (PK numerico) |
| `ss_talla` | string | "6-9", "T2", "XS" | Codigo de talla |
| `ss_color` | string | "BL1", "AZ1", "RO1" | Codigo de color |
| `ka_nl_bodega` | int | 10, 15, 22 | FK a bodega (tienda) |
| `ka_nl_sku` | int | 1..64254 | PK unico por variante |
| `n_cantidad` | decimal | 5.0 | Cantidad movida |

### 1.4 El stock se computa desde transacciones

No hay saldo precalculado. El inventario actual se obtiene sumando movimientos con signo:

```sql
SELECT
  A.k_sc_codigo_articulo,
  MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku,
  SUM(CASE WHEN F.sc_signo_inventario = '+'
       THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
FROM MOVIMIENTOS_ITEMS MI
INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
INNER JOIN ARTICULOS A ON MI.ka_nl_articulo = A.ka_nl_articulo
WHERE F.sc_afecta_inventario = 'S'
  AND M.sc_anulado = 'N'
  AND A.sc_activo = 'S' AND A.sc_bloqueado = 'N'
  AND A.n_valor_venta_normal > 0 AND A.sc_maneja_kardex = 'S'
GROUP BY A.k_sc_codigo_articulo, A.sc_detalle_articulo,
         MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku
HAVING SUM(CASE WHEN F.sc_signo_inventario = '+'
           THEN MI.n_cantidad ELSE -MI.n_cantidad END) <> 0
```

El signo viene de `FUENTES.sc_signo_inventario` ('+' o '-'). Solo cuentan movimientos no anulados (`MOVIMIENTOS.sc_anulado = 'N'`).

---

## 2. Tablas reales del modelo de variantes

| Tabla | Filas | Campos | Rol |
|---|---|---|---|
| **MOVIMIENTOS_ITEMS** | 3,300,000+ | 77 | Lineas de transaccion con talla/color/bodega/sku/cantidad |
| **MOVIMIENTOS** | ~200,000+ | 66 | Cabecera de transaccion (fecha, fuente, anulado) |
| **FUENTES** | 121 (afectan inv.) | 359 | Tipo de documento — define signo inventario (+/-) |
| **ARTICULOS** | 10,439 | 182 | Maestro de productos (4,561 comerciales) |
| **COLORES** | 88 | ~5 | Lookup: ss_codigo -> ss_nombre |
| **TALLAS** | 36 | ~4 | Lookup: codigo talla |
| **BODEGAS** | 49 | ~8 | Lookup: ka_nl_bodega -> ss_nombre (tiendas fisicas) |

---

## 3. Relaciones

```
ARTICULOS (ka_nl_articulo)
    |
    +--< MOVIMIENTOS_ITEMS (ka_nl_articulo)
              |
              +--- ss_talla     --> TALLAS (codigo)
              +--- ss_color     --> COLORES (ss_codigo)
              +--- ka_nl_bodega --> BODEGAS (ka_nl_bodega)
              +--- ka_nl_sku    --> identidad unica de variante
              +--- n_cantidad   --> cantidad movida
              |
              +---> MOVIMIENTOS (ka_nl_movimiento)
                        |
                        +--- sc_anulado = 'N' (filtro)
                        +---> FUENTES (ka_ni_fuente)
                                  |
                                  +--- sc_afecta_inventario = 'S'
                                  +--- sc_signo_inventario = '+' | '-'
```

---

## 4. Cardinalidades (datos reales Castillitos)

| Dimension | Cantidad | Fuente |
|---|---|---|
| Articulos totales | 10,439 | SELECT COUNT(*) FROM ARTICULOS |
| Articulos comerciales | 4,561 | Filtro R2 (activo, no bloqueado, precio>0, kardex) |
| Articulos con talla | 4,479 | Distinct en MOVIMIENTOS_ITEMS con talla no vacia |
| Colores distintos en uso | 86 | Distinct ss_color en MOVIMIENTOS_ITEMS |
| Tallas distintas en uso | 35 | Distinct ss_talla en MOVIMIENTOS_ITEMS |
| Bodegas (tiendas) | 49 | SELECT COUNT(*) FROM BODEGAS |
| SKUs distintos | 64,254 | Distinct ka_nl_sku en MOVIMIENTOS_ITEMS |
| Combos articulo+talla+color | 60,376 | Distinct en MOVIMIENTOS_ITEMS |
| Filas de movimiento | 3,119,725 | Con talla no vacia y articulo activo |
| Fuentes que afectan inventario | 121 | sc_afecta_inventario = 'S' |

---

## 5. Ejemplos (datos reales, validacion con 20 productos)

### Producto C-2153329 (precio alto)

| Talla | Color | Color Name | Total | Bodegas |
|---|---|---|---|---|
| 6-9 | BL1 | BLANCO | 12 | BODEGA PRINCIPAL:8, OUTLET:4 |
| 6-9 | AZ1 | AZUL | 7 | BODEGA PRINCIPAL:5, CEDIS:2 |
| 12-18 | BL1 | BLANCO | 15 | BODEGA PRINCIPAL:10, OUTLET:5 |
| 12-18 | RO1 | ROJO | 3 | CEDIS:3 |

**Observacion:** Un mismo producto tiene 4+ variantes con stock diferente por bodega. Sincronizar solo a nivel referencia perderia esta informacion critica.

### Evaluacion para Pedidos

| Capacidad | Disponible | Evidencia |
|---|---|---|
| Seleccion de talla | SI | ss_talla en cada variante |
| Seleccion de color | SI | ss_color con nombre resuelto via COLORES |
| Bloquear agotados | SI | saldo computable por variante |
| Sugerir variantes disponibles | SI | listar solo variantes con saldo > 0 |
| Disponibilidad por bodega | SI | ka_nl_bodega en cada fila |

---

## 6. Riesgos

### 6.1 Performance del query de inventario

El query computa saldos desde 3.3M+ filas de transacciones. Mitigaciones:
- Filtro por articulo especifico (`WHERE A.k_sc_codigo_articulo = ?`) para consultas puntuales
- Sync batch con HAVING <> 0 elimina variantes sin stock
- Indexar resultado en memoria despues del primer fetch

### 6.2 Movimientos no anulados incorrectamente

Si un movimiento deberia estar anulado pero no lo esta (`sc_anulado = 'N'` incorrecto), el saldo seria erroneo. Mitigacion: este es un problema de datos en SAG, no de nuestro modelo.

### 6.3 Fuentes sin signo definido

Si una FUENTE tiene `sc_signo_inventario` diferente de '+' o '-', el CASE asume '-'. Mitigacion: las 121 fuentes que afectan inventario tienen signo definido (verificado en forensics).

### 6.4 Latencia SOAP

Cada consulta pasa por SOAP XML. Para sync completo (~60K combos), el query tarda segundos pero es una sola llamada. Para consultas en tiempo real (ej: verificar stock al crear pedido), considerar cache local.

---

## 7. Opciones evaluadas

### Opcion A: Sincronizar por referencia (solo articulo)

- ProductEntity = 1 registro por articulo
- Stock = suma total sin desglose
- Pedidos no podrian seleccionar talla/color
- **Descarta informacion que SAG ya provee**

### Opcion B: Sincronizar por variante (articulo + talla + color + bodega)

- Cada combinacion unica tiene su propio registro de inventario
- Stock desglosado por bodega (tienda)
- Pedidos pueden seleccionar talla+color exactos
- Pedidos pueden validar disponibilidad antes de confirmar
- **Preserva el modelo completo de SAG**

---

## 8. Recomendacion final

**SINCRONIZAR POR VARIANTE (Opcion B)**

### Justificacion tecnica

1. **El 98.2% de productos comerciales manejan talla/color** (4,479 de 4,561). Sincronizar sin variantes seria ignorar el modelo de negocio.

2. **Stock a nivel referencia es inutil** — suma variantes con distinto saldo. Saber que hay "50 unidades de C-2153329" no dice nada si talla 6-9/BLANCO tiene 12 y talla 12-18/ROJO tiene 3.

3. **Pedidos necesita talla+color** para crear lineas de pedido validas contra SAG. Sin variantes, el pedido seria ambiguo.

4. **MOVIMIENTOS_ITEMS ya entrega el desglose completo** — no hay trabajo adicional para obtenerlo. El query es el mismo, solo cambia el GROUP BY.

5. **Las 49 bodegas son tiendas reales** — stock por bodega es operacionalmente necesario para despacho, transferencias, y surtido.

6. **ka_nl_sku (64,254 valores)** prueba que SAG internamente modela variantes como entidades independientes. Nuestro modelo debe reflejar esa realidad.

### Modelo de datos propuesto (sprint futuro)

```
ProductEntity (existente)
  +--- externalId = k_sc_codigo_articulo
  +--- metadata: grupo, linea, subgrupo, marca (ya enriquecido)

ProductVariant (nuevo — sprint futuro)
  +--- productId -> ProductEntity
  +--- sizeCode, sizeName
  +--- colorCode, colorName
  +--- sagSkuId (ka_nl_sku)

VariantInventory (nuevo — sprint futuro)
  +--- variantId -> ProductVariant
  +--- warehouseId, warehouseCode, warehouseName
  +--- available (computed stock)
  +--- lastSyncedAt
```

### Implementacion actual (SAG-VARIANTS-01)

Este sprint entrega:
- **Tipos**: `sag-variants-types.ts` — contratos completos
- **Normalizador**: `sag-variants-normalizer.ts` — limpia y resuelve nombres
- **Sync service**: `sag-variants-sync.ts` — fetch + normalize + aggregate (dry run, sin DB)
- **Query definitivo**: `SAG_VARIANT_INVENTORY_QUERY` — el SQL que computa inventario actual

Todo listo para el sprint de persistencia (DB writes + Prisma models).

---

## Apendice: Archivos del sprint

| Archivo | Proposito |
|---|---|
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-types.ts` | Contratos de tipos |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-normalizer.ts` | Normalizador + agregador |
| `lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-sync.ts` | Servicio de sync |
| `scripts/_sag-variants-forensics.ts` | Forensics ronda 1 (37 tablas) |
| `scripts/_sag-variants-forensics-2.ts` | Forensics ronda 2 (19 tablas + deep probe) |
| `scripts/_sag-variants-validation.ts` | Validacion comercial (20 productos reales) |
| `VARIANTS_ARCHITECTURE_DECISION.md` | Este documento |
