/**
 * event-payload.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Generic extensible payload for business events.
 *
 * Captures WHAT changed — before/after state, delta,
 * metrics, amounts, quantities, dates, and references.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Event Payload ----------------------------------------------------------

/**
 * Generic event payload capturing state transitions.
 *
 * Not every field is required. Events fill what's relevant:
 * - State changes → before + after + delta
 * - Metric events → metrics
 * - Financial events → amounts
 * - Inventory events → quantities
 * - Document events → documents
 */
export interface EventPayload {
  /** One-line human-readable summary of what happened. */
  summary: string;
  /** State before the transition (null if creation event). */
  before: Record<string, unknown> | null;
  /** State after the transition (null if deletion event). */
  after: Record<string, unknown> | null;
  /** Computed delta between before and after. */
  delta: Record<string, unknown> | null;
  /** Metric values relevant to this event. */
  metrics: EventPayloadMetric[];
  /** Document references. */
  documents: EventPayloadDocument[];
  /** Entity or external references. */
  references: EventPayloadReference[];
  /** Monetary amounts involved. */
  amounts: EventPayloadAmount[];
  /** Quantities involved. */
  quantities: EventPayloadQuantity[];
  /** Relevant dates. */
  dates: EventPayloadDate[];
  /** Arbitrary domain-specific metadata. */
  metadata: Record<string, unknown>;
}

/** A metric value in the payload. */
export interface EventPayloadMetric {
  key: string;
  value: number;
  unit: string;
  previousValue: number | null;
}

/** A document reference in the payload. */
export interface EventPayloadDocument {
  documentId: string;
  documentType: string;
  label: string;
}

/** A reference to an entity or external resource. */
export interface EventPayloadReference {
  referenceId: string;
  referenceType: string;
  label: string;
}

/** A monetary amount in the payload. */
export interface EventPayloadAmount {
  key: string;
  value: number;
  currency: string;
}

/** A quantity in the payload. */
export interface EventPayloadQuantity {
  key: string;
  value: number;
  unit: string;
}

/** A date in the payload. */
export interface EventPayloadDate {
  key: string;
  /** ISO date string. */
  value: string;
  label: string;
}

// -- Builder ----------------------------------------------------------------

/** Build an event payload with defaults. */
export function buildEventPayload(opts: {
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  delta?: Record<string, unknown> | null;
  metrics?: EventPayloadMetric[];
  documents?: EventPayloadDocument[];
  references?: EventPayloadReference[];
  amounts?: EventPayloadAmount[];
  quantities?: EventPayloadQuantity[];
  dates?: EventPayloadDate[];
  metadata?: Record<string, unknown>;
}): EventPayload {
  return {
    summary: opts.summary,
    before: opts.before ?? null,
    after: opts.after ?? null,
    delta: opts.delta ?? null,
    metrics: opts.metrics ?? [],
    documents: opts.documents ?? [],
    references: opts.references ?? [],
    amounts: opts.amounts ?? [],
    quantities: opts.quantities ?? [],
    dates: opts.dates ?? [],
    metadata: opts.metadata ?? {},
  };
}

/** Build a state-change payload from before/after snapshots. */
export function buildStateChangePayload(
  summary: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): EventPayload {
  const delta: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) {
      delta[key] = { from: before[key], to: after[key] };
    }
  }

  return buildEventPayload({ summary, before, after, delta });
}

/** Build an empty payload (for events that carry no state change). */
export function emptyEventPayload(summary: string): EventPayload {
  return buildEventPayload({ summary });
}
