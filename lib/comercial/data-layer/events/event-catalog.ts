/**
 * events/event-catalog.ts
 *
 * Official event type contracts for the Commercial Data Layer.
 * These are the internal events emitted during synchronization and operations.
 */

import type { DomainEvent } from "../contracts";
import type { SynchronizationStats } from "../contracts";
import type { QualityLevel } from "../contracts";

// ── Synchronization Events ──────────────────────────────────────────────────

export type SynchronizationStarted = DomainEvent<{
  readonly adapterId: string;
  readonly mode: string;
  readonly expectedRecords: number | null;
}>;

export type SynchronizationCompleted = DomainEvent<{
  readonly adapterId: string;
  readonly stats: SynchronizationStats;
  readonly durationMs: number;
}>;

export type SynchronizationFailed = DomainEvent<{
  readonly adapterId: string;
  readonly error: string;
  readonly stage: string;
  readonly recoverable: boolean;
}>;

// ── Snapshot Events ─────────────────────────────────────────────────────────

export type SnapshotCreated = DomainEvent<{
  readonly snapshotId: string;
  readonly entityType: string;
  readonly recordCount: number;
  readonly version: number;
}>;

// ── Record Events ───────────────────────────────────────────────────────────

export type RecordRejected = DomainEvent<{
  readonly recordId: string;
  readonly reason: string;
  readonly field?: string;
  readonly qualityLevel: QualityLevel;
}>;

// ── Quality Events ──────────────────────────────────────────────────────────

export type QualityIssueDetected = DomainEvent<{
  readonly recordId: string;
  readonly dimension: string;
  readonly severity: string;
  readonly description: string;
}>;

// ── Health Events ───────────────────────────────────────────────────────────

export type AdapterHealthChanged = DomainEvent<{
  readonly adapterId: string;
  readonly previousStatus: string;
  readonly currentStatus: string;
  readonly reason: string;
}>;

// ── Event Type Registry ─────────────────────────────────────────────────────

export const EVENT_TYPES = {
  SYNCHRONIZATION_STARTED: "SynchronizationStarted",
  SYNCHRONIZATION_COMPLETED: "SynchronizationCompleted",
  SYNCHRONIZATION_FAILED: "SynchronizationFailed",
  SNAPSHOT_CREATED: "SnapshotCreated",
  RECORD_REJECTED: "RecordRejected",
  QUALITY_ISSUE_DETECTED: "QualityIssueDetected",
  ADAPTER_HEALTH_CHANGED: "AdapterHealthChanged",
} as const;
