/**
 * decision.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * A Decision is a suggested course of action. NOT executed.
 *
 * Decisions are the bridge between reasoning and action.
 * They require approval before any Action Engine executes them.
 *
 * Examples:
 *   "Iniciar produccion de REF-001"
 *   "Trasladar inventario de Tienda A a Tienda B"
 *   "Contactar cliente ABC"
 *   "Actualizar maleta del vendedor Juan"
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory, DecisionType, Urgency } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Expected Impact -------------------------------------------------------

/** Projected impact of a decision if executed. */
export interface ExpectedImpact {
  /** Description of the expected outcome. */
  description: string;
  /** Estimated monetary benefit (null if not computable). */
  estimatedBenefit: number | null;
  /** Entities that would be positively affected. */
  benefitedEntities: EntityRef[];
  /** Potential negative side effects. */
  sideEffects: string[];
}

// -- Decision --------------------------------------------------------------

export interface Decision {
  /** Unique decision ID. */
  id: string;
  /** Short title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** What type of decision this is. */
  decisionType: DecisionType;
  /** Why this decision is recommended. */
  reason: string;
  /** Severity / priority context. */
  severity: ReasoningSeverity;
  /** Business domain category. */
  category: ReasoningCategory;
  /** How urgently this decision should be acted upon. */
  urgency: Urgency;
  /** Expected impact if executed. */
  expectedImpact: ExpectedImpact;
  /** Whether this decision requires human approval. */
  requiresApproval: boolean;
  /** The primary entity this decision targets. */
  primaryEntity: EntityRef;
  /** All entities involved. */
  affectedEntities: EntityRef[];
  /** Evidence supporting this decision. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Risk IDs and opportunity IDs that produced this decision. */
  sourceRiskIds: string[];
  sourceOpportunityIds: string[];
  /** ISO timestamp. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildDecision(opts: {
  title: string;
  description: string;
  decisionType: DecisionType;
  reason: string;
  severity?: ReasoningSeverity;
  category: ReasoningCategory;
  urgency?: Urgency;
  expectedImpact: ExpectedImpact;
  requiresApproval?: boolean;
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  evidence: Evidence;
  sourceRiskIds?: string[];
  sourceOpportunityIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  missingInformation?: string[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}): Decision {
  return {
    id: nextReasoningId("dec"),
    title: opts.title,
    description: opts.description,
    decisionType: opts.decisionType,
    reason: opts.reason,
    severity: opts.severity ?? "medium",
    category: opts.category,
    urgency: opts.urgency ?? "this_week",
    expectedImpact: opts.expectedImpact,
    requiresApproval: opts.requiresApproval ?? true,
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de riesgos y oportunidades",
      evidenceCount: opts.evidence.items.length,
      missingInformation: opts.missingInformation,
      assumptions: opts.assumptions,
    }),
    sourceRiskIds: opts.sourceRiskIds ?? [],
    sourceOpportunityIds: opts.sourceOpportunityIds ?? [],
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
