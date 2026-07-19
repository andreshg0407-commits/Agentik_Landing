/**
 * dashboard-pipeline.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Pipeline that assembles dashboard state from engine outputs.
 *
 * This file ONLY maps engine outputs → dashboard types.
 * It does NOT calculate business intelligence.
 *
 * No Prisma. No server-only. Pure domain types.
 */

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
  BusinessHealthLevel,
} from "./dashboard-types";
import type { BusinessSignal } from "@/lib/business-signals";
import type { BusinessEvent } from "@/lib/business-events";
import type { RuleEvaluationResult } from "@/lib/business-rules";
import type { BusinessPlan } from "@/lib/business-planning";
import type { BusinessDecision } from "@/lib/business-decisions";
import type { BusinessAction } from "@/lib/business-actions";

// -- Signal Mapping -----------------------------------------------------------

/** Map signals to category summaries. */
export function mapSignalsToSummaries(signals: BusinessSignal[]): SignalCategorySummary[] {
  const byCategory = new Map<string, BusinessSignal[]>();
  for (const s of signals) {
    const list = byCategory.get(s.category) ?? [];
    list.push(s);
    byCategory.set(s.category, list);
  }

  return Array.from(byCategory.entries()).map(([category, sigs]) => ({
    category,
    label: categoryLabel(category),
    total: sigs.length,
    bySeverity: {
      critical: sigs.filter(s => s.severity === "critical").length,
      high:     sigs.filter(s => s.severity === "high").length,
      medium:   sigs.filter(s => s.severity === "medium").length,
      low:      sigs.filter(s => s.severity === "low").length,
      info:     sigs.filter(s => s.severity === "info").length,
    },
  }));
}

// -- Event Mapping ------------------------------------------------------------

/** Map events to timeline entries. */
export function mapEventsToTimeline(events: BusinessEvent[]): ExecutiveTimelineEntry[] {
  return events.map(e => ({
    timestamp: e.occurredAt,
    timeLabel: formatTime(e.occurredAt),
    entryType: "event" as const,
    title: e.payload.summary || String(e.eventType),
    subtitle: `${e.category} — ${e.eventType}`,
    severity: mapSeverity(e.severity),
    sourceId: e.eventId,
    sourceType: "event",
  }));
}

/** Map signals to timeline entries. */
export function mapSignalsToTimeline(signals: BusinessSignal[]): ExecutiveTimelineEntry[] {
  return signals.map(s => ({
    timestamp: s.createdAt,
    timeLabel: formatTime(s.createdAt),
    entryType: "signal" as const,
    title: s.title,
    subtitle: `${s.category} — ${s.type}`,
    severity: mapSeverity(s.severity),
    sourceId: s.signalId,
    sourceType: "signal",
  }));
}

// -- Rule Mapping -------------------------------------------------------------

/** Map rule evaluation results to summary cards. */
export function mapRulesToCards(results: RuleEvaluationResult[]): RuleSummaryCard[] {
  const cards: RuleSummaryCard[] = [];
  for (const result of results) {
    for (const evaluation of result.matchedEvaluations) {
      cards.push({
        ruleId: evaluation.ruleId,
        name: evaluation.ruleName,
        reason: evaluation.suggestedOutcome?.summary ?? "Regla aplicada",
        severity: evaluation.suggestedOutcome?.severity ?? "info",
        confidence: evaluation.evidence.confidence,
        evidenceSummary: evaluation.evidence.confidenceReason,
      });
    }
  }
  return cards;
}

// -- Plan Mapping -------------------------------------------------------------

/** Map plans to summary cards. */
export function mapPlansToCards(plans: BusinessPlan[]): PlanSummaryCard[] {
  return plans.map(plan => {
    const recommended = plan.alternatives.find(a => a.alternativeId === plan.selectedAlternativeId);
    return {
      planId: plan.planId,
      title: plan.title,
      alternativeCount: plan.alternatives.length,
      recommendedAlternative: recommended?.title ?? "—",
      benefit: recommended?.benefits.map(b => b.description).join(", ") || "—",
      cost: recommended?.costs.map(c => `${c.amount} ${c.unit}`).join(", ") || "—",
      risk: recommended?.risks.map(r => r.title).join(", ") || "—",
      estimatedDuration: recommended?.estimatedDuration || "—",
      dependencyCount: recommended?.dependencies.length ?? 0,
      confidence: plan.confidence,
      severity: plan.severity,
    };
  });
}

// -- Decision Mapping ---------------------------------------------------------

/** Map decisions to summary cards. */
export function mapDecisionsToCards(decisions: BusinessDecision[]): DecisionSummaryCard[] {
  return decisions.map(d => {
    const recommended = d.options.find(o => o.optionId === d.recommendedOptionId);
    return {
      decisionId: d.decisionId,
      title: d.title,
      recommendation: recommended?.title ?? "—",
      justification: d.justification.summary,
      optionCount: d.options.length,
      tradeoffCount: d.tradeoffs.length,
      confidence: d.confidence.score,
      confidenceLevel: d.confidence.level,
      requiresApproval: d.approval.required,
      severity: d.severity,
    };
  });
}

// -- Action Mapping -----------------------------------------------------------

/** Map actions to summary cards. */
export function mapActionsToCards(actions: BusinessAction[]): ActionSummaryCard[] {
  return actions.map(a => ({
    actionId: a.actionId,
    title: a.title,
    actionType: a.actionType,
    status: a.status,
    approvalStatus: a.approval.status,
    requiresApproval: a.approval.required,
    executionMode: a.policy?.dryRunOnly ? "dry_run" : "pending",
  }));
}

// -- Health -------------------------------------------------------------------

/** Derive health level from signals and decisions. */
export function deriveHealthLevel(
  signals: BusinessSignal[],
  decisions: BusinessDecision[],
): { level: BusinessHealthLevel; score: number; riskLevel: string; confidence: number } {
  const criticalSignals = signals.filter(s => s.severity === "critical").length;
  const highSignals = signals.filter(s => s.severity === "high").length;
  const criticalDecisions = decisions.filter(d => d.severity === "critical").length;

  let score = 100;
  score -= criticalSignals * 20;
  score -= highSignals * 10;
  score -= criticalDecisions * 15;
  score = Math.max(0, Math.min(100, score));

  let level: BusinessHealthLevel = "excellent";
  if (score < 30) level = "critical";
  else if (score < 50) level = "warning";
  else if (score < 70) level = "caution";
  else if (score < 85) level = "good";

  const riskLevel = criticalSignals > 0 ? "alto" : highSignals > 0 ? "medio" : "bajo";
  const confidence = signals.length > 0 ? 75 : 50;

  return { level, score, riskLevel, confidence };
}

// -- Trace Chain --------------------------------------------------------------

/** Build trace chain from correlated artifacts. */
export function buildTraceChain(opts: {
  signal?: BusinessSignal;
  event?: BusinessEvent;
  ruleResult?: RuleEvaluationResult;
  plan?: BusinessPlan;
  decision?: BusinessDecision;
  action?: BusinessAction;
}): BusinessTraceChain {
  const matchedRule = opts.ruleResult?.matchedEvaluations[0];
  const recommended = opts.plan?.alternatives.find(a => a.alternativeId === opts.plan?.selectedAlternativeId);

  return {
    entityLabel: opts.signal?.entityId ?? "—",
    entityType: opts.signal?.entityType ?? "—",
    signalTitle: opts.signal?.title ?? "—",
    signalSeverity: opts.signal?.severity ?? "—",
    eventType: opts.event?.eventType ?? "—",
    eventSummary: opts.event?.payload.summary ?? "—",
    ruleName: matchedRule?.ruleName ?? "—",
    ruleConfidence: matchedRule?.evidence.confidence ?? 0,
    planTitle: opts.plan?.title ?? "—",
    planAlternatives: opts.plan?.alternatives.length ?? 0,
    decisionTitle: opts.decision?.title ?? "—",
    decisionConfidence: opts.decision?.confidence.score ?? 0,
    actionTitle: opts.action?.title ?? "—",
    actionStatus: opts.action?.status ?? "—",
  };
}

// -- Full Assembly ------------------------------------------------------------

/** Assemble complete dashboard state from all engine outputs. */
export function assembleDashboardState(opts: {
  orgSlug: string;
  signals: BusinessSignal[];
  events: BusinessEvent[];
  ruleResults: RuleEvaluationResult[];
  plans: BusinessPlan[];
  decisions: BusinessDecision[];
  actions: BusinessAction[];
  kpis?: ExecutiveKpiCard[];
  traces?: BusinessTraceChain[];
}): ExecutiveDashboardState {
  const signalSummaries = mapSignalsToSummaries(opts.signals);
  const health = deriveHealthLevel(opts.signals, opts.decisions);

  // Build timeline: signals + events + rules + plans + decisions + actions
  const timeline: ExecutiveTimelineEntry[] = [
    ...mapSignalsToTimeline(opts.signals),
    ...mapEventsToTimeline(opts.events),
    ...opts.ruleResults.flatMap(r => r.matchedEvaluations.map(e => ({
      timestamp: e.evaluatedAt,
      timeLabel: formatTime(e.evaluatedAt),
      entryType: "rule" as const,
      title: `Regla: ${e.ruleName}`,
      subtitle: e.suggestedOutcome?.summary ?? "",
      severity: mapSeverity(e.suggestedOutcome?.severity ?? "info"),
      sourceId: e.ruleId,
      sourceType: "rule",
    }))),
    ...opts.plans.map(p => ({
      timestamp: p.createdAt,
      timeLabel: formatTime(p.createdAt),
      entryType: "plan" as const,
      title: `Plan: ${p.title}`,
      subtitle: `${p.alternatives.length} alternativa(s)`,
      severity: mapSeverity(p.severity),
      sourceId: p.planId,
      sourceType: "plan",
    })),
    ...opts.decisions.map(d => ({
      timestamp: d.createdAt,
      timeLabel: formatTime(d.createdAt),
      entryType: "decision" as const,
      title: `Decision: ${d.title}`,
      subtitle: d.justification.summary,
      severity: mapSeverity(d.severity),
      sourceId: d.decisionId,
      sourceType: "decision",
    })),
    ...opts.actions.map(a => ({
      timestamp: a.createdAt,
      timeLabel: formatTime(a.createdAt),
      entryType: "action" as const,
      title: `Accion: ${a.title}`,
      subtitle: `${a.actionType} — ${a.status}`,
      severity: "info" as const,
      sourceId: a.actionId,
      sourceType: "action",
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Daily summary
  const totalSignals = opts.signals.length;
  const totalRules = opts.ruleResults.reduce((s, r) => s + r.totalMatched, 0);
  const totalPlans = opts.plans.length;
  const totalDecisions = opts.decisions.length;
  const totalActions = opts.actions.length;
  const dailySummary = `${totalSignals} signal(es), ${totalRules} regla(s) aplicada(s), ${totalPlans} plan(es), ${totalDecisions} decision(es), ${totalActions} accion(es) preparada(s)`;

  return {
    orgSlug: opts.orgSlug,
    assembledAt: new Date().toISOString(),
    health,
    kpis: opts.kpis ?? [],
    signals: signalSummaries,
    timeline,
    rules: mapRulesToCards(opts.ruleResults),
    plans: mapPlansToCards(opts.plans),
    decisions: mapDecisionsToCards(opts.decisions),
    actions: mapActionsToCards(opts.actions),
    traces: opts.traces ?? [],
    dailySummary,
  };
}

// -- Helpers ------------------------------------------------------------------

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    inventory: "Inventario", production: "Produccion", commercial: "Comercial",
    collection: "Cobranza", customer: "Clientes", vendor: "Vendedores",
    portfolio: "Maletas", financial: "Finanzas", marketing: "Marketing",
    sync: "Sincronizacion", workflow: "Workflow", executive: "Ejecutivo", system: "Sistema",
  };
  return labels[cat] ?? cat;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function mapSeverity(sev: string): "info" | "low" | "medium" | "high" | "critical" {
  if (sev === "critical") return "critical";
  if (sev === "high") return "high";
  if (sev === "medium") return "medium";
  if (sev === "low") return "low";
  return "info";
}
