// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 32: Audit Integration
// Pure function — no try/catch. Immutable audit trail.

import { generateDirectionAuditId } from "../enterprise-direction-identity";

export type DirectionAuditEventType =
  | "DIRECTION_GENERATED"
  | "NORTH_STAR_BUILT"
  | "ALIGNMENT_EVALUATED"
  | "DEVIATIONS_DETECTED"
  | "RECOMMENDATIONS_RANKED";

export interface DirectionAuditEvent {
  readonly id:        string;
  readonly orgSlug:   string;
  readonly sessionId: string;
  readonly eventType: DirectionAuditEventType;
  readonly metadata:  Record<string, unknown>;
  readonly createdAt: string;
}

export function auditDirectionGenerated(
  orgSlug: string,
  sessionId: string,
  score: number,
  status: string,
  confidence: string
): DirectionAuditEvent {
  return {
    id:        generateDirectionAuditId(),
    orgSlug,
    sessionId,
    eventType: "DIRECTION_GENERATED",
    metadata:  { score, status, confidence, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}

export function auditNorthStarBuilt(
  orgSlug: string,
  sessionId: string,
  northStarId: string,
  score: number
): DirectionAuditEvent {
  return {
    id:        generateDirectionAuditId(),
    orgSlug,
    sessionId,
    eventType: "NORTH_STAR_BUILT",
    metadata:  { northStarId, score, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}

export function auditAlignmentEvaluated(
  orgSlug: string,
  sessionId: string,
  alignmentId: string,
  alignmentScore: number,
  status: string
): DirectionAuditEvent {
  return {
    id:        generateDirectionAuditId(),
    orgSlug,
    sessionId,
    eventType: "ALIGNMENT_EVALUATED",
    metadata:  { alignmentId, alignmentScore, status },
    createdAt: new Date().toISOString(),
  };
}

export function auditDeviationsDetected(
  orgSlug: string,
  sessionId: string,
  count: number,
  criticalCount: number
): DirectionAuditEvent {
  return {
    id:        generateDirectionAuditId(),
    orgSlug,
    sessionId,
    eventType: "DEVIATIONS_DETECTED",
    metadata:  { count, criticalCount },
    createdAt: new Date().toISOString(),
  };
}

export function auditRecommendationsRanked(
  orgSlug: string,
  sessionId: string,
  count: number,
  criticalCount: number
): DirectionAuditEvent {
  return {
    id:        generateDirectionAuditId(),
    orgSlug,
    sessionId,
    eventType: "RECOMMENDATIONS_RANKED",
    metadata:  { count, criticalCount, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}
