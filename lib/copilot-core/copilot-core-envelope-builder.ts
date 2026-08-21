/**
 * lib/copilot-core/copilot-core-envelope-builder.ts
 *
 * Copilot Core — Server-Side Envelope Builder
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Builds CopilotEnvelope from authenticated session data.
 * No field originates from client input.
 *
 * 01C RUNTIME GATE: Only ORG_ADMIN and MANAGER are permitted.
 * OPERATOR is blocked even with certified seller — sellerSlug is
 * name-derived and mutable (IDENTITY_UNSTABLE). OPERATOR copilot
 * deferred until immutable SAG-linked seller identity exists.
 */

import "server-only";

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { validateEnvelope } from "./copilot-core-envelope";
import type {
  CopilotEnvelope,
  CopilotSurface,
  MembershipRole,
  PlatformRole,
  ResourceScope,
} from "./copilot-core-types";

// ── 01C Role Gate ────────────────────────────────────────────────────────────

/**
 * Roles allowed in the 01C manager-only MVP.
 * OPERATOR, VIEWER, BILLING are blocked at runtime.
 */
const COPILOT_01C_ALLOWED_ROLES = new Set<MembershipRole>([
  "ORG_ADMIN",
  "MANAGER",
]);

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Builds a CopilotEnvelope entirely from server-side session data.
 *
 * The client provides NOTHING except the route path (orgSlug).
 * moduleKey, surface, actorScope, sellerBinding, resourceScope —
 * all resolved here.
 *
 * @throws Error if unauthenticated, unauthorized, or envelope invalid.
 */
export async function buildCopilotEnvelope(params: {
  orgSlug: string;
  serverSurface: CopilotSurface;
}): Promise<CopilotEnvelope> {
  const { orgSlug, serverSurface } = params;

  // Step 1: Authenticate + authorize org access
  const { user, organization, membership, platformRole } =
    await requireOrgAccess(orgSlug);

  // Step 2: Extract membership role
  const membershipRole = membership.role as MembershipRole;

  // Step 3: 01C runtime gate — only ORG_ADMIN and MANAGER
  if (!COPILOT_01C_ALLOWED_ROLES.has(membershipRole)) {
    throw new Error("COPILOT_ROLE_BLOCKED");
  }

  // Step 4: Resolve enabled modules → entitlement set
  const enabledModules = await getEnabledModules(organization.id);
  const entitlementSet: ReadonlySet<string> = enabledModules;

  // Step 5: Verify sales module is enabled
  if (!enabledModules.has("sales")) {
    throw new Error("COPILOT_MODULE_NOT_ENABLED");
  }

  // Step 6: Verify copilot module is enabled
  if (!enabledModules.has("copilot")) {
    throw new Error("COPILOT_MODULE_NOT_ENABLED");
  }

  // Step 7: Build resource scope (always organization in 01C)
  const resourceScope: ResourceScope = {
    kind: "organization",
    organizationId: organization.id,
  };

  // Step 8: Map platform role
  const mappedPlatformRole: PlatformRole | null =
    platformRole === "SUPER_ADMIN" || platformRole === "AGENTIK_ADMIN"
      ? platformRole
      : null;

  // Step 9: Assemble envelope — all fields server-derived
  const envelope: CopilotEnvelope = {
    organizationId: organization.id,
    orgSlug: organization.slug,
    userId: user.id,
    membershipId: membership.id,
    platformRole: mappedPlatformRole,
    membershipRole,
    moduleKey: "sales", // hardcoded for commercial copilot
    surface: serverSurface,
    entitlementSet,
    actorScope: "organization", // always organization in 01C
    sellerBinding: null, // no seller scope in 01C
    requestedResourceScope: resourceScope,
    requestId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
  };

  // Step 10: Validate structural correctness — fail closed
  const validation = validateEnvelope(envelope);
  if (!validation.valid) {
    throw new Error(
      `COPILOT_INVALID_ENVELOPE: ${validation.errors.join("; ")}`,
    );
  }

  return envelope;
}
