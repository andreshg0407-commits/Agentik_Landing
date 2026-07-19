/**
 * lib/tasks/index.ts
 *
 * Agentik — Task System Exports
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 */

// Types
export type {
  TaskId,
  TaskDraftId,
  TaskPriority,
  TaskStatus,
  TaskSource,
  TaskCategory,
  TaskOwnerType,
  TaskRelationshipType,
  TaskVisibility,
  TaskDueDateMode,
  TaskAuditEventType,
  TaskOwner,
  TaskAssignment,
  TaskRelationship,
  TaskAuditEvent,
  TaskBusinessContext,
  TaskDraft,
  TaskRecord,
  TaskCreationInput,
  TaskUpdateInput,
  TaskFilter,
  TaskSummary,
} from "./task-types";

// Priority helpers
export type { TaskPriorityTone }            from "./task-priority";
export {
  normalizeTaskPriority,
  compareTaskPriority,
  isHighPriorityTask,
  isCriticalTask,
  getTaskPriorityWeight,
  getTaskPriorityLabel,
  getTaskPriorityTone,
}                                           from "./task-priority";

// Status helpers
export type { TaskStatusTone }              from "./task-status";
export {
  normalizeTaskStatus,
  isTaskOpen,
  isTaskClosed,
  isTaskActionable,
  getTaskStatusLabel,
  getTaskStatusTone,
  allowedTaskStatusTransitions,
  canTransitionTaskStatus,
}                                           from "./task-status";

// Assignment helpers
export {
  createTaskOwner,
  createTaskAssignment,
  isAssignedToAgent,
  isAssignedToUser,
  isAssignedToTeam,
  resolveTaskOwnerLabel,
  SYSTEM_TASK_OWNER,
  DIEGO_TASK_OWNER,
  LUCA_TASK_OWNER,
}                                           from "./task-assignment";

// Factory
export {
  createDefaultTaskBusinessContext,
  createTaskRelationship,
  createTaskAuditEvent,
  createTaskDraft,
  createTaskRecordFromDraft,
}                                           from "./task-factory";

// Audit
export type { TaskValidationIssue, TaskValidationReport, TaskDomainAuditReport } from "./task-audit";
export { validateTaskDraft, validateTaskRecord, auditTaskDomain }                 from "./task-audit";

// Result types (type-only — safe to import from client bundles)
export type {
  TaskCreationResult,
  TaskUpdateResult,
  TaskCompletionResult,
  TaskCancellationResult,
  TaskQueryResult,
  TaskListResult,
}                                                                                  from "./task-result";

// NOTE: task-service and task-prisma-repository are server-only.
// Import them directly from their files in server contexts only:
//   import { taskService } from "@/lib/tasks/task-service";
