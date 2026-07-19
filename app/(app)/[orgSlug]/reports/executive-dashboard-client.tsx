"use client";

/**
 * Centro de Control Ejecutivo — Agentik Enterprise OS
 *
 * CASTILLITOS-EXECUTIVE-UX-CLEANUP-01
 *
 * CEO-first executive dashboard. Shows results, not engines.
 * Order: Executive Summary > Disponibilidad > Maletas > Produccion >
 *        Reposicion > Vendedores > Calidad de Datos > Diagnostico Interno.
 *
 * Mobile-first. Business-language. Every card traceable.
 */

import { useState } from "react";
import { C, T, S, R, E, panel, panelHeader, dataRow } from "@/lib/ui/tokens";
import {
  StatusChip,
  AttentionBadge,
  WorkspaceSection,
  EmptyOperationalState,
  ModulePulseHeader,
} from "@/components/shell/operational-primitives";
import type {
  ExecutiveDashboardState,
  ExecutiveKpiCard,
  SignalCategorySummary,
  ExecutiveTimelineEntry,
  RuleSummaryCard,
  PlanSummaryCard,
  DecisionSummaryCard,
  ActionSummaryCard,
  BusinessTraceChain,
} from "@/lib/executive-dashboard";
import {
  severityColor,
  healthColor,
  entryTypeLabel,
  actionStatusLabel,
  approvalStatusLabel,
} from "@/lib/executive-dashboard";
import type { DailyHighlight } from "@/lib/executive-dashboard";
import { buildDailyHighlights, buildExecutiveQuestions } from "@/lib/executive-dashboard";
import type { ExecutiveQuestion } from "@/lib/executive-dashboard";
import {
  totalActiveSignals,
  totalCriticalSignals,
  actionsPendingApproval,
  hasActionableItems,
} from "@/lib/executive-dashboard";
import type {
  CommercialAvailabilityReport,
  AvailabilityRow,
  AvailabilitySubLineaSummary,
  MaletaReplacementReport,
  MaletaReplacementItem,
} from "@/lib/commercial-intelligence";
import type {
  ProductionInProgressReport,
  ProductionRow,
  ProductionSubLineaSummary,
} from "@/lib/production-intelligence";
import type {
  CastillitosExecutiveIntelligence,
  ExecutiveAlert,
  CeoExecutiveQuestion,
  VendorExecutiveSummary,
  VendorSummaryRow,
  ExecutiveDataQuality,
  DataSourceStatus,
} from "@/lib/executive-dashboard";
import {
  buildExecutiveAlerts,
  buildCeoExecutiveQuestions,
} from "@/lib/executive-dashboard";
import type { ProductionFlowSnapshot, ProductionFlowExecutiveReport, ProductionReferenceFlow, ProductionFlowSubLineaSummary } from "@/lib/production-intelligence/production-flow-types";
import type { ReplenishmentSnapshot, ReplenishmentExecutiveReport, ReplenishmentRecommendation, ReplenishmentSummary } from "@/lib/replenishment-intelligence/replenishment-types";

// ── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  state: ExecutiveDashboardState;
  availabilityReport?: CommercialAvailabilityReport | null;
  maletaReport?: MaletaReplacementReport | null;
  productionReport?: ProductionInProgressReport | null;
  executiveIntelligence?: CastillitosExecutiveIntelligence | null;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ExecutiveControlCenter({ orgSlug, state, availabilityReport, maletaReport, productionReport, executiveIntelligence }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    diagnostics: true,
  });

  const toggle = (id: string) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const intel = executiveIntelligence;
  const alerts = intel ? buildExecutiveAlerts(intel) : [];
  const criticalAlerts = alerts.filter(a => a.severity === "critical" || a.severity === "high");

  const pulseSignal = criticalAlerts.length > 0
    ? "critical" as const
    : alerts.length > 0
      ? "warn" as const
      : "ok" as const;
  const pulseText = criticalAlerts.length > 0
    ? `${criticalAlerts.length} alerta(s) critica(s) requieren atencion`
    : alerts.length > 0
      ? `${alerts.length} alerta(s) activa(s) — sin criticas`
      : "Operacion sin alertas";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: `0 ${S[3]}px ${S[8]}px` }}>
      <ModulePulseHeader
        breadcrumbs={[
          { label: "Gestion", href: `/${orgSlug}` },
          { label: "Informes Inteligentes" },
        ]}
        title="Informes Inteligentes"
        subtitle={`Generado ${fmtDateTime(state.assembledAt)}`}
        status={pulseSignal === "critical" ? "critical" : pulseSignal === "warn" ? "warning" : "ok"}
        statusLabel={pulseText}
        pulse={{ signal: pulseSignal, text: pulseText }}
      />

      {/* FASE 3 — Resumen Ejecutivo del Dia */}
      <ExecutiveDaySummary
        intel={intel}
        availabilityReport={availabilityReport}
        productionReport={productionReport}
        alerts={alerts}
      />

      {/* FASE 1-2 — Disponibilidad Comercial */}
      <CollapsibleSection
        id="disponibilidad"
        title="Disponibilidad Comercial"
        subtitle="Inventario Bodega 01 disponible para venta"
        badge={availabilityReport?.sinExistenciaCount}
        badgeCritical={(availabilityReport?.sinExistenciaCount ?? 0) > 0}
        collapsed={collapsed.disponibilidad}
        onToggle={() => toggle("disponibilidad")}
      >
        {availabilityReport ? (
          <AvailabilitySection report={availabilityReport} />
        ) : (
          <EmptyOperationalState
            message="Sin datos de disponibilidad"
            detail="Pendiente sincronizacion de inventario SAG Bodega 01"
          />
        )}
      </CollapsibleSection>

      {/* FASE 10 — Gestion de Maletas */}
      <CollapsibleSection
        id="maletas"
        title="Gestion de Maletas"
        subtitle="Referencias a retirar o reemplazar en maletas de vendedores"
        badge={maletaReport?.totalRequiringReplacement}
        badgeCritical={(maletaReport?.totalRequiringReplacement ?? 0) > 0}
        collapsed={collapsed.maletas}
        onToggle={() => toggle("maletas")}
      >
        <MaletasSection maletaReport={maletaReport} vendorSummary={intel?.vendorSummary} />
      </CollapsibleSection>

      {/* FASE 11 — Produccion */}
      <CollapsibleSection
        id="produccion"
        title="Produccion y Recuperacion"
        subtitle="Estado de produccion activa y recuperacion de agotados"
        badge={intel?.productionFlow?.summary.outOfStockWithoutProduction}
        badgeCritical={(intel?.productionFlow?.summary.outOfStockWithoutProduction ?? 0) > 0}
        collapsed={collapsed.produccion}
        onToggle={() => toggle("produccion")}
      >
        {intel?.productionFlowExecutive && intel.productionFlow ? (
          <ProductionFlowSection exec={intel.productionFlowExecutive} flow={intel.productionFlow} />
        ) : productionReport ? (
          <ProductionBasicSection report={productionReport} />
        ) : (
          <EmptyOperationalState
            message="Sin datos de produccion"
            detail="Pendiente sincronizacion de ordenes de produccion SAG"
          />
        )}
      </CollapsibleSection>

      {/* FASE 12 — Reposicion Recomendada */}
      {intel?.replenishment && (
        <CollapsibleSection
          id="reposicion"
          title="Reposicion Recomendada"
          subtitle="Que reponer, donde, por que"
          badge={intel.replenishment.summary.criticalCount + intel.replenishment.summary.highCount}
          badgeCritical={intel.replenishment.summary.criticalCount > 0}
          collapsed={collapsed.reposicion}
          onToggle={() => toggle("reposicion")}
        >
          <ReplenishmentSection snapshot={intel.replenishment} exec={intel.replenishmentExecutive} />
        </CollapsibleSection>
      )}

      {/* FASE 13 — Salud de Vendedores */}
      <CollapsibleSection
        id="vendedores"
        title="Salud de Vendedores"
        subtitle="Estado operativo de vendedores y maletas"
        badge={intel?.vendorSummary?.vendorsWithCriticalRefs}
        badgeCritical={(intel?.vendorSummary?.vendorsWithCriticalRefs ?? 0) > 0}
        collapsed={collapsed.vendedores}
        onToggle={() => toggle("vendedores")}
      >
        <VendorHealthSection summary={intel?.vendorSummary} />
      </CollapsibleSection>

      {/* FASE 15 — Calidad de Datos */}
      {intel && (
        <CollapsibleSection
          id="calidad"
          title="Calidad de Datos"
          subtitle="Fuentes activas, pendientes y confianza"
          collapsed={collapsed.calidad ?? true}
          onToggle={() => toggle("calidad")}
        >
          <DataQualitySection quality={intel.dataQuality} />
        </CollapsibleSection>
      )}

      {/* FASE 16 — Diagnostico Interno (collapsed by default) */}
      <CollapsibleSection
        id="diagnostics"
        title="Diagnostico Interno Agentik"
        subtitle="Motores, signals, reglas — solo administradores"
        collapsed={collapsed.diagnostics ?? true}
        onToggle={() => toggle("diagnostics")}
      >
        <DiagnosticsSection state={state} intel={intel} />
      </CollapsibleSection>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  id,
  title,
  subtitle,
  badge,
  badgeCritical,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  badge?: number;
  badgeCritical?: boolean;
  collapsed?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed ?? false;

  return (
    <WorkspaceSection title="" divider style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: S[2],
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginBottom: isCollapsed ? 0 : S[4],
          textAlign: "left",
        }}
      >
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkLight,
          transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
          flexShrink: 0,
        }}>
          ▼
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.lg,
          fontWeight: T.wt.bold,
          color: C.ink,
          lineHeight: 1.2,
        }}>
          {title}
        </span>
        {badge != null && badge > 0 && (
          <AttentionBadge count={badge} critical={badgeCritical} />
        )}
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkLight,
          marginLeft: "auto",
        }}>
          {subtitle}
        </span>
      </button>
      {!isCollapsed && children}
    </WorkspaceSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3 — Resumen Ejecutivo del Dia
// ═══════════════════════════════════════════════════════════════════════════════

function ExecutiveDaySummary({ intel, availabilityReport, productionReport, alerts }: {
  intel?: CastillitosExecutiveIntelligence | null;
  availabilityReport?: CommercialAvailabilityReport | null;
  productionReport?: ProductionInProgressReport | null;
  alerts: ExecutiveAlert[];
}) {
  const avail = availabilityReport;
  const flow = intel?.productionFlow;
  const replen = intel?.replenishment;
  const quality = intel?.dataQuality;

  // Compute executive cards
  const cards: Array<{ label: string; value: string; color?: string; detail?: string }> = [];

  if (avail) {
    cards.push({
      label: "Disponible para vender",
      value: String(avail.disponibleCount),
      color: C.green,
      detail: `${fmtNum(avail.totalDisponible)} unidades disponibles`,
    });
    cards.push({
      label: "Sin existencia",
      value: String(avail.sinExistenciaCount),
      color: avail.sinExistenciaCount > 0 ? C.red : C.green,
      detail: "Referencias con Bodega 01 = 0",
    });
    cards.push({
      label: "Criticas por umbral",
      value: String(avail.sobreComprometidoCount),
      color: avail.sobreComprometidoCount > 0 ? C.red : C.green,
      detail: "Existencia inferior al umbral CEO",
    });
  }

  if (flow) {
    cards.push({
      label: "Para producir",
      value: String(flow.summary.outOfStockWithoutProduction),
      color: flow.summary.outOfStockWithoutProduction > 0 ? C.red : C.green,
      detail: "Agotados sin produccion activa",
    });
  }

  if (replen) {
    cards.push({
      label: "Para sacar de maletas",
      value: String(replen.summary.replaceCount),
      color: replen.summary.replaceCount > 0 ? C.amber : C.green,
      detail: "Referencias a retirar o reemplazar",
    });
  }

  if (quality) {
    cards.push({
      label: "Confianza de datos",
      value: `${quality.overallConfidence}%`,
      color: quality.overallConfidence >= 70 ? C.green : quality.overallConfidence >= 40 ? C.amber : C.red,
      detail: quality.qualitySummary,
    });
  }

  return (
    <div style={{ marginBottom: S[5] }}>
      {/* Alert strip */}
      {alerts.length > 0 && (
        <div style={{
          ...panel,
          padding: `${S[2]}px ${S[3]}px`,
          marginBottom: S[3],
          borderLeft: `3px solid ${alerts.some(a => a.severity === "critical") ? C.red : C.amber}`,
        }}>
          {alerts.slice(0, 3).map((alert) => (
            <div key={alert.id} style={{
              display: "flex",
              alignItems: "center",
              gap: S[2],
              padding: `${S[1]}px 0`,
            }}>
              <SeverityDot severity={alert.severity} />
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz.sm,
                fontWeight: T.wt.semibold,
                color: C.ink,
                flex: 1,
              }}>
                {alert.title}
              </span>
              {alert.recommendedAction && (
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz["2xs"],
                  color: C.blueDark,
                  fontStyle: "italic",
                  flexShrink: 0,
                }}>
                  {alert.recommendedAction}
                </span>
              )}
            </div>
          ))}
          {alerts.length > 3 && (
            <div style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color: C.inkLight,
              paddingTop: S[1],
            }}>
              +{alerts.length - 3} alerta(s) mas
            </div>
          )}
        </div>
      )}

      {/* Executive KPI cards */}
      {cards.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: S[3],
        }}>
          {cards.map((card, i) => (
            <div key={i} className="ag-kpi-card" style={{
              ...panel,
              padding: `${S[3]}px ${S[3]}px`,
            }}>
              <div style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.bold,
                color: C.inkLight,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: S[1],
              }}>
                {card.label}
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xl"],
                fontWeight: T.wt.black,
                color: card.color ?? C.ink,
                lineHeight: 1.2,
                fontVariantNumeric: "tabular-nums",
              }}>
                {card.value}
              </div>
              {card.detail && (
                <div style={{
                  fontFamily: T.mono,
                  fontSize: T.sz["2xs"],
                  color: C.inkLight,
                  marginTop: S[1],
                }}>
                  {card.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASES 5-9 — Disponibilidad Comercial
// ═══════════════════════════════════════════════════════════════════════════════

type AvailFilter = "disponibles" | "criticas" | "sin_existencia" | "todas";

function AvailabilitySection({ report }: { report: CommercialAvailabilityReport }) {
  const [expandedSL, setExpandedSL] = useState<string | null>(null);
  const [filter, setFilter] = useState<AvailFilter>("disponibles");

  return (
    <div>
      {/* Summary strip — FASE 4 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <ExecKpi label="Disponible para vender" value={String(report.disponibleCount)} color={C.green} />
        <ExecKpi label="Sin existencia" value={String(report.sinExistenciaCount)} color={report.sinExistenciaCount > 0 ? C.red : C.ink} />
        <ExecKpi label="Criticas" value={String(report.sobreComprometidoCount)} color={report.sobreComprometidoCount > 0 ? C.red : C.ink} />
        <ExecKpi label="Disponible real" value={fmtNum(report.totalDisponible)} color={report.totalDisponible < 0 ? C.red : C.green} />
      </div>

      {/* FASE 7 — Filters */}
      <div style={{
        display: "flex",
        gap: S[2],
        marginBottom: S[3],
        flexWrap: "wrap",
      }}>
        {([
          ["disponibles", "Disponibles"] as const,
          ["criticas", "Criticas"] as const,
          ["sin_existencia", "Sin existencia"] as const,
          ["todas", "Ver todo"] as const,
        ]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: filter === key ? T.wt.bold : T.wt.medium,
              color: filter === key ? C.white : C.inkMid,
              background: filter === key ? C.blueDark : C.surfaceAlt,
              border: `1px solid ${filter === key ? C.blueDark : C.line}`,
              borderRadius: R.sm,
              padding: `${S[1]}px ${S[2]}px`,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* FASE 5 — Per-line breakdown */}
      {report.subLineas.map(sl => (
        <AvailabilityLineSection
          key={sl.subLinea}
          sl={sl}
          filter={filter}
          expanded={expandedSL === sl.subLinea}
          onToggle={() => setExpandedSL(expandedSL === sl.subLinea ? null : sl.subLinea)}
        />
      ))}

      {/* Confidence */}
      <div style={{
        marginTop: S[3],
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkFaint,
      }}>
        Confianza: {report.confidence}% — {report.confidenceReason}
      </div>
    </div>
  );
}

function AvailabilityLineSection({ sl, filter, expanded, onToggle }: {
  sl: AvailabilitySubLineaSummary;
  filter: AvailFilter;
  expanded: boolean;
  onToggle: () => void;
}) {
  // FASE 6 — SubGrupo grouping + FASE 8 — ordering
  const allRows = sl.subGrupos.flatMap(sg => sg.rows);

  const filteredRows = allRows.filter(row => {
    if (filter === "disponibles") return row.existenciaBodega01 > 0;
    if (filter === "criticas") return row.status === "sobre_comprometido" || row.status === "comprometido";
    if (filter === "sin_existencia") return row.existenciaBodega01 === 0;
    return true;
  });

  // FASE 8 — sort: available first, then critical, then out of stock
  const sorted = [...filteredRows].sort((a, b) => {
    const order = (r: AvailabilityRow) => {
      if (r.existenciaBodega01 > 0 && r.disponibleReal > 0) return 0;
      if (r.status === "comprometido" || r.status === "sobre_comprometido") return 1;
      if (r.existenciaBodega01 > 0) return 2;
      return 3;
    };
    return order(a) - order(b);
  });

  const lineLabel = sl.subLinea === "CASTILLITOS" ? "Castillitos"
    : sl.subLinea === "LATIN KIDS" ? "Latin Kids"
    : sl.subLinea;

  return (
    <div style={{ marginBottom: S[3] }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: S[2],
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: `${S[2]}px 0`,
          textAlign: "left",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkLight,
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}>
          ▼
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.sm,
          fontWeight: T.wt.bold,
          color: C.ink,
        }}>
          {lineLabel}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
          marginLeft: "auto",
        }}>
          {sl.totalReferences} refs | Disp: {sl.disponibleCount} | Sin stock: {sl.sinExistenciaCount}
        </span>
        {sl.sobreComprometidoCount > 0 && (
          <AttentionBadge count={sl.sobreComprometidoCount} critical />
        )}
      </button>

      {expanded && (
        <PaginatedTable
          rows={sorted}
          renderHeader={() => (
            <tr>
              <th style={th()}>Referencia</th>
              <th style={th()}>Descripcion</th>
              <th style={th()}>SubGrupo</th>
              <th style={th("right")}>Exist. B01</th>
              <th style={th("right")}>Pedidos</th>
              <th style={th("right")}>Disp. Real</th>
              <th style={th()}>Estado</th>
            </tr>
          )}
          renderRow={(row) => (
            <tr key={row.reference} className="ag-op-row">
              <td style={td()}>{row.reference}</td>
              <td style={{ ...td(), maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.description}
              </td>
              <td style={td()}>{row.subGrupo}</td>
              <td style={td("right")}>{row.existenciaBodega01 === 0 ? "\u2014" : fmtNum(row.existenciaBodega01)}</td>
              <td style={td("right")}>{row.pedidosPendientes === 0 ? "\u2014" : fmtNum(row.pedidosPendientes)}</td>
              <td style={{
                ...td("right"),
                fontWeight: T.wt.bold,
                color: row.disponibleReal < 0 ? C.red : row.disponibleReal === 0 ? C.amber : C.green,
              }}>
                {row.disponibleReal}
              </td>
              <td style={td()}>
                <StatusChip variant={availStatusVariant(row.status)}>
                  {availStatusLabel(row.status)}
                </StatusChip>
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 10 — Gestion de Maletas
// ═══════════════════════════════════════════════════════════════════════════════

function MaletasSection({ maletaReport, vendorSummary }: {
  maletaReport?: MaletaReplacementReport | null;
  vendorSummary?: VendorExecutiveSummary | null;
}) {
  if (!maletaReport || maletaReport.totalRequiringReplacement === 0) {
    // No data or no replacements needed
    const vendorNames = vendorSummary?.vendors.map(v => v.vendorName) ?? [
      "Orlando", "Carlos Leon", "Luis", "Nestor", "Carlos Villa", "Fredy",
    ];

    const hasAnyVendorData = vendorSummary?.vendors.some(v => v.totalReferences > 0);

    if (!hasAnyVendorData) {
      return (
        <div style={{ ...panel, padding: `${S[4]}px ${S[5]}px` }}>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            fontWeight: T.wt.bold,
            color: C.ink,
            marginBottom: S[2],
          }}>
            Maletas pendientes de sincronizacion TM 206
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            color: C.inkMid,
            lineHeight: 1.6,
            marginBottom: S[2],
          }}>
            Vendedores detectados: {vendorNames.join(", ")}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkFaint,
          }}>
            Datos de referencias en maleta: Pendientes. La tabla InventoryTransfer requiere migracion.
          </div>
        </div>
      );
    }

    return (
      <EmptyOperationalState
        message="Sin referencias para reemplazar"
        detail="Ninguna referencia en maletas requiere retiro o reemplazo actualmente"
      />
    );
  }

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <ExecKpi label="Para retirar/reemplazar" value={String(maletaReport.totalRequiringReplacement)} color={C.red} />
        <ExecKpi label="Con reemplazo disponible" value={String(maletaReport.items.filter(i => i.recomendacion).length)} color={C.amber} />
      </div>

      <PaginatedTable
        rows={maletaReport.items}
        renderHeader={() => (
          <tr>
            <th style={th()}>Referencia</th>
            <th style={th()}>Descripcion</th>
            <th style={th("right")}>Existencia</th>
            <th style={th()}>Linea</th>
            <th style={th()}>Vendedores</th>
            <th style={th()}>Motivo</th>
            <th style={th()}>Reemplazo sugerido</th>
          </tr>
        )}
        renderRow={(item: MaletaReplacementItem) => (
          <tr key={item.reference} className="ag-op-row">
            <td style={td()}>{item.reference}</td>
            <td style={{ ...td(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.description}
            </td>
            <td style={{
              ...td("right"),
              fontWeight: T.wt.bold,
              color: item.existenciaActual === 0 ? C.red : C.amber,
            }}>
              {item.existenciaActual === 0 ? "\u2014" : item.existenciaActual}
            </td>
            <td style={td()}>{item.subLinea}</td>
            <td style={td()}>
              {item.vendedoresAfectados.length === 0 ? "\u2014" : item.vendedoresAfectados.join(", ")}
            </td>
            <td style={{ ...td(), maxWidth: 180, whiteSpace: "normal", lineHeight: 1.4 }}>
              {item.motivo}
            </td>
            <td style={{ ...td(), maxWidth: 180, whiteSpace: "normal", lineHeight: 1.4, fontStyle: "italic", color: C.inkMid }}>
              {item.recomendacion || "\u2014"}
            </td>
          </tr>
        )}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 11 — Produccion y Recuperacion
// ═══════════════════════════════════════════════════════════════════════════════

function ProductionFlowSection({ exec, flow }: {
  exec: ProductionFlowExecutiveReport;
  flow: ProductionFlowSnapshot;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const s = flow.summary;

  return (
    <div>
      {/* Summary strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <ExecKpi label="Agotados sin produccion" value={String(s.outOfStockWithoutProduction)} color={s.outOfStockWithoutProduction > 0 ? C.red : C.green} />
        <ExecKpi label="Agotados con produccion" value={String(s.outOfStockWithProduction)} color={s.outOfStockWithProduction > 0 ? C.amber : C.green} />
        <ExecKpi label="Proximos a terminar" value={String(s.recoverySoonCount)} color={C.green} />
        <ExecKpi label="Con riesgo retraso" value={String(s.delayRiskCount)} color={s.delayRiskCount > 0 ? C.amber : C.green} />
      </div>

      {/* Grouped by priority */}
      {exec.outOfStockWithoutProduction.length > 0 && (
        <ProductionGroup
          title="Agotados SIN produccion activa"
          subtitle="Requieren nueva OP o reemplazo"
          refs={exec.outOfStockWithoutProduction}
          severity="critical"
          expanded={expandedGroup === "no_prod"}
          onToggle={() => setExpandedGroup(expandedGroup === "no_prod" ? null : "no_prod")}
        />
      )}

      {exec.outOfStockWithProduction.length > 0 && (
        <ProductionGroup
          title="Agotados CON produccion activa"
          subtitle="Monitorear avance o considerar reemplazo temporal"
          refs={exec.outOfStockWithProduction}
          severity="warning"
          expanded={expandedGroup === "with_prod"}
          onToggle={() => setExpandedGroup(expandedGroup === "with_prod" ? null : "with_prod")}
        />
      )}

      {exec.delayRiskReferences.length > 0 && (
        <ProductionGroup
          title="Produccion con riesgo de retraso"
          subtitle="Excede tiempos normales de produccion"
          refs={exec.delayRiskReferences}
          severity="warning"
          expanded={expandedGroup === "delay"}
          onToggle={() => setExpandedGroup(expandedGroup === "delay" ? null : "delay")}
        />
      )}

      {exec.recoverySoonReferences.length > 0 && (
        <ProductionGroup
          title="Proximas a terminar"
          subtitle="Pronto entraran a Bodega 01"
          refs={exec.recoverySoonReferences}
          severity="ok"
          expanded={expandedGroup === "recovery"}
          onToggle={() => setExpandedGroup(expandedGroup === "recovery" ? null : "recovery")}
        />
      )}

      {exec.outOfStockWithoutProduction.length === 0 &&
       exec.outOfStockWithProduction.length === 0 &&
       exec.delayRiskReferences.length === 0 &&
       exec.recoverySoonReferences.length === 0 && (
        <EmptyOperationalState
          message="Sin alertas de produccion"
          detail="Todas las referencias en produccion estan dentro de parametros normales"
        />
      )}

      <div style={{
        marginTop: S[3],
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkFaint,
      }}>
        Confianza: {flow.confidence.score}% — {flow.confidence.reason}
      </div>
    </div>
  );
}

function ProductionGroup({ title, subtitle, refs, severity, expanded, onToggle }: {
  title: string;
  subtitle: string;
  refs: ProductionReferenceFlow[];
  severity: "critical" | "warning" | "ok";
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginBottom: S[3] }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: S[2],
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: `${S[2]}px 0`,
          textAlign: "left",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkLight,
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}>▼</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
          {title}
        </span>
        <AttentionBadge count={refs.length} critical={severity === "critical"} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginLeft: "auto" }}>
          {subtitle}
        </span>
      </button>

      {expanded && (
        <PaginatedTable
          rows={refs}
          renderHeader={() => (
            <tr>
              <th style={th()}>Referencia</th>
              <th style={th()}>Descripcion</th>
              <th style={th()}>Linea</th>
              <th style={th()}>Etapa</th>
              <th style={th("right")}>Dias</th>
              <th style={th()}>Recomendacion</th>
            </tr>
          )}
          renderRow={(ref: ProductionReferenceFlow) => (
            <tr key={ref.referenceCode} className="ag-op-row">
              <td style={td()}>{ref.referenceCode}</td>
              <td style={{ ...td(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ref.description}
              </td>
              <td style={td()}>{ref.subLinea}</td>
              <td style={td()}>{ref.stageState.currentStage.stageLabel}</td>
              <td style={{
                ...td("right"),
                fontWeight: T.wt.bold,
                color: ref.delayRisk.daysInProduction > 90 ? C.red : ref.delayRisk.daysInProduction > 45 ? C.amber : C.ink,
              }}>
                {ref.delayRisk.daysInProduction || "\u2014"}
              </td>
              <td style={{ ...td(), maxWidth: 200, whiteSpace: "normal", lineHeight: 1.4, fontStyle: "italic", color: C.inkMid }}>
                {ref.recommendation.description}
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
}

function ProductionBasicSection({ report }: { report: ProductionInProgressReport }) {
  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[3],
      }}>
        <ExecKpi label="En proceso" value={String(report.enProcesoCount)} color={C.blue} />
        <ExecKpi label="Completados" value={String(report.completadoCount)} color={C.green} />
        <ExecKpi label="Detenidos" value={String(report.detenidoCount)} color={report.detenidoCount > 0 ? C.red : C.ink} />
        <ExecKpi label="Prom. dias" value={String(report.avgDiasEnProduccion)} />
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkFaint,
      }}>
        Datos basicos de produccion. Produccion avanzada requiere datos de disponibilidad.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 12 — Reposicion Recomendada
// ═══════════════════════════════════════════════════════════════════════════════

function ReplenishmentSection({ snapshot, exec }: {
  snapshot: ReplenishmentSnapshot;
  exec: ReplenishmentExecutiveReport | null;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const s = snapshot.summary;

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <ExecKpi label="Para producir" value={String(s.suggestProductionCount)} color={s.suggestProductionCount > 0 ? C.red : C.green} />
        <ExecKpi label="Para reemplazar" value={String(s.replaceCount)} color={s.replaceCount > 0 ? C.amber : C.green} />
        <ExecKpi label="Esperar produccion" value={String(s.waitProductionCount)} color={C.green} />
        <ExecKpi label="Vendedores afectados" value={String(s.totalVendorsAffected)} />
      </div>

      {exec && (
        <>
          {exec.toProduction.length > 0 && (
            <ReplenishGroup
              title="Para producir"
              subtitle="No tienen produccion activa"
              recs={exec.toProduction}
              expanded={expandedGroup === "production"}
              onToggle={() => setExpandedGroup(expandedGroup === "production" ? null : "production")}
            />
          )}
          {exec.toReplenish.length > 0 && (
            <ReplenishGroup
              title="Para reponer desde Bodega 01"
              subtitle="Existencia disponible en bodega"
              recs={exec.toReplenish}
              expanded={expandedGroup === "replenish"}
              onToggle={() => setExpandedGroup(expandedGroup === "replenish" ? null : "replenish")}
            />
          )}
          {exec.withReplacements.length > 0 && (
            <ReplenishGroup
              title="Con reemplazo disponible"
              subtitle="Otra referencia del mismo SubGrupo"
              recs={exec.withReplacements}
              expanded={expandedGroup === "replace"}
              onToggle={() => setExpandedGroup(expandedGroup === "replace" ? null : "replace")}
            />
          )}
          {exec.toWaitForProduction.length > 0 && (
            <ReplenishGroup
              title="Esperar produccion activa"
              subtitle="Produccion en curso — monitorear"
              recs={exec.toWaitForProduction}
              expanded={expandedGroup === "wait"}
              onToggle={() => setExpandedGroup(expandedGroup === "wait" ? null : "wait")}
            />
          )}
          {exec.toRemoveFromPortfolios.length > 0 && (
            <ReplenishGroup
              title="Retirar de maletas"
              subtitle="Sin stock ni produccion"
              recs={exec.toRemoveFromPortfolios}
              expanded={expandedGroup === "remove"}
              onToggle={() => setExpandedGroup(expandedGroup === "remove" ? null : "remove")}
            />
          )}
        </>
      )}

      <div style={{
        marginTop: S[3],
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkFaint,
      }}>
        Confianza: {snapshot.confidence.score}% — {snapshot.confidence.reason}.
        Todas las recomendaciones son sugeridas, no ejecutadas.
      </div>
    </div>
  );
}

function ReplenishGroup({ title, subtitle, recs, expanded, onToggle }: {
  title: string;
  subtitle: string;
  recs: ReplenishmentRecommendation[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const critCount = recs.filter(r => r.urgency === "critical").length;

  return (
    <div style={{ marginBottom: S[3] }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: S[2],
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: `${S[2]}px 0`,
          textAlign: "left",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkLight,
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}>▼</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
          {title}
        </span>
        <AttentionBadge count={recs.length} critical={critCount > 0} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginLeft: "auto" }}>
          {subtitle}
        </span>
      </button>

      {expanded && (
        <PaginatedTable
          rows={recs}
          renderHeader={() => (
            <tr>
              <th style={th()}>Referencia</th>
              <th style={th()}>Descripcion</th>
              <th style={th()}>Linea</th>
              <th style={th()}>Urgencia</th>
              <th style={th()}>Accion</th>
              <th style={th()}>Razon</th>
            </tr>
          )}
          renderRow={(rec: ReplenishmentRecommendation) => (
            <tr key={rec.id} className="ag-op-row">
              <td style={td()}>{rec.referenceCode}</td>
              <td style={{ ...td(), maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rec.description}
              </td>
              <td style={td()}>{rec.subLinea}</td>
              <td style={td()}>
                <StatusChip variant={urgencyVariant(rec.urgency)}>
                  {urgencyLabel(rec.urgency)}
                </StatusChip>
              </td>
              <td style={td()}>{replenishActionLabel(rec.action)}</td>
              <td style={{ ...td(), maxWidth: 200, whiteSpace: "normal", lineHeight: 1.4, fontStyle: "italic", color: C.inkMid }}>
                {rec.reasoning.whatRecommendation}
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 13 — Salud de Vendedores
// ═══════════════════════════════════════════════════════════════════════════════

function VendorHealthSection({ summary }: { summary?: VendorExecutiveSummary | null }) {
  if (!summary) {
    return (
      <EmptyOperationalState
        message="Sin datos de vendedores"
        detail="Pendiente sincronizacion de maletas TM 206"
      />
    );
  }

  const hasAnyData = summary.vendors.some(v => v.totalReferences > 0);

  if (!hasAnyData) {
    return (
      <div style={{ ...panel, padding: `${S[4]}px ${S[5]}px` }}>
        <div style={{
          fontFamily: T.mono,
          fontSize: T.sz.sm,
          fontWeight: T.wt.bold,
          color: C.ink,
          marginBottom: S[2],
        }}>
          Maletas pendientes de sincronizacion TM 206
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.inkMid,
          lineHeight: 1.6,
          marginBottom: S[2],
        }}>
          {summary.vendors.length} vendedores configurados: {summary.vendors.map(v => v.vendorName).join(", ")}
        </div>
        <StatusChip variant="info">Pendiente sincronizar</StatusChip>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <ExecKpi label="Vendedores" value={String(summary.totalVendors)} />
        <ExecKpi label="Saludables" value={String(summary.vendorsHealthy)} color={C.green} />
        <ExecKpi label="Con criticas" value={String(summary.vendorsWithCriticalRefs)} color={summary.vendorsWithCriticalRefs > 0 ? C.red : C.green} />
      </div>

      <div style={{ ...panel, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono, fontSize: T.sz.xs }}>
            <thead>
              <tr>
                <th style={th()}>Vendedor</th>
                <th style={th()}>Bodega</th>
                <th style={th("right")}>Refs</th>
                <th style={th("right")}>Unidades</th>
                <th style={th("right")}>Criticas</th>
                <th style={th()}>Estado</th>
                <th style={th()}>Ultimo TM</th>
              </tr>
            </thead>
            <tbody>
              {summary.vendors.map(v => (
                <tr key={v.vendorId} className="ag-op-row">
                  <td style={{ ...td(), fontWeight: T.wt.bold }}>{v.vendorName}</td>
                  <td style={td()}>{v.locationCode}</td>
                  <td style={td("right")}>{v.totalReferences || "\u2014"}</td>
                  <td style={td("right")}>{v.totalUnits ? fmtNum(v.totalUnits) : "\u2014"}</td>
                  <td style={{
                    ...td("right"),
                    fontWeight: T.wt.bold,
                    color: v.criticalCount > 0 ? C.red : C.ink,
                  }}>
                    {v.criticalCount === 0 ? "\u2014" : v.criticalCount}
                  </td>
                  <td style={td()}>
                    <StatusChip variant={vendorStateVariant(v.operationalState)}>
                      {vendorStateLabel(v.operationalState)}
                    </StatusChip>
                  </td>
                  <td style={td()}>
                    {v.lastTransferAt ? fmtDate(v.lastTransferAt) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 15 — Calidad de Datos
// ═══════════════════════════════════════════════════════════════════════════════

function DataQualitySection({ quality }: { quality: ExecutiveDataQuality }) {
  return (
    <div>
      {/* Overall confidence */}
      <div style={{
        ...panel,
        padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[3],
        display: "flex",
        alignItems: "center",
        gap: S[3],
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: quality.overallConfidence >= 70 ? C.greenLight : quality.overallConfidence >= 40 ? C.amberLight : C.redLight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.mono,
          fontSize: T.sz.lg,
          fontWeight: T.wt.black,
          color: quality.overallConfidence >= 70 ? C.green : quality.overallConfidence >= 40 ? C.amber : C.red,
          flexShrink: 0,
        }}>
          {quality.overallConfidence}%
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, flex: 1 }}>
          {quality.qualitySummary}
        </div>
      </div>

      {/* Per-source */}
      <div style={{ ...panel, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono, fontSize: T.sz.xs }}>
            <thead>
              <tr>
                <th style={th()}>Fuente</th>
                <th style={th()}>Estado</th>
                <th style={th("right")}>Registros</th>
                <th style={th("right")}>Confianza</th>
                <th style={th()}>Impacto</th>
              </tr>
            </thead>
            <tbody>
              {quality.sources.map(src => (
                <tr key={src.name} className="ag-op-row">
                  <td style={{ ...td(), fontWeight: T.wt.bold }}>{src.name}</td>
                  <td style={td()}>
                    <StatusChip variant={src.available ? "ok" : "info"}>
                      {src.available ? "Lista" : "Pendiente"}
                    </StatusChip>
                  </td>
                  <td style={td("right")}>
                    {src.recordCount != null ? fmtNum(src.recordCount) : "\u2014"}
                  </td>
                  <td style={td("right")}>
                    {src.available ? (
                      <span style={{
                        fontFamily: T.mono,
                        fontSize: T.sz["2xs"],
                        fontWeight: T.wt.bold,
                        color: src.confidence >= 80 ? C.green : src.confidence >= 50 ? C.amber : C.red,
                      }}>
                        {src.confidence}%
                      </span>
                    ) : "\u2014"}
                  </td>
                  <td style={{ ...td(), color: C.inkMid }}>{src.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 16 — Diagnostico Interno Agentik
// ═══════════════════════════════════════════════════════════════════════════════

function DiagnosticsSection({ state, intel }: {
  state: ExecutiveDashboardState;
  intel?: CastillitosExecutiveIntelligence | null;
}) {
  const totalSignals = totalActiveSignals(state);

  return (
    <div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkFaint,
        marginBottom: S[3],
      }}>
        Informacion interna de motores Agentik. No visible para el CEO en el flujo principal.
      </div>

      {/* Signals */}
      {state.signals.length > 0 && (
        <DiagSubSection title={`Signals Activos (${totalSignals})`}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: S[2],
          }}>
            {state.signals.map(sig => {
              const hasCritical = sig.bySeverity.critical > 0;
              return (
                <div key={sig.category} style={{
                  ...panel,
                  padding: `${S[2]}px ${S[3]}px`,
                  borderColor: hasCritical ? C.redBorder : C.line,
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: T.mono,
                    fontSize: T.sz.xs,
                    color: C.ink,
                    fontWeight: T.wt.bold,
                  }}>
                    <span>{sig.label}</span>
                    <span style={{ color: hasCritical ? C.red : C.ink }}>{sig.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </DiagSubSection>
      )}

      {/* Timeline */}
      {state.timeline.length > 0 && (
        <DiagSubSection title={`Timeline de Eventos (${state.timeline.length})`}>
          <div style={{ ...panel, overflow: "hidden" }}>
            {state.timeline.slice(0, 10).map((entry, i) => {
              const sc = severityColor(entry.severity);
              return (
                <div key={`${entry.sourceId}-${i}`} style={{
                  ...dataRow,
                  gap: S[3],
                  borderBottom: i < 9 ? `1px solid ${C.lineSubtle}` : "none",
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, minWidth: 36, flexShrink: 0 }}>
                    {entry.timeLabel}
                  </span>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {entry.title}
                  </span>
                </div>
              );
            })}
          </div>
        </DiagSubSection>
      )}

      {/* Rules, Plans, Decisions, Actions */}
      {state.rules.length > 0 && (
        <DiagSubSection title={`Reglas Aplicadas (${state.rules.length})`}>
          {state.rules.slice(0, 5).map(rule => (
            <div key={rule.ruleId} style={{
              ...panel,
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[1],
              borderLeft: `3px solid ${severityColor(rule.severity).dot}`,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{rule.name}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginLeft: S[2] }}>{rule.reason}</span>
            </div>
          ))}
        </DiagSubSection>
      )}

      {state.plans.length > 0 && (
        <DiagSubSection title={`Planes Recomendados (${state.plans.length})`}>
          {state.plans.slice(0, 5).map(plan => (
            <div key={plan.planId} style={{
              ...panel,
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[1],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{plan.title}</span>
            </div>
          ))}
        </DiagSubSection>
      )}

      {state.decisions.length > 0 && (
        <DiagSubSection title={`Decisiones (${state.decisions.length})`}>
          {state.decisions.slice(0, 5).map(dec => (
            <div key={dec.decisionId} style={{
              ...panel,
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[1],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{dec.title}</span>
            </div>
          ))}
        </DiagSubSection>
      )}

      {state.actions.length > 0 && (
        <DiagSubSection title={`Acciones Pendientes (${state.actions.length})`}>
          {state.actions.slice(0, 5).map(action => (
            <div key={action.actionId} style={{
              ...panel,
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[1],
              display: "flex",
              alignItems: "center",
              gap: S[2],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink, flex: 1 }}>{action.title}</span>
              <StatusChip variant={actionStatusVariant(action.status)}>
                {actionStatusLabel(action.status)}
              </StatusChip>
            </div>
          ))}
        </DiagSubSection>
      )}

      {/* Traces */}
      {state.traces.length > 0 && (
        <DiagSubSection title={`Cadenas de Razonamiento (${state.traces.length})`}>
          {state.traces.slice(0, 5).map((trace, i) => (
            <div key={i} style={{
              ...panel,
              padding: `${S[2]}px ${S[3]}px`,
              marginBottom: S[1],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                {trace.entityLabel} ({trace.entityType})
              </span>
            </div>
          ))}
        </DiagSubSection>
      )}

      {totalSignals === 0 && state.timeline.length === 0 && state.rules.length === 0 &&
       state.plans.length === 0 && state.decisions.length === 0 && state.actions.length === 0 && (
        <EmptyOperationalState
          message="Sin datos de diagnostico"
          detail="Los motores de inteligencia no han generado datos internos"
        />
      )}
    </div>
  );
}

function DiagSubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.bold,
        color: C.inkMid,
        marginBottom: S[2],
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════════════════════════════

/** FASE 9 — Paginated table wrapper. Shows PAGE_SIZE rows with "Ver mas" button. */
function PaginatedTable<T>({ rows, renderHeader, renderRow }: {
  rows: T[];
  renderHeader: () => React.ReactNode;
  renderRow: (row: T) => React.ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const visible = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return (
    <div style={{ ...panel, overflow: "hidden", marginTop: S[2] }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono, fontSize: T.sz.xs }}>
          <thead>{renderHeader()}</thead>
          <tbody>{visible.map(renderRow)}</tbody>
        </table>
      </div>
      {hasMore && (
        <button
          onClick={() => setLimit(l => l + PAGE_SIZE)}
          style={{
            display: "block",
            width: "100%",
            padding: `${S[2]}px`,
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            fontWeight: T.wt.bold,
            color: C.blueDark,
            background: C.surfaceAlt,
            border: "none",
            borderTop: `1px solid ${C.line}`,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          Ver mas ({rows.length - limit} restantes)
        </button>
      )}
    </div>
  );
}

function ExecKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="ag-kpi-card" style={{ ...panel, padding: `${S[2]}px ${S[3]}px` }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.bold,
        color: C.inkLight,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xl,
        fontWeight: T.wt.black,
        color: color ?? C.ink,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === "critical" ? C.red : severity === "high" ? C.amber : severity === "medium" ? C.blue : C.inkLight;
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Label/Variant Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function availStatusVariant(status: string): "ok" | "pending" | "warning" | "critical" | "info" {
  if (status === "disponible") return "ok";
  if (status === "comprometido") return "warning";
  if (status === "sobre_comprometido") return "critical";
  return "info";
}

function availStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    disponible: "Disponible",
    comprometido: "Comprometido",
    sobre_comprometido: "Sobre-comprometido",
    sin_existencia: "Sin existencia",
    sin_datos: "Sin datos",
  };
  return labels[status] ?? status;
}

function urgencyVariant(urgency: string): "ok" | "pending" | "warning" | "critical" | "info" {
  if (urgency === "critical") return "critical";
  if (urgency === "high") return "warning";
  if (urgency === "medium") return "pending";
  return "ok";
}

function urgencyLabel(urgency: string): string {
  const labels: Record<string, string> = { critical: "Critica", high: "Alta", medium: "Media", low: "Baja", none: "Ninguna" };
  return labels[urgency] ?? urgency;
}

function replenishActionLabel(action: string): string {
  const labels: Record<string, string> = {
    replenish_from_warehouse: "Reponer desde bodega",
    replace_reference: "Reemplazar referencia",
    remove_from_portfolio: "Retirar de maleta",
    wait_for_production: "Esperar produccion",
    suggest_production: "Producir",
    transfer_between_locations: "Transferir",
    review_production: "Revisar produccion",
    monitor: "Monitorear",
    no_action_needed: "Sin accion",
  };
  return labels[action] ?? action;
}

function vendorStateVariant(state: string): "ok" | "pending" | "warning" | "critical" | "info" {
  if (state === "active") return "ok";
  if (state === "degraded") return "warning";
  if (state === "inactive") return "critical";
  return "info";
}

function vendorStateLabel(state: string): string {
  const labels: Record<string, string> = {
    active: "Activo",
    degraded: "Degradado",
    inactive: "Inactivo",
    unknown: "Desconocido",
  };
  return labels[state] ?? state;
}

function actionStatusVariant(status: string): "ok" | "pending" | "warning" | "critical" | "info" {
  if (status === "completed") return "ok";
  if (status === "running" || status === "ready" || status === "approved") return "pending";
  if (status === "failed" || status === "cancelled") return "critical";
  if (status === "pending_approval" || status === "draft") return "warning";
  return "info";
}

// ── Format Helpers ──────────────────────────────────────────────────────────

function th(align?: "right"): React.CSSProperties {
  return {
    padding: `${S[2]}px ${S[3]}px`,
    textAlign: align ?? ("left" as const),
    fontWeight: T.wt.bold,
    color: C.inkLight,
    fontSize: T.sz["2xs"],
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    borderBottom: `1px solid ${C.line}`,
    background: C.surfaceAlt,
    fontFamily: T.mono,
    whiteSpace: "nowrap" as const,
  };
}

function td(align?: "right"): React.CSSProperties {
  return {
    padding: `${S[2]}px ${S[3]}px`,
    textAlign: align ?? ("left" as const),
    color: C.ink,
    borderBottom: `1px solid ${C.lineSubtle}`,
    fontFamily: T.mono,
    fontSize: T.sz.xs,
    whiteSpace: align === "right" ? ("nowrap" as const) : undefined,
  };
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "\u2014";
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "\u2014";
  }
}
