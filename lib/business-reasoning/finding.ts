/**
 * finding.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * A Finding is a factual conclusion derived from one or more Observations.
 *
 * Findings state WHAT happened. They do NOT explain consequences.
 *
 * Example:
 *   "La referencia CJ-4031425 esta agotada"
 *   "El vendedor Carlos Leon tiene 3 pedidos bloqueados"
 *   "La produccion OP-5678 esta detenida hace 5 dias"
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory } from "./reasoning-types";
import type { Evidence } from "./evidence";
import type { ReasoningConfidence } from "./reasoning-confidence";
import { nextReasoningId } from "./reasoning-types";
import { buildConfidence } from "./reasoning-confidence";

// -- Finding ---------------------------------------------------------------

export interface Finding {
  /** Unique finding ID. */
  id: string;
  /** Short title (suitable for lists). */
  title: string;
  /** Detailed description of the finding. */
  description: string;
  /** Severity of the finding. */
  severity: ReasoningSeverity;
  /** Business importance (1-10, 10 = most important). */
  importance: number;
  /** Business domain category. */
  category: ReasoningCategory;
  /** The primary entity this finding relates to. */
  primaryEntity: EntityRef;
  /** Other entities affected by or involved in this finding. */
  affectedEntities: EntityRef[];
  /** Evidence supporting this finding. */
  evidence: Evidence;
  /** Confidence assessment. */
  confidence: ReasoningConfidence;
  /** Observation IDs that produced this finding. */
  sourceObservationIds: string[];
  /** ISO timestamp when the finding was produced. */
  producedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildFinding(opts: {
  title: string;
  description: string;
  severity: ReasoningSeverity;
  importance?: number;
  category: ReasoningCategory;
  primaryEntity: EntityRef;
  affectedEntities?: EntityRef[];
  evidence: Evidence;
  sourceObservationIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  metadata?: Record<string, unknown>;
}): Finding {
  return {
    id: nextReasoningId("fnd"),
    title: opts.title,
    description: opts.description,
    severity: opts.severity,
    importance: opts.importance ?? severityToImportance(opts.severity),
    category: opts.category,
    primaryEntity: opts.primaryEntity,
    affectedEntities: opts.affectedEntities ?? [],
    evidence: opts.evidence,
    confidence: buildConfidence({
      score: opts.confidenceScore ?? opts.evidence.strength,
      reason: opts.confidenceReason ?? "Derivado de observaciones directas",
      evidenceCount: opts.evidence.items.length,
    }),
    sourceObservationIds: opts.sourceObservationIds ?? opts.evidence.observationIds,
    producedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}

function severityToImportance(s: ReasoningSeverity): number {
  switch (s) {
    case "critical": return 10;
    case "high":     return 8;
    case "medium":   return 5;
    case "low":      return 3;
    case "info":     return 1;
  }
}
