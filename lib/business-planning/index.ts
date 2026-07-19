/**
 * index.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Client-safe barrel export for the Business Planning Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

// Planning Types
export type {
  PlanStatus,
  PlanSource,
  PlanPriority,
  PlanSeverity,
  PlanStrategy,
  PlanEntityRef,
  PlanCostType,
  PlanBenefitType,
  PlanStepType,
  PlanConstraintType,
  PlanDependencyType,
  PlanDependencyStatus,
  PlanApprovalType,
} from "./planning-types";
export {
  nextPlanId,
  PLAN_STATUSES,
  PLANNABLE_STATUSES,
  PLAN_STRATEGIES,
} from "./planning-types";

// Plan
export type { BusinessPlan, PlanTriggerRef } from "./plan";
export { buildBusinessPlan } from "./plan";

// Alternative
export type { PlanAlternative } from "./plan-alternative";
export { buildPlanAlternative } from "./plan-alternative";

// Step
export type { PlanStep } from "./plan-step";
export { buildPlanStep } from "./plan-step";

// Constraint
export type { PlanConstraint } from "./plan-constraint";
export { buildPlanConstraint } from "./plan-constraint";

// Dependency
export type { PlanDependency } from "./plan-dependency";
export { buildPlanDependency } from "./plan-dependency";

// Cost
export type { PlanCost } from "./plan-cost";
export { buildPlanCost } from "./plan-cost";

// Benefit
export type { PlanBenefit } from "./plan-benefit";
export { buildPlanBenefit } from "./plan-benefit";

// Risk
export type { PlanRisk } from "./plan-risk";
export { buildPlanRisk } from "./plan-risk";

// Approval
export type { PlanApprovalRequirement } from "./plan-approval";
export { buildPlanApproval } from "./plan-approval";

// Evaluation
export type {
  PlanEvaluationCriterion,
  CriterionScore,
  PlanEvaluation,
} from "./plan-evaluation";
export { buildPlanEvaluation, PLAN_EVALUATION_CRITERIA } from "./plan-evaluation";

// Context
export type { PlanningContext, PlanningEntitySnapshot } from "./plan-context";
export { buildPlanningContext } from "./plan-context";

// Engine
export type { IPlanningEngine } from "./planning-engine";
export { InMemoryPlanningEngine } from "./planning-engine";

// Registry
export type { PlanningStrategy } from "./planning-registry";
export {
  PlanningRegistry,
  removePortfolioSampleStrategy,
  reviewProductionStrategy,
  transferInventoryStrategy,
  contactVendorStrategy,
  contactCustomerStrategy,
  escalateStrategy,
  waitForProductionStrategy,
  reviewDataStrategy,
  doNothingStrategy,
  DEFAULT_STRATEGIES,
} from "./planning-registry";

// Utils
export {
  recommendedAlternative,
  rankedAlternatives,
  blockedAlternatives,
  feasibleAlternatives,
  usedStrategies,
  requiresApproval,
  totalStepCount,
  totalRiskCount,
  plansByStatus,
  plansBySeverity,
  sortPlansBySeverity,
  countPlansByStatus,
  planSummary,
  averageAlternativeConfidence,
} from "./planning-utils";
