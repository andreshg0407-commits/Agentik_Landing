// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 39: Governance Health

import type { GovernanceHealth } from "./executive-governance-types";

export interface GovernanceHealthCheck {
  readonly id:      string;
  readonly name:    string;
  readonly passed:  boolean;
  readonly reason:  string;
}

export interface GovernanceHealthReport {
  readonly orgSlug:  string;
  readonly health:   GovernanceHealth;
  readonly passed:   number;
  readonly failed:   number;
  readonly total:    number;
  readonly checks:   GovernanceHealthCheck[];
}

export interface GovernanceHealthInputs {
  readonly hasPolicies:          boolean;
  readonly hasControls:          boolean;
  readonly hasAssessment:        boolean;
  readonly hasNarrative:         boolean;
  readonly hasRecommendations:   boolean;
  readonly hasBriefing:          boolean;
  readonly hasDigest:            boolean;
  readonly complianceScore:      number;
  readonly riskScore:            number;
  readonly violationCount:       number;
  readonly escalationCount:      number;
  readonly policyCount:          number;
  readonly controlCount:         number;
  readonly overallScore:         number;
  readonly hasLimitations:       boolean;
}

export function checkGovernanceHealth(
  orgSlug: string,
  inputs: GovernanceHealthInputs
): GovernanceHealthReport {
  try {
    const checks: GovernanceHealthCheck[] = [
      {
        id:     "HAS_POLICIES",
        name:   "Has governance policies",
        passed: inputs.hasPolicies && inputs.policyCount > 0,
        reason: inputs.policyCount > 0 ? "OK" : "Sin políticas de gobernanza",
      },
      {
        id:     "HAS_CONTROLS",
        name:   "Has governance controls",
        passed: inputs.hasControls && inputs.controlCount > 0,
        reason: inputs.controlCount > 0 ? "OK" : "Sin controles de gobernanza",
      },
      {
        id:     "HAS_ASSESSMENT",
        name:   "Has governance assessment",
        passed: inputs.hasAssessment,
        reason: inputs.hasAssessment ? "OK" : "Sin evaluación de gobernanza",
      },
      {
        id:     "HAS_NARRATIVE",
        name:   "Has governance narrative",
        passed: inputs.hasNarrative,
        reason: inputs.hasNarrative ? "OK" : "Sin narrativa de gobernanza",
      },
      {
        id:     "HAS_RECOMMENDATIONS",
        name:   "Has recommendations",
        passed: inputs.hasRecommendations,
        reason: inputs.hasRecommendations ? "OK" : "Sin recomendaciones",
      },
      {
        id:     "HAS_BRIEFING",
        name:   "Has executive briefing",
        passed: inputs.hasBriefing,
        reason: inputs.hasBriefing ? "OK" : "Sin informe ejecutivo",
      },
      {
        id:     "HAS_DIGEST",
        name:   "Has governance digest",
        passed: inputs.hasDigest,
        reason: inputs.hasDigest ? "OK" : "Sin resumen de gobernanza",
      },
      {
        id:     "COMPLIANCE_ABOVE_FLOOR",
        name:   "Compliance score above floor (>= 0.40)",
        passed: inputs.complianceScore >= 0.40,
        reason: inputs.complianceScore >= 0.40 ? "OK" : `Cumplimiento bajo: ${Math.round(inputs.complianceScore * 100)}%`,
      },
      {
        id:     "RISK_BELOW_CEILING",
        name:   "Risk score below ceiling (<= 0.80)",
        passed: inputs.riskScore <= 0.80,
        reason: inputs.riskScore <= 0.80 ? "OK" : `Riesgo elevado: ${Math.round(inputs.riskScore * 100)}%`,
      },
      {
        id:     "NO_CRITICAL_VIOLATIONS",
        name:   "No unchecked critical violations indicator",
        passed: inputs.violationCount <= 10,
        reason: inputs.violationCount <= 10 ? "OK" : `Volumen de violaciones elevado: ${inputs.violationCount}`,
      },
      {
        id:     "ESCALATIONS_MANAGEABLE",
        name:   "Escalations are manageable",
        passed: inputs.escalationCount <= 5,
        reason: inputs.escalationCount <= 5 ? "OK" : `Escalaciones excesivas: ${inputs.escalationCount}`,
      },
      {
        id:     "OVERALL_SCORE_POSITIVE",
        name:   "Overall governance score positive",
        passed: inputs.overallScore > 0,
        reason: inputs.overallScore > 0 ? "OK" : "Puntuación global cero",
      },
      {
        id:     "HAS_LIMITATIONS",
        name:   "Has limitations declared",
        passed: inputs.hasLimitations,
        reason: inputs.hasLimitations ? "OK" : "Sin limitaciones declaradas",
      },
      {
        id:     "SCORE_IN_RANGE",
        name:   "Score in valid range [0,1]",
        passed: inputs.overallScore >= 0 && inputs.overallScore <= 1,
        reason: "OK",
      },
    ];

    const passed  = checks.filter((c) => c.passed).length;
    const failed  = checks.filter((c) => !c.passed).length;
    const health: GovernanceHealth =
      failed === 0       ? "HEALTHY"
      : failed <= 3      ? "DEGRADED"
      : failed <= 7      ? "CRITICAL"
      : "EMPTY";

    return { orgSlug, health, passed, failed, total: checks.length, checks };
  } catch {
    return {
      orgSlug,
      health:  "EMPTY",
      passed:  0,
      failed:  1,
      total:   1,
      checks:  [{ id: "ERROR", name: "Error en health check", passed: false, reason: "Error inesperado" }],
    };
  }
}

export function buildDefaultGovernanceHealthInputs(): GovernanceHealthInputs {
  return {
    hasPolicies:        false,
    hasControls:        false,
    hasAssessment:      false,
    hasNarrative:       false,
    hasRecommendations: false,
    hasBriefing:        false,
    hasDigest:          false,
    complianceScore:    0,
    riskScore:          0,
    violationCount:     0,
    escalationCount:    0,
    policyCount:        0,
    controlCount:       0,
    overallScore:       0,
    hasLimitations:     false,
  };
}
