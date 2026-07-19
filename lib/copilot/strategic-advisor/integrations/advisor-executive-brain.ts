// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 15: Executive Brain Integration

import type { ExecutivePriority, ExecutiveRisk, ExecutiveFocusArea, ExecutiveContext } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicConcern, StrategicRecommendation, StrategicDomain, StrategicAdvicePriority } from "../strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "../strategic-advisor-types";

export function extractConcernsFromExecutiveBrain(
  orgSlug: string,
  risks: ExecutiveRisk[]
): StrategicConcern[] {
  return risks
    .filter((r) => r.orgSlug === orgSlug && (r.level === "CRITICAL" || r.level === "HIGH"))
    .map((r) => ({
      id:             generateSaId("concern"),
      orgSlug,
      title:          r.title,
      description:    r.description,
      domain:         r.domain as StrategicDomain,
      severity:       (r.level === "CRITICAL" ? "CRITICAL" : r.level === "HIGH" ? "HIGH" : "MEDIUM") as StrategicAdvicePriority,
      confidence:     confidenceSaFromScore(r.confidenceScore),
      confidenceScore: r.confidenceScore,
      isEmergent:     false,
      isLatent:       r.level === "MODERATE" || r.level === "LOW",
      rationale:      r.rationale,
      evidenceIds:    r.evidenceIds,
      relatedGoals:   [],
      metadata:       { source: "EXECUTIVE_BRAIN_RISK", riskId: r.id },
      detectedAt:     new Date().toISOString(),
    }));
}

export function extractPrioritiesFromExecutiveBrain(
  orgSlug: string,
  priorities: ExecutivePriority[]
): StrategicRecommendation[] {
  return priorities
    .filter((p) => p.orgSlug === orgSlug && (p.level === "CRITICAL" || p.level === "HIGH"))
    .map((p) => ({
      id:             generateSaId("rec"),
      orgSlug,
      title:          p.title,
      description:    p.description,
      rationale:      p.rationale,
      domain:         p.domain as StrategicDomain,
      priority:       (p.level === "CRITICAL" ? "CRITICAL" : "HIGH") as StrategicAdvicePriority,
      confidence:     confidenceSaFromScore(p.confidenceScore),
      confidenceScore: p.confidenceScore,
      expectedImpact:  `Resolución de prioridad ejecutiva — score: ${p.priorityScore.toFixed(2)}`,
      associatedRisks: [],
      evidenceIds:    p.evidenceIds,
      playbookIds:    [],
      suggestedOnly:  true as const,
      metadata:       { source: "EXECUTIVE_BRAIN_PRIORITY", priorityId: p.id },
    }));
}

export function getExecutiveBrainFocusContext(
  orgSlug: string,
  focusAreas: ExecutiveFocusArea[]
): { topDomains: StrategicDomain[]; executiveCoverage: number } {
  const scoped = focusAreas.filter((f) => f.orgSlug === orgSlug);
  const topDomains = scoped.slice(0, 3).map((f) => f.domain as StrategicDomain);
  const executiveCoverage = Math.min(scoped.length / 5, 1);
  return { topDomains, executiveCoverage };
}
