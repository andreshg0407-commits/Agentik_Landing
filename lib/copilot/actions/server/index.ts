/**
 * lib/copilot/actions/server/index.ts
 *
 * Agentik Copilot — Server-Only Action Implementations
 * Sprint: AGENTIK-COPILOT-TASK-CREATION-01
 *
 * SERVER-ONLY barrel. Safe to import from Server Actions and API routes only.
 * Never import from client components or lib/copilot/actions/index.ts.
 */
import "server-only";

export {
  createTaskFromCopilotAction,
  createTaskFromMinimalContext,
} from "./create-task-from-action";

export type { CopilotTaskCreationResult } from "./create-task-from-action";

export {
  createApprovalFromCopilotAction,
  createApprovalFromMinimalContext,
  // createApprovalAction: canonical alias used by Server Action bridge
  createApprovalFromCopilotAction as createApprovalAction,
} from "./create-approval-from-action";

export type { CopilotApprovalCreationResult } from "./create-approval-from-action";
