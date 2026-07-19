# COMMERCIAL-DATA-LAYER-INTEGRATION-01

**Sprint:** COMMERCIAL-DATA-LAYER-INTEGRATION-01
**Date:** 2026-07-13
**Scope:** Integration audit of Product + Sales + Inventory as a coherent Commercial Data Layer

---

## Contracts Audited

| Contract | Domain | canonicalId | externalRef | quality | freshness | evidence | timestamps | version |
|---|---|---|---|---|---|---|---|---|
| ProductProfile | PRODUCT | tenant:PRODUCT:ProductProfile:{refCode} | SAG_PYA / ARTICULOS | evaluateCommercialQuality | 86400s SLA | none (pre-integration) | createdAt/updatedAt/sourceModifiedAt/lastSyncAt | 1 |
| ProductVariant | PRODUCT | declared, no normalizer | declared, no builder | none | none | none | declared | declared |
| SalesDocument | SALES | tenant:SALES:SalesDocument:{type}:{number} | SAG_PYA / DOCUMENTOS | evaluateCommercialQuality | 1800s SLA | none (pre-integration) | same pattern | 1 |
| SaleLine | SALES | tenant:SALES:SaleLine:{parent}:L{n} | none (nested value) | none (doc-level only) | inherited | none | none (no envelope) | none |
| SalesReturn | SALES | declared, no normalizer | declared, no builder | none | none | none | declared | none |
| SalesAttribution | SALES | declared, no normalizer | none declared | none | none | none | none | none |
| InventoryPosition | INVENTORY | tenant:INVENTORY:InventoryPosition:{ref}:{loc}[:{size}:{color}] | SAG_PYA / INVENTORY + secondaryId=location | evaluateCommercialQuality | 900s SLA | separate entity | same pattern | 1 |
| WarehouseProfile | INVENTORY | declared, no normalizer | declared, no builder | none | none | none | declared | declared |
| InventoryMovement | INVENTORY | declared, no normalizer | declared, no builder | none | none | none | declared | declared |

---

## Transversal Identity

**Rule:** Product Domain owns all product canonical IDs.

```
ProductProfile.id  = buildCanonicalId(tenant, "PRODUCT", "ProductProfile", referenceCode)
SaleLine           → joins via referenceCode (string match to Product naturalKey)
InventoryPosition  → joins via referenceCode (string match to Product naturalKey)
```

**New shared resolver:** `lib/comercial/data-layer/shared/product-reference.ts`

- `buildProductCanonicalId(tenantId, referenceCode)` — single truth builder
- `buildVariantCanonicalId(tenantId, referenceCode, sizeCode, colorCode)` — variant identity
- `resolveProductReference(params)` — builds CommercialProductReference with resolution status

Sales and Inventory do NOT build their own product IDs. They use `referenceCode` as the join key. The resolver bridges the gap when a canonical product ID is needed.

---

## Variant Identity

| Domain | sizeCode | colorCode | sku | variantId |
|---|---|---|---|---|
| Product | ProductVariant.sizeCode | ProductVariant.colorCode | ProductVariant.sku | via buildVariantCanonicalId |
| Sales | SaleLine.sizeCode | SaleLine.colorCode | n/a | resolved via resolver |
| Inventory | InventoryVariantDetail.sizeCode | InventoryVariantDetail.colorCode | InventoryVariantDetail.sku | resolved via resolver |

**Resolution states:**
- RESOLVED — size + color both present, variant ID built
- PARTIALLY_RESOLVED — only one of size/color present
- UNRESOLVED — no variant data
- CONFLICTED — different sources disagree

---

## Ownership

| Entity Type | Owner Domain | Confirmed |
|---|---|---|
| ProductProfile | PRODUCT | Yes |
| ProductVariant | PRODUCT | Yes |
| ProductPrice | PRODUCT | Yes (embedded) |
| ProductClassification | PRODUCT | Yes (embedded) |
| SalesDocument | SALES | Yes |
| SaleLine | SALES | Yes |
| SalesReturn | SALES | Yes |
| SalesAttribution | SALES | Yes |
| InventoryPosition | INVENTORY | Yes |
| InventoryMovement | INVENTORY | Yes |
| InventoryAge | INVENTORY | Yes |
| WarehouseProfile | INVENTORY | Yes |

No duplicate ownership found.

---

## Quality / Freshness / Evidence

### Quality Semantics (consistent across all 3 domains)

All domains use `evaluateCommercialQuality()` with the same 6 statuses:

| Status | Meaning |
|---|---|
| CONFIRMED | Identity resolved, critical fields valid, source reliable, within SLA, no conflict |
| PARTIAL | Usable data exists but relevant fields missing |
| ESTIMATED | Primary value inferred or calculated |
| CONFLICTED | Multiple incompatible sources or calculations |
| STALE | Exceeds required SLA |
| UNAVAILABLE | No usable data |

### Freshness SLAs

| Domain | SLA (seconds) | SLA (human) | Configurable |
|---|---|---|---|
| Product | 86400 | 24 hours | Via evaluator param |
| Sales | 1800 | 30 minutes | Via evaluator param |
| Inventory | 900 | 15 minutes | Via evaluator param |

All use `evaluateCommercialFreshness()` which accepts `slaSeconds` as input — SLAs are configurable at call time.

### Evidence

New transversal envelope: `CommercialDomainEvidence` in `shared/domain-evidence.ts`

Fields: domain, entityType, entityId, tenantId, field, rawValue, canonicalValue, confidence, observedAt, traceId, note, resolution, qualityImpact.

Builders: `buildEvidenceFromProduct()`, `buildEvidenceFromSales()`, `buildEvidenceFromInventory()`

---

## Cross-Domain Read Model

New: `CommercialProductState` in `shared/commercial-product-state.ts`

A pure, non-persisted projection that joins Product + Sales + Inventory by canonical product ID.

- Does NOT calculate rotation, coverage, margin, recompra, or markdown
- Validates tenant isolation (rejects mixed-tenant evidence)
- Reports unresolved relations as typed errors
- Does not mutate inputs

Builder: `buildCommercialProductState(input)`

---

## Inconsistencies Found and Corrected

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | INVENTORY descriptor listed `InventoryAgeIndex` but entity is `InventoryAge` | commercial-domain-descriptors.ts | Changed to `"InventoryAge"` |
| 2 | Sales adapter declared `supportsIncremental: true` but always uses `"FULL"` extraction | sales-adapter.ts | Changed to `supportsIncremental: false` |
| 3 | No cross-domain product reference resolver | shared/ | Created `product-reference.ts` |
| 4 | No cross-domain evidence envelope | shared/ | Created `domain-evidence.ts` |
| 5 | No cross-domain error types | shared/ | Created `cross-domain-errors.ts` |
| 6 | No cross-domain read model | shared/ | Created `commercial-product-state.ts` |

---

## Decisions NOT Implemented

| Decision | Reason |
|---|---|
| Add `productId` field to SaleLine/InventoryPosition | Would change entity contracts — not needed yet. `referenceCode` join + resolver is sufficient. |
| Normalize SalesReturn / SalesAttribution | No normalizer exists — these are future entities. Not in scope. |
| Build WarehouseProfile normalizer | No data source wired — structural placeholder only. |
| Create freshness policy object | Current approach (SLA as evaluator param) is already configurable. No new abstraction needed. |
| Connect to Coverage/Rotation engines | Explicitly out of scope. |
| Create CUSTOMER-DOMAIN-01 | Next sprint. |

---

## Preparation for CUSTOMER-DOMAIN-01

The integration layer is ready for Customer Domain:

1. `CommercialDomain` union already includes `"CUSTOMER"`
2. `CUSTOMER_DOMAIN` descriptor registered with entityTypes
3. `resolveProductReference()` is domain-agnostic — Customer can use it
4. `CommercialDomainEvidence` envelope supports any domain string
5. `CrossDomainError` types support customer-related scenarios
6. Domain Registry enforces unique ownership — Customer entities won't conflict

Customer Domain can begin.

---

## Test Results

- **Functional tests:** 68/68 PASS (`scripts/test-commercial-data-layer-integration-01.ts`)
- **Structural validation:** see `scripts/validate-commercial-data-layer-integration-01.ts`
- **TSC baseline:** 160 (zero regression)
