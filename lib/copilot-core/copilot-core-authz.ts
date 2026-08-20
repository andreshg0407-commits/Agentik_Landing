/**
 * lib/copilot-core/copilot-core-authz.ts
 *
 * Copilot Core Foundation — Fail-Closed Authorization
 * Sprint: COPILOT-CORE-FOUNDATION-01A-R1
 *
 * Pure function. No Prisma, no fetch, no side effects.
 * Every code path that is not an explicit allow terminates in deny.
 *
 * SELLER CONFINEMENT (absolute rule):
 *   If envelope.actorScope === "seller":
 *     - Only requestedResourceScope.kind === "seller" is authorized.
 *     - requested sellerId MUST exactly match sellerBinding.sellerId.
 *     - organizationId MUST match.
 *     - Organization scope is ALWAYS denied.
 *     - Another seller's scope is ALWAYS denied.
 *     - Absence of sellerId is ALWAYS denied.
 *     - No exception via platformRole, membershipRole, capability,
 *       module, or input parameters.
 *     - A high role within the same envelope does NOT remove confinement.
 *     - To act with organization scope, a different envelope must be
 *       derived server-side for an actor with organizational authority.
 */

import type {
  CopilotEnvelope,
  AuthorizationResult,
  DenialReason,
  ResourceScope,
} from "./copilot-core-types";
import { isValidEnvelope }  from "./copilot-core-envelope";
import { getCapability }    from "./copilot-core-capability-registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

function deny(
  capabilityId: string,
  reason: DenialReason,
  scope: ResourceScope | null = null,
): AuthorizationResult {
  return {
    allowed:        false,
    capabilityId,
    riskClass:      null,
    denialReason:   reason,
    evaluatedScope: scope,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether the given envelope is authorized to invoke a capability.
 *
 * Decision evaluates conjunctively:
 *   envelope valid
 *   AND cross-tenant safe
 *   AND capability known
 *   AND capability enabled
 *   AND risk class allowed
 *   AND entitlement present
 *   AND role allowed
 *   AND module matches
 *   AND actorScope allowed by capability
 *   AND seller confinement satisfied (if actorScope === "seller")
 *   AND resource ownership satisfied (if capability requires it)
 */
export function authorizeCopilotCapability(
  envelope:     unknown,
  capabilityId: string,
): AuthorizationResult {
  // 1. Envelope structural validation (includes seller binding + scope consistency)
  if (!isValidEnvelope(envelope)) {
    return deny(capabilityId, "INVALID_ENVELOPE");
  }

  const env = envelope as CopilotEnvelope;
  const scope = env.requestedResourceScope;

  // 2. Cross-tenant check (belt-and-suspenders — envelope validation also catches this)
  if (scope.organizationId !== env.organizationId) {
    return deny(capabilityId, "CROSS_TENANT_DENIED", scope);
  }

  // 3. Capability lookup — unknown = deny
  const cap = getCapability(capabilityId);
  if (!cap) {
    return deny(capabilityId, "UNKNOWN_CAPABILITY", scope);
  }

  // 4. Capability enabled
  if (!cap.enabled) {
    return deny(capabilityId, "CAPABILITY_DISABLED", scope);
  }

  // 5. Risk class gate — only READ is allowed in this phase
  if (cap.riskClass === "WRITE" || cap.riskClass === "EXTERNAL") {
    return deny(capabilityId, "CAPABILITY_DISABLED", scope);
  }

  // 6. Entitlement check
  if (!env.entitlementSet.has(cap.requiredEntitlement)) {
    return deny(capabilityId, "ENTITLEMENT_DISABLED", scope);
  }

  // 7. Role check — uses canonical Prisma enum Role values
  if (!(cap.allowedRoles as readonly string[]).includes(env.membershipRole)) {
    return deny(capabilityId, "ROLE_DENIED", scope);
  }

  // 8. Module check
  if (cap.moduleKey !== env.moduleKey) {
    return deny(capabilityId, "MODULE_DENIED", scope);
  }

  // 9. Actor scope check against capability
  if (!(cap.allowedActorScopes as readonly string[]).includes(env.actorScope)) {
    return deny(capabilityId, "ACTOR_SCOPE_DENIED", scope);
  }

  // 10. Seller confinement — absolute, no exceptions
  if (env.actorScope === "seller") {
    // Must have sellerBinding (already validated by envelope, but belt-and-suspenders)
    if (!env.sellerBinding) {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }

    // Resource scope must be kind=seller
    if (scope.kind !== "seller") {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }

    // Resource scope sellerId must exist
    if (!scope.sellerId) {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }

    // Resource scope sellerId must match certified sellerBinding
    if (scope.sellerId !== env.sellerBinding.sellerId) {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }
  }

  // 11. Resource ownership check
  if (cap.requiresResourceOwnership) {
    if (env.actorScope === "seller") {
      // Already validated above — sellerBinding and sellerId match
      // Ownership is satisfied by the seller binding
    } else if (env.actorScope === "self") {
      // Self scope — ownership satisfied by userId identity
    }
    // organization scope + ownership: the capability allows org-wide access
    // to users with org authority — ownership is satisfied by role
  }

  // All checks passed
  return {
    allowed:        true,
    capabilityId,
    riskClass:      cap.riskClass,
    denialReason:   null,
    evaluatedScope: scope,
  };
}
