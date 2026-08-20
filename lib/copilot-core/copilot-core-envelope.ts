/**
 * lib/copilot-core/copilot-core-envelope.ts
 *
 * Copilot Core Foundation — Envelope Validation
 * Sprint: COPILOT-CORE-FOUNDATION-01A
 *
 * Pure validation. No Prisma, no fetch, no side effects.
 *
 * The future envelope BUILDER must execute server-side
 * (e.g. requireOrgAccess or equivalent auth loader).
 * This module only validates structural correctness of
 * an already-constructed envelope.
 */

import type {
  CopilotEnvelope,
  EnvelopeValidationResult,
} from "./copilot-core-types";

const VALID_PLATFORM_ROLES  = new Set(["AGENTIK_ADMIN", "AGENTIK_SUPER_ADMIN", "USER"]);
const VALID_ORG_ROLES       = new Set(["ORG_ADMIN", "ORG_MANAGER", "ORG_SELLER", "ORG_VIEWER"]);
const VALID_SURFACES        = new Set(["desktop", "manager", "seller", "api"]);
const VALID_ACTOR_SCOPES    = new Set(["organization", "seller", "self"]);

/**
 * Validates structural correctness of a CopilotEnvelope.
 * Fail-closed: any missing or invalid field produces an error.
 */
export function validateEnvelope(envelope: unknown): EnvelopeValidationResult {
  const errors: string[] = [];

  if (envelope == null || typeof envelope !== "object") {
    return { valid: false, errors: ["Envelope is null or not an object"] };
  }

  const e = envelope as Record<string, unknown>;

  // Required string fields
  const requiredStrings = [
    "organizationId",
    "orgSlug",
    "userId",
    "membershipId",
    "moduleKey",
    "requestId",
    "generatedAt",
  ] as const;

  for (const field of requiredStrings) {
    const v = e[field];
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  // Platform role
  if (!VALID_PLATFORM_ROLES.has(e.platformRole as string)) {
    errors.push(`Invalid platformRole: ${String(e.platformRole)}`);
  }

  // Organization role
  if (!VALID_ORG_ROLES.has(e.organizationRole as string)) {
    errors.push(`Invalid organizationRole: ${String(e.organizationRole)}`);
  }

  // Surface
  if (!VALID_SURFACES.has(e.surface as string)) {
    errors.push(`Invalid surface: ${String(e.surface)}`);
  }

  // Actor scope
  if (!VALID_ACTOR_SCOPES.has(e.actorScope as string)) {
    errors.push(`Invalid actorScope: ${String(e.actorScope)}`);
  }

  // Entitlement set
  if (!(e.entitlementSet instanceof Set)) {
    errors.push("entitlementSet must be a Set");
  }

  // Resource scope
  if (e.requestedResourceScope == null || typeof e.requestedResourceScope !== "object") {
    errors.push("Missing requestedResourceScope");
  } else {
    const rs = e.requestedResourceScope as Record<string, unknown>;
    if (typeof rs.organizationId !== "string" || rs.organizationId.length === 0) {
      errors.push("requestedResourceScope.organizationId is required");
    }
  }

  // Cross-tenant: resource scope org must match envelope org
  if (
    typeof e.organizationId === "string" &&
    e.requestedResourceScope != null &&
    typeof e.requestedResourceScope === "object"
  ) {
    const rs = e.requestedResourceScope as Record<string, unknown>;
    if (typeof rs.organizationId === "string" && rs.organizationId !== e.organizationId) {
      errors.push("Cross-tenant access denied: requestedResourceScope.organizationId does not match envelope organizationId");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type guard: returns true only if the envelope is structurally valid.
 */
export function isValidEnvelope(envelope: unknown): envelope is CopilotEnvelope {
  return validateEnvelope(envelope).valid;
}
