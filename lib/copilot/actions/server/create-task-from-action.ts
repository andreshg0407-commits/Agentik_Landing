/**
 * lib/copilot/actions/server/create-task-from-action.ts
 *
 * Agentik Copilot — Server-Side Task Creation Bridge
 * Sprint: AGENTIK-TASK-PERSISTENCE-01 + AGENTIK-COPILOT-TASK-CREATION-01
 *
 * SERVER-ONLY bridge between a Copilot action context and real task persistence.
 *
 * Flow:
 *   Server Action
 *     → createTaskFromCopilotAction()
 *     → buildTaskDraftFromCopilotAction()
 *     → taskService.createTaskFromDraft()
 *     → TaskRecord persisted in PostgreSQL
 *
 * NOT imported by action-executor.ts (client-safe executor).
 * NOT exported from lib/copilot/actions/index.ts.
 * Called only from server contexts: Server Actions, API routes, background jobs.
 *
 * Returns a flat, JSON-serializable result — no Date objects, no Prisma types.
 */
import "server-only";

import { buildTaskDraftFromCopilotAction } from "../task-action-adapter";
import { taskService }                     from "@/lib/tasks/task-service";
import type { CopilotActionContext }        from "../action-types";

// ── Serializable result ───────────────────────────────────────────────────────

/** Flat, JSON-safe result returned to Server Actions and API routes. */
export interface CopilotTaskCreationResult {
  success:    boolean;
  message:    string;
  taskId?:    string;
  taskTitle?: string;
  taskStatus?: string;
  createdAt?: string;
  errors?:    string[];
  warnings?:  string[];
}

// ── Bridge function ────────────────────────────────────────────────────────────

/**
 * Create a real, persisted Task from a Copilot action context.
 * Returns a flat serializable result (no TaskRecord, no Date objects).
 */
export async function createTaskFromCopilotAction(
  context: CopilotActionContext,
): Promise<CopilotTaskCreationResult> {
  try {
    const draft  = buildTaskDraftFromCopilotAction(context);
    const result = await taskService.createTaskFromDraft(draft, context.orgSlug);

    if (result.success && result.task) {
      return {
        success:     true,
        message:     "Tarea creada correctamente.",
        taskId:      result.task.id,
        taskTitle:   result.task.draft.title,
        taskStatus:  result.task.draft.status,
        createdAt:   result.task.createdAt,
        warnings:    result.warnings,
      };
    }

    return {
      success:  false,
      message:  result.message || "No se pudo crear la tarea.",
      errors:   result.errors,
      warnings: result.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al crear la tarea.";
    return {
      success: false,
      message: "No se pudo crear la tarea.",
      errors:  [message],
    };
  }
}

/**
 * Convenience wrapper for minimal context objects.
 */
export async function createTaskFromMinimalContext(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
}): Promise<CopilotTaskCreationResult> {
  return createTaskFromCopilotAction({
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
  });
}
