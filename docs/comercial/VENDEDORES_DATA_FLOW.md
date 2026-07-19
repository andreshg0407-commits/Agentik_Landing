# Vendedores 360 — Flujo de datos

**Sprint:** VENDEDORES-DATA-REFINEMENT-01
**Fecha:** 2026-07-04

---

## Flujo completo

```
CRM (SuiteCRM V8)
  |
  | sync: castillitos_crm connector
  | modelo: CRMQuote (issuedAt = date_entered)
  | frecuencia: cada 6h (cron) + manual
  |
  v
COTIZACION CRM ──────────────── Tab: VENTAS (seccion "Cotizaciones CRM")
  |                              Fuente: CRMQuote
  |                              Fecha: issuedAt
  |                              KPIs: Cotizaciones CRM, Valor CRM, Ultima cotizacion
  |
  | enlace: rawCrmJson.raw.id_sag_c
  |
  v
PEDIDO SAG ──────────────────── Tab: VENTAS (seccion "Pedidos SAG")
  |                              Fuente: CustomerOrderRecord
  |                              Fecha: orderDate
  |                              KPIs: Pedidos SAG
  |                              Join: CustomerProfile.nit → CustomerOrderRecord.customerNit
  |
  | procesamiento ERP
  |
  v
FACTURA ─────────────────────── (Pendiente: no hay modelo de factura dedicado)
  |                              Actualmente inferido via CRMQuote.stage = "Facturado"
  |
  | vencimiento
  |
  v
CARTERA ─────────────────────── Tab: CARTERA
  |                              Fuente: CustomerReceivable
  |                              Fecha: dueDate
  |                              KPIs: Clientes con cartera, Saldo asociado
  |                              Join: CustomerProfile.id → CustomerReceivable.customerId
  |
  | pago
  |
  v
RECAUDO ─────────────────────── Tab: RECAUDOS (pendiente PYA)
                                 Fuente: pendiente bodega analitica PYA
                                 No hay modelo actual
```

---

## Separacion conceptual

| Concepto | Fuente | Modelo Prisma | Tab 360 |
|---|---|---|---|
| **Ventas (Cotizaciones)** | CRM SuiteCRM | `CRMQuote` | VENTAS → "Cotizaciones CRM" |
| **Facturas (Pedidos ERP)** | SAG PYA SOAP | `CustomerOrderRecord` | VENTAS → "Pedidos SAG" |
| **Recaudos** | SAG PYA (pendiente) | No existe | RECAUDOS (PYA pending) |
| **Cartera** | SAG PYA SOAP | `CustomerReceivable` | CARTERA |

---

## Fechas por modulo

| Modulo | Campo fecha | Significado |
|---|---|---|
| Vendedores (activityStatus) | `CRMQuote.issuedAt` | Fecha de creacion de cotizacion en CRM |
| Vendedores 360 KPIs | `CRMQuote.issuedAt` | max issuedAt = ultima actividad |
| Clientes (lastPurchaseAt) | `CustomerProfile.lastPurchaseAt` | Ultima compra (campo separado) |
| Pedidos SAG | `CustomerOrderRecord.orderDate` | Fecha del pedido en ERP |
| Cartera | `CustomerReceivable.dueDate` | Fecha de vencimiento del documento |

---

## Por que las fechas pueden parecer antiguas

1. **issuedAt = date_entered en CRM**: Es la fecha de CREACION de la cotizacion en SuiteCRM. Si el CRM no se usa activamente, no habra cotizaciones nuevas incluso con sync funcionando.

2. **Sync pausado**: Si el connector `castillitos_crm` no estaba en el cron (corregido en CRM-SYNC-CRON-HOTFIX-01), los datos no se actualizan.

3. **Cursor incremental**: El sync avanza desde la ultima posicion. Si se reactiva despues de meses, traera solo lo nuevo desde el cursor — no re-descarga todo.

4. **SAG vs CRM**: Los pedidos SAG (`CustomerOrderRecord`) vienen del connector `sag_pya_soap` que SI tiene cron activo. Sus fechas pueden ser mas recientes que CRM.

---

## Source tags en UI

Cada tabla en el drawer 360 ahora muestra su fuente:

- `[CRM]` — Datos de SuiteCRM (cotizaciones, clientes por billing_account_id)
- `[SAG]` — Datos de SAG PYA SOAP (pedidos ERP, cartera, receivables)
- `[PYA]` — Pendiente bodega analitica (recaudos, metas, comisiones)

---

## Preview pattern

Todas las tablas del drawer ahora usan el patron:
- Mostrar primeros 10 registros
- Boton "Ver N mas" para expandir
- Boton "Ver menos" para colapsar

Esto reduce la sobrecarga visual en vendedores con muchas cotizaciones (50+ items).
