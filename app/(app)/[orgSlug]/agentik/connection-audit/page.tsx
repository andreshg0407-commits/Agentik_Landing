/**
 * app/(app)/[orgSlug]/agentik/connection-audit/page.tsx
 *
 * Centro de Certificación Operacional — RSC page.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 * Hard-gated at route level with notFound(). Not just nav-hidden.
 *
 * Fetches persistent certifications from DB and merges with live audit.
 *
 * Sprint: AGENTIK-OPERATIONAL-KPI-CERTIFICATION-01
 */

import { notFound }                               from "next/navigation";
import { requireOrgAccess }                       from "@/lib/auth/org-access";
import { isInternalRole }                         from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader }             from "@/components/workspace/operational-workspace-header";
import { generateOperationalConnectionAudit }     from "@/lib/operational-map/audit/generate-operational-connection-audit";
import { getAllCertifications }                    from "@/lib/operational-map/certification/operational-kpi-certification-service";
import { getAllKpiDefinitions }                    from "@/lib/operational-map/certification/operational-kpi-definition-service";
import { getAllKpiSources }                        from "@/lib/operational-map/certification/operational-kpi-source-service";
import { detectKpiGaps }                          from "@/lib/operational-map/certification/operational-kpi-gap-detector";
import { OperationalConnectionAuditPanel }        from "@/components/operational-map/operational-connection-audit-panel";

interface PageProps {
  params:       { orgSlug: string };
  searchParams?: { meeting?: string };
}

export default async function ConnectionAuditPage({ params, searchParams }: PageProps) {
  const { orgSlug } = params;
  const meetingMode = searchParams?.meeting === "1";

  // ── Phase 14: Hard security gate ────────────────────────────────────────────
  // MANDATORY: notFound() for any non-internal role.
  const { organization, membership } = await requireOrgAccess(orgSlug);
  if (!isInternalRole(membership.role)) {
    notFound();
  }

  // ── Fetch all data in parallel and merge into audit ──────────────────────
  const [certifications, customKpis, kpiSources] = await Promise.all([
    getAllCertifications(organization.id),
    getAllKpiDefinitions(organization.id),
    getAllKpiSources(organization.id),
  ]);

  const audit   = generateOperationalConnectionAudit(organization.id, certifications, customKpis, kpiSources);
  const gapReport = detectKpiGaps(audit.rows.map(r => r.entityLabel));

  const certifiedCount      = audit.rows.filter(r => r.certificationStatus === "certified" || r.certificationStatus === "production_ready").length;
  const productionReadyCount = audit.rows.filter(r => r.productionReady).length;

  // Runtime source counts (AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01)
  const runtimeStatuses     = new Set(["runtime_detected", "connected_partial", "snapshot_detected", "used_by_agentik"]);
  const runtimeKpiKeys      = new Set(kpiSources.filter(s => runtimeStatuses.has(s.validationStatus)).map(s => s.kpiKey));
  const csvKpiKeys          = new Set(kpiSources.filter(s => s.bootstrapBatchId).map(s => s.kpiKey));
  const allSourcedKpiKeys   = new Set(kpiSources.map(s => s.kpiKey));
  const noSourceKpiCount    = audit.rows.filter(r => !allSourcedKpiKeys.has(r.entityKey)).length;
  const pendingDbaCount     = kpiSources.filter(s => s.validationStatus === "runtime_detected" || s.validationStatus === "connected_partial" || s.validationStatus === "snapshot_detected").length;

  const overallStatus = audit.criticalIssues > 0
    ? "critical"
    : audit.overallReadinessScore >= 70
    ? "ok"
    : "warning";

  return (
    <div style={{ maxWidth: 1340, margin: "0 auto", padding: "0 24px 64px" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik" },
          { label: "Centro de Certificación Operacional" },
        ]}
        title="Centro de Certificación Operacional"
        subtitle="Gobierno de datos operacionales. Certifica KPIs: validación técnica · negocio · SAG DBA · producción. Solo SUPER_ADMIN / AGENTIK_ADMIN."
        status={overallStatus}
        statusLabel={
          audit.criticalIssues > 0
            ? `${audit.criticalIssues} KPIs requieren acceso adicional`
            : productionReadyCount > 0
            ? `${productionReadyCount} KPIs operacionales`
            : `${audit.overallReadinessScore}% listo`
        }
      />

      {/* ── Summary cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(188px, 1fr))",
        gap: 12,
        margin: "20px 0 0",
      }}>
        {([
          {
            icon:  "◈",
            iconColor: "#004AAD",
            iconBg:    "#eff6ff",
            label: "KPIs auditados",
            value: String(audit.totalKpis),
            sub:   `${audit.byDomain.length} dominios cubiertos`,
            valueColor: "var(--ink)",
          },
          {
            icon:  "⬡",
            iconColor: runtimeKpiKeys.size > 0 ? "#16a34a" : "#94a3b8",
            iconBg:    runtimeKpiKeys.size > 0 ? "#f0fdf4" : "#f8fafc",
            label: "Runtime detectado",
            value: String(runtimeKpiKeys.size),
            sub:   `${csvKpiKeys.size} CSV · ${noSourceKpiCount} sin fuente real`,
            valueColor: runtimeKpiKeys.size > 0 ? "#16a34a" : "var(--ink-faint)",
          },
          {
            icon:  "✓",
            iconColor: "#15803d",
            iconBg:    "#f0fdf4",
            label: "Certificados",
            value: String(certifiedCount),
            sub:   `${productionReadyCount} en producción`,
            valueColor: certifiedCount > 0 ? "#15803d" : "var(--ink-faint)",
          },
          {
            icon:  "↯",
            iconColor: pendingDbaCount > 0 ? "#0284c7" : "#94a3b8",
            iconBg:    pendingDbaCount > 0 ? "#f0f9ff" : "#f8fafc",
            label: "Requieren validación técnica",
            value: String(pendingDbaCount),
            sub:   "Fuentes runtime sin certificar",
            valueColor: pendingDbaCount > 0 ? "#0284c7" : "var(--ink-faint)",
          },
          {
            icon:  "⚠",
            iconColor: "#d97706",
            iconBg:    "#fffbeb",
            label: "Sin fuente real",
            value: String(noSourceKpiCount),
            sub:   `${audit.byFlag.disconnected} desconec. · ${audit.byFlag.mock} sin datos`,
            valueColor: noSourceKpiCount > 0 ? "#d97706" : "#15803d",
          },
          {
            icon:  "▲",
            iconColor: audit.overallReadinessScore >= 70 ? "#15803d" : audit.overallReadinessScore >= 40 ? "#d97706" : "#dc2626",
            iconBg:    audit.overallReadinessScore >= 70 ? "#f0fdf4" : audit.overallReadinessScore >= 40 ? "#fffbeb" : "#fff0f0",
            label: "Integración lista",
            value: `${audit.overallReadinessScore}%`,
            sub:   `${audit.rows.filter(r => r.isReady).length} KPIs operacionales`,
            valueColor: audit.overallReadinessScore >= 70 ? "#15803d" : audit.overallReadinessScore >= 40 ? "#d97706" : "#dc2626",
          },
        ] as const).map(card => (
          <div key={card.label} className="ag-kpi-card" style={{
            padding: "14px 16px",
            minHeight: 96,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 0,
          }}>
            {/* Icon + label row */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 5,
                background: card.iconBg, color: card.iconColor,
                fontSize: "11px", fontWeight: 700, flexShrink: 0,
              }}>
                {card.icon}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "10px",
                color: "var(--ink-faint)", fontWeight: 500,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {card.label}
              </span>
            </div>
            {/* Value */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700,
              lineHeight: 1, color: card.valueColor,
              marginBottom: 6, letterSpacing: "-0.01em",
            }}>
              {card.value}
            </div>
            {/* Sub */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "10px",
              color: "var(--ink-faint)", lineHeight: 1.4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Runtime hydration strip ── */}
      {runtimeKpiKeys.size === 0 && (
        <div style={{ margin: "14px 0 0", padding: "9px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 7, fontFamily: "var(--font-mono)", fontSize: "11px", color: "#15803d", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>
            Agentik ya tiene datos reales (CRM, SAG ventas/cobros, maletas, banco). Ejecuta la detección automática para que cada KPI muestre su fuente runtime actual en lugar de &ldquo;Sin fuente&rdquo;.
          </span>
          <a
            href={`/api/orgs/${orgSlug}/operational-map/runtime-sources`}
            target="_blank"
            rel="noopener"
            style={{ padding: "4px 12px", borderRadius: 5, background: "#16a34a", color: "#fff", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            Ver detección →
          </a>
        </div>
      )}

      {/* ── Meeting mode hint ── */}
      {!meetingMode && (
        <div style={{ margin: "14px 0 0", padding: "9px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, fontFamily: "var(--font-mono)", fontSize: "11px", color: "#1d4ed8", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flexShrink: 0 }}>💡</span>
          <span>Agrega <code style={{ background: "#dbeafe", borderRadius: 3, padding: "0 4px" }}>?meeting=1</code> a la URL para el modo reunión SAG optimizado para aprobaciones rápidas.</span>
        </div>
      )}

      {/* ── Certification panel ── */}
      <div style={{ marginTop: 16 }} />
      <OperationalConnectionAuditPanel
        audit={audit}
        orgSlug={orgSlug}
        meetingMode={meetingMode}
        gapReport={gapReport}
        kpiSources={kpiSources}
      />
    </div>
  );
}
