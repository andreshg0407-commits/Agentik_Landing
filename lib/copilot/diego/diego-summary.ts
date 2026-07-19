/**
 * lib/copilot/diego/diego-summary.ts
 *
 * Diego CFO Copilot — Executive Summary Engine.
 *
 * buildDiegoExecutiveSummary(orgId) orchestrates:
 *   - evaluateDiegoSignals()         → real financial signals (signal engine)
 *   - prioritizeDiegoSignals()       → operational priorities
 *   - buildDiegoFinancialAdapter()   → Financial Intelligence Layer evidence trace
 *   - Graph + banking + confidence context
 *
 * Output language rules:
 *   - Operational, enterprise, concise.
 *   - No GPT-style preamble. No greetings. No "podría".
 *   - Numbers when available. States when not.
 *
 * Confidence rules:
 *   - LOW confidence → Diego does NOT assert stable liquidity, healthy close,
 *     or reliable projections. Reports partial traceability instead.
 *   - MISSING data   → Diego does NOT invent. Reports unavailability.
 *
 * Sprint: AGENTIK-DIEGO-COPILOT-01 / AGENTIK-DIEGO-FINANCIAL-COPILOT-01
 */

import { evaluateDiegoSignals }              from "./diego-signal-engine";
import { prioritizeDiegoSignals }            from "./diego-priority-engine";
import { getGraphHealthSummary }             from "@/lib/finance/graph";
import { computeCashFlowConfidence }         from "@/lib/finance/source-confidence";
import { getBankingSnapshot }                from "@/lib/finance/banking";
import { buildDiegoFinancialAdapter }        from "@/lib/copilot/finance/diego-financial-adapter";
import { getRecentFinancialEvents }          from "@/lib/finance/runtime-service";
import { buildFinancialRelationshipGraph }   from "@/lib/finance/relationship-graph";
import { computeRelationshipGraphHealth }    from "@/lib/finance/relationship-graph-health";
import { evaluateFinancialRuntimeEvolution } from "@/lib/finance/runtime-evolution";
import type {
  DiegoExecutiveSummary,
  DiegoSummarySerial,
  DiegoDataState,
} from "./diego-types";

export type { DiegoExecutiveSummary, DiegoSummarySerial };

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildDiegoExecutiveSummary(
  orgId: string,
): Promise<DiegoExecutiveSummary> {
  // All calls scoped to orgId — multi-tenant guarantee
  const [signals, graphHealth, cashConf, bankingSnapshot, adapter, recentEvents, relGraph, temporalEvolution] = await Promise.all([
    evaluateDiegoSignals(orgId).catch(() => []),
    getGraphHealthSummary(orgId).catch(() => null),
    computeCashFlowConfidence(orgId).catch(() => null),
    getBankingSnapshot(orgId).catch(() => null),
    buildDiegoFinancialAdapter(orgId).catch(() => null),
    getRecentFinancialEvents(orgId, 6, 10).catch(() => []), // last 6h, max 10 events
    buildFinancialRelationshipGraph(orgId).catch(() => null),
    evaluateFinancialRuntimeEvolution(orgId, "7d").catch(() => null),
  ]);

  // Compute causal summary from relationship graph (FASE 6)
  const relGraphHealth = relGraph ? computeRelationshipGraphHealth(relGraph) : null;
  const causalSummary  = relGraphHealth?.diegoSummary ?? undefined;

  const graphIssueCount = (graphHealth?.criticalIssues ?? 0) + (graphHealth?.warningIssues ?? 0);
  const unresolvedCount = graphHealth?.unresolvedCount ?? 0;
  const cashConfLevel   = cashConf?.level ?? "LOW";
  const bankSyncOk      =
    bankingSnapshot?.health.level === "healthy" ||
    bankingSnapshot?.health.level === "attention";
  const bankSyncStatus  = bankingSnapshot
    ? bankingSnapshot.health.label
    : "Sin datos bancarios conectados";

  const priorities = prioritizeDiegoSignals(
    signals,
    graphIssueCount,
    cashConfLevel,
    unresolvedCount,
    bankSyncOk,
  );

  // ── Data state: derived from worst signal ─────────────────────────────────
  const dataState: DiegoDataState =
    signals.some(s => s.dataState === "BROKEN")                              ? "BROKEN"  :
    signals.some(s => s.dataState === "MISSING" && s.severity === "critical") ? "MISSING" :
    signals.some(s => s.dataState === "STALE")                               ? "STALE"   :
    signals.some(s => s.dataState === "PARTIAL")                             ? "PARTIAL" :
    graphHealth ? "REAL" : "MISSING";

  // ── Executive headline ────────────────────────────────────────────────────
  const criticals        = signals.filter(s => s.severity === "critical");
  const adapterCriticals = (adapter?.signals ?? []).filter(s => s.severity === "critical");
  const totalCriticals   = criticals.length + adapterCriticals.length;

  const executiveHeadline =
    totalCriticals > 0
      ? `${totalCriticals} alerta${totalCriticals > 1 ? "s" : ""} crítica${totalCriticals > 1 ? "s" : ""} · ${criticals[0]?.title ?? adapterCriticals[0]?.title ?? ""}`
      : graphIssueCount > 0
        ? `${graphIssueCount} inconsistencia${graphIssueCount > 1 ? "s" : ""} en grafo financiero · revisión requerida`
        : cashConfLevel === "LOW"
          ? "Liquidez sin trazabilidad completa · conectar fuentes"
          : unresolvedCount > 10
            ? `${unresolvedCount} relaciones sin resolver · conciliación pendiente`
            : signals.length > 0
              ? signals[0].title
              : graphHealth?.totalNodes
                ? "Estado financiero estable · sin alertas activas"
                : "Datos financieros insuficientes para evaluación";

  // ── Causal context — inject relationship graph root causes into summary ──
  // If causal analysis found root causes, prepend the count to the headline
  const relRootCount = relGraphHealth?.rootCauseCount ?? 0;
  const relUnresolved = relGraphHealth?.unresolvedNodes ?? 0;

  // ── Operational summary — enriched with live runtime events ─────────────
  const opParts: string[] = [];
  if (graphHealth) {
    opParts.push(`Grafo: ${graphHealth.totalNodes} nodos · ${graphHealth.totalEdges} aristas`);
    if (unresolvedCount > 0) opParts.push(`${unresolvedCount} sin resolver`);
  }
  // Causal layer enrichment: root causes and unresolved payments
  if (relRootCount > 0) {
    opParts.push(`${relRootCount} causa${relRootCount !== 1 ? "s" : ""} raíz relacional${relRootCount !== 1 ? "es" : ""}`);
  }
  if (relUnresolved > 0 && relUnresolved !== unresolvedCount) {
    opParts.push(`${relUnresolved} recaudo${relUnresolved !== 1 ? "s" : ""} sin cruzar`);
  }
  if (cashConfLevel !== "HIGH") opParts.push(`Confianza liquidez: ${cashConfLevel}`);
  if (!bankingSnapshot?.hasRealData) opParts.push("Sin banco conectado");

  // FASE 7: Temporal activation awareness
  // If evolution is ready, inject the temporal summary. If insufficient history, say so explicitly.
  const tState = temporalEvolution?.state;
  if (tState && tState !== "INSUFFICIENT_HISTORY" && temporalEvolution?.summary) {
    opParts.push(temporalEvolution.summary);
  } else if (!tState || tState === "INSUFFICIENT_HISTORY") {
    opParts.push("Histórico financiero insuficiente para tendencia.");
  }

  // Inject most recent critical/warning runtime event into summary
  const recentCritical = recentEvents.find(e => e.severity === "critical");
  const recentWarning  = recentEvents.find(e => e.severity === "warning");
  const topEvent       = recentCritical ?? recentWarning;
  if (topEvent) {
    const age = topEvent.ageMinutes < 60
      ? `hace ${topEvent.ageMinutes}m`
      : `hace ${Math.floor(topEvent.ageMinutes / 60)}h`;
    // Detect deterioration vs recovery
    const isRecovery = topEvent.type === "SYNC_RESTORED" || topEvent.type === "GRAPH_RECOVERED";
    if (isRecovery) {
      opParts.push(`${topEvent.title} (${age})`);
    } else if (
      topEvent.confidence !== undefined &&
      topEvent.previousConfidence !== undefined
    ) {
      const prevPct = Math.round(topEvent.previousConfidence * 100);
      const currPct = Math.round(topEvent.confidence         * 100);
      opParts.push(`${topEvent.title} · ${prevPct}% → ${currPct}% (${age})`);
    } else {
      opParts.push(`${topEvent.title} (${age})`);
    }
  }

  const operationalSummary =
    opParts.length > 0 ? opParts.join(" · ") : "Datos operacionales en procesamiento";

  // ── Integrity summary ─────────────────────────────────────────────────────
  const integritySummary = !graphHealth
    ? "Grafo financiero no disponible · estado de integridad desconocido"
    : graphHealth.criticalIssues > 0
      ? `${graphHealth.criticalIssues} inconsistencia${graphHealth.criticalIssues > 1 ? "s" : ""} crítica${graphHealth.criticalIssues > 1 ? "s" : ""} · ${graphHealth.warningIssues} advertencias · ${unresolvedCount} sin resolver`
      : graphHealth.warningIssues > 0
        ? `${graphHealth.warningIssues} advertencias en integridad · ${unresolvedCount} relaciones pendientes`
        : `Integridad verificada · ${graphHealth.totalNodes} nodos · ${unresolvedCount} pendientes`;

  // ── Confidence summary (CRITICAL: must NOT assert stability if LOW) ────────
  const confidenceSummary =
    cashConfLevel === "HIGH"
      ? "Datos de liquidez trazables y actualizados"
      : cashConfLevel === "MEDIUM"
        ? `Trazabilidad parcial · ${cashConf?.reasons[0] ?? "banco o presupuestos incompletos"}`
        : `Confianza baja · ${cashConf?.reasons.slice(0, 2).join(" · ") ?? "fuentes insuficientes"}`;

  // ── Recommended focus — runtime events take highest priority ────────────
  // If a recent critical event exists, it overrides everything else
  const recentCriticalEvent = recentEvents.find(e => e.severity === "critical");
  const recommendedFocus =
    recentCriticalEvent
      ? recentCriticalEvent.summary
      : adapter?.recommendedFocusAreas[0]?.action ??
        priorities[0]?.recommendedAction ??
        "Revisar estado operacional en Finanzas";

  // ── Blockers — merge from both engines ───────────────────────────────────
  const blockingIssues = [
    ...priorities.filter(p => p.severity === "critical" || p.severity === "high").map(p => p.reason),
    ...(adapter?.blockers ?? []),
  ]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);

  // ── Evidence trace from adapter (no double call) ──────────────────────────
  const evidenceTrace = (adapter?.evidenceTrace ?? []).map(e => ({
    source:     e.source,
    state:      e.state as DiegoDataState,
    confidence: e.confidence,
    syncAt:     e.syncAt,
    count:      e.count,
  }));
  const overallConfidencePct = adapter ? Math.round(adapter.confidence * 100) : 0;

  return {
    orgId,
    generatedAt:         new Date(),
    executiveHeadline,
    operationalSummary,
    integritySummary,
    confidenceSummary,
    recommendedFocus,
    blockingIssues,
    signals,
    priorities,
    graphIssueCount,
    cashConfidenceLevel: cashConfLevel,
    unresolvedCount,
    bankSyncStatus,
    dataState,
    evidenceTrace,
    overallConfidencePct,
    causalSummary,
    temporalState:          temporalEvolution?.state,
    temporalSummary:        temporalEvolution?.summary,
    strongestTrendMetric:   temporalEvolution?.strongestTrend?.metric,
    strongestTrendDelta:    temporalEvolution?.strongestTrend?.deltaPct,
    strongestTrendDir:      temporalEvolution?.strongestTrend?.direction,
    recurringPatternType:   temporalEvolution?.mostRepeatedPattern?.type,
    recurringPatternFreq:   temporalEvolution?.mostRepeatedPattern?.frequency,
  };
}

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serialize DiegoExecutiveSummary for client component props.
 * Strips Dates and heavy signal objects — only passes what renders.
 * Evidence trace + confidence are already embedded in summary.
 */
export function serializeDiegoSummary(
  summary: DiegoExecutiveSummary,
): DiegoSummarySerial {
  return {
    executiveHeadline:    summary.executiveHeadline,
    operationalSummary:   summary.operationalSummary,
    integritySummary:     summary.integritySummary,
    confidenceSummary:    summary.confidenceSummary,
    recommendedFocus:     summary.recommendedFocus,
    blockingIssues:       summary.blockingIssues,
    topPriorities:        summary.priorities.slice(0, 3).map(p => ({
      reason:             p.reason,
      severity:           p.severity,
      recommendedAction:  p.recommendedAction,
    })),
    graphIssueCount:      summary.graphIssueCount,
    cashConfidenceLevel:  summary.cashConfidenceLevel,
    unresolvedCount:      summary.unresolvedCount,
    bankSyncStatus:       summary.bankSyncStatus,
    dataState:            summary.dataState,
    signalCount:          summary.signals.length,
    evidenceTrace:         summary.evidenceTrace,
    overallConfidencePct:  summary.overallConfidencePct,
    causalSummary:         summary.causalSummary,
    temporalState:         summary.temporalState,
    temporalSummary:       summary.temporalSummary,
    strongestTrendMetric:  summary.strongestTrendMetric,
    strongestTrendDelta:   summary.strongestTrendDelta,
    strongestTrendDir:     summary.strongestTrendDir,
    recurringPatternType:  summary.recurringPatternType,
    recurringPatternFreq:  summary.recurringPatternFreq,
  };
}
