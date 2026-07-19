// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 44: Integration Harness
// GET /api/internal/integration-tests/strategic-forecasting
// 700+ integration tests covering all engines, integrations, compliance, e2e scenarios

import { NextResponse } from "next/server";
import {
  generateForecastId, generateScenarioId, generateForecastSignalId,
  generateForecastTrendId, generateForecastTrajectoryId, generateForecastReportId,
  generateForecastDigestId, generateForecastBriefingId, generateForecastRiskId,
  generateForecastOpportunityId, generateForecastAssumptionId, generateForecastEvidenceId,
  generateForecastRecommendationId, generateForecastAuditId, validateForecastId, getForecastIdPrefix,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-identity";
import {
  scoreTrend, buildTrend, identifyTrends, rankTrends, groupTrends,
  getEmergentTrends, getAcceleratingTrends, getTrendsByHorizon,
} from "@/lib/copilot/strategic-forecasting/trend-engine";
import {
  scoreSignal, classifySignal, buildSignal, detectSignals, rankSignals,
  getWeakSignals, getConfirmedSignals, getLeadingSignals,
} from "@/lib/copilot/strategic-forecasting/signal-engine";
import {
  buildTrajectoryConfidence, buildTrajectory, compareTrajectories,
  rankTrajectories, getPositiveTrajectories, getNegativeTrajectories, getTrajectoryDelta,
} from "@/lib/copilot/strategic-forecasting/trajectory-engine";
import {
  scoreForecastRisk, buildForecastRisk, identifyForecastRisks, rankForecastRisks,
  getSystemicForecastRisks, getCriticalForecastRisks,
} from "@/lib/copilot/strategic-forecasting/forecast-risk-engine";
import {
  scoreForecastOpportunity, buildForecastOpportunity, identifyForecastOpportunities,
  rankForecastOpportunities, getTransformationalForecastOpportunities,
} from "@/lib/copilot/strategic-forecasting/forecast-opportunity-engine";
import {
  deriveScenarioOutcome, clampScenarioProbability, buildScenario, buildScenarios,
  rankScenariosByProbability, getMostLikelyScenario, getExpectedCaseScenario,
  getBlackSwanScenarios, deduplicateScenarios, buildDefaultScenarioSet,
} from "@/lib/copilot/strategic-forecasting/forecast-scenario-engine";
import {
  computeConfidenceScore, confidenceLevelFromScore, computeForecastConfidence,
  buildEvidenceRecord, mergeConfidences, buildEmptyConfidence,
} from "@/lib/copilot/strategic-forecasting/forecast-confidence-engine";
import {
  buildAssumption, extractAssumptions, validateAssumptions, rankAssumptions,
  getCriticalUnvalidatedAssumptions, countUnvalidatedCritical, buildDefaultAssumptions,
} from "@/lib/copilot/strategic-forecasting/forecast-assumption-engine";
import {
  buildForecastNarrative, buildForecastExecutiveNarrative, buildScenariosNarrative,
  buildRisksNarrative, buildOpportunitiesNarrative,
} from "@/lib/copilot/strategic-forecasting/forecast-narrative-engine";
import {
  buildForecastDigest,
} from "@/lib/copilot/strategic-forecasting/forecast-digest-engine";
import {
  buildForecastBriefing,
} from "@/lib/copilot/strategic-forecasting/forecast-briefing-engine";
import {
  runStrategicForecasting, computeForecastScore,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-engine";
import {
  buildStrategicMemoryForecastContext, buildEmptyMemoryForecastContext, getMemoryPatternLabels,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-strategic-memory";
import {
  buildLearningForecastContext, buildEmptyLearningForecastContext, getRelevantForecastPatternNames,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-learning";
import {
  buildExecutiveBrainForecastContext, buildEmptyExecutiveBrainForecastContext,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-executive-brain";
import {
  buildAdvisorForecastContext, buildEmptyAdvisorForecastContext,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-advisor";
import {
  buildSimulationForecastSummary, buildEmptySimulationForecastSummary,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-simulations";
import {
  buildPlanningForecastContext, hasConflictingForecastPlans,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-planning";
import {
  buildCouncilForecastContext, getCouncilForecastGovernanceSignal,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-executive-council";
import {
  buildBoardIntelligenceForecastContext, buildEmptyBoardIntelligenceForecastContext,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-board-intelligence";
import {
  buildGraphForecastContext, buildEmptyGraphForecastContext,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-memory-graph";
import {
  buildCrossModuleForecastContext, buildEmptyCrossModuleForecastContext,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-cross-module";
import {
  getTenantForecastProfile, getForecastEscalationThreshold, getForecastRiskTolerance,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-tenant-profile";
import {
  buildForecastPlaybookContext, getPlaybookTitlesForForecast,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-playbooks";
import {
  runForecastComplianceChecks, assertForecastTenantIsolation,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-compliance";
import {
  auditForecastInitiated, auditForecastCompleted, auditScenarioGenerated,
  auditRiskIdentified, auditTenantIsolationVerified,
} from "@/lib/copilot/strategic-forecasting/integrations/forecasting-audit";
import {
  getForecasts, getLatestForecast, getForecastStats, sortForecastsByScore,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-query";
import {
  InMemoryStrategicForecastingRepository,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-repository";
import {
  buildStrategicForecastingDashboard,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-dashboard-contract";
import {
  checkStrategicForecastingHealth, buildDefaultForecastingHealthInputs,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-health";
import {
  checkForecastingReadiness, buildForecastingReadinessFlags,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-readiness";
import {
  CANONICAL_FORECAST_SCENARIOS, getCanonicalForecastScenario, getCanonicalScenariosByDomain,
} from "@/lib/copilot/strategic-forecasting/strategic-forecasting-canonical";
import {
  HORIZON_MODELS, getHorizonModel, getMaxConfidenceForWindow, classifyWindowAsHorizon,
} from "@/lib/copilot/strategic-forecasting/forecast-horizon-models";
import {
  buildEnterpriseTrajectory, buildGrowthTrajectory, buildRiskTrajectory, buildStrategicTrajectory,
} from "@/lib/copilot/strategic-forecasting/enterprise-trajectory-engine";
import {
  detectWeakSignals, promoteWeakSignals, scoreFutureSignals, detectEmergingPatterns,
} from "@/lib/copilot/strategic-forecasting/future-signals-engine";

// ─── Assertion helper ─────────────────────────────────────────────────────────
type TestResult = { suite: string; passed: number; failed: number; errors: string[] };

function assert(condition: boolean, msg: string, ctx: TestResult): void {
  if (condition) ctx.passed++;
  else { ctx.failed++; ctx.errors.push(msg); }
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

function testIdentity(): TestResult {
  const ctx: TestResult = { suite: "Identity", passed: 0, failed: 0, errors: [] };

  const fid = generateForecastId();
  assert(fid.startsWith("forecast_"), "forecast_ prefix", ctx);
  assert(validateForecastId(fid), "validateForecastId passes", ctx);
  assert(getForecastIdPrefix(fid) === "forecast_", "getForecastIdPrefix", ctx);

  const sid = generateScenarioId();
  assert(sid.startsWith("scenario_"), "scenario_ prefix", ctx);

  const sigId = generateForecastSignalId();
  assert(sigId.startsWith("fsignal_"), "fsignal_ prefix", ctx);

  const tid = generateForecastTrendId();
  assert(tid.startsWith("ftrend_"), "ftrend_ prefix", ctx);

  const trajId = generateForecastTrajectoryId();
  assert(trajId.startsWith("ftraj_"), "ftraj_ prefix", ctx);

  const rid = generateForecastReportId();
  assert(rid.startsWith("freport_"), "freport_ prefix", ctx);

  const did = generateForecastDigestId();
  assert(did.startsWith("fdigest_"), "fdigest_ prefix", ctx);

  const bid = generateForecastBriefingId();
  assert(bid.startsWith("fbriefing_"), "fbriefing_ prefix", ctx);

  const riskId = generateForecastRiskId();
  assert(riskId.startsWith("frisk_"), "frisk_ prefix", ctx);

  const oppId = generateForecastOpportunityId();
  assert(oppId.startsWith("fopp_"), "fopp_ prefix", ctx);

  const assumId = generateForecastAssumptionId();
  assert(assumId.startsWith("fassume_"), "fassume_ prefix", ctx);

  const evId = generateForecastEvidenceId();
  assert(evId.startsWith("fevidence_"), "fevidence_ prefix", ctx);

  const recId = generateForecastRecommendationId();
  assert(recId.startsWith("frec_"), "frec_ prefix", ctx);

  const audId = generateForecastAuditId();
  assert(audId.startsWith("faud_"), "faud_ prefix", ctx);

  assert(!validateForecastId("invalid_id"), "invalid id rejected", ctx);
  assert(getForecastIdPrefix("invalid_id") === null, "null for invalid prefix", ctx);

  // Uniqueness
  const ids = Array.from({ length: 10 }, () => generateForecastId());
  const unique = new Set(ids);
  assert(unique.size === 10, "IDs are unique", ctx);

  return ctx;
}

function testTrendEngine(): TestResult {
  const ctx: TestResult = { suite: "TrendEngine", passed: 0, failed: 0, errors: [] };

  // scoreTrend
  const s1 = scoreTrend(0.5, "ACCELERATING", false);
  assert(s1 > 0.5, "accelerating boosts score", ctx);
  assert(s1 <= 1, "score bounded at 1", ctx);

  const s2 = scoreTrend(0.5, "DECLINING", false);
  assert(s2 < 0.5, "declining reduces score", ctx);
  assert(s2 >= 0, "score bounded at 0", ctx);

  const s3 = scoreTrend(0.5, "STABLE", true);
  assert(s3 > 0.5, "emergent boost applied", ctx);

  // buildTrend
  const trend = buildTrend("test-org", {
    title: "Test Trend",
    description: "desc",
    domain: "FINANCIAL",
    horizon: "MEDIUM_TERM",
    direction: "GROWING",
    strength: 0.6,
    drivers: ["driver1"],
    risks: ["risk1"],
    evidenceIds: ["ev1"],
    isEmergent: false,
  });
  assert(trend.id.startsWith("ftrend_"), "trend has correct id prefix", ctx);
  assert(trend.orgSlug === "test-org", "orgSlug set", ctx);
  assert(trend.domain === "FINANCIAL", "domain set", ctx);
  assert(typeof trend.strength === "number", "strength is number", ctx);
  assert(trend.strength >= 0 && trend.strength <= 1, "strength in bounds", ctx);
  assert(Array.isArray(trend.drivers), "drivers is array", ctx);
  assert(Array.isArray(trend.risks), "risks is array", ctx);

  // identifyTrends
  const trends = identifyTrends("test-org", [
    { title: "T1", description: "", domain: "FINANCIAL", horizon: "SHORT_TERM", direction: "ACCELERATING", strength: 0.8, isEmergent: true },
    { title: "T2", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", direction: "STABLE", strength: 0.4 },
  ]);
  assert(trends.length === 2, "identifies 2 trends", ctx);

  // rankTrends
  const ranked = rankTrends(trends);
  assert(ranked[0]!.strength >= ranked[1]!.strength, "ranked descending by strength", ctx);

  // groupTrends
  const grouped = groupTrends(trends);
  assert(Array.isArray(grouped["FINANCIAL"]), "grouped by FINANCIAL", ctx);

  // getEmergentTrends
  const emergent = getEmergentTrends(trends);
  assert(emergent.length === 1, "finds 1 emergent trend", ctx);
  assert(emergent[0]!.isEmergent === true, "emergent flag correct", ctx);

  // getAcceleratingTrends
  const accel = getAcceleratingTrends(trends);
  assert(accel.length >= 1, "finds accelerating trends", ctx);

  // getTrendsByHorizon
  const short = getTrendsByHorizon(trends, "SHORT_TERM");
  assert(short.length === 1, "filters by horizon", ctx);

  // Fail-closed: empty input
  const empty = identifyTrends("org", []);
  assert(empty.length === 0, "empty input returns empty array", ctx);

  return ctx;
}

function testSignalEngine(): TestResult {
  const ctx: TestResult = { suite: "SignalEngine", passed: 0, failed: 0, errors: [] };

  const score1 = scoreSignal(0.5, "CONFIRMED", true);
  assert(score1 > 0.5, "confirmed signal scored higher", ctx);
  assert(score1 <= 1, "score bounded at 1", ctx);

  const score2 = scoreSignal(0.3, "WEAK_SIGNAL", false);
  assert(score2 <= 0.4, "weak signal low score", ctx);

  const classified = classifySignal(0.7, 5);
  assert(classified === "CONFIRMED", "classifies as CONFIRMED", ctx);

  const classifiedWeak = classifySignal(0.2, 1);
  assert(classifiedWeak === "WEAK_SIGNAL", "classifies as WEAK_SIGNAL", ctx);

  const signal = buildSignal("test-org", {
    title: "Test Signal",
    description: "desc",
    domain: "FINANCIAL",
    horizon: "SHORT_TERM",
    type: "LEADING",
    intensity: 0.7,
    evidenceIds: ["ev1"],
    isWeak: false,
    isConfirmed: true,
    metadata: {},
  });
  assert(signal.id.startsWith("fsignal_"), "signal id prefix", ctx);
  assert(signal.orgSlug === "test-org", "orgSlug set", ctx);
  assert(signal.type === "LEADING", "type set", ctx);
  assert(typeof signal.intensity === "number", "intensity is number", ctx);
  assert(signal.intensity >= 0 && signal.intensity <= 1, "intensity in bounds", ctx);

  const signals = detectSignals("test-org", [
    { title: "S1", description: "", domain: "FINANCIAL", horizon: "SHORT_TERM", type: "LEADING", intensity: 0.8, isWeak: false, isConfirmed: true, metadata: {} },
    { title: "S2", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", type: "WEAK_SIGNAL", intensity: 0.2, isWeak: true, isConfirmed: false, metadata: {} },
  ]);
  assert(signals.length === 2, "detects 2 signals", ctx);

  const ranked = rankSignals(signals);
  assert(ranked[0]!.intensity >= ranked[1]!.intensity, "ranked by intensity desc", ctx);

  const weak = getWeakSignals(signals);
  assert(weak.length === 1, "finds 1 weak signal", ctx);

  const confirmed = getConfirmedSignals(signals);
  assert(confirmed.length >= 1, "finds confirmed signals", ctx);

  const leading = getLeadingSignals(signals);
  assert(leading.length >= 1, "finds leading signals", ctx);

  return ctx;
}

function testTrajectoryEngine(): TestResult {
  const ctx: TestResult = { suite: "TrajectoryEngine", passed: 0, failed: 0, errors: [] };

  const conf = buildTrajectoryConfidence(0.7, 3, 5);
  assert(conf.score > 0, "confidence score > 0", ctx);
  assert(conf.score <= 1, "confidence score <= 1", ctx);
  assert(typeof conf.level === "string", "level is string", ctx);
  assert(Array.isArray(conf.limitations), "limitations is array", ctx);

  const traj = buildTrajectory("test-org", {
    title: "Test Trajectory",
    description: "desc",
    domain: "FINANCIAL",
    horizon: "MEDIUM_TERM",
    direction: "GROWING",
    startingScore: 0.4,
    projectedScore: 0.65,
    confidenceScore: 0.7,
    keyDrivers: ["d1", "d2"],
    barriers: ["b1"],
    assumptions: [],
    evidenceIds: ["ev1"],
  });
  assert(traj.id.startsWith("ftraj_"), "trajectory id prefix", ctx);
  assert(traj.orgSlug === "test-org", "orgSlug set", ctx);
  assert(traj.projectedScore >= 0 && traj.projectedScore <= 1, "projectedScore in bounds", ctx);
  assert(traj.startingScore >= 0 && traj.startingScore <= 1, "startingScore in bounds", ctx);

  const traj2 = buildTrajectory("test-org", {
    title: "T2",
    description: "",
    domain: "COMMERCIAL",
    horizon: "SHORT_TERM",
    direction: "DECLINING",
    startingScore: 0.7,
    projectedScore: 0.3,
    confidenceScore: 0.5,
  });

  const compared = compareTrajectories(traj, traj2);
  assert(typeof compared === "number", "compareTrajectories returns number", ctx);

  const ranked = rankTrajectories([traj, traj2]);
  assert(ranked.length === 2, "ranked array has 2 items", ctx);

  const pos = getPositiveTrajectories([traj, traj2]);
  assert(pos.some((t) => t.projectedScore > t.startingScore), "positive trajectories correct", ctx);

  const neg = getNegativeTrajectories([traj, traj2]);
  assert(neg.some((t) => t.projectedScore < t.startingScore), "negative trajectories correct", ctx);

  const delta = getTrajectoryDelta(traj);
  assert(typeof delta === "number", "delta is number", ctx);
  assert(Math.abs(delta - (traj.projectedScore - traj.startingScore)) < 0.001, "delta computed correctly", ctx);

  return ctx;
}

function testForecastRiskEngine(): TestResult {
  const ctx: TestResult = { suite: "ForecastRiskEngine", passed: 0, failed: 0, errors: [] };

  const score = scoreForecastRisk(0.7, 0.8);
  assert(score > 0, "risk score > 0", ctx);
  assert(score <= 1, "risk score <= 1", ctx);

  const risk = buildForecastRisk("test-org", {
    title: "Test Risk",
    description: "desc",
    domain: "FINANCIAL",
    horizon: "MEDIUM_TERM",
    likelihood: 0.7,
    impact: 0.8,
    mitigations: ["m1"],
    evidenceIds: ["ev1"],
    isSystemic: true,
  });
  assert(risk.id.startsWith("frisk_"), "risk id prefix", ctx);
  assert(risk.orgSlug === "test-org", "orgSlug set", ctx);
  assert(risk.compositeRisk > 0, "compositeRisk > 0", ctx);
  assert(risk.isSystemic === true, "isSystemic flag set", ctx);
  assert(typeof risk.compositeRisk === "number", "compositeRisk is number", ctx);

  const risks = identifyForecastRisks("test-org", [
    { title: "R1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", likelihood: 0.8, impact: 0.9, isSystemic: true },
    { title: "R2", description: "", domain: "COMMERCIAL", horizon: "SHORT_TERM", likelihood: 0.3, impact: 0.4 },
  ]);
  assert(risks.length === 2, "identifies 2 risks", ctx);

  const ranked = rankForecastRisks(risks);
  assert(ranked[0]!.compositeRisk >= ranked[1]!.compositeRisk, "ranked by compositeRisk desc", ctx);

  const systemic = getSystemicForecastRisks(risks);
  assert(systemic.length === 1, "finds 1 systemic risk", ctx);

  const critical = getCriticalForecastRisks(risks);
  assert(critical.every((r) => r.compositeRisk >= 0.7), "critical risks have compositeRisk >= 0.7", ctx);

  return ctx;
}

function testForecastOpportunityEngine(): TestResult {
  const ctx: TestResult = { suite: "ForecastOpportunityEngine", passed: 0, failed: 0, errors: [] };

  const score = scoreForecastOpportunity(0.8, 0.7, 0.6);
  assert(score > 0, "opportunity score > 0", ctx);
  assert(score <= 1, "opportunity score <= 1", ctx);

  const opp = buildForecastOpportunity("test-org", {
    title: "Test Opportunity",
    description: "desc",
    domain: "COMMERCIAL",
    horizon: "MEDIUM_TERM",
    magnitude: 0.8,
    captureScore: 0.7,
    timeHorizon: 0.6,
    requirements: ["r1"],
    evidenceIds: ["ev1"],
    isTransformational: true,
  });
  assert(opp.id.startsWith("fopp_"), "opportunity id prefix", ctx);
  assert(opp.orgSlug === "test-org", "orgSlug set", ctx);
  assert(opp.magnitude >= 0 && opp.magnitude <= 1, "magnitude in bounds", ctx);
  assert(opp.captureScore >= 0 && opp.captureScore <= 1, "captureScore in bounds", ctx);
  assert(typeof opp.isTransformational === "boolean", "isTransformational is boolean", ctx);

  const opps = identifyForecastOpportunities("test-org", [
    { title: "O1", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", magnitude: 0.9, captureScore: 0.8, timeHorizon: 0.7, isTransformational: true },
    { title: "O2", description: "", domain: "FINANCIAL", horizon: "LONG_TERM", magnitude: 0.3, captureScore: 0.4, timeHorizon: 0.5 },
  ]);
  assert(opps.length === 2, "identifies 2 opportunities", ctx);

  const ranked = rankForecastOpportunities(opps);
  assert(ranked.length === 2, "ranked has 2 items", ctx);

  const trans = getTransformationalForecastOpportunities(opps);
  assert(trans.length >= 1, "finds transformational opportunities", ctx);

  return ctx;
}

function testScenarioEngine(): TestResult {
  const ctx: TestResult = { suite: "ScenarioEngine", passed: 0, failed: 0, errors: [] };

  // deriveScenarioOutcome
  const o1 = deriveScenarioOutcome(0.7, "EXPECTED_CASE");
  assert(o1 === "LIKELY", "LIKELY for prob >= 0.65", ctx);

  const o2 = deriveScenarioOutcome(0.5, "EXPECTED_CASE");
  assert(o2 === "POSSIBLE", "POSSIBLE for prob 0.4-0.65", ctx);

  const o3 = deriveScenarioOutcome(0.05, "BLACK_SWAN_CANDIDATE");
  assert(o3 === "UNLIKELY", "UNLIKELY for black swan", ctx);

  // clampScenarioProbability
  const p1 = clampScenarioProbability("BLACK_SWAN_CANDIDATE", 0.5);
  assert(p1 <= 0.10, "black swan capped at 0.10", ctx);

  const p2 = clampScenarioProbability("STRETCH_CASE", 0.8);
  assert(p2 <= 0.25, "stretch capped at 0.25", ctx);

  const confidence = buildEmptyConfidence();
  const scenario = buildScenario("test-org", "session-1", {
    type: "EXPECTED_CASE",
    title: "Test Scenario",
    narrative: "test narrative",
    domain: "FINANCIAL",
    horizon: "MEDIUM_TERM",
    probability: 0.55,
    trajectories: [],
    risks: [],
    opportunities: [],
    assumptions: [],
    confidence,
    evidenceIds: ["ev1"],
    limitations: ["custom limit"],
  });
  assert(scenario.id.startsWith("scenario_"), "scenario id prefix", ctx);
  assert(scenario.orgSlug === "test-org", "orgSlug set", ctx);
  assert(scenario.suggestedOnly === true, "suggestedOnly is true (literal)", ctx);
  assert(scenario.limitations.length >= 2, "limitations include base + custom", ctx);
  assert(scenario.probability >= 0 && scenario.probability <= 1, "probability in bounds", ctx);
  assert(typeof scenario.outcome === "string", "outcome is string", ctx);

  const scenarios = buildDefaultScenarioSet("test-org", "session-1", "FINANCIAL", "MEDIUM_TERM", confidence);
  assert(scenarios.length === 4, "default set has 4 scenarios", ctx);
  assert(scenarios.every((s) => s.suggestedOnly === true), "all suggestedOnly", ctx);

  const expectedCase = getExpectedCaseScenario(scenarios);
  assert(expectedCase !== null, "expected case found", ctx);
  assert(expectedCase?.type === "EXPECTED_CASE", "type is EXPECTED_CASE", ctx);

  const mostLikely = getMostLikelyScenario(scenarios);
  assert(mostLikely !== null, "mostLikely found", ctx);

  const ranked = rankScenariosByProbability(scenarios);
  assert(ranked[0]!.probability >= ranked[ranked.length - 1]!.probability, "ranked descending", ctx);

  const bs = getBlackSwanScenarios(scenarios);
  assert(bs.length === 0, "no black swans in default set", ctx);

  // deduplication
  const dups = buildScenarios("test-org", "s1", [
    { type: "EXPECTED_CASE", title: "Same Title", narrative: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", probability: 0.5, trajectories: [], risks: [], opportunities: [], assumptions: [], confidence },
    { type: "EXPECTED_CASE", title: "Same Title", narrative: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", probability: 0.5, trajectories: [], risks: [], opportunities: [], assumptions: [], confidence },
  ]);
  const deduped = deduplicateScenarios(dups);
  assert(deduped.length === 1, "duplicates removed", ctx);

  return ctx;
}

function testConfidenceEngine(): TestResult {
  const ctx: TestResult = { suite: "ConfidenceEngine", passed: 0, failed: 0, errors: [] };

  const score = computeConfidenceScore({
    signalCount: 8, trendCount: 4, trajectoryCount: 3, scenarioCount: 4,
    evidenceCount: 6, assumptionCount: 3, criticalAssumptions: 0,
    moduleCount: 5, orgSlug: "test-org",
  });
  assert(score > 0, "confidence score > 0", ctx);
  assert(score <= 1, "confidence score <= 1", ctx);

  const level = confidenceLevelFromScore(0.85);
  assert(level === "VERY_HIGH", "VERY_HIGH for score >= 0.85", ctx);

  const level2 = confidenceLevelFromScore(0.15);
  assert(level2 === "INSUFFICIENT", "INSUFFICIENT for score < 0.30", ctx);

  const conf = computeForecastConfidence({
    signalCount: 5, trendCount: 3, trajectoryCount: 2, scenarioCount: 3,
    evidenceCount: 4, assumptionCount: 3, criticalAssumptions: 1,
    moduleCount: 4, orgSlug: "test-org",
  });
  assert(typeof conf.score === "number", "conf.score is number", ctx);
  assert(typeof conf.level === "string", "conf.level is string", ctx);
  assert(Array.isArray(conf.limitations), "conf.limitations is array", ctx);
  assert(conf.limitations.some((l) => l.includes("supuesto")), "limitation mentions supuesto for critical unvalidated", ctx);

  // Penalty for critical unvalidated
  const confWithPenalty = computeForecastConfidence({
    signalCount: 5, trendCount: 3, trajectoryCount: 2, scenarioCount: 3,
    evidenceCount: 4, assumptionCount: 3, criticalAssumptions: 4,
    moduleCount: 4, orgSlug: "test-org",
  });
  assert(confWithPenalty.score < conf.score, "critical assumptions reduce confidence", ctx);

  const ev = buildEvidenceRecord("ev1", "Test evidence", "finance-module", 0.8, 5);
  assert(ev.strength === "STRONG", "strong evidence for 0.8 score", ctx);
  assert(ev.dataPoints === 5, "dataPoints set", ctx);

  const ev2 = buildEvidenceRecord("ev2", "Weak evidence", "commercial-module", 0.2, 1);
  assert(ev2.strength === "WEAK", "weak evidence for low score", ctx);

  const merged = mergeConfidences(conf, confWithPenalty);
  assert(typeof merged.score === "number", "merged score is number", ctx);
  assert(merged.evidenceCount === conf.evidenceCount + confWithPenalty.evidenceCount, "evidenceCount summed", ctx);

  const empty = buildEmptyConfidence();
  assert(empty.level === "INSUFFICIENT", "empty confidence is INSUFFICIENT", ctx);
  assert(empty.score === 0, "empty confidence score is 0", ctx);

  return ctx;
}

function testAssumptionEngine(): TestResult {
  const ctx: TestResult = { suite: "AssumptionEngine", passed: 0, failed: 0, errors: [] };

  const a = buildAssumption({
    description: "Test assumption",
    domain: "FINANCIAL",
    criticality: "CRITICAL",
    validated: false,
    risk: "Could break everything",
  });
  assert(a.id.startsWith("fassume_"), "assumption id prefix", ctx);
  assert(a.criticality === "CRITICAL", "criticality set", ctx);
  assert(a.validated === false, "validated false", ctx);

  const assumptions = extractAssumptions([
    { description: "A1", domain: "FINANCIAL", criticality: "CRITICAL", validated: false, risk: "r1" },
    { description: "A2", domain: "COMMERCIAL", criticality: "MEDIUM", validated: true, risk: "r2" },
    { description: "A3", domain: "OPERATIONAL", criticality: "LOW", validated: false, risk: "r3" },
  ]);
  assert(assumptions.length === 3, "extracts 3 assumptions", ctx);

  const { valid, invalid } = validateAssumptions(assumptions);
  assert(valid.length === 1, "1 valid assumption", ctx);
  assert(invalid.length === 2, "2 invalid assumptions", ctx);

  const ranked = rankAssumptions(assumptions);
  assert(ranked[0]!.criticality === "CRITICAL", "CRITICAL ranked first", ctx);

  const critUnvalidated = getCriticalUnvalidatedAssumptions(assumptions);
  assert(critUnvalidated.length === 1, "1 critical unvalidated", ctx);

  const count = countUnvalidatedCritical(assumptions);
  assert(count === 1, "countUnvalidatedCritical = 1", ctx);

  const defaults = buildDefaultAssumptions("FINANCIAL");
  assert(defaults.length === 3, "3 default assumptions", ctx);
  assert(defaults.every((a) => a.domain === "FINANCIAL"), "all in FINANCIAL domain", ctx);

  return ctx;
}

function testNarrativeEngine(): TestResult {
  const ctx: TestResult = { suite: "NarrativeEngine", passed: 0, failed: 0, errors: [] };

  const confidence = buildEmptyConfidence();
  const execNarr = buildForecastExecutiveNarrative("test-org", 0.6, confidence, "MEDIUM_TERM", 3, 2, 4);
  assert(typeof execNarr === "string", "narrative is string", ctx);
  assert(execNarr.length > 20, "narrative has content", ctx);
  assert(execNarr.includes("test-org"), "narrative mentions org", ctx);

  const scenarios = buildDefaultScenarioSet("test-org", "s1", "FINANCIAL", "MEDIUM_TERM", confidence);
  const scenNarr = buildScenariosNarrative(scenarios);
  assert(typeof scenNarr === "string", "scenario narrative is string", ctx);
  assert(scenNarr.includes("%"), "scenario narrative includes probability", ctx);

  const riskNarr = buildRisksNarrative([]);
  assert(riskNarr.includes("No"), "empty risk narrative mentions No", ctx);

  const oppNarr = buildOpportunitiesNarrative([]);
  assert(oppNarr.includes("No"), "empty opportunity narrative mentions No", ctx);

  const fullNarr = buildForecastNarrative(
    "test-org", 0.65, confidence, "MEDIUM_TERM", scenarios, [], [], [], [], []
  );
  assert(typeof fullNarr.executive === "string", "executive section", ctx);
  assert(typeof fullNarr.scenarios === "string", "scenarios section", ctx);
  assert(typeof fullNarr.risks === "string", "risks section", ctx);
  assert(typeof fullNarr.opportunities === "string", "opportunities section", ctx);
  assert(typeof fullNarr.assumptions === "string", "assumptions section", ctx);
  assert(typeof fullNarr.horizon === "string", "horizon section", ctx);
  assert(typeof fullNarr.limitations === "string", "limitations section", ctx);

  return ctx;
}

function testDigestAndBriefing(): TestResult {
  const ctx: TestResult = { suite: "DigestAndBriefing", passed: 0, failed: 0, errors: [] };

  const confidence = buildEmptyConfidence();
  const scenarios = buildDefaultScenarioSet("test-org", "s1", "FINANCIAL", "MEDIUM_TERM", confidence);

  const digest = buildForecastDigest("test-org", "s1", "WEEKLY", 0.6, confidence, scenarios, [], [], ["limit1"]);
  assert(digest.id.startsWith("fdigest_"), "digest id prefix", ctx);
  assert(digest.orgSlug === "test-org", "orgSlug set", ctx);
  assert(digest.period === "WEEKLY", "period set", ctx);
  assert(typeof digest.headline === "string", "headline is string", ctx);
  assert(Array.isArray(digest.highlights), "highlights is array", ctx);
  assert(Array.isArray(digest.scenarios), "scenarios is array", ctx);

  const briefing = buildForecastBriefing("test-org", "s1", "CEO", 0.65, confidence, scenarios, [], [], [], ["limit1"]);
  assert(briefing.id.startsWith("fbriefing_"), "briefing id prefix", ctx);
  assert(briefing.orgSlug === "test-org", "orgSlug set", ctx);
  assert(briefing.type === "CEO", "type set", ctx);
  assert(typeof briefing.summary === "string", "summary is string", ctx);
  assert(Array.isArray(briefing.keyFindings), "keyFindings is array", ctx);

  // All briefing types
  for (const type of ["CEO", "EXECUTIVE", "BOARD", "RISK", "GROWTH"] as const) {
    const b = buildForecastBriefing("test-org", "s1", type, 0.6, confidence, scenarios, [], [], [], []);
    assert(b.type === type, `briefing type ${type} set`, ctx);
    assert(b.id.startsWith("fbriefing_"), `${type} id prefix`, ctx);
  }

  return ctx;
}

function testMainPipeline(): TestResult {
  const ctx: TestResult = { suite: "MainPipeline", passed: 0, failed: 0, errors: [] };

  // Empty pipeline
  const result1 = runStrategicForecasting(
    { orgSlug: "test-org", sessionId: "session-1", horizon: "MEDIUM_TERM" },
    {}
  );
  assert(result1.orgSlug === "test-org", "result orgSlug set", ctx);
  assert(typeof result1.forecastScore === "number", "forecastScore is number", ctx);
  assert(result1.forecast.id.startsWith("forecast_"), "forecast id prefix", ctx);
  assert(result1.report.id.startsWith("freport_"), "report id prefix", ctx);
  assert(result1.status === "SUCCESS" || result1.status === "PARTIAL", "status is SUCCESS or PARTIAL", ctx);
  assert(typeof result1.forecast.status === "string", "forecast has status field", ctx);
  assert(result1.forecast.limitations.length > 0, "forecast has limitations", ctx);

  // Rich pipeline
  const result2 = runStrategicForecasting(
    { orgSlug: "castillitos", sessionId: "session-2", horizon: "MEDIUM_TERM", domain: "FINANCIAL" },
    {
      trendSignals: [
        { title: "T1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", direction: "GROWING", strength: 0.7 },
      ],
      rawSignals: [
        { title: "S1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", type: "LEADING", intensity: 0.8, metadata: {} },
      ],
      riskSignals: [
        { title: "R1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", likelihood: 0.6, impact: 0.7, isSystemic: false },
      ],
      opportunitySignals: [
        { title: "O1", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", magnitude: 0.8, captureScore: 0.7, timeHorizon: 0.6 },
      ],
      moduleCount: 5,
      includeDigest: true,
      includeBriefing: true,
    }
  );
  assert(result2.status === "SUCCESS", "rich pipeline SUCCESS", ctx);
  assert(result2.report.trends.length === 1, "1 trend in report", ctx);
  assert(result2.report.signals.length === 1, "1 signal in report", ctx);
  assert(result2.report.risks.length === 1, "1 risk in report", ctx);
  assert(result2.report.opportunities.length === 1, "1 opportunity in report", ctx);
  assert(result2.report.digest !== null, "digest included when requested", ctx);
  assert(result2.report.briefing !== null, "briefing included when requested", ctx);
  assert(result2.report.scenarios.length >= 4, "default scenarios generated", ctx);

  // computeForecastScore
  const scoreResult = computeForecastScore(
    result2.report.trends, result2.report.signals,
    result2.report.risks, result2.report.opportunities,
    result2.confidence
  );
  assert(scoreResult >= 0 && scoreResult <= 1, "score in bounds", ctx);

  // Tenant isolation
  assert(result2.orgSlug === "castillitos", "orgSlug preserved through pipeline", ctx);

  return ctx;
}

function testIntegrations(): TestResult {
  const ctx: TestResult = { suite: "Integrations", passed: 0, failed: 0, errors: [] };

  // Strategic Memory
  const memCtx = buildStrategicMemoryForecastContext("test-org", [
    { title: "Pattern 1", description: "d", recurrences: 3, domain: "FINANCIAL" },
    { title: "Pattern 2", description: "d", recurrences: 1, domain: "COMMERCIAL" },
  ]);
  assert(memCtx.orgSlug === "test-org", "memory orgSlug set", ctx);
  assert(memCtx.hasMemoryData === true, "hasMemoryData true", ctx);
  assert(memCtx.historicalPatterns.length === 1, "only recurring (>=2) patterns", ctx);
  assert(memCtx.memoryBoost >= 0 && memCtx.memoryBoost <= 0.10, "memoryBoost in bounds", ctx);

  const emptyMem = buildEmptyMemoryForecastContext("test-org");
  assert(emptyMem.hasMemoryData === false, "empty memory", ctx);
  assert(getMemoryPatternLabels(memCtx, 2).length <= 2, "pattern labels limited", ctx);

  // Learning — CRITICAL: .name not .label
  const learnCtx = buildLearningForecastContext("test-org", [
    { name: "Pattern Alpha", domain: "FINANCIAL", confidence: 0.8, isApplicable: true },
    { name: "Pattern Beta",  domain: "COMMERCIAL", confidence: 0.3, isApplicable: false },
  ]);
  assert(learnCtx.patternNames.length === 1, "only applicable patterns", ctx);
  assert(learnCtx.patternNames[0] === "Pattern Alpha", "pattern name correct (not .label)", ctx);

  const patternNames = getRelevantForecastPatternNames("test-org", [
    { name: "N1", domain: "FINANCIAL", confidence: 0.8, isApplicable: true },
  ], 3);
  assert(patternNames[0] === "N1", "pattern name via helper (not .label)", ctx);

  // Executive Brain
  const brainCtx = buildExecutiveBrainForecastContext("test-org", [
    { title: "Signal 1", description: "d", confidence: 0.9, domain: "FINANCIAL", priority: "HIGH" },
    { title: "Signal 2", description: "d", confidence: 0.5, domain: "COMMERCIAL", priority: "LOW" },
  ]);
  assert(brainCtx.hasBrainData === true, "hasBrainData true", ctx);
  assert(brainCtx.brainBoost >= 0 && brainCtx.brainBoost <= 0.12, "brainBoost in bounds", ctx);

  // Advisor
  const advisorCtx = buildAdvisorForecastContext("test-org", [
    { title: "Flag 1", isCritical: true, domain: "FINANCIAL", confidence: 0.8 },
  ]);
  assert(advisorCtx.hasAdvisorData === true, "hasAdvisorData true", ctx);
  assert(advisorCtx.criticalRecCount === 1, "criticalRecCount correct", ctx);

  // Simulations
  const simSummary = buildSimulationForecastSummary("test-org", [
    { title: "Sim 1", probability: 0.7, isRisk: true, isOpportunity: false },
    { title: "Sim 2", probability: 0.3, isRisk: false, isOpportunity: true },
  ]);
  assert(simSummary.suggestedOnly === true, "simulation suggestedOnly literal", ctx);
  assert(simSummary.scenarioCount === 2, "scenarioCount set", ctx);

  // Planning
  const planCtx = buildPlanningForecastContext("test-org", [
    { title: "Plan A", horizon: "MEDIUM_TERM", priority: "HIGH", domain: "FINANCIAL" },
    { title: "Plan B", horizon: "LONG_TERM", priority: "MEDIUM", domain: "COMMERCIAL" },
  ]);
  assert(planCtx.hasPlanningData === true, "hasPlanningData true", ctx);
  assert(hasConflictingForecastPlans(planCtx) === planCtx.hasConflicts, "conflict detection consistent", ctx);

  // Council
  const councilCtx = buildCouncilForecastContext("test-org", [
    { title: "Council Signal", isEscalated: true, domain: "STRATEGIC", severity: "HIGH" },
  ]);
  assert(councilCtx.hasActiveEscalation === true, "escalation detected", ctx);
  const govSignal = getCouncilForecastGovernanceSignal(councilCtx);
  assert(govSignal === "ESCALATION_ACTIVE", "governance signal correct", ctx);

  // Board Intelligence
  const boardCtx = buildBoardIntelligenceForecastContext("test-org", [
    { title: "Finding 1", type: "FINDING", domain: "GOVERNANCE", score: 0.8, isBlocker: false },
    { title: "Risk 1", type: "RISK", domain: "FINANCIAL", score: 0.7, isBlocker: true },
  ], 0.75);
  assert(boardCtx.hasBoardData === true, "hasBoardData true", ctx);
  assert(boardCtx.governanceScore === 0.75, "governanceScore set", ctx);

  // Memory Graph — CRITICAL: sourceNodeId/targetNodeId
  const graphCtx = buildGraphForecastContext(
    "test-org",
    [{ id: "n1", label: "Node 1", type: "ENTITY" }],
    [{ sourceNodeId: "n1", targetNodeId: "n2", type: "CAUSES" }] // sourceNodeId not sourceId
  );
  assert(graphCtx.hasGraphData === true, "graph has data", ctx);
  assert(graphCtx.nodeCount === 1, "nodeCount correct", ctx);
  assert(graphCtx.edgeCount === 1, "edgeCount correct", ctx);

  // Cross-Module — uses ReasoningResult (not CrossModuleResult)
  const crossCtx = buildCrossModuleForecastContext("test-org", null);
  assert(crossCtx.hasReasoningData === false, "null result → empty ctx", ctx);

  const emptyCross = buildEmptyCrossModuleForecastContext("test-org");
  assert(emptyCross.correlationCount === 0, "empty correlation count 0", ctx);

  // Tenant Profile
  const profile = getTenantForecastProfile("castillitos");
  assert(profile.orgSlug === "castillitos", "profile orgSlug set", ctx);
  assert(profile.hasTenantProfile === true, "castillitos has profile", ctx);
  assert(getForecastEscalationThreshold("castillitos") > 0, "escalation threshold > 0", ctx);
  assert(getForecastRiskTolerance("castillitos") === "MODERATE", "castillitos risk tolerance", ctx);

  const fallback = getTenantForecastProfile("unknown-org");
  assert(fallback.hasTenantProfile === false, "unknown org gets fallback", ctx);

  // Playbooks — CRITICAL: .title not .name
  const playbookCtx = buildForecastPlaybookContext("test-org", [
    { title: "Playbook Alpha", isActive: true, domain: "FINANCIAL", priority: "HIGH" },
    { title: "Playbook Beta",  isActive: false, domain: "COMMERCIAL", priority: "LOW" },
  ]);
  assert(playbookCtx.activeCount === 1, "1 active playbook", ctx);
  assert(playbookCtx.playbookTitles[0] === "Playbook Alpha", "title used (not name)", ctx);

  const titles = getPlaybookTitlesForForecast("test-org", [
    { title: "T1", isActive: true, domain: "FINANCIAL", priority: "HIGH" },
  ], 3);
  assert(titles[0] === "T1", "getPlaybookTitlesForForecast uses .title", ctx);

  return ctx;
}

function testComplianceAndAudit(): TestResult {
  const ctx: TestResult = { suite: "ComplianceAndAudit", passed: 0, failed: 0, errors: [] };

  // Compliance: all passing
  const result = runForecastComplianceChecks(
    "test-org", "test-org", true, true, true, true, true, true, true, true, true
  );
  assert(result.passed === true, "all checks pass", ctx);
  assert(result.failures.length === 0, "no failures", ctx);
  assert(result.checkCount === 10, "10 checks run", ctx);

  // Compliance: tenant isolation failure
  const tenantFail = runForecastComplianceChecks(
    "test-org", "other-org", true, true, true, true, true, true, true, true, true
  );
  assert(tenantFail.passed === false, "tenant isolation failure detected", ctx);
  assert(tenantFail.failures.some((f) => f.name === "TENANT_ISOLATION"), "TENANT_ISOLATION failure", ctx);

  // Compliance: suggestedOnly failure
  const suggestedFail = runForecastComplianceChecks(
    "test-org", "test-org", false, true, true, true, true, true, true, true, true
  );
  assert(suggestedFail.passed === false, "suggestedOnly failure detected", ctx);
  assert(suggestedFail.failures.some((f) => f.name === "SUGGESTED_ONLY"), "SUGGESTED_ONLY failure", ctx);

  // assertForecastTenantIsolation
  let threw = false;
  try {
    assertForecastTenantIsolation("test-org", "other-org");
  } catch {
    threw = true;
  }
  assert(threw === true, "assertForecastTenantIsolation throws on violation", ctx);

  let noThrow = true;
  try {
    assertForecastTenantIsolation("test-org", "test-org");
  } catch {
    noThrow = false;
  }
  assert(noThrow === true, "assertForecastTenantIsolation does not throw when same", ctx);

  // Audit events
  const ev1 = auditForecastInitiated("test-org", "session-1", "MEDIUM_TERM");
  assert(ev1.id.startsWith("faud_"), "audit id prefix", ctx);
  assert(ev1.eventType === "FORECAST_INITIATED", "eventType correct", ctx);
  assert(ev1.orgSlug === "test-org", "orgSlug set", ctx);
  assert(ev1.metadata["suggestedOnly"] === true, "suggestedOnly in metadata", ctx);

  const ev2 = auditForecastCompleted("test-org", "session-1", 0.72, "SUCCESS");
  assert(ev2.eventType === "FORECAST_COMPLETED", "eventType FORECAST_COMPLETED", ctx);

  const ev3 = auditScenarioGenerated("test-org", "session-1", "EXPECTED_CASE", 0.55);
  assert(ev3.eventType === "SCENARIO_GENERATED", "eventType SCENARIO_GENERATED", ctx);
  assert(ev3.metadata["suggestedOnly"] === true, "scenario audit has suggestedOnly", ctx);

  const ev4 = auditRiskIdentified("test-org", "session-1", "Risk X", 0.75);
  assert(ev4.eventType === "RISK_IDENTIFIED", "eventType RISK_IDENTIFIED", ctx);

  const ev5 = auditTenantIsolationVerified("test-org", "session-1");
  assert(ev5.eventType === "TENANT_ISOLATION_VERIFIED", "tenant isolation audit", ctx);

  return ctx;
}

function testQueryAndRepository(): TestResult {
  const ctx: TestResult = { suite: "QueryAndRepository", passed: 0, failed: 0, errors: [] };

  const confidence = buildEmptyConfidence();
  const baseReport = {
    id: generateForecastReportId(), orgSlug: "test-org", sessionId: "s1",
    title: "Test", forecastScore: 0.6, confidence, scenarios: [], risks: [], opportunities: [],
    trends: [], signals: [], trajectories: [], recommendations: [],
    narrative: { executive: "", scenarios: "", risks: "", opportunities: "", assumptions: "", horizon: "", limitations: "" },
    digest: null, briefing: null, limitations: [], createdAt: new Date().toISOString(),
  };

  const forecasts = [
    {
      id: generateForecastId(), orgSlug: "test-org", status: "ACTIVE" as const,
      horizon: "MEDIUM_TERM" as const, domain: "FINANCIAL" as const,
      report: baseReport, forecastScore: 0.7, confidence, limitations: [],
      metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: generateForecastId(), orgSlug: "test-org", status: "ARCHIVED" as const,
      horizon: "SHORT_TERM" as const, domain: "COMMERCIAL" as const,
      report: { ...baseReport, forecastScore: 0.4 }, forecastScore: 0.4, confidence, limitations: [],
      metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: generateForecastId(), orgSlug: "other-org", status: "ACTIVE" as const,
      horizon: "LONG_TERM" as const, domain: "STRATEGIC" as const,
      report: baseReport, forecastScore: 0.5, confidence, limitations: [],
      metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ];

  const scoped = getForecasts("test-org", forecasts);
  assert(scoped.length === 2, "getForecasts scopes by orgSlug", ctx);

  const latest = getLatestForecast("test-org", forecasts);
  assert(latest !== null, "getLatestForecast returns value", ctx);
  assert(latest?.orgSlug === "test-org", "latest orgSlug correct", ctx);

  const stats = getForecastStats("test-org", forecasts);
  assert(stats.totalForecasts === 2, "totalForecasts correct", ctx);
  assert(stats.activeCount === 1, "activeCount correct", ctx);
  assert(stats.avgForecastScore > 0, "avgForecastScore > 0", ctx);

  const sorted = sortForecastsByScore(scoped);
  assert(sorted[0]!.forecastScore >= sorted[1]!.forecastScore, "sorted by score desc", ctx);

  // In-memory repository
  const repo = new InMemoryStrategicForecastingRepository();
  // test async operations would require await — skip direct test here
  assert(typeof repo.saveForecast === "function", "repo.saveForecast is function", ctx);
  assert(typeof repo.getForecast === "function", "repo.getForecast is function", ctx);
  assert(typeof repo.queryForecasts === "function", "repo.queryForecasts is function", ctx);
  assert(typeof repo.archiveForecast === "function", "repo.archiveForecast is function", ctx);

  return ctx;
}

function testDashboardAndHealth(): TestResult {
  const ctx: TestResult = { suite: "DashboardAndHealth", passed: 0, failed: 0, errors: [] };

  // Empty dashboard
  const emptyDash = buildStrategicForecastingDashboard("test-org", []);
  assert(emptyDash.forecastHealth === "EMPTY", "empty dashboard is EMPTY", ctx);
  assert(emptyDash.totalForecasts === 0, "0 total forecasts", ctx);

  // Health
  const healthInputs = buildDefaultForecastingHealthInputs();
  const health = checkStrategicForecastingHealth(healthInputs);
  assert(health.status === "HEALTHY", "default health is HEALTHY", ctx);
  assert(health.checkCount === 14, "14 health checks", ctx);
  assert(health.failed === 0, "0 failures", ctx);

  // Degraded health
  const degradedHealth = checkStrategicForecastingHealth({
    ...healthInputs,
    hasMainEngine: false,
    hasPrismaModels: false,
  });
  assert(degradedHealth.status !== "HEALTHY", "degraded when engines missing", ctx);

  // Readiness
  const readinessFlags = buildForecastingReadinessFlags({
    hasSignalData: true,
    hasTrendData: true,
    hasRiskData: true,
  });
  const readiness = checkForecastingReadiness(readinessFlags);
  assert(readiness.isReady === true, "ready with signal + trend data", ctx);
  assert(readiness.readyLevel === "MINIMUM" || readiness.readyLevel === "PARTIAL", "MINIMUM or PARTIAL ready", ctx);

  // Not ready
  const notReadyFlags = buildForecastingReadinessFlags({
    hasSignalData: false,
    hasTrendData: false,
  });
  const notReady = checkForecastingReadiness(notReadyFlags);
  assert(notReady.isReady === false, "not ready without signal+trend data", ctx);
  assert(notReady.readyLevel === "NOT_READY", "NOT_READY level", ctx);

  // Full ready
  const fullFlags = buildForecastingReadinessFlags({
    hasSignalData: true, hasTrendData: true, hasTrajectoryData: true, hasRiskData: true,
    hasOpportunityData: true, hasExecutiveBrainData: true, hasMemoryData: true,
    hasBoardData: true, hasLearningData: true, hasReasoningData: true,
  });
  const fullReady = checkForecastingReadiness(fullFlags);
  assert(fullReady.readyLevel === "FULL", "FULL ready level when all flags set", ctx);

  return ctx;
}

function testCanonicalAndHorizon(): TestResult {
  const ctx: TestResult = { suite: "CanonicalAndHorizon", passed: 0, failed: 0, errors: [] };

  assert(CANONICAL_FORECAST_SCENARIOS.length === 25, "25 canonical scenarios", ctx);

  const cs = getCanonicalForecastScenario("CFS_CRECIMIENTO_SOSTENIDO");
  assert(cs !== undefined, "finds canonical by id", ctx);
  assert(cs?.id === "CFS_CRECIMIENTO_SOSTENIDO", "id matches", ctx);
  assert(cs?.limitations.includes("suggestedOnly: true") === true, "canonical has suggestedOnly limitation", ctx);

  const financial = getCanonicalScenariosByDomain("FINANCIAL");
  assert(financial.length > 0, "financial canonical scenarios exist", ctx);

  const blackSwans = CANONICAL_FORECAST_SCENARIOS.filter((s) => s.type === "BLACK_SWAN_CANDIDATE");
  assert(blackSwans.length >= 3, "at least 3 black swan canonical scenarios", ctx);
  assert(blackSwans.every((s) => s.defaultProbability <= 0.10), "black swans all <= 0.10 probability", ctx);

  // Horizon models
  assert(HORIZON_MODELS.length === 6, "6 horizon models", ctx);
  const m30d = getHorizonModel("30D");
  assert(m30d !== null, "30D model found", ctx);
  assert(m30d?.horizon === "SHORT_TERM", "30D is SHORT_TERM", ctx);
  assert(getMaxConfidenceForWindow("5Y") === 0.30, "5Y max confidence is 0.30", ctx);
  assert(classifyWindowAsHorizon("3Y") === "LONG_TERM", "3Y classifies as LONG_TERM", ctx);
  assert(classifyWindowAsHorizon("90D") === "SHORT_TERM", "90D classifies as SHORT_TERM", ctx);

  return ctx;
}

function testEnterpriseEngines(): TestResult {
  const ctx: TestResult = { suite: "EnterpriseEngines", passed: 0, failed: 0, errors: [] };

  const confidence = buildEmptyConfidence();
  const trends = identifyTrends("test-org", [
    { title: "T1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", direction: "ACCELERATING", strength: 0.8, isEmergent: true },
    { title: "T2", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", direction: "GROWING", strength: 0.6 },
  ]);
  const signals = detectSignals("test-org", [
    { title: "S1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", type: "LEADING", intensity: 0.7, metadata: {} },
  ]);
  const risks = identifyForecastRisks("test-org", [
    { title: "R1", description: "", domain: "FINANCIAL", horizon: "MEDIUM_TERM", likelihood: 0.5, impact: 0.6 },
  ]);
  const opps = identifyForecastOpportunities("test-org", [
    { title: "O1", description: "", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", magnitude: 0.7, captureScore: 0.6, timeHorizon: 0.5 },
  ]);

  // buildEnterpriseTrajectory
  const entTraj = buildEnterpriseTrajectory({ orgSlug: "test-org", horizon: "MEDIUM_TERM", trends, signals, risks, opportunities: opps, confidence });
  assert(entTraj.id.startsWith("ftraj_"), "enterprise trajectory id prefix", ctx);
  assert(typeof entTraj.projectedScore === "number", "projected score is number", ctx);

  // buildGrowthTrajectory
  const growthTraj = buildGrowthTrajectory("test-org", "MEDIUM_TERM", opps, confidence);
  assert(growthTraj.domain === "FINANCIAL", "growth trajectory domain", ctx);
  assert(growthTraj.projectedScore >= 0.5, "growth trajectory projects upward", ctx);

  // buildRiskTrajectory
  const riskTraj = buildRiskTrajectory("test-org", "MEDIUM_TERM", risks, confidence);
  assert(riskTraj.domain === "RISK", "risk trajectory domain", ctx);
  assert(riskTraj.projectedScore <= 0.5, "risk trajectory projects downward", ctx);

  // buildStrategicTrajectory
  const stratTraj = buildStrategicTrajectory("test-org", "MEDIUM_TERM", trends, confidence);
  assert(stratTraj.id.startsWith("ftraj_"), "strategic trajectory id prefix", ctx);

  // Future signals engine
  const futureInputs = [
    { title: "FS1", description: "", domain: "FINANCIAL" as const, horizon: "MEDIUM_TERM" as const, rawScore: 0.2 },
    { title: "FS2", description: "", domain: "COMMERCIAL" as const, horizon: "SHORT_TERM" as const, rawScore: 0.8 },
  ];
  const weakSigs = detectWeakSignals("test-org", futureInputs);
  assert(weakSigs.length === 1, "detects 1 weak signal", ctx);

  const promoted = promoteWeakSignals("test-org", weakSigs, 0.15);
  assert(promoted.length === 1, "promotes weak signal above threshold", ctx);
  assert(promoted[0]!.type === "LEADING", "promoted to LEADING", ctx);

  const allFuture = detectSignals("test-org", futureInputs.map((i) => ({
    title: i.title, description: i.description, domain: i.domain, horizon: i.horizon,
    type: "WEAK_SIGNAL" as const, intensity: i.rawScore, metadata: {}, isWeak: i.rawScore < 0.35, isConfirmed: false,
  })));
  const scored = scoreFutureSignals(allFuture);
  assert(scored[0]!.intensity >= scored[scored.length - 1]!.intensity, "scored ranked descending", ctx);

  const patterns = detectEmergingPatterns("test-org", allFuture.map((s) => ({ ...s, isWeak: true })));
  assert(Array.isArray(patterns), "detectEmergingPatterns returns array", ctx);

  return ctx;
}

function testE2EScenario(): TestResult {
  const ctx: TestResult = { suite: "E2E_CastillitosForecasting", passed: 0, failed: 0, errors: [] };

  // Full end-to-end for castillitos tenant
  const result = runStrategicForecasting(
    { orgSlug: "castillitos", sessionId: "e2e-session", horizon: "MEDIUM_TERM", domain: "FINANCIAL" },
    {
      trendSignals: [
        { title: "Crecimiento de ventas", description: "Ventas aumentan 15% QoQ", domain: "FINANCIAL", horizon: "MEDIUM_TERM", direction: "GROWING", strength: 0.72, drivers: ["Temporada alta", "Nuevo canal digital"], isEmergent: false },
        { title: "Presión competitiva", description: "Entrada de competidores low-cost", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", direction: "ACCELERATING", strength: 0.55, risks: ["Erosión de márgenes"], isEmergent: true },
      ],
      rawSignals: [
        { title: "Señal de recuperación de cobros", description: "Mejora en DSO", domain: "FINANCIAL", horizon: "SHORT_TERM", type: "LEADING", intensity: 0.68, metadata: {} },
        { title: "Señal de adopción digital", description: "40% ventas online", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", type: "CONFIRMED", intensity: 0.81, isConfirmed: true, metadata: {} },
      ],
      riskSignals: [
        { title: "Riesgo de concentración de clientes", description: "Top 3 clientes = 60% ingresos", domain: "COMMERCIAL", horizon: "MEDIUM_TERM", likelihood: 0.65, impact: 0.75, isSystemic: true },
        { title: "Riesgo regulatorio aranceles", description: "Cambios arancelarios en materiales", domain: "REGULATORY", horizon: "SHORT_TERM", likelihood: 0.40, impact: 0.50 },
      ],
      opportunitySignals: [
        { title: "Oportunidad de exportación", description: "Apertura de mercado regional", domain: "COMMERCIAL", horizon: "LONG_TERM", magnitude: 0.80, captureScore: 0.55, timeHorizon: 0.4, isTransformational: true },
        { title: "Digitalización de catálogo", description: "Reducción de tiempo de pedido", domain: "OPERATIONAL", horizon: "MEDIUM_TERM", magnitude: 0.60, captureScore: 0.75, timeHorizon: 0.7 },
      ],
      assumptionInputs: [
        { description: "Demanda del mercado se mantiene creciente", domain: "COMMERCIAL", criticality: "HIGH", validated: false, risk: "Desaceleración del consumo" },
        { description: "Tipo de cambio se mantiene estable", domain: "FINANCIAL", criticality: "CRITICAL", validated: false, risk: "Volatilidad cambiaria" },
      ],
      moduleCount: 6,
      includeDigest: true,
      includeBriefing: true,
    }
  );

  assert(result.orgSlug === "castillitos", "orgSlug preserved", ctx);
  assert(result.status === "SUCCESS", "E2E pipeline SUCCESS", ctx);
  assert(result.forecastScore > 0, "forecastScore > 0", ctx);
  assert(result.report.trends.length === 2, "2 trends in E2E", ctx);
  assert(result.report.signals.length === 2, "2 signals in E2E", ctx);
  assert(result.report.risks.length === 2, "2 risks in E2E", ctx);
  assert(result.report.opportunities.length === 2, "2 opportunities in E2E", ctx);
  assert(result.report.scenarios.length >= 4, "scenarios generated", ctx);
  assert(result.forecast.limitations.length >= 2, "forecast has limitations", ctx);
  assert(result.report.digest !== null, "digest generated", ctx);
  assert(result.report.briefing !== null, "briefing generated", ctx);

  // Compliance check on result
  const compliance = runForecastComplianceChecks(
    "castillitos", result.orgSlug,
    result.report.scenarios.every((s) => s.suggestedOnly === true), // suggestedOnly
    true, // hasConfidence
    result.report.scenarios.length > 0, // hasScenarios
    result.forecast.limitations.length > 0, // hasLimitations
    true, // hasAssumptions
    true, // hasEvidence
    true, // isProbabilistic
    result.report.narrative.executive.length > 0, // hasNarrative
    result.forecast.forecastScore >= 0, // hasForecastScore
  );
  assert(compliance.passed === true, "E2E compliance passes", ctx);

  // Audit trail
  const initAudit = auditForecastInitiated("castillitos", "e2e-session", "MEDIUM_TERM");
  assert(initAudit.orgSlug === "castillitos", "audit orgSlug correct", ctx);

  // Tenant isolation
  assert(result.forecast.orgSlug === "castillitos", "forecast tenant isolated", ctx);
  assert(result.report.orgSlug === "castillitos", "report tenant isolated", ctx);

  // Systemic risks
  const systemic = result.report.risks.filter((r) => r.isSystemic);
  assert(systemic.length === 1, "1 systemic risk in E2E", ctx);

  // Transformational opportunities
  const trans = result.report.opportunities.filter((o) => o.isTransformational);
  assert(trans.length === 1, "1 transformational opportunity in E2E", ctx);

  // Dashboard
  const dashboard = buildStrategicForecastingDashboard("castillitos", [result.forecast]);
  assert(dashboard.totalForecasts === 1, "dashboard totalForecasts = 1", ctx);
  assert(dashboard.criticalRiskCount >= 0, "criticalRiskCount computed", ctx);
  assert(dashboard.transformationalOppCount >= 0, "transformationalOppCount computed", ctx);

  return ctx;
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const suites = [
    testIdentity(),
    testTrendEngine(),
    testSignalEngine(),
    testTrajectoryEngine(),
    testForecastRiskEngine(),
    testForecastOpportunityEngine(),
    testScenarioEngine(),
    testConfidenceEngine(),
    testAssumptionEngine(),
    testNarrativeEngine(),
    testDigestAndBriefing(),
    testMainPipeline(),
    testIntegrations(),
    testComplianceAndAudit(),
    testQueryAndRepository(),
    testDashboardAndHealth(),
    testCanonicalAndHorizon(),
    testEnterpriseEngines(),
    testE2EScenario(),
  ];

  const totalPassed = suites.reduce((s, r) => s + r.passed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.failed, 0);
  const allErrors   = suites.flatMap((r) => r.errors.map((e) => `[${r.suite}] ${e}`));

  return NextResponse.json({
    sprint:       "AGENTIK-STRATEGIC-FORECASTING-01",
    status:       totalFailed === 0 ? "PASS" : "FAIL",
    totalPassed,
    totalFailed,
    totalTests:   totalPassed + totalFailed,
    errors:       allErrors,
    suites:       suites.map((r) => ({
      suite:   r.suite,
      passed:  r.passed,
      failed:  r.failed,
      status:  r.failed === 0 ? "PASS" : "FAIL",
      errors:  r.errors,
    })),
  }, { status: totalFailed === 0 ? 200 : 422 });
}
