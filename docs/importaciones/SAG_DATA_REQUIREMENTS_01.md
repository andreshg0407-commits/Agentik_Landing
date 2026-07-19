# SAG_DATA_REQUIREMENTS_01 — Datos requeridos de SAG para Importaciones

**Sprint:** COMPRAS-IMPORTACIONES-SAG-DIRECT-DATA-01 (updated)
**Fecha:** 2026-07-09

---

## 1. Donde esta PV3 (Precio detal)

**Tabla SAG:** `v_articulos`
**Campo:** `n_valor_venta_promocion`
**Estado:** CONFIRMADO — IMPLEMENTADO

Verificacion: articulo L-3420 en screenshot SAG muestra PV3=$35,700.
Cruce exitoso: C6-24-129 → Hoja3 `n_valor_venta_promocion=23900` = PV DETAL en INFORME.

**Implementacion:** `SagDirectImportacionesDataSource.fetchPrices()` extrae PV3 via query:
`SELECT k_sc_codigo_articulo, n_valor_venta_promocion, nd_valor_venta4 FROM v_articulos`
Query registrado en `QUERY_CATALOG.importaciones.prices`.

---

## 2. Donde esta PV4 (Precio mayorista / maleta)

**Tabla SAG:** `v_articulos`
**Campo:** `nd_valor_venta4`
**Estado:** CONFIRMADO — IMPLEMENTADO

Verificacion: articulo L-3420 en screenshot SAG muestra PV4=$23,150.
Cruce exitoso: C6-24-129 → Hoja3 `nd_valor_venta4=14500` = PV MALETA en INFORME.

**Implementacion:** Mismo query que PV3.

---

## 3. Donde estan fechas de ingreso

**Tabla SAG:** `MOVIMIENTOS` (header)
**Campo:** `d_fecha_documento` filtrado por `ka_ni_fuente IN (1, 95)`
**Estado:** CONFIRMADO — IMPLEMENTADO

- `ka_ni_fuente=1` → C1 (FACTURA DE COMPRA) — confirmado en FUENTES registry
- `ka_ni_fuente=95` → C2 (FACTURA DE COMPRAS 2) — confirmado en FUENTES registry
- `sc_anulado = 'N'` para excluir documentos anulados

**Implementacion:** `SagDirectImportacionesDataSource.fetchReceipts()` extrae fecha mas antigua
como `firstEntryDate`. Import-service usa este valor en lugar de `ProductEntity.createdAt`.

---

## 4. Donde estan compras / importaciones

**Tabla SAG:** `MOVIMIENTOS` + `MOVIMIENTOS_ITEMS` + `v_articulos` JOIN
**Estado:** CONFIRMADO — IMPLEMENTADO

Estructura del query:
- Headers: `n_numero_documento`, `d_fecha_documento`, `ka_ni_fuente`, `sc_beneficiario`
- Items: `n_cantidad` (cantidad por linea)
- Articulos: `k_sc_codigo_articulo` via `v_articulos.ka_nl_articulo = mi.ka_nl_articulo`
- Proveedor: `t.n_nit` via `TERCEROS.ka_nl_tercero = m.ka_nl_tercero`

**Implementacion:** Query registrado en `QUERY_CATALOG.importaciones.entryReceipts`.
`SagDirectImportacionesDataSource` calcula:
- `totalImported` = sum(n_cantidad) por referencia
- `batchCount` = count(distinct n_numero_documento)
- `firstEntryDate` = min(d_fecha_documento)

---

## 5. Donde esta el proveedor

**Tabla SAG:** `MOVIMIENTOS` header → `TERCEROS` JOIN
**Campos:**
- `m.sc_beneficiario` → nombre del proveedor
- `t.n_nit` (via LEFT JOIN TERCEROS) → NIT del proveedor
**Estado:** CONFIRMADO — IMPLEMENTADO

**Implementacion:** `ImportReceipt.providerNit` y `ImportReceipt.providerName` poblados
desde el JOIN. Disponibles en el historial de entradas.

---

## 6. Donde esta el documento o contenedor

**Tabla SAG:** `MOVIMIENTOS.n_numero_documento`
**Estado:** PARCIAL

El numero de documento SAG se captura en `ImportReceipt.documentNumber`.
No existe campo de contenedor/embarque en SAG. Esta informacion se maneja
externamente en la documentacion de importacion.

---

## 7. Donde estan ventas por referencia

**Ya disponible en Agentik:**
- Modelo: `SaleRecord`
- Campos: `productCode`, `quantity`, `saleDate`, `channel`
- Sincronizado: SI (fuente SAG ventas)

Sin cambios respecto al MVP.

---

## 8. Como distinguir venta detal vs mayorista

**IMPLEMENTADO en import-service.ts:**

| Canal | Channels SAG | Precio |
|---|---|---|
| **Detal** | TIENDA, ALMACEN, ONLINE, EMPRESA | PV3 |
| **Mayorista** | MAYORISTA, DISTRIBUIDOR | PV4 |

Clasificacion via `classifyChannel()` en import-service.ts.

---

## 9. Como distinguir web, tiendas y maletas

**Parcialmente disponible:**
- `SaleRecord.channel` tiene valores del enum `SaleChannel`
- Detal incluye TIENDA + ALMACEN + ONLINE + EMPRESA
- Mayorista incluye MAYORISTA + DISTRIBUIDOR

---

## 10. Como calcular unidades vendidas ultimos 6 meses

**Disponible — implementado en import-service.ts:**
Query Prisma sobre SaleRecord con filtro temporal de 6 meses.
Separado por detal/mayorista.

---

## Resumen de disponibilidad

| Dato | Fuente | Estado |
|---|---|---|
| Referencia / descripcion | ProductEntity | Disponible |
| Precio PV3 (detal) | v_articulos.n_valor_venta_promocion | IMPLEMENTADO (SAG direct) |
| Precio PV4 (mayorista) | v_articulos.nd_valor_venta4 | IMPLEMENTADO (SAG direct) |
| Ventas totales | SaleRecord | Disponible |
| Ventas por canal | SaleRecord.channel | Disponible |
| Ventas ultimos 6 meses | SaleRecord (query temporal) | Disponible |
| Existencia actual | ProductInventoryLevel | Disponible |
| Fecha importacion | MOVIMIENTOS.d_fecha_documento | IMPLEMENTADO (SAG direct) |
| Cantidad comprada | MOVIMIENTOS_ITEMS.n_cantidad | IMPLEMENTADO (SAG direct) |
| Proveedor | MOVIMIENTOS→TERCEROS | IMPLEMENTADO (SAG direct) |
| Batch count | MOVIMIENTOS distinct docs | IMPLEMENTADO (SAG direct) |
| Contenedor | No disponible en SAG | Pendiente (externo) |
| Grupo IMPORTACION | ProductEntity.productLine | Ya filtrado |

## Archivos de implementacion

| Archivo | Proposito |
|---|---|
| `lib/comercial/importaciones/import-data-source.ts` | Interface + tipos de enrichment |
| `lib/comercial/importaciones/sag-direct-data-source.ts` | Implementacion SAG SOAP directa |
| `lib/comercial/importaciones/sag-warehouse-data-source.ts` | Stub para data warehouse futuro |
| `lib/comercial/importaciones/import-service.ts` | Servicio actualizado con enrichment |
| `lib/connectors/adapters/sag-pya-soap/query-catalog.ts` | Queries IMPORTACIONES registradas |
