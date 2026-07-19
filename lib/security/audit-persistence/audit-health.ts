/**
 * lib/security/audit-persistence/audit-health.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Health Monitor
 *
 * Validates that the audit persistence layer is operational.
 * No external monitoring. No SIEM. No alerts.
 * Pure local health checks.
 *
 * Checks:
 *   - Repository accessible (can query)
 *   - Write functional (can append an event)
 *   - Indexes available (recent query returns in time)
 *
 * Fail-safe: health checks never throw.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import type { AuditRepository } from "./audit-repository";

// ── Health types ──────────────────────────────────────────────────────────────

export type AuditHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface AuditHealthCheckResult {
  name:       string;
  status:     AuditHealthStatus;
  durationMs: number;
  detail?:    string;
}

export interface AuditHealthReport {
  status:     AuditHealthStatus;
  checks:     AuditHealthCheckResult[];
  checkedAt:  string;
  durationMs: number;
}

// ── Health checker ────────────────────────────────────────────────────────────

export class AuditHealthMonitor {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Run all health checks and return a consolidated report.
   * Never throws. All checks are fail-safe.
   */
  async checkAuditHealth(): Promise<AuditHealthReport> {
    const start  = Date.now();
    const checks = await Promise.all([
      this._checkRepositoryAccessible(),
      this._checkWriteFunctional(),
      this._checkRecentQueryWorks(),
    ]);

    const hasUnavailable = checks.some(c => c.status === "UNAVAILABLE");
    const hasDegraded    = checks.some(c => c.status === "DEGRADED");

    const status: AuditHealthStatus =
      hasUnavailable ? "UNAVAILABLE" :
      hasDegraded    ? "DEGRADED"    : "HEALTHY";

    return {
      status,
      checks,
      checkedAt:  new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  private async _checkRepositoryAccessible(): Promise<AuditHealthCheckResult> {
    const start = Date.now();
    const name  = "repository_accessible";
    try {
      // Attempt a count query on a system org — any error = unavailable
      await this.repo.countEvents("__health_check__");
      return {
        name,
        status:     "HEALTHY",
        durationMs: Date.now() - start,
        detail:     "Repository query succeeded",
      };
    } catch (e: any) {
      return {
        name,
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     `Repository query failed: ${e?.message ?? e}`,
      };
    }
  }

  private async _checkWriteFunctional(): Promise<AuditHealthCheckResult> {
    const start = Date.now();
    const name  = "write_functional";
    try {
      const result = await this.repo.appendEvent({
        orgSlug:   "__health_check__",
        eventType: "AUDIT_HEALTH_CHECK",
        category:  "SYSTEM",
        severity:  "LOW",
        metadata:  { healthCheck: true, ts: new Date().toISOString() },
      });
      if (result === null) {
        return {
          name,
          status:     "DEGRADED",
          durationMs: Date.now() - start,
          detail:     "appendEvent returned null (write may have failed silently)",
        };
      }
      return {
        name,
        status:     "HEALTHY",
        durationMs: Date.now() - start,
        detail:     `Write succeeded: id=${result.id}`,
      };
    } catch (e: any) {
      return {
        name,
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     `Write failed: ${e?.message ?? e}`,
      };
    }
  }

  private async _checkRecentQueryWorks(): Promise<AuditHealthCheckResult> {
    const start = Date.now();
    const name  = "recent_query_works";
    try {
      const events = await this.repo.findRecent("__health_check__", 1);
      const duration = Date.now() - start;
      if (duration > 2000) {
        return {
          name,
          status:     "DEGRADED",
          durationMs: duration,
          detail:     `Query returned in ${duration}ms — possible index problem`,
        };
      }
      return {
        name,
        status:     "HEALTHY",
        durationMs: duration,
        detail:     `Recent query returned ${events.length} events in ${duration}ms`,
      };
    } catch (e: any) {
      return {
        name,
        status:     "UNAVAILABLE",
        durationMs: Date.now() - start,
        detail:     `Recent query failed: ${e?.message ?? e}`,
      };
    }
  }
}

// ── Convenience function ──────────────────────────────────────────────────────

/**
 * checkAuditHealth — convenience wrapper.
 * Creates a monitor with the given repo and runs all checks.
 * Never throws.
 */
export async function checkAuditHealth(repo: AuditRepository): Promise<AuditHealthReport> {
  return new AuditHealthMonitor(repo).checkAuditHealth();
}
