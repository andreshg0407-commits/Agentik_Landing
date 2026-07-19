// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 38: Dashboard Contract
// Pure domain — safe for UI import (no restricted imports)

import type {
  GovernanceStatus,
  GovernanceConfidence,
  GovernancePriorityLevel,
} from "./executive-governance-types";

export interface GovernanceDashboardKpi {
  readonly label:       string;
  readonly value:       string | number;
  readonly unit?:       string;
  readonly trend?:      "UP" | "DOWN" | "STABLE";
  readonly isAlert:     boolean;
}

export interface GovernanceDashboardItem {
  readonly id:       string;
  readonly title:    string;
  readonly domain:   string;
  readonly severity: GovernancePriorityLevel;
  readonly type:     string;
}

export interface GovernanceDashboard {
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly status:            GovernanceStatus;
  readonly confidence:        GovernanceConfidence;
  readonly overallScore:      number;
  readonly complianceScore:   number;
  readonly riskScore:         number;
  readonly kpis:              GovernanceDashboardKpi[];
  readonly topViolations:     GovernanceDashboardItem[];     // max 5
  readonly topEscalations:    GovernanceDashboardItem[];     // max 5
  readonly topRisks:          GovernanceDashboardItem[];     // max 5
  readonly topRecommendations: string[];                     // max 5
  readonly limitations:       string[];
  readonly generatedAt:       string;
}

export function buildGovernanceDashboard(
  orgSlug: string,
  sessionId: string,
  data: {
    status:           GovernanceStatus;
    confidence:       GovernanceConfidence;
    overallScore:     number;
    complianceScore:  number;
    riskScore:        number;
    violationCount:   number;
    escalationCount:  number;
    findingCount:     number;
    exceptionCount:   number;
    policyCount:      number;
    topViolations?:   GovernanceDashboardItem[];
    topEscalations?:  GovernanceDashboardItem[];
    topRisks?:        GovernanceDashboardItem[];
    topRecommendations?: string[];
  }
): GovernanceDashboard {
  try {
    const compPct  = Math.round(data.complianceScore * 100);
    const riskPct  = Math.round(data.riskScore * 100);
    const scorePct = Math.round(data.overallScore * 100);

    const kpis: GovernanceDashboardKpi[] = [
      {
        label:   "Cumplimiento",
        value:   `${compPct}%`,
        isAlert: compPct < 70,
      },
      {
        label:   "Riesgo de Gobernanza",
        value:   `${riskPct}%`,
        isAlert: riskPct > 60,
      },
      {
        label:   "Puntuación Global",
        value:   `${scorePct}%`,
        isAlert: scorePct < 60,
      },
      {
        label:   "Violaciones",
        value:   data.violationCount,
        isAlert: data.violationCount > 0,
      },
      {
        label:   "Escalaciones",
        value:   data.escalationCount,
        isAlert: data.escalationCount > 0,
      },
      {
        label:   "Políticas Activas",
        value:   data.policyCount,
        isAlert: data.policyCount === 0,
      },
    ];

    return {
      orgSlug,
      sessionId,
      status:              data.status,
      confidence:          data.confidence,
      overallScore:        data.overallScore,
      complianceScore:     data.complianceScore,
      riskScore:           data.riskScore,
      kpis,
      topViolations:       (data.topViolations ?? []).slice(0, 5),
      topEscalations:      (data.topEscalations ?? []).slice(0, 5),
      topRisks:            (data.topRisks ?? []).slice(0, 5),
      topRecommendations:  (data.topRecommendations ?? []).slice(0, 5),
      limitations:         ["suggestedOnly: true — nunca reemplaza el juicio ejecutivo."],
      generatedAt:         new Date().toISOString(),
    };
  } catch {
    return buildEmptyGovernanceDashboard(orgSlug, sessionId);
  }
}

export function buildEmptyGovernanceDashboard(
  orgSlug: string,
  sessionId: string
): GovernanceDashboard {
  return {
    orgSlug,
    sessionId,
    status:              "UNDER_REVIEW",
    confidence:          "LOW",
    overallScore:        0,
    complianceScore:     0,
    riskScore:           0,
    kpis:                [],
    topViolations:       [],
    topEscalations:      [],
    topRisks:            [],
    topRecommendations:  [],
    limitations:         ["suggestedOnly: true — nunca reemplaza el juicio ejecutivo."],
    generatedAt:         new Date().toISOString(),
  };
}
