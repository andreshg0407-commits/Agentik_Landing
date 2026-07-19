# IMPORTACIONES_SAG_LIVE_DATA_REPORT_01

**Sprint:** GO-LIVE-IMPORTACIONES-SAG-LIVE-DATA-01
**Fecha:** 2026-07-10
**Tenant:** Castillitos

---

## Cambios principales

### 1. Ventas: separacion gross / returns / net

Negative quantities in CustomerOrderLine represent devoluciones/notas credito.

**Antes:** `Math.abs(Number(line.quantity))` — convertia devoluciones en ventas.
**Ahora:** `qty > 0 → soldGross`, `qty < 0 → returns`. `soldNet = soldGross - returns`.

Nuevos campos en ImportedReference:

| Campo | Tipo | Descripcion |
|---|---|---|
| soldGross | number | Ventas brutas positivas (historico) |
| returns | number | Devoluciones absolutas (historico) |
| soldNet | number | Venta neta = soldGross - returns |
| sales6mGross | number | Ventas brutas 6M |
| returns6m | number | Devoluciones 6M |
| sales6mNet | number | Venta neta 6M |

`sold` y `salesTotal6m` son alias de `soldNet` y `sales6mNet` para compatibilidad.

### 2. Inventario: bodegas de importacion

**Antes:** `ProductInventoryLevel` sumaba TODAS las bodegas.
**Ahora:** Solo bodegas de importacion:

```
IMPORT_WAREHOUSE_CODES = ["24", "42", "43", "44", "45", "46"]
```

| Bodega | Nombre | Tipo |
|---|---|---|
| 24 | IMPORTACION | Staging |
| 42 | IMPO CONTENEDOR 6 | Container |
| 43 | IMPO CONTENEDOR 7 | Container |
| 44 | IMPO CONTENEDOR 7-1 | Container |
| 45 | IMPO CONTENEDOR 7-2 | Container |
| 46 | IMPO CONTENEDOR 7-3 | Container |

Formula restante: `Math.max(0, sum(quantity WHERE warehouseId IN IMPORT_WAREHOUSE_CODES))`

### 3. Ingresos: validacion de receipts

**Antes:** `Math.abs(n_cantidad)` — contaba ajustes negativos como ingresos.
**Ahora:** Solo `n_cantidad > 0` se cuenta como ingreso valido.

Filtros aplicados:
- `sc_anulado = 'N'` (excluye anulados)
- `ka_ni_fuente IN (1, 95)` (solo C1/C2 — facturas de compra)
- `n_cantidad > 0` (excluye devoluciones/ajustes)

### 4. Clasificacion canal: por unidades reales

**Antes:** Clasificacion proporcional: `soldDetal = Math.round(sold * detalRatio)`.
**Ahora:** Per-line classification: cada linea clasificada individualmente, se suman las unidades reales.

```
for each CustomerOrderLine:
  result = classifySale({ price: { unitValue, pricePV3, pricePV4 } })
  if DETAL: agg.detalAll += absQty
  if MAYORISTA: agg.mayoristaAll += absQty
  else: agg.noDetAll += absQty
```

Nuevos campos:
- `salesNoDet6m` — unidades no clasificables 6M
- `soldNoDet` — unidades no clasificables historico
- `channelConfidence` — confianza ponderada por unidades
- `channelQuality` — ESTIMATED o UNAVAILABLE

### 5. DataQuality en cada dato

Nuevos campos de calidad:

| Campo | Valores | Regla |
|---|---|---|
| entryDateQuality | CONFIRMED / ESTIMATED / UNAVAILABLE | CONFIRMED si viene de SAG receipt, ESTIMATED si usa createdAt |
| totalImportedQuality | CONFIRMED / ESTIMATED / UNAVAILABLE | CONFIRMED si viene de SAG receipt sum, ESTIMATED si usa sold+remaining |
| channelQuality | ESTIMATED / UNAVAILABLE | ESTIMATED si hay clasificaciones, UNAVAILABLE si no |

### 6. Historial de receipts en UI

El drawer ahora muestra:
- Primera entrada (con indicador de calidad)
- Ultima entrada
- Total de documentos de ingreso
- Tabla de historial de ingresos (fecha, documento, cantidad, proveedor)
- Devoluciones separadas
- Venta neta
- Unidades "no determinado" en clasificacion
- Confianza de clasificacion

### 7. Performance

- Consultas SAG en bulk (no N+1)
- Enriquecimiento SAG reutilizado entre clasificacion y construccion de referencias
- Cache temporal para evitar doble llamada SAG

---

## Estado de cada dato

| Dato | Estado | Fuente |
|---|---|---|
| Productos importados | IMPLEMENTED_AND_VALIDATED | ProductEntity.productLine = "5" |
| PV3 | IMPLEMENTED_AND_VALIDATED | SAG v_articulos.n_valor_venta_promocion |
| PV4 | IMPLEMENTED_AND_VALIDATED | SAG v_articulos.nd_valor_venta4 |
| Documentos de ingreso | IMPLEMENTED_AND_VALIDATED | SAG MOVIMIENTOS WHERE ka_ni_fuente IN (1,95) |
| Cantidades compradas | IMPLEMENTED_AND_VALIDATED | SAG MOVIMIENTOS_ITEMS.n_cantidad (solo > 0) |
| Fechas de ingreso | IMPLEMENTED_AND_VALIDATED | SAG MOVIMIENTOS.d_fecha_documento |
| Historial de recompras | IMPLEMENTED_AND_VALIDATED | Distinct document count from receipts |
| Proveedor | IMPLEMENTED_AND_VALIDATED | SAG TERCEROS via JOIN |
| Ventas por referencia | IMPLEMENTED_AND_VALIDATED | CustomerOrderLine.referenceCode |
| Devoluciones | IMPLEMENTED_AND_VALIDATED | CustomerOrderLine.quantity < 0 |
| Precio unitario de venta | IMPLEMENTED_AND_VALIDATED | CustomerOrderLine.unitValue |
| Clasificacion Detal/Mayorista | IMPLEMENTED_AND_VALIDATED | CommercialSalesClassificationEngine per-line |
| Inventario import warehouses | IMPLEMENTED_AND_VALIDATED | ProductInventoryLevel WHERE warehouseId IN IMPORT_WAREHOUSE_CODES |

---

## Fallbacks aun activos

| Dato | Fallback | Marcado como |
|---|---|---|
| entryDate | ProductEntity.createdAt | DataQuality.ESTIMATED |
| totalImported | soldNet + remaining | DataQuality.ESTIMATED |
| PV3 | ProductEntity.price | Sin marcado (inline fallback) |

---

## Campos aun no disponibles

| Campo | Estado | Razon |
|---|---|---|
| container | NOT_AVAILABLE | No existe en SAG |
| salesDetal6m (real) | ESTIMATED | Basado en unitValue vs PV3/PV4 |
| soldDetal (real) | ESTIMATED | Basado en unitValue vs PV3/PV4 |

---

## Resumen

| Metrica | Valor |
|---|---|
| DataQuality tracking | CONFIRMED / ESTIMATED / UNAVAILABLE |
| Ventas modelo | soldGross / returns / soldNet |
| Inventario | Import warehouses only (24, 42-46) |
| Receipts | Positive qty only, anulados excluidos |
| Canal clasificacion | Per-line real units (no proportional) |
| channelConfidence | Weighted average by units classified |
| Consultas SAG | Bulk (no N+1) |
