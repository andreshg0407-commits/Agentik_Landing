/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/anuncios/page.tsx
 *
 * MARKETING-ADS-01 — Módulo Anuncios
 *
 * Centro de publicidad paga: Facebook, Instagram, TikTok, Google, YouTube.
 * Asistente protagonista de 7 pasos para crear anuncios.
 *
 * Architecture:
 *   requireOrgAccess → buildAdsRuntime → AnunciosDashboard (client)
 */
import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { AnunciosDashboard }          from "@/components/marketing-studio/ads/anuncios-dashboard";
import { buildAdsRuntime }            from "@/lib/marketing-studio/ads/ads-runtime";

export default async function AnunciosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const state = await buildAdsRuntime(organization.id);

  // ── Header status ───────────────────────────────────────────────────────────
  const { activos, revision } = state.health;

  const headerStatus: "ok" | "warning" | "critical" | "neutral" =
    revision > 0         ? "warning"  :
    activos  > 0         ? "ok"       :
    state.ads.length > 0 ? "ok"       :
    "neutral";

  const headerStatusLabel =
    revision > 0         ? `${revision} anuncio${revision !== 1 ? "s" : ""} en revisión`   :
    activos  > 0         ? `${activos} activo${activos !== 1 ? "s" : ""}`                   :
    state.ads.length > 0 ? `${state.ads.length} anuncio${state.ads.length !== 1 ? "s" : ""}` :
    "Sin anuncios";

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Anuncios" },
        ]}
        title="Anuncios"
        subtitle="Publicidad paga · Presupuesto · Audiencias"
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />
      <AnunciosDashboard state={state} orgSlug={orgSlug} />
    </div>
  );
}
