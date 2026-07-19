/**
 * lib/security/audit-persistence/audit-repository.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Repository Contract
 *
 * Pure interface contract for audit event persistence.
 * No Prisma. No implementation. No server-only.
 *
 * All methods are:
 *   - async (returns Promise)
 *   - fail-safe (never throw into callers — implementations must handle internally)
 *   - tenant-scoped (orgSlug required for all tenant queries)
 *   - append-only (no update/delete methods)
 */

import type {
  PersistentSecurityAuditEvent,
  PersistentAuditEventInput,
  PersistentAuditCategory,
  PersistentAuditSeverity,
} from "./audit-event-types";

// ── Query options ─────────────────────────────────────────────────────────────

export interface AuditQueryOptions {
  /** Max number of events to return (default: 50, max: 500). */
  limit?:      number;
  /** ISO 8601 — return events after this timestamp. */
  after?:      string;
  /** ISO 8601 — return events before this timestamp. */
  before?:     string;
  /** Optional event type filter. */
  eventType?:  string;
}

export interface AuditCountOptions {
  /** ISO 8601 range start. */
  after?:   string;
  /** ISO 8601 range end. */
  before?:  string;
  /** Category filter. */
  category?: PersistentAuditCategory;
  /** Severity filter. */
  severity?: PersistentAuditSeverity;
}

// ── Repository interface ──────────────────────────────────────────────────────

/**
 * AuditRepository — the persistence contract for security audit events.
 *
 * Implementations:
 *   - PrismaAuditRepository (production, PostgreSQL)
 *   - InMemoryAuditRepository (tests, dry-run)
 *
 * APPEND-ONLY: No update or delete methods exist.
 * TENANT-SAFE: All queries require orgSlug.
 */
export interface AuditRepository {
  /**
   * Append a single audit event.
   * Never throws — returns false on failure.
   */
  appendEvent(input: PersistentAuditEventInput): Promise<PersistentSecurityAuditEvent | null>;

  /**
   * Append multiple audit events in a single operation.
   * Returns the count of successfully persisted events.
   * Never throws.
   */
  appendMany(inputs: PersistentAuditEventInput[]): Promise<number>;

  /**
   * Find a single event by its ID.
   * Never throws — returns null if not found.
   */
  findById(id: string): Promise<PersistentSecurityAuditEvent | null>;

  /**
   * Find events for a given tenant.
   * Always requires orgSlug — tenant isolation enforced.
   */
  findByTenant(orgSlug: string, options?: AuditQueryOptions): Promise<PersistentSecurityAuditEvent[]>;

  /**
   * Find events by category for a given tenant.
   */
  findByCategory(
    orgSlug:   string,
    category:  PersistentAuditCategory,
    options?:  AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]>;

  /**
   * Find events by severity for a given tenant.
   */
  findBySeverity(
    orgSlug:  string,
    severity: PersistentAuditSeverity,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]>;

  /**
   * Find events within a time range for a given tenant.
   */
  findByDateRange(
    orgSlug:  string,
    after:    string,
    before:   string,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]>;

  /**
   * Find the N most recent events for a given tenant.
   */
  findRecent(orgSlug: string, limit?: number): Promise<PersistentSecurityAuditEvent[]>;

  /**
   * Count events for a given tenant, optionally filtered.
   */
  countEvents(orgSlug: string, options?: AuditCountOptions): Promise<number>;
}
