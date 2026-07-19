# STORE-POLICY-TEMPLATES-01 — Store Policy Templates

**Sprint:** STORE-POLICY-TEMPLATES-01
**Depends on:** BUSINESS-POLICY-ENGINE-01, BUSINESS-POLICY-PACKS-01
**Status:** Complete
**TSC Baseline:** No regression

---

## What This Is

A catalog of reusable Store Policy Templates.
Templates declare what types of rules a tenant can configure — never specific values.

After this sprint, Agentik knows what types of rules a business can have,
but does not yet know any specific tenant's rules.

---

## Templates (6 Active + 4 Planned)

### Active

| Template | Category | Precedence | Purpose |
|---|---|---|---|
| STORE_COVERAGE | COVERAGE | BASE | Min/ideal/max stock thresholds per store/product |
| STORE_ASSORTMENT | STORE | STANDARD | Which products a store should carry |
| STORE_SIZE_TARGET | COVERAGE | STANDARD | Target size distribution within a product class |
| STORE_STOCK_RESTRICTION | STORE | RESTRICTION | Hard stock limits that override coverage |
| STORE_PRODUCT_EXCEPTION | COVERAGE | EXCEPTION | Custom thresholds for specific products |
| STORE_DEVIATION_ALERT | ALERT | ALERT | Alerts when store metrics deviate from targets |

### Planned (not instantiable)

| Template | Category | Purpose |
|---|---|---|
| STORE_TRANSFER | REPLENISHMENT | Inter-store/warehouse transfer rules |
| STORE_ROTATION | INVENTORY | Rotation rate and aging thresholds |
| STORE_MARKDOWN | MARKDOWN | Aging-based discount triggers |
| STORE_CAPACITY | STORE | Physical capacity constraints |

---

## Template Contract

Every template declares:

```
templateId          — Unique identifier (e.g., "tpl-store-coverage")
templateType        — Enum value (e.g., STORE_COVERAGE)
category            — Policy Engine category (COVERAGE, STORE, ALERT, etc.)
displayName         — Human-readable name
description         — What this template controls
supportedScopes     — Which scopes can be used (GLOBAL, TENANT, STORE, etc.)
supportedConditions — What conditions can be applied (productClass, sizeClass, etc.)
supportedActions    — What actions the policy produces (SET_THRESHOLD, RESTRICT, etc.)
requiredParameters  — Parameters that MUST be provided at instantiation
optionalParameters  — Parameters that CAN be provided
precedenceGroup     — BASE < STANDARD < EXCEPTION < RESTRICTION < ALERT
version             — Template version
metadata            — Author, dates, compatible engines, tags, usage hint
```

---

## Precedence Groups

| Group | Value | Meaning |
|---|---|---|
| BASE | 100 | Foundational defaults — evaluated first, can be overridden |
| STANDARD | 200 | Normal business rules |
| EXCEPTION | 300 | Per-product or per-store overrides |
| RESTRICTION | 400 | Hard limits — always enforced |
| ALERT | 500 | Monitoring only — no action, just notification |

---

## How Templates Will Be Instantiated

A future sprint (e.g., STORE-POLICIES-CASTILLITOS-01) will:

1. Choose a template: `resolveTemplate("STORE_COVERAGE")`
2. Provide tenant-specific values:
   ```
   {
     tenantId: "tenant-x",
     policyName: "Coverage for Product Type A",
     parameterValues: { minQty: N, idealQty: M, maxQty: K },
     scopeBindings: [{ scope: "PRODUCT_CLASS", scopeValue: "type-a" }],
     ...
   }
   ```
3. Build a policy: `buildStoreCoverageTemplate(input)`
4. Register in Policy Engine: `registerPolicy(result.policy)`
5. Add to a Pack: Pack references the new policy
6. Activate the Pack: `activatePack(tenantId, packId, user)`

The template itself never changes. Only tenant-specific instances are created.

---

## Compatibility

Templates produce `BusinessPolicy` objects compatible with:
- **Policy Engine** — `registerPolicy()`, `resolvePolicy()`, `evaluatePolicy()`
- **Policy Packs** — Referenced via `BusinessPolicyPackReference`
- **Evidence Engine** — Resolution produces `BusinessPolicyEvidence`
- **Versioning** — Policies inherit version tracking from Policy Engine

---

## File Structure

```
lib/comercial/business-policy/templates/store/
  store-policy-template-types.ts       — Types and constants
  store-policy-template-registry.ts    — 10 template definitions + registry API
  store-policy-template-validation.ts  — Template + instantiation validation
  store-policy-template-builders.ts    — 6 builder functions
  index.ts                             — Barrel exports
```

---

## Constraints

- No tenant-specific values
- No store names, numbers, or business data
- No Prisma, React, Next, UI
- No SAG, Coverage Engine, Tiendas, Maletas, Pedidos
- Templates are purely structural — they describe shapes, not instances
