/**
 * lib/agent-planning/index.ts
 *
 * Agentik Runtime Planning — Public API barrel
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

// Types
export type {
  PlanStatus,
  PlanStepStatus,
  ReadinessStatus,
  DependencyType,
  ConflictType,
  PlanStep,
  PlanDependency,
  PlanBlocker,
  PlanConflict,
  OperationalPlan,
  DependencyNode,
  DependencyGraph,
  PlansSummary,
  PlansReport,
} from "./planning-types";
export { planId, stepId, depId, blkId, cnfId } from "./planning-types";

// Dependency graph
export {
  buildDependencyGraph,
  getRootActions,
  getBlockedActions,
  getReadyActions,
  getDependencyChain,
  detectOrphanDependencies,
} from "./dependency-graph";

// Readiness engine
export type {
  ActionReadinessResult,
  StepReadinessResult,
  ReadinessSummary,
} from "./readiness-engine";
export {
  evaluateActionReadiness,
  evaluatePlanStepReadiness,
  summarizeReadiness,
} from "./readiness-engine";

// Conflict engine
export {
  detectCyclicDependencies,
  detectConflictingActions,
  detectStaleDependencies,
  detectMissingOwners,
  detectUnresolvedDelegationBlockers,
  detectCrossModuleConflicts,
  detectDuplicatedPlans,
  detectAllConflicts,
} from "./conflict-engine";

// Plan explainer
export type { PlanExplanation } from "./plan-explainer";
export {
  explainPlanOrigin,
  explainPlanBlockers,
  explainNextStep,
  explainResponsibleAgent,
  explainUnblockPath,
  explainPlan,
  explainStep,
} from "./plan-explainer";

// Planning engine
export {
  buildPlanFromAction,
  buildOperationalPlans,
  prioritizePlans,
  summarizePlanState,
  buildPlansReport,
} from "./planning-engine";
