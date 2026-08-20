/**
 * lib/copilot-core/copilot-core-authz.ts
 *
 * Copilot Core Foundation — Fail-Closed Authorization
 * Sprint: COPILOT-CORE-FOUNDATION-01A
 *
 * Pure function. No Prisma, no fetch, no side effects.
 * Every code path that is not an explicit allow terminates in deny.
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
 *   entitlement AND role AND module AND actorScope AND resourceOwnership AND enabled
 *
 * Seller confinement rules:
 *   - actorScope "seller" requires a sellerId in requestedResourceScope
 *   - actorScope "seller" can only access its own certified sellerId
 *   - actorScope "seller" cannot escalate to "organization"
 *   - sellerId cannot be substituted from prompts or parameters
 *
 * Cross-tenant is always denied (enforced at envelope validation level as well).
 */
export function authorizeCopilotCapability(
  envelope:     unknown,
  capabilityId: string,
  /** The sellerId certified for this user session (from server auth). */
  certifiedSellerId?: string,
): AuthorizationResult {
  // 1. Envelope structural validation
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

  // 7. Role check
  if (!cap.allowedRoles.includes(env.organizationRole)) {
    return deny(capabilityId, "ROLE_DENIED", scope);
  }

  // 8. Module check
  if (cap.moduleKey !== env.moduleKey) {
    return deny(capabilityId, "MODULE_DENIED", scope);
  }

  // 9. Actor scope check
  if (!cap.allowedActorScopes.includes(env.actorScope)) {
    return deny(capabilityId, "ACTOR_SCOPE_DENIED", scope);
  }

  // 10. Seller confinement
  if (env.actorScope === "seller") {
    // Seller must have a certifiedSellerId from session
    if (!certifiedSellerId) {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }

    // If a sellerId is in the resource scope, it must match the certified one
    if (scope.sellerId && scope.sellerId !== certifiedSellerId) {
      return deny(capabilityId, "SELLER_SCOPE_REQUIRED", scope);
    }
  }

  // 11. Resource ownership check
  if (cap.requiresResourceOwnership) {
    if (env.actorScope === "seller" && !certifiedSellerId) {
      return deny(capabilityId, "RESOURCE_OWNERSHIP_DENIED", scope);
    }
    if (env.actorScope === "seller" && scope.sellerId && scope.sellerId !== certifiedSellerId) {
      return deny(capabilityId, "RESOURCE_OWNERSHIP_DENIED", scope);
    }
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
