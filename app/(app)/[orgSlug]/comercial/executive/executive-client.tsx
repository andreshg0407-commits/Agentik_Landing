/**
 * Commercial Executive — mobile/tablet client component.
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01 / B02 / B02.1
 *
 * Mobile-first executive presentation. 390px target.
 * ALL business math pre-computed by the assembler — React only renders.
 *
 * Information Architecture:
 *   Resumen       — executive overview of all commercial domains
 *   Inteligencia  — prioritized insights (Requiere atencion / Oportunidades / Seguimiento)
 *   Informes      — permanent report catalog
 *
 * React may: format, render, expand/collapse, filter pre-computed collections.
 * React may NOT: calculate sales KPIs, aging, low rotation, inventory values.
 */
"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  CommercialExecutivePA,
  LowRotationImportItem,
  ExecutiveInsight,
  ExecutiveReport,
  InsightKind,
  InsightSeverity,
} from "@/lib/comercial/executive/commercial-executive-types";

// ── Helpers (presentation only) ──────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString("es-CO")}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-CO");
}

type ExecTab = "resumen" | "inteligencia" | "informes";

// ── Main ─────────────────────────────────────────────────────────────────────

export function CommercialExecutiveClient({
  orgSlug,
  pa,
}: {
  orgSlug: string;
  pa: CommercialExecutivePA;
}) {
  const [activeTab, setActiveTab] = useState<ExecTab>("resumen");
  const [showLowRotation, setShowLowRotation] = useState(false);

  const criticalCount = pa.insights.filter(i => i.severity === "critical").length;

  return (
    <div style={{
      fontFamily: T.sans,
      fontSize: T.sz.base,
      color: C.ink,
      background: C.surface,
      minHeight: "100dvh",
      maxWidth: 640,
      margin: "0 auto",
      padding: `${S[4]}px ${S[4]}px ${S[6]}px`,
    }}>
      {/* Header */}
      <header style={{ marginBottom: S[4] }}>
        <div style={{
          fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase" as const,
          letterSpacing: "0.06em", marginBottom: 4,
        }}>
          Agentik · Comercial
        </div>
        <div style={{ fontSize: 24, fontWeight: T.wt.bold, color: C.titleDeep, letterSpacing: "-0.3px" }}>
          {activeTab === "resumen" && "Resumen ejecutivo"}
          {activeTab === "inteligencia" && "Inteligencia"}
          {activeTab === "informes" && "Informes"}
        </div>
        <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>
          {new Date(pa.asOf).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </header>

      {/* Tab bar */}
      <nav style={{
        display: "flex", gap: S[1],
        marginBottom: S[4],
        borderBottom: `1px solid ${C.line}`,
        paddingBottom: S[1],
      }}>
        {(["resumen", "inteligencia", "informes"] as ExecTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: `${S[2]}px ${S[2]}px`,
              border: "none",
              background: "transparent",
              fontFamily: T.sans,
              fontSize: T.sz.sm,
              fontWeight: activeTab === tab ? T.wt.bold : T.wt.medium,
              color: activeTab === tab ? C.blueDark : C.inkLight,
              cursor: "pointer",
              touchAction: "manipulation",
              borderBottom: activeTab === tab ? `2px solid ${C.blueDark}` : "2px solid transparent",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            {tab === "resumen" && "Resumen"}
            {tab === "inteligencia" && "Inteligencia"}
            {tab === "informes" && "Informes"}
            {tab === "inteligencia" && criticalCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 18, height: 18, borderRadius: 9,
                background: C.redDark, color: C.white,
                fontSize: 10, fontWeight: T.wt.bold,
                padding: "0 4px",
              }}>
                {criticalCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Resumen tab */}
      {activeTab === "resumen" && (
        <ResumenTab pa={pa} showLowRotation={showLowRotation} onToggleLowRotation={() => setShowLowRotation(v => !v)} />
      )}

      {/* Inteligencia tab */}
      {activeTab === "inteligencia" && (
        <InteligenciaTab insights={pa.insights} />
      )}

      {/* Informes tab */}
      {activeTab === "informes" && (
        <InformesTab reports={pa.reports} />
      )}
    </div>
  );
}

// ── Resumen tab ─────────────────────────────────────────────────────────────

function ResumenTab({
  pa,
  showLowRotation,
  onToggleLowRotation,
}: {
  pa: CommercialExecutivePA;
  showLowRotation: boolean;
  onToggleLowRotation: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {pa.ventas && (
        <ExecCard title="Ventas" periodo={pa.ventas.periodo}>
          <KpiRow items={[
            { label: "Mes", value: fmtCOP(pa.ventas.ventasMes) },
            { label: "Semana", value: fmtCOP(pa.ventas.ventasSemana) },
            { label: "Hoy", value: fmtCOP(pa.ventas.ventasHoy) },
          ]} />
        </ExecCard>
      )}

      {pa.pedidos && (
        <ExecCard title="Pedidos" periodo={pa.pedidos.periodo}>
          <KpiRow items={[
            { label: "Mes", value: fmtNum(pa.pedidos.pedidosMes) },
            { label: "Total", value: fmtNum(pa.pedidos.pedidosTotal) },
            { label: "Ticket prom.", value: fmtCOP(pa.pedidos.ticketPromedio) },
          ]} />
        </ExecCard>
      )}

      {pa.cartera && (
        <ExecCard title="Cartera">
          <KpiRow items={[
            { label: "Total", value: fmtCOP(pa.cartera.totalCartera) },
            { label: "Vencida", value: fmtCOP(pa.cartera.carteraVencida), tone: pa.cartera.porcentajeVencido > 30 ? "critical" : pa.cartera.porcentajeVencido > 15 ? "warning" : "neutral" },
            { label: "% Vencido", value: `${pa.cartera.porcentajeVencido}%` },
          ]} />
        </ExecCard>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
        {pa.clientes && (
          <ExecCard title="Clientes" compact>
            <div style={{ fontSize: 28, fontWeight: T.wt.bold, color: C.titleDeep, fontVariantNumeric: "tabular-nums" }}>
              {fmtNum(pa.clientes.clientesActivos)}
            </div>
            {pa.clientes.clientesNuevos > 0 && (
              <div style={{ fontSize: T.sz.xs, color: C.greenDark, marginTop: 2 }}>
                +{pa.clientes.clientesNuevos} nuevos
              </div>
            )}
          </ExecCard>
        )}
        {pa.vendedores && (
          <ExecCard title="Vendedores" compact>
            <div style={{ fontSize: 28, fontWeight: T.wt.bold, color: C.titleDeep, fontVariantNumeric: "tabular-nums" }}>
              {fmtNum(pa.vendedores.vendedoresOperativos)}
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
              operativos
            </div>
          </ExecCard>
        )}
      </div>

      <ImportacionesExecCard
        section={pa.importaciones}
        showLowRotation={showLowRotation}
        onToggleLowRotation={onToggleLowRotation}
      />

      {pa.inventario && (
        <ExecCard title="Inventario">
          <KpiRow items={[
            { label: "Total refs", value: fmtNum(pa.inventario.refsTotales) },
            { label: "Criticas", value: fmtNum(pa.inventario.refsCriticas), tone: pa.inventario.refsCriticas > 0 ? "warning" : "neutral" },
            { label: "Agotadas", value: fmtNum(pa.inventario.refsAgotadas), tone: pa.inventario.refsAgotadas > 0 ? "critical" : "neutral" },
          ]} />
        </ExecCard>
      )}
    </div>
  );
}

// ── Inteligencia tab ────────────────────────────────────────────────────────

const KIND_CONFIG: Record<InsightKind, { label: string; color: string; bg: string; border: string }> = {
  RISK: { label: "Requiere atencion", color: C.redDark, bg: "rgba(220,38,38,0.04)", border: "rgba(220,38,38,0.12)" },
  OPPORTUNITY: { label: "Oportunidades", color: C.greenDark, bg: "rgba(22,163,74,0.04)", border: "rgba(22,163,74,0.12)" },
  OBSERVATION: { label: "Seguimiento", color: C.inkLight, bg: C.surfaceAlt, border: C.line },
};

const SEVERITY_CARD_COLOR: Record<InsightSeverity, string> = {
  critical: C.redDark,
  warning: C.amberDark,
  info: C.inkLight,
};

function InteligenciaTab({ insights }: { insights: ExecutiveInsight[] }) {
  if (insights.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: `${S[6]}px ${S[4]}px`, color: C.inkFaint }}>
        <div style={{ fontSize: T.sz.lg, marginBottom: S[2] }}>Sin senales activas</div>
        <div style={{ fontSize: T.sz.sm }}>No hay alertas ni oportunidades identificadas en este momento.</div>
      </div>
    );
  }

  const groups: { kind: InsightKind; items: ExecutiveInsight[] }[] = [];
  for (const k of ["RISK", "OPPORTUNITY", "OBSERVATION"] as InsightKind[]) {
    const items = insights.filter(i => i.kind === k);
    if (items.length > 0) groups.push({ kind: k, items });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {groups.map(g => (
        <div key={g.kind}>
          <div style={{
            fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: KIND_CONFIG[g.kind].color,
            textTransform: "uppercase" as const,
            letterSpacing: "0.04em",
            marginBottom: S[2],
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              display: "inline-block", width: 8, height: 8,
              borderRadius: 4, background: KIND_CONFIG[g.kind].color,
            }} />
            {KIND_CONFIG[g.kind].label}
            <span style={{ fontWeight: T.wt.normal, color: C.inkFaint }}>({g.items.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {g.items.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: ExecutiveInsight }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = KIND_CONFIG[insight.kind];

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      padding: S[3],
    }}>
      {/* What */}
      <div style={{
        fontSize: T.sz.sm, fontWeight: T.wt.semibold,
        color: C.ink, lineHeight: 1.4,
      }}>
        {insight.what}
      </div>

      {/* Domain tag */}
      <div style={{
        marginTop: S[1], display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{
          fontSize: 10, color: C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}>
          {insight.domain}
        </span>
        {insight.truthStatus === "PARTIAL" && (
          <span style={{ fontSize: 9, color: C.amberDark }}>Parcial</span>
        )}
      </div>

      {/* Expand/collapse */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          marginTop: S[2], border: "none", background: "transparent",
          fontFamily: T.sans, fontSize: T.sz.xs,
          color: C.blueDark, cursor: "pointer", padding: 0,
          touchAction: "manipulation",
        }}
      >
        {expanded ? "Ocultar detalle" : "Ver detalle"}
      </button>

      {expanded && (
        <div style={{ marginTop: S[2], display: "flex", flexDirection: "column", gap: S[2] }}>
          {/* Why */}
          <div>
            <div style={{ fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 2 }}>
              Por que importa
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.ink, lineHeight: 1.4 }}>
              {insight.why}
            </div>
          </div>

          {/* Evidence */}
          <div>
            <div style={{ fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 2 }}>
              Evidencia
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.ink, lineHeight: 1.4 }}>
              {insight.evidence}
            </div>
          </div>

          {/* Suggested next step */}
          {insight.suggestedNextStep && (
            <div style={{
              marginTop: S[1], padding: `${S[1]}px ${S[2]}px`,
              background: C.white, borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              fontSize: T.sz.xs, color: C.blueDark,
              fontWeight: T.wt.medium,
            }}>
              {insight.suggestedNextStep}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Informes tab ────────────────────────────────────────────────────────────

function InformesTab({ reports }: { reports: ExecutiveReport[] }) {
  if (reports.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: `${S[6]}px ${S[4]}px`, color: C.inkFaint }}>
        <div style={{ fontSize: T.sz.lg, marginBottom: S[2] }}>Sin informes disponibles</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {reports.map(report => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: ExecutiveReport }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: S[3],
      opacity: report.available ? 1 : 0.5,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.titleDeep,
          }}>
            {report.title}
          </div>
          <div style={{
            fontSize: T.sz.xs, color: C.inkLight, marginTop: 2, lineHeight: 1.4,
          }}>
            {report.description}
          </div>
        </div>
        <span style={{
          fontSize: 10, color: C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
          marginLeft: S[2],
          flexShrink: 0,
        }}>
          {report.domain}
        </span>
      </div>
      {!report.available && (
        <div style={{ marginTop: S[1], fontSize: 10, color: C.inkFaint }}>
          Sin datos disponibles
        </div>
      )}
    </div>
  );
}

// ── Importaciones executive card ─────────────────────────────────────────────

function ImportacionesExecCard({
  section,
  showLowRotation,
  onToggleLowRotation,
}: {
  section: CommercialExecutivePA["importaciones"];
  showLowRotation: boolean;
  onToggleLowRotation: () => void;
}) {
  if (section.totalRefs === 0) return null;

  const lowRotationCount = section.refsEnBajaRotacion;
  const sinFechaCount = section.lowRotationItems.filter(
    i => i.rotationStatus === "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION",
  ).length;

  return (
    <ExecCard title="Importaciones">
      <KpiRow items={[
        { label: "Total refs", value: fmtNum(section.totalRefs) },
        { label: "Baja rotacion", value: fmtNum(lowRotationCount), tone: lowRotationCount > 0 ? "warning" : "neutral" },
        { label: "Recompra", value: fmtNum(section.refsAtencionRecompra), tone: section.refsAtencionRecompra > 0 ? "critical" : "neutral" },
      ]} />

      {section.capitalEnBajaRotacion !== null && (
        <div style={{
          marginTop: S[3], padding: `${S[2]}px ${S[3]}px`,
          background: "rgba(234,179,8,0.06)", borderRadius: R.md,
          border: `1px solid rgba(234,179,8,0.15)`,
        }}>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>Capital en baja rotacion</div>
          <div style={{ fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.amberDark, fontVariantNumeric: "tabular-nums" }}>
            {fmtCOP(section.capitalEnBajaRotacion)}
          </div>
          {!section.capitalEnBajaRotacionCertified && (
            <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 2 }}>
              Parcial — no todas las referencias tienen costo registrado
            </div>
          )}
        </div>
      )}

      {sinFechaCount > 0 && (
        <div style={{
          marginTop: S[2], fontSize: T.sz.xs, color: C.inkLight,
          padding: `${S[1]}px ${S[3]}px`,
          background: C.surfaceAlt, borderRadius: R.sm,
        }}>
          {sinFechaCount} ref{sinFechaCount !== 1 ? "s" : ""} sin fecha de actividad de importacion
        </div>
      )}

      {section.lowRotationItems.length > 0 && (
        <div style={{ marginTop: S[3] }}>
          <button onClick={onToggleLowRotation} style={{
            width: "100%", padding: `${S[2]}px 0`,
            border: "none", background: "transparent",
            fontFamily: T.sans, fontSize: T.sz.sm,
            color: C.blueDark, fontWeight: T.wt.semibold,
            cursor: "pointer", textAlign: "center",
            touchAction: "manipulation",
          }}>
            {showLowRotation
              ? "Ocultar detalle"
              : `Ver ${lowRotationCount} ref${lowRotationCount !== 1 ? "s" : ""} en baja rotacion`}
          </button>

          {showLowRotation && (
            <div style={{
              marginTop: S[2], border: `1px solid ${C.line}`, borderRadius: R.md,
              overflow: "hidden", maxHeight: 400, overflowY: "auto",
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                padding: `${S[1]}px ${S[2]}px`,
                background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
                fontSize: 10, fontWeight: T.wt.semibold, color: C.inkLight,
                position: "sticky", top: 0,
              }}>
                <span>Referencia</span>
                <span style={{ textAlign: "right" }}>Stock</span>
                <span style={{ textAlign: "right" }}>Meses</span>
              </div>
              {section.lowRotationItems
                .filter(i => i.rotationStatus === "LOW_ROTATION" || i.rotationStatus === "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION")
                .map(item => (
                  <LowRotationRow key={item.reference} item={item} />
                ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: S[2], fontSize: 10, color: C.inkFaint }}>
        Umbral: {section.lowRotationMonthsThreshold} meses calendario sin actividad de importacion
      </div>
    </ExecCard>
  );
}

function LowRotationRow({ item }: { item: LowRotationImportItem }) {
  const isSinFecha = item.rotationStatus === "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2fr 1fr 1fr",
      padding: `${S[1]}px ${S[2]}px`,
      borderBottom: `1px solid ${C.line}`, fontSize: 11,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.ink, fontWeight: T.wt.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.reference}
        </div>
        <div style={{ color: C.inkFaint, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.description}
        </div>
        {item.lastImportActivitySource !== "UNAVAILABLE" && (
          <div style={{ fontSize: 9, color: C.inkFaint, marginTop: 1 }}>
            {item.lastImportActivitySource === "SAG_RECEIPT_C1_C2" ? "Recibo SAG" : "Ultima compra SAG"}
          </div>
        )}
      </div>
      <span style={{ textAlign: "right", color: C.ink, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
        {fmtNum(item.currentInventory)}
      </span>
      <span style={{
        textAlign: "right", alignSelf: "center", fontVariantNumeric: "tabular-nums",
        color: isSinFecha ? C.inkFaint : C.amberDark,
        fontWeight: isSinFecha ? T.wt.normal : T.wt.semibold,
      }}>
        {isSinFecha ? "\u2014" : `${item.monthsSinceLastActivity}m`}
      </span>
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────

function ExecCard({
  title,
  periodo,
  compact,
  children,
}: {
  title: string;
  periodo?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      boxShadow: E.sm,
      padding: compact ? S[3] : S[4],
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: compact ? S[2] : S[3],
      }}>
        <div style={{
          fontSize: compact ? T.sz.xs : T.sz.sm,
          fontWeight: T.wt.bold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}>
          {title}
        </div>
        {periodo && (
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{periodo}</div>
        )}
      </div>
      {children}
    </div>
  );
}

type KpiTone = "neutral" | "warning" | "critical";

function KpiRow({ items }: { items: Array<{ label: string; value: string; tone?: KpiTone }> }) {
  const toneColor: Record<KpiTone, string> = {
    neutral: C.titleDeep,
    warning: C.amberDark,
    critical: C.redDark,
  };

  return (
    <div style={{ display: "flex", gap: S[2] }}>
      {items.map(item => (
        <div key={item.label} style={{
          flex: 1, textAlign: "center",
          padding: `${S[2]}px ${S[1]}px`,
          background: C.surfaceAlt, borderRadius: R.md,
        }}>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>{item.label}</div>
          <div style={{
            fontSize: T.sz.lg, fontWeight: T.wt.bold,
            color: toneColor[item.tone ?? "neutral"],
            fontVariantNumeric: "tabular-nums",
          }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
