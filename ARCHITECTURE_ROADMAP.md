# ARCHITECTURE ROADMAP — Agentik Platform
**Based on:** ARCHITECTURE_AUDIT.md (2026-05-06)
**Status:** Planning document. No code changes. No migrations. No UI.

---

## A. TOP 10 ARCHITECTURAL RISKS

### RISK-01 — NIT Identity Fragmentation
**Severity:** CRITICAL
**Affected modules:** Customer 360, Collections, Cartera, Finance (reconciliation), Sales reports, CRM
**Why it matters:**
Three parallel identity fields coexist on `CustomerProfile`:
- `nit` — legacy, may contain dots/dashes ("901.383.501")
- `nitNormalized` — clean canonical form ("901383501")
- `sagTerceroId` — SAG internal integer PK (unrelated format)

Downstream models (`SaleRecord.customerNit`, `CollectionRecord.customerNit`, `CustomerReceivable.customerNit`) are plain strings with NO foreign key. Every service joins on string equality — a single formatting discrepancy silently breaks the join.

**What breaks if ignored:**
- Customer 360 shows wrong or zero sales/cartera for any customer whose NIT has formatting variants
- Collections queue misses receivables for those customers
- Auto-reconciliation matches wrong payments to wrong customers
- KPI aggregates (LTV, avgTicket, total cartera) are quietly incorrect
- Every new SAG sync batch can introduce new formatting variants, compounding drift

---

### RISK-02 — Two Payment Models, No Enforcement Boundary
**Severity:** CRITICAL
**Affected modules:** Finance (cobros, reconciliation), Collections, Customer 360 (balance)
**Why it matters:**
`PaymentRecord` (manual UI entry) and `CollectionRecord` (SAG v_pagosnew sync) both represent money received from customers. There is no DB constraint preventing both from existing for the same real-world payment. The bridge field `CollectionRecord.paymentRecordId` is optional and not enforced.

**What breaks if ignored:**
- Cobros totals are double-counted whenever a payment is synced from SAG AND manually registered in the UI
- Reconciliation engine cannot confidently mark a receivable as closed without knowing which model is authoritative
- Customer balance shown in Customer 360 and Collections queue is wrong for any manually entered payment that was later synced
- The auto-reconcile script (currently blocked on SAG data) will produce incorrect results the moment it runs against a tenant with both model types populated

---

### RISK-03 — CustomerReceivable Nullable FK to CustomerProfile
**Severity:** CRITICAL
**Affected modules:** Collections queue, Cartera KPIs, Customer 360, Reconciliation
**Why it matters:**
`CustomerReceivable.customerId` is a nullable FK. Rows where `customerId IS NULL` fall back to `customerNit` for any customer-level lookup. The SAG sync normalizer does not guarantee FK population for every imported receivable.

**What breaks if ignored:**
- Unlinked receivables are invisible to Customer 360 (which queries by `customerId`)
- Collections queue may silently skip or duplicate those receivables
- Cartera KPIs aggregated by `customerId` undercount total exposure
- Every new SAG sync batch can create new unlinked rows without any alarm

---

### RISK-04 — SaleRecord Has No FK to CustomerProfile
**Severity:** CRITICAL
**Affected modules:** Sales reports, Customer 360, Executive dashboard, Commercial ledger
**Why it matters:**
`SaleRecord.customerNit` is a nullable string. The entire Customer 360 revenue attribution (`totalSalesL12`, `ltv`, `avgTicket`) is computed by joining on this string. Remision documents (Fuente 2) frequently have `customerNit = null`.

**What breaks if ignored:**
- Customers with any null-NIT transactions have understated sales history
- Executive "Ventas del día" cards may miss remision revenue entirely depending on filter
- CRM scoring based on LTV is wrong for any customer with remision purchases
- No way to reliably produce a customer P&L combining SaleRecord + CustomerReceivable + PaymentRecord

---

### RISK-05 — No Canonical Product Catalog
**Severity:** HIGH
**Affected modules:** Marketing Studio, Biblioteca, Sales reports, Shopify sync, CRM
**Why it matters:**
Product data exists in three incompatible places:
- `SaleRecord.productCode / productName / productLine` — denormalized strings per transaction
- `ProductSnapshot` — legacy flat model from Shopify/PYA sync, pre-connector era
- `StudioSession.productSku` — free text, no FK to any entity

There is no `ProductCatalog` model. No service can answer "give me the sales history for SKU X" and link it to "the generated marketing assets for SKU X."

**What breaks if ignored:**
- Marketing Studio Sprint 5 (product publication step) cannot be built — no entity to publish to
- Shopify sync has no catalog to anchor against; product deduplication is impossible
- AI Copilot cannot answer product-level questions spanning marketing and commercial
- Generated assets cannot be attributed to specific SKUs in reports

---

### RISK-06 — StudioSession Disconnected from All Commercial Entities
**Severity:** HIGH
**Affected modules:** Marketing Studio, Biblioteca, Sales, Executive
**Why it matters:**
`StudioSession.tenantId` is a plain string (e.g. "castillitos"), not a FK. `StudioSession.productSku` is free text. There is no join path from a studio session to:
- The organization's customer base
- The product's commercial history in SaleRecord
- The generated asset's downstream Shopify publication

**What breaks if ignored:**
- Biblioteca Creativa cannot show "generate rate by product" or "sales uplift after campaign"
- Foto Estudio Sprint 5 cannot link approved assets to a product for Shopify publication
- No auditability: cannot answer "which sessions generated assets for top-selling SKUs"

---

### RISK-07 — sagSourceType Filtering Inconsistent Across Services
**Severity:** HIGH
**Affected modules:** Sales reports, Finance FP&A, Executive dashboard, Commercial ledger
**Why it matters:**
`SaleRecord.sagSourceType` distinguishes OFICIAL (Fuente 1 — revenue-grade) from REMISION (Fuente 2 — operational demand). Some services filter explicitly; others aggregate both, silently mixing financial and operational figures.

```
lib/sales/reports.ts         — filters by sagSourceType (correct)
lib/finance/fpa-queries.ts   — no sagSourceType filter (mixed)
lib/commercial-ledger/service.ts — behavior unverified
```

**What breaks if ignored:**
- FP&A revenue figures include remision demand, overstating revenue
- Budget vs actuals comparison uses inflated actuals
- Executive "Ventas" cards may show different totals depending on which service renders them
- Any new service added without the filter inherits the bug silently

---

### RISK-08 — Two Alert Models With No Unified Service
**Severity:** HIGH
**Affected modules:** Centro de Decisiones (/alerts), Executive dashboard, Rule engine
**Why it matters:**
`Alert` (platform-level, `lib/alerts/alerts-service.ts`) and `BusinessAlert` (commercial, `lib/sales/alert-engine.ts`) are separate models with different shapes, different creation paths, and different query services. Centro de Decisiones merges them at the page level, not at the service level.

**What breaks if ignored:**
- Adding a new alert type requires deciding which model to use, with no governing rule
- Rule engine (Rule model) targets neither model clearly — its output destination is undefined
- Deduplication across both models is impossible
- Any unified notification system (WhatsApp, email) must fan out to two separate query paths

---

### RISK-09 — Budget Model Not Wired to Actuals
**Severity:** MEDIUM
**Affected modules:** Finance, Executive dashboard
**Why it matters:**
`Budget` model exists with period and amount fields. `lib/finance/fpa-queries.ts` computes actuals from `SaleRecord`. No service computes variance at runtime. The `/finance` dashboard and executive cockpit show actuals only, with no budget context.

**What breaks if ignored:**
- Financial planning module is structurally incomplete — budget data exists but is never surfaced
- Without variance, the executive cannot distinguish "on track" from "behind target"
- When Budget vs Actuals is eventually requested, the wiring will require both a new service function and a UI change simultaneously, increasing risk

---

### RISK-10 — Secondary Routes Without Verified Module Guards
**Severity:** MEDIUM
**Affected modules:** Finance (/finanzas/facturas), Commercial (/comercial/ventas), Control Center (/control-center/cobranza)
**Why it matters:**
Routes `/finanzas/facturas`, `/comercial/ventas`, and `/control-center/cobranza` are real pages linked from the executive dashboard and sidebar. They exist outside the primary sidebar navigation and their `resolveModuleForPath()` coverage is unverified. If the module guard does not catch them, a user with insufficient permissions can access them via direct URL.

**What breaks if ignored:**
- Financial data exposed to VIEWER-role users via direct URL
- Module-level access control (the primary security boundary for multi-tenant SaaS) has holes
- Any future role changes may not apply to these routes

---

## B. IMMEDIATE 5-SPRINT PLAN

> Sprints are ordered by dependency and safety, not by business priority.
> Each sprint is self-contained and independently deployable.

---

### Sprint S1 — Customer Identity Stabilization

**Title:** Establish `nitNormalized` as the canonical customer join key across all services

**Objective:**
Eliminate silent join failures caused by NIT formatting variants. All service queries that currently join on `customerNit` (string) must migrate to a consistent strategy using `nitNormalized` as the canonical lookup key, enforced through a shared utility.

**Files likely affected:**
- `lib/customer360/service.ts` — already uses `customerId`; add fallback via `nitNormalized`
- `lib/collections/queue.ts` — uses `customerNit IN (...)` array; switch to `nitNormalized`
- `lib/finance/cartera-kpis.ts` — string NIT filter; switch to `nitNormalized`
- `lib/finance/reconciliation.ts` — NIT-based customer resolution
- `lib/connectors/adapters/sag-pya-soap/normalizers/` — source of CustomerProfile linking on import
- New file: `lib/customers/resolve.ts` — `resolveCustomerByNit(orgId, rawNit): Promise<CustomerProfile | null>`
- New file: `lib/customers/normalize-nit.ts` — `normalizeNit(raw: string): string` (strip dots, dashes, spaces)

**Exact non-goals:**
- Do NOT rename or remove `nit` or `sagTerceroId` fields from Prisma schema
- Do NOT create a Prisma migration in this sprint
- Do NOT touch UI or page components
- Do NOT modify the SAG adapter's inbound sync logic
- Do NOT change `SaleRecord.customerNit` (addressed in a later sprint)

**Validation steps:**
1. `resolveCustomerByNit("castillitos-org-id", "901.383.501")` returns the same CustomerProfile as `("castillitos-org-id", "901383501")`
2. Run `scripts/_validate-cartera.ts` before and after — total cartera exposure must not decrease
3. Run `scripts/_probe-sag-invoice-associated-docs.ts` — CONCILIADA count must not decrease
4. TypeScript compiles clean (`tsc --noEmit`) with zero new errors

**Rollback considerations:**
All changes are additive (new utility + updated query strings). Rollback = revert the service files to the pre-sprint string filter. No schema migration means no Prisma rollback needed. Low risk.

---

### Sprint S2 — Payment Model Contract Definition

**Title:** Define authoritative payment model boundary; implement unified payment aggregation service

**Objective:**
Define a clear, enforced contract between `CollectionRecord` (SAG-sourced) and `PaymentRecord` (manually entered). Build a `PaymentAggregatorService` that returns total cobros per customer without double-counting. Do not deprecate either model — establish the deduplication logic only.

**Files likely affected:**
- New file: `lib/finance/payment-aggregator.ts` — `getCustomerPayments(orgId, customerId)` returning unified timeline
- `lib/finance/reconciliation.ts` — consume aggregator instead of querying both models independently
- `lib/finance/cobros-breakdown.ts` — add deduplication check via `CollectionRecord.paymentRecordId`
- `lib/collections/queue.ts` — surface "SAG + manual" merged cobros per customer
- No Prisma schema changes (bridge field `paymentRecordId` already exists)

**Exact non-goals:**
- Do NOT delete `PaymentRecord` or `CollectionRecord`
- Do NOT add new Prisma models
- Do NOT build a UI for payment history in this sprint
- Do NOT touch the auto-reconcile engine (blocked on SAG data — separate track)
- Do NOT modify the SAG adapter sync logic

**Validation steps:**
1. For a known customer with both model types populated: `getCustomerPayments()` returns the same total as a manual audit of both tables
2. `scripts/_validate-cobros-breakdown.ts` shows no change in aggregate totals (same money, deduped)
3. TypeScript compiles clean — zero new errors

**Rollback considerations:**
New service is additive. If it produces wrong totals, revert the callers to their original direct queries. No schema migration. Medium risk (logic complexity in deduplication).

---

### Sprint S3 — sagSourceType Filter Hardening

**Title:** Enforce uniform `sagSourceType` filter across all revenue-grade queries

**Objective:**
Every service that aggregates `SaleRecord` for financial purposes must explicitly filter `sagSourceType = OFICIAL`. Every service that needs demand/operational view must explicitly filter `sagSourceType = REMISION`. No query should aggregate both without intentional documentation.

**Files likely affected:**
- `lib/finance/fpa-queries.ts` — add `sagSourceType: "OFICIAL"` to all revenue aggregation queries
- `lib/commercial-ledger/service.ts` — audit and add filter
- `lib/sales/reports.ts` — verify existing filter; document intent
- `lib/sales/data-explorer.ts` — audit; add filter where missing
- New constant: `lib/sales/source-rules.ts` — export `REVENUE_SOURCE_FILTER` and `DEMAND_SOURCE_FILTER` as typed Prisma where clause fragments

**Exact non-goals:**
- Do NOT remove sagSourceType from the schema
- Do NOT change how the SAG adapter sets sagSourceType on import
- Do NOT touch F2 toggle UI (`components/executive/f2-toggle.tsx`)
- Do NOT touch `SourceMatchRecord` or conversion KPI logic

**Validation steps:**
1. Revenue totals in `/finance` before and after sprint differ by exactly the remision volume (expected, correct)
2. Executive dashboard "Ventas del día" card shows only OFICIAL revenue (or documents if it intentionally shows both)
3. `scripts/_probe-sag-movements.ts` output unchanged — operational data not affected
4. TypeScript compiles clean

**Rollback considerations:**
Pure query filter additions. Rollback = remove the filter clause. Risk: temporarily correct data becomes temporarily inflated again (same as pre-sprint state). Acceptable.

---

### Sprint S4 — Navigation Continuity: Core Cross-Module Links

**Title:** Wire the six highest-priority cross-module navigation links

**Objective:**
Add `<Link>` or `href` props to the six most critical dead-end navigation points identified in the audit. No new pages. No new data fetching. Only add links using data already present on the page.

**Target links (in priority order):**
1. Customer 360 card → open cartera list (`/[orgSlug]/finance/cartera?customer={slug}`)
2. Collections queue item → Customer 360 profile (`/[orgSlug]/customer-360?slug={slug}`)
3. Cartera invoice row → customer detail (`/[orgSlug]/customer-360?slug={slug}`)
4. `/alerts/[alertId]` → affected entity deep link (use `metadataJson.customerId` if present)
5. Sales alert (BusinessAlert) in Centro de Decisiones → Customer 360
6. `/sales/customers/[slug]` → open cartera for that customer

**Files likely affected:**
- `app/(app)/[orgSlug]/customer-360/customer-client.tsx`
- `app/(app)/[orgSlug]/collections/page.tsx`
- `app/(app)/[orgSlug]/alerts/page.tsx` — BusinessAlert rows
- `app/(app)/[orgSlug]/alerts/[alertId]/page.tsx`
- `app/(app)/[orgSlug]/sales/page.tsx` — customer table rows (if present)

**Exact non-goals:**
- Do NOT build a cartera detail page in this sprint
- Do NOT add new API routes
- Do NOT add new data fetching to existing pages
- Do NOT redesign any page layout
- Do NOT wire Marketing → Product links (addressed in Sprint S5)

**Validation steps:**
1. From Customer 360, clicking the cartera link opens the correct filtered cartera view
2. From Collections queue, clicking a customer name reaches their Customer 360 profile
3. All added links resolve to valid routes (no 404s)
4. TypeScript compiles clean

**Rollback considerations:**
Pure `<Link href={...}>` additions. Rollback = remove the Link wrapper. Zero risk to data.

---

### Sprint S5 — Module Guard Audit for Secondary Routes

**Title:** Verify and enforce module access guards on all routes outside the primary sidebar

**Objective:**
Confirm that `resolveModuleForPath()` correctly maps and protects the secondary routes: `/finanzas/facturas`, `/comercial/ventas`, `/control-center/cobranza`, and the workspace-scoped `/[workspaceSlug]/dashboard`. Add explicit route entries where missing. Do not change business logic.

**Files likely affected:**
- `lib/auth/module-access.ts` — `resolveModuleForPath()` route table; add missing entries
- `lib/tenant/modules.ts` — verify module key definitions for affected routes
- `app/(app)/[orgSlug]/layout.tsx` — confirm guard invocation covers all nested routes
- Optionally: `app/(app)/[orgSlug]/finanzas/facturas/page.tsx` — add server-side module check if missing

**Exact non-goals:**
- Do NOT change role hierarchy
- Do NOT redesign the sidebar
- Do NOT modify the executive page
- Do NOT add or remove module keys

**Validation steps:**
1. A VIEWER-role user cannot access `/finanzas/facturas` via direct URL — receives redirect or 403
2. An OPERATOR-role user can access `/control-center/cobranza` as expected
3. `resolveModuleForPath("/finanzas/facturas")` returns `"finance"` (or the correct module key)
4. TypeScript compiles clean

**Rollback considerations:**
Additive route table entries only. If a guard incorrectly blocks a valid user, remove the entry. No schema or data changes.

---

## C. FIRST SPRINT RECOMMENDATION

**Recommended first sprint: S1 — Customer Identity Stabilization**

**Rationale:**

S1 is the root dependency for everything else. Every other problem in the roadmap — double-counted payments (S2), wrong revenue totals (S3), broken Customer 360 links (S4) — is amplified or caused by identity fragmentation. Fixing NIT resolution first means all subsequent work operates on correct data.

S1 is also the safest sprint:
- It requires no Prisma migration
- It is purely additive (new utility + updated query strings)
- It has clear, script-executable validation steps that produce before/after numbers
- Rollback is a simple revert with no side effects

S1 unblocks:
- Auto-reconciliation (currently blocked on SAG data, but NIT resolution must be correct before it runs)
- Customer 360 accuracy (scores, LTV, cartera totals)
- Collections queue reliability
- Payment aggregation (S2 depends on customer identity being stable)

Do not run S2 before S1. Running the payment deduplication on wrong customer attribution data will produce wrong unified totals.

---

## D. DEPENDENCY MAP

> Read as: "X cannot safely be built until Y is done."

### Auto-Reconciliation (engine already built, blocked on SAG data)
```
Requires:
  [S1] Customer identity stable      — so payments match to correct customers
  [S2] Payment model contract        — so CollectionRecord vs PaymentRecord is unambiguous
  [External] SAG Documento_pagado    — so invoice-payment associations come from SAG
  [Blocked] Until SAG team delivers the view with invoice associations
```

### Marketing Studio — Product Publication Flow (Sprint 5)
```
Requires:
  [S1] Customer identity stable      — so the session can be attributed to a customer
  [Future] ProductCatalog model      — so StudioSession.productSku has an FK target
  [Future] ProductCatalog migration  — new Prisma model + migration
  [Future] GeneratedAsset → Product  — link approved asset to catalog entry
  Note: ProductCatalog model creation is NOT in the current 5-sprint plan.
        It must be explicitly approved as a new entity before a sprint can begin.
```

### Shopify Sync (meaningful product sync)
```
Requires:
  [Future] ProductCatalog model      — canonical anchor for sync deduplication
  [Current] ConnectorMapping         — already exists, but targets ProductSnapshot (legacy)
  Note: Shopify sync runs today but against a legacy ProductSnapshot model.
        Meaningful sync requires ProductCatalog first.
```

### AI Copilot Orchestration (product + customer intelligence)
```
Requires:
  [S1] Customer identity stable      — so Copilot answers about a customer are correct
  [S3] sagSourceType hardening       — so revenue answers are accurate
  [Future] ProductCatalog model      — so Copilot can answer product-level questions
  [Future] KnowledgeItem seeding     — so Copilot has tenant-specific context
  Note: Copilot module key exists in sidebar but has no page route yet.
        Do not build the route until data layer is stable (S1–S3 at minimum).
```

### Navigation Continuity (full cross-module linking)
```
Requires:
  [S1] Customer identity stable      — so links resolve to correct customer slugs
  [S4] Core cross-module links       — first wave of link wiring
  [Future] Cartera detail page       — currently no page at /finance/cartera/{id}
  [Future] Product detail page       — no page; blocked on ProductCatalog
  Note: S4 only adds links where the target page already exists.
        Deeper navigation requires new pages, which require separate approval.
```

---

## E. RULES FOR CLAUDE GOING FORWARD

These are standing guardrails. They apply to all future work in this codebase unless explicitly overridden by the user for a specific task.

---

### RULE-01: No global refactors without explicit approval
**Rule:** Do not refactor a file, rename a function, or reorganize a module unless the user explicitly requests it for that specific file/function.

**Rationale:** This codebase has pre-existing TypeScript errors and multiple entangled services. A rename cascade or import reorganization can silently break unrelated modules. The audit is not an invitation to clean up; it is a diagnostic.

**Application:** If a fix requires touching more than 3 files, surface the scope to the user before proceeding.

---

### RULE-02: No new Prisma models without a source-of-truth decision
**Rule:** Before creating any new Prisma model (e.g., `ProductCatalog`, `UnifiedAlert`), the user must explicitly confirm:
1. What this model replaces or supersedes
2. Which existing models become secondary or deprecated
3. Whether a migration is acceptable in the current sprint

**Rationale:** The audit identified multiple duplicate entities (two payment models, two alert models, no product catalog). Adding a third layer without deprecating the old ones makes the problem worse.

**Application:** If a feature requires a new model, stop and ask. Do not create the model and then ask.

---

### RULE-03: No new UI screen without a defined next-action path
**Rule:** Before building any new page or route, confirm:
1. Where the user arrives from (what links to this page)
2. What the user can do from this page (what links leave it)
3. What data the page reads and from which service

**Rationale:** The audit found 6+ dead-end pages. Every new page that does not link to related entities adds to the navigation continuity debt.

**Application:** If the next-action path is not defined in the task spec, ask before building the page.

---

### RULE-04: No module-specific duplicate data models
**Rule:** If a new feature needs to store data that could belong to an existing model, extend the existing model rather than creating a new one. Do not create `MarketingCustomer`, `AlertsCustomer`, or any module-namespaced version of a core entity.

**Rationale:** The existing NIT fragmentation, dual payment models, and dual alert models are the result of this pattern. It must not repeat.

**Application:** If extension of an existing model is blocked by the current schema, surface the conflict. Do not silently create a parallel model.

---

### RULE-05: TypeScript must remain clean except known pre-existing errors
**Rule:** After any code change, `tsc --noEmit` must pass with zero new errors. The only acceptable pre-existing errors are the 7 Decimal type mismatches in `scripts/_validate-cartera.ts` documented in the audit session.

**Application:** If a change introduces a new TypeScript error, fix it before considering the task complete. Do not use `// @ts-ignore` or `as any` to suppress new errors without user approval.

---

### RULE-06: sagSourceType must be explicit in all new revenue queries
**Rule:** Any new `SaleRecord` aggregate query must explicitly declare its `sagSourceType` intent:
- Financial/revenue query: `sagSourceType: "OFICIAL"`
- Operational/demand query: `sagSourceType: "REMISION"`
- Intentionally mixed: add a comment explaining why

**Application:** Do not write `prisma.saleRecord.aggregate(...)` without a `sagSourceType` filter unless the caller explicitly confirms mixed intent.

---

### RULE-07: Customer joins must use nitNormalized (after S1 completes)
**Rule:** After Sprint S1 is complete and merged, all new queries that join customer data must use `nitNormalized` as the canonical lookup key, accessed through `resolveCustomerByNit()`. Direct string comparisons against `nit` or raw `customerNit` are not permitted in new code.

**Application:** This rule activates only after S1. Before S1, document the string comparison as a known risk but do not refactor it as part of an unrelated task.

---

### RULE-08: No marketing-commercial links before ProductCatalog is approved
**Rule:** Do not add any FK or join between `StudioSession` / `GeneratedAsset` and `SaleRecord` / `CustomerReceivable` using free-text string matching. Wait for the ProductCatalog model decision.

**Rationale:** Adding a string-based product link now would create a fourth instance of the NIT fragmentation anti-pattern, this time for products.

**Application:** Sprint 5 (product publication step) spec must include a ProductCatalog decision before implementation begins.

---

*End of roadmap. All sections derived from ARCHITECTURE_AUDIT.md. No application code was modified.*
