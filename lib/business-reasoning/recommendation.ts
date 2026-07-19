/**
 * recommendation.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * A Recommendation is an executive-level suggestion.
 *
 * RULE: Every recommendation carries suggestedOnly: true
 * until Action Engine with approval workflows is implemented.
 *
 * Recommendations are the final output of the reasoning chain
 * before being consumed by David, Copilot, or Executive Dashboard.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Recommendation --------------------------------------------------------

export interface Recommendation {
  /** Unique recommendation ID. */
  id: string;
  /** Short title (suitable for executive display). */
  title: string;
  /** Full description. */
  description: string;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Severity context. */
  severity: ReasoningSeverity;
  /** Priority (lower = higher). */
  priority: number;
  /** Expected benefit if acted upon. */
  expectedBenefit: string;
  /** Estimated monetary benefit (null if not computable). */
  estimatedValue: number | null;
  /** The primary entity this recommendation targets. */
  primaryEntity: EntityRef;
  /** All entities involved. */
  affectedEntities: EntityRef[];
  /** Data required to act on this recommendation. */
  requiredData: string[];
  /** Evidence supporting this recommendation. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Decision IDs that produced this recommendation. */
  sourceDecisionIds: string[];
  /** MANDATORY: true until Action Engine exists. */
  suggestedOnly: true;
  /** ISO timestamp. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildRecommendation(opts: {
  title: string;
  description: string;
  category: ReasoningCategory;
  severity?: ReasoningSeverity;
  priority?: number;
  expectedBenefit: string;
  estimatedValue?: number | null;
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  requiredData?: string[];
  evidence: Evidence;
  sourceDecisionIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  missingInformation?: string[];
  metadata?: Record<string, unknown>;
}): Recommendation {
  return {
    id: nextReasoningId("rec"),
    title: opts.title,
    description: opts.description,
    category: opts.category,
    severity: opts.severity ?? "medium",
    priority: opts.priority ?? 5,
    expectedBenefit: opts.expectedBenefit,
    estimatedValue: opts.estimatedValue ?? null,
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    requiredData: opts.requiredData ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de decisiones y cadena de razonamiento",
      evidenceCount: opts.evidence.items.length,
      missingInformation: opts.missingInformation,
    }),
    sourceDecisionIds: opts.sourceDecisionIds ?? [],
    suggestedOnly: true,
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
