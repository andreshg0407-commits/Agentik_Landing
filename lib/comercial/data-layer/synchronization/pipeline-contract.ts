/**
 * synchronization/pipeline-contract.ts
 *
 * Synchronization pipeline contracts.
 * Defines the stages that every sync operation must pass through.
 */

import type { SynchronizationContext, SynchronizationResult } from "../contracts";
import type { QualityAssessment } from "../contracts";

// ── Pipeline Contract ───────────────────────────────────────────────────────

export interface SynchronizationPipeline<TRaw, TCanonical> {
  /** Execute the full pipeline */
  execute(ctx: SynchronizationContext): Promise<SynchronizationResult>;
}

// ── Pipeline Stages ─────────────────────────────────────────────────────────

export interface DiscoverStage {
  /** Identify what records exist in the source */
  discover(ctx: SynchronizationContext): Promise<DiscoverOutput>;
}

export interface ExtractStage<TRaw> {
  /** Pull raw records from the external system */
  extract(ctx: SynchronizationContext, recordIds: string[]): Promise<ExtractOutput<TRaw>>;
}

export interface NormalizeStage<TRaw, TCanonical> {
  /** Transform raw records into canonical form */
  normalize(raw: TRaw, ctx: SynchronizationContext): Promise<NormalizeOutput<TCanonical>>;
}

export interface ValidateStage<TCanonical> {
  /** Validate canonical records against business rules */
  validate(record: TCanonical): Promise<ValidateOutput>;
}

export interface QualityStage<TCanonical> {
  /** Assess data quality of a canonical record */
  assess(record: TCanonical): Promise<QualityAssessment>;
}

export interface PersistStage<TCanonical> {
  /** Persist validated canonical records */
  persist(records: TCanonical[]): Promise<PersistOutput>;
}

export interface SnapshotStage {
  /** Create a snapshot after persistence */
  snapshot(ctx: SynchronizationContext): Promise<SnapshotOutput>;
}

export interface EventStage {
  /** Emit domain events for downstream consumers */
  emit(ctx: SynchronizationContext, changes: ChangeSet): Promise<EventOutput>;
}

export interface MetricsStage {
  /** Record synchronization metrics */
  record(ctx: SynchronizationContext, result: SynchronizationResult): Promise<void>;
}

// ── Stage Outputs ───────────────────────────────────────────────────────────

export interface DiscoverOutput {
  readonly recordIds: string[];
  readonly totalAvailable: number;
  readonly newSinceLastSync: number;
}

export interface ExtractOutput<TRaw> {
  readonly records: TRaw[];
  readonly extractedAt: Date;
  readonly truncated: boolean;
}

export interface NormalizeOutput<TCanonical> {
  readonly record: TCanonical | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
}

export interface ValidateOutput {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface PersistOutput {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly rejected: number;
}

export interface SnapshotOutput {
  readonly snapshotId: string;
  readonly recordCount: number;
  readonly createdAt: Date;
}

export interface EventOutput {
  readonly emitted: number;
  readonly eventTypes: string[];
}

export interface ChangeSet {
  readonly created: string[];
  readonly updated: string[];
  readonly deleted: string[];
}
