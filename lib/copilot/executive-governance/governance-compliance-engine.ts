// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 11: Governance Compliance Engine

import type {
  GovernanceViolation,
  GovernanceViolationType,
  GovernancePolicy,
  GovernanceRule,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceStatus,
} from "./executive-governance-types";
import { generateViolationId } from "./executive-governance-identity";

export interface RawViolationInput {
  readonly title:        string;
  readonly description:  string;
  readonly type:         GovernanceViolationType;
  readonly domain:       GovernanceDomain;
  readonly severity:     GovernancePriorityLevel;
  readonly policyId?:    string;
  readonly ruleId?:      string;
  readonly evidenceIds?: string[];
  readonly isSystemic:   boolean;
}

export interface ComplianceEvaluationResult {
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly status:          GovernanceStatus;
  readonly complianceScore: number;
  readonly violations:      GovernanceViolation[];
  readonly policyCount:     number;
  readonly ruleCount:       number;
  readonly passedPolicies:  number;
  readonly failedPolicies:  number;
  readonly notes:           string[];
}

export function scoreViolation(
  severity: GovernancePriorityLevel,
  isSystemic: boolean
): number {
  try {
    const base: Record<GovernancePriorityLevel, number> = {
      CRITICAL: 0.90,
      HIGH:     0.70,
      MEDIUM:   0.45,
      LOW:      0.20,
    };
    const systemicBonus = isSystemic ? 0.10 : 0;
    return Math.min(1, (base[severity] ?? 0.45) + systemicBonus);
  } catch {
    return 0;
  }
}

export function scoreCompliance(
  violations: GovernanceViolation[],
  totalPolicies: number
): number {
  try {
    if (totalPolicies === 0) return 1;
    const critical  = violations.filter((v) => v.severity === "CRITICAL").length;
    const high      = violations.filter((v) => v.severity === "HIGH").length;
    const systemic  = violations.filter((v) => v.isSystemic).length;
    const penalty   = Math.min(0.80, critical * 0.15 + high * 0.08 + systemic * 0.05);
    return Math.max(0, 1 - penalty - (violations.length / Math.max(1, totalPolicies)) * 0.10);
  } catch {
    return 0;
  }
}

export function buildViolation(
  orgSlug: string,
  sessionId: string,
  input: RawViolationInput
): GovernanceViolation {
  try {
    return {
      id:             generateViolationId(),
      orgSlug,
      sessionId,
      title:          input.title,
      description:    input.description,
      type:           input.type,
      domain:         input.domain,
      severity:       input.severity,
      violationScore: scoreViolation(input.severity, input.isSystemic),
      policyId:       input.policyId,
      ruleId:         input.ruleId,
      isSystemic:     input.isSystemic,
      evidenceIds:    input.evidenceIds ?? [],
      createdAt:      new Date().toISOString(),
    };
  } catch {
    return buildEmptyViolation(orgSlug, sessionId);
  }
}

export function detectViolations(
  orgSlug: string,
  sessionId: string,
  inputs: RawViolationInput[]
): GovernanceViolation[] {
  try {
    return inputs.map((i) => buildViolation(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function evaluateCompliance(
  orgSlug: string,
  sessionId: string,
  policies: GovernancePolicy[],
  rules: GovernanceRule[],
  violations: GovernanceViolation[]
): ComplianceEvaluationResult {
  try {
    const activePolicies   = policies.filter((p) => p.isActive);
    const activeRules      = rules.filter((r) => r.isActive);
    const failedPolicyIds  = new Set(violations.map((v) => v.policyId).filter(Boolean));
    const passedPolicies   = activePolicies.filter((p) => !failedPolicyIds.has(p.id)).length;
    const failedPolicies   = activePolicies.length - passedPolicies;
    const complianceScore  = scoreCompliance(violations, activePolicies.length);

    const critical = violations.filter((v) => v.severity === "CRITICAL").length;
    const status: GovernanceStatus =
      critical > 0            ? "NON_COMPLIANT"
      : failedPolicies > 0    ? "PARTIALLY_COMPLIANT"
      : violations.length > 0 ? "PARTIALLY_COMPLIANT"
      : "COMPLIANT";

    const notes: string[] = [];
    if (critical > 0) notes.push(`${critical} violación(es) crítica(s) detectada(s)`);
    if (failedPolicies > 0) notes.push(`${failedPolicies} política(s) incumplida(s)`);
    if (violations.filter((v) => v.isSystemic).length > 0) notes.push("Violaciones sistémicas detectadas");

    return {
      orgSlug,
      sessionId,
      status,
      complianceScore,
      violations,
      policyCount:    activePolicies.length,
      ruleCount:      activeRules.length,
      passedPolicies,
      failedPolicies,
      notes,
    };
  } catch {
    return {
      orgSlug,
      sessionId,
      status:          "UNDER_REVIEW",
      complianceScore: 0,
      violations:      [],
      policyCount:     0,
      ruleCount:       0,
      passedPolicies:  0,
      failedPolicies:  0,
      notes:           ["Error al evaluar cumplimiento"],
    };
  }
}

export function rankViolations(violations: GovernanceViolation[]): GovernanceViolation[] {
  try {
    const order: Record<GovernancePriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...violations].sort(
      (a, b) =>
        (a.isSystemic === b.isSystemic ? 0 : a.isSystemic ? -1 : 1) ||
        (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
    );
  } catch {
    return violations;
  }
}

export function getCriticalViolations(violations: GovernanceViolation[]): GovernanceViolation[] {
  try {
    return violations.filter((v) => v.severity === "CRITICAL");
  } catch {
    return [];
  }
}

export function getSystemicViolations(violations: GovernanceViolation[]): GovernanceViolation[] {
  try {
    return violations.filter((v) => v.isSystemic);
  } catch {
    return [];
  }
}

function buildEmptyViolation(orgSlug: string, sessionId: string): GovernanceViolation {
  return {
    id:             generateViolationId(),
    orgSlug,
    sessionId,
    title:          "Violación no disponible",
    description:    "",
    type:           "POLICY_VIOLATION",
    domain:         "CROSS_DOMAIN",
    severity:       "LOW",
    violationScore: 0,
    isSystemic:     false,
    evidenceIds:    [],
    createdAt:      new Date().toISOString(),
  };
}
