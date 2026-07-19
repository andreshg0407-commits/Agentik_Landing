// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 20 — Compliance Integration

import type { ExecutiveRisk, ExecutiveDomain } from "../executive-brain-types";
import { generateEbv2Id, riskLevelFromScore } from "../executive-brain-types";

export interface ExecutiveComplianceGate {
  readonly orgSlug: string;
  readonly status: "PASS" | "WARN" | "FAIL";
  readonly violations: string[];
  readonly crossTenantAttempt: boolean;
  readonly complianceScore: number; // 0–1
}

export interface ExecutiveComplianceInput {
  readonly orgSlug: string;
  readonly findingCount: number;
  readonly criticalFindingCount: number;
  readonly hasCrossTenantAttempt?: boolean;
}

export function evaluateExecutiveComplianceGate(
  input: ExecutiveComplianceInput
): ExecutiveComplianceGate {
  const { orgSlug, findingCount, criticalFindingCount, hasCrossTenantAttempt } = input;
  const violations: string[] = [];

  if (hasCrossTenantAttempt) {
    violations.push("CROSS_TENANT_ATTEMPT_DETECTED");
  }
  if (criticalFindingCount > 0) {
    violations.push(`CRITICAL_FINDINGS_ACTIVE:${criticalFindingCount}`);
  }
  if (findingCount > 5) {
    violations.push(`HIGH_FINDING_COUNT:${findingCount}`);
  }

  const status = hasCrossTenantAttempt ? "FAIL"
    : criticalFindingCount > 0 ? "WARN"
    : findingCount > 3 ? "WARN"
    : "PASS";

  const penalty = Math.min(criticalFindingCount * 0.15 + findingCount * 0.05, 0.7);
  const complianceScore = Math.round(Math.max(0, 1 - penalty) * 100) / 100;

  return { orgSlug, status, violations, crossTenantAttempt: hasCrossTenantAttempt ?? false, complianceScore };
}

export function buildComplianceRisk(
  orgSlug: string,
  gate: ExecutiveComplianceGate
): ExecutiveRisk | null {
  if (gate.status === "PASS") return null;

  const impact = gate.status === "FAIL" ? 0.95 : 0.65;
  const likelihood = 0.85;
  const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;

  return {
    id: generateEbv2Id("risk"),
    orgSlug,
    title: gate.crossTenantAttempt
      ? "Intento de acceso cross-tenant detectado"
      : `Hallazgos de compliance activos (${gate.violations.length})`,
    description: `La capa de compliance reporta: ${gate.violations.join(", ")}`,
    domain: "COMPLIANCE" as ExecutiveDomain,
    level: riskLevelFromScore(compositeRisk),
    confidence: "HIGH",
    confidenceScore: 0.85,
    likelihood,
    impact,
    compositeRisk,
    rationale: `Estado de compliance: ${gate.status}`,
    evidenceIds: [],
    mitigationSuggestions: [
      "Revisar hallazgos de compliance",
      "Escalar a responsable de cumplimiento",
      ...(gate.crossTenantAttempt ? ["Investigar intento de acceso cross-tenant"] : []),
    ],
    metadata: { source: "COMPLIANCE_GATE", violations: gate.violations, gateStatus: gate.status },
  };
}

export function enforceExecutiveTenantBoundary(
  requestedOrgSlug: string,
  contextOrgSlug: string
): void {
  if (requestedOrgSlug !== contextOrgSlug) {
    throw new Error(
      `[EXECUTIVE_BRAIN_V2] Cross-tenant access denied: requested="${requestedOrgSlug}", context="${contextOrgSlug}"`
    );
  }
}
