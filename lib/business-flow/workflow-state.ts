/**
 * workflow-state.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Generic workflow states and stage states.
 *
 * No domain-specific states. No hardcoded production stages.
 * States are generic — the workflow definition gives them meaning.
 *
 * No Prisma. No React. Pure domain types.
 */

// ── Stage Status ─────────────────────────────────────────────────────────────

/** Status of a single stage within a running workflow instance. */
export type StageStatus =
  | "pending"
  | "active"
  | "completed"
  | "skipped"
  | "blocked"
  | "failed"
  | "cancelled";

// ── Stage Progress ───────────────────────────────────────────────────────────

/** Progress tracking for a stage. */
export interface StageProgress {
  /** Current stage status. */
  status: StageStatus;
  /** Completion percentage (0-100). */
  completionPercent: number;
  /** ISO timestamp when the stage was entered. */
  enteredAt: string | null;
  /** ISO timestamp when the stage was completed/exited. */
  exitedAt: string | null;
  /** Duration in minutes spent in this stage. */
  durationMinutes: number | null;
  /** User/system that activated this stage. */
  activatedBy: string | null;
  /** User/system that completed this stage. */
  completedBy: string | null;
  /** Notes attached to this stage instance. */
  notes: string | null;
}

// ── Workflow Progress ────────────────────────────────────────────────────────

/** Overall progress of a workflow instance. */
export interface WorkflowProgress {
  /** Total stages in the workflow definition. */
  totalStages: number;
  /** Stages completed so far. */
  completedStages: number;
  /** Stages skipped. */
  skippedStages: number;
  /** Overall completion percentage (0-100). */
  completionPercent: number;
  /** Whether the workflow is on track for its SLA. */
  onTrack: boolean;
  /** Estimated completion date (null if not computable). */
  estimatedCompletion: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create an initial stage progress (pending). */
export function emptyStageProgress(): StageProgress {
  return {
    status: "pending",
    completionPercent: 0,
    enteredAt: null,
    exitedAt: null,
    durationMinutes: null,
    activatedBy: null,
    completedBy: null,
    notes: null,
  };
}

/** Compute workflow progress from stage progress map. */
export function computeWorkflowProgress(
  stageProgresses: Map<string, StageProgress>,
  totalStages: number,
  slaDeadline: string | null,
): WorkflowProgress {
  let completed = 0;
  let skipped = 0;

  for (const sp of stageProgresses.values()) {
    if (sp.status === "completed") completed++;
    if (sp.status === "skipped") skipped++;
  }

  const done = completed + skipped;
  const percent = totalStages > 0 ? Math.round((done / totalStages) * 100) : 0;

  let onTrack = true;
  if (slaDeadline) {
    const remaining = new Date(slaDeadline).getTime() - Date.now();
    if (remaining < 0) onTrack = false;
  }

  return {
    totalStages,
    completedStages: completed,
    skippedStages: skipped,
    completionPercent: percent,
    onTrack,
    estimatedCompletion: null, // V2: predictive estimation
  };
}
