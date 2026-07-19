/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/publishing/page.tsx
 *
 * MS-17 — Publishing Center
 *
 * Server Component — loads publishing runtime state and passes to client dashboard.
 */

import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";
import { PublishingDashboard }         from "@/components/marketing-studio/publishing/publishing-dashboard";
import { buildPublishingRuntimeState } from "@/lib/marketing-studio/publishing/publishing-orchestrator";

export default async function PublishingCenterPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgSlug }                  = params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildPublishingRuntimeState(organization.id);

  const criticalCount = state.health.blockedPlans + state.health.failedSteps;
  const statusLabel   =
    criticalCount > 0
      ? `${criticalCount} items requieren atención`
      : state.health.label;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Publishing Center" },
        ]}
        title="Publishing Center"
        subtitle={`${state.totalPlans} planes · ${state.activePlanIds.length} activos · ${state.health.completedToday} publicados hoy`}
        status={
          state.health.level === "critical" ? "critical"
          : state.health.level === "blocked" ? "critical"
          : state.health.level === "degraded" ? "warning"
          : "ok"
        }
        statusLabel={statusLabel}
      />

      <PublishingDashboard
        state={state}
        orgSlug={orgSlug}
      />
    </div>
  );
}
