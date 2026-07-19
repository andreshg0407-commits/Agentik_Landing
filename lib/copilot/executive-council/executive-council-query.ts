// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 30: Query Layer

import type {
  ExecutiveCouncilSession,
  ExecutiveCouncilRecommendation,
  ExecutiveFinding,
  ExecutiveDisagreement,
  CouncilPerspective,
  CouncilOutcome,
  CouncilPriority,
} from "./executive-council-types";
import { COUNCIL_PRIORITY_RANK } from "./executive-council-types";

// ── Sessions ───────────────────────────────────────────────────────────────────

export function getSessions(orgSlug: string, sessions: ExecutiveCouncilSession[]): ExecutiveCouncilSession[] {
  return sessions.filter((s) => s.orgSlug === orgSlug);
}

export function findSessionsByOutcome(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[],
  outcome:  CouncilOutcome
): ExecutiveCouncilSession[] {
  return sessions.filter((s) => s.orgSlug === orgSlug && s.outcome === outcome);
}

export function sortSessionsByScore(sessions: ExecutiveCouncilSession[]): ExecutiveCouncilSession[] {
  return [...sessions].sort((a, b) => b.sessionScore - a.sessionScore);
}

// ── Recommendations ────────────────────────────────────────────────────────────

export function getRecommendations(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveCouncilRecommendation[] {
  return sessions
    .filter((s) => s.orgSlug === orgSlug)
    .flatMap((s) => s.recommendations);
}

export function filterRecommendationsByPriority(
  recs:        ExecutiveCouncilRecommendation[],
  minPriority: CouncilPriority
): ExecutiveCouncilRecommendation[] {
  return recs.filter((r) => COUNCIL_PRIORITY_RANK[r.priority] >= COUNCIL_PRIORITY_RANK[minPriority]);
}

export function sortRecommendationsByScore(
  recs: ExecutiveCouncilRecommendation[]
): ExecutiveCouncilRecommendation[] {
  return [...recs].sort(
    (a, b) => COUNCIL_PRIORITY_RANK[b.priority] - COUNCIL_PRIORITY_RANK[a.priority] || b.impactScore - a.impactScore
  );
}

// ── Findings ──────────────────────────────────────────────────────────────────

export function getFindings(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveFinding[] {
  return sessions
    .filter((s) => s.orgSlug === orgSlug)
    .flatMap((s) => s.opinions.flatMap((o) => o.findings));
}

export function getCriticalFindings(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveFinding[] {
  return getFindings(orgSlug, sessions).filter((f) => f.severity === "CRITICAL");
}

export function getBlockerFindings(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveFinding[] {
  return getFindings(orgSlug, sessions).filter((f) => f.isBlocker);
}

// ── Disagreements ─────────────────────────────────────────────────────────────

export function getDisagreements(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveDisagreement[] {
  return sessions.filter((s) => s.orgSlug === orgSlug).flatMap((s) => s.disagreements);
}

export function getUnresolvedDisagreements(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): ExecutiveDisagreement[] {
  return getDisagreements(orgSlug, sessions).filter((d) => !d.canBeResolved);
}

// ── Perspectives coverage ─────────────────────────────────────────────────────

export function getPerspectivesCoveredInSession(session: ExecutiveCouncilSession): CouncilPerspective[] {
  return [...new Set(session.opinions.map((o) => o.perspective))];
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getCouncilStats(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): {
  totalSessions:         number;
  consensusSessions:     number;
  escalationSessions:    number;
  totalRecommendations:  number;
  criticalFindings:      number;
  unresolvedDisagreements: number;
  avgSessionScore:       number;
} {
  const scoped = sessions.filter((s) => s.orgSlug === orgSlug);
  const recs   = scoped.flatMap((s) => s.recommendations);
  const finds  = scoped.flatMap((s) => s.opinions.flatMap((o) => o.findings));
  const disag  = scoped.flatMap((s) => s.disagreements);

  return {
    totalSessions:           scoped.length,
    consensusSessions:       scoped.filter((s) => s.outcome === "CONSENSUS").length,
    escalationSessions:      scoped.filter((s) => s.outcome === "ESCALATION_REQUIRED").length,
    totalRecommendations:    recs.length,
    criticalFindings:        finds.filter((f) => f.severity === "CRITICAL").length,
    unresolvedDisagreements: disag.filter((d) => !d.canBeResolved).length,
    avgSessionScore:         scoped.length > 0 ? Math.round(scoped.reduce((s, x) => s + x.sessionScore, 0) / scoped.length * 100) / 100 : 0,
  };
}
