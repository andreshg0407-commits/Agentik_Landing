# CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01

## Customer Data Source Map

**Sprint:** CUSTOMER-SAG-ENRICHMENT-DISCOVERY-01
**Date:** 2026-07-13
**Scope:** Complete inventory of every data source that contributes customer knowledge to Agentik.
**Constraint:** Discovery only. No code, no adapters, no Prisma, no UI.

---

## 1. SAG TERCEROS (Primary Customer Source)

**Query:** `SELECT * FROM TERCEROS`
**Status:** Validated (query-catalog.ts)
**Mapper:** `mapSagCustomer()` in mappers.ts

### 1.1 Fields Currently Mapped (5 of ~55)

| SAG Field | Mapped To | Notes |
|---|---|---|
| `ka_nl_tercero` | `sagTerceroId` (integer) | Primary key in SAG |
| `ss_nit` | `taxId` (after `normalizeNit()`) | Strips dots, spaces, DV suffix |
| `ss_razon_social` | `name` | Direct map |
| `ss_telefono1` | `phone` | First phone only |
| `ss_email` | `email` | Direct map |

### 1.2 Fields Available But NOT Mapped (~50)

| SAG Field | Expected Content | Why Not Mapped | Priority |
|---|---|---|---|
| `VENDEDOR` | Sales rep name | Denormalization skipped | P1 |
| `NIT_VENDEDOR` | Sales rep NIT | Denormalization skipped | P1 |
| `ZONA` | Commercial zone code | Not in DB model | P1 |
| `FORMA_PAGO` | Payment form code | Not in DB model | P2 |
| `TIPO_TERCERO` | Third party type code | Partially mapped via `sc_naturaleza` | P1 |
| `TIPO_CLIENTE` | Client classification | Not mapped | P2 |
| `PRECIO_VENTA` | Price list assignment | Not in DB model | P1 |
| `CREDITO` | Credit enabled flag | Not mapped | P1 |
| `DIAS_CREDITO` | Credit term days | Not mapped | P1 |
| `ACTIVO` | Active flag | Not synced to admin status | P1 |
| `ka_ni_ciudad` | City FK (integer) | No lookup table available | P2 |
| `ka_nl_departamento` | Department FK (integer) | No lookup table available | P2 |
| `ss_direccion` | Address | Not mapped | P2 |
| `ss_telefono2` | Second phone | Not mapped | P3 |
| `ss_celular` | Mobile phone | Not mapped | P2 |
| `sc_naturaleza` | J=Juridica/N=Natural | Used for type detection only | P2 |
| `ss_nombre_comercial` | Trade name | Not mapped | P2 |
| `ss_responsabilidades` | Tax responsibilities | Not mapped | P2 |
| `ss_regimen` | Tax regime | Not mapped | P2 |
| `ss_codigo_ciiu` | CIIU economic activity | Not mapped | P3 |
| `ss_fecha_creacion` | Creation date in SAG | Not mapped | P2 |
| `ss_fecha_modificacion` | Last modification | Not mapped (would improve freshness) | P1 |
| `ss_cupo_credito` | Credit limit amount | Not in DB model | P1 |
| `ss_descuento` | Default discount % | Not in DB model | P2 |
| `ss_observaciones` | Notes/observations | Not mapped | P3 |
| `ss_contacto` | Contact person name | Not mapped | P2 |
| `ss_ruta` | Delivery route | Not in DB model | P2 |
| `ss_sucursal` | Branch code | Not in DB model | P2 |
| `ss_plazo` | Payment term | Not mapped | P2 |

### 1.3 NIT Normalization (mappers.ts:normalizeNit)

```
Input: "800.123.456-7" -> Output: "800123456"
Input: "8001234567"    -> Output: "800123456" (10->9 digit)
Input: "800 123 456"   -> Output: "800123456"
```

- Strips dots, spaces
- Removes `-N` DV suffix (digito de verificacion)
- 10-digit to 9-digit conversion (removes trailing DV)

### 1.4 Type Detection via sc_naturaleza

| sc_naturaleza | Result |
|---|---|
| `"J"` | Persona Juridica (company) |
| `"N"` | Persona Natural (individual) |
| other | Defaults to unknown |

**Gap:** `TIPO_TERCERO` field (CUSTOMER/VENDOR/EMPLOYEE/MIXED) is available in query but NOT used by mapper. Current `customerType` always returns `"B2B"`.

---

## 2. SAG CARTERA (Receivables / Portfolio)

**Query:** `SELECT * FROM CARTERA`
**Status:** Validated
**Mapper:** `mapSagReceivable()` in mappers.ts

### 2.1 Fields Mapped

| SAG Field | Mapped To | Notes |
|---|---|---|
| `ss_nit` | `customerTaxId` | Joins to TERCEROS |
| `ss_saldo` | `balance` | Outstanding amount |
| `ss_dias_mora` | `daysOverdue` | Days past due |
| `ss_vendedor` | `salesRepName` | Denormalized |
| `ss_bodega` | `warehouseCode` | Source warehouse |

### 2.2 Critical Receivable Gaps

- `paidAmount` always set to `0` (PAGOS table confirmed empty in SAG)
- `creditDays` hardcoded: `formaPago === 2 ? 30 : 0` (no real credit term sync)
- No document-level detail (invoice number, date, due date)
- No partial payment tracking
- No credit note linkage

---

## 3. SAG v_pagosnew (Collections / Payments)

**Query:** `SELECT ... FROM v_pagosnew p LEFT JOIN TERCEROS t`
**Status:** Validated
**Mapper:** `mapSagCollection()` in mappers.ts

### 3.1 Fields Mapped

| SAG Field | Mapped To | Notes |
|---|---|---|
| `Fecha_Documento` | `documentDate` | NOT `Fecha_Pago` |
| `Numero_Documento` | `documentNumber` | NOT `Nro_Comprobante` |
| `ss_nit` (from JOIN) | `customerTaxId` | Via TERCEROS join |
| `Valor` | `amount` | Payment amount |
| `Forma_Pago` | `paymentMethod` | Code, not resolved to name |

### 3.2 Deduplication

- Uses `naturalKey` hash for dedup
- **Bug 526:** Never fall back to `ka_nl_tercero` as NIT (integer FK, not real tax ID)

### 3.3 Collection Gaps

- No reconciliation status (applied/unapplied)
- No bank reference number
- No payment method resolution (code only)
- No partial application tracking

---

## 4. SAG MOVIMIENTOS + FUENTES (Sales Documents)

**Query:** `SELECT ... FROM MOVIMIENTOS m JOIN FUENTES f`
**Status:** Validated
**Mapper:** `mapSagMovement()` in mappers.ts

### 4.1 Customer Link

- `ka_nl_tercero` is an **integer FK**, NOT the real NIT
- Requires JOIN to TERCEROS to resolve actual customer identity
- **This is a critical data quality risk** for customer attribution

### 4.2 Order Detection

- `k_n_clase_fuente = 4` AND `code = "PD"` identifies customer orders
- Mapped via `mapSagOrder()` to `CustomerOrderRecord`

### 4.3 Sales Gaps for Customer Context

- No customer-level sales aggregation
- No purchase frequency computation
- No average order value tracking
- No product affinity per customer
- No seasonal pattern detection

---

## 5. SuiteCRM V8 (CRM Layer)

**Models:** `CRMAccount`, `CRMQuote`, `CRMOpportunity`, `CRMActivity`
**Connector:** castillitos-crm adapter

### 5.1 CRM Account (Customer Master)

| CRM Field | Customer Value | Notes |
|---|---|---|
| `id` | `crmId` on CustomerProfile | Links CRM to SAG |
| `name` | Account name | May differ from SAG razonSocial |
| `billing_address_*` | Address fields | DANE city codes available |
| `phone_office` | Phone | Secondary phone source |
| `email1` | Email | Secondary email source |
| `industry` | Industry classification | Not in SAG |
| `account_type` | Account type | Not in SAG |
| `assigned_user_id` | Assigned sales rep | Links to CRM user |

### 5.2 CRM Quotes (285 quotes in DB)

**CRITICAL BUG:** `CRMQuote.customerId` is NULL on all 285 quotes.
**Workaround:** Join via `rawCrmJson.raw.billing_account_id` to `CustomerProfile.crmId`.

| CRM Field | Customer Value |
|---|---|
| `billing_account_id` | Links to CRM Account |
| `total` | Quote value |
| `quote_stage` | Pipeline stage |
| `date_quote_expected_closed` | Expected close |
| `currency_id` | Currency |

### 5.3 CRM Opportunities

- Links accounts to pipeline value
- Win/loss tracking per customer
- Not currently synced to customer domain

### 5.4 CRM Activities

- Call logs, meetings, tasks per account
- Engagement frequency data source
- Not currently synced to customer domain

---

## 6. Agentik-Native Sources

### 6.1 Pedidos Module (lib/comercial/pedidos/)

- `OrderDraft` / `OrderRecord` types
- Links to customer via `customerTaxId`
- Provides: order history, line items, totals
- Source for purchase behavior computation

### 6.2 Maletas Module (lib/comercial/maletas/)

- Suitcase assignment to sales reps
- Indirect customer link via sales rep territory
- Source for coverage/visit tracking

### 6.3 Tiendas Module (lib/comercial/tiendas/)

- Store master data
- Customer-store assignment potential
- Inventory availability per location

---

## 7. Master Lookup Tables (NOT YET AVAILABLE)

**Status in query-catalog.ts:** All `placeholder` or `pending`

| Lookup | SAG Table | Status | Impact |
|---|---|---|---|
| Formas de Pago | Unknown | Placeholder | Can't resolve payment method names |
| Zonas | Unknown | Placeholder | Can't resolve zone names |
| Tipos Tercero | Unknown | Placeholder | Can't resolve third-party type names |
| Tipos Cliente | Unknown | Placeholder | Can't resolve client classification |
| Vendedores | Unknown | Placeholder | Can't resolve sales rep details |
| Listas Precios | Unknown | Placeholder | Can't resolve price list assignments |

**These lookups are the single biggest blocker for customer enrichment.** Without them, codes remain unresolved and customer segmentation is impossible.

---

## 8. Data Volume Summary (Castillitos Tenant)

| Source | Record Count | Last Sync |
|---|---|---|
| SAG TERCEROS | ~500-800 (estimated) | Active sync |
| SAG CARTERA | Variable | Active sync |
| SAG v_pagosnew | Variable | Active sync |
| CRM Accounts | ~300+ | Active sync |
| CRM Quotes | 285 | Active sync |
| Production Events (OP) | 3,376 | Active sync |
| Production Events (ET) | 3,640 | Active sync |
| Production Events (CN) | 7,890 headers | Active sync |
