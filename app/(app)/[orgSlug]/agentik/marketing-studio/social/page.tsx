/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/social/page.tsx
 *
 * MS-16 — Social Runtime
 *
 * Server Component — loads social runtime state and passes to client dashboard.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { SocialDashboard }            from "@/components/marketing-studio/social/social-dashboard";
import { buildSocialRuntime }         from "@/lib/marketing-studio/social/runtime/social-runtime";

export default async function SocialRuntimePage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgSlug }                  = params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildSocialRuntime(organization.id);

  const criticalCount = state.health.failedCount + state.health.overdueCount;
  const statusLabel   =
    criticalCount > 0
      ? `${criticalCount} publicaciones requieren atención`
      : state.health.label;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Social Runtime" },
        ]}
        title="Social Runtime"
        subtitle={`${state.totalPublications} publicaciones · ${state.queue.length} en cola · ${state.channelStates.length} canales`}
        status={
          state.health.level === "blocked" ? "critical"
          : state.health.level === "degraded" ? "warning"
          : "ok"
        }
        statusLabel={statusLabel}
      />

      <SocialDashboard
        state={state}
        orgSlug={orgSlug}
      />
    </div>
  );
}
