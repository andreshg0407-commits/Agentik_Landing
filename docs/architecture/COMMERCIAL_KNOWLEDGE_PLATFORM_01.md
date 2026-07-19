# COMMERCIAL-KNOWLEDGE-PLATFORM-01

## Agentik Enterprise OS — Commercial Knowledge Architecture

**Sprint:** COMMERCIAL-KNOWLEDGE-PLATFORM-01
**Date:** 2026-07-13
**Scope:** Architecture definition only. No code. No Prisma. No UI.

---

## The Stack

```
SAG / CRM / Banks / DIAN / Shopify / Manual
              |
              v
      Connectors (Adapters)
              |
              v
      Commercial Data Layer (Domains)
              |
              v
      Commercial Knowledge Layer    <-- THIS IS NEW
              |
              v
      Business Engines
              |
              v
      Copilot / UI / Automations
```

The CRM is not special. SAG is not special. Each is an adapter that feeds the same data layer. The Knowledge Layer sits above domains and below engines. It holds business facts, not table rows.

---

## FASE 1 — Data Classification

Everything in the Commercial Data Layer classified into three tiers.

### Tier 1: Master Data (Reference)

Entities that define the business structure. They exist before any transaction happens. They change slowly. They are Agentik-owned.

| Entity | Domain | Source | Notes |
|---|---|---|---|
| **ProductProfile** | PRODUCT | SAG (articles) | ~2,600 refs. Master catalog. |
| **ProductVariant** | PRODUCT | SAG (variants) | Size + color per product. |
| **ProductClassification** | PRODUCT | SAG | Group / subgroup / line / brand. |
| **ProductPrice** | PRODUCT | SAG (price lists) | PV3/PV4. |
| **CustomerProfile** | CUSTOMER | SAG (TERCEROS) + CRM | ~500-800 customers. Enriched in ENRICHMENT-02. |
| **CustomerCommercialAssignment** | CUSTOMER | SAG + CRM | Vendedor, zona, canal, lista precios. |
| **CustomerCreditProfile** | CUSTOMER | SAG | Plazo, cupo, bloqueo. |
| **CustomerBranch** | CUSTOMER | SAG (sucursales) | Branches per customer. Not yet synced. |
| **VendorProfile** | CUSTOMER | SAG (vendedores) | Sales rep master. |
| **WarehouseProfile** | INVENTORY | SAG (bodegas) | B01, B04, B14, B15. |
| **StoreProfile** | STORE_OPS | Agentik + SAG | Tiendas with admin + operational status. |
| **StoreCoverageRule** | STORE_OPS | Agentik | Coverage policies per store/class. |
| **SupplierProfile** | PURCHASING | SAG | Raw material suppliers. |

### Tier 2: Operational Data (Transactional)

Entities that record what happened. They are created by business activity. They change with every transaction.

| Entity | Domain | Source | Notes |
|---|---|---|---|
| **InventoryPosition** | INVENTORY | SAG (stock) | Current stock per location/variant. |
| **InventoryMovement** | INVENTORY | SAG (movements) | Entry/exit/transfer/adjustment. |
| **InventoryAge** | INVENTORY | Derived | Age classification per position. |
| **SalesDocument** | SALES | SAG (MOVIMIENTOS) | Invoices, credit notes, debit notes. |
| **SaleLine** | SALES | SAG (ITEMS) | Line items per sales document. |
| **SalesReturn** | SALES | SAG | Credit note returns. |
| **SalesAttribution** | SALES | SAG + CRM | Sale linked to seller + customer + territory. |
| **CustomerReceivable** | CUSTOMER | SAG (CARTERA) | Outstanding receivable documents. |
| **CollectionRecord** | CUSTOMER | SAG (v_pagosnew) | Cash collections / payments. |
| **ProductionOrder** | PURCHASING | SAG (OP) | 3,376 production orders. |
| **ProductionEntry** | PURCHASING | SAG (ET) | 3,640 warehouse entry events. |
| **MaterialConsumption** | PURCHASING | SAG (CN) | 7,890 raw material consumption records. |
| **ProductionTimeline** | PURCHASING | Derived | OP -> CN -> ET lifecycle. |
| **ImportReceipt** | PURCHASING | SAG | Import receiving documents. |
| **StoreInventoryPosition** | STORE_OPS | SAG | Stock per store location. |
| **StoreTransferProposal** | STORE_OPS | Agentik | Surtido / replenishment proposals. |
| **StoreCoverageEvaluation** | STORE_OPS | Derived | Coverage evaluation per store. |

### Tier 3: Intelligent Data (Derived / Computed)

Entities that don't exist in any source system. They are computed by Agentik from Tier 1 + Tier 2 data. This is where the Knowledge Layer lives.

| Entity | Domain | Source | Notes |
|---|---|---|---|
| **CommercialProductState** | Cross-domain | Product + Inventory + Sales | Read model. Already built. |
| **CommercialCustomerState** | Cross-domain | Customer + Assignment + Credit | Read model. Already built. |
| **InventoryAvailability** | INVENTORY | Derived from positions + reservations | Net sellable units. |
| **InventorySnapshot** | INVENTORY | Point-in-time immutable snapshot | Auditable history. |
| **CustomerBehavior** | CUSTOMER | Derived from Sales + Collections | Purchase frequency, payment behavior. Not yet computed. |
| **SalesClassification** | Intelligence | Sales docs + config | DETAL vs MAYORISTA channel classification. |
| **CoverageFact** | Knowledge | Inventory + Rules + Sales | Coverage health per store/product. |
| **RotationFact** | Knowledge | Sales + Inventory + Time | Product rotation speed. |
| **DemandSignal** | Knowledge | Orders + Sales + Trends | Demand pressure per product/store. |
| **ReplenishmentNeed** | Knowledge | Coverage + Availability + Demand | What needs to go where. |
| **RiskFact** | Knowledge | Receivables + Behavior + Collections | Customer commercial risk. |
| **OpportunityFact** | Knowledge | Sales + Inventory + Behavior | Commercial opportunity detection. |

---

## FASE 2 — Ownership Table

The definitive ownership registry. No ambiguity. No overlap.

| Concept | Owner Domain | Notes |
|---|---|---|
| Product (master) | PRODUCT | Catalog, variants, prices, classifications |
| Customer (master) | CUSTOMER | Profile, contact, location, fiscal |
| Customer commercial assignment | CUSTOMER | Vendedor, zona, canal, lista precios, segmento |
| Customer credit config | CUSTOMER | Plazo, cupo, bloqueo, condiciones |
| Sales rep / Vendedor | CUSTOMER | VendorProfile entity. Lives in Customer, not Workforce. |
| Receivable (cartera) | CUSTOMER | Outstanding documents. Will migrate to RECEIVABLES when active. |
| Collection (pago) | CUSTOMER | Cash collections. Will migrate to RECEIVABLES when active. |
| Stock / Inventory position | INVENTORY | Current quantities per location/variant |
| Inventory movement | INVENTORY | Entry/exit/transfer/adjustment events |
| Warehouse | INVENTORY | WarehouseProfile |
| Sale / Invoice | SALES | SalesDocument + SaleLine |
| Return / Credit note | SALES | SalesReturn |
| Sale attribution | SALES | Links sale to seller + customer + territory |
| Order / Pedido | SALES | OrderDraft / OrderRecord (lib/comercial/pedidos/) |
| Production order (OP) | PURCHASING | Production planning |
| Entry ticket (ET) | PURCHASING | Warehouse entry from production |
| Material consumption (CN) | PURCHASING | Raw material usage |
| Import receipt | PURCHASING | Import receiving |
| Supplier | PURCHASING | SupplierProfile |
| Store profile | STORE_OPS | Admin + operational state |
| Store inventory | STORE_OPS | Stock per store location |
| Store coverage rule | STORE_OPS | Coverage policies |
| Store transfer | STORE_OPS | Surtido proposals |
| Payment (treasury) | FINANCE | PaymentRecord (lib/finance/) |
| Bank reconciliation | FINANCE | Banking module |
| Accounting document | FINANCE | DIAN documents, close entries |
| Reconciliation session | RECONCILIATION | Cross-source matching |

### Domains NOT Yet Active (registered as inactive)

| Domain | Status | When |
|---|---|---|
| RECEIVABLES | Inactive | Will extract from CUSTOMER when cartera/collections grow |
| WORKFORCE | Inactive | Will extract from CUSTOMER when vendedor management grows |
| PRODUCTION | Inactive | Will extract from PURCHASING when production planning is standalone |
| LOGISTICS | Inactive | When shipping/delivery tracking exists |

---

## FASE 3 — Commercial Knowledge Layer

### What It Is

The Knowledge Layer holds **business facts** — computed truths that don't exist in any source system. A fact is not a table row. It's a conclusion derived from multiple domain entities, validated with evidence, and time-stamped.

### Core Entities

```
lib/comercial/knowledge/
  knowledge-types.ts
  knowledge-node.ts
  knowledge-relation.ts
  knowledge-fact.ts
  knowledge-evidence.ts
  knowledge-snapshot.ts
  knowledge-timeline.ts
  knowledge-query.ts
  index.ts
```

#### KnowledgeNode

The fundamental unit. Represents a business entity that knowledge can attach to.

```typescript
interface KnowledgeNode {
  readonly nodeId: string;          // Canonical ID
  readonly nodeType: KnowledgeNodeType;
  readonly tenantId: string;
  readonly label: string;           // Human-readable name
  readonly domain: string;          // Source domain
  readonly entityType: string;      // Source entity type
  readonly entityId: string;        // Source canonical ID
  readonly attributes: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type KnowledgeNodeType =
  | "CUSTOMER"
  | "PRODUCT"
  | "STORE"
  | "VENDOR"         // Sales rep
  | "WAREHOUSE"
  | "ZONE"
  | "CHANNEL"
  | "SUPPLIER"
  | "ORDER"
  | "INVOICE"
  | "RECEIVABLE"
  | "COLLECTION"
  | "PRODUCTION_ORDER";
```

#### KnowledgeRelation

Links two nodes. Represents a business relationship.

```typescript
interface KnowledgeRelation {
  readonly relationId: string;
  readonly tenantId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationType: KnowledgeRelationType;
  readonly weight: number;          // 0.0 - 1.0
  readonly evidence: KnowledgeEvidence[];
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

type KnowledgeRelationType =
  | "BUYS_FROM"          // Customer -> Product
  | "SELLS_TO"           // Vendor -> Customer
  | "MANAGED_BY"         // Customer -> Vendor (sales rep)
  | "STOCKED_AT"         // Product -> Warehouse/Store
  | "BELONGS_TO_ZONE"    // Customer -> Zone
  | "USES_PRICE_LIST"    // Customer -> PriceList
  | "PRODUCED_BY"        // Product -> ProductionOrder
  | "OWES"               // Customer -> Receivable
  | "PAID"               // Collection -> Receivable
  | "SUPPLIED_BY"        // Product -> Supplier
  | "TRANSFERRED_TO"     // Warehouse -> Store
  | "COVERS"             // Store -> Product (coverage)
  | "REPLACES";          // Product -> Product (substitution)
```

#### KnowledgeFact

A derived business truth. The core of the Knowledge Layer.

```typescript
interface KnowledgeFact {
  readonly factId: string;
  readonly tenantId: string;
  readonly factType: KnowledgeFactType;
  readonly subjectNodeId: string;    // Who/what this fact is about
  readonly objectNodeId: string | null; // Related entity (if applicable)
  readonly value: unknown;           // The fact value
  readonly unit: string | null;      // "days", "COP", "%", "units"
  readonly confidence: number;       // 0.0 - 1.0
  readonly evidence: KnowledgeEvidence[];
  readonly computedAt: Date;
  readonly validUntil: Date | null;  // TTL for this fact
  readonly source: FactSource;
}

type KnowledgeFactType =
  // Customer facts
  | "CUSTOMER_INACTIVE"           // Customer hasn't bought in N days
  | "CUSTOMER_AT_RISK"            // Overdue receivables + declining purchases
  | "CUSTOMER_HIGH_VALUE"         // Top revenue contributor
  | "CUSTOMER_SLOW_PAYER"         // Chronic late payer pattern
  | "CUSTOMER_GROWING"            // Increasing purchase frequency
  | "CUSTOMER_DECLINING"          // Decreasing purchase frequency
  // Product facts
  | "PRODUCT_SLOW_MOVER"          // Low rotation
  | "PRODUCT_FAST_MOVER"          // High rotation
  | "PRODUCT_SEASONAL"            // Seasonal demand pattern
  | "PRODUCT_DEAD_STOCK"          // No sales in N days
  | "PRODUCT_STOCKOUT_RISK"       // Available qty approaching zero
  | "PRODUCT_NEGATIVE_MARGIN"     // Cost > selling price
  // Store facts
  | "STORE_OVER_INVENTORIED"      // Stock > coverage target
  | "STORE_UNDER_COVERAGE"        // Stock < coverage minimum
  | "STORE_NEEDS_REPLENISHMENT"   // Specific SKUs need refill
  // Supplier facts
  | "SUPPLIER_CRITICAL"           // Sole-source supplier
  | "SUPPLIER_DELAYED"            // Production delays detected
  // Cross-domain facts
  | "COVERAGE_INSUFFICIENT"       // Gap between actual and target
  | "OPPORTUNITY_DETECTED"        // Customer + inventory alignment
  | "REPLENISHMENT_OVERDUE"       // Pending transfer not executed
  | "ORDER_DELAYED";              // Order exceeds SLA

type FactSource = {
  readonly engine: string;        // Which engine computed this
  readonly domains: string[];     // Which domains contributed data
  readonly computedAt: Date;
  readonly version: string;
};
```

#### KnowledgeEvidence

Immutable proof of why a fact exists.

```typescript
interface KnowledgeEvidence {
  readonly evidenceId: string;
  readonly factId: string;
  readonly domain: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly field: string | null;
  readonly value: unknown;
  readonly observedAt: Date;
  readonly source: string;         // "SAG" | "CRM" | "DERIVED" | etc.
  readonly confidence: number;
}
```

#### KnowledgeSnapshot

Point-in-time capture of all facts for a tenant.

```typescript
interface KnowledgeSnapshot {
  readonly snapshotId: string;
  readonly tenantId: string;
  readonly capturedAt: Date;
  readonly factCount: number;
  readonly nodeCount: number;
  readonly relationCount: number;
  readonly factsByType: Record<string, number>;
  readonly staleFacts: number;
  readonly highConfidenceFacts: number;
  readonly lowConfidenceFacts: number;
}
```

#### KnowledgeTimeline

Tracks how a fact evolves over time.

```typescript
interface KnowledgeTimeline {
  readonly timelineId: string;
  readonly factType: KnowledgeFactType;
  readonly subjectNodeId: string;
  readonly entries: KnowledgeTimelineEntry[];
}

interface KnowledgeTimelineEntry {
  readonly value: unknown;
  readonly confidence: number;
  readonly computedAt: Date;
  readonly engine: string;
}
```

---

## FASE 4 — Business Engines

### Engine Inventory

Every engine that exists or should exist, with what it consumes and what knowledge it produces.

#### Existing Engines

| Engine | Location | Consumes | Produces |
|---|---|---|---|
| **Coverage Engine** | `lib/comercial/rules/coverage/` | Product, Inventory, StoreRules, Sales | COVERAGE_INSUFFICIENT, STORE_UNDER_COVERAGE |
| **Demand Engine** | `lib/comercial/demand/demand-engine.ts` | Sales, Inventory, Orders | DemandRefEntry, CoverageBand |
| **Inventory Coverage Engine** | `lib/comercial/demand/inventory-coverage-engine.ts` | Inventory, DemandRef | STORE_OVER_INVENTORIED, STORE_UNDER_COVERAGE |
| **Replacement Engine** | `lib/comercial/demand/replacement-engine.ts` | DemandRef, Inventory | Product substitution suggestions |
| **Production Signal Engine** | `lib/comercial/demand/production-signal-engine.ts` | DemandRef, ProductionOrders | SUPPLIER_DELAYED, production pressure |
| **Stockout Detector** | `lib/comercial/demand/stockout-detector.ts` | Inventory, Demand | PRODUCT_STOCKOUT_RISK |
| **Sales Classification Engine** | `lib/comercial/intelligence/` | Sales, Config | DETAL vs MAYORISTA classification |
| **Textile Coverage Engine** | `lib/comercial/tiendas/textile-coverage-engine.ts` | Assortment, Inventory, Rules | Coverage keys, evaluations |
| **Assortment Engine** | `lib/comercial/tiendas/assortment-engine.ts` | Inventory, StorePolicies | Assortment plans |
| **Store Replenishment Engine** | `lib/comercial/tiendas/store-replenishment-engine.ts` | StorePolicies, Availability | STORE_NEEDS_REPLENISHMENT |
| **Store Replacement Engine** | `lib/comercial/tiendas/store-replacement-engine.ts` | StoreNeeds, Candidates | Replacement matches |
| **Store Needs Engine** | `lib/comercial/tiendas/store-needs-engine.ts` | StorePolicies | Per-store need computation |
| **Store Policy Engine** | `lib/comercial/tiendas/store-policy-engine.ts` | Policies, Variants | Active policy resolution |
| **Maletas Engine** | `lib/comercial/maletas/maletas-engine.ts` | Cases, Inventory, Sales, Production | Multi-signal maleta state |
| **Maletas Decision Engine** | `lib/comercial/maletas/maletas-decision-engine.ts` | CaseLines, Coverage | Case-level decisions |
| **Production Alert Engine** | `lib/comercial/maletas/production-alert-engine.ts` | CoverageRules, Inventory | Production alerts |
| **Case Status Engine** | `lib/comercial/maletas/case-status-engine.ts` | Lines, Inventory, Alerts | Case status computation |
| **Order Dedup Engine** | `lib/comercial/pedidos/order-dedup-engine.ts` | OrderDrafts | Duplicate detection |
| **Order Invoice Match** | `lib/comercial/pedidos/order-invoice-match-engine.ts` | Orders, Invoices | Order fulfillment matching |
| **Vendor Engine** | `lib/comercial/vendors/vendor-engine.ts` | Prisma, Maletas | Vendor analytics |
| **Financial Pattern Engine** | `lib/finance/pattern-engine.ts` | TemporalSnapshots | Financial patterns |
| **Financial Trend Engine** | `lib/finance/trend-engine.ts` | TemporalSnapshots | Trends |
| **Root Cause Engine** | `lib/finance/root-cause-engine.ts` | FinancialGraph | Root cause analysis |
| **Financial Runtime** | `lib/finance/runtime-service.ts` | All finance sources | Live financial state |
| **Reconciliation Engine** | `lib/reconciliation/engine/recon-engine.ts` | CanonicalRecords | Exact + fuzzy matches |
| **Rule Engine (Recon)** | `lib/reconciliation/rules/rule-engine.ts` | CanonicalRecords | Rule-based evaluations |
| **Operational Intelligence** | `lib/operational-intelligence/` | Inventory, Orders, Reservations | Operational snapshot |

#### Planned Engines (Not Yet Built)

| Engine | Will Consume | Will Produce |
|---|---|---|
| **ABC Engine** | Sales (12-month), Products | Product ABC classification (A/B/C/D) |
| **Rotation Engine** | Sales, Inventory, Time | PRODUCT_FAST_MOVER, PRODUCT_SLOW_MOVER, rotation index |
| **Markdown Engine** | Product prices, Sales velocity, Inventory age | PRODUCT_NEGATIVE_MARGIN, price optimization signals |
| **Commercial Risk Engine** | Receivables, Collections, Behavior | CUSTOMER_AT_RISK, CUSTOMER_SLOW_PAYER |
| **Forecast Engine** | Sales history, Seasonality, Trends | Demand forecasts per product/store |
| **Promotion Engine** | Sales lift, Inventory, Calendar | Promotion timing and product selection |
| **Opportunity Engine** | Customer behavior, Inventory, Sales | OPPORTUNITY_DETECTED, cross-sell signals |
| **Inventory Health Engine** | Positions, Age, Movements | PRODUCT_DEAD_STOCK, age distribution |
| **Repurchase Engine** | Sales cadence, Inventory, Production | Repurchase timing signals |
| **Customer Lifecycle Engine** | Customer first/last purchase, frequency | CUSTOMER_INACTIVE, CUSTOMER_GROWING, CUSTOMER_DECLINING |

---

## FASE 5 — Commercial Read Models

### Existing Read Models

| Read Model | Location | Joins |
|---|---|---|
| **CommercialProductState** | `shared/commercial-product-state.ts` | Product + Inventory + Sales |
| **CommercialCustomerState** | `customer/customer-commercial-state.ts` | Customer + Assignment + Credit |

### Planned Read Models (Contracts Only)

#### CommercialVendorState

```typescript
interface CommercialVendorState {
  readonly vendorId: string;
  readonly tenantId: string;

  // Identity
  readonly name: string;
  readonly taxId: string | null;
  readonly zone: ResolvedLookup | null;
  readonly active: boolean;

  // Portfolio
  readonly assignedCustomerCount: number;
  readonly activeCustomerCount: number;
  readonly inactiveCustomerCount: number;

  // Performance (from Sales domain)
  readonly totalSalesLast30Days: number | null;
  readonly totalSalesLast90Days: number | null;
  readonly orderCount: number | null;
  readonly averageOrderValue: number | null;
  readonly currency: string;

  // Coverage
  readonly coverageScore: number | null;     // % of portfolio with recent sales

  // Maleta (sample bag)
  readonly hasMaleta: boolean;
  readonly maletaStatus: string | null;
  readonly maletaLastUpdated: Date | null;

  // Quality
  readonly dataCompleteness: number;
  readonly sources: string[];
  readonly lastSyncAt: Date | null;
  readonly asOf: Date;
}
```

#### CommercialStoreState

```typescript
interface CommercialStoreState {
  readonly storeId: string;
  readonly tenantId: string;

  // Identity
  readonly name: string;
  readonly code: string;
  readonly adminStatus: string;
  readonly operationalStatus: string;

  // Location
  readonly city: string | null;
  readonly zone: string | null;

  // Inventory summary
  readonly totalSkus: number;
  readonly totalUnits: number;
  readonly totalValue: number | null;
  readonly currency: string;

  // Coverage
  readonly coverageScore: number | null;
  readonly underCoverageSkus: number;
  readonly overCoverageSkus: number;

  // Sales (from Sales domain)
  readonly salesLast30Days: number | null;
  readonly salesLast90Days: number | null;

  // Replenishment
  readonly pendingTransfers: number;
  readonly lastReplenishmentDate: Date | null;

  // Quality
  readonly dataCompleteness: number;
  readonly sources: string[];
  readonly lastSyncAt: Date | null;
  readonly asOf: Date;
}
```

#### CommercialOrderState

```typescript
interface CommercialOrderState {
  readonly orderId: string;
  readonly tenantId: string;

  // Identity
  readonly orderNumber: string;
  readonly orderType: string;
  readonly status: string;

  // Parties
  readonly customerTaxId: string;
  readonly customerName: string;
  readonly salesRepName: string | null;

  // Lines
  readonly lineCount: number;
  readonly totalUnits: number;
  readonly totalValue: number;
  readonly currency: string;

  // Fulfillment
  readonly fulfillmentStatus: string;       // PENDING | PARTIAL | FULFILLED | CANCELLED
  readonly matchedInvoices: number;
  readonly pendingLines: number;

  // Timeline
  readonly createdAt: Date;
  readonly expectedDeliveryAt: Date | null;
  readonly fulfilledAt: Date | null;
  readonly slaBreached: boolean;

  // Quality
  readonly dataCompleteness: number;
  readonly sources: string[];
  readonly asOf: Date;
}
```

#### CommercialInventoryState

```typescript
interface CommercialInventoryState {
  readonly productId: string;
  readonly tenantId: string;

  // Product identity
  readonly referenceCode: string;
  readonly productName: string;

  // Aggregate positions
  readonly totalPhysical: number;
  readonly totalAvailable: number;
  readonly totalReserved: number;

  // Per-location breakdown
  readonly positions: Array<{
    readonly locationCode: string;
    readonly locationType: string;
    readonly physical: number;
    readonly available: number;
    readonly reserved: number;
  }>;

  // Health
  readonly ageDistribution: Record<string, number> | null;  // "0-30d", "31-60d", etc.
  readonly rotationIndex: number | null;
  readonly stockoutRisk: boolean;
  readonly deadStock: boolean;

  // Coverage (if store-level)
  readonly coverageStatus: string | null;     // OK | UNDER | OVER
  readonly coverageDaysRemaining: number | null;

  // Quality
  readonly dataCompleteness: number;
  readonly sources: string[];
  readonly lastSyncAt: Date | null;
  readonly asOf: Date;
}
```

---

## FASE 6 — Agent Definitions

### Official Agent Registry

Each agent declares what domains it consumes, what engines it queries, and what actions it can execute.

#### Sales Copilot (David)

```
ID:       david
Name:     David - Operaciones Comerciales
Domain:   sales, commercial

Consumes:
  - CUSTOMER domain (profiles, assignments, credit)
  - SALES domain (documents, lines, attributions)
  - INVENTORY domain (positions, availability)
  - Knowledge Layer (customer facts, product facts, opportunity facts)

Queries:
  - ABC Engine (product classification)
  - Rotation Engine (product velocity)
  - Customer Lifecycle Engine (activity patterns)
  - Opportunity Engine (cross-sell signals)

Actions:
  - Create order draft
  - Assign customer to sales rep
  - Flag customer for follow-up
  - Generate sales report
  - Suggest product substitution
```

#### Inventory Copilot (New — proposed)

```
ID:       inventory_copilot
Name:     Inventario Inteligente
Domain:   inventory

Consumes:
  - INVENTORY domain (positions, movements, age)
  - PRODUCT domain (profiles, variants)
  - STORE_OPS domain (store inventory)
  - Knowledge Layer (stockout risk, dead stock, rotation)

Queries:
  - Inventory Health Engine
  - Rotation Engine
  - Demand Engine
  - Stockout Detector

Actions:
  - Flag dead stock
  - Suggest markdown
  - Propose inter-warehouse transfer
  - Alert production pressure
```

#### Coverage Copilot (New — proposed)

```
ID:       coverage_copilot
Name:     Cobertura Comercial
Domain:   store_ops, coverage

Consumes:
  - STORE_OPS domain (profiles, rules, evaluations)
  - INVENTORY domain (positions per store)
  - SALES domain (sales per store)
  - Knowledge Layer (coverage facts, replenishment needs)

Queries:
  - Coverage Engine
  - Store Needs Engine
  - Assortment Engine
  - Replenishment Engine

Actions:
  - Generate surtido proposal
  - Flag under-coverage store
  - Suggest assortment change
  - Create transfer order
```

#### Store Copilot (New — proposed)

```
ID:       store_copilot
Name:     Inteligencia de Tiendas
Domain:   store_ops

Consumes:
  - STORE_OPS domain (all entities)
  - INVENTORY domain (store positions)
  - SALES domain (store sales)
  - CUSTOMER domain (store-customer links)
  - Knowledge Layer (store facts)

Queries:
  - Coverage Engine
  - Store Needs Engine
  - Demand Engine

Actions:
  - Review surtido proposal
  - Approve/reject transfer
  - Flag store anomaly
  - Generate store guide
```

#### Collections Copilot (Laura)

```
ID:       laura
Name:     Laura - Cobranza
Domain:   collections, receivables

Consumes:
  - CUSTOMER domain (receivables, collections, credit)
  - SALES domain (invoice references)
  - Knowledge Layer (customer risk facts, payment behavior)

Queries:
  - Commercial Risk Engine
  - Customer Lifecycle Engine

Actions:
  - Generate collection queue
  - Flag overdue account
  - Suggest payment plan
  - Send WhatsApp reminder
  - Mark payment received
```

#### Production Copilot (New — proposed)

```
ID:       production_copilot
Name:     Inteligencia de Produccion
Domain:   purchasing, production

Consumes:
  - PURCHASING domain (OP, ET, CN)
  - INVENTORY domain (raw materials)
  - SALES domain (demand signals)
  - Knowledge Layer (supplier facts, production delays)

Queries:
  - Production Signal Engine
  - Demand Engine
  - Repurchase Engine

Actions:
  - Flag production delay
  - Suggest raw material reorder
  - Alert capacity constraint
  - Track OP -> CN -> ET lifecycle
```

#### Financial Copilot (Diego)

```
ID:       diego
Name:     Diego - Inteligencia Financiera
Domain:   finance, treasury, reconciliation

Consumes:
  - FINANCE (payments, reconciliation, banking, documents)
  - CUSTOMER domain (receivables, collections)
  - Knowledge Layer (financial patterns, trends)

Queries:
  - Financial Pattern Engine
  - Financial Trend Engine
  - Root Cause Engine
  - Financial Runtime

Actions:
  - Run reconciliation
  - Flag anomaly
  - Generate cash flow projection
  - Review document
  - Approve payment
```

#### CEO Copilot (Pablo)

```
ID:       pablo
Name:     Pablo - Gestion Ejecutiva
Domain:   executive, all

Consumes:
  - ALL domains (read-only, aggregated)
  - ALL Knowledge Layer facts
  - ALL engine outputs (via read models)

Queries:
  - All engines (via read models only)
  - Knowledge Snapshot

Actions:
  - Review agent performance
  - Approve escalated decisions
  - Request deep-dive from specialized agent
  - Generate executive briefing
```

#### Marketing Copilot (Luca)

```
ID:       luca
Name:     Luca - Director Creativo
Domain:   marketing_studio

Consumes:
  - PRODUCT domain (catalog, variants, prices)
  - INVENTORY domain (availability for campaigns)
  - SALES domain (promotion lift)
  - Knowledge Layer (seasonal patterns, fast movers)

Queries:
  - Promotion Engine
  - ABC Engine

Actions:
  - Generate content
  - Schedule publication
  - Sync to Shopify
  - Plan campaign
```

#### Ecommerce Copilot (Sofia)

```
ID:       sofia
Name:     Sofia - Ecommerce Growth
Domain:   integrations, ecommerce

Consumes:
  - PRODUCT domain (catalog sync)
  - INVENTORY domain (stock for online channels)
  - SALES domain (online sales)
  - Integrations layer (connector health)

Queries:
  - Inventory Health Engine
  - Connector diagnostics

Actions:
  - Trigger Shopify sync
  - Diagnose connector failure
  - Map product to online catalog
  - Flag integration degradation
```

---

## FASE 7 — Eliminate CRM Architectural Dependency

### Current State

The `CRM_WINS` pattern exists in `customer-entities.ts` as part of the `AssignmentConflict` resolution type:

```typescript
readonly resolution: "SAG_WINS" | "CRM_WINS" | "MOST_RECENT" | "UNRESOLVED";
```

### Target State

Replace source-specific resolution with source-agnostic policies:

```typescript
readonly resolution: "PRIMARY_WINS" | "SECONDARY_WINS" | "MOST_RECENT" | "HIGHEST_CONFIDENCE" | "UNRESOLVED";
```

### What Changes (conceptual — no code in this sprint)

| Current | Target | Rationale |
|---|---|---|
| `"CRM_WINS"` | `"PRIMARY_WINS"` or `"MOST_RECENT"` | CRM is not inherently more authoritative. Resolution depends on the field. |
| `"SAG_WINS"` | `"PRIMARY_WINS"` | SAG is the primary ERP for most master data, but the label should be source-agnostic. |
| `SalesRepInput.crmAssignedUserName` | `SalesRepInput.secondarySourceName` | The secondary source could be CRM, another ERP, or manual entry. |
| `CrmJoinInput` / `CrmJoinResult` | `ExternalJoinInput` / `ExternalJoinResult` | CRM is one of many external systems. The join pattern is universal. |

### Source Priority Policy (proposed)

Each field can declare its own priority policy:

```typescript
interface SourcePriorityPolicy {
  readonly field: string;
  readonly primarySource: string;      // e.g. "SAG_PYA"
  readonly secondarySource: string;    // e.g. "CRM_SUITECRM"
  readonly resolutionStrategy: "PRIMARY_WINS" | "MOST_RECENT" | "HIGHEST_CONFIDENCE";
  readonly requiresEvidence: boolean;
}
```

Example policies:

| Field | Primary | Secondary | Strategy |
|---|---|---|---|
| taxId | SAG | CRM | PRIMARY_WINS |
| name | SAG | CRM | PRIMARY_WINS |
| salesRepAssignment | CRM | SAG | MOST_RECENT |
| creditTermDays | SAG | — | PRIMARY_WINS |
| billingAddress | CRM | SAG | MOST_RECENT |
| email | CRM | SAG | MOST_RECENT |
| zone | SAG | — | PRIMARY_WINS |
| priceList | SAG | — | PRIMARY_WINS |

### Migration Path

1. Add `SourcePriorityPolicy` to `customer-entities.ts`
2. Update `resolveSalesRep()` to use policy instead of hardcoded CRM_WINS
3. Rename `CrmJoinInput` → `ExternalJoinInput` (backward-compatible alias)
4. Add policy registry to the Knowledge Layer
5. Let each adapter declare its source ID (already exists: `sourceType` in `DataSourceMetadata`)

This is **not a breaking change** — the existing `CRM_WINS` / `SAG_WINS` values remain valid as concrete resolution outcomes, but the decision logic moves to policies.

---

## FASE 8 — Roadmap

### Completed

```
[DONE] COMMERCIAL-DATA-LAYER-FOUNDATION-01      Foundation contracts, shared types, quality evaluator
[DONE] PRODUCT-DOMAIN-01                         Product profiles, variants, prices, classifications
[DONE] SALES-DOMAIN-01                           Sales documents, lines, returns, attributions
[DONE] INVENTORY-DOMAIN-01                       Positions, movements, availability, snapshots, age
[DONE] COMMERCIAL-DATA-LAYER-INTEGRATION-01      Cross-domain read model, evidence, errors
[DONE] CUSTOMER-DOMAIN-01                        Customer profiles, receivables, behavior, vendors
[DONE] CUSTOMER-SAG-ENRICHMENT-02                Commercial assignment, credit, active status, lookups
[DONE] CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01      Data source map, knowledge graph, gap analysis
```

### Next — Domain Completion

```
[ ] STORE-OPS-DATA-CONTRACT-01                   Formalize StoreProfile, StoreCoverageRule, StoreInventoryPosition
[ ] RECEIVABLES-DOMAIN-01                        Extract from Customer: receivables + collections as standalone
[ ] PURCHASING-DOMAIN-01                         Formalize ProductionOrder, ET, CN, ImportReceipt, SupplierProfile
[ ] PRODUCTION-DOMAIN-01                         Production planning lifecycle (OP → CN → ET)
[ ] WORKFORCE-DOMAIN-01                          Sales rep management, territories, performance
```

### Next — Knowledge Layer

```
[ ] KNOWLEDGE-LAYER-FOUNDATION-01                KnowledgeNode, Relation, Fact, Evidence types
[ ] KNOWLEDGE-FACT-REGISTRY-01                   Fact type catalog + validation rules
[ ] KNOWLEDGE-SNAPSHOT-ENGINE-01                  Point-in-time snapshot computation
[ ] KNOWLEDGE-TIMELINE-ENGINE-01                 Temporal evolution tracking
```

### Next — Business Engines

```
[ ] ABC-ENGINE-01                                Product ABC classification from 12-month sales
[ ] ROTATION-ENGINE-01                           Product rotation index from sales velocity + inventory
[ ] INVENTORY-HEALTH-ENGINE-01                   Age distribution, dead stock, stockout risk
[ ] COMMERCIAL-RISK-ENGINE-01                    Customer risk scoring from receivables + behavior
[ ] CUSTOMER-LIFECYCLE-ENGINE-01                 Activity patterns: growing/stable/declining/inactive
[ ] OPPORTUNITY-ENGINE-01                        Cross-sell signals from customer + inventory alignment
[ ] MARKDOWN-ENGINE-01                           Price optimization from margin + velocity + age
[ ] FORECAST-ENGINE-01                           Demand forecasting from sales history + seasonality
```

### Next — Read Models

```
[ ] COMMERCIAL-VENDOR-STATE-01                   CommercialVendorState read model
[ ] COMMERCIAL-STORE-STATE-01                    CommercialStoreState read model
[ ] COMMERCIAL-ORDER-STATE-01                    CommercialOrderState read model
[ ] COMMERCIAL-INVENTORY-STATE-01                CommercialInventoryState read model
```

### Next — Knowledge Graph

```
[ ] KNOWLEDGE-GRAPH-BUILDER-01                   Build graph from domain entities + facts
[ ] KNOWLEDGE-QUERY-ENGINE-01                    Query facts by node, type, time, confidence
[ ] KNOWLEDGE-AGENT-BRIDGE-01                    Feed facts to copilot agents
```

### Next — Copilot Integration

```
[ ] COPILOT-KNOWLEDGE-CONTEXT-01                 Inject Knowledge Layer into copilot context
[ ] COPILOT-FACT-BASED-REASONING-01              Agents reason from facts, not tables
[ ] COPILOT-EVIDENCE-CITATION-01                 Agent responses cite evidence
```

### Next — Automation Runtime

```
[ ] AUTOMATION-TRIGGER-ENGINE-01                 Fact-based trigger rules
[ ] AUTOMATION-ACTION-REGISTRY-01                Available actions per agent
[ ] AUTOMATION-APPROVAL-FLOW-01                  Human-in-the-loop approval
```

### Final — Agentik Enterprise OS

```
[ ] ENTERPRISE-OS-KNOWLEDGE-DASHBOARD-01         Visual knowledge explorer
[ ] ENTERPRISE-OS-AGENT-WORKSPACE-01             Unified agent workspace
[ ] ENTERPRISE-OS-EXECUTIVE-BRIEFING-01          CEO-level automated briefing
```

---

## The Core Idea

**Today:** Agents answer "What does SAG say?"

**Tomorrow:** Agents answer "What does the business know?"

The difference:

> "La tabla MOVIMIENTOS dice que el NIT 800123456 tiene 3 facturas."

vs.

> "Vanidades Mary dejó de comprar hace 94 días, tiene cartera vencida de 38 días, y el inventario de los productos que normalmente compra está disponible en la bodega principal. El vendedor Carlos Gómez debería contactarla esta semana."

The second answer doesn't exist in SAG. It doesn't exist in CRM. It doesn't exist in any table.

It exists because Agentik:
1. **Captured** data from SAG + CRM + Banks (Connectors)
2. **Normalized** it into canonical entities (Data Layer)
3. **Derived** business facts from multiple domains (Knowledge Layer)
4. **Applied** engines to compute intelligence (Business Engines)
5. **Preserved** evidence for every conclusion (Evidence Chain)
6. **Delivered** it through an agent that knows the context (Copilot)

That is the Commercial Knowledge Platform.
