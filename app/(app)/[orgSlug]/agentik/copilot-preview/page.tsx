/**
 * app/(app)/[orgSlug]/agentik/copilot-preview/page.tsx
 *
 * Agentik Copilot — Internal Visual Preview Route
 * Sprint: AGENTIK-COPILOT-PREVIEW-01
 *
 * @dev DEVELOPMENT ONLY — Not linked in navigation. Access by URL only.
 *
 * Renders CopilotPanel with fixture data for internal visual review.
 * No real data. No SAG. No runtime engine.
 *
 * ACCESS: AGENTIK_ADMIN / SUPER_ADMIN only (same guard as /agentik).
 */

import { redirect }              from "next/navigation";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { isInternalRole }        from "@/lib/auth/module-access";
import { CopilotPreviewClient }  from "./preview-client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CopilotPreviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  // ── Access guard — internal roles only ──────────────────────────────────────
  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/dashboard`);

  return <CopilotPreviewClient />;
}
