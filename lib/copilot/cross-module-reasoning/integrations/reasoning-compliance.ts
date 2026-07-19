/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-compliance.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Compliance Adapter — bridges reasoning output to compliance layer.
 * No DB. No server-only.
 */

import type { ReasoningResult, ReasoningRisk, ReasoningRecommendation } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Compliance signal types ───────────────────────────────────────────────────

export type ComplianceReasoningSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ComplianceReasoningSignal {
  id:          string;
  orgSlug:     string;
  category:    string;
  title:       string;
  description: string;
  severity:    ComplianceReasoningSeverity;
  source:      "cross-module-reasoning";
  riskIds:     string[];
  detectedAt:  string;
}

export interface ComplianceReasoningReport {
  orgSlug:        string;
  executionId:    string;
  signals:        ComplianceReasoningSignal[];
  totalFindings:  number;
  criticalCount:  number;
  highCount:      number;
  domains:        string[];
  status:         "PASS" | "WARN" | "FAIL";
  generatedAt:    string;
}

// ── Build compliance signals from risks ───────────────────────────────────────

export function riskToComplianceSignal(
  orgSlug:     string,
  executionId: string,
  risk:        ReasoningRisk,
): ComplianceReasoningSignal {
  if (risk.orgSlug !== orgSlug) {
    throw new Error(
      `[reasoning-compliance] Tenant violation: risk.orgSlug=${risk.orgSlug} expected=${orgSlug}`,
    );
  }

  return {
    id:          generateCmrId("cmp"),
    orgSlug,
    category:    `REASONING_RISK_${risk.domain}`,
    title:       risk.title,
    description: risk.description,
    severity:    risk.severity as ComplianceReasoningSeverity,
    source:      "cross-module-reasoning",
    riskIds:     [risk.id],
    detectedAt:  new Date().toISOString(),
  };
}

export function buildComplianceReasoningReport(
  result: ReasoningResult,
): ComplianceReasoningReport {
  if (result.status === "ERROR") {
    return {
      orgSlug:       result.orgSlug,
      executionId:   result.id,
      signals:       [],
      totalFindings: 0,
      criticalCount: 0,
      highCount:     0,
      domains:       [],
      status:        "PASS",
      generatedAt:   result.completedAt,
    };
  }

  const risks = result.chain.risks.filter(r => r.orgSlug === result.orgSlug);

  // Only elevate CRITICAL and HIGH risks to compliance signals
  const elevatedRisks = risks.filter(r => r.severity === "CRITICAL" || r.severity === "HIGH");

  const signals = elevatedRisks.map(r =>
    riskToComplianceSignal(result.orgSlug, result.id, r),
  );

  const criticalCount = signals.filter(s => s.severity === "CRITICAL").length;
  const highCount     = signals.filter(s => s.severity === "HIGH").length;
  const domains       = [...new Set(risks.map(r => r.domain))];

  const status = criticalCount > 0 ? "FAIL" : highCount > 2 ? "WARN" : "PASS";

  return {
    orgSlug:       result.orgSlug,
    executionId:   result.id,
    signals,
    totalFindings: signals.length,
    criticalCount,
    highCount,
    domains,
    status,
    generatedAt:   result.completedAt,
  };
}

// ── Compliance-driven recommendations ────────────────────────────────────────

export function filterComplianceRecommendations(
  recommendations: ReasoningRecommendation[],
  orgSlug: string,
): ReasoningRecommendation[] {
  return recommendations.filter(
    r => r.orgSlug === orgSlug &&
      (r.type === "PREVENTION" || r.type === "CORRECTION") &&
      (r.priority === "URGENT" || r.priority === "HIGH"),
  );
}

// ── Compliance gate ───────────────────────────────────────────────────────────

export interface ComplianceGateResult {
  passed:   boolean;
  reason:   string;
  severity: ComplianceReasoningSeverity;
}

export function evaluateComplianceGate(
  report: ComplianceReasoningReport,
): ComplianceGateResult {
  if (report.criticalCount > 0) {
    return {
      passed:   false,
      reason:   `${report.criticalCount} riesgos críticos detectados en razonamiento cruzado`,
      severity: "CRITICAL",
    };
  }

  if (report.status === "WARN") {
    return {
      passed:   true,  // warn does not block, but surfaces
      reason:   `${report.highCount} riesgos altos detectados — revisión recomendada`,
      severity: "HIGH",
    };
  }

  return {
    passed:   true,
    reason:   "Sin hallazgos de cumplimiento críticos",
    severity: "LOW",
  };
}
