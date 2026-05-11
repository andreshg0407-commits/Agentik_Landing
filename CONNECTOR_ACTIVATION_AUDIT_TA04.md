# CONNECTOR_ACTIVATION_AUDIT_TA04.md
## TA-04 — Connector Activation Flow

**Sprint:** TA-04
**Date:** 2026-05-06
**Status:** Phases A + C + D + E + F complete

---

## 1. Phase A: Activation Domain Audit

### 1.1 Organization Creation Flow

**Finding: NO self-service org creation API exists.**

- Organizations are created directly via Prisma seed / admin scripts.
- No `POST /api/orgs` endpoint exists.
- `requireOrgAccess(orgSlug)` throws `ORG_NOT_FOUND` if the org is missing.

**Blocker:** A future `POST /api/admin/orgs` endpoint is required before full self-service onboarding.

---

### 1.2 Connector Creation Flow

**Finding: Connector creation API exists and is functional.**

```
POST /api/orgs/[orgSlug]/connectors
Body: { source, name, modules, config }
Upsert by: (organizationId, source, name)
Default status: INACTIVE
```

- No credential validation before creation.
- No FUENTES discovery integrated.
- PATCH endpoint supports shallow config merge, module replacement, status toggle.

---

### 1.3 OnboardingChecklist Usage

**Finding: Model exists (TA-02) but ZERO code reads or writes it before TA-04.**

- `OnboardingChecklist` Prisma model: added in migration `20260506010000`.
- First writer: `lib/activation/connector-provisioner.ts` (this sprint).
- Fields written: `erpConnected`, `erpSampleVerified`.

---

### 1.4 Existing Setup APIs

| API | Status | Notes |
|-----|--------|-------|
| `POST /api/orgs/[orgSlug]/connectors` | EXISTS | No validation, status=INACTIVE |
| `PATCH /api/orgs/[orgSlug]/connectors/[id]` | EXISTS | Shallow config merge |
| `POST /api/orgs/[orgSlug]/connectors/[id]/sync` | EXISTS | Full sync trigger |
| `POST /api/orgs/[orgSlug]/connectors/[id]/dry-run` | EXISTS | Non-destructive probe |
| `POST /api/admin/orgs` | MISSING | Blocker for self-service |
| `POST /api/orgs/[orgSlug]/connectors/validate` | MISSING | Validation-only endpoint |
| `GET /api/orgs/[orgSlug]/onboarding` | MISSING | No onboarding progress API |

---

### 1.5 Module Enablement

```typescript
// lib/tenant/modules.ts
setModuleEnabled(orgId, moduleKey, boolean)   // upsert TenantModule row
getEnabledModules(orgId)                       // returns Set<ModuleKey>

// lib/bootstrap/module-bundles.ts
resolveModuleSet(["commercial", "finance"])    // returns union Set<ModuleKey>
```

- Open-by-default: no rows = all modules enabled (backward compat for existing tenants)
- Opt-in modules: whatsapp, inventory, workforce, copilot, etc.
- No batch enablement function — must loop over keys individually

---

## 2. Activation Lifecycle

```
[1] CREATE ORG          prisma.organization.create (manual today)
[2] CHOOSE PROVIDER     sag_pya_soap | siigo | shopify | ...
[3] VALIDATE CREDS      validateConnector() → ConnectorValidationResult
[4] DISCOVER FUENTES    discoverFuentesMap() → FuentesDiscoveryResult  (SAG only)
[5] PROVISION           provisionConnector() → ProvisionResult
                          → upsert Connector row (status=ACTIVE)
                          → update OnboardingChecklist
[6] ENABLE MODULES      setModuleEnabled() for each bundle key
[7] FIRST SYNC          POST /connectors/[id]/sync per module
[8] CHANNELS (opt-in)   shopify / whatsapp connectors
[9] MARK COMPLETE       OnboardingChecklist.completedAt = now()
```

---

## 3. TA-04 Deliverables

| File | Phase | Purpose |
|------|-------|---------|
| `lib/activation/types.ts` | F | Shared types: ActivationStep, ActivationDiagnostic, ValidationResult, FuenteRow, ProvisionResult |
| `lib/activation/connector-validator.ts` | C | 4-stage validation pipeline (connectivity → auth → metadata → sample) |
| `lib/activation/fuentes-discovery.ts` | D | FUENTES table discovery → fuentesMap |
| `lib/activation/connector-provisioner.ts` | E | Provisioning service: validate + create Connector + update Checklist |
| `scripts/_create-jupiter-connector.ts` | E | Refactored: delegates to provisionConnector() |
| `scripts/_discover-fuentes.ts` | D | CLI wrapper for discoverFuentesMap() |

**TypeScript:** Zero errors across all new files.
**Backward compatibility:** Zero changes to existing adapters, sync routes, or DB schema.

---

## 4. Remaining Blockers

| Blocker | Severity |
|---------|----------|
| No org creation API | HIGH |
| No onboarding wizard UI | HIGH |
| OnboardingChecklist only partially wired | MEDIUM |
| No standalone `/connectors/validate` API endpoint | MEDIUM |
| FUENTES not auto-discovered during provisioning | MEDIUM |
| Siigo/Shopify validators not implemented (stubs) | LOW |
| `erpFirstSyncDone` not set automatically post-sync | LOW |

---

## 5. Technical Debt Discovered

- `lib/connectors/adapters/index.ts`: `customerStorageMux` and `orderStorageMux` hardcode source names — new providers require editing this file
- `CastillitosCrmAdapter` is not reusable for other CRMs — no generic CRM adapter pattern
- `EMPRESA_CODES`, `ALMACEN_CODES`, `WEB_CODES` in `mappers.ts` are Castillitos channel codes — may not apply to Jupiter Pets (verify against FUENTES.xlsx)
- `CASTILLITOS_SOURCE_SEMANTIC_RULES` remains imported in `sag-pya-soap/index.ts` as fallback — valid pattern but dependency exists

---

## 6. Recommended TA-05

**TA-05 — Module Enablement + Onboarding Progress API**

1. `POST /api/admin/orgs` — create organization (SUPER_ADMIN)
2. `POST /api/orgs/[orgSlug]/connectors/validate` — standalone validation endpoint
3. `POST /api/orgs/[orgSlug]/activate` — apply module bundle + update checklist
4. `GET /api/orgs/[orgSlug]/onboarding` — checklist progress API
5. `applyModuleBundle(orgId, bundles[])` — batch enablement helper
6. Wire `erpFirstSyncDone` in sync route post-sync hook
7. Wire `modulesActivated` after bundle application

Estimated scope: ~8 files, no migrations, additive-only.

---
*Produced by Sprint TA-04 — 2026-05-06*
