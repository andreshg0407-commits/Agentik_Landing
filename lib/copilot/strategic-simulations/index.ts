// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 35 — Client-safe index barrel
// NO "server-only" import. Safe for client components.

// ── Pure domain types ─────────────────────────────────────────────────────────
export type {
  SimulationConfidence,
  SimulationStatus,
  SimulationCategory,
  SimulationScenarioVariant,
  SimulationImpactLevel,
  SimulationRiskLevel,
  SimulationHorizon,
  SimulationScenarioType,
  SimulationAssumption,
  SimulationConstraint,
  SimulationVariable,
  SimulationImpact,
  SimulationRisk,
  SimulationOpportunity,
  SimulationRecommendation,
  SimulationNarrative,
  SimulationScenario,
  SimulationOutcome,
  SimulationComparison,
  SimulationInput,
  SimulationResult,
  SimulationQuery,
  SimulationRecord,
} from "./strategic-simulation-types";

export {
  simulationConfidenceFromScore,
  simulationRiskLevelFromScore,
  simulationImpactLevelFromScore,
  SIMULATION_CONFIDENCES,
  SIMULATION_STATUSES,
  SIMULATION_CATEGORIES,
  SIMULATION_SCENARIO_VARIANTS,
  SIMULATION_SCENARIO_TYPES,
  SIMULATION_PRIORITY_RANK,
} from "./strategic-simulation-types";

// ── Dashboard contract (client-safe) ──────────────────────────────────────────
export {
  buildEmptySimulationDashboard,
  buildSimulationSummaryCard,
} from "./strategic-simulation-dashboard-contract";
export type {
  SimulationDashboardContract,
  SimulationDashboardStatus,
} from "./strategic-simulation-dashboard-contract";

// ── Health & readiness types (client-safe) ────────────────────────────────────
export type { SimulationHealthReport, SimulationHealthStatus } from "./strategic-simulation-health";
export type { SimulationReadinessResult, SimulationReadinessInput } from "./strategic-simulation-readiness";

// ── Audit types (client-safe) ─────────────────────────────────────────────────
export type { SimulationAuditEventType, SimulationAuditEvent } from "./integrations/simulation-audit";

// ── Compliance types (client-safe) ────────────────────────────────────────────
export type { SimulationComplianceResult } from "./integrations/simulation-compliance";

// ── Security types (client-safe) ──────────────────────────────────────────────
export type { SimulationSecurityContext } from "./integrations/simulation-security";

// ── Canonical simulation type list (client-safe) ──────────────────────────────
export { CANONICAL_SIMULATION_TYPES } from "./strategic-simulation-canonical";

// ── Advisory output types (client-safe) ──────────────────────────────────────
export type { SimulationAdvisoryOutput } from "./simulation-advisor-engine";
