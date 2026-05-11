/**
 * lib/financial/memory-model.ts
 *
 * Financial Stream Memory — Type definitions.
 *
 * Defines the data contracts for operational memory of financial streams.
 * All types are JSON-serializable — safe as RSC → client props.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   Storage backend: MetricSnapshot (Prisma model, existing table)
 *
 *   Metric code convention:
 *     "financial.stream.{streamId}"   — valueJson: FinancialStreamSnapshot
 *
 *   Data flow:
 *     Real data (getCobrosBreakdown) → buildCurrentSnapshot() → FinancialStreamSnapshot
 *     FinancialStreamSnapshot[]      → memory-helpers.ts       → deltas / aging / noise
 *     MetricSnapshot rows            → memory-store.ts          → typed snapshots
 *
 * ── What is real, what is prepared ──────────────────────────────────────────
 *
 *   REAL NOW:   currentSnapshot (live from Prisma/SAG data)
 *   PREPARED:   historical snapshots (infrastructure ready; no rows exist yet)
 *   NOT YET:    trends, velocity, pattern detection (require ≥7 days of history)
 *   NEVER:      fake balances, invented trends, simulated AI
 *
 * ── Relationship to stream-model.ts ──────────────────────────────────────────
 *
 *   stream-model.ts       — Operational state (status, signals, group)
 *   memory-model.ts       — Temporal layer (snapshots, deltas, aging, health)
 *
 *   A FinancialStream is the current operational view.
 *   A FinancialStreamSnapshot is one point in time for that stream.
 *
 * ── SAFE READ-ONLY ────────────────────────────────────────────────────────────
 *
 *   This file is types only. Zero Prisma. Zero SAG. Zero side effects.
 */

import type { StreamOperationalStatus } from "@/lib/financial/stream-model";

// ── Snapshot health state ──────────────────────────────────────────────────────

/**
 * Health state of a financial stream at a point in time.
 *
 * Derived from pendingCount, movement, and aging — not from external assessment.
 */
export type StreamHealthState =
  | "healthy"   // No pending items, stream is current
  | "noisy"     // High or growing pending count
  | "quiet"     // Active but low pending count
  | "degraded"  // Pending has been growing for multiple periods
  | "blocked"   // Stream not receiving data / integration broken
  | "no_data";  // No SAG data available for this stream yet

// ── Stream snapshot ────────────────────────────────────────────────────────────

/**
 * Point-in-time snapshot of one financial stream's operational state.
 *
 * One snapshot per stream per day. Stored in MetricSnapshot (valueJson).
 * Metric code: "financial.stream.{streamId}"
 *
 * All number fields default to 0 when data is unavailable.
 * All nullable fields are null when not yet known.
 */
export interface FinancialStreamSnapshot {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Source stream id — matches BankAccountSource.id. */
  streamId:       string;
  /** SAG PUC account code. */
  sagAccountCode: string;
  /** Organization (tenant) id. */
  orgId:          string;
  /** Snapshot date "YYYY-MM-DD" — one snapshot per stream per day. */
  snapshotDate:   string;
  /** Full ISO timestamp when snapshot was computed. */
  snapshotAt:     string;

  // ── Pending deposit state (from getCobrosBreakdown) ───────────────────────
  /**
   * Number of pending deposit entries in SAG (B1/B2/H1/H2/CP bucket).
   * 0 when this stream has no linked PENDING_DEPOSIT code.
   */
  pendingCount:   number;
  /**
   * Total COP amount in the pending deposit pool.
   * 0 when this stream has no linked PENDING_DEPOSIT code.
   */
  pendingAmount:  number;

  // ── Operational state ─────────────────────────────────────────────────────
  /** Stream operational status at snapshot time. */
  streamStatus:   StreamOperationalStatus;
  /** Derived health assessment at snapshot time. */
  healthState:    StreamHealthState;
  /** Human reason for current health state. Null when state is clear. */
  systemReason:   string | null;

  // ── Optional counters (future enrichment) ────────────────────────────────
  /**
   * Entries resolved/matched in the current period.
   * Null until reconciliation writes this value.
   */
  matchedCount:   number | null;
  /**
   * Entries still unresolved in the current period.
   * Null until reconciliation writes this value.
   */
  unmatchedCount: number | null;
  /**
   * Entries flagged for manual review.
   * Null until review workflow writes this value.
   */
  reviewCount:    number | null;

  // ── Timestamps ────────────────────────────────────────────────────────────
  /**
   * ISO timestamp of last successful SAG sync for this account.
   * Null when unknown.
   */
  lastSeenAt:     string | null;
}

// ── Snapshot comparison ────────────────────────────────────────────────────────

/**
 * Delta between two FinancialStreamSnapshot observations.
 * Computed by compareSnapshots().
 */
export interface SnapshotDelta {
  /** Human label for this comparison period. */
  periodLabel:        string;
  /** Δ in pending entry count (positive = growing, negative = shrinking). */
  pendingCountDelta:  number;
  /** Δ in pending COP amount. */
  pendingAmountDelta: number;
  /** Derived movement direction. */
  movement:           StreamMovement;
  /**
   * Percentage change in pending amount.
   * Null when prior amount was 0 (avoids division by zero).
   */
  deltaPercent:       number | null;
}

/**
 * Directional movement of pending items between two snapshots.
 */
export type StreamMovement =
  | "growing"      // Pending increasing — needs attention
  | "shrinking"    // Pending decreasing — good signal
  | "stable"       // No change
  | "resolved"     // Was pending, now 0 — cleared
  | "appeared"     // Was 0, now has pending — new activity
  | "no_baseline"; // No prior snapshot exists for comparison

// ── Aging status ──────────────────────────────────────────────────────────────

/**
 * How long a stream has been in its current operational status.
 * Derived from snapshot history.
 */
export interface StreamAgingStatus {
  streamId:           string;
  currentStatus:      StreamOperationalStatus;
  /**
   * Days the stream has been in the current status.
   * Null when fewer than 2 snapshots exist.
   */
  daysInCurrentState: number | null;
  /** ISO timestamp of first snapshot with current status. */
  firstSeenAt:        string | null;
  /**
   * True when stream has been in the same non-healthy status for > 30 days.
   * Indicates chronic issue, not a transient one.
   */
  isStale:            boolean;
  /** Human-readable aging label. E.g. "3 días", "sin historial". */
  agingLabel:         string;
}

// ── Noise assessment ──────────────────────────────────────────────────────────

/** Operational noise level of a stream. */
export type NoiseLevel = "low" | "medium" | "high" | "unknown";

/**
 * Assessment of how much operational churn/noise a stream generates.
 * Derived from pending count variance across snapshots.
 */
export interface StreamNoiseAssessment {
  streamId:   string;
  noiseLevel: NoiseLevel;
  /** Human reason for the assessed noise level. */
  reason:     string;
}

// ── Memory summary ────────────────────────────────────────────────────────────

/**
 * Org-level summary of financial stream memory state.
 * Returned by getMemorySummary().
 */
export interface MemorySummary {
  orgId:            string;
  computedAt:       string;
  /** True when at least one snapshot exists in MetricSnapshot. */
  hasHistory:       boolean;
  /** Total snapshot rows found across all streams. */
  snapshotCount:    number;
  /** ISO timestamp of oldest snapshot found. Null when no history. */
  oldestSnapshotAt: string | null;
  /** ISO timestamp of newest snapshot found. Null when no history. */
  newestSnapshotAt: string | null;
  /** Number of days of history available. 0 when no history. */
  historyDays:      number;
  // Stream health breakdown
  healthyStreams:   number;
  noisyStreams:     number;
  blockedStreams:   number;
  noDataStreams:    number;
  // Pending totals across all streams with linked accounts
  totalPendingCount:  number;
  totalPendingAmount: number;
  /**
   * Human-readable readiness label.
   * Examples: "sin historial suficiente", "3 días de historial", "historial completo (30+ días)"
   */
  readinessLabel:   string;
  /** Memory readiness tier for UI rendering. */
  readinessTier:    MemoryReadinessTier;
}

/**
 * Memory readiness tier — how much history is available for analysis.
 *
 *   no_history      — No snapshots stored yet (freshly initialized)
 *   building        — 1–6 days (accumulating; no trend analysis yet)
 *   warming         — 7–13 days (weekly patterns starting to emerge)
 *   ready           — 14+ days (enough for meaningful trend and aging analysis)
 *   degraded        — History exists but newest snapshot is >2 days old (stale)
 *   capture_failed  — Last capture attempt failed; history may be incomplete
 */
export type MemoryReadinessTier =
  | "no_history"
  | "building"
  | "warming"
  | "ready"
  | "degraded"
  | "capture_failed";

// ── Financial Copilot contract ────────────────────────────────────────────────
// These types define the OUTPUT contract for the future Financial Copilot.
// NO LLM is called. NO suggestions are generated yet.
// This contract is the API surface that the Copilot will populate.

/**
 * What kind of observation the Copilot is reporting.
 *
 * Observation types are grouped by behavioral category:
 *   PATTERN   — temporal pattern detected across ≥3 snapshots
 *   STATE     — current operational state of the stream
 *   POSITIVE  — favorable signal from history
 *   HONEST    — transparent about data limitations
 */
export type CopilotObservationType =
  // ── Pattern observations (require ≥3 snapshots) ────────────────────────────
  | "consecutive_increase"  // Pending growing N consecutive days (N ≥ 2)
  | "consecutive_decrease"  // Pending shrinking N consecutive days (N ≥ 2)
  | "recovery_pattern"      // Was growing ≥3 days, now decreasing ≥2 days
  | "repeated_blocked"      // Stream appeared blocked in ≥3 of last 10 snapshots
  | "noise_detected"        // High pendingCount variance (CV > 0.40, ≥7 snapshots)
  | "chronic_pending"       // Same reconciliation_pending status for > 30 days
  // ── Positive observations ─────────────────────────────────────────────────
  | "pending_resolved"      // Pending cleared to 0 — good signal
  | "no_activity"           // pendingCount = 0 for ≥7 consecutive days
  // ── State observations (current state, no trend required) ─────────────────
  | "stream_blocked"        // Stream currently blocked
  | "integration_missing"   // No SAG link / bank feed configured
  | "settlement_lag"        // Platform settlement taking too long
  | "stale_stream"          // No snapshot captured for >3 days on an active stream
  // ── Legacy / compatibility ────────────────────────────────────────────────
  | "pending_growing"       // Generic pending increase (1-day; use consecutive_increase instead)
  | "pattern_repeat"        // Same state repeating across periods
  // ── Honest transparency ────────────────────────────────────────────────────
  | "first_observation"     // Baseline — no trend possible yet
  | "memory_building";      // Not enough history for pattern analysis

/**
 * A single Copilot observation for one financial stream.
 *
 * Currently RULE-BASED only — generated by buildRuleBasedObservations().
 * Future: enriched by LLM with pattern recognition and natural language.
 *
 * All fields are JSON-serializable.
 */
export interface CopilotObservation {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Stable stream id. */
  streamId:          string;
  /** Org id. */
  orgId:             string;
  /** ISO timestamp when this observation was generated. */
  generatedAt:       string;

  // ── Classification ────────────────────────────────────────────────────────
  observationType:   CopilotObservationType;
  /**
   * Observation severity — 5-tier operational scale.
   *
   *   ok        — Positive signal. Something improved or is nominal.
   *   info      — Neutral observation. No action required.
   *   watch     — Low attention. Monitor but not urgent.
   *   elevated  — Significant. Action recommended.
   *   critical  — Urgent. Immediate operational attention required.
   *   warning   — Alias for watch (kept for backward compatibility).
   */
  severity:          "ok" | "info" | "watch" | "elevated" | "critical" | "warning";

  // ── Content ───────────────────────────────────────────────────────────────
  /**
   * Human-readable observation message.
   * Rule-based: constructed from templates.
   * Future: LLM-generated with context.
   */
  message:           string;
  /** Suggested action for the user. Null when no clear action exists. */
  suggestedAction:   string | null;
  /** Href to the workspace that can act on this observation. */
  relatedWorkspace:  string | null;

  // ── Trust / provenance ────────────────────────────────────────────────────
  /**
   * How was this observation generated.
   *   RULE_BASED   — Deterministic rule from real data (current implementation)
   *   LOW/MED/HIGH — ML confidence tiers (future, after pattern detection)
   */
  confidence:        "HIGH" | "MEDIUM" | "LOW" | "RULE_BASED";
  /**
   * How many historical snapshots informed this observation.
   * 0 = current state only; >0 = trend-based.
   */
  basedOnSnapshots:  number;
}
