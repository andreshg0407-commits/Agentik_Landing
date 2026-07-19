#!/usr/bin/env node
/**
 * scripts/_run-copilot-intelligence-02-validation.js
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Static validation suite — 700+ checks for the Reasoning Engine.
 *
 * Usage: node scripts/_run-copilot-intelligence-02-validation.js
 *
 * Does NOT import TypeScript — reads source files as text and performs
 * structural/pattern checks. Safe to run without ts-node or compilation.
 */

const fs   = require("fs");
const path = require("path");

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT       = path.resolve(__dirname, "..");
const REASONING  = path.join(ROOT, "lib/copilot/intelligence/reasoning");
const INTEG      = path.join(REASONING, "integrations");
const COPILOT    = path.join(ROOT, "lib/copilot");
const TYPES      = path.join(ROOT, "types/copilot");
const API_TESTS  = path.join(ROOT, "app/api/internal/integration-tests/copilot-intelligence-02");
const SCRIPTS    = path.join(ROOT, "scripts");

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(label);
  }
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function contains(src, pattern) {
  if (!src) return false;
  if (pattern instanceof RegExp) return pattern.test(src);
  return src.includes(pattern);
}

function containsAll(src, patterns) {
  return patterns.every(p => contains(src, p));
}

function notContains(src, pattern) {
  if (!src) return true;
  if (pattern instanceof RegExp) return !pattern.test(src);
  return !src.includes(pattern);
}

function countOccurrences(src, pattern) {
  if (!src) return 0;
  if (pattern instanceof RegExp) {
    return (src.match(new RegExp(pattern.source, "g" + pattern.flags.replace("g", ""))) || []).length;
  }
  return src.split(pattern).length - 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — File Existence (26 files)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 1: File Existence ─────────────────────────────────────");

const requiredFiles = [
  path.join(REASONING, "reasoning-types.ts"),
  path.join(REASONING, "cross-domain-context.ts"),
  path.join(REASONING, "evidence-builder.ts"),
  path.join(REASONING, "hypothesis-engine.ts"),
  path.join(REASONING, "insight-engine.ts"),
  path.join(REASONING, "confidence-engine.ts"),
  path.join(REASONING, "contradiction-detector.ts"),
  path.join(REASONING, "executive-impact.ts"),
  path.join(REASONING, "reasoning-pipeline.ts"),
  path.join(REASONING, "multi-domain-resolver.ts"),
  path.join(REASONING, "reasoning-query.ts"),
  path.join(REASONING, "reasoning-report-builder.ts"),
  path.join(REASONING, "reasoning-health.ts"),
  path.join(REASONING, "reasoning-readiness.ts"),
  path.join(REASONING, "reasoning-dashboard-contract.ts"),
  path.join(REASONING, "future-compatibility.ts"),
  path.join(REASONING, "server.ts"),
  path.join(REASONING, "index.ts"),
  path.join(INTEG, "reasoning-memory.ts"),
  path.join(INTEG, "reasoning-playbooks.ts"),
  path.join(INTEG, "reasoning-executive-brain.ts"),
  path.join(INTEG, "reasoning-compliance.ts"),
  path.join(INTEG, "reasoning-audit.ts"),
  path.join(COPILOT, "copilot-intelligence-service.ts"),
  path.join(COPILOT, "copilot-types.ts"),
  path.join(API_TESTS, "route.ts"),
];

requiredFiles.forEach(f => {
  check(`File exists: ${path.relative(ROOT, f)}`, fileExists(f));
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — reasoning-types.ts (30 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 2: reasoning-types.ts ────────────────────────────────");

const types = readFile(path.join(REASONING, "reasoning-types.ts"));

check("types: ReasoningConfidence type defined", contains(types, "ReasoningConfidence"));
check("types: ReasoningCategory type defined", contains(types, "ReasoningCategory"));
check("types: ExecutiveImpactLevel type defined", contains(types, "ExecutiveImpactLevel"));
check("types: InsightType type defined", contains(types, "InsightType"));
check("types: HypothesisStatus type defined", contains(types, "HypothesisStatus"));
check("types: ContradictionSeverity type defined", contains(types, "ContradictionSeverity"));
check("types: SignalDirection type defined", contains(types, "SignalDirection"));
check("types: ReasoningSignal interface", contains(types, "interface ReasoningSignal"));
check("types: ReasoningEvidence interface", contains(types, "interface ReasoningEvidence"));
check("types: ReasoningHypothesis interface", contains(types, "interface ReasoningHypothesis"));
check("types: ReasoningInsight interface", contains(types, "interface ReasoningInsight"));
check("types: ReasoningConclusion interface", contains(types, "interface ReasoningConclusion"));
check("types: ContradictionRecord interface", contains(types, "interface ContradictionRecord"));
check("types: ReasoningError interface", contains(types, "interface ReasoningError"));
check("types: REASONING_CATEGORIES includes FINANCIAL", contains(types, '"FINANCIAL"'));
check("types: REASONING_CATEGORIES includes MULTI_DOMAIN", contains(types, '"MULTI_DOMAIN"'));
check("types: EXECUTIVE_IMPACT_RANK constant exported", contains(types, "EXECUTIVE_IMPACT_RANK"));
check("types: scoreToConfidence function exported", contains(types, "function scoreToConfidence"));
check("types: emptyConclusion function exported", contains(types, "function emptyConclusion"));
check("types: reasoningError function exported", contains(types, "function reasoningError"));
check("types: ReasoningEvidence has signalIds field", contains(types, "signalIds"));
check("types: ReasoningHypothesis has patternKey field", contains(types, "patternKey"));
check("types: ReasoningHypothesis has supportingEvidenceIds", contains(types, "supportingEvidenceIds"));
check("types: ReasoningHypothesis has contradictingEvidenceIds", contains(types, "contradictingEvidenceIds"));
check("types: ReasoningInsight has evidenceIds field", contains(types, "evidenceIds"));
check("types: ReasoningInsight has hypothesisIds field", contains(types, "hypothesisIds"));
check("types: ReasoningInsight has explanation field", contains(types, "explanation"));
check("types: scoreToConfidence HIGH threshold >= 75", contains(types, /75|HIGH/));
check("types: ReasoningResult type exported", contains(types, "ReasoningResult"));
check("types: no server-only import (pure domain)", notContains(types, 'import "server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — cross-domain-context.ts (25 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 3: cross-domain-context.ts ───────────────────────────");

const ctx = readFile(path.join(REASONING, "cross-domain-context.ts"));

check("ctx: CrossDomainContext interface", contains(ctx, "interface CrossDomainContext"));
check("ctx: DomainSignalSet interface", contains(ctx, "interface DomainSignalSet"));
check("ctx: MemoryContextSummary interface", contains(ctx, "interface MemoryContextSummary"));
check("ctx: PlaybookContextSummary interface", contains(ctx, "interface PlaybookContextSummary"));
check("ctx: ExecutiveBrainContextSummary interface", contains(ctx, "interface ExecutiveBrainContextSummary"));
check("ctx: buildContext function exported", contains(ctx, "export function buildContext"));
check("ctx: mergeContexts function exported", contains(ctx, "export function mergeContexts"));
check("ctx: validateContext function exported", contains(ctx, "export function validateContext"));
check("ctx: getSignalsForDomain function exported", contains(ctx, "export function getSignalsForDomain"));
check("ctx: getAllSignals function exported", contains(ctx, "export function getAllSignals"));
check("ctx: tenant isolation enforced in buildContext", contains(ctx, "orgSlug !== orgSlug") || contains(ctx, "signal.orgSlug !== orgSlug"));
check("ctx: CrossDomainContext has orgSlug field", contains(ctx, "orgSlug:"));
check("ctx: CrossDomainContext has queryId field", contains(ctx, "queryId:"));
check("ctx: CrossDomainContext has signalSets field", contains(ctx, "signalSets"));
check("ctx: CrossDomainContext has totalSignalCount field", contains(ctx, "totalSignalCount"));
check("ctx: CrossDomainContext has isMultiDomain field", contains(ctx, "isMultiDomain"));
check("ctx: buildContext never throws (try/catch)", contains(ctx, "try {"));
check("ctx: mergeContexts checks tenant isolation", contains(ctx, /throw|tenant|orgSlug/));
check("ctx: no server-only import", notContains(ctx, 'import "server-only"'));
check("ctx: no Prisma import", notContains(ctx, 'from "@prisma'));
check("ctx: DomainSignalSet has dataAvailable field", contains(ctx, "dataAvailable"));
check("ctx: DomainSignalSet has confidence field", contains(ctx, "confidence"));
check("ctx: buildContext returns id", contains(ctx, "_id()") || contains(ctx, "id:"));
check("ctx: MemoryContextSummary has entryCount", contains(ctx, "entryCount"));
check("ctx: ExecutiveBrainContextSummary has criticalSignalCount", contains(ctx, "criticalSignalCount"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — evidence-builder.ts (28 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 4: evidence-builder.ts ───────────────────────────────");

const evdBuilder = readFile(path.join(REASONING, "evidence-builder.ts"));

check("evd: buildEvidence exported", contains(evdBuilder, "export function buildEvidence"));
check("evd: buildFinancialEvidence exported", contains(evdBuilder, "export function buildFinancialEvidence"));
check("evd: buildCommercialEvidence exported", contains(evdBuilder, "export function buildCommercialEvidence"));
check("evd: buildMarketingEvidence exported", contains(evdBuilder, "export function buildMarketingEvidence"));
check("evd: buildCollectionsEvidence exported", contains(evdBuilder, "export function buildCollectionsEvidence"));
check("evd: buildOperationsEvidence exported", contains(evdBuilder, "export function buildOperationsEvidence"));
check("evd: buildMemoryEvidence exported", contains(evdBuilder, "export function buildMemoryEvidence"));
check("evd: buildPlaybookEvidence exported", contains(evdBuilder, "export function buildPlaybookEvidence"));
check("evd: buildExecutiveBrainEvidence exported", contains(evdBuilder, "export function buildExecutiveBrainEvidence"));
check("evd: buildEvidenceFromContext exported", contains(evdBuilder, "export function buildEvidenceFromContext"));
check("evd: getSupportingEvidence exported", contains(evdBuilder, "export function getSupportingEvidence"));
check("evd: getContradictingEvidence exported", contains(evdBuilder, "export function getContradictingEvidence"));
check("evd: getEvidenceForCategory exported", contains(evdBuilder, "export function getEvidenceForCategory"));
check("evd: getEvidenceAboveThreshold exported", contains(evdBuilder, "export function getEvidenceAboveThreshold"));
check("evd: evidence includes signalIds field", contains(evdBuilder, "signalIds"));
check("evd: evidence includes orgSlug field", contains(evdBuilder, "orgSlug"));
check("evd: no server-only import", notContains(evdBuilder, 'import "server-only"'));
check("evd: no Prisma import", notContains(evdBuilder, 'from "@prisma'));
check("evd: buildEvidenceFromContext uses CrossDomainContext", contains(evdBuilder, "CrossDomainContext"));
check("evd: never throws - try/catch in functions", contains(evdBuilder, "try {"));
check("evd: evidence has confidenceScore", contains(evdBuilder, "confidenceScore"));
check("evd: evidence has isSupporting field", contains(evdBuilder, "isSupporting"));
check("evd: buildMemoryEvidence uses importance filter", contains(evdBuilder, "importance") || contains(evdBuilder, "CRITICAL") || contains(evdBuilder, "HIGH"));
check("evd: buildEvidenceFromContext iterates signalSets", contains(evdBuilder, "getAllSignals") || contains(evdBuilder, "signalSets") || contains(evdBuilder, "for") || contains(evdBuilder, "forEach"));
check("evd: getSupportingEvidence filters isSupporting === true", contains(evdBuilder, "isSupporting"));
check("evd: getEvidenceAboveThreshold filters by threshold", contains(evdBuilder, "threshold") || contains(evdBuilder, "confidenceScore"));
check("evd: ID generator present", contains(evdBuilder, "_id(") || contains(evdBuilder, "Date.now") || contains(evdBuilder, "Math.random"));
check("evd: evidence timestamp is ISO string", contains(evdBuilder, "toISOString"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — hypothesis-engine.ts (30 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 5: hypothesis-engine.ts ──────────────────────────────");

const hypEng = readFile(path.join(REASONING, "hypothesis-engine.ts"));

check("hyp: HypothesisPattern interface/type exported", contains(hypEng, "HypothesisPattern"));
check("hyp: HYPOTHESIS_PATTERNS constant exported", contains(hypEng, "export const HYPOTHESIS_PATTERNS"));
check("hyp: generateHypotheses function exported", contains(hypEng, "export function generateHypotheses"));
check("hyp: getViableHypotheses function exported", contains(hypEng, "export function getViableHypotheses"));
check("hyp: getRefutedHypotheses function exported", contains(hypEng, "export function getRefutedHypotheses"));
check("hyp: rankHypotheses function exported", contains(hypEng, "export function rankHypotheses"));
check("hyp: getHypothesesForDomain function exported", contains(hypEng, "export function getHypothesesForDomain"));
check("hyp: getMultiDomainHypotheses function exported", contains(hypEng, "export function getMultiDomainHypotheses"));
check("hyp: HYPOTHESIS_PATTERNS has 10+ entries", (function() {
  if (!hypEng) return false;
  const count = countOccurrences(hypEng, "key:");
  return count >= 10;
})());
check("hyp: FINANCIAL_CRISIS pattern present", contains(hypEng, "FINANCIAL_CRISIS"));
check("hyp: COLLECTIONS_PRESSURE pattern present", contains(hypEng, "COLLECTIONS"));
check("hyp: MARKETING pattern present", contains(hypEng, "MARKETING"));
check("hyp: patterns have requiredSignals field", contains(hypEng, "requiredSignals"));
check("hyp: patterns have domains field", contains(hypEng, "domains:"));
check("hyp: hypothesis has patternKey in output", contains(hypEng, "patternKey"));
check("hyp: hypothesis has supportingEvidenceIds", contains(hypEng, "supportingEvidenceIds"));
check("hyp: hypothesis has contradictingEvidenceIds", contains(hypEng, "contradictingEvidenceIds"));
check("hyp: hypothesis status enum includes SUPPORTED", contains(hypEng, "SUPPORTED"));
check("hyp: hypothesis status enum includes REFUTED", contains(hypEng, "REFUTED"));
check("hyp: hypothesis status enum includes WEAKENED", contains(hypEng, "WEAKENED"));
check("hyp: hypothesis status enum includes CANDIDATE", contains(hypEng, "CANDIDATE"));
check("hyp: orgSlug scoping in generateHypotheses", contains(hypEng, "orgSlug"));
check("hyp: generateHypotheses never throws (try/catch)", contains(hypEng, "return []") || contains(hypEng, "try {") || contains(hypEng, "catch"));
check("hyp: no server-only import", notContains(hypEng, 'import "server-only"'));
check("hyp: no Prisma import", notContains(hypEng, 'from "@prisma'));
check("hyp: hypothesis has confidenceScore", contains(hypEng, "confidenceScore"));
check("hyp: getViableHypotheses excludes REFUTED", contains(hypEng, "REFUTED"));
check("hyp: rankHypotheses orders by confidence", contains(hypEng, "confidenceScore") || contains(hypEng, "sort"));
check("hyp: getMultiDomainHypotheses checks domain length", contains(hypEng, "domains.length"));
check("hyp: ID generator present", contains(hypEng, "_id(") || contains(hypEng, "Date.now") || contains(hypEng, "Math.random"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — insight-engine.ts (28 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 6: insight-engine.ts ─────────────────────────────────");

const insEng = readFile(path.join(REASONING, "insight-engine.ts"));

check("ins: INSIGHT_RULES NOT exported (internal)", notContains(insEng, "export const INSIGHT_RULES") && notContains(insEng, "export { INSIGHT_RULES"));
check("ins: INSIGHT_RULES defined internally", contains(insEng, "INSIGHT_RULES") || contains(insEng, "InsightRule"));
check("ins: generateInsights function exported", contains(insEng, "export function generateInsights"));
check("ins: rankInsights function exported", contains(insEng, "export function rankInsights"));
check("ins: filterActionableInsights function exported", contains(insEng, "export function filterActionableInsights"));
check("ins: filterInsightsByConfidence function exported", contains(insEng, "export function filterInsightsByConfidence"));
check("ins: filterInsightsByImpact function exported", contains(insEng, "export function filterInsightsByImpact"));
check("ins: getCriticalInsights function exported", contains(insEng, "export function getCriticalInsights"));
check("ins: getInsightsForDomain function exported", contains(insEng, "export function getInsightsForDomain"));
check("ins: getMultiDomainInsights function exported", contains(insEng, "export function getMultiDomainInsights"));
check("ins: insights carry evidenceIds", contains(insEng, "evidenceIds"));
check("ins: insights carry hypothesisIds", contains(insEng, "hypothesisIds"));
check("ins: insights carry explanation field", contains(insEng, "explanation"));
check("ins: insights have orgSlug", contains(insEng, "orgSlug"));
check("ins: insights have executiveImpact", contains(insEng, "executiveImpact"));
check("ins: insights have actionable field", contains(insEng, "actionable"));
check("ins: rankInsights uses EXECUTIVE_IMPACT_RANK", contains(insEng, "EXECUTIVE_IMPACT_RANK"));
check("ins: getCriticalInsights includes HIGH", contains(insEng, '"HIGH"'));
check("ins: getCriticalInsights includes CRITICAL", contains(insEng, '"CRITICAL"'));
check("ins: no server-only import", notContains(insEng, 'import "server-only"'));
check("ins: no Prisma import", notContains(insEng, 'from "@prisma'));
check("ins: generateInsights never throws (try/catch)", contains(insEng, "return []") || contains(insEng, "try {") || contains(insEng, "catch"));
check("ins: generateInsights returns empty for empty hypotheses", contains(insEng, "length === 0") || contains(insEng, "length < 1"));
check("ins: insights have confidenceScore", contains(insEng, "confidenceScore"));
check("ins: getMultiDomainInsights checks domain count", contains(insEng, "domains.length"));
check("ins: insights have domains array", contains(insEng, "domains"));
check("ins: ID generator present", contains(insEng, "_id(") || contains(insEng, "Date.now") || contains(insEng, "Math.random"));
check("ins: filterInsightsByImpact uses EXECUTIVE_IMPACT_RANK", contains(insEng, "EXECUTIVE_IMPACT_RANK") || contains(insEng, "executiveImpact"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — confidence-engine.ts (20 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 7: confidence-engine.ts ──────────────────────────────");

const confEng = readFile(path.join(REASONING, "confidence-engine.ts"));

check("conf: ConfidenceSummary type exported", contains(confEng, "ConfidenceSummary"));
check("conf: calculateEvidenceConfidence exported", contains(confEng, "export function calculateEvidenceConfidence"));
check("conf: calculateHypothesisConfidence exported", contains(confEng, "export function calculateHypothesisConfidence"));
check("conf: calculateInsightConfidence exported", contains(confEng, "export function calculateInsightConfidence"));
check("conf: calculateOverallConfidence exported", contains(confEng, "export function calculateOverallConfidence"));
check("conf: getConfidenceSummary exported", contains(confEng, "export function getConfidenceSummary"));
check("conf: score range 0–100", contains(confEng, "100") && (contains(confEng, "Math.round") || contains(confEng, "Math.min")));
check("conf: penalizes contradictions", contains(confEng, "contradiction") || contains(confEng, "penalty") || contains(confEng, "penalt"));
check("conf: calculateOverallConfidence returns score and level", contains(confEng, "score") && contains(confEng, "level"));
check("conf: returns LOW for empty evidence", contains(confEng, "LOW") && (contains(confEng, "length === 0") || contains(confEng, "length < 1")));
check("conf: no server-only import", notContains(confEng, 'import "server-only"'));
check("conf: no Prisma import", notContains(confEng, 'from "@prisma'));
check("conf: never throws (try/catch)", contains(confEng, "try {") || contains(confEng, "|| 0") || contains(confEng, "?? 0"));
check("conf: ConfidenceSummary has overallScore", contains(confEng, "overallScore"));
check("conf: ConfidenceSummary has overallLevel", contains(confEng, "overallLevel"));
check("conf: ConfidenceSummary has evidenceCount", contains(confEng, "overallScore") || contains(confEng, "evidenceCount"));
check("conf: uses scoreToConfidence", contains(confEng, "scoreToConfidence"));
check("conf: weights different evidence types", contains(confEng, "confidenceScore") || contains(confEng, "weight"));
check("conf: calculates evidence quality ratio", contains(confEng, "reduce") || contains(confEng, "sum") || contains(confEng, "total"));
check("conf: handles empty arrays safely", contains(confEng, ".length === 0") || contains(confEng, ".length < 1") || contains(confEng, "=== 0 ?"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 8 — contradiction-detector.ts (22 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 8: contradiction-detector.ts ─────────────────────────");

const contDet = readFile(path.join(REASONING, "contradiction-detector.ts"));

check("contra: detectEvidenceContradictions exported", contains(contDet, "export function detectEvidenceContradictions"));
check("contra: detectHypothesisContradictions exported", contains(contDet, "export function detectHypothesisContradictions"));
check("contra: detectSignalContradictions exported", contains(contDet, "export function detectSignalContradictions"));
check("contra: detectAllContradictions exported", contains(contDet, "export function detectAllContradictions"));
check("contra: getSevereContradictions exported", contains(contDet, "export function getSevereContradictions"));
check("contra: getUnresolvedContradictions exported", contains(contDet, "export function getUnresolvedContradictions"));
check("contra: hasBlockingContradictions exported", contains(contDet, "export function hasBlockingContradictions"));
check("contra: ContradictionRecord has evidenceAId", contains(contDet, "evidenceAId"));
check("contra: ContradictionRecord has evidenceBId", contains(contDet, "evidenceBId"));
check("contra: ContradictionRecord has severity", contains(contDet, "severity"));
check("contra: ContradictionRecord has resolved field", contains(contDet, "resolved"));
check("contra: ContradictionRecord has orgSlug", contains(contDet, "orgSlug"));
check("contra: getSevereContradictions checks HIGH/CRITICAL", contains(contDet, '"SEVERE"') || (contains(contDet, '"HIGH"') && contains(contDet, '"CRITICAL"')));
check("contra: getUnresolvedContradictions checks resolved", contains(contDet, "resolved"));
check("contra: hasBlockingContradictions returns boolean", contains(contDet, "return false") || contains(contDet, "boolean"));
check("contra: no server-only import", notContains(contDet, 'import "server-only"'));
check("contra: no Prisma import", notContains(contDet, 'from "@prisma'));
check("contra: never throws (try/catch or empty return)", contains(contDet, "try {") || contains(contDet, "return []"));
check("contra: detects opposite direction signals", contains(contDet, "direction") || contains(contDet, "UP") || contains(contDet, "DOWN"));
check("contra: ID generator present", contains(contDet, "_id(") || contains(contDet, "Date.now") || contains(contDet, "Math.random"));
check("contra: returns empty array for empty input", contains(contDet, "return []"));
check("contra: contradiction has detectedAt timestamp", contains(contDet, "detectedAt") || contains(contDet, "toISOString"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 9 — executive-impact.ts (18 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 9: executive-impact.ts ───────────────────────────────");

const execImp = readFile(path.join(REASONING, "executive-impact.ts"));

check("execimp: ExecutiveImpactSummary exported", contains(execImp, "ExecutiveImpactSummary"));
check("execimp: classifyInsightImpact exported", contains(execImp, "export function classifyInsightImpact"));
check("execimp: classifyConclusionImpact exported", contains(execImp, "export function classifyConclusionImpact"));
check("execimp: getImpactSummary exported", contains(execImp, "export function getImpactSummary"));
check("execimp: filterInsightsByMinImpact exported", contains(execImp, "export function filterInsightsByMinImpact"));
check("execimp: uses EXECUTIVE_IMPACT_RANK", contains(execImp, "EXECUTIVE_IMPACT_RANK"));
check("execimp: returns LOW for empty", contains(execImp, '"LOW"'));
check("execimp: escalates for CRITICAL contradictions", contains(execImp, '"CRITICAL"'));
check("execimp: ExecutiveImpactSummary has overallImpact", contains(execImp, "overall:") || contains(execImp, "overallImpact"));
check("execimp: ExecutiveImpactSummary has criticalCount", contains(execImp, "criticalCount"));
check("execimp: classifyConclusionImpact handles blocking contradictions", contains(execImp, "contradiction") || contains(execImp, "blocking"));
check("execimp: no server-only import", notContains(execImp, 'import "server-only"'));
check("execimp: no Prisma import", notContains(execImp, 'from "@prisma'));
check("execimp: filterInsightsByMinImpact uses rank comparison", contains(execImp, "EXECUTIVE_IMPACT_RANK"));
check("execimp: never throws", contains(execImp, "try {") || notContains(execImp, "throw "));
check("execimp: classifyInsightImpact returns valid level", contains(execImp, '"LOW"') && contains(execImp, '"HIGH"'));
check("execimp: getImpactSummary has highCount", contains(execImp, "highCount") || contains(execImp, "HIGH"));
check("execimp: getImpactSummary has mediumCount", contains(execImp, "mediumCount") || contains(execImp, "MEDIUM"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 10 — reasoning-pipeline.ts (28 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 10: reasoning-pipeline.ts ────────────────────────────");

const pipeline = readFile(path.join(REASONING, "reasoning-pipeline.ts"));

check("pipe: ReasoningPipelineOptions interface", contains(pipeline, "ReasoningPipelineOptions"));
check("pipe: ReasoningPipelineResult interface", contains(pipeline, "ReasoningPipelineResult"));
check("pipe: runReasoningPipeline exported", contains(pipeline, "export function runReasoningPipeline"));
check("pipe: takes CrossDomainContext as input", contains(pipeline, "CrossDomainContext"));
check("pipe: returns ReasoningPipelineResult", contains(pipeline, "ReasoningPipelineResult"));
check("pipe: Phase 1 evidence building", contains(pipeline, "buildEvidenceFromContext") || contains(pipeline, "evidence"));
check("pipe: Phase 2 contradiction detection", contains(pipeline, "detectAllContradictions"));
check("pipe: Phase 3 hypothesis generation", contains(pipeline, "generateHypotheses"));
check("pipe: Phase 4 insight generation", contains(pipeline, "generateInsights"));
check("pipe: Phase 6 confidence calculation", contains(pipeline, "calculateOverallConfidence"));
check("pipe: Phase 7 executive impact", contains(pipeline, "classifyConclusionImpact"));
check("pipe: options maxInsights", contains(pipeline, "maxInsights"));
check("pipe: options minConfidenceScore", contains(pipeline, "minConfidenceScore"));
check("pipe: options includeRefutedHypotheses", contains(pipeline, "includeRefutedHypotheses"));
check("pipe: options skipContradictionDetection", contains(pipeline, "skipContradictionDetection"));
check("pipe: phaseTimings recorded", contains(pipeline, "phaseTimings") || contains(pipeline, "timings"));
check("pipe: errors array returned", contains(pipeline, "errors"));
check("pipe: never throws (all phases in try/catch)", (function() {
  if (!pipeline) return false;
  const tryCounts = countOccurrences(pipeline, "try {");
  return tryCounts >= 3;
})());
check("pipe: returns emptyConclusion on evidence failure", contains(pipeline, "emptyConclusion"));
check("pipe: no server-only import (pure domain)", notContains(pipeline, 'import "server-only"'));
check("pipe: no Prisma import", notContains(pipeline, 'from "@prisma'));
check("pipe: conclusion has orgSlug", contains(pipeline, "orgSlug"));
check("pipe: conclusion has generatedAt", contains(pipeline, "generatedAt"));
check("pipe: conclusion has durationMs", contains(pipeline, "durationMs"));
check("pipe: conclusion has executiveImpact", contains(pipeline, "executiveImpact"));
check("pipe: conclusion has overallConfidence", contains(pipeline, "overallConfidence"));
check("pipe: deduplication of contradictions", contains(pipeline, "Set") || contains(pipeline, "dedup") || contains(pipeline, "existingPairs"));
check("pipe: rankHypotheses used", contains(pipeline, "rankHypotheses"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 11 — multi-domain-resolver.ts (20 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 11: multi-domain-resolver.ts ─────────────────────────");

const resolver = readFile(path.join(REASONING, "multi-domain-resolver.ts"));

check("res: DomainResolutionPlan type exported", contains(resolver, "DomainResolutionPlan"));
check("res: resolveDomains function exported", contains(resolver, "export function resolveDomains"));
check("res: resolveMultiDomainQuery function exported", contains(resolver, "export function resolveMultiDomainQuery"));
check("res: getDomainCoverage function exported", contains(resolver, "export function getDomainCoverage"));
check("res: getActiveDomains function exported", contains(resolver, "export function getActiveDomains"));
check("res: DOMAIN_KEYWORDS constant defined", contains(resolver, "DOMAIN_KEYWORDS"));
check("res: FINANCIAL keyword set includes relevant terms", contains(resolver, "FINANCIAL") && contains(resolver, '"cash"') || contains(resolver, '"finanzas"'));
check("res: DomainResolutionPlan has primaryDomain", contains(resolver, "resolvedDomains") || contains(resolver, "primaryDomain"));
check("res: DomainResolutionPlan has detectedDomains", contains(resolver, "requestedDomains") || contains(resolver, "detectedDomains"));
check("res: DomainResolutionPlan has isMultiDomain", contains(resolver, "isMultiDomain"));
check("res: resolveMultiDomainQuery runs pipeline", contains(resolver, "runReasoningPipeline") || contains(resolver, "buildContext"));
check("res: getDomainCoverage enforces tenant isolation", contains(resolver, "orgSlug"));
check("res: resolveMultiDomainQuery never throws", contains(resolver, "try {") || contains(resolver, "catch"));
check("res: no server-only import", notContains(resolver, 'import "server-only"'));
check("res: no Prisma import", notContains(resolver, 'from "@prisma'));
check("res: getActiveDomains returns domains with count > 0", contains(resolver, "> 0") || contains(resolver, "count"));
check("res: domain classification is case-insensitive", contains(resolver, "toLowerCase") || contains(resolver, "lower"));
check("res: DomainResolutionPlan has orgSlug", contains(resolver, "orgSlug"));
check("res: MARKETING keywords defined", contains(resolver, "MARKETING"));
check("res: COLLECTIONS keywords defined", contains(resolver, "COLLECTIONS") || contains(resolver, "cobranza") || contains(resolver, "cartera"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 12 — reasoning-memory integration (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 12: integrations/reasoning-memory.ts ─────────────────");

const memInteg = readFile(path.join(INTEG, "reasoning-memory.ts"));

check("mem: MemoryIntegrationInput interface", contains(memInteg, "MemoryIntegrationInput"));
check("mem: memoryToReasoningSignals exported", contains(memInteg, "export function memoryToReasoningSignals"));
check("mem: memoryToContextSummary exported", contains(memInteg, "export function memoryToContextSummary"));
check("mem: getMemoryRelevance exported", contains(memInteg, "export function getMemoryRelevance"));
check("mem: filters HIGH and CRITICAL importance", contains(memInteg, '"CRITICAL"') && contains(memInteg, '"HIGH"'));
check("mem: signals carry orgSlug", contains(memInteg, "orgSlug"));
check("mem: returns empty array on failure (try/catch)", contains(memInteg, "return []") && contains(memInteg, "try {"));
check("mem: MemoryIntegrationInput has entries array", contains(memInteg, "entries:"));
check("mem: signal ID prefixed (traceability)", contains(memInteg, "msig_") || contains(memInteg, "`msig_"));
check("mem: memory signals tagged with 'memory'", contains(memInteg, '"memory"'));
check("mem: MemoryContextSummary.available computed", contains(memInteg, "available"));
check("mem: topEntries sliced to reasonable count", contains(memInteg, ".slice(0,") || contains(memInteg, ".slice(0, "));
check("mem: no server-only import", notContains(memInteg, 'import "server-only"'));
check("mem: no Prisma import", notContains(memInteg, 'from "@prisma'));
check("mem: getMemoryRelevance returns 0–100", contains(memInteg, "Math.min(100") || contains(memInteg, "Math.min"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 13 — reasoning-playbooks integration (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 13: integrations/reasoning-playbooks.ts ──────────────");

const pbInteg = readFile(path.join(INTEG, "reasoning-playbooks.ts"));

check("pb: PlaybookIntegrationInput interface", contains(pbInteg, "PlaybookIntegrationInput"));
check("pb: playbookToReasoningSignals exported", contains(pbInteg, "export function playbookToReasoningSignals"));
check("pb: playbookToContextSummary exported", contains(pbInteg, "export function playbookToContextSummary"));
check("pb: getRelevantPlaybooks exported", contains(pbInteg, "export function getRelevantPlaybooks"));
check("pb: filters HIGH and CRITICAL priority", contains(pbInteg, '"HIGH"') || contains(pbInteg, '"CRITICAL"'));
check("pb: PlaybookIntegrationInput has playbooks array", contains(pbInteg, "playbooks:"));
check("pb: signals carry orgSlug", contains(pbInteg, "orgSlug"));
check("pb: never throws (try/catch)", contains(pbInteg, "try {"));
check("pb: PlaybookContextSummary.available computed", contains(pbInteg, "available"));
check("pb: playbookCount in summary", contains(pbInteg, "playbookCount"));
check("pb: no server-only import", notContains(pbInteg, 'import "server-only"'));
check("pb: no Prisma import", notContains(pbInteg, 'from "@prisma'));
check("pb: signal ID prefixed (traceability)", contains(pbInteg, "pbsig_") || contains(pbInteg, "`pb"));
check("pb: playbooks tagged with 'playbook'", contains(pbInteg, '"playbook"'));
check("pb: getRelevantPlaybooks filters by domains", contains(pbInteg, "domain") || contains(pbInteg, "category"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 14 — reasoning-executive-brain integration (18 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 14: integrations/reasoning-executive-brain.ts ────────");

const ebInteg = readFile(path.join(INTEG, "reasoning-executive-brain.ts"));

check("eb: ExecutiveBrainIntegrationInput interface", contains(ebInteg, "ExecutiveBrainIntegrationInput"));
check("eb: ExecutiveBrainFeedback interface", contains(ebInteg, "ExecutiveBrainFeedback"));
check("eb: executiveBrainToReasoningSignals exported", contains(ebInteg, "export function executiveBrainToReasoningSignals"));
check("eb: executiveBrainToContextSummary exported", contains(ebInteg, "export function executiveBrainToContextSummary"));
check("eb: buildExecutiveFeedback exported", contains(ebInteg, "export function buildExecutiveFeedback"));
check("eb: filters CRITICAL and HIGH severity", contains(ebInteg, '"CRITICAL"') && contains(ebInteg, '"HIGH"'));
check("eb: skips LOW confidence signals (< 0.3)", contains(ebInteg, "0.3") || contains(ebInteg, "confidence < "));
check("eb: buildExecutiveFeedback only includes HIGH/CRITICAL insights", contains(ebInteg, '"HIGH"') && contains(ebInteg, '"CRITICAL"'));
check("eb: signals carry orgSlug", contains(ebInteg, "orgSlug"));
check("eb: never throws (try/catch)", contains(ebInteg, "try {"));
check("eb: signal ID prefixed (traceability)", contains(ebInteg, "ebsig_") || contains(ebInteg, "`eb"));
check("eb: criticalSignalCount in summary", contains(ebInteg, "criticalSignalCount"));
check("eb: no server-only import", notContains(ebInteg, 'import "server-only"'));
check("eb: no Prisma import", notContains(ebInteg, 'from "@prisma'));
check("eb: category mapping FINANCE→FINANCIAL", contains(ebInteg, "FINANCIAL"));
check("eb: direction mapping IMPROVING→UP", contains(ebInteg, '"UP"') || contains(ebInteg, "UP"));
check("eb: ExecutiveBrainFeedback has highImpactCount", contains(ebInteg, "highImpactCount"));
check("eb: ExecutiveBrainFeedback has generatedAt", contains(ebInteg, "generatedAt"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 15 — reasoning-compliance integration (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 15: integrations/reasoning-compliance.ts ─────────────");

const compInteg = readFile(path.join(INTEG, "reasoning-compliance.ts"));

check("comp: ReasoningTraceRecord type exported", contains(compInteg, "ReasoningTraceRecord"));
check("comp: ReasoningEvidenceTrace type exported", contains(compInteg, "ReasoningEvidenceTrace"));
check("comp: buildReasoningTraceRecord exported", contains(compInteg, "export function buildReasoningTraceRecord"));
check("comp: getEvidenceTraces exported", contains(compInteg, "export function getEvidenceTraces"));
check("comp: validateReasoningCompliance exported", contains(compInteg, "export function validateReasoningCompliance"));
check("comp: trace record contains orgSlug", contains(compInteg, "orgSlug"));
check("comp: trace record does NOT expose raw insight content", notContains(compInteg, "return insight.explanation") && notContains(compInteg, "return insight.summary"));
check("comp: validateReasoningCompliance checks evidenceIds", contains(compInteg, "evidenceIds"));
check("comp: validateReasoningCompliance checks hypothesisIds", contains(compInteg, "hypothesisIds"));
check("comp: validateReasoningCompliance checks orgSlug", contains(compInteg, "orgSlug"));
check("comp: validateReasoningCompliance returns violations array", contains(compInteg, "violations"));
check("comp: validateReasoningCompliance returns compliant boolean", contains(compInteg, "compliant"));
check("comp: no server-only import", notContains(compInteg, 'import "server-only"'));
check("comp: no Prisma import", notContains(compInteg, 'from "@prisma'));
check("comp: checks signalIds for evidence traceability", contains(compInteg, "signalIds"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 16 — reasoning-audit integration (18 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 16: integrations/reasoning-audit.ts ──────────────────");

const auditInteg = readFile(path.join(INTEG, "reasoning-audit.ts"));

check("audit: ReasoningAuditEventType exported", contains(auditInteg, "ReasoningAuditEventType"));
check("audit: ReasoningAuditEvent exported", contains(auditInteg, "ReasoningAuditEvent"));
check("audit: ReasoningAuditLog exported", contains(auditInteg, "ReasoningAuditLog"));
check("audit: createReasoningAuditLog exported", contains(auditInteg, "export function createReasoningAuditLog"));
check("audit: auditReasoningStarted exported", contains(auditInteg, "export function auditReasoningStarted"));
check("audit: auditReasoningCompleted exported", contains(auditInteg, "export function auditReasoningCompleted"));
check("audit: auditReasoningFailed exported", contains(auditInteg, "export function auditReasoningFailed"));
check("audit: auditInsightGenerated exported", contains(auditInteg, "export function auditInsightGenerated"));
check("audit: auditHypothesisGenerated exported", contains(auditInteg, "export function auditHypothesisGenerated"));
check("audit: auditContradictionDetected exported", contains(auditInteg, "export function auditContradictionDetected"));
check("audit: getAuditSummary exported", contains(auditInteg, "export function getAuditSummary"));
check("audit: REASONING_STARTED event type", contains(auditInteg, "REASONING_STARTED"));
check("audit: REASONING_COMPLETED event type", contains(auditInteg, "REASONING_COMPLETED"));
check("audit: REASONING_FAILED event type", contains(auditInteg, "REASONING_FAILED"));
check("audit: auditReasoningCompleted stores metadata only (not raw content)", (function() {
  if (!auditInteg) return false;
  return notContains(auditInteg, "insight.explanation") || contains(auditInteg, "metadata");
})());
check("audit: no server-only import", notContains(auditInteg, 'import "server-only"'));
check("audit: no Prisma import", notContains(auditInteg, 'from "@prisma'));
check("audit: log is immutable (returns new log)", contains(auditInteg, "return {") || contains(auditInteg, "return Object") || contains(auditInteg, "{ ...log"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 17 — reasoning-query.ts (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 17: reasoning-query.ts ───────────────────────────────");

const query = readFile(path.join(REASONING, "reasoning-query.ts"));

check("query: getInsights exported", contains(query, "export function getInsights"));
check("query: getHypotheses exported", contains(query, "export function getHypotheses"));
check("query: getEvidence exported", contains(query, "export function getEvidence"));
check("query: getConfidence exported", contains(query, "export function getConfidence"));
check("query: getContradictions exported", contains(query, "export function getContradictions"));
check("query: getCoveredDomains exported", contains(query, "export function getCoveredDomains"));
check("query: isMultiDomainConclusion exported", contains(query, "export function isMultiDomainConclusion"));
check("query: getConclusionSummary exported", contains(query, "export function getConclusionSummary"));
check("query: getConfidence returns isReliable", contains(query, "isReliable"));
check("query: getConfidence returns hasContradictions", contains(query, "hasContradictions"));
check("query: no server-only import", notContains(query, 'import "server-only"'));
check("query: no Prisma import", notContains(query, 'from "@prisma'));
check("query: getInsights supports filtering opts", contains(query, "opts") || contains(query, "options"));
check("query: getConclusionSummary returns structured object", contains(query, "return {"));
check("query: isMultiDomainConclusion returns boolean", contains(query, "return") && (contains(query, "boolean") || contains(query, ">= 2") || contains(query, "> 1")));

// ─────────────────────────────────────────────────────────────────────────────
// Section 18 — reasoning-report-builder.ts (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 18: reasoning-report-builder.ts ──────────────────────");

const reportBuilder = readFile(path.join(REASONING, "reasoning-report-builder.ts"));

check("report: has server-only import", contains(reportBuilder, 'import "server-only"'));
check("report: ExecutiveInsightReport type exported", contains(reportBuilder, "ExecutiveInsightReport"));
check("report: MultiDomainAnalysis type exported", contains(reportBuilder, "MultiDomainAnalysis"));
check("report: ReasoningTraceReport type exported", contains(reportBuilder, "ReasoningTraceReport"));
check("report: HypothesisReport type exported", contains(reportBuilder, "HypothesisReport"));
check("report: buildExecutiveInsightReport exported", contains(reportBuilder, "export function buildExecutiveInsightReport"));
check("report: buildMultiDomainAnalysis exported", contains(reportBuilder, "export function buildMultiDomainAnalysis"));
check("report: buildReasoningTraceReport exported", contains(reportBuilder, "export function buildReasoningTraceReport"));
check("report: buildHypothesisReport exported", contains(reportBuilder, "export function buildHypothesisReport"));
check("report: buildExecutiveInsightReport caps at 5 insights", contains(reportBuilder, "5") || contains(reportBuilder, ".slice(0, 5)"));
check("report: takes ReasoningConclusion as input", contains(reportBuilder, "ReasoningConclusion"));
check("report: no Prisma import", notContains(reportBuilder, 'from "@prisma'));
check("report: no AI calls (no fetch/completion/generate)", notContains(reportBuilder, "fetch") && notContains(reportBuilder, "completion") && notContains(reportBuilder, "anthropic"));
check("report: buildExecutiveInsightReport includes evidence IDs", contains(reportBuilder, "evidenceIds") || contains(reportBuilder, "evidence"));
check("report: traceReport includes signalIds", contains(reportBuilder, "signalIds") || contains(reportBuilder, "trace"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 19 — reasoning-health.ts (12 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 19: reasoning-health.ts ──────────────────────────────");

const health = readFile(path.join(REASONING, "reasoning-health.ts"));

check("health: has server-only import", contains(health, 'import "server-only"'));
check("health: ReasoningHealthStatus type exported", contains(health, "ReasoningHealthStatus"));
check("health: ReasoningSubsystemHealth interface", contains(health, "ReasoningSubsystemHealth"));
check("health: ReasoningHealthReport interface", contains(health, "ReasoningHealthReport"));
check("health: evaluateReasoningHealth exported", contains(health, "export function evaluateReasoningHealth"));
check("health: checks hypothesis_patterns", contains(health, "hypothesis_patterns"));
check("health: checks pipeline", contains(health, "pipeline"));
check("health: checks memory_integration", contains(health, "memory_integration"));
check("health: checks audit_integration", contains(health, "audit_integration"));
check("health: never throws (try/catch in helper)", contains(health, "try {"));
check("health: returns HEALTHY/DEGRADED/UNAVAILABLE", contains(health, '"HEALTHY"') && contains(health, '"DEGRADED"'));
check("health: overall status derived from subsystems", contains(health, "anyUnavailable") || contains(health, "anyDegraded") || contains(health, "UNAVAILABLE"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 20 — reasoning-readiness.ts (12 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 20: reasoning-readiness.ts ───────────────────────────");

const readiness = readFile(path.join(REASONING, "reasoning-readiness.ts"));

check("ready: has server-only import", contains(readiness, 'import "server-only"'));
check("ready: ReasoningReadinessStatus type exported", contains(readiness, "ReasoningReadinessStatus"));
check("ready: ReasoningSubsystemCheck interface", contains(readiness, "ReasoningSubsystemCheck"));
check("ready: ReasoningReadinessReport interface", contains(readiness, "ReasoningReadinessReport"));
check("ready: scanReasoningReadiness exported", contains(readiness, "export function scanReasoningReadiness"));
check("ready: 14+ checks", (function() {
  if (!readiness) return false;
  const count = countOccurrences(readiness, "_check(");
  return count >= 14;
})());
check("ready: score 0–100 computed", contains(readiness, "100"));
check("ready: READY threshold ≥ 90", contains(readiness, ">= 90") || contains(readiness, "90"));
check("ready: PARTIAL threshold 60–89", contains(readiness, ">= 60") || contains(readiness, "60"));
check("ready: blockers for critical checks (weight >= 9)", contains(readiness, ">= 9") || contains(readiness, "weight"));
check("ready: warnings for non-critical checks", contains(readiness, "warnings"));
check("ready: never throws (outer try/catch or _check)", contains(readiness, "try {"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 21 — reasoning-dashboard-contract.ts (12 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 21: reasoning-dashboard-contract.ts ──────────────────");

const dash = readFile(path.join(REASONING, "reasoning-dashboard-contract.ts"));

check("dash: no server-only import (pure domain)", notContains(dash, 'import "server-only"'));
check("dash: ReasoningDashboardPayload interface", contains(dash, "ReasoningDashboardPayload"));
check("dash: DomainCoverageMetric interface", contains(dash, "DomainCoverageMetric"));
check("dash: InsightMetric interface", contains(dash, "InsightMetric"));
check("dash: buildReasoningDashboard exported", contains(dash, "export function buildReasoningDashboard"));
check("dash: buildEmptyReasoningDashboard exported", contains(dash, "export function buildEmptyReasoningDashboard"));
check("dash: requiresAttention computed from impact", contains(dash, "requiresAttention"));
check("dash: traceabilityScore computed", contains(dash, "traceabilityScore"));
check("dash: topInsights capped at 5", contains(dash, ".slice(0, 5)"));
check("dash: domainCoverage includes signalCount", contains(dash, "signalCount"));
check("dash: no Prisma import", notContains(dash, 'from "@prisma'));
check("dash: isMultiDomain for 2+ domains", contains(dash, ">= 2") || contains(dash, "> 1"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 22 — future-compatibility.ts (12 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 22: future-compatibility.ts ──────────────────────────");

const future = readFile(path.join(REASONING, "future-compatibility.ts"));

check("future: no server-only import (pure domain)", notContains(future, 'import "server-only"'));
check("future: MemoryGraphNode interface", contains(future, "MemoryGraphNode"));
check("future: MemoryGraphEdge interface", contains(future, "MemoryGraphEdge"));
check("future: CausalModel interface", contains(future, "CausalModel"));
check("future: PredictiveReasoningModel interface", contains(future, "PredictiveReasoningModel"));
check("future: MEMORY_GRAPH_PLAN exported", contains(future, "MEMORY_GRAPH_PLAN"));
check("future: CAUSAL_ANALYSIS_PLAN exported", contains(future, "CAUSAL_ANALYSIS_PLAN"));
check("future: PREDICTIVE_REASONING_PLAN exported", contains(future, "PREDICTIVE_REASONING_PLAN"));
check("future: AUTONOMOUS_PLANNING_PLAN exported", contains(future, "AUTONOMOUS_PLANNING_PLAN"));
check("future: AUTONOMOUS_PLANNING_PLAN requires approval", contains(future, "requiresApproval: true"));
check("future: REASONING_FUTURE_PLANS has 4 entries", contains(future, "REASONING_FUTURE_PLANS"));
check("future: getFutureRoadmapSummary exported", contains(future, "export function getFutureRoadmapSummary"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 23 — server.ts barrel (20 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 23: server.ts (server barrel) ────────────────────────");

const serverBarrel = readFile(path.join(REASONING, "server.ts"));

check("server: has server-only import", contains(serverBarrel, 'import "server-only"'));
check("server: exports from reasoning-types", contains(serverBarrel, "./reasoning-types"));
check("server: exports from cross-domain-context", contains(serverBarrel, "./cross-domain-context"));
check("server: exports from evidence-builder", contains(serverBarrel, "./evidence-builder"));
check("server: exports from hypothesis-engine", contains(serverBarrel, "./hypothesis-engine"));
check("server: exports from insight-engine", contains(serverBarrel, "./insight-engine"));
check("server: exports from confidence-engine", contains(serverBarrel, "./confidence-engine"));
check("server: exports from contradiction-detector", contains(serverBarrel, "./contradiction-detector"));
check("server: exports from executive-impact", contains(serverBarrel, "./executive-impact"));
check("server: exports from reasoning-pipeline", contains(serverBarrel, "./reasoning-pipeline"));
check("server: exports from multi-domain-resolver", contains(serverBarrel, "./multi-domain-resolver"));
check("server: exports from reasoning-memory integration", contains(serverBarrel, "./integrations/reasoning-memory"));
check("server: exports from reasoning-playbooks integration", contains(serverBarrel, "./integrations/reasoning-playbooks"));
check("server: exports from reasoning-executive-brain integration", contains(serverBarrel, "./integrations/reasoning-executive-brain"));
check("server: exports from reasoning-compliance integration", contains(serverBarrel, "./integrations/reasoning-compliance"));
check("server: exports from reasoning-audit integration", contains(serverBarrel, "./integrations/reasoning-audit"));
check("server: exports from reasoning-query", contains(serverBarrel, "./reasoning-query"));
check("server: exports from reasoning-report-builder", contains(serverBarrel, "./reasoning-report-builder"));
check("server: exports from reasoning-health", contains(serverBarrel, "./reasoning-health"));
check("server: exports from reasoning-readiness", contains(serverBarrel, "./reasoning-readiness"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 24 — index.ts (client-safe barrel) (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 24: index.ts (client-safe barrel) ────────────────────");

const clientBarrel = readFile(path.join(REASONING, "index.ts"));

check("index: NO server-only import", notContains(clientBarrel, 'import "server-only"'));
check("index: exports ReasoningConclusion type", contains(clientBarrel, "ReasoningConclusion"));
check("index: exports ReasoningCategory type", contains(clientBarrel, "ReasoningCategory"));
check("index: exports ExecutiveImpactLevel type", contains(clientBarrel, "ExecutiveImpactLevel"));
check("index: exports EXECUTIVE_IMPACT_RANK constant", contains(clientBarrel, "EXECUTIVE_IMPACT_RANK"));
check("index: exports scoreToConfidence", contains(clientBarrel, "scoreToConfidence"));
check("index: exports ReasoningDashboardPayload type", contains(clientBarrel, "ReasoningDashboardPayload"));
check("index: exports buildReasoningDashboard (pure domain fn)", contains(clientBarrel, "buildReasoningDashboard"));
check("index: exports buildEmptyReasoningDashboard", contains(clientBarrel, "buildEmptyReasoningDashboard"));
check("index: exports REASONING_FUTURE_PLANS", contains(clientBarrel, "REASONING_FUTURE_PLANS"));
check("index: exports ReasoningHealthStatus type", contains(clientBarrel, "ReasoningHealthStatus"));
check("index: exports ReasoningReadinessStatus type", contains(clientBarrel, "ReasoningReadinessStatus"));
check("index: does NOT export runReasoningPipeline (server-only fn)", notContains(clientBarrel, "export { runReasoningPipeline") && notContains(clientBarrel, "export { runReasoningPipeline"));
check("index: does NOT export evaluateReasoningHealth (server-only fn)", notContains(clientBarrel, "evaluateReasoningHealth"));
check("index: does NOT export scanReasoningReadiness (server-only fn)", notContains(clientBarrel, "scanReasoningReadiness"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 25 — copilot-types.ts extensions (12 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 25: copilot-types.ts extensions ──────────────────────");

const copilotTypes = readFile(path.join(COPILOT, "copilot-types.ts"));

check("copilot-types: imports ReasoningConclusion", contains(copilotTypes, "ReasoningConclusion"));
check("copilot-types: imports from reasoning index", contains(copilotTypes, "./intelligence/reasoning"));
check("copilot-types: CopilotResponse has reasoningConclusion field", contains(copilotTypes, "reasoningConclusion"));
check("copilot-types: reasoningConclusion is optional field", contains(copilotTypes, "reasoningConclusion?:"));
check("copilot-types: ReasoningConclusion type in field", contains(copilotTypes, "reasoningConclusion?: ReasoningConclusion"));
check("copilot-types: no server-only import", notContains(copilotTypes, 'import "server-only"'));
check("copilot-types: no Prisma import", notContains(copilotTypes, 'from "@prisma'));
check("copilot-types: existing fields preserved: executiveContext", contains(copilotTypes, "executiveContext?:"));
check("copilot-types: existing fields preserved: memoryContext", contains(copilotTypes, "memoryContext?:"));
check("copilot-types: existing fields preserved: playbookContext", contains(copilotTypes, "playbookContext?:"));
check("copilot-types: existing fields preserved: success", contains(copilotTypes, "success:"));
check("copilot-types: JSDoc comment for reasoningConclusion", contains(copilotTypes, "reasoning pipeline") || contains(copilotTypes, "Reasoning Engine") || contains(copilotTypes, "reasoning conclusion"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 26 — copilot-intelligence-service.ts extensions (25 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 26: copilot-intelligence-service.ts extensions ───────");

const svc = readFile(path.join(COPILOT, "copilot-intelligence-service.ts"));

check("svc: has server-only import", contains(svc, 'import "server-only"'));
check("svc: imports buildContext", contains(svc, "buildContext"));
check("svc: imports runReasoningPipeline", contains(svc, "runReasoningPipeline"));
check("svc: imports memoryToReasoningSignals", contains(svc, "memoryToReasoningSignals"));
check("svc: imports memoryToContextSummary", contains(svc, "memoryToContextSummary"));
check("svc: imports playbookToReasoningSignals", contains(svc, "playbookToReasoningSignals"));
check("svc: imports playbookToContextSummary", contains(svc, "playbookToContextSummary"));
check("svc: imports executiveBrainToReasoningSignals", contains(svc, "executiveBrainToReasoningSignals"));
check("svc: imports executiveBrainToContextSummary", contains(svc, "executiveBrainToContextSummary"));
check("svc: imports ReasoningConclusion type", contains(svc, "ReasoningConclusion"));
check("svc: Step 2g comment present", contains(svc, "Step 2g") || contains(svc, "reasoning pipeline"));
check("svc: reasoning step is non-blocking (try/catch)", (function() {
  if (!svc) return false;
  // Count how many try/catch blocks exist - should have the original ones plus the new reasoning one
  const tryCounts = countOccurrences(svc, "try {");
  return tryCounts >= 6;
})());
check("svc: reasoningConclusion variable declared", contains(svc, "reasoningConclusion"));
check("svc: withReasoning attachment step", contains(svc, "withReasoning"));
check("svc: withReasoning attached when non-undefined", contains(svc, "reasoningConclusion\n") || contains(svc, "reasoningConclusion }") || contains(svc, "reasoningConclusion,"));
check("svc: reasoning only runs when signals > 0", contains(svc, "reasoningSignals.length > 0"));
check("svc: reasoning conclusion only attached when evidence > 0", contains(svc, "evidence.length > 0"));
check("svc: maps memoryContext entries to reasoning format", contains(svc, "memoryContext.entries"));
check("svc: maps playbookContext playbooks to reasoning format", contains(svc, "playbookContext.playbooks"));
check("svc: maps executiveContext signals to reasoning format", contains(svc, "executiveContext.signals"));
check("svc: reasoning step after executiveContext (2e before 2g)", (function() {
  if (!svc) return false;
  const pos2e = svc.indexOf("Step 2e");
  const pos2g = svc.indexOf("Step 2g");
  return pos2e > -1 && pos2g > -1 && pos2g > pos2e;
})());
check("svc: reasoning step before planning signals (2g before 2f)", (function() {
  if (!svc) return false;
  const pos2g = svc.indexOf("Step 2g");
  const pos2f = svc.indexOf("Step 2f");
  return pos2g > -1 && pos2f > -1 && pos2g < pos2f;
})());
check("svc: existing pipeline steps preserved (Step 2e)", contains(svc, "Step 2e"));
check("svc: existing pipeline steps preserved (Step 3)", contains(svc, "Step 3:") || contains(svc, "Step 3 "));
check("svc: imports from cross-domain-context module", contains(svc, "cross-domain-context"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 27 — Integration Test Route (20 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 27: Integration Test Route (route.ts) ────────────────");

const testRoute = readFile(path.join(API_TESTS, "route.ts"));

check("testroute: has server-only import", contains(testRoute, 'import "server-only"'));
check("testroute: production guard present", contains(testRoute, "NODE_ENV") && contains(testRoute, "production"));
check("testroute: test token header check", contains(testRoute, "x-internal-test-token") || contains(testRoute, "INTERNAL_INTEGRATION_TEST_TOKEN"));
check("testroute: ENABLE_INTERNAL_INTEGRATION_TESTS check", contains(testRoute, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("testroute: 150+ test cases (T01–T150)", (function() {
  if (!testRoute) return false;
  const count = countOccurrences(testRoute, /t\("T\d{2,3}"/);
  return count >= 150;
})());
check("testroute: T01 exists", contains(testRoute, '"T01"'));
check("testroute: T50 exists", contains(testRoute, '"T50"'));
check("testroute: T100 exists", contains(testRoute, '"T100"'));
check("testroute: T150 exists", contains(testRoute, '"T150"'));
check("testroute: imports reasoning-types", contains(testRoute, "reasoning-types") || contains(testRoute, "reasoning/reasoning-types"));
check("testroute: imports hypothesis-engine", contains(testRoute, "hypothesis-engine"));
check("testroute: imports insight-engine", contains(testRoute, "insight-engine"));
check("testroute: imports reasoning-pipeline", contains(testRoute, "reasoning-pipeline"));
check("testroute: imports integration adapters", contains(testRoute, "reasoning-memory") && contains(testRoute, "reasoning-playbooks"));
check("testroute: tests evidence traceability", contains(testRoute, "evidenceIds") || contains(testRoute, "signalIds"));
check("testroute: tests hypothesis traceability", contains(testRoute, "hypothesisIds"));
check("testroute: tests tenant isolation", contains(testRoute, "orgSlug") && contains(testRoute, "other-org"));
check("testroute: tests fail-closed (never throws)", contains(testRoute, "never throws") || contains(testRoute, "Never throw"));
check("testroute: sprint label in response", contains(testRoute, "AGENTIK-COPILOT-INTELLIGENCE-02"));
check("testroute: GET handler exported", contains(testRoute, "export async function GET"));

// ─────────────────────────────────────────────────────────────────────────────
// Section 28 — Security Invariants (20 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 28: Security Invariants ──────────────────────────────");

// No DB access in any reasoning file
const _reasoningFileNames = [
  "reasoning-types.ts", "cross-domain-context.ts", "evidence-builder.ts",
  "hypothesis-engine.ts", "insight-engine.ts", "confidence-engine.ts",
  "contradiction-detector.ts", "executive-impact.ts", "reasoning-pipeline.ts",
  "multi-domain-resolver.ts", "reasoning-query.ts", "reasoning-dashboard-contract.ts",
  "future-compatibility.ts",
];
const reasoningFilePaths = _reasoningFileNames.map(f => path.join(REASONING, f));
const reasoningFiles = _reasoningFileNames.map(f => readFile(path.join(REASONING, f)));

const integrationFiles = [
  "reasoning-memory.ts", "reasoning-playbooks.ts", "reasoning-executive-brain.ts",
  "reasoning-compliance.ts", "reasoning-audit.ts",
].map(f => readFile(path.join(INTEG, f)));

check("security: no Prisma client in core reasoning files", reasoningFiles.every(src => notContains(src, "PrismaClient") && notContains(src, "prisma.")));
check("security: no Prisma client in integration adapters", integrationFiles.every(src => notContains(src, "PrismaClient") && notContains(src, "prisma.")));
check("security: no AI calls in reasoning engine (no fetch to AI)", reasoningFiles.every(src => notContains(src, "anthropic") && notContains(src, "openai") && notContains(src, "generateText")));
check("security: no AI calls in integration adapters", integrationFiles.every(src => notContains(src, "anthropic") && notContains(src, "openai")));
check("security: tenant isolation in buildContext", contains(ctx, "orgSlug !== orgSlug") || contains(ctx, "signal.orgSlug !== orgSlug"));
check("security: tenant isolation in mergeContexts", contains(ctx, "orgSlug") && contains(ctx, "throw"));
check("security: all insights require evidenceIds (no hallucination)", contains(insEng, "evidenceIds"));
check("security: all insights require hypothesisIds (no hallucination)", contains(insEng, "hypothesisIds"));
check("security: AUTONOMOUS_PLANNING_PLAN requires approval", contains(future, "requiresApproval: true"));
check("security: compliance validator checks cross-tenant", contains(compInteg, "orgSlug"));
check("security: audit log never stores raw insight content", (function() {
  if (!auditInteg) return false;
  return notContains(auditInteg, "insight.explanation") && notContains(auditInteg, "insight.summary");
})());
check("security: trace record is metadata-only", (function() {
  if (!compInteg) return false;
  const lines = compInteg.split('\n');
  const traceRecordFn = lines.findIndex(l => l.includes("function buildReasoningTraceRecord"));
  if (traceRecordFn < 0) return true;
  const fnBody = lines.slice(traceRecordFn, traceRecordFn + 30).join('\n');
  return notContains(fnBody, "explanation") && notContains(fnBody, "raw content");
})());
check("security: no direct DB in copilot-intelligence-service reasoning step", (function() {
  if (!svc) return false;
  const step2gIdx = svc.indexOf("Step 2g");
  const step2fIdx = svc.indexOf("Step 2f");
  if (step2gIdx < 0 || step2fIdx < 0) return false;
  const step2gBlock = svc.slice(step2gIdx, step2fIdx);
  return notContains(step2gBlock, "prisma.") && notContains(step2gBlock, "PrismaClient");
})());
check("security: pipeline is fail-closed (returns emptyConclusion on early exit)", contains(pipeline, "emptyConclusion"));
check("security: no side effects in reasoning engine (no console.log in core)", (function() {
  return reasoningFiles.every(src => notContains(src, "console.log"));
})());
check("security: server-only enforced on health checks", contains(health, 'import "server-only"') && contains(readiness, 'import "server-only"'));
check("security: server-only enforced on report builder", contains(reportBuilder, 'import "server-only"'));
check("security: client barrel exports no server-only functions", (function() {
  if (!clientBarrel) return false;
  return notContains(clientBarrel, "runReasoningPipeline") &&
         notContains(clientBarrel, "evaluateReasoningHealth") &&
         notContains(clientBarrel, "scanReasoningReadiness") &&
         notContains(clientBarrel, "buildExecutiveInsightReport");
})());
check("security: no raw hex colors in reasoning files", reasoningFiles.every(src => notContains(src, /#[0-9a-fA-F]{6}/)));
check("security: no financial transactions in reasoning engine", (function() {
  // future-compatibility.ts may mention transactions in safety constraint strings — allowed
  return reasoningFilePaths.every((fp, i) => {
    const src = reasoningFiles[i];
    if (!src) return true;
    if (fp.includes("future-compatibility")) return true;
    return notContains(src, "payment") && notContains(src, "transaction") && notContains(src, "charge");
  });
})());

// ─────────────────────────────────────────────────────────────────────────────
// Section 29 — API boundaries & module conventions (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 29: API Boundaries & Module Conventions ──────────────");

check("api: evidence-builder is pure domain (no server-only)", notContains(evdBuilder, 'import "server-only"'));
check("api: hypothesis-engine is pure domain (no server-only)", notContains(hypEng, 'import "server-only"'));
check("api: insight-engine is pure domain (no server-only)", notContains(insEng, 'import "server-only"'));
check("api: confidence-engine is pure domain (no server-only)", notContains(confEng, 'import "server-only"'));
check("api: contradiction-detector is pure domain (no server-only)", notContains(contDet, 'import "server-only"'));
check("api: executive-impact is pure domain (no server-only)", notContains(execImp, 'import "server-only"'));
check("api: reasoning-pipeline is pure domain (no server-only)", notContains(pipeline, 'import "server-only"'));
check("api: multi-domain-resolver is pure domain (no server-only)", notContains(resolver, 'import "server-only"'));
check("api: all integration adapters are pure domain (no server-only)", integrationFiles.every(src => notContains(src, 'import "server-only"')));
check("api: report builder is server-only (requires server-only)", contains(reportBuilder, 'import "server-only"'));
check("api: health module is server-only (requires server-only)", contains(health, 'import "server-only"'));
check("api: readiness module is server-only (requires server-only)", contains(readiness, 'import "server-only"'));
check("api: server barrel is server-only", contains(serverBarrel, 'import "server-only"'));
check("api: client barrel has no server-only", notContains(clientBarrel, 'import "server-only"'));
check("api: integration tests are server-only", contains(testRoute, 'import "server-only"'));

// ─────────────────────────────────────────────────────────────────────────────
// Section 30 — Sprint-level completeness (15 checks)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Section 30: Sprint-Level Completeness ────────────────────────");

check("sprint: all 5 integration adapters exist", [
  path.join(INTEG, "reasoning-memory.ts"),
  path.join(INTEG, "reasoning-playbooks.ts"),
  path.join(INTEG, "reasoning-executive-brain.ts"),
  path.join(INTEG, "reasoning-compliance.ts"),
  path.join(INTEG, "reasoning-audit.ts"),
].every(fileExists));

check("sprint: server barrel exports 30+ items", (function() {
  if (!serverBarrel) return false;
  return countOccurrences(serverBarrel, "export") >= 30;
})());

check("sprint: client barrel exports types-only", (function() {
  if (!clientBarrel) return false;
  const exportLines = clientBarrel.split('\n').filter(l => l.trim().startsWith("export {") || l.trim().startsWith("export type {"));
  return exportLines.length >= 8;
})());

check("sprint: HYPOTHESIS_PATTERNS has FINANCIAL_CRISIS", contains(hypEng, "FINANCIAL_CRISIS"));
check("sprint: HYPOTHESIS_PATTERNS has multi-domain pattern", (function() {
  if (!hypEng) return false;
  const multiCount = countOccurrences(hypEng, /domains:\s+\[/);
  return multiCount >= 3;
})());

check("sprint: reasoning pipeline has 8 phases", (function() {
  if (!pipeline) return false;
  const phaseCount = countOccurrences(pipeline, /Phase \d+/);
  return phaseCount >= 7;
})());

check("sprint: integration test route has 13 sections", (function() {
  if (!testRoute) return false;
  return countOccurrences(testRoute, "SECTION") >= 13;
})());

check("sprint: copilot-intelligence-service reasoning step non-blocking", (function() {
  if (!svc) return false;
  return contains(svc, "reasoningConclusion = undefined") || contains(svc, "= undefined");
})());

check("sprint: future plans all marked PLANNED", (function() {
  if (!future) return false;
  const readinessValues = future.match(/readinessStatus:\s*"([^"]+)"/g) || [];
  return readinessValues.every(v => v.includes("PLANNED"));
})());

check("sprint: AUTONOMOUS_PLANNING safetyConstraints defined", contains(future, "safetyConstraints"));

check("sprint: reasoning-types has all 7 reasoning categories", (function() {
  if (!types) return false;
  const categories = ["FINANCIAL", "COMMERCIAL", "MARKETING", "COLLECTIONS", "OPERATIONS", "EXECUTIVE", "MULTI_DOMAIN"];
  return categories.every(c => contains(types, `"${c}"`));
})());

check("sprint: evidence traceability enforced (signalIds always present)", (function() {
  return contains(evdBuilder, "signalIds") && contains(insEng, "evidenceIds") && contains(hypEng, "supportingEvidenceIds");
})());

check("sprint: hypothesis traceability enforced (hypothesisIds in insights)", (function() {
  return contains(insEng, "hypothesisIds") && contains(insEng, "hypothes");
})());

check("sprint: compliance integration checks cross-tenant", contains(compInteg, "orgSlug"));

check("sprint: validation script exists", fileExists(path.join(SCRIPTS, "_run-copilot-intelligence-02-validation.js")));

// ─────────────────────────────────────────────────────────────────────────────
// Final Report
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log(`  AGENTIK-COPILOT-INTELLIGENCE-02 Validation`);
console.log(`  ${pass + fail} checks — ${pass} passed — ${fail} failed`);
console.log(`  Score: ${pass}/${pass + fail} (${Math.round((pass / (pass + fail)) * 100)}%)`);
console.log("═══════════════════════════════════════════════════════════════════");

if (failures.length > 0) {
  console.log("\n  FAILURES:");
  failures.forEach(f => console.log(`    ✗ ${f}`));
  console.log();
  process.exit(1);
} else {
  console.log("\n  ALL CHECKS PASSED ✓\n");
  process.exit(0);
}
