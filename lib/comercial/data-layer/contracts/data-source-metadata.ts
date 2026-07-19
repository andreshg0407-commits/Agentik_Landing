/**
 * contracts/data-source-metadata.ts
 *
 * Metadata about the data source that produced a canonical record.
 */

import type { ExternalSystemType } from "./external-reference";

// ── Data Source Metadata ────────────────────────────────────────────────────

export interface DataSourceMetadata {
  /** System type that produced this data */
  readonly sourceType: ExternalSystemType;

  /** Adapter that processed this data */
  readonly adapterId: string;

  /** Version of the adapter at extraction time */
  readonly adapterVersion: string;

  /** Extraction timestamp */
  readonly extractedAt: Date;

  /** Whether this was a full sync or incremental */
  readonly extractionMode: ExtractionMode;

  /** Correlation ID linking this to a synchronization run */
  readonly correlationId: string;
}

// ── Extraction Mode ─────────────────────────────────────────────────────────

export type ExtractionMode =
  | "FULL"
  | "INCREMENTAL"
  | "ON_DEMAND"
  | "WEBHOOK";
