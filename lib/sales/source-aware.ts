/**
 * source-aware.ts
 *
 * SAG Source-Aware Layer — SourceAwareSaleRecord
 *
 * Wraps any SaleRecord-shaped object with the full computed semantic model:
 *   - All SaleSourceSemantics flags (isFiscalTruth, shouldCountForRevenue, …)
 *   - Three new data-model-specific flags:
 *       isOperationalTruth      — delivery/dispatch is confirmed regardless of source
 *       canGenerateReceivable   — can this record create a legal AR (Cartera) entry?
 *       canGenerateXmlExpectation — can this record generate a DIAN XML expectation?
 *   - sourcePriority (1 or 2) for merge/conflict resolution
 *
 * None of these are stored in the DB — all are computed at runtime from
 * sagSourceType via getSourceSemantics(fromSagSourceType(sagSourceType)).
 *
 * Design:
 *   This module is intentionally thin: it is a TYPE layer + helper functions.
 *   All business logic lives in source-rules.ts; queries live in reports.ts.
 */

import {
  type SaleSourceType,
  type SaleSourceSemantics,
  getSourceSemantics,
  fromSagSourceType,
} from "@/lib/sag/source-semantics";
import type { SagSourceType } from "@/lib/sag/source-inference";

// ── Extended semantics (data-model specific) ──────────────────────────────────

/**
 * Full source semantics for a SaleRecord, extending SaleSourceSemantics
 * with three data-model–specific flags.
 */
export interface SaleRecordSourceSemantics extends SaleSourceSemantics {
  /**
   * True for BOTH FUENTE_1 and FUENTE_2.
   * A remisión proves that delivery/dispatch occurred — it is an operational
   * truth even if it is not yet the fiscal truth.
   */
  isOperationalTruth: boolean;
  /**
   * True only for FUENTE_1.
   * Only an official invoice can create an accounts-receivable entry (Cartera).
   * A remisión cannot — it is a delivery note, not a billing instrument.
   */
  canGenerateReceivable: boolean;
  /**
   * True only for FUENTE_1.
   * Only an official invoice generates a DIAN XML expectation for
   * reconciliation and tax reporting.
   */
  canGenerateXmlExpectation: boolean;
}

// ── Semantic registry ─────────────────────────────────────────────────────────

const RECORD_SEMANTICS: Record<SaleSourceType, SaleRecordSourceSemantics> = {
  FUENTE_1: {
    ...getSourceSemantics("FUENTE_1"),
    isOperationalTruth:       true,
    canGenerateReceivable:     true,
    canGenerateXmlExpectation: true,
  },
  FUENTE_2: {
    ...getSourceSemantics("FUENTE_2"),
    isOperationalTruth:       true,   // dispatch proves delivery
    canGenerateReceivable:     false,
    canGenerateXmlExpectation: false,
  },
};

/**
 * Get the full extended semantics for a SaleSourceType.
 */
export function getSaleRecordSemantics(sourceType: SaleSourceType): SaleRecordSourceSemantics {
  return RECORD_SEMANTICS[sourceType];
}

/**
 * Get the full extended semantics directly from the DB storage value.
 */
export function getSaleRecordSemanticsFromSag(sag: SagSourceType): SaleRecordSourceSemantics {
  return RECORD_SEMANTICS[fromSagSourceType(sag)];
}

// ── SourceAwareSaleRecord ─────────────────────────────────────────────────────

/**
 * A SaleRecord (any shape T) enriched with the full extended semantics.
 * T must have at minimum: { sagSourceType: string }.
 */
export type SourceAwareSaleRecord<T extends { sagSourceType: string }> = T & {
  /** Business-level source type (FUENTE_1 | FUENTE_2). */
  sourceType:                SaleSourceType;
  /** Full extended semantics for this record. */
  sourceSemantics:           SaleRecordSourceSemantics;
  /** Numeric priority for merge/conflict: 1 = fiscal truth, 2 = dispatch. */
  sourcePriority:            1 | 2;
  /** True: creates legal obligations and receivables. */
  isFiscalTruth:             boolean;
  /** True: delivery confirmed, operational truth regardless of billing. */
  isOperationalTruth:        boolean;
  /** True: contributes to recognized revenue. */
  shouldCountForRevenue:     boolean;
  /** True: can create an AR/Cartera entry. */
  canGenerateReceivable:     boolean;
  /** True: generates a DIAN XML expectation. */
  canGenerateXmlExpectation: boolean;
};

/**
 * Enrich any SaleRecord-shaped object with full source semantics.
 * Works at the module boundary: call this once after fetching from DB.
 *
 * @example
 *   const rows = await prisma.saleRecord.findMany({ where: ... });
 *   const enriched = rows.map(enrichWithSourceSemantics);
 *   const revenue = enriched.filter(r => r.shouldCountForRevenue);
 */
export function enrichWithSourceSemantics<T extends { sagSourceType: string }>(
  record: T,
): SourceAwareSaleRecord<T> {
  const sag      = record.sagSourceType as SagSourceType;
  const sem      = getSaleRecordSemanticsFromSag(sag);
  return {
    ...record,
    sourceType:                sem.sourceType,
    sourceSemantics:           sem,
    sourcePriority:            sem.sourcePriority,
    isFiscalTruth:             sem.isFiscalTruth,
    isOperationalTruth:        sem.isOperationalTruth,
    shouldCountForRevenue:     sem.shouldCountForRevenue,
    canGenerateReceivable:     sem.canGenerateReceivable,
    canGenerateXmlExpectation: sem.canGenerateXmlExpectation,
  };
}

/**
 * Batch enrich an array of records.
 */
export function enrichMany<T extends { sagSourceType: string }>(
  records: T[],
): SourceAwareSaleRecord<T>[] {
  return records.map(enrichWithSourceSemantics);
}
