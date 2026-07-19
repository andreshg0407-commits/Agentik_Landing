/**
 * workflow-history.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Complete audit trail for workflow instances.
 *
 * Every change is recorded. Nothing is lost.
 * History feeds timeline, analytics, and compliance.
 *
 * No Prisma. No React. Pure domain types.
 */

// ── History Event Type ───────────────────────────────────────────────────────

/** All tracked workflow history event types. */
export type WorkflowHistoryEventType =
  // Stage lifecycle
  | "stage_entered"
  | "stage_completed"
  | "stage_skipped"
  | "stage_failed"
  // Approvals
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  // Workflow lifecycle
  | "workflow_started"
  | "workflow_completed"
  | "workflow_cancelled"
  | "workflow_paused"
  | "workflow_resumed"
  | "workflow_failed"
  | "workflow_blocked"
  | "workflow_unblocked"
  // Operations
  | "assignment_changed"
  | "comment_added"
  | "attachment_added"
  | "priority_changed"
  | "sla_breached"
  | "sla_warning"
  // Splits and merges
  | "split_created"
  | "merge_completed";

// ── History Entry ────────────────────────────────────────────────────────────

/**
 * A single entry in the workflow history.
 * Immutable — once created, never modified.
 */
export interface WorkflowHistoryEntry {
  /** Unique entry ID. */
  id: string;
  /** Workflow instance ID. */
  instanceId: string;
  /** Event type. */
  eventType: WorkflowHistoryEventType;
  /** Stage code (null for workflow-level events). */
  stageCode: string | null;
  /** Previous stage code (for transitions). */
  fromStageCode: string | null;
  /** Next stage code (for transitions). */
  toStageCode: string | null;
  /** User or system that triggered this event. */
  actor: string | null;
  /** Human-readable description. */
  description: string;
  /** Duration in minutes of the stage/action (null if not applicable). */
  durationMinutes: number | null;
  /** ISO timestamp when the event occurred. */
  occurredAt: string;
  /** Arbitrary event-specific metadata. */
  metadata: Record<string, unknown>;
}

// ── History Builder ──────────────────────────────────────────────────────────

let _histSeq = 0;

/** Generate a unique history entry ID. */
export function nextHistoryId(): string {
  return `wh-${Date.now()}-${++_histSeq}`;
}

/** Build a WorkflowHistoryEntry. */
export function buildHistoryEntry(opts: {
  instanceId: string;
  eventType: WorkflowHistoryEventType;
  stageCode?: string;
  fromStageCode?: string;
  toStageCode?: string;
  actor?: string;
  description: string;
  durationMinutes?: number;
  metadata?: Record<string, unknown>;
}): WorkflowHistoryEntry {
  return {
    id: nextHistoryId(),
    instanceId: opts.instanceId,
    eventType: opts.eventType,
    stageCode: opts.stageCode ?? null,
    fromStageCode: opts.fromStageCode ?? null,
    toStageCode: opts.toStageCode ?? null,
    actor: opts.actor ?? null,
    description: opts.description,
    durationMinutes: opts.durationMinutes ?? null,
    occurredAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
