/**
 * lib/security/audit-persistence/audit-report-builder.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Report Builder
 *
 * Builds serializable audit reports from persisted events.
 * No AI. No inference. Pure aggregation.
 *
 * Output includes:
 *   - Summary (total, by severity, by category)
 *   - Critical events
 *   - Recent activity
 *   - Timeline
 *   - Category breakdown
 *   - Trends (daily delta)
 *
 * All output is fully serializable. No Date objects.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import type { AuditRepository } from "./audit-repository";
import type { PersistentSecurityAuditEvent, PersistentAuditSeverity, PersistentAuditCategory } from "./audit-event-types";
import { AuditQueryEngine, type AuditTimelineEntry } from "./audit-query-engine";
import { AUDIT_CATEGORY_REGISTRY } from "./audit-category-registry";

// ── Report types ──────────────────────────────────────────────────────────────

export interface AuditReportSummary {
  orgSlug:       string;
  totalEvents:   number;
  criticalCount: number;
  highCount:     number;
  mediumCount:   number;
  lowCount:      number;
  byCategory:    Record<string, number>;
  periodDays:    number;
  generatedAt:   string;
}

export interface AuditCategoryBreakdown {
  category:    PersistentAuditCategory;
  name:        string;
  count:       number;
  criticalPct: number;
  highPct:     number;
}

export interface AuditTrend {
  /** "up" | "down" | "stable" */
  direction: "up" | "down" | "stable";
  /** Percent change (positive = increase). */
  changePct:  number;
  /** Event count in most recent half of the period. */
  recentHalf: number;
  /** Event count in older half of the period. */
  olderHalf:  number;
}

export interface AuditReport {
  summary:    AuditReportSummary;
  critical:   PersistentSecurityAuditEvent[];
  recent:     PersistentSecurityAuditEvent[];
  timeline:   AuditTimelineEntry[];
  categories: AuditCategoryBreakdown[];
  trend:      AuditTrend;
  generatedAt: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildAuditReport(
  orgSlug:    string,
  repo:       AuditRepository,
  periodDays  = 30,
): Promise<AuditReport> {
  const engine = new AuditQueryEngine(repo);

  const [
    allEvents,
    criticalEvents,
    recentEvents,
    timeline,
  ] = await Promise.all([
    engine.getTenantEvents(orgSlug, 500),
    engine.getCriticalEvents(orgSlug, 50),
    engine.getRecentEvents(orgSlug, 20),
    engine.getEventTimeline(orgSlug, periodDays),
  ]);

  // Summary counts
  const criticalCount = allEvents.filter(e => e.severity === "CRITICAL").length;
  const highCount     = allEvents.filter(e => e.severity === "HIGH").length;
  const mediumCount   = allEvents.filter(e => e.severity === "MEDIUM").length;
  const lowCount      = allEvents.filter(e => e.severity === "LOW").length;

  // Category counts
  const byCategory: Record<string, number> = {};
  for (const e of allEvents) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }

  const summary: AuditReportSummary = {
    orgSlug,
    totalEvents:   allEvents.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    byCategory,
    periodDays,
    generatedAt:   new Date().toISOString(),
  };

  // Category breakdown
  const categories: AuditCategoryBreakdown[] = AUDIT_CATEGORY_REGISTRY
    .map(cat => {
      const catEvents = allEvents.filter(e => e.category === cat.id);
      const count = catEvents.length;
      const criticals = catEvents.filter(e => e.severity === "CRITICAL").length;
      const highs     = catEvents.filter(e => e.severity === "HIGH").length;
      return {
        category:    cat.id,
        name:        cat.name,
        count,
        criticalPct: count > 0 ? Math.round((criticals / count) * 100) : 0,
        highPct:     count > 0 ? Math.round((highs / count) * 100) : 0,
      };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Trend analysis
  const trend = computeTrend(timeline);

  return {
    summary,
    critical:  criticalEvents,
    recent:    recentEvents,
    timeline,
    categories,
    trend,
    generatedAt: new Date().toISOString(),
  };
}

// ── Trend computation ─────────────────────────────────────────────────────────

function computeTrend(timeline: AuditTimelineEntry[]): AuditTrend {
  if (timeline.length < 2) {
    return { direction: "stable", changePct: 0, recentHalf: 0, olderHalf: 0 };
  }

  // timeline is sorted newest-first
  const half = Math.floor(timeline.length / 2);
  const recentHalf = timeline.slice(0, half).reduce((s, e) => s + e.total, 0);
  const olderHalf  = timeline.slice(half).reduce((s, e)  => s + e.total, 0);

  if (olderHalf === 0) {
    return { direction: recentHalf > 0 ? "up" : "stable", changePct: 100, recentHalf, olderHalf };
  }

  const changePct = Math.round(((recentHalf - olderHalf) / olderHalf) * 100);
  const direction: AuditTrend["direction"] =
    changePct > 5  ? "up"   :
    changePct < -5 ? "down" : "stable";

  return { direction, changePct, recentHalf, olderHalf };
}

// ── Format ────────────────────────────────────────────────────────────────────

export function formatAuditReport(report: AuditReport): string {
  const { summary, trend, categories } = report;
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("  AGENTIK SECURITY AUDIT REPORT");
  lines.push(`  Org: ${summary.orgSlug} | Period: ${summary.periodDays} days`);
  lines.push(`  Generated: ${report.generatedAt}`);
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");

  lines.push("── SUMMARY ─────────────────────────────────────────────────");
  lines.push(`  Total events : ${summary.totalEvents}`);
  lines.push(`  CRITICAL     : ${summary.criticalCount}`);
  lines.push(`  HIGH         : ${summary.highCount}`);
  lines.push(`  MEDIUM       : ${summary.mediumCount}`);
  lines.push(`  LOW          : ${summary.lowCount}`);
  lines.push(`  Trend        : ${trend.direction.toUpperCase()} (${trend.changePct > 0 ? "+" : ""}${trend.changePct}%)`);
  lines.push("");

  if (categories.length > 0) {
    lines.push("── CATEGORIES ──────────────────────────────────────────────");
    for (const cat of categories) {
      lines.push(
        `  ${cat.name.padEnd(24)} ${String(cat.count).padStart(5)} events` +
        (cat.criticalPct > 0 ? `  [${cat.criticalPct}% CRITICAL]` : ""),
      );
    }
    lines.push("");
  }

  if (report.critical.length > 0) {
    lines.push("── CRITICAL / HIGH EVENTS (recent) ─────────────────────────");
    for (const e of report.critical.slice(0, 10)) {
      lines.push(`  [${e.severity}] ${e.eventType} — ${e.createdAt.slice(0, 19)}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════");
  return lines.join("\n");
}
