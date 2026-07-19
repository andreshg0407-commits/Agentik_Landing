// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 12: Opinion Engine
// Aggregates perspective opinions into a structured set for the council.

import type { ExecutiveOpinion, CouncilPerspective } from "./executive-council-types";
import { councilConfidenceFromScore } from "./executive-council-types";
import { newOpinionId } from "./executive-council-identity";

export interface OpinionSet {
  readonly opinions:        ExecutiveOpinion[];
  readonly perspectivesCovered: CouncilPerspective[];
  readonly averageConfidence:   number;
  readonly highestPriority:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly allEvidenceIds:      string[];
}

const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function buildOpinionSet(
  orgSlug:  string,
  opinions: ExecutiveOpinion[]
): OpinionSet {
  try {
    const scoped = opinions.filter((o) => o.orgSlug === orgSlug);
    if (scoped.length === 0) {
      return {
        opinions:             [],
        perspectivesCovered:  [],
        averageConfidence:    0,
        highestPriority:      "LOW",
        allEvidenceIds:       [],
      };
    }

    const perspectivesCovered = [...new Set(scoped.map((o) => o.perspective))];
    const averageConfidence   = scoped.reduce((s, o) => s + o.confidenceScore, 0) / scoped.length;
    const highestPriority     = scoped.reduce((best, o) =>
      PRIORITY_RANK[o.priority] > PRIORITY_RANK[best] ? o.priority : best,
      "LOW" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    );
    const allEvidenceIds = [...new Set(scoped.flatMap((o) => o.evidenceIds))];

    return { opinions: scoped, perspectivesCovered, averageConfidence, highestPriority, allEvidenceIds };
  } catch {
    return { opinions: [], perspectivesCovered: [], averageConfidence: 0, highestPriority: "LOW", allEvidenceIds: [] };
  }
}

export function filterOpinionsByPriority(
  opinions: ExecutiveOpinion[],
  minPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
): ExecutiveOpinion[] {
  return opinions.filter((o) => PRIORITY_RANK[o.priority] >= PRIORITY_RANK[minPriority]);
}

export function sortOpinionsByPriority(opinions: ExecutiveOpinion[]): ExecutiveOpinion[] {
  return [...opinions].sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.confidenceScore - a.confidenceScore
  );
}

export function buildPlaceholderOpinion(
  orgSlug:     string,
  sessionId:   string,
  perspective: CouncilPerspective
): ExecutiveOpinion {
  const opId = newOpinionId();
  return {
    id:              opId,
    orgSlug,
    sessionId,
    perspective,
    title:           `Opinión ${perspective} (sin datos)`,
    stance:          `La perspectiva ${perspective} no dispone de datos para este tema`,
    rationale:       "Sin datos disponibles para esta perspectiva en el contexto actual",
    confidence:      councilConfidenceFromScore(0.1),
    confidenceScore: 0.1,
    priority:        "LOW",
    arguments:       [],
    findings:        [],
    evidenceIds:     [],
    metadata:        { engine: "PLACEHOLDER", perspective },
    generatedAt:     new Date().toISOString(),
  };
}
