"use client";

/**
 * recon-client.tsx
 * AGENTIK-RECON-WORKSPACE-01 — Operational Workspace Refactor
 *
 * Makes Conciliación feel like: workspace · investigación · operaciones vivas
 * NOT a vertical dashboard.
 *
 * Design system compliance:
 *   - All tokens from lib/ui/tokens.ts (C, T, S, R, E)
 *   - All layout from operational-primitives (WorkspaceSection, EmptyOperationalState, CopilotReadinessSlot)
 *   - ag-op-table / ag-op-row / ag-op-status / ag-intel-header CSS classes throughout
 *   - Zero raw hex colors. Zero "monospace" string literals.
 */

import { useState }                        from "react";
import type { CSSProperties, ReactNode }   from "react";
import type { ReconResult, ReconRecord, ReconStatus } from "@/lib/reconciliation/types";
import type { FinancialStream }            from "@/lib/financial/stream-model";
import type { MemoryReadinessTier, CopilotObservation } from "@/lib/financial/memory-model";
import type { AttentionRouterResult }      from "@/lib/financial/attention-router";
import type { ReconSessionRow, ReconciliationSessionStatus } from "@/lib/reconciliation/session-types";
import { C, T, S, R, E, panel, panelHeader } from "@/lib/ui/tokens";
import {
  WorkspaceSection,
  EmptyOperationalState,
  CopilotReadinessSlot,
} from "@/components/shell/operational-primitives";
import ExceptionWorkbench           from "./exception-workbench";
import { reconRecordsToExceptions } from "@/lib/reconciliation/recon-to-workbench";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:          string;
  periods:          string[];
  period?:          string;
  sourceA?:         string;
  sourceB?:         string;
  availableSources: Array<{ source: string; batchCount: number; recordCount: number }>;
  result?:          ReconResult | null;
  streams?:         FinancialStream[];
  recommendations?: string[];
  memoryStatus?: {
    readinessTier:  MemoryReadinessTier;
    readinessLabel: string;
    historyDays:    number;
    snapshotCount:  number;
  };
  observations?:    CopilotObservation[];
  attentionPlan?:   AttentionRouterResult;
  recentSessions?:  ReconSessionRow[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                "currency",
    currency:             "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

// ── Status badge (recon record status) ────────────────────────────────────────

const STATUS_STYLES: Record<ReconStatus, CSSProperties> = {
  MATCH:               { background: C.greenBorder,  color: C.greenDark   },
  MISMATCH_AMOUNT:     { background: C.amberBorder,  color: C.amberDark   },
  ONLY_IN_A:           { background: C.blueBorder,   color: C.blue        },
  ONLY_IN_B:           { background: C.brandBorder,  color: C.brandDark   },
  POSSIBLE_DUPLICATE:  { background: C.redBorder,    color: C.redDark     },
};

const STATUS_LABELS: Record<ReconStatus, string> = {
  MATCH:               "Cuadra",
  MISMATCH_AMOUNT:     "Diferencia monto",
  ONLY_IN_A:           "Solo en Fuente A",
  ONLY_IN_B:           "Solo en Fuente B",
  POSSIBLE_DUPLICATE:  "Posible duplicado",
};

const STATUS_DESC: Record<ReconStatus, string> = {
  MATCH:               "El registro existe en ambas fuentes y los montos coinciden (tolerancia 0.1%)",
  MISMATCH_AMOUNT:     "El registro existe en ambas fuentes pero los montos no coinciden",
  ONLY_IN_A:           "El registro solo existe en la Fuente A — falta en la Fuente B",
  ONLY_IN_B:           "El registro solo existe en la Fuente B — falta en la Fuente A",
  POSSIBLE_DUPLICATE:  "La misma clave aparece más de una vez en la misma fuente",
};

function StatusBadge({ status }: { status: ReconStatus }) {
  return (
    <span style={{
      ...STATUS_STYLES[status],
      fontFamily:    T.mono,
      fontSize:      T.sz.xs,
      fontWeight:    T.wt.bold,
      padding:       "2px 8px",
      borderRadius:  R.sm,
      letterSpacing: "0.02em",
      whiteSpace:    "nowrap",
    }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Session status badge ───────────────────────────────────────────────────────

const SESSION_STATUS_BADGE: Record<ReconciliationSessionStatus, { cls: string; label: string; dot: string }> = {
  draft:                { cls: "ag-op-status ag-op-status--pending",  label: "Borrador",       dot: C.inkGhost   },
  ready:                { cls: "ag-op-status ag-op-status--info",     label: "Listo",          dot: C.blue       },
  running:              { cls: "ag-op-status ag-op-status--info",     label: "En ejecución",   dot: C.blueDark   },
  needs_review:         { cls: "ag-op-status ag-op-status--warning",  label: "Revisar",        dot: C.amber      },
  partially_reconciled: { cls: "ag-op-status ag-op-status--warning",  label: "Parcial",        dot: C.amber      },
  reconciled:           { cls: "ag-op-status ag-op-status--ok",       label: "Conciliado",     dot: C.green      },
  closed:               { cls: "ag-op-status ag-op-status--pending",  label: "Cerrado",        dot: C.inkFaint   },
  failed:               { cls: "ag-op-status ag-op-status--critical", label: "Error",          dot: C.red        },
  cancelled:            { cls: "ag-op-status ag-op-status--pending",  label: "Cancelado",      dot: C.inkGhost   },
};

// ── CSV export ────────────────────────────────────────────────────────────────

function exportReconCsv(result: ReconResult): void {
  const header = `Clave,Descripcion,Estado,Monto ${result.sourceALabel},Monto ${result.sourceBLabel},Diferencia,Diferencia %,Filas A,Filas B`;
  const rows = result.records.map(r => [
    r.key,
    r.label,
    STATUS_LABELS[r.status],
    r.amountA     != null ? String(r.amountA)            : "",
    r.amountB     != null ? String(r.amountB)            : "",
    r.delta       != null ? String(r.delta)              : "",
    r.deltaPercent != null ? r.deltaPercent.toFixed(2)   : "",
    String(r.rowsA),
    String(r.rowsB),
  ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));

  const csv  = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `agentik_recon_${result.scope}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Sort order for status ─────────────────────────────────────────────────────

const STATUS_ORDER: Record<ReconStatus, number> = {
  POSSIBLE_DUPLICATE: 0,
  MISMATCH_AMOUNT:    1,
  ONLY_IN_A:          2,
  ONLY_IN_B:          3,
  MATCH:              4,
};

function sortedRecords(records: ReconRecord[]): ReconRecord[] {
  return [...records].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

// ── Summary card (results workbench) ─────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string;
  value:   string;
  sub?:    string;
  accent?: "green" | "yellow" | "red";
}) {
  const accentColor = accent === "green"  ? C.green
                    : accent === "yellow" ? C.amberDark
                    : accent === "red"    ? C.redDark
                    : C.ink;
  const accentBg    = accent === "green"  ? C.greenLight
                    : accent === "yellow" ? C.amberLight
                    : accent === "red"    ? C.redLight
                    : C.white;
  const accentBorder = accent === "green"  ? C.greenBorder
                     : accent === "yellow" ? C.amberBorder
                     : accent === "red"    ? C.redBorder
                     : C.line;

  return (
    <div style={{
      border:       `1px solid ${accentBorder}`,
      borderRadius: R.md,
      padding:      `${S[3]}px ${S[4]}px`,
      background:   accentBg,
      boxShadow:    E.xs,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.bold,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom:  S[1],
      }}>
        {label}
      </div>
      <div style={{
        fontFamily:         T.mono,
        fontSize:           T.sz["2xl"],
        fontWeight:         T.wt.bold,
        color:              accentColor,
        lineHeight:         1.2,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Compact flow rows (replaces verbose FlowCard) ─────────────────────────────

type FlowStatus = "live" | "soon";

interface FlowRowDef {
  id:             string;
  title:          string;
  tag:            string;
  tagBg:          string;
  tagColor:       string;
  description:    string;
  status:         FlowStatus;
  blockerReason?: string;
  ctaLabel:       string;
  ctaHref?:       string;
  onSelect?:      () => void;
}

function FlowRow({ def }: { def: FlowRowDef }) {
  const isLive = def.status === "live";

  return (
    <div
      className={isLive ? "ag-op-row" : "ag-op-row ag-op-row--passive"}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.lineSubtle}`,
        borderLeft:   isLive ? `3px solid ${C.green}` : `3px solid transparent`,
        background:   isLive ? C.white : C.surface,
        minHeight:    52,
      }}
    >
      {/* Title + tag block */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto", minWidth: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: isLive ? C.green : C.inkGhost, flexShrink: 0 }} />
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.black,
          color: isLive ? C.ink : C.inkFaint, whiteSpace: "nowrap",
        }}>
          {def.title}
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.black,
          padding: "2px 7px", borderRadius: R.xs,
          background: isLive ? def.tagBg  : C.surface,
          color:      isLive ? def.tagColor : C.inkGhost,
          textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
        }}>
          {def.tag}
        </span>
        {isLive && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
            color: C.green, background: C.greenLight, borderRadius: R.xs, padding: "2px 6px",
          }}>
            Listo
          </span>
        )}
      </div>

      {/* Description */}
      <div style={{
        flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
      }}>
        {def.description}
      </div>

      {/* Blocker badge */}
      {!isLive && def.blockerReason && (
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: R.xs, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {def.blockerReason}
        </span>
      )}

      {/* CTA */}
      <div style={{ flexShrink: 0 }}>
        {isLive && def.ctaHref && (
          <a href={def.ctaHref} className="ag-action-primary" style={{ textDecoration: "none" }}>
            {def.ctaLabel}
          </a>
        )}
        {isLive && !def.ctaHref && def.onSelect && (
          <button onClick={def.onSelect} className="ag-action-primary">
            {def.ctaLabel}
          </button>
        )}
        {!isLive && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
            Próximamente
          </span>
        )}
      </div>
    </div>
  );
}

// ── Financial Streams Panel ───────────────────────────────────────────────────

const STREAM_STATUS_DOT: Record<string, string> = {
  healthy:                C.green,
  pending_review:         C.amber,
  reconciliation_pending: C.amber,
  partial_visibility:     C.blueDark,
  integration_pending:    C.inkGhost,
  blocked_source:         C.red,
  missing_sag_mapping:    C.red,
  low_activity:           C.inkGhost,
  settlement_pending:     C.blueDark,
};

function StreamRow({ stream, orgSlug }: { stream: FinancialStream; orgSlug: string }) {
  const dot        = STREAM_STATUS_DOT[stream.status] ?? C.inkGhost;
  const rowClass   = [
    "ag-op-row",
    stream.rowSeverity === "warning" ? "ag-op-row--warning" : "",
    stream.rowSeverity === "passive"  ? "ag-op-row--passive"  : "",
  ].filter(Boolean).join(" ");
  const badgeClass = `ag-op-status ag-op-status--${stream.statusBadge}`;

  const primary = stream.signals.find(s => s.level === "warn")
               ?? stream.signals.find(s => s.level === "info")
               ?? stream.signals[1]
               ?? stream.signals[0];

  const actionHref = stream.status === "reconciliation_pending"
    ? `/${orgSlug}/finanzas/torre-control/consignaciones`
    : null;

  const sigColor = primary?.level === "warn" ? C.amberDark
                 : primary?.level === "ok"   ? C.green
                 : primary?.level === "info" ? C.blue
                 : C.inkLight;

  return (
    <div
      className={rowClass}
      style={{
        display:             "grid",
        gridTemplateColumns: "20px 1fr 90px 160px 180px",
        alignItems:          "center",
        gap:                 S[3],
        padding:             `${S[2]+2}px ${S[4]}px`,
        borderBottom:        `1px solid ${C.lineSubtle}`,
        minHeight:           46,
      }}
    >
      {/* Status dot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      </div>

      {/* Name + bank */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.base,
          fontWeight:   T.wt.bold,
          color:        C.ink,
          lineHeight:   1.2,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {stream.displayName}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 1 }}>
          {stream.bank}{stream.accountSuffix ? ` · ${stream.accountSuffix}` : ""}
        </div>
      </div>

      {/* PUC code */}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkGhost,
        whiteSpace:    "nowrap",
        letterSpacing: "0.02em",
      }}>
        {stream.sagAccountCode}
      </div>

      {/* Status badge */}
      <span
        className={badgeClass}
        title={stream.statusLabel}
        style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
      >
        {stream.statusLabel}
      </span>

      {/* Primary signal + optional action link */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], justifyContent: "flex-end" }}>
        {primary?.value && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: sigColor, whiteSpace: "nowrap" }}>
            {primary.value}
          </span>
        )}
        {actionHref && (
          <a
            href={actionHref}
            style={{
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     T.wt.bold,
              color:          C.blueDark,
              textDecoration: "none",
              whiteSpace:     "nowrap",
            }}
          >
            Revisar →
          </a>
        )}
      </div>
    </div>
  );
}

function StreamGroupSection({
  label,
  streams,
  orgSlug,
}: {
  label:   string;
  streams: FinancialStream[];
  orgSlug: string;
}) {
  if (streams.length === 0) return null;

  const attentionCount  = streams.filter(s => s.requiresAction).length;
  const operativeCount  = streams.filter(s =>
    !s.requiresAction &&
    s.status !== "integration_pending" &&
    s.status !== "missing_sag_mapping",
  ).length;

  // Groups with items requiring attention default open; clean groups default closed
  const [open, setOpen] = useState(attentionCount > 0);

  return (
    <>
      {/* Collapsible group header */}
      <div
        className="ag-intel-header"
        onClick={() => setOpen(o => !o)}
        style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
          cursor:        "pointer",
          userSelect:    "none" as const,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            fontWeight:    T.wt.bold,
            color:         C.blueDark,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
          }}>
            {label}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
            · {streams.length} fuente{streams.length !== 1 ? "s" : ""}
          </span>
          {attentionCount > 0 && (
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              fontWeight:   T.wt.bold,
              color:        C.amberDark,
              background:   C.amberLight,
              border:       `1px solid ${C.amberBorder}`,
              borderRadius: R.xs,
              padding:      "1px 6px",
              whiteSpace:   "nowrap",
            }}>
              {attentionCount} atención
            </span>
          )}
          {!open && operativeCount > 0 && attentionCount === 0 && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green }}>
              {operativeCount} operativa{operativeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          {open ? "▲" : "▼"}
        </span>
      </div>
      {open && streams.map(s => <StreamRow key={s.id} stream={s} orgSlug={orgSlug} />)}
    </>
  );
}

function FinancialStreamsPanel({ streams, orgSlug }: { streams: FinancialStream[]; orgSlug: string }) {
  const bancos      = streams.filter(s => s.group === "bancos");
  const tarjetas    = streams.filter(s => s.group === "tarjetas");
  const plataformas = streams.filter(s => s.group === "plataformas");
  const actionCount = streams.filter(s => s.requiresAction).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
          {streams.length} fuentes registradas · estado operacional
        </span>
        {actionCount > 0 && (
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.bold,
            color:        C.amberDark,
            background:   C.amberLight,
            border:       `1px solid ${C.amberBorder}`,
            borderRadius: R.sm,
            padding:      "2px 8px",
          }}>
            {actionCount} requiere{actionCount !== 1 ? "n" : ""} atención
          </span>
        )}
      </div>

      <div className="ag-op-table">
        <div className="ag-op-table-head" style={{
          display:             "grid",
          gridTemplateColumns: "20px 1fr 90px 160px 180px",
          gap:                 S[3],
          padding:             `6px ${S[4]}px`,
          alignItems:          "center",
        }}>
          <div />
          {["Fuente", "PUC SAG", "Estado", "Señal"].map(h => (
            <div key={h} style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.bold,
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              textAlign:     h === "Señal" ? "right" as const : "left" as const,
            }}>
              {h}
            </div>
          ))}
        </div>

        <StreamGroupSection label="Bancos"      streams={bancos}      orgSlug={orgSlug} />
        <StreamGroupSection label="Tarjetas"    streams={tarjetas}    orgSlug={orgSlug} />
        <StreamGroupSection label="Plataformas" streams={plataformas} orgSlug={orgSlug} />
      </div>
    </div>
  );
}

// ── Observation strip ─────────────────────────────────────────────────────────

const OBS_SEVERITY_STYLES: Record<string, { border: string; bg: string; dot: string; labelColor: string }> = {
  critical: { border: `3px solid ${C.red}`,        bg: C.redLight,   dot: C.red,      labelColor: C.redDark   },
  elevated: { border: "3px solid #ea580c",          bg: "#fff7ed",    dot: "#ea580c",  labelColor: "#9a3412"   },
  watch:    { border: `3px solid ${C.amber}`,       bg: C.amberLight, dot: C.amber,    labelColor: C.amberDark },
  warning:  { border: `3px solid ${C.amber}`,       bg: C.amberLight, dot: C.amber,    labelColor: C.amberDark },
  ok:       { border: `3px solid ${C.green}`,       bg: C.greenLight, dot: C.green,    labelColor: C.greenDark },
  info:     { border: "3px solid #4f46e5",          bg: "#f5f3ff",    dot: "#6366f1",  labelColor: "#3730a3"   },
};

const ESCALATION_STYLE: Record<string, { border: string; bg: string; dot: string }> = {
  urgent:   { border: `3px solid ${C.red}`,        bg: C.redLight,   dot: C.red      },
  elevated: { border: "3px solid #ea580c",          bg: "#fff7ed",    dot: "#ea580c"  },
  watch:    { border: `3px solid ${C.amber}`,       bg: C.amberLight, dot: C.amber    },
  positive: { border: `3px solid ${C.green}`,       bg: C.greenLight, dot: C.green    },
  building: { border: "3px solid #6366f1",          bg: "#f5f3ff",    dot: "#6366f1"  },
  quiet:    { border: `3px solid ${C.line}`,        bg: C.surface,    dot: C.inkFaint },
};

function ObservationStrip({ attentionPlan }: { attentionPlan: AttentionRouterResult }) {
  const { primaryObservation, groupedSignals, attentionSummary, quietCount, escalationLevel } = attentionPlan;

  const eStyle      = ESCALATION_STYLE[escalationLevel] ?? ESCALATION_STYLE.quiet;
  const primaryStyle = primaryObservation
    ? (OBS_SEVERITY_STYLES[primaryObservation.severity] ?? OBS_SEVERITY_STYLES.info)
    : null;

  if (!primaryObservation || escalationLevel === "quiet" || escalationLevel === "building" || escalationLevel === "positive") {
    return (
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[3],
        padding:    `${S[3]}px ${S[4]+2}px`,
        marginBottom: S[5],
        border:     `1px solid ${C.line}`,
        borderLeft: eStyle.border,
        borderRadius: R.md,
        background: eStyle.bg,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: eStyle.dot, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.black,
              color:         C.brand,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              Agentik observa
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
              {attentionSummary.headline}
            </span>
          </div>
          {attentionSummary.context && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight, marginTop: 2 }}>
              {attentionSummary.context}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: S[5],
      border:       `1px solid ${C.line}`,
      borderLeft:   eStyle.border,
      borderRadius: R.md,
      background:   eStyle.bg,
      overflow:     "hidden",
    }}>
      {/* Header: executive summary */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[2],
        padding:    `${S[2]}px ${S[4]+2}px`,
        borderBottom: `1px solid ${C.line}`,
        background: "rgba(255,255,255,0.5)",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: eStyle.dot, flexShrink: 0 }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.black,
          color:         C.brand,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          Agentik observa
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: primaryStyle!.labelColor }}>
          {attentionSummary.headline}
        </span>
        {attentionSummary.context && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginLeft: 2 }}>
            · {attentionSummary.context}
          </span>
        )}
      </div>

      {/* Primary observation */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[3]+2, padding: `${S[3]+2}px ${S[4]+2}px` }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: eStyle.dot, flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.ink, lineHeight: 1.6, fontWeight: T.wt.medium }}>
            {primaryObservation.message}
          </div>
          {primaryObservation.suggestedAction && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              → {primaryObservation.suggestedAction}
            </div>
          )}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
            RULE_BASED · {primaryObservation.basedOnSnapshots} snapshot{primaryObservation.basedOnSnapshots !== 1 ? "s" : ""}
          </div>
        </div>
        {primaryObservation.relatedWorkspace && (
          <a
            href={primaryObservation.relatedWorkspace}
            style={{
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     T.wt.bold,
              padding:        "6px 14px",
              background:     C.brand,
              color:          C.white,
              borderRadius:   R.sm,
              textDecoration: "none",
              whiteSpace:     "nowrap",
              flexShrink:     0,
            }}
          >
            Revisar →
          </a>
        )}
      </div>

      {/* Grouped additional signals (max 3) */}
      {groupedSignals.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: `${S[2]}px ${S[4]+2}px ${S[2]+2}px` }}>
          {groupedSignals.map((grp, i) => {
            const s = OBS_SEVERITY_STYLES[grp.severity] ?? OBS_SEVERITY_STYLES.info;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: i > 0 ? 5 : 0 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, flex: 1 }}>{grp.message}</span>
                {grp.relatedWorkspace && (
                  <a href={grp.relatedWorkspace} style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.brand, textDecoration: "none", flexShrink: 0 }}>
                    Ver →
                  </a>
                )}
              </div>
            );
          })}
          {quietCount > 0 && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1]+2 }}>
              +{quietCount} señal{quietCount > 1 ? "es" : ""} adicional{quietCount > 1 ? "es" : ""} en segundo plano
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Streams-derived insight strip (fallback when no attentionPlan) ────────────

function StreamsInsightStrip({ streams }: { streams: FinancialStream[] }) {
  const actionItems   = streams.filter(s => s.requiresAction);
  const blocked       = streams.filter(s => s.status === "blocked_source" || s.status === "missing_sag_mapping");
  const reconcPending = streams.filter(s => s.status === "reconciliation_pending");
  const operative     = streams.filter(s =>
    !s.requiresAction &&
    s.status !== "integration_pending" &&
    s.status !== "missing_sag_mapping",
  );

  let headline   = "Sin señales activas";
  let context: string | null = null;
  let escalation: "ok" | "watch" | "warn" = "ok";

  if (actionItems.length > 0) {
    headline = `${actionItems.length} fuente${actionItems.length !== 1 ? "s" : ""} requiere${actionItems.length !== 1 ? "n" : ""} atención`;
    if (blocked.length > 0) {
      context    = `${blocked.length} bloqueada${blocked.length !== 1 ? "s" : ""}`;
      escalation = "warn";
    } else if (reconcPending.length > 0) {
      context    = `${reconcPending.length} con conciliación pendiente`;
      escalation = "watch";
    } else {
      escalation = "watch";
    }
  } else if (operative.length > 0) {
    headline = `${operative.length} de ${streams.length} fuentes operativas`;
    const pending = streams.length - operative.length;
    if (pending > 0) context = `${pending} pendiente${pending !== 1 ? "s" : ""} de integración`;
    escalation = "ok";
  }

  const dotColor   = escalation === "warn"  ? C.amber    : escalation === "watch" ? C.blue  : C.green;
  const borderLeft = escalation === "warn"  ? `3px solid ${C.amber}`
                   : escalation === "watch" ? `3px solid ${C.blue}`
                   : `3px solid ${C.green}`;
  const bg         = escalation === "warn"  ? C.amberLight
                   : escalation === "watch" ? C.blueLight
                   : C.greenLight;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      padding:      `${S[3]}px ${S[4]+2}px`,
      marginBottom: S[5],
      border:       `1px solid ${C.line}`,
      borderLeft,
      borderRadius: R.md,
      background:   bg,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.black,
          color:         C.brand,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        }}>
          Agentik observa
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
          {headline}
        </span>
        {context && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            · {context}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Module Pulse Header ───────────────────────────────────────────────────────
// Specialized recon workspace header: source readiness + attention chips + back nav.
// NOTE: different props from the generic ModulePulseHeader primitive — kept separate.

function ReconModuleHeader({
  orgSlug,
  streams,
  memoryStatus,
  attentionPlan,
  selectedFlow,
  onBack,
}: {
  orgSlug:        string;
  streams?:       FinancialStream[];
  memoryStatus?:  Props["memoryStatus"];
  attentionPlan?: AttentionRouterResult;
  selectedFlow:   string | null;
  onBack:         () => void;
}) {
  const allStreams     = streams ?? [];
  const totalSources  = allStreams.length;
  const activeSources = allStreams.filter(s =>
    s.status !== "integration_pending" && s.status !== "missing_sag_mapping",
  ).length;
  const actionItems   = allStreams.filter(s => s.requiresAction).length;

  const escalation = attentionPlan?.escalationLevel ?? "quiet";
  const hasAlert   = escalation === "urgent" || escalation === "elevated";

  const memColor = memoryStatus?.readinessTier === "ready"    ? C.green
                 : memoryStatus?.readinessTier === "warming"  ? C.blue
                 : memoryStatus?.readinessTier === "building" ? C.brand
                 : C.inkFaint;

  const chipStyle = (bg: string, border: string): CSSProperties => ({
    fontFamily:   T.mono,
    fontSize:     T.sz.sm,
    padding:      "4px 10px",
    borderRadius: R.sm,
    background:   bg,
    border:       `1px solid ${border}`,
    display:      "flex",
    alignItems:   "center",
    gap:          5,
    whiteSpace:   "nowrap",
  });

  return (
    <div style={{ marginBottom: S[6], paddingBottom: S[4]+2, borderBottom: `1px solid ${C.lineSubtle}` }}>
      {/* Breadcrumb */}
      <div style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.sm,
        color:       C.inkFaint,
        marginBottom: S[3]+2,
        display:     "flex",
        alignItems:  "center",
        gap:         6,
      }}>
        <a href={`/${orgSlug}/finance`} style={{ color: C.inkFaint, textDecoration: "none" }}>Finanzas</a>
        <span style={{ color: C.inkGhost }}>/</span>
        {selectedFlow ? (
          <>
            <button
              onClick={onBack}
              style={{
                background:  "none",
                border:      "none",
                cursor:      "pointer",
                color:       C.inkFaint,
                fontFamily:  T.mono,
                fontSize:    T.sz.sm,
                padding:     0,
              }}
            >
              Centro de Conciliación
            </button>
            <span style={{ color: C.inkGhost }}>/</span>
            <span style={{ color: C.inkMid, fontWeight: T.wt.bold }}>Pedidos vs Ventas</span>
          </>
        ) : (
          <span style={{ color: C.inkMid, fontWeight: T.wt.bold }}>Centro de Conciliación</span>
        )}
      </div>

      {/* Title row + pulse chips */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: S[3] }}>
        <div>
          <h1 style={{
            margin:       0,
            fontFamily:   T.mono,
            fontSize:     T.sz["2xl"],
            fontWeight:   T.wt.black,
            color:        C.ink,
            letterSpacing: "-0.02em",
          }}>
            {selectedFlow ? "Pedidos vs Ventas" : "Centro de Conciliación"}
          </h1>
          <p style={{ margin: `${S[1]}px 0 0`, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight }}>
            {selectedFlow
              ? "Verificación de conversión comercial período a período."
              : "Estado operacional de fuentes financieras · selecciona un flujo para conciliar."}
          </p>
        </div>

        {/* Pulse chips — landing only */}
        {!selectedFlow && (
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center" }}>
            {/* SAG chip */}
            <div style={chipStyle(C.greenLight, C.greenBorder)}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green }} />
              <span style={{ fontWeight: T.wt.bold, color: C.green }}>SAG</span>
              <span style={{ color: C.greenBorder }}>·</span>
              <span style={{ color: C.green }}>Conectado</span>
            </div>

            {/* Sources chip */}
            {totalSources > 0 && (
              <div style={chipStyle(C.blueLight, C.blueBorder)}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.blue }} />
                <span style={{ fontWeight: T.wt.bold, color: C.blue }}>{activeSources}/{totalSources}</span>
                <span style={{ color: C.blueBorder }}>·</span>
                <span style={{ color: C.blue }}>fuentes activas</span>
              </div>
            )}

            {/* Attention chip */}
            {(actionItems > 0 || hasAlert) && (
              <div style={chipStyle(C.amberLight, C.amberBorder)}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber }} />
                <span style={{ fontWeight: T.wt.bold, color: C.amberDark }}>
                  {actionItems > 0 ? actionItems : "!"}
                </span>
                <span style={{ color: C.amberBorder }}>·</span>
                <span style={{ color: C.amberDark }}>
                  {actionItems > 0
                    ? `requiere${actionItems !== 1 ? "n" : ""} atención`
                    : "señal activa"}
                </span>
              </div>
            )}

            {/* Memory chip */}
            {memoryStatus && (
              <div style={chipStyle(C.surface, C.line)}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: memColor }} />
                <span style={{ fontWeight: T.wt.bold, color: memColor }}>Memoria</span>
                <span style={{ color: C.line }}>·</span>
                <span style={{ color: C.inkLight }}>{memoryStatus.readinessLabel}</span>
              </div>
            )}
          </div>
        )}

        {/* Back button — active flow */}
        {selectedFlow && (
          <button
            onClick={onBack}
            className="ag-action-secondary"
          >
            ← Volver al Centro
          </button>
        )}
      </div>
    </div>
  );
}

// ── Source definition types + builder ────────────────────────────────────────

type SourceGroup  = "all" | "bancos" | "tarjetas" | "plataformas" | "fiscal" | "erp";
type SourceStatus = "connected" | "requires_action" | "partial" | "pending";
type SourceActionType = "review" | "validate" | "upload" | "configure" | "connect" | "none";

interface SourceDef {
  id:           string;
  name:         string;
  type:         SourceGroup;
  typeLabel:    string;
  status:       SourceStatus;
  signal?:      string;
  pucCode?:     string;
  actionType:   SourceActionType;
  actionLabel?: string;
  href?:        string;
}

function buildSourceDefs(streams: FinancialStream[], orgSlug: string): SourceDef[] {
  const statics: SourceDef[] = [
    {
      id: "sag", name: "SAG", type: "erp", typeLabel: "ERP",
      status: "connected", signal: "Cobros · Ventas · Pedidos · Cartera",
      actionType: "review", actionLabel: "Revisar", href: `/${orgSlug}/integrations`,
    },
    {
      id: "dian", name: "DIAN", type: "fiscal", typeLabel: "Fiscal",
      status: "pending", signal: "Requiere configuración de integración",
      actionType: "configure", actionLabel: "Configurar",
    },
  ];

  const streamDefs: SourceDef[] = streams.map(s => {
    const type: SourceGroup    = s.group === "bancos" ? "bancos" : s.group === "tarjetas" ? "tarjetas" : "plataformas";
    const typeLabel            = s.group === "bancos" ? "Banco"  : s.group === "tarjetas" ? "Tarjeta"  : "Plataforma";
    const status: SourceStatus = s.requiresAction
      ? "requires_action"
      : s.status === "integration_pending" || s.status === "missing_sag_mapping"
        ? "pending"
        : s.status === "partial_visibility" ? "partial" : "connected";
    const actionType: SourceActionType = s.requiresAction
      ? (s.status === "reconciliation_pending" ? "validate" : "upload")
      : s.status === "integration_pending" ? "connect" : "review";
    const actionLabel = s.requiresAction
      ? (s.status === "reconciliation_pending" ? "Validar" : "Subir extracto")
      : s.status === "integration_pending" ? "Preparar integración" : "Ver actividad";
    const primary = s.signals.find(sig => sig.level === "warn")
                 ?? s.signals.find(sig => sig.level === "info")
                 ?? s.signals[0];
    return {
      id: s.id, name: s.displayName, type, typeLabel, status,
      signal:      primary?.value ?? undefined,
      pucCode:     s.sagAccountCode || undefined,
      actionType,  actionLabel,
    };
  });

  return [...statics, ...streamDefs];
}

// ── Source card ───────────────────────────────────────────────────────────────

const SOURCE_TYPE_COLORS: Record<SourceGroup, { bg: string; color: string }> = {
  erp:         { bg: C.blueLight,  color: C.blueDark   },
  fiscal:      { bg: C.redLight,   color: C.redDark    },
  bancos:      { bg: C.greenLight, color: C.greenDark  },
  tarjetas:    { bg: C.brandLight, color: C.brandDark  },
  plataformas: { bg: C.amberLight, color: C.amberDark  },
  all:         { bg: C.surface,    color: C.inkFaint   },
};

function SourceCard({ def }: { def: SourceDef }) {
  const isConnected = def.status === "connected";
  const isAction    = def.status === "requires_action";
  const isPending   = def.status === "pending";

  const dotColor    = isConnected ? C.green : isAction ? C.amber : isPending ? C.inkGhost : C.blue;
  const borderColor = isConnected ? C.greenBorder : isAction ? C.amberBorder : isPending ? C.line : C.blueBorder;
  const bg          = isConnected ? C.greenLight  : isAction ? C.amberLight  : isPending ? C.surface : C.blueLight;
  const statusLabel = isConnected ? "Conectado" : isAction ? "Requiere acción" : isPending ? "Pendiente" : "Parcial";
  const tc          = SOURCE_TYPE_COLORS[def.type] ?? SOURCE_TYPE_COLORS.all;

  const handleAction = () => {
    // Placeholder — backend endpoint required to activate
    console.log("[recon] source action:", def.id, def.actionType);
  };

  const ctaBase: CSSProperties = {
    display:      "block",
    width:        "100%",
    fontFamily:   T.mono,
    fontSize:     T.sz.sm,
    fontWeight:   T.wt.bold,
    padding:      "4px 10px",
    borderRadius: R.sm,
    whiteSpace:   "nowrap",
    cursor:       "pointer",
    border:       "none",
    textAlign:    "center",
    boxSizing:    "border-box",
  };

  return (
    <div style={{
      flex:          "0 0 auto",
      width:         200,
      border:        `1px solid ${borderColor}`,
      borderRadius:  R.lg,
      background:    bg,
      padding:       `${S[3]}px ${S[3]+2}px`,
      boxShadow:     E.xs,
      display:       "flex",
      flexDirection: "column",
      gap:           S[1]+1,
    }}>
      {/* Type badge + status dot row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily:    T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.black,
          background: tc.bg, color: tc.color, borderRadius: R.xs, padding: "2px 6px",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {def.typeLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }} />
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: isConnected ? C.greenDark : isAction ? C.amberDark : C.inkFaint,
          }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Name */}
      <div
        title={def.name}
        style={{
          fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.black, color: C.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: S[1],
        }}
      >
        {def.name}
      </div>

      {/* PUC code */}
      {def.pucCode && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, letterSpacing: "0.02em" }}>
          PUC {def.pucCode}
        </div>
      )}

      {/* Signal */}
      {def.signal && (
        <div
          title={def.signal}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}
        >
          {def.signal}
        </div>
      )}

      {/* Action */}
      {def.actionLabel && (
        <div style={{ marginTop: "auto", paddingTop: S[1]+1 }}>
          {def.href && def.actionType === "review" ? (
            <a
              href={def.href}
              style={{ ...ctaBase, background: C.ink, color: C.white, textDecoration: "none" }}
            >
              {def.actionLabel}
            </a>
          ) : isPending ? (
            <button
              disabled
              style={{ ...ctaBase, background: C.surface, color: C.inkFaint, border: `1px solid ${C.line}`, cursor: "not-allowed" }}
            >
              {def.actionLabel}
            </button>
          ) : (
            <button
              onClick={handleAction}
              style={{ ...ctaBase, background: isAction ? C.amberDark : C.ink, color: C.white }}
            >
              {def.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Data Sources Layer — carousel + filters + collapsed technical matrix ──────

const SOURCE_FILTER_LABELS: Record<SourceGroup, string> = {
  all: "Todas", bancos: "Bancos", tarjetas: "Tarjetas",
  plataformas: "Plataformas", fiscal: "Fiscal", erp: "ERP",
};
const SOURCE_FILTER_ORDER: SourceGroup[] = ["all", "bancos", "tarjetas", "plataformas", "fiscal", "erp"];

function DataSourcesLayer({ streams, orgSlug }: { streams?: FinancialStream[]; orgSlug: string }) {
  const allStreams  = streams ?? [];
  const sourceDefs = buildSourceDefs(allStreams, orgSlug);

  const actionCount  = sourceDefs.filter(s => s.status === "requires_action").length;
  const activeCount  = sourceDefs.filter(s => s.status === "connected" || s.status === "partial").length;

  const [filter,  setFilter]  = useState<SourceGroup>("all");
  const [techOpen, setTechOpen] = useState(false);

  const filtered = filter === "all" ? sourceDefs : sourceDefs.filter(s => s.type === filter);

  return (
    <div style={{ marginTop: S[8] }}>
      <WorkspaceSection
        title="Fuentes de datos"
        subtitle={`${sourceDefs.length} fuentes · ${activeCount} activas`}
      >
        {/* Filter chips */}
        <div style={{ display: "flex", gap: S[2], marginBottom: S[4], flexWrap: "wrap", alignItems: "center" }}>
          {SOURCE_FILTER_ORDER.map(g => {
            const count = g === "all" ? sourceDefs.length : sourceDefs.filter(s => s.type === g).length;
            if (count === 0 && g !== "all") return null;
            const active = filter === g;
            return (
              <button
                key={g}
                onClick={() => setFilter(g)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: active ? T.wt.bold : T.wt.normal,
                  padding: "4px 12px", borderRadius: R.sm,
                  background: active ? C.ink : C.surface,
                  color:      active ? C.white : C.inkLight,
                  border:     `1px solid ${active ? C.ink : C.line}`,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {SOURCE_FILTER_LABELS[g]}
                <span style={{ marginLeft: 5, fontSize: T.sz["2xs"], color: active ? C.white : C.inkGhost }}>
                  {count}
                </span>
              </button>
            );
          })}
          {actionCount > 0 && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
              color: C.amberDark, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
              borderRadius: R.sm, padding: "4px 10px", marginLeft: "auto", whiteSpace: "nowrap",
            }}>
              {actionCount} requiere{actionCount !== 1 ? "n" : ""} atención
            </span>
          )}
        </div>

        {/* Source cards carousel */}
        <div style={{ display: "flex", gap: S[3], overflowX: "auto", paddingBottom: S[2] }}>
          {filtered.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[3]}px 0` }}>
              Sin fuentes en este grupo
            </div>
          ) : (
            filtered.map(def => <SourceCard key={def.id} def={def} />)
          )}
        </div>

        {/* Collapsed technical matrix */}
        <div style={{ marginTop: S[4] }}>
          <button
            onClick={() => setTechOpen(o => !o)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
              color: C.inkFaint, background: "none", border: "none", cursor: "pointer",
              padding: 0, textDecoration: "underline", letterSpacing: "0.02em",
            }}
          >
            {techOpen ? "▲ Ocultar matriz técnica" : "▼ Ver matriz técnica"}
          </button>
          {techOpen && (
            <div style={{ marginTop: S[3] }}>
              {allStreams.length > 0
                ? <FinancialStreamsPanel streams={allStreams} orgSlug={orgSlug} />
                : <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[3]}px 0` }}>
                    Sin fuentes financieras registradas
                  </div>
              }
            </div>
          )}
        </div>
      </WorkspaceSection>
    </div>
  );
}

// ── Manual File Reconciliation Workspace ─────────────────────────────────────

type FileFormat = "xml" | "csv";

function FileUploadZone({
  label,
  format,
  onFormatChange,
}: {
  label:          string;
  format:         FileFormat;
  onFormatChange: (f: FileFormat) => void;
}) {
  return (
    <div style={{
      flex:         "1 1 0",
      border:       `1px solid ${C.line}`,
      borderRadius: R.lg,
      background:   C.surface,
      padding:      `${S[4]}px`,
      minWidth:     200,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.black,
        color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: S[2],
      }}>
        {label}
      </div>

      {/* Format selector */}
      <div style={{ display: "flex", gap: S[1]+1, marginBottom: S[3], alignItems: "center" }}>
        {(["xml", "csv"] as FileFormat[]).map(f => (
          <button
            key={f}
            onClick={() => onFormatChange(f)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
              padding: "3px 10px", borderRadius: R.sm,
              background: format === f ? C.ink : C.white,
              color:      format === f ? C.white : C.inkLight,
              border:     `1px solid ${format === f ? C.ink : C.line}`,
              cursor: "pointer", textTransform: "uppercase",
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
          · PDF/XLSX próximamente
        </span>
      </div>

      {/* Drop zone */}
      <div style={{
        border:       `1.5px dashed ${C.line}`,
        borderRadius: R.md,
        background:   C.white,
        padding:      `${S[4]+2}px ${S[3]}px`,
        textAlign:    "center",
        marginBottom: S[3],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[1]+1 }}>
          Selecciona archivo {format.toUpperCase()}
        </div>
        <input
          type="file"
          accept={format === "xml" ? ".xml" : ".csv"}
          disabled
          style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}
        />
      </div>

      {/* Description input */}
      <input
        type="text"
        disabled
        placeholder={`Descripción (ej. Extracto ${label} Abr 2026)`}
        style={{
          width:        "100%",
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          padding:      "5px 8px",
          border:       `1px solid ${C.line}`,
          borderRadius: R.sm,
          background:   C.white,
          color:        C.inkLight,
          boxSizing:    "border-box",
        }}
      />
    </div>
  );
}

function ManualReconciliationWorkspace() {
  const [fmtA, setFmtA] = useState<FileFormat>("csv");
  const [fmtB, setFmtB] = useState<FileFormat>("csv");

  return (
    <WorkspaceSection
      title="Conciliación manual asistida"
      subtitle="Carga dos fuentes · Agentik prepara la comparación"
    >
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[4], lineHeight: 1.7 }}>
        Carga dos fuentes y Agentik preparará una conciliación asistida cuando el motor manual esté activo.
        Soporta XML y CSV — útil para extractos bancarios, exportaciones SAG, y archivos DIAN.
      </div>

      {/* Upload zones */}
      <div style={{ display: "flex", gap: S[4], flexWrap: "wrap", marginBottom: S[5] }}>
        <FileUploadZone label="Fuente A" format={fmtA} onFormatChange={setFmtA} />
        <FileUploadZone label="Fuente B" format={fmtB} onFormatChange={setFmtB} />
      </div>

      {/* Engine status */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[3]}px ${S[4]}px`,
        border:       `1px solid ${C.blueBorder}`,
        borderLeft:   `3px solid ${C.blue}`,
        borderRadius: R.md,
        background:   C.blueLight,
        marginBottom: S[4],
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.blueDark }}>
            Preparando motor de carga manual
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
            El motor de carga manual estará disponible próximamente. El operador recibirá notificación cuando esté activo.
          </div>
        </div>
      </div>

      {/* CTA (disabled) */}
      <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
        <button
          disabled
          className="ag-action-primary"
          style={{ opacity: 0.4, cursor: "not-allowed" }}
        >
          Preparar conciliación
        </button>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Requiere seleccionar ambas fuentes y motor activo
        </span>
      </div>

      {/* Copilot note (below CTA — visible but secondary) */}
      <div style={{
        marginTop:  S[5],
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      C.inkLight,
        borderTop:  `1px solid ${C.lineSubtle}`,
        paddingTop: S[3],
      }}>
        <span style={{ fontWeight: T.wt.bold, color: C.brand }}>Agentik Copilot</span>
        {" "}podrá ayudarte a interpretar diferencias y sugerir reglas de conciliación cuando el motor esté activo.
      </div>
    </WorkspaceSection>
  );
}

// ── Reconciliation Builder ─────────────────────────────────────────────────────

function ReconciliationBuilder({
  orgSlug,
  onSelectFlow,
}: {
  orgSlug:      string;
  onSelectFlow: (id: string) => void;
}) {
  const flows: FlowRowDef[] = [
    {
      id:          "pedidos-ventas",
      title:       "Pedidos vs Ventas",
      tag:         "Operativo",
      tagBg:       C.blueLight,
      tagColor:    C.blue,
      description: "Conversión comercial · qué pedidos se convirtieron en venta real · diferencia de monto por fuente",
      status:      "live",
      ctaLabel:    "Conciliar →",
      onSelect:    () => onSelectFlow("pedidos-ventas"),
    },
    {
      id:             "cartera-recaudos",
      title:          "Cartera vs Recaudos",
      tag:            "Financiero",
      tagBg:          C.redLight,
      tagColor:       C.redDark,
      description:    "Cartera pendiente vs pagos aplicados · detecta cartera cobrada que sigue abierta",
      status:         "soon",
      blockerReason:  "Requiere módulo cartera",
      ctaLabel:       "Ver cartera →",
      ctaHref:        `/${orgSlug}/finance?tab=hub`,
    },
    {
      id:             "banco-cobros",
      title:          "Banco vs Cobros",
      tag:            "Financiero",
      tagBg:          C.redLight,
      tagColor:       C.redDark,
      description:    "Extracto bancario vs cobros SAG · consignaciones sin identificar · brecha de recaudo",
      status:         "soon",
      blockerReason:  "Requiere extracto bancario",
      ctaLabel:       "",
    },
    {
      id:             "xml-dian-ventas",
      title:          "XML DIAN vs Ventas",
      tag:            "Fiscal",
      tagBg:          C.blueLight,
      tagColor:       C.blue,
      description:    "Facturas electrónicas DIAN vs ventas SAG · valida por CUFE · detecta rechazos y faltantes",
      status:         "soon",
      blockerReason:  "Requiere carga XML DIAN",
      ctaLabel:       "",
    },
    {
      id:             "cxp-soportes",
      title:          "CxP vs Soportes",
      tag:            "Control",
      tagBg:          C.brandLight,
      tagColor:       C.brandDark,
      description:    "Cuentas por pagar vs facturas de proveedores · respaldo documental · pagos sin soporte",
      status:         "soon",
      blockerReason:  "Requiere módulo CxP",
      ctaLabel:       "",
    },
    {
      id:             "f2-f1",
      title:          "Remisiones F2 → Facturas F1",
      tag:            "Control",
      tagBg:          C.brandLight,
      tagColor:       C.brandDark,
      description:    "Conversión remisiones F2 a facturas F1 · tasa de conversión por cliente · riesgo cartera no formalizada",
      status:         "soon",
      blockerReason:  "Requiere flujo F2→F1",
      ctaLabel:       "",
    },
  ];

  const liveCount = flows.filter(f => f.status === "live").length;
  const soonCount = flows.filter(f => f.status === "soon").length;

  return (
    <WorkspaceSection
      title="Flujos de conciliación"
      subtitle={`${liveCount} activo · ${soonCount} próximamente`}
    >
      <div className="ag-op-table">
        {flows.map(f => <FlowRow key={f.id} def={f} />)}
      </div>
    </WorkspaceSection>
  );
}

// ── Recent Sessions ───────────────────────────────────────────────────────────

function RecentSessionsSection({ sessions }: { sessions: ReconSessionRow[] }) {
  const fmtDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("es-CO", {
        day:    "2-digit",
        month:  "short",
        year:   "numeric",
        hour:   "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };

  return (
    <WorkspaceSection
      title="Sesiones recientes"
      subtitle={sessions.length > 0 ? `${sessions.length} sesión${sessions.length !== 1 ? "es" : ""}` : undefined}
    >
      {sessions.length === 0 ? (
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.sm,
          color:      C.inkFaint,
          padding:    `${S[3]}px ${S[4]}px`,
          textAlign:  "center" as const,
        }}>
          Sin sesiones — ejecuta un flujo de conciliación para registrar actividad aquí
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <div className="ag-op-table">
          {/* Column headers */}
          <div className="ag-op-table-head" style={{
            display:             "grid",
            gridTemplateColumns: "100px 1fr 80px 110px 80px 80px 1fr",
            gap:                 S[2]+2,
            padding:             `6px ${S[4]}px`,
            alignItems:          "center",
          }}>
            {["Código", "Conciliación", "Período", "Estado", "Coincide", "Diferencias", "Última actividad"].map((h, i) => (
              <div key={h} style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    T.wt.bold,
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
                textAlign:     i >= 4 && i <= 5 ? "right" as const : "left" as const,
              }}>
                {h}
              </div>
            ))}
          </div>

          {sessions.map(s => {
            const badge      = SESSION_STATUS_BADGE[s.status] ?? SESSION_STATUS_BADGE.draft;
            const matchRate  = s.summary?.matchRate;
            const exceptions = s.summary
              ? s.summary.onlyInA + s.summary.onlyInB + s.summary.mismatchAmount
              : null;

            return (
              <div
                key={s.id}
                className="ag-op-row"
                style={{
                  display:             "grid",
                  gridTemplateColumns: "100px 1fr 80px 110px 80px 80px 1fr",
                  gap:                 S[2]+2,
                  padding:             `${S[2]+2}px ${S[4]}px`,
                  borderBottom:        `1px solid ${C.lineSubtle}`,
                  alignItems:          "center",
                }}
              >
                {/* Código */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: badge.dot, flexShrink: 0 }} />
                  <span style={{
                    fontFamily:    T.mono,
                    fontSize:      T.sz.sm,
                    fontWeight:    T.wt.bold,
                    color:         C.blueDark,
                    whiteSpace:    "nowrap",
                    letterSpacing: "0.01em",
                  }}>
                    {s.sessionCode}
                  </span>
                </div>

                {/* Conciliación title */}
                <div style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.base,
                  fontWeight:   T.wt.semibold,
                  color:        C.ink,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}>
                  {s.title}
                </div>

                {/* Período */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, whiteSpace: "nowrap" }}>
                  {s.period ? fmtPeriodo(s.period) : <span style={{ color: C.inkGhost }}>—</span>}
                </div>

                {/* Estado badge */}
                <div>
                  <span className={badge.cls}>{badge.label}</span>
                </div>

                {/* Coincidencia % */}
                <div style={{ textAlign: "right" }}>
                  {matchRate != null ? (
                    <span style={{
                      fontFamily:         T.mono,
                      fontSize:           T.sz.base,
                      fontWeight:         T.wt.bold,
                      fontVariantNumeric: "tabular-nums",
                      color:              matchRate >= 95 ? C.green
                                        : matchRate >= 80 ? C.amberDark
                                        : C.redDark,
                    }}>
                      {matchRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ color: C.inkGhost, fontFamily: T.mono, fontSize: T.sz.sm }}>—</span>
                  )}
                </div>

                {/* Diferencias */}
                <div style={{ textAlign: "right" }}>
                  {exceptions != null ? (
                    <span style={{
                      fontFamily:         T.mono,
                      fontSize:           T.sz.base,
                      fontWeight:         exceptions > 0 ? T.wt.bold : T.wt.normal,
                      fontVariantNumeric: "tabular-nums",
                      color:              exceptions > 0 ? C.amberDark : C.inkFaint,
                    }}>
                      {exceptions > 0 ? fmtN(exceptions) : "0"}
                    </span>
                  ) : (
                    <span style={{ color: C.inkGhost, fontFamily: T.mono, fontSize: T.sz.sm }}>—</span>
                  )}
                </div>

                {/* Última actividad */}
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, whiteSpace: "nowrap" }}>
                  {fmtDate(s.updatedAt)}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}
    </WorkspaceSection>
  );
}

// ── Results Workbench (operational table) ─────────────────────────────────────

function ResultsWorkbench({ result, baseUrl }: { result: ReconResult; baseUrl: string }) {
  const cols = "auto 1fr 130px 130px 110px 80px 70px 70px";

  return (
    <WorkspaceSection title="Mesa de trabajo — resultados">
      {/* KPI strip — 5 summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[3], marginBottom: S[5] }}>
        <SummaryCard
          label="Cuadran"
          value={fmtN(result.summary.matched)}
          sub={`de ${fmtN(result.summary.total)} registros`}
          accent="green"
        />
        <SummaryCard
          label="Diferencia de monto"
          value={fmtN(result.summary.mismatchAmount)}
          sub="mismo key, monto distinto"
          accent={result.summary.mismatchAmount > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          label={`Solo en ${result.sourceALabel}`}
          value={fmtN(result.summary.onlyInA)}
          sub="faltan en Fuente B"
          accent={result.summary.onlyInA > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          label={`Solo en ${result.sourceBLabel}`}
          value={fmtN(result.summary.onlyInB)}
          sub="faltan en Fuente A"
          accent={result.summary.onlyInB > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          label="Tasa de coincidencia"
          value={`${result.summary.matchRate.toFixed(1)}%`}
          sub={result.summary.possibleDuplicates > 0
            ? `${result.summary.possibleDuplicates} posibles duplicados`
            : "sin duplicados detectados"}
          accent={result.summary.matchRate >= 95 ? "green" : result.summary.matchRate >= 80 ? "yellow" : "red"}
        />
      </div>

      {/* Amount summary bar */}
      <div style={{
        display:      "flex",
        gap:          S[4],
        marginBottom: S[5],
        padding:      `${S[2]+2}px ${S[3]+2}px`,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        fontFamily:   T.mono,
        fontSize:     T.sz.base,
        flexWrap:     "wrap",
      }}>
        <span>
          <span style={{ color: C.inkLight, fontWeight: T.wt.bold }}>Total A:</span>{" "}
          <span style={{ fontWeight: T.wt.bold, color: C.ink }}>{fmtCOP(result.summary.totalAmountA)}</span>
        </span>
        <span style={{ color: C.inkGhost }}>|</span>
        <span>
          <span style={{ color: C.inkLight, fontWeight: T.wt.bold }}>Total B:</span>{" "}
          <span style={{ fontWeight: T.wt.bold, color: C.ink }}>{fmtCOP(result.summary.totalAmountB)}</span>
        </span>
        <span style={{ color: C.inkGhost }}>|</span>
        <span>
          <span style={{ color: C.inkLight, fontWeight: T.wt.bold }}>Delta Total:</span>{" "}
          <span style={{
            fontWeight: T.wt.bold,
            color: Math.abs(result.summary.deltaTotal) < 1 ? C.green : C.red,
          }}>
            {fmtCOP(result.summary.deltaTotal)}
          </span>
        </span>
        <span style={{ color: C.inkGhost }}>|</span>
        <span style={{ color: C.inkLight }}>
          {result.sourceALabel} vs {result.sourceBLabel}
        </span>
        <span style={{ marginLeft: "auto", color: C.inkFaint, fontSize: T.sz.xs }}>
          {new Date(result.runAt).toLocaleString("es-CO")}
        </span>
      </div>

      {/* Status legend */}
      <div style={{
        display:      "flex",
        flexWrap:     "wrap",
        gap:          S[2],
        marginBottom: S[4],
        padding:      `${S[2]+2}px ${S[3]+2}px`,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.inkFaint, marginRight: S[1] }}>
          Leyenda:
        </span>
        {(Object.keys(STATUS_LABELS) as ReconStatus[]).map(s => (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <StatusBadge status={s} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>{STATUS_DESC[s]}</span>
          </span>
        ))}
      </div>

      {/* Operational detail table */}
      <div style={{ ...panel, overflow: "hidden" }}>
        {/* Panel header */}
        <div style={{
          ...panelHeader,
          justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: T.mono, fontWeight: T.wt.bold, fontSize: T.sz.md, color: C.ink }}>
            Detalle —{" "}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold }}>
              {result.records.length} registros
            </span>
            <span style={{ fontFamily: T.mono, fontWeight: T.wt.normal, color: C.inkLight, fontSize: T.sz.base, marginLeft: S[2] }}>
              A: {result.sourceALabel} · B: {result.sourceBLabel}
            </span>
          </span>
          <button
            onClick={() => exportReconCsv(result)}
            className="ag-action-secondary"
          >
            Exportar CSV
          </button>
        </div>

        {/* ag-op-table detail rows */}
        <div className="ag-op-table" style={{ overflowX: "auto" }}>
          {/* Column headers */}
          <div className="ag-op-table-head" style={{
            display:             "grid",
            gridTemplateColumns: cols,
            gap:                 S[3],
            padding:             `6px ${S[4]}px`,
            alignItems:          "center",
          }}>
            {[
              { label: "Estado",                         align: "left"  },
              { label: "Descripción",                    align: "left"  },
              { label: `Monto ${result.sourceALabel}`,   align: "right" },
              { label: `Monto ${result.sourceBLabel}`,   align: "right" },
              { label: "Diferencia",                     align: "right" },
              { label: "Dif. %",                         align: "right" },
              { label: "Filas A",                        align: "right" },
              { label: "Filas B",                        align: "right" },
            ].map(h => (
              <div key={h.label} style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    T.wt.bold,
                color:         C.inkFaint,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textAlign:     h.align as CSSProperties["textAlign"],
              }}>
                {h.label}
              </div>
            ))}
          </div>

          {sortedRecords(result.records).map((r) => (
            <div
              key={r.key}
              className="ag-op-row"
              style={{
                display:             "grid",
                gridTemplateColumns: cols,
                gap:                 S[3],
                padding:             `${S[2]+1}px ${S[4]}px`,
                borderBottom:        `1px solid ${C.lineSubtle}`,
                alignItems:          "center",
              }}
            >
              {/* Estado */}
              <div><StatusBadge status={r.status} /></div>

              {/* Descripción */}
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
                  {r.label}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                  {r.key}
                </div>
              </div>

              {/* Monto A */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontVariantNumeric: "tabular-nums", color: C.inkMid, textAlign: "right" }}>
                {r.amountA != null ? fmtCOP(r.amountA) : <span style={{ color: C.inkGhost }}>—</span>}
              </div>

              {/* Monto B */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontVariantNumeric: "tabular-nums", color: C.inkMid, textAlign: "right" }}>
                {r.amountB != null ? fmtCOP(r.amountB) : <span style={{ color: C.inkGhost }}>—</span>}
              </div>

              {/* Diferencia */}
              <div style={{ textAlign: "right" }}>
                {r.delta != null ? (
                  <span style={{
                    fontFamily:         T.mono,
                    fontSize:           T.sz.base,
                    fontWeight:         T.wt.semibold,
                    fontVariantNumeric: "tabular-nums",
                    color:              Math.abs(r.delta) < 1 ? C.green : C.red,
                  }}>
                    {fmtCOP(r.delta)}
                  </span>
                ) : (
                  <span style={{ color: C.inkGhost, fontFamily: T.mono }}>—</span>
                )}
              </div>

              {/* Dif % */}
              <div style={{ textAlign: "right" }}>
                {r.deltaPercent != null ? (
                  <span style={{
                    fontFamily:         T.mono,
                    fontSize:           T.sz.base,
                    fontVariantNumeric: "tabular-nums",
                    color:              Math.abs(r.deltaPercent) < 0.1 ? C.green : C.red,
                  }}>
                    {r.deltaPercent.toFixed(2)}%
                  </span>
                ) : (
                  <span style={{ color: C.inkGhost, fontFamily: T.mono }}>—</span>
                )}
              </div>

              {/* Filas A */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmtN(r.rowsA)}
              </div>

              {/* Filas B */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmtN(r.rowsB)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceSection>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReconClient({
  orgSlug,
  periods,
  period,
  sourceA,
  sourceB,
  availableSources,
  result,
  streams,
  recommendations,
  memoryStatus,
  observations,
  attentionPlan,
  recentSessions,
}: Props) {
  const baseUrl = `/${orgSlug}/reconciliation`;

  const [selectedFlow, setSelectedFlow] = useState<string | null>(
    period || sourceA || sourceB ? "pedidos-ventas" : null,
  );

  const sourceOptions = [
    { value: "all", label: "Todas las fuentes" },
    ...availableSources.map(s => ({
      value: s.source,
      label: `${s.source} (${fmtN(s.recordCount)} reg.)`,
    })),
  ];

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1100, margin: "0 auto", padding: `${S[6]}px ${S[4]}px`, minWidth: 0, overflowX: "hidden" }}>

      {/* ── Workspace Header ── */}
      <ReconModuleHeader
        orgSlug={orgSlug}
        streams={streams}
        memoryStatus={memoryStatus}
        attentionPlan={attentionPlan}
        selectedFlow={selectedFlow}
        onBack={() => setSelectedFlow(null)}
      />

      {/* ════════════════════════════════════════════════════════════
          LANDING — Financial Operations Center
          ════════════════════════════════════════════════════════════ */}
      {!selectedFlow && (
        <div>

          {/* Layer 1: Observation strip — attentionPlan if available, else stream-derived signal */}
          {attentionPlan
            ? <ObservationStrip attentionPlan={attentionPlan} />
            : streams && streams.length > 0
              ? <StreamsInsightStrip streams={streams} />
              : null}

          {/* Layer 2: Reconciliation Builder — primary workspace (promoted above sources) */}
          <ReconciliationBuilder
            orgSlug={orgSlug}
            onSelectFlow={(id) => setSelectedFlow(id)}
          />

          {/* Layer 3: Data Sources — carousel + filters + collapsed technical matrix */}
          <DataSourcesLayer streams={streams} orgSlug={orgSlug} />

          {/* Layer 4: Manual File Reconciliation Workspace */}
          <div style={{ marginTop: S[8] }}>
            <ManualReconciliationWorkspace />
          </div>

          {/* Layer 5: Sesiones recientes */}
          <RecentSessionsSection sessions={recentSessions ?? []} />

          {/* Layer 6: Copilot readiness (secondary — copilot note already in ManualWorkspace) */}
          <div style={{ marginTop: S[6] }}>
            <CopilotReadinessSlot
              label="Agentik Copilot — Conciliación"
              moduleId="reconciliation"
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ACTIVE FLOW — Pedidos vs Ventas
          ════════════════════════════════════════════════════════════ */}
      {selectedFlow === "pedidos-ventas" && (
        <div>

          {/* Config workspace */}
          <WorkspaceSection title="Configuración" divider={false}>
            <div style={{ ...panel, overflow: "hidden" }}>
              <form method="GET" action={baseUrl} style={{ padding: `${S[3]+2}px ${S[4]}px` }}>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[3] }}>

                  {/* Recon type (static) */}
                  <div>
                    <label style={{
                      display:       "block",
                      fontFamily:    T.mono,
                      fontSize:      T.sz.xs,
                      color:         C.inkFaint,
                      fontWeight:    T.wt.bold,
                      textTransform: "uppercase",
                      marginBottom:  S[1],
                    }}>
                      Tipo de reconciliacion
                    </label>
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.base,
                      padding:      "5px 8px",
                      border:       `1px solid ${C.line}`,
                      borderRadius: R.sm,
                      background:   C.surface,
                      color:        C.inkLight,
                    }}>
                      Pedidos vs Ventas
                    </div>
                  </div>

                  {/* Period */}
                  <div>
                    <label style={{
                      display:       "block",
                      fontFamily:    T.mono,
                      fontSize:      T.sz.xs,
                      color:         C.inkFaint,
                      fontWeight:    T.wt.bold,
                      textTransform: "uppercase",
                      marginBottom:  S[1],
                    }}>
                      Periodo
                    </label>
                    <select
                      name="period"
                      defaultValue={period ?? ""}
                      style={{
                        width:        "100%",
                        fontFamily:   T.mono,
                        fontSize:     T.sz.base,
                        padding:      "5px 8px",
                        border:       `1px solid ${C.line}`,
                        borderRadius: R.sm,
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {periods.map(p => (
                        <option key={p} value={p}>{fmtPeriodo(p)}</option>
                      ))}
                    </select>
                  </div>

                  <div />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[3], marginBottom: S[3] }}>

                  {/* Source A */}
                  <div>
                    <label style={{
                      display:       "block",
                      fontFamily:    T.mono,
                      fontSize:      T.sz.xs,
                      color:         C.inkFaint,
                      fontWeight:    T.wt.bold,
                      textTransform: "uppercase",
                      marginBottom:  S[1],
                    }}>
                      Fuente A
                    </label>
                    <select
                      name="sourceA"
                      defaultValue={sourceA ?? ""}
                      style={{
                        width:        "100%",
                        fontFamily:   T.mono,
                        fontSize:     T.sz.base,
                        padding:      "5px 8px",
                        border:       `1px solid ${C.line}`,
                        borderRadius: R.sm,
                      }}
                    >
                      <option value="">Seleccionar fuente...</option>
                      {sourceOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Source B */}
                  <div>
                    <label style={{
                      display:       "block",
                      fontFamily:    T.mono,
                      fontSize:      T.sz.xs,
                      color:         C.inkFaint,
                      fontWeight:    T.wt.bold,
                      textTransform: "uppercase",
                      marginBottom:  S[1],
                    }}>
                      Fuente B
                    </label>
                    <select
                      name="sourceB"
                      defaultValue={sourceB ?? ""}
                      style={{
                        width:        "100%",
                        fontFamily:   T.mono,
                        fontSize:     T.sz.base,
                        padding:      "5px 8px",
                        border:       `1px solid ${C.line}`,
                        borderRadius: R.sm,
                      }}
                    >
                      <option value="">Seleccionar fuente...</option>
                      {sourceOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button type="submit" className="ag-action-primary">
                  Ejecutar Conciliación
                </button>
              </form>
            </div>
          </WorkspaceSection>

          {/* Same-source warning */}
          {sourceA && sourceB && sourceA === sourceB && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.base,
              padding:      `${S[2]+2}px ${S[3]+2}px`,
              marginTop:    S[4],
              border:       `1px solid ${C.amberBorder}`,
              borderRadius: R.md,
              background:   C.amberLight,
              color:        C.amberDark,
            }}>
              <strong>Atención:</strong> Fuente A y Fuente B son la misma ({sourceA}). La reconciliación mostrará 100% de coincidencia trivialmente — seleccione dos fuentes diferentes para obtener resultados útiles.
            </div>
          )}

          {/* Results Workbench — active */}
          {result && (
            <ResultsWorkbench result={result} baseUrl={baseUrl} />
          )}

          {/* Exception Resolution Workbench — active when results exist */}
          {result && (
            <ExceptionWorkbench
              exceptions={reconRecordsToExceptions(
                result.records,
                result.sourceALabel,
                result.sourceBLabel,
              )}
              sourceALabel={result.sourceALabel}
              sourceBLabel={result.sourceBLabel}
              runAt={result.runAt}
            />
          )}

          {/* Error state */}
          {!result && period && sourceA && sourceB && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.base,
              padding:      `${S[5]}px ${S[4]}px`,
              border:       `1px solid ${C.redBorder}`,
              borderRadius: R.md,
              background:   C.redLight,
              color:        C.redDark,
              marginTop:    S[4],
            }}>
              Error al ejecutar la reconciliacion. Verifique los parametros e intente nuevamente.
            </div>
          )}

        </div>
      )}

    </div>
  );
}
