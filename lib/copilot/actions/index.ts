/**
 * lib/copilot/actions/index.ts
 *
 * Agentik Copilot — Action System Exports
 * Sprint: AGENTIK-COPILOT-ACTION-SYSTEM-01
 */

export type {
  CopilotActionId,
  CopilotActionKind,
  CopilotActionRisk,
  CopilotActionStatus,
  CopilotActionMode,
  CopilotActionContext,
  CopilotActionDefinition,
  CopilotActionPayload,
  CopilotActionResult,
  CopilotActionExecutionRequest,
  CopilotActionExecutionResponse,
} from "./action-types";

export {
  ACTION_REGISTRY,
  getActionDefinition,
  getAllActionDefinitions,
} from "./action-registry";

export {
  getCopilotActionDefinition,
  getAvailableCopilotActions,
  resolveActionsForDrawerCategory,
  resolveActionsForNavigationTarget,
  resolvePrimaryActionForContext,
} from "./action-resolver";

export { executeCopilotAction, isWorkBackedAction } from "./action-executor";

export {
  mapWorkResponseToCopilotResult,
  resolveCreatedEntityTypeFromWorkType,
  extractPrimaryArtifactFromWorkResponse,
  extractWorkMetadata,
}                                                   from "./action-result-mapper";

export type { ActionAuditViolation, ActionAuditReport } from "./action-audit";
export { auditCopilotActions }                           from "./action-audit";

export {
  buildTaskDraftFromCopilotAction,
  buildTaskDraftFromDrawerContext,
  mapDrawerCategoryToTaskCategory,
  mapActionPriorityToTaskPriority,
}                                                        from "./task-action-adapter";

export {
  buildWorkExecutionRequest,
  mapCopilotContextToWorkContext,
  resolveWorkTypeForAction,
}                                                        from "./work-action-adapter";
