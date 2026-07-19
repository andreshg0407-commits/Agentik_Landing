/**
 * decision-criteria.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Configurable evaluation criteria for decision options.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { CriterionDirection } from "./decision-types";

// -- Decision Criterion -------------------------------------------------------

/** A single evaluation criterion with weight and score. */
export interface DecisionCriterion {
  /** Unique criterion key. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Weight in overall score (0–1). */
  weight: number;
  /** Whether higher or lower values are better. */
  direction: CriterionDirection;
  /** Raw value for this criterion. */
  value: number;
  /** Normalized score (0–100, direction-adjusted). */
  normalizedScore: number;
  /** Human-readable explanation. */
  explanation: string;
}

// -- Criterion Key ------------------------------------------------------------

/** Built-in criterion keys. */
export type DecisionCriterionKey =
  | "benefit"
  | "cost"
  | "risk"
  | "speed"
  | "feasibility"
  | "confidence"
  | "approval_complexity"
  | "customer_impact"
  | "operational_effort"
  | "strategic_alignment";

/** All built-in criterion keys. */
export const DECISION_CRITERION_KEYS: readonly DecisionCriterionKey[] = [
  "benefit", "cost", "risk", "speed", "feasibility",
  "confidence", "approval_complexity", "customer_impact",
  "operational_effort", "strategic_alignment",
] as const;

// -- Builder ------------------------------------------------------------------

/** Build a decision criterion. */
export function buildDecisionCriterion(opts: {
  key: string;
  label: string;
  weight: number;
  direction: CriterionDirection;
  value: number;
  explanation?: string;
}): DecisionCriterion {
  // Normalize: for "maximize", score = value; for "minimize", score = 100 - value
  const normalizedScore = opts.direction === "minimize"
    ? Math.max(0, Math.min(100, 100 - opts.value))
    : opts.direction === "maximize"
      ? Math.max(0, Math.min(100, opts.value))
      : Math.max(0, Math.min(100, opts.value));

  return {
    key: opts.key,
    label: opts.label,
    weight: opts.weight,
    direction: opts.direction,
    value: opts.value,
    normalizedScore,
    explanation: opts.explanation ?? "",
  };
}

// -- Default Criteria Weights -------------------------------------------------

/** Default balanced weights for criteria. */
export const DEFAULT_CRITERIA_WEIGHTS: Record<DecisionCriterionKey, { weight: number; direction: CriterionDirection; label: string }> = {
  benefit:              { weight: 0.18, direction: "maximize", label: "Beneficio esperado" },
  cost:                 { weight: 0.12, direction: "minimize", label: "Costo estimado" },
  risk:                 { weight: 0.14, direction: "minimize", label: "Riesgo" },
  speed:                { weight: 0.10, direction: "maximize", label: "Rapidez" },
  feasibility:          { weight: 0.15, direction: "maximize", label: "Viabilidad" },
  confidence:           { weight: 0.10, direction: "maximize", label: "Confianza" },
  approval_complexity:  { weight: 0.06, direction: "minimize", label: "Complejidad de aprobacion" },
  customer_impact:      { weight: 0.08, direction: "maximize", label: "Impacto en clientes" },
  operational_effort:   { weight: 0.05, direction: "minimize", label: "Esfuerzo operativo" },
  strategic_alignment:  { weight: 0.02, direction: "maximize", label: "Alineacion estrategica" },
};
