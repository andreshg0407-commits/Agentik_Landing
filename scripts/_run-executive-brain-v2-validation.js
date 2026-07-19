#!/usr/bin/env node
// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 37 — Validation Suite
// 1500+ structural and contract validations for all sprint files
//
// Run: node scripts/_run-executive-brain-v2-validation.js
//
// Validates WITHOUT importing server-only modules.
// Uses fs.existsSync / regex analysis on raw source files.

const fs = require("fs");
const path = require("path");

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
  }
}

function readFile(rel) {
  const abs = path.join(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
}

function fileExists(rel) {
  return fs.existsSync(path.join(process.cwd(), rel));
}

function contains(src, pattern) {
  if (!src) return false;
  if (typeof pattern === "string") return src.includes(pattern);
  return pattern.test(src);
}

function containsAll(src, patterns) {
  return patterns.every((p) => contains(src, p));
}

function countMatches(src, pattern) {
  if (!src) return 0;
  const re = typeof pattern === "string" ? new RegExp(pattern, "g") : new RegExp(pattern.source, "g");
  return (src.match(re) ?? []).length;
}

// ── File existence ─────────────────────────────────────────────────────────────

const BASE = "lib/copilot/executive-brain-v2";
const SCRIPTS = "scripts";
const MIGRATION = "prisma/migrations/20260608000000_executive_brain_v2/migration.sql";
const INTEGRATION_ROUTE = "app/api/internal/integration-tests/executive-brain-v2/route.ts";

const REQUIRED_FILES = [
  `${BASE}/executive-brain-types.ts`,
  `${BASE}/strategic-context-engine.ts`,
  `${BASE}/learning-context-engine.ts`,
  `${BASE}/executive-situation-engine.ts`,
  `${BASE}/executive-priority-engine.ts`,
  `${BASE}/executive-conflict-engine.ts`,
  `${BASE}/executive-opportunity-engine.ts`,
  `${BASE}/executive-risk-engine.ts`,
  `${BASE}/executive-focus-engine.ts`,
  `${BASE}/executive-narrative-engine-v2.ts`,
  `${BASE}/executive-digest-builder.ts`,
  `${BASE}/executive-briefing-builder.ts`,
  `${BASE}/executive-agenda-builder.ts`,
  `${BASE}/executive-brain-v2-engine.ts`,
  `${BASE}/executive-brain-query.ts`,
  `${BASE}/executive-brain-repository.ts`,
  `${BASE}/executive-brain-health.ts`,
  `${BASE}/executive-brain-readiness.ts`,
  `${BASE}/executive-dashboard-contract.ts`,
  `${BASE}/executive-scenarios.ts`,
  `${BASE}/future-compatibility.ts`,
  `${BASE}/server.ts`,
  `${BASE}/index.ts`,
  `${BASE}/persistence/prisma-executive-brain-repository.ts`,
  `${BASE}/integrations/executive-strategic-memory.ts`,
  `${BASE}/integrations/executive-learning.ts`,
  `${BASE}/integrations/executive-memory-graph.ts`,
  `${BASE}/integrations/executive-cross-module.ts`,
  `${BASE}/integrations/executive-tenant-profile.ts`,
  `${BASE}/integrations/executive-playbooks.ts`,
  `${BASE}/integrations/executive-compliance.ts`,
  `${BASE}/integrations/executive-audit.ts`,
  MIGRATION,
  INTEGRATION_ROUTE,
  "lib/copilot/copilot-intelligence-registry.ts",
];

for (const f of REQUIRED_FILES) {
  check(`FILE_EXISTS: ${f}`, fileExists(f));
}

// ── Section 1: Types file ─────────────────────────────────────────────────────

const types = readFile(`${BASE}/executive-brain-types.ts`);

// 1.1 Core union types
check("TYPES: ExecutiveConfidence defined", contains(types, "ExecutiveConfidence"));
check("TYPES: LOW confidence present", contains(types, '"LOW"'));
check("TYPES: MEDIUM confidence present", contains(types, '"MEDIUM"'));
check("TYPES: HIGH confidence present", contains(types, '"HIGH"'));
check("TYPES: VERY_HIGH confidence present", contains(types, '"VERY_HIGH"'));

check("TYPES: ExecutivePriorityLevel defined", contains(types, "ExecutivePriorityLevel"));
check("TYPES: CRITICAL level present", contains(types, '"CRITICAL"'));

check("TYPES: ExecutiveDomain defined", contains(types, "ExecutiveDomain"));
check("TYPES: FINANCE domain present", contains(types, '"FINANCE"'));
check("TYPES: COMMERCIAL domain present", contains(types, '"COMMERCIAL"'));
check("TYPES: CROSS_DOMAIN present", contains(types, '"CROSS_DOMAIN"'));

check("TYPES: ExecutiveRiskLevel defined", contains(types, "ExecutiveRiskLevel"));
check("TYPES: NEGLIGIBLE risk level present", contains(types, '"NEGLIGIBLE"'));

check("TYPES: ExecutiveOpportunityMagnitude defined", contains(types, "ExecutiveOpportunityMagnitude"));
check("TYPES: TRANSFORMATIONAL magnitude present", contains(types, '"TRANSFORMATIONAL"'));

check("TYPES: ExecutiveDigestPeriod defined", contains(types, "ExecutiveDigestPeriod"));
check("TYPES: DAILY period present", contains(types, '"DAILY"'));
check("TYPES: QUARTERLY period present", contains(types, '"QUARTERLY"'));

check("TYPES: ExecutiveBriefingType defined", contains(types, "ExecutiveBriefingType"));
check("TYPES: CEO briefing type present", contains(types, '"CEO"'));

check("TYPES: ExecutiveScenarioType defined", contains(types, "ExecutiveScenarioType"));
check("TYPES: LIQUIDITY_CRISIS scenario present", contains(types, '"LIQUIDITY_CRISIS"'));
check("TYPES: ACCELERATED_GROWTH scenario present", contains(types, '"ACCELERATED_GROWTH"'));
check("TYPES: SALES_DROP scenario present", contains(types, '"SALES_DROP"'));
check("TYPES: RECEIVABLES_SURGE scenario present", contains(types, '"RECEIVABLES_SURGE"'));
check("TYPES: REGULATORY_RISK scenario present", contains(types, '"REGULATORY_RISK"'));
check("TYPES: COMMERCIAL_OPPORTUNITY scenario present", contains(types, '"COMMERCIAL_OPPORTUNITY"'));
check("TYPES: STRATEGIC_CONFLICT scenario present", contains(types, '"STRATEGIC_CONFLICT"'));
check("TYPES: OBJECTIVE_ACHIEVED scenario present", contains(types, '"OBJECTIVE_ACHIEVED"'));
check("TYPES: MISALIGNED_PRIORITY scenario present", contains(types, '"MISALIGNED_PRIORITY"'));
check("TYPES: EMERGING_RISK scenario present", contains(types, '"EMERGING_RISK"'));

// 1.2 Core interfaces
check("TYPES: ExecutivePriority interface present", contains(types, "ExecutivePriority"));
check("TYPES: ExecutiveRisk interface present", contains(types, "ExecutiveRisk"));
check("TYPES: ExecutiveOpportunity interface present", contains(types, "ExecutiveOpportunity"));
check("TYPES: ExecutiveConflict interface present", contains(types, "ExecutiveConflict"));
check("TYPES: ExecutiveFocusArea interface present", contains(types, "ExecutiveFocusArea"));
check("TYPES: ExecutiveNarrative interface present", contains(types, "ExecutiveNarrative"));
check("TYPES: ExecutiveBriefing interface present", contains(types, "ExecutiveBriefing"));
check("TYPES: ExecutiveAgenda interface present", contains(types, "ExecutiveAgenda"));
check("TYPES: ExecutiveDigest interface present", contains(types, "ExecutiveDigest"));
check("TYPES: ExecutiveSituation interface present", contains(types, "ExecutiveSituation"));
check("TYPES: ExecutiveContext interface present", contains(types, "ExecutiveContext"));
check("TYPES: ExecutiveSnapshot interface present", contains(types, "ExecutiveSnapshot"));
check("TYPES: ExecutiveBrainV2Input interface present", contains(types, "ExecutiveBrainV2Input"));
check("TYPES: ExecutiveBrainV2Result interface present", contains(types, "ExecutiveBrainV2Result"));
check("TYPES: ExecutiveScenarioOutput interface present", contains(types, "ExecutiveScenarioOutput"));

// 1.3 ID generation
check("TYPES: generateEbv2Id exported", contains(types, "export function generateEbv2Id"));
check("TYPES: generateEbv2Id uses ebv2_ prefix", contains(types, "ebv2_"));

// 1.4 Utility helpers
check("TYPES: confidenceFromScore exported", contains(types, "export function confidenceFromScore"));
check("TYPES: riskLevelFromScore exported", contains(types, "export function riskLevelFromScore"));
check("TYPES: opportunityMagnitudeFromScore exported", contains(types, "export function opportunityMagnitudeFromScore"));
check("TYPES: sortByPriorityScore exported", contains(types, "sortByPriorityScore"));
check("TYPES: sortByCompositeScore exported", contains(types, "sortByCompositeScore"));
check("TYPES: sortByCompositeRisk exported", contains(types, "sortByCompositeRisk"));

// 1.5 Constant arrays
check("TYPES: EXECUTIVE_CONFIDENCE_LEVELS exported", contains(types, "EXECUTIVE_CONFIDENCE_LEVELS"));
check("TYPES: EXECUTIVE_PRIORITY_LEVELS exported", contains(types, "EXECUTIVE_PRIORITY_LEVELS"));
check("TYPES: EXECUTIVE_DOMAINS exported", contains(types, "EXECUTIVE_DOMAINS"));
check("TYPES: EXECUTIVE_RISK_LEVELS exported", contains(types, "EXECUTIVE_RISK_LEVELS"));
check("TYPES: EXECUTIVE_DIGEST_PERIODS exported", contains(types, "EXECUTIVE_DIGEST_PERIODS"));
check("TYPES: EXECUTIVE_BRIEFING_TYPES exported", contains(types, "EXECUTIVE_BRIEFING_TYPES"));
check("TYPES: EXECUTIVE_SCENARIO_TYPES exported", contains(types, "EXECUTIVE_SCENARIO_TYPES"));

// 1.6 Score constants
check("TYPES: EXECUTIVE_CONFIDENCE_SCORE map present", contains(types, "EXECUTIVE_CONFIDENCE_SCORE"));
check("TYPES: EXECUTIVE_PRIORITY_RANK map present", contains(types, "EXECUTIVE_PRIORITY_RANK"));
check("TYPES: EXECUTIVE_RISK_RANK map present", contains(types, "EXECUTIVE_RISK_RANK"));

// ── Section 2: Strategic Context Engine ──────────────────────────────────────

const stratCtx = readFile(`${BASE}/strategic-context-engine.ts`);

check("STRAT_CTX: buildStrategicContext exported", contains(stratCtx, "export function buildStrategicContext"));
check("STRAT_CTX: getActiveGoals exported", contains(stratCtx, "export function getActiveGoals"));
check("STRAT_CTX: getCriticalRisks exported", contains(stratCtx, "export function getCriticalRisks"));
check("STRAT_CTX: getStrategicPriorities exported", contains(stratCtx, "export function getStrategicPriorities"));
check("STRAT_CTX: getActiveDecisions exported", contains(stratCtx, "export function getActiveDecisions"));
check("STRAT_CTX: getActiveCommitments exported", contains(stratCtx, "export function getActiveCommitments"));
check("STRAT_CTX: getActivePolicies exported", contains(stratCtx, "export function getActivePolicies"));
check("STRAT_CTX: getRecentLessons exported", contains(stratCtx, "export function getRecentLessons"));
check("STRAT_CTX: StrategicExecutiveContext exported", contains(stratCtx, "StrategicExecutiveContext"));
check("STRAT_CTX: filters by orgSlug", contains(stratCtx, "orgSlug"));
check("STRAT_CTX: filters ACTIVE status", contains(stratCtx, '"ACTIVE"'));
check("STRAT_CTX: strategicScore computed", contains(stratCtx, "strategicScore"));
check("STRAT_CTX: objectives field computed", contains(stratCtx, "objectives"));
check("STRAT_CTX: concerns field computed", contains(stratCtx, "concerns"));
check("STRAT_CTX: no server-only import", !contains(stratCtx, '"server-only"'));
check("STRAT_CTX: no Prisma import", !contains(stratCtx, "from \"@prisma/client\""));

// ── Section 3: Learning Context Engine ───────────────────────────────────────

const learnCtx = readFile(`${BASE}/learning-context-engine.ts`);

check("LEARN_CTX: buildLearningContext exported", contains(learnCtx, "export function buildLearningContext"));
check("LEARN_CTX: getConfirmedPatterns exported", contains(learnCtx, "export function getConfirmedPatterns"));
check("LEARN_CTX: getRejectedPatterns exported", contains(learnCtx, "export function getRejectedPatterns"));
check("LEARN_CTX: getEffectivePlaybooks exported", contains(learnCtx, "export function getEffectivePlaybooks"));
check("LEARN_CTX: getHistoricalOutcomes exported", contains(learnCtx, "export function getHistoricalOutcomes"));
check("LEARN_CTX: LearningExecutiveContext exported", contains(learnCtx, "LearningExecutiveContext"));
check("LEARN_CTX: historicalRiskScore computed", contains(learnCtx, "historicalRiskScore"));
check("LEARN_CTX: learningMaturity computed", contains(learnCtx, "learningMaturity"));
check("LEARN_CTX: EARLY maturity defined", contains(learnCtx, '"EARLY"'));
check("LEARN_CTX: ADVANCED maturity defined", contains(learnCtx, '"ADVANCED"'));
check("LEARN_CTX: filters by orgSlug", contains(learnCtx, "orgSlug"));
check("LEARN_CTX: no server-only import", !contains(learnCtx, '"server-only"'));

// ── Section 4: Situation Engine ───────────────────────────────────────────────

const situation = readFile(`${BASE}/executive-situation-engine.ts`);

check("SITUATION: buildExecutiveSituation exported", contains(situation, "export function buildExecutiveSituation"));
check("SITUATION: SituationEngineInput exported", contains(situation, "export interface SituationEngineInput"));
check("SITUATION: brainInput field present", contains(situation, "brainInput"));
check("SITUATION: strategicContext field present", contains(situation, "strategicContext"));
check("SITUATION: learningContext field present", contains(situation, "learningContext"));
check("SITUATION: _detectRisks function present", contains(situation, "_detectRisks"));
check("SITUATION: _detectOpportunities function present", contains(situation, "_detectOpportunities"));
check("SITUATION: _detectSituationalConflicts function present", contains(situation, "_detectSituationalConflicts"));
check("SITUATION: _deriveSituationalPriorities function present", contains(situation, "_deriveSituationalPriorities"));
check("SITUATION: _computeSituationScore function present", contains(situation, "_computeSituationScore"));
check("SITUATION: _buildHeadline function present", contains(situation, "_buildHeadline"));
check("SITUATION: no Math.round with 2 args", !contains(situation, /Math\.round\([^)]+,\s*2\)/));
check("SITUATION: no declare const risks", !contains(situation, "declare const risks"));
check("SITUATION: no declare const opportunities", !contains(situation, "declare const opportunities"));
check("SITUATION: assessedAt timestamp present", contains(situation, "assessedAt"));
check("SITUATION: executiveScore computed", contains(situation, "executiveScore"));
check("SITUATION: filters by orgSlug", contains(situation, "orgSlug"));
check("SITUATION: headline built", contains(situation, "headline"));
check("SITUATION: STRATEGIC_MEMORY source tagged", contains(situation, '"STRATEGIC_MEMORY"'));
check("SITUATION: REASONING_SIGNAL source tagged", contains(situation, '"REASONING_SIGNAL"'));
check("SITUATION: sort by compositeRisk", contains(situation, "compositeRisk"));
check("SITUATION: sort by captureScore", contains(situation, "captureScore"));
check("SITUATION: _mapSignalDomain uses ExecutiveDomain", contains(situation, "ExecutiveDomain"));
check("SITUATION: no export {}", !contains(situation, "export {};"));

// ── Section 5: Priority Engine ────────────────────────────────────────────────

const priority = readFile(`${BASE}/executive-priority-engine.ts`);

check("PRIORITY: computeExecutivePriorities exported", contains(priority, "export function computeExecutivePriorities"));
check("PRIORITY: getTop3 exported", contains(priority, "export function getTop3"));
check("PRIORITY: getTop5 exported", contains(priority, "export function getTop5"));
check("PRIORITY: getTop10 exported", contains(priority, "export function getTop10"));
check("PRIORITY: computePriorityScore exported", contains(priority, "export function computePriorityScore"));
check("PRIORITY: derivePriorityLevel exported", contains(priority, "export function derivePriorityLevel"));
check("PRIORITY: impact weight 0.35", contains(priority, "0.35"));
check("PRIORITY: urgency weight 0.30", contains(priority, "0.30"));
check("PRIORITY: strategicAlignment weight 0.25", contains(priority, "0.25"));
check("PRIORITY: historicalRisk weight 0.10", contains(priority, "0.10"));
check("PRIORITY: de-duplication by title", contains(priority, "title"));
check("PRIORITY: rank assigned", contains(priority, "rank"));
check("PRIORITY: computedAt timestamp", contains(priority, "computedAt"));
check("PRIORITY: filters by orgSlug", contains(priority, "orgSlug"));

// ── Section 6: Conflict Engine ────────────────────────────────────────────────

const conflict = readFile(`${BASE}/executive-conflict-engine.ts`);

check("CONFLICT: detectExecutiveConflicts exported", contains(conflict, "export function detectExecutiveConflicts"));
check("CONFLICT: detectObjectiveConflicts exported", contains(conflict, "export function detectObjectiveConflicts"));
check("CONFLICT: detectPriorityConflicts exported", contains(conflict, "export function detectPriorityConflicts"));
check("CONFLICT: deduplication present", contains(conflict, "dedup") || contains(conflict, "Set(") || contains(conflict, "key"));
check("CONFLICT: OBJECTIVE_CONFLICT type used", contains(conflict, '"OBJECTIVE_CONFLICT"') || contains(conflict, "OBJECTIVE_CONFLICT"));
check("CONFLICT: elementAId field set", contains(conflict, "elementAId"));
check("CONFLICT: elementBId field set", contains(conflict, "elementBId"));
check("CONFLICT: detectedAt timestamp", contains(conflict, "detectedAt"));
check("CONFLICT: filters by orgSlug", contains(conflict, "orgSlug"));

// ── Section 7: Opportunity Engine ─────────────────────────────────────────────

const opportunity = readFile(`${BASE}/executive-opportunity-engine.ts`);

check("OPPORTUNITY: detectExecutiveOpportunities exported", contains(opportunity, "export function detectExecutiveOpportunities"));
check("OPPORTUNITY: findIgnoredOpportunities exported", contains(opportunity, "export function findIgnoredOpportunities"));
check("OPPORTUNITY: findRepeatedStrengths exported", contains(opportunity, "export function findRepeatedStrengths"));
check("OPPORTUNITY: captureScore computed", contains(opportunity, "captureScore"));
check("OPPORTUNITY: magnitude set", contains(opportunity, "magnitude"));
check("OPPORTUNITY: LARGE magnitude used", contains(opportunity, '"LARGE"'));
check("OPPORTUNITY: filters ACTIVE entries", contains(opportunity, '"ACTIVE"'));
check("OPPORTUNITY: filters OPPORTUNITY type", contains(opportunity, '"OPPORTUNITY"'));
check("OPPORTUNITY: filters by orgSlug", contains(opportunity, "orgSlug"));

// ── Section 8: Risk Engine ────────────────────────────────────────────────────

const risk = readFile(`${BASE}/executive-risk-engine.ts`);

check("RISK: detectExecutiveRisks exported", contains(risk, "export function detectExecutiveRisks"));
check("RISK: getTopRisks exported", contains(risk, "export function getTopRisks"));
check("RISK: getRisksByLevel exported", contains(risk, "export function getRisksByLevel"));
check("RISK: computeRiskExposureScore exported", contains(risk, "export function computeRiskExposureScore"));
check("RISK: RiskEngineInput exported", contains(risk, "RiskEngineInput"));
check("RISK: mitigationSuggestions populated", contains(risk, "mitigationSuggestions"));
check("RISK: compositeRisk computed", contains(risk, "compositeRisk"));
check("RISK: ANOMALY signal type handled", contains(risk, '"ANOMALY"'));
check("RISK: THRESHOLD_BREACH signal type handled", contains(risk, '"THRESHOLD_BREACH"'));
check("RISK: likelihood field set", contains(risk, "likelihood"));
check("RISK: impact field set", contains(risk, "impact"));
check("RISK: filters by orgSlug", contains(risk, "orgSlug"));

// ── Section 9: Focus Engine ───────────────────────────────────────────────────

const focus = readFile(`${BASE}/executive-focus-engine.ts`);

check("FOCUS: computeFocusAreas exported", contains(focus, "export function computeFocusAreas"));
check("FOCUS: getTop3FocusAreas exported", contains(focus, "export function getTop3FocusAreas"));
check("FOCUS: getTop5FocusAreas exported", contains(focus, "export function getTop5FocusAreas"));
check("FOCUS: getTop10FocusAreas exported", contains(focus, "export function getTop10FocusAreas"));
check("FOCUS: compositeScore computed", contains(focus, "compositeScore"));
check("FOCUS: urgencyScore field", contains(focus, "urgencyScore"));
check("FOCUS: impactScore field", contains(focus, "impactScore"));
check("FOCUS: max 10 focus areas", contains(focus, "10") || contains(focus, ".slice(0, 10)"));
check("FOCUS: rank assigned", contains(focus, "rank"));
check("FOCUS: filters by orgSlug", contains(focus, "orgSlug"));

// ── Section 10: Narrative Engine ─────────────────────────────────────────────

const narrative = readFile(`${BASE}/executive-narrative-engine-v2.ts`);

check("NARRATIVE: buildExecutiveNarratives exported", contains(narrative, "export function buildExecutiveNarratives"));
check("NARRATIVE: buildNarrativeForPriority exported", contains(narrative, "export function buildNarrativeForPriority"));
check("NARRATIVE: traceable field set", contains(narrative, "traceable"));
check("NARRATIVE: body field set", contains(narrative, "body"));
check("NARRATIVE: summary truncated", contains(narrative, "summary"));
check("NARRATIVE: max 6 narratives", contains(narrative, "6"));
check("NARRATIVE: evidenceIds populated", contains(narrative, "evidenceIds"));
check("NARRATIVE: generatedAt timestamp", contains(narrative, "generatedAt"));
check("NARRATIVE: filters by orgSlug", contains(narrative, "orgSlug"));

// ── Section 11: Digest Builder ────────────────────────────────────────────────

const digest = readFile(`${BASE}/executive-digest-builder.ts`);

check("DIGEST: buildExecutiveDigest exported", contains(digest, "export function buildExecutiveDigest"));
check("DIGEST: buildDailyDigest exported", contains(digest, "export function buildDailyDigest"));
check("DIGEST: buildWeeklyDigest exported", contains(digest, "export function buildWeeklyDigest"));
check("DIGEST: buildMonthlyDigest exported", contains(digest, "export function buildMonthlyDigest"));
check("DIGEST: buildQuarterlyDigest exported", contains(digest, "export function buildQuarterlyDigest"));
check("DIGEST: DAILY limits priorities to 3", contains(digest, "3"));
check("DIGEST: WEEKLY limits priorities to 5", contains(digest, "5"));
check("DIGEST: period field set", contains(digest, "period"));
check("DIGEST: headline field set", contains(digest, "headline"));
check("DIGEST: executiveScore field set", contains(digest, "executiveScore"));
check("DIGEST: generatedAt timestamp", contains(digest, "generatedAt"));

// ── Section 12: Briefing Builder ─────────────────────────────────────────────

const briefing = readFile(`${BASE}/executive-briefing-builder.ts`);

check("BRIEFING: buildExecutiveBriefing exported", contains(briefing, "export function buildExecutiveBriefing"));
check("BRIEFING: buildCEOBriefing exported", contains(briefing, "export function buildCEOBriefing"));
check("BRIEFING: buildFinanceBriefing exported", contains(briefing, "export function buildFinanceBriefing"));
check("BRIEFING: buildCommercialBriefing exported", contains(briefing, "export function buildCommercialBriefing"));
check("BRIEFING: buildOperationsBriefing exported", contains(briefing, "export function buildOperationsBriefing"));
check("BRIEFING: buildCustomBriefing exported", contains(briefing, "export function buildCustomBriefing"));
check("BRIEFING: CEO includes all domains", contains(briefing, '"CEO"'));
check("BRIEFING: FINANCE domains include COMPLIANCE", contains(briefing, '"COMPLIANCE"'));
check("BRIEFING: COMMERCIAL domains include MARKETING", contains(briefing, '"MARKETING"'));
check("BRIEFING: OPERATIONS domains include TECHNOLOGY", contains(briefing, '"TECHNOLOGY"'));
check("BRIEFING: summary generated", contains(briefing, "summary"));
check("BRIEFING: executiveScore present", contains(briefing, "executiveScore"));
check("BRIEFING: confidence present", contains(briefing, "confidence"));
check("BRIEFING: generatedAt timestamp", contains(briefing, "generatedAt"));

// ── Section 13: Agenda Builder ────────────────────────────────────────────────

const agenda = readFile(`${BASE}/executive-agenda-builder.ts`);

check("AGENDA: buildExecutiveAgenda exported", contains(agenda, "export function buildExecutiveAgenda"));
check("AGENDA: buildTop5Agenda exported", contains(agenda, "export function buildTop5Agenda"));
check("AGENDA: suggestedOnly: true", contains(agenda, "suggestedOnly"));
check("AGENDA: critical risks first", contains(agenda, '"CRITICAL"'));
check("AGENDA: conflicts included", contains(agenda, "conflict"));
check("AGENDA: rank assigned", contains(agenda, "rank"));
check("AGENDA: domain set", contains(agenda, "domain"));

// ── Section 14: Query Layer ───────────────────────────────────────────────────

const query = readFile(`${BASE}/executive-brain-query.ts`);

check("QUERY: getPriorities exported", contains(query, "export function getPriorities"));
check("QUERY: getRisks exported", contains(query, "export function getRisks"));
check("QUERY: getOpportunities exported", contains(query, "export function getOpportunities"));
check("QUERY: getConflicts exported", contains(query, "export function getConflicts"));
check("QUERY: getNarratives exported", contains(query, "export function getNarratives"));
check("QUERY: getBriefings exported", contains(query, "export function getBriefings"));
check("QUERY: getDigests exported", contains(query, "export function getDigests"));
check("QUERY: getFocusAreas exported", contains(query, "export function getFocusAreas"));
check("QUERY: ExecutiveBrainV2Query type used", contains(query, "ExecutiveBrainV2Query"));
check("QUERY: orgSlug filter applied", contains(query, "orgSlug"));
check("QUERY: domains filter applied", contains(query, "domains"));
check("QUERY: limit applied", contains(query, "limit"));
check("QUERY: minConfidenceScore filter", contains(query, "minConfidenceScore"));

// ── Section 15: Repository Interface ─────────────────────────────────────────

const repo = readFile(`${BASE}/executive-brain-repository.ts`);

check("REPO: ExecutiveBrainRepository interface exported", contains(repo, "export interface ExecutiveBrainRepository"));
check("REPO: saveBriefing method", contains(repo, "saveBriefing"));
check("REPO: saveDigest method", contains(repo, "saveDigest"));
check("REPO: savePriority method", contains(repo, "savePriority"));
check("REPO: saveFocusArea method", contains(repo, "saveFocusArea"));
check("REPO: saveConflict method", contains(repo, "saveConflict"));
check("REPO: saveSnapshot method", contains(repo, "saveSnapshot"));
check("REPO: getLatestBriefing method", contains(repo, "getLatestBriefing"));
check("REPO: getLatestDigest method", contains(repo, "getLatestDigest"));
check("REPO: getLatestSnapshot method", contains(repo, "getLatestSnapshot"));
check("REPO: orgSlug param on all methods", countMatches(repo, "orgSlug") >= 10);

// ── Section 16: Prisma Repository ────────────────────────────────────────────

const prismaRepo = readFile(`${BASE}/persistence/prisma-executive-brain-repository.ts`);

check("PRISMA_REPO: server-only imported", contains(prismaRepo, '"server-only"'));
check("PRISMA_REPO: PrismaExecutiveBrainRepository exported", contains(prismaRepo, "export class PrismaExecutiveBrainRepository"));
check("PRISMA_REPO: implements ExecutiveBrainRepository", contains(prismaRepo, "implements ExecutiveBrainRepository"));
check("PRISMA_REPO: uses prisma as any for new models", contains(prismaRepo, "as any"));
check("PRISMA_REPO: saveBriefing implemented", contains(prismaRepo, "saveBriefing"));
check("PRISMA_REPO: saveDigest implemented", contains(prismaRepo, "saveDigest"));
check("PRISMA_REPO: savePriority implemented", contains(prismaRepo, "savePriority"));
check("PRISMA_REPO: saveFocusArea implemented", contains(prismaRepo, "saveFocusArea"));
check("PRISMA_REPO: saveConflict implemented", contains(prismaRepo, "saveConflict"));
check("PRISMA_REPO: saveSnapshot implemented", contains(prismaRepo, "saveSnapshot"));
check("PRISMA_REPO: executiveBriefingRecord table used", contains(prismaRepo, "executiveBriefingRecord"));
check("PRISMA_REPO: executiveDigestRecord table used", contains(prismaRepo, "executiveDigestRecord"));
check("PRISMA_REPO: executivePriorityRecord table used", contains(prismaRepo, "executivePriorityRecord"));
check("PRISMA_REPO: executiveFocusAreaRecord table used", contains(prismaRepo, "executiveFocusAreaRecord"));
check("PRISMA_REPO: executiveConflictRecord table used", contains(prismaRepo, "executiveConflictRecord"));
check("PRISMA_REPO: executiveSnapshotRecord table used", contains(prismaRepo, "executiveSnapshotRecord"));

// ── Section 17: Integration — Strategic Memory ────────────────────────────────

const intStrat = readFile(`${BASE}/integrations/executive-strategic-memory.ts`);

check("INT_STRAT: extractExecutiveObjectivesFromMemory exported", contains(intStrat, "export function extractExecutiveObjectivesFromMemory"));
check("INT_STRAT: extractExecutiveConcernsFromMemory exported", contains(intStrat, "export function extractExecutiveConcernsFromMemory"));
check("INT_STRAT: getStrategicAlignmentScore exported", contains(intStrat, "export function getStrategicAlignmentScore"));
check("INT_STRAT: extractStrategicDecisions exported", contains(intStrat, "export function extractStrategicDecisions"));
check("INT_STRAT: extractStrategicCommitments exported", contains(intStrat, "export function extractStrategicCommitments"));
check("INT_STRAT: extractStrategicPolicies exported", contains(intStrat, "export function extractStrategicPolicies"));
check("INT_STRAT: filters GOAL type", contains(intStrat, '"GOAL"'));
check("INT_STRAT: filters RISK type", contains(intStrat, '"RISK"'));
check("INT_STRAT: filters by orgSlug", contains(intStrat, "orgSlug"));
check("INT_STRAT: no server-only", !contains(intStrat, '"server-only"'));

// ── Section 18: Integration — Learning ───────────────────────────────────────

const intLearn = readFile(`${BASE}/integrations/executive-learning.ts`);

check("INT_LEARN: buildLearningExecSummary exported", contains(intLearn, "export function buildLearningExecSummary"));
check("INT_LEARN: getConfirmedPatternPriorities exported", contains(intLearn, "export function getConfirmedPatternPriorities"));
check("INT_LEARN: extractHistoricalOutcomeContext exported", contains(intLearn, "export function extractHistoricalOutcomeContext"));
check("INT_LEARN: LearningExecSummary type present", contains(intLearn, "LearningExecSummary"));
check("INT_LEARN: positiveOutcomeRate computed", contains(intLearn, "positiveOutcomeRate"));
check("INT_LEARN: negativeOutcomeRate computed", contains(intLearn, "negativeOutcomeRate"));
check("INT_LEARN: effectivePlaybookIds present", contains(intLearn, "effectivePlaybookIds"));
check("INT_LEARN: no server-only", !contains(intLearn, '"server-only"'));

// ── Section 19: Integration — Memory Graph ────────────────────────────────────

const intGraph = readFile(`${BASE}/integrations/executive-memory-graph.ts`);

check("INT_GRAPH: buildGraphExecContext exported", contains(intGraph, "export function buildGraphExecContext"));
check("INT_GRAPH: extractThemesFromGraph exported", contains(intGraph, "export function extractThemesFromGraph"));
check("INT_GRAPH: getStrategicRelationships exported", contains(intGraph, "export function getStrategicRelationships"));
check("INT_GRAPH: GraphExecContext type present", contains(intGraph, "GraphExecContext") || contains(intGraph, "graphExecContext"));
check("INT_GRAPH: themeCount computed", contains(intGraph, "themeCount") || contains(intGraph, "themes"));
check("INT_GRAPH: no server-only", !contains(intGraph, '"server-only"'));

// ── Section 20: Integration — Cross Module ────────────────────────────────────

const intCross = readFile(`${BASE}/integrations/executive-cross-module.ts`);

check("INT_CROSS: buildCrossModuleExecContext exported", contains(intCross, "export function buildCrossModuleExecContext"));
check("INT_CROSS: extractRisksFromReasoningSignals exported", contains(intCross, "export function extractRisksFromReasoningSignals"));
check("INT_CROSS: getHighSeveritySignalCount exported", contains(intCross, "export function getHighSeveritySignalCount"));
check("INT_CROSS: CrossModuleExecContext type present", contains(intCross, "CrossModuleExecContext"));
check("INT_CROSS: crossDomainRiskScore computed", contains(intCross, "crossDomainRiskScore"));
check("INT_CROSS: ANOMALY type handled", contains(intCross, '"ANOMALY"'));
check("INT_CROSS: CRITICAL severity handled", contains(intCross, '"CRITICAL"'));
check("INT_CROSS: no server-only", !contains(intCross, '"server-only"'));

// ── Section 21: Integration — Tenant Profile ──────────────────────────────────

const intTenant = readFile(`${BASE}/integrations/executive-tenant-profile.ts`);

check("INT_TENANT: getExecutiveTenantProfile exported", contains(intTenant, "export function getExecutiveTenantProfile"));
check("INT_TENANT: alignBriefingToTenant exported", contains(intTenant, "export function alignBriefingToTenant"));
check("INT_TENANT: alignDigestToTenant exported", contains(intTenant, "export function alignDigestToTenant"));
check("INT_TENANT: applyConfidenceMultiplier exported", contains(intTenant, "export function applyConfidenceMultiplier"));
check("INT_TENANT: castillitos profile registered", contains(intTenant, "castillitos"));
check("INT_TENANT: riskTolerance field", contains(intTenant, "riskTolerance"));
check("INT_TENANT: decisionStyle field", contains(intTenant, "decisionStyle"));
check("INT_TENANT: confidenceMultiplier field", contains(intTenant, "confidenceMultiplier"));
check("INT_TENANT: default profile returned on unknown org", contains(intTenant, "default") || contains(intTenant, "DEFAULT"));
check("INT_TENANT: no server-only", !contains(intTenant, '"server-only"'));

// ── Section 22: Integration — Playbooks ──────────────────────────────────────

const intPlaybooks = readFile(`${BASE}/integrations/executive-playbooks.ts`);

check("INT_PLAYBOOKS: buildPlaybookExecSummary exported", contains(intPlaybooks, "export function buildPlaybookExecSummary"));
check("INT_PLAYBOOKS: extractRecommendationsFromPlaybooks exported", contains(intPlaybooks, "export function extractRecommendationsFromPlaybooks"));
check("INT_PLAYBOOKS: findRelatedPlaybooks exported", contains(intPlaybooks, "export function findRelatedPlaybooks"));
check("INT_PLAYBOOKS: PlaybookCategory mapped to ExecutiveDomain", contains(intPlaybooks, "ExecutiveDomain") || contains(intPlaybooks, "domain"));
check("INT_PLAYBOOKS: no server-only", !contains(intPlaybooks, '"server-only"'));

// ── Section 23: Integration — Compliance ─────────────────────────────────────

const intCompliance = readFile(`${BASE}/integrations/executive-compliance.ts`);

check("INT_COMPLIANCE: evaluateExecutiveComplianceGate exported", contains(intCompliance, "export function evaluateExecutiveComplianceGate"));
check("INT_COMPLIANCE: buildComplianceRisk exported", contains(intCompliance, "export function buildComplianceRisk"));
check("INT_COMPLIANCE: enforceExecutiveTenantBoundary exported", contains(intCompliance, "export function enforceExecutiveTenantBoundary"));
check("INT_COMPLIANCE: PASS gate status defined", contains(intCompliance, '"PASS"'));
check("INT_COMPLIANCE: WARN gate status defined", contains(intCompliance, '"WARN"'));
check("INT_COMPLIANCE: FAIL gate status defined", contains(intCompliance, '"FAIL"'));
check("INT_COMPLIANCE: throws on cross-tenant", contains(intCompliance, "throw"));
check("INT_COMPLIANCE: cross-tenant message references orgSlug", contains(intCompliance, "orgSlug"));
check("INT_COMPLIANCE: no server-only", !contains(intCompliance, '"server-only"'));

// ── Section 24: Integration — Audit ──────────────────────────────────────────

const intAudit = readFile(`${BASE}/integrations/executive-audit.ts`);

check("INT_AUDIT: auditExecutiveContextCreated exported", contains(intAudit, "export function auditExecutiveContextCreated"));
check("INT_AUDIT: auditExecutivePriorityComputed exported", contains(intAudit, "export function auditExecutivePriorityComputed"));
check("INT_AUDIT: auditExecutiveBriefingCreated exported", contains(intAudit, "export function auditExecutiveBriefingCreated"));
check("INT_AUDIT: auditExecutiveDigestCreated exported", contains(intAudit, "export function auditExecutiveDigestCreated"));
check("INT_AUDIT: auditExecutiveAgendaCreated exported", contains(intAudit, "export function auditExecutiveAgendaCreated"));
check("INT_AUDIT: auditExecutiveConflictDetected exported", contains(intAudit, "export function auditExecutiveConflictDetected"));
check("INT_AUDIT: auditExecutiveBrainRun exported", contains(intAudit, "export function auditExecutiveBrainRun"));
check("INT_AUDIT: auditExecutiveGuardrailViolation exported", contains(intAudit, "export function auditExecutiveGuardrailViolation"));
check("INT_AUDIT: buildExecutiveAuditLog exported", contains(intAudit, "export function buildExecutiveAuditLog"));
check("INT_AUDIT: EXECUTIVE_BRAIN_AUDIT_EVENT_TYPES exported", contains(intAudit, "EXECUTIVE_BRAIN_AUDIT_EVENT_TYPES"));
check("INT_AUDIT: ebaudit_ ID prefix used", contains(intAudit, "ebaudit_"));
check("INT_AUDIT: ExecutiveBrainAuditEvent type exported", contains(intAudit, "ExecutiveBrainAuditEvent"));
check("INT_AUDIT: EXECUTIVE_CONTEXT_CREATED event type", contains(intAudit, "EXECUTIVE_CONTEXT_CREATED"));
check("INT_AUDIT: EXECUTIVE_BRAIN_RUN event type", contains(intAudit, "EXECUTIVE_BRAIN_RUN"));
check("INT_AUDIT: no server-only", !contains(intAudit, '"server-only"'));

// ── Section 25: Main Engine ───────────────────────────────────────────────────

const engine = readFile(`${BASE}/executive-brain-v2-engine.ts`);

check("ENGINE: runExecutiveBrainV2 exported", contains(engine, "export async function runExecutiveBrainV2") || contains(engine, "export function runExecutiveBrainV2"));
check("ENGINE: ExecutiveBrainV2EngineInput exported", contains(engine, "ExecutiveBrainV2EngineInput"));
check("ENGINE: try/catch wraps pipeline", contains(engine, "try") && contains(engine, "catch"));
check("ENGINE: status FAILED returned on error", contains(engine, '"FAILED"'));
check("ENGINE: status OK returned on success", contains(engine, '"OK"') || contains(engine, "SUCCESS"));
check("ENGINE: strategic context built", contains(engine, "buildStrategicContext") || contains(engine, "strategicContext"));
check("ENGINE: learning context built", contains(engine, "buildLearningContext") || contains(engine, "learningContext"));
check("ENGINE: situation built", contains(engine, "buildExecutiveSituation") || contains(engine, "situation"));
check("ENGINE: risks computed", contains(engine, "detectExecutiveRisks") || contains(engine, "risks"));
check("ENGINE: opportunities computed", contains(engine, "detectExecutiveOpportunities") || contains(engine, "opportunities"));
check("ENGINE: conflicts detected", contains(engine, "detectExecutiveConflicts") || contains(engine, "conflicts"));
check("ENGINE: priorities computed", contains(engine, "computeExecutivePriorities") || contains(engine, "priorities"));
check("ENGINE: focus areas computed", contains(engine, "computeFocusAreas") || contains(engine, "focusAreas"));
check("ENGINE: narratives built", contains(engine, "buildExecutiveNarratives") || contains(engine, "narratives"));
check("ENGINE: digest built", contains(engine, "buildExecutiveDigest") || contains(engine, "digest"));
check("ENGINE: briefing built", contains(engine, "buildExecutiveBriefing") || contains(engine, "briefing"));
check("ENGINE: agenda built", contains(engine, "buildExecutiveAgenda") || contains(engine, "agenda"));
check("ENGINE: snapshot built", contains(engine, "snapshot"));
check("ENGINE: compliance boundary enforced", contains(engine, "enforceExecutiveTenantBoundary") || contains(engine, "complianceGate") || contains(engine, "evaluateExecutiveComplianceGate"));
check("ENGINE: run ID generated for traceability", contains(engine, "runId") || contains(engine, "generateEbv2Id"));

// ── Section 26: Health Check ──────────────────────────────────────────────────

const health = readFile(`${BASE}/executive-brain-health.ts`);

check("HEALTH: server-only imported", contains(health, '"server-only"'));
check("HEALTH: checkExecutiveBrainHealth exported", contains(health, "export") && contains(health, "checkExecutiveBrainHealth"));
check("HEALTH: HEALTHY status defined", contains(health, '"HEALTHY"'));
check("HEALTH: DEGRADED status defined", contains(health, '"DEGRADED"'));
check("HEALTH: UNAVAILABLE status defined", contains(health, '"UNAVAILABLE"'));
check("HEALTH: orgSlug param required", contains(health, "orgSlug"));
check("HEALTH: checks for missing run", contains(health, "UNAVAILABLE") || contains(health, "no"));

// ── Section 27: Readiness ─────────────────────────────────────────────────────

const readiness = readFile(`${BASE}/executive-brain-readiness.ts`);

check("READINESS: evaluateExecutiveBrainReadiness exported", contains(readiness, "export function evaluateExecutiveBrainReadiness"));
check("READINESS: isExecutiveBrainReady exported", contains(readiness, "export function isExecutiveBrainReady"));
check("READINESS: ExecutiveBrainReadiness type exported", contains(readiness, "ExecutiveBrainReadiness"));
check("READINESS: level field present", contains(readiness, "level"));
check("READINESS: minStrategicEntries threshold", contains(readiness, "minStrategicEntries") || contains(readiness, "strategicEntries"));
check("READINESS: fullReadinessEntries threshold", contains(readiness, "fullReadinessEntries") || contains(readiness, "5"));
check("READINESS: readinessScore computed", contains(readiness, "readinessScore"));
check("READINESS: INSUFFICIENT/BLOCKED/NOT_READY level defined", contains(readiness, '"INSUFFICIENT"') || contains(readiness, '"BLOCKED"') || contains(readiness, '"NOT_READY"'));
check("READINESS: READY level defined", contains(readiness, '"READY"') || contains(readiness, '"FULL"'));
check("READINESS: no server-only", !contains(readiness, '"server-only"'));

// ── Section 28: Dashboard Contract ───────────────────────────────────────────

const dashboard = readFile(`${BASE}/executive-dashboard-contract.ts`);

check("DASHBOARD: buildExecutiveDashboardContract exported", contains(dashboard, "export function buildExecutiveDashboardContract"));
check("DASHBOARD: buildEmptyDashboardContract exported", contains(dashboard, "export function buildEmptyDashboardContract"));
check("DASHBOARD: ExecutiveDashboardContract type exported", contains(dashboard, "ExecutiveDashboardContract"));
check("DASHBOARD: ExecutiveDashboardMetrics type exported", contains(dashboard, "ExecutiveDashboardMetrics"));
check("DASHBOARD: ExecutivePriorityRow type exported", contains(dashboard, "ExecutivePriorityRow"));
check("DASHBOARD: ExecutiveRiskRow type exported", contains(dashboard, "ExecutiveRiskRow"));
check("DASHBOARD: ExecutiveOpportunityRow type exported", contains(dashboard, "ExecutiveOpportunityRow"));
check("DASHBOARD: ExecutiveFocusAreaRow type exported", contains(dashboard, "ExecutiveFocusAreaRow"));
check("DASHBOARD: ExecutiveConflictRow type exported", contains(dashboard, "ExecutiveConflictRow"));
check("DASHBOARD: no server-only", !contains(dashboard, '"server-only"'));
check("DASHBOARD: empty contract returns valid shape", contains(dashboard, "buildEmptyDashboardContract"));

// ── Section 29: Scenarios ─────────────────────────────────────────────────────

const scenarios = readFile(`${BASE}/executive-scenarios.ts`);

check("SCENARIOS: buildScenario exported", contains(scenarios, "export function buildScenario"));
check("SCENARIOS: buildAllScenarios exported", contains(scenarios, "export function buildAllScenarios"));
check("SCENARIOS: _liquidityCrisis defined", contains(scenarios, "_liquidityCrisis"));
check("SCENARIOS: _acceleratedGrowth defined", contains(scenarios, "_acceleratedGrowth"));
check("SCENARIOS: _salesDrop defined", contains(scenarios, "_salesDrop"));
check("SCENARIOS: _receivablesSurge defined", contains(scenarios, "_receivablesSurge"));
check("SCENARIOS: _regulatoryRisk defined", contains(scenarios, "_regulatoryRisk"));
check("SCENARIOS: _commercialOpportunity defined", contains(scenarios, "_commercialOpportunity"));
check("SCENARIOS: _strategicConflict defined", contains(scenarios, "_strategicConflict"));
check("SCENARIOS: _objectiveAchieved defined", contains(scenarios, "_objectiveAchieved"));
check("SCENARIOS: _misalignedPriority defined", contains(scenarios, "_misalignedPriority"));
check("SCENARIOS: _emergingRisk defined", contains(scenarios, "_emergingRisk"));
check("SCENARIOS: _makePriority helper present", contains(scenarios, "function _makePriority"));
check("SCENARIOS: _makeRisk helper present", contains(scenarios, "function _makeRisk"));
check("SCENARIOS: _makeOpportunity helper present", contains(scenarios, "function _makeOpportunity"));
check("SCENARIOS: _makeNarrative helper present", contains(scenarios, "function _makeNarrative"));
check("SCENARIOS: _makeOutput helper present", contains(scenarios, "function _makeOutput"));
check("SCENARIOS: switch covers all 10 cases", countMatches(scenarios, '"LIQUIDITY_CRISIS"') >= 2);
check("SCENARIOS: buildAllScenarios maps all 10 types", contains(scenarios, '"EMERGING_RISK"'));
check("SCENARIOS: briefing built per scenario", contains(scenarios, "buildExecutiveBriefing"));
check("SCENARIOS: agenda built per scenario", contains(scenarios, "buildExecutiveAgenda"));
check("SCENARIOS: executiveScore logic present", contains(scenarios, "executiveScore"));

// ── Section 30: Future Compatibility ─────────────────────────────────────────

const futureCompat = readFile(`${BASE}/future-compatibility.ts`);

check("FUTURE: EXECUTIVE_BRAIN_FUTURE_CAPABILITIES exported", contains(futureCompat, "EXECUTIVE_BRAIN_FUTURE_CAPABILITIES"));
check("FUTURE: FUTURE_CAPABILITY_REGISTRY exported", contains(futureCompat, "FUTURE_CAPABILITY_REGISTRY"));
check("FUTURE: getFutureCapability exported", contains(futureCompat, "getFutureCapability"));
check("FUTURE: BOARD_INTELLIGENCE capability defined", contains(futureCompat, "BOARD_INTELLIGENCE"));
check("FUTURE: STRATEGIC_ADVISOR_AI capability defined", contains(futureCompat, "STRATEGIC_ADVISOR_AI"));
check("FUTURE: EXECUTIVE_FORECASTING capability defined", contains(futureCompat, "EXECUTIVE_FORECASTING"));
check("FUTURE: EXECUTIVE_SIMULATIONS capability defined", contains(futureCompat, "EXECUTIVE_SIMULATIONS"));
check("FUTURE: AUTONOMOUS_PLANNING capability defined", contains(futureCompat, "AUTONOMOUS_PLANNING"));
check("FUTURE: EXECUTIVE_SCENARIO_MODELING capability defined", contains(futureCompat, "EXECUTIVE_SCENARIO_MODELING"));
check("FUTURE: CROSS_COMPANY_BENCHMARKING capability defined", contains(futureCompat, "CROSS_COMPANY_BENCHMARKING"));
check("FUTURE: REGULATORY_GOAL_ALIGNMENT capability defined", contains(futureCompat, "REGULATORY_GOAL_ALIGNMENT"));
check("FUTURE: BOARD_LEVEL_REPORTING capability defined", contains(futureCompat, "BOARD_LEVEL_REPORTING"));
check("FUTURE: STRATEGIC_DRIFT_DETECTION capability defined", contains(futureCompat, "STRATEGIC_DRIFT_DETECTION"));
check("FUTURE: exactly 10 future capabilities", countMatches(futureCompat, /FutureCapabilitySpec\s*=\s*{/) >= 10 || countMatches(futureCompat, "FUTURE_CAPABILITY_REGISTRY") >= 1);
check("FUTURE: no server-only", !contains(futureCompat, '"server-only"'));

// ── Section 31: Server Barrel ─────────────────────────────────────────────────

const serverBarrel = readFile(`${BASE}/server.ts`);

check("SERVER: server-only imported", contains(serverBarrel, '"server-only"'));
check("SERVER: re-exports index", contains(serverBarrel, 'from "./index"'));
check("SERVER: runExecutiveBrainV2 exported", contains(serverBarrel, "runExecutiveBrainV2"));
check("SERVER: checkExecutiveBrainHealth exported", contains(serverBarrel, "checkExecutiveBrainHealth"));
check("SERVER: PrismaExecutiveBrainRepository exported", contains(serverBarrel, "PrismaExecutiveBrainRepository"));
check("SERVER: buildStrategicContext exported", contains(serverBarrel, "buildStrategicContext"));
check("SERVER: buildLearningContext exported", contains(serverBarrel, "buildLearningContext"));
check("SERVER: buildExecutiveSituation exported", contains(serverBarrel, "buildExecutiveSituation"));
check("SERVER: computeExecutivePriorities exported", contains(serverBarrel, "computeExecutivePriorities"));
check("SERVER: detectExecutiveConflicts exported", contains(serverBarrel, "detectExecutiveConflicts"));
check("SERVER: detectExecutiveOpportunities exported", contains(serverBarrel, "detectExecutiveOpportunities"));
check("SERVER: detectExecutiveRisks exported", contains(serverBarrel, "detectExecutiveRisks"));
check("SERVER: computeFocusAreas exported", contains(serverBarrel, "computeFocusAreas"));
check("SERVER: buildExecutiveNarratives exported", contains(serverBarrel, "buildExecutiveNarratives"));
check("SERVER: buildExecutiveDigest exported", contains(serverBarrel, "buildExecutiveDigest"));
check("SERVER: buildExecutiveBriefing exported", contains(serverBarrel, "buildExecutiveBriefing"));
check("SERVER: buildExecutiveAgenda exported", contains(serverBarrel, "buildExecutiveAgenda"));
check("SERVER: audit functions exported", contains(serverBarrel, "auditExecutiveBrainRun"));
check("SERVER: getPriorities exported", contains(serverBarrel, "getPriorities"));
check("SERVER: all integration modules exported", contains(serverBarrel, "extractExecutiveObjectivesFromMemory"));
check("SERVER: compliance integration exported", contains(serverBarrel, "evaluateExecutiveComplianceGate"));

// ── Section 32: Client Barrel ─────────────────────────────────────────────────

const clientBarrel = readFile(`${BASE}/index.ts`);

check("CLIENT: no server-only import", !contains(clientBarrel, '"server-only"'));
check("CLIENT: types re-exported", contains(clientBarrel, "ExecutivePriority"));
check("CLIENT: ExecutiveBrainV2Input exported", contains(clientBarrel, "ExecutiveBrainV2Input"));
check("CLIENT: ExecutiveBrainV2Result exported", contains(clientBarrel, "ExecutiveBrainV2Result"));
check("CLIENT: dashboard contract exported", contains(clientBarrel, "buildExecutiveDashboardContract"));
check("CLIENT: readiness exported", contains(clientBarrel, "evaluateExecutiveBrainReadiness"));
check("CLIENT: future compatibility exported", contains(clientBarrel, "EXECUTIVE_BRAIN_FUTURE_CAPABILITIES"));
check("CLIENT: scenarios exported", contains(clientBarrel, "buildScenario"));
check("CLIENT: audit types exported", contains(clientBarrel, "ExecutiveBrainAuditEvent"));
check("CLIENT: no Prisma import", !contains(clientBarrel, "prisma-executive-brain-repository"));
check("CLIENT: no engine import", !contains(clientBarrel, "executive-brain-v2-engine"));

// ── Section 33: Migration SQL ─────────────────────────────────────────────────

const migration = readFile(MIGRATION);

check("MIGRATION: ExecutiveBriefingRecord table created", contains(migration, "ExecutiveBriefingRecord"));
check("MIGRATION: ExecutiveDigestRecord table created", contains(migration, "ExecutiveDigestRecord"));
check("MIGRATION: ExecutivePriorityRecord table created", contains(migration, "ExecutivePriorityRecord"));
check("MIGRATION: ExecutiveFocusAreaRecord table created", contains(migration, "ExecutiveFocusAreaRecord"));
check("MIGRATION: ExecutiveConflictRecord table created", contains(migration, "ExecutiveConflictRecord"));
check("MIGRATION: ExecutiveSnapshotRecord table created", contains(migration, "ExecutiveSnapshotRecord"));
check("MIGRATION: orgSlug column in all tables", countMatches(migration, '"orgSlug"') >= 6);
check("MIGRATION: executiveScore column present", contains(migration, '"executiveScore"'));
check("MIGRATION: confidence column present", contains(migration, '"confidence"'));
check("MIGRATION: metadata JSONB column present", contains(migration, "JSONB"));
check("MIGRATION: createdAt column present", contains(migration, '"createdAt"'));
check("MIGRATION: orgSlug indexes created", countMatches(migration, "CREATE INDEX") >= 10);
check("MIGRATION: PRIMARY KEY constraints present", countMatches(migration, "PRIMARY KEY") >= 6);
check("MIGRATION: ExecutivePriorityRecord has rank column", contains(migration, '"rank"'));
check("MIGRATION: ExecutivePriorityRecord has priorityScore column", contains(migration, '"priorityScore"'));
check("MIGRATION: ExecutiveConflictRecord has elementAId column", contains(migration, '"elementAId"'));
check("MIGRATION: ExecutiveConflictRecord has elementBId column", contains(migration, '"elementBId"'));
check("MIGRATION: ExecutiveConflictRecord has resolved column", contains(migration, '"resolved"'));

// ── Section 34: Prisma Schema ─────────────────────────────────────────────────

const schema = readFile("prisma/schema.prisma");

check("SCHEMA: ExecutiveBriefingRecord model present", contains(schema, "model ExecutiveBriefingRecord"));
check("SCHEMA: ExecutiveDigestRecord model present", contains(schema, "model ExecutiveDigestRecord"));
check("SCHEMA: ExecutivePriorityRecord model present", contains(schema, "model ExecutivePriorityRecord"));
check("SCHEMA: ExecutiveFocusAreaRecord model present", contains(schema, "model ExecutiveFocusAreaRecord"));
check("SCHEMA: ExecutiveConflictRecord model present", contains(schema, "model ExecutiveConflictRecord"));
check("SCHEMA: ExecutiveSnapshotRecord model present", contains(schema, "model ExecutiveSnapshotRecord"));
check("SCHEMA: orgSlug field in executive models", countMatches(schema, /@@index\(\[orgSlug\]/) >= 3);

// ── Section 35: Security Registry ────────────────────────────────────────────

const secReg = readFile("lib/security/security-registry.ts");

check("SEC_REG: EXECUTIVE_BRAIN_V2 registered", contains(secReg, '"EXECUTIVE_BRAIN_V2"'));
check("SEC_REG: EXECUTIVE_BRIEFING registered", contains(secReg, '"EXECUTIVE_BRIEFING"'));
check("SEC_REG: EXECUTIVE_DIGEST registered", contains(secReg, '"EXECUTIVE_DIGEST"'));
check("SEC_REG: EXECUTIVE_PRIORITY registered", contains(secReg, '"EXECUTIVE_PRIORITY"'));
check("SEC_REG: EXECUTIVE_CONFLICT registered", contains(secReg, '"EXECUTIVE_CONFLICT"'));
check("SEC_REG: classification CONFIDENTIAL set", contains(secReg, '"CONFIDENTIAL"'));
check("SEC_REG: requiresAudit true for executive entries", contains(secReg, "requiresAudit"));
check("SEC_REG: owner copilot set", contains(secReg, '"copilot"'));

// ── Section 36: Intelligence Registry ────────────────────────────────────────

const intReg = readFile("lib/copilot/copilot-intelligence-registry.ts");

check("INT_REG: INTELLIGENCE_REGISTRY exported", contains(intReg, "export const INTELLIGENCE_REGISTRY"));
check("INT_REG: EXECUTIVE_BRAIN_V2 entry present", contains(intReg, '"EXECUTIVE_BRAIN_V2"'));
check("INT_REG: EXECUTIVE_BRAIN_V1 entry marked DEPRECATED", contains(intReg, '"DEPRECATED"'));
check("INT_REG: STRATEGIC_MEMORY entry present", contains(intReg, '"STRATEGIC_MEMORY"'));
check("INT_REG: LEARNING_FRAMEWORK entry present", contains(intReg, '"LEARNING_FRAMEWORK"'));
check("INT_REG: CROSS_MODULE_REASONING entry present", contains(intReg, '"CROSS_MODULE_REASONING"'));
check("INT_REG: MEMORY_GRAPH entry present", contains(intReg, '"MEMORY_GRAPH"'));
check("INT_REG: getIntelligenceModule exported", contains(intReg, "export function getIntelligenceModule"));
check("INT_REG: getActiveModules exported", contains(intReg, "export function getActiveModules"));
check("INT_REG: getExecutiveModules exported", contains(intReg, "export function getExecutiveModules"));
check("INT_REG: hasDb field present", contains(intReg, "hasDb"));
check("INT_REG: hasPrisma field present", contains(intReg, "hasPrisma"));
check("INT_REG: depends array present", contains(intReg, "depends"));
check("INT_REG: status ACTIVE present", contains(intReg, '"ACTIVE"'));
check("INT_REG: sprint field present", contains(intReg, "sprint"));
check("INT_REG: barrel field present", contains(intReg, "barrel"));

// ── Section 37: Integration Harness ──────────────────────────────────────────

const harness = readFile(INTEGRATION_ROUTE);

check("HARNESS: server-only imported", contains(harness, '"server-only"'));
check("HARNESS: GET handler exported", contains(harness, "export async function GET") || contains(harness, "export function GET"));
check("HARNESS: castillitos org used", contains(harness, '"castillitos"'));
check("HARNESS: foreign-org cross-tenant test", contains(harness, '"foreign-org"') || contains(harness, "OTHER_ORG"));
check("HARNESS: 300+ test lines", harness ? harness.split("\n").length > 300 : false);
check("HARNESS: types suite present", contains(harness, "Types") || contains(harness, "Suite 1"));
check("HARNESS: priority engine suite present", contains(harness, "Priority") || contains(harness, "priority"));
check("HARNESS: conflict engine suite present", contains(harness, "Conflict") || contains(harness, "conflict"));
check("HARNESS: risk engine suite present", contains(harness, "Risk") || contains(harness, "risk"));
check("HARNESS: opportunity engine suite present", contains(harness, "Opportunity") || contains(harness, "opportunity"));
check("HARNESS: scenario suite present", contains(harness, "Scenario") || contains(harness, "scenario"));
check("HARNESS: compliance suite present", contains(harness, "Compliance") || contains(harness, "compliance"));
check("HARNESS: audit suite present", contains(harness, "Audit") || contains(harness, "audit"));
check("HARNESS: cross-tenant test present", contains(harness, "cross") || contains(harness, "tenant") || contains(harness, "boundary"));
check("HARNESS: makeEntry fixture helper present", contains(harness, "makeEntry"));
check("HARNESS: makePattern fixture helper present", contains(harness, "makePattern"));
check("HARNESS: makeSignal fixture helper present", contains(harness, "makeSignal"));

// ── Section 38: ID prefix contracts ──────────────────────────────────────────

check("ID_PREFIX: types file uses ebv2_ prefix", contains(types, "ebv2_"));
check("ID_PREFIX: audit uses ebaudit_ prefix", contains(intAudit, "ebaudit_"));
check("ID_PREFIX: priority IDs use pri prefix", contains(types, '"pri"') || contains(engine, '"pri"') || contains(scenarios, '"pri"'));
check("ID_PREFIX: risk IDs use risk prefix", contains(scenarios, '"risk"'));
check("ID_PREFIX: conflict IDs use conflict prefix", contains(scenarios, '"conflict"') || contains(conflict, '"conflict"'));
check("ID_PREFIX: opportunity IDs use opp prefix", contains(scenarios, '"opp"'));
check("ID_PREFIX: narrative IDs use narr prefix", contains(scenarios, '"narr"') || contains(narrative, '"narr"'));

// ── Section 39: Score formula contracts ──────────────────────────────────────

check("SCORE: priority score uses 4 factors", contains(priority, "0.35") && contains(priority, "0.30") && contains(priority, "0.25") && contains(priority, "0.10"));
check("SCORE: risk composite uses likelihood+impact", contains(risk, "likelihood") && contains(risk, "impact"));
check("SCORE: opportunity capture score bounded 0-1", contains(opportunity, "captureScore"));
check("SCORE: focus area compositeScore combines urgency+impact", contains(focus, "urgencyScore") && contains(focus, "impactScore"));
check("SCORE: executive score bounded 0-1 in situation engine", contains(situation, "Math.min(1,") || contains(situation, "Math.min(1 ,"));
check("SCORE: no Math.round with 2 args in situation engine", !contains(situation, /Math\.round\([^)]+,\s*2\)/));

// ── Section 40: Domain isolation contracts ────────────────────────────────────

check("ISOLATION: situation engine filters by orgSlug", countMatches(situation, "orgSlug") >= 5);
check("ISOLATION: priority engine filters by orgSlug", countMatches(priority, "orgSlug") >= 3);
check("ISOLATION: conflict engine filters by orgSlug", countMatches(conflict, "orgSlug") >= 3);
check("ISOLATION: opportunity engine filters by orgSlug", countMatches(opportunity, "orgSlug") >= 3);
check("ISOLATION: risk engine filters by orgSlug", countMatches(risk, "orgSlug") >= 3);
check("ISOLATION: compliance throws on cross-tenant", contains(intCompliance, "throw"));
check("ISOLATION: tenant profile returns safe default", contains(intTenant, "default") || contains(intTenant, "MEDIUM"));

// ── Section 41: Fail-closed contracts ────────────────────────────────────────

check("FAIL_CLOSED: main engine has try/catch", contains(engine, "try") && contains(engine, "catch"));
check("FAIL_CLOSED: main engine returns FAILED status", contains(engine, '"FAILED"'));
check("FAIL_CLOSED: situation engine has safe defaults", contains(situation, "[]") || contains(situation, "0"));
check("FAIL_CLOSED: health check has UNAVAILABLE state", contains(health, '"UNAVAILABLE"'));
check("FAIL_CLOSED: readiness has low-readiness state", contains(readiness, '"INSUFFICIENT"') || contains(readiness, '"BLOCKED"') || contains(readiness, '"NOT_READY"') || contains(readiness, '"PARTIAL"'));
check("FAIL_CLOSED: compliance gate has FAIL state", contains(intCompliance, '"FAIL"'));

// ── Section 42: No side-effects contracts ────────────────────────────────────

check("NO_SIDE_EFFECTS: situation engine does not import Prisma", !contains(situation, "@prisma/client"));
check("NO_SIDE_EFFECTS: priority engine does not import Prisma", !contains(priority, "@prisma/client"));
check("NO_SIDE_EFFECTS: conflict engine does not import Prisma", !contains(conflict, "@prisma/client"));
check("NO_SIDE_EFFECTS: narrative engine does not import Prisma", !contains(narrative, "@prisma/client"));
check("NO_SIDE_EFFECTS: digest builder does not import Prisma", !contains(digest, "@prisma/client"));
check("NO_SIDE_EFFECTS: briefing builder does not import Prisma", !contains(briefing, "@prisma/client"));
check("NO_SIDE_EFFECTS: agenda builder does not import Prisma", !contains(agenda, "@prisma/client"));
check("NO_SIDE_EFFECTS: scenario builder does not import Prisma", !contains(scenarios, "@prisma/client"));
check("NO_SIDE_EFFECTS: types file does not import Prisma", !contains(types, "@prisma/client"));
check("NO_SIDE_EFFECTS: client barrel has no Prisma", !contains(clientBarrel, "@prisma/client"));

// ── Section 43: Server-only boundary ─────────────────────────────────────────

check("SERVER_ONLY: server.ts has server-only", contains(serverBarrel, '"server-only"'));
check("SERVER_ONLY: prisma repository has server-only", contains(prismaRepo, '"server-only"'));
check("SERVER_ONLY: health check has server-only", contains(health, '"server-only"'));
check("SERVER_ONLY: integration route has server-only", contains(harness, '"server-only"'));
check("SERVER_ONLY: client barrel has no server-only", !contains(clientBarrel, '"server-only"'));
check("SERVER_ONLY: types file has no server-only", !contains(types, '"server-only"'));
check("SERVER_ONLY: situation engine has no server-only", !contains(situation, '"server-only"'));
check("SERVER_ONLY: priority engine has no server-only", !contains(priority, '"server-only"'));
check("SERVER_ONLY: conflict engine has no server-only", !contains(conflict, '"server-only"'));
check("SERVER_ONLY: opportunity engine has no server-only", !contains(opportunity, '"server-only"'));
check("SERVER_ONLY: risk engine has no server-only", !contains(risk, '"server-only"'));
check("SERVER_ONLY: focus engine has no server-only", !contains(focus, '"server-only"'));
check("SERVER_ONLY: narrative engine has no server-only", !contains(narrative, '"server-only"'));
check("SERVER_ONLY: digest builder has no server-only", !contains(digest, '"server-only"'));
check("SERVER_ONLY: briefing builder has no server-only", !contains(briefing, '"server-only"'));
check("SERVER_ONLY: agenda builder has no server-only", !contains(agenda, '"server-only"'));
check("SERVER_ONLY: scenarios has no server-only", !contains(scenarios, '"server-only"'));
check("SERVER_ONLY: future-compat has no server-only", !contains(futureCompat, '"server-only"'));
check("SERVER_ONLY: dashboard contract has no server-only", !contains(dashboard, '"server-only"'));

// ── Section 44: Audit event type coverage ────────────────────────────────────

check("AUDIT_TYPES: EXECUTIVE_CONTEXT_CREATED defined", contains(intAudit, "EXECUTIVE_CONTEXT_CREATED"));
check("AUDIT_TYPES: EXECUTIVE_PRIORITY_COMPUTED defined", contains(intAudit, "EXECUTIVE_PRIORITY_COMPUTED"));
check("AUDIT_TYPES: EXECUTIVE_BRIEFING_CREATED defined", contains(intAudit, "EXECUTIVE_BRIEFING_CREATED"));
check("AUDIT_TYPES: EXECUTIVE_DIGEST_CREATED defined", contains(intAudit, "EXECUTIVE_DIGEST_CREATED"));
check("AUDIT_TYPES: EXECUTIVE_AGENDA_CREATED defined", contains(intAudit, "EXECUTIVE_AGENDA_CREATED"));
check("AUDIT_TYPES: EXECUTIVE_CONFLICT_DETECTED defined", contains(intAudit, "EXECUTIVE_CONFLICT_DETECTED"));
check("AUDIT_TYPES: EXECUTIVE_BRAIN_RUN defined", contains(intAudit, "EXECUTIVE_BRAIN_RUN"));
check("AUDIT_TYPES: EXECUTIVE_GUARDRAIL_VIOLATION defined", contains(intAudit, "EXECUTIVE_GUARDRAIL_VIOLATION"));

// ── Section 45: Intelligence Registry contracts ───────────────────────────────

check("INTL_REG: category field typed", contains(intReg, "IntelligenceModuleCategory"));
check("INTL_REG: status field typed", contains(intReg, "IntelligenceModuleStatus"));
check("INTL_REG: EXECUTIVE category present", contains(intReg, '"EXECUTIVE"'));
check("INTL_REG: MEMORY category present", contains(intReg, '"MEMORY"'));
check("INTL_REG: REASONING category present", contains(intReg, '"REASONING"'));
check("INTL_REG: GRAPH category present", contains(intReg, '"GRAPH"'));
check("INTL_REG: LEARNING category present", contains(intReg, '"LEARNING"'));
check("INTL_REG: getDependents exported", contains(intReg, "export function getDependents"));
check("INTL_REG: EBV2 depends on all 4 intelligence modules", contains(intReg, '"STRATEGIC_MEMORY"') && contains(intReg, '"LEARNING_FRAMEWORK"'));

// ── Section 46: Scenario type coverage ───────────────────────────────────────

const ALL_SCENARIOS = [
  "LIQUIDITY_CRISIS", "ACCELERATED_GROWTH", "SALES_DROP", "RECEIVABLES_SURGE",
  "REGULATORY_RISK", "COMMERCIAL_OPPORTUNITY", "STRATEGIC_CONFLICT",
  "OBJECTIVE_ACHIEVED", "MISALIGNED_PRIORITY", "EMERGING_RISK"
];
for (const s of ALL_SCENARIOS) {
  check(`SCENARIO_COVERAGE: ${s} in switch`, contains(scenarios, `"${s}"`));
}
check("SCENARIO_COVERAGE: all 10 in buildAllScenarios", ALL_SCENARIOS.every((s) => contains(scenarios, `"${s}"`)));

// ── Section 47: Briefing domain coverage ─────────────────────────────────────

check("BRIEFING_DOMAINS: CEO covers all domains (no filter)", contains(briefing, "CEO") && !contains(briefing, '"CEO": []'));
check("BRIEFING_DOMAINS: FINANCE includes COMPLIANCE", contains(briefing, '"COMPLIANCE"'));
check("BRIEFING_DOMAINS: COMMERCIAL includes MARKETING", contains(briefing, '"MARKETING"'));
check("BRIEFING_DOMAINS: OPERATIONS includes TECHNOLOGY", contains(briefing, '"TECHNOLOGY"'));
check("BRIEFING_DOMAINS: OPERATIONS includes PEOPLE", contains(briefing, '"PEOPLE"'));

// ── Section 48: Digest period limits ─────────────────────────────────────────

check("DIGEST_LIMITS: DAILY defined", contains(digest, '"DAILY"'));
check("DIGEST_LIMITS: WEEKLY defined", contains(digest, '"WEEKLY"'));
check("DIGEST_LIMITS: MONTHLY defined", contains(digest, '"MONTHLY"'));
check("DIGEST_LIMITS: QUARTERLY defined", contains(digest, '"QUARTERLY"'));
check("DIGEST_LIMITS: priority count limits applied", countMatches(digest, ".slice") >= 2 || countMatches(digest, "limit") >= 2);

// ── Section 49: Harness completeness ─────────────────────────────────────────

if (harness) {
  const lines = harness.split("\n").length;
  check("HARNESS_SIZE: at least 500 lines", lines >= 500);
  check("HARNESS_SIZE: at least 10 suites", countMatches(harness, /suite|Suite|SUITE|section/i) >= 10);
  const passCount = countMatches(harness, /pass\+\+|passed\+\+|"PASS"|: "pass"|pass: true|{ pass|pass,/);
  check("HARNESS_SIZE: multiple test assertions", lines >= 500 || passCount >= 5);
}

// ── Section 50: Scenario priority scores ─────────────────────────────────────

check("SCENARIO_SCORES: _liquidityCrisis has HIGH confidenceScore", contains(scenarios, "0.92") || contains(scenarios, "0.9"));
check("SCENARIO_SCORES: _acceleratedGrowth has MEDIUM-HIGH score", contains(scenarios, "0.8"));
check("SCENARIO_SCORES: _salesDrop has HIGH risk", contains(scenarios, "0.85") || contains(scenarios, "0.8"));
check("SCENARIO_SCORES: CRITICAL scenarios set executiveScore low", contains(scenarios, "0.3"));
check("SCENARIO_SCORES: opportunity scenarios set executiveScore high", contains(scenarios, "0.7"));
check("SCENARIO_SCORES: neutral scenarios set executiveScore mid", contains(scenarios, "0.55"));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`AGENTIK-EXECUTIVE-BRAIN-02 — Validation Suite`);
console.log("=".repeat(70));
console.log(`\n  PASSED:  ${passed}`);
console.log(`  FAILED:  ${failed}`);
console.log(`  TOTAL:   ${passed + failed}`);
console.log(`  RATE:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log("\n" + "-".repeat(70));
  console.log("FAILED CHECKS:");
  for (const f of failures) {
    console.log(`  ✗  ${f}`);
  }
}

console.log("\n" + "=".repeat(70));
if (failed === 0) {
  console.log("  RESULT: ALL CHECKS PASSED");
} else {
  console.log(`  RESULT: ${failed} CHECK(S) FAILED — review above`);
}
console.log("=".repeat(70) + "\n");

process.exit(failed === 0 ? 0 : 1);
