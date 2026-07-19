/**
 * lib/security/audit-persistence/audit-query-engine.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Query Engine
 *
 * Deterministic query functions over the persistent audit store.
 * No AI. No inference. Pure SQL-backed queries via AuditRepository.
 *
 * All functions:
 *   - Are async
 *   - Require orgSlug (tenant isolation)
 *   - Never throw into callers
 *   - Return serializable results
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import type { AuditRepository } from "./audit-repository";
import type {
  PersistentSecurityAuditEvent,
  PersistentAuditCategory,
  PersistentAuditSeverity,
  PersistentAuditEventType,
} from "./audit-event-types";
import { AUDIT_SEVERITY_RANK } from "./audit-event-types";

// ── Timeline entry ────────────────────────────────────────────────────────────

export interface AuditTimelineEntry {
  /** ISO 8601 date (YYYY-MM-DD). */
  date:         string;
  /** Total events on this date. */
  total:        number;
  /** CRITICAL events on this date. */
  critical:     number;
  /** HIGH events on this date. */
  high:         number;
  /** MEDIUM events on this date. */
  medium:       number;
  /** LOW events on this date. */
  low:          number;
}

// ── Event summary ─────────────────────────────────────────────────────────────

export interface AuditEventSummary {
  eventType: PersistentAuditEventType;
  category:  PersistentAuditCategory;
  severity:  PersistentAuditSeverity;
  count:     number;
}

// ── Query engine ──────────────────────────────────────────────────────────────

export class AuditQueryEngine {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Get all recent events for a tenant, sorted newest-first.
   * Never throws.
   */
  async getTenantEvents(
    orgSlug: string,
    limit    = 100,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      return await this.repo.findByTenant(orgSlug, { limit });
    } catch {
      return [];
    }
  }

  /**
   * Get the N most recent events for a tenant.
   * Never throws.
   */
  async getRecentEvents(
    orgSlug: string,
    limit    = 20,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      return await this.repo.findRecent(orgSlug, limit);
    } catch {
      return [];
    }
  }

  /**
   * Get CRITICAL and HIGH severity events for a tenant.
   * Never throws.
   */
  async getCriticalEvents(
    orgSlug: string,
    limit    = 50,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const [critical, high] = await Promise.all([
        this.repo.findBySeverity(orgSlug, "CRITICAL", { limit }),
        this.repo.findBySeverity(orgSlug, "HIGH",     { limit }),
      ]);
      return [...critical, ...high]
        .sort((a, b) => {
          const sev = AUDIT_SEVERITY_RANK[b.severity] - AUDIT_SEVERITY_RANK[a.severity];
          if (sev !== 0) return sev;
          return b.createdAt.localeCompare(a.createdAt);
        })
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Get events in a specific category for a tenant.
   * Never throws.
   */
  async getCategoryEvents(
    orgSlug:  string,
    category: PersistentAuditCategory,
    limit     = 50,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      return await this.repo.findByCategory(orgSlug, category, { limit });
    } catch {
      return [];
    }
  }

  /**
   * Get an event timeline (grouped by day) for a tenant.
   * Returns entries sorted newest-first.
   * Never throws.
   */
  async getEventTimeline(
    orgSlug: string,
    days     = 30,
  ): Promise<AuditTimelineEntry[]> {
    try {
      const before = new Date();
      const after  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const events = await this.repo.findByDateRange(
        orgSlug,
        after.toISOString(),
        before.toISOString(),
        { limit: 500 },
      );

      // Group by date
      const byDate = new Map<string, AuditTimelineEntry>();
      for (const e of events) {
        const date = e.createdAt.slice(0, 10); // YYYY-MM-DD
        const entry = byDate.get(date) ?? {
          date,
          total:    0,
          critical: 0,
          high:     0,
          medium:   0,
          low:      0,
        };
        entry.total++;
        if (e.severity === "CRITICAL") entry.critical++;
        else if (e.severity === "HIGH")   entry.high++;
        else if (e.severity === "MEDIUM") entry.medium++;
        else                              entry.low++;
        byDate.set(date, entry);
      }

      return Array.from(byDate.values()).sort((a, b) =>
        b.date.localeCompare(a.date),
      );
    } catch {
      return [];
    }
  }

  /**
   * Get event type summary (count per type+category+severity) for a tenant.
   * Never throws.
   */
  async getEventSummary(
    orgSlug: string,
    limit    = 200,
  ): Promise<AuditEventSummary[]> {
    try {
      const events = await this.repo.findByTenant(orgSlug, { limit });
      const counts = new Map<string, AuditEventSummary>();
      for (const e of events) {
        const key = `${e.eventType}::${e.category}::${e.severity}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, {
            eventType: e.eventType,
            category:  e.category,
            severity:  e.severity,
            count:     1,
          });
        }
      }
      return Array.from(counts.values()).sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }

  /**
   * Count total events for a tenant.
   * Never throws.
   */
  async countTenantEvents(orgSlug: string): Promise<number> {
    try {
      return await this.repo.countEvents(orgSlug);
    } catch {
      return 0;
    }
  }
}

// ── Convenience functions ─────────────────────────────────────────────────────

/**
 * getTenantEvents — get all events for a tenant (max 100).
 * Convenience wrapper over AuditQueryEngine.
 */
export async function getTenantEvents(
  orgSlug: string,
  repo:    AuditRepository,
  limit    = 100,
): Promise<PersistentSecurityAuditEvent[]> {
  return new AuditQueryEngine(repo).getTenantEvents(orgSlug, limit);
}

export async function getRecentEvents(
  orgSlug: string,
  repo:    AuditRepository,
  limit    = 20,
): Promise<PersistentSecurityAuditEvent[]> {
  return new AuditQueryEngine(repo).getRecentEvents(orgSlug, limit);
}

export async function getCriticalEvents(
  orgSlug: string,
  repo:    AuditRepository,
  limit    = 50,
): Promise<PersistentSecurityAuditEvent[]> {
  return new AuditQueryEngine(repo).getCriticalEvents(orgSlug, limit);
}

export async function getCategoryEvents(
  orgSlug:  string,
  category: PersistentAuditCategory,
  repo:     AuditRepository,
  limit     = 50,
): Promise<PersistentSecurityAuditEvent[]> {
  return new AuditQueryEngine(repo).getCategoryEvents(orgSlug, category, limit);
}

export async function getEventTimeline(
  orgSlug: string,
  repo:    AuditRepository,
  days     = 30,
): Promise<AuditTimelineEntry[]> {
  return new AuditQueryEngine(repo).getEventTimeline(orgSlug, days);
}
