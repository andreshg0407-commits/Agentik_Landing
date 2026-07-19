/**
 * signal-context.ts
 *
 * BUSINESS-SIGNALS-01
 * Context attached to business signals.
 *
 * Context answers:
 *   - What happened?
 *   - Where did it happen?
 *   - On which entity?
 *   - What related entities exist?
 *   - What additional information does the system need?
 *
 * Context does NOT interpret, recommend, or suggest actions.
 * That belongs to Reasoning.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { SignalEntityRef } from "./signal-types";

// -- Signal Context ---------------------------------------------------------

/**
 * Contextual information enriching a signal.
 *
 * This is the "operational situation report" for a signal.
 * It provides enough information for downstream consumers
 * (Reasoning, David, Copilot) to understand the condition
 * without querying modules directly.
 */
export interface SignalContext {
  /** What happened — a concise operational description. */
  what: string;
  /** Where it happened — location, warehouse, channel, etc. */
  where: string | null;
  /** The primary entity this condition applies to. */
  primaryEntity: SignalEntityRef;
  /** Related entities that provide additional context. */
  relatedEntities: SignalEntityRef[];
  /** Knowledge Graph edge IDs that connect entities. */
  knowledgeEdgeIds: string[];
  /** Current metric values relevant to this condition. */
  metrics: SignalContextMetric[];
  /** Information the system is missing to fully evaluate this condition. */
  missingInformation: string[];
  /** Arbitrary structured data for domain-specific context. */
  data: Record<string, unknown>;
}

/** A metric value included in signal context. */
export interface SignalContextMetric {
  /** Metric key (e.g. "stock_level", "days_overdue"). */
  key: string;
  /** Current value. */
  value: number;
  /** Unit of measurement. */
  unit: string;
  /** Expected or threshold value (null if not applicable). */
  threshold: number | null;
}

// -- Builder ----------------------------------------------------------------

/** Build signal context. */
export function buildSignalContext(opts: {
  what: string;
  primaryEntity: SignalEntityRef;
  where?: string | null;
  relatedEntities?: SignalEntityRef[];
  knowledgeEdgeIds?: string[];
  metrics?: SignalContextMetric[];
  missingInformation?: string[];
  data?: Record<string, unknown>;
}): SignalContext {
  return {
    what: opts.what,
    where: opts.where ?? null,
    primaryEntity: opts.primaryEntity,
    relatedEntities: opts.relatedEntities ?? [],
    knowledgeEdgeIds: opts.knowledgeEdgeIds ?? [],
    metrics: opts.metrics ?? [],
    missingInformation: opts.missingInformation ?? [],
    data: opts.data ?? {},
  };
}
