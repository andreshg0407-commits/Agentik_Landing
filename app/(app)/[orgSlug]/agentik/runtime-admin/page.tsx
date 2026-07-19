/**
 * /[orgSlug]/agentik/runtime-admin
 *
 * Agentik Runtime Admin Console
 *
 * Technical observability console for the multiagent runtime infrastructure.
 * Consolidates: lifecycle, events, graph, recovery, consistency, delegations,
 * tool execution kernel, and memory diagnostics.
 *
 * ACCESS: SUPER_ADMIN / AGENTIK_ADMIN only (platform-only nav item).
 *
 * Sprint: AGENTIK-RUNTIME-ADMIN-CONSOLE-01
 */

"use client";

import { useParams }           from "next/navigation";
import { useState, useEffect } from "react";
import { C, T, S, R }         from "@/lib/ui/tokens";
import type { EventStoreDiagnostics } from "@/lib/agent-runtime/event-store-types";
import type { ExecutionDiagnostics, ExecutionSession } from "@/lib/agent-runtime/execution-lifecycle-types";
import type { ConsistencyReport }     from "@/lib/agent-runtime/execution-consistency";
import type { RecoveryReport }        from "@/lib/agent-runtime/runtime-recovery";
import type { ExecutionGraphDiagnostics } from "@/lib/agent-runtime/execution-graph";

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionCard({ title, meta, children }: {
  title:    string;
  meta?:    string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px ${S[5]}px`,
      marginBottom: S[4],
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: S[2], marginBottom: S[4] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, letterSpacing: "0.01em" }}>
          {title}
        </span>
        {meta && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatChip({ label, value, urgent, dim }: {
  label:  string;
  value:  string | number;
  urgent?: boolean;
  dim?:    boolean;
}) {
  const fg = urgent ? C.red : dim ? C.inkFaint : C.ink;
  const bg = urgent ? "rgba(220,38,38,.06)" : dim ? "transparent" : C.surfaceAlt;
  return (
    <div style={{
      display:      "flex",
      flexDirection: "column" as const,
      alignItems:   "center",
      background:   bg,
      borderRadius: R.lg,
      padding:      `${S[2]}px ${S[3]}px`,
      minWidth:     64,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: fg, lineHeight: 1 }}>
        {String(value)}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 3, textAlign: "center" as const, lineHeight: 1.3 }}>
        {label}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { bg: string; fg: string }> = {
    running:          { bg: "rgba(3,105,161,.10)",  fg: C.blue },
    succeeded:        { bg: "rgba(22,163,74,.10)",  fg: C.green },
    failed:           { bg: "rgba(220,38,38,.10)",  fg: C.red },
    timed_out:        { bg: "rgba(220,38,38,.10)",  fg: C.red },
    queued:           { bg: "rgba(107,114,128,.10)", fg: C.inkLight },
    leasing:          { bg: "rgba(202,138,4,.10)",  fg: C.amberMid },
    retry_scheduled:  { bg: "rgba(202,138,4,.10)",  fg: C.amberMid },
    validating:       { bg: "rgba(3,105,161,.10)",  fg: C.blue },
    cancelled:        { bg: "rgba(107,114,128,.10)", fg: C.inkLight },
  };
  const { bg, fg } = MAP[status] ?? { bg: C.surfaceAlt, fg: C.inkMid };
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      9,
      fontWeight:    T.wt.semibold,
      letterSpacing: "0.05em",
      textTransform: "uppercase" as const,
      color:         fg,
      background:    bg,
      borderRadius:  R.pill,
      padding:       "2px 8px",
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const MAP: Record<string, { bg: string; fg: string }> = {
    critical: { bg: "rgba(220,38,38,.10)",  fg: C.red },
    warning:  { bg: "rgba(202,138,4,.10)",  fg: C.amberMid },
    info:     { bg: "rgba(99,102,241,.10)", fg: "#6366f1" },
  };
  const { bg, fg } = MAP[severity] ?? MAP.info!;
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      9,
      fontWeight:    T.wt.semibold,
      letterSpacing: "0.05em",
      textTransform: "uppercase" as const,
      color:         fg,
      background:    bg,
      borderRadius:  R.pill,
      padding:       "2px 8px",
    }}>
      {severity}
    </span>
  );
}

// ── Data types ────────────────────────────────────────────────────────────────

interface RuntimeAdminData {
  exec: {
    diagnostics:  ExecutionDiagnostics | null;
    sessions:     ExecutionSession[];
    stuck:        ExecutionSession[];
    consistency:  ConsistencyReport | null;
    recovery:     RecoveryReport | null;
    storeMode:    string;
  } | null;
  intelligence: {
    summary?: {
      insightCount: number; blockerCount: number; coordinationCount: number;
      patternsDetected: number; orphanChains: number; staleActionCount: number;
      criticalInsightCount: number;
    };
  } | null;
  delegations: {
    summary?: {
      total: number; pending: number; blocked: number; completed: number;
      failed: number; inProgress: number; longestChainLength: number;
      bySourceAgent: Record<string, number>; byTargetAgent: Record<string, number>;
    };
    delegations?: Array<{
      id: string; status: string; reason?: string;
      sourceAgentId?: string; targetAgentId?: string;
      createdAt?: string;
    }>;
  } | null;
  plans: {
    summary?: {
      totalPlans: number; readyPlans: number; blockedPlans: number;
      conflictsDetected: number; cyclesDetected: number; orphanDependencies: number;
      avgStepsPerPlan: number; criticalBlockers: number;
    };
    graph?: { totalNodes: number; cyclesDetected: number; orphanNodes: number };
  } | null;
  events: {
    diagnostics?: EventStoreDiagnostics;
  } | null;
  tool: {
    attempted: number; succeeded: number; failed: number;
    handlerIds: string[];
  } | null;
  graph: {
    diagnostics?: ExecutionGraphDiagnostics;
    summary?: {
      nodeCount: number; edgeCount: number; orphanNodes: number; failedChains: number;
      unresolvedBlocks: number; maxDepth: number; cyclesDetected: number;
    };
    issueCounts?: Record<string, number>;
    generatedAt?: string;
  } | null;
  memory: {
    diagnostics?: {
      totalNodes: number; totalEdges: number; totalObservations: number;
      orphanActionCount: number; longestChainLength: number; storeType: string;
    };
    recentContext?: {
      recentNodeCount: number; recentObsCount: number;
      pendingActionCount: number; failedActionCount: number; criticalSignalCount: number;
    };
  } | null;
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useRuntimeAdminData(orgSlug: string) {
  const [data, setData]       = useState<RuntimeAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  function fetch_(url: string) {
    return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
  }

  function load() {
    setLoading(true);
    Promise.all([
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/executions?limit=50`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/intelligence`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/delegations`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/plans`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/events/diagnostics`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/events?category=tool&limit=200`),
      fetch_(`/api/orgs/${orgSlug}/agent/runtime/execution-graph/diagnostics`),
      fetch_(`/api/orgs/${orgSlug}/agent/memory/diagnostics`),
    ]).then(([execRaw, intel, dels, plans, evDiag, evTools, graphRaw, mem]) => {
      // exec
      const execTyped = execRaw as {
        sessions?: ExecutionSession[];
        stuck?: ExecutionSession[];
        diagnostics?: ExecutionDiagnostics;
        consistency?: ConsistencyReport;
        recovery?: RecoveryReport | null;
        storeMode?: string;
      } | null;

      // tool events
      const toolEvts = ((evTools as { events?: Array<{ eventType: string }> } | null)?.events ?? []);
      const toolAttempted = toolEvts.filter(e => e.eventType === "tool.called").length;
      const toolSucceeded = toolEvts.filter(e => e.eventType === "tool.completed").length;
      const toolFailed    = toolEvts.filter(e => e.eventType === "tool.failed").length;

      const graphTyped = graphRaw as {
        diagnostics?: ExecutionGraphDiagnostics;
        summary?: {
          nodeCount: number; edgeCount: number; orphanNodes: number; failedChains: number;
          unresolvedBlocks: number; maxDepth: number; cyclesDetected: number;
        };
        issueCounts?: Record<string, number>;
        generatedAt?: string;
      } | null;

      setData({
        exec: execTyped ? {
          diagnostics: execTyped.diagnostics ?? null,
          sessions:    execTyped.sessions    ?? [],
          stuck:       execTyped.stuck       ?? [],
          consistency: execTyped.consistency ?? null,
          recovery:    execTyped.recovery    ?? null,
          storeMode:   execTyped.storeMode   ?? "—",
        } : null,
        intelligence: (intel as RuntimeAdminData["intelligence"]) ?? null,
        delegations:  (dels  as RuntimeAdminData["delegations"])  ?? null,
        plans:        (plans as RuntimeAdminData["plans"])         ?? null,
        events:       (evDiag as RuntimeAdminData["events"])       ?? null,
        tool: { attempted: toolAttempted, succeeded: toolSucceeded, failed: toolFailed, handlerIds: ["commercial.createProductionRequestDraft"] },
        graph:        graphTyped,
        memory:       (mem  as RuntimeAdminData["memory"])         ?? null,
      });
      setGeneratedAt(new Date().toISOString());
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [orgSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, generatedAt, refresh: load };
}

// ── Section 1: Health Overview ────────────────────────────────────────────────

function HealthOverview({ data }: { data: RuntimeAdminData }) {
  const exec  = data.exec;
  const diag  = exec?.diagnostics;
  const graph = data.graph;

  const issues   = (graph?.diagnostics?.issueCount ?? 0);
  const critical = (graph?.diagnostics?.issueBySeverity?.["critical"] ?? 0);
  const cycles   = (graph?.diagnostics?.issueByType?.["cycle_detected"] ?? 0);

  // Rough health score: 100 minus penalty per issue class
  const stuck    = diag?.stuck ?? 0;
  const expired  = diag?.expiredLeases ?? 0;
  const consist  = exec?.consistency?.totalIssues ?? 0;
  const penalty  = (stuck * 15) + (expired * 10) + (critical * 20) + (cycles * 30) + (consist * 5);
  const score    = Math.max(0, 100 - penalty);
  const scoreColor = score >= 90 ? C.green : score >= 70 ? C.amberMid : C.red;
  const healthLabel = score >= 90 ? "Saludable" : score >= 70 ? "Degradado" : "Crítico";

  return (
    <SectionCard title="Runtime Health" meta="estado general del motor multiagente">
      <div style={{ display: "flex", gap: S[4], alignItems: "flex-start", flexWrap: "wrap" as const }}>
        {/* Score */}
        <div style={{
          background:   score >= 90 ? "rgba(22,163,74,.06)" : score >= 70 ? "rgba(202,138,4,.06)" : "rgba(220,38,38,.06)",
          border:       `1px solid ${score >= 90 ? C.greenBorder : score >= 70 ? C.amberBorder : C.redBorder}`,
          borderRadius: R.xl,
          padding:      `${S[3]}px ${S[5]}px`,
          textAlign:    "center" as const,
          minWidth:     100,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: "2rem", fontWeight: T.wt.bold, color: scoreColor, lineHeight: 1 }}>
            {score}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: scoreColor, marginTop: 4, fontWeight: T.wt.semibold }}>
            {healthLabel}
          </div>
        </div>

        {/* KPI grid */}
        <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, flex: 1 }}>
          <StatChip label="activas"       value={diag?.running ?? 0}         />
          <StatChip label="stuck"         value={stuck}                        urgent={stuck > 0} />
          <StatChip label="leases exp."   value={expired}                      urgent={expired > 0} />
          <StatChip label="heartbeats"    value={diag?.activeHeartbeats ?? 0} />
          <StatChip label="retry sched."  value={diag?.retryScheduled ?? 0}   urgent={(diag?.retryScheduled ?? 0) > 0} />
          <StatChip label="fallidas hoy"  value={diag?.failed ?? 0}           urgent={(diag?.failed ?? 0) > 0} />
          <StatChip label="graph issues"  value={issues}                       urgent={issues > 0} />
          <StatChip label="sin resolver"  value={graph?.summary?.unresolvedBlocks ?? 0} urgent={(graph?.summary?.unresolvedBlocks ?? 0) > 0} />
          <StatChip label="consistency"   value={consist}                      urgent={consist > 0} />
        </div>
      </div>
    </SectionCard>
  );
}

// ── Section 2: Execution Lifecycle Monitor ────────────────────────────────────

const SESSION_STATUS_FILTERS = ["running", "failed", "stuck", "succeeded"] as const;
type SessionFilter = typeof SESSION_STATUS_FILTERS[number] | "all";

function ExecutionLifecycleMonitor({ data }: { data: RuntimeAdminData }) {
  const [filter, setFilter] = useState<SessionFilter>("all");
  const sessions = data.exec?.sessions ?? [];
  const diag     = data.exec?.diagnostics;

  const isStuck = (s: ExecutionSession) => {
    const stuckSet = new Set(["running", "leasing", "validating"]);
    if (!stuckSet.has(s.status)) return false;
    const age = Date.now() - new Date(s.startedAt ?? s.createdAt).getTime();
    return age > 10 * 60 * 1000; // >10min
  };

  const filtered = sessions.filter(s => {
    if (filter === "all")       return true;
    if (filter === "stuck")     return isStuck(s);
    if (filter === "running")   return s.status === "running";
    if (filter === "failed")    return s.status === "failed" || s.status === "timed_out";
    if (filter === "succeeded") return s.status === "succeeded";
    return true;
  });

  function fmtTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  }

  return (
    <SectionCard title="Execution Lifecycle Monitor" meta={`${sessions.length} sesiones · store: ${data.exec?.storeMode ?? "—"}`}>
      {/* Summary strip */}
      {diag && (
        <div style={{ display: "flex", gap: S[3], marginBottom: S[4], flexWrap: "wrap" as const }}>
          {[
            { label: "total",         value: diag.totalSessions },
            { label: "running",       value: diag.running,          urgent: false },
            { label: "stuck",         value: diag.stuck,            urgent: diag.stuck > 0 },
            { label: "failed",        value: diag.failed,           urgent: diag.failed > 0 },
            { label: "timed out",     value: diag.timedOut,         urgent: diag.timedOut > 0 },
            { label: "retry sched",   value: diag.retryScheduled },
            { label: "succeeded",     value: diag.succeeded },
            { label: "active leases", value: diag.activeLeases },
            { label: "exp. leases",   value: diag.expiredLeases,    urgent: diag.expiredLeases > 0 },
            { label: "heartbeats",    value: diag.activeHeartbeats },
            { label: "attempts",      value: diag.totalAttempts },
            { label: "avg ms",        value: diag.avgDurationMs ?? "—" },
          ].map(({ label, value, urgent }) => (
            <StatChip key={label} label={label} value={value} urgent={urgent} dim />
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3] }}>
        {(["all", ...SESSION_STATUS_FILTERS] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        filter === f ? C.blueDark : C.inkMid,
              background:   filter === f ? "rgba(0,74,173,.08)" : "transparent",
              border:       `1px solid ${filter === f ? C.blueBorder : C.line}`,
              borderRadius: R.sm,
              padding:      `2px ${S[3]}px`,
              cursor:       "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ag-op-table">
        <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
          {["executionId", "actionId", "agent", "estado", "inicio", "actualizado", "reintentos", "duración"].map(h => (
            <span key={h} style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.inkFaint, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
              {h}
            </span>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" as const }}>
            Sin sesiones para el filtro seleccionado.
          </div>
        ) : filtered.slice(0, 20).map(s => (
          <div key={s.id} className="ag-op-row">
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
              {s.id.slice(-8)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
              {(s.actionId ?? "—").slice(-8)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>
              {s.agentId ?? "—"}
            </span>
            <StatusBadge status={s.status} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
              {fmtTime(s.startedAt ?? s.createdAt)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
              {fmtTime(s.updatedAt)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: (s.attempt ?? 0) > 0 ? C.amberMid : C.inkFaint }}>
              {s.attempt ?? 0}/{s.maxAttempts ?? 3}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {s.durationMs != null ? `${s.durationMs}ms` : "—"}
            </span>
          </div>
        ))}
      </div>
      {filtered.length > 20 && (
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: S[2], textAlign: "right" as const }}>
          mostrando 20 de {filtered.length}
        </div>
      )}
    </SectionCard>
  );
}

// ── Section 3: Event Store Diagnostics ───────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  action:     "#3b82f6", delegation: "#8b5cf6",
  plan:       "#06b6d4", execution:  "#10b981",
  tool:       "#f59e0b", system:     "#6b7280",
  memory:     "#ec4899",
};

function EventStoreDiagnosticsSection({ data }: { data: RuntimeAdminData }) {
  const diag = data.events?.diagnostics;
  if (!diag) {
    return (
      <SectionCard title="Event Store Diagnostics" meta="event store V1">
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin datos del event store disponibles.
        </span>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Event Store Diagnostics" meta={`${diag.storeType} · schema v${diag.schemaVersion}`}>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
        <StatChip label="total eventos"  value={diag.totalEvents} />
        <StatChip label="correlaciones"  value={diag.correlationCount} />
        <StatChip label="orphan events"  value={diag.orphanEvents} urgent={diag.orphanEvents > 0} />
        <StatChip label="último evento"  value={diag.latestEventAt ? new Date(diag.latestEventAt).toLocaleTimeString() : "—"} dim />
      </div>
      {Object.keys(diag.byCategory).length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2], letterSpacing: "0.06em" }}>
            POR CATEGORÍA
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
            {Object.entries(diag.byCategory).map(([cat, count]) => (
              <div key={cat} style={{
                display:      "flex",
                flexDirection: "column" as const,
                alignItems:   "center",
                background:   C.surfaceAlt,
                borderRadius: R.lg,
                padding:      `${S[2]}px ${S[3]}px`,
                minWidth:     52,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: CAT_COLORS[cat] ?? C.ink, lineHeight: 1 }}>
                  {count}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 3 }}>
                  {cat}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Section 4: Execution Graph Diagnostics ───────────────────────────────────

function ExecutionGraphDiagnosticsSection({ data }: { data: RuntimeAdminData }) {
  const diag    = data.graph?.diagnostics;
  const summary = data.graph?.summary;
  const issues  = data.graph?.issueCounts ?? {};

  if (!diag) {
    return (
      <SectionCard title="Execution Graph" meta="grafo causal del runtime">
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin datos del grafo disponibles.
        </span>
      </SectionCard>
    );
  }

  const topIssues = Object.entries(issues)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <SectionCard
      title="Execution Graph"
      meta={data.graph?.generatedAt ? `generado ${new Date(data.graph.generatedAt).toLocaleTimeString()}` : undefined}
    >
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
        <StatChip label="nodos"         value={diag.nodeCount} />
        <StatChip label="aristas"       value={diag.edgeCount} />
        <StatChip label="issues"        value={diag.issueCount}   urgent={diag.issueCount > 0} />
        <StatChip label="critical"      value={diag.issueBySeverity["critical"] ?? 0} urgent={(diag.issueBySeverity["critical"] ?? 0) > 0} />
        <StatChip label="ciclos"        value={diag.issueByType["cycle_detected"] ?? 0} urgent={(diag.issueByType["cycle_detected"] ?? 0) > 0} />
        <StatChip label="sin resolver"  value={diag.issueByType["unresolved_block"] ?? 0} urgent={(diag.issueByType["unresolved_block"] ?? 0) > 0} />
        <StatChip label="orphans"       value={diag.issueByType["orphan_execution"] ?? 0} urgent={(diag.issueByType["orphan_execution"] ?? 0) > 0} />
        <StatChip label="aristas caid." value={diag.issueByType["dangling_edge"] ?? 0} urgent={(diag.issueByType["dangling_edge"] ?? 0) > 0} />
        <StatChip label="dup exec."     value={diag.issueByType["duplicate_execution_for_action"] ?? 0} urgent={(diag.issueByType["duplicate_execution_for_action"] ?? 0) > 0} />
        {summary && (
          <>
            <StatChip label="fallos"      value={summary.failedChains} urgent={summary.failedChains > 0} />
            <StatChip label="max depth"   value={summary.maxDepth} dim />
          </>
        )}
      </div>
      {/* Source counts */}
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2], letterSpacing: "0.06em" }}>
        FUENTES
      </div>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[3] }}>
        {Object.entries(diag.sourceNodeCounts).map(([k, v]) => (
          <div key={k}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{k}: </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.ink }}>{v}</span>
          </div>
        ))}
      </div>
      {/* Top issues */}
      {topIssues.length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2], letterSpacing: "0.06em" }}>
            ISSUES DETECTADOS
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            {topIssues.map(([type, count]) => (
              <div key={type} style={{
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
                padding:      `${S[2]}px ${S[3]}px`,
                background:   C.surfaceAlt,
                borderRadius: R.sm,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                  {type.replace(/_/g, " ")}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: count > 0 ? C.red : C.inkFaint }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Section 5: Recovery & Consistency ────────────────────────────────────────

function RecoveryConsistencySection({ data }: { data: RuntimeAdminData }) {
  const consistency = data.exec?.consistency;
  const recovery    = data.exec?.recovery;

  return (
    <SectionCard title="Recovery & Consistency" meta="integridad del store de ejecución">
      {consistency && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            CONSISTENCY CHECKER
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[3] }}>
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          S[2],
              background:   consistency.clean ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)",
              border:       `1px solid ${consistency.clean ? C.greenBorder : C.redBorder}`,
              borderRadius: R.lg,
              padding:      `${S[2]}px ${S[3]}px`,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: consistency.clean ? C.green : C.red }}>
                {consistency.clean ? "CLEAN" : "ISSUES DETECTED"}
              </span>
              {consistency.totalIssues > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
                  ({consistency.totalIssues} total)
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
            {[
              { label: "corruptas",       value: consistency.corruptedSessions.length, urgent: consistency.corruptedSessions.length > 0 },
              { label: "orphan attempts", value: consistency.orphanAttempts.length,    urgent: consistency.orphanAttempts.length > 0 },
              { label: "zombie leases",   value: consistency.zombieLeases.length,      urgent: consistency.zombieLeases.length > 0 },
              { label: "stale sessions",  value: consistency.staleSessions.length,     urgent: consistency.staleSessions.length > 0 },
            ].map(({ label, value, urgent }) => (
              <StatChip key={label} label={label} value={value} urgent={urgent} dim />
            ))}
          </div>
        </>
      )}

      {recovery && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            BOOT RECOVERY
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
            {[
              { label: "recovered",     value: recovery.recovered,    urgent: recovery.recovered > 0 },
              { label: "zombies",       value: recovery.zombiesMarked, urgent: recovery.zombiesMarked > 0 },
              { label: "leases exp.",   value: recovery.leasesExpired },
              { label: "store",         value: recovery.storeMode },
              { label: "timestamp",     value: new Date(recovery.timestamp).toLocaleTimeString() },
            ].map(({ label, value, urgent }) => (
              <StatChip key={label} label={label} value={value} urgent={urgent} dim />
            ))}
          </div>
        </>
      )}

      {!consistency && !recovery && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin datos de recovery/consistency disponibles.
        </span>
      )}
    </SectionCard>
  );
}

// ── Section 6: Delegation Runtime ─────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David", diego_finance: "Diego",
  luca_marketing:   "Luca",  mila_collections: "Mila",
  agentik_copilot:  "Agentik", system: "Sistema",
};
function agentLabel(id: string | undefined): string {
  if (!id) return "—";
  return AGENT_LABELS[id] ?? id;
}

function DelegationRuntimeSection({ data }: { data: RuntimeAdminData }) {
  const dels     = (data.delegations?.delegations ?? []) as Array<{
    id: string; status: string; reason?: string;
    sourceAgentId?: string; targetAgentId?: string; createdAt?: string;
  }>;
  const summary  = data.delegations?.summary;
  const active   = dels.filter(d => ["pending","in_progress","blocked","pending_approval"].includes(d.status));
  const blocked  = dels.filter(d => d.status === "blocked" || d.status === "pending_approval");

  return (
    <SectionCard title="Delegation Runtime" meta="coordinación entre agentes">
      {summary && (
        <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
          <StatChip label="total"       value={summary.total} />
          <StatChip label="pending"     value={summary.pending}     urgent={summary.pending > 0} />
          <StatChip label="blocked"     value={summary.blocked}     urgent={summary.blocked > 0} />
          <StatChip label="in progress" value={summary.inProgress} />
          <StatChip label="completed"   value={summary.completed} dim />
          <StatChip label="failed"      value={summary.failed}      urgent={summary.failed > 0} />
          <StatChip label="chain max"   value={summary.longestChainLength} dim />
        </div>
      )}

      {blocked.length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.amberMid, letterSpacing: "0.06em", marginBottom: S[2] }}>
            BLOQUEADAS / PENDIENTES DE APROBACIÓN ({blocked.length})
          </div>
          <div className="ag-op-table" style={{ marginBottom: S[3] }}>
            {blocked.map(d => (
              <div key={d.id} className="ag-op-row">
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{d.id.slice(-8)}</span>
                <StatusBadge status={d.status} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>{agentLabel(d.sourceAgentId)} → {agentLabel(d.targetAgentId)}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{d.reason ?? "—"}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {active.length === 0 && !summary && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin delegaciones activas.
        </span>
      )}
    </SectionCard>
  );
}

// ── Section 7: Tool Execution Kernel ──────────────────────────────────────────

function ToolExecutionKernel({ data }: { data: RuntimeAdminData }) {
  const tool = data.tool;
  if (!tool) {
    return (
      <SectionCard title="Tool Execution Kernel" meta="kernel V1">
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin datos del kernel disponibles.</span>
      </SectionCard>
    );
  }

  const successRate = tool.attempted > 0
    ? `${Math.round((tool.succeeded / tool.attempted) * 100)}%`
    : "—";

  return (
    <SectionCard title="Tool Execution Kernel" meta="observabilidad de herramientas">
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
        <StatChip label="intentados"   value={tool.attempted} />
        <StatChip label="exitosos"     value={tool.succeeded} />
        <StatChip label="fallidos"     value={tool.failed}    urgent={tool.failed > 0} />
        <StatChip label="tasa éxito"   value={successRate}    dim />
        <StatChip label="handlers reg" value={tool.handlerIds.length} />
      </div>
      {tool.handlerIds.length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            HANDLERS REGISTRADOS
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            {tool.handlerIds.map(h => (
              <div key={h} style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                color:        C.inkMid,
                background:   C.surfaceAlt,
                borderRadius: R.sm,
                padding:      `${S[1]}px ${S[3]}px`,
              }}>
                {h}
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Section 8: Runtime Memory Diagnostics ────────────────────────────────────

function RuntimeMemoryDiagnostics({ data }: { data: RuntimeAdminData }) {
  const mem     = data.memory;
  const diag    = mem?.diagnostics;
  const recent  = mem?.recentContext;

  if (!diag) {
    return (
      <SectionCard title="Runtime Memory Diagnostics" meta="memory graph">
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Runtime memory diagnostics pending implementation.
        </span>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Runtime Memory Diagnostics" meta={`${diag.storeType}`}>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[3] }}>
        <StatChip label="nodos"          value={diag.totalNodes} />
        <StatChip label="aristas"        value={diag.totalEdges} />
        <StatChip label="observaciones"  value={diag.totalObservations} />
        <StatChip label="orphan actions" value={diag.orphanActionCount} urgent={diag.orphanActionCount > 0} />
        <StatChip label="longest chain"  value={diag.longestChainLength} dim />
      </div>
      {recent && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            CONTEXTO RECIENTE (1h)
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
            <StatChip label="nodos recientes"  value={recent.recentNodeCount} dim />
            <StatChip label="obs. recientes"   value={recent.recentObsCount} dim />
            <StatChip label="acciones pend."   value={recent.pendingActionCount} urgent={recent.pendingActionCount > 0} />
            <StatChip label="acciones fallidas" value={recent.failedActionCount} urgent={recent.failedActionCount > 0} />
            <StatChip label="señales críticas" value={recent.criticalSignalCount} urgent={recent.criticalSignalCount > 0} />
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── Section 9: Planning & Intelligence ───────────────────────────────────────

function PlanningIntelligenceSection({ data }: { data: RuntimeAdminData }) {
  const plans  = data.plans;
  const intel  = data.intelligence;

  return (
    <SectionCard title="Planning & Intelligence" meta="motor de planificación · runtime intelligence">
      {plans?.summary && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            PLANNING ENGINE
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[4] }}>
            <StatChip label="planes"       value={plans.summary.totalPlans} />
            <StatChip label="ready"        value={plans.summary.readyPlans} />
            <StatChip label="bloqueados"   value={plans.summary.blockedPlans}     urgent={plans.summary.blockedPlans > 0} />
            <StatChip label="conflictos"   value={plans.summary.conflictsDetected} urgent={plans.summary.conflictsDetected > 0} />
            <StatChip label="ciclos"       value={plans.summary.cyclesDetected}    urgent={plans.summary.cyclesDetected > 0} />
            <StatChip label="orphan deps"  value={plans.summary.orphanDependencies} urgent={plans.summary.orphanDependencies > 0} />
            <StatChip label="avg steps"    value={plans.summary.avgStepsPerPlan} dim />
            <StatChip label="blockers crit" value={plans.summary.criticalBlockers} urgent={plans.summary.criticalBlockers > 0} />
          </div>
        </>
      )}
      {intel?.summary && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.06em", marginBottom: S[2] }}>
            RUNTIME INTELLIGENCE
          </div>
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
            <StatChip label="insights"    value={intel.summary.insightCount} />
            <StatChip label="bloqueantes" value={intel.summary.blockerCount} urgent={intel.summary.blockerCount > 0} />
            <StatChip label="críticos"    value={intel.summary.criticalInsightCount} urgent={intel.summary.criticalInsightCount > 0} />
            <StatChip label="coordinación" value={intel.summary.coordinationCount} />
            <StatChip label="patrones"    value={intel.summary.patternsDetected} dim />
            <StatChip label="orphan chains" value={intel.summary.orphanChains} urgent={intel.summary.orphanChains > 0} />
            <StatChip label="stale actions" value={intel.summary.staleActionCount} urgent={intel.summary.staleActionCount > 0} />
          </div>
        </>
      )}
      {!plans?.summary && !intel?.summary && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin datos de planificación disponibles.
        </span>
      )}
    </SectionCard>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function ConsoleHeader({ orgSlug, loading, generatedAt, onRefresh }: {
  orgSlug:     string;
  loading:     boolean;
  generatedAt: string | null;
  onRefresh:   () => void;
}) {
  function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
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
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.36)", letterSpacing: "0.06em" }}>{orgSlug}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.24)" }}>›</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.36)", letterSpacing: "0.06em" }}>AGENTIK</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.24)" }}>›</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.60)", letterSpacing: "0.06em" }}>RUNTIME ADMIN</span>
        </div>
        <h1 style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: "rgba(235,238,246,.94)", margin: 0, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
          Runtime Admin Console
        </h1>
        <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "rgba(235,238,246,.48)", margin: `${S[1]}px 0 0` }}>
          Observabilidad técnica del runtime multiagente · read-only · sin side effects
        </p>
      </div>

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
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? C.amber : C.green, boxShadow: `0 0 6px ${loading ? C.amber : C.green}` }} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(235,238,246,.60)" }}>
            {loading ? "Cargando datos…" : "Runtime conectado"}
          </span>
        </div>
        {generatedAt && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: "rgba(235,238,246,.28)" }}>
            Generado: {fmtTime(generatedAt)}
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

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          padding:      `${S[4]}px ${S[5]}px`,
          height:       120,
          opacity:      0.6,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cargando…</div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RuntimeAdminPage() {
  const params  = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;

  const { data, loading, generatedAt, refresh } = useRuntimeAdminData(orgSlug);

  return (
    <div style={{
      padding:    `${S[5]}px ${S[6]}px`,
      maxWidth:   1400,
      margin:     "0 auto",
      minHeight:  "100vh",
      background: C.surface,
    }}>
      <ConsoleHeader
        orgSlug={orgSlug}
        loading={loading}
        generatedAt={generatedAt}
        onRefresh={refresh}
      />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <>
          <HealthOverview              data={data} />
          <ExecutionLifecycleMonitor   data={data} />
          <ExecutionGraphDiagnosticsSection data={data} />
          <RecoveryConsistencySection  data={data} />
          <EventStoreDiagnosticsSection data={data} />
          <DelegationRuntimeSection    data={data} />
          <ToolExecutionKernel         data={data} />
          <RuntimeMemoryDiagnostics    data={data} />
          <PlanningIntelligenceSection data={data} />
        </>
      ) : (
        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          padding:      `${S[6]}px`,
          textAlign:    "center" as const,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
            Sin datos disponibles. Verifica la configuración del runtime.
          </span>
        </div>
      )}
    </div>
  );
}
