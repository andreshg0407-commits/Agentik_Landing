# TENANT_ACTIVATION_AUDIT.md
# Sprint TA-01 — Phase A: Current Tenant/Workspace Model Audit

**Date:** 2026-05-06
**Status:** Architecture audit — READ-ONLY, no changes

---

## 1. Current Data Model Summary

### Organization (`prisma/schema.prisma:260`)

```
Organization
  id             String @id
  name           String
  slug           String @unique          ← global unique, drives all routing
  type           OrgType                 ← ENTERPRISE (only value used)
  status         OrgStatus               ← ACTIVE / SUSPENDED / DELETED
  settingsJson   Json?                   ← branding/preferences blob
```

**All business data is scoped to organizationId:**
- CustomerReceivable, SaleRecord, CollectionRecord, CollectionAllocation
- CustomerProfile, CRMOpportunity, CRMActivity, CRMQuote
- StudioSession, WhatsAppConversation, WhatsAppConfig
- Connector, ConnectorRun, ConnectorCursor
- TenantModule, BusinessAlert

This means: one Organization = one fully isolated data silo.

---

### Workspace (`prisma/schema.prisma:1217`)

```
Workspace
  id             String @id
  organizationId String                  ← FK to Organization
  type           WorkspaceType           ← BRAND (only value defined)
  name           String
  slug           String                  ← unique within org only
  description    String?
  logoUrl        String?
  settingsJson   Json?
  contactName / contactEmail / contactPhone
```

**Workspace currently holds:**
- `WorkspaceMembership[]` — user-to-workspace access
- `Project[]`, `Document[]`, `ProductSnapshot[]`, `OrderSnapshot[]`

**Workspace does NOT hold:**
- Connector — no workspaceId on Connector model
- CustomerReceivable, SaleRecord, CollectionRecord — no workspaceId
- StudioSession — no workspaceId
- TenantModule — no workspace-level feature flags
- WhatsAppConfig — org-level only

**Assessment:** Workspace currently serves as a branding/client-workspace concept (like an agency managing client brands). It is NOT a business-unit isolation boundary. It cannot carry independent connectors or business data.

---

### Membership (`prisma/schema.prisma:355`)

```
Membership
  organizationId String
  userId         String
  role           Role    ← VIEWER/BILLING/OPERATOR/MANAGER/ORG_ADMIN/AGENTIK_ADMIN/SUPER_ADMIN
  permissionsJson Json?

WorkspaceMembership
  workspaceId String
  userId      String
  role        Role
```

Two layers: org-level membership + workspace-level membership. Role hierarchy is defined in `lib/auth/module-access.ts`.

---

### Connector (`prisma/schema.prisma:1823`)

```
Connector
  id             String @id
  organizationId String                  ← FK to Organization
  source         String                  ← "sag_pya_soap" | "shopify" | "castillitos_crm" | …
  name           String
  status         ConnectorStatus         ← INACTIVE / ACTIVE / ERROR / PAUSED
  config         Json                    ← credentials blob (encrypted at rest)
  modules        String[]                ← enabled modules: ["orders","customers",…]

  @@unique([organizationId, source, name])
```

**Key facts:**
- No `workspaceId` — connectors cannot be workspace-scoped
- Config is a freeform JSON blob — credentials live here (no DB column per field)
- Each connector has independent `ConnectorCursor`, `ConnectorRun`, `ConnectorMapping`
- Multiple connectors per org are supported (different `source` or different `name`)

---

### Feature Flags / Module Access (`lib/tenant/modules.ts`)

```
TenantModule
  organizationId String
  moduleKey      String          ← ModuleKey enum (28 values)
  enabled        Boolean

  @@unique([organizationId, moduleKey])
```

**Semantics:**
- Open by default: no rows = all non-opt-in modules enabled
- Opt-in modules (whatsapp, inventory, copilot, etc.) require explicit `enabled: true`
- Module resolution: `getEnabledModules(orgId)` → intersect with `filterModulesByRole(mods, role)`
- No workspace-level module flags — modules are per-org only

---

### WhatsApp (`prisma/schema.prisma:2711`)

```
WhatsAppConfig
  organizationId String @unique          ← ONE config per org, hard constraint
  phoneNumberId  String                  ← Meta Cloud API phone_number_id
  wabaId         String                  ← WhatsApp Business Account ID
  webhookSecret  String
  displayName    String
  active         Boolean
```

**Critical finding:** `@unique` on organizationId means one WhatsApp phone number per org. Multiple business units under the same org cannot have separate WhatsApp identities.

---

### Marketing Studio Tenant Config (`lib/marketing-studio/tenant-config.ts`)

**Current state:** Hard-coded at compile time.

```typescript
export const ALL_TENANT_CONFIGS = [
  DO_JEANS_CONFIG,       // tenantId: "do-jeans"
  CASTILLITOS_CONFIG,    // tenantId: "castillitos"
] as const;
```

- Adding a new tenant requires a code change + deploy
- `tenantId` maps to org slug by convention (not enforced by DB)
- No DB-backed tenant marketing config
- `categoryAliases`, `brandVoice`, `allowedPresets`, `luca` config all hardcoded

---

### Routing (`app/(app)/[orgSlug]/`)

All app routes follow: `/(app)/[orgSlug]/[module]/...`

- Routing parameter: **`orgSlug` only** — no workspace segment
- `TenantSwitcher` navigates between orgs via `router.push(`/${newSlug}`)` — works for multi-org
- Module resolution: `resolveModuleForPath(orgSlug, pathname)` → `getEnabledModules(orgId)` → `filterModulesByRole(mods, role)`
- API routes: `app/api/orgs/[orgSlug]/...` — org-scoped

---

## 2. Five Audit Questions Answered

### Q1: Does Agentik currently support multiple business units under one organization?

**No — not as independent units.**

The `Workspace` model exists and is org-scoped, but it cannot carry independent connectors, business data, WhatsApp configs, or module flags. A workspace under Castillitos org shares all CustomerReceivable, SaleRecord, and CollectionRecord data with the parent org. There is no data isolation at the workspace level.

What exists:
- TenantSwitcher allows SUPER_ADMIN/AGENTIK_ADMIN to switch between separate Organizations
- WorkspaceMembership allows user scoping within an org's workspaces
- Project.workspaceId allows scoping technical initiatives to a workspace

What does not exist:
- Workspace-scoped connectors
- Workspace-scoped business data
- Workspace-scoped TenantModules
- Workspace-scoped WhatsApp

**Conclusion:** True multi-business-unit support requires either (a) separate Organization records per business unit, or (b) significant schema extensions to make Workspace a first-class data isolation boundary.

---

### Q2: Does each workspace support its own connector credentials?

**No.**

`Connector.organizationId` — no `workspaceId`. All connectors under an org share the same `organizationId` namespace. A workspace cannot own a connector independently.

Multiple connectors for the same source are supported at the org level via `@@unique([organizationId, source, name])` — so two PYA connectors can exist under one org if they have different names, but they both sync into the same CustomerReceivable table with the same organizationId.

---

### Q3: Does routing assume org only, or org + workspace?

**Org only.**

All routes: `/(app)/[orgSlug]/...`. No workspace path segment anywhere in the routing tree. The TenantSwitcher shows org names (not workspace names) in its dropdown.

---

### Q4: Can dashboards be filtered by workspace/business unit?

**No — currently impossible.**

All major data models (CustomerReceivable, SaleRecord, CustomerProfile, CollectionRecord, StudioSession) lack a `workspaceId` field. There is no workspace dimension on any KPI query. The cartera, sales, finance, and Customer360 dashboards are org-wide with no sub-filter capability.

The `ProductSnapshot.workspaceId` and `OrderSnapshot.workspaceId` exist, suggesting this was planned but never propagated to the core financial models.

---

### Q5: What currently blocks Jupiter Pets from being activated cleanly?

Six concrete blockers:

| # | Blocker | Location | Severity |
|---|---------|----------|----------|
| 1 | **WhatsAppConfig `@unique` on organizationId** | `prisma/schema.prisma:2711` | HIGH — Jupiter needs its own phone/WABA |
| 2 | **Marketing Studio tenant-config is hardcoded** | `lib/marketing-studio/tenant-config.ts` | HIGH — requires code change + deploy per tenant |
| 3 | **`castillitos_crm` hardcoded in sync route** | `app/api/orgs/[orgSlug]/connectors/[connectorId]/sync/route.ts:94,105,149` | HIGH — not generic |
| 4 | **`tenantId === "castillitos"` in foto-estudio generate route** | `app/api/orgs/.../generate/route.ts:259` | MEDIUM — hardcoded prompt branch |
| 5 | **No workspace-level connector isolation** | Schema gap | HIGH — Jupiter needs its own PYA token/company |
| 6 | **No workspace-level business data isolation** | Schema gap | HIGH — CustomerReceivable, SaleRecord etc. have no workspaceId |

---

## 3. Architecture Verdict

### Recommended path: Organization-per-business-unit

The cleanest and safest activation path for Jupiter Pets is to create it as a **separate Organization** in the DB (`slug: "jupiter-pets"`).

Reasons:
1. All business data (CustomerReceivable, SaleRecord, CollectionRecord, CustomerProfile) is already org-scoped — full isolation with zero schema changes
2. WhatsAppConfig is org-unique — Jupiter gets its own phone number/WABA with no conflict
3. TenantModule is org-scoped — independent feature flag sets per business unit
4. Connector is org-scoped — Jupiter's PYA token/company lives in its own Connector.config
5. TenantSwitcher already handles cross-org navigation for staff roles
6. Routing (orgSlug) already works for multiple orgs — no changes needed

The "Castillitos Group" concept = a logical grouping of Organizations. Group-level dashboards (CEO comparison) are a new layer built on top of multiple org queries — not a schema redesign.

### What needs to be added (not changed)

1. **OrgGroup** concept — logical parent grouping with no data overlap (TA-02)
2. **Marketing Studio config in DB** — replace hardcoded `ALL_TENANT_CONFIGS` with DB-backed config (TA-02)
3. **Generic connector source names** — remove `castillitos_crm` hardcoding from sync route (TA-03)
4. **Remove `tenantId === "castillitos"` branch** in foto-estudio generate — move to tenant config (TA-02)
5. **Onboarding checklist model** — track activation state per org (TA-02)
6. **Group-level dashboard** — cross-org KPI aggregation for CEO view (TA-07)

### What must NOT change

- Existing Castillitos org slug, ID, connector, or data
- Current routing structure
- TenantModule semantics (open by default)
- WhatsApp schema (non-breaking extension acceptable)
