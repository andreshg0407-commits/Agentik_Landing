/**
 * app/(app)/[orgSlug]/agentik/copilot/page.tsx
 *
 * Copilot Core — Live Runtime Page
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C-R2
 *
 * Server component. Resolves auth, role, modules, and feature flag.
 * Passes server-derived props to the client component.
 *
 * Route: /[orgSlug]/agentik/copilot
 *
 * Access:
 *   ORG_ADMIN + MANAGER → chat enabled
 *   OPERATOR / VIEWER / BILLING → explicit blocked state
 *   SUPER_ADMIN / AGENTIK_ADMIN → access via their MembershipRole in the tenant
 *   Unauthenticated → redirect to login (handled by layout)
 *
 * Production → 404 (hard block before any processing)
 * Flag absent → explicit "not enabled" state
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { CopilotRuntimeClient } from "./copilot-runtime-client";

// 01C allowed roles — same set as envelope builder
const COPILOT_01C_ALLOWED_ROLES = new Set(["ORG_ADMIN", "MANAGER"]);

export default async function CopilotPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  // Step 1: Production hard block
  if (process.env.VERCEL_ENV === "production") {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  // Step 2: Feature flag
  const previewEnabled =
    process.env.COPILOT_COMMERCIAL_PREVIEW_ENABLED === "true";

  // Step 3: Auth — requireOrgAccess throws on unauthenticated/unauthorized
  const { organization, membership, platformRole } = await requireOrgAccess(orgSlug);
  const membershipRole = membership.role as string;

  // Step 4: Module check
  const enabledModules = await getEnabledModules(
    organization.id,
  );
  const hasSalesModule = enabledModules.has("sales");
  const hasCopilotModule = enabledModules.has("copilot");

  // Step 5: Role authorization
  const isRoleAllowed = COPILOT_01C_ALLOWED_ROLES.has(membershipRole);

  // Step 6: Derive effective state
  type CopilotPageState =
    | "enabled"
    | "flag_disabled"
    | "module_disabled"
    | "role_blocked";

  let state: CopilotPageState;
  if (!previewEnabled) {
    state = "flag_disabled";
  } else if (!hasSalesModule || !hasCopilotModule) {
    state = "module_disabled";
  } else if (!isRoleAllowed) {
    state = "role_blocked";
  } else {
    state = "enabled";
  }

  // Map platform role for display
  const effectiveRoleLabel = platformRole
    ? `${membershipRole} (${platformRole})`
    : membershipRole;

  return (
    <CopilotRuntimeClient
      orgSlug={orgSlug}
      state={state}
      membershipRole={effectiveRoleLabel}
      previewEnabled={previewEnabled}
    />
  );
}
