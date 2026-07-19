# IMPORTACIONES_DATA_MAPPING_01 — Mapeo Excel → Agentik → SAG

**Sprint:** COMPRAS-IMPORTACIONES-DATA-DISCOVERY-01
**Fecha:** 2026-07-09

---

## Mapeo completo

| Campo requerido Agentik | Campo Excel | Fuente SAG probable | Estado |
|---|---|---|---|
| **Referencia** (codigo) | Col A: REF | `v_articulos.k_sc_codigo_articulo` | **Disponible** — Hoja3 confirma 8,501 articulos |
| **Descripcion** | Col B: DESCRIPCION | `v_articulos.sc_detalle_articulo` | **Disponible** |
| **Grupo/Linea** | — | `v_articulos.sc_detalle_grupo = 'IMPORTACION'` | **Disponible** — filtrar por grupo |
| **Fecha primera importacion** | Col C: FECHA IMPO | `MOVIMIENTOS header d_fecha_documento` donde clase=entrada | **Pendiente investigacion SAG** — Excel usa fechas manuales |
| **Contenedor / documento** | — (no existe en Excel) | `MOVIMIENTOS n_numero_documento` o campo custom | **Pendiente investigacion SAG** |
| **Proveedor** | — (no existe en Excel) | `MOVIMIENTOS ka_nl_tercero` en entradas | **Pendiente investigacion SAG** |
| **Precio detal (PV3)** | Col Q: PV DETAL | `v_articulos.n_valor_venta_promocion` | **Disponible** — verificado cruzado |
| **Precio mayorista (PV4)** | Col P: PV MALETA | `v_articulos.nd_valor_venta4` | **Disponible** — verificado cruzado |
| **Costo** | — | `v_articulos.n_valor_venta_especial` (PV2)? o costo estandar | **Derivable** — PV2 puede ser costo especial |
| **Cantidad por periodo de compra** | Cols D-K: periodos fijos | `MOVIMIENTOS_ITEMS n_cantidad` por periodo | **Derivable** — agrupar entradas por fecha |
| **Total comprado** | Col L: `=SUM(D:J)` | SUM de entradas en MOVIMIENTOS | **Derivable** — sumar entradas SAG |
| **Unidades vendidas** | Col M: `=VLOOKUP(Hoja2)` | `SaleRecord` acumulado por productCode | **Disponible** — SaleRecord ya sincronizado |
| **Existencia actual** | Col N: `=L-M` | `ProductInventoryLevel.quantity` | **Disponible** — inventario real ya sincronizado |
| **% vendido** | Col O: `=M/L` | Calculado: vendido / comprado | **Derivable** |
| **Ventas detal ultimos 6 meses** | Col R: vacia | `SaleRecord` donde channel = retail/tiendas | **Disponible** — SaleRecord tiene channel |
| **Ventas mayorista ultimos 6 meses** | Col S: vacia | `SaleRecord` donde channel = wholesale/mayorista | **Disponible** — SaleRecord tiene channel |
| **Rotacion** | — | Calculado: ventas/stock por periodo | **Derivable** |
| **Recomendacion de recompra** | — (decision manual) | Logica Agentik: reglas basadas en % vendido, stock, rotacion | **No necesario** de SAG |

---

## Resumen de estados

| Estado | Cantidad | Campos |
|---|---|---|
| **Disponible** | 8 | Referencia, Descripcion, Grupo, PV3, PV4, Ventas, Existencia, Ventas por canal |
| **Derivable** | 4 | Total comprado, % vendido, Rotacion, Costo |
| **Pendiente investigacion SAG** | 3 | Fecha importacion, Contenedor, Proveedor |
| **No necesario** | 1 | Recomendacion (logica Agentik) |

---

## Diferencias clave Excel vs Agentik

| Aspecto | Excel | Agentik |
|---|---|---|
| Existencia | Compra - Ventas (aproximado) | Inventario real (ProductInventoryLevel) |
| Ventas | Pivot manual (Hoja2) | SaleRecord automatico con canal |
| Precios | Ingresados manualmente | SAG v_articulos PV3/PV4 automatico |
| Periodos de compra | Columnas fijas (Oct24, Ene25...) | ImportBatch con fechas dinamicas |
| Canal de venta | Estructura vacia (cols R-S) | SaleRecord.channel (tiendas/web/mayorista) |
| Recompra | Decision manual del gerente | Recomendacion basada en reglas |
