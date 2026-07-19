/**
 * lib/business-signals/index.ts
 *
 * BUSINESS-SIGNALS-01
 * Barrel export for the Operational Signal Engine.
 *
 * Client-safe: no Prisma, no server-only, no React, no AI.
 * Import from "@/lib/business-signals" for all signal contracts.
 */

// -- Core Types & ID Generation ---------------------------------------------
export type { SignalEntityRef } from "./signal-types";
export { nextSignalId } from "./signal-types";

// -- Category ---------------------------------------------------------------
export type { SignalCategory } from "./signal-category";
export { SIGNAL_CATEGORIES, isSignalCategory } from "./signal-category";

// -- Severity ---------------------------------------------------------------
export type { SignalSeverity } from "./signal-severity";
export { SIGNAL_SEVERITIES, compareSeverity, meetsThreshold } from "./signal-severity";

// -- Priority ---------------------------------------------------------------
export type { SignalPriority } from "./signal-priority";
export { SIGNAL_PRIORITIES, comparePriority } from "./signal-priority";

// -- Source -----------------------------------------------------------------
export type { SignalSource } from "./signal-source";
export { SIGNAL_SOURCES } from "./signal-source";

// -- Evidence ---------------------------------------------------------------
export type {
  SignalEvidenceType,
  SignalEvidenceItem,
  SignalEvidence,
} from "./signal-evidence";
export {
  buildSignalEvidenceItem,
  buildSignalEvidence,
  emptySignalEvidence,
} from "./signal-evidence";

// -- Context ----------------------------------------------------------------
export type {
  SignalContext,
  SignalContextMetric,
} from "./signal-context";
export { buildSignalContext } from "./signal-context";

// -- Signal -----------------------------------------------------------------
export type {
  SignalStatus,
  SignalType,
  BusinessSignal,
  MergedSignal,
} from "./signal";
export {
  SIGNAL_STATUSES,
  TERMINAL_STATUSES,
  isTerminalStatus,
} from "./signal";

// -- Builder ----------------------------------------------------------------
export type { BuildSignalOptions } from "./signal-builder";
export {
  buildSignal,
  buildThresholdBreachSignal,
  buildAbsenceSignal,
  buildStateChangeSignal,
  buildDeadlineSignal,
  mergeSignals,
} from "./signal-builder";

// -- Engine -----------------------------------------------------------------
export type {
  SignalFilter,
  SignalGroupKey,
  SignalGroup,
  DeduplicationResult,
  SignalSummary,
  ISignalEngine,
} from "./signal-engine";
export { InMemorySignalEngine } from "./signal-engine";

// -- Utils ------------------------------------------------------------------
export {
  filterBySeverity,
  filterByCategory,
  filterByConfidence,
  activeSignals,
  terminalSignals,
  signalsForEntity,
  sortBySeverity,
  sortByPriority,
  sortBySeverityThenPriority,
  sortByNewest,
  countByCategory,
  countBySeverity,
  countByStatus,
  hasSignalAtSeverity,
  highestSeverity,
  uniqueEntities,
  uniqueCategories,
  isMergedSignal,
  signalSetSummary,
} from "./signal-utils";
