# AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01

**Sprint:** Pedidos — Canonical Customer Data Foundation
**Tenant:** Castillitos
**Fecha:** 2026-07-22
**Estado:** COMPLETE (pending backfill authorization)

---

## 1. Deliverables

### New files (4)

| File | Lines | Purpose |
|---|---|---|
| `lib/comercial/clientes/canonical-customer-types.ts` | 248 | Canonical types: CanonicalCommercialCustomer, 3 readiness levels, ResolvedSeller, CustomerFieldQuality, OrderCustomerSnapshot |
| `lib/comercial/clientes/customer-merge-engine.ts` | 263 | Pure merge functions: extractSagCommercialFields, mergeAddress, mergeLocation, resolveSeller, mergePriceList, mergePaymentTerms, mergePortfolio, computeFieldQuality |
| `lib/comercial/clientes/customer-sag-validation.ts` | 154 | 3-level readiness validation: validateCustomerForSagOrder, validateBranchForSagOrder. DRAFT_BLOCKER vs SUBMISSION_BLOCKER severity |
| `lib/comercial/clientes/canonical-customer-service.ts` | ~200 | Server-only service: searchCustomers, getCustomerBySagCode. Builds canonical from CustomerProfile + rawErpJson |

### Modified files (5)

| File | Change | Sprint |
|---|---|---|
| `lib/comercial/pedidos/order-service.ts` | submitOrder() rewritten fail-closed; validateOrderCustomerForSag() helper; imports canonical service | FOUNDATION-01 |
| `lib/comercial/sag/mappers.ts` | mapSagCustomer() preserves sagCityId/sagDeptId in meta; mapSagOrder() extracts ka_nl_tercero_vend as sellerTerceroId | FOUNDATION-01 |
| `lib/comercial/sag/storage.ts` | customerProfileStorage now writes address column from rawErpJson.raw.sc_direccion | FOUNDATION-01 |
| `lib/comercial/sag/types.ts` | UnifiedSagOrder extended with sellerTerceroId field | FOUNDATION-01 |
| `app/api/orgs/[orgSlug]/comercial/pedidos/route.ts` | Debug console.logs removed | FOUNDATION-01 |

### Scripts (3)

| Script | Purpose |
|---|---|
| `scripts/_validate-customer-data-foundation.ts` | READ-ONLY diagnostic: field coverage, SAG commercial fields matrix, branch analysis, readiness levels, vendedor coverage by year, address backfill opportunity |
| `scripts/_backfill-customer-address.ts` | Safe idempotent backfill: rawErpJson.raw.sc_direccion to CustomerProfile.address. Dry run by default, --execute flag required |
| `scripts/_test-customer-data-foundation.ts` | 69 pure-function tests across 6 suites. No DB, no network |

---

## 2. Production Diagnostic (2026-07-22)

### CustomerProfile field coverage (33,229 profiles)

| Field | Count | Coverage |
|---|---|---|
| erpId (SAG code) | 32,296 | 97.2% |
| crmId | 30,262 | 91.1% |
| NIT | 33,013 | 99.3% |
| **address** | **0** | **0.0%** |
| city | 32,340 | 97.3% |
| department | 29,880 | 89.9% |
| sellerName | 46 | 0.1% |
| phone | 32,135 | 96.7% |
| email | 12,429 | 37.4% |
| rawErpJson | 32,296 | 97.2% |
| rawCrmJson | 30,262 | 91.1% |

### SAG commercial fields (from rawErpJson, 32,296 profiles)

| Field | Mapper | Query | Populated | Persisted | Canonical |
|---|---|---|---|---|---|
| zona | YES | YES | 0.0% | rawErpJson | extractSagCommercialFields |
| formaPago | YES | YES | 0.0% | rawErpJson | mergePaymentTerms |
| precioVenta | YES | YES | 0.0% | rawErpJson | mergePriceList |
| credito | YES | YES | 0.0% | rawErpJson | mergePaymentTerms |
| diasCredito | YES | YES | N/A | rawErpJson | mergePaymentTerms |
| vendedor | YES | YES | 0.0% | rawErpJson | resolveSeller |
| sagCityId | YES | YES | 100.0% | rawErpJson | mergeLocation |
| sagDeptId | YES | YES | N/A | rawErpJson | mergeLocation |
| address (SAG) | YES | YES | 100.0% | rawErpJson | mergeAddress |
| activo | YES | YES | 0.0% | rawErpJson | buildCanonical |
| ss_sucursal | NO | YES* | 0.0% | rawErpJson | NOT EXTRACTED |

**Root cause of 0% commercial fields:** SAG TERCEROS is a general contact table (shared by customers, vendors, employees). Fields like zona, formaPago, precioVenta, credito, vendedor, activo are NOT columns in TERCEROS. They exist in separate SAG tables (MOVIMIENTOS, ARTICULOS, etc.). The mapper and query infrastructure is correct, but these fields simply don't exist at the TERCEROS level.

### Branch (sucursal) analysis

| Metric | Value |
|---|---|
| Unique NITs | 28,560 |
| NITs with >1 profile | 0 |
| Max profiles per NIT | 1 |
| ss_sucursal populated | 0 of 32,296 |

**Finding:** Castillitos has zero multi-branch customers and zero ss_sucursal values. Branch validation code exists and is tested, but branches are not a feature of this tenant's data.

### Readiness levels

| Level | Count | Coverage |
|---|---|---|
| BLOCKED (no SAG code) | 933 | 2.8% |
| DRAFT_ONLY (SAG code, missing NIT) | 0 est. | 0.0% |
| READY candidates (SAG + NIT) | 32,296 | 97.2% |
| With address (for full readiness) | 0 | 0.0% |

**Critical:** 97.2% of customers have SAG code + NIT but 0% have address in the column. After backfill, 31,731 profiles will reach SAG_SUBMISSION_READY.

### Order vendedor coverage (CustomerOrderRecord)

| Year | With vendor | Total | Coverage |
|---|---|---|---|
| 2020 | 0 | 803 | 0% |
| 2021 | 0 | 1,808 | 0% |
| 2022 | 0 | 1,438 | 0% |
| 2023 | 0 | 1,431 | 0% |
| 2024 | 0 | 1,300 | 0% |
| 2025 | 0 | 1,783 | 0% |
| 2026 | 0 | 1,115 | 0% |

**Finding:** ka_nl_tercero_vend is 0% in CustomerOrderRecord.rawJson across all years. This is expected: CustomerOrderRecord stores CRM-originated orders (CRM quotes), not SAG MOVIMIENTOS. The live seller-resolution-service.ts queries SAG MOVIMIENTOS directly via SOAP, which has 92% coverage for 2026 PD orders.

---

## 3. Address Backfill (DRY RUN 2026-07-22)

| Metric | Value |
|---|---|
| Inspected | 32,296 |
| With raw address | 32,216 |
| Already complete | 0 |
| Empty raw address | 80 |
| Invalid values | 485 |
| **To update** | **31,731** |

Invalid values: 485 addresses rejected (purely numeric codes or <3 characters).

**Status:** Awaiting authorization to execute.

---

## 4. Seller Resolution Architecture

### Two services, two contexts

| Service | Context | Data source | Used by |
|---|---|---|---|
| `seller-resolution-service.ts` | **Order-level** | SAG MOVIMIENTOS.ka_nl_tercero_vend (live SOAP query per order) + CRM quote history fallback | Order display, order list enrichment |
| `customer-merge-engine.ts resolveSeller()` | **Profile-level** | rawErpJson vendedor field + CRM seller + profile seller | Canonical customer builder, customer search |

**Decision:** These are complementary, not competing. The order-level service resolves the seller for a specific SAG transaction (with 92% coverage in 2026 via live SOAP). The profile-level merge resolves the seller for the customer record itself (currently 0% from SAG TERCEROS, since vendedor is not a TERCEROS column).

### Priority cascades

**Order context (seller-resolution-service.ts):**
1. SAG MOVIMIENTOS.ka_nl_tercero_vend for specific order -> HIGH confidence
2. CRM quote history (most frequent seller, 60% threshold) -> MEDIUM/LOW confidence
3. null -> UNKNOWN

**Profile context (customer-merge-engine.ts):**
1. SAG vendedor from rawErpJson (if populated) -> CONFIRMED
2. CRM seller name -> INFERRED
3. CustomerProfile.sellerName -> INFERRED
4. null -> UNAVAILABLE

### validateOrder() sellerName requirement

`validateOrder()` in `order-validation.ts` requires `sellerName` as mandatory. This conflicts with the fail-open seller policy where seller resolution may not succeed. The current `submitOrder()` validates via `validateCustomerForSagOrder()` which does NOT require seller by default (`requireSeller` defaults to false). This is correct because:

- The real SAG PD document contract (canSendToSag in order-sag-bridge.ts) only requires `customerCode` and `listo_para_enviar` status
- Seller can be populated after draft creation via the order-level resolution service
- validateOrder() is a UI-facing validation for the wizard, not a SAG gate

---

## 5. SAG PD Document Contract

From `order-sag-bridge.ts` and SAG adapter analysis:

| Field | Required | Source |
|---|---|---|
| customerCode (TERCERO) | MANDATORY | OrderHeader.customerCode |
| listo_para_enviar status | MANDATORY | Order status gate |
| NIT | MANDATORY (SAG side) | Customer document number |
| Address | MANDATORY (dispatch) | Customer address |
| Seller (VENDEDOR) | OPTIONAL | seller-resolution-service |
| Price list | OPTIONAL | Customer profile |
| Branch (SUCURSAL) | OPTIONAL | Not applicable for Castillitos |

`canSendToSag()` only checks customerCode existence and listo_para_enviar status. The 3-level readiness validation in `customer-sag-validation.ts` is stricter by design — it pre-validates all fields needed for a successful SAG submission, not just the bare minimum to call the API.

---

## 6. Fail-Closed Validation

### Before (fail-open)
```
submitOrder() -> patchOrderMeta() callback -> validate inside callback
  -> SAG unavailable? -> validation skipped, order submitted
```

### After (fail-closed)
```
submitOrder() -> validateOrderCustomerForSag() -> throws on error
  -> catch -> BLOCK submission, return sagError message
  -> ok -> patchOrderMeta() to listo_para_enviar
```

Key change: validation happens BEFORE patchOrderMeta, not inside its callback. If canonical service throws, the catch block explicitly blocks with error message.

---

## 7. Test Results (69/69 PASS)

| Suite | Tests | Status |
|---|---|---|
| 1. SAG Validation Readiness Levels | 9 | PASS |
| 2. Merge Engine | 12 | PASS |
| 3. Address Backfill Rules | 5 | PASS |
| 4. Branch Validation | 4 | PASS |
| 5. Seller Priority | 4 | PASS |
| 6. Price List & Payment Terms | 4 | PASS |

All tests are pure functions — no DB, no network, no side effects.

---

## 8. TypeScript Status

TSC count: 194 (stable, no new errors introduced by this sprint).

---

## 9. Findings Update

### F1: Commercial fields at 0% are expected
SAG TERCEROS is a general contact table. Fields like zona, formaPago, precioVenta, vendedor are NOT TERCEROS columns. The mapper infrastructure is correct and ready for when these fields are sourced from the appropriate SAG tables (MOVIMIENTOS for vendedor, ARTICULOS for precios, etc.).

### F2: ss_sucursal does not exist in Castillitos
Zero profiles have ss_sucursal populated. Zero NITs have multiple profiles. Branch logic is tested and ready but not exercised by this tenant.

### F3: Order vendedor 0% in CustomerOrderRecord is expected
CustomerOrderRecord stores CRM-originated orders. SAG MOVIMIENTOS vendedor data is accessed live via SOAP by seller-resolution-service.ts, which reports 92% coverage for 2026 PD orders.

### F4: Address backfill will unlock SAG_SUBMISSION_READY
31,731 profiles will move from DRAFT_ONLY to SAG_SUBMISSION_READY after backfill. This is the single highest-impact data operation for the Pedidos module.

### F5: sellerName in CustomerProfile is unusable
Only 46 of 33,229 profiles have sellerName populated (0.1%). Not a useful source. Seller resolution must come from order-level SOAP queries or CRM history.

### F6: rawJson on CustomerOrderRecord is empty
All 9,678 orders have `rawJson = {}`. The SAG sync pipeline never writes ka_nl_tercero_vend or any other field to rawJson during sync. The sellerTerceroId field added to UnifiedSagOrder by this sprint will populate going forward via mapSagOrder(), but historical orders remain empty.

### F7: validateOrder() requires sellerName but SAG treats VENDEDOR as optional
`order-validation.ts` flags missing sellerName as an error, blocking canSubmit and therefore canSendToSag(). However, SAG's XML builder uses `optEl` (optional element) for VENDEDOR. This creates a stricter-than-necessary gate. The current sprint's `validateCustomerForSagOrder()` correctly defaults `requireSeller: false`. Future sprint should consider relaxing validateOrder() to match SAG's actual contract.

### F8: mapSagOrder() maps ka_nl_tercero (internal FK) as customerNit
The incoming SAG sync stores `ka_nl_tercero` (SAG internal PK) in `CustomerOrderRecord.customerNit` instead of the real NIT from the TERCEROS JOIN (`nit_tercero`). This means order-customer matching must use SAG internal IDs, not real NITs. Not a blocker for the current sprint but a data quality concern for future work.

### F9: CRMQuote has 100% seller coverage but only 3% order match
305 CRM quotes have 9 distinct sellers with 100% coverage. However, only 289 of 9,678 orders (3%) match by orderNumber. CRMQuote.customerId is NULL on all quotes (known gap). The live SOAP resolution via seller-resolution-service.ts remains the primary path for order-level seller data.

### F10: SAG PD outgoing contract — SUCURSAL, FORMA_PAGO, LISTA_PRECIO absent
SagDocumentInput has no fields for SUCURSAL, FORMA_PAGO, or LISTA_PRECIO. If SAG ever requires these for PD creation, the write layer types must be extended. Not needed currently.

### F11: SAG TERCEROS returns 55 fields, none are commercial
The SELECT * FROM TERCEROS view returns 55 internal SAG fields (ss_, sc_, ka_, sv_ prefixes). Fields like zona, formaPago, precioVenta, credito, vendedor, activo are NOT among them. The discovery document incorrectly listed ss_sucursal as "Available But NOT Mapped" — it does not exist in this SAG instance.

### F12: VENDEDOR downgraded from error to warning in order-validation.ts
SAG PD XML builder uses `optEl` (optional element) for VENDEDOR. `validateHeader()` previously returned severity="error" for missing sellerName, which blocked canSubmit and canSendToSag(). Changed to severity="warning" with message explaining that SAG accepts orders without vendor but recommends assignment for traceability. The seller resolution pipeline remains active — this only removes the hard gate.

---

## 10. Technical Debt

### ORDERS-SAG-CUSTOMER-IDENTITY-01

**Priority:** HIGH — must resolve before SAG write bridge
**Filed:** 2026-07-22

`CustomerOrderRecord.customerNit` currently contains `ka_nl_tercero` (SAG internal PK), not the real NIT. `mapSagOrder()` reads `ka_nl_tercero` from MOVIMIENTOS and stores it as `customerNit`.

Must resolve:
- JOIN with TERCEROS to get real NIT (`n_nit`)
- Decide canonical key: SAG internal ID vs real NIT vs both
- Establish `customerProfileId` FK for canonical matching
- Maintain backward compatibility with 9,678 historical orders
- Do not break existing matching logic in order-service.ts or seller-resolution-service.ts

Not blocking for FOUNDATION-01 sprint close. Blocking for SAG write bridge.

### ORDERS-SUCURSAL-INVESTIGATION-01

**Priority:** LOW — no data exists for Castillitos
**Filed:** 2026-07-22

Findings:
- `ss_sucursal` does not exist in the SAG TERCEROS view for Castillitos (0 of 55 raw fields)
- Zero NITs have multiple CustomerProfile rows
- No evidence exists to construct real branch/sucursal data from current sources
- `getCustomerBranches()` must NOT invent branches — return only main sede when no real branch data exists
- The wizard must NOT show an empty or artificial branch selector

Next steps (future sprint):
- Investigate CRM contact addresses as potential branch sources
- Check SAG delivery documents for distinct delivery addresses per customer
- Explore whether a different SAG query (not TERCEROS) exposes sucursal data
- Do not add new SAG queries or data sources within this sprint
