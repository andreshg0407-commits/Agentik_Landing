/**
 * risk.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * A Risk is a potential negative outcome identified through reasoning.
 *
 * Examples:
 *   "Riesgo de perder venta de $2.4M por referencia agotada"
 *   "Riesgo de incumplir SLA de produccion"
 *   "Riesgo de churn: cliente sin compra 60 dias"
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory, Urgency } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Preventive Action -----------------------------------------------------

/** A suggested preventive action (informational only). */
export interface PreventiveAction {
  /** Action type identifier. */
  actionType: string;
  /** Human-readable label. */
  label: string;
  /** Description of the action. */
  description: string;
  /** Entity this action targets. */
  targetEntity: EntityRef | null;
  /** Priority (lower = higher). */
  priority: number;
  /** Always true until Action Engine exists. */
  suggestedOnly: true;
}

// -- Risk ------------------------------------------------------------------

export interface Risk {
  /** Unique risk ID. */
  id: string;
  /** Short title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Severity of the risk. */
  severity: ReasoningSeverity;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Probability of the risk materializing (0-100). */
  probability: number;
  /** Business impact if materialized (1-10, 10 = catastrophic). */
  impact: number;
  /** How urgently action is needed. */
  urgency: Urgency;
  /** Estimated monetary value at risk (null if not computable). */
  estimatedValueAtRisk: number | null;
  /** The primary entity at risk. */
  primaryEntity: EntityRef;
  /** All affected entities. */
  affectedEntities: EntityRef[];
  /** Suggested preventive actions. */
  preventiveActions: PreventiveAction[];
  /** Evidence supporting this risk assessment. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Insight IDs that produced this risk. */
  sourceInsightIds: string[];
  /** ISO timestamp. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildRisk(opts: {
  title: string;
  description: string;
  severity: ReasoningSeverity;
  category: ReasoningCategory;
  probability: number;
  impact: number;
  urgency: Urgency;
  estimatedValueAtRisk?: number | null;
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  preventiveActions?: PreventiveAction[];
  evidence: Evidence;
  sourceInsightIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  missingInformation?: string[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}): Risk {
  return {
    id: nextReasoningId("rsk"),
    title: opts.title,
    description: opts.description,
    severity: opts.severity,
    category: opts.category,
    probability: opts.probability,
    impact: opts.impact,
    urgency: opts.urgency,
    estimatedValueAtRisk: opts.estimatedValueAtRisk ?? null,
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    preventiveActions: opts.preventiveActions ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de insights y analisis de impacto",
      evidenceCount: opts.evidence.items.length,
      missingInformation: opts.missingInformation,
      assumptions: opts.assumptions,
    }),
    sourceInsightIds: opts.sourceInsightIds ?? [],
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}

export function buildPreventiveAction(opts: {
  actionType: string;
  label: string;
  description: string;
  targetEntity?: EntityRef | null;
  priority?: number;
}): PreventiveAction {
  return {
    actionType: opts.actionType,
    label: opts.label,
    description: opts.description,
    targetEntity: opts.targetEntity ?? null,
    priority: opts.priority ?? 5,
    suggestedOnly: true,
  };
}
