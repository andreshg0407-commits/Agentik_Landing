"use server";

/**
 * app/(app)/[orgSlug]/agentik/copilot-task-actions.ts
 *
 * Agentik — Copilot Task Creation Server Actions
 * Sprint: AGENTIK-COPILOT-TASK-CREATION-01
 *
 * Server Action bridge for Copilot CREATE_TASK.
 * Called from copilot-drawer.tsx (client component).
 * Revalidates /{orgSlug}/tareas so the inbox is fresh after creation.
 */

import { revalidatePath }                 from "next/cache";
import { createTaskFromCopilotAction }    from "@/lib/copilot/actions/server/create-task-from-action";
import type { CopilotTaskCreationResult } from "@/lib/copilot/actions/server/create-task-from-action";

export type { CopilotTaskCreationResult };

// ── Server Action ─────────────────────────────────────────────────────────────

/**
 * Create a persisted task from a Copilot action context.
 *
 * Receives plain serializable fields — never complex domain objects.
 * Returns a flat serializable result for the client.
 */
export async function createCopilotTaskAction(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
}): Promise<CopilotTaskCreationResult> {
  const result = await createTaskFromCopilotAction({
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
  });

  if (result.success) {
    revalidatePath(`/${opts.orgSlug}/tareas`);
  }

  return result;
}
