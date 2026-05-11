# TENANT_ACTIVATION_ROADMAP.md
# Sprint TA-01 — Phase F: Implementation Roadmap

**Date:** 2026-05-06
**Status:** Roadmap — no code changes in this sprint

---

## 0. What Was Delivered in TA-01 (This Sprint)

| Deliverable | File | Status |
|---|---|---|
| Phase A — Audit | `TENANT_ACTIVATION_AUDIT.md` | ✅ |
| Phase B — Architecture | `TENANT_ACTIVATION_ARCHITECTURE.md` | ✅ |
| Phase C — Connector contract | `CONNECTOR_ACTIVATION_CONTRACT.md` | ✅ |
| Phase D — Onboarding flow | `TENANT_ONBOARDING_FLOW.md` | ✅ |
| Phase E — Jupiter blueprint | `JUPITER_PETS_ACTIVATION_BLUEPRINT.md` | ✅ |
| Phase F — Roadmap | `TENANT_ACTIVATION_ROADMAP.md` | ✅ (this file) |

**Critical rule for all subsequent sprints:**
- Do NOT touch `castillitos` org slug, ID, or existing connector
- All changes are additive (new models, new rows, new config)
- No secrets in code — all credentials via environment variables

---

## TA-02 — Data Model + Config Layer

**Goal:** Replace hardcoded assumptions with DB-backed or generic-config patterns.

### Tasks

#### TA-02-1: OrgGroup Model

New Prisma models (additive migration):

```prisma
model OrgGroup {
  id          String @id @default(cuid())
  name        String
  slug        String @unique
  settingsJson Json?
  organizations OrgGroupMember[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model OrgGroupMember {
  id       String @id @default(cuid())
  groupId  String
  orgId    String
  role     String @default("MEMBER")   // MEMBER | LEAD
  sortOrder Int   @default(0)
  group        OrgGroup     @relation(...)
  organization Organization @relation(...)
  @@unique([groupId, orgId])
}
```

Add to `Organization`:
```prisma
orgGroupMemberships OrgGroupMember[]
```

#### TA-02-2: OnboardingChecklist Model

```prisma
model OnboardingChecklist {
  id             String  @id @default(cuid())
  organizationId String  @unique
  businessModeSet      Boolean @default(false)
  erpConnected         Boolean @default(false)
  erpSampleVerified    Boolean @default(false)
  erpFirstSyncDone     Boolean @default(false)
  shopifyConnected     Boolean @default(false)
  whatsappConnected    Boolean @default(false)
  socialConnected      Boolean @default(false)
  brandVoiceSet        Boolean @default(false)
  modulesActivated     Boolean @default(false)
  completedAt DateTime?
  updatedAt   DateTime @updatedAt
  organization Organization @relation(...)
}
```

#### TA-02-3: Marketing Studio Config — Move to DB

Replace hardcoded `ALL_TENANT_CONFIGS` in `lib/marketing-studio/tenant-config.ts` with a DB-backed model:

```prisma
model TenantMarketingConfig {
  id             String  @id @default(cuid())
  organizationId String  @unique
  tenantName     String
  active         Boolean @default(true)
  configJson     Json    // full TenantMarketingConfig blob
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  organization Organization @relation(...)
}
```

Migration strategy:
1. Add model
2. Seed Castillitos and Do Jeans configs from current code into DB
3. Update `getTenantConfig(tenantId)` to read from DB (with in-memory fallback for existing hardcoded entries during transition)
4. Remove hardcoded entries from code after verification

#### TA-02-4: Remove Hardcoded Source Names from Sync Route

`app/api/orgs/[orgSlug]/connectors/[connectorId]/sync/route.ts:94,105,149`

Replace:
```typescript
if (connector.source === "castillitos_crm") { ... }
```

With:
```typescript
if (connector.source === "hubspot" || connector.source === "crm_generic") { ... }
```

Or make the behavior driven by `connector.modules` rather than `connector.source`.

#### TA-02-5: Remove `tenantId === "castillitos"` Branch

`app/api/orgs/.../foto-estudio/sessions/[sessionId]/generate/route.ts:259`

Replace hardcoded branch with tenant config lookup:
```typescript
const tenantConfig = await getTenantConfig(orgSlug);
const negativePrompt = tenantConfig?.fotoEstudio?.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT;
```

**Estimated effort:** 3–4 days
**Risk:** LOW — all additive, existing Castillitos behavior preserved via seeded DB rows
**Migration required:** YES — OrgGroup + OnboardingChecklist + TenantMarketingConfig

---

## TA-03 — PYA Multi-Company Connector

**Goal:** Validate that the existing SAG/PYA adapter is fully generic for a second company (Jupiter Pets) with a different token and database code.

### Tasks

#### TA-03-1: Audit Adapter for Hardcoded Company Assumptions

Review `lib/connectors/adapters/sag-pya-soap/`:
- `index.ts` — verify all company-specific values read from `connector.config`
- `mappers.ts` — verify field mapping is company-agnostic
- `storage.ts` — verify all upserts use `organizationId` from connector (not hardcoded)

Expected findings from audit:
- baseUrl, token, database, codigoFuente, kaNiFuente already read from config
- FUENTES registry (`lib/sag/master-data/castillitos-fuentes.ts`) is Castillitos-specific — Jupiter needs its own FUENTES

#### TA-03-2: FUENTES Registry — Make Generic

Current: `lib/sag/master-data/castillitos-fuentes.ts` — hardcoded for Castillitos.

New approach: FUENTES data should live in `connector.config.fuentes` or a separate DB table keyed by connectorId. Jupiter Pets gets its own FUENTES map without touching Castillitos.

#### TA-03-3: Admin Script — Create Jupiter Connector

```typescript
// scripts/_create-jupiter-connector.ts
// Uses env vars, never hardcodes credentials
```

Script creates the Connector row from environment variables. Runnable as:
```bash
ORG_SLUG=jupiter-pets npx dotenv-cli -e .env.jupiter -- npx tsx scripts/_create-jupiter-connector.ts
```

#### TA-03-4: Dry-Run Validation

After connector creation, run a sample sync and verify:
- Jupiter customers ≠ Castillitos customers (different organizationId)
- CustomerProfile table shows distinct orgId partitions
- No Castillitos data touched

**Estimated effort:** 2–3 days
**Risk:** LOW — adapter already generic; changes are additive config
**Migration required:** NO (data changes only)

---

## TA-04 — Workspace Switcher Enhancement

**Goal:** Make TenantSwitcher group-aware for all user roles.

### Tasks

#### TA-04-1: Group Context in TenantSwitcher

Current: Shows flat list of all orgs for SUPER_ADMIN.
New: Shows orgs grouped by OrgGroup, with group header.

```
Castillitos Group
├── Castillitos Kids  (castillitos)
└── Jupiter Pets      (jupiter-pets)

Other
└── Do Jeans          (do-jeans)
```

API: `GET /api/user/orgs` → extend to return `groupName`, `groupSlug`

#### TA-04-2: ORG_ADMIN Visibility

Currently: ORG_ADMIN sees `showSwitcher = false` — static card only.
New: ORG_ADMIN with multi-org membership sees switcher showing only their own orgs.

Change in `app/(app)/[orgSlug]/layout.tsx`:
```typescript
const showSwitcher = isInternalRole(role) || memberships.length > 1;
```

#### TA-04-3: Preserve Current Module on Switch

When switching from `castillitos/torre_control` to `jupiter-pets`, land on `jupiter-pets/torre_control` (if module is enabled there).

**Estimated effort:** 1–2 days
**Risk:** VERY LOW — UI-only change
**Migration required:** NO

---

## TA-05 — Onboarding Checklist UI

**Goal:** First-run guided activation experience for new orgs.

### Tasks

#### TA-05-1: Onboarding Banner in Layout

When `OnboardingChecklist.completedAt` is null, show a sticky banner:
```
"Tu empresa está en configuración — Ver progreso (4/9 pasos completos)"
```

#### TA-05-2: Onboarding Panel Page

New route: `/{orgSlug}/onboarding`
- Shows all steps with status
- Each step has CTA button to complete it
- Progress bar (% complete)

#### TA-05-3: Step Completion Hooks

After each activation action (connector sync, WhatsApp config save, brand voice set), update the relevant OnboardingChecklist boolean via server action.

#### TA-05-4: Readiness Checklist Component

Reusable checklist component — also shown in Dashboard when checklist is incomplete.

**Estimated effort:** 3–4 days
**Risk:** LOW — additive UI
**Migration required:** YES — OnboardingChecklist model (done in TA-02)

---

## TA-06 — Connector Health Dashboard

**Goal:** Give operators visibility into connector state without needing to read DB logs.

### Tasks

#### TA-06-1: ConnectorActivationState Service

Implement `lib/connectors/activation-state.ts`:
- `getConnectorActivationState(connectorId)` — derives state from Connector + ConnectorRun history
- `getOrgConnectorStates(orgId)` — all connectors for an org

#### TA-06-2: Health Dashboard Page

New route: `/{orgSlug}/integrations/health`
- One card per connector
- Shows: status pill, last sync time, rows imported, error message
- CTA: "Re-sync" / "Fix credentials" / "View logs"

#### TA-06-3: Provider Registry

`lib/connectors/provider-registry.ts`:
- PROVIDER_REGISTRY with requiredFields, requiredScopes, defaultModules per provider
- Used by health dashboard to show what's missing
- Used by onboarding flow to render the right form

#### TA-06-4: Connector Validate Endpoint

`POST /api/orgs/{orgSlug}/connectors/{id}/validate`:
- For sag_pya_soap: test SOAP endpoint reachability + auth
- For shopify: test Admin API ping
- Updates Connector.status based on result
- Returns `{ ok: boolean; error?: string; latencyMs: number }`

**Estimated effort:** 3–4 days
**Risk:** LOW — additive
**Migration required:** NO

---

## TA-07 — Jupiter Pets Pilot Activation

**Goal:** Activate Jupiter Pets as the first clean tenant using the new architecture.

### Tasks

#### TA-07-1: Create Organization + Group

Admin script or SUPER_ADMIN panel:
```typescript
// Create OrgGroup "Castillitos Group"
// Add castillitos to group as LEAD
// Create Organization jupiter-pets
// Add jupiter-pets to group as MEMBER
// Create OnboardingChecklist for jupiter-pets
// Seed TenantModule defaults (erp_first mode)
```

#### TA-07-2: PYA Connector Setup

Prerequisite: Andrés provides Jupiter PYA credentials.

```bash
# Using dedicated .env file for Jupiter (never committed)
ORG_SLUG=jupiter-pets npx dotenv-cli -e .env.jupiter -- npx tsx scripts/_create-jupiter-connector.ts
```

#### TA-07-3: Sample + Full Sync

1. Sample sync (50 rows per module) → verify mapping
2. Andrés reviews sample data
3. Full sync → all modules
4. Verify row counts + cartera totals

#### TA-07-4: Marketing Studio Config

Seed Jupiter's TenantMarketingConfig via admin script or panel.
Configure: brandVoice, allowedPresets, categoryAliases, luca config.

#### TA-07-5: Group CEO Dashboard

New route: `/castillitos-group/executive`
- Side-by-side KPI comparison: Castillitos Kids vs Jupiter Pets
- Shared metrics: cartera, ventas, clientes, Marketing Studio activity
- Role access: MANAGER+ in any org of the group

#### TA-07-6: Onboarding Checklist Completion

Walk through `OnboardingChecklist` steps for Jupiter:
- ERP connected → FIRST_SYNC_COMPLETED → ✅
- Brand voice set → ✅
- Modules activated → ✅
- `completedAt` set → banner dismissed

**Estimated effort:** 3–5 days (includes coordination with Jupiter team for credentials)
**Risk:** MEDIUM — real external system; sample verification is critical gate
**Migration required:** YES — OrgGroup + OnboardingChecklist (TA-02)

---

## Full Timeline

```
TA-01  [DONE]   Architecture documents (this sprint)
TA-02  [NEXT]   Data model + config generalization — 3–4 days
TA-03           PYA multi-company adapter audit + FUENTES — 2–3 days
TA-04           Workspace switcher group-aware — 1–2 days
TA-05           Onboarding checklist UI — 3–4 days
TA-06           Connector health dashboard — 3–4 days
TA-07           Jupiter Pets pilot activation — 3–5 days
```

**Critical path:** TA-02 → TA-03 → TA-07
**Parallel path:** TA-04 + TA-05 + TA-06 can run in parallel after TA-02

---

## Invariants — Must Hold Across All Sprints

1. `castillitos` org slug and ID never change
2. All existing Castillitos sync, reconciliation, and dashboard behavior preserved
3. No credentials in source code at any point
4. No company-specific names in generic adapter code (sag-pya-soap, shopify adapters)
5. Every new business unit follows the same activation sequence — no special-casing
6. `organizationId` is always the primary isolation boundary for business data
7. The TenantSwitcher remains the only cross-org navigation surface
