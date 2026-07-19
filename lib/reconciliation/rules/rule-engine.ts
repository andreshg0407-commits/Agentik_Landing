/**
 * lib/reconciliation/rules/rule-engine.ts
 *
 * AGENTIK-RECON-RULES-ENGINE-01 — Phase 2: Match Confidence Engine
 *
 * Evaluates a set of ReconciliationRules against a CanonicalReconRecord pair
 * and produces a RuleSetExecutionResult with deterministic score.
 *
 * Design:
 *   - Each rule's conditions are evaluated sequentially.
 *   - ALL conditions in a rule must pass for outcome "passed".
 *   - If partial weight is defined and ≥1 conditions passed → "partial".
 *   - Otherwise → "failed".
 *   - Disabled rules → "skipped".
 *   - Score items are compatible with engine-types MatchScore.
 *   - No AI, no probability estimation, no external calls.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";
import type {
  ReconciliationRule,
  RuleCondition,
  RuleExecutionResult,
  RuleSetExecutionResult,
  ConditionEvaluationResult,
  ConditionOutcome,
  RuleOutcome,
} from "./rule-types";
import type { ScoreItem } from "../engine/engine-types";
import {
  normalizeDocumentNumber,
  normalizeThirdPartyId,
  normalizeText,
  amountsWithinTolerance,
  parseDate,
  dateDiffDays,
} from "../engine/normalization";

// ── Field extraction ──────────────────────────────────────────────────────────

function extractField(
  record: CanonicalReconRecord,
  field:  string,
): string | number | null {
  switch (field) {
    case "documentNumber": return record.documentNumber ?? null;
    case "amount":         return record.amount;
    case "thirdPartyId":   return record.thirdPartyId ?? null;
    case "thirdPartyName": return record.thirdPartyName ?? null;
    case "reference":      return record.reference ?? null;
    case "date":           return record.date ?? null;
    default:               return null;
  }
}

function asString(v: string | number | null): string {
  if (v === null) return "";
  return String(v);
}

// ── Condition evaluator ───────────────────────────────────────────────────────

function evaluateCondition(
  condition: RuleCondition,
  recordA:   CanonicalReconRecord,
  recordB:   CanonicalReconRecord,
): ConditionEvaluationResult {
  const rawA = extractField(recordA, condition.sourceField);
  const rawB = extractField(recordB, condition.targetField);

  // Missing field → skipped
  if (rawA === null || rawB === null) {
    return {
      sourceField: condition.sourceField,
      targetField: condition.targetField,
      operator:    condition.operator,
      outcome:     "skipped",
      valueA:      rawA,
      valueB:      rawB,
      reason:      `Campo "${condition.sourceField}" o "${condition.targetField}" ausente en registro`,
    };
  }

  const normalize = condition.normalize !== false;

  switch (condition.operator) {
    case "equals":
    case "exact_match": {
      let vA = asString(rawA);
      let vB = asString(rawB);
      if (normalize) {
        vA = normalizeDocumentNumber(vA) || normalizeText(vA);
        vB = normalizeDocumentNumber(vB) || normalizeText(vB);
      }
      const passed = vA !== "" && vB !== "" && vA === vB;
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    condition.operator,
        outcome:     passed ? "passed" : "failed",
        valueA:      vA,
        valueB:      vB,
        reason:      passed
          ? `${condition.sourceField} idéntico (${vA})`
          : `${condition.sourceField} no coincide (A: ${vA}, B: ${vB})`,
      };
    }

    case "contains": {
      let vA = asString(rawA);
      let vB = asString(rawB);
      if (normalize) { vA = normalizeText(vA); vB = normalizeText(vB); }
      const passed = vA.length > 0 && vB.length > 0 && vA.includes(vB);
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    "contains",
        outcome:     passed ? "passed" : "failed",
        valueA:      vA,
        valueB:      vB,
        reason:      passed
          ? `${condition.sourceField} contiene "${vB}"`
          : `${condition.sourceField} no contiene "${vB}"`,
      };
    }

    case "starts_with": {
      let vA = asString(rawA);
      let vB = asString(rawB);
      if (normalize) { vA = normalizeText(vA); vB = normalizeText(vB); }
      const passed = vA.length > 0 && vB.length > 0 && vA.startsWith(vB);
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    "starts_with",
        outcome:     passed ? "passed" : "failed",
        valueA:      vA,
        valueB:      vB,
        reason:      passed
          ? `${condition.sourceField} inicia con "${vB}"`
          : `${condition.sourceField} no inicia con "${vB}"`,
      };
    }

    case "numeric_tolerance": {
      const numA = typeof rawA === "number" ? rawA : parseFloat(asString(rawA));
      const numB = typeof rawB === "number" ? rawB : parseFloat(asString(rawB));
      if (isNaN(numA) || isNaN(numB)) {
        return {
          sourceField: condition.sourceField,
          targetField: condition.targetField,
          operator:    "numeric_tolerance",
          outcome:     "skipped",
          valueA:      rawA,
          valueB:      rawB,
          reason:      `Valor no numérico en ${condition.sourceField}`,
        };
      }
      const tol    = condition.tolerance ?? 0.001;
      const passed = amountsWithinTolerance(numA, numB, tol);
      const delta  = Math.abs(numA - numB);
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    "numeric_tolerance",
        outcome:     passed ? "passed" : "failed",
        valueA:      numA,
        valueB:      numB,
        reason:      passed
          ? `${condition.sourceField} dentro de tolerancia ${(tol * 100).toFixed(2)}% (Δ ${delta.toFixed(2)})`
          : `${condition.sourceField} fuera de tolerancia (A: ${numA.toFixed(2)}, B: ${numB.toFixed(2)}, Δ ${delta.toFixed(2)})`,
      };
    }

    case "date_window": {
      const dateA = parseDate(asString(rawA));
      const dateB = parseDate(asString(rawB));
      const diff  = dateDiffDays(dateA, dateB);
      if (diff === null) {
        return {
          sourceField: condition.sourceField,
          targetField: condition.targetField,
          operator:    "date_window",
          outcome:     "skipped",
          valueA:      rawA,
          valueB:      rawB,
          reason:      `Fecha inválida en ${condition.sourceField} o ${condition.targetField}`,
        };
      }
      const window  = condition.windowDays ?? 3;
      const passed  = diff <= window;
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    "date_window",
        outcome:     passed ? "passed" : "failed",
        valueA:      asString(rawA),
        valueB:      asString(rawB),
        reason:      passed
          ? diff === 0
            ? `Misma fecha de ${condition.sourceField}`
            : `Fecha con diferencia de ${diff} día${diff !== 1 ? "s" : ""} (dentro de ventana ${window}d)`
          : `Diferencia de fecha ${diff} días supera ventana de ${window} días`,
      };
    }

    default: {
      return {
        sourceField: condition.sourceField,
        targetField: condition.targetField,
        operator:    condition.operator,
        outcome:     "skipped",
        valueA:      rawA,
        valueB:      rawB,
        reason:      `Operador desconocido: ${condition.operator}`,
      };
    }
  }
}

// ── Rule evaluator ────────────────────────────────────────────────────────────

function evaluateRule(
  rule:    ReconciliationRule,
  recordA: CanonicalReconRecord,
  recordB: CanonicalReconRecord,
): RuleExecutionResult {
  if (!rule.enabled) {
    return {
      ruleId:     rule.ruleId,
      ruleLabel:  rule.label,
      group:      rule.group,
      outcome:    "skipped",
      scoreItem:  null,
      conditions: [],
      summary:    `Regla "${rule.label}" deshabilitada — omitida`,
    };
  }

  const condResults: ConditionEvaluationResult[] = rule.conditions.map(c =>
    evaluateCondition(c, recordA, recordB),
  );

  const evaluated  = condResults.filter(c => c.outcome !== "skipped");
  const passed     = condResults.filter(c => c.outcome === "passed");
  const allSkipped = evaluated.length === 0;

  let outcome: RuleOutcome;
  let points = 0;

  if (allSkipped) {
    outcome = "skipped";
  } else if (passed.length === evaluated.length) {
    outcome = "passed";
    points  = rule.weight.maxPoints;
  } else if (passed.length > 0 && rule.weight.partial !== undefined && rule.weight.partial > 0) {
    outcome = "partial";
    points  = Math.round(rule.weight.maxPoints * rule.weight.partial);
  } else {
    outcome = "failed";
    points  = 0;
  }

  const scoreItem: ScoreItem | null = points > 0
    ? { field: rule.ruleId, points, reason: rule.label }
    : null;

  // Build summary sentence
  let summary: string;
  if (outcome === "passed") {
    summary = `"${rule.label}" — PASÓ (${points} pts): ${passed.map(c => c.reason).join(" · ")}`;
  } else if (outcome === "partial") {
    summary = `"${rule.label}" — PARCIAL (${points} pts): ${passed.length}/${evaluated.length} condiciones`;
  } else if (outcome === "failed") {
    const failReasons = condResults.filter(c => c.outcome === "failed").map(c => c.reason);
    summary = `"${rule.label}" — FALLÓ: ${failReasons.join(" · ")}`;
  } else {
    summary = `"${rule.label}" — OMITIDA (campos ausentes o regla deshabilitada)`;
  }

  return { ruleId: rule.ruleId, ruleLabel: rule.label, group: rule.group, outcome, scoreItem, conditions: condResults, summary };
}

// ── Rule set executor ─────────────────────────────────────────────────────────

/**
 * Evaluate all rules in a rule set against a CanonicalReconRecord pair.
 *
 * Rules are sorted by priority (ascending) then by group order before evaluation.
 * The result is a RuleSetExecutionResult with a MatchScore compatible breakdown.
 */
export function executeRuleSet(
  rules:   ReconciliationRule[],
  recordA: CanonicalReconRecord,
  recordB: CanonicalReconRecord,
): RuleSetExecutionResult {
  const GROUP_ORDER: Record<string, number> = {
    identity: 0, financial: 1, temporal: 2, counterpart: 3, custom: 4,
  };

  const sorted = [...rules].sort((a, b) => {
    const ga = GROUP_ORDER[a.group] ?? 99;
    const gb = GROUP_ORDER[b.group] ?? 99;
    if (ga !== gb) return ga - gb;
    return (a.priority ?? 99) - (b.priority ?? 99);
  });

  const ruleResults = sorted.map(r => evaluateRule(r, recordA, recordB));

  const scoreBreakdown: ScoreItem[] = ruleResults
    .filter(r => r.scoreItem !== null)
    .map(r => r.scoreItem!);

  const rawTotal = scoreBreakdown.reduce((s, i) => s + i.points, 0);
  const total    = Math.min(100, rawTotal);

  return {
    evaluatedAt:    new Date().toISOString(),
    rulesEvaluated: ruleResults.filter(r => r.outcome !== "skipped").length,
    rulesPassed:    ruleResults.filter(r => r.outcome === "passed").length,
    rulesPartial:   ruleResults.filter(r => r.outcome === "partial").length,
    rulesFailed:    ruleResults.filter(r => r.outcome === "failed").length,
    rulesSkipped:   ruleResults.filter(r => r.outcome === "skipped").length,
    ruleResults,
    score: { total, breakdown: scoreBreakdown },
  };
}
