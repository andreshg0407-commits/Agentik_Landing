/**
 * lib/tasks/task-service.ts
 *
 * Agentik — Task Service
 * Sprint: AGENTIK-TASK-PERSISTENCE-01
 *
 * SERVER-ONLY — imports Prisma transitively via taskPrismaRepository.
 * Never import this from client components, action-executor, or work-executor.
 * Frontend path: action-executor → work-executor (pure stub, no persistence).
 * Server path: Server Actions / API routes → taskService → taskPrismaRepository.
 *
 * Rules:
 *   - All persistence goes through taskPrismaRepository (never raw Prisma)
 *   - All validation goes through validateTaskDraft / validateTaskRecord
 *   - Returns typed result envelopes — never throws to callers
 *   - No React. No direct Prisma. No Copilot types.
 */
import "server-only";

import {
  validateTaskDraft,
  validateTaskRecord,
}                                          from "./task-audit";
import { createTaskRecordFromDraft }       from "./task-factory";
import { canTransitionTaskStatus }         from "./task-status";
import type { TaskDraft, TaskUpdateInput, TaskFilter } from "./task-types";
import type {
  TaskCreationResult,
  TaskUpdateResult,
  TaskCompletionResult,
  TaskCancellationResult,
  TaskQueryResult,
  TaskListResult,
}                                          from "./task-result";
import {
  taskPrismaRepository,
  findTaskByIdempotencyKey,
  createTaskIdempotent as repoCreateTaskIdempotent,
}                                          from "./persistence/task-prisma-repository";

// ── Service ───────────────────────────────────────────────────────────────────

export const taskService = {

  /**
   * Validate a draft, persist it, and return the resulting TaskRecord.
   * Primary entry point for server-side callers (Server Actions, API routes).
   */
  async createTaskFromDraft(
    draft:   TaskDraft,
    orgSlug: string,
  ): Promise<TaskCreationResult> {
    return taskService.createTask(draft, orgSlug);
  },

  /**
   * Validate a draft, persist it, and return the resulting TaskRecord.
   */
  async createTask(
    draft:   TaskDraft,
    orgSlug: string,
  ): Promise<TaskCreationResult> {
    // 1. Validate draft
    const draftReport = validateTaskDraft(draft);
    if (!draftReport.valid) {
      return {
        success:           false,
        message:           "La tarea no pasó validación.",
        draft,
        validationReport:  draftReport,
        errors:            draftReport.errors.map(e => e.message),
        warnings:          draftReport.warnings.map(w => w.message),
      };
    }

    // 2. Persist via repository
    try {
      const record = await taskPrismaRepository.createTask(draft, orgSlug);

      // 3. Validate resulting record
      const recordReport = validateTaskRecord(record);
      return {
        success:          true,
        message:          "Tarea creada correctamente.",
        task:             record,
        draft,
        validationReport: recordReport,
        warnings:         recordReport.warnings.map(w => w.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido al crear tarea.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Apply an update to an existing task.
   */
  async updateTask(
    taskId:  string,
    input:   TaskUpdateInput,
    orgSlug: string,
  ): Promise<TaskUpdateResult> {
    // Validate status transition if status is changing
    if (input.status) {
      const current = await taskPrismaRepository.getTaskById(taskId, orgSlug);
      if (!current) {
        return { success: false, message: `Tarea ${taskId} no encontrada.`, errors: [`No se encontró la tarea ${taskId}.`] };
      }
      if (!canTransitionTaskStatus(current.draft.status, input.status)) {
        return {
          success: false,
          message: `Transición de estado inválida: ${current.draft.status} → ${input.status}.`,
          errors:  [`No se puede cambiar de "${current.draft.status}" a "${input.status}".`],
        };
      }
    }

    try {
      const record = await taskPrismaRepository.updateTask(taskId, input, orgSlug);
      return { success: true, message: "Tarea actualizada.", task: record };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar tarea.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Mark a task as completed.
   */
  async completeTask(taskId: string, orgSlug: string): Promise<TaskCompletionResult> {
    try {
      const current = await taskPrismaRepository.getTaskById(taskId, orgSlug);
      if (!current) {
        return { success: false, message: `Tarea ${taskId} no encontrada.` };
      }
      if (!canTransitionTaskStatus(current.draft.status, "completed")) {
        return { success: false, message: `No se puede completar una tarea en estado "${current.draft.status}".` };
      }
      const record = await taskPrismaRepository.completeTask(taskId, orgSlug);
      return { success: true, message: "Tarea completada.", task: record };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al completar tarea.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Cancel a task.
   */
  async cancelTask(taskId: string, orgSlug: string): Promise<TaskCancellationResult> {
    try {
      const current = await taskPrismaRepository.getTaskById(taskId, orgSlug);
      if (!current) {
        return { success: false, message: `Tarea ${taskId} no encontrada.` };
      }
      if (!canTransitionTaskStatus(current.draft.status, "cancelled")) {
        return { success: false, message: `No se puede cancelar una tarea en estado "${current.draft.status}".` };
      }
      const record = await taskPrismaRepository.cancelTask(taskId, orgSlug);
      return { success: true, message: "Tarea cancelada.", task: record };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cancelar tarea.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Fetch a single task by ID.
   */
  async getTask(taskId: string, orgSlug: string): Promise<TaskQueryResult> {
    try {
      const task = await taskPrismaRepository.getTaskById(taskId, orgSlug);
      return { success: true, message: task ? "Tarea encontrada." : "Tarea no encontrada.", task };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al consultar tarea.";
      return { success: false, message, task: null, errors: [message] };
    }
  },

  /**
   * List tasks for a tenant with optional filters.
   */
  async listTasks(orgSlug: string, filter?: TaskFilter): Promise<TaskListResult> {
    try {
      const tasks = await taskPrismaRepository.listTasks(orgSlug, filter);
      return { success: true, message: "Tareas consultadas.", tasks, totalCount: tasks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al listar tareas.";
      return { success: false, message, tasks: [], totalCount: 0, errors: [message] };
    }
  },

  // ── AGENTIK-IDEMPOTENCY-01 ─────────────────────────────────────────────────

  /**
   * Find a task by its idempotency key.
   */
  async findTaskByIdempotencyKey(
    orgSlug:        string,
    idempotencyKey: string,
  ): Promise<TaskQueryResult> {
    try {
      const task = await findTaskByIdempotencyKey(orgSlug, idempotencyKey);
      return { success: true, message: task ? "Tarea encontrada." : "Tarea no encontrada.", task };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al consultar tarea por clave.";
      return { success: false, message, task: null, errors: [message] };
    }
  },

  /**
   * Create a task with idempotency protection.
   * Returns the existing task if the key was already processed.
   */
  async createTaskIdempotent(
    draft:          TaskDraft,
    orgSlug:        string,
    idempotencyKey: string,
  ): Promise<TaskCreationResult & { alreadyProcessed: boolean }> {
    const draftReport = validateTaskDraft(draft);
    if (!draftReport.valid) {
      return {
        success:          false,
        alreadyProcessed: false,
        message:          "La tarea no pasó validación.",
        draft,
        validationReport: draftReport,
        errors:           draftReport.errors.map(e => e.message),
        warnings:         draftReport.warnings.map(w => w.message),
      };
    }

    try {
      const { task, alreadyProcessed } = await repoCreateTaskIdempotent(draft, orgSlug, idempotencyKey);
      const recordReport = validateTaskRecord(task);
      return {
        success:          true,
        alreadyProcessed,
        message:          alreadyProcessed
          ? `Tarea ya existente (idempotencyKey reutilizada): ${task.id}`
          : "Tarea creada correctamente.",
        task,
        draft,
        validationReport: recordReport,
        warnings:         recordReport.warnings.map(w => w.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear tarea de forma idempotente.";
      return { success: false, alreadyProcessed: false, message, errors: [message] };
    }
  },

};

// Keep createTaskRecordFromDraft available for in-memory-only use cases
export { createTaskRecordFromDraft };
