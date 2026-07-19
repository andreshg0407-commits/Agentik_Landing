# INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01

**Mode:** FORENSICS + DISCOVERY
**Date:** 2026-07-01
**TSC Baseline:** 160 (no code changes)
**Prerequisite:** INVENTORY-VENDOR-BALANCE-TRUTH-AUDIT-01

---

## VEREDICTO

**ROOT CAUSE ENCONTRADA: Las maletas viven en `movimientos_traslados`, NO en `MOVIMIENTOS_ITEMS`.**

Los traslados F34 (TRASLADO ENTRE BODEGAS) escriben en la tabla `movimientos_traslados` con bodegas origen/destino por linea. Estos traslados **NO generan filas en `MOVIMIENTOS_ITEMS`**. El query de inventario (`SAG_VARIANT_INVENTORY_QUERY`) suma exclusivamente desde `MOVIMIENTOS_ITEMS`, por lo tanto nunca vera inventario de vendedor.

---

## FASE 1 -- SAG Directo: Inventario bodegas 45-50

Query: `SAG_VARIANT_INVENTORY_QUERY` filtrado a `ka_nl_bodega IN (45,46,47,48,49,50)`.

| Bodega | ka_nl | Rows | Positivas | Negativas | Net |
|---|---|---|---|---|---|
| VEND ORLANDO | 45 | 1 | 0 | -1 | -1 |
| VEND CARLOS LEON | 46 | 0 | 0 | 0 | 0 |
| VEND LUIS | 47 | 0 | 0 | 0 | 0 |
| VEND NESTOR | 48 | 0 | 0 | 0 | 0 |
| VEND CARLOS VILLA | 49 | 0 | 0 | 0 | 0 |
| VEND FREDY | 50 | 3 | 0 | -402 | -402 |

**Conclusion:** `MOVIMIENTOS_ITEMS` no contiene inventario de vendedor. Las pocas filas (4 total) son negativas — probablemente ajustes.

---

## FASE 2 -- Validacion tabla BODEGAS

SAG BODEGAS (49 registros totales). Mapping confirmado:

| ka_nl_bodega | ss_codigo | Nombre |
|---|---|---|
| 45 | 35 | VEND ORLANDO |
| 46 | 36 | VEND CARLOS LEON |
| 47 | 37 | VEND LUIS |
| 48 | 38 | VEND NESTOR |
| 49 | 39 | VEND CARLOS VILLA |
| 50 | 40 | VEND FREDY |

Bodegas que Maletas **realmente consulta** (ka_nl 36-39, pensando que son vendedores):

| ka_nl_bodega | ss_codigo | Nombre REAL |
|---|---|---|
| 36 | 26 | IMPORTACION PARTE 2 |
| 37 | 27 | IMPORTACION PARTE 1 |
| 38 | 28 | PLAN SEPARE |
| 39 | 29 | BODEGA CALDAS |

**Nota:** ka_nl 35 y 40 no existen — por eso Orlando y Fredy aparecen vacios.

---

## FASE 3 -- Traslados F34 a bodegas de vendedor

**Descubrimiento critico:** La tabla `movimientos_traslados` (NO `MOVIMIENTOS_ITEMS`) contiene traslados reales a bodegas de vendedor.

### Schema
- Columna cantidad: `nd_cantidad` (NO `n_cantidad`)
- Columnas de bodega: `ka_nl_bodega_origen`, `ka_nl_bodega_destino`
- F34 (ka_ni_fuente=34) = "TRASLADO ENTRE BODEGAS", codigo TR

### Volumenes de traslados (historicos, non-anulados)

| Vendedor | Bodega | Lines IN | Units IN | Lines OUT | Units OUT | NET |
|---|---|---|---|---|---|---|
| ORLANDO | 45 | 792 | 792 | 596 | 597 | **195** |
| CARLOS LEON | 46 | 879 | 888 | 610 | 632 | **256** |
| LUIS | 47 | 487 | 487 | 477 | 487 | **0** |
| NESTOR | 48 | 963 | 963 | 726 | 734 | **229** |
| CARLOS VILLA | 49 | 351 | 351 | 88 | 88 | **263** |
| FREDY | 50 | 219 | 220 | 214 | 216 | **4** |

- Orlando: activo desde Abr 2025 hasta Jun 2026
- Carlos Leon: activo desde Abr 2025 hasta Jun 2026
- Luis: activo desde May 2025 hasta Sep 2025 (INACTIVO -- net=0)
- Nestor: activo desde Abr 2025 hasta Jun 2026
- Carlos Villa: activo desde Ene 2026 hasta Jun 2026
- Fredy: activo desde Feb 2026 hasta Mar 2026 (PARCIALMENTE ACTIVO)

### Transferencias recientes (2026)

1,636 lineas de traslado a vendedores en 2026. Todas con `qty=1` (confirma mostrario). Origen: bodega 10 (PRINCIPAL).

Ejemplo: `2026-06-25 Dest:48 From:10 REF:L-3582 PIJAMA LARGA LARGA NINO T:2 C:AZ3 qty:1`

---

## FASE 4 -- Movimientos en MOVIMIENTOS_ITEMS por bodega de vendedor

| Bodega | Fuente | Rows | IN | OUT |
|---|---|---|---|---|
| 45 (ORLANDO) | 101 | 1 | 0 | 1 |
| 46-49 | — | **0** | 0 | 0 |
| 50 (FREDY) | 118 | 1 | 0 | 400 |
| 50 (FREDY) | 194 | 1 | 0 | 1 |
| 50 (FREDY) | 207 | 1 | 0 | 1 |

Solo 4 filas totales en MOVIMIENTOS_ITEMS para las 6 bodegas de vendedor. Todas son salidas. Bodegas 46-49 no tienen **ninguna** fila en MOVIMIENTOS_ITEMS.

---

## FASE 5 -- Mecanismo del bug

### Por que F34 no escribe en MOVIMIENTOS_ITEMS

Un traslado F34 es un documento dual-bodega. SAG lo maneja asi:

1. Crea una fila en `MOVIMIENTOS` (header) con `ka_ni_fuente=34`
2. Crea N filas en `movimientos_traslados` (items) con:
   - `ka_nl_bodega_origen` = bodega que envia
   - `ka_nl_bodega_destino` = bodega que recibe
   - `nd_cantidad` = unidades transferidas
3. **NO crea filas en `MOVIMIENTOS_ITEMS`** para este movimiento

Esto es normal en SAG PYA: las tablas de items son especificas por tipo de documento. Ventas usan `MOVIMIENTOS_ITEMS`, traslados usan `movimientos_traslados`, consumos usan `movimientos_consumos`, etc.

### Bug chain completa

```
SAG_VARIANT_INVENTORY_QUERY
  ↓ consulta MOVIMIENTOS_ITEMS con FUENTES.sc_afecta_inventario = 'S'
  ↓ F34 tiene sc_afecta_inventario = 'S' PERO sus items NO estan en MOVIMIENTOS_ITEMS
  ↓ Items de F34 estan en movimientos_traslados (tabla separada)
  ↓ El query nunca ve los traslados
  ↓ sag-variants-normalizer.ts: warehouseId = ka_nl_bodega (de MOVIMIENTOS_ITEMS)
  ↓ sag-inventory-normalizer.ts: warehouseId = String(ka_nl_bodega)
  ↓ PIL: warehouseId nunca contiene 45-50 (porque no hay MOVIMIENTOS_ITEMS rows)
  ↓ vendor-sample-loader.ts: WHERE warehouseId IN ('35','36',...,'40')
  ↓ Matchea ka_nl_bodega 36-39 (bodegas de importacion/operativas)
  ↓ RESULTADO: UI muestra inventario de importacion como maleta de vendedor
```

---

## FASE 6 -- Saldo real de maletas (desde movimientos_traslados)

| Vendedor | Bodega | Refs con saldo > 0 | Total unidades | Max por ref |
|---|---|---|---|---|
| ORLANDO | 45 | **209** | 213 | 4 |
| CARLOS LEON | 46 | **259** | 267 | 8 |
| LUIS | 47 | **0** | 0 | — |
| NESTOR | 48 | **240** | 241 | 1 |
| CARLOS VILLA | 49 | **271** | 278 | 7 |
| FREDY | 50 | **4** | 4 | 1 |

**Observaciones:**
- 4 de 6 vendedores tienen maletas activas con ~200-270 refs
- Luis (bod 47): todo devuelto (IN=487, OUT=487, NET=0) -- maleta inactiva
- Fredy (bod 50): casi todo devuelto -- solo 4 refs activas
- La mayoria de refs tienen NET=1 (confirma mostrario)
- Algunos refs tienen NET>1 (e.g., 4, 8) -- probablemente multiples tallas/colores del mismo articulo

---

## FASE 7 -- PIL audit

PIL contiene 39 bodegas distintas. De las 6 bodegas de vendedor:

| Bodega | En PIL? | Rows | Positivas |
|---|---|---|---|
| 45 (ORLANDO) | Si | 1 | 0 |
| 46 (CARLOS LEON) | No | — | — |
| 47 (LUIS) | No | — | — |
| 48 (NESTOR) | No | — | — |
| 49 (CARLOS VILLA) | No | — | — |
| 50 (FREDY) | Si | 2 | 0 |

Consistente: PIL solo tiene datos que vienen de `MOVIMIENTOS_ITEMS`, y esas bodegas casi no tienen filas ahi.

---

## FASE 8 -- Respuestas a las 7 preguntas

### 1. Tienen saldo las bodegas 45-50 en SAG?
**SI**, pero no en `MOVIMIENTOS_ITEMS`. El saldo real vive en `movimientos_traslados` y muestra 200-270 refs activas por vendedor (Orlando, Carlos Leon, Nestor, Carlos Villa).

### 2. Que bodegas realmente contienen inventario de vendedor?
Bodegas ka_nl 45, 46, 48, 49 tienen inventario activo. Bodega 47 (Luis) esta vacia (todo devuelto). Bodega 50 (Fredy) tiene solo 4 refs.

### 3. Hay traslados F34 hacia bodegas de vendedor?
**SI.** 3,691 lineas de traslado entrantes totales, 1,636 solo en 2026. Todas con qty=1 (mostrario). Origen: bodega 10 (PRINCIPAL).

### 4. Por que PIL no tiene datos de vendedor?
Porque F34 escribe en `movimientos_traslados`, no en `MOVIMIENTOS_ITEMS`. El sync pipeline usa `SAG_VARIANT_INVENTORY_QUERY` que solo suma de `MOVIMIENTOS_ITEMS`.

### 5. Es un problema de mapping o de fuente de datos?
**AMBOS.** (1) La fuente es incorrecta — se necesita `movimientos_traslados`, no `MOVIMIENTOS_ITEMS`. (2) El mapping warehouseCode usa ss_codigo pero PIL almacena ka_nl_bodega.

### 6. La administracion tiene razon sobre max 1 unidad?
**SI.** Confirmado: 95%+ de refs tienen NET=1. Los pocos con NET>1 son variantes (talla/color) del mismo articulo, cada una con qty=1.

### 7. Que se necesita para corregir?
Una nueva fuente de datos: computar saldo desde `movimientos_traslados` en lugar de `MOVIMIENTOS_ITEMS`. No es un fix de mapping — es un cambio de tabla fuente.

---

## FASE 9 -- Plan de correccion

### P0: NUEVA FUENTE — VendorTransferBalance (CRITICO)

El saldo de maleta se calcula desde `movimientos_traslados`:

```sql
SELECT
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  mt.ss_talla, mt.ss_color,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = {BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = {BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = {BOD} OR mt.ka_nl_bodega_origen = {BOD})
GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo, mt.ss_talla, mt.ss_color
HAVING net_qty > 0
```

### P1: Sync pipeline

Opciones:
- **A. SAG query directo por vendedor (6 SOAP calls)** — mas fresco, no requiere tabla intermedia
- **B. Nuevo sync a tabla `VendorSamplePresence`** — similar a PIL pero alimentado desde `movimientos_traslados`
- **C. Hybrid** — calcular en el loader directamente via SOAP, sin PIL intermedio

Recomendacion: **Opcion A** para MVP. 6 queries SAG es viable dentro del rate limit (10/min, 340/dia).

### P2: Modelo de datos

```typescript
interface VendorSamplePresence {
  vendorBodega: number;        // ka_nl_bodega (45-50)
  reference: string;           // k_sc_codigo_articulo
  description: string;
  talla: string;
  color: string;
  isPresent: boolean;          // net_qty > 0
  netQty: number;              // should be 1 for mostrario
  lastTransferDate: string;    // from most recent transfer
}
```

### P3: UI corrections needed

1. Mostrar "En maleta" / "No en maleta" (presencia binaria, no cantidades)
2. La cantidad total por vendedor = numero de referencias, no suma de unidades
3. El estado de salud depende del inventario central (ya correcto en la logica actual)
4. Production suggestions: correctas (ya usan central inventory, no bag qty)

---

## FASE 10 -- Archivos relevantes

| Archivo | Rol | Cambio necesario |
|---|---|---|
| `vendor-sample-loader.ts` | Query PIL con warehouseId incorrecto | **REEMPLAZAR**: usar movimientos_traslados via SOAP |
| `vendor-sample-service.ts` | Engine path (no en uso activo) | Actualizar mapping |
| `sag-variants-types.ts` | SAG_VARIANT_INVENTORY_QUERY | No cambiar — correcto para inventario general |
| `sag-inventory-sync.ts` | Sync MOVIMIENTOS_ITEMS a PIL | No cambiar — correcto para otras bodegas |
| `sag-transfer-sync.ts` | Sync F34 a InventoryTransfer | Ya existe pero guarda headers/lines, no balance |
| `castillitos-bodega-mapping.ts` | ka_nl vs ss_codigo mapping | Correcto, no cambiar |

---

## Script de forensics

`scripts/forensic-vendor-bodegas-sag-direct.ts` — ejecutado contra SAG real el 2026-07-01.
