/**
 * Deduplication utilities for the Universal Connector Layer.
 *
 * Natural key design:
 *   sha256(orgId:source:module:sourceId) → first 32 hex chars (128 bits)
 *
 * Why 128 bits?
 *   Collision probability < 1 in 10^18 for 10 million records per org.
 *   The full composite prefix (orgId:source:module:sourceId) ensures that
 *   the same source ID from two different systems never collides.
 *
 * Usage:
 *   Storage handlers use `naturalKey()` as their upsert WHERE key.
 *   `dedupWithinPage()` removes intra-page duplicates before the handler runs.
 *   `annotateNaturalKeys()` stamps records with _naturalKey for storage.
 */

import { createHash } from "crypto";
import type { SourceRecord, SyncModule } from "./types";

// ── Natural key ───────────────────────────────────────────────────────────────

/**
 * Compute a stable, org-scoped natural key for a record.
 * Identical for the same logical entity across re-imports.
 */
export function naturalKey(
  orgId:    string,
  source:   string,
  module:   SyncModule,
  sourceId: string
): string {
  return createHash("sha256")
    .update(`${orgId}\x00${source}\x00${module}\x00${sourceId}`)
    .digest("hex")
    .slice(0, 32);
}

// ── Intra-page deduplication ──────────────────────────────────────────────────

export interface DedupResult<T> {
  unique:         T[];
  duplicateCount: number;
}

/**
 * Remove duplicates within a single pull-page result.
 * When `sourceId` repeats (API pagination bugs, etc.), the last occurrence wins.
 * This only covers duplicates within one page; cross-page / cross-run dedup
 * is handled by the storage handler's upsert logic.
 */
export function dedupWithinPage<T extends SourceRecord>(records: T[]): DedupResult<T> {
  const seen  = new Map<string, T>();
  let   dupes = 0;

  for (const r of records) {
    if (seen.has(r.sourceId)) dupes++;
    seen.set(r.sourceId, r);
  }

  return { unique: [...seen.values()], duplicateCount: dupes };
}

// ── Key annotation ────────────────────────────────────────────────────────────

/**
 * Stamp each record with a precomputed `_naturalKey`.
 * Storage handlers use this to drive upsert WHERE clauses without
 * recomputing the hash on each row.
 */
export function annotateNaturalKeys<T extends SourceRecord>(
  records: T[],
  module:  SyncModule
): Array<T & { _naturalKey: string }> {
  return records.map(r => ({
    ...r,
    _naturalKey: naturalKey(r.orgId, r.source, module, r.sourceId),
  }));
}

// ── Batch fingerprint ─────────────────────────────────────────────────────────

/**
 * Compute a fingerprint for an entire page of records.
 * Useful for detecting unchanged pages (e.g. polling sources with no cursor).
 */
export function pageFingerprint(records: SourceRecord[]): string {
  const ids = records.map(r => r.sourceId).sort().join(",");
  return createHash("sha256").update(ids).digest("hex").slice(0, 16);
}
