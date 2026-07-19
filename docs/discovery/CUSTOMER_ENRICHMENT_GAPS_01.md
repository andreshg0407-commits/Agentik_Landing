# CUSTOMER-ENRICHMENT-GAPS-01

## Knowledge Gaps Classification (P1 / P2 / P3)

**Sprint:** CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01
**Date:** 2026-07-13
**Core question:** What should Agentik know about a customer so an agent can answer any commercial question without relying on user memory?

---

## P1 -- Critical Gaps (Block Agent Reasoning)

An agent CANNOT answer basic commercial questions without these.

### GAP-P1-01: Sales Rep Assignment Not Mapped

**Impact:** Agent cannot answer "Who owns this customer?" or "Which rep should follow up?"
**Source available:** SAG TERCEROS fields `VENDEDOR` (name) and `NIT_VENDEDOR` (tax ID)
**Why missing:** `mapSagCustomer()` deliberately sets `salesRepName: undefined` with comment about VENDEDORES not being denormalized
**CRM fallback:** `assigned_user_id` on CRM Account (60% coverage)
**Fix complexity:** LOW — map the two SAG fields directly, no lookup table needed

### GAP-P1-02: Credit Terms Not Mapped

**Impact:** Agent cannot answer "Can this customer buy on credit?" or "What's their credit limit?"
**Source available:** SAG TERCEROS fields `CREDITO` (boolean), `DIAS_CREDITO` (integer), `ss_cupo_credito` (amount)
**Why missing:** Not included in `mapSagCustomer()` output
**DB model:** `creditTermDays` exists in CustomerProfile entity but has no SAG source wired
**Fix complexity:** LOW — map 3 fields, extend DB model for credit limit

### GAP-P1-03: Commercial Zone Not Mapped

**Impact:** Agent cannot answer "Which zone does this customer belong to?" or segment by territory
**Source available:** SAG TERCEROS field `ZONA` (code)
**Why missing:** Not in mapper, no zone lookup table in query-catalog
**Blocker:** Zone lookup table is `placeholder` status
**Fix complexity:** MEDIUM — need zone lookup table from SAG first

### GAP-P1-04: Customer Active Status Not Synced

**Impact:** Agent may recommend actions on inactive customers
**Source available:** SAG TERCEROS field `ACTIVO` (boolean)
**Why missing:** Not mapped to CustomerProfile admin status
**Risk:** Current admin status defaults — inactive SAG customers appear active in Agentik
**Fix complexity:** LOW — map ACTIVO to admin status derivation

### GAP-P1-05: Price List Assignment Not Mapped

**Impact:** Agent cannot answer "What prices does this customer get?" or validate quote pricing
**Source available:** SAG TERCEROS field `PRECIO_VENTA` (price list code)
**Why missing:** Not in mapper, price list lookup is `placeholder`
**Blocker:** LISTAS_PRECIOS lookup table is placeholder status
**Fix complexity:** MEDIUM — need price list lookup from SAG first

### GAP-P1-06: Purchase Behavior Not Computed

**Impact:** Agent cannot classify customers by activity (active/dormant/churned) or predict needs
**Source available:** MOVIMIENTOS transaction history (synced)
**Why missing:** No aggregation pipeline from sales documents to customer behavior
**Dependencies:** Sales domain must be queryable per customer
**Fix complexity:** HIGH — requires cross-domain aggregation service

### GAP-P1-07: CRM Quote Join Bug (customerId NULL)

**Impact:** Agent cannot access 285 CRM quotes via standard FK join
**Source:** `CRMQuote.customerId` is NULL on ALL 285 quotes
**Workaround:** Must use `rawCrmJson.raw.billing_account_id` -> `CustomerProfile.crmId`
**Fix complexity:** LOW — fix the CRM sync mapper to populate customerId from rawCrmJson

---

## P2 -- Important Gaps (Degrade Agent Quality)

Agent can function but gives incomplete or lower-confidence answers.

### GAP-P2-01: Geography Resolution Incomplete

**Impact:** Agent cannot reliably locate customers geographically
**Sources:**
- SAG `ka_ni_ciudad` / `ka_nl_departamento` — integer FKs with NO lookup table (documented as GAP-GEOGRAPHY-RECOVERY-01)
- SAG `ss_direccion` — raw address string, NOT mapped
- CRM `billing_address_*` with DANE codes — resolvable but only 60% coverage
**Fix complexity:** MEDIUM — CRM DANE enrichment feasible, SAG FK resolution blocked

### GAP-P2-02: Payment Method Resolution

**Impact:** Agent shows payment codes instead of human-readable names
**Source:** `Forma_Pago` code in v_pagosnew and TERCEROS
**Blocker:** `formasPago` lookup table is `placeholder` in query-catalog
**Fix complexity:** LOW once lookup table available

### GAP-P2-03: Customer Segment Always Null

**Impact:** Agent cannot segment customers (A/B/C, gold/silver/bronze)
**Source:** SAG `TIPO_CLIENTE` field available but not mapped
**Blocker:** `tiposCliente` lookup is `placeholder`
**Current behavior:** `segment` field in entity model always null
**Fix complexity:** LOW once lookup table available

### GAP-P2-04: Contact Enrichment Incomplete

**Impact:** Agent has basic phone/email but no contact person name, mobile, or secondary channels
**Missing fields:**
- `ss_contacto` (contact person name)
- `ss_celular` (mobile phone)
- `ss_telefono2` (secondary phone)
- `ss_direccion` (physical address)
**Fix complexity:** LOW — all fields available in SAG, just need mapping

### GAP-P2-05: Payment Behavior Not Computed

**Impact:** Agent cannot classify payment behavior (early/on-time/late/chronic-late)
**Source:** v_pagosnew dates vs CARTERA due dates
**Dependencies:** Both collections and receivables must be linked to same customer
**Fix complexity:** MEDIUM — requires temporal computation across two data sources

### GAP-P2-06: SAG Modification Date Not Mapped

**Impact:** Freshness evaluation relies on sync timestamp only, not actual data modification
**Source:** SAG `ss_fecha_modificacion` available in TERCEROS
**Current behavior:** `sourceModifiedAt` not populated -> freshness defaults to sync time
**Fix complexity:** LOW — add one field mapping

### GAP-P2-07: Trade Name / Commercial Name

**Impact:** Agent uses legal name only, users may know customer by trade name
**Source:** SAG `ss_nombre_comercial` available but not mapped
**Fix complexity:** LOW — add one field mapping

### GAP-P2-08: Tax Regime & Responsibilities

**Impact:** Agent cannot answer fiscal questions about customer
**Source:** SAG `ss_regimen`, `ss_responsabilidades` available but not mapped
**Fix complexity:** LOW — add two field mappings

### GAP-P2-09: Third-Party Type Resolution Incomplete

**Impact:** Agent cannot reliably distinguish customers from vendors from employees
**Source:** SAG `TIPO_TERCERO` field available, `sc_naturaleza` partially used
**Current behavior:** `customerType` always returns `"B2B"`, `thirdPartyType` not populated from SAG
**Fix complexity:** LOW — map TIPO_TERCERO field, may need tiposTercero lookup

### GAP-P2-10: Discount Percentage Not Mapped

**Impact:** Agent cannot answer "What discount does this customer get?"
**Source:** SAG `ss_descuento` available in TERCEROS
**Fix complexity:** LOW — add one field mapping, extend DB model

---

## P3 -- Nice-to-Have Gaps (Future Intelligence)

Not blocking current operations but would enable advanced agent capabilities.

### GAP-P3-01: CRM Engagement Metrics

**Impact:** Agent cannot assess relationship health or engagement level
**Source:** CRM Activities (calls, meetings, tasks) — exist but not synced to customer domain
**Fix complexity:** HIGH — requires CRM activity sync pipeline

### GAP-P3-02: Product Affinity

**Impact:** Agent cannot recommend products or predict needs
**Source:** MOVIMIENTOS line items per customer
**Computation:** Top N products by customer, category distribution, seasonal patterns
**Fix complexity:** HIGH — requires cross-domain analytics pipeline

### GAP-P3-03: Customer Lifetime Value (CLV)

**Impact:** Agent cannot prioritize customers by economic value
**Source:** MOVIMIENTOS totals + v_pagosnew amounts over time
**Computation:** Revenue, margin, payment reliability, tenure
**Fix complexity:** HIGH — requires multi-source aggregation + margin data

### GAP-P3-04: Branch / Subsidiary Structure

**Impact:** Agent treats each NIT as independent, no parent-child relationships
**Source:** SAG `ss_sucursal` field (NOT mapped), no explicit hierarchy in SAG
**Fix complexity:** MEDIUM — need branch code mapping + hierarchy inference rules

### GAP-P3-05: Delivery Route

**Impact:** Agent cannot optimize delivery or logistics
**Source:** SAG `ss_ruta` field (NOT mapped)
**Fix complexity:** LOW mapping, but logistics optimization is a separate capability

### GAP-P3-06: CIIU Economic Activity Code

**Impact:** Agent cannot classify customers by economic sector
**Source:** SAG `ss_codigo_ciiu` available
**Fix complexity:** LOW — add mapping, CIIU tables are public/standard

### GAP-P3-07: Returns / Devolutions Tracking

**Impact:** Agent cannot assess product satisfaction or quality issues per customer
**Source:** No returns model in current data layer
**Fix complexity:** HIGH — requires new data source and domain model

### GAP-P3-08: Customer Creation Date

**Impact:** Agent cannot compute tenure or identify new vs established customers
**Source:** SAG `ss_fecha_creacion` available
**Fix complexity:** LOW — add one field mapping

### GAP-P3-09: Observations / Notes

**Impact:** Agent misses qualitative context (special instructions, preferences, warnings)
**Source:** SAG `ss_observaciones` available
**Fix complexity:** LOW — add one field mapping

### GAP-P3-10: Credit Scoring / Risk Assessment

**Impact:** Agent cannot assess credit risk or recommend credit terms
**Sources:** CARTERA (portfolio), v_pagosnew (payment history), sales volume
**Computation:** Multi-factor risk model
**Fix complexity:** VERY HIGH — requires scoring engine (explicitly excluded from CUSTOMER-DOMAIN-01)

---

## Gap Resolution Priority Matrix

| Priority | Count | Fix Complexity | Recommended Sprint |
|---|---|---|---|
| P1 | 7 | 3 LOW, 2 MEDIUM, 1 HIGH, 1 LOW | CUSTOMER-SAG-ENRICHMENT-02 |
| P2 | 10 | 7 LOW, 2 MEDIUM, 1 LOW-once-lookup | CUSTOMER-SAG-ENRICHMENT-03 |
| P3 | 10 | 5 LOW, 2 MEDIUM, 3 HIGH | Future sprints |

### Recommended Next Sprint: CUSTOMER-SAG-ENRICHMENT-02

Focus on the 4 LOW-complexity P1 gaps that unblock agent reasoning:

1. **GAP-P1-01:** Map VENDEDOR + NIT_VENDEDOR from TERCEROS
2. **GAP-P1-02:** Map CREDITO + DIAS_CREDITO + ss_cupo_credito
3. **GAP-P1-04:** Map ACTIVO to admin status derivation
4. **GAP-P1-07:** Fix CRM quote customerId NULL bug

These 4 fixes give the agent: customer ownership, credit capability, active/inactive awareness, and CRM quote access.

### Blocked Until SAG Lookups Available

- GAP-P1-03 (Zone) — needs `zonas` lookup
- GAP-P1-05 (Price List) — needs `listasPrecios` lookup
- GAP-P2-02 (Payment Method) — needs `formasPago` lookup
- GAP-P2-03 (Segment) — needs `tiposCliente` lookup
