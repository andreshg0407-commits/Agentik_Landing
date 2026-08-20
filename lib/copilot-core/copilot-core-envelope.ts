/**
 * lib/copilot-core/copilot-core-envelope.ts
 *
 * Copilot Core Foundation — Envelope Validation
 * Sprint: COPILOT-CORE-FOUNDATION-01B1
 *
 * Pure validation. No Prisma, no fetch, no side effects.
 *
 * The future envelope BUILDER must execute server-side
 * (e.g. requireOrgAccess or equivalent auth loader).
 * This module only validates structural correctness of
 * an already-constructed envelope.
 *
 * ROLE ALIGNMENT:
 *   Valid membership roles mirror Prisma enum Role exactly.
 *   Seller is a binding (actorScope + sellerId), not a role.
 *
 * PLATFORM ROLE:
 *   Only SUPER_ADMIN and AGENTIK_ADMIN are valid platform roles.
 *   Regular users have platformRole = null.
 */

import type {
  CopilotEnvelope,
  EnvelopeValidationResult,
} from "./copilot-core-types";

import { isCertifiedSellerSource } from "./copilot-core-types";

/** Prisma enum Role — source: prisma/schema.prisma:35–43 */
const VALID_MEMBERSHIP_ROLES = new Set([
  "SUPER_ADMIN",
  "AGENTIK_ADMIN",
  "ORG_ADMIN",
  "MANAGER",
  "OPERATOR",
  "VIEWER",
  "BILLING",
]);

const VALID_PLATFORM_ROLES = new Set(["SUPER_ADMIN", "AGENTIK_ADMIN"]);
const VALID_SURFACES       = new Set(["desktop", "manager", "seller", "api"]);
const VALID_ACTOR_SCOPES   = new Set(["organization", "seller", "self"]);
const VALID_SCOPE_KINDS    = new Set(["organization", "seller", "self"]);

const VALID_SELLER_BINDING_SOURCES = new Set([
  "membership_seller_slug",
  "email_crm_match",
  "name_match",
  "unmapped",
  "ambiguous",
]);

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

  // Platform role — null is valid (regular user), otherwise must be SUPER_ADMIN or AGENTIK_ADMIN
  const platformRole = e.platformRole;
  if (platformRole !== null && platformRole !== undefined) {
    if (!VALID_PLATFORM_ROLES.has(platformRole as string)) {
      errors.push(`Invalid platformRole: ${String(platformRole)}. Must be SUPER_ADMIN, AGENTIK_ADMIN, or null`);
    }
  }

  // Membership role — must match Prisma enum Role exactly
  if (!VALID_MEMBERSHIP_ROLES.has(e.membershipRole as string)) {
    errors.push(`Invalid membershipRole: ${String(e.membershipRole)}. Must be one of: ${[...VALID_MEMBERSHIP_ROLES].join(", ")}`);
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
    if (!VALID_SCOPE_KINDS.has(rs.kind as string)) {
      errors.push(`Invalid requestedResourceScope.kind: ${String(rs.kind)}`);
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

  // Seller binding consistency
  const actorScope = e.actorScope as string;
  const sellerBinding = e.sellerBinding as Record<string, unknown> | null | undefined;

  if (actorScope === "seller") {
    // Seller scope MUST have a sellerBinding
    if (sellerBinding == null || typeof sellerBinding !== "object") {
      errors.push("actorScope is 'seller' but sellerBinding is missing");
    } else {
      if (typeof sellerBinding.sellerId !== "string" || sellerBinding.sellerId.length === 0) {
        errors.push("sellerBinding.sellerId is required when actorScope is 'seller'");
      }
      if (typeof sellerBinding.sellerSlug !== "string" || sellerBinding.sellerSlug.length === 0) {
        errors.push("sellerBinding.sellerSlug is required when actorScope is 'seller'");
      }
      // Source must be valid and CERTIFIED for seller scope
      if (!VALID_SELLER_BINDING_SOURCES.has(sellerBinding.source as string)) {
        errors.push(`Invalid sellerBinding.source: ${String(sellerBinding.source)}`);
      } else if (!isCertifiedSellerSource(sellerBinding.source as any)) {
        errors.push(`sellerBinding.source "${String(sellerBinding.source)}" is not CERTIFIED — cannot produce actorScope="seller"`);
      }
      // Confidence must be a number
      if (typeof sellerBinding.confidence !== "number" || sellerBinding.confidence < 0 || sellerBinding.confidence > 1) {
        errors.push("sellerBinding.confidence must be a number between 0 and 1");
      }
      // organizationId on binding must match envelope
      if (typeof sellerBinding.organizationId === "string" && typeof e.organizationId === "string") {
        if (sellerBinding.organizationId !== e.organizationId) {
          errors.push("sellerBinding.organizationId does not match envelope organizationId");
        }
      }
    }

    // Seller scope MUST have resourceScope.kind === "seller"
    if (
      e.requestedResourceScope != null &&
      typeof e.requestedResourceScope === "object"
    ) {
      const rs = e.requestedResourceScope as Record<string, unknown>;
      if (rs.kind !== "seller") {
        errors.push("actorScope is 'seller' but requestedResourceScope.kind is not 'seller' — organization escalation denied");
      }

      // Requested sellerId must match sellerBinding.sellerId
      if (
        sellerBinding != null &&
        typeof sellerBinding === "object" &&
        typeof sellerBinding.sellerId === "string" &&
        typeof rs.sellerId === "string" &&
        rs.sellerId !== sellerBinding.sellerId
      ) {
        errors.push("requestedResourceScope.sellerId does not match sellerBinding.sellerId — seller substitution denied");
      }

      // Seller scope must have a sellerId in resource scope
      if (typeof rs.sellerId !== "string" || rs.sellerId.length === 0) {
        errors.push("actorScope is 'seller' but requestedResourceScope.sellerId is missing");
      }
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
