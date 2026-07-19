/**
 * decision-option.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Decision option — an evaluated alternative ready for selection.
 *
 * Built from PlanAlternative but enriched with decision-specific metadata.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { DecisionCriterion } from "./decision-criteria";
import { nextDecisionId } from "./decision-types";

// -- Decision Option ----------------------------------------------------------

/** An evaluated option within a decision. */
export interface DecisionOption {
  /** Unique option ID. */
  optionId: string;
  /** ID of the source PlanAlternative (if from Planning Engine). */
  sourceAlternativeId: string | null;
  /** Option title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Named strategy. */
  strategy: string;
  /** Overall score (0–100). */
  score: number;
  /** Rank among options (1 = best). */
  rank: number;
  /** Whether this option was selected as recommended. */
  selected: boolean;
  /** Whether this option is feasible (no blocking constraints). */
  feasible: boolean;
  /** Whether this option is blocked (blocking constraint or unmet required dependency). */
  blocked: boolean;
  /** Whether this option requires approval. */
  requiresApproval: boolean;
  /** Expected impact description. */
  expectedImpact: string;
  /** Cost summary (human-readable). */
  costSummary: string;
  /** Benefit summary (human-readable). */
  benefitSummary: string;
  /** Risk summary (human-readable). */
  riskSummary: string;
  /** Constraint descriptions. */
  constraints: string[];
  /** Dependency descriptions. */
  dependencies: string[];
  /** Per-criterion scores. */
  criteria: DecisionCriterion[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision option. */
export function buildDecisionOption(opts: {
  sourceAlternativeId?: string | null;
  title: string;
  description: string;
  strategy: string;
  score?: number;
  feasible?: boolean;
  blocked?: boolean;
  requiresApproval?: boolean;
  expectedImpact?: string;
  costSummary?: string;
  benefitSummary?: string;
  riskSummary?: string;
  constraints?: string[];
  dependencies?: string[];
  criteria?: DecisionCriterion[];
  metadata?: Record<string, unknown>;
}): DecisionOption {
  return {
    optionId: nextDecisionId("dopt"),
    sourceAlternativeId: opts.sourceAlternativeId ?? null,
    title: opts.title,
    description: opts.description,
    strategy: opts.strategy,
    score: opts.score ?? 0,
    rank: 0,
    selected: false,
    feasible: opts.feasible ?? true,
    blocked: opts.blocked ?? false,
    requiresApproval: opts.requiresApproval ?? false,
    expectedImpact: opts.expectedImpact ?? "",
    costSummary: opts.costSummary ?? "",
    benefitSummary: opts.benefitSummary ?? "",
    riskSummary: opts.riskSummary ?? "",
    constraints: opts.constraints ?? [],
    dependencies: opts.dependencies ?? [],
    criteria: opts.criteria ?? [],
    metadata: opts.metadata ?? {},
  };
}
