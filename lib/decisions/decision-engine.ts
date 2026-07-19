/**
 * lib/decisions/decision-engine.ts
 *
 * Agentik — Decision Engine
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * The engine takes a DecisionContext and returns a DecisionEngineResult.
 * It evaluates all active rules against each signal, scores the matches,
 * deduplicates, and produces ordered recommendations.
 *
 * IMPORTANT:
 *   - Does NOT execute actions.
 *   - Does NOT create tasks.
 *   - Does NOT create approvals.
 *   - Does NOT start workflows.
 *   - Does NOT persist anything.
 *   - Does NOT import Prisma, React, or Next.
 *
 * Pure domain. Safe to import from any layer.
 */

import type { DecisionContext }         from "./decision-context";
import type { DecisionSignal }          from "./decision-signals";
import type { DecisionRecommendation }  from "./decision-recommendation";
import type { DecisionEngineResult, DismissedSignal } from "./decision-result";
import type { DecisionRunId, DecisionAuditEvent }     from "./decision-types";

import { getActiveRules, getRulesForSignalType } from "./decision-registry";
import { scoreDecision }                         from "./decision-scoring";
import { validateDecisionContext, validateDecisionSignal, auditDecisionRun, createDecisionAuditEvent } from "./decision-audit";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Deduplication key ─────────────────────────────────────────────────────────

function deduplicationKey(rec: DecisionRecommendation): string {
  const entityPart = rec.relatedEntity
    ? `${rec.relatedEntity.type}:${rec.relatedEntity.id}`
    : "no_entity";
  const workflowPart = (rec.suggestedPayload?.workflowId as string) ?? "no_workflow";
  return `${rec.domain}|${rec.actionType}|${entityPart}|${workflowPart}`;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicateRecommendations(
  recs:      DecisionRecommendation[],
  audit:     DecisionAuditEvent[],
  runId:     DecisionRunId,
): DecisionRecommendation[] {
  const seen   = new Map<string, DecisionRecommendation>();
  const result: DecisionRecommendation[] = [];

  // recs are already sorted by score desc
  for (const rec of recs) {
    const key = deduplicationKey(rec);
    if (!seen.has(key)) {
      seen.set(key, rec);
      result.push(rec);
    } else {
      audit.push(createDecisionAuditEvent(
        runId,
        "recommendation_deduplicated",
        `Deduplicated: ${rec.actionType} for ${key} (lower score ${rec.score} vs ${seen.get(key)!.score})`,
        { deduplicationKey: key, keptId: seen.get(key)!.id, removedId: rec.id },
      ));
    }
  }

  return result;
}

// ── Recommendation builder ────────────────────────────────────────────────────

function buildRecommendation(
  runId:     DecisionRunId,
  signal:    DecisionSignal,
  ruleId:    string,
  ruleMeta:  {
    domain:            DecisionRecommendation["domain"];
    recommendedAction: DecisionRecommendation["actionType"];
    severity:          DecisionRecommendation["severity"];
    confidence:        DecisionRecommendation["confidence"];
    requiresApproval:  boolean;
    canAutoExecute:    boolean;
    name:              string;
    description:       string;
    metadata?:         Record<string, unknown>;
  },
  breakdown: ReturnType<typeof scoreDecision>,
): DecisionRecommendation {
  const navTarget = ruleMeta.metadata?.navigationTarget as string | undefined;
  const suggestedWorkflow = ruleMeta.metadata?.suggestedWorkflow as string | undefined;

  return {
    id:            nextId("drec") as DecisionRecommendation["id"],
    decisionRunId: runId,
    signalId:      signal.id,
    ruleId:        ruleId as DecisionRecommendation["ruleId"],
    domain:        ruleMeta.domain,
    title:         `${ruleMeta.name}: ${signal.title}`,
    description:   signal.description || ruleMeta.description,
    actionType:    ruleMeta.recommendedAction,
    severity:      ruleMeta.severity,
    confidence:    ruleMeta.confidence,
    score:         breakdown.finalScore,
    scoreBreakdown: {
      severityWeight:       breakdown.severityWeight,
      confidenceWeight:     breakdown.confidenceWeight,
      urgencyWeight:        breakdown.urgencyWeight,
      businessImpactWeight: breakdown.businessImpactWeight,
      duplicationPenalty:   breakdown.duplicationPenalty,
    },
    reasoning:           `Rule "${ruleMeta.name}" matched signal "${signal.type}" with severity ${signal.severity}.`,
    businessImpact:      signal.metrics?.monetaryAmount
      ? `Impacto estimado: ${signal.metrics.currency ?? ""}${signal.metrics.monetaryAmount.toLocaleString()}`
      : undefined,
    recommendedNextStep: ruleMeta.description,
    requiresApproval:    ruleMeta.requiresApproval,
    canAutoExecute:      ruleMeta.canAutoExecute,
    navigationTarget:    navTarget,
    relatedEntity:       signal.entityType && signal.entityId
      ? { type: signal.entityType, id: signal.entityId }
      : undefined,
    suggestedPayload: {
      signalType:       signal.type,
      signalId:         signal.id,
      domain:           ruleMeta.domain,
      ...(suggestedWorkflow ? { workflowId: suggestedWorkflow } : {}),
    },
    metadata:    ruleMeta.metadata,
    generatedAt: new Date().toISOString(),
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runDecisionEngine(context: DecisionContext): DecisionEngineResult {
  const runId          = nextId("drun") as DecisionRunId;
  const audit:          DecisionAuditEvent[] = [];
  const errors:         string[] = [];
  const warnings:       string[] = [];
  const dismissedSignals: DismissedSignal[] = [];
  const rawRecs:        DecisionRecommendation[] = [];

  // ── 1. Validate context ──────────────────────────────────────────────────

  audit.push(createDecisionAuditEvent(runId, "engine_started",
    `Decision engine started for org=${context.orgSlug} agent=${context.agentId}`,
  ));

  const ctxValidation = validateDecisionContext(context);
  if (!ctxValidation.valid) {
    ctxValidation.errors.forEach(e => errors.push(e));
    audit.push(createDecisionAuditEvent(runId, "validation_error",
      `Context validation failed: ${ctxValidation.errors.join("; ")}`,
    ));
    return {
      success:          false,
      message:          `Context validation failed: ${ctxValidation.errors.join("; ")}`,
      runId,
      recommendations:  [],
      dismissedSignals: [],
      auditTrail:       audit,
      errors,
      warnings,
    };
  }
  ctxValidation.warnings.forEach(w => warnings.push(w));

  audit.push(createDecisionAuditEvent(runId, "context_validated",
    `Context valid: ${context.signals.length} signals, ${context.activeTasks.length} active tasks, ${context.pendingApprovals.length} pending approvals`,
  ));

  // ── 2. Load active rules ─────────────────────────────────────────────────

  const activeRules = getActiveRules();

  // ── 3. Evaluate each signal against matching rules ───────────────────────

  for (const signal of context.signals) {
    const sigValidation = validateDecisionSignal(signal);
    if (!sigValidation.valid) {
      warnings.push(`Signal ${signal.id} invalid: ${sigValidation.errors.join("; ")}`);
      dismissedSignals.push({
        signalId:    signal.id,
        reason:      `Invalid signal: ${sigValidation.errors.join("; ")}`,
        dismissedAt: new Date().toISOString(),
      });
      continue;
    }

    const matchingRules = getRulesForSignalType(signal.type)
      .filter(r => activeRules.some(ar => ar.id === r.id));

    let matchedCount = 0;

    for (const rule of matchingRules) {
      let conditionResult = false;
      try {
        conditionResult = rule.condition(context, signal);
      } catch {
        warnings.push(`Rule ${rule.id} condition threw for signal ${signal.id} — skipped`);
        audit.push(createDecisionAuditEvent(runId, "rule_skipped",
          `Rule ${rule.id} condition threw — skipped`,
          { ruleId: rule.id, signalId: signal.id },
        ));
        continue;
      }

      if (!conditionResult) {
        audit.push(createDecisionAuditEvent(runId, "rule_skipped",
          `Rule ${rule.id} condition false for signal ${signal.type}`,
          { ruleId: rule.id, signalType: signal.type },
        ));
        continue;
      }

      // Rule matched — score and generate recommendation
      const breakdown = scoreDecision(context, signal, rule);

      const rec = buildRecommendation(runId, signal, rule.id, {
        domain:            rule.domain,
        recommendedAction: rule.recommendedAction,
        severity:          rule.severity,
        confidence:        rule.confidence,
        requiresApproval:  rule.requiresApproval,
        canAutoExecute:    rule.canAutoExecute,
        name:              rule.name,
        description:       rule.description,
        metadata:          rule.metadata,
      }, breakdown);

      rawRecs.push(rec);
      matchedCount++;

      audit.push(createDecisionAuditEvent(runId, "rule_matched",
        `Rule ${rule.id} matched signal ${signal.type} → ${rule.recommendedAction} (score=${breakdown.finalScore})`,
        { ruleId: rule.id, signalId: signal.id, score: breakdown.finalScore, action: rule.recommendedAction },
      ));
    }

    if (matchedCount === 0 && matchingRules.length > 0) {
      dismissedSignals.push({
        signalId:    signal.id,
        reason:      "No rule conditions matched",
        dismissedAt: new Date().toISOString(),
      });
    } else if (matchingRules.length === 0) {
      dismissedSignals.push({
        signalId:    signal.id,
        reason:      `No active rules for signal type "${signal.type}"`,
        dismissedAt: new Date().toISOString(),
      });
    }
  }

  audit.push(createDecisionAuditEvent(runId, "signals_evaluated",
    `Evaluated ${context.signals.length} signals against ${activeRules.length} rules — ${rawRecs.length} raw recommendations`,
  ));

  // ── 4. Sort by score descending ──────────────────────────────────────────

  rawRecs.sort((a, b) => b.score - a.score);

  // ── 5. Deduplicate ───────────────────────────────────────────────────────

  const recommendations = deduplicateRecommendations(rawRecs, audit, runId);

  audit.push(createDecisionAuditEvent(runId, "scoring_completed",
    `Scoring complete: ${recommendations.length} final recommendations after deduplication`,
    { topScore: recommendations[0]?.score ?? 0 },
  ));

  // ── 6. Run audit ─────────────────────────────────────────────────────────

  const runAudit = auditDecisionRun(runId, {
    signalCount:         context.signals.length,
    recommendationCount: recommendations.length,
    dismissedCount:      dismissedSignals.length,
    errors,
    warnings,
  });
  runAudit.warnings.forEach(w => {
    if (!warnings.includes(w)) warnings.push(w);
  });

  // ── 7. Complete ──────────────────────────────────────────────────────────

  audit.push(createDecisionAuditEvent(runId, "engine_completed",
    `Decision engine completed: ${recommendations.length} recommendations, ${dismissedSignals.length} dismissed`,
    { recommendationCount: recommendations.length, dismissedCount: dismissedSignals.length },
  ));

  return {
    success:          true,
    message:          `Decision engine completed: ${recommendations.length} recommendations`,
    runId,
    recommendations,
    dismissedSignals,
    auditTrail:       audit,
    errors,
    warnings,
  };
}
