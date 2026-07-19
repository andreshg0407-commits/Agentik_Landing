# EXCEL_DISCOVERY_01 — Analisis del archivo INFO VENTAS ACC MAYO 17.xlsx

**Sprint:** COMPRAS-IMPORTACIONES-DATA-DISCOVERY-01
**Fecha:** 2026-07-09

---

## 1. Hojas disponibles

| Hoja | Filas datos | Columnas | Proposito |
|---|---|---|---|
| **INFORME** | 475 | 19 | Vista principal: referencias importadas con compras, ventas, existencia, precios y % vendido |
| **Hoja2** | 1,986 | 2 | Pivot de ventas por referencia: `Etiquetas de fila` + `Suma de Suma de Cantidad_Unidades` |
| **Hoja3** | 8,501 | 10 | Catalogo SAG completo: articulos con precios (PV1-PV4), grupo, IVA |
| **Hoja4** | 0 | 0 | Vacia |

---

## 2. INFORME — Columnas

| Col | Header | Tipo | Ejemplo | Notas |
|---|---|---|---|---|
| A | REF | Texto | `C6-24-129` | Codigo de referencia importada. Formato libre, no SAG standard. |
| B | DESCRIPCION | Texto | `VASO PITILLO 200 ML` | Nombre del producto |
| C | FECHA IMPO | Fecha/Texto | `2025-08-01` o `oct y nov 2025` | Fecha de importacion. **Inconsistente**: mezcla Date y texto libre. |
| D | OCTUBRE DEL 2024 | Numero | `180` | Unidades compradas en ese periodo |
| E | ENERO DEL 2025 | Numero | `100` | Unidades compradas en ese periodo |
| F | MARZO DEL 25 | Numero | `300` | Unidades compradas en ese periodo |
| G | JUNIO DEL 25 | Numero | `300` | Unidades compradas en ese periodo |
| H | AGOSTO DEL 2025 | Numero | `192` | Unidades compradas en ese periodo |
| I | OCT Y NOV DEL 2025 | Numero | `200` | Unidades compradas en ese periodo |
| J | DIC DEL 2025 | Numero | | Unidades compradas en ese periodo |
| K | (fecha 2025-04-01) | Numero | `192` | Col 11 — header es fecha, parece ser abril 2025/2026 |
| L | TOTAL COMPRA | Formula | `=SUM(D2:J2)` | **Formula**: suma de columnas D-J. NO incluye col K. |
| M | UNID VENDIDAS | Formula | `=VLOOKUP(A2,Hoja2!A:B,2,FALSE)` | **Formula**: busca en Hoja2 por referencia |
| N | EXISTENCIA ACTUAL | Formula | `=+L2-M2` | **Formula**: TOTAL COMPRA - UNID VENDIDAS |
| O | % VENDIDO | Formula | `=+M2/L2` | **Formula**: UNID VENDIDAS / TOTAL COMPRA (0-1, no 0-100) |
| P | PV MALETA | Numero | `14500` | Precio mayorista (PV4 en SAG). Manual. |
| Q | PV DETAL | Numero | `23900` | Precio detal (PV3 en SAG). Manual. |
| R | VENTA ULIMOS 6 MESES PAGINA Y TIENDAS | Numero | (vacio) | **100% vacio en todos los 475 registros** |
| S | VENTA ULIMOS 6 MESES AL X MAYOR | Numero | (vacio) | **100% vacio en todos los 475 registros** |

---

## 3. Columnas calculadas (formulas)

| Columna | Formula | Derivacion |
|---|---|---|
| L (TOTAL COMPRA) | `=SUM(D2:J2)` | Suma de periodos de compra. **No incluye col K.** |
| M (UNID VENDIDAS) | `=VLOOKUP(A2,Hoja2!A:B,2,FALSE)` | Lookup contra Hoja2 pivot |
| N (EXISTENCIA ACTUAL) | `=+L2-M2` | Compra - Vendido |
| O (% VENDIDO) | `=+M2/L2` | Vendido / Compra |

**Estas formulas NO deben replicarse.** Agentik calculara estos valores desde datos fuente SAG.

---

## 4. Campos que representan compras/importaciones

- Columnas D-K: cantidades compradas por periodo (Oct 2024 - Abr 2026)
- Columna L: total comprado (formula SUM)
- Columna C: fecha de importacion (primera importacion)

**Limitacion critica:** las columnas de compra son por periodo fijo (Oct 2024, Ene 2025, etc.), no por contenedor o documento. No hay campo de proveedor ni numero de contenedor.

---

## 5. Campos que representan ventas

- Columna M: unidades vendidas totales (VLOOKUP desde Hoja2)
- Columnas R-S: ventas ultimos 6 meses por canal (pagina+tiendas vs mayorista) — **vacias en todos los registros**

**Hoja2** es un pivot de ventas (1,986 referencias). La fuente del pivot no esta en el Excel — probablemente es una exportacion manual de SAG.

---

## 6. Campos que representan inventario restante

- Columna N: EXISTENCIA ACTUAL = TOTAL COMPRA - UNID VENDIDAS

**No es inventario real.** Es una aproximacion: compras menos ventas. No considera mermas, devoluciones, ni movimientos internos.

---

## 7. Campos que representan precios

- Columna P: PV MALETA — precio mayorista. Ingresado manualmente.
- Columna Q: PV DETAL — precio detal. Ingresado manualmente.

**Confirmado via SAG screenshot:**
- PV3 = n_valor_venta_promocion = Precio al detal
- PV4 = nd_valor_venta4 = Precio al por mayor / maleta

**Verificacion cruzada exitosa:**
- C6-24-129: PV MALETA=14500 en Excel, nd_valor_venta4=14500 en Hoja3 SAG
- C6-24-129: PV DETAL=23900 en Excel, n_valor_venta_promocion=23900 en Hoja3 SAG

---

## 8. Campos que separan detal vs mayorista

- Columnas R-S: "VENTA ULTIMOS 6 MESES PAGINA Y TIENDAS" y "VENTA ULTIMOS 6 MESES AL X MAYOR"
- **Estado: 100% vacio.** El Excel tiene la estructura pero nunca fue llenado.

Agentik debe resolver esta separacion desde SaleRecord.channel en SAG.

---

## 9. Campos que NO deben replicarse

| Campo Excel | Razon |
|---|---|
| Columnas D-K (periodos fijos) | Modelo rigido. Agentik usara ImportBatch con fechas dinamicas. |
| Formula `=SUM(D:J)` | Calcular desde datos fuente, no replicar formula. |
| Formula `=VLOOKUP(Hoja2)` | Consultar ventas directo desde SaleRecord. |
| Formula `=L-M` | Usar inventario real de ProductInventoryLevel. |
| Formula `=M/L` | Calcular desde datos fuente. |
| PV MALETA / PV DETAL manual | Obtener de SAG v_articulos (PV3/PV4). |
| Columnas R-S vacias | Agentik calculara ventas por canal automaticamente. |

---

## 10. Estadisticas clave del Excel

| Metrica | Valor |
|---|---|
| Total referencias | 475 |
| Total unidades compradas | 86,318 |
| Total unidades vendidas | 53,388 |
| Total existencia | 32,929 |
| Referencias 100% vendidas | 71 |
| Referencias >=70% vendidas | 190 |
| Referencias <=30% vendidas | 113 |
| Hoja3 articulos SAG | 8,501 |
| Hoja2 refs con ventas | 1,986 |

---

## 11. Hoja3 — Catalogo SAG

| Columna SAG | Campo | Mapeo precio |
|---|---|---|
| k_sc_codigo_articulo | Codigo articulo | — |
| sc_referencia | Referencia (null en muchos) | — |
| sc_detalle_articulo | Nombre | — |
| sc_tipo_unidad | Unidad (UNIDAD) | — |
| sc_detalle_grupo | Grupo: `IMPORTACION`, `LT NINO KIDS`, etc. | Filtrar `IMPORTACION` |
| n_valor_venta_normal | PV1 - Precio normal | PV1 |
| n_valor_venta_especial | PV2 - Precio especial | PV2 |
| n_valor_venta_promocion | **PV3 - Precio detal** | PV DETAL |
| nd_valor_venta4 | **PV4 - Precio mayorista/maleta** | PV MALETA |
| n_porcentaje_iva | % IVA (19) | — |
