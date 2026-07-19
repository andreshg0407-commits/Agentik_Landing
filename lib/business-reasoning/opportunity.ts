/**
 * opportunity.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * An Opportunity is a potential positive outcome identified through reasoning.
 *
 * Examples:
 *   "Mover inventario de Tienda A a Tienda B"
 *   "Reactivar cliente inactivo con historial alto"
 *   "Cross-selling: cliente compra Linea A, nunca Linea B"
 *   "Produccion disponible puede desbloquear 4 pedidos"
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory, EffortLevel } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Opportunity -----------------------------------------------------------

export interface Opportunity {
  /** Unique opportunity ID. */
  id: string;
  /** Short title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Priority (lower = higher). */
  priority: number;
  /** Estimated monetary value of the opportunity (null if not computable). */
  estimatedValue: number | null;
  /** Effort required to capture this opportunity. */
  effort: EffortLevel;
  /** The primary entity this opportunity relates to. */
  primaryEntity: EntityRef;
  /** Entities involved in or benefiting from this opportunity. */
  affectedEntities: EntityRef[];
  /** Evidence supporting this opportunity. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Insight IDs that produced this opportunity. */
  sourceInsightIds: string[];
  /** ISO timestamp. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildOpportunity(opts: {
  title: string;
  description: string;
  category: ReasoningCategory;
  priority?: number;
  estimatedValue?: number | null;
  effort?: EffortLevel;
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  evidence: Evidence;
  sourceInsightIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  missingInformation?: string[];
  metadata?: Record<string, unknown>;
}): Opportunity {
  return {
    id: nextReasoningId("opp"),
    title: opts.title,
    description: opts.description,
    category: opts.category,
    priority: opts.priority ?? 5,
    estimatedValue: opts.estimatedValue ?? null,
    effort: opts.effort ?? "medium",
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de insights y analisis de oportunidad",
      evidenceCount: opts.evidence.items.length,
      missingInformation: opts.missingInformation,
    }),
    sourceInsightIds: opts.sourceInsightIds ?? [],
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
