/**
 * lib/security/zero-trust/security-events.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Security Events — Zero Trust Event Model
 *
 * No server-only. No Prisma. Pure domain types and factory functions.
 *
 * Events:
 *   ZERO_TRUST_ALLOW          — access granted by policy engine
 *   ZERO_TRUST_DENY           — access denied by policy engine
 *   ZERO_TRUST_CHALLENGE      — step-up auth required
 *   ZERO_TRUST_RISK_HIGH      — high-risk access pattern detected
 *   ZERO_TRUST_RISK_CRITICAL  — critical risk, immediate attention needed
 *   CROSS_TENANT_BLOCKED      — cross-tenant access attempt blocked
 *   AGENT_SCOPE_BLOCKED       — agent tried to access outside its domain
 *   INTEGRATION_BLOCKED       — integration access denied
 *   SECRET_ACCESS_DENIED      — vault/secret/key access denied
 *   SESSION_HIJACK_DETECTED   — session hijack signal detected
 *   SESSION_EXPIRED           — session has expired
 */

import type { ZeroTrustRiskLevel, ZeroTrustDecision } from "./zero-trust-types";

// ── Event Types ────────────────────────────────────────────────────────────────

export type SecurityEventType =
  | "ZERO_TRUST_ALLOW"
  | "ZERO_TRUST_DENY"
  | "ZERO_TRUST_CHALLENGE"
  | "ZERO_TRUST_RISK_HIGH"
  | "ZERO_TRUST_RISK_CRITICAL"
  | "CROSS_TENANT_BLOCKED"
  | "AGENT_SCOPE_BLOCKED"
  | "INTEGRATION_BLOCKED"
  | "SECRET_ACCESS_DENIED"
  | "SESSION_HIJACK_DETECTED"
  | "SESSION_EXPIRED";

export type SecurityEventSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

// ── Security Event ─────────────────────────────────────────────────────────────

export interface SecurityEvent {
  /** Unique event ID. */
  eventId:     string;
  /** Event classification. */
  eventType:   SecurityEventType;
  /** Severity level for alerting. */
  severity:    SecurityEventSeverity;
  /** Risk level from Zero Trust evaluation. */
  riskLevel:   ZeroTrustRiskLevel;
  /** Zero Trust decision that triggered this event. */
  decision:    ZeroTrustDecision;
  /** Organization context. */
  orgSlug:     string;
  /** Subject identifier (userId, agentId, integrationId, etc.). */
  subjectId:   string;
  /** Subject type. */
  subjectType: string;
  /** Resource that was accessed. */
  resourceType: string;
  /** Action that was attempted. */
  action:      string;
  /** Reasons from the Zero Trust evaluation. */
  reasons:     string[];
  /** Whether this event requires immediate action. */
  requiresAction: boolean;
  /** ISO timestamp. */
  occurredAt:  string;
  /** Evaluation duration in ms. */
  durationMs?: number;
  /** Additional context metadata. */
  metadata?:   Record<string, string>;
}

// ── Severity mapping ──────────────────────────────────────────────────────────

const EVENT_SEVERITY: Record<SecurityEventType, SecurityEventSeverity> = {
  ZERO_TRUST_ALLOW:         "INFO",
  ZERO_TRUST_DENY:          "WARNING",
  ZERO_TRUST_CHALLENGE:     "WARNING",
  ZERO_TRUST_RISK_HIGH:     "HIGH",
  ZERO_TRUST_RISK_CRITICAL: "CRITICAL",
  CROSS_TENANT_BLOCKED:     "CRITICAL",
  AGENT_SCOPE_BLOCKED:      "HIGH",
  INTEGRATION_BLOCKED:      "HIGH",
  SECRET_ACCESS_DENIED:     "CRITICAL",
  SESSION_HIJACK_DETECTED:  "CRITICAL",
  SESSION_EXPIRED:          "WARNING",
};

const REQUIRES_ACTION_EVENTS = new Set<SecurityEventType>([
  "ZERO_TRUST_RISK_CRITICAL",
  "CROSS_TENANT_BLOCKED",
  "SECRET_ACCESS_DENIED",
  "SESSION_HIJACK_DETECTED",
]);

// ── Event ID counter (in-process, not persistent) ────────────────────────────

let _eventCounter = 0;

function generateEventId(eventType: SecurityEventType): string {
  _eventCounter += 1;
  const ts   = Date.now().toString(36).toUpperCase();
  const seq  = String(_eventCounter).padStart(4, "0");
  const abbr = eventType.replace(/_/g, "").slice(0, 6).toUpperCase();
  return `SEVT-${abbr}-${ts}-${seq}`;
}

// ── Factory Functions ─────────────────────────────────────────────────────────

/**
 * buildZeroTrustEvent — create a security event from a Zero Trust evaluation result.
 */
export function buildZeroTrustEvent(params: {
  decision:     ZeroTrustDecision;
  riskLevel:    ZeroTrustRiskLevel;
  orgSlug:      string;
  subjectId:    string;
  subjectType:  string;
  resourceType: string;
  action:       string;
  reasons:      string[];
  durationMs?:  number;
  metadata?:    Record<string, string>;
}): SecurityEvent {
  const eventType = decisionToEventType(params.decision, params.riskLevel);
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       EVENT_SEVERITY[eventType],
    riskLevel:      params.riskLevel,
    decision:       params.decision,
    orgSlug:        params.orgSlug,
    subjectId:      params.subjectId,
    subjectType:    params.subjectType,
    resourceType:   params.resourceType,
    action:         params.action,
    reasons:        params.reasons,
    requiresAction: REQUIRES_ACTION_EVENTS.has(eventType),
    occurredAt:     new Date().toISOString(),
    durationMs:     params.durationMs,
    metadata:       params.metadata,
  };
}

/**
 * buildCrossTenantEvent — create a CROSS_TENANT_BLOCKED event.
 */
export function buildCrossTenantEvent(params: {
  orgSlug:       string;
  subjectId:     string;
  subjectType:   string;
  requestedOrg:  string;
  resourceType:  string;
}): SecurityEvent {
  const eventType: SecurityEventType = "CROSS_TENANT_BLOCKED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "CRITICAL",
    riskLevel:      "CRITICAL",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.subjectId,
    subjectType:    params.subjectType,
    resourceType:   params.resourceType,
    action:         "READ",
    reasons:        [`cross_tenant_attempt: context=${params.orgSlug} requested=${params.requestedOrg}`],
    requiresAction: true,
    occurredAt:     new Date().toISOString(),
    metadata:       { requestedOrg: params.requestedOrg },
  };
}

/**
 * buildAgentScopeEvent — create an AGENT_SCOPE_BLOCKED event.
 */
export function buildAgentScopeEvent(params: {
  agentId:      string;
  orgSlug:      string;
  resourceType: string;
  action:       string;
  reasons:      string[];
}): SecurityEvent {
  const eventType: SecurityEventType = "AGENT_SCOPE_BLOCKED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "HIGH",
    riskLevel:      "HIGH",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.agentId,
    subjectType:    "AGENT",
    resourceType:   params.resourceType,
    action:         params.action,
    reasons:        params.reasons,
    requiresAction: false,
    occurredAt:     new Date().toISOString(),
  };
}

/**
 * buildIntegrationBlockedEvent — create an INTEGRATION_BLOCKED event.
 */
export function buildIntegrationBlockedEvent(params: {
  integrationId: string;
  orgSlug:       string;
  resourceType:  string;
  action:        string;
  reasons:       string[];
}): SecurityEvent {
  const eventType: SecurityEventType = "INTEGRATION_BLOCKED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "HIGH",
    riskLevel:      "HIGH",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.integrationId,
    subjectType:    "INTEGRATION",
    resourceType:   params.resourceType,
    action:         params.action,
    reasons:        params.reasons,
    requiresAction: false,
    occurredAt:     new Date().toISOString(),
  };
}

/**
 * buildSecretAccessDeniedEvent — create a SECRET_ACCESS_DENIED event.
 */
export function buildSecretAccessDeniedEvent(params: {
  subjectId:    string;
  subjectType:  string;
  orgSlug:      string;
  resourceType: string;
  action:       string;
  reasons:      string[];
}): SecurityEvent {
  const eventType: SecurityEventType = "SECRET_ACCESS_DENIED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "CRITICAL",
    riskLevel:      "CRITICAL",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.subjectId,
    subjectType:    params.subjectType,
    resourceType:   params.resourceType,
    action:         params.action,
    reasons:        params.reasons,
    requiresAction: true,
    occurredAt:     new Date().toISOString(),
  };
}

/**
 * buildSessionHijackEvent — create a SESSION_HIJACK_DETECTED event.
 */
export function buildSessionHijackEvent(params: {
  userId:      string;
  orgSlug:     string;
  sessionId:   string;
  reasons:     string[];
}): SecurityEvent {
  const eventType: SecurityEventType = "SESSION_HIJACK_DETECTED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "CRITICAL",
    riskLevel:      "CRITICAL",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.userId,
    subjectType:    "USER",
    resourceType:   "USER_IDENTITY",
    action:         "READ",
    reasons:        params.reasons,
    requiresAction: true,
    occurredAt:     new Date().toISOString(),
    metadata:       { sessionId: params.sessionId },
  };
}

/**
 * buildSessionExpiredEvent — create a SESSION_EXPIRED event.
 */
export function buildSessionExpiredEvent(params: {
  userId:    string;
  orgSlug:   string;
  sessionId: string;
}): SecurityEvent {
  const eventType: SecurityEventType = "SESSION_EXPIRED";
  return {
    eventId:        generateEventId(eventType),
    eventType,
    severity:       "WARNING",
    riskLevel:      "HIGH",
    decision:       "DENY",
    orgSlug:        params.orgSlug,
    subjectId:      params.userId,
    subjectType:    "USER",
    resourceType:   "USER_IDENTITY",
    action:         "READ",
    reasons:        ["session_expired"],
    requiresAction: false,
    occurredAt:     new Date().toISOString(),
    metadata:       { sessionId: params.sessionId },
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * isCriticalEvent — returns true if the event requires immediate action.
 */
export function isCriticalEvent(event: SecurityEvent): boolean {
  return event.severity === "CRITICAL" || event.requiresAction;
}

/**
 * filterEventsByOrg — return events for a specific org.
 */
export function filterEventsByOrg(events: SecurityEvent[], orgSlug: string): SecurityEvent[] {
  return events.filter(e => e.orgSlug === orgSlug);
}

/**
 * filterEventsBySeverity — return events at or above a severity level.
 */
export function filterEventsBySeverity(
  events:   SecurityEvent[],
  severity: SecurityEventSeverity,
): SecurityEvent[] {
  const ORDER: SecurityEventSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];
  const minIdx = ORDER.indexOf(severity);
  return events.filter(e => ORDER.indexOf(e.severity) >= minIdx);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decisionToEventType(
  decision:  ZeroTrustDecision,
  riskLevel: ZeroTrustRiskLevel,
): SecurityEventType {
  if (decision === "ALLOW") {
    if (riskLevel === "CRITICAL") return "ZERO_TRUST_RISK_CRITICAL";
    if (riskLevel === "HIGH")     return "ZERO_TRUST_RISK_HIGH";
    return "ZERO_TRUST_ALLOW";
  }
  if (decision === "CHALLENGE") return "ZERO_TRUST_CHALLENGE";
  // DENY
  if (riskLevel === "CRITICAL") return "ZERO_TRUST_RISK_CRITICAL";
  if (riskLevel === "HIGH")     return "ZERO_TRUST_RISK_HIGH";
  return "ZERO_TRUST_DENY";
}
