# COPILOT-CORE-FOUNDATION-01A (R1)

**Sprint:** COPILOT-CORE-FOUNDATION-01A-R1
**Base:** f476447
**Branch:** feature/copilot-core-foundation-01
**Status:** Fail-closed authorization foundation, canonical roles aligned

---

## Contracts Defined

### CopilotEnvelope
Server-derived trust context. Every field is readonly. The client cannot inject
systemHints, assign roles, or select arbitrary sellerId. The future builder
executes server-side via requireOrgAccess or equivalent.

### MembershipRole (aligned to Prisma enum Role)
Source: `prisma/schema.prisma:35-43`

Values: `SUPER_ADMIN | AGENTIK_ADMIN | ORG_ADMIN | MANAGER | OPERATOR | VIEWER | BILLING`

Seller is NOT a role. It is an operational binding (`actorScope: "seller"` +
`sellerBinding: { sellerId, sellerName }`). See `lib/comercial/frontline/frontline-types.ts`.

### SellerBinding
Server-certified seller identity attached to the envelope. Derived from
Membership + CRM data, never from client input. Present IFF `actorScope === "seller"`.

### CopilotCapability
Declarative descriptor with: capabilityId, moduleKey, riskClass, requiredEntitlement,
allowedRoles, allowedActorScopes, requiresResourceOwnership, enabled, truthRequirements.

### AuthorizationResult
Typed deny/allow with: capabilityId, riskClass, denialReason (10 codes), evaluatedScope.

### CopilotAnswer + FactRef
Response envelope with truth-state invariants. A response without facts cannot be VERIFIED.
Every FactRef.organizationId must match the answer's organizationId.

---

## Canonical Role Sources

| Type | Source | Values |
|------|--------|--------|
| PlatformRole | User model | SUPER_ADMIN, AGENTIK_ADMIN, USER |
| MembershipRole | Prisma enum Role (schema.prisma:35) | SUPER_ADMIN, AGENTIK_ADMIN, ORG_ADMIN, MANAGER, OPERATOR, VIEWER, BILLING |
| Seller identity | Membership + CRM join | SellerBinding { sellerId, sellerName } |
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

## Initial Capabilities (Phase 01A)

| Capability ID | Module | Risk | Roles | Scopes | Ownership | sellerId required |
|---|---|---|---|---|---|---|
| commercial.customers.summary.read | comercial | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | When seller scope |
| commercial.orders.summary.read | comercial | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | When seller scope |
| commercial.sales.performance.read | comercial | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | No | When seller scope |
| commercial.seller.portfolio.read | comercial | READ | ORG_ADMIN, MANAGER, OPERATOR | organization, seller | Yes | When seller scope |

All require entitlement `copilot:commercial:read`.

When actorScope=seller, responses deliver ONLY that seller's data.
When actorScope=organization, responses deliver org-wide aggregates (requires ORG_ADMIN/MANAGER/OPERATOR with org authority).

---

## What Is Excluded

### Not yet created (future phases)
- Session lifecycle (Prisma Conversation model)
- LLM adapter (Anthropic SDK)
- Action bridge (Gen 3 action pipeline)
- Memory read/write (CopilotMemory model)
- AI usage tracking (AiUsage model)
- Runtime orchestrator

### Quarantined capabilities
- **Maletas** and **Inventario** -- quarantined due to P0 SAG availability incident.
  Will not receive capability descriptors until SAG data source is reconciled.

### Excluded capability domains
Cobertura, Oportunidades, Produccion, B01, B04, PDF/XML, Cobranza, Finanzas,
Marketing, and all WRITE/EXTERNAL operations.

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
