"use client";

/**
 * produccion-client.tsx
 *
 * PRODUCTION-EXECUTIVE-DASHBOARD-01 — Client Component.
 *
 * Executive dashboard at top + operational workspace below.
 * Consumes ProductionOperationsSnapshot + ProductionExecutiveSnapshot.
 */

import { useState, useMemo } from "react";
import { C, T, S, R, panel, panelHeader, dataRow } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type {
  ProductionOperationsSnapshot,
  ProductionOrderOperationalRow,
  ProductionOperationsFilter,
  ProductionOperationalAlertSeverity,
} from "@/lib/production/production-operations-types";
import type {
  ProductionOrderClassificationType,
} from "@/lib/production-stages/production-stage-types";
import type {
  ProductionExecutiveSnapshot,
  ProductionHealthLevel,
  ProductionPrioritySeverity,
} from "@/lib/production/production-executive-types";

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const FILTER_OPTIONS: { key: ProductionOperationsFilter; label: string }[] = [
  { key: "todas",        label: "Todas" },
  { key: "activas",      label: "Activas" },
  { key: "completas",    label: "Completas" },
  { key: "parciales",    label: "En proceso" },
  { key: "sin_consumo",  label: "Sin consumo" },
  { key: "detenidas",    label: "Detenidas" },
  { key: "alto_costo",   label: "Alto costo" },
  { key: "con_alerta",   label: "Con alerta" },
];

const CLASSIFICATION_COLORS: Record<ProductionOrderClassificationType, string> = {
  full_flow:          C.green,
  completed:          C.blue,
  materials_consumed: C.amber,
  order_only:         C.red,
  partial:            C.inkGhost,
};

const CLASSIFICATION_LABELS: Record<ProductionOrderClassificationType, string> = {
  full_flow:          "Completada",
  completed:          "Terminada",
  materials_consumed: "En proceso",
  order_only:         "Pendiente",
  partial:            "Datos parciales",
};

const SEVERITY_COLORS: Record<ProductionOperationalAlertSeverity, { bg: string; border: string; text: string }> = {
  critical: { bg: C.redLight, border: `${C.red}33`, text: C.red },
  warning:  { bg: C.amberLight, border: `${C.amber}33`, text: C.amber },
  info:     { bg: C.blueLight, border: `${C.blueBorder}`, text: C.blue },
};

const HEALTH_COLORS: Record<ProductionHealthLevel, { bg: string; border: string; text: string; dot: string }> = {
  OK:        { bg: `${C.green}08`, border: `${C.green}20`, text: C.green, dot: C.green },
  ATTENTION: { bg: C.amberLight,   border: `${C.amber}33`, text: C.amber, dot: C.amber },
  CRITICAL:  { bg: C.redLight,     border: `${C.red}33`,   text: C.red,   dot: C.red },
};

const PRIORITY_COLORS: Record<ProductionPrioritySeverity, string> = {
  critical: C.red,
  high: C.amber,
  medium: C.inkMid,
};

const STAGE_LABELS: Record<string, string> = {
  production_order: "Orden de Produccion",
  material_allocation: "Reserva de Material",
  material_consumption: "Consumo de Materiales",
  cutting: "Corte",
  printing: "Estampacion",
  embroidery: "Bordado",
  external_manufacturing: "Confeccion Externa",
  assembly: "Ensamble",
  third_party_services: "Servicios de Terceros",
  finishing: "Acabados",
  quality_control: "Control de Calidad",
  packaging: "Empaque",
  finished_goods_entry: "Entrada Producto Terminado",
  warehouse_transfer: "Traslado de Bodega",
  commercially_available: "Disponible Comercialmente",
};

function stageLabel(code: string): string {
  return STAGE_LABELS[code] ?? code;
}

const TRUST_COLORS: Record<string, string> = {
  CONFIABLE: C.green,
  PARCIAL: C.amber,
  INSUFICIENTE: C.red,
};

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  snapshot: ProductionOperationsSnapshot;
  executive: ProductionExecutiveSnapshot;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProduccionClient({ snapshot, executive }: Props) {
  const [filter, setFilter] = useState<ProductionOperationsFilter>("todas");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"ordenes" | "etapas" | "alertas">("ordenes");

  const { orders, alerts, dataQuality, stageMetrics } = snapshot;

  // ── Filtered + searched orders ──────────────────────────────────────────

  const alertOpNumbers = useMemo(() => new Set(
    alerts.filter(a => a.opNumber).map(a => a.opNumber!),
  ), [alerts]);

  const filtered = useMemo(() => {
    let result = orders;

    const costThreshold = (() => {
      if (filter !== "alto_costo") return 0;
      const sorted = [...orders].sort((a, b) => b.materialCost - a.materialCost);
      const idx = Math.max(1, Math.floor(sorted.length * 0.1));
      return sorted[idx - 1]?.materialCost ?? 0;
    })();

    switch (filter) {
      case "activas":      result = result.filter(o => !o.isCompleted); break;
      case "completas":    result = result.filter(o => o.isCompleted); break;
      case "parciales":    result = result.filter(o => o.classification === "materials_consumed"); break;
      case "sin_consumo":  result = result.filter(o => o.classification === "order_only"); break;
      case "detenidas":    result = result.filter(o => !o.isCompleted && o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 30); break;
      case "alto_costo":   result = result.filter(o => o.materialCost >= costThreshold && costThreshold > 0); break;
      case "con_alerta":   result = result.filter(o => alertOpNumbers.has(o.opNumber)); break;
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(o =>
        o.opNumber.toLowerCase().includes(q) ||
        (o.referenceCode?.toLowerCase().includes(q) ?? false) ||
        (o.description?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [orders, filter, search, alertOpNumbers]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Header status ──────────────────────────────────────────────────────

  const headerStatus =
    executive.health.level === "CRITICAL" ? "critical" as const :
    executive.health.level === "ATTENTION" ? "warning" as const :
    "ok" as const;

  return (
    <div style={{ padding: S[6], maxWidth: 1280 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[{ label: "Produccion" }]}
        title="Produccion"
        subtitle="Vista ejecutiva — ultimo ano"
        status={headerStatus}
        statusLabel={executive.health.summary}
      />

      {/* ════════════════════════════════════════════════════════════════════
          EXECUTIVE DASHBOARD
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Health Banner ────────────────────────────────────────────────── */}
      <ExecutiveHealthBanner health={executive.health} />

      {/* ── Executive KPIs ───────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: S[3],
        marginBottom: S[5],
      }}>
        {executive.kpis.map(kpi => (
          <div key={kpi.key} style={{ ...panel, padding: `${S[3]}px ${S[4]}px` }}>
            <div style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color: C.inkLight,
              marginBottom: S[1],
              textTransform: "uppercase" as const,
            }}>
              {kpi.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: S[1] }}>
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz.xl,
                fontWeight: T.wt.bold,
                color: kpi.color ? (kpi.color === "red" ? C.red : kpi.color === "amber" ? C.amber : kpi.color === "green" ? C.green : C.ink) : C.ink,
              }}>
                {kpi.value}
              </span>
              {kpi.suffix && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                  {kpi.suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Priorities + Cost/Bottleneck Row ─────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: executive.priorities.length > 0 ? "1fr 1fr" : "1fr",
        gap: S[4],
        marginBottom: S[6],
      }}>
        {/* Priorities */}
        {executive.priorities.length > 0 && (
          <div style={panel}>
            <div style={{
              ...panelHeader,
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: C.inkLight,
              textTransform: "uppercase" as const,
            }}>
              Prioridades de hoy
            </div>
            <div style={{ padding: `0 ${S[4]}px ${S[3]}px` }}>
              {executive.priorities.map((p, i) => (
                <div key={i} style={{
                  padding: `${S[3]}px 0`,
                  borderBottom: i < executive.priorities.length - 1 ? `1px solid ${C.line}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: PRIORITY_COLORS[p.severity],
                      display: "inline-block", flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      fontWeight: T.wt.semibold, color: C.ink,
                    }}>
                      {p.title}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"],
                    color: C.inkMid, lineHeight: 1.5, marginBottom: 4,
                  }}>
                    {p.impact}
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"],
                    color: C.inkFaint, fontStyle: "italic" as const,
                  }}>
                    {p.evidence}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right Column: Bottlenecks + Cost */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
          {/* Bottlenecks */}
          {executive.bottlenecks.length > 0 && (
            <div style={panel}>
              <div style={{
                ...panelHeader,
                fontFamily: T.mono, fontSize: T.sz.xs,
                fontWeight: T.wt.semibold, color: C.inkLight,
                textTransform: "uppercase" as const,
              }}>
                Cuellos de botella
              </div>
              {executive.bottlenecks.map((b, i) => (
                <div key={i} style={{
                  ...dataRow,
                  display: "flex", alignItems: "center", gap: S[3],
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      fontWeight: T.wt.medium, color: C.ink,
                    }}>
                      {b.stageLabel}
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      color: C.inkMid, lineHeight: 1.4,
                    }}>
                      {b.observation}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.sm,
                      fontWeight: T.wt.bold, color: C.ink,
                    }}>
                      {b.activeCount}
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      color: C.inkLight,
                    }}>
                      {b.concentrationPct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cost Insights */}
          {executive.costInsights.topOpsPorCosto.length > 0 && (
            <div style={panel}>
              <div style={{
                ...panelHeader,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  fontWeight: T.wt.semibold, color: C.inkLight,
                  textTransform: "uppercase" as const,
                }}>
                  Mayor costo material
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  color: C.inkFaint,
                }}>
                  Promedio: {formatCurrency(executive.costInsights.costoPromedioOP)}
                </span>
              </div>
              {executive.costInsights.topOpsPorCosto.map((entry, i) => (
                <div key={i} style={{
                  ...dataRow,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      fontWeight: T.wt.medium, color: C.blueDark,
                    }}>
                      {entry.label}
                    </span>
                    {entry.detail && (
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"],
                        color: C.inkFaint, marginLeft: S[2],
                      }}>
                        {entry.detail}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs,
                    fontWeight: T.wt.semibold, color: C.ink,
                  }}>
                    {formatCurrency(entry.cost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Data Trust Strip ──────────────────────────────────────────────── */}
      <DataTrustStrip dataTrust={executive.dataTrust} />

      {/* ════════════════════════════════════════════════════════════════════
          OPERATIONAL WORKSPACE
          ════════════════════════════════════════════════════════════════════ */}

      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        fontWeight: T.wt.semibold, color: C.inkLight,
        textTransform: "uppercase" as const,
        marginBottom: S[3],
        paddingTop: S[2],
        borderTop: `1px solid ${C.line}`,
      }}>
        Detalle operativo
      </div>

      {/* ── Tab Strip ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: S[1],
        marginBottom: S[5],
        borderBottom: `1px solid ${C.line}`,
        paddingBottom: S[2],
      }}>
        {([
          { key: "ordenes" as const, label: "Ordenes de produccion", count: filtered.length },
          { key: "etapas" as const, label: "Etapas", count: Object.keys(stageMetrics.stageDistribution).length },
          { key: "alertas" as const, label: "Alertas", count: alerts.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `${S[2]}px ${S[4]}px`,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
              color: activeTab === tab.key ? C.blueDark : C.inkLight,
              fontWeight: activeTab === tab.key ? T.wt.semibold : T.wt.normal,
              cursor: "pointer",
              marginBottom: -S[2] - 1,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: S[1],
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: activeTab === tab.key ? C.blueDark : C.inkGhost,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filters + Search (only for ordenes tab) ───────────────────── */}
      {activeTab === "ordenes" && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: S[3],
          marginBottom: S[5],
          flexWrap: "wrap" as const,
        }}>
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
            {FILTER_OPTIONS.map(opt => {
              const isActive = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setFilter(opt.key); setPage(1); }}
                  className="ag-action-ghost"
                  style={{
                    fontFamily: T.mono,
                    fontSize: T.sz["2xs"],
                    padding: `4px ${S[3]}px`,
                    borderRadius: R.pill,
                    border: `1px solid ${isActive ? C.blueDark : C.line}`,
                    background: isActive ? C.blueDark : "transparent",
                    color: isActive ? "#fff" : C.inkMid,
                    cursor: "pointer",
                    fontWeight: isActive ? T.wt.semibold : T.wt.normal,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar OP, referencia, descripcion..."
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `6px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              flex: "1 1 200px",
              minWidth: 200,
              outline: "none",
            }}
          />

          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            flexShrink: 0,
          }}>
            {filtered.length} OP{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Tab Content ───────────────────────────────────────────────── */}
      {activeTab === "ordenes" && (
        <OrdersTable
          orders={pageItems}
          allCount={filtered.length}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {activeTab === "etapas" && <StagesView stageMetrics={stageMetrics} totalOrders={dataQuality.totalTimelines} />}

      {activeTab === "alertas" && <AlertsView alerts={alerts} />}
    </div>
  );
}

// ── Executive Health Banner ──────────────────────────────────────────────────

function ExecutiveHealthBanner({ health }: { health: ProductionExecutiveSnapshot["health"] }) {
  const colors = HEALTH_COLORS[health.level];
  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`,
      marginBottom: S[5],
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: R.sm,
      display: "flex",
      alignItems: "center",
      gap: S[3],
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: "50%",
        background: colors.dot, display: "inline-block", flexShrink: 0,
      }} />
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        fontWeight: T.wt.semibold, color: colors.text,
      }}>
        {health.summary}
      </span>
    </div>
  );
}

// ── Data Trust Strip ─────────────────────────────────────────────────────────

function DataTrustStrip({ dataTrust }: { dataTrust: ProductionExecutiveSnapshot["dataTrust"] }) {
  const trustColor = TRUST_COLORS[dataTrust.level] ?? C.inkLight;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: S[4],
      padding: `${S[2]}px ${S[4]}px`,
      marginBottom: S[6],
      background: C.surfaceAlt,
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      flexWrap: "wrap" as const,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold, color: trustColor,
      }}>
        Datos {dataTrust.level.toLowerCase()}
      </span>
      <DqChip label="Ult. orden" value={fmtDate(dataTrust.lastOrdenProduccion)} />
      <DqChip label="Ult. consumo" value={fmtDate(dataTrust.lastConsumoMaterial)} />
      <DqChip label="Ult. entrada PT" value={fmtDate(dataTrust.lastEntradaPT)} />
      <DqChip label="Costos" value={`${dataTrust.costCoveragePct}%`} />
      {dataTrust.lastSync && (
        <DqChip label="Sync" value={fmtDate(dataTrust.lastSync)} />
      )}
    </div>
  );
}

function DqChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
      <span style={{ color: C.inkFaint }}>{label}:</span> {value}
    </span>
  );
}

// ── Orders Table ─────────────────────────────────────────────────────────────

const GRID_COLS = "70px 90px 1fr 100px 90px 100px 80px 90px 90px";

function OrdersTable({
  orders,
  allCount,
  page,
  totalPages,
  onPageChange,
}: {
  orders: ProductionOrderOperationalRow[];
  allCount: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (allCount === 0) {
    return (
      <div style={{
        ...panel,
        padding: `${S[10]}px ${S[6]}px`,
        textAlign: "center" as const,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[1] }}>
          Sin ordenes de produccion
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Ajuste los filtros o sincronice datos desde el ERP
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...panel, overflowX: "auto" as const }}>
        <div className="ag-op-row" style={{
          ...panelHeader,
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          gap: S[2],
          minWidth: 900,
        }}>
          {["OP", "Referencia", "Descripcion", "Cantidad", "Costo mat.", "Etapa actual", "Dias", "Ult. evento", "Estado"].map(h => (
            <span key={h} style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              color: C.inkLight,
              textTransform: "uppercase" as const,
            }}>
              {h}
            </span>
          ))}
        </div>

        {orders.map(o => (
          <div
            key={o.id}
            className="ag-op-row"
            style={{
              ...dataRow,
              display: "grid",
              gridTemplateColumns: GRID_COLS,
              gap: S[2],
              minWidth: 900,
              opacity: o.isCompleted ? 0.5 : 1,
            }}
          >
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: T.wt.semibold }}>
              {o.opNumber}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
              {o.referenceCode ?? "\u2014"}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {o.description ?? "\u2014"}
            </span>
            <QuantityCell order={o} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, textAlign: "right" as const }}>
              {o.materialCost > 0 ? formatCurrency(o.materialCost) : "\u2014"}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: o.currentStageLabel ? C.ink : C.inkFaint,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {o.currentStageLabel ?? "\u2014"}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: !o.isCompleted && o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 60
                ? C.red
                : !o.isCompleted && o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 30
                  ? C.amber : C.inkMid,
              textAlign: "right" as const,
            }}>
              {o.isCompleted ? (o.cycleDays !== null ? `${o.cycleDays}d` : "\u2014") : `${o.daysElapsed}d`}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 30 && !o.isCompleted ? C.amber : C.inkLight,
              textAlign: "right" as const,
            }}>
              {o.daysSinceLastEvent !== null ? (o.daysSinceLastEvent === 0 ? "Hoy" : `${o.daysSinceLastEvent}d`) : "\u2014"}
            </span>
            <StatusBadge
              label={CLASSIFICATION_LABELS[o.classification]}
              color={CLASSIFICATION_COLORS[o.classification]}
            />
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: S[2], marginTop: S[4],
        }}>
          <PaginationButton label="Anterior" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
            {page} / {totalPages}
          </span>
          <PaginationButton label="Siguiente" disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))} />
        </div>
      )}
    </div>
  );
}

function PaginationButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        padding: `4px ${S[2]}px`, borderRadius: R.sm,
        border: `1px solid ${C.line}`, background: "transparent",
        color: disabled ? C.inkGhost : C.inkMid,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Quantity Cell ─────────────────────────────────────────────────────────────

function QuantityCell({ order: o }: { order: ProductionOrderOperationalRow }) {
  if (o.quantityOrdered !== null && o.quantityOrdered > 0) {
    return (
      <div style={{ textAlign: "right" as const }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>
          {o.quantityCompleted.toLocaleString()} / {o.quantityOrdered.toLocaleString()}
        </span>
        {o.completionPct !== null && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: o.completionPct >= 100 ? C.green : o.completionPct >= 50 ? C.amber : C.inkLight,
            marginLeft: 4,
          }}>
            ({o.completionPct}%)
          </span>
        )}
      </div>
    );
  }

  if (o.quantityCompleted > 0) {
    return (
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, textAlign: "right" as const }}>
        {o.quantityCompleted.toLocaleString()} term.
      </span>
    );
  }

  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "right" as const }}>
      {"\u2014"}
    </span>
  );
}

// ── Stages View ──────────────────────────────────────────────────────────────

function StagesView({ stageMetrics, totalOrders }: {
  stageMetrics: ProductionOperationsSnapshot["stageMetrics"];
  totalOrders: number;
}) {
  const entries = Object.entries(stageMetrics.stageDistribution).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return (
      <div style={{ ...panel, padding: `${S[10]}px ${S[6]}px`, textAlign: "center" as const }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Sin datos de etapas</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: S[3], marginBottom: S[5],
      }}>
        <KpiCard label="Sin brechas" value={stageMetrics.gapDistribution.READY} color={C.green} />
        <KpiCard label="Brechas parciales" value={stageMetrics.gapDistribution.PARTIAL} color={C.amber} />
        <KpiCard label="Bloqueadas" value={stageMetrics.gapDistribution.BLOCKED} color={stageMetrics.gapDistribution.BLOCKED > 0 ? C.red : C.inkGhost} />
      </div>

      <div style={panel}>
        <div style={{
          ...panelHeader, display: "grid",
          gridTemplateColumns: "1fr 80px 100px", gap: S[2],
        }}>
          {["Etapa", "OPs", "Cobertura"].map(h => (
            <span key={h} style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold, color: C.inkLight,
              textTransform: "uppercase" as const,
            }}>{h}</span>
          ))}
        </div>
        {entries.map(([stage, count]) => {
          const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
          return (
            <div key={stage} className="ag-op-row" style={{
              ...dataRow, display: "grid",
              gridTemplateColumns: "1fr 80px 100px", gap: S[2],
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{stageLabel(stage)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, textAlign: "right" as const }}>{count}</span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <div style={{ flex: 1, height: 6, background: C.line, borderRadius: R.pill, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%",
                    background: pct > 80 ? C.green : pct > 40 ? C.amber : C.inkLight,
                    borderRadius: R.pill,
                  }} />
                </div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, minWidth: 30 }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: S[5] }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          fontWeight: T.wt.semibold, color: C.inkLight,
          marginBottom: S[3], textTransform: "uppercase" as const,
        }}>
          Clasificacion de ordenes
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: S[3],
        }}>
          {(Object.entries(stageMetrics.classificationDistribution) as [ProductionOrderClassificationType, number][]).map(([key, count]) => (
            <div key={key} style={{
              ...panel, padding: S[3],
              borderLeft: `3px solid ${CLASSIFICATION_COLORS[key]}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[1] }}>
                {CLASSIFICATION_LABELS[key]}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.lg,
                fontWeight: T.wt.bold, color: CLASSIFICATION_COLORS[key],
              }}>
                {count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Alerts View ──────────────────────────────────────────────────────────────

function AlertsView({ alerts }: { alerts: ProductionOperationsSnapshot["alerts"] }) {
  if (alerts.length === 0) {
    return (
      <div style={{ ...panel, padding: `${S[10]}px ${S[6]}px`, textAlign: "center" as const }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>Sin alertas operacionales</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>
          Todas las ordenes de produccion operan normalmente
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      {alerts.map((alert, i) => {
        const sev = SEVERITY_COLORS[alert.severity];
        return (
          <div key={i} style={{
            padding: `${S[3]}px ${S[4]}px`,
            background: sev.bg, border: `1px solid ${sev.border}`,
            borderRadius: R.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: sev.text, display: "inline-block", flexShrink: 0,
              }} />
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                fontWeight: T.wt.semibold, color: sev.text,
              }}>
                {alert.title}
              </span>
              {alert.metric !== null && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  color: C.inkLight, marginLeft: "auto",
                }}>
                  {typeof alert.metric === "number" && alert.metric > 1 ? `${alert.metric}d` : ""}
                </span>
              )}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: C.inkMid, lineHeight: 1.5,
            }}>
              {alert.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared Primitives ────────────────────────────────────────────────────────

function KpiCard({ label, value, color, suffix }: {
  label: string; value: number | string; color?: string; suffix?: string;
}) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div style={{ ...panel, padding: `${S[3]}px ${S[4]}px` }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
        marginBottom: S[1], textTransform: "uppercase" as const,
      }}>{label}</div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xl,
        fontWeight: T.wt.bold, color: color ?? C.ink,
      }}>
        {display}{suffix ?? ""}
      </div>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"],
      fontWeight: T.wt.medium, color,
      padding: `2px ${S[2]}px`, background: `${color}10`,
      borderRadius: R.pill, whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "\u2014";
  }
}
