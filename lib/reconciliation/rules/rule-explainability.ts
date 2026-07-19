/**
 * lib/reconciliation/rules/rule-explainability.ts
 *
 * AGENTIK-RECON-RULES-ENGINE-01 — Phase 3: Explainability Engine
 *
 * Converts a RuleSetExecutionResult into human-readable audit narratives.
 *
 * Design:
 *   - Deterministic: same inputs → same explanation always.
 *   - No AI, no probabilistic language, no approximation.
 *   - Outputs are suitable for: operator review panels, audit PDFs,
 *     governance snapshots, and session audit events.
 *   - Reuses the ScoreItem pattern from engine-types for compatibility.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { RuleSetExecutionResult, RuleExecutionResult } from "./rule-types";
import { confidenceFromScore } from "../engine/scoring";

// ── Public output types ───────────────────────────────────────────────────────

export interface RuleExplanation {
  /** Top-line verdict sentence for display in tables and audit trails. */
  headline:       string;
  /**
   * Ordered array of human-readable reasons.
   * Ordered: passed rules first (strongest points), then partial, then failed.
   */
  reasons:        string[];
  /**
   * Structured groups for detailed explainability panels.
   * One entry per RuleGroup present in the result.
   */
  groups:         RuleGroupExplanation[];
  /** One-sentence confidence assessment. */
  confidenceNote: string;
  /** Raw confidence tier. */
  confidence:     "high" | "medium" | "low";
  /** Total score (0–100). */
  score:          number;
}

export interface RuleGroupExplanation {
  group:        string;
  groupLabel:   string;
  passed:       string[];
  partial:      string[];
  failed:       string[];
  contribution: number;  // total points from this group
}

// ── Group label map ───────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  identity:    "Identidad del documento",
  financial:   "Valores financieros",
  temporal:    "Fechas y periodos",
  counterpart: "Tercero / contraparte",
  custom:      "Reglas personalizadas",
};

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a human-readable explanation from a RuleSetExecutionResult.
 *
 * @param result     Output from executeRuleSet()
 * @param sourceA    Label for source A (e.g. "SAG Ventas")
 * @param sourceB    Label for source B (e.g. "Banco Davivienda")
 */
export function buildRuleExplanation(
  result:  RuleSetExecutionResult,
  sourceA: string,
  sourceB: string,
): RuleExplanation {
  const score      = result.score.total;
  const confidence = confidenceFromScore(score);

  // ── Reasons list (ordered by points descending) ──────────────────────────
  const reasons: string[] = result.ruleResults
    .filter(r => r.outcome === "passed" || r.outcome === "partial")
    .sort((a, b) => (b.scoreItem?.points ?? 0) - (a.scoreItem?.points ?? 0))
    .map(r => r.summary);

  const failedReasons = result.ruleResults
    .filter(r => r.outcome === "failed")
    .map(r => r.summary);

  // Failed reasons appended last
  const allReasons = [...reasons, ...failedReasons];

  // ── Per-group breakdown ──────────────────────────────────────────────────
  const groupMap = new Map<string, RuleExecutionResult[]>();
  for (const r of result.ruleResults) {
    if (!groupMap.has(r.group)) groupMap.set(r.group, []);
    groupMap.get(r.group)!.push(r);
  }

  const groups: RuleGroupExplanation[] = [];
  for (const [group, rules] of groupMap.entries()) {
    groups.push({
      group,
      groupLabel:   GROUP_LABELS[group] ?? group,
      passed:       rules.filter(r => r.outcome === "passed").map(r => r.summary),
      partial:      rules.filter(r => r.outcome === "partial").map(r => r.summary),
      failed:       rules.filter(r => r.outcome === "failed").map(r => r.summary),
      contribution: rules.reduce((s, r) => s + (r.scoreItem?.points ?? 0), 0),
    });
  }

  // Sort groups by contribution desc
  groups.sort((a, b) => b.contribution - a.contribution);

  // ── Headline ─────────────────────────────────────────────────────────────
  const headline = buildHeadline(score, confidence, result, sourceA, sourceB);

  // ── Confidence note ───────────────────────────────────────────────────────
  const confidenceNote = buildConfidenceNote(score, confidence, result);

  return { headline, reasons: allReasons, groups, confidenceNote, confidence, score };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildHeadline(
  score:      number,
  confidence: "high" | "medium" | "low",
  result:     RuleSetExecutionResult,
  sourceA:    string,
  sourceB:    string,
): string {
  const passed  = result.rulesPassed;
  const total   = result.rulesEvaluated;

  if (score === 0) {
    return `Sin coincidencias entre ${sourceA} y ${sourceB} — ${total} reglas evaluadas, ninguna pasó`;
  }

  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  if (confidence === "high") {
    return `Coincidencia de alta confianza (${score} pts) — ${passed}/${total} reglas pasaron (${pct}%)`;
  }
  if (confidence === "medium") {
    return `Coincidencia probable (${score} pts) — ${passed}/${total} reglas pasaron — requiere revisión`;
  }
  return `Coincidencia débil (${score} pts) — ${passed}/${total} reglas pasaron — probable no-coincidencia`;
}

function buildConfidenceNote(
  score:      number,
  confidence: "high" | "medium" | "low",
  result:     RuleSetExecutionResult,
): string {
  const failedGroups = new Set(
    result.ruleResults
      .filter(r => r.outcome === "failed")
      .map(r => GROUP_LABELS[r.group] ?? r.group),
  );

  if (confidence === "high") {
    return `Confianza ALTA (${score}/100). Los campos clave coinciden. Apto para conciliación automática.`;
  }
  if (confidence === "medium") {
    const missing = failedGroups.size > 0
      ? ` Diferencias en: ${[...failedGroups].join(", ")}.`
      : "";
    return `Confianza MEDIA (${score}/100). Coincidencia probable pero no confirmada.${missing} Requiere revisión manual.`;
  }
  const missing = failedGroups.size > 0
    ? ` Reglas fallidas en: ${[...failedGroups].join(", ")}.`
    : "";
  return `Confianza BAJA (${score}/100). Campos clave no coinciden.${missing} Tratar como excepción.`;
}
