/**
 * lib/security/audit-persistence/audit-event-types.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Domain Event Types
 *
 * Defines the canonical persistent audit event shape and all
 * related domain types used across the audit persistence layer.
 *
 * Design constraints:
 *   - All fields are JSON-serializable (string timestamps, no Date objects)
 *   - No secret values, tokens, or certificates ever stored
 *   - Every event must carry orgSlug for tenant isolation
 *   - Events are immutable once created (append-only)
 *
 * No Prisma. No server-only. Pure domain types.
 */

// ── Persistent event type registry ───────────────────────────────────────────

/**
 * All persistent audit event types across the platform.
 * Grouped by domain for readability.
 */
export type PersistentAuditEventType =
  // Security Foundation
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"
  | "DATA_READ"
  | "DATA_WRITE"
  | "DATA_DELETE"
  | "DATA_EXPORT"
  | "POLICY_VIOLATION"
  | "TENANT_BOUNDARY_VIOLATION"
  // Secret / Vault
  | "SECRET_ACCESSED"
  | "SECRET_CREATED"
  | "SECRET_UPDATED"
  | "SECRET_DISABLED"
  | "SECRET_REVOKED"
  | "SECRET_DELETED"
  | "SECRET_RESOLVED_FROM_VAULT"
  | "SECRET_RESOLVED_FROM_LEGACY"
  | "SECRET_RESOLVED_FROM_ENV"
  | "SECRET_MIGRATION_WARNING"
  // Integration
  | "INTEGRATION_USED"
  | "INTEGRATION_CONNECTED"
  | "INTEGRATION_DISCONNECTED"
  | "INTEGRATION_ERROR"
  // Executive Brain
  | "SIGNALS_COLLECTED"
  | "SIGNALS_RANKED"
  | "INSIGHTS_GENERATED"
  | "CONTEXT_BUILT"
  // Copilot
  | "INTENT_RESOLVED"
  | "AGENT_SELECTED"
  | "PLAN_GENERATED"
  | "RESPONSE_GENERATED"
  | "COPILOT_REQUEST_RECEIVED"
  | "COPILOT_EXECUTION_COMPLETED"
  // System
  | "SYSTEM_STARTUP"
  | "SYSTEM_ERROR"
  | "AUDIT_HEALTH_CHECK";

// ── Persistent audit category ─────────────────────────────────────────────────

/**
 * Domain classification for persistent audit events.
 * Matches AuditCategory registry in audit-category-registry.ts.
 */
export type PersistentAuditCategory =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "DATA_ACCESS"
  | "DATA_EXPORT"
  | "SECRET_ACCESS"
  | "TENANT_BOUNDARY"
  | "POLICY_VIOLATION"
  | "INTEGRATION"
  | "SYSTEM"
  | "VAULT"
  | "MEMORY"
  | "PLAYBOOK"
  | "EXECUTIVE_BRAIN"
  | "COPILOT"
  | "AUTONOMOUS_OPERATIONS";

// ── Severity ──────────────────────────────────────────────────────────────────

export type PersistentAuditSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Actor ─────────────────────────────────────────────────────────────────────

/**
 * AuditActor — who triggered the persistent audit event.
 * All fields are metadata only — never contains passwords or secrets.
 */
export interface AuditActor {
  /** Actor identifier (userId, agentId, serviceId, "system", "anonymous"). */
  id:    string;
  /** Actor classification. */
  type:  "USER" | "AGENT" | "SYSTEM" | "INTEGRATION" | "CRON" | "ANONYMOUS";
  /** Optional human-readable display name. */
  name?: string;
}

// ── Resource ──────────────────────────────────────────────────────────────────

/**
 * AuditResource — what was acted upon.
 * All fields are metadata only — never contains secret values.
 */
export interface AuditResource {
  /** Resource identifier (e.g. "secret:OPENAI_API_KEY", "memory:m123"). */
  id:    string;
  /** Resource classification (e.g. "SECRET", "MEMORY", "PLAYBOOK"). */
  type:  string;
  /** Optional human-readable resource name. */
  name?: string;
}

// ── Core persistent event ─────────────────────────────────────────────────────

/**
 * PersistentSecurityAuditEvent — the canonical persistent audit record.
 *
 * Stored in SecurityAuditEvent Prisma model.
 * All fields are serializable. No Date objects.
 * Never contains secret values, tokens, certificates, or passwords.
 */
export interface PersistentSecurityAuditEvent {
  /** Unique event ID (cuid or uuid). */
  id:        string;
  /** Tenant owner — all queries require this. */
  orgSlug:   string;
  /** The action that occurred. */
  eventType: PersistentAuditEventType;
  /** Domain classification. */
  category:  PersistentAuditCategory;
  /** Impact level. */
  severity:  PersistentAuditSeverity;
  /** What was acted upon (optional — not all events have a resource). */
  resource?: AuditResource;
  /** Who triggered the event (optional — system events may have no actor). */
  actor?:    AuditActor;
  /**
   * Arbitrary structured metadata.
   * Must be JSON-safe. Never include secret values.
   */
  metadata:  Record<string, unknown>;
  /** ISO 8601 timestamp — set at event creation, never modified. */
  createdAt: string;
}

// ── Input type (pre-persistence) ──────────────────────────────────────────────

/**
 * PersistentAuditEventInput — the shape accepted by the repository.
 * The repository generates id and createdAt.
 */
export interface PersistentAuditEventInput {
  orgSlug:   string;
  eventType: PersistentAuditEventType;
  category:  PersistentAuditCategory;
  severity:  PersistentAuditSeverity;
  resource?: AuditResource;
  actor?:    AuditActor;
  metadata:  Record<string, unknown>;
}

// ── Severity rank ─────────────────────────────────────────────────────────────

export const AUDIT_SEVERITY_RANK: Record<PersistentAuditSeverity, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

// ── Factory ───────────────────────────────────────────────────────────────────

let _seq = 0;

function nextEventId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `aud-${Date.now()}-${String(_seq).padStart(6, "0")}`;
}

/**
 * Create a PersistentSecurityAuditEvent from an input.
 * Sets id and createdAt. Never throws.
 */
export function createPersistentAuditEvent(
  input: PersistentAuditEventInput,
): PersistentSecurityAuditEvent {
  return {
    id:        nextEventId(),
    orgSlug:   input.orgSlug || "unknown",
    eventType: input.eventType,
    category:  input.category,
    severity:  input.severity,
    resource:  input.resource,
    actor:     input.actor,
    metadata:  input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert a PersistentSecurityAuditEvent to a log-safe string.
 * Never includes metadata values that could contain secrets.
 */
export function formatAuditEventForLog(event: PersistentSecurityAuditEvent): string {
  const parts = [
    `[AUDIT]`,
    `id=${event.id}`,
    `org=${event.orgSlug}`,
    `type=${event.eventType}`,
    `cat=${event.category}`,
    `sev=${event.severity}`,
  ];
  if (event.actor) parts.push(`actor=${event.actor.id}(${event.actor.type})`);
  if (event.resource) parts.push(`resource=${event.resource.id}`);
  parts.push(`at=${event.createdAt}`);
  return parts.join(" ");
}
