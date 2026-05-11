# Tenant Isolation — Agentik Platform

**Golden rule: every read and every write must be scoped to a single `organizationId`. No exceptions.**

---

## 1. Active Tenants (2026-04-29)

| slug | organizationId | status | purpose |
|---|---|---|---|
| `agentik` | `cmmpwsstl0001p5y5ck1l5sh8` | ACTIVE | Internal platform org |
| `castillitos` | `cmmpwstuf000dp5y58kj1daaj` | ACTIVE | **Sole operational client** |
| `do-jeans` | `cmoan4zob000vfgy5iglvctup` | SUSPENDED | No data, no connectors |
| `arketops` | `cmmpyqxri000hmxy55mrak8sm` | SUSPENDED | No operational data |
| `test-org-e2e` | `test-org-e2e` | SUSPENDED | Automated tests only |

SUSPENDED orgs are **not deleted** — data is preserved and status is reversible.

---

## 2. Critical Tables and Their Tenant Key

Every operational table has `organizationId` as a required, indexed field.
Every query **must** include `WHERE organizationId = $orgId`.

| Table | Tenant key | Unique constraint includes orgId |
|---|---|---|
| `SaleRecord` | `organizationId` | `(organizationId, naturalKey)` |
| `CustomerReceivable` | `organizationId` | `(organizationId, erpId)` |
| `CustomerOrderRecord` | `organizationId` | `(organizationId, erpMovId)` |
| `PaymentRecord` | `organizationId` | `(organizationId, ...)` |
| `CustomerProfile` | `organizationId` | `(organizationId, slug)` |
| `BusinessAlert` | `organizationId` | — |
| `Alert` | `organizationId` | — |
| `Rule` | `organizationId` | — |
| `ActionTask` | `organizationId` | — |
| `Connector` | `organizationId` | — |
| `ConnectorRun` | via `Connector` | — |

**No table is shared across tenants. There is no global pool.**

---

## 3. Architecture Layers — How Tenant Isolation Is Enforced

### 3.1 Navigation / Auth layer

```
URL: /{orgSlug}/...
  → requireOrgAccess(orgSlug)
       → prisma.organization.findUnique({ where: { slug } })
       → throws ORG_INACTIVE if status !== ACTIVE
       → throws ACCESS_DENIED if membership inactive
       → returns { user, organization, membership }
  → orgId = organization.id  ← scoped to that org for all queries below
```

`getAccessibleOrganizations()` filters `status = ACTIVE` — SUSPENDED orgs never appear in TenantSwitcher or navigation.

### 3.2 Service layer

All service functions take `organizationId: string` as their **first required parameter**. They never read it from a global, environment variable, or session.

```typescript
// Correct pattern — all service functions follow this
export async function getCarteraKpis(organizationId: string, window?: FiscalWindow) {
  return prisma.customerReceivable.aggregate({
    where: { organizationId, ... },
  });
}
```

Verified for: `getCarteraKpis`, `getDashboardKpis`, `getCollectionsQueue`, `getPaymentSummary`, `searchCustomers`, `getCarteraKpis`, `getFpaRevenueForecast`, `getFpaCashFlow`, `getCobrosBreakdown`, `getDailyOrderKpis`, `getLatestOrderDate`.

### 3.3 Sync engine — connector-derived orgId

The sync engine **never receives an orgSlug**. It receives a `connectorId`. The `orgId` is always derived from the connector record itself:

```typescript
// lib/connectors/core/sync-engine.ts — lines 67-71
const connector = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });
const orgId     = connector.organizationId;  // ← derived from connector, not from caller
```

This means: even if a script passes the wrong connector ID by mistake, the data will be written to the org that owns that connector — not to an arbitrary org.

### 3.4 Storage handlers — ctx.orgId

All storage handlers (`saleRecordStorage`, `customerReceivableStorage`, `customerOrderStorage`, `customerProfileStorage`) write exclusively using `ctx.orgId`, which is set by the sync engine from `connector.organizationId`:

```typescript
// All upserts follow this pattern
await prisma.saleRecord.upsert({
  where:  { organizationId_naturalKey: { organizationId: ctx.orgId, naturalKey: nk } },
  create: { organizationId: ctx.orgId, ... },
  update: { ... },  // organizationId never in update — immutable once written
});
```

---

## 4. How to Add a New Tenant

1. Create the organization record:
   ```sql
   INSERT INTO "Organization" (id, slug, name, status) VALUES (cuid(), 'new-client', 'New Client', 'ACTIVE');
   ```
   Or via seed/admin UI.

2. Create a membership for the admin user.

3. Create a Connector record pointing to the org's SAG/CRM endpoint:
   ```typescript
   await prisma.connector.create({
     data: {
       organizationId: newOrg.id,  // ← always the new org's ID
       source:         "sag_pya_soap",
       name:           "SAG PYA SOAP — New Client",
       status:         "ACTIVE",
       modules:        ["customers", "receivables", "movements", "orders"],
       config:         { token: "...", database: "...", endpointUrl: "..." },
     },
   });
   ```

4. Run the sync specifying the new connector's ID. Data will be written to `newOrg.id` automatically.

5. Navigate to `/{new-client-slug}/executive` — the dashboard will read from the new org's data only.

---

## 5. How to Connect a New SAG Instance

Each SAG installation has its own:
- SOAP endpoint URL (`endpointUrl`)
- Access token (`token`)
- Database name (`database`) — the `a_s_bd` parameter in the SOAP call

Each SAG instance must have its own Connector record. Multiple connectors can exist per org (e.g. `sag_pya_soap` + `castillitos_crm`), but each connector belongs to exactly one org.

```
Connector.organizationId → Organization (1:1 per connector, N connectors per org allowed)
```

The `CASTILLITOS_SOURCE_SEMANTIC_RULES` and `CASTILLITOS_DOCUMENT_FAMILY_MAP` are specific to Castillitos' SAG installation. A different client with different source codes must define their own rules in a separate file and register them in their connector config.

---

## 6. How to Run a Sync Without Mixing Data

```bash
# Always pass the connector ID — never the org slug
ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_run-movements-sync.ts
```

Scripts that use `CONNECTOR_ID` constants look these up at runtime from the DB, which then resolves `organizationId`. The sync engine guarantees all writes go to that org.

**Never run a sync by org slug directly.** The slug is only for navigation. The connector ID is the authoritative sync handle.

Scripts with hardcoded constants (`CONNECTOR_ID`, `ORG_ID`) must be treated as **Castillitos-specific diagnostic tools**. They are named with a `_` prefix to signal this. For a new client, copy the script and replace the constants — never reuse the same constants.

---

## 7. What NOT To Do

| ❌ Anti-pattern | ✅ Correct pattern |
|---|---|
| `prisma.saleRecord.findMany()` without `organizationId` filter | Always include `where: { organizationId }` |
| Derive orgId from env var in a service function | Accept `organizationId` as function param |
| `findFirst({ where: { slug: "castillitos" } })` inside a shared service | Accept orgId as param; resolve slug→id at the edge (page/API route) |
| Sync by passing orgSlug to sync engine | Pass `connectorId`; sync engine resolves orgId internally |
| Default to "first org" or "first active org" anywhere | Always require explicit orgId/slug from the request context |
| Hardcode `ORG_ID` in application code (not scripts) | Read orgId from `requireOrgAccess()` → `organization.id` |
| Navigate to `/do-jeans/executive` to test with real data | Use `/castillitos/executive` — do-jeans has no data |
| Use `status: "ACTIVE"` check as the only guard in a new query | Combine with `organizationId` filter — status alone is not enough |

---

## 8. Guardrail Summary

The platform enforces isolation at 4 independent layers:

```
Layer 1 — DB schema:   organizationId NOT NULL + @@unique includes orgId
Layer 2 — Auth:        requireOrgAccess() → status=ACTIVE check → orgId from DB, not URL
Layer 3 — Service:     all functions require organizationId param (no global reads)
Layer 4 — Sync engine: orgId = connector.organizationId (derived, never passed in)
```

Any query that reaches the DB without an `organizationId` filter is a bug.

---

## 9. Diagnostics

To audit data distribution across tenants at any time:

```bash
ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_audit-tenants.ts
```

To run the orders sync for Castillitos:

```bash
env $(grep DATABASE_URL .env | xargs) npx tsx scripts/_sync-orders-audit.ts
```

To validate cartera data for a specific org:

```bash
ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_validate-cartera.ts
```
