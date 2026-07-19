/**
 * lib/tasks/server.ts
 *
 * Agentik — Task Domain — Server-Only Barrel
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * SERVER-ONLY. Safe to import from:
 *   - Server Components
 *   - Server Actions
 *   - API route handlers
 *   - lib/copilot/actions/server/*
 *
 * NEVER import from:
 *   - Client components ("use client")
 *   - lib/copilot/actions/action-executor.ts
 *   - lib/work/work-executor.ts
 *   - Any file reachable from the client bundle
 */
import "server-only";

// Service (server-only orchestration layer)
export { taskService, createTaskRecordFromDraft } from "./task-service";

// Persistence implementation (rarely needed outside task-service)
export { taskPrismaRepository }                   from "./persistence/task-prisma-repository";

// Result types (re-exported for convenience — types are safe, implementation is not)
export type {
  TaskCreationResult,
  TaskUpdateResult,
  TaskCompletionResult,
  TaskCancellationResult,
  TaskQueryResult,
  TaskListResult,
}                                                 from "./task-result";
