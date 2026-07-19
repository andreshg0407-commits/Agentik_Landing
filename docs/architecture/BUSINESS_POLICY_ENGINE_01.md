# BUSINESS-POLICY-ENGINE-01 — Business Policy Platform Architecture

**Sprint:** BUSINESS-POLICY-ENGINE-01
**Status:** Complete
**TSC Baseline:** No regression

---

## Objective

Single infrastructure for all business policy resolution across the Commercial Platform.
Business Engines never read JSON, tables, or constants directly.
They always ask the Policy Engine.

---

## Architecture

```
Business Engines (Coverage, Replenishment, Order, Markdown...)
        |
        v
   Policy Engine API
   registerPolicy() / resolvePolicy() / evaluatePolicy()
   listPolicies() / validatePolicy() / deactivatePolicy()
        |
        v
   Resolution Engine
   Tenant -> Category -> Scope -> Conditions -> Priority -> Version -> Active -> Result
        |
        v
   Evidence Layer
   Every resolution produces traceable evidence
   Bridges to CommercialDomainEvidence
```

---

## File Structure

```
lib/comercial/business-policy/
  policy-types.ts          -- Canonical types (FASE 1-3)
  policy-resolution.ts     -- Resolution algorithm (FASE 4)
  policy-versioning.ts     -- Version management (FASE 5)
  policy-evidence.ts       -- Evidence integration (FASE 6)
  policy-registry.ts       -- Official registry (FASE 7)
  policy-validation.ts     -- Structural validation
  policy-engine.ts         -- Public API (FASE 8)
  policy-compatibility.ts  -- Coverage Engine bridge (FASE 9)
  index.ts                 -- Barrel exports
```

---

## Policy Categories (12)

| Category | Description |
|---|---|
| COVERAGE | Min/ideal/max stock thresholds |
| STORE | Store classification, capacity, schedules |
| REPLENISHMENT | Replenishment triggers, approval rules |
| ORDER | Order validation, credit checks |
| VENDOR | Vendor assignment, territories, commissions |
| CUSTOMER | Customer classification, credit limits, payment terms |
| INVENTORY | Aging, rotation, safety stock |
| IMPORT | Lead times, MOQ, supplier selection |
| MARKDOWN | Discount rules, aging-based pricing |
| ALERT | Alert thresholds, notifications |
| REPORT | Report scheduling, retention |
| GENERAL | Cross-cutting policies |

---

## Policy Scopes (13)

Ordered by specificity (most specific wins):

| Rank | Scope | Description |
|---|---|---|
| 1 | REFERENCE | Specific product reference |
| 2 | SIZE | Size class |
| 3 | PRODUCT | Single product |
| 4 | SUBGROUP | Product subgroup |
| 5 | PRODUCT_CLASS | Product class |
| 6 | WAREHOUSE | Warehouse |
| 7 | STORE | Store |
| 8 | CUSTOMER | Customer |
| 9 | VENDOR | Vendor |
| 10 | ORDER | Order type |
| 11 | BUSINESS_LINE | Business line |
| 12 | TENANT | Tenant-wide |
| 13 | GLOBAL | All tenants |

---

## Resolution Algorithm

1. **Tenant filter** — only policies for the requesting tenant
2. **Category filter** — only policies matching the requested category
3. **Status filter** — only ACTIVE policies (DRAFT, DEPRECATED, ARCHIVED excluded)
4. **Scope matching** — policy scopes must overlap with context scopes
5. **Condition evaluation** — all conditions must pass
6. **Score computation** — weighted: scope specificity (50%) + condition match (30%) + priority (20%)
7. **Selection** — highest score wins; ties broken by priority (lower = wins)
8. **Evidence** — full trace of what was selected, what was discarded, and why

---

## Versioning Contract

- Every policy has a `BusinessPolicyVersion` with version, createdAt, createdBy, activatedAt, deprecatedAt, previousVersion, changeNote
- **Never overwrite** — new versions are created with DRAFT status
- Activation and deprecation are explicit state transitions
- Version transitions are validated (cannot change tenant, category, or ID across versions)

---

## Evidence Integration

Every resolution produces `BusinessPolicyEvidence`:
- What policy was selected (ID, name, version, priority)
- How many candidates evaluated
- How many discarded and why
- Full resolution path
- Confidence score

Bridges to `CommercialDomainEvidence` via `policyEvidenceToCommercialEvidence()`.

---

## Coverage Engine Compatibility

`policy-compatibility.ts` provides:
- `CoverageRuleShape` — mirrors Coverage Engine rule shape without importing it
- `coverageRuleToPolicy()` — converts a coverage rule to a BusinessPolicy
- `buildCoverageResolutionContext()` — builds resolution context from coverage parameters

Coverage Engine can migrate incrementally:
1. Convert existing rules to policies via `coverageRuleToPolicy()`
2. Use `buildCoverageResolutionContext()` to build resolution contexts
3. Call `resolvePolicy()` instead of internal `resolveRule()`
4. No behavior change — same rules, same results, new infrastructure

---

## Constraints

- No Prisma — in-memory store (future: Prisma repository)
- No React, Next, UI
- No SAG, SAP, DIAN
- No tenant-specific rules
- No Coverage Engine internals imported
- All policies are multi-tenant (tenantId required)
- All resolutions produce evidence

---

## Validation

- `scripts/test-business-policy-engine.ts` — Functional tests
- `scripts/validate-business-policy-engine.ts` — Structural validation
