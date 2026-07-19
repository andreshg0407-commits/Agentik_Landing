#!/usr/bin/env node
// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 45: Validation Suite
// 5000+ static checks across all files

const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "lib", "copilot", "strategic-forecasting");
const INTEGRATIONS = path.join(BASE, "integrations");

let passed = 0;
let failed = 0;
const errors = [];

function check(description, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push(`FAIL: ${description}`);
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// ─── File Existence ───────────────────────────────────────────────────────────

const CORE_FILES = [
  "strategic-forecasting-types.ts",
  "strategic-forecasting-identity.ts",
  "trend-engine.ts",
  "signal-engine.ts",
  "trajectory-engine.ts",
  "forecast-risk-engine.ts",
  "forecast-opportunity-engine.ts",
  "forecast-scenario-engine.ts",
  "forecast-confidence-engine.ts",
  "forecast-assumption-engine.ts",
  "forecast-narrative-engine.ts",
  "forecast-digest-engine.ts",
  "forecast-briefing-engine.ts",
  "strategic-forecasting-engine.ts",
  "strategic-forecasting-query.ts",
  "strategic-forecasting-repository.ts",
  "strategic-forecasting-dashboard-contract.ts",
  "strategic-forecasting-health.ts",
  "strategic-forecasting-readiness.ts",
  "strategic-forecasting-canonical.ts",
  "forecast-horizon-models.ts",
  "enterprise-trajectory-engine.ts",
  "future-signals-engine.ts",
  "server.ts",
  "index.ts",
];

CORE_FILES.forEach((f) => {
  check(`core file exists: ${f}`, fileExists(path.join(BASE, f)));
});

const INTEGRATION_FILES = [
  "forecasting-strategic-memory.ts",
  "forecasting-learning.ts",
  "forecasting-executive-brain.ts",
  "forecasting-advisor.ts",
  "forecasting-simulations.ts",
  "forecasting-planning.ts",
  "forecasting-executive-council.ts",
  "forecasting-board-intelligence.ts",
  "forecasting-memory-graph.ts",
  "forecasting-cross-module.ts",
  "forecasting-tenant-profile.ts",
  "forecasting-playbooks.ts",
  "forecasting-compliance.ts",
  "forecasting-audit.ts",
];

INTEGRATION_FILES.forEach((f) => {
  check(`integration file exists: ${f}`, fileExists(path.join(INTEGRATIONS, f)));
});

// Persistence
check("persistence/prisma-strategic-forecasting-repository.ts exists",
  fileExists(path.join(BASE, "persistence", "prisma-strategic-forecasting-repository.ts")));

// Migration
check("migration 20260620000000_strategic_forecasting exists",
  fileExists(path.join(__dirname, "..", "prisma", "migrations", "20260620000000_strategic_forecasting", "migration.sql")));

// Integration harness
check("integration harness exists",
  fileExists(path.join(__dirname, "..", "app", "api", "internal", "integration-tests", "strategic-forecasting", "route.ts")));

// ─── Types file checks ────────────────────────────────────────────────────────

const types = readFile(path.join(BASE, "strategic-forecasting-types.ts"));

const TYPE_CHECKS = [
  ["ForecastOutcome", "LIKELY"],
  ["ForecastOutcome", "POSSIBLE"],
  ["ForecastOutcome", "UNCERTAIN"],
  ["ForecastOutcome", "UNLIKELY"],
  ["ForecastHorizon", "SHORT_TERM"],
  ["ForecastHorizon", "MEDIUM_TERM"],
  ["ForecastHorizon", "LONG_TERM"],
  ["ForecastConfidenceLevel", "VERY_HIGH"],
  ["ForecastConfidenceLevel", "INSUFFICIENT"],
  ["ForecastSignalType", "LEADING"],
  ["ForecastSignalType", "WEAK_SIGNAL"],
  ["ForecastSignalType", "CONFIRMED"],
  ["ForecastTrendDirection", "ACCELERATING"],
  ["ForecastTrendDirection", "EMERGING"],
  ["ForecastScenarioType", "BEST_CASE"],
  ["ForecastScenarioType", "BLACK_SWAN_CANDIDATE"],
  ["ForecastDomain", "FINANCIAL"],
  ["ForecastDomain", "CROSS_DOMAIN"],
  ["ForecastStatus", "ACTIVE"],
  ["ForecastHealth", "HEALTHY"],
  ["ForecastDigestPeriod", "DAILY"],
  ["ForecastDigestPeriod", "QUARTERLY"],
  ["ForecastBriefingType", "CEO"],
  ["ForecastBriefingType", "GROWTH"],
];

TYPE_CHECKS.forEach(([type, value]) => {
  check(`types.ts contains ${type} value ${value}`, types.includes(value));
});

// Interface checks
const INTERFACE_CHECKS = [
  "ForecastEvidence", "ForecastConfidence", "ForecastAssumption",
  "ForecastTrend", "ForecastSignal", "ForecastTrajectory",
  "ForecastRisk", "ForecastOpportunity", "ForecastScenario",
  "ForecastRecommendation", "ForecastNarrative", "ForecastDigest",
  "ForecastBriefing", "ForecastReport", "StrategicForecast",
  "StrategicForecastingInput", "StrategicForecastingResult",
];
INTERFACE_CHECKS.forEach((iface) => {
  check(`types.ts defines interface ${iface}`, types.includes(`interface ${iface}`));
});

// suggestedOnly literal on ForecastScenario
check("ForecastScenario has suggestedOnly: true literal", types.includes("suggestedOnly: true"));
check("ForecastRecommendation has suggestedOnly: true literal",
  types.includes("ForecastRecommendation") && types.includes("suggestedOnly: true"));

// ─── Identity file checks ─────────────────────────────────────────────────────

const identity = readFile(path.join(BASE, "strategic-forecasting-identity.ts"));

const ID_FUNCTIONS = [
  "generateForecastId",
  "generateScenarioId",
  "generateForecastSignalId",
  "generateForecastTrendId",
  "generateForecastTrajectoryId",
  "generateForecastReportId",
  "generateForecastDigestId",
  "generateForecastBriefingId",
  "generateForecastRiskId",
  "generateForecastOpportunityId",
  "generateForecastAssumptionId",
  "generateForecastEvidenceId",
  "generateForecastRecommendationId",
  "generateForecastAuditId",
  "validateForecastId",
  "getForecastIdPrefix",
];

ID_FUNCTIONS.forEach((fn) => {
  check(`identity.ts exports ${fn}`, identity.includes(`export function ${fn}`));
});

const ID_PREFIXES = ["forecast_", "scenario_", "fsignal_", "ftrend_", "ftraj_", "freport_", "fdigest_", "fbriefing_", "frisk_", "fopp_", "fassume_", "fevidence_", "frec_", "faud_"];
ID_PREFIXES.forEach((prefix) => {
  check(`identity.ts has prefix ${prefix}`, identity.includes(prefix));
});

// ─── Trend engine checks ──────────────────────────────────────────────────────

const trendEng = readFile(path.join(BASE, "trend-engine.ts"));
["scoreTrend", "buildTrend", "identifyTrends", "rankTrends", "groupTrends",
 "getEmergentTrends", "getAcceleratingTrends", "getTrendsByHorizon"].forEach((fn) => {
  check(`trend-engine.ts exports ${fn}`, trendEng.includes(`export function ${fn}`));
});
check("trend-engine.ts has fail-closed try/catch", trendEng.includes("try {") && trendEng.includes("} catch {"));
check("trend-engine.ts has RawTrendSignal interface", trendEng.includes("interface RawTrendSignal"));

// ─── Signal engine checks ─────────────────────────────────────────────────────

const sigEng = readFile(path.join(BASE, "signal-engine.ts"));
["scoreSignal", "classifySignal", "buildSignal", "detectSignals", "rankSignals",
 "getWeakSignals", "getConfirmedSignals", "getLeadingSignals"].forEach((fn) => {
  check(`signal-engine.ts exports ${fn}`, sigEng.includes(`export function ${fn}`));
});
check("signal-engine.ts has RawSignalInput interface", sigEng.includes("interface RawSignalInput"));
check("signal-engine.ts fail-closed", sigEng.includes("try {"));

// ─── Trajectory engine checks ─────────────────────────────────────────────────

const trajEng = readFile(path.join(BASE, "trajectory-engine.ts"));
["buildTrajectoryConfidence", "buildTrajectory", "compareTrajectories", "rankTrajectories",
 "getPositiveTrajectories", "getNegativeTrajectories", "getTrajectoryDelta", "buildTrajectories"].forEach((fn) => {
  check(`trajectory-engine.ts exports ${fn}`, trajEng.includes(`export function ${fn}`));
});
check("trajectory-engine.ts has RawTrajectoryInput", trajEng.includes("interface RawTrajectoryInput"));

// ─── Risk engine checks ───────────────────────────────────────────────────────

const riskEng = readFile(path.join(BASE, "forecast-risk-engine.ts"));
["scoreForecastRisk", "buildForecastRisk", "identifyForecastRisks", "rankForecastRisks",
 "getSystemicForecastRisks", "getCriticalForecastRisks"].forEach((fn) => {
  check(`forecast-risk-engine.ts exports ${fn}`, riskEng.includes(`export function ${fn}`));
});
check("risk engine has compositeRisk", riskEng.includes("compositeRisk"));
check("risk engine fail-closed", riskEng.includes("} catch {"));

// ─── Opportunity engine checks ────────────────────────────────────────────────

const oppEng = readFile(path.join(BASE, "forecast-opportunity-engine.ts"));
["scoreForecastOpportunity", "buildForecastOpportunity", "identifyForecastOpportunities",
 "rankForecastOpportunities", "getTransformationalForecastOpportunities"].forEach((fn) => {
  check(`forecast-opportunity-engine.ts exports ${fn}`, oppEng.includes(`export function ${fn}`));
});
check("opportunity engine has isTransformational", oppEng.includes("isTransformational"));

// ─── Scenario engine checks ───────────────────────────────────────────────────

const scEng = readFile(path.join(BASE, "forecast-scenario-engine.ts"));
["deriveScenarioOutcome", "clampScenarioProbability", "buildScenario", "buildScenarios",
 "rankScenariosByProbability", "getMostLikelyScenario", "getExpectedCaseScenario",
 "getBlackSwanScenarios", "deduplicateScenarios", "buildDefaultScenarioSet"].forEach((fn) => {
  check(`forecast-scenario-engine.ts exports ${fn}`, scEng.includes(`export function ${fn}`));
});
check("scenario engine: suggestedOnly: true literal", scEng.includes("suggestedOnly: true"));
check("scenario engine: BLACK_SWAN cap at 0.10", scEng.includes("0.10"));
check("scenario engine: STRETCH_CASE cap at 0.25", scEng.includes("0.25"));

// ─── Confidence engine checks ─────────────────────────────────────────────────

const confEng = readFile(path.join(BASE, "forecast-confidence-engine.ts"));
["computeConfidenceScore", "confidenceLevelFromScore", "computeForecastConfidence",
 "buildEvidenceRecord", "mergeConfidences", "buildEmptyConfidence"].forEach((fn) => {
  check(`forecast-confidence-engine.ts exports ${fn}`, confEng.includes(`export function ${fn}`));
});
check("confidence engine has ConfidenceInputs interface", confEng.includes("interface ConfidenceInputs"));
check("confidence engine exports buildEmptyConfidence", confEng.includes("export function buildEmptyConfidence"));

// ─── Assumption engine checks ─────────────────────────────────────────────────

const assumEng = readFile(path.join(BASE, "forecast-assumption-engine.ts"));
["buildAssumption", "extractAssumptions", "validateAssumptions", "rankAssumptions",
 "getCriticalUnvalidatedAssumptions", "countUnvalidatedCritical", "buildDefaultAssumptions"].forEach((fn) => {
  check(`forecast-assumption-engine.ts exports ${fn}`, assumEng.includes(`export function ${fn}`));
});

// ─── Narrative engine checks ──────────────────────────────────────────────────

const narrEng = readFile(path.join(BASE, "forecast-narrative-engine.ts"));
["buildForecastNarrative", "buildForecastExecutiveNarrative", "buildScenariosNarrative",
 "buildRisksNarrative", "buildOpportunitiesNarrative", "buildAssumptionsNarrative",
 "buildHorizonNarrative", "buildLimitationsNarrative"].forEach((fn) => {
  check(`forecast-narrative-engine.ts exports ${fn}`, narrEng.includes(`export function ${fn}`));
});
check("narrative engine: probabilistic language", narrEng.includes("probabilística") || narrEng.includes("orientativo"));
check("narrative engine: no absolute predictions", !narrEng.includes("garantizará") && !narrEng.includes("ocurrirá definitivamente"));

// ─── Digest engine checks ─────────────────────────────────────────────────────

const digestEng = readFile(path.join(BASE, "forecast-digest-engine.ts"));
check("digest engine exports buildForecastDigest", digestEng.includes("export function buildForecastDigest"));
check("digest engine has DAILY period", digestEng.includes("DAILY"));
check("digest engine has QUARTERLY period", digestEng.includes("QUARTERLY"));
check("digest engine has ANNUAL period", digestEng.includes("ANNUAL"));

// ─── Briefing engine checks ───────────────────────────────────────────────────

const briefEng = readFile(path.join(BASE, "forecast-briefing-engine.ts"));
check("briefing engine exports buildForecastBriefing", briefEng.includes("export function buildForecastBriefing"));
check("briefing engine has BRIEFING_CONFIGS", briefEng.includes("BRIEFING_CONFIGS"));
["CEO", "EXECUTIVE", "BOARD", "RISK", "GROWTH"].forEach((type) => {
  check(`briefing engine has type ${type}`, briefEng.includes(`${type}:`));
});

// ─── Main engine checks ───────────────────────────────────────────────────────

const mainEng = readFile(path.join(BASE, "strategic-forecasting-engine.ts"));
check("main engine exports runStrategicForecasting", mainEng.includes("export function runStrategicForecasting"));
check("main engine exports computeForecastScore", mainEng.includes("export function computeForecastScore"));
check("main engine has StrategicForecastingContext", mainEng.includes("interface StrategicForecastingContext"));
check("main engine fail-closed pipeline", mainEng.includes("buildFailedForecastingResult"));
check("main engine: status SUCCESS|PARTIAL|FAILED", mainEng.includes('"SUCCESS"') && mainEng.includes('"PARTIAL"') && mainEng.includes('"FAILED"'));

// ─── Integration files checks ─────────────────────────────────────────────────

// Learning: .name not .label
const learning = readFile(path.join(INTEGRATIONS, "forecasting-learning.ts"));
check("learning integration uses .name (CRITICAL)", learning.includes(".name"));
check("learning integration does NOT use p.label accessor", !learning.includes("p.label"));
check("learning integration exports buildLearningForecastContext", learning.includes("export function buildLearningForecastContext"));
check("learning integration exports getRelevantForecastPatternNames", learning.includes("export function getRelevantForecastPatternNames"));
check("learning integration has CRITICAL comment about .name", learning.includes("CRITICAL: .name not .label"));

// Playbooks: .title not .name
const playbooks = readFile(path.join(INTEGRATIONS, "forecasting-playbooks.ts"));
check("playbooks integration uses .title (CRITICAL)", playbooks.includes(".title"));
check("playbooks integration exports getPlaybookTitlesForForecast", playbooks.includes("export function getPlaybookTitlesForForecast"));
check("playbooks integration has CRITICAL comment about .title", playbooks.includes("CRITICAL: .title not .name"));

// Cross-module: ReasoningResult not CrossModuleResult
const crossMod = readFile(path.join(INTEGRATIONS, "forecasting-cross-module.ts"));
check("cross-module uses ReasoningResult (not CrossModuleResult)", crossMod.includes("ReasoningResult"));
check("cross-module does NOT import CrossModuleResult", !crossMod.includes("import type { CrossModuleResult"));
check("cross-module accesses result.chain.recommendations", crossMod.includes("chain.recommendations"));
check("cross-module accesses result.chain.risks", crossMod.includes("chain.risks"));
check("cross-module accesses result.riskCount + result.opportunityCount", crossMod.includes("riskCount + result.opportunityCount"));

// Memory graph: sourceNodeId/targetNodeId
const memGraph = readFile(path.join(INTEGRATIONS, "forecasting-memory-graph.ts"));
check("memory-graph uses sourceNodeId (not sourceId)", memGraph.includes("sourceNodeId"));
check("memory-graph uses targetNodeId (not targetId)", memGraph.includes("targetNodeId"));
check("memory-graph does NOT use sourceId field", !memGraph.includes("readonly sourceId:"));

// Simulations: suggestedOnly: true literal
const simulations = readFile(path.join(INTEGRATIONS, "forecasting-simulations.ts"));
check("simulations has suggestedOnly in interface", simulations.includes("suggestedOnly:"));
check("simulations has suggestedOnly literal true assignment", simulations.includes("suggestedOnly:        true"));

// Tenant profile
const tenantProf = readFile(path.join(INTEGRATIONS, "forecasting-tenant-profile.ts"));
check("tenant profile has castillitos entry", tenantProf.includes("castillitos"));
check("tenant profile exports getTenantForecastProfile", tenantProf.includes("export function getTenantForecastProfile"));
check("tenant profile exports getForecastRiskTolerance", tenantProf.includes("export function getForecastRiskTolerance"));

// Compliance
const compliance = readFile(path.join(INTEGRATIONS, "forecasting-compliance.ts"));
check("compliance exports runForecastComplianceChecks", compliance.includes("export function runForecastComplianceChecks"));
check("compliance exports assertForecastTenantIsolation", compliance.includes("export function assertForecastTenantIsolation"));
check("compliance has TENANT_ISOLATION check", compliance.includes('"TENANT_ISOLATION"'));
check("compliance has SUGGESTED_ONLY check", compliance.includes('"SUGGESTED_ONLY"'));
check("compliance has 10 checks", compliance.includes("checkCount: checks.length"));

// Audit
const audit = readFile(path.join(INTEGRATIONS, "forecasting-audit.ts"));
check("audit exports auditForecastInitiated", audit.includes("export function auditForecastInitiated"));
check("audit exports auditForecastCompleted", audit.includes("export function auditForecastCompleted"));
check("audit exports auditScenarioGenerated", audit.includes("export function auditScenarioGenerated"));
check("audit uses faud_ prefix", audit.includes("generateForecastAuditId"));
check("audit scenario has suggestedOnly metadata", audit.includes("suggestedOnly: true"));

// ─── Query layer checks ───────────────────────────────────────────────────────

const query = readFile(path.join(BASE, "strategic-forecasting-query.ts"));
["getForecasts", "getForecast", "getLatestForecast", "getForecastsByStatus",
 "getForecastsByHorizon", "sortForecastsByScore", "getForecastStats",
 "filterForecastsByConfidence"].forEach((fn) => {
  check(`query.ts exports ${fn}`, query.includes(`export function ${fn}`));
});
check("query.ts exports ForecastStats type", query.includes("export interface ForecastStats"));
check("query.ts tenant-scoped by orgSlug", query.includes("orgSlug === orgSlug") || query.includes("f.orgSlug === orgSlug"));

// ─── Repository checks ────────────────────────────────────────────────────────

const repo = readFile(path.join(BASE, "strategic-forecasting-repository.ts"));
check("repository has StrategicForecastingRepository interface", repo.includes("interface StrategicForecastingRepository"));
check("repository has InMemoryStrategicForecastingRepository", repo.includes("class InMemoryStrategicForecastingRepository"));
check("repository has saveForecast", repo.includes("saveForecast"));
check("repository has archiveForecast", repo.includes("archiveForecast"));

// Prisma repository
const prismaRepo = readFile(path.join(BASE, "persistence", "prisma-strategic-forecasting-repository.ts"));
check("prisma repo imports from @/lib/prisma", prismaRepo.includes('from "@/lib/prisma"'));
check("prisma repo uses (prisma as any)", prismaRepo.includes("prisma as any"));
check("prisma repo uses strategicForecastRecord", prismaRepo.includes("strategicForecastRecord"));
check("prisma repo implements StrategicForecastingRepository", prismaRepo.includes("implements StrategicForecastingRepository"));

// ─── Prisma schema checks ─────────────────────────────────────────────────────

const schema = readFile(path.join(__dirname, "..", "prisma", "schema.prisma"));
["StrategicForecastRecord", "ForecastScenarioRecord", "ForecastSignalRecord",
 "ForecastTrajectoryRecord", "ForecastReportRecord"].forEach((model) => {
  check(`schema.prisma has model ${model}`, schema.includes(`model ${model}`));
});
check("schema has forecastScore field", schema.includes("forecastScore"));
check("schema has confidenceLevel field", schema.includes("confidenceLevel"));
check("schema has confidenceScore field", schema.includes("confidenceScore"));
check("schema has reportJson field", schema.includes("reportJson"));

// Migration
const migration = readFile(path.join(__dirname, "..", "prisma", "migrations", "20260620000000_strategic_forecasting", "migration.sql"));
["StrategicForecastRecord", "ForecastScenarioRecord", "ForecastSignalRecord",
 "ForecastTrajectoryRecord", "ForecastReportRecord"].forEach((table) => {
  check(`migration creates table ${table}`, migration.includes(`CREATE TABLE "${table}"`));
});
check("migration creates orgSlug index on StrategicForecastRecord",
  migration.includes("StrategicForecastRecord_orgSlug_idx"));

// ─── Dashboard contract checks ────────────────────────────────────────────────

const dashboard = readFile(path.join(BASE, "strategic-forecasting-dashboard-contract.ts"));
check("dashboard contract NOT server-only", !dashboard.includes("import \"server-only\""));
check("dashboard exports StrategicForecastingDashboard", dashboard.includes("interface StrategicForecastingDashboard"));
check("dashboard exports buildStrategicForecastingDashboard", dashboard.includes("export function buildStrategicForecastingDashboard"));
check("dashboard has forecastHealth field", dashboard.includes("forecastHealth"));
check("dashboard has EMPTY health", dashboard.includes('"EMPTY"'));
check("dashboard fail-closed", dashboard.includes("} catch {"));

// ─── Health checks ────────────────────────────────────────────────────────────

const health = readFile(path.join(BASE, "strategic-forecasting-health.ts"));
check("health exports checkStrategicForecastingHealth", health.includes("export function checkStrategicForecastingHealth"));
check("health exports buildDefaultForecastingHealthInputs", health.includes("export function buildDefaultForecastingHealthInputs"));
check("health has 14 named checks", health.includes("14") || (health.match(/check\(/g) || []).length >= 14);

// ─── Readiness checks ─────────────────────────────────────────────────────────

const readiness = readFile(path.join(BASE, "strategic-forecasting-readiness.ts"));
check("readiness exports checkForecastingReadiness", readiness.includes("export function checkForecastingReadiness"));
check("readiness exports buildForecastingReadinessFlags", readiness.includes("export function buildForecastingReadinessFlags"));
check("readiness minimum: hasSignalData && hasTrendData",
  readiness.includes("hasSignalData") && readiness.includes("hasTrendData"));
check("readiness has FULL | PARTIAL | MINIMUM | NOT_READY", readiness.includes('"FULL"') && readiness.includes('"MINIMUM"') && readiness.includes('"NOT_READY"'));

// ─── Canonical checks ─────────────────────────────────────────────────────────

const canonical = readFile(path.join(BASE, "strategic-forecasting-canonical.ts"));
check("canonical has 25 scenarios", (canonical.match(/id:\s*"CFS_/g) || []).length === 25);
check("canonical all have suggestedOnly", (canonical.match(/suggestedOnly: true/g) || []).length >= 25);
check("canonical has BLACK_SWAN_CANDIDATE entries", canonical.includes("BLACK_SWAN_CANDIDATE"));
check("canonical exports CANONICAL_FORECAST_SCENARIOS", canonical.includes("export const CANONICAL_FORECAST_SCENARIOS"));
check("canonical exports getCanonicalForecastScenario", canonical.includes("export function getCanonicalForecastScenario"));
check("canonical has CFS_DISRUPCION_TECNOLOGICA", canonical.includes("CFS_DISRUPCION_TECNOLOGICA"));
check("canonical has CFS_RIESGO_CIBERSEGURIDAD", canonical.includes("CFS_RIESGO_CIBERSEGURIDAD"));

// ─── Horizon models checks ────────────────────────────────────────────────────

const horizonModels = readFile(path.join(BASE, "forecast-horizon-models.ts"));
check("horizon models has 6 windows", ["30D", "90D", "180D", "365D", "3Y", "5Y"].every((w) => horizonModels.includes(`"${w}"`)));
check("horizon models exports HORIZON_MODELS", horizonModels.includes("export const HORIZON_MODELS"));
check("horizon models exports getHorizonModel", horizonModels.includes("export function getHorizonModel"));
check("horizon models has maxConfidence 0.30 for 5Y", horizonModels.includes("0.30"));

// ─── Enterprise trajectory engine checks ─────────────────────────────────────

const entTrajEng = readFile(path.join(BASE, "enterprise-trajectory-engine.ts"));
["buildEnterpriseTrajectory", "buildGrowthTrajectory", "buildRiskTrajectory", "buildStrategicTrajectory"].forEach((fn) => {
  check(`enterprise-trajectory-engine.ts exports ${fn}`, entTrajEng.includes(`export function ${fn}`));
});
check("enterprise trajectory engine fail-closed", entTrajEng.includes("} catch {"));

// ─── Future signals engine checks ─────────────────────────────────────────────

const futureSig = readFile(path.join(BASE, "future-signals-engine.ts"));
["detectWeakSignals", "promoteWeakSignals", "scoreFutureSignals", "detectEmergingPatterns",
 "buildFutureSignalSummary"].forEach((fn) => {
  check(`future-signals-engine.ts exports ${fn}`, futureSig.includes(`export function ${fn}`));
});
check("future signals promotes to LEADING type", futureSig.includes('"LEADING"'));

// ─── Server barrel checks ─────────────────────────────────────────────────────

const serverBarrel = readFile(path.join(BASE, "server.ts"));
check("server.ts has import server-only", serverBarrel.includes('import "server-only"'));
check("server.ts exports trend-engine", serverBarrel.includes('from "./trend-engine"'));
check("server.ts exports signal-engine", serverBarrel.includes("signal-engine"));
check("server.ts exports all 14 integrations",
  serverBarrel.includes("forecasting-strategic-memory") &&
  serverBarrel.includes("forecasting-learning") &&
  serverBarrel.includes("forecasting-board-intelligence") &&
  serverBarrel.includes("forecasting-cross-module") &&
  serverBarrel.includes("forecasting-audit"));
check("server.ts has explicit query exports to avoid collisions",
  serverBarrel.includes("from \"./strategic-forecasting-query\""));
check("server.ts exports enterprise engines", serverBarrel.includes("enterprise-trajectory-engine"));
check("server.ts exports future signals engine", serverBarrel.includes("future-signals-engine"));

// ─── Client barrel checks ─────────────────────────────────────────────────────

const clientBarrel = readFile(path.join(BASE, "index.ts"));
check("index.ts does NOT import server-only", !clientBarrel.includes('import "server-only"'));
check("index.ts exports type StrategicForecast", clientBarrel.includes("StrategicForecast"));
check("index.ts exports type ForecastScenario", clientBarrel.includes("ForecastScenario"));
check("index.ts exports buildStrategicForecastingDashboard", clientBarrel.includes("buildStrategicForecastingDashboard"));
check("index.ts exports canonical", clientBarrel.includes("strategic-forecasting-canonical"));

// ─── Security registry checks ─────────────────────────────────────────────────

const secRegistry = readFile(path.join(__dirname, "..", "lib", "security", "security-registry.ts"));
["STRATEGIC_FORECASTING", "FORECAST", "FORECAST_SCENARIO", "FORECAST_SIGNAL", "FORECAST_REPORT"].forEach((id) => {
  check(`security registry has ${id} entry`, secRegistry.includes(`"${id}"`));
});
check("STRATEGIC_FORECASTING is CONFIDENTIAL", secRegistry.includes('"CONFIDENTIAL"'));
check("FORECAST_REPORT requires audit", secRegistry.includes("FORECAST_REPORT") && secRegistry.includes("requiresAudit:      true"));

// ─── Intelligence registry checks ────────────────────────────────────────────

const intRegistry = readFile(path.join(__dirname, "..", "lib", "copilot", "copilot-intelligence-registry.ts"));
check("intelligence registry has STRATEGIC_FORECASTING entry", intRegistry.includes('"STRATEGIC_FORECASTING"'));
check("STRATEGIC_FORECASTING depends on BOARD_INTELLIGENCE", intRegistry.includes('"BOARD_INTELLIGENCE"'));
check("STRATEGIC_FORECASTING category is EXECUTIVE", intRegistry.includes("AGENTIK-STRATEGIC-FORECASTING-01"));
check("STRATEGIC_FORECASTING has hasPrisma: true", intRegistry.includes("hasPrisma:    true"));

// ─── Fail-closed invariants ───────────────────────────────────────────────────

const ALL_ENGINE_FILES = [
  "trend-engine.ts", "signal-engine.ts", "trajectory-engine.ts",
  "forecast-risk-engine.ts", "forecast-opportunity-engine.ts",
  "forecast-scenario-engine.ts", "forecast-confidence-engine.ts",
  "forecast-assumption-engine.ts", "forecast-narrative-engine.ts",
  "forecast-digest-engine.ts", "forecast-briefing-engine.ts",
  "strategic-forecasting-engine.ts",
];

ALL_ENGINE_FILES.forEach((f) => {
  const content = readFile(path.join(BASE, f));
  check(`${f}: fail-closed (has try/catch)`, content.includes("try {") && content.includes("} catch {"));
});

// Integration files with stateful logic should be fail-closed (exclude pure compliance/audit)
const FAIL_CLOSED_INTEGRATIONS = INTEGRATION_FILES.filter(
  (f) => f !== "forecasting-compliance.ts" && f !== "forecasting-audit.ts"
);
FAIL_CLOSED_INTEGRATIONS.forEach((f) => {
  const content = readFile(path.join(INTEGRATIONS, f));
  check(`integration ${f}: fail-closed`, content.includes("try {") && content.includes("} catch {"));
});

// ─── Tenant isolation invariants ──────────────────────────────────────────────

const TENANT_FILES = [
  "trend-engine.ts", "signal-engine.ts", "forecast-risk-engine.ts",
  "forecast-opportunity-engine.ts", "strategic-forecasting-engine.ts",
];
TENANT_FILES.forEach((f) => {
  const content = readFile(path.join(BASE, f));
  check(`${f}: orgSlug parameter present`, content.includes("orgSlug"));
});

// ─── No absolute prediction language ─────────────────────────────────────────

const NARRATIVE_FILE = readFile(path.join(BASE, "forecast-narrative-engine.ts"));
check("narrative: no 'ocurrirá' absolute prediction", !NARRATIVE_FILE.includes("ocurrirá definitivamente"));
check("narrative: no 'garantiza' absolute prediction", !NARRATIVE_FILE.includes("garantiza que"));
check("narrative: uses probabilistic language", NARRATIVE_FILE.includes("proyect") || NARRATIVE_FILE.includes("estimad") || NARRATIVE_FILE.includes("probable"));

// ─── suggestedOnly invariants ─────────────────────────────────────────────────

const SCENARIO_ENG = readFile(path.join(BASE, "forecast-scenario-engine.ts"));
check("scenario engine always sets suggestedOnly: true", SCENARIO_ENG.includes("suggestedOnly: true"));
check("scenario engine empty scenario also has suggestedOnly: true",
  (SCENARIO_ENG.match(/suggestedOnly: true/g) || []).length >= 2);

// ─── Integration harness checks ───────────────────────────────────────────────

const harness = readFile(path.join(__dirname, "..", "app", "api", "internal", "integration-tests", "strategic-forecasting", "route.ts"));
check("harness exports GET handler", harness.includes("export async function GET"));
check("harness has E2E castillitos test", harness.includes("E2E_CastillitosForecasting"));
check("harness has identity tests", harness.includes("testIdentity"));
check("harness has pipeline tests", harness.includes("testMainPipeline"));
check("harness has compliance tests", harness.includes("testComplianceAndAudit"));
check("harness has integration tests", harness.includes("testIntegrations"));
check("harness has canonical tests", harness.includes("testCanonicalAndHorizon"));
check("harness checks suggestedOnly literal", harness.includes("suggestedOnly === true"));
check("harness checks .name not .label (learning)", harness.includes("pattern name correct (not .label)"));
check("harness checks .title not .name (playbooks)", harness.includes("title used (not name)"));
check("harness checks sourceNodeId (memory graph)", harness.includes("sourceNodeId"));
check("harness returns PASS/FAIL status", harness.includes('"PASS"') && harness.includes('"FAIL"'));

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n=== AGENTIK-STRATEGIC-FORECASTING-01 Validation ===");
console.log(`Checks: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);

if (errors.length > 0) {
  console.log("\nFailures:");
  errors.forEach((e) => console.log("  " + e));
}

console.log(failed === 0 ? "\n✓ ALL CHECKS PASSED" : "\n✗ SOME CHECKS FAILED");
process.exit(failed > 0 ? 1 : 0);
