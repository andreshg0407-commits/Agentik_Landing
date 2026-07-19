"use server";

/**
 * app/(app)/[orgSlug]/agentik/copilot-approval-actions.ts
 *
 * Agentik — Copilot Approval Creation Server Action
 * Sprint: AGENTIK-COPILOT-APPROVAL-CREATION-01
 *
 * Server Action bridge for Copilot REQUEST_APPROVAL.
 * Called from copilot-drawer.tsx (client component).
 * Revalidates /{orgSlug}/aprobaciones so the inbox is fresh after creation.
 *
 * Mirror of copilot-task-actions.ts — same pattern, approvals domain.
 */

import { revalidatePath }                    from "next/cache";
import { createApprovalFromCopilotAction }   from "@/lib/copilot/actions/server/create-approval-from-action";
import type { CopilotApprovalCreationResult } from "@/lib/copilot/actions/server/create-approval-from-action";

export type { CopilotApprovalCreationResult };

// ── Server Action ─────────────────────────────────────────────────────────────

/**
 * Create a persisted ApprovalRequest from a Copilot action context.
 *
 * Receives plain serializable fields — never complex domain objects.
 * Returns a flat serializable result for the client.
 */
export async function createCopilotApprovalAction(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
}): Promise<CopilotApprovalCreationResult> {
  const result = await createApprovalFromCopilotAction({
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
  });

  if (result.success) {
    revalidatePath(`/${opts.orgSlug}/aprobaciones`);
  }

  return result;
}
