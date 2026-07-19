/**
 * lib/reconciliation/rules/rule-conflict-classifier.ts
 *
 * AGENTIK-RECON-RULES-ENGINE-01 — Phase 4: Conflict Engine
 *
 * Maps a RuleSetExecutionResult to a reconciliation verdict:
 *   reconciled | partial | pending_review | mismatch | suspicious
 *
 * Design:
 *   - Classification is purely score + rule-group analysis.
 *   - No AI, no probabilistic reasoning.
 *   - Thresholds are explicit constants — not magic numbers.
 *   - Extends the ExceptionType classification surface from engine-types
 *     with a richer operational verdict taxonomy.
 *
 * Verdict semantics:
 *   reconciled     — Score ≥ 85 AND all identity rules passed.
 *                    Automatic reconciliation is safe.
 *   partial        — Score 60–84 OR identity passed but financial failed.
 *                    Likely match but requires amount review.
 *   pending_review — Score 60–84 AND financial rules failed.
 *                    Identity probable but amounts differ — operator must decide.
 *   mismatch       — Score < 60 AND at least one identity rule was evaluated.
 *                    Document identity not confirmed.
 *   suspicious     — Score ≥ 60 BUT financial group failed completely.
 *                    Same document, different amounts — possible fraud/duplicate.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { RuleSetExecutionResult } from "./rule-types";

// ── Verdict type ──────────────────────────────────────────────────────────────

export type ReconciliationVerdict =
  | "reconciled"
  | "partial"
  | "pending_review"
  | "mismatch"
  | "suspicious";

// ── Verdict metadata ──────────────────────────────────────────────────────────

export interface VerdictMeta {
  verdict:       ReconciliationVerdict;
  label:         string;
  /** One-sentence rationale for this verdict. */
  rationale:     string;
  /** Whether this verdict requires operator action before the session can close. */
  requiresAction: boolean;
  /** Severity for display and audit. */
  severity:      "ok" | "watch" | "elevated" | "critical";
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLD_HIGH   = 85;   // score >= this → high confidence
const THRESHOLD_MEDIUM = 60;   // score >= this (and < THRESHOLD_HIGH) → medium

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a RuleSetExecutionResult into a reconciliation verdict.
 *
 * @param result     Output from executeRuleSet()
 * @param sourceA    Label for source A (used in rationale)
 * @param sourceB    Label for source B (used in rationale)
 */
export function classifyConflict(
  result:  RuleSetExecutionResult,
  sourceA: string,
  sourceB: string,
): VerdictMeta {
  const score = result.score.total;

  // Group-level analysis
  const identityPassed    = groupFullyPassed(result, "identity");
  const identityFailed    = groupFullyFailed(result, "identity");
  const identityEvaluated = groupWasEvaluated(result, "identity");
  const financialPassed   = groupFullyPassed(result, "financial");
  const financialFailed   = groupFullyFailed(result, "financial");
  const financialEvaluated = groupWasEvaluated(result, "financial");

  // ── SUSPICIOUS: identity confirmed, financials completely wrong ───────────
  // This is the highest-priority check — a high-score match with financial failure
  // signals a possible duplicate document with different amounts.
  if (score >= THRESHOLD_MEDIUM && identityPassed && financialEvaluated && financialFailed) {
    return {
      verdict:        "suspicious",
      label:          "Sospechoso",
      rationale:      `Identidad del documento confirmada entre ${sourceA} y ${sourceB}, pero los valores financieros no coinciden. Posible duplicado o error de importe.`,
      requiresAction: true,
      severity:       "critical",
    };
  }

  // ── RECONCILED: high score + identity passed ──────────────────────────────
  if (score >= THRESHOLD_HIGH && identityPassed) {
    return {
      verdict:        "reconciled",
      label:          "Conciliado",
      rationale:      `Alta confianza (${score}/100): identidad y valores coinciden entre ${sourceA} y ${sourceB}.`,
      requiresAction: false,
      severity:       "ok",
    };
  }

  // ── PARTIAL: high score but some non-financial rules failed ──────────────
  if (score >= THRESHOLD_HIGH && !identityPassed && !identityFailed) {
    // Identity rules were skipped/partial — financial OK
    return {
      verdict:        "partial",
      label:          "Parcial",
      rationale:      `Score alto (${score}/100) pero algunos campos de identidad no pudieron evaluarse. Verificar manualmente.`,
      requiresAction: true,
      severity:       "watch",
    };
  }

  // ── PENDING_REVIEW: medium score + financial failure ──────────────────────
  if (score >= THRESHOLD_MEDIUM && financialEvaluated && financialFailed) {
    return {
      verdict:        "pending_review",
      label:          "Revisión Pendiente",
      rationale:      `Coincidencia probable (${score}/100) entre ${sourceA} y ${sourceB}, pero los importes difieren. Requiere validación del operador.`,
      requiresAction: true,
      severity:       "elevated",
    };
  }

  // ── PARTIAL: medium score, identity passed, financial passed or skipped ───
  if (score >= THRESHOLD_MEDIUM && identityPassed) {
    return {
      verdict:        "partial",
      label:          "Parcial",
      rationale:      `Coincidencia probable (${score}/100): identidad confirmada pero confianza insuficiente para conciliación automática.`,
      requiresAction: true,
      severity:       "watch",
    };
  }

  // ── MISMATCH: identity evaluated but failed ────────────────────────────────
  if (identityEvaluated && identityFailed) {
    return {
      verdict:        "mismatch",
      label:          "No Coincide",
      rationale:      `Identidad del documento no confirmada entre ${sourceA} y ${sourceB} (${score}/100). Tratar como registro sin cruce.`,
      requiresAction: false,
      severity:       "watch",
    };
  }

  // ── MISMATCH: score below threshold ───────────────────────────────────────
  if (score < THRESHOLD_MEDIUM) {
    return {
      verdict:        "mismatch",
      label:          "No Coincide",
      rationale:      `Puntuación insuficiente (${score}/100) para considerar coincidencia entre ${sourceA} y ${sourceB}.`,
      requiresAction: false,
      severity:       "watch",
    };
  }

  // ── PARTIAL: medium score, ambiguous state ────────────────────────────────
  return {
    verdict:        "partial",
    label:          "Parcial",
    rationale:      `Coincidencia parcial (${score}/100). Revisión manual recomendada.`,
    requiresAction: true,
    severity:       "watch",
  };
}

// ── Group helpers ─────────────────────────────────────────────────────────────

function groupRules(result: RuleSetExecutionResult, group: string) {
  return result.ruleResults.filter(r => r.group === group && r.outcome !== "skipped");
}

function groupWasEvaluated(result: RuleSetExecutionResult, group: string): boolean {
  return groupRules(result, group).length > 0;
}

function groupFullyPassed(result: RuleSetExecutionResult, group: string): boolean {
  const rules = groupRules(result, group);
  return rules.length > 0 && rules.every(r => r.outcome === "passed");
}

function groupFullyFailed(result: RuleSetExecutionResult, group: string): boolean {
  const rules = groupRules(result, group);
  return rules.length > 0 && rules.every(r => r.outcome === "failed");
}
