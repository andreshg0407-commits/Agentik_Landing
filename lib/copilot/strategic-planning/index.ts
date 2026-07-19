// AGENTIK-STRATEGIC-PLANNING-01 — Phase 34: Client-Safe Barrel
// NO server-only imports. Safe for client components.

// Types only
export type {
  StrategicPlan,
  StrategicObjective,
  StrategicInitiative,
  StrategicMilestone,
  StrategicDependency,
  StrategicRisk,
  StrategicOpportunity,
  StrategicRoadmap,
  StrategicExecutionCandidate,
  StrategicPlanningContext,
  StrategicPlanningResult,
  StrategicPlanSnapshot,
  PlanningPriority,
  PlanningStatus,
  PlanningHorizon,
  PlanningConfidence,
  CanonicalPlanType,
  InitiativeType,
  DependencyType,
  StrategicDomain,
} from "./strategic-planning-types";

export {
  PLANNING_PRIORITIES,
  PLANNING_STATUSES,
  PLANNING_HORIZONS,
  PLANNING_CONFIDENCES,
  CANONICAL_PLAN_TYPES,
  PLANNING_PRIORITY_RANK,
  PLANNING_CONFIDENCE_SCORE,
} from "./strategic-planning-types";

// Client-safe dashboard contract
export {
  buildEmptyStrategicPlanningDashboard,
  buildStrategicPlanSummaryCard,
} from "./strategic-planning-dashboard-contract";

export type {
  StrategicPlanningDashboard,
  StrategicPlanSummaryCard,
} from "./strategic-planning-dashboard-contract";

// Client-safe health types
export type {
  PlanningHealthStatus,
  PlanningHealthReport,
} from "./strategic-planning-health";

// Client-safe readiness types
export type {
  PlanningReadinessReport,
  PlanningReadinessFlags,
  PlanningReadinessRequirement,
} from "./strategic-planning-readiness";

// Canonical plan types (client-safe — no Prisma)
export { CANONICAL_PLANNING_SCENARIOS } from "./strategic-planning-canonical";
export type { CanonicalPlanningScenario } from "./strategic-planning-canonical";
