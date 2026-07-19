/**
 * lib/security/audit-persistence/audit-retention.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Retention Policy
 *
 * Defines retention policies for audit events by severity and category.
 * No execution — policy definitions only.
 * Actual cleanup is deferred to AGENTIK-SECURITY-AUDIT-RETENTION-01.
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type { PersistentAuditSeverity, PersistentAuditCategory } from "./audit-event-types";

// ── Retention policy types ────────────────────────────────────────────────────

/** How long to retain audit events of a given classification. */
export interface RetentionPolicy {
  /** Unique policy identifier. */
  id:             string;
  /** Human-readable name. */
  name:           string;
  /** Severity this policy applies to (null = applies to all). */
  severity:       PersistentAuditSeverity | null;
  /** Category this policy applies to (null = applies to all). */
  category:       PersistentAuditCategory | null;
  /**
   * Retention period in days.
   * null = retain indefinitely (never delete automatically).
   */
  retentionDays:  number | null;
  /** Human-readable rationale. */
  rationale:      string;
  /** Compliance frameworks that require this retention period. */
  compliance:     string[];
}

// ── Retention registry ────────────────────────────────────────────────────────

/**
 * AUDIT_RETENTION_POLICIES — canonical retention definitions.
 *
 * Priority (higher = takes precedence):
 *   3 — Category-specific
 *   2 — Severity-specific
 *   1 — Default (catch-all)
 */
export const AUDIT_RETENTION_POLICIES: ReadonlyArray<RetentionPolicy> = [
  // ── CRITICAL — indefinite ────────────────────────────────────────────────
  {
    id:            "CRITICAL_INDEFINITE",
    name:          "CRITICAL Events — Indefinite Retention",
    severity:      "CRITICAL",
    category:      null,
    retentionDays: null,
    rationale:     "CRITICAL events (tenant boundary violations, policy violations, access denials) must be retained indefinitely for forensic investigation and compliance.",
    compliance:    ["ISO-27001", "SOC2-TYPE2"],
  },

  // ── HIGH — 365 days ──────────────────────────────────────────────────────
  {
    id:            "HIGH_365_DAYS",
    name:          "HIGH Severity — 365 Days",
    severity:      "HIGH",
    category:      null,
    retentionDays: 365,
    rationale:     "HIGH severity events retained for 1 year to support incident investigation and compliance audits.",
    compliance:    ["ISO-27001", "SOC2-TYPE2"],
  },

  // ── MEDIUM — 180 days ────────────────────────────────────────────────────
  {
    id:            "MEDIUM_180_DAYS",
    name:          "MEDIUM Severity — 180 Days",
    severity:      "MEDIUM",
    category:      null,
    retentionDays: 180,
    rationale:     "MEDIUM severity events retained for 6 months for operational monitoring.",
    compliance:    [],
  },

  // ── LOW — 90 days ────────────────────────────────────────────────────────
  {
    id:            "LOW_90_DAYS",
    name:          "LOW Severity — 90 Days",
    severity:      "LOW",
    category:      null,
    retentionDays: 90,
    rationale:     "LOW severity events retained for 3 months for operational debugging.",
    compliance:    [],
  },

  // ── VAULT — indefinite (category override) ───────────────────────────────
  {
    id:            "VAULT_INDEFINITE",
    name:          "Vault Events — Indefinite Retention",
    severity:      null,
    category:      "VAULT",
    retentionDays: null,
    rationale:     "All vault secret lifecycle events (create, read, revoke, delete) are retained indefinitely regardless of severity for security audit purposes.",
    compliance:    ["ISO-27001", "SOC2-TYPE2"],
  },

  // ── TENANT_BOUNDARY — indefinite (category override) ────────────────────
  {
    id:            "TENANT_BOUNDARY_INDEFINITE",
    name:          "Tenant Boundary Events — Indefinite Retention",
    severity:      null,
    category:      "TENANT_BOUNDARY",
    retentionDays: null,
    rationale:     "Tenant boundary violation events are retained indefinitely — required for regulatory compliance and forensic investigation.",
    compliance:    ["ISO-27001", "GDPR", "SOC2-TYPE2"],
  },

  // ── AUTONOMOUS_OPERATIONS — 365 days ────────────────────────────────────
  {
    id:            "AUTONOMOUS_OPS_365",
    name:          "Autonomous Operations — 365 Days",
    severity:      null,
    category:      "AUTONOMOUS_OPERATIONS",
    retentionDays: 365,
    rationale:     "Agent-initiated actions must be traceable for at least 1 year to support accountability reviews.",
    compliance:    [],
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Find the applicable retention policy for an event.
 * Category-specific policies take precedence over severity-specific.
 * Returns null if no policy matches (should not happen with a complete registry).
 */
export function getRetentionPolicy(
  severity: PersistentAuditSeverity,
  category: PersistentAuditCategory,
): RetentionPolicy | null {
  // Priority 3: category-specific
  const catPolicy = AUDIT_RETENTION_POLICIES.find(
    p => p.category === category && p.severity === null,
  );
  if (catPolicy) return catPolicy;

  // Priority 2: severity-specific
  const sevPolicy = AUDIT_RETENTION_POLICIES.find(
    p => p.severity === severity && p.category === null,
  );
  if (sevPolicy) return sevPolicy;

  return null;
}

/**
 * Get retention days for an event (null = retain forever).
 */
export function getRetentionDays(
  severity: PersistentAuditSeverity,
  category: PersistentAuditCategory,
): number | null {
  return getRetentionPolicy(severity, category)?.retentionDays ?? null;
}

/**
 * Check if an event should be retained indefinitely.
 */
export function isIndefiniteRetention(
  severity: PersistentAuditSeverity,
  category: PersistentAuditCategory,
): boolean {
  return getRetentionDays(severity, category) === null;
}

/**
 * Compute the expiry date for an event based on its retention policy.
 * Returns null if the event should be retained indefinitely.
 */
export function computeExpiryDate(
  severity:  PersistentAuditSeverity,
  category:  PersistentAuditCategory,
  createdAt: string,
): string | null {
  const days = getRetentionDays(severity, category);
  if (days === null) return null;
  const d = new Date(createdAt);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Get all policies that require indefinite retention. */
export function getIndefiniteRetentionPolicies(): RetentionPolicy[] {
  return AUDIT_RETENTION_POLICIES.filter(p => p.retentionDays === null);
}
