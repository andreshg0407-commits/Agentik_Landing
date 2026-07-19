/**
 * contracts/synchronization-context.ts
 *
 * Context and result contracts for synchronization operations.
 */

import type { ExternalSystemType } from "./external-reference";
import type { ExtractionMode } from "./data-source-metadata";
import type { CommercialDomain } from "./commercial-identity";

// ── Synchronization Context ─────────────────────────────────────────────────

export interface SynchronizationContext {
  /** Tenant being synchronized */
  readonly tenantId: string;

  /** Domain being synchronized */
  readonly domain: CommercialDomain;

  /** External system being consumed */
  readonly sourceSystem: ExternalSystemType;

  /** Extraction mode for this run */
  readonly mode: ExtractionMode;

  /** Unique correlation ID for this synchronization run */
  readonly correlationId: string;

  /** When this synchronization run started */
  readonly startedAt: Date;

  /** Optional: last successful sync timestamp (for incremental) */
  readonly lastSyncAt: Date | null;

  /** Optional: specific entity types to synchronize */
  readonly entityFilter?: string[];

  /** Optional: maximum records to process */
  readonly batchLimit?: number;
}

// ── Synchronization Result ──────────────────────────────────────────────────

export interface SynchronizationResult {
  /** Correlation ID linking to the context */
  readonly correlationId: string;

  /** Final status of the synchronization */
  readonly status: SynchronizationStatus;

  /** Statistics about the run */
  readonly stats: SynchronizationStats;

  /** When the synchronization completed */
  readonly completedAt: Date;

  /** Duration in milliseconds */
  readonly durationMs: number;

  /** Errors encountered (if any) */
  readonly errors: SynchronizationError[];
}

export type SynchronizationStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "SKIPPED";

export interface SynchronizationStats {
  readonly discovered: number;
  readonly extracted: number;
  readonly normalized: number;
  readonly validated: number;
  readonly persisted: number;
  readonly rejected: number;
  readonly unchanged: number;
}

export interface SynchronizationError {
  readonly stage: string;
  readonly message: string;
  readonly recordId?: string;
  readonly recoverable: boolean;
}
