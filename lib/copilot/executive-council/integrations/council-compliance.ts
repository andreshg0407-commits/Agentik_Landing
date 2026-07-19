// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 28: Compliance Gate Integration

import type { ExecutiveCouncilSession } from "../executive-council-types";

export type CouncilComplianceStatus = "PASS" | "WARN" | "FAIL";

export interface CouncilComplianceCheck {
  readonly rule:   string;
  readonly status: CouncilComplianceStatus;
  readonly detail: string;
}

export interface CouncilComplianceResult {
  readonly orgSlug:      string;
  readonly status:       CouncilComplianceStatus;
  readonly checks:       CouncilComplianceCheck[];
  readonly passed:       number;
  readonly warned:       number;
  readonly failed:       number;
  readonly evaluatedAt:  string;
}

export function evaluateCouncilComplianceGate(
  orgSlug:  string,
  session:  ExecutiveCouncilSession
): CouncilComplianceResult {
  const checks: CouncilComplianceCheck[] = [
    {
      rule:   "TENANT_ISOLATION",
      status: session.orgSlug === orgSlug ? "PASS" : "FAIL",
      detail: session.orgSlug === orgSlug
        ? "Sesión correctamente aislada al tenant"
        : "Violación de aislamiento de tenant",
    },
    {
      rule:   "SUGGESTED_ONLY",
      status: session.recommendations.every((r) => r.suggestedOnly === true) ? "PASS" : "FAIL",
      detail: "Todas las recomendaciones deben tener suggestedOnly: true",
    },
    {
      rule:   "HAS_OPINIONS",
      status: session.opinions.length > 0 ? "PASS" : "WARN",
      detail: session.opinions.length > 0
        ? `${session.opinions.length} opinión(es) de perspectivas`
        : "Sin opiniones — sesión vacía",
    },
    {
      rule:   "HAS_RESOLUTION",
      status: session.resolution !== null ? "PASS" : "WARN",
      detail: session.resolution !== null ? "Resolución presente" : "Sin resolución — sesión incompleta",
    },
    {
      rule:   "HAS_LIMITATIONS",
      status: session.limitations.length > 0 ? "PASS" : "WARN",
      detail: session.limitations.length > 0
        ? `${session.limitations.length} limitación(es) documentada(s)`
        : "Sin limitaciones documentadas",
    },
  ];

  const passed  = checks.filter((c) => c.status === "PASS").length;
  const warned  = checks.filter((c) => c.status === "WARN").length;
  const failed  = checks.filter((c) => c.status === "FAIL").length;
  const status: CouncilComplianceStatus = failed > 0 ? "FAIL" : warned > 1 ? "WARN" : "PASS";

  return { orgSlug, status, checks, passed, warned, failed, evaluatedAt: new Date().toISOString() };
}

export function assertCouncilTenantIsolation(orgSlug: string, session: ExecutiveCouncilSession): void {
  if (session.orgSlug !== orgSlug) {
    throw new Error(`Council tenant isolation violation: session belongs to ${session.orgSlug}, not ${orgSlug}`);
  }
}
