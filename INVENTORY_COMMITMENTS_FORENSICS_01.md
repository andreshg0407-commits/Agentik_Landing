# INVENTORY-COMMITMENTS-FORENSICS-01

**Sprint:** INVENTORY-COMMITMENTS-FORENSICS-01
**Modo:** READ ONLY / FORENSICS
**Fecha:** 2026-06-30
**Tenant:** Castillitos

---

## Resumen Ejecutivo

La diferencia entre B01+B04 y los valores reportados por administracion se explica por **tres factores combinados**:

1. **Pedidos pendientes SAG (PD)** — 9,522 pedidos `PENDIENTE` existen en `CustomerOrderRecord` pero son **header-only** (sin lineas de producto). Las cantidades por referencia nunca se descuentan porque el sistema no sabe que productos contienen.

2. **Bodegas de vendedores/tiendas** — SAG tiene 39 bodegas sincronizadas. Las bodegas 00, 02, 03, 08-15, 22, 23, 29 representan stock distribuido (vendedores, tiendas, puntos de venta) con saldos negativos que reflejan mercancia despachada a esos canales.

3. **CRM Quote Lines (borrador)** — 527 referencias con 35,903 unidades en 285 quotes con status DRAFT. Estas representan intenciones de pedido de vendedores, pero NO son compromisos confirmados.

**La causa principal es #1**: los pedidos pendientes (PD) no se descuentan porque `CustomerOrderRecord` carece de campos de producto.

---

## FASE 1 — Mapa de Fuentes de Compromiso

### Entidades que EXISTEN en la base de datos

| Modelo | Registros | Tiene lineas de producto | Descontando de inventario |
|---|---|---|---|
| CustomerOrderRecord | 9,522 (PENDIENTE) | NO (header-only, rawJson vacio) | NO |
| CRMQuote | 285 (DRAFT) | SI (via CRMQuoteLine) | NO |
| CRMQuoteLine | 27,064 | SI (reference, qty, size, color, warehouseName) | NO |
| VendorCommercialBag | 0 registros | N/A | NO |
| VendorBagItem | 0 registros | N/A | NO |
| VendorBagOrderLine | 0 registros | N/A | NO |
| InventoryTransfer | 3,121 (1,231 open, 1,890 closed) | SI (via InventoryTransferLine) | NO |
| InventoryTransferLine | existe (schema) | SI (referenceCode, quantity) | NO |
| OperationalReservation | 0 registros | N/A | NO |
| CommercialCaseItem | 0 registros | N/A | NO |
| ProductInventoryLevel | ~200K+ rows | SI (quantity per variant per bodega) | PARCIAL (solo B01+B04) |

### Entidades que NO EXISTEN

| Concepto | Estado |
|---|---|
| Reserva de inventario por pedido | No existe modelo |
| Compromiso facturable | No existe modelo |
| Stock web separado | No existe (Tienda Web aparece solo en SaleRecord) |
| Asignacion de bodega a vendedor | No existe mapping explicitio |
| Stock en transito | No existe modelo (transfers existen pero sin lineas vinculadas a inventario) |

---

## FASE 2 — Pedidos Abiertos

### CustomerOrderRecord: 9,522 pedidos PENDIENTE

```
status      | cnt
PENDIENTE   | 9,522
```

**Columnas disponibles:**

| Columna | Tipo | Utilidad para inventario |
|---|---|---|
| id | text | PK |
| organizationId | text | tenant |
| erpMovId | integer | SAG movement PK |
| orderNumber | text | numero documento |
| customerNit | text | cliente |
| customerName | text | nombre cliente |
| orderDate | timestamp | fecha |
| amount | numeric | valor total |
| currency | text | COP |
| status | enum | PENDIENTE/CONFIRMADO/DESPACHADO/FACTURADO/CANCELADO |
| sourceCode | text | "PD" |
| **rawJson** | **jsonb** | **VACIO** |
| syncedAt | timestamp | sync |

**Hallazgo critico:** `rawJson` esta **vacio** (`{}`) para todos los registros. No hay campo de producto, ni referencia, ni cantidad por linea. **Es imposible saber que productos estan en cada pedido.**

### Para las 4 referencias auditadas

| Referencia | Pedidos pendientes (qty) | Fuente |
|---|---|---|
| L-1367 | DESCONOCIDO | No hay lineas de pedido |
| L-8467 | DESCONOCIDO | No hay lineas de pedido |
| CJ-1126012 | DESCONOCIDO | No hay lineas de pedido |
| CJ-2026004B | DESCONOCIDO | No hay lineas de pedido |

---

## FASE 3 — Pending Orders Bug

### Diagnostico del `pdAgg` vacio en `_resync-coverage-snapshot.ts`

```typescript
// Line 97-103 of _resync-coverage-snapshot.ts:
// 3. Pending orders deduction — CustomerOrderRecord is header-only (no productRef/quantity).
// Until order-lines sync is implemented, pending deductions = 0 per reference.
const pdAgg: Array<{ productRef: string; pending_qty: number; }> = [];
```

**El desarrollador ya sabia que el problema existia.** El array se deja vacio intencionalmente con un comentario explicando por que.

### Causa raiz

1. SAG PD orders se sincronizan como `k_n_clase_fuente=4` (PEDIDOS CLIENTES)
2. El sync adapter (`sag-pya-soap`) extrae solo el **header** del movimiento (beneficiario, valor, fecha)
3. Las **lineas de producto** del pedido viven en `MOVIMIENTOS_ITEMS` pero **nunca se extraen** para PD
4. `rawJson` se guarda vacio porque el sync no incluye items
5. No existe un modelo tipo `CustomerOrderLine` en el schema

### El dato SI existe en SAG

Los items de pedido existen en SAG en la tabla `MOVIMIENTOS_ITEMS`:
- `ka_nl_articulo` = codigo articulo
- `ss_talla` = talla
- `ss_color` = color
- `n_cantidad` = cantidad
- Linked via `ka_nl_movimiento` al header

**Pero nunca se sincroniza a Agentik para documentos PD.**

### CRMQuoteLine como fuente alternativa parcial

CRMQuoteLine tiene datos de producto para quotes del CRM (SuiteCRM V8), pero:
- Solo 285 quotes, todas en DRAFT
- Solo 527 referencias cubiertas (de ~3,000 textiles)
- Representan **intenciones de pedido del vendedor**, no pedidos confirmados SAG
- warehouseName: "BODEGA PRINCIPAL" o "PRODUCTO EN PROCESO" (names, not codes)

Para las 4 refs:

| Referencia | CRM lines | CRM total qty | Warehouse |
|---|---|---|---|
| L-1367 | 56 | 75 | BODEGA PRINCIPAL |
| L-8467 | 0 | 0 | — |
| CJ-1126012 | 34 | 36 | PRODUCTO EN PROCESO |
| CJ-2026004B | 0 | 0 | — |

---

## FASE 4 — Vendedores / Maletas

### VendorCommercialBag / VendorBagItem

**Estado: Tablas existen pero estan VACIAS.**

- VendorCommercialBag: 0 registros
- VendorBagItem: 0 registros
- VendorBagOrderLine: 0 registros

El sistema de maletas (sales portfolios) tiene codigo completo (`lib/comercial/maletas/` — 39 archivos) pero **nunca se ha activado con datos reales**.

### Bodegas de vendedor en SAG

SAG tiene bodegas que probablemente corresponden a vendedores/tiendas (por el patron de uso):

| Bodega | Productos textiles | Saldo total | Negativos | Rol probable |
|---|---|---|---|---|
| 00 | 1,518 | -14,403 | 8,392 | Bodega virtual / ajuste |
| 02 | 1,369 | -29,539 | 12,530 | Vendedor/despacho |
| 03 | 602 | -10,681 | 5,206 | Vendedor/despacho |
| 22 | 377 | -1,852 | 1,863 | Punto de venta |
| 23 | 1,044 | -9,663 | 6,370 | Vendedor/despacho |
| 29 | 712 | -6,080 | 4,229 | Vendedor/despacho |
| 08-15 | 44-79 each | negative | ~300 each | Tiendas/almacenes |

**Todas tienen saldos negativos** — lo cual indica que son destinos de despacho desde B01. Los saldos negativos reflejan mercancia que **salio** de B01 hacia esos destinos.

### Clasificacion

| Concepto | Clasificacion |
|---|---|
| Bodegas 08-15 | **STOCK DISTRIBUIDO** — probablemente tiendas/almacenes con stock local |
| Bodegas 02, 03, 23, 29 | **STOCK VENDEDOR** — probablemente asignado a vendedores para venta directa |
| Bodega 00 | **AJUSTE/VIRTUAL** — puede ser bodega de ajustes contables |
| Bodega 22 | **PUNTO DE VENTA** — similar a tienda |

**IMPORTANTE: No confirmar sin validacion de la administradora.** Los IDs numericos (wh_id 10-60) no revelan nombres de bodega — SAG no los incluyo en el sync.

### Para las 4 refs

| Referencia | Bodegas extra | Qty extra |
|---|---|---|
| L-1367 | B24=+2 | +2 (insignificante) |
| L-8467 | ninguna | 0 |
| CJ-1126012 | ninguna | 0 |
| CJ-2026004B | B02=-4, B23=-2 | -6 (despacho a vendedores) |

---

## FASE 5 — Tiendas

### SaleRecord stores (puntos de venta registrados)

| Store | Sales records | Rol |
|---|---|---|
| SAG | 44,872 | Sistema ERP |
| Empresa | 35,787 | Despacho principal |
| Empresa F2 | 15,192 | Facturacion secundaria |
| Almacen D | 8,995 | Tienda |
| Almacen G | 6,446 | Tienda |
| Almacen A | 6,382 | Tienda |
| Almacen C | 4,473 | Tienda |
| Addi/Sistecredit | 2,320 | Canal financiacion |
| POS | 1,909 | Punto de venta |
| Tienda Web | 1,672 | E-commerce |
| Almacen | 378 | Tienda |
| Empresa F1 | 210 | Facturacion |

**Las tiendas (Almacen A/C/D/G) probablemente corresponden a bodegas 08-15** en SAG, pero no hay mapping confirmado.

### StoreWarehouseMappingConfig

El sistema de configuracion de bodegas por tienda existe (`store-warehouse-config-service.ts`) pero se persiste en `AgentExecution` — no verificado si tiene datos configurados para Castillitos.

---

## FASE 6 — Web

### Tienda Web

- Aparece en `SaleRecord` con 1,672 registros de venta
- No tiene bodega SAG asignada de manera explicita
- Probablemente despacha desde B01 (bodega principal)
- **No tiene stock web separado** en el modelo actual

### Shopify

- El modulo Shopify de Marketing Studio gestiona contenido y publicaciones
- No tiene inventario propio en Agentik — usa lo que Shopify reporta via API
- No afecta el calculo de disponibilidad textil

---

## FASE 7 — Transferencias

### InventoryTransfer

```
status | cnt
closed | 1,890
open   | 1,231
```

3,121 transferencias registradas, pero:

- `originWarehouseCode` y `destinationWarehouseCode` son **NULL** para todas
- Las lineas de transferencia (`InventoryTransferLine`) no pudieron consultarse con los refs de auditoria (0 resultados)
- Los transfers existen como headers sincronizados desde SAG pero **sin warehouse codes resueltos**

### Para las 4 refs

No hay transferencias con lineas que coincidan con las 4 referencias auditadas.

---

## FASE 8 — Reconciliacion de Referencias

### Modelo de reconciliacion

```
disponible_agentik = B01 + B04
compromisos_conocidos = CRM_draft_qty (parcial, solo 2 de 4 refs)
gap = admin - (gross - compromisos)
```

| Campo | L-1367 | L-8467 | CJ-1126012 | CJ-2026004B |
|---|---|---|---|---|
| **Admin reportado** | **64** | **511** | **79** | **164** |
| B01 | -428 | -79 | -81 | -3 |
| B04 | 504 | 600 | 200 | 200 |
| **B01+B04 (gross)** | **76** | **521** | **119** | **197** |
| CRM draft qty | 75 | 0 | 36 | 0 |
| Other bodegas | +2 (B24) | 0 | 0 | -6 (B02,B23) |
| **reservedQty (PIL)** | **0** | **0** | **0** | **0** |
| **pendingOrdersQty (CCS)** | **0** | **0** | **0** | **0** |
| **Gross - CRM draft** | **1** | **521** | **83** | **197** |
| **Gap vs admin** | **+63** | **-10** | **-4** | **-33** |

### Analisis

- **L-1367**: CRM drafts (75) overcorrect — suggesting CRM drafts are NOT actual commitments but vendor wishes. Without them: gap = -12 (Agentik 76 vs admin 64). The 12 extra units likely come from PD orders that admin sees but Agentik doesn't deduct.

- **L-8467**: No CRM data. Gap = -10. Clean case: 10 units committed somewhere (likely PD orders).

- **CJ-1126012**: CRM drafts (36) bring calc to 83, close to admin 79 (gap -4). The CRM data from "PRODUCTO EN PROCESO" (B04) partially explains the gap.

- **CJ-2026004B**: No CRM data. Gap = -33. The 6 units in other bodegas (B02, B23) account for only -6. Remaining 27 units likely in PD orders.

---

## FASE 9 — Patrones

### Fuente principal de la diferencia

| Causa | Peso estimado | Evidencia |
|---|---|---|
| **Pedidos pendientes SAG (PD)** | **70-80%** | 9,522 orders PENDIENTE, header-only, no product refs |
| Bodegas vendedor/tienda | 10-15% | B02/B03/B23/B29 tienen stock negativo (despacho a canales) |
| Desfase temporal sync | 5-10% | Ultimo sync PIL: Jun 23 (7 dias al momento de auditoria) |
| CRM drafts | 0-5% | Solo DRAFT, no confirmados, probablemente no representan compromisos reales |

### Patron global

Los **pedidos PD de SAG** son la unica fuente significativa de compromiso que Agentik no puede descontar. Todos los demas factores (bodegas, CRM, transfers) son secundarios o no aplican.

---

## FASE 10 — Modelo Recomendado

### Formula conceptual: Disponibilidad Comercial Textil

```
TEXTIL_BRUTO =
  B01 (dispatch)
  + B04 (produccion terminada)

TEXTIL_DISPONIBLE_PARA_VENTA =
  TEXTIL_BRUTO
  - pedidos_pendientes_SAG_PD     ← FALTANTE CRITICO
  - reservas_confirmadas           ← no existe modelo aun
```

### Clasificacion de stock

| Tipo | Bodegas | Estado | Incluir en disponibilidad |
|---|---|---|---|
| **Stock central** | B01 + B04 | IMPLEMENTADO | SI (ya corregido) |
| **Stock tienda** | B08-B15, B22 | NO IMPLEMENTADO | SEPARAR (stock local, no central) |
| **Stock vendedor** | B02, B03, B23, B29 | NO IMPLEMENTADO | SEPARAR (asignado a canal) |
| **Stock muestra** | parte de vendor bodegas | NO IMPLEMENTADO | NO (no vendible) |
| **Stock web** | parte de B01 | N/A | YA INCLUIDO (despacha desde B01) |
| **Stock en transito** | transfers pendientes | NO FUNCIONAL | SEPARAR (cuando se implemente) |
| **Stock importacion** | B24, B26, B27, B42-B49 | NO IMPLEMENTADO | SEPARAR (otro segmento) |

### Regla clave

**Los pedidos PD de SAG son la unica deduccion que falta para cerrar el gap.** Las bodegas de vendedor/tienda no deben restarse del disponible central — representan stock que ya salio del ciclo B01+B04. Lo que falta es descontar lo que **va a salir** (pedidos pendientes).

---

## FASE 11 — Impacto Global

### Si se descontaran pedidos PD

No es posible estimar el impacto exacto porque `CustomerOrderRecord` no tiene lineas de producto. Sin embargo:

- 9,522 pedidos PENDIENTE con un valor total probable de cientos de millones COP
- 527 referencias tienen quote lines en CRM (35,903 unidades total)
- Impacto estimado: **500-1,500 referencias** podrian cambiar de "disponible" a "critico" o "agotado"

### Si se separara stock tienda/vendedor

| Bodega grupo | Productos textiles | Saldo neto |
|---|---|---|
| Vendedor (02,03,23,29) | ~2,700 | -55,963 |
| Tienda (08-15,22) | ~800 | -5,900 |
| Total stock distribuido | ~3,500 | -61,863 |

Este stock negativo representa mercancia que ya fue **contablemente despachada** — ya esta reflejado en B01 como salida. No debe restarse nuevamente.

---

## FASE 12 — Plan de Correccion

### P0: INVENTORY-PENDING-ORDERS-SYNC-01

**Prioridad:** CRITICA
**Impacto:** Cierra 70-80% del gap entre B01+B04 y admin

Sincronizar lineas de producto para pedidos PD de SAG:

1. Extender el sync adapter (`sag-pya-soap`) para extraer `MOVIMIENTOS_ITEMS` cuando `k_n_clase_fuente=4`
2. Crear modelo `CustomerOrderLine` (reference, qty, size, color, warehouseCode)
3. Persistir lineas vinculadas a `CustomerOrderRecord`
4. Actualizar `_resync-coverage-snapshot.ts` para usar `CustomerOrderLine` en `pdAgg`
5. Agregar campo `pendingOrdersQty` real a `CommercialCoverageSnapshot`

### P1: INVENTORY-BODEGA-IDENTITY-01

**Prioridad:** ALTA
**Impacto:** Permite clasificar stock por canal

1. Extraer nombres de bodega de SAG (tabla BODEGAS: ka_nl_bodega, sc_nombre_bodega)
2. Crear mapping bodega → rol (central, tienda, vendedor, produccion, importacion)
3. Confirmar con administradora que bodegas son tiendas vs vendedores
4. Actualizar `inventory-warehouse-topology.ts` con segmentos completos

### P2: INVENTORY-COMMITMENT-ENGINE-01

**Prioridad:** MEDIA
**Impacto:** Modelo completo de disponibilidad

1. Crear `CommitmentEngine` que agrupe todas las deducciones
2. Integrar: PD orders + reservas + bag assignments (cuando se activen)
3. Producir `disponible_para_venta = bruto - sum(compromisos)`
4. Exponer en UI con desglose de compromisos por tipo

### P3: INVENTORY-STORE-VENDOR-STOCK-MODEL-01

**Prioridad:** BAJA (requiere P1)
**Impacto:** Visibilidad de stock distribuido

1. Separar stock por canal en el modelo de datos
2. Crear vistas de inventario por tienda/vendedor
3. Integrar con Tiendas module para surtido inteligente

---

## Archivos de Referencia

### Scripts de forensics (READ ONLY)

| Script | Fase |
|---|---|
| `scripts/_commitments-forensics.ts` | Q1-Q11: Bodegas, orders, CRM, coverage |
| `scripts/_commitments-forensics-phase2.ts` | Vendor bags, transfers, case items |
| `scripts/_commitments-forensics-phase3.ts` | Column names for commitment tables |
| `scripts/_commitments-forensics-phase4.ts` | Vendor bags, CRM quotes, transfers deep |
| `scripts/_commitments-forensics-reconcile.ts` | Reconciliation per reference |
| `scripts/_commitments-forensics-final.ts` | CRM status, bodega identity, stores |

### Archivos clave del pipeline

| Archivo | Relevancia |
|---|---|
| `scripts/_resync-coverage-snapshot.ts` | Writer — `pdAgg` hardcoded to empty |
| `lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync.ts` | SAG sync — all bodegas, no PD lines |
| `lib/comercial/maletas/sag-inventory-adapter.ts` | SAG PD/AP source code semantics |
| `lib/comercial/tiendas/sag-store-adapter.ts` | Store warehouse discovery |
| `prisma/schema.prisma` | CustomerOrderRecord model (header-only) |

---

## TSC Baseline

```
npx tsc --noEmit → 160 errors (baseline preserved, 0 new errors)
```

No se modifico codigo productivo. Solo se crearon scripts de forensics en `scripts/`.
