# BUSINESS-POLICY-PACKS-01 — Business Policy Packs Architecture

**Sprint:** BUSINESS-POLICY-PACKS-01
**Depends on:** BUSINESS-POLICY-ENGINE-01
**Status:** Complete
**TSC Baseline:** No regression

---

## Objective

Define how a tenant groups, activates, and versions a complete set of policies.
A Policy Pack is the container that holds all active policies for a tenant.

---

## Concept

```
Castillitos Comercial v1 (Pack)
  |
  +-- Coverage Policies
  |     +-- cov-global (COVERAGE, v1.0.0)
  |     +-- cov-store-t01 (COVERAGE, v1.0.0)
  |
  +-- Store Policies
  |     +-- store-classification (STORE, v1.0.0)
  |
  +-- Order Policies
  |     +-- order-min-value (ORDER, v1.0.0)
  |
  +-- Vendor Policies
  |     +-- vendor-territory (VENDOR, v1.0.0)
  |
  +-- Markdown Policies
        +-- aging-discount (MARKDOWN, v1.0.0)
```

Each tenant has its own Pack. Different tenants have completely different Packs.

---

## File Structure

```
lib/comercial/business-policy/packs/
  pack-types.ts       -- Canonical types (FASE 1-2)
  pack-engine.ts      -- Engine API + versioning + compatibility (FASE 4-5-7)
  pack-validation.ts  -- Structural validation (FASE 6)
  index.ts            -- Barrel exports
```

---

## Key Contracts

### BusinessPolicyPack

| Field | Type | Description |
|---|---|---|
| id | string | Unique pack identifier |
| tenantId | string | Owning tenant |
| name | string | Human-readable name |
| description | string | null | Optional description |
| status | PackStatus | DRAFT / ACTIVE / DEPRECATED / ARCHIVED |
| categories | PolicyCategory[] | Which categories this pack covers |
| policies | PackReference[] | References to member policies |
| versionInfo | PackVersion | Version metadata |

### BusinessPolicyPackReference

| Field | Type | Description |
|---|---|---|
| policyId | string | ID of the referenced policy |
| category | PolicyCategory | Category of the policy |
| policyName | string | Name snapshot |
| policyVersion | string | Version snapshot |
| addedAt | Date | When added to pack |

---

## Rules

1. **One policy, one pack** — A policy belongs to exactly one active/draft pack per tenant
2. **One active pack per tenant** — Activating a new pack deprecates the current one
3. **Never overwrite** — New versions are DRAFT until explicitly activated
4. **Categories declared** — Pack must list which categories it covers
5. **Policy categories must match** — A policy's category must be in the pack's category list

---

## API

| Function | Description |
|---|---|
| registerPack() | Register a new pack (validates first) |
| activatePack() | Activate a draft/deprecated pack (deprecates current) |
| deactivatePack() | Deprecate the active pack |
| listPacks() | List packs with optional filters |
| resolveActivePack() | Get the active pack for a tenant |
| createPackVersion() | Create a new version from an existing pack |
| buildPackSummary() | Generate a summary view |
| diffPacks() | Compare two pack versions |
| getPoliciesForCategory() | Get policy references for a category |
| resolvePackPolicyIds() | Resolve active pack + category to policy IDs |
| validatePack() | Structural validation |

---

## Compatibility with Policy Engine

The Pack does not replace the Policy Engine. It sits on top:

```
Business Engine (e.g., Coverage)
        |
        v
   resolvePackPolicyIds(tenantId, "COVERAGE")
        |
        v
   Policy Engine: resolvePolicy(context)
        |
        v
   Result + Evidence
```

`resolvePackPolicyIds()` bridges the two: it resolves the active pack,
filters by category, and returns the policy IDs that the engine should consider.

---

## Versioning

Pack versions follow the same pattern as policy versions:
- `version`, `createdAt`, `createdBy`, `activatedAt`, `deprecatedAt`, `previousVersion`, `changeNote`
- New versions start as DRAFT
- `diffPacks()` shows ADDED / REMOVED / VERSION_CHANGED entries

---

## Constraints

- No Prisma (in-memory store)
- No React, Next, UI
- No SAG, SAP
- No Coverage/Store/Vendor engine imports
- No tenant-specific rules
- All packs are multi-tenant (tenantId required)

---

## Validation

- `scripts/test-business-policy-packs.ts` — Functional tests
- `scripts/validate-business-policy-packs.ts` — Structural validation
