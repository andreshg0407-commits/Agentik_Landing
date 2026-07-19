/**
 * app/(app)/[orgSlug]/agentik/operational-map/page.tsx
 *
 * Centro de Validación Operacional SAG — RSC page.
 *
 * Internal workspace for the SAG × Agentik × Negocio technical meeting.
 * Generates the validation workbook server-side and passes it as props
 * to the client panel.
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import { OperationalWorkspaceHeader }     from "@/components/workspace/operational-workspace-header";
import { generateValidationWorkbook }     from "@/lib/operational-map/workbook/generate-validation-workbook";
import { SagValidationWorkbookPanel }     from "@/components/operational-map/sag-validation-workbook-panel";
import { CoreKpiCertificationPanel }      from "@/components/operational-map/core-kpi-certification-panel";
import { CORE_KPI_GOVERNANCE_PRESETS }    from "@/lib/operational-map/certification/core-kpi-governance-presets";
import { MeetingDetailToggle }            from "@/components/operational-map/meeting-detail-toggle";
import { ProximosPasosCard }              from "@/components/operational-map/proximos-pasos-card";

interface PageProps {
  params: { orgSlug: string };
  searchParams?: { meeting?: string };
}

export default function OperationalMapPage({ params, searchParams }: PageProps) {
  const { orgSlug } = params;
  const meetingMode = searchParams?.meeting === "1";

  // Generate workbook server-side — pure computation, no DB
  const workbook = generateValidationWorkbook(null);
  const s = workbook.executiveSummary;

  // Header status chip
  const headerStatus = s.criticalBlockers > 0
    ? "critical"
    : s.readinessScore >= 80
    ? "ok"
    : "warning";

  // ── Narrative helpers (no logic change, only display framing) ─────────────
  const confirmedSources  = s.byStatus.confirmed;
  const accessBlockers    = s.criticalBlockers + s.highBlockers;
  const pointsToReview    = s.byAnswerState.pending;
  const totalDocumented   = s.totalQuestions;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px" }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════════════════ */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik" },
          { label: "Reunión SAG" },
        ]}
        title="Reunión de Validación SAG × Agentik"
        subtitle="Fuentes identificadas · Accesos por confirmar · Conciliación pendiente de método histórico"
        status={headerStatus}
        statusLabel={
          accessBlockers > 0
            ? `${accessBlockers} accesos por confirmar con SAG`
            : "Fuentes identificadas"
        }
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          TRABAJO REALIZADO POR AGENTIK
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        margin:       "16px 0 0",
        padding:      "16px 20px",
        background:   "#eff6ff",
        border:       "1px solid #bfdbfe",
        borderLeft:   "4px solid #2563eb",
        borderRadius: 8,
        fontFamily:   "var(--font-mono)",
      }}>
        <div style={{
          fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase" as const, color: "#1d4ed8", marginBottom: 10,
        }}>
          Trabajo realizado por Agentik
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}>
          {[
            { icon: "✓", text: "Fuentes operacionales identificadas y clasificadas (Fuente 1 y Fuente 2)" },
            { icon: "✓", text: "KPIs críticos priorizados por dominio operacional" },
            { icon: "✓", text: "Dependencias SAG vs. Agentik mapeadas por cada KPI" },
            { icon: "✓", text: "Vistas de Torre de Control definidas con fórmulas operacionales" },
            { icon: "✓", text: `${s.totalEntities} entidades documentadas · ${confirmedSources} fuentes confirmadas` },
            { icon: "✓", text: "Bloqueadores de integración detectados y priorizados" },
          ].map(item => (
            <div key={item.text} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "#2563eb", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <span style={{ fontSize: "11px", color: "#1e3a8a", lineHeight: 1.5 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RESUMEN EJECUTIVO (4 tarjetas — lenguaje reunión)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14, margin: "16px 0 0",
      }}>
        {([
          {
            label: "Fuentes identificadas",
            value: String(s.totalEntities),
            sub:   `${confirmedSources} confirmadas con SAG`,
            color: "var(--ink)",
          },
          {
            label: "Puntos por revisar hoy",
            value: String(pointsToReview),
            sub:   `de ${totalDocumented} aspectos documentados`,
            color: pointsToReview > 0 ? "#92400e" : "#15803d",
          },
          {
            label: "Decisiones pendientes",
            value: String(accessBlockers),
            sub:   `${s.criticalBlockers} críticos · ${s.highBlockers} requieren definición`,
            color: accessBlockers > 0 ? "#991b1b" : "#15803d",
          },
          {
            label: "Auditoría completada",
            value: s.readinessScore > 0 ? `${s.readinessScore}%` : "Avanzada",
            sub:   s.readinessScore === 0
              ? "accesos históricos pendientes de SAG"
              : "fuentes validadas técnicamente",
            color: "var(--ink)",
          },
        ] as const).map(card => (
          <div key={card.label} className="ag-kpi-card" style={{
            padding: "14px 16px", minHeight: 96,
            display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0,
          }}>
            <div style={{
              fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-faint)",
              marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {card.label}
            </div>
            <div style={{
              fontSize: "22px", fontFamily: "var(--font-mono)", fontWeight: 700,
              color: card.color, lineHeight: 1, marginBottom: 6, letterSpacing: "-0.01em",
            }}>
              {card.value}
            </div>
            <div style={{
              fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-faint)",
              lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOQUEADOR PRINCIPAL — protagonista absoluto
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        margin:       "16px 0 0",
        padding:      "18px 20px",
        background:   "#fef2f2",
        border:       "1.5px solid #fca5a5",
        borderLeft:   "5px solid #dc2626",
        borderRadius: 8,
        fontFamily:   "var(--font-mono)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: "18px", color: "#dc2626", flexShrink: 0, lineHeight: 1.2 }}>▲</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "13px", fontWeight: 700, color: "#991b1b",
              letterSpacing: "0.01em", marginBottom: 8,
            }}>
              Bloqueador principal: Acceso histórico a pagos y recaudos
            </div>
            <div style={{ fontSize: "12px", color: "#7f1d1d", lineHeight: 1.65, marginBottom: 10 }}>
              Actualmente <strong>no es posible realizar conciliación histórica completa</strong> entre
              ventas, recaudos, cartera y clientes. El sistema carece de acceso histórico a las fuentes
              oficiales de pagos y recaudos en SAG.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{
                background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6,
                padding: "10px 12px",
              }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#991b1b", letterSpacing: "0.07em", marginBottom: 4 }}>
                  IMPACTO
                </div>
                <div style={{ fontSize: "11px", color: "#7f1d1d", lineHeight: 1.5 }}>
                  Sin este acceso, la conciliación queda incompleta y los KPIs financieros
                  históricos no pueden calcularse con datos reales de SAG.
                </div>
              </div>
              <div style={{
                background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6,
                padding: "10px 12px",
              }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#9a3412", letterSpacing: "0.07em", marginBottom: 4 }}>
                  ACCIÓN REQUERIDA HOY
                </div>
                <div style={{ fontSize: "11px", color: "#7c2d12", lineHeight: 1.5 }}>
                  Definir junto con SAG el método oficial de extracción histórica
                  para pagos y recaudos.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PREGUNTAS PARA RESOLVER HOY
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        margin:       "16px 0 0",
        padding:      "16px 20px",
        background:   "var(--surface-alt, #f8fafc)",
        border:       "1px solid var(--line, #e2e8f0)",
        borderLeft:   "4px solid #64748b",
        borderRadius: 8,
        fontFamily:   "var(--font-mono)",
      }}>
        <div style={{
          fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase" as const, color: "var(--ink-mid, #64748b)", marginBottom: 10,
        }}>
          Preguntas para resolver hoy
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
          {[
            "¿Cuál es el método oficial recomendado para acceso histórico?",
            "¿Cuál es la fuente oficial para pagos históricos completos?",
            "¿Existe una vista consolidada para pagos y recaudos?",
            "¿Qué tablas consideran fuente oficial para conciliación?",
            "¿Qué frecuencia recomiendan para sincronización?",
            "¿Existen restricciones para acceso externo?",
          ].map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "10px",
                color: "#94a3b8", flexShrink: 0, marginTop: 2,
              }}>
                {i + 1}.
              </span>
              <span style={{ fontSize: "12px", color: "var(--ink, #0f172a)", lineHeight: 1.55 }}>
                {q}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RESULTADO ESPERADO DE ESTA REUNIÓN
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        margin:       "16px 0 0",
        padding:      "16px 20px",
        background:   "#fffbeb",
        border:       "1px solid #fde68a",
        borderLeft:   "4px solid #d97706",
        borderRadius: 8,
        fontFamily:   "var(--font-mono)",
      }}>
        <div style={{
          fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase" as const, color: "#92400e", marginBottom: 10,
        }}>
          Resultado esperado de esta reunión
        </div>
        <div style={{ fontSize: "12px", color: "#78350f", marginBottom: 10, lineHeight: 1.6 }}>
          Al finalizar buscamos definir:
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 7, paddingLeft: 4 }}>
          {[
            "Método oficial de integración",
            "Método oficial de acceso histórico",
            "Fuentes oficiales para conciliación",
            "Frecuencia de sincronización",
            "Próximos pasos SAG ↔ Agentik",
          ].map(item => (
            <div key={item} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#d97706", flexShrink: 0, fontSize: "10px" }}>▸</span>
              <span style={{ fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PRÓXIMOS PASOS ACORDADOS — captura en vivo (client component)
      ═══════════════════════════════════════════════════════════════════════ */}
      <ProximosPasosCard orgSlug={orgSlug} meetingType="sag_validation" />

      {/* ═══════════════════════════════════════════════════════════════════════
          DETALLE TÉCNICO — colapsado por defecto
          KPI Governance + Workbook detrás del toggle
      ═══════════════════════════════════════════════════════════════════════ */}
      <MeetingDetailToggle>
        {/* KPI Governance Table */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--ink-faint)",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {meetingMode ? "Fuentes identificadas por KPI" : "Certificación de KPIs Operacionales"}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <CoreKpiCertificationPanel
            presets={CORE_KPI_GOVERNANCE_PRESETS}
            orgSlug={orgSlug}
            meetingMode={meetingMode}
          />
        </div>

        {/* Workbook técnico */}
        {!meetingMode && (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 12, margin: "40px 0 32px",
            }}>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--ink-faint)",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                Workbook de Validación SAG — Detalle Técnico
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <SagValidationWorkbookPanel
              workbook={workbook}
              orgSlug={orgSlug}
              meetingMode={meetingMode}
            />
          </>
        )}
      </MeetingDetailToggle>

      {/* ── Meeting mode hint ── */}
      {!meetingMode && (
        <div style={{
          marginTop:    24,
          padding:      "12px 16px",
          background:   "#eff6ff",
          border:       "1px solid #bfdbfe",
          borderRadius: 8,
          fontFamily:   "var(--font-mono)",
          fontSize:     "11px",
          color:        "#1d4ed8",
        }}>
          Tip: Agrega <code>?meeting=1</code> a la URL para activar el modo reunión — oculta detalles técnicos y deja solo lo relevante para SAG.
        </div>
      )}
    </div>
  );
}
