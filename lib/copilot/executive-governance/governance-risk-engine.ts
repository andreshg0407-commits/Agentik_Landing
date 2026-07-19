// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 9: Governance Risk Engine

import type {
  GovernanceRisk,
  GovernanceRiskType,
  GovernanceDomain,
  GovernancePriorityLevel,
} from "./executive-governance-types";
import { generateGovernanceRiskId as generateRiskId } from "./executive-governance-identity";

export interface RawGovernanceRiskInput {
  readonly title:        string;
  readonly description:  string;
  readonly type:         GovernanceRiskType;
  readonly domain:       GovernanceDomain;
  readonly severity:     GovernancePriorityLevel;
  readonly likelihood:   number; // 0–1
  readonly impact:       number; // 0–1
  readonly isSystemic:   boolean;
  readonly evidenceIds?: string[];
}

export function scoreGovernanceRisk(
  likelihood: number,
  impact: number,
  severity: GovernancePriorityLevel,
  isSystemic: boolean
): number {
  try {
    const severityWeight: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 1.00,
      HIGH:     0.75,
      MEDIUM:   0.50,
      LOW:      0.25,
    };
    const base       = Math.min(1, likelihood * 0.45 + impact * 0.45 + (severityWeight[severity] ?? 0.50) * 0.10);
    const systemic   = isSystemic ? 0.08 : 0;
    return Math.min(1, base + systemic);
  } catch {
    return 0;
  }
}

export function buildGovernanceRisk(
  orgSlug: string,
  sessionId: string,
  input: RawGovernanceRiskInput
): GovernanceRisk {
  try {
    const riskScore = scoreGovernanceRisk(input.likelihood, input.impact, input.severity, input.isSystemic);
    return {
      id:          generateRiskId(),
      orgSlug,
      sessionId,
      title:       input.title,
      description: input.description,
      type:        input.type,
      domain:      input.domain,
      severity:    input.severity,
      likelihood:  Math.max(0, Math.min(1, input.likelihood)),
      impact:      Math.max(0, Math.min(1, input.impact)),
      riskScore,
      isSystemic:  input.isSystemic,
      evidenceIds: input.evidenceIds ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyRisk(orgSlug, sessionId);
  }
}

export function identifyGovernanceRisks(
  orgSlug: string,
  sessionId: string,
  inputs: RawGovernanceRiskInput[]
): GovernanceRisk[] {
  try {
    return inputs.map((i) => buildGovernanceRisk(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankGovernanceRisks(risks: GovernanceRisk[]): GovernanceRisk[] {
  try {
    return [...risks].sort((a, b) => b.riskScore - a.riskScore);
  } catch {
    return risks;
  }
}

export function getCriticalRisks(risks: GovernanceRisk[]): GovernanceRisk[] {
  try {
    return risks.filter((r) => r.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function getSystemicRisks(risks: GovernanceRisk[]): GovernanceRisk[] {
  try {
    return risks.filter((r) => r.isSystemic);
  } catch {
    return [];
  }
}

export function getRisksByType(risks: GovernanceRisk[], type: GovernanceRiskType): GovernanceRisk[] {
  try {
    return risks.filter((r) => r.type === type);
  } catch {
    return [];
  }
}

export function calculateAggregateRiskScore(risks: GovernanceRisk[]): number {
  try {
    if (risks.length === 0) return 0;
    const criticalBonus = risks.filter((r) => r.severity === "CRITICAL").length * 0.05;
    const systemicBonus = risks.filter((r) => r.isSystemic).length * 0.03;
    const avgScore      = risks.reduce((s, r) => s + r.riskScore, 0) / risks.length;
    return Math.min(1, avgScore + criticalBonus + systemicBonus);
  } catch {
    return 0;
  }
}

function buildEmptyRisk(orgSlug: string, sessionId: string): GovernanceRisk {
  return {
    id:          generateRiskId(),
    orgSlug,
    sessionId,
    title:       "Riesgo no disponible",
    description: "",
    type:        "COMPLIANCE_RISK",
    domain:      "CROSS_DOMAIN",
    severity:    "LOW",
    likelihood:  0,
    impact:      0,
    riskScore:   0,
    isSystemic:  false,
    evidenceIds: [],
    createdAt:   new Date().toISOString(),
  };
}
