/**
 * observation.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * An Observation is a raw fact with zero interpretation.
 *
 * Examples:
 *   "Inventario de REF-001 = 0"
 *   "Pedido P-1234 estado = bloqueado"
 *   "Cliente ABC sin compra hace 60 dias"
 *
 * Observations are the atomic inputs to the reasoning chain.
 * They never contain conclusions, risks, or recommendations.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningCategory, ReasoningSource } from "./reasoning-types";
import { nextReasoningId } from "./reasoning-types";

// -- Observation -----------------------------------------------------------

export interface Observation {
  /** Unique observation ID. */
  id: string;
  /** The entity this observation relates to. */
  entity: EntityRef;
  /** The metric or field observed (e.g. "stock_level", "order_status"). */
  metric: string;
  /** The observed value. */
  value: string | number | boolean;
  /** Expected/normal value (null if not applicable). */
  expectedValue: string | number | boolean | null;
  /** Whether this observation deviates from expected. */
  isAnomaly: boolean;
  /** Business domain category. */
  category: ReasoningCategory;
  /** Where this observation came from. */
  source: ReasoningSource;
  /** Confidence in the observation (0-100). */
  confidence: number;
  /** ISO timestamp when the observation was made. */
  observedAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildObservation(opts: {
  entity: EntityRef;
  metric: string;
  value: string | number | boolean;
  expectedValue?: string | number | boolean | null;
  isAnomaly?: boolean;
  category: ReasoningCategory;
  source?: ReasoningSource;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): Observation {
  return {
    id: nextReasoningId("obs"),
    entity: opts.entity,
    metric: opts.metric,
    value: opts.value,
    expectedValue: opts.expectedValue ?? null,
    isAnomaly: opts.isAnomaly ?? false,
    category: opts.category,
    source: opts.source ?? "business_entity",
    confidence: opts.confidence ?? 100,
    observedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
