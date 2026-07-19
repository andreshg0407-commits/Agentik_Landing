// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 12: Governance Assessment Engine

import type {
  GovernanceAssessment,
  GovernanceFinding,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceStatus,
  GovernanceConfidence,
  GovernanceViolation,
} from "./executive-governance-types";
import { generateAssessmentId, generateFindingId } from "./executive-governance-identity";

export interface RawFindingInput {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       GovernanceDomain;
  readonly severity:     GovernancePriorityLevel;
  readonly policyId?:    string;
  readonly ruleId?:      string;
  readonly evidence?:    string[];
}

export interface AssessmentInput {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly complianceScore:  number;
  readonly governanceScore:  number;
  readonly riskScore:        number;
  readonly findings:         RawFindingInput[];
  readonly violations:       GovernanceViolation[];
  readonly exceptionCount:   number;
  readonly escalationCount:  number;
}

export function buildFinding(
  orgSlug: string,
  sessionId: string,
  input: RawFindingInput
): GovernanceFinding {
  try {
    return {
      id:          generateFindingId(),
      orgSlug,
      sessionId,
      title:       input.title,
      description: input.description,
      domain:      input.domain,
      severity:    input.severity,
      policyId:    input.policyId,
      ruleId:      input.ruleId,
      evidence:    input.evidence ?? [],
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyFinding(orgSlug, sessionId);
  }
}

export function buildFindings(
  orgSlug: string,
  sessionId: string,
  inputs: RawFindingInput[]
): GovernanceFinding[] {
  try {
    return inputs.map((i) => buildFinding(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function rankFindings(findings: GovernanceFinding[]): GovernanceFinding[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...findings].sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
  } catch {
    return findings;
  }
}

export function deriveAssessmentStatus(
  complianceScore: number,
  violations: GovernanceViolation[],
  findings: GovernanceFinding[]
): GovernanceStatus {
  try {
    const criticalViolations = violations.filter((v) => v.severity === "CRITICAL").length;
    const criticalFindings   = findings.filter((f) => f.severity === "CRITICAL").length;
    if (criticalViolations > 0 || criticalFindings > 0) return "NON_COMPLIANT";
    if (complianceScore >= 0.80) return "COMPLIANT";
    if (complianceScore >= 0.50) return "PARTIALLY_COMPLIANT";
    return "NON_COMPLIANT";
  } catch {
    return "UNDER_REVIEW";
  }
}

export function deriveAssessmentConfidence(
  findingCount: number,
  violationCount: number
): GovernanceConfidence {
  try {
    const totalItems = findingCount + violationCount;
    if (totalItems === 0) return "HIGH";
    if (totalItems <= 2) return "HIGH";
    if (totalItems <= 5) return "MEDIUM";
    return "LOW";
  } catch {
    return "LOW";
  }
}

export function buildAssessment(input: AssessmentInput): GovernanceAssessment {
  try {
    const findings   = buildFindings(input.orgSlug, input.sessionId, input.findings);
    const ranked     = rankFindings(findings);
    const status     = deriveAssessmentStatus(input.complianceScore, input.violations, findings);
    const confidence = deriveAssessmentConfidence(findings.length, input.violations.length);

    const gaps: string[] = [];
    const strengths: string[] = [];

    if (input.complianceScore < 0.70) gaps.push("Cumplimiento por debajo del umbral objetivo");
    if (input.riskScore > 0.60) gaps.push("Nivel de riesgo elevado");
    if (findings.filter((f) => f.severity === "CRITICAL").length > 0) gaps.push("Hallazgos críticos sin resolver");
    if (input.violations.length === 0) strengths.push("Sin violaciones de política detectadas");
    if (input.complianceScore >= 0.85) strengths.push("Cumplimiento en nivel satisfactorio");
    if (input.governanceScore >= 0.80) strengths.push("Gobernanza operando en rango óptimo");

    return {
      id:              generateAssessmentId(),
      orgSlug:         input.orgSlug,
      sessionId:       input.sessionId,
      status,
      complianceScore: input.complianceScore,
      governanceScore: input.governanceScore,
      riskScore:       input.riskScore,
      findingCount:    findings.length,
      violationCount:  input.violations.length,
      exceptionCount:  input.exceptionCount,
      escalationCount: input.escalationCount,
      confidence,
      findings:        ranked,
      violations:      input.violations,
      gaps,
      strengths,
      createdAt:       new Date().toISOString(),
    };
  } catch {
    return buildEmptyAssessment(input.orgSlug, input.sessionId);
  }
}

export function generateAssessment(input: AssessmentInput): GovernanceAssessment {
  return buildAssessment(input);
}

export function getCriticalFindings(findings: GovernanceFinding[]): GovernanceFinding[] {
  try {
    return findings.filter((f) => f.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function calculateFindingPenalty(findings: GovernanceFinding[]): number {
  try {
    if (findings.length === 0) return 0;
    const critical = findings.filter((f) => f.severity === "CRITICAL").length;
    const high     = findings.filter((f) => f.severity === "HIGH").length;
    return Math.min(0.40, critical * 0.10 + high * 0.05 + findings.length * 0.02);
  } catch {
    return 0;
  }
}

function buildEmptyFinding(orgSlug: string, sessionId: string): GovernanceFinding {
  return {
    id:          generateFindingId(),
    orgSlug,
    sessionId,
    title:       "Hallazgo no disponible",
    description: "",
    domain:      "CROSS_DOMAIN",
    severity:    "LOW",
    evidence:    [],
    createdAt:   new Date().toISOString(),
  };
}

function buildEmptyAssessment(orgSlug: string, sessionId: string): GovernanceAssessment {
  return {
    id:              generateAssessmentId(),
    orgSlug,
    sessionId,
    status:          "UNDER_REVIEW",
    complianceScore: 0,
    governanceScore: 0,
    riskScore:       0,
    findingCount:    0,
    violationCount:  0,
    exceptionCount:  0,
    escalationCount: 0,
    confidence:      "LOW",
    findings:        [],
    violations:      [],
    gaps:            ["Evaluación no disponible"],
    strengths:       [],
    createdAt:       new Date().toISOString(),
  };
}
