/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/distribution/page.tsx
 *
 * MS-14 — Distribution Center
 *
 * Server Component — loads distribution state and passes to client dashboard.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { DistributionDashboard }      from "@/components/marketing-studio/distribution/distribution-dashboard";
import { buildDistributionState }     from "@/lib/marketing-studio/distribution/distribution-engine";

export default async function DistributionCenterPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgSlug }                  = params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildDistributionState(organization.id);

  const criticalCount =
    state.health.failedPipelineCount +
    state.channelCoverage.filter(c => c.healthLevel === "blocked").length;

  const statusLabel =
    criticalCount > 0
      ? `${criticalCount} canal${criticalCount > 1 ? "es" : ""} bloqueado${criticalCount > 1 ? "s" : ""}`
      : state.health.label;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Distribution Center" },
        ]}
        title="Distribution Center"
        subtitle={`${state.productCount} productos · ${state.activePipelines.length} pipelines activos · ${state.scheduledDrops.length} drops programados`}
        status={criticalCount > 0 ? "critical" : state.health.level === "healthy" ? "ok" : "warning"}
        statusLabel={statusLabel}
      />

      <DistributionDashboard
        state={state}
        orgSlug={orgSlug}
      />
    </div>
  );
}
