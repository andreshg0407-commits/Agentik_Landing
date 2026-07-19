/**
 * /[orgSlug]/copilot/approval-center
 *
 * Agentik Approval Center — Agent Action Runtime Control
 *
 * Mission Control for multiagent actions. Humans observe, decide, and control.
 * Agents propose. Humans approve. Runtime executes.
 *
 * ACCESS: SUPER_ADMIN / AGENTIK_ADMIN only.
 *
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

"use client";

import { useParams }             from "next/navigation";
import { useState, useEffect }   from "react";
import { C, T, S, R }           from "@/lib/ui/tokens";
import { useAgentRuntime }       from "@/hooks/use-agent-runtime";
import { RuntimeKpis }           from "@/components/runtime/runtime-kpis";
import { ApprovalQueueTable }    from "@/components/runtime/approval-queue-table";
import { RuntimeTimeline }       from "@/components/runtime/runtime-timeline";
import { RuntimeAgentLoad }      from "@/components/runtime/runtime-agent-load";
import type { RuntimeIntelligenceReport, RuntimeInsight, RuntimeBlocker, CoordinationRecommendation } from "@/lib/agent-intelligence/runtime-intelligence-types";
import type { AgentDelegation, DelegationReport } from "@/lib/agent-orchestration/delegation-types";
import type { OperationalPlan, PlansReport, PlanConflict } from "@/lib/agent-planning/planning-types";
import type { EventTimelineEntry, EventStoreDiagnostics } from "@/lib/agent-runtime/event-store-types";
import type { ExecutionSession, ExecutionDiagnostics } from "@/lib/agent-runtime/execution-lifecycle-types";

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, meta }: { label: string; meta?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: S[3], marginBottom: S[3] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, letterSpacing: "0.02em" }}>
        {label}
      </span>
      {meta && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ orgSlug, onRefresh, loading, lastFetchAt }: {
  orgSlug:     string;
  onRefresh:   () => void;
  loading:     boolean;
  lastFetchAt: string | null;
}) {
  function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  return (
    <div style={{
      background:   "linear-gradient(160deg, #001535 0%, #002460 60%, #002E7A 100%)",
      borderRadius: R.xl,
      padding:      `${S[5]}px ${S[6]}px`,
      marginBottom: S[5],
      boxShadow:    "0 4px 20px rgba(0,18,60,.14), inset 0 1px 0 rgba(255,255,255,.05)",
      display:      "flex",
      alignItems:   "center",
      justifyContent: "space-between",
      gap:          S[4],
    }}>
      <div>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.36)", letterSpacing: "0.06em" }}>
            {orgSlug}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.24)" }}>›</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.36)", letterSpacing: "0.06em" }}>
            AGENTIK
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.24)" }}>›</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.60)", letterSpacing: "0.06em" }}>
            APPROVAL CENTER
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily:  T.mono,
          fontSize:    T.sz["2xl"],
          fontWeight:  T.wt.bold,
          color:       "rgba(235,238,246,.94)",
          margin:      0,
          letterSpacing: "-0.01em",
          lineHeight:  1.1,
        }}>
          Approval Center
        </h1>
        <p style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       "rgba(235,238,246,.48)",
          margin:      `${S[1]}px 0 0`,
        }}>
          Control de aprobaciones multiagente · Agentes proponen · Humanos deciden · Runtime ejecuta
        </p>
      </div>

      {/* Runtime status + refresh */}
      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: S[2] }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          background:   "rgba(255,255,255,.06)",
          border:       "1px solid rgba(255,255,255,.10)",
          borderRadius: R.lg,
          padding:      `${S[1]}px ${S[3]}px`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: loading ? C.amber : C.green,
            boxShadow: `0 0 6px ${loading ? C.amber : C.green}`,
          }} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.60)" }}>
            {loading ? "Actualizando…" : `Runtime activo`}
          </span>
        </div>
        {lastFetchAt && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: "rgba(235,238,246,.28)" }}>
            Última sync: {fmtTime(lastFetchAt)}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        "rgba(235,238,246,.75)",
            background:   "rgba(255,255,255,.08)",
            border:       "1px solid rgba(255,255,255,.14)",
            borderRadius: R.sm,
            padding:      `${S[1]}px ${S[3]}px`,
            cursor:       loading ? "not-allowed" : "pointer",
            opacity:      loading ? 0.5 : 1,
          }}
        >
          ↻ Actualizar
        </button>
      </div>
    </div>
  );
}

// ── Intelligence hook ─────────────────────────────────────────────────────────

function useRuntimeIntelligence(orgSlug: string) {
  const [report, setReport]   = useState<RuntimeIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/agent/runtime/intelligence`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setReport(j as RuntimeIntelligenceReport); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [orgSlug]);

  return { report, loading };
}

// ── Severity chip ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "rgba(220,38,38,.12)",  fg: "#dc2626" },
  high:     { bg: "rgba(234,88,12,.12)",  fg: "#ea580c" },
  medium:   { bg: "rgba(202,138,4,.10)",  fg: "#ca8a04" },
  low:      { bg: "rgba(22,163,74,.10)",  fg: "#16a34a" },
  info:     { bg: "rgba(99,102,241,.10)", fg: "#6366f1" },
};

function SeverityChip({ severity }: { severity: string }) {
  const { bg, fg } = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info!;
  return (
    <span style={{
      fontFamily:   T.mono,
      fontSize:     9,
      fontWeight:   T.wt.semibold,
      letterSpacing: "0.06em",
      color:        fg,
      background:   bg,
      borderRadius: R.pill,
      padding:      "2px 7px",
      textTransform: "uppercase" as const,
    }}>
      {severity}
    </span>
  );
}

// ── Runtime Intelligence section ──────────────────────────────────────────────

function InsightCard({ insight }: { insight: RuntimeInsight }) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.lg,
      padding:      `${S[3]}px ${S[4]}px`,
      display:      "flex",
      flexDirection: "column" as const,
      gap:          S[2],
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
          {insight.title}
        </span>
        <SeverityChip severity={insight.severity} />
      </div>
      <p style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, margin: 0, lineHeight: 1.5 }}>
        {insight.summary}
      </p>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark, borderTop: `1px solid ${C.line}`, paddingTop: S[1] }}>
        → {insight.recommendedNextStep}
      </div>
    </div>
  );
}

function BlockerRow({ blocker }: { blocker: RuntimeBlocker }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[2]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <SeverityChip severity={blocker.severity} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, marginBottom: 2 }}>
          {blocker.reason}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          {blocker.suggestedResolution}
        </div>
      </div>
      {blocker.moduleId && (
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, whiteSpace: "nowrap" as const }}>
          {blocker.moduleId}
        </span>
      )}
    </div>
  );
}

function CoordRow({ rec }: { rec: CoordinationRecommendation }) {
  const AGENT_LABELS: Record<string, string> = {
    david_commercial: "David", diego_finance: "Diego",
    luca_marketing:   "Luca",  mila_collections: "Mila",
  };
  const src = AGENT_LABELS[rec.sourceAgentId] ?? rec.sourceAgentId;
  const tgt = AGENT_LABELS[rec.targetAgentId] ?? rec.targetAgentId;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[2]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        fontWeight:   T.wt.semibold,
        color:        C.blueDark,
        whiteSpace:   "nowrap" as const,
        minWidth:     80,
      }}>
        {src} → {tgt}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, marginBottom: 2 }}>
          {rec.recommendedAction}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          {rec.requiresHumanApproval ? "Requiere aprobación humana" : "Sin aprobación requerida"}
        </div>
      </div>
      <SeverityChip severity={rec.priority} />
    </div>
  );
}

function RuntimeIntelligenceSection({ orgSlug }: { orgSlug: string }) {
  const { report, loading } = useRuntimeIntelligence(orgSlug);

  if (loading) {
    return (
      <div style={{
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.xl,
        padding:      `${S[4]}px ${S[5]}px`,
        marginBottom: S[5],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Analizando runtime…
        </div>
      </div>
    );
  }

  if (!report) return null;

  const topInsights    = report.insights.slice(0, 3);
  const topBlockers    = report.blockers.slice(0, 4);
  const topCoord       = report.coordinationRecommendations.slice(0, 3);
  const { summary }    = report;

  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px ${S[5]}px`,
      marginBottom: S[5],
    }}>
      {/* Section title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4] }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Runtime Intelligence
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Interpretación determinística del estado operacional multiagente
          </div>
        </div>
        <div style={{ display: "flex", gap: S[3] }}>
          {[
            { label: "insights",     value: summary.insightCount,      urgent: summary.criticalInsightCount > 0 },
            { label: "bloqueos",     value: summary.blockerCount,       urgent: summary.blockerCount > 0 },
            { label: "coordinación", value: summary.coordinationCount,  urgent: false },
          ].map(({ label, value, urgent }) => (
            <div key={label} style={{ textAlign: "center" as const }}>
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.lg,
                fontWeight:  T.wt.bold,
                color:       urgent ? "#dc2626" : C.blueDark,
                lineHeight:  1,
              }}>
                {value}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display:      "flex",
        gap:          S[4],
        background:   C.surfaceAlt,
        borderRadius: R.lg,
        padding:      `${S[2]}px ${S[4]}px`,
        marginBottom: S[4],
        flexWrap:     "wrap" as const,
      }}>
        {[
          { k: "módulo bajo mayor presión", v: summary.mostPressuredModule ?? "—" },
          { k: "agente más activo",         v: summary.mostActiveAgent ?? "—" },
          { k: "propuestas sin resolver",   v: summary.staleActionCount },
          { k: "patrones detectados",       v: summary.patternsDetected },
          { k: "cadenas huérfanas",         v: summary.orphanChains },
        ].map(({ k, v }) => (
          <div key={k}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{k}: </span>
            <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.ink }}>{String(v)}</span>
          </div>
        ))}
      </div>

      {/* 3-column grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 S[4],
        alignItems:          "start",
      }}>
        {/* Top insights */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            TOP INSIGHTS
          </div>
          {topInsights.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin insights activos.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {topInsights.map(i => <InsightCard key={i.id} insight={i} />)}
            </div>
          )}
        </div>

        {/* Blockers */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            BLOQUEOS DETECTADOS
          </div>
          {topBlockers.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin bloqueos activos.</div>
          ) : (
            <div>
              {topBlockers.map(b => <BlockerRow key={b.id} blocker={b} />)}
            </div>
          )}
        </div>

        {/* Coordination */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            COORDINACIÓN SUGERIDA
          </div>
          {topCoord.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin coordinación requerida.</div>
          ) : (
            <div>
              {topCoord.map(r => <CoordRow key={r.id} rec={r} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delegation section ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  proposed:         { bg: "rgba(99,102,241,.10)",  fg: "#6366f1" },
  pending_approval: { bg: "rgba(202,138,4,.10)",   fg: "#ca8a04" },
  approved:         { bg: "rgba(22,163,74,.10)",   fg: "#16a34a" },
  accepted:         { bg: "rgba(22,163,74,.12)",   fg: "#16a34a" },
  in_progress:      { bg: "rgba(59,130,246,.10)",  fg: "#3b82f6" },
  completed:        { bg: "rgba(16,185,129,.10)",  fg: "#10b981" },
  rejected:         { bg: "rgba(220,38,38,.10)",   fg: "#dc2626" },
  failed:           { bg: "rgba(220,38,38,.12)",   fg: "#dc2626" },
  canceled:         { bg: "rgba(107,114,128,.10)", fg: "#6b7280" },
  expired:          { bg: "rgba(107,114,128,.08)", fg: "#9ca3af" },
  blocked:          { bg: "rgba(234,88,12,.10)",   fg: "#ea580c" },
};

const AGENT_SHORT: Record<string, string> = {
  david_commercial: "David", diego_finance: "Diego",
  luca_marketing: "Luca", mila_collections: "Mila",
};
function shortAgent(id: string): string { return AGENT_SHORT[id] ?? id; }

const REASON_LABEL: Record<string, string> = {
  financial_impact_review:  "Impacto financiero",
  inventory_risk_review:    "Riesgo de inventario",
  campaign_pause_review:    "Pausa de campaña",
  collection_risk_review:   "Riesgo de cobranza",
  production_dependency:    "Dependencia producción",
  data_quality_review:      "Calidad de datos",
  cross_module_dependency:  "Dependencia módulos",
  executive_escalation:     "Escalación ejecutiva",
};

function StatusBadge({ status }: { status: string }) {
  const { bg, fg } = STATUS_COLORS[status] ?? STATUS_COLORS.proposed!;
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
      letterSpacing: "0.05em", color: fg, background: bg,
      borderRadius: R.pill, padding: "2px 7px", textTransform: "uppercase" as const,
      whiteSpace: "nowrap" as const,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DelegationRow({
  delegation, orgSlug, onUpdate,
}: { delegation: AgentDelegation; orgSlug: string; onUpdate: (d: AgentDelegation) => void }) {
  const [busy, setBusy] = useState(false);
  const base = `/api/orgs/${orgSlug}/agent/runtime/delegations/${delegation.id}`;

  async function act(endpoint: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`${base}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.ok) {
        const j = await r.json() as { delegation: AgentDelegation };
        onUpdate(j.delegation);
      }
    } finally {
      setBusy(false);
    }
  }

  const canApprove  = delegation.status === "pending_approval";
  const canReject   = delegation.status === "pending_approval" || delegation.status === "proposed";
  const canAccept   = delegation.status === "approved";
  const canComplete = delegation.status === "in_progress";

  return (
    <div style={{
      display:      "grid",
      gridTemplateColumns: "160px 1fr 120px 120px",
      gap:          S[3],
      alignItems:   "center",
      padding:      `${S[2]}px ${S[3]}px`,
      borderBottom: `1px solid ${C.line}`,
      background:   delegation.status === "blocked" ? "rgba(234,88,12,.03)" : "transparent",
    }}>
      {/* Agents */}
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.blueDark }}>
          {shortAgent(delegation.sourceAgentId)} → {shortAgent(delegation.targetAgentId)}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
          {REASON_LABEL[delegation.reason] ?? delegation.reason}
        </div>
      </div>

      {/* Context */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.4 }}>
        {delegation.contextSummary.slice(0, 120)}{delegation.contextSummary.length > 120 ? "…" : ""}
      </div>

      {/* Status + priority */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, alignItems: "flex-start" }}>
        <StatusBadge status={delegation.status} />
        <SeverityChip severity={delegation.priority} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
        {canApprove && (
          <button disabled={busy} onClick={() => act("approve")} style={{
            fontFamily: T.mono, fontSize: 9, color: "#fff",
            background: C.blueDark, border: "none",
            borderRadius: R.sm, padding: "3px 8px", cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}>Aprobar</button>
        )}
        {canAccept && (
          <button disabled={busy} onClick={() => act("accept")} style={{
            fontFamily: T.mono, fontSize: 9, color: "#fff",
            background: "#16a34a", border: "none",
            borderRadius: R.sm, padding: "3px 8px", cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}>Aceptar</button>
        )}
        {canComplete && (
          <button disabled={busy} onClick={() => act("complete", { resolutionSummary: "Completado manualmente" })} style={{
            fontFamily: T.mono, fontSize: 9, color: "#fff",
            background: "#10b981", border: "none",
            borderRadius: R.sm, padding: "3px 8px", cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}>Completar</button>
        )}
        {canReject && (
          <button disabled={busy} onClick={() => act("reject")} style={{
            fontFamily: T.mono, fontSize: 9, color: C.inkMid,
            background: "transparent", border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: "3px 8px", cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}>Rechazar</button>
        )}
      </div>
    </div>
  );
}

function DelegationsSection({ orgSlug }: { orgSlug: string }) {
  const [report, setReport]   = useState<DelegationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal]     = useState<AgentDelegation[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/agent/runtime/delegations`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) {
          setReport(j as DelegationReport);
          setLocal((j as DelegationReport).delegations);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [orgSlug]);

  function handleUpdate(updated: AgentDelegation) {
    setLocal(prev => prev.map(d => d.id === updated.id ? updated : d));
  }

  if (loading) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[4]}px 0` }}>
        Cargando delegaciones…
      </div>
    );
  }
  if (!report || local.length === 0) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.xl,
        padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin delegaciones activas. El motor de delegación se activará cuando haya suficiente presión operacional.
        </div>
      </div>
    );
  }

  const { summary } = report;
  const displayDelegations = local.slice(0, 10);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.xl,
      padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[3] }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Delegaciones Multiagente
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Coordinación controlada y trazable entre agentes
          </div>
        </div>
        <div style={{ display: "flex", gap: S[4] }}>
          {([
            { label: "total",       v: summary.total,     urgent: false },
            { label: "pendientes",  v: summary.pending,   urgent: false },
            { label: "bloqueadas",  v: summary.blocked,   urgent: summary.blocked > 0 },
            { label: "completadas", v: summary.completed, urgent: false },
          ] as const).map(({ label, v, urgent }) => (
            <div key={label} style={{ textAlign: "center" as const }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                color: urgent ? "#ea580c" : C.ink, lineHeight: 1,
              }}>{v}</div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "160px 1fr 120px 120px",
        gap: S[3], padding: `${S[1]}px ${S[3]}px`, marginBottom: S[1],
      }}>
        {["AGENTES", "CONTEXTO", "ESTADO", "ACCIÓN"].map(h => (
          <div key={h} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em" }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {displayDelegations.map(d => (
        <DelegationRow key={d.id} delegation={d} orgSlug={orgSlug} onUpdate={handleUpdate} />
      ))}

      {local.length > 10 && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[2]}px ${S[3]}px` }}>
          +{local.length - 10} delegaciones adicionales
        </div>
      )}
    </div>
  );
}

// ── Operational Plans section ─────────────────────────────────────────────────

interface PlansApiResponse extends PlansReport {
  readiness: {
    total:             number;
    ready:             number;
    waitingApproval:   number;
    waitingDelegation: number;
    blocked:           number;
    failedDependency:  number;
  };
  graph: {
    totalNodes:     number;
    rootNodes:      number;
    leafNodes:      number;
    cyclesDetected: number;
    orphanNodes:    number;
  };
}

function usePlansReport(orgSlug: string) {
  const [data, setData]       = useState<PlansApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/agent/runtime/plans`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setData(j as PlansApiResponse); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [orgSlug]);

  return { data, loading };
}

const PLAN_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  ready:           { bg: "rgba(22,163,74,.10)",   fg: "#16a34a" },
  partially_ready: { bg: "rgba(59,130,246,.10)",  fg: "#3b82f6" },
  blocked:         { bg: "rgba(234,88,12,.12)",   fg: "#ea580c" },
  waiting_approval:{ bg: "rgba(202,138,4,.10)",   fg: "#ca8a04" },
  executing:       { bg: "rgba(99,102,241,.10)",  fg: "#6366f1" },
  completed:       { bg: "rgba(16,185,129,.10)",  fg: "#10b981" },
  failed:          { bg: "rgba(220,38,38,.12)",   fg: "#dc2626" },
  draft:           { bg: "rgba(107,114,128,.08)", fg: "#9ca3af" },
  canceled:        { bg: "rgba(107,114,128,.06)", fg: "#9ca3af" },
};

function PlanStatusBadge({ status }: { status: string }) {
  const { bg, fg } = PLAN_STATUS_COLORS[status] ?? PLAN_STATUS_COLORS.draft!;
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
      letterSpacing: "0.05em", color: fg, background: bg,
      borderRadius: R.pill, padding: "2px 7px",
      textTransform: "uppercase" as const, whiteSpace: "nowrap" as const,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ConflictChip({ conflict }: { conflict: PlanConflict }) {
  const { bg, fg } = SEVERITY_COLORS[conflict.severity] ?? SEVERITY_COLORS.info!;
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 9, color: fg, background: bg,
      borderRadius: R.sm, padding: "3px 8px", marginBottom: 4,
    }}>
      ⚠ {conflict.description.slice(0, 80)}{conflict.description.length > 80 ? "…" : ""}
    </div>
  );
}

function PlanCard({ plan }: { plan: OperationalPlan }) {
  const readySteps    = plan.steps.filter(s => s.readiness === "ready").length;
  const blockedSteps  = plan.steps.filter(s => s.readiness === "blocked" || s.readiness === "waiting_delegation").length;
  const hasConflicts  = plan.conflicts.length > 0;

  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${hasConflicts ? "rgba(234,88,12,.3)" : C.line}`,
      borderRadius: R.lg,
      padding:      `${S[3]}px ${S[4]}px`,
    }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2], marginBottom: S[2] }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: 2 }}>
            {plan.title}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, lineHeight: 1.4 }}>
            {plan.summary.slice(0, 100)}{plan.summary.length > 100 ? "…" : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4 }}>
          <PlanStatusBadge status={plan.status} />
          <SeverityChip severity={plan.priority} />
        </div>
      </div>

      {/* Steps strip */}
      <div style={{
        display:      "flex",
        gap:          S[2],
        marginBottom: S[2],
        flexWrap:     "wrap" as const,
      }}>
        {plan.steps.map(step => (
          <div key={step.id} style={{
            fontFamily:   T.mono,
            fontSize:     9,
            color:        step.readiness === "ready" ? "#16a34a" : step.readiness === "blocked" ? "#ea580c" : C.inkFaint,
            background:   step.readiness === "ready" ? "rgba(22,163,74,.08)" : step.readiness === "blocked" ? "rgba(234,88,12,.08)" : C.surfaceAlt,
            borderRadius: R.sm,
            padding:      "2px 7px",
          }}>
            {step.title.slice(0, 35)}{step.title.length > 35 ? "…" : ""}
          </div>
        ))}
      </div>

      {/* Metrics row */}
      <div style={{ display: "flex", gap: S[4], alignItems: "center", flexWrap: "wrap" as const }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          {readySteps}/{plan.steps.length} pasos listos
          {blockedSteps > 0 && ` · ${blockedSteps} bloqueados`}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          confianza: {Math.round(plan.confidence * 100)}%
        </span>
        {plan.agentsInvolved.length > 0 && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark }}>
            {plan.agentsInvolved.map(a => ({ david_commercial: "David", diego_finance: "Diego", luca_marketing: "Luca", mila_collections: "Mila", agentik_copilot: "Copilot" }[a] ?? a)).join(" · ")}
          </span>
        )}
      </div>

      {/* Next step */}
      {plan.recommendedNextStep && (
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark, borderTop: `1px solid ${C.line}`, marginTop: S[2], paddingTop: S[1] }}>
          → {plan.recommendedNextStep}
        </div>
      )}

      {/* Conflicts */}
      {hasConflicts && (
        <div style={{ marginTop: S[2] }}>
          {plan.conflicts.slice(0, 2).map(c => <ConflictChip key={c.id} conflict={c} />)}
        </div>
      )}
    </div>
  );
}

function OperationalPlansSection({ orgSlug }: { orgSlug: string }) {
  const { data, loading } = usePlansReport(orgSlug);

  if (loading) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.xl, padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Construyendo planes operacionales…
        </div>
      </div>
    );
  }

  if (!data || data.plans.length === 0) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.xl, padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
          Planes Operacionales
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin planes activos. El motor de planificación se activará cuando haya acciones y delegaciones pendientes.
        </div>
      </div>
    );
  }

  const { summary, readiness, graph } = data;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.xl, padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4] }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Planes Operacionales
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Dependencias, bloqueos y coordinación multiagente — determinístico
          </div>
        </div>
        <div style={{ display: "flex", gap: S[4] }}>
          {[
            { label: "planes",    v: summary.totalPlans,    urgent: false },
            { label: "listos",    v: summary.readyPlans,    urgent: false },
            { label: "bloqueados",v: summary.blockedPlans,  urgent: summary.blockedPlans > 0 },
            { label: "conflictos",v: summary.conflictsDetected, urgent: summary.conflictsDetected > 0 },
          ].map(({ label, v, urgent }) => (
            <div key={label} style={{ textAlign: "center" as const }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                color: urgent ? "#ea580c" : C.blueDark, lineHeight: 1,
              }}>{v}</div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Readiness + graph summary strip */}
      <div style={{
        display: "flex", gap: S[5], background: C.surfaceAlt,
        borderRadius: R.lg, padding: `${S[2]}px ${S[4]}px`, marginBottom: S[4],
        flexWrap: "wrap" as const,
      }}>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>acciones listas: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: "#16a34a" }}>{readiness.ready}</span>
        </div>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>esperando aprobación: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.ink }}>{readiness.waitingApproval}</span>
        </div>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>esperando delegación: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.ink }}>{readiness.waitingDelegation}</span>
        </div>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>bloqueadas: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: readiness.blocked > 0 ? "#ea580c" : C.ink }}>{readiness.blocked}</span>
        </div>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>ciclos: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: graph.cyclesDetected > 0 ? "#dc2626" : C.ink }}>{graph.cyclesDetected}</span>
        </div>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>nodos grafo: </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.ink }}>{graph.totalNodes}</span>
        </div>
      </div>

      {/* Plan cards */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
        {data.plans.slice(0, 6).map(plan => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
        {data.plans.length > 6 && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            +{data.plans.length - 6} planes adicionales
          </div>
        )}
      </div>
    </div>
  );
}

// ── Runtime Event Stream ──────────────────────────────────────────────────────

const EVENT_CATEGORY_COLORS: Record<string, string> = {
  action:       "#3b82f6",
  delegation:   "#8b5cf6",
  plan:         "#06b6d4",
  memory:       "#10b981",
  intelligence: "#f59e0b",
  tool:         "#6b7280",
  workflow:     "#ec4899",
  system:       "#9ca3af",
};

const EVENT_SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning:  "#ea580c",
  notice:   "#2563eb",
  info:     "#6b7280",
  debug:    "#9ca3af",
};

function EventStreamRow({ entry }: { entry: EventTimelineEntry }) {
  const catColor = EVENT_CATEGORY_COLORS[entry.category] ?? "#6b7280";
  const sevColor = EVENT_SEVERITY_COLORS[entry.severity] ?? "#6b7280";

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  return (
    <div style={{
      display:      "grid",
      gridTemplateColumns: "60px 80px 1fr 80px 80px",
      gap:          S[3],
      alignItems:   "center",
      padding:      `${S[1]}px ${S[3]}px`,
      borderBottom: `1px solid ${C.line}`,
      fontFamily:   T.mono,
    }}>
      {/* Time */}
      <span style={{ fontSize: 9, color: C.inkFaint, whiteSpace: "nowrap" as const }}>
        {fmtTime(entry.occurredAt)}
      </span>

      {/* Category badge */}
      <span style={{
        fontSize: 9, fontWeight: T.wt.semibold, letterSpacing: "0.04em",
        color: catColor, background: `${catColor}18`,
        borderRadius: R.sm, padding: "2px 6px", textAlign: "center" as const,
      }}>
        {entry.category.toUpperCase()}
      </span>

      {/* Summary */}
      <span style={{ fontSize: T.sz["2xs"], color: C.ink, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {entry.summary}
      </span>

      {/* Agent */}
      <span style={{ fontSize: 9, color: C.blueDark, whiteSpace: "nowrap" as const }}>
        {entry.agentId ? (
          { david_commercial: "David", diego_finance: "Diego", luca_marketing: "Luca", mila_collections: "Mila", agentik_copilot: "Copilot", system: "System" }[entry.agentId] ?? entry.agentId
        ) : "—"}
      </span>

      {/* Severity */}
      <span style={{
        fontSize: 9, fontWeight: T.wt.semibold, letterSpacing: "0.04em",
        color: sevColor, whiteSpace: "nowrap" as const,
      }}>
        {entry.severity}
      </span>
    </div>
  );
}

function useRuntimeEvents(orgSlug: string) {
  const [entries, setEntries] = useState<EventTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ totalEvents: number; byCategory: Record<string, number> } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/agent/runtime/events?limit=30`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) {
          setEntries((j as { timeline: { entries: EventTimelineEntry[] } }).timeline.entries ?? []);
          setSummary((j as { summary: { totalEvents: number; byCategory: Record<string, number> } }).summary ?? null);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [orgSlug]);

  return { entries, loading, summary };
}

function RuntimeEventStream({ orgSlug }: { orgSlug: string }) {
  const { entries, loading, summary } = useRuntimeEvents(orgSlug);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.xl, padding: `${S[4]}px ${S[5]}px`, marginBottom: S[5],
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[3] }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Runtime Event Stream
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Trazabilidad persistente del runtime multiagente · Event Store V1
          </div>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: S[4] }}>
            <div style={{ textAlign: "center" as const }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.blueDark, lineHeight: 1 }}>
                {summary.totalEvents}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>eventos</div>
            </div>
            {Object.entries(summary.byCategory).slice(0, 4).map(([cat, count]) => (
              <div key={cat} style={{ textAlign: "center" as const }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: EVENT_CATEGORY_COLORS[cat] ?? C.ink, lineHeight: 1 }}>
                  {count}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>{cat}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Cargando event stream…
        </div>
      ) : entries.length === 0 ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin eventos registrados. Los eventos se acumulan a medida que el runtime procesa acciones, delegaciones y planes.
        </div>
      ) : (
        <>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "60px 80px 1fr 80px 80px",
            gap: S[3], padding: `${S[1]}px ${S[3]}px`, marginBottom: S[1],
          }}>
            {["HORA", "CATEGORÍA", "EVENTO", "AGENTE", "NIVEL"].map(h => (
              <div key={h} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em" }}>{h}</div>
            ))}
          </div>
          {entries.map(e => <EventStreamRow key={e.id} entry={e} />)}
        </>
      )}
    </div>
  );
}

// ── Execution Sessions ────────────────────────────────────────────────────────

const EXEC_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  queued:          { bg: "rgba(107,114,128,.08)", fg: "#6b7280" },
  leasing:         { bg: "rgba(59,130,246,.08)",  fg: "#3b82f6" },
  validating:      { bg: "rgba(99,102,241,.08)",  fg: "#6366f1" },
  running:         { bg: "rgba(59,130,246,.10)",  fg: "#2563eb" },
  succeeded:       { bg: "rgba(22,163,74,.10)",   fg: "#16a34a" },
  failed:          { bg: "rgba(220,38,38,.10)",   fg: "#dc2626" },
  retry_scheduled: { bg: "rgba(234,88,12,.10)",   fg: "#ea580c" },
  canceled:        { bg: "rgba(107,114,128,.10)", fg: "#6b7280" },
  timed_out:       { bg: "rgba(234,88,12,.12)",   fg: "#ea580c" },
  skipped:         { bg: "rgba(107,114,128,.06)", fg: "#9ca3af" },
  rejected:        { bg: "rgba(220,38,38,.08)",   fg: "#dc2626" },
};

interface ExecutionsApiResponse {
  sessions:    ExecutionSession[];
  diagnostics: ExecutionDiagnostics;
  stuck:       ExecutionSession[];
  meta: { count: number; stuckCount: number; generatedAt: string };
}

function useExecutionSessions(orgSlug: string) {
  const [data, setData]       = useState<ExecutionsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/agent/runtime/executions?limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setData(j as ExecutionsApiResponse); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [orgSlug]);

  return { data, loading };
}

function ExecStatusBadge({ status }: { status: string }) {
  const { bg, fg } = EXEC_STATUS_COLORS[status] ?? EXEC_STATUS_COLORS.queued!;
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
      letterSpacing: "0.05em", color: fg, background: bg,
      borderRadius: R.pill, padding: "2px 7px",
      textTransform: "uppercase" as const, whiteSpace: "nowrap" as const,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ExecutionSessionRow({ session }: { session: ExecutionSession }) {
  function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }
  const isStuck = session.leaseExpiresAt && new Date(session.leaseExpiresAt).getTime() < Date.now() && session.status === "running";

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "80px 1fr 100px 80px 80px 100px",
      gap:                 S[3],
      alignItems:          "center",
      padding:             `${S[2]}px ${S[3]}px`,
      borderBottom:        `1px solid ${C.line}`,
      background:          isStuck ? "rgba(234,88,12,.03)" : "transparent",
    }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{fmtTime(session.createdAt)}</div>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.medium }}>
          {session.toolId}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 1 }}>
          {session.id} · {session.agentId}
        </div>
      </div>
      <ExecStatusBadge status={session.status} />
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
        {session.attempt}/{session.maxAttempts}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
        {session.durationMs !== null ? `${session.durationMs}ms` : "—"}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, textOverflow: "ellipsis" as const, overflow: "hidden" as const }}>
        {session.error ? session.error.slice(0, 40) : session.result ? "✓ ok" : "—"}
      </div>
    </div>
  );
}

function ExecutionSessionsSection({ orgSlug }: { orgSlug: string }) {
  const { data, loading } = useExecutionSessions(orgSlug);
  const diag = data?.diagnostics;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      overflow:     "hidden",
      boxShadow:    "0 1px 4px rgba(0,18,60,.06)",
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        gap:          S[4],
        padding:      `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surface,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Sesiones de Ejecución
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Lifecycle controlado por el kernel · ExecutionSession V1
          </div>
        </div>
        {diag && (
          <div style={{ display: "flex", gap: S[4] }}>
            {[
              { label: "total",      v: diag.totalSessions },
              { label: "running",    v: diag.running,   urgent: diag.running > 0 },
              { label: "succeeded",  v: diag.succeeded },
              { label: "failed",     v: diag.failed,    urgent: diag.failed > 0 },
              { label: "stuck",      v: diag.stuck,     urgent: diag.stuck > 0 },
            ].map(({ label, v, urgent }) => (
              <div key={label} style={{ textAlign: "center" as const }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                  color: urgent ? "#ea580c" : C.blueDark, lineHeight: 1,
                }}>{v}</div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Column headers */}
      {!loading && (data?.sessions?.length ?? 0) > 0 && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "80px 1fr 100px 80px 80px 100px",
          gap:                 S[3],
          padding:             `${S[1]}px ${S[3]}px`,
          background:          C.surface,
          borderBottom:        `1px solid ${C.line}`,
        }}>
          {["HORA", "TOOL / SESSION", "ESTADO", "INTENTO", "DURACIÓN", "RESULTADO"].map(h => (
            <div key={h} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em" }}>{h}</div>
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ padding: `${S[4]}px`, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Cargando sesiones de ejecución…
        </div>
      ) : (data?.sessions?.length ?? 0) === 0 ? (
        <div style={{ padding: `${40}px ${S[5]}px`, textAlign: "center" as const }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[2] }}>
            Sin sesiones de ejecución
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Las sesiones se crean al ejecutar una acción aprobada desde la Cola de Aprobaciones.
          </div>
        </div>
      ) : (
        data!.sessions.map(s => <ExecutionSessionRow key={s.id} session={s} />)
      )}

      {/* Stuck warning */}
      {(data?.stuck?.length ?? 0) > 0 && (
        <div style={{
          padding:    `${S[2]}px ${S[4]}px`,
          background: "rgba(234,88,12,.06)",
          borderTop:  `1px solid rgba(234,88,12,.2)`,
          fontFamily: T.mono, fontSize: 9, color: "#ea580c",
        }}>
          ⚠ {data!.stuck.length} sesión{data!.stuck.length > 1 ? "es" : ""} atascada{data!.stuck.length > 1 ? "s" : ""} (lease vencido)
        </div>
      )}
    </div>
  );
}
// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApprovalCenterPage() {
  const params  = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;

  const {
    envelopes,
    timeline,
    agentLoad,
    metrics,
    loading,
    error,
    refresh,
    lastFetchAt,
  } = useAgentRuntime(orgSlug);

  return (
    <div style={{
      padding:    `${S[5]}px ${S[6]}px`,
      maxWidth:   1400,
      margin:     "0 auto",
      minHeight:  "100vh",
      background: C.surface,
    }}>
      {/* Header */}
      <PageHeader
        orgSlug={orgSlug}
        onRefresh={refresh}
        loading={loading}
        lastFetchAt={lastFetchAt}
      />

      {/* Error state */}
      {error && (
        <div style={{
          background:   C.redLight,
          border:       `1px solid ${C.redBorder}`,
          borderRadius: R.lg,
          padding:      `${S[3]}px ${S[4]}px`,
          marginBottom: S[4],
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.redDark,
        }}>
          Error al cargar acciones: {error}
        </div>
      )}

      {/* KPI strip */}
      <SectionHeader label="Estado del Runtime" meta="acciones propuestas por agentes" />
      <RuntimeKpis metrics={metrics} loading={loading} />

      {/* Runtime Intelligence */}
      <SectionHeader label="Runtime Intelligence" meta="interpretación determinística multiagente" />
      <RuntimeIntelligenceSection orgSlug={orgSlug} />

      {/* Delegaciones Multiagente */}
      <SectionHeader label="Delegaciones Multiagente" meta="coordinación controlada entre agentes" />
      <DelegationsSection orgSlug={orgSlug} />

      {/* Operational Plans */}
      <SectionHeader label="Planes Operacionales" meta="dependencias, bloqueos y readiness multiagente" />
      <OperationalPlansSection orgSlug={orgSlug} />

      {/* Runtime Event Stream */}
      <SectionHeader label="Runtime Event Stream" meta="trazabilidad persistente del runtime · Event Store V1" />
      <RuntimeEventStream orgSlug={orgSlug} />

      {/* Execution Sessions */}
      <SectionHeader label="Sesiones de Ejecución" meta="lifecycle controlado · leases · reintentos · timeouts" />
      <ExecutionSessionsSection orgSlug={orgSlug} />

      {/* Action queue */}
      <SectionHeader
        label="Cola de Aprobaciones"
        meta={envelopes.length > 0 ? `${metrics.pendingApproval} pendiente${metrics.pendingApproval !== 1 ? "s" : ""}` : undefined}
      />
      <ApprovalQueueTable
        envelopes={envelopes}
        orgSlug={orgSlug}
        loading={loading}
      />

      {/* Bottom panels — timeline + agent load */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 360px",
        gap:                 S[5],
        alignItems:          "start",
      }}>
        <div>
          <SectionHeader label="Timeline Operacional" meta="eventos del runtime de agentes" />
          <RuntimeTimeline events={timeline} loading={loading} />
        </div>
        <div>
          <SectionHeader label="Carga por Agente" />
          <RuntimeAgentLoad agentLoad={agentLoad} />
        </div>
      </div>
    </div>
  );
}
