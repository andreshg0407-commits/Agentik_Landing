/**
 * signal.ts
 *
 * BUSINESS-SIGNALS-01
 * The Business Signal — the operational language of Agentik.
 *
 * A Business Signal declares that a significant operational condition exists.
 * It does NOT interpret, execute, alert, or recommend.
 *
 * Lifecycle: new → active → acknowledged → resolved | expired | ignored
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { SignalEntityRef } from "./signal-types";
import type { SignalCategory } from "./signal-category";
import type { SignalSeverity } from "./signal-severity";
import type { SignalPriority } from "./signal-priority";
import type { SignalSource } from "./signal-source";
import type { SignalEvidence } from "./signal-evidence";
import type { SignalContext } from "./signal-context";

// -- Signal Status ----------------------------------------------------------

/**
 * Lifecycle status of a signal.
 *
 * - new: Just created, not yet processed.
 * - active: Condition is currently present and relevant.
 * - acknowledged: A human or agent has seen the signal.
 * - resolved: The condition no longer exists.
 * - expired: The signal's validity window has passed.
 * - ignored: Explicitly dismissed by a human or rule.
 * - unknown: Status cannot be determined.
 */
export type SignalStatus =
  | "new"
  | "active"
  | "acknowledged"
  | "resolved"
  | "expired"
  | "ignored"
  | "unknown";

/** All valid statuses as an array. */
export const SIGNAL_STATUSES: readonly SignalStatus[] = [
  "new",
  "active",
  "acknowledged",
  "resolved",
  "expired",
  "ignored",
  "unknown",
] as const;

/** Terminal statuses — signal processing is complete. */
export const TERMINAL_STATUSES: readonly SignalStatus[] = [
  "resolved",
  "expired",
  "ignored",
] as const;

/** Check if a signal is in a terminal state. */
export function isTerminalStatus(status: SignalStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// -- Signal Type (condition type) -------------------------------------------

/**
 * The type of business condition the signal represents.
 *
 * These are domain-agnostic condition patterns.
 * They describe WHAT kind of condition, not WHERE it happened.
 */
export type SignalType =
  | "threshold_breach"
  | "absence_detected"
  | "anomaly_detected"
  | "state_change"
  | "deadline_approaching"
  | "deadline_exceeded"
  | "target_reached"
  | "target_missed"
  | "relationship_change"
  | "pattern_detected"
  | "new_entity"
  | "entity_removed"
  | "sync_event"
  | "manual_flag"
  | "compound";

// -- Business Signal --------------------------------------------------------

/**
 * The Business Signal.
 *
 * This is the core contract of the Operational Signal Engine.
 * Every relevant business condition is represented as a BusinessSignal.
 *
 * Signals are:
 *   - Domain-agnostic (category tells the domain)
 *   - Evidence-backed (evidence explains origin)
 *   - Context-rich (context describes the situation)
 *   - Lifecycle-tracked (status tracks processing)
 *   - Deduplicable (deduplicationKey enables merging)
 *   - Composable (parentSignalId enables signal trees)
 */
export interface BusinessSignal {
  /** Unique signal ID. */
  signalId: string;
  /** Organization this signal belongs to. */
  organizationId: string;
  /** Primary entity this signal relates to. */
  entityId: string;
  /** Type of the primary entity. */
  entityType: string;
  /** Business domain category. */
  category: SignalCategory;
  /** Type of condition detected. */
  type: SignalType;
  /** Human-readable title (one line). */
  title: string;
  /** Human-readable description (operational detail). */
  description: string;
  /** Severity of the condition. */
  severity: SignalSeverity;
  /** Processing priority (independent of severity). */
  priority: SignalPriority;
  /** Lifecycle status. */
  status: SignalStatus;
  /** Where this signal originated. */
  source: SignalSource;
  /** Confidence in this signal (0-100). */
  confidence: number;
  /** Evidence supporting this signal. */
  evidence: SignalEvidence;
  /** Operational context. */
  context: SignalContext;
  /** Deduplication key — signals with the same key are equivalent. */
  deduplicationKey: string;
  /** Parent signal ID (null if this is a root signal). */
  parentSignalId: string | null;
  /** Child signal IDs (for compound signals). */
  childSignalIds: string[];
  /** ISO timestamp when the signal was created. */
  createdAt: string;
  /** ISO timestamp when the signal was last updated. */
  updatedAt: string;
  /** ISO timestamp when the signal expires (null = never). */
  expiresAt: string | null;
  /** Arbitrary domain-specific metadata. */
  metadata: Record<string, unknown>;
}

// -- Merged Signal ----------------------------------------------------------

/**
 * A merged signal created from multiple equivalent signals.
 *
 * When deduplication detects equivalent signals from different sources,
 * they are merged into a single MergedSignal with combined evidence
 * and the highest severity/priority among the originals.
 */
export interface MergedSignal extends BusinessSignal {
  /** IDs of the original signals that were merged. */
  mergedFromIds: string[];
  /** Count of merged signals. */
  mergedCount: number;
}
