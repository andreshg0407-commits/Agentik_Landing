/**
 * lib/security/zero-trust/security-audit.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Security Audit — Zero Trust Integration with AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 *
 * Server-only. Bridges Zero Trust evaluation results into the persistent audit system.
 *
 * Maps:
 *   ZeroTrustDecision → PersistentAuditEventType
 *   SecurityEventType → PersistentAuditCategory
 *   ZeroTrustRiskLevel → PersistentAuditSeverity
 *
 * All vault, secret, cross-tenant, agent scope, and integration events
 * are emitted as persistent audit records for compliance and investigation.
 */

import "server-only";

import type { ZeroTrustEvaluation, ZeroTrustDecision, ZeroTrustRiskLevel } from "./zero-trust-types";
import type { SecurityEvent, SecurityEventType }                           from "./security-events";
import type {
  PersistentAuditEventType,
  PersistentAuditCategory,
  PersistentAuditSeverity,
  AuditActor,
  AuditResource,
} from "../audit-persistence/audit-event-types";

// ── Zero Trust Audit Record ────────────────────────────────────────────────────

/**
 * ZeroTrustAuditRecord — a persistent audit record derived from a Zero Trust evaluation.
 * Designed to be passed into the persistent audit service.
 */
export interface ZeroTrustAuditRecord {
  /** Derived persistent event type. */
  eventType:    PersistentAuditEventType;
  /** Domain category. */
  category:     PersistentAuditCategory;
  /** Severity level. */
  severity:     PersistentAuditSeverity;
  /** Organization context. */
  orgSlug:      string;
  /** Who performed the access. */
  actor:        AuditActor;
  /** What was accessed. */
  resource:     AuditResource;
  /** Zero Trust decision. */
  decision:     ZeroTrustDecision;
  /** Reasons from the evaluation. */
  reasons:      string[];
  /** Trust score at evaluation time. */
  trustScore:   number;
  /** Risk level. */
  riskLevel:    ZeroTrustRiskLevel;
  /** Whether the event requires follow-up action. */
  requiresAction: boolean;
  /** ISO timestamp. */
  recordedAt:   string;
  /** Evaluation duration in ms. */
  durationMs:   number;
}

// ── Decision → PersistentAuditEventType ──────────────────────────────────────

const DECISION_TO_EVENT_TYPE: Record<ZeroTrustDecision, PersistentAuditEventType> = {
  ALLOW:     "ACCESS_GRANTED",
  DENY:      "ACCESS_DENIED",
  CHALLENGE: "ACCESS_DENIED",
};

// ── SecurityEventType → PersistentAuditCategory ──────────────────────────────

const SECURITY_EVENT_TO_CATEGORY: Record<SecurityEventType, PersistentAuditCategory> = {
  ZERO_TRUST_ALLOW:         "AUTHORIZATION",
  ZERO_TRUST_DENY:          "AUTHORIZATION",
  ZERO_TRUST_CHALLENGE:     "AUTHORIZATION",
  ZERO_TRUST_RISK_HIGH:     "POLICY_VIOLATION",
  ZERO_TRUST_RISK_CRITICAL: "POLICY_VIOLATION",
  CROSS_TENANT_BLOCKED:     "TENANT_BOUNDARY",
  AGENT_SCOPE_BLOCKED:      "AUTHORIZATION",
  INTEGRATION_BLOCKED:      "INTEGRATION",
  SECRET_ACCESS_DENIED:     "SECRET_ACCESS",
  SESSION_HIJACK_DETECTED:  "AUTHENTICATION",
  SESSION_EXPIRED:          "AUTHENTICATION",
};

// ── ZeroTrustRiskLevel → PersistentAuditSeverity ─────────────────────────────

const RISK_TO_SEVERITY: Record<ZeroTrustRiskLevel, PersistentAuditSeverity> = {
  LOW:      "LOW",
  MEDIUM:   "MEDIUM",
  HIGH:     "HIGH",
  CRITICAL: "CRITICAL",
};

// ── buildZeroTrustAuditRecord ─────────────────────────────────────────────────

/**
 * buildZeroTrustAuditRecord — convert a ZeroTrustEvaluation into a persistent audit record.
 *
 * Pass the result to the persistent audit service for storage.
 */
export function buildZeroTrustAuditRecord(
  evaluation: ZeroTrustEvaluation,
): ZeroTrustAuditRecord {
  const ctx = evaluation.context;

  const actor: AuditActor = {
    id:   ctx.userId ?? ctx.agentId ?? ctx.integrationId ?? ctx.apiKeyId ?? "system",
    type: mapSubjectType(ctx.subjectType),
  };

  const resource: AuditResource = {
    id:   ctx.resourceId ?? ctx.resourceType,
    type: ctx.resourceType,
  };

  return {
    eventType:      DECISION_TO_EVENT_TYPE[evaluation.decision],
    category:       decisionToCategory(evaluation.decision, evaluation.riskLevel),
    severity:       RISK_TO_SEVERITY[evaluation.riskLevel],
    orgSlug:        ctx.orgSlug,
    actor,
    resource,
    decision:       evaluation.decision,
    reasons:        evaluation.reasons,
    trustScore:     evaluation.score,
    riskLevel:      evaluation.riskLevel,
    requiresAction: evaluation.riskLevel === "CRITICAL" && evaluation.decision === "DENY",
    recordedAt:     evaluation.evaluatedAt,
    durationMs:     evaluation.durationMs,
  };
}

/**
 * buildSecurityEventAuditRecord — convert a SecurityEvent into a persistent audit record.
 */
export function buildSecurityEventAuditRecord(
  event: SecurityEvent,
): ZeroTrustAuditRecord {
  const actor: AuditActor = {
    id:   event.subjectId,
    type: mapSubjectType(event.subjectType),
  };

  const resource: AuditResource = {
    id:   event.resourceType,
    type: event.resourceType,
  };

  return {
    eventType:      DECISION_TO_EVENT_TYPE[event.decision],
    category:       SECURITY_EVENT_TO_CATEGORY[event.eventType],
    severity:       RISK_TO_SEVERITY[event.riskLevel],
    orgSlug:        event.orgSlug,
    actor,
    resource,
    decision:       event.decision,
    reasons:        event.reasons,
    trustScore:     0,
    riskLevel:      event.riskLevel,
    requiresAction: event.requiresAction,
    recordedAt:     event.occurredAt,
    durationMs:     event.durationMs ?? 0,
  };
}

// ── shouldAuditEvaluation ──────────────────────────────────────────────────────

/**
 * shouldAuditEvaluation — returns true if this evaluation must be persisted.
 *
 * Always audit: DENY, CHALLENGE, high/critical risk, vault/secret/encryption access.
 * Skip: LOW-risk ALLOW for non-sensitive resources.
 */
export function shouldAuditEvaluation(evaluation: ZeroTrustEvaluation): boolean {
  if (evaluation.auditRequired) return true;
  if (evaluation.decision !== "ALLOW") return true;
  if (evaluation.riskLevel === "HIGH" || evaluation.riskLevel === "CRITICAL") return true;
  const sensitiveResources = new Set(["VAULT", "SECRET", "ENCRYPTION_KEY", "AI_EXECUTIVE_BRAIN"]);
  return sensitiveResources.has(evaluation.context.resourceType);
}

/**
 * shouldAuditSecurityEvent — returns true if the security event must be persisted.
 */
export function shouldAuditSecurityEvent(event: SecurityEvent): boolean {
  if (event.requiresAction) return true;
  if (event.severity === "CRITICAL" || event.severity === "HIGH") return true;
  return event.eventType !== "ZERO_TRUST_ALLOW";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapSubjectType(
  subjectType: string,
): AuditActor["type"] {
  switch (subjectType) {
    case "USER":            return "USER";
    case "AGENT":           return "AGENT";
    case "SYSTEM":          return "SYSTEM";
    case "SERVICE_ACCOUNT": return "SYSTEM";
    case "INTEGRATION":     return "INTEGRATION";
    case "API_KEY":         return "SYSTEM";
    default:                return "SYSTEM";
  }
}

function decisionToCategory(
  decision:  ZeroTrustDecision,
  riskLevel: ZeroTrustRiskLevel,
): PersistentAuditCategory {
  if (decision === "DENY" || decision === "CHALLENGE") {
    if (riskLevel === "CRITICAL") return "POLICY_VIOLATION";
    return "AUTHORIZATION";
  }
  return "AUTHORIZATION";
}
