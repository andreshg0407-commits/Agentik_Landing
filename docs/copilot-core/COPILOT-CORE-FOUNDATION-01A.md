# COPILOT-CORE-FOUNDATION-01A

**Sprint:** COPILOT-CORE-FOUNDATION-01A
**Base:** f476447
**Branch:** feature/copilot-core-foundation-01
**Status:** Fail-closed authorization foundation, pure and deterministic

---

## Contracts Defined

### CopilotEnvelope
Server-derived trust context. Every field is readonly. The client cannot inject
systemHints, assign roles, or select arbitrary sellerId. The future builder
executes server-side via requireOrgAccess or equivalent.

### CopilotCapability
Declarative descriptor with: capabilityId, moduleKey, riskClass, requiredEntitlement,
allowedRoles, allowedActorScopes, requiresResourceOwnership, enabled, truthRequirements.

### AuthorizationResult
Typed deny/allow with: capabilityId, riskClass, denialReason (10 codes), evaluatedScope.

### CopilotAnswer + FactRef
Response envelope with truth-state invariants. A response without facts cannot be VERIFIED.
Every FactRef.organizationId must match the answer's organizationId.

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

## Initial Capabilities (Phase 01A)

| Capability ID                          | Module    | Risk  | Enabled |
|----------------------------------------|-----------|-------|---------|
| commercial.customers.summary.read      | comercial | READ  | Yes     |
| commercial.orders.summary.read         | comercial | READ  | Yes     |
| commercial.sales.performance.read      | comercial | READ  | Yes     |
| commercial.seller.portfolio.read       | comercial | READ  | Yes     |

All capabilities require entitlement `copilot:commercial:read`.
Allowed roles: ORG_ADMIN, ORG_MANAGER, ORG_SELLER.
Allowed scopes: organization, seller.

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
- **Maletas** and **Inventario** — quarantined due to P0 SAG availability incident.
  Will not receive capability descriptors until SAG data source is reconciled.

### Excluded capability domains
Cobertura, Oportunidades, Produccion, B01, B04, PDF/XML, Cobranza, Finanzas,
Marketing, and all WRITE/EXTERNAL operations.

---

## Relationship to Existing Generations

| Generation | Location                          | Status                    |
|------------|-----------------------------------|---------------------------|
| Gen 1      | lib/agentik/copilot-*             | Legacy, not replaced yet  |
| Gen 2      | lib/copilot/copilot-agent-*       | Structural, not replaced  |
| Gen 3      | lib/copilot/actions/*, execution-store/*, approval-workflow/* | Pipeline, not replaced |
| Gen 4      | lib/copilot/intelligence-*, board-*, cross-module-*, etc.    | Intelligence, not replaced |

**No generation is declared eliminated or replaced by this sprint.**
Copilot Core (lib/copilot-core/) is a new canonical namespace that will
eventually absorb and unify, but this phase only establishes contracts.

---

## Future Integration Plan

1. **01B** — Server-side envelope builder (requireOrgAccess integration)
2. **01C** — Session lifecycle over Conversation model
3. **01D** — LLM adapter with AiUsage tracking
4. **01E** — Action bridge to Gen 3 pipeline
5. **01F** — Commercial data loaders (hydrate READ capabilities)
6. **01G** — Manager + Seller shell integration
7. **01H** — Desktop shell integration

---

## Zero-Dependency Certification

This phase contains:
- 0 Prisma imports
- 0 LLM SDK imports
- 0 fetch calls
- 0 Server Actions
- 0 API routes
- 0 UI components
- 0 WRITE/EXTERNAL capabilities
- 0 files outside lib/copilot-core/ and docs/copilot-core/
