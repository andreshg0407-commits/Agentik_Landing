# COMMERCIAL_DATA_DOMAIN_MATRIX_01

**Sprint:** COMMERCIAL-DATA-DOMAINS-01
**Date:** 2026-07-11
**Companion:** COMMERCIAL_DATA_DOMAINS_01.md

---

## Domain Matrix

| Dominio | Entidades | Fuentes | Motores | Modulos | Requerimientos | Dependencias | MVP | V2 | Prioridad |
|---|---|---|---|---|---|---|---|---|---|
| **PRODUCT** | ProductProfile, ProductVariant, ProductPrice, ProductClassification | SAG v_articulos, heuristicas | Coverage, Rotation, Repurchase, Markdown, Maletas | Inventario, Tiendas, Maletas, Pedidos, Marketing, Control | #13 (tallas/colores) | NINGUNA (raiz) | Profile + Variant + classification | Price snapshots, historico, estados | 1 (Sprint 1) |
| **INVENTORY** | InventoryPosition, InventoryMovement, InventoryAgeIndex, WarehouseProfile | SAG inventario por bodega, MOVIMIENTOS (entradas) | Coverage, Transfer, Rotation, Production Signal, Age | Tiendas, Maletas, Inventario, Control, Pedidos | #4, #10, #16 | PRODUCT | Position multi-bodega + WarehouseProfile | Movimientos historicos, AgeIndex, alertas | 1 (Sprint 1) |
| **SALES** | SalesDocument, SaleLine, SalesReturn, SalesAttribution | SAG MOVIMIENTOS_ITEMS (FV/NV/NC), SaleRecord existente | Rotation, Repurchase, Markdown, Sales Intel, Pricing | Control, Vendedores 360, Clientes 360, Tiendas | #5, #8, #11, #15 | PRODUCT, CUSTOMER | SaleLine (unidades + precio) | SalesReturn (NC), rotacion por tienda | 3 (Sprint 3) |
| **CUSTOMER** | CustomerProfile, CustomerBranch, CustomerReceivable, CustomerBehavior, VendorProfile, CollectionRecord | SAG TERCEROS + CARTERA + PAGOS, CRM Accounts | Customer Intel, Order Validation, Sales Intel | Clientes 360, Control, Pedidos, Vendedores | #1, #2, #3, #12 | NINGUNA (raiz) | Profile enrichment + lastPurchaseAt | Branches, CLV, churn, segmentacion | 1 (Sprint 1) |
| **PURCHASING** | ProductionOrder, ProductionEntry, MaterialConsumption, ProductionTimeline, ImportReceipt, SupplierProfile | SAG MOVIMIENTOS (OP/ET/CN) — ya synced; manual para imports | Production Signal, Repurchase (lead time), Age | Produccion, Inventario, Control, Inteligencia | #9 (parcial) | PRODUCT | YA COMPLETO (produccion nacional) | ImportReceipt manual, SupplierProfile | 5 (Sprint 5) |
| **STORE OPS** | StoreProfile, StoreCoverageRule, StoreCoverageEvaluation, StoreTransferProposal, StoreInventoryPosition | SAG inventario por bodega-tienda, config manual | Coverage, Rules Evidence, Transfer, Assortment | Tiendas, Maletas, Control | #4, #16, #17, #18, #19 | PRODUCT, INVENTORY | StoreInventoryPosition + reglas existentes | Rotacion por tienda, tendencia cobertura | 2 (Sprint 2) |

---

## Entity Ownership Matrix

| Entidad | Dominio dueno | Persistencia | Frescura | Existe hoy? | Sprint |
|---|---|---|---|---|---|
| ProductProfile | PRODUCT | REFERENCE | Diario | PARCIAL (ProductEntity) | 1 |
| ProductVariant | PRODUCT | REFERENCE | Diario | PARCIAL (en v_articulos) | 1 |
| ProductPrice | PRODUCT | SNAPSHOT | Semanal | NO | 5 |
| ProductClassification | PRODUCT | REFERENCE | Diario | PARCIAL (heuristicas) | 1 |
| InventoryPosition | INVENTORY | SNAPSHOT | 15 min | SI (bodega 01 only) | 1 |
| InventoryMovement | INVENTORY | EVENT | 30 min | NO | 4 |
| InventoryAgeIndex | INVENTORY | DERIVED | Diario | NO | 4 |
| WarehouseProfile | INVENTORY | REFERENCE | Manual | PARCIAL (config) | 1 |
| SalesDocument | SALES | TRANSACTIONAL | 30 min | SI (SaleRecord) | — |
| SaleLine | SALES | TRANSACTIONAL | 30 min | NO (GAP principal) | 3 |
| SalesReturn | SALES | TRANSACTIONAL | Diario | NO | 3 |
| SalesAttribution | SALES | DERIVED | Con SalesDocument | SI (parcial en SaleRecord) | — |
| CustomerProfile | CUSTOMER | REFERENCE | Diario | SI (parcial) | 1 |
| CustomerBranch | CUSTOMER | REFERENCE | Manual | NO (tabla no confirmada) | 5 |
| CustomerReceivable | CUSTOMER | SNAPSHOT | 1h | SI (completo) | — |
| CustomerBehavior | CUSTOMER | DERIVED | Diario | NO (derivable) | 1 |
| VendorProfile | CUSTOMER | REFERENCE | Diario | PARCIAL (CRM) | 1 |
| CollectionRecord | CUSTOMER | TRANSACTIONAL | Diario | SI (completo) | — |
| ProductionOrder | PURCHASING | TRANSACTIONAL | Diario | SI (3,376) | — |
| ProductionEntry | PURCHASING | EVENT | Diario | SI (3,640) | — |
| MaterialConsumption | PURCHASING | EVENT | Diario | SI (7,890) | — |
| ProductionTimeline | PURCHASING | DERIVED | Diario | SI (3,387) | — |
| ImportReceipt | PURCHASING | TRANSACTIONAL | Manual | NO (SAG no tiene) | 5 |
| StoreProfile | STORE OPS | REFERENCE | Manual | SI (StoreLocation) | — |
| StoreCoverageRule | STORE OPS | REFERENCE | Manual | SI (completo) | — |
| StoreInventoryPosition | STORE OPS | SNAPSHOT | 15 min | PARCIAL (1 bodega) | 2 |
| StoreCoverageEvaluation | STORE OPS | DERIVED | On-demand | SI (Coverage Engine) | — |
| StoreTransferProposal | STORE OPS | TRANSACTIONAL | On-demand | SI | — |

---

## Motor Requirements Matrix

| Motor | Dominio 1 | Dominio 2 | Dominio 3 | Opera hoy? | Gap bloqueante | Sprint desbloqueo |
|---|---|---|---|---|---|---|
| Coverage Engine | STORE OPS | INVENTORY | PRODUCT | SI (parcial) | Multi-tienda | 2 |
| Rules Evidence Engine | STORE OPS | — | — | SI (completo) | — | — |
| Rotation Engine | SALES | INVENTORY | PRODUCT | NO | SaleLine | 3 |
| Repurchase Engine | SALES | INVENTORY | PURCHASING | NO | Rotation + Age | 4 |
| Markdown Engine | INVENTORY | SALES | PRODUCT | NO | Age + Rotation | 4 |
| Transfer Engine | STORE OPS | INVENTORY | — | SI (parcial) | Multi-tienda | 2 |
| Production Signal Engine | INVENTORY | PURCHASING | — | SI (completo) | — | — |
| Customer Intelligence | CUSTOMER | SALES | — | PARCIAL | lastPurchaseAt | 1 |
| Sales Intelligence | SALES | PRODUCT | CUSTOMER | PARCIAL | SaleLine (unidades) | 3 |
| Commercial Copilot | TODOS | — | — | PARCIAL | Depende de motores | 4+ |

---

## Meeting Requirements → Domain Mapping

| # | Requerimiento | Dominio principal | Sprint | Estado |
|---|---|---|---|---|
| 1 | Sucursales de clientes | CUSTOMER | 5 | BLOQUEADO (tabla no confirmada) |
| 2 | Alerta cartera vencida | CUSTOMER | 1 | YA FUNCIONA |
| 3 | Clientes sin comprar 3 meses | CUSTOMER | 1 | DERIVABLE (enrichment) |
| 4 | Surtido automatico por tallas | STORE OPS | 2 | PARCIAL → completo Sprint 2 |
| 5 | Trazabilidad pedido | SALES | 3 | BLOQUEADO (lineas) |
| 6 | Ventas por tienda | SALES | 1 | YA FUNCIONA (montos) |
| 7 | Ventas por vendedor | SALES | 1 | YA FUNCIONA (montos) |
| 8 | Productos baja rotacion | SALES | 3 | BLOQUEADO (unidades) |
| 9 | Descuentos por antiguedad | INVENTORY | 4 | BLOQUEADO (edad + rotacion) |
| 10 | Fecha ingreso a tienda | INVENTORY | 4 | BLOQUEADO (movimientos) |
| 11 | Rotacion comparativa tiendas | SALES + STORE OPS | 3-4 | BLOQUEADO (lineas por tienda) |
| 12 | Datos completos cliente | CUSTOMER | 1 | PARCIAL → enrichment |
| 13 | Tallas y colores | PRODUCT | 1 | YA EXISTE |
| 14 | Canal de venta | SALES | 1 | YA FUNCIONA |
| 15 | Ventas historicas 6 meses | SALES | 3 | PARCIAL (montos SI, unidades NO) |
| 16 | Alerta agotado a vendedores | INVENTORY + STORE OPS | 2 | BLOQUEADO (multi-tienda) |
| 17 | Reglas por tamano | STORE OPS | 1 | YA EXISTE |
| 18 | Regla general 36 unidades | STORE OPS | 1 | YA EXISTE |
| 19 | Productos especiales tienda | STORE OPS | 2 | PARCIAL (variant_override scope) |

---

## Sprint Sequence Summary

| Sprint | Dominios | Entidades nuevas/enriched | Requerimientos resueltos | Motores desbloqueados |
|---|---|---|---|---|
| 1 | PRODUCT + CUSTOMER + INVENTORY (foundation) | ProductProfile enrich, CustomerProfile enrich, WarehouseProfile, InventoryPosition multi-bodega | #2, #3, #6, #7, #12, #13, #14, #17, #18 | Customer Intelligence, Coverage (parcial) |
| 2 | STORE OPS | StoreInventoryPosition real, DepletionAlert | #4, #16, #19 | Coverage (100%), Transfer (100%) |
| 3 | SALES | SaleLine, SalesReturn | #5, #8, #11p, #15 | Rotation, Sales Intelligence |
| Sprint 4 | INVENTORY temporal + motores | InventoryMovement, AgeIndex, RotationMetric | #9, #10, #11c | Markdown, Repurchase, Age |
| 5 | PURCHASING enrich + CUSTOMER branches | ImportReceipt, ProductPriceSnapshot, CustomerBranch | #1 | Pricing (historico) |

---

## Persistence Strategy Summary

| Tipo | Entidades | Patron |
|---|---|---|
| REFERENCE | ProductProfile, ProductVariant, CustomerProfile, VendorProfile, WarehouseProfile, StoreProfile, StoreCoverageRule, CustomerBranch | Upsert by naturalKey; cambios infrecuentes |
| TRANSACTIONAL | SalesDocument, SaleLine, SalesReturn, ProductionOrder, ImportReceipt, CollectionRecord, StoreTransferProposal | Insert immutable; idempotencia por PK externo |
| SNAPSHOT | InventoryPosition, StoreInventoryPosition, CustomerReceivable, ProductPrice | Overwrite current; optional historico |
| EVENT | InventoryMovement, ProductionEntry, MaterialConsumption | Append-only; nunca borrar |
| DERIVED | InventoryAgeIndex, RotationMetric, CustomerBehavior, SalesAttribution, ProductionTimeline | Recalculado; no fuente de verdad |

---

## Freshness SLA Summary

| Categoria | SLA | Dominios / Entidades |
|---|---|---|
| Near-real-time | 5-15 min | InventoryPosition, StoreInventoryPosition |
| Periodic | 15-60 min | SaleLine, InventoryMovement |
| Daily | 24h | ProductProfile, CustomerProfile, ProductionOrder |
| On-demand | Pre-operacion | CustomerReceivable (antes de pedido) |
| Weekly | 7d | ProductPrice (snapshot PV3/PV4) |
| Manual | User-triggered | ImportReceipt, CustomerBranch, StoreCoverageRule |
