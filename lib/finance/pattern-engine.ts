/**
 * lib/finance/pattern-engine.ts
 *
 * FASE 3 — Pattern Engine
 *
 * Detects recurring patterns in financial runtime events.
 * Minimum 2 occurrences within the window = pattern.
 * All deterministic. No ML. No AI. Sources must be real.
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import type { TemporalWindow } from "./temporal-snapshots";

// ── Event shape (minimal — only what pattern engine needs) ────────────────────

export interface PatternEvent {
  id:        string;
  type:      string;
  severity:  string;
  source?:   string;
  createdAt: Date;
}

// ── Result types ───────────────────────────────────────────────────────────────

export type PatternType =
  | "recurring_low_confidence"
  | "recurring_bank_unmatched"
  | "recurring_reconciliation_break"
  | "recurring_stale_source"
  | "recurring_close_blocker"
  | "recurring_graph_degradation"
  | "recovery_after_degradation";

export type PatternSeverity = "critical" | "warning" | "info";

export interface FinancialTemporalPattern {
  id:              string;
  type:            PatternType | string;
  severity:        PatternSeverity;
  frequency:       number;
  firstSeenAt:     Date;
  lastSeenAt:      Date;
  affectedSources: string[];
  affectedAreas:   string[];
  confidence:      number;
  summary:         string;
}

// ── Event type → pattern type mapping ─────────────────────────────────────────

const EVENT_TO_PATTERN: Record<string, PatternType> = {
  LOW_CONFIDENCE:  "recurring_low_confidence",
  BANK_UNMATCHED:  "recurring_bank_unmatched",
  RECON_BREAK:     "recurring_reconciliation_break",
  STALE_SOURCE:    "recurring_stale_source",
  CLOSE_BLOCKER:   "recurring_close_blocker",
  GRAPH_DEGRADED:  "recurring_graph_degradation",
};

/** Event types that indicate recovery (to detect "recovery_after_degradation") */
const RECOVERY_TYPES = new Set(["SYNC_RESTORED", "GRAPH_RECOVERED"]);

/** Event type → operational area */
const EVENT_TO_AREA: Record<string, string> = {
  LOW_CONFIDENCE:  "tesoreria",
  BANK_UNMATCHED:  "conciliacion",
  RECON_BREAK:     "conciliacion",
  STALE_SOURCE:    "integridad",
  CLOSE_BLOCKER:   "cierre",
  GRAPH_DEGRADED:  "integridad",
  LIQUIDITY_RISK:  "tesoreria",
  DIAN_STALE:      "cierre",
};

// ── Severity from event severity string ───────────────────────────────────────

function toPatternSeverity(severities: string[]): PatternSeverity {
  if (severities.includes("critical")) return "critical";
  if (severities.includes("warning"))  return "warning";
  return "info";
}

// ── Pattern summary builder ────────────────────────────────────────────────────

function buildPatternSummary(
  type:      PatternType | string,
  frequency: number,
  window:    TemporalWindow,
): string {
  const freqStr = `${frequency}x en ${window}`;
  switch (type) {
    case "recurring_low_confidence":
      return `Confianza baja recurrente · ${freqStr}`;
    case "recurring_bank_unmatched":
      return `Movimientos bancarios sin match recurrentes · ${freqStr}`;
    case "recurring_reconciliation_break":
      return `Quiebres de conciliación recurrentes · ${freqStr}`;
    case "recurring_stale_source":
      return `Fuentes desactualizadas recurrentes · ${freqStr}`;
    case "recurring_close_blocker":
      return `Bloqueos de cierre recurrentes · ${freqStr}`;
    case "recurring_graph_degradation":
      return `Degradación de grafo recurrente · ${freqStr}`;
    case "recovery_after_degradation":
      return `Recuperación tras degradación detectada · ${freqStr}`;
    default:
      return `Patrón recurrente (${type}) · ${freqStr}`;
  }
}

// ── Main function ──────────────────────────────────────────────────────────────

export function detectFinancialPatterns(
  events: PatternEvent[],
  window: TemporalWindow,
): FinancialTemporalPattern[] {
  if (events.length === 0) return [];

  const patterns: FinancialTemporalPattern[] = [];

  // 1. Group recurring events by type
  const byType = new Map<string, PatternEvent[]>();
  for (const e of events) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }

  for (const [eventType, group] of byType) {
    const patternType = EVENT_TO_PATTERN[eventType];
    if (!patternType) continue; // skip types with no pattern mapping
    if (group.length < 2) continue; // minimum 2 occurrences

    const sorted    = group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const sources   = [...new Set(group.map(e => e.source).filter(Boolean))] as string[];
    const area      = EVENT_TO_AREA[eventType];
    const areas     = area ? [area] : [];
    const severities = group.map(e => e.severity);

    // Confidence: more occurrences = higher confidence
    const confidence = Math.min(1, 0.5 + (group.length / 10) * 0.5);

    patterns.push({
      id:              `pat:${eventType.toLowerCase()}:${window}`,
      type:            patternType,
      severity:        toPatternSeverity(severities),
      frequency:       group.length,
      firstSeenAt:     sorted[0].createdAt,
      lastSeenAt:      sorted[sorted.length - 1].createdAt,
      affectedSources: sources,
      affectedAreas:   areas,
      confidence,
      summary:         buildPatternSummary(patternType, group.length, window),
    });
  }

  // 2. Detect "recovery_after_degradation":
  //    occurs when we find a degradation event followed later by a recovery event
  const degradationEvents = events.filter(e =>
    e.type === "GRAPH_DEGRADED" || e.type === "RECON_BREAK" || e.type === "LOW_CONFIDENCE"
  );
  const recoveryEvents = events.filter(e => RECOVERY_TYPES.has(e.type));

  if (degradationEvents.length >= 1 && recoveryEvents.length >= 1) {
    const sorted = [...degradationEvents, ...recoveryEvents].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    // Check there's at least one degradation before a recovery
    const hasCycle = sorted.some((e, i) => {
      if (!RECOVERY_TYPES.has(e.type)) return false;
      return sorted.slice(0, i).some(prev => !RECOVERY_TYPES.has(prev.type));
    });

    if (hasCycle) {
      const frequency = Math.min(degradationEvents.length, recoveryEvents.length);
      patterns.push({
        id:              `pat:recovery_after_degradation:${window}`,
        type:            "recovery_after_degradation",
        severity:        "info",
        frequency,
        firstSeenAt:     sorted[0].createdAt,
        lastSeenAt:      sorted[sorted.length - 1].createdAt,
        affectedSources: [],
        affectedAreas:   ["integridad"],
        confidence:      Math.min(1, 0.5 + frequency * 0.1),
        summary:         buildPatternSummary("recovery_after_degradation", frequency, window),
      });
    }
  }

  // Sort by frequency descending
  return patterns.sort((a, b) => b.frequency - a.frequency);
}
