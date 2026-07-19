/**
 * contracts/index.ts — Barrel export for all base contracts.
 */

export type {
  CanonicalRecord,
  RecordState,
  RecordEnvelope,
} from "./canonical-record";

export type {
  CommercialIdentity,
  CommercialDomain,
  CommercialTimestamp,
} from "./commercial-identity";

export type {
  ExternalReference,
  ExternalSystem,
  ExternalSystemType,
} from "./external-reference";

export type {
  DataSourceMetadata,
  ExtractionMode,
} from "./data-source-metadata";

export type {
  SynchronizationContext,
  SynchronizationResult,
  SynchronizationStatus,
  SynchronizationStats,
  SynchronizationError,
} from "./synchronization-context";

export type {
  QualityAssessment,
  QualityDimensions,
  QualityLevel,
  QualityIssue,
  QualityIssueSeverity,
} from "./quality-assessment";

export type {
  DomainEvent,
  EventMetadata,
} from "./domain-event";
