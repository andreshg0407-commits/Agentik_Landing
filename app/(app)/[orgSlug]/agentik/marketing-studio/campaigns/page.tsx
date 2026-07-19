/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/campaigns/page.tsx
 *
 * MARKETING-CAMPAIGNS-01 — Centro de Orquestación de Campañas Orgánicas
 *
 * Server Component — auth guard + runtime state derivation.
 * No secrets to client. No Copilot in canvas. No direct API calls.
 *
 * Architecture:
 *   requireOrgAccess → buildCampaignRuntime → CampaignDashboard (client)
 */
import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CampaignDashboard }          from "@/components/marketing-studio/campaigns/campaign-dashboard";
import { buildCampaignRuntime }       from "@/lib/marketing-studio/campaigns/campaign-runtime";

export default async function CampañasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildCampaignRuntime(organization.id);

  // ── Header status ───────────────────────────────────────────────────────────
  const criticals = state.health.blockedLaunches + state.health.overduePublications;
  const activas   = state.campaigns.filter(c => c.status === "active").length;
  const total     = state.campaigns.length;

  const headerStatus: "ok" | "warning" | "critical" | "neutral" =
    criticals > 0                    ? "critical" :
    state.health.level === "warning" ? "warning"  :
    state.health.level === "stalled" ? "warning"  :
    total > 0                        ? "ok"       :
    "neutral";

  const headerStatusLabel =
    criticals > 0 ? `${criticals} publicación${criticals !== 1 ? "es" : ""} en riesgo`                       :
    activas   > 0 ? `${activas} activa${activas !== 1 ? "s" : ""}`                                          :
    total     > 0 ? `${total} publicación${total !== 1 ? "es" : ""} configurada${total !== 1 ? "s" : ""}`   :
    "Sin contenido";

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Contenido" },
        ]}
        title="Contenido"
        subtitle="Crea, programa y organiza publicaciones para tus canales digitales."
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />
      <CampaignDashboard state={state} orgSlug={orgSlug} />
    </div>
  );
}
