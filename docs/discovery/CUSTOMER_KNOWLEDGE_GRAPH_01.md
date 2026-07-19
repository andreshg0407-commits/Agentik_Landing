# CUSTOMER-KNOWLEDGE-GRAPH-01

## Customer Identity Map & Cross-Domain Relationships

**Sprint:** CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01
**Date:** 2026-07-13
**Purpose:** Map every identity key and relationship that connects customer data across systems.

---

## 1. Identity Resolution Chain

A single customer can be identified by multiple keys across systems. The resolution chain defines how Agentik resolves a customer identity:

```
sagTerceroId (integer FK in SAG)
       |
       v
  ss_nit (raw NIT string in SAG)
       |
       v  normalizeNit() strips dots, spaces, DV
  nitNormalized (canonical 9-digit NIT)
       |
       v  buildCanonicalId()
  canonicalId = "castillitos:CUSTOMER:CustomerProfile:{nitNormalized}"
       |
       +---> crmId (CRM Account ID, via identity match)
       |
       +---> customerProfileId (Prisma UUID)
```

### 1.1 Key Types

| Key | System | Format | Example | Uniqueness |
|---|---|---|---|---|
| `sagTerceroId` | SAG | Integer | `12345` | Unique per SAG instance |
| `ss_nit` | SAG | String | `"800.123.456-7"` | Unique per TERCEROS |
| `nitNormalized` | Agentik | String (9 digits) | `"800123456"` | Canonical, tenant-unique |
| `canonicalId` | Agentik | URI-style | `"castillitos:CUSTOMER:..."` | Globally unique |
| `crmId` | SuiteCRM | UUID | `"a1b2c3d4-..."` | Unique per CRM instance |
| `customerProfileId` | Prisma | UUID | `"uuid-..."` | Unique in Agentik DB |

### 1.2 Identity Match Strategy

```
1. sagTerceroId exact match (strongest, same SAG instance)
2. nitNormalized exact match (strong, cross-system)
3. Raw NIT after normalization (medium, handles format variants)
4. Exact name match (weak, last resort for CRM accounts without NIT)
5. Create new (no match found)
```

### 1.3 Known Identity Risks

- **NIT collision:** Two different legal entities with the same NIT (rare but possible with branch offices)
- **CRM orphans:** CRM Accounts without NIT cannot be matched to SAG TERCEROS
- **Integer FK confusion:** `ka_nl_tercero` in MOVIMIENTOS is an integer FK, NOT a real NIT — using it as NIT causes silent misattribution (Bug 526)

---

## 2. Cross-Domain Relationship Map

### 2.1 Customer -> Receivables (CARTERA)

```
CustomerProfile.taxId ---[NIT match]---> CARTERA.ss_nit
                                              |
                                              +-> balance (outstanding amount)
                                              +-> daysOverdue
                                              +-> salesRepName
                                              +-> warehouseCode
```

**Join key:** `taxId` (normalized NIT)
**Direction:** One customer -> many receivable records
**Prisma model:** `CustomerReceivable` (97% customerId FK populated)

### 2.2 Customer -> Collections (v_pagosnew)

```
CustomerProfile.taxId ---[NIT via TERCEROS JOIN]---> v_pagosnew
                                                          |
                                                          +-> documentDate
                                                          +-> documentNumber
                                                          +-> amount
                                                          +-> paymentMethod (code)
```

**Join key:** `taxId` via TERCEROS JOIN in query
**Direction:** One customer -> many collection records
**Prisma model:** `PaymentRecord` (customerId FK)

### 2.3 Customer -> Sales Documents (MOVIMIENTOS)

```
CustomerProfile.taxId ---[ka_nl_tercero FK -> TERCEROS -> NIT]---> MOVIMIENTOS
                                                                        |
                                                                        +-> documentType
                                                                        +-> total
                                                                        +-> date
                                                                        +-> lines (ITEMS)
```

**Join key:** Integer FK `ka_nl_tercero` -> TERCEROS -> NIT normalization
**Direction:** One customer -> many sales documents
**Risk:** If FK resolution fails, customer attribution is lost

### 2.4 Customer -> CRM Account

```
CustomerProfile.crmId ---[UUID match]---> CRMAccount.id
                                               |
                                               +-> billing_address (DANE codes)
                                               +-> industry
                                               +-> assigned_user_id (sales rep)
                                               +-> phone_office, email1
```

**Join key:** `crmId` (UUID)
**Direction:** One-to-one
**Coverage:** ~60% of customers have CRM link

### 2.5 Customer -> CRM Quotes

```
CustomerProfile.crmId ---[billing_account_id in rawCrmJson]---> CRMQuote
                                                                     |
                                                                     +-> total
                                                                     +-> quote_stage
                                                                     +-> date_quote_expected_closed
                                                                     +-> quoteLines[]
```

**Join key:** `rawCrmJson.raw.billing_account_id` (NOT `CRMQuote.customerId` which is NULL)
**Direction:** One customer -> many quotes
**Coverage:** 285 quotes total, all with NULL customerId

### 2.6 Customer -> Orders (Pedidos)

```
CustomerProfile.taxId ---[customerTaxId]---> OrderRecord / OrderDraft
                                                  |
                                                  +-> lines[]
                                                  +-> total
                                                  +-> status
                                                  +-> createdAt
```

**Join key:** `customerTaxId` (normalized NIT)
**Direction:** One customer -> many orders

### 2.7 Customer -> Sales Rep (VENDEDOR)

```
CustomerProfile ---[VENDEDOR field in TERCEROS]---> Sales Rep Name
                   [NIT_VENDEDOR in TERCEROS]-----> Sales Rep NIT
                   [assigned_user_id in CRM]------> CRM User
```

**Status:** VENDEDOR/NIT_VENDEDOR available in SAG query but NOT mapped.
**CRM fallback:** `assigned_user_id` on CRM Account (60% coverage).
**Confidence:** CRM assignment > SAG VENDEDOR field (CRM is more recent).

### 2.8 Customer -> Products (Indirect)

```
CustomerProfile
       |
       +--[via Sales Documents]--> Products purchased (affinity)
       +--[via CRM Quotes]------> Products quoted (intent)
       +--[via Orders]-----------> Products ordered (demand)
```

**No direct FK.** Product affinity must be computed from transactional data.

### 2.9 Customer -> Geography

```
CustomerProfile
       |
       +--[SAG ka_ni_ciudad]---------> Integer FK (NO lookup table)
       +--[SAG ka_nl_departamento]---> Integer FK (NO lookup table)
       +--[CRM billing_address]------> DANE city/department codes (RESOLVABLE)
       +--[SAG ss_direccion]---------> Raw address string (NOT mapped)
```

**Resolution:** CRM DANE codes are the ONLY resolvable geography source.
SAG city/department FKs are integer keys with no available lookup table (GAP-GEOGRAPHY-01).

---

## 3. Commercial Assignment Map

### 3.1 Zone Assignment

```
CustomerProfile ---[ZONA in TERCEROS]---> Zone Code (NOT MAPPED)
                                               |
                                               +-> Zone lookup (PLACEHOLDER in query-catalog)
```

**Status:** ZONA field exists in SAG query expectedFields but is NOT in the mapper.
No zone lookup table available.

### 3.2 Price List Assignment

```
CustomerProfile ---[PRECIO_VENTA in TERCEROS]---> Price List Code (NOT MAPPED)
                                                        |
                                                        +-> LISTAS_PRECIOS lookup (PLACEHOLDER)
```

**Status:** PRECIO_VENTA available but not mapped. Price list lookup is placeholder.

### 3.3 Credit Assignment

```
CustomerProfile ---[CREDITO in TERCEROS]-------> Credit enabled (NOT MAPPED)
                   [DIAS_CREDITO in TERCEROS]---> Credit days (NOT MAPPED)
                   [ss_cupo_credito]------------> Credit limit (NOT IN DB MODEL)
```

**Status:** Credit-related fields available in SAG but none mapped to customer profile.
Current `creditTermDays` in entity model has no SAG source wired.

---

## 4. Contact & Communication Map

### 4.1 Available Contact Sources

| Source | Phone | Email | Contact Person | Mobile | Address |
|---|---|---|---|---|---|
| SAG TERCEROS | `ss_telefono1` (mapped) | `ss_email` (mapped) | `ss_contacto` (NOT mapped) | `ss_celular` (NOT mapped) | `ss_direccion` (NOT mapped) |
| CRM Account | `phone_office` | `email1` | Multiple contacts | N/A | `billing_address_*` |
| CRM Activities | N/A | N/A | Via activity participants | N/A | N/A |

### 4.2 Contact Enrichment Priority

1. SAG `ss_telefono1` + `ss_email` (already mapped, primary)
2. SAG `ss_celular` (mobile, P2)
3. SAG `ss_contacto` (contact person name, P2)
4. CRM `phone_office` + `email1` (secondary/validation source)
5. CRM `billing_address_*` (geography enrichment)

---

## 5. Behavioral Data Sources

### 5.1 Purchase Behavior (Computable, NOT Computed)

| Metric | Source | Computation | Status |
|---|---|---|---|
| Purchase frequency | MOVIMIENTOS by customer | Count per period | NOT COMPUTED |
| Average order value | MOVIMIENTOS totals | Avg per customer | NOT COMPUTED |
| Product affinity | MOVIMIENTOS lines | Top products per customer | NOT COMPUTED |
| Seasonal patterns | MOVIMIENTOS dates | Monthly distribution | NOT COMPUTED |
| Recency | MOVIMIENTOS max date | Days since last purchase | NOT COMPUTED |

### 5.2 Payment Behavior (Computable, NOT Computed)

| Metric | Source | Computation | Status |
|---|---|---|---|
| Payment timeliness | v_pagosnew dates vs invoice dates | Avg days to pay | NOT COMPUTED |
| Payment method preference | v_pagosnew Forma_Pago | Mode of payment codes | NOT COMPUTED |
| Collection rate | v_pagosnew vs CARTERA | Paid / Outstanding | NOT COMPUTED |
| Bounce rate | v_pagosnew status | Bounced / Total | NOT COMPUTED |

### 5.3 CRM Engagement (Available, NOT Synced)

| Metric | Source | Status |
|---|---|---|
| Call frequency | CRM Activities (type=Call) | NOT SYNCED |
| Meeting frequency | CRM Activities (type=Meeting) | NOT SYNCED |
| Last contact date | CRM Activities max date | NOT SYNCED |
| Quote-to-close ratio | CRM Quotes stages | NOT SYNCED |
| Pipeline value | CRM Opportunities | NOT SYNCED |

---

## 6. Relationship Confidence Matrix

| Relationship | Join Quality | Coverage | Confidence |
|---|---|---|---|
| Customer -> Receivables | NIT direct match | 97% | HIGH |
| Customer -> Collections | NIT via TERCEROS JOIN | 90%+ | HIGH |
| Customer -> Sales | Integer FK (indirect) | 85% | MEDIUM |
| Customer -> CRM Account | crmId UUID | 60% | MEDIUM |
| Customer -> CRM Quotes | rawCrmJson path | 60% (CRM-linked only) | LOW |
| Customer -> Sales Rep (SAG) | VENDEDOR field | 0% (not mapped) | NONE |
| Customer -> Sales Rep (CRM) | assigned_user_id | 60% | MEDIUM |
| Customer -> Zone | ZONA field | 0% (not mapped) | NONE |
| Customer -> Geography | CRM DANE only | 60% | LOW |
| Customer -> Price List | PRECIO_VENTA field | 0% (not mapped) | NONE |
| Customer -> Credit Terms | CREDITO/DIAS_CREDITO | 0% (not mapped) | NONE |
