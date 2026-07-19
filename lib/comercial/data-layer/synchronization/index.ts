/**
 * synchronization/index.ts — Barrel export for synchronization contracts.
 */

export type {
  SynchronizationPipeline,
  DiscoverStage,
  ExtractStage,
  NormalizeStage,
  ValidateStage,
  QualityStage,
  PersistStage,
  SnapshotStage,
  EventStage,
  MetricsStage,
  DiscoverOutput,
  ExtractOutput,
  NormalizeOutput,
  ValidateOutput,
  PersistOutput,
  SnapshotOutput,
  EventOutput,
  ChangeSet,
} from "./pipeline-contract";
