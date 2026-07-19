/**
 * plan-risk.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Plan-specific risk model. Complements (does not duplicate) Business Reasoning risks.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { PlanSeverity, PlanEntityRef } from "./planning-types";
import { nextPlanId } from "./planning-types";

// -- Plan Risk ----------------------------------------------------------------

/** A risk specific to a plan alternative. */
export interface PlanRisk {
  /** Unique risk ID. */
  riskId: string;
  /** Risk title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Probability of occurrence (0–100). */
  probability: number;
  /** Impact if realized (1–10). */
  impact: number;
  /** Derived severity. */
  severity: PlanSeverity;
  /** Proposed mitigation. */
  mitigation: string;
  /** Entity this risk relates to. */
  relatedEntity: PlanEntityRef | null;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a plan risk. */
export function buildPlanRisk(opts: {
  title: string;
  description: string;
  probability: number;
  impact: number;
  mitigation?: string;
  relatedEntity?: PlanEntityRef | null;
  metadata?: Record<string, unknown>;
}): PlanRisk {
  const score = (opts.probability / 100) * opts.impact;
  let severity: PlanSeverity = "info";
  if (score >= 7) severity = "critical";
  else if (score >= 5) severity = "high";
  else if (score >= 3) severity = "medium";
  else if (score >= 1) severity = "low";

  return {
    riskId: nextPlanId("prisk"),
    title: opts.title,
    description: opts.description,
    probability: opts.probability,
    impact: opts.impact,
    severity,
    mitigation: opts.mitigation ?? "",
    relatedEntity: opts.relatedEntity ?? null,
    metadata: opts.metadata ?? {},
  };
}
