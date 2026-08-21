# COPILOT-CORE-FOUNDATION-01A (R1 + 01B1)

**Sprint:** COPILOT-CORE-FOUNDATION-01A-R1 + 01B1
**Base:** f476447
**Branch:** feature/copilot-core-foundation-01
**Status:** Fail-closed authorization foundation, canonical roles aligned, pure authority resolution

---

## Contracts Defined

### CopilotEnvelope
Server-derived trust context. Every field is readonly. The client cannot inject
systemHints, assign roles, or select arbitrary sellerId. The future builder
executes server-side via requireOrgAccess or equivalent.

### PlatformRole (01B1 correction)
Values: `SUPER_ADMIN | AGENTIK_ADMIN | null`

- `null` is the default for regular users. NOT "USER".
- `null` is the fail-closed behavior: absence of platform privilege.
- PlatformRole is a SEPARATE dimension from MembershipRole.
- A MembershipRole (even SUPER_ADMIN) does NOT automatically create a PlatformRole.
- PlatformRole is derived from the User model, not from Membership.
- Platform Authority commit (4f834ba) is NOT yet integrated on this branch.

### MembershipRole (aligned to Prisma enum Role)
Source: `prisma/schema.prisma:35-43`

Values: `SUPER_ADMIN | AGENTIK_ADMIN | ORG_ADMIN | MANAGER | OPERATOR | VIEWER | BILLING`

Seller is NOT a role. It is an operational binding (`actorScope: "seller"` +
`sellerBinding`). See `lib/comercial/frontline/frontline-types.ts`.

### SellerBinding (01B1 expansion)
Server-certified seller identity attached to the envelope. Derived from
Membership + CRM data, never from client input. Present IFF `actorScope === "seller"`.

Fields: `sellerId, sellerName, sellerSlug, source, confidence, organizationId`

### SellerBindingSource (01B1)
Values: `membership_seller_slug | email_crm_match | name_match | unmapped | ambiguous`

**Certification rules:**
- `membership_seller_slug` is the ONLY certified source.
- `email_crm_match` NEVER grants seller access.
- `name_match` NEVER grants seller access.
- `unmapped` and `ambiguous` always fail closed.
- Confidence value alone CANNOT make an uncertified source certified.
- The authority function `isCertifiedSellerSource()` is the SINGLE public authority.
- No array, Set, or collection of certified sources is exported publicly.
- No `add`, `push`, `delete`, `splice`, or any runtime mutation API exists.
- Adding a new certified source requires a code change to `isCertifiedSellerSource()`
  and a security review — it cannot be done at runtime by any consumer.
- `sellerSlug` continues as IDENTITY_UNSTABLE (see `manager-commercial-types.ts:392`).

### CopilotCapability
Declarative descriptor with: capabilityId, moduleKey, riskClass, requiredEntitlement,
allowedRoles, allowedActorScopes, requiresResourceOwnership, enabled, truthRequirements.

### AuthorizationResult
Typed deny/allow with: capabilityId, riskClass, denialReason (10 codes), evaluatedScope.

### CopilotAnswer + FactRef
Response envelope with truth-state invariants. A response without facts cannot be VERIFIED.
Every FactRef.organizationId must match the answer's organizationId.

### ScopeResolutionResult (01B1)
Result of `resolveCopilotActorScope()`: resolved, actorScope, sellerBinding,
resourceScope, denialReason, warnings.

---

## TenantModule Alignment (01B1)

| Concept | Value | Source |
|---------|-------|--------|
| Canonical TenantModule key for commercial | `sales` | `lib/tenant/modules.ts:78` |
| URL path for commercial | `comercial` | Route convention |
| Capability moduleKey | `sales` | Aligned to TenantModule |
| requiredEntitlement | `sales` | TenantModule key (NOT invented namespace) |
| Copilot TenantModule key | `copilot` | Separate opt-in module |

**Capability ID and TenantModule key are separate concepts:**
- Capability ID: `commercial.customers.summary.read` (copilot-specific)
- TenantModule key: `sales` (tenant entitlement system)
- Do NOT conflate them. Do NOT invent: `copilot:commercial:read`, `copilot:core:enabled`.

---

## Canonical Role Sources

| Type | Source | Values |
|------|--------|--------|
| PlatformRole | User model | SUPER_ADMIN, AGENTIK_ADMIN, null |
| MembershipRole | Prisma enum Role (schema.prisma:35) | SUPER_ADMIN, AGENTIK_ADMIN, ORG_ADMIN, MANAGER, OPERATOR, VIEWER, BILLING |
| Seller identity | Membership + CRM join | SellerBinding { sellerId, sellerName, sellerSlug, source, confidence, organizationId } |
| Actor scope | Server-derived from session | organization, seller, self |

---

## Authorization Matrix

| Check                  | Must Pass | Denial Code               |
|------------------------|-----------|---------------------------|
| Envelope valid         | Yes       | INVALID_ENVELOPE          |
| Capability known       | Yes       | UNKNOWN_CAPABILITY        |
| Capability enabled     | Yes       | CAPABILITY_DISABLED       |
| Risk class allowed     | Yes       | CAPABILITY_DISABLED       |
| Entitlement present    | Yes       | ENTITLEMENT_DISABLED      |
| Role allowed           | Yes       | ROLE_DENIED               |
| Module matches         | Yes       | MODULE_DENIED             |
| Actor scope allowed    | Yes       | ACTOR_SCOPE_DENIED        |
| Seller scope certified | Yes*      | SELLER_SCOPE_REQUIRED     |
| Resource ownership     | Yes*      | RESOURCE_OWNERSHIP_DENIED |
| Same tenant            | Yes       | CROSS_TENANT_DENIED       |

(*) Only when actorScope = "seller" or capability requires ownership.

All checks are conjunctive (AND). Any failure = deny.

---

## Seller Confinement (Absolute Rule)

If `envelope.actorScope === "seller"`:

- Only `requestedResourceScope.kind === "seller"` is authorized
- `requestedResourceScope.sellerId` must exactly match `sellerBinding.sellerId`
- `organizationId` must match
- Organization scope is **ALWAYS** denied
- Another seller's scope is **ALWAYS** denied
- Absence of sellerId is **ALWAYS** denied
- Parameters from prompts or client **cannot** substitute sellerId
- A high role (ORG_ADMIN, SUPER_ADMIN) within the same envelope does **NOT** remove confinement
- To act with organization scope, a **different** envelope must be derived server-side

No exceptions via: platformRole, membershipRole, capability, module, or input parameters.

---

## Scope Resolution Rules (01B1)

`resolveCopilotActorScope(authorityInput)` — pure function, no DB, no network.

| MembershipRole | Certified Seller? | Module Enabled? | Result |
|----------------|-------------------|-----------------|--------|
| SUPER_ADMIN    | any               | Yes             | organization |
| AGENTIK_ADMIN  | any               | Yes             | organization |
| ORG_ADMIN      | any               | Yes             | organization |
| MANAGER        | any               | Yes             | organization |
| OPERATOR       | Yes (CERTIFIED)   | Yes             | seller |
| OPERATOR       | No/Unverified     | Yes             | self |
| VIEWER         | any               | Yes (sales)     | ROLE_DENIED |
| BILLING        | any               | Yes (sales)     | ROLE_DENIED |
| VIEWER         | any               | Yes (other)     | self |
| BILLING        | any               | Yes (other)     | self |
| any            | any               | No              | MODULE_DENIED |
| any            | any               | (suspended)     | INVALID_ENVELOPE |

---

## MembershipRole x ActorScope Matrix

| MembershipRole | organization scope | seller scope | self scope |
|----------------|-------------------|--------------|------------|
| SUPER_ADMIN    | Allowed*          | N/A**        | Allowed    |
| AGENTIK_ADMIN  | Allowed*          | N/A**        | Allowed    |
| ORG_ADMIN      | Allowed           | N/A**        | Allowed    |
| MANAGER        | Allowed           | N/A**        | Allowed    |
| OPERATOR       | Allowed           | Allowed      | Allowed    |
| VIEWER         | Denied***         | Denied***    | Denied***  |
| BILLING        | Denied***         | Denied***    | Denied***  |

(*) Subject to entitlement + module + capability checks.
(**) These roles are not typically seller-confined; if the server envelope builder
    sets actorScope=seller for them, seller confinement applies absolutely.
(***) Not in allowedRoles for any current commercial capability.

---

## Initial Capabilities (Phase 01A, aligned 01B1)

| Capability ID | Module | Risk | Roles | Scopes | Ownership | Entitlement |
|---|---|---|---|---|---|---|
| commercial.customers.summary.read | sales | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | sales |
| commercial.orders.summary.read | sales | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | sales |
| commercial.sales.performance.read | sales | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | sales |
| commercial.seller.portfolio.read | sales | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | Yes | sales |

When actorScope=seller, responses deliver ONLY that seller's data.
When actorScope=organization, responses deliver org-wide aggregates.

---

## What Is Excluded

### Not yet created (future phases)
- Session lifecycle (Prisma Conversation model)
- LLM adapter (Anthropic SDK)
- Action bridge (Gen 3 action pipeline)
- Memory read/write (CopilotMemory model)
- AI usage tracking (AiUsage model)
- Runtime orchestrator
- **Server-side envelope builder** (BLOCKED — requires Platform Authority 4f834ba)

### Quarantined capabilities
- **Maletas** and **Inventario** -- quarantined due to P0 SAG availability incident.
  Will not receive capability descriptors until SAG data source is reconciled.

### Excluded capability domains
Cobertura, Oportunidades, Produccion, B01, B04, PDF/XML, Cobranza, Finanzas,
Marketing, and all WRITE/EXTERNAL operations.

### Not integrated
- Platform Authority commit 4f834ba (adds PlatformRole enum and User.platformRole to Prisma).
  This commit is NOT on the current feature branch. The envelope builder remains blocked
  until it lands on main.

---

## Relationship to Existing Generations

| Generation | Location | Status |
|---|---|---|
| Gen 1 | lib/agentik/copilot-* | Legacy, not replaced yet |
| Gen 2 | lib/copilot/copilot-agent-* | Structural, not replaced |
| Gen 3 | lib/copilot/actions/*, execution-store/*, approval-workflow/* | Pipeline, not replaced |
| Gen 4 | lib/copilot/intelligence-*, board-*, cross-module-*, etc. | Intelligence, not replaced |

**No generation is declared eliminated or replaced by this sprint.**

---

## Zero-Dependency Certification

- 0 Prisma imports
- 0 LLM SDK imports
- 0 fetch calls
- 0 Server Actions
- 0 API routes
- 0 UI components
- 0 WRITE/EXTERNAL capabilities
- 0 files outside lib/copilot-core/ and docs/copilot-core/
