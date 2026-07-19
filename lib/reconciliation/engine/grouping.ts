/**
 * lib/reconciliation/engine/grouping.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Grouping and Batch Match Foundation
 *
 * Provides:
 *   1. Duplicate detection within a side (same normalized document key)
 *   2. General grouping utilities (used by indexes and batch matching)
 *   3. Foundation for one-to-many / many-to-one batch matching (future)
 *
 * Batch matching design note (NOT fully implemented — Task 8 foundation):
 *   One-to-many: 1 consignación ↔ N facturas
 *   Many-to-one: N cobros ↔ 1 factura
 *
 *   This pattern is common in Colombian banking: a single bank deposit
 *   covers multiple invoices, or multiple partial payments cover one invoice.
 *
 *   The foundation is here (groupByKey, GroupMatchAttempt), but the engine
 *   currently only performs 1-to-1 matching. Batch matching is a future sprint.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord } from "../canonical-record";
import type { DuplicateGroup }       from "./engine-types";
import { normalizeDocumentNumber }   from "./normalization";

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Detect records in a list that share the same normalized document number.
 *
 * Returns:
 *   - `duplicates`: groups of records with the same key (count >= 2)
 *   - `uniqueRecords`: one representative record per key (for matching)
 *   - `duplicateIds`: set of IDs belonging to non-primary duplicates
 *
 * Policy: the FIRST occurrence of a key becomes the representative record
 * in `uniqueRecords`. All subsequent occurrences are in `duplicateIds`.
 */
export function detectDuplicates(
  records: CanonicalReconRecord[],
  side:    "a" | "b",
): {
  duplicates:    DuplicateGroup[];
  uniqueRecords: CanonicalReconRecord[];
  duplicateIds:  Set<string>;
} {
  const seenKeys = new Map<string, CanonicalReconRecord[]>();

  for (const rec of records) {
    const key = normalizeDocumentNumber(rec.documentNumber) || rec.externalId;
    if (!key) {
      // No usable key — treat as unique (cannot deduplicate)
      seenKeys.set(rec.id, [rec]);
      continue;
    }
    const group = seenKeys.get(key);
    if (group) {
      group.push(rec);
    } else {
      seenKeys.set(key, [rec]);
    }
  }

  const duplicates:    DuplicateGroup[]       = [];
  const uniqueRecords: CanonicalReconRecord[]  = [];
  const duplicateIds:  Set<string>             = new Set();

  for (const [key, group] of seenKeys) {
    if (group.length === 1) {
      uniqueRecords.push(group[0]);
    } else {
      // First record enters matching; rest are duplicates
      uniqueRecords.push(group[0]);
      for (let i = 1; i < group.length; i++) {
        duplicateIds.add(group[i].id);
      }
      duplicates.push({
        duplicateKey: key,
        side,
        records: group,
        count:   group.length,
      });
    }
  }

  return { duplicates, uniqueRecords, duplicateIds };
}

// ── General grouping ──────────────────────────────────────────────────────────

/**
 * Group records by an arbitrary key function.
 * Used for building amount buckets, thirdParty groups, etc.
 */
export function groupByKey<K>(
  records: CanonicalReconRecord[],
  keyFn:   (record: CanonicalReconRecord) => K,
): Map<K, CanonicalReconRecord[]> {
  const result = new Map<K, CanonicalReconRecord[]>();
  for (const rec of records) {
    const k = keyFn(rec);
    const group = result.get(k);
    if (group) {
      group.push(rec);
    } else {
      result.set(k, [rec]);
    }
  }
  return result;
}

// ── Batch match foundation (future) ──────────────────────────────────────────
//
// The types below define the contract for one-to-many batch matching.
// NOT implemented yet — provided as a foundation for a future sprint.
//
// Future use case:
//   1 consignación bancaria ↔ [Factura A, Factura B, Factura C]
//   where sum(Factura amounts) ≈ consignación amount

/** A candidate batch match — one record against a group. */
export interface GroupMatchAttempt {
  /** The "one" side record (e.g., a single bank deposit). */
  one:      CanonicalReconRecord;
  /** The "many" side records (e.g., multiple invoices). */
  many:     CanonicalReconRecord[];
  /** Sum of amounts in the "many" group. */
  manyTotal: number;
  /** Difference between "one" amount and "many" total. */
  delta:     number;
  /** Whether the totals are within tolerance. */
  withinTolerance: boolean;
}

/**
 * Attempt a one-to-many batch match.
 *
 * Given one record and a candidate group, check whether the sum of the
 * group's amounts matches the one record's amount within tolerance.
 *
 * NOT wired into the main engine yet. Foundation for future batch matching.
 *
 * @param one         The single record (e.g., bank consignment)
 * @param many        Candidate group (e.g., open invoices for same NIT)
 * @param tolerance   Fractional tolerance for sum comparison
 */
export function tryOneToManyMatch(
  one:       CanonicalReconRecord,
  many:      CanonicalReconRecord[],
  tolerance: number = 0.001,
): GroupMatchAttempt {
  const manyTotal = many.reduce((s, r) => s + r.amount, 0);
  const delta     = one.amount - manyTotal;
  const base      = Math.abs(one.amount);
  const withinTolerance = base === 0
    ? Math.abs(delta) === 0
    : Math.abs(delta) / base <= tolerance;

  return { one, many, manyTotal, delta, withinTolerance };
}

/**
 * Attempt a many-to-one batch match.
 *
 * Given multiple records and a single target, check whether the sum of
 * the group's amounts matches the target within tolerance.
 *
 * NOT wired into the main engine yet. Foundation for future batch matching.
 */
export function tryManyToOneMatch(
  many:      CanonicalReconRecord[],
  one:       CanonicalReconRecord,
  tolerance: number = 0.001,
): GroupMatchAttempt {
  return tryOneToManyMatch(one, many, tolerance);
}
