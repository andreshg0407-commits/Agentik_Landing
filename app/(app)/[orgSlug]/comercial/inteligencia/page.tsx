/**
 * /[orgSlug]/comercial/inteligencia
 *
 * Centro de Verdad Operacional — Operational Intelligence Dashboard.
 *
 * RSC wrapper: loads snapshot server-side, passes as props to client dashboard.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import { requireOrgAccess }                     from "@/lib/auth/org-access";
import { getOperationalIntelligenceSnapshot }   from "@/lib/operational-intelligence/operational-intelligence-service";
import { OperationalWorkspaceHeader }           from "@/components/workspace/operational-workspace-header";
import { IntelDashboardClient }                 from "@/components/operational-intelligence/intel-dashboard-client";
import type { StatusSignal }                    from "@/components/workspace/operational-workspace-header";

export const dynamic = "force-dynamic";

interface Props {
  params: { orgSlug: string };
}

export default async function InteligenciaOperacionalPage({ params }: Props) {
  const { organization } = await requireOrgAccess(params.orgSlug);

  // Load snapshot — gracefully degrade on failure
  let snapshot: Awaited<ReturnType<typeof getOperationalIntelligenceSnapshot>> | null = null;
  let loadError: string | null = null;

  try {
    snapshot = await getOperationalIntelligenceSnapshot(organization.id, {
      includeReconciliation: true,
      includeCommercialData: true,
      includePortfolioItems: true,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Error cargando inteligencia operacional";
  }

  // Derive header status from snapshot health
  const headerStatus: StatusSignal = !snapshot
    ? "neutral"
    : snapshot.health.isHealthy
    ? "ok"
    : snapshot.health.criticalCount > 0
    ? "critical"
    : "warning";

  const headerStatusLabel = !snapshot
    ? "Sin datos"
    : snapshot.health.label;

  return (
    <div style={{ padding: "0 0 48px" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial" },
          { label: "Inteligencia Operacional" },
        ]}
        title="Centro de Verdad Operacional"
        subtitle={snapshot
          ? `${snapshot.totals.refsMonitored} referencias · ${snapshot.totals.activeOrders} pedidos activos · actualizado ${_formatTime(snapshot.generatedAt)}`
          : "Cargando estado operacional..."
        }
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {loadError && (
        <div style={{
          fontFamily:   "var(--font-mono, monospace)",
          fontSize:     12,
          color:        "#ef4444",
          background:   "#fef2f2",
          border:       "1px solid #fecaca",
          borderRadius: 6,
          padding:      "12px 16px",
          marginBottom: 24,
        }}>
          Error: {loadError}
        </div>
      )}

      {snapshot && <IntelDashboardClient snapshot={snapshot} />}

      {!snapshot && !loadError && (
        <div style={{
          fontFamily:  "var(--font-mono, monospace)",
          fontSize:    12,
          color:       "#6b7280",
          textAlign:   "center",
          padding:     "64px 0",
        }}>
          Sin datos operacionales disponibles. Sincroniza el inventario SAG para comenzar.
        </div>
      )}
    </div>
  );
}

function _formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
