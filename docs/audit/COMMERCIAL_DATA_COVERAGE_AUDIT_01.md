# COMMERCIAL-DATA-COVERAGE-AUDIT-01 — Master Audit Document

**Sprint:** COMMERCIAL-DATA-COVERAGE-AUDIT-01
**Tenant:** Castillitos
**Date:** 2026-07-14
**Status:** COMPLETE (discovery only, zero code changes)

---

## Executive Summary

The Commercial Data Layer spans **339 TypeScript files** across 20+ sub-domains in `lib/comercial/`, powered by a SAG PYA SOAP adapter with **52 queries** (8 validated, 29 pending, 15 placeholder) and **15+ Prisma models**. Six commercial decision engines exist, but only **2 of 6 are connected end-to-end** (Maletas 85%, Tiendas 90%). Three engines (Vendedores, Importaciones, Produccion) are **completely orphaned** with zero data loaders.

### Coverage Score by Domain

| Domain | Engine Files | Loader | SAG Queries | Prisma→Engine | Engine→UI | Overall |
|---|---|---|---|---|---|---|
| **MALETAS** | 9 | 1 (vendor-sample-loader) | 3 validated | 85% | 85% | **85%** |
| **TIENDAS** | 14 | 0 (sag-store-adapter) | 2 validated | 90% | 90% | **90%** |
| **PEDIDOS** | 8 | 0 (order-service direct) | 1 validated | 70% | 60% | **65%** |
| **VENDEDORES** | 5 | 0 | 0 validated | 0% | 40% | **20%** |
| **IMPORTACIONES** | 6 | 0 | 0 validated | 0% | 50% | **25%** |
| **PRODUCCION** | 2 | 0 | 1 validated | 0% | 30% | **15%** |

**Weighted Commercial Coverage: 50%**

---

## 1. SAG Adapter Layer

### 1.1 Query Catalog Summary

**Location:** `lib/connectors/adapters/sag-pya-soap/query-catalog.ts`

| Domain | Queries | Validated | Pending | Placeholder |
|---|---|---|---|---|
| CUSTOMERS | 3 | 1 | 2 | 0 |
| RECEIVABLES | 3 | 0 | 3 | 0 |
| ARTICLES | 5 | 1 | 2 | 2 |
| INVENTORY | 5 | 1 | 2 | 2 |
| PRICES | 3 | 0 | 3 | 0 |
| ORDERS | 5 | 1 | 2 | 2 |
| PRODUCTION | 6 | 1 | 3 | 2 |
| COLLECTIONS | 4 | 0 | 2 | 2 |
| MASTER_LOOKUPS | 6 | 1 | 4 | 1 |
| ACCOUNTS | 5 | 1 | 2 | 2 |
| **TOTAL** | **52** | **8** | **29** | **15** |

### 1.2 Mapper Functions

**Location:** `lib/connectors/adapters/sag-pya-soap/mappers.ts`

| Mapper | SAG Fields In | Prisma Model Out | Status |
|---|---|---|---|
| `mapSagCustomer()` | NIT, NOMBRE, CIUDAD, VENDEDOR, etc. | CustomerProfile | Active |
| SAG article sync (via storage) | ka_ni_articulo, ka_descripcion, ka_nl_linea, etc. | ProductEntity | Active |
| Inventory sync handler | ka_nl_bodega, ka_nl_articulo, ka_disponible, etc. | ProductInventoryLevel | Active |
| `mapSagOrder()` | ss_numero, ss_fecha, ss_nit, ss_total, etc. | CustomerOrderRecord | Active |
| `mapSagReceivable()` | doc, fecha, valor, saldo, etc. | Receivable | Active |
| `mapSagMovement()` | comprobante, fecha, total, etc. | SaleRecord | Active |

**Critical gap:** `paidAmount` is always zero in `mapCarteraToReceivable()` — SAG does not expose payment breakdowns per document.

### 1.3 Storage Handlers

**Location:** `lib/connectors/adapters/sag-pya-soap/storage.ts`

| Handler | Prisma Model | Upsert Key | Row Count (Castillitos) |
|---|---|---|---|
| `upsertCustomers()` | CustomerProfile | orgId + nit | ~2,500 |
| `upsertProducts()` | ProductEntity | orgId + externalId | ~8,700 |
| `upsertInventoryLevels()` | ProductInventoryLevel | orgId + productId + warehouseId | ~45,000 |
| `upsertOrders()` | CustomerOrderRecord | orgId + orderNumber | ~3,376 |
| `upsertSaleRecords()` | SaleRecord | orgId + documentId | ~129,045 |

### 1.4 Sub-domain Adapters

| Folder | Files | Purpose | Status |
|---|---|---|---|
| `catalog/` | 4 | SAG master lookups (lines, groups, subgroups, brands) | Active |
| `inventory/` | 3 | Warehouse-level stock sync | Active |
| `orders/` | 3 | OP/PD order sync from SAG | Active |
| `production/` | 4 | OP/ET/CN production event sync | Active |
| `transfers/` | 3 | Inventory transfer sync (F34) | Active |

---

## 2. Prisma Model Inventory

### 2.1 Core Commercial Models

| Model | Fields | SAG Source | Sync Cron | Used By |
|---|---|---|---|---|
| **ProductEntity** | ~25 | ARTICULOS | Connector sync | Tiendas, Maletas, Pedidos, Importaciones |
| **ProductVariant** | ~12 | ARTICULOS (talla/color) | Connector sync | Pedidos (POS), Tiendas |
| **ProductInventoryLevel** | ~10 | INVENTARIOS | Connector sync | Tiendas, Maletas, Pedidos, Importaciones |
| **CustomerProfile** | ~20 | TERCEROS | Connector sync | Pedidos, Vendedores, Clientes 360 |
| **CustomerOrderRecord** | ~15 | PEDIDOS | Connector sync | Pedidos, Importaciones |
| **CustomerOrderLine** | ~12 | CRM (SuiteCRM V8) | CRM sync | Importaciones (sales data) |
| **CRMQuote** | ~18 | CRM (SuiteCRM V8) | CRM sync | Pedidos, Vendedores |
| **CRMQuoteLine** | ~10 | CRM (SuiteCRM V8) | CRM sync | Pedidos (line detail) |
| **SaleRecord** | ~15 | MOVIMIENTOS | Connector sync | Importaciones (fallback) |
| **Receivable** | ~12 | CARTERA | Connector sync | Vendedores, Clientes 360 |
| **ProductionEvent** | ~20 | OP/ET/CN | Production sync | Produccion module |
| **InventoryTransfer** | ~15 | F34 | Transfer sync | Tiendas |
| **VendorSampleBag** | ~12 | Agentik-native | User actions | Maletas |
| **VendorSampleItem** | ~15 | Agentik-native | User actions | Maletas |
| **CommercialCoverageSnapshot** | ~8 | Computed | Cron job | Tiendas (fallback) |

### 2.2 Key Field Gaps in Prisma Models

| Model | Missing Field | Impact | Source Available? |
|---|---|---|---|
| ProductEntity | brand | No brand filtering | SAG has ka_nl_marca (placeholder query) |
| ProductEntity | collection | No collection grouping | SAG has ka_nl_coleccion (placeholder query) |
| ProductEntity | season | No seasonal analysis | SAG has ka_nl_temporada (placeholder query) |
| ProductEntity | photoUrl | No product images from SAG | Not in SAG (from Biblioteca/Shopify) |
| SaleRecord | productCode | Always NULL (129K rows) | SAG MOVIMIENTOS header-only |
| CRMQuote | customerId | Always NULL (285 quotes) | Must join via rawCrmJson |
| Receivable | paidAmount | Always zero | SAG does not expose payment splits |
| ProductionEvent | rawMaterials | CN articles not linked | CN has materials but no product overlap |

---

## 3. Decision Engine Connectivity

### 3.1 MALETAS (85% connected)

**Data flow:** `vendor-sample-loader.ts` → Prisma (VendorSampleBag, VendorSampleItem, ProductEntity, ProductInventoryLevel) → `maletas-decision-engine.ts` → CommercialDecision[] → `maletas-business-decisions.ts` → BusinessDecision[]

**Connected fields:** bag status, item reference, item quantity, available stock, warehouse
**Missing:** brand enrichment, seasonal rotation data, photo URLs
**UI:** `maletas-client.tsx` imports from decision engine directly

### 3.2 TIENDAS (90% connected)

**Data flow:** `sag-store-adapter.ts` → Prisma (ProductInventoryLevel, SagWarehouseLookupCache, CommercialCoverageSnapshot) → `store-replenishment-service.ts` → engines → StoreDecisionEvaluationResult → `store-business-decisions.ts` → BusinessDecision[]

**Connected fields:** warehouse stock, store config, coverage targets, assortment rules, textile attributes
**Missing:** sales velocity (SaleRecord.productCode is NULL), transfer history enrichment
**UI:** `tiendas-client.tsx` via `getStoresWorkspaceWithSignals()`

### 3.3 PEDIDOS (65% connected)

**Data flow:** `order-service.ts` → Prisma (CRMQuote, CustomerProfile, ProductEntity, ProductInventoryLevel) → direct rendering + `order-fulfillment.ts` + `order-product-types.ts` → partial engine consumption

**Connected fields:** customer NIT, product search, variant availability, fulfillment status
**Disconnected:** Order Policy Pack (`order-decision-engine.ts`) has NO loader — engine functions exist but nothing calls them with real data
**UI:** `pedidos-client.tsx` uses `order-service.ts` directly, NOT the decision engine

### 3.4 VENDEDORES (20% connected)

**Data flow:** `live-vendor-loader.ts` + `vendedor-360-loader.ts` → Prisma (CustomerProfile, CRMQuote, Receivable) → UI rendering only

**Connected fields:** seller name, client count, receivable totals
**Completely disconnected:** SalesRep Policy Pack (`sales-rep-decision-engine.ts`) has NO loader — engine expects `SalesRepDailyState` but nothing builds it from Prisma
**UI:** `vendedores-client.tsx` renders loader data directly, never touches decision engine

### 3.5 IMPORTACIONES (25% connected)

**Data flow:** `import-service.ts` → Prisma (ProductEntity, ProductInventoryLevel, CustomerOrderLine) → UI rendering

**Connected fields:** reference code, stock levels, sales history, import warehouses
**Completely disconnected:** Import Policy Pack (`import-decision-engine.ts`) has NO loader — engine expects import-specific input types but nothing builds them
**UI:** `importaciones-client.tsx` uses `import-service.ts` directly, NOT the decision engine

### 3.6 PRODUCCION (15% connected)

**Data flow:** `production-sync.ts` → Prisma (ProductionEvent) → UI rendering in `/produccion/*` pages

**Connected fields:** OP orders (3,376), ET events (3,640), CN headers (7,890)
**Completely disconnected:** Production Planning Pack (`production-planning-engine.ts`) has NO loader — engine expects `ProductionNeedResult[]` but nothing builds it
**UI:** `/produccion/*` pages render raw ProductionEvent data, never touch commercial production engine

---

## 4. UI Data Visibility

### 4.1 Commercial UI Page Inventory

| Page | Data Source | Engine Connected? | Fields Visible |
|---|---|---|---|
| `/comercial/maletas` | vendor-sample-loader | YES (decision engine) | bag, items, stock, alerts |
| `/comercial/tiendas` | store-replenishment-service | YES (via service) | stores, coverage, signals |
| `/comercial/pedidos` | order-service (direct Prisma) | NO | drafts, products, fulfillment |
| `/comercial/vendedores` | live-vendor-loader | NO | sellers, clients, receivables |
| `/comercial/clientes` | client-loader | NO | customer list, geography |
| `/comercial/clientes/[id]` | cliente-360-loader | NO | 360 view, orders, receivables |
| `/comercial/importaciones` | import-service | NO | references, rotation, stock |
| `/comercial/inventario` | operational-inventory API | NO | product detail, stock |
| `/comercial/control` | control-comercial-loader | NO | KPIs, domain summary |
| `/comercial/inteligencia` | ? | NO | intelligence dashboard |
| `/comercial/ventas` | ? | NO | sales data |

### 4.2 Commercial API Routes

| Route | Method | Data Source |
|---|---|---|
| `/comercial/tiendas` | GET | store-replenishment-service |
| `/comercial/tiendas/needs` | GET | store-needs-service |
| `/comercial/tiendas/policies` | GET | store-policy-service |
| `/comercial/tiendas/suggestions` | GET | store-suggestions-engine |
| `/comercial/tiendas/guides` | GET | store-guide-builder |
| `/comercial/tiendas/warehouse-config` | GET/POST | admin config |
| `/comercial/pedidos` | GET/POST | order-service |
| `/comercial/pedidos/products` | GET | product search |
| `/comercial/pedidos/history` | GET | order-history-service |
| `/comercial/pedidos/pdf` | GET | order-pdf-service |
| `/comercial/pedidos/sync-lines` | POST | quote-lines-sync |
| `/comercial/maletas/bags` | GET/POST | maletas CRUD |
| `/comercial/maletas/replenishment-plans` | GET | replenishment plans |
| `/comercial/vendedores/[sellerSlug]` | GET | vendedor-360-loader |
| `/comercial/clientes/[id]/360` | GET | cliente-360-loader |
| `/comercial/operational-inventory` | GET | operational-inventory |
| `/comercial/demand` | GET | demand estimation |

---

## 5. Critical Findings

### 5.1 P0 — Blocking (3 findings)

| ID | Finding | Impact |
|---|---|---|
| P0-001 | **3/6 decision engines have NO data loader** (Vendedores, Importaciones, Produccion) | Engines exist as dead code — no BusinessDecision output possible |
| P0-002 | **SaleRecord.productCode is NULL on all 129K rows** | Cannot compute product-level sales velocity for Tiendas/Importaciones |
| P0-003 | **CRMQuote.customerId is NULL on all 285 quotes** | Must join via rawCrmJson.billing_account_id workaround |

### 5.2 P1 — High Impact (5 findings)

| ID | Finding | Impact |
|---|---|---|
| P1-001 | Order Policy Pack disconnected from UI | Pedidos page renders data but no policy-driven decisions |
| P1-002 | Receivable.paidAmount always zero | Cannot compute real collection rates |
| P1-003 | 44/52 SAG queries not validated | Only 8 queries confirmed working on Castillitos |
| P1-004 | ProductEntity missing brand/collection/season | No enrichment for commercial analytics |
| P1-005 | Import-service bypasses Import Policy Pack entirely | UI shows raw data, not policy decisions |

### 5.3 P2 — Medium Impact (4 findings)

| ID | Finding | Impact |
|---|---|---|
| P2-001 | ProductionEvent CN articles have 0% overlap with OP product refs | Cannot trace raw materials to finished goods |
| P2-002 | No sales velocity computation for any domain | Rotation analysis uses static thresholds, not real velocity |
| P2-003 | BusinessDecision aggregator has no UI consumer | Aggregator built but no page renders it |
| P2-004 | Control Comercial dashboard has no engine data | KPIs computed from raw Prisma, not from engines |

### 5.4 P3 — Low Impact (3 findings)

| ID | Finding | Impact |
|---|---|---|
| P3-001 | 15 SAG queries are placeholder (table names unconfirmed) | Cannot sync collections, some accounts, some production data |
| P3-002 | Commercial Intelligence page data source unknown | Page exists but data flow not traced |
| P3-003 | Ventas page data source unknown | Page exists but data flow not traced |

---

## 6. Recommendations

### 6.1 Phase 1: Wire Existing Engines (P0-001)

Build data loaders for the 3 orphaned engines:

1. **Vendedores Loader** — Query CustomerProfile + CRMQuote + Receivable → build `SalesRepDailyState` → feed `sales-rep-decision-engine.ts`
2. **Importaciones Loader** — Refactor `import-service.ts` to also build import engine input types → feed `import-decision-engine.ts`
3. **Produccion Loader** — Query ProductionEvent + ProductEntity → build `ProductionNeedResult[]` → feed `production-planning-engine.ts`

### 6.2 Phase 2: Fix Data Quality (P0-002, P0-003, P1-002)

1. **SaleRecord product-level sync** — Add SAG query for MOVIMIENTOS with detail lines (not just headers)
2. **CRMQuote customer linking** — Migrate rawCrmJson.billing_account_id → customerId FK
3. **Receivable payment data** — Explore SAG ABONOS table for payment breakdowns

### 6.3 Phase 3: Validate SAG Queries (P1-003)

Systematically test all 29 pending queries on Castillitos SAG instance. Promote to "validated" or mark as "broken".

### 6.4 Phase 4: Enrich Product Data (P1-004)

Add brand, collection, season fields to ProductEntity. Requires SAG query validation for ka_nl_marca, ka_nl_coleccion, ka_nl_temporada.

---

## 7. Companion Documents

| Document | Purpose |
|---|---|
| [COMMERCIAL_DATA_TRACEABILITY_MATRIX_01.md](COMMERCIAL_DATA_TRACEABILITY_MATRIX_01.md) | Field-by-field traceability from SAG → Prisma → Engine → UI |
| [COMMERCIAL_DATA_GAPS_01.md](COMMERCIAL_DATA_GAPS_01.md) | All gaps with P0-P3 classification and evidence |
| [COMMERCIAL_DATA_FIX_BACKLOG_01.md](COMMERCIAL_DATA_FIX_BACKLOG_01.md) | Prioritized fix backlog with effort estimates |
| `scripts/audit-commercial-data-coverage-01.ts` | Automated coverage auditor script |
