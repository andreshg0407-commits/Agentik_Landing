// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 32: Governance Compliance Checks

import type { ExecutiveGovernanceResult } from "../executive-governance-types";

export interface GovernanceComplianceReport {
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly passed:      number;
  readonly failed:      number;
  readonly total:       number;
  readonly checks:      GovernanceComplianceCheck[];
  readonly isCompliant: boolean;
}

export interface GovernanceComplianceCheck {
  readonly id:      string;
  readonly name:    string;
  readonly passed:  boolean;
  readonly reason:  string;
}

export function assertGovernanceTenantIsolation(orgSlug: string, reportOrgSlug: string): void {
  if (orgSlug !== reportOrgSlug) {
    throw new Error(`Governance tenant isolation violation: expected ${orgSlug}, got ${reportOrgSlug}`);
  }
}

export function runGovernanceComplianceChecks(
  orgSlug: string,
  result: ExecutiveGovernanceResult
): GovernanceComplianceReport {
  try {
    const r = result.report;
    const checks: GovernanceComplianceCheck[] = [
      {
        id:     "TENANT_ISOLATION",
        name:   "Tenant isolation",
        passed: r.orgSlug === orgSlug,
        reason: r.orgSlug === orgSlug ? "OK" : `Mismatch: ${r.orgSlug} !== ${orgSlug}`,
      },
      {
        id:     "SUGGESTED_ONLY",
        name:   "All recommendations suggestedOnly",
        passed: r.recommendations.every((rec) => rec.suggestedOnly === true),
        reason: r.recommendations.every((rec) => rec.suggestedOnly === true) ? "OK" : "Recomendación sin suggestedOnly",
      },
      {
        id:     "HAS_POLICIES",
        name:   "Has active policies",
        passed: r.policies.length > 0,
        reason: r.policies.length > 0 ? "OK" : "Sin políticas activas",
      },
      {
        id:     "HAS_ASSESSMENT",
        name:   "Has governance assessment",
        passed: !!r.assessment && !!r.assessment.id,
        reason: r.assessment?.id ? "OK" : "Sin evaluación de gobernanza",
      },
      {
        id:     "HAS_NARRATIVE",
        name:   "Has narrative",
        passed: !!r.narrative && r.narrative.compliance.length > 0,
        reason: r.narrative?.compliance?.length > 0 ? "OK" : "Sin narrativa",
      },
      {
        id:     "HAS_SCORE",
        name:   "Has governance score",
        passed: !!r.score && r.score.overallScore >= 0,
        reason: r.score?.overallScore >= 0 ? "OK" : "Sin puntuación",
      },
      {
        id:     "HAS_STATUS",
        name:   "Has governance status",
        passed: ["COMPLIANT","PARTIALLY_COMPLIANT","NON_COMPLIANT","UNDER_REVIEW"].includes(r.status),
        reason: "OK",
      },
      {
        id:     "HAS_LIMITATIONS",
        name:   "Has limitations",
        passed: r.limitations.length > 0,
        reason: r.limitations.length > 0 ? "OK" : "Sin limitaciones declaradas",
      },
      {
        id:     "HAS_CONTROLS",
        name:   "Has controls",
        passed: r.controls.length > 0,
        reason: r.controls.length > 0 ? "OK" : "Sin controles definidos",
      },
      {
        id:     "RESULT_NOT_FAILED",
        name:   "Result is not FAILED",
        passed: result.status !== "FAILED",
        reason: result.status !== "FAILED" ? "OK" : "Resultado fallido",
      },
    ];

    const passed = checks.filter((c) => c.passed).length;
    const failed = checks.filter((c) => !c.passed).length;

    return {
      orgSlug,
      sessionId:   result.sessionId,
      passed,
      failed,
      total:       checks.length,
      checks,
      isCompliant: failed === 0,
    };
  } catch {
    return {
      orgSlug,
      sessionId:   result.sessionId,
      passed:      0,
      failed:      1,
      total:       1,
      checks:      [{ id: "ERROR", name: "Error en compliance check", passed: false, reason: "Error inesperado" }],
      isCompliant: false,
    };
  }
}
