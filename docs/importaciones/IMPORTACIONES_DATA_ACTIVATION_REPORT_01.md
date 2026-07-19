# IMPORTACIONES_DATA_ACTIVATION_REPORT_01

**Sprint:** GO-LIVE-IMPORTACIONES-DATA-ACTIVATION-01
**Fecha:** 2026-07-09
**Tenant:** Castillitos

---

## Diagnostico de datos

### Identificacion de productos importados

**Criterio aplicado:** `ProductEntity.productLine = "5"`

| Valor investigado | Resultado |
|---|---|
| productLine "IMPORT" | 0 productos (no existe) |
| productLine "IMPORTACION" | 0 productos (no existe) |
| productLine "ACCESORIOS" | 0 productos (no existe) |
| productLine "5" | **657 productos** |
| Todos productLine "5" tienen category "148" | Si |
| Todos productLine "5" tienen externalSource "sag" | Si |

**Como se determino:**
- SAG LINEA "5" mapea a ProductEntity.productLine "5"
- Los 657 productos de LINEA 5 son accesorios importados: almohadas, baneras, caminadores, cepillos bebe, chupos, etc.
- Prefijos externalId confirmados en LINEA 5: C6-, CBP, C7-, C8-, codigos numericos
- El nombre del archivo Excel original era "INFO VENTAS ACC" (accesorios)
- Ninguna otra linea corresponde a productos importados

### Ventas por referencia

**Fuente usada:** `CustomerOrderLine` + `CustomerOrderRecord`

| Dato | Valor |
|---|---|
| Total CustomerOrderLine | 1,140,881 filas |
| Total CustomerOrderRecord | 9,592 ordenes |
| Ordenes FACTURADO | 9,562 |
| Rango de fechas | 2020-06-11 a 2026-07-06 |
| CustomerOrderLine matches para muestra LINEA 5 (20 codigos) | 770 lineas |

**Por que NO se usa SaleRecord:**
- SaleRecord.productCode es NULL en las 129,045 filas de Castillitos
- SaleRecord opera a nivel de cabecera de documento, no a nivel de producto
- CustomerOrderLine.referenceCode = ProductEntity.externalId (join directo)
- CustomerOrderLine tiene quantity por linea de producto

### Canales reales encontrados en SaleRecord (nivel documento)

| Canal | Cantidad | Comprobantes principales |
|---|---|---|
| OTRO | 53,348 | V2, V3, F2, AP, V5, V4 |
| EMPRESA | 42,774 | R1, FE, R2, ND, H1, CP |
| ALMACEN | 31,140 | FD, FG, FA, FC, AN |
| ONLINE | 1,783 | FW |

**Limitacion:** No se puede asignar canal a nivel de producto individual
porque SaleRecord no tiene productCode. CustomerOrderLine no tiene campo de canal.
Todos los productos quedan con `channelPending = true`.

### Inventario

| Dato | Valor |
|---|---|
| Total ProductInventoryLevel | 157,328 filas |
| Source | "sag" en todas |
| Warehouses con datos | 11, 22, 30, 31, 32, 33, 37, 39 (para LINEA 5) |

**Observacion:** Cantidades pueden ser negativas en algunos warehouses
(stock comprometido/consumido). Se usa Math.max(0, sum) para mostrar
stock disponible real.

### Precios

| Dato | Fuente |
|---|---|
| PV3 (precio detal) | SAG v_articulos.n_valor_venta_promocion |
| PV4 (precio mayorista) | SAG v_articulos.nd_valor_venta4 |
| Fallback PV3 | ProductEntity.price |
| Fallback PV4 | null (no disponible fuera de SAG) |

### Historial de ingresos

| Dato | Fuente |
|---|---|
| Fecha primer ingreso | SAG MOVIMIENTOS.d_fecha_documento (C1/C2) |
| Total importado | SAG MOVIMIENTOS_ITEMS.n_cantidad (suma) |
| Batch count | SAG MOVIMIENTOS distinct documents |
| Proveedor | SAG TERCEROS (via MOVIMIENTOS JOIN) |
| Fallback fecha | ProductEntity.createdAt (marcado como estimado) |
| Fallback total importado | sold + remaining (aproximacion) |

---

## Campos aun no disponibles

| Campo | Estado | Razon |
|---|---|---|
| salesDetal6m | 0 (channelPending) | SaleRecord.productCode = null |
| salesMayorista6m | 0 (channelPending) | SaleRecord.productCode = null |
| soldDetal | 0 (channelPending) | SaleRecord.productCode = null |
| soldMayorista | 0 (channelPending) | SaleRecord.productCode = null |
| dominantChannel | "sin_datos" | Requiere canal por producto |
| container | null | No existe en SAG |

---

## Fallbacks aplicados

| Dato | Primario | Fallback | Marcado como |
|---|---|---|---|
| Fecha ingreso | SAG MOVIMIENTOS | ProductEntity.createdAt | Estimado |
| Total importado | SAG receipt sum | sold + remaining | Estimado |
| Batch count | SAG distinct docs | 1 | Estimado |
| PV3 | SAG v_articulos | ProductEntity.price | Estimado |
| PV4 | SAG v_articulos | null | No disponible |

---

## Consultas SAG utilizadas

1. **Precios:** `SELECT k_sc_codigo_articulo, n_valor_venta_promocion, nd_valor_venta4 FROM v_articulos`
2. **Ingresos:** MOVIMIENTOS + MOVIMIENTOS_ITEMS WHERE ka_ni_fuente IN (1, 95) AND sc_anulado = 'N'

Registradas en: `QUERY_CATALOG.commercialProducts.prices` y `QUERY_CATALOG.commercialProducts.entryReceipts`

---

## Resumen

| Metrica | Valor |
|---|---|
| Referencias importadas encontradas | 657 |
| Valor usado para identificar importacion | productLine = "5" |
| Canales disponibles a nivel producto | No (channelPending = true) |
| Fuente de ventas | CustomerOrderLine (NO SaleRecord) |
| Precios SAG | PV3 + PV4 via CommercialProductDataSource |
| Inventario | ProductInventoryLevel (sum por producto) |
