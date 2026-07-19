/**
 * insight.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * An Insight is understanding derived from Findings + Knowledge Graph.
 *
 * Insights explain CONSEQUENCES and CONTEXT — why a Finding matters.
 *
 * Example:
 *   "La referencia agotada pertenece a la maleta del vendedor Juan
 *    y bloquea tres pedidos de clientes activos"
 *
 * This is where the Knowledge Graph becomes essential.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Impact Assessment -----------------------------------------------------

/** Structured impact of an insight on the business. */
export interface InsightImpact {
  /** Business area impacted. */
  area: ReasoningCategory;
  /** Severity of the impact. */
  severity: ReasoningSeverity;
  /** Human-readable description. */
  description: string;
  /** Estimated monetary impact (null if not computable). */
  estimatedValue: number | null;
  /** Number of entities affected. */
  affectedCount: number;
}

// -- Insight ---------------------------------------------------------------

export interface Insight {
  /** Unique insight ID. */
  id: string;
  /** Short title. */
  title: string;
  /** Full explanation of the insight. */
  description: string;
  /** Business meaning — why this matters. */
  businessMeaning: string;
  /** Severity of the insight. */
  severity: ReasoningSeverity;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Impact assessments across business areas. */
  impacts: InsightImpact[];
  /** The primary entity. */
  primaryEntity: EntityRef;
  /** Entities involved in the insight. */
  affectedEntities: EntityRef[];
  /** Knowledge Graph dependencies used to derive this insight. */
  knowledgeDependencies: string[];
  /** Evidence supporting this insight. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Finding IDs that produced this insight. */
  sourceFindingIds: string[];
  /** ISO timestamp. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildInsight(opts: {
  title: string;
  description: string;
  businessMeaning: string;
  severity: ReasoningSeverity;
  category: ReasoningCategory;
  impacts?: InsightImpact[];
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  knowledgeDependencies?: string[];
  evidence: Evidence;
  sourceFindingIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  missingInformation?: string[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}): Insight {
  return {
    id: nextReasoningId("ins"),
    title: opts.title,
    description: opts.description,
    businessMeaning: opts.businessMeaning,
    severity: opts.severity,
    category: opts.category,
    impacts: opts.impacts ?? [],
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    knowledgeDependencies: opts.knowledgeDependencies ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de hallazgos y Knowledge Graph",
      evidenceCount: opts.evidence.items.length,
      missingInformation: opts.missingInformation,
      assumptions: opts.assumptions,
    }),
    sourceFindingIds: opts.sourceFindingIds ?? [],
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
