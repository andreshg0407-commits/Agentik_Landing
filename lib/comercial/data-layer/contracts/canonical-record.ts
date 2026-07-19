/**
 * contracts/canonical-record.ts
 *
 * Base contract for all canonical records in the Commercial Data Layer.
 * Every domain entity must extend CanonicalRecord.
 */

import type { CommercialIdentity, CommercialTimestamp } from "./commercial-identity";
import type { ExternalReference } from "./external-reference";
import type { DataSourceMetadata } from "./data-source-metadata";

// ── Canonical Record ────────────────────────────────────────────────────────

export interface CanonicalRecord {
  /** Unique identity within the Commercial Data Layer */
  readonly identity: CommercialIdentity;

  /** Reference to the external system record */
  readonly externalRef: ExternalReference;

  /** Metadata about the source that produced this record */
  readonly sourceMetadata: DataSourceMetadata;

  /** Temporal markers for this record */
  readonly timestamps: CommercialTimestamp;

  /** Schema version of this record (for forward-compatible evolution) */
  readonly schemaVersion: number;
}

// ── Record State ────────────────────────────────────────────────────────────

export type RecordState =
  | "ACTIVE"
  | "ARCHIVED"
  | "DELETED"
  | "STALE"
  | "PENDING_VALIDATION";

// ── Record Envelope ─────────────────────────────────────────────────────────

export interface RecordEnvelope<T extends CanonicalRecord> {
  readonly record: T;
  readonly state: RecordState;
  readonly version: number;
  readonly previousVersion: number | null;
}
