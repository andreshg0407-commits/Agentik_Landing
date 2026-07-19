# SAG Master Data Discovery — SAG-MASTER-DATA-DISCOVERY-01

**Sprint:** SAG-MASTER-DATA-DISCOVERY-01
**Date:** 2026-07-12
**Tenant:** Castillitos (active)
**ERP:** SAG PYA
**Contract Version:** 2.6.0 (last reviewed 2026-05-29)

---

## Phase 1 — Entity Catalog

### 1.1 Confirmed SAG Tables (from live Castillitos instance)

| Table | Records | Status | Notes |
|---|---|---|---|
| TERCEROS | confirmed | live | Customer/vendor/supplier master |
| MOVIMIENTOS | confirmed | live | All document headers (facturas, recibos, etc.) |
| MOVIMIENTOS_ITEMS | confirmed | live | Document line items (talla x color detail) |
| ARTICULOS | confirmed | live | Product master — 182 fields |
| BODEGAS | confirmed | live | 37 warehouses |
| ZONAS | confirmed | live | 39 sales zones |
| VENDEDORES | confirmed | live | Sales reps |
| FUENTES | confirmed | live | 127 document sources |
| GRUPOS | confirmed | live | 29 product groups |
| SUBGRUPOS | confirmed | live | Product subgroups |
| LINEAS | confirmed | live | 5 product lines |
| TARIFAS_IVA | confirmed | live | 8 tax rates |
| TALLAS | confirmed | live | 35 sizes |
| COLORES | confirmed | live | 88 colors |

### 1.2 Tables Not Found Standalone (embedded in other structures)

| Expected Table | Status | Resolution |
|---|---|---|
| CARTERA | not standalone | Derived from MOVIMIENTOS + saldos |
| INVENTARIO | not standalone | v_saldos_inventariotallanew (view) |
| FORMAS_PAGO | pending | Value set pending confirmation |
| LISTAS_PRECIO | pending | Price fields in ARTICULOS (n_valor_venta_normal, etc.) |
| TIPOS_TERCERO | confirmed | 3 values confirmed |
| TIPOS_CLIENTE | pending | Not separate from TIPOS_TERCERO |
| EXISTENCIAS | not standalone | Part of inventory view |

### 1.3 Confirmed Value Sets (9/14)

| Value Set | Count | Confirmed |
|---|---|---|
| ZONAS | 39 | Yes |
| BODEGAS | 37 | Yes |
| LINEAS | 5 | Yes |
| TARIFAS_IVA | 8 | Yes |
| GRUPOS | 29 | Yes |
| TALLAS | 35 | Yes |
| COLORES | 88 | Yes |
| TIPOS_TERCERO | 3 | Yes |
| UNIDADES | 1 | Yes |
| FORMAS_PAGO | ? | Pending |
| TIPOS_CLIENTE | ? | Pending |
| VENDEDORES | ? | Pending count |
| LISTAS_PRECIO | ? | Pending |
| SUB_GRUPOS | ? | Pending |

### 1.4 Document Source Registry (FUENTES)

127 document sources classified into 7 categories:

| Category | Count | In Torre | Purpose |
|---|---|---|---|
| OFICIAL | 18+ | Yes | Official documents: FE, NE, R1, PD, etc. |
| NO_OFICIAL | 10 | No | Secondary books: F2, R2, C2, etc. |
| PRODUCCION | 17 | No | Manufacturing: OP, TR, CN, PT, PC, EC, ET |
| INVENTARIO | 2 | No | Physical inventory: IF, AI |
| HISTORICA | 17 | No | Legacy POS, old formats |
| OBSOLETA | 14 | No | Inactive, excluded |
| ARKETOPS | 19 | No | Fiscal control by Arketops |

Key OFICIAL sources for revenue:
- **FE** (ka=101) — Factura Electronica de Venta (current)
- **NE** (ka=102) — Nota Credito Electronica
- **R1** (ka=4) — Recibo de Caja
- **PD** (ka=40) — Pedidos Clientes
- **D1** (ka=25) — Devolucion Ventas
- **C1** (ka=1) — Factura Compra
- **E1** (ka=3) — Egreso/Cheque
- **G1** (ka=5) — Gastos Generales
- **AN** (ka=27) — Anticipo Clientes
- **AV** (ka=29) — Anticipo Proveedores

Key PRODUCCION sources:
- **OP** (ka=33) — Orden de Produccion
- **CN** (ka=80) — Consumos Insumos y Telas (81,367 lines confirmed)
- **ET** (ka=116) — Entrada Producto Terminado (3,640 events confirmed)
- **TR** (ka=34) — Traslado Entre Bodegas
- **PT** (ka=81) — Entrada PT
- **PC** (ka=99) / **EC** (ka=100) — Salida/Entrada Confeccionistas

---

## Phase 2 — Relationships

### 2.1 Core Entity Relationships

```
TERCEROS (1) ──── (N) MOVIMIENTOS         via ka_nl_tercero
MOVIMIENTOS (1) ── (N) MOVIMIENTOS_ITEMS   via document header FK
ARTICULOS (1) ──── (N) MOVIMIENTOS_ITEMS   via k_sc_referencia / ka_nl_articulo
BODEGAS (1) ────── (N) MOVIMIENTOS_ITEMS   via ka_nl_bodega
VENDEDORES (1) ─── (N) MOVIMIENTOS         via ka_nl_vendedor
FUENTES (1) ────── (N) MOVIMIENTOS         via ka_ni_fuente
ZONAS (1) ─────── (N) TERCEROS             via ka_nl_zona
GRUPOS (1) ────── (N) ARTICULOS            via ka_nl_grupo
LINEAS (1) ────── (N) ARTICULOS            via ka_nl_linea
TALLAS (1) ────── (N) MOVIMIENTOS_ITEMS    via ss_talla
COLORES (1) ───── (N) MOVIMIENTOS_ITEMS    via ss_color
```

### 2.2 Cross-Domain Join Paths

```
VENTA → CARTERA:   MOVIMIENTOS.numero_documento → saldo factura
VENTA → PAGO:      MOVIMIENTOS.numero_documento → pagosnew.ID_FACTURA_REF
PAGO → BANCO:      pagosnew.REFERENCIA_BANCARIA → MOVIMIENTOS_BANCO.REFERENCIA_BANCARIA
RECAUDO → BANCO:   RECAUDOS.ID_MOVIMIENTO_BANCO → MOVIMIENTOS_BANCO.ID_MOVIMIENTO_BANCO
VENTA → PRODUCTO:  MOVIMIENTOS_ITEMS.k_sc_referencia → ARTICULOS.k_sc_referencia
VENTA → CLIENTE:   MOVIMIENTOS.ka_nl_tercero → TERCEROS.ka_nl_tercero
PRODUCTO → INVENTARIO: ARTICULOS.k_sc_referencia → v_saldos_inventariotallanew.CODIGO_ARTICULO
```

### 2.3 Document Family Map (Sales Pipeline)

| Family | Codes | Count | Purpose |
|---|---|---|---|
| OFFICIAL_INVOICE | FE, FD, FC, FG, FA, FW, F1, VC, V1-V6, FF, FX | 16 | Revenue recognition |
| CREDIT_NOTE | NE, NC, ND, NF, NS, NT, NG, NA, NW, D1, NX, D2, 2D-6D, D3 | 18 | Revenue reversal |
| DISPATCH_REMISION | F2, F3 | 2 | Operational dispatch (no receivable) |
| DEBIT_NOTE | DB | 1 | Bank debit adjustments |

---

## Phase 3 — Domain Classification

### 3.1 SAG Contract Domains (10 domains)

| Domain | Status | Priority | Fields | View | Sync Frequency |
|---|---|---|---|---|---|
| **pagos** | agreed | 1 | 25 | vw_agentik_pagos (submitted) | daily_eod |
| **ventas** | in_review | 1 | 41 | vw_agentik_ventas | daily_eod |
| **recaudos** | in_review | 1 | 38 | vw_agentik_recaudos | daily_eod |
| **cartera** | in_review | 1 | 39 | vw_agentik_cartera | daily_eod |
| **bancos** | in_review | 1 | 28 | vw_agentik_bancos | daily_eod |
| **inventario** | in_review | 1 | 28 | vw_agentik_inventario | daily_eod |
| **compras** | in_review | 2 | 47 | vw_agentik_compras | daily_eod |
| **clientes** | draft | 2 | 5 | vw_agentik_clientes | weekly |
| **productos** | in_review | 2 | 62 | vw_agentik_productos | daily_eod |
| **produccion** | draft | 3 | 4 | vw_agentik_produccion | daily_eod |

### 3.2 Agentik Commercial Data Layer Domains (10 domains)

| Domain | Status | Entity Types | Freshness | Consumers |
|---|---|---|---|---|
| **PRODUCT** | Active (v1.0.0) | ProductProfile, ProductVariant, ProductPrice, ProductClassification | 24h | CoverageEngine, RotationEngine, RepurchaseEngine, MarkdownEngine, MarketingStudio |
| **CUSTOMER** | Active (v1.0.0) | CustomerProfile, CustomerBranch, CustomerReceivable, CustomerBehavior, VendorProfile, CollectionRecord | 24h | CustomerIntelligence, RulesEvidenceEngine, SalesIntelligence, CommercialCopilot |
| **INVENTORY** | Active (v1.0.0) | InventoryPosition, InventoryMovement, InventoryAgeIndex, WarehouseProfile | 15min | CoverageEngine, TransferEngine, RotationEngine, MarkdownEngine, ProductionSignalEngine |
| **SALES** | Active (v1.0.0) | SalesDocument, SaleLine, SalesReturn, SalesAttribution | 30min | RotationEngine, RepurchaseEngine, MarkdownEngine, SalesIntelligence, CommercialCopilot |
| **PURCHASING_IMPORT** | Active (v1.0.0) | ProductionOrder, ProductionEntry, MaterialConsumption, ProductionTimeline, ImportReceipt, SupplierProfile | 24h | ProductionSignalEngine, RepurchaseEngine |
| **STORE_OPERATIONS** | Active (v1.0.0) | StoreProfile, StoreCoverageRule, StoreCoverageEvaluation, StoreTransferProposal, StoreInventoryPosition | 15min | CoverageEngine, RulesEvidenceEngine, TransferEngine |
| **PRODUCTION** | Inactive (v0.0.1) | — | 24h | — |
| **RECEIVABLES** | Inactive (v0.0.1) | — | 1h | — |
| **WORKFORCE** | Inactive (v0.0.1) | — | 24h | — |
| **LOGISTICS** | Inactive (v0.0.1) | — | 30min | — |

### 3.3 Domain Mapping: SAG Contract → Agentik Domain

| SAG Contract Domain | Agentik Data Layer Domain | Notes |
|---|---|---|
| ventas | SALES | Sales documents, lines, returns |
| pagos | CUSTOMER (receivables) | Payment application to invoices |
| recaudos | CUSTOMER (collections) | Cash receipt confirmation |
| cartera | CUSTOMER (receivables) | Outstanding balance per invoice |
| bancos | (Finance Layer) | Bank movements, reconciliation — not in Commercial Data Layer |
| inventario | INVENTORY | Stock positions by product x size x color x warehouse |
| compras | PURCHASING_IMPORT | Purchase orders, imports, supplier data |
| clientes | CUSTOMER | Customer master data |
| productos | PRODUCT | Master product data |
| produccion | PURCHASING_IMPORT (today) → PRODUCTION (future) | Production orders, consumption, entries |

---

## Phase 4 — Priority Classification

### 4.1 Priority 1 — Critical (blocks daily operations)

| Domain | Reason | Current State |
|---|---|---|
| **ventas** | Revenue recognition, sales KPIs, torre de control | Sync active via MOVIMIENTOS. Sales domain adapter complete. |
| **pagos** | Payment tracking, receivables aging | View submitted to SAG. pagosnew table confirmed. |
| **recaudos** | Cash collection, treasury operations | Contract in_review. 38 fields defined. |
| **cartera** | Outstanding balances, credit risk | Contract in_review. 39 fields + credit blocking fields. |
| **bancos** | Reconciliation, real cash position | Contract in_review. 28 fields. Conciliacion module depends on this. |
| **inventario** | Stock positions, coverage, replenishment | v_saldos_inventariotallanew confirmed. 28 fields. |

### 4.2 Priority 2 — Strategic (blocks intelligence layers)

| Domain | Reason | Current State |
|---|---|---|
| **compras** | Supply chain visibility, vendor management | Contract in_review. 47 fields in 12 blocks. |
| **clientes** | Customer 360, segmentation, credit analysis | Draft only — 5 fields. Major gap. |
| **productos** | Master product truth, cross-domain reference | Contract in_review. 62 fields. Product adapter complete. |

### 4.3 Priority 3 — Future (enables advanced analytics)

| Domain | Reason | Current State |
|---|---|---|
| **produccion** | Cost of goods, manufacturing intelligence | Draft — 4 fields only. ProductionEvent model active with OP/ET sync. |

---

## Phase 5 — Semantic Mapping

### 5.1 SAG Field Naming Conventions

| Prefix | Meaning | Example |
|---|---|---|
| `ka_nl_` | Integer foreign key | ka_nl_tercero (customer FK) |
| `k_sc_` | String code (lookup) | k_sc_referencia (product reference) |
| `sc_` | String descriptive | sc_descripcion (description) |
| `nd_` | Numeric decimal | nd_valor_venta4 (price field) |
| `n_` | Numeric integer/general | n_valor_venta_normal (normal price) |
| `ss_` | System string | ss_talla, ss_color |
| `ddt_` | Date/datetime | ddt_fecha_modificacion |
| `ka_ni_` | Integer unique ID | ka_ni_fuente (source type ID) |

### 5.2 Key Semantic Mappings (SAG → Agentik)

| SAG Concept | SAG Field/Table | Agentik Concept | Agentik Entity |
|---|---|---|---|
| Customer | TERCEROS.ka_nl_tercero | CustomerProfile | CUSTOMER domain |
| Product | ARTICULOS.k_sc_referencia | ProductProfile | PRODUCT domain |
| Invoice | MOVIMIENTOS (fuente=FE) | SalesDocument (FACTURA) | SALES domain |
| Credit Note | MOVIMIENTOS (fuente=NE/NC) | SalesDocument (NOTA_CREDITO) | SALES domain |
| Payment | pagosnew | PaymentRecord | CUSTOMER domain (receivables) |
| Receipt | RECAUDOS_CAJA | CollectionRecord | CUSTOMER domain (collections) |
| Inventory | v_saldos_inventariotallanew | InventoryPosition | INVENTORY domain |
| Purchase Order | (pending) | ImportReceipt | PURCHASING_IMPORT domain |
| Production Order | MOVIMIENTOS (fuente=OP) | ProductionOrder | PURCHASING_IMPORT domain |
| Warehouse | BODEGAS | WarehouseProfile | INVENTORY domain |
| Sales Rep | VENDEDORES | VendorProfile | CUSTOMER domain |
| Zone | ZONAS | (territory attribute) | CUSTOMER/STORE_OPERATIONS |
| Size | TALLAS | (variant attribute) | PRODUCT domain |
| Color | COLORES | (variant attribute) | PRODUCT domain |
| Tax Rate | TARIFAS_IVA | (pricing attribute) | PRODUCT/SALES domain |
| Document Source | FUENTES | (classification) | SALES domain (documentType) |

### 5.3 ARTICULOS Key Fields (182 total, key fields below)

| SAG Field | Type | Agentik Mapping |
|---|---|---|
| k_sc_referencia | string | ProductProfile.referenceCode |
| sc_descripcion | string | ProductProfile.description |
| n_valor_venta_normal | decimal | ProductPrice (standard) |
| n_valor_venta_especial | decimal | ProductPrice (special) |
| n_valor_venta_promocion | decimal | ProductPrice (promo) |
| nd_precio4..nd_precio8 | decimal | ProductPrice (additional lists) |
| ka_nl_grupo | int | ProductClassification.group |
| ka_nl_linea | int | ProductClassification.line |
| ss_maneja_talla_color | string | ProductProfile.hasVariants |
| ss_maneja_kardex | string | ProductProfile.tracksInventory |
| ka_nl_tarifa_iva | int | ProductProfile.taxRateId |
| n_costo | decimal | ProductProfile.cost |

---

## Phase 6 — Ownership Matrix

### 6.1 Data Ownership: Who Owns What

| Data Type | Owner | Source System | Enrichment Layer |
|---|---|---|---|
| Product master data | PRODUCT domain | SAG ARTICULOS | Marketing Studio enrichment |
| Product variants | PRODUCT domain | SAG (talla x color) | None |
| Product prices | PRODUCT domain | SAG price fields | None |
| Customer profiles | CUSTOMER domain | SAG TERCEROS + CRM | CRM enrichment (SuiteCRM V8) |
| Customer receivables | CUSTOMER domain | SAG cartera | Agentik derived (aging, risk) |
| Customer payments | CUSTOMER domain | SAG pagosnew | None |
| Customer collections | CUSTOMER domain | SAG recaudos | None |
| Inventory positions | INVENTORY domain | SAG v_saldos view | Agentik derived (coverage days) |
| Inventory movements | INVENTORY domain | SAG MOVIMIENTOS | None |
| Sales documents | SALES domain | SAG MOVIMIENTOS | Agentik derived (attribution) |
| Sales lines | SALES domain | SAG MOVIMIENTOS_ITEMS | None |
| Production orders | PURCHASING_IMPORT | SAG MOVIMIENTOS (OP) | Agentik derived (timeline) |
| Production entries | PURCHASING_IMPORT | SAG MOVIMIENTOS (ET) | None |
| Material consumption | PURCHASING_IMPORT | SAG MOVIMIENTOS (CN) | None |
| Purchase orders | PURCHASING_IMPORT | SAG (pending) | None |
| Store profiles | STORE_OPERATIONS | Agentik admin | SAG inventory enrichment |
| Bank movements | Finance Layer | SAG bancos | Conciliacion engine |
| Vendor assignments | CUSTOMER domain | SAG VENDEDORES + CRM | None |

### 6.2 Dual-State Ownership (ENTERPRISE-05 Principle)

Every entity has two independent states:

| Dimension | Owner | States |
|---|---|---|
| Administrative | Agentik (user actions) | Configurada / Deshabilitada / Archivada |
| Operational | SAG / external integrations | Nunca sincronizada / Sincronizada / Error |

**Rule:** Admin entities exist independently of sync state. Sync only enriches, never creates or destroys.

---

## Phase 7 — Consumer Engines

### 7.1 Engine → Domain Dependencies

| Engine | Domains Required | Purpose |
|---|---|---|
| **CoverageEngine** | PRODUCT, INVENTORY, STORE_OPERATIONS | Store coverage evaluation and replenishment |
| **RotationEngine** | PRODUCT, INVENTORY, SALES | Product rotation velocity and aging |
| **RepurchaseEngine** | PRODUCT, SALES, PURCHASING_IMPORT | Reorder point and replenishment triggers |
| **MarkdownEngine** | PRODUCT, INVENTORY, SALES | Price markdown recommendations |
| **TransferEngine** | INVENTORY, STORE_OPERATIONS | Inter-store transfer proposals |
| **ProductionSignalEngine** | INVENTORY, PURCHASING_IMPORT | Production triggers based on stock |
| **RulesEvidenceEngine** | CUSTOMER, STORE_OPERATIONS | Business rules evaluation |
| **CustomerIntelligence** | CUSTOMER | Customer segmentation and behavior |
| **SalesIntelligence** | CUSTOMER, SALES | Sales performance and trends |
| **CommercialCopilot** | CUSTOMER, SALES | AI-powered commercial insights |
| **MarketingStudio** | PRODUCT | Product content and publication |

### 7.2 Module → SAG Domain Dependencies

| Agentik Module | SAG Domains Required |
|---|---|
| Torre de Control | ventas, pagos, recaudos, cartera |
| Executive Dashboard | ventas, cartera, inventario, clientes |
| Tesoreria | pagos, recaudos, bancos |
| Conciliacion | pagos, recaudos, bancos, cartera |
| Cierre | ventas, pagos, cartera, produccion |
| Planeacion | ventas, inventario, compras, produccion |
| Inventario Operativo | inventario, produccion |
| Comercial | ventas, clientes, inventario, productos |
| Marketing Studio | productos |
| E-commerce (Shopify) | productos, inventario |
| Alertas | all domains |
| Copilot (Diego/David) | all domains |
| Cliente 360 | clientes, ventas, cartera, pagos, recaudos |

---

## Phase 8 — Business Questions

### 8.1 Revenue & Sales

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Cuanto vendimos hoy/esta semana/este mes?" | ventas.MONTO_NETO, FECHA_VENTA | SALES |
| "Cual es el margen bruto?" | ventas.MARGEN_BRUTO, COSTO_VENTA | SALES + PRODUCT |
| "Quien es el mejor vendedor?" | ventas.ID_VENDEDOR, MONTO_NETO | SALES + CUSTOMER |
| "Que producto genera mas ingresos?" | ventas.ID_PRODUCTO, MONTO_NETO | SALES + PRODUCT |
| "Cuantas devoluciones hay?" | ventas.DEVOLUCION_MONTO, DEVOLUCION_CANTIDAD | SALES |
| "Venta por canal?" | ventas.CANAL_VENTA, ORIGEN_VENTA | SALES |

### 8.2 Receivables & Collections

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Cuanto nos deben?" | cartera.SALDO_PENDIENTE | CUSTOMER |
| "Cuanto esta vencido?" | cartera.SALDO_VENCIDO, DIAS_MORA | CUSTOMER |
| "Quien es el cliente de mas riesgo?" | cartera.RIESGO_CLIENTE, CUPO_CREDITO | CUSTOMER |
| "Cuanto cobramos hoy?" | recaudos.MONTO_RECAUDO | CUSTOMER |
| "Que pagos no estan conciliados?" | bancos.CONCILIADO, pagos.ESTADO_PAGO | Finance |

### 8.3 Inventory & Stock

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Que productos estan agotados?" | inventario.EXISTENCIA, DISPONIBLE | INVENTORY |
| "Que tienda necesita surtido?" | inventario.CODIGO_BODEGA, EXISTENCIA | INVENTORY + STORE_OPS |
| "Cual es la cobertura en dias?" | inventario.DIAS_COBERTURA | INVENTORY |
| "Que productos tienen sobreinventario?" | inventario.EXISTENCIA vs ventas velocity | INVENTORY + SALES |
| "Cuanto vale el inventario?" | inventario.COSTO_PROMEDIO * EXISTENCIA | INVENTORY |

### 8.4 Products

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Que productos necesitan contenido?" | productos.DESCRIPCION_MARKETING empty | PRODUCT |
| "Que productos estan descontinuados?" | productos.DESCONTINUADO | PRODUCT |
| "Que productos dependen de un unico proveedor?" | productos.ID_PROVEEDOR_PRINCIPAL | PRODUCT + PURCHASING |
| "Que margen objetivo tiene cada producto?" | productos.MARGEN_OBJETIVO | PRODUCT |

### 8.5 Purchasing & Supply

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Que compras estan pendientes?" | compras.CANTIDAD_PENDIENTE, ESTADO_OC | PURCHASING |
| "Cuanto tardamos en recibir mercancia?" | compras.DIAS_RETRASO, FECHA_RECEPCION | PURCHASING |
| "Que proveedores incumplen?" | compras.PORCENTAJE_CUMPLIMIENTO | PURCHASING |
| "Cuanto inventario llega pronto?" | compras.STOCK_PROYECTADO_POST_RECEPCION | PURCHASING |

### 8.6 Production

| Question | SAG Fields Required | Domain |
|---|---|---|
| "Cuantas unidades se produjeron?" | produccion.CANTIDAD_PROD | PRODUCTION |
| "Cual es el costo de produccion?" | produccion.COSTO_OP | PRODUCTION |
| "Que insumos se consumieron?" | CN source items | PRODUCTION |

---

## Phase 9 — Knowledge Gaps

### 9.1 Critical Gaps (Block P1 Domains)

| Gap | Domain | Impact | Resolution |
|---|---|---|---|
| **CLIENTES contract has only 5 fields** | clientes | Blocks Customer 360, segmentation, credit analysis | Needs enterprise hardening to ~40 fields (address, contact, branches, terms, zone, seller, segment, status) |
| **BANCOS tables unconfirmed** | bancos | Blocks reconciliation | Need to confirm MOVIMIENTOS_BANCO table/view exists |
| **RECAUDOS source unclear** | recaudos | Blocks treasury operations | Confirm separation between pagosnew and RECAUDOS_CAJA |
| **CARTERA granularity unknown** | cartera | Blocks receivable aging | Confirm one row per invoice vs one row per customer |
| **CONCILIADO field availability** | bancos/recaudos | Blocks intelligent reconciliation | Confirm these fields exist in SAG tables |

### 9.2 Strategic Gaps (Block P2 Domains)

| Gap | Domain | Impact | Resolution |
|---|---|---|---|
| **PRODUCCION contract has only 4 fields** | produccion | Cannot model full manufacturing lifecycle | Needs hardening: add OP/CN/ET/PT/PC/EC fields, bill of materials, production timeline |
| **COMPRAS tables unconfirmed** | compras | Cannot track purchase orders | 47 fields defined but tables not yet located in SAG |
| **Product-Variant separation unknown** | productos | Unclear if SAG models product vs variant | Confirm if ARTICULOS has one row per reference or per talla x color combination |
| **Marketing fields may not exist in SAG** | productos | DESCRIPCION_MARKETING, TAGS_MARKETING may be Agentik-only | Confirm which enrichment fields are SAG-native vs Agentik-managed |
| **Price list structure unknown** | productos | Multiple price lists (normal, especial, promocion, etc.) confirmed but full structure unclear | Confirm nd_precio4..nd_precio8 semantics |

### 9.3 Future Gaps (No Immediate Blocker)

| Gap | Domain | Impact | Resolution |
|---|---|---|---|
| **Logistics data absent** | (future) | No shipping/delivery tracking | LOGISTICS domain inactive |
| **Workforce territory data limited** | (future) | Vendor territory optimization blocked | WORKFORCE domain inactive |
| **Multi-company structure** | all | EMPRESA field referenced but multi-org model unclear | Confirm if Castillitos operates as single or multi-company |
| **DIAN fiscal compliance** | finance | Tax reporting integration | Separate from commercial data layer |

---

## Phase 10 — Sync Roadmap

### 10.1 Current State of Sync

| Domain | Sync Active | Adapter | Data Layer Domain |
|---|---|---|---|
| ventas | Yes (via MOVIMIENTOS) | createSagSalesAdapter | SALES (complete) |
| productos | Yes (via ARTICULOS) | createSagProductAdapter | PRODUCT (complete) |
| inventario | Partial (v_saldos view) | (in Tiendas module) | INVENTORY (descriptor only) |
| produccion | Partial (OP, ET, CN headers) | (ProductionEvent model) | PURCHASING_IMPORT (descriptor only) |
| pagos | Yes (pagosnew) | (direct Prisma) | CUSTOMER (no adapter yet) |
| recaudos | Yes (direct Prisma) | (direct Prisma) | CUSTOMER (no adapter yet) |
| cartera | Derived | (direct Prisma) | CUSTOMER (no adapter yet) |
| clientes | Yes (TERCEROS + CRM) | CastillitosCRM connector | CUSTOMER (no adapter yet) |
| compras | No | — | PURCHASING_IMPORT (no adapter yet) |
| bancos | No | — | Finance Layer (no adapter) |

### 10.2 Recommended Implementation Order

**Sprint 1 — INVENTORY-DOMAIN-01** (P1, 15min freshness)
- Canonical entities: InventoryPosition, InventoryMovement, WarehouseProfile
- Adapter: createSagInventoryAdapter (wraps v_saldos_inventariotallanew)
- Unlocks: CoverageEngine, TransferEngine, RotationEngine

**Sprint 2 — CUSTOMER-DOMAIN-01** (P1, 24h freshness)
- Canonical entities: CustomerProfile, CustomerBranch, VendorProfile
- Adapter: createSagCustomerAdapter (wraps TERCEROS + CRM data)
- Prerequisite: Harden clientes SAG contract to ~40 fields
- Unlocks: CustomerIntelligence, Cliente 360, SalesIntelligence

**Sprint 3 — RECEIVABLES-EXTENSION-01** (P1, extends CUSTOMER)
- Add entities: CustomerReceivable, CollectionRecord, PaymentApplication
- Adapter extensions for pagos, recaudos, cartera
- Unlocks: Treasury operations, receivable aging, collection tracking

**Sprint 4 — PURCHASING-DOMAIN-01** (P2)
- Canonical entities: ImportReceipt, SupplierProfile, PurchaseOrder
- Adapter: createSagPurchasingAdapter
- Prerequisite: Confirm SAG purchase order tables
- Unlocks: RepurchaseEngine, supply chain intelligence

**Sprint 5 — PRODUCTION-DOMAIN-01** (P2, evolves from PURCHASING_IMPORT)
- Extract production entities into standalone domain
- Canonical entities: ProductionOrder, ProductionEntry, MaterialConsumption, BillOfMaterials
- Prerequisite: Harden produccion SAG contract to ~30 fields
- Unlocks: ProductionSignalEngine, manufacturing intelligence

**Sprint 6 — STORE-OPS-DOMAIN-01** (P2)
- Canonical entities: StoreProfile, StoreCoverageRule, StoreInventoryPosition
- Adapter: integrate with existing Tiendas infrastructure
- Unlocks: Coverage optimization, transfer automation

### 10.3 SAG View Request Roadmap

| View | Domain | Status | Next Action |
|---|---|---|---|
| vw_agentik_pagos | pagos | submitted | Wait for SAG response |
| vw_agentik_ventas | ventas | not_submitted | Submit after ventas contract hardening |
| vw_agentik_recaudos | recaudos | not_submitted | Submit with pagos follow-up |
| vw_agentik_cartera | cartera | not_submitted | Submit after granularity confirmation |
| vw_agentik_bancos | bancos | not_submitted | Submit after MOVIMIENTOS_BANCO confirmation |
| vw_agentik_inventario | inventario | not_submitted | Submit — most fields already confirmed |
| vw_agentik_compras | compras | not_submitted | Submit after OC table confirmation |
| vw_agentik_clientes | clientes | not_submitted | Submit after enterprise hardening |
| vw_agentik_productos | productos | not_submitted | Submit — core fields confirmed in ARTICULOS |
| vw_agentik_produccion | produccion | not_submitted | Submit after produccion hardening |

---

## Appendix A -- Evidence Classification

### A.1 Classification Schema

| Level | Definition | Example |
|---|---|---|
| OPERATIONALLY_VALIDATED | Field confirmed with real Castillitos data via sync, query, or forensics | ARTICULOS.CODIGO (10,439 rows synced), ProductionEvent.ET (3,640 events) |
| SAMPLE_CONFIRMED | Field sampled via SOAP/API/Prisma query, values observed but not validated operationally | TERCEROS.ka_nl_tercero (customer FK confirmed in joins) |
| DOCUMENTED_ONLY | Field defined in contract/spec but not confirmed with live data | comprasContract fields (47 total, no table located) |
| CONFLICTED | Field has contradictory information between sources | BODEGAS count: 37 (discovery doc) vs 49 (bodega-flow-forensics audit) |
| UNKNOWN | Field status cannot be determined from available evidence | LISTAS_PRECIO structure |

### A.2 Field Evidence Summary

| Domain | Total Contract Fields | OPERATIONALLY_VALIDATED | SAMPLE_CONFIRMED | DOCUMENTED_ONLY | CONFLICTED | UNKNOWN |
|---|---|---|---|---|---|---|
| ventas | 41 | 15+ (via SALES adapter, MOVIMIENTOS sync) | 10 | 16 | 0 | 0 |
| pagos | 25 | 8 (pagosnew table confirmed, CollectionRecord model) | 5 | 12 | 0 | 0 |
| recaudos | 38 | 5 (R1/R2 cash sources confirmed) | 3 | 30 | 0 | 0 |
| cartera | 39 | 3 (derived from MOVIMIENTOS) | 5 | 31 | 0 | 0 |
| bancos | 28 | 0 | 0 | 28 | 0 | 0 |
| inventario | 28 | 12 (v_saldos view, SagInventoryItem, disponible/warehouseQty) | 8 | 8 | 1 (bodega count) | 0 |
| compras | 47 | 0 | 0 | 47 | 0 | 0 |
| clientes | 5 | 5 (TERCEROS table active in sync) | 0 | 0 | 0 | 0 |
| productos | 62 | 17 (SagArticleRawRow confirmed fields) | 15 | 30 | 0 | 0 |
| produccion | 4 | 4 (ProductionEvent model, OP/CN/ET confirmed) | 0 | 0 | 0 | 0 |
| **TOTAL** | **317** | **69** | **46** | **202** | **1** | **0** |

### A.3 Key Conflicts Found

| Conflict | Source A | Source B | Resolution |
|---|---|---|---|
| BODEGAS count | Discovery doc: 37 warehouses | bodega-flow-forensics audit: 49 bodegas discovered | CONFLICTED -- need live recount. 37 may be active-only; 49 includes inactive/historical. |

---

## Appendix B -- Domain Readiness for INVENTORY-DOMAIN-01

### B.1 Readiness Assessment: READY_WITH_GAPS

| Criterion | Status | Evidence |
|---|---|---|
| Table/view confirmed | YES | v_saldos_inventariotallanew (view, live in SAG) |
| Join keys identified | YES | ka_nl_articulo (product FK), ka_nl_bodega (warehouse FK), ss_talla, ss_color |
| Granularity confirmed | PARTIAL | View returns product x talla x color x bodega. Variant-level confirmed. |
| Bodegas enumerated | CONFLICTED | 37 vs 49. Warehouse topology known: B14/B15 (raw materials) -> B04 (WIP) -> B01 (finished goods). |
| Reference/variant fields | YES | k_sc_referencia (product ref), ss_talla (size), ss_color (color), ss_maneja_talla_color flag |
| Disponible field | YES | SagInventoryInputRow.disponible confirmed. Operational formula: disponible = warehouseQty - reservedQty |
| Reservado field | YES | SagInventoryInputRow.pendingOrdersQty (PD orders), SagInventoryNormalizedRow.crmReservedQty (CRM DRAFT) |
| Comprometido field | PARTIAL | pendingPDQty tracked. No SAG-native "comprometido" field -- Agentik derives from PD orders. |
| Movement types | YES | 17 PRODUCCION FUENTES mapped. Inventory-affecting: CN (ka=80), ET (ka=116), TR (ka=34), PC (ka=99), EC (ka=100). INVENTARIO FUENTES: IF, AI. |
| Incremental sync | NOT_CONFIRMED | V1 is full snapshot upload. V2 (ODBC) planned. No confirmed delta/incremental mechanism from SAG. |
| Annulments | PARTIAL | SalesDocument has deriveSalesDocumentStatus (ANULADA detection). Inventory annulment flow not explicitly modeled. |
| Double-counting risks | DOCUMENTED | F1/F2 universe separation enforced. Source-aware layer prevents mixing. AP cleanup NEVER affects stock. |
| Cost fields | YES | n_costo (unit cost), COSTO_PROMEDIO in inventory view. COSTO_TOTAL_EXISTENCIA is derived (cost * qty). |
| Dates | PARTIAL | ddt_fecha_modificacion on ARTICULOS. Inventory view may not have last-movement date. |

### B.2 INVENTORY Blockers for INVENTORY-DOMAIN-01

1. **Bodega count conflict** -- Must recount live bodegas to confirm 37 vs 49. Active vs inactive classification needed.
2. **Incremental sync** -- V1 snapshot-only. Need to confirm if v_saldos_inventariotallanew supports date filtering for delta sync.
3. **Movement history** -- Inventory view is snapshot (current stock). Movement history requires MOVIMIENTOS_ITEMS query with inventory-affecting FUENTES.

### B.3 INVENTORY Available Infrastructure

| Component | File | Status |
|---|---|---|
| V1 Input contract | lib/integrations/sag/sag-inventory-contract.ts | Complete |
| V1 Normalizer | lib/integrations/sag/sag-inventory-normalizer.ts | Complete |
| Inventory adapter (Maletas) | lib/comercial/maletas/sag-inventory-adapter.ts | Active (SagInventoryItem) |
| Inventory refresh pipeline | lib/integrations/sag/inventory-refresh-pipeline.ts | Exists |
| Domain descriptor | lib/comercial/data-layer/domains/commercial-domain-descriptors.ts | INVENTORY domain registered |
| Prisma model | CommercialCoverageSnapshot | Active, receiving data |

---

## Appendix C -- Domain Readiness Summary

| Domain | Readiness | Key Evidence | Blockers |
|---|---|---|---|
| **INVENTORY** | READY_WITH_GAPS | v_saldos view confirmed, SagInventoryItem model active, 5 availability fields | Bodega count conflict, incremental sync unconfirmed |
| **CUSTOMER** | READY_WITH_GAPS | TERCEROS active in sync, 5 fields in contract, identity resolution (NIT, crmId, billing_account_id) working | Contract needs hardening 5->40 fields, full TERCEROS field list unconfirmed |
| **RECEIVABLES** | PARTIALLY_READY | pagosnew confirmed, CollectionRecord model active, 15 cash sources classified in cash-sources.ts | RECAUDOS vs PAGOS separation unclear, CARTERA granularity unknown |
| **PURCHASING_IMPORT** | NOT_READY | 47-field contract exists but no SAG tables located. OC (ka=53) marked OBSOLETA. | Tables unconfirmed, no adapter |
| **PRODUCTION** | READY_WITH_GAPS | ProductionEvent model active, 15 SAG FUENTES mapped, OP/CN/ET synced (3376/7890/3640 rows) | Contract only 4 fields, CN line-level sync incomplete, variant resolution pending |
| **STORE_OPERATIONS** | READY_WITH_GAPS | StoreProfile active, coverage evaluation working, inventory data flowing via Maletas module | No formal CommercialAdapter, depends on INVENTORY domain |

---

## Appendix D -- Actual Queries and Sync Evidence

### D.1 Confirmed Sync Operations (from codebase)

| Operation | Source | Evidence File | Rows/Records | Status |
|---|---|---|---|---|
| ARTICULOS full sync | SAG SOAP SELECT * FROM ARTICULOS | sag-articles-client.ts | 10,439 total (4,561 commercial via R2 filter) | OPERATIONALLY_VALIDATED |
| ProductionEvent OP sync | SAG MOVIMIENTOS (fuente=33) | production-event-mapping.ts | 3,376 orders | OPERATIONALLY_VALIDATED |
| ProductionEvent ET sync | SAG MOVIMIENTOS (fuente=116) | sag-et-sync.ts | 3,640 events (header-only, 0 lines) | OPERATIONALLY_VALIDATED |
| ProductionEvent CN sync | SAG MOVIMIENTOS (fuente=80) | sag-cn-sync.ts | 7,890 headers, 81,367 lines | OPERATIONALLY_VALIDATED |
| Inventory snapshot V1 | Manual upload (Excel/CSV) | sag-inventory-normalizer.ts | Variable per upload | OPERATIONALLY_VALIDATED |
| Customer profiles | CastillitosCRM connector + TERCEROS | castillitos-crm/index.ts | Variable | OPERATIONALLY_VALIDATED |
| CollectionRecord sync | pagosnew + cash-sources.ts classification | cash-sources.ts | 15 source codes classified | OPERATIONALLY_VALIDATED |
| Sales documents | SAG MOVIMIENTOS (OFICIAL fuentes) | sales-adapter.ts (SALES domain) | Active sync via createSagSalesAdapter | OPERATIONALLY_VALIDATED |

### D.2 Confirmed SAG Field Counts from Live Queries

| Table | Fields Confirmed | Method | Evidence |
|---|---|---|---|
| ARTICULOS | 17 in SagArticleRawRow + 182 total in table | SOAP query, sag-articles-types.ts | CODIGO, DESCRIPCION, GRUPO, SUB_GRUPO, LINEA, MARCA, UNIDAD, IVA, TARIFA_IVA, PRECIO, COSTO, MANEJA_KARDEX, MANEJA_TALLA_COLOR, MANEJA_LOTE, ACTIVO, BLOQUEADO, FECHA_MODIFICACION |
| MOVIMIENTOS | 10+ confirmed join fields | SOAP query, query-catalog.ts | ka_nl_tercero, ka_ni_fuente, ka_nl_vendedor, numero_documento, fecha, ka_nl_bodega, ss_remision |
| MOVIMIENTOS_ITEMS | 6+ confirmed | SOAP query | k_sc_referencia, ka_nl_articulo, ka_nl_bodega, ss_talla, ss_color, cantidad |
| TERCEROS | 5+ confirmed | CRM connector | ka_nl_tercero, n_nit, sc_nombre, sc_naturaleza, ka_ni_zona |
| FUENTES | 6 confirmed per entry | castillitos-fuentes.ts registry | ka (ID), nombre, codigo, signo_inventario, category |
| v_saldos_inventariotallanew | 6+ confirmed | sag-inventory-contract.ts | refCode, description, disponible, warehouseQty, pendingOrdersQty, bodega |

---

## Summary -- Consolidated (SAG-MASTER-DATA-DISCOVERY-CONSOLIDATION-01)

### Quantitative Summary

| Metric | Value |
|---|---|
| Total contract fields across 10 domains | 317 |
| OPERATIONALLY_VALIDATED fields | 69 (22%) |
| SAMPLE_CONFIRMED fields | 46 (15%) |
| DOCUMENTED_ONLY fields | 202 (64%) |
| CONFLICTED fields | 1 (bodega count) |
| UNKNOWN fields | 0 |
| SAG tables confirmed live | 14 |
| Document sources classified | 127 (7 categories) |
| Production FUENTES mapped to universal events | 15 |
| Cash source rules classified | 15 |
| Domain adapters complete | 2 (PRODUCT, SALES) |
| Domain adapters partial | 2 (INVENTORY via Maletas, CUSTOMER via CRM) |

### What We Know (Confirmed with Evidence)
- **14 confirmed SAG tables** with live data from Castillitos
- **127 document sources** classified into 7 categories with full ka/codigo mapping
- **10 SAG contract domains** with 317 total fields defined
- **6 active Agentik domains** with entity types, freshness SLAs, and consumer engines
- **2 domains fully implemented** in Commercial Data Layer (PRODUCT, SALES) with adapters
- **17 ARTICULOS fields confirmed** via SOAP sync (SagArticleRawRow interface)
- **15 production FUENTES mapped** to universal ProductionEventType with confidence levels
- **15 cash source rules** classified with F1/F2 universe separation
- **Inventory view v_saldos_inventariotallanew** confirmed with 6+ fields operationally validated
- **Identity resolution** working: NIT normalization, crmId, billing_account_id workaround
- **Warehouse topology** confirmed: B14/B15 (raw) -> B04 (WIP) -> B01 (finished goods)

### What We Don't Know (Critical)
- CLIENTES contract needs enterprise hardening (5 -> ~40 fields)
- PRODUCCION contract needs hardening (4 -> ~30 fields)
- BANCOS/RECAUDOS table structure unconfirmed (0 operationally validated fields)
- Product-Variant separation in SAG unclear (ss_maneja_talla_color flag exists but semantics unconfirmed)
- COMPRAS tables not located (OC ka=53 marked OBSOLETA)
- BODEGAS count conflicted: 37 vs 49
- Incremental sync mechanism unconfirmed for v_saldos view

### Clear Backlog (unchanged, validated)
1. **INVENTORY-DOMAIN-01**: READY_WITH_GAPS -- Next domain (highest ROI, unlocks 5 engines)
2. **CUSTOMER-DOMAIN-01**: READY_WITH_GAPS -- Requires SAG contract hardening first
3. **RECEIVABLES-EXTENSION-01**: PARTIALLY_READY -- Extends customer domain
4. **PURCHASING-DOMAIN-01**: NOT_READY -- Tables unlocated
5. **PRODUCTION-DOMAIN-01**: READY_WITH_GAPS -- Model active, contract under-specified
6. **STORE-OPS-DOMAIN-01**: READY_WITH_GAPS -- Depends on INVENTORY domain
