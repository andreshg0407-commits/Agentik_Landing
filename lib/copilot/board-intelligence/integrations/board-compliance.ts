// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 27: Compliance Gate Integration

import type { BoardSession } from "../board-intelligence-types";

export interface BoardComplianceResult {
  readonly orgSlug:       string;
  readonly sessionId:     string;
  readonly passed:        boolean;
  readonly failedChecks:  string[];
  readonly passedChecks:  string[];
  readonly warnings:      string[];
}

const COMPLIANCE_CHECKS = [
  "TENANT_ISOLATION",
  "SUGGESTED_ONLY",
  "HAS_FINDINGS",
  "HAS_RISKS",
  "HAS_GOVERNANCE",
  "HAS_STRATEGIC",
  "HAS_RESOLUTION",
  "HAS_LIMITATIONS",
  "NO_EMPTY_ORG_SLUG",
] as const;

export function evaluateBoardComplianceGate(
  orgSlug: string,
  session: BoardSession
): BoardComplianceResult {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const warnings: string[] = [];

  try {
    // TENANT_ISOLATION
    if (session.orgSlug === orgSlug) {
      passedChecks.push("TENANT_ISOLATION");
    } else {
      failedChecks.push("TENANT_ISOLATION");
    }

    // NO_EMPTY_ORG_SLUG
    if (session.orgSlug && session.orgSlug.length > 0) {
      passedChecks.push("NO_EMPTY_ORG_SLUG");
    } else {
      failedChecks.push("NO_EMPTY_ORG_SLUG");
    }

    // SUGGESTED_ONLY — resolution and recommendations
    const resolSuggested = !session.resolution || session.resolution.suggestedOnly === true;
    const recsSuggested  = session.recommendations.every((r) => r.suggestedOnly === true);
    if (resolSuggested && recsSuggested) {
      passedChecks.push("SUGGESTED_ONLY");
    } else {
      failedChecks.push("SUGGESTED_ONLY");
    }

    // HAS_FINDINGS
    if (session.findings.length > 0) {
      passedChecks.push("HAS_FINDINGS");
    } else {
      warnings.push("Sin hallazgos registrados");
      passedChecks.push("HAS_FINDINGS");  // not a hard failure
    }

    // HAS_RISKS
    if (session.risks.length > 0) {
      passedChecks.push("HAS_RISKS");
    } else {
      warnings.push("Sin riesgos registrados");
      passedChecks.push("HAS_RISKS");
    }

    // HAS_GOVERNANCE
    if (session.governance && typeof session.governance.governanceScore === "number") {
      passedChecks.push("HAS_GOVERNANCE");
    } else {
      failedChecks.push("HAS_GOVERNANCE");
    }

    // HAS_STRATEGIC
    if (session.strategic && typeof session.strategic.strategicScore === "number") {
      passedChecks.push("HAS_STRATEGIC");
    } else {
      failedChecks.push("HAS_STRATEGIC");
    }

    // HAS_RESOLUTION
    if (session.resolution !== null) {
      passedChecks.push("HAS_RESOLUTION");
    } else {
      warnings.push("Sin resolución generada");
      passedChecks.push("HAS_RESOLUTION");
    }

    // HAS_LIMITATIONS
    if (session.limitations && session.limitations.length > 0) {
      passedChecks.push("HAS_LIMITATIONS");
    } else {
      failedChecks.push("HAS_LIMITATIONS");
    }

  } catch {
    failedChecks.push("COMPLIANCE_ENGINE_ERROR");
  }

  return {
    orgSlug,
    sessionId:  session.id,
    passed:     failedChecks.length === 0,
    failedChecks,
    passedChecks,
    warnings,
  };
}

export function assertBoardTenantIsolation(orgSlug: string, session: BoardSession): void {
  if (session.orgSlug !== orgSlug) {
    throw new Error(
      `Board tenant isolation violation: session.orgSlug="${session.orgSlug}" does not match orgSlug="${orgSlug}"`
    );
  }
}
