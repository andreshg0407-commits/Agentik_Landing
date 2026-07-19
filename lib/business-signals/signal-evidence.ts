/**
 * signal-evidence.ts
 *
 * BUSINESS-SIGNALS-01
 * Evidence attached to business signals.
 *
 * Every signal MUST carry evidence explaining its origin.
 * No signal without evidence is valid in Agentik.
 *
 * Signal evidence is lighter than Reasoning evidence.
 * It captures WHAT triggered the signal, not WHY it matters.
 * The "why" belongs to Reasoning (Insights, Risks, Recommendations).
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { SignalEntityRef } from "./signal-types";

// -- Signal Evidence Item ---------------------------------------------------

/** A single piece of evidence supporting a signal. */
export interface SignalEvidenceItem {
  /** What kind of evidence this is. */
  type: SignalEvidenceType;
  /** Human-readable description. */
  description: string;
  /** Reference ID (observation ID, entity ID, relation ID, etc.). */
  referenceId: string;
  /** Confidence in this piece of evidence (0-100). */
  confidence: number;
}

/** Types of evidence that can support a signal. */
export type SignalEvidenceType =
  | "observation"
  | "entity_state"
  | "entity_metric"
  | "entity_relation"
  | "knowledge_edge"
  | "workflow_state"
  | "document"
  | "external_data";

// -- Signal Evidence Bundle -------------------------------------------------

/**
 * Complete evidence bundle for a signal.
 *
 * Captures all supporting data that triggered the signal.
 * Lighter than Reasoning Evidence — no rule IDs, no event IDs.
 */
export interface SignalEvidence {
  /** Observation IDs that contributed to this signal. */
  observationIds: string[];
  /** Business entities involved. */
  entities: SignalEntityRef[];
  /** Knowledge Graph relation IDs used. */
  relationIds: string[];
  /** Metric keys that contributed. */
  metricKeys: string[];
  /** Individual evidence items. */
  items: SignalEvidenceItem[];
  /** Overall evidence strength (0-100). */
  strength: number;
}

// -- Builders ---------------------------------------------------------------

/** Build a single evidence item. */
export function buildSignalEvidenceItem(opts: {
  type: SignalEvidenceType;
  description: string;
  referenceId: string;
  confidence?: number;
}): SignalEvidenceItem {
  return {
    type: opts.type,
    description: opts.description,
    referenceId: opts.referenceId,
    confidence: opts.confidence ?? 100,
  };
}

/** Build a complete signal evidence bundle. */
export function buildSignalEvidence(opts: {
  items: SignalEvidenceItem[];
  observationIds?: string[];
  entities?: SignalEntityRef[];
  relationIds?: string[];
  metricKeys?: string[];
}): SignalEvidence {
  const items = opts.items;
  const strength = items.length > 0
    ? Math.round(items.reduce((sum, i) => sum + i.confidence, 0) / items.length)
    : 0;

  return {
    observationIds: opts.observationIds ?? [],
    entities: opts.entities ?? [],
    relationIds: opts.relationIds ?? [],
    metricKeys: opts.metricKeys ?? [],
    items,
    strength,
  };
}

/** Create an empty evidence bundle. Signals with empty evidence are considered weak. */
export function emptySignalEvidence(): SignalEvidence {
  return buildSignalEvidence({ items: [] });
}
