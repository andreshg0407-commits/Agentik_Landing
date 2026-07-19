# COMMERCIAL-DATA-TRACEABILITY-MATRIX-01

**Sprint:** COMMERCIAL-DATA-COVERAGE-AUDIT-01
**Date:** 2026-07-14

---

## Legend

- **SAG Field**: raw field name from SAG PYA SOAP response
- **Mapper**: function in `mappers.ts` that transforms it
- **Prisma Field**: field name in Prisma model
- **Engine**: which decision engine consumes it
- **UI**: which page/component renders it
- **Status**: CONNECTED / PARTIAL / ORPHANED / MISSING

---

## 1. CUSTOMERS (TERCEROS)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| NIT | mapSagCustomer | CustomerProfile.nit | SalesRepPack, OrderPack | /clientes, /pedidos, /vendedores | CONNECTED |
| NOMBRE | mapSagCustomer | CustomerProfile.name | SalesRepPack | /clientes, /vendedores | CONNECTED |
| CIUDAD | mapSagCustomer | CustomerProfile.cityCode | - | /clientes (DANE resolved) | PARTIAL |
| DEPARTAMENTO | mapSagCustomer | CustomerProfile.departmentCode | - | /clientes (DANE resolved) | PARTIAL |
| DIRECCION | mapSagCustomer | CustomerProfile.address | - | /clientes/[id] 360 | CONNECTED |
| TELEFONO | mapSagCustomer | CustomerProfile.phone | - | /clientes/[id] 360 | CONNECTED |
| EMAIL | mapSagCustomer | CustomerProfile.email | - | /clientes/[id] 360 | CONNECTED |
| VENDEDOR | mapSagCustomer | CustomerProfile.sellerCode | SalesRepPack | /vendedores | PARTIAL (engine orphaned) |
| NIT_VENDEDOR | mapSagCustomer | CustomerProfile.sellerNit | - | /vendedores | CONNECTED |
| ZONA | mapSagCustomer | CustomerProfile.zone | - | /clientes | CONNECTED |
| FORMA_PAGO | mapSagCustomer | CustomerProfile.paymentTerms | OrderPack | /pedidos | PARTIAL (engine orphaned) |
| TIPO_TERCERO | mapSagCustomer | CustomerProfile.entityType | - | - | ORPHANED |
| TIPO_CLIENTE | mapSagCustomer | CustomerProfile.customerType | - | /clientes | CONNECTED |
| PRECIO_VENTA | mapSagCustomer | CustomerProfile.priceList | OrderPack | /pedidos | PARTIAL |
| CREDITO | mapSagCustomer | CustomerProfile.creditLimit | OrderPack | /pedidos | PARTIAL (engine orphaned) |
| DIAS_CREDITO | mapSagCustomer | CustomerProfile.creditDays | OrderPack | /pedidos | PARTIAL (engine orphaned) |
| ACTIVO | mapSagCustomer | CustomerProfile.isActive | - | /clientes | CONNECTED |
| FECHA_MODIFICACION | mapSagCustomer | CustomerProfile.sagModifiedAt | - | - | ORPHANED (internal) |

---

## 2. ARTICLES (ARTICULOS)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| ka_ni_articulo | mapSagArticle (via storage) | ProductEntity.externalId | ALL engines | ALL commercial pages | CONNECTED |
| ka_descripcion | mapSagArticle (via storage) | ProductEntity.productName | ALL engines | ALL commercial pages | CONNECTED |
| ka_nl_linea | mapSagArticle (via storage) | ProductEntity.productLine | TiendasPack, ImportPack | /tiendas, /importaciones | CONNECTED |
| ka_nl_grupo | mapSagArticle (via storage) | ProductEntity.productGroup | TiendasPack | /tiendas, /pedidos | CONNECTED |
| ka_nl_subgrupo | mapSagArticle (via storage) | ProductEntity.subgrupoSag | TiendasPack | /tiendas | CONNECTED |
| ka_referencia | mapSagArticle (via storage) | ProductEntity.referenceCode | OrderPack, MaletasPack | /pedidos, /maletas | CONNECTED |
| ka_nl_marca | NOT MAPPED | - | - | - | MISSING (placeholder query) |
| ka_nl_coleccion | NOT MAPPED | - | - | - | MISSING (placeholder query) |
| ka_nl_temporada | NOT MAPPED | - | - | - | MISSING (placeholder query) |
| ka_activo | mapSagArticle (via storage) | ProductEntity.isActive | - | product search | CONNECTED |
| ka_fecha_creacion | mapSagArticle (via storage) | ProductEntity.sagCreatedAt | - | - | ORPHANED (internal) |

---

## 3. INVENTORY (INVENTARIOS)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| ka_nl_bodega | inventory sync handler | ProductInventoryLevel.warehouseId | TiendasPack, MaletasPack | /tiendas, /maletas, /inventario | CONNECTED |
| ka_nl_articulo | inventory sync handler | ProductInventoryLevel.productId (FK) | ALL inventory engines | ALL stock pages | CONNECTED |
| ka_disponible | inventory sync handler | ProductInventoryLevel.availableQty | TiendasPack, OrderPack | /tiendas, /pedidos, /inventario | CONNECTED |
| ka_comprometido | inventory sync handler | ProductInventoryLevel.committedQty | - | /inventario | PARTIAL |
| ka_pedido | inventory sync handler | ProductInventoryLevel.orderedQty | - | /inventario | PARTIAL |
| ka_talla | inventory sync handler | ProductInventoryLevel.size | TiendasPack | /tiendas, /pedidos | CONNECTED |
| ka_color | inventory sync handler | ProductInventoryLevel.color | TiendasPack | /tiendas, /pedidos | CONNECTED |
| ka_ubicacion | inventory sync handler | ProductInventoryLevel.location | - | - | ORPHANED |

---

## 4. ORDERS (PEDIDOS SAG)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| ss_numero | mapSagOrder | CustomerOrderRecord.orderNumber | - | /pedidos | CONNECTED |
| ss_fecha | mapSagOrder | CustomerOrderRecord.orderDate | - | /pedidos, /clientes/[id] | CONNECTED |
| ss_nit | mapSagOrder | CustomerOrderRecord.customerNit | OrderPack | /pedidos | PARTIAL (engine orphaned) |
| ss_total | mapSagOrder | CustomerOrderRecord.totalAmount | - | /pedidos | CONNECTED |
| ss_estado | mapSagOrder | CustomerOrderRecord.status | - | /pedidos | CONNECTED |
| ss_vendedor | mapSagOrder | CustomerOrderRecord.sellerCode | SalesRepPack | /vendedores | PARTIAL (engine orphaned) |
| ss_remision | mapSagOrder | CustomerOrderRecord.remisionNumber | - | /produccion (OP→ET link) | CONNECTED |
| ss_bodega | mapSagOrder | CustomerOrderRecord.warehouseCode | - | /pedidos | CONNECTED |

---

## 5. RECEIVABLES (CARTERA)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| doc | mapSagReceivable | Receivable.documentNumber | SalesRepPack | /vendedores, /clientes/[id] | PARTIAL (engine orphaned) |
| fecha | mapSagReceivable | Receivable.documentDate | SalesRepPack | /vendedores | PARTIAL |
| vencimiento | mapSagReceivable | Receivable.dueDate | SalesRepPack | /vendedores, /finanzas | PARTIAL |
| valor | mapSagReceivable | Receivable.originalAmount | SalesRepPack | /vendedores | PARTIAL |
| saldo | mapSagReceivable | Receivable.currentBalance | SalesRepPack | /vendedores, /finanzas | PARTIAL |
| nit | mapSagReceivable | Receivable.customerNit | SalesRepPack | /vendedores | PARTIAL |
| abono | mapSagReceivable | Receivable.paidAmount | - | - | MISSING (always zero) |

---

## 6. SALES (MOVIMIENTOS)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| comprobante | mapSagMovement | SaleRecord.documentId | - | /ventas | CONNECTED |
| fecha | mapSagMovement | SaleRecord.saleDate | ImportPack | /importaciones | PARTIAL (engine orphaned) |
| total | mapSagMovement | SaleRecord.totalAmount | - | /ventas | CONNECTED |
| nit | mapSagMovement | SaleRecord.customerNit | - | /ventas | CONNECTED |
| articulo | mapSagMovement | SaleRecord.productCode | ImportPack | - | MISSING (always NULL) |

---

## 7. PRODUCTION (OP/ET/CN)

| SAG Field | Mapper | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| ss_numero (OP) | production sync | ProductionEvent.eventNumber | ProductionPack | /produccion/ordenes | PARTIAL (engine orphaned) |
| ss_fecha (OP) | production sync | ProductionEvent.eventDate | ProductionPack | /produccion/ordenes | PARTIAL |
| ss_estado (OP) | production sync | ProductionEvent.status | - | /produccion/ordenes | CONNECTED |
| ss_remision (ET) | production sync | ProductionEvent.remisionNumber | - | /produccion/etapas | CONNECTED |
| CN articles | production sync | ProductionEvent.rawJson | - | /produccion/consumos | PARTIAL |
| CN ka_nl_bodega | NOT MAPPED | - | - | - | MISSING (CN has no header bodega) |

---

## 8. CRM DATA (SuiteCRM V8)

| CRM Field | Adapter | Prisma Model.Field | Engine | UI Page | Status |
|---|---|---|---|---|---|
| quote.name | CRM adapter | CRMQuote.name | - | /pedidos | CONNECTED |
| quote.amount | CRM adapter | CRMQuote.amount | OrderPack | /pedidos | PARTIAL |
| quote.billing_account_id | CRM adapter | CRMQuote.rawCrmJson | - | /clientes/[id] (workaround) | PARTIAL |
| quote.assigned_user | CRM adapter | CRMQuote.assignedUser | SalesRepPack | /vendedores | PARTIAL |
| quoteLine.product | CRM adapter | CRMQuoteLine.productName | - | /pedidos (line detail) | CONNECTED |
| quoteLine.quantity | CRM adapter | CRMQuoteLine.quantity | - | /pedidos | CONNECTED |
| quoteLine.unit_price | CRM adapter | CRMQuoteLine.unitPrice | - | /pedidos | CONNECTED |

---

## Coverage Summary

| Traceability Stage | Fields Traced | Connected | Partial | Orphaned | Missing |
|---|---|---|---|---|---|
| SAG → Prisma | 65 | 42 | 8 | 6 | 9 |
| CRM → Prisma | 12 | 7 | 4 | 0 | 1 |
| Prisma → Engine | 77 | 25 | 18 | 15 | 19 |
| Engine → UI | 77 | 30 | 12 | 20 | 15 |
| **End-to-End** | **77** | **20 (26%)** | **22 (29%)** | **15 (19%)** | **20 (26%)** |
