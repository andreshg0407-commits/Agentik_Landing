"use client";

/**
 * session-detail-client.tsx
 *
 * AGENTIK-RECON-SESSIONS-02 — Session-Centric Operations
 *
 * Full session workspace. Everything lives inside the session:
 *   - Session header (code · status · lifecycle position)
 *   - Reconciliation lifecycle bar (visual pipeline)
 *   - Session metrics (match rate · records · exceptions · delta · runs)
 *   - Run timeline (all executions, most-recent first)
 *   - Operator assignment panel
 *   - Audit trail (immutable event stream, oldest-first)
 *
 * Design system:
 *   - All tokens from lib/ui/tokens.ts (C, T, S, R, E)
 *   - ag-op-status / ag-op-table / ag-action-* CSS classes
 *   - WorkspaceSection from operational-primitives
 *   - Zero raw hex. Zero "monospace" string literals.
 */

import Link                            from "next/link";
import type { CSSProperties }          from "react";
import { C, T, S, R, E, panel, panelHeader, dataRow } from "@/lib/ui/tokens";
import { WorkspaceSection }            from "@/components/shell/operational-primitives";
import ExceptionWorkbench              from "../../exception-workbench";
import type {
  ReconciliationSession,
  ReconciliationSessionRun,
  ReconciliationAuditEvent,
  ReconciliationSessionStatus,
  ReconciliationRunStatus,
  ReconciliationSummarySnapshot,
  ReconAuditEventType,
} from "@/lib/reconciliation/session-types";
import type {
  WorkbenchException,
  ResolutionMap,
}                                      from "@/lib/reconciliation/workbench-types";

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:       string;
  session:       ReconciliationSession;
  runs:          ReconciliationSessionRun[];
  events:        ReconciliationAuditEvent[];
  exceptions:    WorkbenchException[];
  resolutionMap: ResolutionMap;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                "currency",
    currency:             "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

const MONTH_NAMES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtPeriodo(p: string | null): string {
  if (!p) return "—";
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms  = new Date(end).getTime() - new Date(start).getTime();
  const s   = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

// ── Status badge configs ───────────────────────────────────────────────────────

const SESSION_BADGE: Record<ReconciliationSessionStatus, { cls: string; label: string; dot: string }> = {
  draft:                { cls: "ag-op-status ag-op-status--pending",  label: "Borrador",    dot: C.inkGhost  },
  ready:                { cls: "ag-op-status ag-op-status--info",     label: "Listo",       dot: C.blue      },
  running:              { cls: "ag-op-status ag-op-status--info",     label: "Ejecutando",  dot: C.blueDark  },
  needs_review:         { cls: "ag-op-status ag-op-status--warning",  label: "En Revisión", dot: C.amber     },
  partially_reconciled: { cls: "ag-op-status ag-op-status--warning",  label: "Parcial",     dot: C.amberMid  },
  reconciled:           { cls: "ag-op-status ag-op-status--ok",       label: "Conciliado",  dot: C.green     },
  closed:               { cls: "ag-op-status ag-op-status--pending",  label: "Cerrado",     dot: C.inkFaint  },
  failed:               { cls: "ag-op-status ag-op-status--critical", label: "Error",       dot: C.red       },
  cancelled:            { cls: "ag-op-status ag-op-status--pending",  label: "Cancelado",   dot: C.inkGhost  },
};

const RUN_BADGE: Record<ReconciliationRunStatus, { cls: string; label: string }> = {
  pending:     { cls: "ag-op-status ag-op-status--pending",  label: "Pendiente"    },
  running:     { cls: "ag-op-status ag-op-status--info",     label: "Ejecutando"   },
  completed:   { cls: "ag-op-status ag-op-status--ok",       label: "Completada"   },
  failed:      { cls: "ag-op-status ag-op-status--critical", label: "Error"        },
  unsupported: { cls: "ag-op-status ag-op-status--pending",  label: "No soportado" },
};

// ── Lifecycle pipeline config ──────────────────────────────────────────────────

const LIFECYCLE_STEPS: Array<{
  status:  ReconciliationSessionStatus;
  label:   string;
  rank:    number;
}> = [
  { status: "draft",                label: "Borrador",    rank: 0 },
  { status: "ready",                label: "Listo",       rank: 1 },
  { status: "running",              label: "Ejecutando",  rank: 2 },
  { status: "needs_review",         label: "En Revisión", rank: 3 },
  { status: "reconciled",           label: "Conciliado",  rank: 4 },
  { status: "closed",               label: "Cerrado",     rank: 5 },
];

const STATUS_RANK: Record<ReconciliationSessionStatus, number> = {
  draft:                0,
  ready:                1,
  running:              2,
  needs_review:         3,
  partially_reconciled: 3,
  reconciled:           4,
  closed:               5,
  failed:               -1,
  cancelled:            -1,
};

// ── Audit event type display ───────────────────────────────────────────────────

const EVENT_TYPE_BADGE: Partial<Record<ReconAuditEventType, { cls: string; label: string }>> = {
  session_created:          { cls: "ag-op-status ag-op-status--info",     label: "Sesión creada"      },
  session_updated:          { cls: "ag-op-status ag-op-status--info",     label: "Sesión actualizada" },
  session_closed:           { cls: "ag-op-status ag-op-status--ok",       label: "Sesión cerrada"     },
  session_cancelled:        { cls: "ag-op-status ag-op-status--pending",  label: "Cancelada"          },
  run_started:              { cls: "ag-op-status ag-op-status--info",     label: "Ejecución iniciada" },
  run_completed:            { cls: "ag-op-status ag-op-status--ok",       label: "Ejecución completa" },
  run_failed:               { cls: "ag-op-status ag-op-status--critical", label: "Ejecución fallida"  },
  exception_detected:       { cls: "ag-op-status ag-op-status--warning",  label: "Excepción"          },
  manual_review_required:   { cls: "ag-op-status ag-op-status--warning",  label: "Revisión manual"    },
  user_note_added:          { cls: "ag-op-status ag-op-status--info",     label: "Nota"               },
  export_generated:         { cls: "ag-op-status ag-op-status--ok",       label: "Exportación"        },
  status_changed:           { cls: "ag-op-status ag-op-status--info",     label: "Estado cambiado"    },
  engine_shadow_completed:  { cls: "ag-op-status ag-op-status--info",     label: "Motor sombra"       },
  engine_parity_passed:     { cls: "ag-op-status ag-op-status--ok",       label: "Paridad OK"         },
  engine_parity_failed:     { cls: "ag-op-status ag-op-status--critical", label: "Paridad fallida"    },
  engine_universal_completed: { cls: "ag-op-status ag-op-status--ok",     label: "Motor universal"    },
  engine_fallback_to_legacy:  { cls: "ag-op-status ag-op-status--warning", label: "Fallback legacy"   },
  exception_summary_created:  { cls: "ag-op-status ag-op-status--info",   label: "Resumen excepciones"},
};

const ACTOR_DOT: Record<string, { color: string; initial: string }> = {
  system: { color: C.blue,   initial: "S" },
  user:   { color: C.brand,  initial: "U" },
  agent:  { color: C.amber,  initial: "A" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function LifecycleBar({ status }: { status: ReconciliationSessionStatus }) {
  const currentRank = STATUS_RANK[status];
  const isTerminal  = currentRank === -1;

  return (
    <div style={{ ...panel, margin: `0 0 ${S[4]}px` }}>
      <div style={{ ...panelHeader, gap: S[3] }}>
        <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkLight, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
          Ciclo de vida
        </span>
        {isTerminal && (
          <span className={SESSION_BADGE[status].cls} style={{ marginLeft: "auto" }}>
            <span style={{ width: 6, height: 6, borderRadius: R.pill, background: SESSION_BADGE[status].dot, display: "inline-block", marginRight: 5 }} />
            {SESSION_BADGE[status].label}
          </span>
        )}
      </div>
      <div style={{
        padding:    `${S[4]}px ${S[5]}px`,
        display:    "flex",
        alignItems: "center",
        gap:        0,
        overflowX:  "auto" as const,
      }}>
        {LIFECYCLE_STEPS.map((step, i) => {
          const isPast    = !isTerminal && currentRank > step.rank;
          const isCurrent = !isTerminal && currentRank === step.rank;
          const isFuture  = !isTerminal && currentRank < step.rank;

          const dotColor = isCurrent
            ? C.blueDark
            : isPast
            ? C.green
            : C.inkGhost;

          const labelColor = isCurrent
            ? C.blueDark
            : isPast
            ? C.greenDark
            : C.inkFaint;

          const lineColor = isPast || isCurrent ? C.green : C.line;

          return (
            <div key={step.status} style={{ display: "flex", alignItems: "center", flex: i < LIFECYCLE_STEPS.length - 1 ? 1 : undefined }}>
              {/* Step */}
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, minWidth: 72 }}>
                {/* Circle */}
                <div style={{
                  width:        isCurrent ? 20 : 16,
                  height:       isCurrent ? 20 : 16,
                  borderRadius: R.pill,
                  background:   isCurrent ? C.blueDark : isPast ? C.green : C.line,
                  border:       isCurrent ? `3px solid ${C.blueLight}` : isPast ? `2px solid ${C.greenBorder}` : `2px solid ${C.inkGhost}`,
                  boxShadow:    isCurrent ? E.focus : "none",
                  flexShrink:   0,
                  transition:   "all 200ms",
                }} />
                {/* Label */}
                <span style={{
                  fontSize:   T.sz.xs,
                  fontFamily: T.sans,
                  fontWeight: isCurrent ? T.wt.semibold : T.wt.normal,
                  color:      labelColor,
                  whiteSpace: "nowrap" as const,
                  textAlign:  "center" as const,
                }}>
                  {step.label}
                </span>
              </div>
              {/* Connector line (except after last step) */}
              {i < LIFECYCLE_STEPS.length - 1 && (
                <div style={{
                  flex:        1,
                  height:      2,
                  background:  lineColor,
                  marginBottom: 16,
                  minWidth:    24,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricsRow({
  summary,
  runCount,
  status,
}: {
  summary:  ReconciliationSummarySnapshot | null;
  runCount: number;
  status:   ReconciliationSessionStatus;
}) {
  const metrics: Array<{
    label:   string;
    value:   string;
    sub?:    string;
    accent?: "green" | "amber" | "red" | "blue" | "neutral";
  }> = summary ? [
    {
      label:  "Match Rate",
      value:  fmtPct(summary.matchRate),
      sub:    `${fmtN(summary.matched)} de ${fmtN(summary.total)}`,
      accent: summary.matchRate >= 95 ? "green" : summary.matchRate >= 80 ? "amber" : "red",
    },
    {
      label:  "Total registros",
      value:  fmtN(summary.total),
      sub:    `A: ${fmtN(summary.total - summary.onlyInB)} · B: ${fmtN(summary.total - summary.onlyInA)}`,
      accent: "neutral",
    },
    {
      label:  "Excepciones",
      value:  fmtN(summary.mismatchAmount + summary.onlyInA + summary.onlyInB + summary.possibleDuplicates),
      sub:    `${fmtN(summary.onlyInA)} solo A · ${fmtN(summary.onlyInB)} solo B`,
      accent: (summary.mismatchAmount + summary.onlyInA + summary.onlyInB + summary.possibleDuplicates) === 0 ? "green" : "amber",
    },
    {
      label:  "Delta total",
      value:  fmtCOP(summary.deltaTotal),
      sub:    `A: ${fmtCOP(summary.totalAmountA)} · B: ${fmtCOP(summary.totalAmountB)}`,
      accent: Math.abs(summary.deltaTotal) < 1000 ? "green" : Math.abs(summary.deltaTotal) < 1_000_000 ? "amber" : "red",
    },
    {
      label:  "Ejecuciones",
      value:  String(runCount),
      sub:    status === "needs_review" ? "Requiere revisión" : status === "reconciled" ? "Conciliado" : undefined,
      accent: "blue",
    },
  ] : [
    { label: "Match Rate",       value: "—",  accent: "neutral" },
    { label: "Total registros",  value: "—",  accent: "neutral" },
    { label: "Excepciones",      value: "—",  accent: "neutral" },
    { label: "Delta total",      value: "—",  accent: "neutral" },
    { label: "Ejecuciones",      value: String(runCount), accent: "blue" },
  ];

  const accentColors = {
    green:   { bg: C.greenLight,  border: C.greenBorder,  text: C.greenDark   },
    amber:   { bg: C.amberLight,  border: C.amberBorder,  text: C.amberDark   },
    red:     { bg: C.redLight,    border: C.redBorder,    text: C.redDark     },
    blue:    { bg: C.blueLight,   border: C.blueBorder,   text: C.blueDark    },
    neutral: { bg: C.surface,     border: C.line,         text: C.inkMid      },
  };

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap:                 S[2],
      marginBottom:        S[4],
    }}>
      {metrics.map(m => {
        const ac = accentColors[m.accent ?? "neutral"];
        return (
          <div key={m.label} style={{
            ...panel,
            padding:     `${S[3]}px ${S[4]}px`,
            borderColor: ac.border,
            background:  ac.bg,
          }}>
            <div style={{ fontSize: T.sz.xs, fontFamily: T.sans, color: C.inkLight, fontWeight: T.wt.medium, marginBottom: 4, letterSpacing: "0.04em" }}>
              {m.label}
            </div>
            <div style={{
              fontSize:          T.sz["2xl"],
              fontFamily:        T.mono,
              fontWeight:        T.wt.semibold,
              color:             ac.text,
              fontVariantNumeric: "tabular-nums",
              lineHeight:        1.2,
            }}>
              {m.value}
            </div>
            {m.sub && (
              <div style={{ fontSize: T.sz.xs, fontFamily: T.mono, color: C.inkLight, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {m.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RunTimeline({ runs }: { runs: ReconciliationSessionRun[] }) {
  const cols = "48px 110px 1fr 90px 90px 120px";

  return (
    <WorkspaceSection title="Ejecuciones" subtitle={`${runs.length} ejecucion${runs.length !== 1 ? "es" : ""}`}>
      {runs.length === 0 ? (
        <div style={{ padding: `${S[5]}px ${S[4]}px`, fontSize: T.sz.base, color: C.inkLight, fontFamily: T.sans, textAlign: "center" as const }}>
          Sin ejecuciones registradas para esta sesión.
        </div>
      ) : (
        <div className="ag-op-table" style={{ gridTemplateColumns: cols }}>
          {/* Header */}
          <div className="ag-op-row" style={{ background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
            {["#", "Estado", "Período", "Duración", "Inicio", "Resumen"].map(h => (
              <div key={h} style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkLight, padding: `${S[2]}px ${S[3]}px`, fontFamily: T.sans, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {runs.map(run => {
            const badge   = RUN_BADGE[run.status];
            const summary = run.summaryJson;
            return (
              <div key={run.id} className="ag-op-row" style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
                {/* Run number */}
                <div style={{ padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight, fontVariantNumeric: "tabular-nums" }}>
                  #{run.runNumber}
                </div>

                {/* Status */}
                <div style={{ padding: `${S[2]}px ${S[3]}px` }}>
                  <span className={badge.cls}>{badge.label}</span>
                </div>

                {/* Period */}
                <div style={{ padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                  {fmtPeriodo(run.period)}
                </div>

                {/* Duration */}
                <div style={{ padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkLight, fontVariantNumeric: "tabular-nums" }}>
                  {fmtDuration(run.startedAt, run.completedAt)}
                </div>

                {/* Start time */}
                <div style={{ padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontVariantNumeric: "tabular-nums" }}>
                  {run.startedAt ? new Date(run.startedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </div>

                {/* Summary */}
                <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                  {summary ? (
                    <>
                      <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, background: summary.matchRate >= 95 ? C.greenLight : C.amberLight, color: summary.matchRate >= 95 ? C.greenDark : C.amberDark, padding: "2px 6px", borderRadius: R.sm, fontVariantNumeric: "tabular-nums" }}>
                        {fmtPct(summary.matchRate)} match
                      </span>
                      <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, background: C.surface, color: C.inkMid, padding: "2px 6px", borderRadius: R.sm, fontVariantNumeric: "tabular-nums" }}>
                        {fmtN(summary.total)} reg
                      </span>
                    </>
                  ) : run.status === "failed" && run.errorJson ? (
                    <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, color: C.red, fontVariantNumeric: "tabular-nums" }}>
                      {String((run.errorJson as Record<string,unknown>).message ?? "Error desconocido").slice(0, 40)}
                    </span>
                  ) : (
                    <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceSection>
  );
}

function AssignmentPanel({ session }: { session: ReconciliationSession }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Operador asignado", value: session.assignedTo ?? "Sin asignar"         },
    { label: "Creado por",        value: session.createdBy  ?? "Sistema"             },
    { label: "Código",            value: session.sessionCode                          },
    { label: "Período",           value: fmtPeriodo(session.period)                  },
    { label: "Fuente A",          value: session.sourceALabel                        },
    { label: "Fuente B",          value: session.sourceBLabel                        },
    { label: "Iniciado",          value: fmtDate(session.startedAt)                  },
    { label: "Completado",        value: fmtDate(session.completedAt)                },
    { label: "Cerrado",           value: fmtDate(session.closedAt)                   },
    { label: "Creado",            value: fmtDate(session.createdAt)                  },
    { label: "Actualizado",       value: fmtDate(session.updatedAt)                  },
  ];

  return (
    <WorkspaceSection title="Información de sesión">
      <div>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            ...dataRow,
            borderBottom: i < rows.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: T.sz.xs, color: C.inkLight, fontFamily: T.sans, fontWeight: T.wt.medium }}>
              {r.label}
            </span>
            <span style={{
              fontSize:   T.sz.base,
              fontFamily: r.label === "Operador asignado" || r.label === "Creado por" ? T.sans : T.mono,
              color:      r.value === "Sin asignar" ? C.inkFaint : C.inkMid,
              fontVariantNumeric: "tabular-nums",
            }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </WorkspaceSection>
  );
}

function AuditTrailPanel({ events }: { events: ReconciliationAuditEvent[] }) {
  return (
    <WorkspaceSection
      title="Auditoría"
      subtitle={`${events.length} event${events.length !== 1 ? "os" : "o"}`}
    >
      {events.length === 0 ? (
        <div style={{ padding: `${S[5]}px ${S[4]}px`, fontSize: T.sz.base, color: C.inkLight, fontFamily: T.sans, textAlign: "center" as const }}>
          Sin eventos registrados.
        </div>
      ) : (
        <div style={{ padding: `${S[3]}px ${S[4]}px`, position: "relative" as const }}>
          {/* Vertical timeline line */}
          <div style={{
            position:   "absolute",
            top:        0,
            bottom:     0,
            left:       S[4] + 11,  // center of actor dot
            width:      1,
            background: C.line,
            zIndex:     0,
          }} />

          {events.map((ev, i) => {
            const actor     = ACTOR_DOT[ev.actorType] ?? ACTOR_DOT.system;
            const typeBadge = EVENT_TYPE_BADGE[ev.eventType] ?? { cls: "ag-op-status ag-op-status--info", label: ev.eventType };
            const isLast    = i === events.length - 1;

            return (
              <div key={ev.id} style={{
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[3],
                position:     "relative" as const,
                zIndex:       1,
                marginBottom: isLast ? 0 : S[3],
              }}>
                {/* Actor dot */}
                <div style={{
                  width:           22,
                  height:          22,
                  borderRadius:    R.pill,
                  background:      actor.color,
                  color:           C.white,
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  fontSize:        T.sz["2xs"],
                  fontFamily:      T.sans,
                  fontWeight:      T.wt.bold,
                  flexShrink:      0,
                  border:          `2px solid ${C.white}`,
                  boxShadow:       E.xs,
                }}>
                  {actor.initial}
                </div>

                {/* Content */}
                <div style={{
                  flex:         1,
                  background:   C.white,
                  border:       `1px solid ${C.line}`,
                  borderRadius: R.md,
                  padding:      `${S[2]}px ${S[3]}px`,
                  boxShadow:    E.xs,
                  minWidth:     0,
                }}>
                  {/* Top row: badge + timestamp */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: S[2] }}>
                    <span className={typeBadge.cls} style={{ fontSize: T.sz["2xs"] }}>
                      {typeBadge.label}
                    </span>
                    <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, color: C.inkFaint, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const }}>
                      {fmtTs(ev.createdAt)}
                    </span>
                  </div>

                  {/* Message */}
                  <div style={{ fontSize: T.sz.base, fontFamily: T.sans, color: C.inkMid, lineHeight: 1.4 }}>
                    {ev.message}
                  </div>

                  {/* Actor ID (when present + not system) */}
                  {ev.actorId && ev.actorType !== "system" && (
                    <div style={{ marginTop: 3, fontSize: T.sz.xs, fontFamily: T.mono, color: C.inkLight }}>
                      {ev.actorType === "user" ? "Usuario" : "Agente"}: {ev.actorId}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceSection>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SessionDetailClient({ orgSlug, session, runs, events, exceptions, resolutionMap }: Props) {
  const badge = SESSION_BADGE[session.status];

  return (
    <div style={{
      minHeight:   "100vh",
      background:  C.surface,
      fontFamily:  T.sans,
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: `${S[4]}px ${S[4]}px ${S[10]}px` }}>

        {/* ── Session Header ── */}
        <div style={{ marginBottom: S[4] }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[3] }}>
            <Link href={`/${orgSlug}/reconciliation`} style={{
              fontSize:   T.sz.xs,
              fontFamily: T.sans,
              color:      C.blue,
              textDecoration: "none",
              display:    "flex",
              alignItems: "center",
              gap:        4,
            }}>
              <span style={{ fontSize: T.sz.base }}>←</span>
              Conciliación
            </Link>
            <span style={{ color: C.inkGhost, fontSize: T.sz.base }}>/</span>
            <span style={{ fontSize: T.sz.xs, color: C.inkLight, fontFamily: T.mono }}>
              {session.sessionCode}
            </span>
          </div>

          {/* Title row */}
          <div style={{
            ...panel,
            padding: `${S[4]}px ${S[5]}px`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[4], flexWrap: "wrap" as const }}>

              {/* Left: code + title */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                  <span style={{
                    fontSize:   T.sz.base,
                    fontFamily: T.mono,
                    fontWeight: T.wt.semibold,
                    color:      C.blueDark,
                    background: C.blueLight,
                    border:     `1px solid ${C.blueBorder}`,
                    borderRadius: R.sm,
                    padding:    "2px 8px",
                    letterSpacing: "0.04em",
                  }}>
                    {session.sessionCode}
                  </span>
                  <span className={badge.cls}>
                    <span style={{ width: 6, height: 6, borderRadius: R.pill, background: badge.dot, display: "inline-block", marginRight: 5, flexShrink: 0 }} />
                    {badge.label}
                  </span>
                </div>
                <h1 style={{
                  fontSize:   T.sz.xl,
                  fontWeight: T.wt.semibold,
                  color:      C.ink,
                  margin:     0,
                  lineHeight: 1.3,
                }}>
                  {session.title}
                </h1>
              </div>

              {/* Right: timestamps */}
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight, fontFamily: T.mono, fontVariantNumeric: "tabular-nums" }}>
                  Creada {fmtDate(session.createdAt)}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight, fontFamily: T.mono, fontVariantNumeric: "tabular-nums" }}>
                  Actualizada {fmtDate(session.updatedAt)}
                </div>
              </div>
            </div>

            {/* Source bar */}
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          S[2],
              marginTop:    S[3],
              paddingTop:   S[3],
              borderTop:    `1px solid ${C.lineSubtle}`,
              flexWrap:     "wrap" as const,
            }}>
              <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "2px 8px", color: C.inkMid }}>
                {session.sourceALabel}
              </span>
              <span style={{ color: C.inkGhost, fontSize: T.sz.xl, fontWeight: T.wt.bold }}>↔</span>
              <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "2px 8px", color: C.inkMid }}>
                {session.sourceBLabel}
              </span>
              {session.period && (
                <>
                  <span style={{ color: C.inkGhost }}>·</span>
                  <span style={{ fontSize: T.sz.xs, fontFamily: T.mono, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPeriodo(session.period)}
                  </span>
                </>
              )}
              {session.assignedTo && (
                <>
                  <span style={{ color: C.inkGhost }}>·</span>
                  <span style={{ fontSize: T.sz.xs, fontFamily: T.sans, color: C.inkMid }}>
                    Asignado: {session.assignedTo}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Lifecycle Bar ── */}
        <LifecycleBar status={session.status} />

        {/* ── Metrics Row ── */}
        <MetricsRow
          summary={session.summaryJson}
          runCount={runs.length}
          status={session.status}
        />

        {/* ── Two-column: Run Timeline + Assignment Panel ── */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 280px",
          gap:                 S[4],
          alignItems:          "start",
          marginBottom:        S[4],
        }}>
          <RunTimeline runs={runs} />
          <AssignmentPanel session={session} />
        </div>

        {/* ── Exception Workbench ── */}
        <div style={{ marginTop: S[4] }}>
          <ExceptionWorkbench
            exceptions={exceptions}
            sourceALabel={session.sourceALabel}
            sourceBLabel={session.sourceBLabel}
            runAt={session.completedAt ?? session.updatedAt}
            orgSlug={orgSlug}
            sessionId={session.id}
            initialResolutions={resolutionMap}
          />
        </div>

        {/* ── Audit Trail ── */}
        <AuditTrailPanel events={events} />

      </div>
    </div>
  );
}
