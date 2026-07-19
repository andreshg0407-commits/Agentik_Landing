/**
 * lib/tasks/task-result.ts
 *
 * Agentik — Task Operation Result Types
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * Typed result envelopes for every TaskService operation.
 * No React. No Prisma. No Copilot imports.
 */

import type { TaskRecord, TaskDraft } from "./task-types";
import type { TaskValidationReport }  from "./task-audit";

// ── Shared base ───────────────────────────────────────────────────────────────

interface TaskOperationBase {
  success:   boolean;
  message:   string;
  errors?:   string[];
  warnings?: string[];
}

// ── Per-operation results ─────────────────────────────────────────────────────

export interface TaskCreationResult extends TaskOperationBase {
  task?:             TaskRecord;
  draft?:            TaskDraft;
  validationReport?: TaskValidationReport;
}

export interface TaskUpdateResult extends TaskOperationBase {
  task?: TaskRecord;
}

export interface TaskCompletionResult extends TaskOperationBase {
  task?: TaskRecord;
}

export interface TaskCancellationResult extends TaskOperationBase {
  task?: TaskRecord;
}

export interface TaskQueryResult extends TaskOperationBase {
  task?: TaskRecord | null;
}

export interface TaskListResult extends TaskOperationBase {
  tasks:      TaskRecord[];
  totalCount: number;
}
