/**
 * events/index.ts — Barrel export for event contracts.
 */

export type {
  SynchronizationStarted,
  SynchronizationCompleted,
  SynchronizationFailed,
  SnapshotCreated,
  RecordRejected,
  QualityIssueDetected,
  AdapterHealthChanged,
} from "./event-catalog";

export { EVENT_TYPES } from "./event-catalog";
