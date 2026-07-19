// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 37: Dashboard Contract
// NOT server-only. Pure domain types for UI consumption.

import type {
  DirectionStatus,
  DirectionConfidence,
  DirectionScore,
  NorthStar,
  DirectionPriority,
  DirectionDeviation,
  DirectionConflict,
  DirectionSignal,
  DirectionRecommendation,
} from "./enterprise-direction-types";

export interface EnterpriseDirectionDashboard {
  readonly orgSlug:              string;
  readonly sessionId:            string;
  readonly status:               DirectionStatus;
  readonly score:                DirectionScore;
  readonly northStar:            NorthStar | null;
  readonly topPriorities:        DirectionPriority[];
  readonly criticalDeviations:   DirectionDeviation[];
  readonly blockingConflicts:    DirectionConflict[];
  readonly opportunitySignals:   DirectionSignal[];
  readonly topRecommendations:   DirectionRecommendation[];
  readonly northStarScore:       number;
  readonly alignmentScore:       number;
  readonly overallScore:         number;
  readonly confidence:           DirectionConfidence;
  readonly limitations:          string[];
  readonly createdAt:            string;
}

export function buildEnterpriseDirectionDashboard(
  orgSlug: string,
  sessionId: string,
  data: {
    status:          DirectionStatus;
    score:           DirectionScore;
    northStar:       NorthStar | null;
    priorities:      DirectionPriority[];
    deviations:      DirectionDeviation[];
    conflicts:       DirectionConflict[];
    signals:         DirectionSignal[];
    recommendations: DirectionRecommendation[];
    confidence:      DirectionConfidence;
    limitations:     string[];
  }
): EnterpriseDirectionDashboard {
  try {
    return {
      orgSlug,
      sessionId,
      status:              data.status,
      score:               data.score,
      northStar:           data.northStar,
      topPriorities:       data.priorities.slice(0, 5),
      criticalDeviations:  data.deviations.filter((d) => d.severity === "CRITICAL" || d.isSystemic).slice(0, 5),
      blockingConflicts:   data.conflicts.filter((c) => c.isBlocking).slice(0, 5),
      opportunitySignals:  data.signals.filter((s) => s.type === "OPPORTUNITY" && s.intensity >= 0.50).slice(0, 5),
      topRecommendations:  data.recommendations.slice(0, 5),
      northStarScore:      data.score.northStarScore,
      alignmentScore:      data.score.alignmentScore,
      overallScore:        data.score.overallScore,
      confidence:          data.confidence,
      limitations:         data.limitations,
      createdAt:           new Date().toISOString(),
    };
  } catch {
    return buildEmptyDashboard(orgSlug, sessionId);
  }
}

function buildEmptyDashboard(orgSlug: string, sessionId: string): EnterpriseDirectionDashboard {
  const emptyScore: DirectionScore = {
    orgSlug,
    overallScore:     0,
    northStarScore:   0,
    alignmentScore:   0,
    priorityScore:    0,
    initiativeScore:  0,
    deviationPenalty: 0,
    conflictPenalty:  0,
    confidence:       "LOW",
  };
  return {
    orgSlug,
    sessionId,
    status:              "UNDER_REVIEW",
    score:               emptyScore,
    northStar:           null,
    topPriorities:       [],
    criticalDeviations:  [],
    blockingConflicts:   [],
    opportunitySignals:  [],
    topRecommendations:  [],
    northStarScore:      0,
    alignmentScore:      0,
    overallScore:        0,
    confidence:          "LOW",
    limitations:         ["suggestedOnly: true"],
    createdAt:           new Date().toISOString(),
  };
}
