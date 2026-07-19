/**
 * event-trace.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Traceability metadata for business events.
 *
 * Every event MUST carry traceability explaining HOW it was produced.
 * No event without trace is valid in Agentik.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// -- Event Trace ------------------------------------------------------------

/**
 * Traceability information for an event.
 *
 * Captures the full provenance chain so any event can be
 * traced back to its origin (signal, observation, sync, user action).
 */
export interface EventTrace {
  /** Human-readable origin description. */
  origin: string;
  /** Signal ID that triggered this event (null if not signal-originated). */
  sourceSignalId: string | null;
  /** Observation IDs contributing to this event. */
  sourceObservationIds: string[];
  /** Entity snapshot IDs at the time of the event. */
  sourceEntitySnapshotIds: string[];
  /** Workflow instance ID (if workflow-triggered). */
  sourceWorkflowInstanceId: string | null;
  /** Reasoning chain ID (if reasoning-triggered). */
  sourceReasoningChainId: string | null;
  /** User ID (if manually triggered). */
  sourceUserId: string | null;
  /** Sync run ID (if sync-triggered). */
  sourceSyncRunId: string | null;
  /** Evidence items supporting this event. */
  evidence: TraceEvidenceItem[];
  /** System or user that created this event. */
  createdBy: string;
  /** Arbitrary trace metadata. */
  traceMetadata: Record<string, unknown>;
}

/** A single evidence item in the trace. */
export interface TraceEvidenceItem {
  type: string;
  description: string;
  referenceId: string;
}

// -- Builder ----------------------------------------------------------------

/** Build an event trace with defaults. */
export function buildEventTrace(opts: {
  origin: string;
  createdBy?: string;
  sourceSignalId?: string | null;
  sourceObservationIds?: string[];
  sourceEntitySnapshotIds?: string[];
  sourceWorkflowInstanceId?: string | null;
  sourceReasoningChainId?: string | null;
  sourceUserId?: string | null;
  sourceSyncRunId?: string | null;
  evidence?: TraceEvidenceItem[];
  traceMetadata?: Record<string, unknown>;
}): EventTrace {
  return {
    origin: opts.origin,
    sourceSignalId: opts.sourceSignalId ?? null,
    sourceObservationIds: opts.sourceObservationIds ?? [],
    sourceEntitySnapshotIds: opts.sourceEntitySnapshotIds ?? [],
    sourceWorkflowInstanceId: opts.sourceWorkflowInstanceId ?? null,
    sourceReasoningChainId: opts.sourceReasoningChainId ?? null,
    sourceUserId: opts.sourceUserId ?? null,
    sourceSyncRunId: opts.sourceSyncRunId ?? null,
    evidence: opts.evidence ?? [],
    createdBy: opts.createdBy ?? "system",
    traceMetadata: opts.traceMetadata ?? {},
  };
}

/** Build a trace from a signal origin. */
export function buildSignalTrace(signalId: string, observationIds?: string[]): EventTrace {
  return buildEventTrace({
    origin: `Signal ${signalId}`,
    sourceSignalId: signalId,
    sourceObservationIds: observationIds ?? [],
    createdBy: "signal_engine",
  });
}

/** Build a trace from a workflow origin. */
export function buildWorkflowTrace(workflowInstanceId: string): EventTrace {
  return buildEventTrace({
    origin: `Workflow ${workflowInstanceId}`,
    sourceWorkflowInstanceId: workflowInstanceId,
    createdBy: "workflow_engine",
  });
}

/** Build a trace from a sync run. */
export function buildSyncTrace(syncRunId: string): EventTrace {
  return buildEventTrace({
    origin: `Sync run ${syncRunId}`,
    sourceSyncRunId: syncRunId,
    createdBy: "sync_engine",
  });
}

/** Build a trace from a manual user action. */
export function buildManualTrace(userId: string, description: string): EventTrace {
  return buildEventTrace({
    origin: description,
    sourceUserId: userId,
    createdBy: userId,
  });
}
