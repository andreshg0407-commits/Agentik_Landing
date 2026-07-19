"use server";

/**
 * app/(app)/[orgSlug]/tareas/actions.ts
 *
 * Agentik — Task Inbox Server Actions
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Server Actions for completing and cancelling tasks.
 * Called from TaskDetailDrawer (client component) via Server Action bridge.
 * Never import taskService from client components — this file is the bridge.
 */

import { revalidatePath }  from "next/cache";
import { taskService }     from "@/lib/tasks/task-service";

// ── Complete task ─────────────────────────────────────────────────────────────

export async function completeTaskAction(
  taskId:  string,
  orgSlug: string,
): Promise<{ success: boolean; message: string }> {
  const result = await taskService.completeTask(taskId, orgSlug);
  if (result.success) {
    revalidatePath(`/${orgSlug}/tareas`);
  }
  return { success: result.success, message: result.message };
}

// ── Cancel task ───────────────────────────────────────────────────────────────

export async function cancelTaskAction(
  taskId:  string,
  orgSlug: string,
): Promise<{ success: boolean; message: string }> {
  const result = await taskService.cancelTask(taskId, orgSlug);
  if (result.success) {
    revalidatePath(`/${orgSlug}/tareas`);
  }
  return { success: result.success, message: result.message };
}
