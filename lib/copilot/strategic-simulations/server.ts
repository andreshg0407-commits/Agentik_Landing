// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 34 — Server barrel
// Import "server-only" ensures this is never bundled in client code.

import "server-only";

// ── Core types ────────────────────────────────────────────────────────────────
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

// ── Identity ──────────────────────────────────────────────────────────────────
export {
  generateSimId,
  generateScenarioId,
  generateOutcomeId,
  generateComparisonId,
  generateAssumptionId,
  generateConstraintId,
  generateVariableId,
  generateImpactId,
  generateSimRiskId,
  generateSimOppId,
  generateSimRecId,
  generateNarrativeId,
} from "./strategic-simulation-identity";

// ── Assumption engine ─────────────────────────────────────────────────────────
export {
  buildAssumption,
  validateAssumption,
  scoreAssumption,
  rankAssumptions,
  aggregateAssumptionConfidence,
  getKeyAssumptions,
  buildDefaultAssumptions,
} from "./assumption-engine";
export type { AssumptionValidationResult } from "./assumption-engine";

// ── Constraint engine ─────────────────────────────────────────────────────────
export {
  buildConstraint,
  validateConstraint,
  validateConstraints,
  applyConstraint,
  hasHardViolations,
  buildDefaultConstraints,
} from "./constraint-engine";
export type { ConstraintValidationResult, ConstraintApplicationResult } from "./constraint-engine";

// ── Variable engine ───────────────────────────────────────────────────────────
export {
  registerVariable,
  updateVariable,
  applyVariantToVariable,
  validateVariable,
  getHighSensitivityVariables,
  getControllableVariables,
  computeVariableRange,
  buildDefaultVariables,
} from "./variable-engine";
export type { VariableValidationResult } from "./variable-engine";

// ── Impact engine ─────────────────────────────────────────────────────────────
export {
  calculateImpact,
  calculateBusinessImpact,
  calculateStrategicImpact,
  aggregateImpactScore,
} from "./impact-engine";
export type { ImpactCalculationInput } from "./impact-engine";

// ── Risk projection ───────────────────────────────────────────────────────────
export {
  projectRisks,
  rankProjectedRisks,
  aggregateRiskScore,
  getOverallRiskLevel,
} from "./risk-projection-engine";

// ── Opportunity projection ────────────────────────────────────────────────────
export {
  projectOpportunities,
  rankProjectedOpportunities,
  aggregateOpportunityScore,
} from "./opportunity-projection-engine";

// ── Scenario builder ──────────────────────────────────────────────────────────
export {
  buildScenario,
  cloneScenario,
  validateScenario,
  scoreScenario,
} from "./scenario-builder";
export type { ScenarioValidationResult } from "./scenario-builder";

// ── Main simulation engine ────────────────────────────────────────────────────
export {
  runSimulation,
  enforceSimulationTenantBoundary,
} from "./strategic-simulation-engine";
export type { StrategicSimulationEngineInput } from "./strategic-simulation-engine";

// ── Comparison engine ─────────────────────────────────────────────────────────
export {
  compareScenarios,
  rankScenarios,
  buildComparison,
} from "./scenario-comparison-engine";

// ── Recommendation engine ─────────────────────────────────────────────────────
export {
  generateSimulationRecommendations,
} from "./simulation-recommendation-engine";
export type { SimulationRecommendationInput } from "./simulation-recommendation-engine";

// ── Narrative engine ──────────────────────────────────────────────────────────
export {
  buildSimulationNarrative,
} from "./simulation-narrative-engine";
export type { NarrativeInput } from "./simulation-narrative-engine";

// ── Advisor bridge ────────────────────────────────────────────────────────────
export {
  convertSimulationToAdvisory,
} from "./simulation-advisor-engine";
export type { SimulationAdvisoryOutput } from "./simulation-advisor-engine";

// ── Query ─────────────────────────────────────────────────────────────────────
export {
  filterSimulationRecords,
  sortSimulationRecordsByDate,
  groupSimulationRecordsByCategory,
  groupSimulationRecordsByDomain,
} from "./strategic-simulation-query";

// ── Repository ────────────────────────────────────────────────────────────────
export {
  InMemorySimulationRepository,
  buildSimulationRecord,
} from "./strategic-simulation-repository";
export type { StrategicSimulationRepository } from "./strategic-simulation-repository";

// ── Prisma repository ─────────────────────────────────────────────────────────
export { PrismaStrategicSimulationRepository } from "./persistence/prisma-strategic-simulation-repository";

// ── Dashboard contract ────────────────────────────────────────────────────────
export {
  buildSimulationDashboard,
  buildEmptySimulationDashboard,
  buildSimulationSummaryCard,
} from "./strategic-simulation-dashboard-contract";
export type {
  SimulationDashboardContract,
  SimulationDashboardStatus,
} from "./strategic-simulation-dashboard-contract";

// ── Health ────────────────────────────────────────────────────────────────────
export {
  checkSimulationHealth,
  isSimulationHealthy,
} from "./strategic-simulation-health";
export type { SimulationHealthReport, SimulationHealthStatus } from "./strategic-simulation-health";

// ── Readiness ─────────────────────────────────────────────────────────────────
export {
  checkSimulationReadiness,
  isSimulationReady,
  buildSimulationReadinessFromFlags,
} from "./strategic-simulation-readiness";
export type { SimulationReadinessResult, SimulationReadinessInput } from "./strategic-simulation-readiness";

// ── Canonical simulations ─────────────────────────────────────────────────────
export {
  buildCanonicalSimulation,
  buildAllCanonicalSimulations,
  getCanonicalSimulationByType,
  CANONICAL_SIMULATION_TYPES,
} from "./strategic-simulation-canonical";

// ── Integrations ──────────────────────────────────────────────────────────────
export {
  buildAssumptionsFromMemory,
  buildConstraintsFromMemory,
  extractSimulationGoalContext,
} from "./integrations/simulation-strategic-memory";

export {
  buildSimulationLearningContext,
  buildAssumptionsFromLearning,
} from "./integrations/simulation-learning";
export type { SimulationLearningContext } from "./integrations/simulation-learning";

export {
  buildSimulationGraphContext,
  getSimulationGraphConfidenceBoost,
} from "./integrations/simulation-memory-graph";
export type { SimulationGraphContext } from "./integrations/simulation-memory-graph";

export {
  buildConstraintsFromExecutivePriorities,
  buildAssumptionsFromExecutiveRisks,
  getExecutiveBrainSimulationBoost,
} from "./integrations/simulation-executive-brain";

export {
  buildSimulationRisksFromSignals,
  getSignalDensityBoost,
} from "./integrations/simulation-cross-module";

export {
  buildSimulationRecommendationsFromPlaybooks,
  getActivePlaybooksForDomain,
} from "./integrations/simulation-playbooks";

export {
  buildSimulationAdvisorFeedback,
  computeSimulationEnrichedScore,
} from "./integrations/simulation-advisor-integration";
export type { SimulationAdvisorFeedback } from "./integrations/simulation-advisor-integration";

export {
  buildSimulationAuditEvent,
  auditSimulationStarted,
  auditSimulationCompleted,
  auditSimulationFailed,
  auditTenantBoundaryViolation,
} from "./integrations/simulation-audit";
export type {
  SimulationAuditEventType,
  SimulationAuditEvent,
} from "./integrations/simulation-audit";

export {
  evaluateSimulationComplianceGate,
  assertAllRecommendationsSuggestedOnly,
} from "./integrations/simulation-compliance";
export type { SimulationComplianceResult } from "./integrations/simulation-compliance";

export {
  buildSimulationSecurityContext,
  assertSimulationTenantIsolation,
  sanitizeSimulationOutput,
} from "./integrations/simulation-security";
export type { SimulationSecurityContext } from "./integrations/simulation-security";
