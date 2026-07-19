// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 34: Dashboard Contract
// Not server-only. Pure domain. Safe for client components.

import type {
  ExecutiveCouncilSession,
  ExecutiveCouncilRecommendation,
  ExecutiveFinding,
  CouncilOutcome,
  CouncilConfidence,
} from "./executive-council-types";
import { sortRecommendationsByPriority, sortFindingsBySeverity } from "./executive-council-types";

export interface CouncilSessionCard {
  readonly sessionId:          string;
  readonly title:              string;
  readonly topic:              string;
  readonly outcome:            CouncilOutcome;
  readonly sessionScore:       number;
  readonly opinionCount:       number;
  readonly recommendationCount: number;
  readonly disagreementCount:  number;
  readonly unresolvedCount:    number;
  readonly criticalFindingCount: number;
  readonly confidence:         CouncilConfidence;
  readonly conductedAt:        string;
}

export interface ExecutiveCouncilDashboard {
  readonly orgSlug:               string;
  readonly totalSessions:         number;
  readonly consensusSessions:     number;
  readonly escalationSessions:    number;
  readonly partialConsensusSessions: number;
  readonly totalRecommendations:  number;
  readonly criticalFindings:      number;
  readonly unresolvedDisagreements: number;
  readonly avgSessionScore:       number;
  readonly councilHealth:         "HEALTHY" | "DEGRADED" | "CRITICAL" | "EMPTY";
  readonly topRecommendations:    ExecutiveCouncilRecommendation[];
  readonly criticalFindingItems:  ExecutiveFinding[];
  readonly recentSessions:        CouncilSessionCard[];
  readonly generatedAt:           string;
}

export function buildCouncilSessionCard(session: ExecutiveCouncilSession): CouncilSessionCard {
  const allFindings = session.opinions.flatMap((o) => o.findings);
  return {
    sessionId:           session.id,
    title:               session.title,
    topic:               session.topic,
    outcome:             session.outcome,
    sessionScore:        session.sessionScore,
    opinionCount:        session.opinions.length,
    recommendationCount: session.recommendations.length,
    disagreementCount:   session.disagreements.length,
    unresolvedCount:     session.disagreements.filter((d) => !d.canBeResolved).length,
    criticalFindingCount: allFindings.filter((f) => f.severity === "CRITICAL").length,
    confidence:          session.confidence,
    conductedAt:         session.conductedAt,
  };
}

export function buildExecutiveCouncilDashboard(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveCouncilDashboard {
  const scoped      = sessions.filter((s) => s.orgSlug === orgSlug);
  const allRecs     = scoped.flatMap((s) => s.recommendations);
  const allFindings = scoped.flatMap((s) => s.opinions.flatMap((o) => o.findings));
  const allDisag    = scoped.flatMap((s) => s.disagreements);

  const consensusSessions       = scoped.filter((s) => s.outcome === "CONSENSUS").length;
  const escalationSessions      = scoped.filter((s) => s.outcome === "ESCALATION_REQUIRED").length;
  const partialConsensusSessions = scoped.filter((s) => s.outcome === "PARTIAL_CONSENSUS").length;
  const unresolvedDisagreements = allDisag.filter((d) => !d.canBeResolved).length;
  const criticalFindings        = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const avgSessionScore         = scoped.length > 0
    ? Math.round(scoped.reduce((s, x) => s + x.sessionScore, 0) / scoped.length * 100) / 100
    : 0;

  const councilHealth: ExecutiveCouncilDashboard["councilHealth"] =
    scoped.length === 0 ? "EMPTY"
    : escalationSessions > 0 || unresolvedDisagreements > 0 ? "CRITICAL"
    : avgSessionScore < 0.4 ? "DEGRADED"
    : "HEALTHY";

  return {
    orgSlug,
    totalSessions:         scoped.length,
    consensusSessions,
    escalationSessions,
    partialConsensusSessions,
    totalRecommendations:  allRecs.length,
    criticalFindings,
    unresolvedDisagreements,
    avgSessionScore,
    councilHealth,
    topRecommendations:    sortRecommendationsByPriority(allRecs).slice(0, 5),
    criticalFindingItems:  sortFindingsBySeverity(allFindings).filter((f) => f.severity === "CRITICAL").slice(0, 5),
    recentSessions:        scoped.sort((a, b) => b.conductedAt.localeCompare(a.conductedAt)).slice(0, 5).map(buildCouncilSessionCard),
    generatedAt:           new Date().toISOString(),
  };
}

export function buildEmptyExecutiveCouncilDashboard(orgSlug: string): ExecutiveCouncilDashboard {
  return {
    orgSlug,
    totalSessions:         0,
    consensusSessions:     0,
    escalationSessions:    0,
    partialConsensusSessions: 0,
    totalRecommendations:  0,
    criticalFindings:      0,
    unresolvedDisagreements: 0,
    avgSessionScore:       0,
    councilHealth:         "EMPTY",
    topRecommendations:    [],
    criticalFindingItems:  [],
    recentSessions:        [],
    generatedAt:           new Date().toISOString(),
  };
}
