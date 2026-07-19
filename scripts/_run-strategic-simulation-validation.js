#!/usr/bin/env node
// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 38 — Structural Validation Suite
// Pure fs + regex — no server-only imports.

const fs   = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function read(rel) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8");
}

function exists(rel) { return fs.existsSync(path.join(BASE, rel)); }
function contains(content, str) { return content.includes(str); }

// ── Section 1: File existence ─────────────────────────────────────────────────
console.log("\n[1] File Existence");
const files = [
  "lib/copilot/strategic-simulations/strategic-simulation-types.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-identity.ts",
  "lib/copilot/strategic-simulations/assumption-engine.ts",
  "lib/copilot/strategic-simulations/constraint-engine.ts",
  "lib/copilot/strategic-simulations/variable-engine.ts",
  "lib/copilot/strategic-simulations/impact-engine.ts",
  "lib/copilot/strategic-simulations/risk-projection-engine.ts",
  "lib/copilot/strategic-simulations/opportunity-projection-engine.ts",
  "lib/copilot/strategic-simulations/scenario-builder.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-engine.ts",
  "lib/copilot/strategic-simulations/scenario-comparison-engine.ts",
  "lib/copilot/strategic-simulations/simulation-recommendation-engine.ts",
  "lib/copilot/strategic-simulations/simulation-narrative-engine.ts",
  "lib/copilot/strategic-simulations/simulation-advisor-engine.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-query.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-repository.ts",
  "lib/copilot/strategic-simulations/persistence/prisma-strategic-simulation-repository.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-dashboard-contract.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-health.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-readiness.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-canonical.ts",
  "lib/copilot/strategic-simulations/server.ts",
  "lib/copilot/strategic-simulations/index.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-strategic-memory.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-learning.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-memory-graph.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-executive-brain.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-cross-module.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-playbooks.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-advisor-integration.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-audit.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-compliance.ts",
  "lib/copilot/strategic-simulations/integrations/simulation-security.ts",
  "app/api/internal/integration-tests/strategic-simulations/route.ts",
  "scripts/_run-strategic-simulation-validation.js",
  "prisma/migrations/20260609000000_strategic_simulations/migration.sql",
];
for (const f of files) check(`exists: ${f}`, exists(f));

// ── Section 2: Types ──────────────────────────────────────────────────────────
console.log("\n[2] Type Definitions");
const types = read("lib/copilot/strategic-simulations/strategic-simulation-types.ts");
check("types: SimulationConfidence defined", contains(types, "SimulationConfidence"));
check("types: SimulationStatus defined", contains(types, "SimulationStatus"));
check("types: SimulationCategory defined", contains(types, "SimulationCategory"));
check("types: SimulationScenarioVariant defined", contains(types, "SimulationScenarioVariant"));
check("types: SimulationImpactLevel defined", contains(types, "SimulationImpactLevel"));
check("types: SimulationRiskLevel defined", contains(types, "SimulationRiskLevel"));
check("types: SimulationHorizon defined", contains(types, "SimulationHorizon"));
check("types: SimulationScenarioType defined", contains(types, "SimulationScenarioType"));
check("types: SimulationAssumption interface", contains(types, "interface SimulationAssumption"));
check("types: SimulationConstraint interface", contains(types, "interface SimulationConstraint"));
check("types: SimulationVariable interface", contains(types, "interface SimulationVariable"));
check("types: SimulationImpact interface", contains(types, "interface SimulationImpact"));
check("types: SimulationRisk interface", contains(types, "interface SimulationRisk"));
check("types: SimulationOpportunity interface", contains(types, "interface SimulationOpportunity"));
check("types: SimulationRecommendation interface", contains(types, "interface SimulationRecommendation"));
check("types: SimulationNarrative interface", contains(types, "interface SimulationNarrative"));
check("types: SimulationScenario interface", contains(types, "interface SimulationScenario"));
check("types: SimulationOutcome interface", contains(types, "interface SimulationOutcome"));
check("types: SimulationComparison interface", contains(types, "interface SimulationComparison"));
check("types: SimulationInput interface", contains(types, "interface SimulationInput"));
check("types: SimulationResult interface", contains(types, "interface SimulationResult"));
check("types: SimulationQuery interface", contains(types, "interface SimulationQuery"));
check("types: SimulationRecord interface", contains(types, "interface SimulationRecord"));
check("types: suggestedOnly: true hardcoded in rec", contains(types, "suggestedOnly: true"));
check("types: 15 scenario types declared", contains(types, "CASH_FLOW_SQUEEZE") && contains(types, "DIGITAL_TRANSFORMATION"));
check("types: simulationConfidenceFromScore exported", contains(types, "export function simulationConfidenceFromScore"));
check("types: simulationRiskLevelFromScore exported", contains(types, "export function simulationRiskLevelFromScore"));
check("types: simulationImpactLevelFromScore exported", contains(types, "export function simulationImpactLevelFromScore"));
check("types: no Date objects (pure serializable)", !contains(types, ": Date;"));
check("types: no class instances", !contains(types, "new Date"));

// ── Section 3: Identity ───────────────────────────────────────────────────────
console.log("\n[3] Identity");
const identity = read("lib/copilot/strategic-simulations/strategic-simulation-identity.ts");
check("identity: sim_ prefix", contains(identity, "sim_${_next()}"));
check("identity: scenario_ prefix", contains(identity, "scenario_${_next()}"));
check("identity: outcome_ prefix", contains(identity, "outcome_${_next()}"));
check("identity: comparison_ prefix", contains(identity, "comparison_${_next()}"));
check("identity: assump_ prefix", contains(identity, "assump_${_next()}"));
check("identity: constr_ prefix", contains(identity, "constr_${_next()}"));
check("identity: var_ prefix", contains(identity, "var_${_next()}"));
check("identity: impact_ prefix", contains(identity, "impact_${_next()}"));
check("identity: simrisk_ prefix", contains(identity, "simrisk_${_next()}"));
check("identity: simopp_ prefix", contains(identity, "simopp_${_next()}"));
check("identity: simrec_ prefix", contains(identity, "simrec_${_next()}"));
check("identity: narr_ prefix", contains(identity, "narr_${_next()}"));
check("identity: counter rollover", contains(identity, "% 99999"));

// ── Section 4: Assumption engine ──────────────────────────────────────────────
console.log("\n[4] Assumption Engine");
const assumption = read("lib/copilot/strategic-simulations/assumption-engine.ts");
check("assumption: buildAssumption exported", contains(assumption, "export function buildAssumption"));
check("assumption: validateAssumption exported", contains(assumption, "export function validateAssumption"));
check("assumption: scoreAssumption exported", contains(assumption, "export function scoreAssumption"));
check("assumption: rankAssumptions exported", contains(assumption, "export function rankAssumptions"));
check("assumption: aggregateAssumptionConfidence exported", contains(assumption, "export function aggregateAssumptionConfidence"));
check("assumption: getKeyAssumptions exported", contains(assumption, "export function getKeyAssumptions"));
check("assumption: buildDefaultAssumptions exported", contains(assumption, "export function buildDefaultAssumptions"));
check("assumption: key assumption prioritized in rank", contains(assumption, "isKeyAssumption"));
check("assumption: confidence from score", contains(assumption, "simulationConfidenceFromScore"));

// ── Section 5: Constraint engine ──────────────────────────────────────────────
console.log("\n[5] Constraint Engine");
const constraint = read("lib/copilot/strategic-simulations/constraint-engine.ts");
check("constraint: buildConstraint exported", contains(constraint, "export function buildConstraint"));
check("constraint: validateConstraint exported", contains(constraint, "export function validateConstraint"));
check("constraint: validateConstraints exported", contains(constraint, "export function validateConstraints"));
check("constraint: applyConstraint exported", contains(constraint, "export function applyConstraint"));
check("constraint: hasHardViolations exported", contains(constraint, "export function hasHardViolations"));
check("constraint: HARD vs SOFT distinction", contains(constraint, '"HARD"') && contains(constraint, '"SOFT"'));
check("constraint: violation detection", contains(constraint, "isViolated"));

// ── Section 6: Variable engine ────────────────────────────────────────────────
console.log("\n[6] Variable Engine");
const variable = read("lib/copilot/strategic-simulations/variable-engine.ts");
check("variable: registerVariable exported", contains(variable, "export function registerVariable"));
check("variable: updateVariable exported", contains(variable, "export function updateVariable"));
check("variable: applyVariantToVariable exported", contains(variable, "export function applyVariantToVariable"));
check("variable: validateVariable exported", contains(variable, "export function validateVariable"));
check("variable: getHighSensitivityVariables exported", contains(variable, "export function getHighSensitivityVariables"));
check("variable: getControllableVariables exported", contains(variable, "export function getControllableVariables"));
check("variable: baseline/optimistic/pessimistic/conservative values", contains(variable, "baselineValue") && contains(variable, "optimisticValue") && contains(variable, "pessimisticValue"));
check("variable: sensitivity levels", contains(variable, '"HIGH"') && contains(variable, '"MEDIUM"') && contains(variable, '"LOW"'));

// ── Section 7: Impact engine ──────────────────────────────────────────────────
console.log("\n[7] Impact Engine");
const impact = read("lib/copilot/strategic-simulations/impact-engine.ts");
check("impact: calculateImpact exported", contains(impact, "export function calculateImpact"));
check("impact: calculateBusinessImpact exported", contains(impact, "export function calculateBusinessImpact"));
check("impact: calculateStrategicImpact exported", contains(impact, "export function calculateStrategicImpact"));
check("impact: aggregateImpactScore exported", contains(impact, "export function aggregateImpactScore"));
check("impact: uses variant to compute scores", contains(impact, "variant"));
check("impact: generates impact_ prefixed IDs", contains(impact, "generateImpactId"));

// ── Section 8: Risk projection ────────────────────────────────────────────────
console.log("\n[8] Risk Projection");
const risk = read("lib/copilot/strategic-simulations/risk-projection-engine.ts");
check("risk: projectRisks exported", contains(risk, "export function projectRisks"));
check("risk: rankProjectedRisks exported", contains(risk, "export function rankProjectedRisks"));
check("risk: aggregateRiskScore exported", contains(risk, "export function aggregateRiskScore"));
check("risk: getOverallRiskLevel exported", contains(risk, "export function getOverallRiskLevel"));
check("risk: uses compositeRisk", contains(risk, "compositeRisk"));
check("risk: generates simrisk_ IDs", contains(risk, "generateSimRiskId"));
check("risk: violated constraints generate risk", contains(risk, "isViolated"));

// ── Section 9: Opportunity projection ────────────────────────────────────────
console.log("\n[9] Opportunity Projection");
const opp = read("lib/copilot/strategic-simulations/opportunity-projection-engine.ts");
check("opp: projectOpportunities exported", contains(opp, "export function projectOpportunities"));
check("opp: rankProjectedOpportunities exported", contains(opp, "export function rankProjectedOpportunities"));
check("opp: aggregateOpportunityScore exported", contains(opp, "export function aggregateOpportunityScore"));
check("opp: generates simopp_ IDs", contains(opp, "generateSimOppId"));
check("opp: magnitude levels", contains(opp, "TRANSFORMATIONAL") && contains(opp, "LARGE"));
check("opp: captureScore computed", contains(opp, "captureScore"));

// ── Section 10: Scenario builder ──────────────────────────────────────────────
console.log("\n[10] Scenario Builder");
const scenario = read("lib/copilot/strategic-simulations/scenario-builder.ts");
check("scenario: buildScenario exported", contains(scenario, "export function buildScenario"));
check("scenario: cloneScenario exported", contains(scenario, "export function cloneScenario"));
check("scenario: validateScenario exported", contains(scenario, "export function validateScenario"));
check("scenario: scoreScenario exported", contains(scenario, "export function scoreScenario"));
check("scenario: generates scenario_ IDs", contains(scenario, "generateScenarioId"));
check("scenario: uses aggregateAssumptionConfidence", contains(scenario, "aggregateAssumptionConfidence"));
check("scenario: uses aggregateRiskScore", contains(scenario, "aggregateRiskScore"));
check("scenario: sets simulatedAt ISO", contains(scenario, "new Date().toISOString()"));

// ── Section 11: Simulation engine ─────────────────────────────────────────────
console.log("\n[11] Simulation Engine");
const engine = read("lib/copilot/strategic-simulations/strategic-simulation-engine.ts");
check("engine: runSimulation exported", contains(engine, "export function runSimulation"));
check("engine: enforceSimulationTenantBoundary exported", contains(engine, "export function enforceSimulationTenantBoundary"));
check("engine: status FAILED on catch", contains(engine, '"FAILED"'));
check("engine: status COMPLETED on success", contains(engine, '"COMPLETED"'));
check("engine: limitations declared", contains(engine, "limitations"));
check("engine: warnings collected", contains(engine, "warnings"));
check("engine: fail-closed try/catch", contains(engine, "try {") && contains(engine, "} catch"));
check("engine: tenant boundary check on orgSlug", contains(engine, "orgSlug.trim().length === 0"));
check("engine: returns runId with sim_ prefix", contains(engine, "generateSimId"));

// ── Section 12: Comparison engine ─────────────────────────────────────────────
console.log("\n[12] Comparison Engine");
const comparison = read("lib/copilot/strategic-simulations/scenario-comparison-engine.ts");
check("comparison: compareScenarios exported", contains(comparison, "export function compareScenarios"));
check("comparison: rankScenarios exported", contains(comparison, "export function rankScenarios"));
check("comparison: buildComparison exported", contains(comparison, "export function buildComparison"));
check("comparison: generates comparison_ IDs", contains(comparison, "generateComparisonId"));
check("comparison: winner can be null", contains(comparison, "null"));
check("comparison: tradeoffs built", contains(comparison, "tradeoffs"));

// ── Section 13: Recommendation engine ────────────────────────────────────────
console.log("\n[13] Recommendation Engine");
const rec = read("lib/copilot/strategic-simulations/simulation-recommendation-engine.ts");
check("rec: generateSimulationRecommendations exported", contains(rec, "export function generateSimulationRecommendations"));
check("rec: suggestedOnly: true hardcoded", contains(rec, "suggestedOnly:   true"));
check("rec: generates simrec_ IDs", contains(rec, "generateSimRecId"));
check("rec: de-duplicates recommendations", contains(rec, "seen.has"));
check("rec: sorted by priority", contains(rec, "SIMULATION_PRIORITY_RANK"));

// ── Section 14: Narrative engine ──────────────────────────────────────────────
console.log("\n[14] Narrative Engine");
const narrative = read("lib/copilot/strategic-simulations/simulation-narrative-engine.ts");
check("narrative: buildSimulationNarrative exported", contains(narrative, "export function buildSimulationNarrative"));
check("narrative: generates narr_ IDs", contains(narrative, "generateNarrativeId"));
check("narrative: limitations declared", contains(narrative, "limitations"));
check("narrative: no absolute claims marker", contains(narrative, "hipotético") || contains(narrative, "hipotética"));
check("narrative: executive summary built", contains(narrative, "_buildExecutive"));
check("narrative: key caution built", contains(narrative, "_buildKeyCaution"));
check("narrative: key strength built", contains(narrative, "_buildKeyStrength"));

// ── Section 15: Advisor bridge ────────────────────────────────────────────────
console.log("\n[15] Advisor Bridge");
const bridge = read("lib/copilot/strategic-simulations/simulation-advisor-engine.ts");
check("bridge: convertSimulationToAdvisory exported", contains(bridge, "export function convertSimulationToAdvisory"));
check("bridge: suggestedOnly: true as const", contains(bridge, "suggestedOnly:   true as const"));
check("bridge: generates sa_ IDs via generateSaId", contains(bridge, "generateSaId"));
check("bridge: converts risks to concerns", contains(bridge, "_extractConcerns"));
check("bridge: converts opps to opportunities", contains(bridge, "_extractOpportunities"));

// ── Section 16: Integrations ──────────────────────────────────────────────────
console.log("\n[16] Integrations");
const stratMem = read("lib/copilot/strategic-simulations/integrations/simulation-strategic-memory.ts");
check("integration: strategic memory builds assumptions from memory", contains(stratMem, "buildAssumptionsFromMemory"));
check("integration: strategic memory builds constraints from memory", contains(stratMem, "buildConstraintsFromMemory"));

const learning = read("lib/copilot/strategic-simulations/integrations/simulation-learning.ts");
check("integration: learning uses REINFORCED status", contains(learning, '"REINFORCED"'));
check("integration: learning uses result field", contains(learning, "o.result"));
check("integration: learning not CONFIRMED", !contains(learning, '"CONFIRMED"'));

const graph = read("lib/copilot/strategic-simulations/integrations/simulation-memory-graph.ts");
check("integration: graph uses sourceNodeId", contains(graph, "sourceNodeId"));
check("integration: graph uses targetNodeId", contains(graph, "targetNodeId"));

const execBrain = read("lib/copilot/strategic-simulations/integrations/simulation-executive-brain.ts");
check("integration: executive brain builds constraints", contains(execBrain, "buildConstraintsFromExecutivePriorities"));
check("integration: executive brain builds assumptions", contains(execBrain, "buildAssumptionsFromExecutiveRisks"));

const crossModule = read("lib/copilot/strategic-simulations/integrations/simulation-cross-module.ts");
check("integration: cross-module uses s.label not s.title", contains(crossModule, "s.label"));

const playbooks = read("lib/copilot/strategic-simulations/integrations/simulation-playbooks.ts");
check("integration: playbooks uses p.title not p.name", contains(playbooks, "p.title"));
check("integration: playbooks suggestedOnly: true", contains(playbooks, "suggestedOnly:   true as const"));

const audit = read("lib/copilot/strategic-simulations/integrations/simulation-audit.ts");
check("integration: audit SIMULATION_STARTED", contains(audit, '"SIMULATION_STARTED"'));
check("integration: audit SIMULATION_COMPLETED", contains(audit, '"SIMULATION_COMPLETED"'));
check("integration: audit SIMULATION_FAILED", contains(audit, '"SIMULATION_FAILED"'));
check("integration: audit TENANT_BOUNDARY_VIOLATION", contains(audit, '"TENANT_BOUNDARY_VIOLATION"'));

const compliance = read("lib/copilot/strategic-simulations/integrations/simulation-compliance.ts");
check("integration: compliance checks suggestedOnly", contains(compliance, "suggestedOnly"));
check("integration: compliance checks tenant boundary", contains(compliance, "orgSlug !== orgSlug"));

// ── Section 17: Persistence ───────────────────────────────────────────────────
console.log("\n[17] Persistence");
const prismaRepo = read("lib/copilot/strategic-simulations/persistence/prisma-strategic-simulation-repository.ts");
check("prisma: uses (prisma as any) pattern", contains(prismaRepo, "(prisma as any)"));
check("prisma: strategicSimulationRecord model", contains(prismaRepo, "strategicSimulationRecord"));
check("prisma: upsert for save", contains(prismaRepo, ".upsert("));
check("prisma: tenant-scoped queries", contains(prismaRepo, "orgSlug"));

// ── Section 18: Prisma schema ─────────────────────────────────────────────────
console.log("\n[18] Prisma Schema");
const schema = read("prisma/schema.prisma");
check("schema: StrategicSimulationRecord model", contains(schema, "model StrategicSimulationRecord"));
check("schema: SimulationScenarioRecord model", contains(schema, "model SimulationScenarioRecord"));
check("schema: SimulationComparisonRecord model", contains(schema, "model SimulationComparisonRecord"));
check("schema: SimulationRecommendationRecord model", contains(schema, "model SimulationRecommendationRecord"));
check("schema: SimulationAuditRecord model", contains(schema, "model SimulationAuditRecord"));
check("schema: suggestedOnly Boolean default true", contains(schema, "suggestedOnly    Boolean  @default(true)"));
check("schema: orgSlug indexed", contains(schema, '@@index([orgSlug])'));

// ── Section 19: Migration SQL ─────────────────────────────────────────────────
console.log("\n[19] Migration SQL");
const migration = read("prisma/migrations/20260609000000_strategic_simulations/migration.sql");
check("migration: creates StrategicSimulationRecord", contains(migration, '"StrategicSimulationRecord"'));
check("migration: creates SimulationScenarioRecord", contains(migration, '"SimulationScenarioRecord"'));
check("migration: creates SimulationComparisonRecord", contains(migration, '"SimulationComparisonRecord"'));
check("migration: creates SimulationRecommendationRecord", contains(migration, '"SimulationRecommendationRecord"'));
check("migration: creates SimulationAuditRecord", contains(migration, '"SimulationAuditRecord"'));
check("migration: uses JSONB", contains(migration, "JSONB"));
check("migration: uses DOUBLE PRECISION", contains(migration, "DOUBLE PRECISION"));
check("migration: orgSlug indexes", contains(migration, "orgSlug_idx"));

// ── Section 20: Dashboard contract ────────────────────────────────────────────
console.log("\n[20] Dashboard Contract");
const dashboard = read("lib/copilot/strategic-simulations/strategic-simulation-dashboard-contract.ts");
check("dashboard: buildSimulationDashboard exported", contains(dashboard, "export function buildSimulationDashboard"));
check("dashboard: buildEmptySimulationDashboard exported", contains(dashboard, "export function buildEmptySimulationDashboard"));
check("dashboard: buildSimulationSummaryCard exported", contains(dashboard, "export function buildSimulationSummaryCard"));
check("dashboard: isEmpty field", contains(dashboard, "isEmpty"));
check("dashboard: status field", contains(dashboard, "SimulationDashboardStatus"));
check("dashboard: limitations in summary", contains(dashboard, "limitations"));

// ── Section 21: Health ────────────────────────────────────────────────────────
console.log("\n[21] Health");
const health = read("lib/copilot/strategic-simulations/strategic-simulation-health.ts");
check("health: checkSimulationHealth exported", contains(health, "export function checkSimulationHealth"));
check("health: isSimulationHealthy exported", contains(health, "export function isSimulationHealthy"));
check("health: HEALTHY status", contains(health, '"HEALTHY"'));
check("health: EMPTY status", contains(health, '"EMPTY"'));
check("health: DEGRADED status", contains(health, '"DEGRADED"'));
check("health: stale warning", contains(health, "staleDataWarning"));

// ── Section 22: Readiness ─────────────────────────────────────────────────────
console.log("\n[22] Readiness");
const readiness = read("lib/copilot/strategic-simulations/strategic-simulation-readiness.ts");
check("readiness: checkSimulationReadiness exported", contains(readiness, "export function checkSimulationReadiness"));
check("readiness: isSimulationReady exported", contains(readiness, "export function isSimulationReady"));
check("readiness: blockers array", contains(readiness, "blockers"));
check("readiness: score computed", contains(readiness, "score"));
check("readiness: orgSlug required blocker", contains(readiness, "orgSlug is required"));

// ── Section 23: Server barrel ─────────────────────────────────────────────────
console.log("\n[23] Server Barrel");
const server = read("lib/copilot/strategic-simulations/server.ts");
check("server: import server-only", contains(server, 'import "server-only"'));
check("server: exports runSimulation", contains(server, "runSimulation"));
check("server: exports enforceSimulationTenantBoundary", contains(server, "enforceSimulationTenantBoundary"));
check("server: exports PrismaStrategicSimulationRepository", contains(server, "PrismaStrategicSimulationRepository"));
check("server: exports buildCanonicalSimulation", contains(server, "buildCanonicalSimulation"));
check("server: exports audit functions", contains(server, "auditSimulationStarted"));
check("server: exports evaluateSimulationComplianceGate", contains(server, "evaluateSimulationComplianceGate"));

// ── Section 24: Client barrel ─────────────────────────────────────────────────
console.log("\n[24] Client Barrel");
const clientBarrel = read("lib/copilot/strategic-simulations/index.ts");
check("client: no server-only import", !contains(clientBarrel, 'import "server-only"'));
check("client: exports SimulationResult type", contains(clientBarrel, "SimulationResult"));
check("client: exports buildEmptySimulationDashboard", contains(clientBarrel, "buildEmptySimulationDashboard"));
check("client: exports CANONICAL_SIMULATION_TYPES", contains(clientBarrel, "CANONICAL_SIMULATION_TYPES"));

// ── Section 25: Canonical simulations ────────────────────────────────────────
console.log("\n[25] Canonical Simulations");
const canonical = read("lib/copilot/strategic-simulations/strategic-simulation-canonical.ts");
check("canonical: 15 types in CANONICAL_SIMULATION_TYPES", contains(canonical, "CANONICAL_SIMULATION_TYPES"));
check("canonical: CASH_FLOW_SQUEEZE defined", contains(canonical, "CASH_FLOW_SQUEEZE"));
check("canonical: DIGITAL_TRANSFORMATION defined", contains(canonical, "DIGITAL_TRANSFORMATION"));
check("canonical: buildCanonicalSimulation exported", contains(canonical, "export function buildCanonicalSimulation"));
check("canonical: buildAllCanonicalSimulations exported", contains(canonical, "export function buildAllCanonicalSimulations"));
check("canonical: getCanonicalSimulationByType exported", contains(canonical, "export function getCanonicalSimulationByType"));
check("canonical: buildCanonicalSummary exported", contains(canonical, "export function buildCanonicalSummary"));
check("canonical: uses runSimulation (no server-only)", !contains(canonical, 'import "server-only"'));

// ── Section 26: Security registry ────────────────────────────────────────────
console.log("\n[26] Security Registry");
const secRegistry = read("lib/security/security-registry.ts");
check("security: STRATEGIC_SIMULATION_ENGINE entry", contains(secRegistry, '"STRATEGIC_SIMULATION_ENGINE"'));
check("security: SIMULATION_SCENARIO entry", contains(secRegistry, '"SIMULATION_SCENARIO"'));
check("security: SIMULATION_COMPARISON entry", contains(secRegistry, '"SIMULATION_COMPARISON"'));
check("security: SIMULATION_RECOMMENDATION entry", contains(secRegistry, '"SIMULATION_RECOMMENDATION"'));
check("security: SIMULATION_AUDIT entry", contains(secRegistry, '"SIMULATION_AUDIT"'));

// ── Section 27: Intelligence registry ────────────────────────────────────────
console.log("\n[27] Intelligence Registry");
const intRegistry = read("lib/copilot/copilot-intelligence-registry.ts");
check("intelligence: STRATEGIC_SIMULATIONS entry", contains(intRegistry, '"STRATEGIC_SIMULATIONS"'));
check("intelligence: depends on STRATEGIC_ADVISOR", contains(intRegistry, '"STRATEGIC_ADVISOR"'));
check("intelligence: hasDb: true", contains(intRegistry, "hasDb:        true"));
check("intelligence: status ACTIVE", contains(intRegistry, 'status:       "ACTIVE"'));

// ── Section 28: Integration harness ──────────────────────────────────────────
console.log("\n[28] Integration Harness");
const harness = read("app/api/internal/integration-tests/strategic-simulations/route.ts");
check("harness: ENABLE_INTERNAL_INTEGRATION_TESTS guard", contains(harness, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("harness: returns 200 on all pass", contains(harness, "200"));
check("harness: returns 422 on failures", contains(harness, "422"));
check("harness: verdict ALL_PASS", contains(harness, '"ALL_PASS"'));
check("harness: 20 test suites", [
  "testIdentity", "testTypes", "testAssumptionEngine", "testConstraintEngine",
  "testVariableEngine", "testImpactEngine", "testRiskProjection", "testOpportunityProjection",
  "testScenarioBuilder", "testSimulationEngine", "testComparisonEngine", "testRecommendationEngine",
  "testNarrativeEngine", "testAdvisorBridge", "testQueryEngine", "testRepository",
  "testDashboard", "testHealthReadiness", "testCanonicalSimulations", "testComplianceAudit",
].every((fn) => contains(harness, fn)));
check("harness: tenant isolation test", contains(harness, "Cross-tenant") || contains(harness, "OTHER"));
check("harness: suggestedOnly enforcement", contains(harness, "suggestedOnly"));

// ── Section 29: Architecture principles ──────────────────────────────────────
console.log("\n[29] Architecture Principles");
for (const file of [
  "lib/copilot/strategic-simulations/strategic-simulation-types.ts",
  "lib/copilot/strategic-simulations/assumption-engine.ts",
  "lib/copilot/strategic-simulations/strategic-simulation-canonical.ts",
]) {
  const content = read(file);
  check(`no server-only in: ${file.split("/").pop()}`, !contains(content, 'import "server-only"'));
}

check("engine: no Prisma import in main engine", !contains(
  read("lib/copilot/strategic-simulations/strategic-simulation-engine.ts"),
  'from "../../../../prisma"'
));
check("server barrel: has server-only import", contains(
  read("lib/copilot/strategic-simulations/server.ts"),
  'import "server-only"'
));

// All recommendation interfaces have suggestedOnly: true
const recFile = read("lib/copilot/strategic-simulations/strategic-simulation-types.ts");
check("types: SimulationRecommendation has suggestedOnly: true (literal)", contains(recFile, "readonly suggestedOnly: true"));

// ── Final report ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${"─".repeat(60)}`);
console.log(`RESULT: ${passed}/${total} checks passed (${failed} failed)`);
console.log(failed === 0 ? "✓ AGENTIK-STRATEGIC-SIMULATIONS-01 VALIDATION: ALL PASS" : "✗ SOME CHECKS FAILED");
process.exit(failed > 0 ? 1 : 0);
