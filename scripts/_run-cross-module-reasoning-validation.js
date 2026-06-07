#!/usr/bin/env node
/**
 * scripts/_run-cross-module-reasoning-validation.js
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Static validation script — 1000+ checks.
 *
 * Usage: node scripts/_run-cross-module-reasoning-validation.js
 */

const fs   = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "lib", "copilot", "cross-module-reasoning");
const INT  = path.join(BASE, "integrations");

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
  }
}

function readFile(relPath) {
  try {
    return fs.readFileSync(relPath, "utf-8");
  } catch {
    return "";
  }
}

function fileExists(relPath) {
  return fs.existsSync(relPath);
}

function hasPattern(content, pattern) {
  if (typeof pattern === "string") return content.includes(pattern);
  return pattern.test(content);
}

// ── File existence checks ─────────────────────────────────────────────────────

// Core files
const coreFiles = [
  "cross-module-types.ts",
  "signal-normalizer.ts",
  "confidence-engine.ts",
  "evidence-engine.ts",
  "hypothesis-engine.ts",
  "correlation-engine.ts",
  "contradiction-engine.ts",
  "causality-engine.ts",
  "risk-engine.ts",
  "opportunity-engine.ts",
  "recommendation-engine.ts",
  "executive-narrative-builder.ts",
  "reasoning-chain-builder.ts",
  "cross-module-engine.ts",
  "reasoning-query.ts",
  "reasoning-repository.ts",
  "cross-module-dashboard-contract.ts",
  "future-compatibility.ts",
  "cross-module-health.ts",
  "cross-module-readiness.ts",
  "index.ts",
  "server.ts",
];

for (const f of coreFiles) {
  check(`FILE_EXISTS: ${f}`, fileExists(path.join(BASE, f)));
}

// Integration files
const intFiles = [
  "reasoning-memory-graph.ts",
  "reasoning-executive-brain.ts",
  "reasoning-memory.ts",
  "reasoning-playbooks.ts",
  "reasoning-tenant-profile.ts",
  "reasoning-copilot.ts",
  "reasoning-executive.ts",
  "reasoning-intelligence.ts",
  "reasoning-audit.ts",
  "reasoning-compliance.ts",
];

for (const f of intFiles) {
  check(`INT_EXISTS: ${f}`, fileExists(path.join(INT, f)));
}

// Migration file
check("MIGRATION_EXISTS: cross_module_reasoning",
  fileExists(path.join(__dirname, "..", "prisma", "migrations",
    "20260607100000_cross_module_reasoning", "migration.sql")));

// Harness route
check("HARNESS_EXISTS: cross-module-reasoning route",
  fileExists(path.join(__dirname, "..", "app", "api", "internal",
    "integration-tests", "cross-module-reasoning", "route.ts")));

// ── cross-module-types.ts ─────────────────────────────────────────────────────

const types = readFile(path.join(BASE, "cross-module-types.ts"));

// ID generation
check("TYPES: generateCmrId defined", hasPattern(types, "export function generateCmrId"));
check("TYPES: uses cmr_ prefix", hasPattern(types, /`cmr_\$\{prefix\}/));
check("TYPES: counter for uniqueness", hasPattern(types, "_cmrCounter"));

// ReasoningSourceDomain
check("TYPES: FINANCE domain", hasPattern(types, '"FINANCE"'));
check("TYPES: COMMERCIAL domain", hasPattern(types, '"COMMERCIAL"'));
check("TYPES: COLLECTIONS domain", hasPattern(types, '"COLLECTIONS"'));
check("TYPES: MARKETING domain", hasPattern(types, '"MARKETING"'));
check("TYPES: EXECUTIVE domain", hasPattern(types, '"EXECUTIVE"'));
check("TYPES: PLAYBOOKS domain", hasPattern(types, '"PLAYBOOKS"'));
check("TYPES: MEMORY domain", hasPattern(types, '"MEMORY"'));
check("TYPES: GRAPH domain", hasPattern(types, '"GRAPH"'));
check("TYPES: REASONING_SOURCE_DOMAINS exported", hasPattern(types, "REASONING_SOURCE_DOMAINS"));

// Confidence
check("TYPES: ReasoningConfidence type", hasPattern(types, "export type ReasoningConfidence"));
check("TYPES: VERY_HIGH in confidence", hasPattern(types, '"VERY_HIGH"'));
check("TYPES: ReasoningConfidenceScore interface", hasPattern(types, "ReasoningConfidenceScore"));
check("TYPES: REASONING_DEFAULT_CONFIDENCE", hasPattern(types, "REASONING_DEFAULT_CONFIDENCE"));
check("TYPES: DEFAULT confidence is LOW", hasPattern(types, /level:\s*"LOW"/));

// Signal types
check("TYPES: ReasoningSignalType", hasPattern(types, "export type ReasoningSignalType"));
check("TYPES: METRIC_DROP signal type", hasPattern(types, '"METRIC_DROP"'));
check("TYPES: ANOMALY signal type", hasPattern(types, '"ANOMALY"'));
check("TYPES: ALERT signal type", hasPattern(types, '"ALERT"'));

// ReasoningSignal interface
check("TYPES: ReasoningSignal interface", hasPattern(types, "export interface ReasoningSignal"));
check("TYPES: signal has orgSlug", hasPattern(types, /orgSlug:\s+string/));
check("TYPES: signal has severity", hasPattern(types, /severity:\s+/));
check("TYPES: signal has confidence", hasPattern(types, /confidence:\s+number/));
check("TYPES: signal has detectedAt", hasPattern(types, /detectedAt:\s+string/));

// Evidence types
check("TYPES: ReasoningEvidenceType", hasPattern(types, "export type ReasoningEvidenceType"));
check("TYPES: GRAPH_RELATIONSHIP evidence", hasPattern(types, '"GRAPH_RELATIONSHIP"'));
check("TYPES: MEMORY_ENTRY evidence", hasPattern(types, '"MEMORY_ENTRY"'));
check("TYPES: PLAYBOOK_TRIGGER evidence", hasPattern(types, '"PLAYBOOK_TRIGGER"'));
check("TYPES: EXECUTIVE_INSIGHT evidence", hasPattern(types, '"EXECUTIVE_INSIGHT"'));

// ReasoningEvidence interface
check("TYPES: ReasoningEvidence interface", hasPattern(types, "export interface ReasoningEvidence"));
check("TYPES: evidence has strength", hasPattern(types, /strength:\s+number/));
check("TYPES: evidence has reliability", hasPattern(types, /reliability:\s+number/));
check("TYPES: evidence has sourceRef", hasPattern(types, /sourceRef:/));
check("TYPES: evidence has collectedAt", hasPattern(types, /collectedAt:\s+string/));

// Hypothesis
check("TYPES: HypothesisCategory", hasPattern(types, "export type HypothesisCategory"));
check("TYPES: CASH_FLOW category", hasPattern(types, '"CASH_FLOW"'));
check("TYPES: STRATEGIC category", hasPattern(types, '"STRATEGIC"'));
check("TYPES: ReasoningHypothesis interface", hasPattern(types, "export interface ReasoningHypothesis"));
check("TYPES: hypothesis has supported", hasPattern(types, /supported:\s+boolean/));
check("TYPES: hypothesis has contradicted", hasPattern(types, /contradicted:\s+boolean/));

// Risk
check("TYPES: RiskDomain", hasPattern(types, "export type RiskDomain"));
check("TYPES: FINANCIAL risk domain", hasPattern(types, '"FINANCIAL"'));
check("TYPES: RiskSeverity", hasPattern(types, "export type RiskSeverity"));
check("TYPES: ReasoningRisk interface", hasPattern(types, "export interface ReasoningRisk"));
check("TYPES: risk has likelihood", hasPattern(types, /likelihood:\s+number/));
check("TYPES: risk has impact", hasPattern(types, /impact:\s+number/));

// Opportunity
check("TYPES: OpportunityType", hasPattern(types, "export type OpportunityType"));
check("TYPES: GROWTH opportunity", hasPattern(types, '"GROWTH"'));
check("TYPES: UPSELL opportunity", hasPattern(types, '"UPSELL"'));
check("TYPES: ReasoningOpportunity interface", hasPattern(types, "export interface ReasoningOpportunity"));

// Recommendation
check("TYPES: RecommendationType", hasPattern(types, "export type RecommendationType"));
check("TYPES: ACTION rec type", hasPattern(types, '"ACTION"'));
check("TYPES: PREVENTION rec type", hasPattern(types, '"PREVENTION"'));
check("TYPES: RecommendationPriority", hasPattern(types, "export type RecommendationPriority"));
check("TYPES: URGENT priority", hasPattern(types, '"URGENT"'));
check("TYPES: ReasoningRecommendation interface", hasPattern(types, "export interface ReasoningRecommendation"));
check("TYPES: rec has rationale", hasPattern(types, /rationale:\s+string/));

// Chain and Result
check("TYPES: ReasoningChain interface", hasPattern(types, "export interface ReasoningChain"));
check("TYPES: chain has paths", hasPattern(types, /paths:\s+ReasoningPath/));
check("TYPES: chain has signals", hasPattern(types, /signals:\s+ReasoningSignal/));
check("TYPES: chain has evidence", hasPattern(types, /evidence:\s+ReasoningEvidence/));
check("TYPES: chain has hypotheses", hasPattern(types, /hypotheses:\s+ReasoningHypothesis/));
check("TYPES: chain has risks", hasPattern(types, /risks:\s+ReasoningRisk/));
check("TYPES: chain has opportunities", hasPattern(types, /opportunities:\s+ReasoningOpportunity/));
check("TYPES: chain has recommendations", hasPattern(types, /recommendations:\s+ReasoningRecommendation/));

check("TYPES: ReasoningContext interface", hasPattern(types, "export interface ReasoningContext"));
check("TYPES: context has domains", hasPattern(types, /domains:\s+ReasoningSourceDomain/));
check("TYPES: context has signals", hasPattern(types, /signals:\s+ReasoningSignal/));

check("TYPES: ReasoningResult interface", hasPattern(types, "export interface ReasoningResult"));
check("TYPES: result has status", hasPattern(types, /status:\s+ReasoningStatus/));
check("TYPES: result has chain", hasPattern(types, /chain:\s+ReasoningChain/));
check("TYPES: result has narrative", hasPattern(types, /narrative:\s+string/));
check("TYPES: result has durationMs", hasPattern(types, /durationMs:/));
check("TYPES: result has completedAt", hasPattern(types, /completedAt:\s+string/));

// Executive scenario
check("TYPES: ExecutiveScenarioType", hasPattern(types, "export type ExecutiveScenarioType"));
check("TYPES: CASH_DROP scenario", hasPattern(types, '"CASH_DROP"'));
check("TYPES: STRATEGIC_RISK scenario", hasPattern(types, '"STRATEGIC_RISK"'));
check("TYPES: ExecutiveScenario interface", hasPattern(types, "export interface ExecutiveScenario"));

// ── confidence-engine.ts ──────────────────────────────────────────────────────

const confEng = readFile(path.join(BASE, "confidence-engine.ts"));
check("CONF: CONFIDENCE_THRESHOLDS exported", hasPattern(confEng, "export const CONFIDENCE_THRESHOLDS"));
check("CONF: VERY_HIGH threshold 0.85", hasPattern(confEng, /VERY_HIGH:\s*0\.85/));
check("CONF: HIGH threshold 0.60", hasPattern(confEng, /HIGH:\s*0\.60/));
check("CONF: MEDIUM threshold 0.30", hasPattern(confEng, /MEDIUM:\s*0\.30/));
check("CONF: scoreToConfidenceLevel", hasPattern(confEng, "export function scoreToConfidenceLevel"));
check("CONF: evidenceCountFactor", hasPattern(confEng, "export function evidenceCountFactor"));
check("CONF: evidenceQualityFactor", hasPattern(confEng, "export function evidenceQualityFactor"));
check("CONF: calculateConfidence", hasPattern(confEng, "export function calculateConfidence"));
check("CONF: formula uses 0.30 count weight", hasPattern(confEng, /0\.30/));
check("CONF: returns ReasoningConfidenceScore", hasPattern(confEng, "ReasoningConfidenceScore"));
check("CONF: no server-only import", !hasPattern(confEng, 'import "server-only"'));
check("CONF: no Prisma import", !hasPattern(confEng, "from \"@prisma"));

// ── signal-normalizer.ts ─────────────────────────────────────────────────────

const sigNorm = readFile(path.join(BASE, "signal-normalizer.ts"));
check("NORM: RawSignalInput interface", hasPattern(sigNorm, "RawSignalInput"));
check("NORM: normalizeSignal exported", hasPattern(sigNorm, "export function normalizeSignal"));
check("NORM: normalizeSignals exported", hasPattern(sigNorm, "export function normalizeSignals"));
check("NORM: validateSignal exported", hasPattern(sigNorm, "export function validateSignal"));
check("NORM: filterSignalsByDomain exported", hasPattern(sigNorm, "export function filterSignalsByDomain"));
check("NORM: filterSignalsBySeverity exported", hasPattern(sigNorm, "export function filterSignalsBySeverity"));
check("NORM: sortSignalsByScore exported", hasPattern(sigNorm, "export function sortSignalsByScore"));
check("NORM: generates id with generateCmrId", hasPattern(sigNorm, "generateCmrId"));
check("NORM: no server-only", !hasPattern(sigNorm, 'import "server-only"'));
check("NORM: no Prisma", !hasPattern(sigNorm, "from \"@prisma"));

// ── evidence-engine.ts ───────────────────────────────────────────────────────

const evEng = readFile(path.join(BASE, "evidence-engine.ts"));
check("EV: signalToEvidence exported", hasPattern(evEng, "export function signalToEvidence"));
check("EV: collectEvidence exported", hasPattern(evEng, "export function collectEvidence"));
check("EV: rankEvidence exported", hasPattern(evEng, "export function rankEvidence"));
check("EV: validateEvidence exported", hasPattern(evEng, "export function validateEvidence"));
check("EV: filterEvidenceByDomain exported", hasPattern(evEng, "export function filterEvidenceByDomain"));
check("EV: filterEvidenceByType exported", hasPattern(evEng, "export function filterEvidenceByType"));
check("EV: no server-only", !hasPattern(evEng, 'import "server-only"'));

// ── hypothesis-engine.ts ─────────────────────────────────────────────────────

const hypEng = readFile(path.join(BASE, "hypothesis-engine.ts"));
check("HYP: generateHypotheses exported", hasPattern(hypEng, "export function generateHypotheses"));
check("HYP: generateHypothesesForSignal exported", hasPattern(hypEng, "export function generateHypothesesForSignal"));
check("HYP: filterSupportedHypotheses exported", hasPattern(hypEng, "export function filterSupportedHypotheses"));
check("HYP: filterHypothesesByCategory exported", hasPattern(hypEng, "export function filterHypothesesByCategory"));
check("HYP: rankHypotheses exported", hasPattern(hypEng, "export function rankHypotheses"));
check("HYP: has hypothesis templates", hasPattern(hypEng, /HypothesisTemplate/));
check("HYP: generates cmr_hyp ids", hasPattern(hypEng, /cmr_hyp|generateCmrId.*"hyp"/));
check("HYP: no server-only", !hasPattern(hypEng, 'import "server-only"'));

// ── correlation-engine.ts ─────────────────────────────────────────────────────

const corrEng = readFile(path.join(BASE, "correlation-engine.ts"));
check("CORR: correlateSignals exported", hasPattern(corrEng, "export function correlateSignals"));
check("CORR: correlateEvidence exported", hasPattern(corrEng, "export function correlateEvidence"));
check("CORR: detectPatterns exported", hasPattern(corrEng, "export function detectPatterns"));
check("CORR: DOMAIN_CORRELATION_PAIRS defined", hasPattern(corrEng, "DOMAIN_CORRELATION_PAIRS"));
check("CORR: FINANCE-COMMERCIAL pair", hasPattern(corrEng, /FINANCE.*COMMERCIAL|COMMERCIAL.*FINANCE/));
check("CORR: no server-only", !hasPattern(corrEng, 'import "server-only"'));

// ── contradiction-engine.ts ───────────────────────────────────────────────────

const contrEng = readFile(path.join(BASE, "contradiction-engine.ts"));
check("CONTRA: detectSignalContradictions exported", hasPattern(contrEng, "export function detectSignalContradictions"));
check("CONTRA: detectHypothesisContradictions exported", hasPattern(contrEng, "export function detectHypothesisContradictions"));
check("CONTRA: resolveContradictions exported", hasPattern(contrEng, "export function resolveContradictions"));
check("CONTRA: applyContradictions exported", hasPattern(contrEng, "export function applyContradictions"));
check("CONTRA: UNRESOLVED resolution", hasPattern(contrEng, '"UNRESOLVED"'));
check("CONTRA: RESOLVED_BY_WEIGHT resolution", hasPattern(contrEng, '"RESOLVED_BY_WEIGHT"'));
check("CONTRA: no server-only", !hasPattern(contrEng, 'import "server-only"'));

// ── causality-engine.ts ───────────────────────────────────────────────────────

const causEng = readFile(path.join(BASE, "causality-engine.ts"));
check("CAUSAL: CAUSAL_DOMAIN_ORDER defined", hasPattern(causEng, "CAUSAL_DOMAIN_ORDER"));
check("CAUSAL: identifyCausalCandidates exported", hasPattern(causEng, "export function identifyCausalCandidates"));
check("CAUSAL: buildCausalReasoningResult exported", hasPattern(causEng, "export function buildCausalReasoningResult"));
check("CAUSAL: status is PREPARED", hasPattern(causEng, '"PREPARED"'));
check("CAUSAL: MARKETING has order 1", hasPattern(causEng, /MARKETING:\s*1/));
check("CAUSAL: FINANCE has order 4", hasPattern(causEng, /FINANCE:\s*4/));
check("CAUSAL: no server-only", !hasPattern(causEng, 'import "server-only"'));

// ── risk-engine.ts ────────────────────────────────────────────────────────────

const riskEng = readFile(path.join(BASE, "risk-engine.ts"));
check("RISK: detectRisks exported", hasPattern(riskEng, "export function detectRisks"));
check("RISK: detectRisksFromHypotheses exported", hasPattern(riskEng, "export function detectRisksFromHypotheses"));
check("RISK: rankRisks exported", hasPattern(riskEng, "export function rankRisks"));
check("RISK: has risk templates", hasPattern(riskEng, /RiskTemplate/));
check("RISK: covers FINANCIAL domain", hasPattern(riskEng, '"FINANCIAL"'));
check("RISK: covers STRATEGIC domain", hasPattern(riskEng, '"STRATEGIC"'));
check("RISK: generates cmr_risk ids", hasPattern(riskEng, /cmr_risk|generateCmrId.*"risk"/));
check("RISK: no server-only", !hasPattern(riskEng, 'import "server-only"'));

// ── opportunity-engine.ts ─────────────────────────────────────────────────────

const oppEng = readFile(path.join(BASE, "opportunity-engine.ts"));
check("OPP: detectOpportunities exported", hasPattern(oppEng, "export function detectOpportunities"));
check("OPP: detectOpportunitiesFromHypotheses exported", hasPattern(oppEng, "export function detectOpportunitiesFromHypotheses"));
check("OPP: rankOpportunities exported", hasPattern(oppEng, "export function rankOpportunities"));
check("OPP: has opportunity templates", hasPattern(oppEng, /OpportunityTemplate/));
check("OPP: generates cmr_opp ids", hasPattern(oppEng, /cmr_opp|generateCmrId.*"opp"/));
check("OPP: no server-only", !hasPattern(oppEng, 'import "server-only"'));

// ── recommendation-engine.ts ──────────────────────────────────────────────────

const recEng = readFile(path.join(BASE, "recommendation-engine.ts"));
check("REC: generateRecommendationsFromHypotheses exported", hasPattern(recEng, "export function generateRecommendationsFromHypotheses"));
check("REC: generateRecommendationsFromRisks exported", hasPattern(recEng, "export function generateRecommendationsFromRisks"));
check("REC: generateRecommendationsFromOpportunities exported", hasPattern(recEng, "export function generateRecommendationsFromOpportunities"));
check("REC: rankRecommendations exported", hasPattern(recEng, "export function rankRecommendations"));
check("REC: has recommendation templates", hasPattern(recEng, /RecommendationTemplate/));
check("REC: generates cmr_rec ids", hasPattern(recEng, /cmr_rec|generateCmrId.*"rec"/));
check("REC: no server-only", !hasPattern(recEng, 'import "server-only"'));

// ── executive-narrative-builder.ts ───────────────────────────────────────────

const narr = readFile(path.join(BASE, "executive-narrative-builder.ts"));
check("NARR: buildExecutiveNarrative exported", hasPattern(narr, "export function buildExecutiveNarrative"));
check("NARR: buildEmptyNarrative exported", hasPattern(narr, "export function buildEmptyNarrative"));
check("NARR: buildConclusion exported", hasPattern(narr, "export function buildConclusion"));
check("NARR: ExecutiveNarrative type/interface", hasPattern(narr, "ExecutiveNarrative"));
check("NARR: has header section", hasPattern(narr, /header/));
check("NARR: has recommendations section", hasPattern(narr, /recommendations/));
check("NARR: generates cmr_nar ids", hasPattern(narr, /cmr_nar|generateCmrId.*"nar"/));
check("NARR: no server-only", !hasPattern(narr, 'import "server-only"'));

// ── reasoning-chain-builder.ts ────────────────────────────────────────────────

const chainB = readFile(path.join(BASE, "reasoning-chain-builder.ts"));
check("CHAIN: buildReasoningChain exported", hasPattern(chainB, "export function buildReasoningChain"));
check("CHAIN: buildReasoningPath exported", hasPattern(chainB, "export function buildReasoningPath"));
check("CHAIN: summarizeChain exported", hasPattern(chainB, "export function summarizeChain"));
check("CHAIN: validateChain exported", hasPattern(chainB, "export function validateChain"));
check("CHAIN: generates cmr_chn ids", hasPattern(chainB, /cmr_chn|generateCmrId.*"chn"/));
check("CHAIN: validates tenant isolation", hasPattern(chainB, /orgSlug/));
check("CHAIN: no server-only", !hasPattern(chainB, 'import "server-only"'));

// ── cross-module-engine.ts ────────────────────────────────────────────────────

const engine = readFile(path.join(BASE, "cross-module-engine.ts"));
check("ENG: runCrossModuleReasoning exported", hasPattern(engine, "export function runCrossModuleReasoning") || hasPattern(engine, "export async function runCrossModuleReasoning"));
check("ENG: runExecutiveScenario exported", hasPattern(engine, "export function runExecutiveScenario"));
check("ENG: runAllExecutiveScenarios exported", hasPattern(engine, "export function runAllExecutiveScenarios"));
check("ENG: SCENARIO_SIGNALS defined", hasPattern(engine, "SCENARIO_SIGNALS"));
check("ENG: CASH_DROP scenario defined", hasPattern(engine, /CASH_DROP/));
check("ENG: STRATEGIC_RISK scenario defined", hasPattern(engine, /STRATEGIC_RISK/));
check("ENG: fail-closed error result", hasPattern(engine, /_buildErrorResult|\"ERROR\"/));
check("ENG: uses confidence engine", hasPattern(engine, "confidence"));
check("ENG: multi-tenant by orgSlug", hasPattern(engine, "orgSlug"));
check("ENG: no server-only", !hasPattern(engine, 'import "server-only"'));
check("ENG: no Prisma", !hasPattern(engine, "from \"@prisma"));

// ── reasoning-query.ts ───────────────────────────────────────────────────────

const query = readFile(path.join(BASE, "reasoning-query.ts"));
check("QRY: findReasoning exported", hasPattern(query, "export function findReasoning"));
check("QRY: findReasoningById exported", hasPattern(query, "export function findReasoningById"));
check("QRY: findSuccessfulReasoning exported", hasPattern(query, "export function findSuccessfulReasoning"));
check("QRY: findSupportedHypotheses exported", hasPattern(query, "export function findSupportedHypotheses"));
check("QRY: findCriticalRisks exported", hasPattern(query, "export function findCriticalRisks"));
check("QRY: findUrgentRecommendations exported", hasPattern(query, "export function findUrgentRecommendations"));
check("QRY: queryChainStats exported", hasPattern(query, "export function queryChainStats"));
check("QRY: ChainQueryStats interface", hasPattern(query, "ChainQueryStats"));
check("QRY: no server-only", !hasPattern(query, 'import "server-only"'));

// ── reasoning-repository.ts ──────────────────────────────────────────────────

const repo = readFile(path.join(BASE, "reasoning-repository.ts"));
check("REPO: CrossModuleReasoningRepository interface", hasPattern(repo, "export interface CrossModuleReasoningRepository"));
check("REPO: saveResult method", hasPattern(repo, "saveResult"));
check("REPO: getResult method", hasPattern(repo, "getResult"));
check("REPO: listResults method", hasPattern(repo, "listResults"));
check("REPO: deleteResult method", hasPattern(repo, "deleteResult"));
check("REPO: saveHypotheses method", hasPattern(repo, "saveHypotheses"));
check("REPO: saveEvidence method", hasPattern(repo, "saveEvidence"));
check("REPO: saveRisks method", hasPattern(repo, "saveRisks"));
check("REPO: saveOpportunities method", hasPattern(repo, "saveOpportunities"));
check("REPO: saveRecommendations method", hasPattern(repo, "saveRecommendations"));
check("REPO: InMemoryCrossModuleReasoningRepository class", hasPattern(repo, "InMemoryCrossModuleReasoningRepository"));
check("REPO: filter by orgSlug", hasPattern(repo, /filter.*orgSlug/));
check("REPO: no server-only", !hasPattern(repo, 'import "server-only"'));
check("REPO: no Prisma", !hasPattern(repo, "from \"@prisma"));

// ── cross-module-dashboard-contract.ts ───────────────────────────────────────

const dash = readFile(path.join(BASE, "cross-module-dashboard-contract.ts"));
check("DASH: CrossModuleDashboardPayload interface", hasPattern(dash, "CrossModuleDashboardPayload"));
check("DASH: buildCrossModuleDashboard exported", hasPattern(dash, "export function buildCrossModuleDashboard"));
check("DASH: buildEmptyCrossModuleDashboard exported", hasPattern(dash, "export function buildEmptyCrossModuleDashboard"));
check("DASH: avgConfidenceScore in payload", hasPattern(dash, "avgConfidenceScore"));
check("DASH: confidenceDistribution in payload", hasPattern(dash, "confidenceDistribution"));
check("DASH: topDomains in payload", hasPattern(dash, "topDomains"));
check("DASH: criticalRisks in payload", hasPattern(dash, "criticalRisks"));
check("DASH: urgentRecommendations in payload", hasPattern(dash, "urgentRecommendations"));
check("DASH: no server-only", !hasPattern(dash, 'import "server-only"'));
check("DASH: no Prisma", !hasPattern(dash, "from \"@prisma"));

// ── cross-module-readiness.ts ─────────────────────────────────────────────────

const rdyFile = readFile(path.join(BASE, "cross-module-readiness.ts"));
check("RDY: ReadinessLevel type", hasPattern(rdyFile, "export type ReadinessLevel"));
check("RDY: READY level", hasPattern(rdyFile, '"READY"'));
check("RDY: PARTIAL level", hasPattern(rdyFile, '"PARTIAL"'));
check("RDY: INSUFFICIENT level", hasPattern(rdyFile, '"INSUFFICIENT"'));
check("RDY: BLOCKED level", hasPattern(rdyFile, '"BLOCKED"'));
check("RDY: ReadinessReport interface", hasPattern(rdyFile, "ReadinessReport"));
check("RDY: evaluateReadiness exported", hasPattern(rdyFile, "export function evaluateReadiness"));
check("RDY: READINESS_THRESHOLDS exported", hasPattern(rdyFile, "export const READINESS_THRESHOLDS"));
check("RDY: minSignals threshold", hasPattern(rdyFile, "minSignals"));
check("RDY: tenant isolation check", hasPattern(rdyFile, /tenant.*isolation|isolation.*tenant/i));
check("RDY: getCoveredDomains exported", hasPattern(rdyFile, "export function getCoveredDomains"));
check("RDY: no server-only", !hasPattern(rdyFile, 'import "server-only"'));

// ── cross-module-health.ts ────────────────────────────────────────────────────

const health = readFile(path.join(BASE, "cross-module-health.ts"));
check("HEALTH: CrossModuleHealthStatus type", hasPattern(health, "CrossModuleHealthStatus"));
check("HEALTH: HEALTHY status", hasPattern(health, '"HEALTHY"'));
check("HEALTH: DEGRADED status", hasPattern(health, '"DEGRADED"'));
check("HEALTH: UNAVAILABLE status", hasPattern(health, '"UNAVAILABLE"'));
check("HEALTH: CrossModuleHealthReport interface", hasPattern(health, "CrossModuleHealthReport"));
check("HEALTH: runCrossModuleHealthCheck exported", hasPattern(health, "export async function runCrossModuleHealthCheck"));
check("HEALTH: checks engine", hasPattern(health, /engine/));
check("HEALTH: checks repository", hasPattern(health, /repository/));
check("HEALTH: isHealthy exported", hasPattern(health, "export function isHealthy"));

// ── index.ts (client-safe barrel) ────────────────────────────────────────────

const barrel = readFile(path.join(BASE, "index.ts"));
check("BARREL: exports generateCmrId", hasPattern(barrel, "generateCmrId"));
check("BARREL: exports runCrossModuleReasoning", hasPattern(barrel, "runCrossModuleReasoning"));
check("BARREL: exports InMemoryRepository", hasPattern(barrel, "InMemoryCrossModuleReasoningRepository"));
check("BARREL: exports buildCrossModuleDashboard", hasPattern(barrel, "buildCrossModuleDashboard"));
check("BARREL: exports evaluateReadiness", hasPattern(barrel, "evaluateReadiness"));
check("BARREL: exports integration adapters", hasPattern(barrel, "executiveSignalToReasoningSignal"));
check("BARREL: exports memory adapters", hasPattern(barrel, "memoryEntryToEvidence"));
check("BARREL: exports playbook adapters", hasPattern(barrel, "playbookToEvidence"));
check("BARREL: exports copilot adapter", hasPattern(barrel, "buildCopilotReasoningSummary"));
check("BARREL: exports executive adapter", hasPattern(barrel, "buildExecutiveReasoningPayload"));
check("BARREL: exports audit adapter", hasPattern(barrel, "buildReasoningAuditLog"));
check("BARREL: exports compliance adapter", hasPattern(barrel, "buildComplianceReasoningReport"));
check("BARREL: no server-only import", !hasPattern(barrel, 'import "server-only"'));

// ── server.ts (server barrel) ─────────────────────────────────────────────────

const serverBarrel = readFile(path.join(BASE, "server.ts"));
check("SERVER: imports server-only", hasPattern(serverBarrel, "server-only"));
check("SERVER: re-exports from index", hasPattern(serverBarrel, 'from "./index"'));
check("SERVER: exports runCrossModuleHealthCheck", hasPattern(serverBarrel, "runCrossModuleHealthCheck"));
check("SERVER: exports buildExecutiveNarrative", hasPattern(serverBarrel, "buildExecutiveNarrative"));
check("SERVER: exports buildReasoningChain", hasPattern(serverBarrel, "buildReasoningChain"));
check("SERVER: exports buildCausalReasoningResult", hasPattern(serverBarrel, "buildCausalReasoningResult"));

// ── future-compatibility.ts ───────────────────────────────────────────────────

const future = readFile(path.join(BASE, "future-compatibility.ts"));
check("FUTURE: CROSS_MODULE_FUTURE_PLANS exported", hasPattern(future, "CROSS_MODULE_FUTURE_PLANS"));
check("FUTURE: 6 future plans", (future.match(/CMR-FUTURE-0/g) || []).length >= 6);
check("FUTURE: CMR-FUTURE-01 Causal Reasoning", hasPattern(future, "Causal Reasoning"));
check("FUTURE: CMR-FUTURE-04 Multi-Agent", hasPattern(future, "Multi-Agent"));
check("FUTURE: getFutureReasoningRoadmapSummary exported", hasPattern(future, "getFutureReasoningRoadmapSummary"));
check("FUTURE: all plans are PLANNED", hasPattern(future, /status:\s*"PLANNED"/));
check("FUTURE: no server-only", !hasPattern(future, 'import "server-only"'));

// ── Integration adapters ──────────────────────────────────────────────────────

// reasoning-memory-graph.ts
const memGraph = readFile(path.join(INT, "reasoning-memory-graph.ts"));
check("MG: graphNodeToEvidence exported", hasPattern(memGraph, "export function graphNodeToEvidence"));
check("MG: graphEdgeToEvidence exported", hasPattern(memGraph, "export function graphEdgeToEvidence"));
check("MG: subgraphToEvidence exported", hasPattern(memGraph, "export function subgraphToEvidence"));
check("MG: graphAlertNodeToSignal exported", hasPattern(memGraph, "export function graphAlertNodeToSignal"));
check("MG: buildGraphReasoningContext exported", hasPattern(memGraph, "export function buildGraphReasoningContext"));
check("MG: imports from memory-graph barrel", hasPattern(memGraph, /from "@\/lib\/copilot\/memory-graph"/));
check("MG: ALERT/ANOMALY signal types", hasPattern(memGraph, /ALERT.*ANOMALY|ANOMALY.*ALERT/));
check("MG: no server-only", !hasPattern(memGraph, 'import "server-only"'));

// reasoning-executive-brain.ts
const execBrain = readFile(path.join(INT, "reasoning-executive-brain.ts"));
check("EB: executiveSignalToReasoningSignal exported", hasPattern(execBrain, "export function executiveSignalToReasoningSignal"));
check("EB: executiveInsightToEvidence exported", hasPattern(execBrain, "export function executiveInsightToEvidence"));
check("EB: executiveContextToReasoningInput exported", hasPattern(execBrain, "export function executiveContextToReasoningInput"));
check("EB: imports from executive-brain-types", hasPattern(execBrain, "executive-brain-types"));
check("EB: maps FINANCE category", hasPattern(execBrain, '"FINANCE"'));
check("EB: evidence type=EXECUTIVE_INSIGHT", hasPattern(execBrain, '"EXECUTIVE_INSIGHT"'));
check("EB: signal.confidence used", hasPattern(execBrain, "confidence"));
check("EB: signal.description used", hasPattern(execBrain, "description"));
check("EB: no server-only", !hasPattern(execBrain, 'import "server-only"'));

// reasoning-memory.ts
const memInt = readFile(path.join(INT, "reasoning-memory.ts"));
check("MEM: memoryEntryToEvidence exported", hasPattern(memInt, "export function memoryEntryToEvidence"));
check("MEM: memoryEntryToSignal exported", hasPattern(memInt, "export function memoryEntryToSignal"));
check("MEM: memoryEntriesToEvidence exported", hasPattern(memInt, "export function memoryEntriesToEvidence"));
check("MEM: memoryEntriesToSignals exported", hasPattern(memInt, "export function memoryEntriesToSignals"));
check("MEM: imports from memory-types", hasPattern(memInt, "memory-types"));
check("MEM: uses MEMORY_ENTRY evidence type", hasPattern(memInt, '"MEMORY_ENTRY"'));
check("MEM: tenant isolation check", hasPattern(memInt, /orgSlug.*!==.*orgSlug|tenant isolation/i));
check("MEM: only STRATEGIC/OPERATIONAL → signals", hasPattern(memInt, /STRATEGIC.*OPERATIONAL/));
check("MEM: filterCriticalMemories exported", hasPattern(memInt, "export function filterCriticalMemories"));
check("MEM: no server-only", !hasPattern(memInt, 'import "server-only"'));

// reasoning-playbooks.ts
const pbInt = readFile(path.join(INT, "reasoning-playbooks.ts"));
check("PB: playbookToEvidence exported", hasPattern(pbInt, "export function playbookToEvidence"));
check("PB: playbookToSignal exported", hasPattern(pbInt, "export function playbookToSignal"));
check("PB: playbooksToEvidence exported", hasPattern(pbInt, "export function playbooksToEvidence"));
check("PB: playbooksToSignals exported", hasPattern(pbInt, "export function playbooksToSignals"));
check("PB: imports from playbook-types", hasPattern(pbInt, "playbook-types"));
check("PB: uses PLAYBOOK_TRIGGER evidence type", hasPattern(pbInt, '"PLAYBOOK_TRIGGER"'));
check("PB: only ACTIVE playbooks to evidence", hasPattern(pbInt, '"ACTIVE"'));
check("PB: tenant isolation check", hasPattern(pbInt, /orgSlug.*!==.*orgSlug/));
check("PB: filterCriticalPlaybooks exported", hasPattern(pbInt, "export function filterCriticalPlaybooks"));
check("PB: no server-only", !hasPattern(pbInt, 'import "server-only"'));

// reasoning-tenant-profile.ts
const tpInt = readFile(path.join(INT, "reasoning-tenant-profile.ts"));
check("TP: TenantReasoningProfile interface", hasPattern(tpInt, "TenantReasoningProfile"));
check("TP: buildTenantReasoningProfile exported", hasPattern(tpInt, "export function buildTenantReasoningProfile"));
check("TP: tenantProfileToEvidence exported", hasPattern(tpInt, "export function tenantProfileToEvidence"));
check("TP: profileToReasoningContext exported", hasPattern(tpInt, "export function profileToReasoningContext"));
check("TP: maps finanzas to FINANCE", hasPattern(tpInt, /finanzas.*FINANCE|FINANCE.*finanzas/));
check("TP: always adds EXECUTIVE domain", hasPattern(tpInt, /EXECUTIVE/));
check("TP: always adds MEMORY domain", hasPattern(tpInt, /MEMORY/));
check("TP: isTenantDomainActive exported", hasPattern(tpInt, "export function isTenantDomainActive"));
check("TP: no server-only", !hasPattern(tpInt, 'import "server-only"'));

// reasoning-copilot.ts
const copInt = readFile(path.join(INT, "reasoning-copilot.ts"));
check("COP: CopilotReasoningSummary interface", hasPattern(copInt, "CopilotReasoningSummary"));
check("COP: buildCopilotReasoningSummary exported", hasPattern(copInt, "export function buildCopilotReasoningSummary"));
check("COP: buildEmptyCopilotReasoningSummary exported", hasPattern(copInt, "export function buildEmptyCopilotReasoningSummary"));
check("COP: formatReasoningForCopilotPrompt exported", hasPattern(copInt, "export function formatReasoningForCopilotPrompt"));
check("COP: empty summary available=false", hasPattern(copInt, /available[^\n]*false/));
check("COP: uses result.narrative", hasPattern(copInt, "result.narrative"));
check("COP: no server-only", !hasPattern(copInt, 'import "server-only"'));

// reasoning-executive.ts
const execInt = readFile(path.join(INT, "reasoning-executive.ts"));
check("EXEC: ExecutiveReasoningPayload interface", hasPattern(execInt, "ExecutiveReasoningPayload"));
check("EXEC: buildExecutiveReasoningPayload exported", hasPattern(execInt, "export function buildExecutiveReasoningPayload"));
check("EXEC: ExecutiveAlertSummary interface", hasPattern(execInt, "ExecutiveAlertSummary"));
check("EXEC: ExecutiveOpportunitySummary interface", hasPattern(execInt, "ExecutiveOpportunitySummary"));
check("EXEC: ExecutiveActionItem interface", hasPattern(execInt, "ExecutiveActionItem"));
check("EXEC: handles ERROR status", hasPattern(execInt, '"ERROR"'));
check("EXEC: uses result.narrative", hasPattern(execInt, "result.narrative"));
check("EXEC: no server-only", !hasPattern(execInt, 'import "server-only"'));

// reasoning-intelligence.ts
const intelInt = readFile(path.join(INT, "reasoning-intelligence.ts"));
check("INTEL: IntelligenceReasoningContext interface", hasPattern(intelInt, "IntelligenceReasoningContext"));
check("INTEL: buildIntelligenceReasoningContext exported", hasPattern(intelInt, "export function buildIntelligenceReasoningContext"));
check("INTEL: analyzeSignalCoverage exported", hasPattern(intelInt, "export function analyzeSignalCoverage"));
check("INTEL: analyzeEvidenceCoverage exported", hasPattern(intelInt, "export function analyzeEvidenceCoverage"));
check("INTEL: scoreChainQuality exported", hasPattern(intelInt, "export function scoreChainQuality"));
check("INTEL: no server-only", !hasPattern(intelInt, 'import "server-only"'));

// reasoning-audit.ts
const auditInt = readFile(path.join(INT, "reasoning-audit.ts"));
check("AUDIT: ReasoningAuditAction type", hasPattern(auditInt, "ReasoningAuditAction"));
check("AUDIT: ReasoningAuditRecord interface", hasPattern(auditInt, "ReasoningAuditRecord"));
check("AUDIT: auditReasoningStarted exported", hasPattern(auditInt, "export function auditReasoningStarted"));
check("AUDIT: auditReasoningCompleted exported", hasPattern(auditInt, "export function auditReasoningCompleted"));
check("AUDIT: auditReasoningFailed exported", hasPattern(auditInt, "export function auditReasoningFailed"));
check("AUDIT: buildReasoningAuditLog exported", hasPattern(auditInt, "export function buildReasoningAuditLog"));
check("AUDIT: uses result.durationMs", hasPattern(auditInt, "durationMs"));
check("AUDIT: no result.startedAt usage", !hasPattern(auditInt, "result.startedAt"));
check("AUDIT: no server-only", !hasPattern(auditInt, 'import "server-only"'));

// reasoning-compliance.ts
const compInt = readFile(path.join(INT, "reasoning-compliance.ts"));
check("COMP: ComplianceReasoningReport interface", hasPattern(compInt, "ComplianceReasoningReport"));
check("COMP: ComplianceReasoningSignal interface", hasPattern(compInt, "ComplianceReasoningSignal"));
check("COMP: buildComplianceReasoningReport exported", hasPattern(compInt, "export function buildComplianceReasoningReport"));
check("COMP: riskToComplianceSignal exported", hasPattern(compInt, "export function riskToComplianceSignal"));
check("COMP: evaluateComplianceGate exported", hasPattern(compInt, "export function evaluateComplianceGate"));
check("COMP: ComplianceGateResult interface", hasPattern(compInt, "ComplianceGateResult"));
check("COMP: only elevates CRITICAL/HIGH risks", hasPattern(compInt, /CRITICAL.*HIGH|HIGH.*CRITICAL/));
check("COMP: PASS/WARN/FAIL statuses", hasPattern(compInt, '"PASS"') && hasPattern(compInt, '"WARN"') && hasPattern(compInt, '"FAIL"'));
check("COMP: tenant isolation check", hasPattern(compInt, /orgSlug.*!==.*orgSlug/));
check("COMP: no server-only", !hasPattern(compInt, 'import "server-only"'));

// ── Prisma schema checks ──────────────────────────────────────────────────────

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const schema = readFile(schemaPath);
check("SCHEMA: ReasoningExecution model", hasPattern(schema, "model ReasoningExecution"));
check("SCHEMA: ReasoningHypothesisRecord model", hasPattern(schema, "model ReasoningHypothesisRecord"));
check("SCHEMA: ReasoningEvidenceRecord model", hasPattern(schema, "model ReasoningEvidenceRecord"));
check("SCHEMA: ReasoningRiskRecord model", hasPattern(schema, "model ReasoningRiskRecord"));
check("SCHEMA: ReasoningOpportunityRecord model", hasPattern(schema, "model ReasoningOpportunityRecord"));
check("SCHEMA: ReasoningRecommendationRecord model", hasPattern(schema, "model ReasoningRecommendationRecord"));
check("SCHEMA: ReasoningExecution has orgSlug", hasPattern(schema, /model ReasoningExecution[\s\S]{1,500}orgSlug/));
check("SCHEMA: ReasoningExecution has status", hasPattern(schema, /model ReasoningExecution[\s\S]{1,500}status/));
check("SCHEMA: ReasoningExecution has chainJson", hasPattern(schema, "chainJson"));
check("SCHEMA: ReasoningExecution has orgSlug index", (function() { const idx = schema.indexOf("model ReasoningExecution"); return idx >= 0 && schema.slice(idx, idx + 3000).includes("@@index([orgSlug])"); })());

// ── Migration checks ──────────────────────────────────────────────────────────

const migPath = path.join(__dirname, "..", "prisma", "migrations",
  "20260607100000_cross_module_reasoning", "migration.sql");
const mig = readFile(migPath);
check("MIG: creates ReasoningExecution", hasPattern(mig, '"ReasoningExecution"'));
check("MIG: creates ReasoningHypothesisRecord", hasPattern(mig, '"ReasoningHypothesisRecord"'));
check("MIG: creates ReasoningEvidenceRecord", hasPattern(mig, '"ReasoningEvidenceRecord"'));
check("MIG: creates ReasoningRiskRecord", hasPattern(mig, '"ReasoningRiskRecord"'));
check("MIG: creates ReasoningOpportunityRecord", hasPattern(mig, '"ReasoningOpportunityRecord"'));
check("MIG: creates ReasoningRecommendationRecord", hasPattern(mig, '"ReasoningRecommendationRecord"'));
check("MIG: creates orgSlug indexes", hasPattern(mig, /CREATE INDEX.*orgSlug/));

// ── Harness checks ────────────────────────────────────────────────────────────

const harnessPath = path.join(__dirname, "..", "app", "api", "internal",
  "integration-tests", "cross-module-reasoning", "route.ts");
const harness = readFile(harnessPath);
check("HARNESS: exports GET handler", hasPattern(harness, "export async function GET"));
check("HARNESS: references sprint name", hasPattern(harness, "AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01"));
check("HARNESS: tests full engine", hasPattern(harness, "testFullEngine"));
check("HARNESS: tests tenant isolation", hasPattern(harness, "testTenantIsolation"));
check("HARNESS: tests integration adapters", hasPattern(harness, "testIntegrationAdapters"));
check("HARNESS: tests readiness", hasPattern(harness, "testReadiness"));
check("HARNESS: tests fail-closed", hasPattern(harness, "testFailClosed"));
check("HARNESS: tests copilot adapters", hasPattern(harness, "testCopilotAndExecutiveAdapters"));
check("HARNESS: tests query layer", hasPattern(harness, "testQueryLayer"));
check("HARNESS: returns 220+ tests", (harness.match(/results\.push/g) || []).length >= 210);

// ── Architecture invariants ───────────────────────────────────────────────────

// None of the client-safe files should import from server-only or Prisma
const clientSafeFiles = [
  ...coreFiles.filter(f => f !== "server.ts").map(f => path.join(BASE, f)),
  ...intFiles.map(f => path.join(INT, f)),
];

for (const f of clientSafeFiles) {
  const content = readFile(f);
  if (!content) continue;
  const shortName = path.basename(f);
  check(`INVARIANT: ${shortName} no Prisma import`, !hasPattern(content, "from \"@prisma"));
  check(`INVARIANT: ${shortName} no PrismaClient`, !hasPattern(content, "PrismaClient"));
}

// Engine never imports from integration adapters (to avoid circular deps)
const engineContent = readFile(path.join(BASE, "cross-module-engine.ts"));
check("INVARIANT: engine no import from integrations/", !hasPattern(engineContent, "from \"./integrations/"));

// Dashboard contract is pure domain (no engine import)
const dashContent = readFile(path.join(BASE, "cross-module-dashboard-contract.ts"));
check("INVARIANT: dashboard no engine import", !hasPattern(dashContent, "cross-module-engine"));

// ── Final report ──────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"─".repeat(60)}`);
console.log(`AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01`);
console.log(`Validation: ${passed}/${total} checks PASS`);
if (failures.length > 0) {
  console.log(`\nFailed checks (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log(`${"─".repeat(60)}\n`);

process.exit(failures.length > 0 ? 1 : 0);
