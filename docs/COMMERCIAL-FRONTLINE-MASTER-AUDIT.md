# Commercial Frontline Master Audit

**Sprint:** AGENTIK-COMMERCIAL-FRONTLINE-AUDIT-01
**Date:** 2026-08-06
**TSC Baseline:** 251
**Build:** exit 0

---

## FINAL VERDICT

### **B. SMALL_CORE_GAPS_THEN_SELLER_APP**

Three P0 gaps must close before Seller App implementation:

1. **Seller ↔ User identity mapping** (no SALES_REP role, no User→Seller FK)
2. **Customer purchase intelligence adapter** (top products, frequency — data exists, adapter missing)
3. **Order pricing authority** (unitPrice comes from ProductEntity.price, no price list awareness)

Estimated P0 scope: 2 focused sprints. Then Seller App.

---

## 1. VENDEDORES STATUS

| Capability | State | Authority | Desktop UI | Notes |
|---|---|---|---|---|
| Seller registry | READY | seller-directory.ts (CRM quotes) | vendedores-client.tsx | 8 sellers, slug-based identity |
| Seller identity | READY | sellerSlug from CRMQuote.sellerName | Yes | Deterministic slug generation |
| SAG seller identity | PARTIAL | sellerTerceroId on CustomerOrderRecord | No | 92% coverage 2026, not wired to directory |
| Agentik user identity | MISSING | No User→Seller FK | — | **P0 BLOCKER** |
| Active/inactive state | READY | 3-state: activo/atencion/inactivo (90d rule) | Yes | Activity from CRM quotes |
| Customers assigned | READY | client-seller-linker.ts (60% confidence threshold) | 360 drawer | Confidence-scored, no guessing |
| Sales metrics | READY | seller-metrics.ts (quotes + traceability) | vendedores page | Quote stages, amounts, customers |
| Performance KPIs | READY | seller-performance-service.ts | No (backend only) | SAG orders: value, units, top clients/subgrupos |
| Fulfillment KPIs | READY | seller-fulfillment-service.ts | No (backend only) | From AgentExecution metadata |
| Orders | READY | vendedor-360-loader.ts | 360 drawer | Last 50 SAG orders |
| Maleta link | READY | VendorCommercialBag.salesRepId | 360 drawer | Bag state + item counts |
| Maleta operational profile | READY | maletas-salesrep-profile.ts | No | Risk score, pressure, line analysis |
| Cartera per customer | READY | vendedor-360-loader.ts | 360 drawer | Aggregated receivables |
| Intelligence (risks/opps) | READY | vendedor-360-loader.ts (computed) | 360 drawer | 3 risk types, 2 opportunity types |
| Policy pack (15 phases) | READY | sales-rep-decision-engine.ts | No (backend only) | Evidence chain per decision |
| Alerts | READY | sales-rep-alerts.ts | No (backend only) | 7 alert types, dedup keys |
| Mobile contract | READY | sales-rep-read-models.ts | No | 6 capabilities, AVAILABLE/NOT_CONFIGURED/UNAVAILABLE |
| Recaudos | MISSING | "pendiente_pya" | 360 drawer (placeholder) | Not blocking Seller App V1 |
| Metas | MISSING | "pendiente_pya" | 360 drawer (placeholder) | Not blocking Seller App V1 |
| Comisiones | MISSING | "pendiente_pya" | 360 drawer (placeholder) | Not blocking Seller App V1 |

**Files:** 27 total (8 foundation + 16 sales-rep policy pack + 1 maletas + 2 UI)

---

## 2. CLIENTES STATUS

| Capability | State | Authority | Desktop UI | Notes |
|---|---|---|---|---|
| Customer identity | READY | canonical-customer-service.ts | clientes-client + 360 | sagTerceroId + crmId + nitNormalized |
| Customer branches | READY | getCustomerBranches() by NIT | 360 detail | Main branch auto-detected |
| Assigned seller | READY | 5-level resolution cascade | 360 detail | SAG→CRM→Branch→Profile→UNAVAILABLE |
| Channel | PARTIAL | SAG CANAL_CLIENTE field | 360 detail | Synced but not enriched |
| Sales history | READY | 360 loader via CustomerOrderRecord | 360 detail | SAG orders by NIT (50-row limit) |
| Last purchase | READY | CustomerProfile.lastPurchaseAt | 360 detail | From SAG FECHA_ULTIMA_COMPRA |
| Purchase frequency | MISSING | Type defined, no compute | — | SMALL_ADAPTER_REQUIRED |
| Sales value | PARTIAL | CRM quotes amount | 360 detail | SAG order value not aggregated per customer |
| Units purchased | MISSING | CustomerOrderLine exists | — | SMALL_ADAPTER_REQUIRED |
| Average ticket | MISSING | Data exists, no adapter | — | SMALL_ADAPTER_REQUIRED |
| Top products | MISSING | CustomerOrderLine exists | — | SMALL_ADAPTER_REQUIRED |
| Product purchase history | MISSING | CustomerOrderLine exists | — | SMALL_ADAPTER_REQUIRED |
| Orders | READY | 360 loader (SAG + CRM) | 360 detail | Last 50 SAG orders + CRM quotes |
| Open orders | PARTIAL | CRM quotes by stage | 360 detail | Unfactured CRM quotes detected |
| Receivables total | READY | CustomerProfile.totalReceivable | 360 detail | Denormalized, synced |
| Overdue receivables | READY | CustomerProfile.overdueReceivable | 360 detail | Denormalized, synced |
| Overdue days | READY | CustomerProfile.maxDpd | 360 detail | Max days past due |
| Credit profile | READY | customer-credit-profile.ts | 360 detail | Limit, terms, blocked status |
| SAG validation | READY | customer-sag-validation.ts | Order wizard | 3-level readiness |
| Opportunities | READY | 360 loader computeOpportunities() | 360 detail | 5 rules: inactivity, overdue, unfactured, no seller, SAG-no-CRM |
| Search | READY | searchCustomers() | clientes list | Name, NIT, erpId, email, phone, city |
| SAG sync | READY | sag-customer-master-sync.ts | Admin endpoint | Batch upsert by sagTerceroId |

**Files:** 19 total (9 clientes + 9 data-layer + 4 UI)

---

## 3. PEDIDOS STATUS

| Capability | State | Authority | Desktop UI | Notes |
|---|---|---|---|---|
| Create draft | READY | order-service.ts createOrderDraft() | Wizard | Consecutivo numbering |
| Seller selection | READY | seller-resolution-service.ts | Wizard | 5-level cascade |
| Customer selection | READY | canonical-customer-service.ts searchCustomers() | Wizard | Full-text search |
| Branch selection | READY | order-decision-engine.ts evaluateCustomerBranch() | Wizard | auto_single / requires_selection |
| Product search | READY | order-product-search.ts | Wizard | ProductEntity + Variants + CRM quotes |
| Variants (size/color) | READY | variant-enrichment-service.ts | Wizard | Real ProductVariant data |
| Price | PARTIAL | ProductEntity.price (fallback) | Wizard | **No price list awareness — see Section 8** |
| Quantity | READY | OrderLine.quantity | Wizard | — |
| Availability | READY | order-product-search.ts + PIL | Wizard | Per-variant warehouse breakdown |
| Discount | READY | order-decision-engine.ts evaluateDiscountOverride() | Wizard | Override with reason tracking |
| Validation | READY | order-validation.ts | Wizard | Header + lines + totals |
| Save draft | READY | order-service.ts updateOrder() | Wizard | AgentExecution persistence |
| Submit | READY | order-service.ts submitOrder() | Wizard | Status → listo_para_enviar |
| SAG write | READY | order-sag-bridge.ts sendOrderToSagQueue() | Wizard | Idempotent, queue-based, SIMULATION mode |
| SAG sync status | READY | order-post-sync.ts | Pedidos list | sincronizado / conflicto / pendiente_sag |
| SAG retry | READY | Idempotency allows retry on failure | Pedidos list | Payload change detection |
| SAG read/import | PARTIAL | sag-order-import-service.ts | — | Engine ready, fetchPendingSagOrders() returns [] |
| Invoice linking | PARTIAL | sag-invoice-sync-service.ts | — | Normalization ready, no SAG connection |
| Order lines | READY | OrderLine with variant detail | Wizard + list | Size, color, qty, unitPrice, thumbnailUrl |
| Timeline | READY | order-timeline.ts (16+ event types) | — | Immutable append-only audit trail |
| Versioning | READY | order-versioning.ts | — | Snapshots with diff tracking |
| Deduplication | READY | order-dedup-engine.ts (4 strategies) | — | Score threshold=70 |
| Fulfillment eval | READY | order-fulfillment.ts | Wizard (David) | ready/partial/blocked grades |
| Operational signals | READY | order-operational-signals.ts | — | 7 target modules |
| PDF/QR/Share | READY | order-share.ts + pdf + qr | Pedidos list | WhatsApp ready |
| Reservations | READY | order-reservation-adapter.ts | — | FULL vs PARTIAL scope |
| Decision engine | READY | order-decision-engine.ts (6 policies) | Wizard | Branch, credit, size dist, partial delivery, discount, readiness |
| Commercial memory | READY | commercial-memory-builder.ts | — | Decision context for learning |

**Files:** 60+ total across lib/comercial/pedidos + UI

---

## 4. CROSS-DOMAIN IDENTITY MATRIX

| Entity | PK | External IDs | Stability |
|---|---|---|---|
| **User** | cuid | email | STABLE |
| **Membership** | orgId+userId | — | STABLE |
| **CustomerProfile** | cuid | erpId, crmId, sagTerceroId, nitNormalized, slug | STABLE |
| **CustomerOrderRecord** | cuid | erpMovId (unique SAG PK) | STABLE |
| **CustomerOrderLine** | cuid | erpItemId, articleId | STABLE |
| **CustomerReceivable** | cuid | erpId, customerNit | STABLE (customerId nullable, reconciled post-sync) |
| **CollectionRecord** | cuid | naturalKey (hash) | STABLE (customerId nullable) |
| **CRMQuote** | cuid | crmId (V8 UUID) | STABLE |
| **CRMQuoteLine** | cuid | crmId, productCrmId | STABLE |
| **SaleRecord** | cuid | — | STABLE (sellerSlug denormalized) |
| **ProductEntity** | cuid | externalId (SAG code) | STABLE |
| **ProductVariant** | cuid | — | STABLE (FK to ProductEntity) |
| **VendorCommercialBag** | cuid | — | STABLE (salesRepId = opaque string) |
| **VendorBagItem** | cuid | reference (SAG sku) | STABLE |

### Relationship Stability

| Relationship | Join | Status |
|---|---|---|
| Seller → Customers | sellerSlug on CustomerProfile | STABLE (confidence-scored) |
| Customer → Orders | customerNit ↔ nitNormalized | STABLE (95% coverage) |
| Customer → Receivables | customerId FK (nullable) + customerNit | STABLE (reconciled) |
| Customer → CRM Quotes | crmId ↔ billing_account_id in rawCrmJson | STABLE |
| Order → Seller | sellerTerceroId (SAG FK) | STABLE (92% 2026) |
| Order → Products | articleId + referenceCode | STABLE |
| Seller → Maleta | VendorCommercialBag.salesRepId | STABLE (string, no FK) |
| **User → Seller** | **NONE** | **BROKEN — P0 BLOCKER** |

---

## 5. SELLER ↔ AGENTIK USER IDENTITY (Section 22)

**Current state: NO DETERMINISTIC MAPPING EXISTS.**

- No SALES_REP role in Role enum (only SUPER_ADMIN, AGENTIK_ADMIN, ORG_ADMIN, MANAGER, OPERATOR, VIEWER, BILLING)
- No sellerSlug/sellerId field on Membership or User
- No join table mapping User → CommercialSeller
- Sellers are derived entities from CRM quote aggregation — no Prisma model

**Required for Seller App:**
1. Add `sellerSlug` field to Membership (maps User to seller within org)
2. Either add SALES_REP to Role enum, or scope OPERATOR with sellerSlug
3. Server-side: `resolveCurrentSeller(session)` → sellerSlug from Membership
4. Client-side: session.user.sellerSlug available after login

**Classification: P0 SELLER APP BLOCKER**

---

## 6. CUSTOMER PURCHASE INTELLIGENCE (Section 5)

| Question | Data Source | Adapter | Status |
|---|---|---|---|
| "¿Qué compra más este cliente?" | CustomerOrderLine (articleId, referenceCode, quantity) | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Qué productos compra con más frecuencia?" | CustomerOrderLine grouped by referenceCode | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Cuándo compró esta referencia por última vez?" | CustomerOrderLine.orderId → order.orderDate | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Qué dejó de comprar?" | Diff: historical refs − last 90d refs | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Cuánto ha comprado en 30/90/365 días?" | CustomerOrderRecord (totalValue + orderDate) | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Productos más comprados por unidades?" | CustomerOrderLine grouped by referenceCode, sum(quantity) | MISSING | SMALL_ADAPTER_REQUIRED |
| "¿Productos más comprados por valor?" | CustomerOrderLine (quantity × unitValue) | MISSING | SMALL_ADAPTER_REQUIRED |

**All data exists in Prisma** (CustomerOrderRecord + CustomerOrderLine have NIT, referenceCode, quantity, unitValue, orderDate). Only a service adapter is needed — no new sync, no new models.

---

## 7. CARTERA / CREDIT RISK AUTHORITY (Section 6)

| Fact | Source | Status |
|---|---|---|
| Total receivable | CustomerProfile.totalReceivable (denormalized from CustomerReceivable) | READY |
| Overdue amount | CustomerProfile.overdueReceivable | READY |
| Max days overdue | CustomerProfile.maxDpd | READY |
| Document-level invoices | CustomerReceivable (invoiceNumber, originalAmount, balanceDue, dueDate, daysOverdue) | READY |
| Currency | COP (implicit — all receivables in COP) | READY |
| Freshness | CustomerReceivable synced from SAG | READY |
| Customer identity join | customerId FK (nullable, reconciled) + customerNit | STABLE |

**Overdue-while-ordering policy:** `evaluateCustomerReceivablesAlert()` in sales-rep-decision-engine.ts already exists:
- Threshold: > 30 days past due
- Returns severity (warning/critical) + allowOrder + requireAcknowledgement
- Config: CASTILLITOS_OVERDUE_RECEIVABLE in policy pack

**Classification: READY** — data and business rule both exist. Wiring to order wizard = small integration.

---

## 8. ORDER PRICING AUTHORITY (Section 8)

**Current state:**
- OrderLine.unitPrice populated from `ProductEntity.price` (Prisma field, synced from SAG)
- CRMQuoteLine.unitPrice used when product resolved from CRM quote source
- **No price list awareness** — no PV3 (detal) / PV4 (mayorista) distinction in order context
- **No customer-specific pricing** — CustomerProfile has `priceListName` from SAG but it's not wired to product price resolution
- **No IVA calculation** in order pipeline
- **Discount override** tracked with reason (evaluateDiscountOverride) but no automatic discount rules

**SAG price sources that exist but are NOT used in orders:**
- SAG SOAP v_articulos: nd_precio3 (PV3/detal), nd_precio4 (PV4/mayorista) — used in import-service.ts only
- ProductEntity.price — Prisma field, likely PV3 or catalog price

**Classification: PARTIAL — BUSINESS_DECISION_REQUIRED**
- V1 Seller App can work with ProductEntity.price as base price (current behavior)
- Proper wholesale pricing (PV4) requires: resolve customer.priceListName → select PV3 or PV4 → apply
- This is a business policy, not a technical blocker

---

## 9. ORDER INVENTORY / AVAILABILITY (Section 9)

| Source | Service | Status |
|---|---|---|
| Warehouse stock | ProductInventoryLevel via order-product-search.ts | READY |
| Per-variant availability | getVariantAvailability() | READY |
| Commercial stock state | getCommercialStockState() with line minimums | READY |
| Reservation system | order-reservation-adapter.ts | READY |
| Stock thresholds | CASTILLITOS_STOCK_THRESHOLDS (LT=30, CS=20) | READY |

**Wholesale orders use central warehouse inventory** (same as Maletas). No separate wholesale warehouse logic needed.

**Classification: READY**

---

## 10. SELLER APP EXISTING STATE (Section 13)

**Classification: NOT_IMPLEMENTED**

No mobile seller UI, PWA, order-capture surface, seller portal, or responsive order flow exists. However:
- `buildMobileContract()` in sales-rep-read-models.ts defines 6 mobile capabilities
- The wholesale order wizard is already responsive (COMERCIAL-PEDIDOS-PRODUCTOS-MOBILE-03)
- All domain services are server-only with clean DTO contracts

---

## 11. DESKTOP UX AUDIT — CLIENTES (Section 11)

| Fact | Present | Notes |
|---|---|---|
| Identity | YES | Name, NIT, slug, erpId, crmId, city, status |
| Seller | YES | Resolved with confidence |
| Sales (orders) | YES | SAG orders + CRM quotes |
| Cartera | YES | Total, overdue, maxDpd, document list |
| Orders | YES | SAG + CRM, with stage |
| Purchase behavior | PARTIAL | Last purchase date only, no top products |
| Top products | MISSING | Data exists, adapter needed |
| Recent activity | YES | Last order, last quote, opportunities |

**P0 gaps:** Top products and purchase frequency missing from 360 view.

---

## 12. DESKTOP UX AUDIT — VENDEDORES (Section 12)

| Fact | Present | Notes |
|---|---|---|
| Identity | YES | Name, slug, activity status |
| Customer portfolio | YES | 360 drawer with client list |
| Sales/performance | PARTIAL | Quote metrics only, SAG performance backend-only |
| Orders | YES | 360 drawer, last 50 SAG orders |
| Maleta | YES | 360 drawer, bag state |
| Attention | PARTIAL | Intelligence computed, alerts backend-only |

**P0 gaps:** None blocking. Performance KPIs exist in backend but not surfaced in desktop — not a blocker for Seller App.

---

## 13. MOBILE/PWA DECISION (Section 23)

**Recommendation: Next.js mobile-first Seller App + PWA**

| Requirement | Needed for V1? |
|---|---|
| Camera | NO |
| Push notifications | NO (V2) |
| Offline | NO (see Section 24) |
| Background sync | NO |
| File upload | NO |
| Location | NO |

No native iOS/Android required.

---

## 14. OFFLINE VERDICT (Section 24)

**Classification: ONLINE_ONLY_OK_FOR_V1**

- No evidence of offline requirement in codebase
- OrderDraft persistence already handles interrupted sessions (saved to AgentExecution)
- Draft auto-save provides crash recovery without offline infrastructure
- Normal mobile connectivity in Castillitos urban market

---

## 15. COPILOT READINESS

### Clientes

| Tool | Status | Authority |
|---|---|---|
| getCustomer() | READY | canonical-customer-service.ts |
| getCustomerSales() | ADAPTER_REQUIRED | CustomerOrderRecord by NIT |
| getCustomerPurchaseHistory() | ADAPTER_REQUIRED | CustomerOrderLine by NIT |
| getCustomerTopProducts() | ADAPTER_REQUIRED | CustomerOrderLine aggregation |
| getCustomerReceivables() | READY | CustomerReceivable by customerId/NIT |
| getCustomerOrders() | READY | 360 loader |

### Vendedores

| Tool | Status | Authority |
|---|---|---|
| getSeller() | READY | seller-directory.ts |
| getSellerCustomers() | READY | client-seller-linker.ts |
| getSellerSales() | READY | seller-metrics.ts |
| getSellerOrders() | READY | vendedor-360-loader.ts |
| getSellerPortfolio() | READY | maletas-salesrep-profile.ts |
| getSellerAttention() | READY | sales-rep-alerts.ts |

### Pedidos

| Tool | Status | Authority |
|---|---|---|
| getOrder() | READY | order-service.ts |
| getOrders() | READY | order-service.ts |
| getOrderSyncStatus() | READY | order-post-sync.ts |
| getOrderCustomerContext() | READY | order-assistant-service.ts |
| prepareOrder() | READY | order-assistant-engine.ts |

---

## 16. DATA FRESHNESS MATRIX (Section 29)

| Fact | Source | Freshness | Refresh | Limitation |
|---|---|---|---|---|
| Customer profile | SAG vw_agentik_clientes | On-demand sync | Admin trigger | Manual refresh |
| Seller directory | CRM quotes | Request-time aggregation | Real-time | CRM sync lag |
| Sales (orders) | SAG MOVIMIENTOS | SAG sync cycle | Nightly (typical) | ~24h lag |
| Top products | CustomerOrderLine | SAG sync cycle | — | Not yet computed |
| Receivables | SAG cartera sync | On-demand | Admin trigger | Manual refresh |
| Inventory | ProductInventoryLevel | SAG sync cycle | Near real-time | Minutes lag |
| Price | ProductEntity.price | SAG sync | Near real-time | Single price (no list) |
| Order status | AgentExecution | Real-time (Agentik) | Instant | — |
| Order SAG sync | SagWriteOperation | Async (queue) | Seconds-minutes | Queue delay |
| Maleta alerts | vendor-sample-loader | Request-time | Real-time | SAG SOAP availability |

---

## 17. TEST / CODE BASELINE (Section 30)

| Metric | Value |
|---|---|
| TSC errors | 251 (pre-existing baseline) |
| Build | exit 0 |
| Vendedores files | 27 |
| Clientes files | 19 |
| Pedidos files | 60+ |
| Identity/auth files | 9 |
| Existing test suites | order-reservation (unit+integration), order-sag-write, order-kpi, wizard-improvements, sag-historical-read, order-operations |

---

## 31. DELIVERY MATRIX

| Capability | Current | Authority | Desktop? | App? | Alert? | Copilot? | Priority | Gap |
|---|---|---|---|---|---|---|---|---|
| Seller identity | READY | seller-directory.ts | YES | NO | — | READY | — | — |
| User→Seller map | MISSING | — | — | BLOCKED | BLOCKED | — | **P0** | Add sellerSlug to Membership |
| Customer identity | READY | canonical-customer-service.ts | YES | YES (reuse) | — | READY | — | — |
| Customer search | READY | searchCustomers() | YES | YES (reuse) | — | READY | — | — |
| Customer 360 | READY | cliente-360-loader.ts | YES | YES (reuse) | — | READY | — | — |
| Customer top products | MISSING | CustomerOrderLine exists | NO | NEEDED | — | ADAPTER | **P0** | Build adapter |
| Customer purchase freq | MISSING | CustomerOrderLine exists | NO | NEEDED | — | ADAPTER | **P0** | Build adapter |
| Customer cartera | READY | CustomerReceivable | YES | YES (reuse) | READY | READY | — | — |
| Overdue alert | READY | evaluateCustomerReceivablesAlert() | — | YES | READY | READY | — | Wire to order flow |
| Order creation | READY | order-service.ts + wizard | YES | ADAPT | — | READY | — | Mobile adaptation |
| Order pricing | PARTIAL | ProductEntity.price | YES | PARTIAL | — | — | P1 | Price list awareness |
| Order availability | READY | order-product-search.ts | YES | YES (reuse) | — | READY | — | — |
| Order SAG write | READY | order-sag-bridge.ts | YES | YES (reuse) | — | — | — | — |
| Order sync status | READY | order-post-sync.ts | YES | YES (reuse) | READY | READY | — | — |
| Maleta alerts | READY | portfolio-copilot-domain-tools.ts | — | YES | READY | READY | — | — |
| Seller performance | READY | seller-performance-service.ts | NO | YES | — | READY | — | — |
| Seller daily state | READY | sales-rep-decision-engine.ts | NO | YES | READY | READY | — | — |

---

## 32. P0 SCOPE FREEZE

### P0 BEFORE SELLER APP (2 sprints)

**Sprint P0-A: Seller Identity + Customer Intelligence**
1. Add `sellerSlug` field to Membership model in Prisma
2. Add SALES_REP to Role enum (or use OPERATOR + sellerSlug scope)
3. Create `resolveCurrentSeller(session, orgId)` in lib/auth/
4. Build `getCustomerPurchaseIntelligence(orgId, customerId)` adapter in lib/comercial/clientes/:
   - topProductsByUnits (CustomerOrderLine grouped by referenceCode, sum quantity)
   - topProductsByValue (CustomerOrderLine grouped by referenceCode, sum qty*unitValue)
   - purchaseFrequency (count orders / months active)
   - lastPurchaseByReference (max orderDate per referenceCode)
   - salesByPeriod (30d / 90d / 365d aggregations)
   - stoppedBuying (refs in history but not in last 90d)

**Sprint P0-B: Frontline Attention Contract + API Routes**
1. Define `FrontlineAttentionItem` type (Section 20)
2. Wire existing alert sources: Maletas (portfolio-copilot-domain-tools), Cartera (evaluateCustomerReceivablesAlert), Pedidos (order-operational-signals)
3. Create API routes:
   - GET /api/orgs/{orgSlug}/comercial/vendedores/{sellerSlug}/360
   - GET /api/orgs/{orgSlug}/comercial/vendedores/{sellerSlug}/attention
   - GET /api/orgs/{orgSlug}/comercial/clientes/{clienteId}/purchase-intelligence

### P0 SELLER APP (6 slices)

See Section 34.

### P1 AFTER DELIVERY

- Order pricing: wire customer.priceListName → PV3/PV4 selection
- SAG order import: connect fetchPendingSagOrders() to real SAG data
- Invoice linking: connect sag-invoice-sync-service to real SAG
- Recaudos/Metas/Comisiones: PYA integration for vendedor 360
- CRM Quote → SAG Order matching (id_sag_c)

### TECH DEBT

- Seller identity derived from CRM (no Prisma model) — acceptable for V1
- CRMQuote.customerId nullable (workaround via billing_account_id in rawCrmJson) — stable
- CustomerReceivable.customerId nullable (reconciled post-sync) — stable
- Order pricing = ProductEntity.price only (no price list) — acceptable for V1

---

## 33. IMPLEMENTATION PATH

### **PATH B — CLOSE SMALL CORE GAPS THEN SELLER APP**

**Phase 1:** P0-A sprint (seller identity + purchase intelligence adapter)
**Phase 2:** P0-B sprint (frontline attention contract + API routes)
**Phase 3:** Seller App implementation (6 slices)

---

## 34. SELLER APP IMPLEMENTATION PLAN

### SLICE 1: Seller Identity + App Shell
**Dependencies:** P0-A complete
**Reuse:** lib/auth/, Membership model, workspace-shell-client.tsx (patterns)
**New:**
- `app/(seller)/[orgSlug]/` — mobile-first layout (390px first)
- Bottom navigation: Inicio / Clientes / Pedido / Maleta / Alertas
- `resolveCurrentSeller()` → session.sellerSlug → scoped data
**Data:** seller-directory.ts, sales-rep-read-models.ts
**Tests:** Seller login → correct seller context, unauthorized access blocked
**Gate:** Seller logs in and sees their identity + basic stats

### SLICE 2: Customers Mobile + Commercial Context
**Dependencies:** Slice 1, P0-A purchase intelligence adapter
**Reuse:** canonical-customer-service.ts searchCustomers(), getCustomer(), cliente-360-loader.ts
**New:**
- Customer list (mobile cards, search, scoped to seller's customers)
- Customer detail: identity + cartera + top products + last purchase + purchase frequency
- "Crear Pedido" CTA from customer context
**Data:** client-seller-linker.ts (seller's customers), purchase intelligence adapter
**Tests:** Customer scoped to seller, cartera display, top products rendering
**Gate:** Seller sees their customers with commercial context

### SLICE 3: Order Capture Workflow
**Dependencies:** Slice 2
**Reuse:** order-service.ts, order-product-search.ts, order-validation.ts, order-fulfillment.ts, order-decision-engine.ts, order-sag-bridge.ts, order-reservation-adapter.ts
**New:**
- Mobile order wizard (adapted from wholesale-order-wizard.tsx patterns)
- Steps: customer context → overdue check → product search → variants → quantities → review → submit
- evaluateCustomerReceivablesAlert() wired to pre-order gate
**Data:** order-product-search.ts, evaluateCustomerCredit(), CASTILLITOS_STOCK_THRESHOLDS
**Tests:** Order creation, credit check, inventory check, SAG submission
**Gate:** Seller creates order → SAG sync succeeds

### SLICE 4: Maleta Mobile + Alerts
**Dependencies:** Slice 1
**Reuse:** portfolio-copilot-domain-tools.ts (getSalesPortfolioReferences, getSalesPortfolioWithdrawalItems, emitPortfolioAttentionSignals)
**New:**
- Maleta view: current samples with health badges
- Withdrawal list with reasons
- Supply alerts: "Tu maleta requiere nuevas muestras"
**Data:** vendor-sample-loader.ts, portfolio-copilot-domain-tools.ts
**Tests:** Correct portfolio for seller, withdrawal items display, alert rendering
**Gate:** Seller sees their maleta + pending withdrawals

### SLICE 5: Unified Attention + Cartera/Order Alerts
**Dependencies:** Slices 1-4, P0-B
**Reuse:** sales-rep-alerts.ts, evaluateCustomerReceivablesAlert(), order-operational-signals.ts, emitPortfolioAttentionSignals()
**New:**
- FrontlineAttentionItem universal type
- Unified attention feed combining: Maleta alerts + Cartera alerts + Order sync status
- Alert cards with severity, evidence, deep-link to destination
**Data:** FrontlineAttentionItem aggregator
**Tests:** Alert deduplication, severity ordering, deep-link navigation
**Gate:** Seller sees all pending attention items in one feed

### SLICE 6: Orders Status/Sync + PWA
**Dependencies:** Slice 3
**Reuse:** order-service.ts listOrders(), order-post-sync.ts, order-timeline.ts
**New:**
- My orders list (seller-scoped)
- Order status badges (borrador / pendiente_sag / sincronizado / conflicto)
- Retry for conflicto orders
- PWA manifest + service worker (installable, no offline)
- 390px certification
**Data:** order-service.ts getOrderStats()
**Tests:** Order list scoped to seller, status display, PWA installability
**Gate:** Seller manages orders + app installable on phone

---

## 35. FINAL REPORT

| # | Area | Status |
|---|---|---|
| 1 | Vendedores | READY (27 files, 15-phase policy pack, 360 loader, alerts) |
| 2 | Clientes | READY (19 files, canonical service, 360, SAG sync, cartera) |
| 3 | Pedidos | READY (60+ files, full lifecycle, SAG write, reservations) |
| 4 | Identity integrity | STABLE (NIT + crmId + sagTerceroId chains) |
| 5 | Seller-user mapping | **MISSING — P0 BLOCKER** (no User→Seller FK) |
| 6 | Customer purchase intelligence | SMALL_ADAPTER_REQUIRED (data exists, no aggregation service) |
| 7 | Cartera authority | READY (denormalized + document-level) |
| 8 | Order pricing authority | PARTIAL (ProductEntity.price only, no price list) |
| 9 | Order availability authority | READY (variant-level + reservations) |
| 10 | Maleta alerts readiness | READY (6 signal types, portfolio-copilot-domain-tools.ts) |
| 11 | Cartera alerts readiness | READY (evaluateCustomerReceivablesAlert, >30d threshold) |
| 12 | Order alerts readiness | READY (order-operational-signals.ts, 7 targets) |
| 13 | Seller App existing state | NOT_IMPLEMENTED (backend contracts ready) |
| 14 | Mobile/PWA recommendation | Next.js mobile-first + PWA (no native needed) |
| 15 | Offline verdict | ONLINE_ONLY_OK_FOR_V1 (draft persistence sufficient) |
| 16 | Copilot readiness | Vendedores READY, Clientes ADAPTER_REQUIRED, Pedidos READY |
| 17 | P0 before app | 2 sprints: seller identity + purchase intelligence + attention contract |
| 18 | P0 app | 6 slices (identity→customers→orders→maleta→alerts→PWA) |
| 19 | P1 | Price lists, SAG import, invoice linking, PYA integration |
| 20 | Implementation slices | 6 slices defined (Section 34) |
| 21 | TSC/build | 251 errors (baseline), build exit 0 |

---

## FINAL VERDICT

### **B. SMALL_CORE_GAPS_THEN_SELLER_APP**

The commercial frontline domain is remarkably complete:
- 106+ server-side files across Vendedores, Clientes, and Pedidos
- Enterprise-grade order lifecycle with SAG write, reservations, idempotency
- 15-phase seller policy pack with evidence chain
- Full customer 360 with cartera and SAG validation

**Three P0 gaps prevent immediate Seller App:**
1. **Seller ↔ User identity** — no SALES_REP role or sellerSlug on Membership
2. **Customer purchase intelligence** — data exists in CustomerOrderLine, needs aggregation adapter
3. **Frontline attention contract** — existing alerts need unification into FrontlineAttentionItem

**Estimated timeline:** 2 P0 sprints → then 6 Seller App slices.

**No major data gaps. No architectural redesign needed. No new Prisma models beyond Membership.sellerSlug.**
