# TENANT_ACTIVATION_ARCHITECTURE.md
# Sprint TA-01 — Phase B: Activation Architecture

**Date:** 2026-05-06
**Status:** Architecture design — no code changes

---

## 1. Core Principle

Agentik is the **intelligent operating layer** above specialized platforms.

```
┌─────────────────────────────────────────────────────────┐
│                  AGENTIK PLATFORM                       │
│  Orchestrate · Connect · Make Intelligent               │
├─────────────┬───────────────┬───────────────────────────┤
│  ERP / PYA  │   Shopify     │  WhatsApp · Meta · TikTok │
│  SAG / SOAP │   Commerce    │  Google Drive · Social    │
└─────────────┴───────────────┴───────────────────────────┘
```

Agentik does not replace any of these. It connects them, normalizes their data, and provides AI-powered intelligence on top.

---

## 2. Canonical Model: Organization-per-Business-Unit

### Why not Workspace-per-Business-Unit

The audit established that Workspace is not a data isolation boundary. All critical models (CustomerReceivable, SaleRecord, CollectionRecord, CustomerProfile, WhatsAppConfig) are org-scoped with no workspaceId. Making Workspace a first-class isolation unit would require adding workspaceId to ~15 models and rewriting all KPI queries — high risk, high effort, no benefit over the clean alternative.

### The Clean Model

```
OrgGroup: "Castillitos Group"
├── Organization: castillitos        (slug: castillitos)
│   ├── Connectors: PYA/SAG (Castillitos company token)
│   ├── Connectors: WhatsApp (Castillitos phone)
│   ├── TenantModules: [all enabled]
│   ├── Data: CustomerReceivable, SaleRecord, CollectionRecord
│   └── Marketing Studio: CASTILLITOS_CONFIG
│
└── Organization: jupiter-pets      (slug: jupiter-pets)
    ├── Connectors: PYA/SAG (Jupiter company token)
    ├── Connectors: WhatsApp (Jupiter phone)
    ├── TenantModules: [configured per Jupiter]
    ├── Data: CustomerReceivable, SaleRecord, CollectionRecord (isolated)
    └── Marketing Studio: JUPITER_PETS_CONFIG
```

**Separation:**
- Data: fully isolated by organizationId — zero cross-contamination
- Connectors: each org owns its own PYA token, Shopify store, WhatsApp number
- Users: shared via multiple Membership records (one user can belong to both orgs)
- Routing: `/castillitos/...` and `/jupiter-pets/...` — already works
- TenantSwitcher: staff (SUPER_ADMIN/AGENTIK_ADMIN) can switch between orgs today

---

## 3. OrgGroup — New Concept

OrgGroup is a **lightweight metadata layer** — it does not own or contain data. It exists solely for:
- CEO comparison dashboards (cross-org KPI aggregation)
- Group-level alerts (any business unit exceeds threshold)
- Navigation context ("you are viewing within Castillitos Group")
- User enrollment (one membership can grant access to all orgs in a group)

### OrgGroup Schema (TA-02, proposed)

```prisma
model OrgGroup {
  id          String   @id @default(cuid())
  name        String                         // "Castillitos Group"
  slug        String   @unique               // "castillitos-group"
  description String?
  settingsJson Json?

  organizations OrgGroupMember[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model OrgGroupMember {
  id         String   @id @default(cuid())
  groupId    String
  orgId      String
  role       String   @default("MEMBER")    // MEMBER | LEAD (lead = group parent)
  sortOrder  Int      @default(0)

  group        OrgGroup     @relation(...)
  organization Organization @relation(...)

  @@unique([groupId, orgId])
}
```

**No business data lives in OrgGroup.** Cross-org dashboards are read-only aggregations at query time.

---

## 4. What Each Workspace/Business Unit Must Support

Per-Organization capabilities (already exist or planned):

| Capability | Current State | Notes |
|---|---|---|
| Branding (name, logo, colors) | Organization.settingsJson | Extend with brandConfig blob |
| ERP/PYA connector | Connector (org-scoped) | New org = new Connector row with own token |
| Shopify connector | Connector (org-scoped) | New org = new Connector row |
| WhatsApp config | WhatsAppConfig (org-scoped) | Already isolated per org via @unique |
| Social accounts (Meta, TikTok, IG) | Not in schema yet | Will live in Connector (source: "meta_ads" etc.) |
| Marketing settings | TenantMarketingConfig (code-level today) | Move to DB in TA-02 |
| AI agent settings | Agent model (org-scoped) | Already isolated |
| Feature flags | TenantModule (org-scoped) | Already isolated |
| Sync state | ConnectorCursor (connector-scoped) | Already isolated |
| Onboarding progress | Not in schema yet | New: OnboardingChecklist in TA-02 |

---

## 5. Connector Ownership

```
Organization (jupiter-pets)
└── Connector: source=sag_pya_soap, name="Jupiter PYA"
    config: {
      baseUrl: "https://pya.example.com/api",
      token: "<jupiter-specific-token>",        ← different from Castillitos
      database: "JUPITER",                      ← different company in PYA
      codigoFuente: "...",
      kaNiFuente: "...",
    }
    modules: ["customers","products","receivables","collections","inventory"]
    ConnectorCursor: isolated per connector.id
    ConnectorRun: isolated per connector.id
```

One PYA provider → multiple organizations, each with its own Connector record containing its own credentials. The PYA adapter reads token from `connector.config` — no global hardcoding.

---

## 6. Workspace Isolation (Data)

| Model | Isolation key | Jupiter Pets query |
|---|---|---|
| CustomerReceivable | organizationId | `WHERE organizationId = 'jupiter-pets-id'` |
| SaleRecord | organizationId | `WHERE organizationId = 'jupiter-pets-id'` |
| CollectionRecord | organizationId | `WHERE organizationId = 'jupiter-pets-id'` |
| CustomerProfile | organizationId | `WHERE organizationId = 'jupiter-pets-id'` |
| StudioSession | organizationId | `WHERE organizationId = 'jupiter-pets-id'` |
| WhatsAppConfig | organizationId (@unique) | Own row, own phone number |
| TenantModule | organizationId | Own module flag set |
| Connector | organizationId | Own connector(s) with own credentials |

**All existing queries are already org-scoped.** Jupiter Pets data is automatically isolated by the organizationId filter — zero query changes needed.

---

## 7. Shared Users

A single User can hold Membership in both organizations:

```
User: andres@castillitogroup.com
├── Membership: organizationId=castillitos,   role=ORG_ADMIN
└── Membership: organizationId=jupiter-pets,  role=ORG_ADMIN
```

TenantSwitcher already lists all orgs the current user belongs to and navigates between them. For SUPER_ADMIN/AGENTIK_ADMIN, it shows all orgs in the system. For ORG_ADMIN, it shows only orgs they belong to — this is the correct behavior.

**Enhancement needed (TA-02):** TenantSwitcher currently shows slug, not org name + group context. Should show "Castillitos Kids" with tag "Castillitos Group" for clarity.

---

## 8. Shared Permissions

Permissions are independent per org. The Castillitos marketing team has no visibility into Jupiter Pets data and vice versa — unless explicitly given a Membership in both.

Cross-org access pattern:
- Group-level CEO dashboard: accessed via a dedicated route `/[groupSlug]/executive` — queries both orgs, requires Membership in at least one org of the group with MANAGER+ role
- Alternatively: SUPER_ADMIN sees all via current TenantSwitcher

---

## 9. Executive Group-Level Dashboard (CEO View)

The CEO comparison view aggregates KPIs from all orgs in a group at query time. No data duplication.

```typescript
// Conceptual — TA-07 implementation
async function getGroupKPIs(groupId: string) {
  const orgs = await getGroupOrgs(groupId);
  const kpis = await Promise.all(
    orgs.map(org => getCarteraKPIs(org.id, org.slug))
  );
  return { orgs, kpis };
}
```

Metrics compared side-by-side:
- Total receivable balance (COP)
- Cartera aging buckets (0-30, 31-60, 61-90, 90+)
- Monthly sales (SaleRecord)
- Active clients (CustomerProfile)
- Marketing Studio sessions (StudioSession)
- WhatsApp conversion (if enabled)
- Torre de Control risk signals

---

## 10. Workspace-Level Dashboards

Each org gets its own full Agentik experience at `/${orgSlug}/`:
- Dashboard → org data only
- Torre de Control → org cartera + alerts only
- Finance → org SaleRecord/receivables only
- Customer 360 → org CustomerProfile only
- Marketing Studio → org StudioSession only

No changes needed — this already works by org isolation.

---

## 11. Source of Truth

| Domain | Source of truth |
|---|---|
| Business data | PostgreSQL (org-scoped) — live, authoritative |
| Connector credentials | Connector.config JSON (encrypted at rest) |
| Module flags | TenantModule table |
| Marketing config | `lib/marketing-studio/tenant-config.ts` today → DB in TA-02 |
| Onboarding state | OnboardingChecklist table (TA-02) |
| Group structure | OrgGroup + OrgGroupMember (TA-02) |
| User access | Membership + WorkspaceMembership |
| Routing | Next.js `[orgSlug]` dynamic segment |

---

## 12. Non-Goals (This Sprint)

- No workspace path segment in routing (not needed — org-per-business-unit model)
- No data migration for existing Castillitos data
- No changes to Castillitos org, slug, connectors, or existing behavior
- No UI for activation flow (TA-05)
- No actual Jupiter Pets connector setup (TA-03, TA-07)
