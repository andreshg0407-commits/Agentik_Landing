/**
 * lib/tasks/persistence/task-repository.ts
 *
 * Agentik — Task Repository Contract
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * Interface only. No Prisma. No implementation.
 * Implementations live in task-prisma-repository.ts.
 */

import type {
  TaskRecord,
  TaskDraft,
  TaskUpdateInput,
  TaskFilter,
} from "../task-types";

// ── Repository interface ──────────────────────────────────────────────────────

export interface TaskRepository {
  /**
   * Persist a new TaskDraft and return the stored TaskRecord.
   * @param draft  - The draft to persist.
   * @param orgSlug - Tenant identifier.
   */
  createTask(draft: TaskDraft, orgSlug: string): Promise<TaskRecord>;

  /**
   * Apply an update to an existing task. Returns the updated TaskRecord.
   */
  updateTask(taskId: string, input: TaskUpdateInput, orgSlug: string): Promise<TaskRecord>;

  /**
   * Fetch a single task by ID within a tenant.
   * Returns null if not found.
   */
  getTaskById(taskId: string, orgSlug: string): Promise<TaskRecord | null>;

  /**
   * List tasks with optional filters within a tenant.
   */
  listTasks(orgSlug: string, filter?: TaskFilter): Promise<TaskRecord[]>;

  /**
   * Mark a task as completed. Sets completedAt and status = "completed".
   */
  completeTask(taskId: string, orgSlug: string): Promise<TaskRecord>;

  /**
   * Cancel a task. Sets cancelledAt and status = "cancelled".
   */
  cancelTask(taskId: string, orgSlug: string): Promise<TaskRecord>;
}
