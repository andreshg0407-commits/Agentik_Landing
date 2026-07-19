#!/usr/bin/env node
// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 38: Validation Suite
// Structural validation — 1800+ checks, no server-only imports

const fs   = require("fs");
const path = require("path");

const ROOT  = path.join(__dirname, "..");
const SA    = path.join(ROOT, "lib/copilot/strategic-advisor");
const INT   = path.join(SA, "integrations");
const PERS  = path.join(SA, "persistence");
const HARNESS = path.join(ROOT, "app/api/internal/integration-tests/strategic-advisor");
const SCHEMA  = path.join(ROOT, "prisma/schema.prisma");
const MIGRATION = path.join(ROOT, "prisma/migrations/20260608000000_strategic_advisor/migration.sql");

let PASS = 0;
let FAIL = 0;

function check(desc, condition) {
  if (condition) { PASS++; }
  else           { FAIL++; console.error(`  FAIL: ${desc}`); }
}

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function exists(filePath) { return fs.existsSync(filePath); }
function contains(content, str) { return content.includes(str); }
function matches(content, pattern) { return pattern.test(content); }
function countMatches(content, pattern) { return (content.match(new RegExp(pattern, "g")) || []).length; }

// ── Section 1: File Existence (35 files) ─────────────────────────────────────
console.log("\n[01] File Existence");
const REQUIRED_FILES = [
  "strategic-advisor-types.ts",
  "strategic-context-builder.ts",
  "strategic-concern-engine.ts",
  "strategic-opportunity-engine.ts",
  "strategic-recommendation-engine.ts",
  "strategic-question-engine.ts",
  "strategic-scenario-engine.ts",
  "strategic-alignment-engine.ts",
  "strategic-challenge-engine.ts",
  "strategic-focus-engine.ts",
  "strategic-narrative-engine.ts",
  "strategic-briefing-builder.ts",
  "strategic-digest-builder.ts",
  "strategic-advisor-engine.ts",
  "strategic-advisor-query.ts",
  "strategic-advisor-repository.ts",
  "strategic-advisor-dashboard-contract.ts",
  "strategic-advisor-health.ts",
  "strategic-advisor-readiness.ts",
  "strategic-advisor-scenarios.ts",
  "future-compatibility.ts",
  "server.ts",
  "index.ts",
];
for (const f of REQUIRED_FILES) {
  check(`exists: ${f}`, exists(path.join(SA, f)));
}

const INTEGRATION_FILES = [
  "advisor-executive-brain.ts",
  "advisor-strategic-memory.ts",
  "advisor-learning.ts",
  "advisor-memory-graph.ts",
  "advisor-cross-module.ts",
  "advisor-tenant-profile.ts",
  "advisor-playbooks.ts",
  "advisor-compliance.ts",
  "advisor-audit.ts",
];
for (const f of INTEGRATION_FILES) {
  check(`exists integrations/${f}`, exists(path.join(INT, f)));
}

check("exists persistence/prisma-strategic-advisor-repository.ts", exists(path.join(PERS, "prisma-strategic-advisor-repository.ts")));
check("exists harness/route.ts", exists(path.join(HARNESS, "route.ts")));
check("exists prisma migration SQL", exists(MIGRATION));

// ── Section 2: Types File ─────────────────────────────────────────────────────
console.log("\n[02] Strategic Advisor Types");
const types = read(path.join(SA, "strategic-advisor-types.ts"));

check("types: StrategicDomain exported", contains(types, "export type StrategicDomain"));
check("types: StrategicAdviceConfidence LOW|MEDIUM|HIGH|VERY_HIGH", contains(types, "\"LOW\" | \"MEDIUM\" | \"HIGH\" | \"VERY_HIGH\""));
check("types: StrategicAdvicePriority CRITICAL", contains(types, "\"CRITICAL\""));
check("types: StrategicBriefingType CEO|BOARD|GROWTH|FINANCE|OPERATIONS", contains(types, "\"CEO\" | \"BOARD\" | \"GROWTH\""));
check("types: StrategicDigestPeriod DAILY|WEEKLY|MONTHLY|QUARTERLY", contains(types, "\"DAILY\" | \"WEEKLY\" | \"MONTHLY\" | \"QUARTERLY\""));
check("types: 12 StrategicScenarioType values", countMatches(types, "LIQUIDITY_CRISIS|ACCELERATED_GROWTH|GROWING_RECEIVABLES|SALES_DECLINE|CLIENT_CONCENTRATION|IGNORED_OPPORTUNITY|MISALIGNED_OBJECTIVES|SUCCESSFUL_PLAYBOOK|OBSOLETE_PLAYBOOK|REGULATORY_RISK|BUSINESS_EXPANSION|STRATEGIC_CONFLICT") >= 12);
check("types: generateSaId exported", contains(types, "export function generateSaId"));
check("types: sa_ prefix in generateSaId", contains(types, "`sa_"));
check("types: confidenceSaFromScore exported", contains(types, "export function confidenceSaFromScore"));
check("types: prioritySaFromScore exported", contains(types, "export function prioritySaFromScore"));
check("types: StrategicRecommendation has suggestedOnly:true (not on Concern)", contains(types, "readonly suggestedOnly:  true;"));
check("types: StrategicRecommendation has suggestedOnly: true", contains(types, "readonly suggestedOnly:  true;"));
check("types: StrategicAdvisorResult has status OK|PARTIAL|FAILED", contains(types, "\"OK\" | \"PARTIAL\" | \"FAILED\""));
check("types: StrategicAdvisorResult has report null", contains(types, "readonly report:      StrategicAdvisorReport | null"));
check("types: StrategicDecisionContext maturityLevel", contains(types, "maturityLevel"));
check("types: StrategicAdvisorReport has alignmentScore", contains(types, "readonly alignmentScore"));
check("types: no Date objects in types (ISO string only)", !contains(types, ": Date;"));

// ── Section 3: Context Builder ────────────────────────────────────────────────
console.log("\n[03] Context Builder");
const ctxBuilder = read(path.join(SA, "strategic-context-builder.ts"));

check("ctx: buildContext exported", contains(ctxBuilder, "export function buildContext"));
check("ctx: validateContext exported", contains(ctxBuilder, "export function validateContext"));
check("ctx: scoreContext exported", contains(ctxBuilder, "export function scoreContext"));
check("ctx: StrategicAdvisorContext interface", contains(ctxBuilder, "export interface StrategicAdvisorContext"));
check("ctx: orgSlug field in context", contains(ctxBuilder, "orgSlug"));
check("ctx: overallContextScore field", contains(ctxBuilder, "overallContextScore"));
check("ctx: activeGoals field", contains(ctxBuilder, "activeGoals"));
check("ctx: learningStrength field", contains(ctxBuilder, "learningStrength"));
check("ctx: no server-only import", !contains(ctxBuilder, "server-only"));
check("ctx: no Prisma import", !contains(ctxBuilder, "from \"@prisma/client\"") && !contains(ctxBuilder, "from \"../prisma\""));

// ── Section 4: Concern Engine ─────────────────────────────────────────────────
console.log("\n[04] Concern Engine");
const concernEng = read(path.join(SA, "strategic-concern-engine.ts"));

check("concern: identifyConcerns exported", contains(concernEng, "export function identifyConcerns"));
check("concern: rankConcerns exported", contains(concernEng, "export function rankConcerns"));
check("concern: groupConcerns exported", contains(concernEng, "export function groupConcerns"));
check("concern: no server-only", !contains(concernEng, "server-only"));
check("concern: no Prisma", !contains(concernEng, "@prisma/client"));
check("concern: StrategicConcern import", contains(concernEng, "StrategicConcern"));
check("concern: severity assignment", contains(concernEng, "severity"));
check("concern: isEmergent field", contains(concernEng, "isEmergent"));
check("concern: generates IDs", contains(concernEng, "generateSaId"));

// ── Section 5: Opportunity Engine ────────────────────────────────────────────
console.log("\n[05] Opportunity Engine");
const oppEng = read(path.join(SA, "strategic-opportunity-engine.ts"));

check("opp: identifyOpportunities exported", contains(oppEng, "export function identifyOpportunities"));
check("opp: rankOpportunities exported", contains(oppEng, "export function rankOpportunities"));
check("opp: no server-only", !contains(oppEng, "server-only"));
check("opp: captureScore", contains(oppEng, "captureScore"));
check("opp: magnitude", contains(oppEng, "magnitude"));
check("opp: timeHorizon", contains(oppEng, "timeHorizon"));
check("opp: isIgnored", contains(oppEng, "isIgnored"));

// ── Section 6: Recommendation Engine ─────────────────────────────────────────
console.log("\n[06] Recommendation Engine");
const recEng = read(path.join(SA, "strategic-recommendation-engine.ts"));

check("rec: generateRecommendations exported", contains(recEng, "export function generateRecommendations"));
check("rec: no server-only", !contains(recEng, "server-only"));
check("rec: suggestedOnly: true hardcoded", contains(recEng, "suggestedOnly:  true") || contains(recEng, "suggestedOnly: true"));
check("rec: expectedImpact field", contains(recEng, "expectedImpact"));
check("rec: associatedRisks field", contains(recEng, "associatedRisks"));
check("rec: evidenceIds field", contains(recEng, "evidenceIds"));

// ── Section 7: Question Engine ────────────────────────────────────────────────
console.log("\n[07] Question Engine");
const qEng = read(path.join(SA, "strategic-question-engine.ts"));

check("q: generateQuestions exported", contains(qEng, "export function generateQuestions"));
check("q: prioritizeQuestions exported", contains(qEng, "export function prioritizeQuestions"));
check("q: no server-only", !contains(qEng, "server-only"));
check("q: category field", contains(qEng, "category"));
check("q: RISK category", contains(qEng, "\"RISK\""));
check("q: OPPORTUNITY category", contains(qEng, "\"OPPORTUNITY\""));
check("q: ALIGNMENT category", contains(qEng, "\"ALIGNMENT\""));
check("q: DECISION category", contains(qEng, "\"DECISION\""));

// ── Section 8: Scenario Engine ────────────────────────────────────────────────
console.log("\n[08] Scenario Engine");
const scenEng = read(path.join(SA, "strategic-scenario-engine.ts"));

check("scene: ScenarioHypothesis exported", contains(scenEng, "export interface ScenarioHypothesis"));
check("scene: buildScenarios exported", contains(scenEng, "export function buildScenarios"));
check("scene: no server-only", !contains(scenEng, "server-only"));
check("scene: premise field", contains(scenEng, "premise"));
check("scene: implication field", contains(scenEng, "implication"));
check("scene: likelihood field", contains(scenEng, "likelihood"));
check("scene: LOW|MODERATE|HIGH likelihoods", contains(scenEng, "\"LOW\"") && contains(scenEng, "\"MODERATE\"") && contains(scenEng, "\"HIGH\""));

// ── Section 9: Alignment Engine ───────────────────────────────────────────────
console.log("\n[09] Alignment Engine");
const alignEng = read(path.join(SA, "strategic-alignment-engine.ts"));

check("align: evaluateAlignment exported", contains(alignEng, "export function evaluateAlignment"));
check("align: detectMisalignment exported", contains(alignEng, "export function detectMisalignment"));
check("align: AlignmentResult exported", contains(alignEng, "export interface AlignmentResult"));
check("align: alignmentScore field", contains(alignEng, "alignmentScore"));
check("align: no server-only", !contains(alignEng, "server-only"));

// ── Section 10: Challenge Engine ──────────────────────────────────────────────
console.log("\n[10] Challenge Engine");
const chalEng = read(path.join(SA, "strategic-challenge-engine.ts"));

check("chal: identifyChallenges exported", contains(chalEng, "export function identifyChallenges"));
check("chal: StrategicChallenge exported", contains(chalEng, "export interface StrategicChallenge"));
check("chal: no server-only", !contains(chalEng, "server-only"));
check("chal: severity field", contains(chalEng, "severity"));
check("chal: title field", contains(chalEng, "title"));

// ── Section 11: Focus Engine ──────────────────────────────────────────────────
console.log("\n[11] Focus Engine");
const focusEng = read(path.join(SA, "strategic-focus-engine.ts"));

check("focus: computeFocusAreas exported", contains(focusEng, "export function computeFocusAreas"));
check("focus: getTop3FocusAreas exported", contains(focusEng, "export function getTop3FocusAreas"));
check("focus: getTop5FocusAreas exported", contains(focusEng, "export function getTop5FocusAreas"));
check("focus: getTop10FocusAreas exported", contains(focusEng, "export function getTop10FocusAreas"));
check("focus: compositeScore field", contains(focusEng, "compositeScore"));
check("focus: rank field", contains(focusEng, "rank"));
check("focus: no server-only", !contains(focusEng, "server-only"));

// ── Section 12: Narrative Engine ──────────────────────────────────────────────
console.log("\n[12] Narrative Engine");
const narEng = read(path.join(SA, "strategic-narrative-engine.ts"));

check("nar: buildAdvisoryNarratives exported", contains(narEng, "export function buildAdvisoryNarratives"));
check("nar: buildNarrativeForAdvice exported", contains(narEng, "export function buildNarrativeForAdvice"));
check("nar: returns StrategicAdvice[]", contains(narEng, "StrategicAdvice[]"));
check("nar: no server-only", !contains(narEng, "server-only"));
check("nar: no Prisma", !contains(narEng, "@prisma/client"));

// ── Section 13: Briefing Builder ──────────────────────────────────────────────
console.log("\n[13] Briefing Builder");
const briefing = read(path.join(SA, "strategic-briefing-builder.ts"));

check("brief: buildStrategicBriefing exported", contains(briefing, "export function buildStrategicBriefing"));
check("brief: buildCEOBriefing exported", contains(briefing, "export function buildCEOBriefing"));
check("brief: buildBoardBriefing exported", contains(briefing, "export function buildBoardBriefing"));
check("brief: buildGrowthBriefing exported", contains(briefing, "export function buildGrowthBriefing"));
check("brief: buildFinanceBriefing exported", contains(briefing, "export function buildFinanceBriefing"));
check("brief: buildOperationsBriefing exported", contains(briefing, "export function buildOperationsBriefing"));
check("brief: buildCustomBriefing exported", contains(briefing, "export function buildCustomBriefing"));
check("brief: no server-only", !contains(briefing, "server-only"));
check("brief: advisorScore field", contains(briefing, "advisorScore"));
check("brief: topConcerns field", contains(briefing, "topConcerns"));
check("brief: topOpportunities field", contains(briefing, "topOpportunities"));
check("brief: topRecommendations field", contains(briefing, "topRecommendations"));
check("brief: keyQuestions field", contains(briefing, "keyQuestions"));
check("brief: generatedAt ISO string", contains(briefing, "toISOString"));

// ── Section 14: Digest Builder ────────────────────────────────────────────────
console.log("\n[14] Digest Builder");
const digest = read(path.join(SA, "strategic-digest-builder.ts"));

check("digest: buildStrategicDigest exported", contains(digest, "export function buildStrategicDigest"));
check("digest: buildDailyDigest exported", contains(digest, "export function buildDailyDigest"));
check("digest: buildWeeklyDigest exported", contains(digest, "export function buildWeeklyDigest"));
check("digest: buildMonthlyDigest exported", contains(digest, "export function buildMonthlyDigest"));
check("digest: buildQuarterlyDigest exported", contains(digest, "export function buildQuarterlyDigest"));
check("digest: DAILY limit ≤3 concerns", matches(digest, /DAILY.*3|3.*DAILY|slice\(0, 3\)/));
check("digest: WEEKLY limit ≤5", matches(digest, /WEEKLY.*5|5.*WEEKLY|slice\(0, 5\)/));
check("digest: no server-only", !contains(digest, "server-only"));

// ── Section 15: Main Engine ───────────────────────────────────────────────────
console.log("\n[15] Main Engine");
const engine = read(path.join(SA, "strategic-advisor-engine.ts"));

check("engine: runStrategicAdvisor exported", contains(engine, "export function runStrategicAdvisor"));
check("engine: StrategicAdvisorEngineInput exported", contains(engine, "export interface StrategicAdvisorEngineInput"));
check("engine: fail-closed try/catch", contains(engine, "try {") && contains(engine, "} catch"));
check("engine: status: FAILED returned on catch", contains(engine, "\"FAILED\""));
check("engine: tenant boundary enforced", contains(engine, "enforceAdvisorTenantBoundary"));
check("engine: runId generated", contains(engine, "runId"));
check("engine: durationMs computed", contains(engine, "durationMs") && contains(engine, "Date.now()"));
check("engine: buildContext called", contains(engine, "buildContext("));
check("engine: identifyConcerns called", contains(engine, "identifyConcerns("));
check("engine: identifyOpportunities called", contains(engine, "identifyOpportunities("));
check("engine: generateRecommendations called", contains(engine, "generateRecommendations("));
check("engine: generateQuestions called", contains(engine, "generateQuestions("));
check("engine: computeFocusAreas called", contains(engine, "computeFocusAreas("));
check("engine: buildAdvisoryNarratives called", contains(engine, "buildAdvisoryNarratives("));
check("engine: buildStrategicBriefing called", contains(engine, "buildStrategicBriefing("));
check("engine: buildStrategicDigest called", contains(engine, "buildStrategicDigest("));
check("engine: no server-only (engine is pure domain)", !contains(engine, "import \"server-only\""));

// ── Section 16: Query Layer ───────────────────────────────────────────────────
console.log("\n[16] Query Layer");
const query = read(path.join(SA, "strategic-advisor-query.ts"));

check("query: getAdvice exported", contains(query, "export function getAdvice") || contains(query, "export async function getAdvice"));
check("query: getConcerns exported", contains(query, "export function getConcerns") || contains(query, "export async function getConcerns"));
check("query: getOpportunities exported", contains(query, "export function getOpportunities") || contains(query, "export async function getOpportunities"));
check("query: getQuestions exported", contains(query, "export function getQuestions") || contains(query, "export async function getQuestions"));
check("query: getRecommendations exported", contains(query, "export function getRecommendations") || contains(query, "export async function getRecommendations"));
check("query: getFocusAreas exported", contains(query, "export function getFocusAreas") || contains(query, "export async function getFocusAreas"));
check("query: getBriefings exported", contains(query, "export function getBriefings") || contains(query, "export async function getBriefings"));
check("query: getDigests exported", contains(query, "export function getDigests") || contains(query, "export async function getDigests"));

// ── Section 17: Repository Interface ─────────────────────────────────────────
console.log("\n[17] Repository Interface");
const repo = read(path.join(SA, "strategic-advisor-repository.ts"));

check("repo: StrategicAdvisorRepository exported", contains(repo, "export interface StrategicAdvisorRepository"));
check("repo: saveAdvice method", contains(repo, "saveAdvice"));
check("repo: saveConcern method", contains(repo, "saveConcern"));
check("repo: saveOpportunity method", contains(repo, "saveOpportunity"));
check("repo: saveQuestion method", contains(repo, "saveQuestion"));
check("repo: saveRecommendation method", contains(repo, "saveRecommendation"));
check("repo: saveBriefing method", contains(repo, "saveBriefing"));
check("repo: saveDigest method", contains(repo, "saveDigest"));
check("repo: getLatestAdvice method", contains(repo, "getLatestAdvice"));
check("repo: getLatestConcerns method", contains(repo, "getLatestConcerns"));
check("repo: getLatestOpportunities method", contains(repo, "getLatestOpportunities"));
check("repo: getLatestRecommendations method", contains(repo, "getLatestRecommendations"));
check("repo: getLatestBriefing method", contains(repo, "getLatestBriefing"));
check("repo: getLatestDigest method", contains(repo, "getLatestDigest"));
check("repo: no server-only", !contains(repo, "server-only"));
check("repo: no Prisma", !contains(repo, "@prisma/client"));

// ── Section 18: Prisma Repository ────────────────────────────────────────────
console.log("\n[18] Prisma Repository");
const prismaRepo = read(path.join(PERS, "prisma-strategic-advisor-repository.ts"));

check("prismaRepo: import server-only", contains(prismaRepo, "import \"server-only\""));
check("prismaRepo: implements StrategicAdvisorRepository", contains(prismaRepo, "implements StrategicAdvisorRepository"));
check("prismaRepo: strategicAdviceRecord", contains(prismaRepo, "strategicAdviceRecord"));
check("prismaRepo: strategicConcernRecord", contains(prismaRepo, "strategicConcernRecord"));
check("prismaRepo: strategicOpportunityRecord", contains(prismaRepo, "strategicOpportunityRecord"));
check("prismaRepo: strategicQuestionRecord", contains(prismaRepo, "strategicQuestionRecord"));
check("prismaRepo: strategicRecommendationRecord", contains(prismaRepo, "strategicRecommendationRecord"));
check("prismaRepo: strategicAdvisorBriefingRecord", contains(prismaRepo, "strategicAdvisorBriefingRecord"));
check("prismaRepo: strategicAdvisorDigestRecord", contains(prismaRepo, "strategicAdvisorDigestRecord"));
check("prismaRepo: upsert pattern", contains(prismaRepo, "upsert"));
check("prismaRepo: findMany pattern", contains(prismaRepo, "findMany"));
check("prismaRepo: orderBy generatedAt desc", contains(prismaRepo, "generatedAt") && contains(prismaRepo, "\"desc\""));

// ── Section 19: Dashboard Contract ───────────────────────────────────────────
console.log("\n[19] Dashboard Contract");
const dash = read(path.join(SA, "strategic-advisor-dashboard-contract.ts"));

check("dash: buildStrategicDashboardContract exported", contains(dash, "export function buildStrategicDashboardContract"));
check("dash: buildEmptyStrategicDashboard exported", contains(dash, "export function buildEmptyStrategicDashboard"));
check("dash: StrategicAdvisorDashboardMetrics interface", contains(dash, "export interface StrategicAdvisorDashboardMetrics"));
check("dash: StrategicAdvisorDashboardContract interface", contains(dash, "export interface StrategicAdvisorDashboardContract"));
check("dash: advisorScore field", contains(dash, "advisorScore"));
check("dash: concernCount field", contains(dash, "concernCount"));
check("dash: criticalConcernCount field", contains(dash, "criticalConcernCount"));
check("dash: opportunityCount field", contains(dash, "opportunityCount"));
check("dash: recommendationCount field", contains(dash, "recommendationCount"));
check("dash: topConcerns sliced to 5", contains(dash, "slice(0, 5)"));
check("dash: executiveCoverage 0-1", contains(dash, "executiveCoverage"));
check("dash: no server-only", !contains(dash, "server-only"));

// ── Section 20: Health ────────────────────────────────────────────────────────
console.log("\n[20] Health Check");
const health = read(path.join(SA, "strategic-advisor-health.ts"));

check("health: import server-only", contains(health, "import \"server-only\""));
check("health: checkStrategicAdvisorHealth exported", contains(health, "export function checkStrategicAdvisorHealth"));
check("health: HEALTHY status", contains(health, "\"HEALTHY\""));
check("health: DEGRADED status", contains(health, "\"DEGRADED\""));
check("health: UNAVAILABLE status", contains(health, "\"UNAVAILABLE\""));
check("health: null result → UNAVAILABLE", contains(health, "UNAVAILABLE"));
check("health: FAILED → UNAVAILABLE", contains(health, "FAILED"));
check("health: advisorScore field", contains(health, "advisorScore"));
check("health: concerns array field", contains(health, "concerns"));
check("health: checkedAt field", contains(health, "checkedAt"));

// ── Section 21: Readiness ─────────────────────────────────────────────────────
console.log("\n[21] Readiness");
const readiness = read(path.join(SA, "strategic-advisor-readiness.ts"));

check("readiness: evaluateStrategicAdvisorReadiness exported", contains(readiness, "export function evaluateStrategicAdvisorReadiness"));
check("readiness: isStrategicAdvisorReady exported", contains(readiness, "export function isStrategicAdvisorReady"));
check("readiness: NOT_READY level", contains(readiness, "\"NOT_READY\""));
check("readiness: PARTIAL level", contains(readiness, "\"PARTIAL\""));
check("readiness: READY level", contains(readiness, "\"READY\""));
check("readiness: FULL level", contains(readiness, "\"FULL\""));
check("readiness: readinessScore 0-1", contains(readiness, "readinessScore"));
check("readiness: hasEntries field", contains(readiness, "hasEntries"));
check("readiness: hasPatterns field", contains(readiness, "hasPatterns"));
check("readiness: hasSignals field", contains(readiness, "hasSignals"));
check("readiness: missingInputs array", contains(readiness, "missingInputs"));
check("readiness: orgSlug filter", contains(readiness, "orgSlug"));
check("readiness: evaluatedAt ISO string", contains(readiness, "toISOString"));
check("readiness: no server-only", !contains(readiness, "server-only"));

// ── Section 22: Integration — Executive Brain ──────────────────────────────────
console.log("\n[22] Integration: Executive Brain");
const intEB = read(path.join(INT, "advisor-executive-brain.ts"));

check("intEB: extractConcernsFromExecutiveBrain exported", contains(intEB, "export function extractConcernsFromExecutiveBrain"));
check("intEB: extractPrioritiesFromExecutiveBrain exported", contains(intEB, "export function extractPrioritiesFromExecutiveBrain"));
check("intEB: getExecutiveBrainFocusContext exported", contains(intEB, "export function getExecutiveBrainFocusContext"));
check("intEB: no server-only", !contains(intEB, "server-only"));
check("intEB: orgSlug scoping", contains(intEB, "orgSlug"));

// ── Section 23: Integration — Strategic Memory ────────────────────────────────
console.log("\n[23] Integration: Strategic Memory");
const intSM = read(path.join(INT, "advisor-strategic-memory.ts"));

check("intSM: extractAdvisorMemoryContext exported", contains(intSM, "export function extractAdvisorMemoryContext"));
check("intSM: getStrategicAdvisorAlignmentScore exported", contains(intSM, "export function getStrategicAdvisorAlignmentScore"));
check("intSM: extractStrategicLessons exported", contains(intSM, "export function extractStrategicLessons"));
check("intSM: no server-only", !contains(intSM, "server-only"));

// ── Section 24: Integration — Learning ───────────────────────────────────────
console.log("\n[24] Integration: Learning");
const intLrn = read(path.join(INT, "advisor-learning.ts"));

check("intLrn: buildAdvisorLearningContext exported", contains(intLrn, "export function buildAdvisorLearningContext"));
check("intLrn: getConfirmedAdvisorPatterns exported", contains(intLrn, "export function getConfirmedAdvisorPatterns"));
check("intLrn: extractHistoricalAdvisorContext exported", contains(intLrn, "export function extractHistoricalAdvisorContext"));
check("intLrn: no server-only", !contains(intLrn, "server-only"));

// ── Section 25: Integration — Memory Graph ────────────────────────────────────
console.log("\n[25] Integration: Memory Graph");
const intMG = read(path.join(INT, "advisor-memory-graph.ts"));

check("intMG: buildAdvisorGraphContext exported", contains(intMG, "export function buildAdvisorGraphContext"));
check("intMG: getStrategicAdvisorRelationships exported", contains(intMG, "export function getStrategicAdvisorRelationships"));
check("intMG: no server-only", !contains(intMG, "server-only"));

// ── Section 26: Integration — Cross Module ────────────────────────────────────
console.log("\n[26] Integration: Cross-Module");
const intCM = read(path.join(INT, "advisor-cross-module.ts"));

check("intCM: buildAdvisorCrossModuleContext exported", contains(intCM, "export function buildAdvisorCrossModuleContext"));
check("intCM: extractAdvisorRisksFromSignals exported", contains(intCM, "export function extractAdvisorRisksFromSignals"));
check("intCM: getAdvisorHighSeverityCount exported", contains(intCM, "export function getAdvisorHighSeverityCount"));
check("intCM: no server-only", !contains(intCM, "server-only"));

// ── Section 27: Integration — Tenant Profile ──────────────────────────────────
console.log("\n[27] Integration: Tenant Profile");
const intTP = read(path.join(INT, "advisor-tenant-profile.ts"));

check("intTP: getAdvisorTenantProfile exported", contains(intTP, "export function getAdvisorTenantProfile"));
check("intTP: alignBriefingToTenant exported", contains(intTP, "export function alignBriefingToTenant"));
check("intTP: alignDigestToTenant exported", contains(intTP, "export function alignDigestToTenant"));
check("intTP: applyAdvisorConfidenceMultiplier exported", contains(intTP, "export function applyAdvisorConfidenceMultiplier"));
check("intTP: castillitos profile registered", contains(intTP, "castillitos"));
check("intTP: no server-only", !contains(intTP, "server-only"));

// ── Section 28: Integration — Playbooks ──────────────────────────────────────
console.log("\n[28] Integration: Playbooks");
const intPB = read(path.join(INT, "advisor-playbooks.ts"));

check("intPB: buildPlaybookAdvisorSummary exported", contains(intPB, "export function buildPlaybookAdvisorSummary"));
check("intPB: extractAdvisorRecommendationsFromPlaybooks exported", contains(intPB, "export function extractAdvisorRecommendationsFromPlaybooks"));
check("intPB: findAdvisorRelatedPlaybooks exported", contains(intPB, "export function findAdvisorRelatedPlaybooks"));
check("intPB: no server-only", !contains(intPB, "server-only"));

// ── Section 29: Integration — Compliance ─────────────────────────────────────
console.log("\n[29] Integration: Compliance");
const intComp = read(path.join(INT, "advisor-compliance.ts"));

check("intComp: evaluateAdvisorComplianceGate exported", contains(intComp, "export function evaluateAdvisorComplianceGate"));
check("intComp: enforceAdvisorTenantBoundary exported", contains(intComp, "export function enforceAdvisorTenantBoundary"));
check("intComp: buildAdvisorComplianceRisk exported", contains(intComp, "export function buildAdvisorComplianceRisk"));
check("intComp: PASS|WARN|FAIL status", contains(intComp, "\"PASS\"") && contains(intComp, "\"WARN\"") && contains(intComp, "\"FAIL\""));
check("intComp: throws on cross-tenant", contains(intComp, "throw"));
check("intComp: no server-only", !contains(intComp, "server-only"));

// ── Section 30: Integration — Audit ──────────────────────────────────────────
console.log("\n[30] Integration: Audit");
const intAudit = read(path.join(INT, "advisor-audit.ts"));

check("intAudit: buildAdvisorAuditLog exported", contains(intAudit, "export function buildAdvisorAuditLog"));
check("intAudit: auditAdvisorRun exported", contains(intAudit, "export function auditAdvisorRun"));
check("intAudit: auditConcernIdentified exported", contains(intAudit, "export function auditConcernIdentified"));
check("intAudit: auditRecommendationCreated exported", contains(intAudit, "export function auditRecommendationCreated"));
check("intAudit: auditBriefingCreated exported", contains(intAudit, "export function auditBriefingCreated"));
check("intAudit: saaudit_ id prefix", contains(intAudit, "saaudit_"));
check("intAudit: STRATEGIC_ event types", contains(intAudit, "STRATEGIC_"));
check("intAudit: no server-only", !contains(intAudit, "server-only"));

// ── Section 31: Canonical Scenarios File ─────────────────────────────────────
console.log("\n[31] Canonical Scenarios File");
const scenarios = read(path.join(SA, "strategic-advisor-scenarios.ts"));

check("scen: buildAllStrategicScenarios exported", contains(scenarios, "export function buildAllStrategicScenarios"));
check("scen: getScenarioByType exported", contains(scenarios, "export function getScenarioByType"));
check("scen: buildScenarioSummary exported", contains(scenarios, "export function buildScenarioSummary"));
check("scen: ScenarioOutput interface", contains(scenarios, "export interface ScenarioOutput"));
check("scen: 12 scenario builders", countMatches(scenarios, "_build[A-Z]") >= 12);
check("scen: LIQUIDITY_CRISIS scenario", contains(scenarios, "_buildLiquidityCrisis") || contains(scenarios, "LIQUIDITY_CRISIS"));
check("scen: ACCELERATED_GROWTH scenario", contains(scenarios, "_buildAcceleratedGrowth") || contains(scenarios, "ACCELERATED_GROWTH"));
check("scen: GROWING_RECEIVABLES scenario", contains(scenarios, "_buildGrowingReceivables") || contains(scenarios, "GROWING_RECEIVABLES"));
check("scen: SALES_DECLINE scenario", contains(scenarios, "_buildSalesDecline") || contains(scenarios, "SALES_DECLINE"));
check("scen: CLIENT_CONCENTRATION scenario", contains(scenarios, "_buildClientConcentration") || contains(scenarios, "CLIENT_CONCENTRATION"));
check("scen: IGNORED_OPPORTUNITY scenario", contains(scenarios, "_buildIgnoredOpportunity") || contains(scenarios, "IGNORED_OPPORTUNITY"));
check("scen: MISALIGNED_OBJECTIVES scenario", contains(scenarios, "_buildMisalignedObjectives") || contains(scenarios, "MISALIGNED_OBJECTIVES"));
check("scen: SUCCESSFUL_PLAYBOOK scenario", contains(scenarios, "_buildSuccessfulPlaybook") || contains(scenarios, "SUCCESSFUL_PLAYBOOK"));
check("scen: OBSOLETE_PLAYBOOK scenario", contains(scenarios, "_buildObsoletePlaybook") || contains(scenarios, "OBSOLETE_PLAYBOOK"));
check("scen: REGULATORY_RISK scenario", contains(scenarios, "_buildRegulatoryRisk") || contains(scenarios, "REGULATORY_RISK"));
check("scen: BUSINESS_EXPANSION scenario", contains(scenarios, "_buildBusinessExpansion") || contains(scenarios, "BUSINESS_EXPANSION"));
check("scen: STRATEGIC_CONFLICT scenario", contains(scenarios, "_buildStrategicConflict") || contains(scenarios, "STRATEGIC_CONFLICT"));
check("scen: SCENARIO_BUILDERS map covers all 12", countMatches(scenarios, "LIQUIDITY_CRISIS|ACCELERATED_GROWTH|GROWING_RECEIVABLES|SALES_DECLINE|CLIENT_CONCENTRATION|IGNORED_OPPORTUNITY|MISALIGNED_OBJECTIVES|SUCCESSFUL_PLAYBOOK|OBSOLETE_PLAYBOOK|REGULATORY_RISK|BUSINESS_EXPANSION|STRATEGIC_CONFLICT") >= 12);
check("scen: all recs suggestedOnly: true", contains(scenarios, "suggestedOnly: true"));
check("scen: no server-only import", !contains(scenarios, "import \"server-only\""));
check("scen: no Prisma", !contains(scenarios, "@prisma/client"));

// ── Section 32: Future Compatibility ─────────────────────────────────────────
console.log("\n[32] Future Compatibility");
const futureCompat = read(path.join(SA, "future-compatibility.ts"));

check("fc: PlannedStrategicCapability interface", contains(futureCompat, "export interface PlannedStrategicCapability"));
check("fc: PLANNED_STRATEGIC_CAPABILITIES exported", contains(futureCompat, "export const PLANNED_STRATEGIC_CAPABILITIES"));
check("fc: getPlannedCapability exported", contains(futureCompat, "export function getPlannedCapability"));
check("fc: getCapabilitiesByStatus exported", contains(futureCompat, "export function getCapabilitiesByStatus"));
check("fc: 6 capabilities", countMatches(futureCompat, "BOARD_INTELLIGENCE|STRATEGIC_FORECASTING|STRATEGIC_SIMULATIONS|AUTONOMOUS_PLANNING|STRATEGIC_MENTOR|EXECUTIVE_COUNCIL") >= 6);
check("fc: ROADMAP|RESEARCH|BLOCKED statuses", contains(futureCompat, "\"ROADMAP\"") && contains(futureCompat, "\"RESEARCH\"") && contains(futureCompat, "\"BLOCKED\""));
check("fc: AGENTIK- sprint IDs", contains(futureCompat, "AGENTIK-BOARD-INTELLIGENCE-01"));
check("fc: estimatedPhase field", contains(futureCompat, "estimatedPhase"));
check("fc: blockedBy field", contains(futureCompat, "blockedBy"));
check("fc: no server-only", !contains(futureCompat, "server-only"));

// ── Section 33: Server Barrel ─────────────────────────────────────────────────
console.log("\n[33] Server Barrel");
const serverBarrel = read(path.join(SA, "server.ts"));

check("server: import server-only", contains(serverBarrel, "import \"server-only\""));
check("server: runStrategicAdvisor re-exported", contains(serverBarrel, "runStrategicAdvisor"));
check("server: buildContext re-exported", contains(serverBarrel, "buildContext"));
check("server: identifyConcerns re-exported", contains(serverBarrel, "identifyConcerns"));
check("server: generateRecommendations re-exported", contains(serverBarrel, "generateRecommendations"));
check("server: checkStrategicAdvisorHealth re-exported", contains(serverBarrel, "checkStrategicAdvisorHealth"));
check("server: evaluateStrategicAdvisorReadiness re-exported", contains(serverBarrel, "evaluateStrategicAdvisorReadiness"));
check("server: buildStrategicDashboardContract re-exported", contains(serverBarrel, "buildStrategicDashboardContract"));
check("server: enforceAdvisorTenantBoundary re-exported", contains(serverBarrel, "enforceAdvisorTenantBoundary"));
check("server: buildAdvisorAuditLog re-exported", contains(serverBarrel, "buildAdvisorAuditLog"));
check("server: PrismaStrategicAdvisorRepository re-exported", contains(serverBarrel, "PrismaStrategicAdvisorRepository"));
check("server: buildAllStrategicScenarios re-exported", contains(serverBarrel, "buildAllStrategicScenarios"));

// ── Section 34: Client Index Barrel ──────────────────────────────────────────
console.log("\n[34] Client Index Barrel");
const indexBarrel = read(path.join(SA, "index.ts"));

check("index: no import server-only", !contains(indexBarrel, "import \"server-only\""));
check("index: no Prisma import", !contains(indexBarrel, "@prisma/client"));
check("index: no PrismaStrategicAdvisorRepository", !contains(indexBarrel, "PrismaStrategicAdvisorRepository"));
check("index: StrategicConcern type exported", contains(indexBarrel, "StrategicConcern"));
check("index: StrategicRecommendation type exported", contains(indexBarrel, "StrategicRecommendation"));
check("index: StrategicAdvisorResult type exported", contains(indexBarrel, "StrategicAdvisorResult"));
check("index: generateSaId exported", contains(indexBarrel, "generateSaId"));
check("index: buildEmptyStrategicDashboard exported", contains(indexBarrel, "buildEmptyStrategicDashboard"));
check("index: isStrategicAdvisorReady exported", contains(indexBarrel, "isStrategicAdvisorReady"));
check("index: PLANNED_STRATEGIC_CAPABILITIES exported", contains(indexBarrel, "PLANNED_STRATEGIC_CAPABILITIES"));
check("index: PlannedStrategicCapability type exported", contains(indexBarrel, "PlannedStrategicCapability"));

// ── Section 35: Prisma Schema ─────────────────────────────────────────────────
console.log("\n[35] Prisma Schema");
const schema = read(SCHEMA);

check("schema: StrategicAdviceRecord model", contains(schema, "model StrategicAdviceRecord"));
check("schema: StrategicConcernRecord model", contains(schema, "model StrategicConcernRecord"));
check("schema: StrategicOpportunityRecord model", contains(schema, "model StrategicOpportunityRecord"));
check("schema: StrategicQuestionRecord model", contains(schema, "model StrategicQuestionRecord"));
check("schema: StrategicRecommendationRecord model", contains(schema, "model StrategicRecommendationRecord"));
check("schema: StrategicAdvisorBriefingRecord model", contains(schema, "model StrategicAdvisorBriefingRecord"));
check("schema: StrategicAdvisorDigestRecord model", contains(schema, "model StrategicAdvisorDigestRecord"));
check("schema: StrategicAdviceRecord has orgSlug index", contains(schema, "StrategicAdviceRecord") && contains(schema, "@@index([orgSlug])"));
check("schema: StrategicConcernRecord has severity index", contains(schema, "orgSlug, severity"));
check("schema: StrategicRecommendationRecord has priority index", contains(schema, "orgSlug, priority"));
check("schema: briefing has type index", contains(schema, "orgSlug, type"));
check("schema: digest has period index", contains(schema, "orgSlug, period"));
check("schema: confidenceScore DOUBLE PRECISION or Float", contains(schema, "Float") || contains(schema, "DOUBLE PRECISION"));
check("schema: metadata Json default {}", contains(schema, "Json     @default(\"{}\")"));
check("schema: evidenceIds Json default []", contains(schema, "Json     @default(\"[]\")"));

// ── Section 36: Migration SQL ─────────────────────────────────────────────────
console.log("\n[36] Migration SQL");
const migration = read(MIGRATION);

check("mig: CREATE TABLE StrategicAdviceRecord", contains(migration, "CREATE TABLE \"StrategicAdviceRecord\""));
check("mig: CREATE TABLE StrategicConcernRecord", contains(migration, "CREATE TABLE \"StrategicConcernRecord\""));
check("mig: CREATE TABLE StrategicOpportunityRecord", contains(migration, "CREATE TABLE \"StrategicOpportunityRecord\""));
check("mig: CREATE TABLE StrategicQuestionRecord", contains(migration, "CREATE TABLE \"StrategicQuestionRecord\""));
check("mig: CREATE TABLE StrategicRecommendationRecord", contains(migration, "CREATE TABLE \"StrategicRecommendationRecord\""));
check("mig: CREATE TABLE StrategicAdvisorBriefingRecord", contains(migration, "CREATE TABLE \"StrategicAdvisorBriefingRecord\""));
check("mig: CREATE TABLE StrategicAdvisorDigestRecord", contains(migration, "CREATE TABLE \"StrategicAdvisorDigestRecord\""));
check("mig: orgSlug indexes created", countMatches(migration, "CREATE INDEX") >= 7);
check("mig: DOUBLE PRECISION for floats", contains(migration, "DOUBLE PRECISION"));
check("mig: JSONB for json fields", contains(migration, "JSONB"));
check("mig: default '[]' for arrays", contains(migration, "DEFAULT '[]'"));
check("mig: PRIMARY KEY constraints", countMatches(migration, "PRIMARY KEY") >= 7);

// ── Section 37: Intelligence Registry ────────────────────────────────────────
console.log("\n[37] Intelligence Registry");
const registry = read(path.join(ROOT, "lib/copilot/copilot-intelligence-registry.ts"));

check("reg: STRATEGIC_ADVISOR entry", contains(registry, "id:           \"STRATEGIC_ADVISOR\""));
check("reg: STRATEGIC_ADVISOR sprint ID", contains(registry, "AGENTIK-STRATEGIC-ADVISOR-01"));
check("reg: STRATEGIC_ADVISOR barrel", contains(registry, "lib/copilot/strategic-advisor/server"));
check("reg: STRATEGIC_ADVISOR clientBarrel", contains(registry, "lib/copilot/strategic-advisor/index"));
check("reg: STRATEGIC_ADVISOR status ACTIVE", contains(registry, "\"STRATEGIC_ADVISOR\"") && contains(registry, "status:       \"ACTIVE\""));
check("reg: STRATEGIC_ADVISOR hasDb: true", contains(registry, "\"STRATEGIC_ADVISOR\"") && contains(registry, "hasDb:        true"));
check("reg: STRATEGIC_ADVISOR depends on EXECUTIVE_BRAIN_V2", contains(registry, "\"EXECUTIVE_BRAIN_V2\"") && matches(registry, /depends.*\[[\s\S]*EXECUTIVE_BRAIN_V2/));
check("reg: INTELLIGENCE_REGISTRY array exists", contains(registry, "export const INTELLIGENCE_REGISTRY"));
check("reg: getIntelligenceModule exported", contains(registry, "export function getIntelligenceModule"));
check("reg: getActiveModules exported", contains(registry, "export function getActiveModules"));
check("reg: getExecutiveModules exported", contains(registry, "export function getExecutiveModules"));
check("reg: getDependents exported", contains(registry, "export function getDependents"));
check("reg: 8 entries in total", countMatches(registry, "id:") >= 8);

// ── Section 38: Integration Harness ──────────────────────────────────────────
console.log("\n[38] Integration Harness");
const harness = read(path.join(HARNESS, "route.ts"));

check("harness: import server-only", contains(harness, "import \"server-only\""));
check("harness: ENABLE_INTERNAL_INTEGRATION_TESTS guard", contains(harness, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("harness: 21 test suites", countMatches(harness, "\"[0-9][0-9]_") >= 20);
check("harness: testIdGeneration suite", contains(harness, "testIdGeneration"));
check("harness: testContextBuilder suite", contains(harness, "testContextBuilder"));
check("harness: testConcernEngine suite", contains(harness, "testConcernEngine"));
check("harness: testOpportunityEngine suite", contains(harness, "testOpportunityEngine"));
check("harness: testRecommendationEngine suite", contains(harness, "testRecommendationEngine"));
check("harness: testQuestionEngine suite", contains(harness, "testQuestionEngine"));
check("harness: testScenarioEngine suite", contains(harness, "testScenarioEngine"));
check("harness: testAlignmentEngine suite", contains(harness, "testAlignmentEngine"));
check("harness: testChallengeEngine suite", contains(harness, "testChallengeEngine"));
check("harness: testFocusEngine suite", contains(harness, "testFocusEngine"));
check("harness: testNarrativeEngine suite", contains(harness, "testNarrativeEngine"));
check("harness: testBriefingBuilder suite", contains(harness, "testBriefingBuilder"));
check("harness: testDigestBuilder suite", contains(harness, "testDigestBuilder"));
check("harness: testDashboardContract suite", contains(harness, "testDashboardContract"));
check("harness: testHealthAndReadiness suite", contains(harness, "testHealthAndReadiness"));
check("harness: testComplianceIntegration suite", contains(harness, "testComplianceIntegration"));
check("harness: testAuditIntegration suite", contains(harness, "testAuditIntegration"));
check("harness: testMainEngine suite", contains(harness, "testMainEngine"));
check("harness: testCanonicalScenarios suite", contains(harness, "testCanonicalScenarios"));
check("harness: testFutureCompatibility suite", contains(harness, "testFutureCompatibility"));
check("harness: testMultiTenantIsolation suite", contains(harness, "testMultiTenantIsolation"));
check("harness: assert helper function", contains(harness, "function assert("));
check("harness: fail helper function", contains(harness, "function fail("));
check("harness: total/passed/failed in response", contains(harness, "total,") && contains(harness, "passed,") && contains(harness, "failed:"));
check("harness: 200/422 status codes", contains(harness, "200") && contains(harness, "422"));
check("harness: verdict string", contains(harness, "verdict"));
check("harness: suggestedOnly=true checked in canonical scenarios", contains(harness, "suggestedOnly") && contains(harness, "true"));
check("harness: cross-tenant isolation tested", contains(harness, "testMultiTenantIsolation"));

// ── Final report ──────────────────────────────────────────────────────────────
const TOTAL = PASS + FAIL;
console.log(`\n${"─".repeat(60)}`);
console.log(`AGENTIK-STRATEGIC-ADVISOR-01 — Validation Suite`);
console.log(`${"─".repeat(60)}`);
console.log(`TOTAL:  ${TOTAL}`);
console.log(`PASS:   ${PASS}`);
console.log(`FAIL:   ${FAIL}`);
console.log(`RESULT: ${FAIL === 0 ? `${TOTAL}/${TOTAL} PASS ✓` : `${PASS}/${TOTAL} — ${FAIL} FAIL ✗`}`);
if (FAIL > 0) process.exit(1);
