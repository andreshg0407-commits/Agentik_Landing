/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/analytics/page.tsx
 *
 * MARKETING-ANALYTICS-V2-EXECUTION-01 — Centro ejecutivo de rendimiento
 *
 * Server component:
 *   - Carga AdsAnalyticsResult desde getAdsAnalyticsSummary (range=week).
 *   - Carga AdsHistorySummary desde getAdsHistorySummary (range=week).
 *   - Pasa datos serializables a AnalyticsV2Client.
 *
 * Nota de datos:
 *   Los valores de gasto son indicativos. No usar para contabilidad — usar Tesorería.
 *   Las métricas provienen de Meta y TikTok con caché de 15 minutos.
 */

import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";
import { T, S }                        from "@/lib/ui/tokens";

import { getAdsAnalyticsSummary }      from "@/lib/marketing-studio/ads/ads-analytics-service";
import { getAdsHistorySummary }        from "@/lib/marketing-studio/ads/ads-analytics-history-service";
import { AnalyticsV2Client }           from "@/components/marketing-studio/ads/ads-analytics-v2-client";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // Cargar analítica en vivo + historial en paralelo
  const [analyticsResult, historySummary] = await Promise.all([
    getAdsAnalyticsSummary(orgSlug, "week"),
    getAdsHistorySummary(orgSlug, "week"),
  ]);

  const hasRealData  = analyticsResult.items.length > 0;
  const headerStatus = hasRealData
    ? (analyticsResult.partial ? "warning" as const : "ok" as const)
    : "neutral" as const;
  const headerLabel  = hasRealData
    ? (analyticsResult.partial ? "Datos parciales" : "Resultados actualizados")
    : "Sin actividad sincronizada";

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono, paddingBottom: S[10] }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Analítica" },
        ]}
        title="Analítica"
        subtitle="Resultados, inversión y rendimiento de tus anuncios."
        status={headerStatus}
        statusLabel={headerLabel}
      />

      {/* ── Centro ejecutivo V2 ─────────────────────────────────────────── */}
      <AnalyticsV2Client
        orgSlug={orgSlug}
        initialData={analyticsResult}
        initialHistory={historySummary}
      />

    </div>
  );
}
