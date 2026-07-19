/**
 * business-entity-utils.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Shared utilities for Business Entities.
 *
 * No Prisma. No React. Pure domain helpers.
 */

import type { BusinessEntity, DataFreshness, DataFreshnessLevel } from "./business-entity-types";
import type { BusinessEntityAlert } from "./business-entity-alerts";
import type { BusinessEntitySeverity } from "./business-entity-state";

// ── Data Freshness ───────────────────────────────────────────────────────────

/** Evaluate data freshness based on last update and expected interval. */
export function evaluateFreshness(
  lastUpdatedAt: string | null,
  expectedRefreshIntervalSeconds: number | null,
  source: string,
): DataFreshness {
  if (!lastUpdatedAt) {
    return { level: "unknown", lastUpdatedAt: null, expectedRefreshIntervalSeconds, source };
  }

  const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
  const ageSec = ageMs / 1000;

  let level: DataFreshnessLevel;
  if (!expectedRefreshIntervalSeconds) {
    // No expected interval — use sensible defaults
    if (ageSec < 3600) level = "fresh";        // < 1 hour
    else if (ageSec < 86400) level = "stale";  // < 24 hours
    else level = "expired";
  } else {
    if (ageSec < expectedRefreshIntervalSeconds) level = "fresh";
    else if (ageSec < expectedRefreshIntervalSeconds * 2) level = "stale";
    else level = "expired";
  }

  return { level, lastUpdatedAt, expectedRefreshIntervalSeconds, source };
}

// ── Alert Counting ───────────────────────────────────────────────────────────

/** Count alerts by severity. */
export function countAlertsBySeverity(
  alerts: BusinessEntityAlert[],
): Record<BusinessEntitySeverity, number> {
  const counts: Record<BusinessEntitySeverity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  };
  for (const a of alerts) {
    counts[a.severity]++;
  }
  return counts;
}

/** Count unacknowledged alerts. */
export function countPendingAlerts(alerts: BusinessEntityAlert[]): number {
  return alerts.filter(a => !a.acknowledged).length;
}

// ── Entity Comparisons ───────────────────────────────────────────────────────

/** Check if two entities are the same (by entityId + entityType). */
export function isSameEntity(a: BusinessEntity, b: BusinessEntity): boolean {
  return a.entityId === b.entityId && a.entityType === b.entityType;
}

/** Sort entities by health severity (worst first). */
export function sortByHealthSeverity(entities: BusinessEntity[]): BusinessEntity[] {
  const order: Record<string, number> = {
    critical: 0, degraded: 1, healthy: 2, unknown: 3, unavailable: 4,
  };
  return [...entities].sort((a, b) =>
    (order[a.health.overall.level] ?? 5) - (order[b.health.overall.level] ?? 5),
  );
}
