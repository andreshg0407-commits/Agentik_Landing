// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 33: Dashboard Contract
// NOT server-only — pure domain types safe for client consumption.

import type {
  BoardSession,
  BoardOutcome,
  GovernanceStatus,
  BoardConfidence,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
} from "./board-intelligence-types";

// ── Session card ────────────────────────────────────────────────────────────

export interface BoardSessionCard {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly topic:           string;
  readonly outcome:         BoardOutcome | null;
  readonly boardScore:      number;
  readonly governanceScore: number;
  readonly strategicScore:  number;
  readonly confidence:      BoardConfidence;
  readonly riskCount:       number;
  readonly findingCount:    number;
  readonly criticalRiskCount: number;
  readonly blockerFindingCount: number;
  readonly conductedAt:     string;
}

export function buildBoardSessionCard(session: BoardSession): BoardSessionCard {
  try {
    return {
      id:              session.id,
      orgSlug:         session.orgSlug,
      title:           session.title,
      topic:           session.topic,
      outcome:         session.resolution?.outcome ?? null,
      boardScore:      session.boardScore,
      governanceScore: session.governance.governanceScore,
      strategicScore:  session.strategic.strategicScore,
      confidence:      session.confidence,
      riskCount:       session.risks.length,
      findingCount:    session.findings.length,
      criticalRiskCount:    session.risks.filter((r) => r.severity === "CRITICAL").length,
      blockerFindingCount:  session.findings.filter((f) => f.isBlocker).length,
      conductedAt:     session.conductedAt,
    };
  } catch {
    return {
      id:              session.id ?? "",
      orgSlug:         session.orgSlug ?? "",
      title:           session.title ?? "",
      topic:           session.topic ?? "",
      outcome:         null,
      boardScore:      0,
      governanceScore: 0,
      strategicScore:  0,
      confidence:      "LOW",
      riskCount:       0,
      findingCount:    0,
      criticalRiskCount:   0,
      blockerFindingCount: 0,
      conductedAt:     "",
    };
  }
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export type BoardHealth = "HEALTHY" | "DEGRADED" | "CRITICAL" | "EMPTY";

export interface BoardIntelligenceDashboard {
  readonly orgSlug:          string;
  readonly totalSessions:    number;
  readonly boardHealth:      BoardHealth;
  readonly avgBoardScore:    number;
  readonly avgGovernanceScore: number;
  readonly avgStrategicScore:  number;
  readonly criticalRiskCount:  number;
  readonly blockerFindingCount: number;
  readonly escalationCount:    number;
  readonly latestGovernance:   BoardGovernanceAssessment | null;
  readonly latestStrategic:    BoardStrategicAssessment | null;
  readonly sessions:           BoardSessionCard[];
  readonly generatedAt:        string;
}

function computeBoardHealth(
  avgScore:       number,
  criticalRisks:  number,
  sessionCount:   number
): BoardHealth {
  if (sessionCount === 0) return "EMPTY";
  if (avgScore >= 0.70 && criticalRisks === 0) return "HEALTHY";
  if (avgScore >= 0.50 || criticalRisks <= 2)  return "DEGRADED";
  return "CRITICAL";
}

export function buildBoardIntelligenceDashboard(
  orgSlug:  string,
  sessions: BoardSession[]
): BoardIntelligenceDashboard {
  try {
    const scoped = sessions.filter((s) => s.orgSlug === orgSlug);
    if (scoped.length === 0) return buildEmptyBoardIntelligenceDashboard(orgSlug);

    const avg = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const avgBoardScore       = avg(scoped.map((s) => s.boardScore));
    const avgGovernanceScore  = avg(scoped.map((s) => s.governance.governanceScore));
    const avgStrategicScore   = avg(scoped.map((s) => s.strategic.strategicScore));
    const criticalRiskCount   = scoped.flatMap((s) => s.risks).filter((r) => r.severity === "CRITICAL").length;
    const blockerFindingCount = scoped.flatMap((s) => s.findings).filter((f) => f.isBlocker).length;
    const escalationCount     = scoped.filter((s) => s.resolution?.outcome === "ESCALATE").length;

    const sorted = [...scoped].sort((a, b) => b.conductedAt.localeCompare(a.conductedAt));
    const latest = sorted[0];

    return {
      orgSlug,
      totalSessions:     scoped.length,
      boardHealth:       computeBoardHealth(avgBoardScore, criticalRiskCount, scoped.length),
      avgBoardScore,
      avgGovernanceScore,
      avgStrategicScore,
      criticalRiskCount,
      blockerFindingCount,
      escalationCount,
      latestGovernance:  latest?.governance ?? null,
      latestStrategic:   latest?.strategic  ?? null,
      sessions:          sorted.map(buildBoardSessionCard),
      generatedAt:       new Date().toISOString(),
    };
  } catch {
    return buildEmptyBoardIntelligenceDashboard(orgSlug);
  }
}

export function buildEmptyBoardIntelligenceDashboard(orgSlug: string): BoardIntelligenceDashboard {
  return {
    orgSlug,
    totalSessions:     0,
    boardHealth:       "EMPTY",
    avgBoardScore:     0,
    avgGovernanceScore: 0,
    avgStrategicScore:  0,
    criticalRiskCount:  0,
    blockerFindingCount: 0,
    escalationCount:    0,
    latestGovernance:   null,
    latestStrategic:    null,
    sessions:           [],
    generatedAt:        new Date().toISOString(),
  };
}
