/**
 * lib/work/index.ts
 *
 * Agentik — Work Execution Domain Exports
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 */

// Types
export type {
  WorkItemId,
  WorkExecutionId,
  WorkArtifactId,
  WorkAssignmentId,
  WorkType,
  WorkStatus,
  WorkPriority,
  WorkSource,
  WorkActorType,
  WorkArtifactType,
  WorkExecutionMode,
  WorkVisibility,
  WorkRelationshipType,
  WorkActor,
  WorkRelationship,
  WorkContext,
  WorkAssignment,
  WorkItem,
  WorkArtifact,
  WorkExecution,
  WorkResult,
  WorkExecutionRequest,
  WorkExecutionResponse,
} from "./work-types";

// Factory
export {
  SYSTEM_WORK_ACTOR,
  DIEGO_WORK_ACTOR,
  LUCA_WORK_ACTOR,
  MILA_WORK_ACTOR,
  createWorkActor,
  createWorkContext,
  createWorkRelationship,
  createWorkAssignment,
  createWorkItem,
  createWorkArtifact,
  createWorkExecution,
  createWorkResult,
} from "./work-factory";

// Status helpers
export type { WorkStatusTone }    from "./work-status";
export {
  normalizeWorkStatus,
  isWorkCompleted,
  isWorkFailed,
  isWorkRunning,
  isWorkTerminal,
  canTransitionWorkStatus,
  allowedWorkTransitions,
  getWorkStatusLabel,
  getWorkStatusTone,
}                                 from "./work-status";

// Priority helpers
export type { WorkPriorityTone }  from "./work-priority";
export {
  normalizeWorkPriority,
  compareWorkPriority,
  isHighWorkPriority,
  isCriticalWork,
  getWorkPriorityWeight,
  getWorkPriorityLabel,
  getWorkPriorityTone,
}                                 from "./work-priority";

// Registry
export type { WorkTypeDefinition } from "./work-registry";
export {
  WORK_TYPE_REGISTRY,
  getWorkTypeDefinition,
  getAllWorkTypeDefinitions,
  getWorkTypesWithArtifacts,
  getWorkTypesRequiringApproval,
}                                  from "./work-registry";

// Audit
export type {
  WorkValidationIssue,
  WorkValidationReport,
  WorkDomainAuditReport,
}                                  from "./work-audit";
export {
  validateWorkItem,
  validateWorkExecution,
  validateWorkArtifact,
  auditWorkDomain,
}                                  from "./work-audit";

// Executor
export { executeWork }             from "./work-executor";
