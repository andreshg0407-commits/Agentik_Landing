/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/orchestrator/page.tsx
 *
 * MS-17 — Unified Publishing Orchestrator Runtime Center
 *
 * Platform-admin only. Air Traffic Control for Marketing Studio.
 * Server Component — loads full orchestrator runtime state, passes to client.
 */

import { redirect }                       from "next/navigation";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { isInternalRole }                from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader }    from "@/components/workspace/operational-workspace-header";
import { OrchestratorDashboard }         from "@/components/marketing-studio/orchestrator/orchestrator-dashboard";
import { buildOrchestratorRuntimeState } from "@/lib/marketing-studio/orchestrator/orchestrator-engine";

export default async function OrchestratorPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgSlug }                  = params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  // Platform-admin gate: only SUPER_ADMIN / AGENTIK_ADMIN
  if (!isInternalRole(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildOrchestratorRuntimeState(organization.id);

  const criticalCount = state.health.blockedPlans + state.health.failedPlans;
  const statusLabel   = criticalCount > 0
    ? `${criticalCount} planes requieren atención`
    : state.health.label;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Orchestrator Runtime" },
        ]}
        title="Orchestrator Runtime"
        subtitle={`${state.totalPlans} planes · ${state.activePlanIds.length} activos · ${state.recommendations.length} señales`}
        status={
          state.health.level === "critical" ? "critical"
          : state.health.level === "degraded" ? "warning"
          : state.health.level === "warning"  ? "warning"
          : "ok"
        }
        statusLabel={statusLabel}
      />

      <OrchestratorDashboard
        state={state}
        orgSlug={orgSlug}
      />
    </div>
  );
}
