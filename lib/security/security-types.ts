/**
 * lib/security/security-types.ts
 *
 * Agentik — Security Foundation — Domain Types
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Pure TypeScript domain types for the Security Foundation layer.
 * No Prisma. No React. No Next. No server-only.
 *
 * All fields use string (ISO 8601 timestamps) — fully JSON serializable.
 * No Date objects. No BigInt. No Symbol. No undefined in serialized fields.
 *
 * This file is the single source of truth for security domain vocabulary
 * across the entire Agentik platform.
 */

// ── Severity ─────────────────────────────────────────────────────────────────

/**
 * SecuritySeverity — impact level of a security event or violation.
 *
 * LOW      — informational, no immediate risk
 * MEDIUM   — notable event, requires monitoring
 * HIGH     — significant risk, requires attention
 * CRITICAL — immediate threat, requires action
 */
export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Numeric rank for severity ordering (higher = more severe).
 * Used for sorting and threshold comparisons.
 */
export const SECURITY_SEVERITY_RANK: Record<SecuritySeverity, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

/** Sort comparator: CRITICAL first, LOW last. */
export function compareSeverity(a: SecuritySeverity, b: SecuritySeverity): number {
  return SECURITY_SEVERITY_RANK[b] - SECURITY_SEVERITY_RANK[a];
}

// ── Category ──────────────────────────────────────────────────────────────────

/**
 * SecurityCategory — domain of the security event.
 *
 * AUTHENTICATION   — identity verification events
 * AUTHORIZATION    — access control decisions
 * DATA_ACCESS      — reads and queries on sensitive data
 * DATA_EXPORT      — data leaving the system boundary
 * INTEGRATION      — external service interactions
 * SECRET           — secret/token/certificate access
 * TENANT_ISOLATION — cross-tenant boundary events
 * SYSTEM           — internal platform security events
 */
export type SecurityCategory =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "DATA_ACCESS"
  | "DATA_EXPORT"
  | "INTEGRATION"
  | "SECRET"
  | "TENANT_ISOLATION"
  | "SYSTEM";

// ── Event Type ────────────────────────────────────────────────────────────────

/**
 * SecurityEventType — the action that triggered the security event.
 */
export type SecurityEventType =
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"
  | "DATA_READ"
  | "DATA_WRITE"
  | "DATA_DELETE"
  | "DATA_EXPORT"
  | "SECRET_ACCESSED"
  | "INTEGRATION_USED"
  | "POLICY_VIOLATION";

// ── Actor ─────────────────────────────────────────────────────────────────────

/**
 * SecurityActor — who triggered the event.
 */
export type SecurityActorType =
  | "USER"
  | "AGENT"
  | "SYSTEM"
  | "INTEGRATION"
  | "CRON"
  | "ANONYMOUS";

export interface SecurityActor {
  /** Actor identifier (userId, agentId, serviceId, or "system"). */
  id:    string;
  /** Classification of the actor. */
  type:  SecurityActorType;
  /** Optional human-readable label. */
  label?: string;
}

// ── Security Event ────────────────────────────────────────────────────────────

/**
 * SecurityEvent — the core audit unit.
 *
 * Every security-relevant action in the platform produces a SecurityEvent.
 * Events are immutable once created.
 * All fields are JSON-serializable (string timestamps, no Date objects).
 */
export interface SecurityEvent {
  /** Unique event identifier. */
  id:          string;
  /** Tenant scope — always required. Events without orgSlug are rejected. */
  orgSlug:     string;
  /** Domain of the event. */
  category:    SecurityCategory;
  /** Action that triggered the event. */
  eventType:   SecurityEventType;
  /** Impact level of the event. */
  severity:    SecuritySeverity;
  /**
   * The resource being acted upon.
   * Examples: "copilot-memory:m123", "playbook:pb456", "integration:shopify"
   */
  resource:    string;
  /** Who triggered this event. */
  actor:       SecurityActor;
  /**
   * Arbitrary structured metadata for the event.
   * Must be JSON-serializable — no Date, BigInt, or circular refs.
   */
  metadata:    Record<string, unknown>;
  /** ISO 8601 timestamp of when the event occurred. */
  occurredAt:  string;
}

// ── Data Sensitivity ──────────────────────────────────────────────────────────

/**
 * DataSensitivity — classification level for data assets.
 *
 * PUBLIC       — no restrictions, publicly accessible
 * INTERNAL     — org-internal only, not for external sharing
 * CONFIDENTIAL — restricted to authorized roles within the org
 * RESTRICTED   — highest sensitivity, explicit access required
 */
export type DataSensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

/**
 * Numeric rank for sensitivity ordering (higher = more sensitive).
 */
export const DATA_SENSITIVITY_RANK: Record<DataSensitivity, number> = {
  PUBLIC:       1,
  INTERNAL:     2,
  CONFIDENTIAL: 3,
  RESTRICTED:   4,
};

// ── Access Action ─────────────────────────────────────────────────────────────

/**
 * AccessAction — the operation being requested on a resource.
 */
export type AccessAction = "READ" | "WRITE" | "DELETE" | "EXPORT" | "ADMIN";

// ── Security Policy ID ────────────────────────────────────────────────────────

/**
 * Well-known security policy identifiers.
 */
export type SecurityPolicyId =
  | "TENANT_ISOLATION_REQUIRED"
  | "AUDIT_REQUIRED"
  | "SECRETS_PROTECTED"
  | "EXECUTIVE_DATA_PROTECTED"
  | "MEMORY_DATA_PROTECTED"
  | "PLAYBOOK_DATA_PROTECTED";

// ── Security Signal ID ────────────────────────────────────────────────────────

/**
 * Well-known security signal identifiers.
 * Signals are anomalies or risks detected by the Security Foundation.
 */
export type SecuritySignalId =
  | "TENANT_BOUNDARY_VIOLATION"
  | "UNCLASSIFIED_SENSITIVE_DATA"
  | "UNAUDITED_ACCESS"
  | "POLICY_VIOLATION"
  | "SECRET_EXPOSURE_RISK";
