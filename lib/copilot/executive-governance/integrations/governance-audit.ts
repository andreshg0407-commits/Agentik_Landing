// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 33: Governance Audit Integration

import type { GovernanceStatus, GovernanceConfidence } from "../executive-governance-types";
import { generateGovernanceAuditId } from "../executive-governance-identity";

export type GovernanceAuditEventType =
  | "GOVERNANCE_GENERATED"
  | "POLICY_EVALUATED"
  | "VIOLATION_DETECTED"
  | "ESCALATION_TRIGGERED"
  | "ASSESSMENT_BUILT"
  | "RECOMMENDATIONS_RANKED";

export interface GovernanceAuditEvent {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly eventType:   GovernanceAuditEventType;
  readonly status:      GovernanceStatus;
  readonly confidence:  GovernanceConfidence;
  readonly score:       number;
  readonly metadata:    Record<string, unknown>;
  readonly timestamp:   string;
}

export function auditGovernanceGenerated(
  orgSlug: string,
  sessionId: string,
  score: number,
  status: GovernanceStatus,
  confidence: GovernanceConfidence
): GovernanceAuditEvent {
  try {
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "GOVERNANCE_GENERATED",
      status,
      confidence,
      score,
      metadata:   {
        suggestedOnly: true,
        neverExecutes: true,
        neverApproves: true,
      },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "GOVERNANCE_GENERATED");
  }
}

export function auditPolicyEvaluated(
  orgSlug: string,
  sessionId: string,
  policyCount: number,
  violationCount: number
): GovernanceAuditEvent {
  try {
    const status: GovernanceStatus = violationCount > 0 ? "PARTIALLY_COMPLIANT" : "COMPLIANT";
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "POLICY_EVALUATED",
      status,
      confidence: "MEDIUM",
      score:      policyCount > 0 ? (policyCount - violationCount) / policyCount : 0,
      metadata:   { policyCount, violationCount },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "POLICY_EVALUATED");
  }
}

export function auditViolationDetected(
  orgSlug: string,
  sessionId: string,
  violationCount: number,
  criticalCount: number
): GovernanceAuditEvent {
  try {
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "VIOLATION_DETECTED",
      status:     criticalCount > 0 ? "NON_COMPLIANT" : "PARTIALLY_COMPLIANT",
      confidence: "HIGH",
      score:      Math.max(0, 1 - criticalCount * 0.15),
      metadata:   { violationCount, criticalCount },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "VIOLATION_DETECTED");
  }
}

export function auditEscalationTriggered(
  orgSlug: string,
  sessionId: string,
  escalationCount: number,
  blockingCount: number
): GovernanceAuditEvent {
  try {
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "ESCALATION_TRIGGERED",
      status:     blockingCount > 0 ? "NON_COMPLIANT" : "PARTIALLY_COMPLIANT",
      confidence: "HIGH",
      score:      Math.max(0, 1 - blockingCount * 0.10),
      metadata:   { escalationCount, blockingCount },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "ESCALATION_TRIGGERED");
  }
}

export function auditAssessmentBuilt(
  orgSlug: string,
  sessionId: string,
  assessmentScore: number,
  findingCount: number
): GovernanceAuditEvent {
  try {
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "ASSESSMENT_BUILT",
      status:     assessmentScore >= 0.80 ? "COMPLIANT" : assessmentScore >= 0.50 ? "PARTIALLY_COMPLIANT" : "NON_COMPLIANT",
      confidence: findingCount === 0 ? "HIGH" : "MEDIUM",
      score:      assessmentScore,
      metadata:   { assessmentScore, findingCount },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "ASSESSMENT_BUILT");
  }
}

export function auditRecommendationsRanked(
  orgSlug: string,
  sessionId: string,
  recommendationCount: number
): GovernanceAuditEvent {
  try {
    return {
      id:         generateGovernanceAuditId(),
      orgSlug,
      sessionId,
      eventType:  "RECOMMENDATIONS_RANKED",
      status:     "COMPLIANT",
      confidence: "MEDIUM",
      score:      Math.min(1, recommendationCount * 0.10),
      metadata:   { recommendationCount, suggestedOnly: true },
      timestamp:  new Date().toISOString(),
    };
  } catch {
    return buildEmptyAuditEvent(orgSlug, sessionId, "RECOMMENDATIONS_RANKED");
  }
}

function buildEmptyAuditEvent(
  orgSlug: string,
  sessionId: string,
  eventType: GovernanceAuditEventType
): GovernanceAuditEvent {
  return {
    id:         generateGovernanceAuditId(),
    orgSlug,
    sessionId,
    eventType,
    status:     "UNDER_REVIEW",
    confidence: "LOW",
    score:      0,
    metadata:   {},
    timestamp:  new Date().toISOString(),
  };
}
