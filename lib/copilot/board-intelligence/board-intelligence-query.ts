// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 29: Query Layer

import type {
  BoardSession,
  BoardReport,
  BoardFinding,
  BoardRisk,
  BoardOpportunity,
  BoardConcern,
  BoardPriority,
  BoardRecommendation,
  BoardDecisionCandidate,
  BoardDomain,
  BoardPriorityLevel,
  BoardOutcome,
} from "./board-intelligence-types";

// ── Session queries ─────────────────────────────────────────────────────────

export function getSessions(orgSlug: string, sessions: BoardSession[]): BoardSession[] {
  return sessions.filter((s) => s.orgSlug === orgSlug);
}

export function getSession(sessions: BoardSession[], id: string): BoardSession | undefined {
  return sessions.find((s) => s.id === id);
}

export function findSessionsByOutcome(
  orgSlug:  string,
  sessions: BoardSession[],
  outcome:  BoardOutcome
): BoardSession[] {
  return sessions.filter(
    (s) => s.orgSlug === orgSlug && s.resolution?.outcome === outcome
  );
}

export function sortSessionsByScore(sessions: BoardSession[]): BoardSession[] {
  return [...sessions].sort((a, b) => b.boardScore - a.boardScore);
}

export function getLatestSession(orgSlug: string, sessions: BoardSession[]): BoardSession | undefined {
  const scoped = getSessions(orgSlug, sessions);
  return scoped.sort((a, b) => b.conductedAt.localeCompare(a.conductedAt))[0];
}

// ── Finding queries ─────────────────────────────────────────────────────────

export function getFindings(orgSlug: string, sessions: BoardSession[]): BoardFinding[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.findings);
}

export function getCriticalFindings(orgSlug: string, sessions: BoardSession[]): BoardFinding[] {
  return getFindings(orgSlug, sessions).filter((f) => f.priority === "CRITICAL");
}

export function getBlockerFindings(orgSlug: string, sessions: BoardSession[]): BoardFinding[] {
  return getFindings(orgSlug, sessions).filter((f) => f.isBlocker);
}

export function findingsByDomain(findings: BoardFinding[], domain: BoardDomain): BoardFinding[] {
  return findings.filter((f) => f.domain === domain);
}

// ── Risk queries ────────────────────────────────────────────────────────────

export function getRisks(orgSlug: string, sessions: BoardSession[]): BoardRisk[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.risks);
}

export function getSystemicRisks(orgSlug: string, sessions: BoardSession[]): BoardRisk[] {
  return getRisks(orgSlug, sessions).filter((r) => r.isSystemic);
}

export function getCriticalBoardRisks(orgSlug: string, sessions: BoardSession[]): BoardRisk[] {
  return getRisks(orgSlug, sessions).filter((r) => r.severity === "CRITICAL");
}

// ── Opportunity queries ─────────────────────────────────────────────────────

export function getOpportunities(orgSlug: string, sessions: BoardSession[]): BoardOpportunity[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.opportunities);
}

export function getTransformationalOpportunities(orgSlug: string, sessions: BoardSession[]): BoardOpportunity[] {
  return getOpportunities(orgSlug, sessions).filter((o) => o.magnitude === "TRANSFORMATIONAL");
}

// ── Priority queries ────────────────────────────────────────────────────────

export function getPriorities(orgSlug: string, sessions: BoardSession[]): BoardPriority[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.priorities);
}

export function filterPrioritiesByLevel(
  priorities: BoardPriority[],
  level:       BoardPriorityLevel
): BoardPriority[] {
  return priorities.filter((p) => p.level === level);
}

// ── Recommendation queries ──────────────────────────────────────────────────

export function getRecommendations(orgSlug: string, sessions: BoardSession[]): BoardRecommendation[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.recommendations);
}

export function filterRecommendationsByPriority(
  orgSlug:     string,
  sessions:    BoardSession[],
  level:       BoardPriorityLevel
): BoardRecommendation[] {
  return getRecommendations(orgSlug, sessions).filter((r) => r.priority === level);
}

// ── Decision queries ────────────────────────────────────────────────────────

export function getDecisionCandidates(orgSlug: string, sessions: BoardSession[]): BoardDecisionCandidate[] {
  return getSessions(orgSlug, sessions).flatMap((s) => s.decisionCandidates);
}

export function getEscalationCandidates(orgSlug: string, sessions: BoardSession[]): BoardDecisionCandidate[] {
  return getDecisionCandidates(orgSlug, sessions).filter(
    (c) => c.outcome === "ESCALATE" || c.outcome === "REJECT"
  );
}

// ── Report queries ──────────────────────────────────────────────────────────

export function getReports(orgSlug: string, sessions: BoardSession[]): BoardReport[] {
  return getSessions(orgSlug, sessions)
    .map((s) => s.report)
    .filter((r): r is BoardReport => r !== null);
}

// ── Statistics ──────────────────────────────────────────────────────────────

export interface BoardStats {
  readonly totalSessions:       number;
  readonly approvedSessions:    number;
  readonly escalationSessions:  number;
  readonly reviewSessions:      number;
  readonly avgBoardScore:       number;
  readonly avgGovernanceScore:  number;
  readonly avgStrategicScore:   number;
  readonly criticalRiskCount:   number;
  readonly systemicRiskCount:   number;
  readonly totalFindings:       number;
  readonly blockerFindingCount: number;
}

export function getBoardStats(orgSlug: string, sessions: BoardSession[]): BoardStats {
  try {
    const scoped = getSessions(orgSlug, sessions);
    if (scoped.length === 0) {
      return {
        totalSessions: 0, approvedSessions: 0, escalationSessions: 0, reviewSessions: 0,
        avgBoardScore: 0, avgGovernanceScore: 0, avgStrategicScore: 0,
        criticalRiskCount: 0, systemicRiskCount: 0, totalFindings: 0, blockerFindingCount: 0,
      };
    }

    const avg = (arr: number[]): number => arr.reduce((s, v) => s + v, 0) / arr.length;

    return {
      totalSessions:       scoped.length,
      approvedSessions:    scoped.filter((s) => s.resolution?.outcome === "APPROVE").length,
      escalationSessions:  scoped.filter((s) => s.resolution?.outcome === "ESCALATE").length,
      reviewSessions:      scoped.filter((s) => s.resolution?.outcome === "REVIEW_REQUIRED").length,
      avgBoardScore:       avg(scoped.map((s) => s.boardScore)),
      avgGovernanceScore:  avg(scoped.map((s) => s.governance.governanceScore)),
      avgStrategicScore:   avg(scoped.map((s) => s.strategic.strategicScore)),
      criticalRiskCount:   scoped.flatMap((s) => s.risks).filter((r) => r.severity === "CRITICAL").length,
      systemicRiskCount:   scoped.flatMap((s) => s.risks).filter((r) => r.isSystemic).length,
      totalFindings:       scoped.flatMap((s) => s.findings).length,
      blockerFindingCount: scoped.flatMap((s) => s.findings).filter((f) => f.isBlocker).length,
    };
  } catch {
    return {
      totalSessions: 0, approvedSessions: 0, escalationSessions: 0, reviewSessions: 0,
      avgBoardScore: 0, avgGovernanceScore: 0, avgStrategicScore: 0,
      criticalRiskCount: 0, systemicRiskCount: 0, totalFindings: 0, blockerFindingCount: 0,
    };
  }
}
