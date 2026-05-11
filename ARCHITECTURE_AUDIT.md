# ARCHITECTURE AUDIT — Agentik Platform
**Date:** 2026-05-06
**Branch:** demo/foto-estudio
**Status:** READ-ONLY audit. No code changes. No feature design.

---

## 1. ENTITY CATALOG

### 1.1 Core Platform Entities

| Model | Purpose | Key Fields | Relations |
|---|---|---|---|
| `Organization` | Root multi-tenant entity | `id`, `slug`, `type`, `status` | All org-scoped models |
| `User` | Authentication identity | `id`, `email` | Memberships |
| `Membership` | User ↔ Org join with role | `organizationId`, `userId`, `role` | User, Org |
| `TenantModule` | Feature flag per org | `organizationId`, `moduleKey`, `enabled` | Org |
| `Project` | Sub-org workspace container | `organizationId`, `slug` | Org |
| `Workspace` | Agent workspace | `organizationId`, `projectId` | Org, Project |

### 1.2 Commercial / Financial Entities

| Model | Purpose | Key Identity Fields | FK Links |
|---|---|---|---|
| `CustomerProfile` | Canonical customer record | `nit`, `nitNormalized`, `sagTerceroId`, `slug` | `organizationId` |
| `SaleRecord` | Revenue transactions from SAG | `customerNit` (string, no FK) | `organizationId`, `importBatchId` |
| `SalesImportBatch` | Import metadata per batch | `organizationId`, `batchRef` | Org |
| `CustomerReceivable` | Open invoices / cartera | `invoiceNumber`, `customerNit` (fallback), `customerId` (FK optional) | CustomerProfile (optional) |
| `PaymentRecord` | Manual payment entries | `customerId` (optional), `customerNit` (denorm) | CustomerProfile (optional) |
| `PaymentAllocation` | Invoice ↔ payment join | `paymentId`, `receivableId` | PaymentRecord, CustomerReceivable |
| `CollectionRecord` | SAG cobros sync (v_pagosnew) | `customerNit`, `customerId` (optional) | CustomerProfile (optional) |
| `SourceMatchRecord` | F2→F1 conversion dedup | `f2RecordId`, `f1RecordId` | SaleRecord (by ID, no Prisma relation) |
| `Budget` | Budget definitions | `organizationId`, period fields | Org |

### 1.3 CRM Entities

| Model | Purpose | FK Link |
|---|---|---|
| `CRMOpportunity` | Sales pipeline opportunities | `customerId` → CustomerProfile |
| `CRMActivity` | Calls, visits, tasks | `customerId` → CustomerProfile |
| `CRMQuote` | Price quotes | `customerId` → CustomerProfile |
| `PipelineStage` | Pipeline stage definitions | `organizationId` |

### 1.4 Order / Inventory Entities (Mixed maturity)

| Model | Purpose | Status |
|---|---|---|
| `CustomerOrderRecord` | SAG pedidos (PD documents) | Active — populated by SAG adapter |
| `ProductSnapshot` | Shopify/PYA product sync | Legacy — pre-connector era |
| `OrderSnapshot` | Shopify/PYA order sync | Legacy — pre-connector era |
| `ConnectorMapping` | Field-level sync mapping config | Active |

### 1.5 Marketing Studio Entities

| Model | Purpose | FK Links |
|---|---|---|
| `StudioSession` | Wizard session state | `organizationId`, `tenantId` (string, NOT FK to CustomerProfile) |
| `GeneratedAsset` | AI-generated media | `sessionId` → StudioSession |

### 1.6 Connector / Integration Entities

| Model | Purpose |
|---|---|
| `Connector` | Integration config (SAG, PYA, etc.) |
| `ConnectorRun` | Sync execution log |
| `ConnectorCursor` | Resume point for incremental sync |
| `ConnectorMapping` | Source → target field mapping |
| `SyncJob` | Legacy sync job tracker |

### 1.7 AI / Agent Platform Entities

| Model | Purpose |
|---|---|
| `Agent` | AI agent definition |
| `AgentVersion` | Agent version history |
| `Run` | Execution run |
| `Channel` | Input channel (web, WhatsApp, etc.) |
| `Integration` | External service integration |
| `Workflow` | Workflow definition |
| `Conversation`, `Message` | Chat history |
| `KnowledgeItem`, `KnowledgeLink` | RAG knowledge base |
| `Document` | Uploaded documents (PDF, XML) |
| `Event` | System events log |
| `Alert`, `BusinessAlert` | Alert systems (two models — see §4) |
| `Rule`, `RuleExecution` | Alert rule engine |

### 1.8 WhatsApp Module

| Model | Purpose |
|---|---|
| `WhatsAppConfig` | Per-org WhatsApp Business setup |
| `WhatsAppConversation` | Conversation threads |
| `WhatsAppMessage` | Individual messages |
| `WhatsAppContactMemory` | AI memory per contact |

---

## 2. MODULE MAP

### 2.1 Module Keys and Routes

| Module Key | Route Prefix | Role Access | Status |
|---|---|---|---|
| `dashboard` | `/dashboard` | All | Active |
| `torre_control` | `/executive` | MANAGER+ | Active |
| `finance` | `/finance`, `/reconciliation` | BILLING+ | Active |
| `sales` | `/sales`, `/customer-360`, `/pipeline`, `/reports`, `/data-explorer`, `/reconciliation` | OPERATOR+ | Active |
| `collections` | `/collections`, `/control-center/cobranza` | OPERATOR+ | Active |
| `alerts` | `/alerts` | OPERATOR+ | Active |
| `documents` | `/documents` | BILLING+ | Active |
| `knowledge` | `/knowledge` | OPERATOR+ | Active |
| `marketing_studio` | `/agentik/marketing-studio` | ORG_ADMIN+ | Active |
| `agentik` | `/agentik` | AGENTIK_ADMIN+ | Internal only |
| `integrations` | `/integrations`, `/sag/write`, `/sag/clientes`, `/sag/articulos` | AGENTIK_ADMIN+ | Internal |
| `runs` | `/runs` | AGENTIK_ADMIN+ | Internal |
| `events` | `/events` | AGENTIK_ADMIN+ | Internal |
| `agents` | `/agents` | AGENTIK_ADMIN+ | Internal |
| `settings` | `/settings` | AGENTIK_ADMIN+ | Internal |
| `workforce` | `/workforce` | OPT-IN | Scaffolded only |
| `whatsapp` | `/whatsapp` | OPT-IN | Active |
| `copilot` | (Right Rail only) | OPT-IN | No page yet |
| `inventory`, `production`, `purchases`, `dispatch` | — | OPT-IN | No pages |
| `tenants_admin` | `/agentik/marketing-studio/tenants` | SUPER_ADMIN | Active |

### 2.2 Role Hierarchy

```
VIEWER < BILLING < OPERATOR < MANAGER < ORG_ADMIN < AGENTIK_ADMIN < SUPER_ADMIN
```

**Hard separation:** AGENTIK_ADMIN cannot see client business data. ORG_ADMIN cannot see internal console.

---

## 3. SERVICE LAYER MAP

### 3.1 Finance / Cartera

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| FP&A queries | `lib/finance/fpa-queries.ts` | SaleRecord, Budget | `organizationId`, fiscal window |
| Cartera KPIs | `lib/finance/cartera-kpis.ts` | CustomerReceivable, CollectionRecord | `organizationId` |
| Reconciliation engine | `lib/finance/reconciliation.ts` | CustomerReceivable, CollectionRecord, PaymentRecord | `organizationId` |
| Payment service | `lib/finance/payment-service.ts` | PaymentRecord, PaymentAllocation, CustomerReceivable | `organizationId`, `customerId` |
| Cobros breakdown | `lib/finance/cobros-breakdown.ts` | CollectionRecord | `organizationId` |
| Receivables snapshot | `lib/finance/receivables-snapshot.ts` | CustomerReceivable | `organizationId` |

### 3.2 Sales / Commercial

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| Sales reports | `lib/sales/reports.ts` | SaleRecord | `organizationId`, `sagSourceType`, period |
| Commercial ledger | `lib/commercial-ledger/service.ts` | SaleRecord | `organizationId` |
| Data explorer | `lib/sales/data-explorer.ts` | SaleRecord | `organizationId` |
| Source rules | `lib/sales/source-rules.ts` | SaleRecord (classification logic) | — |
| Pivot parser | `lib/sales/pivot-parser.ts` | SaleRecord (import) | — |

### 3.3 Customer 360

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| Customer service | `lib/customer360/service.ts` | CustomerProfile, SaleRecord, CustomerReceivable, CRMActivity | `organizationId`, `customerId` |
| Scoring service | `lib/customer360/scoring-service.ts` | CustomerProfile | `organizationId` |
| Customer loader | `lib/customer360/loader.ts` | CustomerProfile | `organizationId`, `slug` |

### 3.4 Collections

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| Collection queue | `lib/collections/queue.ts` | CustomerReceivable, CollectionRecord, CustomerProfile | `organizationId` |
| Alert engine | `lib/sales/alert-engine.ts` | BusinessAlert, SaleRecord | `organizationId` |

### 3.5 Connectors / SAG

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| SAG PYA SOAP adapter | `lib/connectors/adapters/sag-pya-soap/` | SaleRecord, CollectionRecord, CustomerOrderRecord, CustomerProfile | `organizationId`, `connectorId` |
| Connector sync engine | `lib/connectors/core/sync-engine.ts` | Connector, ConnectorRun, ConnectorCursor | `organizationId` |
| Normalizers | `lib/connectors/core/normalizers/` | CustomerProfile, CustomerReceivable, SaleRecord | — |

### 3.6 Marketing Studio

| Service | File | Models Touched | Primary Filter |
|---|---|---|---|
| Studio execution | `app/api/orgs/[orgSlug]/marketing-studio/sessions/[sessionId]/execute/route.ts` | StudioSession, GeneratedAsset | `organizationId`, `sessionId` |
| Foto Estudio generation | `app/api/orgs/.../foto-estudio/sessions/[sessionId]/generate/route.ts` | StudioSession, GeneratedAsset | `organizationId`, `sessionId` |
| Biblioteca | `app/api/orgs/[orgSlug]/marketing-studio/biblioteca/route.ts` | GeneratedAsset, StudioSession | `organizationId` |

---

## 4. IDENTIFIED PROBLEMS

### CRITICAL — Data Integrity

#### P1: Three-way NIT fragmentation in CustomerProfile
```
CustomerProfile.nit            (legacy, may have dots/dashes)
CustomerProfile.nitNormalized  (canonical, normalized)
CustomerProfile.sagTerceroId   (Int — SAG internal PK)
```
- `SaleRecord.customerNit` — STRING, joins to CustomerProfile via string match, NO FK
- `CollectionRecord.customerNit` — STRING, same problem
- `CustomerReceivable.customerNit` — STRING fallback when `customerId` is null

**Risk:** A join failure (e.g. "901383501" vs "901.383.501") silently breaks customer attribution. Cartera totals, cobros, and Customer 360 scores become wrong without error.

**Where it fails:** `lib/collections/queue.ts`, `lib/customer360/service.ts`, any query joining SaleRecord → CustomerProfile.

#### P2: Two parallel payment models
```
PaymentRecord     — manual form entry (Agentik UI)
CollectionRecord  — SAG sync from v_pagosnew (automated)
```
- `PaymentAllocation` links PaymentRecord → CustomerReceivable
- `CollectionRecord.appliedFacts` (JSONB) stores informal invoice links
- `CollectionRecord.paymentRecordId` (optional FK) — bridge field, not always populated

**Risk:** Double-counting cobros. When a CollectionRecord is synced AND a PaymentRecord is manually created for the same payment, both exist independently. Reconciliation relies on `appliedStatus` / `paymentRecordId` to detect this, but it is NOT enforced at DB level.

#### P3: Two alert models
```
Alert          — general platform alerts (org-scoped, tied to SystemAlert)
BusinessAlert  — commercial/cartera alerts (org-scoped, auto-generated)
```
- Different data shapes, different query paths
- Centro de Decisiones (`/alerts`) mixes both via separate queries
- No unified AlertService — `lib/alerts/alerts-service.ts` queries `Alert`; `lib/sales/alert-engine.ts` queries `BusinessAlert`

#### P4: No canonical Product entity
SaleRecord stores `productCode`, `productLine`, `productName` as denormalized strings.
`ProductSnapshot` exists (Shopify/PYA sync) but is a legacy flat model, not a catalog.
`StudioSession` has `productSku` as a string with no FK.

**Risk:** No way to link a marketing session to a sales record for the same product. No catalog-based lookup. Product deduplication is impossible.

---

### HIGH — Architectural Debt

#### P5: StudioSession is disconnected from all commercial entities
```
StudioSession {
  tenantId    String   // "castillitos" — NOT a FK
  productSku  String?  // free text — no FK to any product entity
}
```
- No link to CustomerProfile
- No link to SaleRecord or ProductSnapshot
- Generated assets cannot be attributed to a commercial product

#### P6: CustomerReceivable.customerId is optional in production
```
CustomerReceivable.customerId String?  // FK to CustomerProfile — nullable
```
Rows with `customerId = null` fall back to `customerNit` for display. Collections queue, cartera KPIs, and Customer 360 may silently skip unlinked receivables or double-count them.

**Magnitude:** Depends on SAG sync quality. Every unlinked receivable is invisible to Customer 360.

#### P7: SaleRecord has no FK to CustomerProfile
```
SaleRecord.customerNit String?  // no FK, no index uniqueness guarantee
```
Customer 360's `totalSalesL12`, `ltv`, `avgTicket` are computed by joining on this string. If `customerNit` is null (common for remision documents), the customer gets no sales attribution.

#### P8: Secondary routes exist outside sidebar navigation
Discovered from file glob and executive page analysis:
```
/finanzas/facturas/page.tsx   — "Facturas del día" view; linked from executive via /{orgSlug}/finanzas/facturas?fecha=hoy
/comercial/ventas/page.tsx    — "Ventas del día" view; linked from executive via /{orgSlug}/comercial/ventas?fecha=hoy
/control-center/cobranza/     — Mando Cobranza; linked from sidebar (collections module)
/[workspaceSlug]/dashboard/   — workspace-scoped dashboard (different from /dashboard)
/operaciones/pedidos/         — Orders view (CustomerOrderRecord)
```
`/finanzas/facturas` and `/comercial/ventas` are **not legacy** — they are deliberate secondary views linked from `/executive`. However they have no sidebar entry and their module guard is unverified. `/[workspaceSlug]/dashboard` is a separate workspace-scoped view; unclear if actively used.

#### P9: Budget model not wired to actuals
`Budget` model exists in schema with period/amount fields. `lib/finance/fpa-queries.ts` queries SaleRecord for actuals. No service computes `actual vs budget` variance at runtime. Budget UI exists (`/api/orgs/[orgSlug]/finance/budget`) but integration to dashboard is unclear.

---

### MEDIUM — Navigation Continuity

#### N1: Dead-end navigation paths (no target route)
| Sidebar Item | Type | Target |
|---|---|---|
| Ads / Pauta con IA | `<span>` | `/ads` (no page) |
| IA Marketing Copilot | `<span>` | `/copilot` (no page) |
| Planes [próximamente] | `<span>` | No route |
| Feature Flags | Unknown | Unknown |

#### N2: Pages with no back-navigation to parent context
- `/alerts/[alertId]` — detail page exists; no CTA back to the affected entity (e.g. customer, invoice)
- `/collections` queue items — no click-through to Customer 360 or cartera detail
- `/sales/customers/[slug]` — customer detail; no link to their open cartera or CRM activities
- `/sag/write/[id]` — SAG write approval; no link to the customer profile it affects

#### N3: Cross-module links that should exist but don't
| Source | Should Link To | Current State |
|---|---|---|
| Customer 360 card | Open cartera (CustomerReceivable list) | No link |
| Cartera invoice row | Customer 360 profile | No link |
| Collections queue item | CRM activity log | No link |
| Marketing session | Product's commercial history | No link |
| Sales alert (BusinessAlert) | Customer 360 | No link |
| Generated asset | Product in Biblioteca | Partial (biblioteca queries by org, not session→product) |

#### N4: Redes Sociales and Shopify pages exist but are placeholders
Sidebar links to `/agentik/marketing-studio/redes` and `/shopify` — pages exist but render "coming soon" or stub content. No functional route behind real pages.

---

### LOW — Query Inconsistencies

#### Q1: Mixed use of customerNit vs customerId in filters
Different services use different fields to identify the same customer:
```
lib/customer360/service.ts    → WHERE customerId = X  (FK)
lib/collections/queue.ts      → WHERE customerNit IN (...)  (string)
lib/finance/fpa-queries.ts    → no customer filter (org-level only)
lib/sales/reports.ts          → WHERE customerNit = X  (string)
```

#### Q2: CollectionRecord.appliedFacts JSONB vs PaymentAllocation table
Payment-to-invoice associations exist in two incompatible formats:
- `PaymentAllocation` — normalized relational table (PaymentRecord → CustomerReceivable)
- `CollectionRecord.appliedFacts` — JSONB array of `{invoiceNumber, amount}` objects

No bridge service aggregates both for a unified "total applied" view.

#### Q3: sagSourceType filtering not uniform
`SaleRecord.sagSourceType` (OFICIAL / REMISION) gates revenue vs operational demand.
Some queries filter by it explicitly; others don't, silently mixing Fuente 1 and Fuente 2 in aggregates.

---

## 5. MODULE ↔ ENTITY DEPENDENCY MAP

```
Organization (root)
├── COMMERCIAL
│   ├── SaleRecord          ← used by: sales, executive, finance, customer360
│   ├── CustomerProfile     ← used by: customer360, collections, crm, cartera
│   ├── CustomerReceivable  ← used by: finance, collections, customer360, cartera
│   ├── PaymentRecord       ← used by: finance, collections
│   ├── CollectionRecord    ← used by: finance (cobros), cartera kpis
│   ├── PaymentAllocation   ← used by: finance
│   └── SourceMatchRecord   ← used by: executive (F2 toggle), finance
│
├── CRM
│   ├── CRMOpportunity      ← used by: pipeline, customer360
│   ├── CRMActivity         ← used by: customer360, pipeline
│   └── CRMQuote            ← used by: pipeline (stub)
│
├── ORDERS
│   ├── CustomerOrderRecord ← used by: executive (B1 carousel — daily orders)
│   └── ProductSnapshot     ← legacy, limited use
│
├── MARKETING
│   ├── StudioSession       ← used by: marketing-studio wizard
│   └── GeneratedAsset      ← used by: marketing-studio biblioteca
│         NOTE: NO LINKS to CustomerProfile, SaleRecord, or ProductSnapshot
│
├── ALERTS
│   ├── Alert               ← used by: /alerts centro de decisiones
│   ├── BusinessAlert       ← used by: /alerts, executive dashboard
│   └── Rule                ← used by: /alerts reglas tab (list only)
│
├── CONNECTORS
│   ├── Connector           ← used by: /integrations, sync engine
│   ├── ConnectorRun        ← used by: /integrations sync panel
│   └── ConnectorCursor     ← used by: sync engine (incremental)
│
└── PLATFORM
    ├── Agent, Run, Workflow ← used by: /agentik, /runs internal console
    ├── Document             ← used by: /documents
    ├── KnowledgeItem        ← used by: /knowledge
    ├── Event                ← used by: /events
    └── WhatsApp*            ← used by: /whatsapp (opt-in)
```

---

## 6. PRIORITY RECOMMENDATIONS

> These are observations, not commitments. Sequence depends on product roadmap.

### Priority 1 — Stabilize customer identity (CRITICAL before scaling)
- Define single join strategy: `customerId` (FK) vs `nitNormalized` (string)
- Add a `resolveCustomerId(orgId, nit)` utility used consistently across all services
- Index + enforce `nitNormalized` as the canonical lookup key
- Audit unlinked CustomerReceivable rows (`customerId IS NULL`) — quantify gap

### Priority 2 — Unify payment models
- Define clear contract: CollectionRecord = SAG-sourced cobro; PaymentRecord = manually registered
- Implement a PaymentService that aggregates both for customer-level totals
- Enforce `CollectionRecord.paymentRecordId` population when a matching PaymentRecord exists (or vice versa)

### Priority 3 — Create Product catalog
- New model: `ProductCatalog` or promote `ProductSnapshot` to canonical
- Add FK from `StudioSession.productSku` → `ProductCatalog.sku`
- Add FK from `SaleRecord.productCode` → `ProductCatalog.sku` (nullable for legacy)
- Enables: marketing → sales product traceability

### Priority 4 — Navigation continuity
- Customer 360 → open cartera link
- Collections queue item → Customer 360 link
- Cartera invoice → payment history link
- `/alerts/[alertId]` → affected entity deep link

### Priority 5 — Consolidate alert models
- One `AlertService` aggregating `Alert` + `BusinessAlert`
- Centro de Decisiones reads from single service
- Rule engine targets `Alert` (not `BusinessAlert`) as output

### Priority 6 — Wire Budget to actuals
- `lib/finance/fpa-queries.ts` already computes actuals
- Budget model already has period + amount fields
- Add `getBudgetVsActual(orgId, period)` service function
- Surface in `/executive` and `/finance`

---

## 7. NAVIGATION CONTINUITY ASSESSMENT

### Current state: Hub-and-spoke with broken spokes

```
Sidebar
  └── Module page (hub)
        └── List / KPI view
              └── [NO DEEP LINKS to related entities]
```

Each module is a self-contained island. Users cannot navigate:
- From a sale → to the customer who made it
- From a customer → to their open invoices
- From an open invoice → to their payment history
- From a collection task → to CRM notes on that customer
- From a marketing session → to the product's commercial performance
- From an alert → to the affected entity

### Target state: Operational continuity

```
Customer 360  ←→  Cartera (receivables)
    ↕                    ↕
  CRM Activities    Collections queue
    ↕                    ↕
  Sales history     Payment records
                         ↕
                    SAG cobros (CollectionRecord)
```

```
Marketing Session  →  Generated Assets
       ↕                      ↕
  Product Catalog    Biblioteca Creativa
       ↕                      ↕
  Sales history        Shopify / Redes
```

---

## 8. SINGLE SOURCE OF TRUTH CANDIDATES

| Domain | Current State | Recommended SSoT |
|---|---|---|
| Customer identity | CustomerProfile + NIT strings scattered | `CustomerProfile.nitNormalized` as canonical join key |
| Revenue | SaleRecord (OFICIAL only) | SaleRecord WHERE sagSourceType = OFICIAL |
| Open cartera | CustomerReceivable | CustomerReceivable (already SSoT — linkage is the gap) |
| Payments received | PaymentRecord + CollectionRecord (split) | PaymentService aggregating both |
| Product catalog | Denormalized in SaleRecord.productCode | MISSING — needs `ProductCatalog` model |
| Alert state | Alert + BusinessAlert (two models) | Needs unification |
| Marketing assets | GeneratedAsset | GeneratedAsset (disconnected from commercial) |
| AI agent execution | Run | Run |

---

*End of audit. No code was modified. All findings are based on static analysis of prisma/schema.prisma, lib/ service files, app/ routes, and layout navigation as of 2026-05-06.*
