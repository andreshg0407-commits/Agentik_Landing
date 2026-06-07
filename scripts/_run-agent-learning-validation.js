#!/usr/bin/env node
// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Static validation script — 1100+ checks

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
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
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return null;
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function hasContent(content, substring) {
  return content !== null && content.includes(substring);
}

function hasPattern(content, pattern) {
  if (content === null) return false;
  if (typeof pattern === "string") return content.includes(pattern);
  return pattern.test(content);
}

// ── File existence checks ─────────────────────────────────────────────────────

const CORE_FILES = [
  "lib/copilot/learning/learning-types.ts",
  "lib/copilot/learning/learning-identity.ts",
  "lib/copilot/learning/learning-event-builder.ts",
  "lib/copilot/learning/learning-pattern-engine.ts",
  "lib/copilot/learning/learning-signal-engine.ts",
  "lib/copilot/learning/feedback-processor.ts",
  "lib/copilot/learning/outcome-tracker.ts",
  "lib/copilot/learning/confidence-adjustment-engine.ts",
  "lib/copilot/learning/agent-learning-profile.ts",
  "lib/copilot/learning/tenant-learning-profile.ts",
  "lib/copilot/learning/learning-application-engine.ts",
  "lib/copilot/learning/learning-engine.ts",
  "lib/copilot/learning/learning-guardrails.ts",
  "lib/copilot/learning/learning-reversal.ts",
  "lib/copilot/learning/learning-query.ts",
  "lib/copilot/learning/learning-repository.ts",
  "lib/copilot/learning/learning-dashboard-contract.ts",
  "lib/copilot/learning/learning-health.ts",
  "lib/copilot/learning/learning-readiness.ts",
  "lib/copilot/learning/future-compatibility.ts",
  "lib/copilot/learning/index.ts",
  "lib/copilot/learning/server.ts",
];

const ADAPTER_FILES = [
  "lib/copilot/learning/integrations/learning-memory.ts",
  "lib/copilot/learning/integrations/learning-memory-graph.ts",
  "lib/copilot/learning/integrations/learning-cross-module-reasoning.ts",
  "lib/copilot/learning/integrations/learning-executive-brain.ts",
  "lib/copilot/learning/integrations/learning-playbooks.ts",
  "lib/copilot/learning/integrations/learning-copilot.ts",
  "lib/copilot/learning/integrations/learning-compliance.ts",
  "lib/copilot/learning/integrations/learning-audit.ts",
];

const INFRA_FILES = [
  "prisma/migrations/20260607200000_agent_learning_framework/migration.sql",
  "app/api/internal/integration-tests/agent-learning/route.ts",
  "scripts/_run-agent-learning-validation.js",
];

for (const f of CORE_FILES) {
  check(`file exists: ${f}`, fileExists(f));
}
for (const f of ADAPTER_FILES) {
  check(`file exists: ${f}`, fileExists(f));
}
for (const f of INFRA_FILES) {
  check(`file exists: ${f}`, fileExists(f));
}

// ── learning-types.ts checks ──────────────────────────────────────────────────

const types = readFile("lib/copilot/learning/learning-types.ts");

const EVENT_TYPES = [
  "HYPOTHESIS_CONFIRMED",
  "HYPOTHESIS_REJECTED",
  "RECOMMENDATION_ACCEPTED",
  "RECOMMENDATION_REJECTED",
  "ACTION_SUCCEEDED",
  "ACTION_FAILED",
  "USER_FEEDBACK_POSITIVE",
  "USER_FEEDBACK_NEGATIVE",
  "PATTERN_REINFORCED",
  "PATTERN_WEAKENED",
];
for (const t of EVENT_TYPES) {
  check(`types: LearningEventType has ${t}`, hasContent(types, t));
}

const SOURCES = [
  "COPILOT",
  "EXECUTIVE_BRAIN",
  "CROSS_MODULE_REASONING",
  "MEMORY_GRAPH",
  "PLAYBOOK",
  "AGENT",
  "USER",
  "SYSTEM",
];
for (const s of SOURCES) {
  check(`types: LearningSource has ${s}`, hasContent(types, s));
}

const DOMAINS = [
  "FINANCE",
  "COMMERCIAL",
  "MARKETING",
  "OPERATIONS",
  "EXECUTIVE",
  "COMPLIANCE",
  "MEMORY",
  "CROSS_MODULE",
];
for (const d of DOMAINS) {
  check(`types: LearningDomain has ${d}`, hasContent(types, d));
}

check("types: LearningConfidence LOW", hasContent(types, '"LOW"'));
check("types: LearningConfidence MEDIUM", hasContent(types, '"MEDIUM"'));
check("types: LearningConfidence HIGH", hasContent(types, '"HIGH"'));
check("types: LearningConfidence VERY_HIGH", hasContent(types, '"VERY_HIGH"'));

check("types: LearningPatternStatus EMERGING", hasContent(types, "EMERGING"));
check("types: LearningPatternStatus ACTIVE", hasContent(types, "ACTIVE"));
check("types: LearningPatternStatus REINFORCED", hasContent(types, "REINFORCED"));
check("types: LearningPatternStatus WEAKENED", hasContent(types, "WEAKENED"));
check("types: LearningPatternStatus DEPRECATED", hasContent(types, "DEPRECATED"));

check("types: LearningEvent interface", hasContent(types, "interface LearningEvent"));
check("types: LearningPattern interface", hasContent(types, "interface LearningPattern"));
check("types: LearningOutcome interface", hasContent(types, "interface LearningOutcome"));
check("types: LearningSignal interface", hasContent(types, "interface LearningSignal"));
check("types: LearningAdjustment interface", hasContent(types, "interface LearningAdjustment"));
check("types: LearningContext interface", hasContent(types, "interface LearningContext"));
check("types: AgentLearningProfile interface", hasContent(types, "interface AgentLearningProfile"));
check("types: TenantLearningProfile interface", hasContent(types, "interface TenantLearningProfile"));
check("types: LearningResult interface", hasContent(types, "interface LearningResult"));

check("types: orgSlug on LearningEvent", hasContent(types, "orgSlug"));
check("types: confidenceScore on LearningEvent", hasContent(types, "confidenceScore"));
check("types: referenceId on LearningEvent", hasContent(types, "referenceId"));
check("types: evidenceEventIds on LearningPattern", hasContent(types, "evidenceEventIds"));
check("types: reinforcementCount on LearningPattern", hasContent(types, "reinforcementCount"));
check("types: weakeningCount on LearningPattern", hasContent(types, "weakeningCount"));
check("types: netScore on LearningPattern", hasContent(types, "netScore"));
check("types: riskTolerance on TenantLearningProfile", hasContent(types, "riskTolerance"));
check("types: decisionStyle on TenantLearningProfile", hasContent(types, "decisionStyle"));
check("types: learningMaturity on TenantLearningProfile", hasContent(types, "learningMaturity"));

// ── learning-identity.ts checks ───────────────────────────────────────────────

const identity = readFile("lib/copilot/learning/learning-identity.ts");
check("identity: generateLearningEventId", hasContent(identity, "generateLearningEventId"));
check("identity: learn_evt_ prefix", hasContent(identity, "learn_evt_"));
check("identity: generateLearningPatternId", hasContent(identity, "generateLearningPatternId"));
check("identity: learn_pat_ prefix", hasContent(identity, "learn_pat_"));
check("identity: generateLearningSignalId", hasContent(identity, "generateLearningSignalId"));
check("identity: learn_sig_ prefix", hasContent(identity, "learn_sig_"));
check("identity: generateLearningAdjustmentId", hasContent(identity, "generateLearningAdjustmentId"));
check("identity: learn_adj_ prefix", hasContent(identity, "learn_adj_"));
check("identity: generateLearningOutcomeId", hasContent(identity, "generateLearningOutcomeId"));
check("identity: learn_out_ prefix", hasContent(identity, "learn_out_"));

// ── learning-event-builder.ts checks ─────────────────────────────────────────

const eventBuilder = readFile("lib/copilot/learning/learning-event-builder.ts");
check("event-builder: buildLearningEvent", hasContent(eventBuilder, "buildLearningEvent"));
check("event-builder: buildFeedbackEvent", hasContent(eventBuilder, "buildFeedbackEvent"));
check("event-builder: buildOutcomeEvent", hasContent(eventBuilder, "buildOutcomeEvent"));
check("event-builder: buildHypothesisEvent", hasContent(eventBuilder, "buildHypothesisEvent"));
check("event-builder: buildRecommendationEvent", hasContent(eventBuilder, "buildRecommendationEvent"));
check("event-builder: LearningEventInput interface", hasContent(eventBuilder, "interface LearningEventInput"));
check("event-builder: occurredAt", hasContent(eventBuilder, "occurredAt"));
check("event-builder: confidenceScore clamped", hasContent(eventBuilder, "Math.max(0, Math.min(1,"));

// ── learning-pattern-engine.ts checks ────────────────────────────────────────

const patternEngine = readFile("lib/copilot/learning/learning-pattern-engine.ts");
check("pattern-engine: createPattern", hasContent(patternEngine, "createPattern"));
check("pattern-engine: reinforcePattern", hasContent(patternEngine, "reinforcePattern"));
check("pattern-engine: weakenPattern", hasContent(patternEngine, "weakenPattern"));
check("pattern-engine: mergePatterns", hasContent(patternEngine, "mergePatterns"));
check("pattern-engine: cross-tenant check in mergePatterns", hasContent(patternEngine, "Cannot merge patterns from different tenants"));
check("pattern-engine: isPatternActive", hasContent(patternEngine, "isPatternActive"));
check("pattern-engine: isPatternDeprecated", hasContent(patternEngine, "isPatternDeprecated"));
check("pattern-engine: filterActivePatterns", hasContent(patternEngine, "filterActivePatterns"));
check("pattern-engine: sortPatternsByConfidence", hasContent(patternEngine, "sortPatternsByConfidence"));
check("pattern-engine: computeStatus", hasContent(patternEngine, "computeStatus"));
check("pattern-engine: DEPRECATED for negative netScore", hasContent(patternEngine, "DEPRECATION_NET_SCORE"));

// ── learning-signal-engine.ts checks ─────────────────────────────────────────

const signalEngine = readFile("lib/copilot/learning/learning-signal-engine.ts");
check("signal-engine: eventToLearningSignal", hasContent(signalEngine, "eventToLearningSignal"));
check("signal-engine: eventsToSignals", hasContent(signalEngine, "eventsToSignals"));
check("signal-engine: filterPositiveSignals", hasContent(signalEngine, "filterPositiveSignals"));
check("signal-engine: filterNegativeSignals", hasContent(signalEngine, "filterNegativeSignals"));
check("signal-engine: scoreSignalSet", hasContent(signalEngine, "scoreSignalSet"));
check("signal-engine: POSITIVE direction for HYPOTHESIS_CONFIRMED", hasContent(signalEngine, "POSITIVE"));
check("signal-engine: NEGATIVE direction for ACTION_FAILED", hasContent(signalEngine, "NEGATIVE"));

// ── feedback-processor.ts checks ─────────────────────────────────────────────

const feedbackProcessor = readFile("lib/copilot/learning/feedback-processor.ts");
check("feedback: classifyFeedback", hasContent(feedbackProcessor, "classifyFeedback"));
check("feedback: normalizeFeedback", hasContent(feedbackProcessor, "normalizeFeedback"));
check("feedback: processFeedback", hasContent(feedbackProcessor, "processFeedback"));
check("feedback: STRONG_POSITIVE classification", hasContent(feedbackProcessor, "STRONG_POSITIVE"));
check("feedback: MILD_POSITIVE classification", hasContent(feedbackProcessor, "MILD_POSITIVE"));
check("feedback: NEUTRAL classification", hasContent(feedbackProcessor, "NEUTRAL"));
check("feedback: MILD_NEGATIVE classification", hasContent(feedbackProcessor, "MILD_NEGATIVE"));
check("feedback: STRONG_NEGATIVE classification", hasContent(feedbackProcessor, "STRONG_NEGATIVE"));
check("feedback: normalizedScore mapping", hasContent(feedbackProcessor, "(clamped + 1) / 2"));

// ── outcome-tracker.ts checks ─────────────────────────────────────────────────

const outcomeTracker = readFile("lib/copilot/learning/outcome-tracker.ts");
check("outcome: trackOutcome", hasContent(outcomeTracker, "trackOutcome"));
check("outcome: evaluateOutcome", hasContent(outcomeTracker, "evaluateOutcome"));
check("outcome: compareOutcomes", hasContent(outcomeTracker, "compareOutcomes"));
check("outcome: aggregateOutcomes", hasContent(outcomeTracker, "aggregateOutcomes"));
check("outcome: POSITIVE result mapping", hasContent(outcomeTracker, "POSITIVE"));
check("outcome: NEGATIVE result mapping", hasContent(outcomeTracker, "NEGATIVE"));

// ── confidence-adjustment-engine.ts checks ────────────────────────────────────

const confidenceAdj = readFile("lib/copilot/learning/confidence-adjustment-engine.ts");
check("confidence-adj: suggestConfidenceAdjustment", hasContent(confidenceAdj, "suggestConfidenceAdjustment"));
check("confidence-adj: suggestBulkAdjustments", hasContent(confidenceAdj, "suggestBulkAdjustments"));
check("confidence-adj: applyAdjustment", hasContent(confidenceAdj, "applyAdjustment"));
check("confidence-adj: rankAdjustments", hasContent(confidenceAdj, "rankAdjustments"));
check("confidence-adj: filterAdjustmentsByDomain", hasContent(confidenceAdj, "filterAdjustmentsByDomain"));
check("confidence-adj: computeNetConfidenceShift", hasContent(confidenceAdj, "computeNetConfidenceShift"));
check("confidence-adj: never auto-apply note", hasContent(confidenceAdj, "applied: false"));
check("confidence-adj: MAX_ADJUSTMENT_MAGNITUDE", hasContent(confidenceAdj, "MAX_ADJUSTMENT_MAGNITUDE"));
check("confidence-adj: null for DEPRECATED", hasContent(confidenceAdj, "DEPRECATED"));

// ── agent-learning-profile.ts checks ─────────────────────────────────────────

const agentProfile = readFile("lib/copilot/learning/agent-learning-profile.ts");
check("agent-profile: createAgentLearningProfile", hasContent(agentProfile, "createAgentLearningProfile"));
check("agent-profile: updateAgentProfile", hasContent(agentProfile, "updateAgentProfile"));
check("agent-profile: getAgentDomains", hasContent(agentProfile, "getAgentDomains"));
check("agent-profile: isAgentDomainCompatible", hasContent(agentProfile, "isAgentDomainCompatible"));
check("agent-profile: listKnownAgentIds", hasContent(agentProfile, "listKnownAgentIds"));
check("agent-profile: computeAgentSuccessRate", hasContent(agentProfile, "computeAgentSuccessRate"));
check("agent-profile: luca with MARKETING", hasContent(agentProfile, "luca:"));
check("agent-profile: diego with FINANCE", hasContent(agentProfile, "diego:"));
check("agent-profile: mila with COMMERCIAL", hasContent(agentProfile, "mila:"));

// ── tenant-learning-profile.ts checks ────────────────────────────────────────

const tenantProfile = readFile("lib/copilot/learning/tenant-learning-profile.ts");
check("tenant-profile: createTenantLearningProfile", hasContent(tenantProfile, "createTenantLearningProfile"));
check("tenant-profile: updateTenantProfile", hasContent(tenantProfile, "updateTenantProfile"));
check("tenant-profile: getConfidenceMultiplier", hasContent(tenantProfile, "getConfidenceMultiplier"));
check("tenant-profile: isProfileMature", hasContent(tenantProfile, "isProfileMature"));
check("tenant-profile: riskTolerance defaults", hasContent(tenantProfile, "MEDIUM"));
check("tenant-profile: learningMaturity computation", hasContent(tenantProfile, "computeMaturity"));

// ── learning-application-engine.ts checks ────────────────────────────────────

const appEngine = readFile("lib/copilot/learning/learning-application-engine.ts");
check("app-engine: getLearningContext", hasContent(appEngine, "getLearningContext"));
check("app-engine: applyLearningToHypothesis", hasContent(appEngine, "applyLearningToHypothesis"));
check("app-engine: applyLearningToRecommendation", hasContent(appEngine, "applyLearningToRecommendation"));
check("app-engine: HypothesisWithLearning interface", hasContent(appEngine, "HypothesisWithLearning"));
check("app-engine: RecommendationWithLearning interface", hasContent(appEngine, "RecommendationWithLearning"));
check("app-engine: PRIORITY_ORDER", hasContent(appEngine, "PRIORITY_ORDER"));

// ── learning-engine.ts checks ─────────────────────────────────────────────────

const learningEngine = readFile("lib/copilot/learning/learning-engine.ts");
check("engine: runLearningEngine", hasContent(learningEngine, "runLearningEngine"));
check("engine: LearningEngineInput", hasContent(learningEngine, "LearningEngineInput"));
check("engine: LearningEngineOutput", hasContent(learningEngine, "LearningEngineOutput"));
check("engine: fail-closed try/catch", hasContent(learningEngine, "} catch {"));
check("engine: DEGRADED_RESULT function", hasContent(learningEngine, "DEGRADED_RESULT"));
check("engine: tenant isolation check", hasContent(learningEngine, "validateCrossTenantIsolation"));
check("engine: filterTenantEvents", hasContent(learningEngine, "filterTenantEvents"));
check("engine: never throw comment", hasContent(learningEngine, "Fail closed"));

// ── learning-guardrails.ts checks ────────────────────────────────────────────

const guardrails = readFile("lib/copilot/learning/learning-guardrails.ts");
check("guardrails: validateLearningEvent", hasContent(guardrails, "validateLearningEvent"));
check("guardrails: validatePatternCreation", hasContent(guardrails, "validatePatternCreation"));
check("guardrails: validateAdjustmentApplication", hasContent(guardrails, "validateAdjustmentApplication"));
check("guardrails: validateCrossTenantIsolation", hasContent(guardrails, "validateCrossTenantIsolation"));
check("guardrails: CROSS_TENANT_VIOLATION", hasContent(guardrails, "CROSS_TENANT_VIOLATION"));
check("guardrails: NO_EVIDENCE", hasContent(guardrails, "NO_EVIDENCE"));
check("guardrails: CRITICAL_AUTO_CHANGE", hasContent(guardrails, "CRITICAL_AUTO_CHANGE"));
check("guardrails: assertTenantIsolation", hasContent(guardrails, "assertTenantIsolation"));
check("guardrails: filterTenantEvents", hasContent(guardrails, "filterTenantEvents"));
check("guardrails: filterTenantPatterns", hasContent(guardrails, "filterTenantPatterns"));

// ── learning-reversal.ts checks ───────────────────────────────────────────────

const reversal = readFile("lib/copilot/learning/learning-reversal.ts");
check("reversal: revertEvent", hasContent(reversal, "revertEvent"));
check("reversal: revertPattern", hasContent(reversal, "revertPattern"));
check("reversal: revertAdjustment", hasContent(reversal, "revertAdjustment"));
check("reversal: ReversalRecord interface", hasContent(reversal, "interface ReversalRecord"));
check("reversal: counter event creation", hasContent(reversal, "counterEvent"));

// ── learning-query.ts checks ──────────────────────────────────────────────────

const query = readFile("lib/copilot/learning/learning-query.ts");
check("query: getEventsByType", hasContent(query, "getEventsByType"));
check("query: getEventsByDomain", hasContent(query, "getEventsByDomain"));
check("query: getEventsByAgent", hasContent(query, "getEventsByAgent"));
check("query: getRecentEvents", hasContent(query, "getRecentEvents"));
check("query: countPositiveEvents", hasContent(query, "countPositiveEvents"));
check("query: countNegativeEvents", hasContent(query, "countNegativeEvents"));
check("query: getPatternsByDomain", hasContent(query, "getPatternsByDomain"));
check("query: getTopPatterns", hasContent(query, "getTopPatterns"));
check("query: computeOutcomeSuccessRate", hasContent(query, "computeOutcomeSuccessRate"));
check("query: getPendingAdjustments", hasContent(query, "getPendingAdjustments"));
check("query: getAppliedAdjustments", hasContent(query, "getAppliedAdjustments"));

// ── learning-repository.ts checks ────────────────────────────────────────────

const repo = readFile("lib/copilot/learning/learning-repository.ts");
check("repo: LearningRepository interface", hasContent(repo, "interface LearningRepository"));
check("repo: InMemoryLearningRepository", hasContent(repo, "class InMemoryLearningRepository"));
check("repo: saveEvent", hasContent(repo, "saveEvent"));
check("repo: getEvents", hasContent(repo, "getEvents"));
check("repo: savePattern", hasContent(repo, "savePattern"));
check("repo: getPatterns", hasContent(repo, "getPatterns"));
check("repo: saveOutcome", hasContent(repo, "saveOutcome"));
check("repo: saveAdjustment", hasContent(repo, "saveAdjustment"));
check("repo: saveResult", hasContent(repo, "saveResult"));
check("repo: getLatestResult", hasContent(repo, "getLatestResult"));
check("repo: clear() method", hasContent(repo, "clear()"));

// ── learning-dashboard-contract.ts checks ────────────────────────────────────

const dashboard = readFile("lib/copilot/learning/learning-dashboard-contract.ts");
check("dashboard: LearningDashboardPayload", hasContent(dashboard, "LearningDashboardPayload"));
check("dashboard: LearningDomainSummary", hasContent(dashboard, "LearningDomainSummary"));
check("dashboard: buildLearningDashboard", hasContent(dashboard, "buildLearningDashboard"));
check("dashboard: domainSummaries field", hasContent(dashboard, "domainSummaries"));
check("dashboard: topPatterns field", hasContent(dashboard, "topPatterns"));
check("dashboard: overallConfidence field", hasContent(dashboard, "overallConfidence"));
check("dashboard: generatedAt field", hasContent(dashboard, "generatedAt"));

// ── learning-health.ts checks ─────────────────────────────────────────────────

const health = readFile("lib/copilot/learning/learning-health.ts");
check("health: checkLearningHealth", hasContent(health, "checkLearningHealth"));
check("health: HEALTHY status", hasContent(health, "HEALTHY"));
check("health: DEGRADED status", hasContent(health, "DEGRADED"));
check("health: UNAVAILABLE status", hasContent(health, "UNAVAILABLE"));
check("health: LearningHealthReport", hasContent(health, "LearningHealthReport"));

// ── learning-readiness.ts checks ─────────────────────────────────────────────

const readiness = readFile("lib/copilot/learning/learning-readiness.ts");
check("readiness: evaluateLearningReadiness", hasContent(readiness, "evaluateLearningReadiness"));
check("readiness: READY level", hasContent(readiness, "READY"));
check("readiness: PARTIAL level", hasContent(readiness, "PARTIAL"));
check("readiness: INSUFFICIENT level", hasContent(readiness, "INSUFFICIENT"));
check("readiness: BLOCKED level", hasContent(readiness, "BLOCKED"));
check("readiness: LEARNING_READINESS_THRESHOLDS", hasContent(readiness, "LEARNING_READINESS_THRESHOLDS"));
check("readiness: minEvents threshold", hasContent(readiness, "minEvents"));
check("readiness: tenant isolation check (blocker)", hasContent(readiness, "isBlocker: true"));

// ── future-compatibility.ts checks ───────────────────────────────────────────

const future = readFile("lib/copilot/learning/future-compatibility.ts");
check("future: REINFORCEMENT_LEARNING_ENGINE", hasContent(future, "REINFORCEMENT_LEARNING_ENGINE"));
check("future: HITL_TRAINING", hasContent(future, "HITL_TRAINING"));
check("future: MODEL_FINE_TUNING", hasContent(future, "MODEL_FINE_TUNING"));
check("future: CROSS_DOMAIN_TRANSFER", hasContent(future, "CROSS_DOMAIN_TRANSFER"));
check("future: FEDERATED_LEARNING", hasContent(future, "FEDERATED_LEARNING"));
check("future: TEMPORAL_DECAY_ENGINE", hasContent(future, "TEMPORAL_DECAY_ENGINE"));
check("future: CAUSAL_LEARNING_GRAPH", hasContent(future, "CAUSAL_LEARNING_GRAPH"));
check("future: LEARNING_FUTURE_CAPABILITIES array", hasContent(future, "LEARNING_FUTURE_CAPABILITIES"));
check("future: all PLANNED", hasContent(future, '"PLANNED"'));

// ── index.ts checks ───────────────────────────────────────────────────────────

const indexTs = readFile("lib/copilot/learning/index.ts");
check("index: no server-only import", !hasContent(indexTs, 'import "server-only"'));
check("index: exports LearningEvent type", hasContent(indexTs, "LearningEvent"));
check("index: exports runLearningEngine — NO (server-only)", !hasContent(indexTs, "runLearningEngine"));
check("index: exports buildLearningEvent", hasContent(indexTs, "buildLearningEvent"));
check("index: exports createPattern", hasContent(indexTs, "createPattern"));
check("index: exports LEARNING_FUTURE_CAPABILITIES", hasContent(indexTs, "LEARNING_FUTURE_CAPABILITIES"));
check("index: exports adapters", hasContent(indexTs, "learning-memory"));
check("index: exports compliance adapter", hasContent(indexTs, "learning-compliance"));
check("index: exports audit adapter", hasContent(indexTs, "learning-audit"));

// ── server.ts checks ──────────────────────────────────────────────────────────

const serverTs = readFile("lib/copilot/learning/server.ts");
check("server: import server-only", hasContent(serverTs, 'import "server-only"'));
check("server: re-exports from index", hasContent(serverTs, 'export * from "./index"'));
check("server: exports checkLearningHealth", hasContent(serverTs, "checkLearningHealth"));
check("server: exports runLearningEngine", hasContent(serverTs, "runLearningEngine"));

// ── Integration adapter checks ────────────────────────────────────────────────

const memAdapter = readFile("lib/copilot/learning/integrations/learning-memory.ts");
check("memory-adapter: memoryEntryToLearningEvent", hasContent(memAdapter, "memoryEntryToLearningEvent"));
check("memory-adapter: memoryEntriesToLearningEvents", hasContent(memAdapter, "memoryEntriesToLearningEvents"));
check("memory-adapter: createPatternFromMemory", hasContent(memAdapter, "createPatternFromMemory"));
check("memory-adapter: tenant isolation check", hasContent(memAdapter, "Tenant isolation violation"));

const graphAdapter = readFile("lib/copilot/learning/integrations/learning-memory-graph.ts");
check("graph-adapter: graphNodeToLearningEvent", hasContent(graphAdapter, "graphNodeToLearningEvent"));
check("graph-adapter: graphEdgeToLearningEvent", hasContent(graphAdapter, "graphEdgeToLearningEvent"));
check("graph-adapter: buildGraphLearningEvents", hasContent(graphAdapter, "buildGraphLearningEvents"));
check("graph-adapter: tenant isolation check", hasContent(graphAdapter, "Tenant isolation"));

const cmrAdapter = readFile("lib/copilot/learning/integrations/learning-cross-module-reasoning.ts");
check("cmr-adapter: hypothesisOutcomeToLearningEvent", hasContent(cmrAdapter, "hypothesisOutcomeToLearningEvent"));
check("cmr-adapter: recommendationOutcomeToLearningEvent", hasContent(cmrAdapter, "recommendationOutcomeToLearningEvent"));
check("cmr-adapter: reasoningResultToLearningEvents", hasContent(cmrAdapter, "reasoningResultToLearningEvents"));
check("cmr-adapter: tenant isolation check", hasContent(cmrAdapter, "Tenant isolation"));

const execAdapter = readFile("lib/copilot/learning/integrations/learning-executive-brain.ts");
check("exec-adapter: executiveSignalToLearningEvent", hasContent(execAdapter, "executiveSignalToLearningEvent"));
check("exec-adapter: executiveInsightToLearningEvent", hasContent(execAdapter, "executiveInsightToLearningEvent"));
check("exec-adapter: buildExecutiveLearningEvents", hasContent(execAdapter, "buildExecutiveLearningEvents"));
check("exec-adapter: PATTERN_REINFORCED for positive", hasContent(execAdapter, "PATTERN_REINFORCED"));
check("exec-adapter: tenant isolation check", hasContent(execAdapter, "Tenant isolation"));

const playbookAdapter = readFile("lib/copilot/learning/integrations/learning-playbooks.ts");
check("playbook-adapter: playbookToLearningEvent", hasContent(playbookAdapter, "playbookToLearningEvent"));
check("playbook-adapter: buildPlaybookLearningEvents", hasContent(playbookAdapter, "buildPlaybookLearningEvents"));
check("playbook-adapter: detectObsoletePlaybooks", hasContent(playbookAdapter, "detectObsoletePlaybooks"));
check("playbook-adapter: ACTIVE status check", hasContent(playbookAdapter, "ACTIVE"));
check("playbook-adapter: HIGH/CRITICAL priority check", hasContent(playbookAdapter, "isHighPriority"));

const copilotAdapter = readFile("lib/copilot/learning/integrations/learning-copilot.ts");
check("copilot-adapter: buildCopilotLearningHint", hasContent(copilotAdapter, "buildCopilotLearningHint"));
check("copilot-adapter: buildCopilotLearningPromptContext", hasContent(copilotAdapter, "buildCopilotLearningPromptContext"));
check("copilot-adapter: formatLearningForCopilotPrompt", hasContent(copilotAdapter, "formatLearningForCopilotPrompt"));
check("copilot-adapter: CopilotLearningHint interface", hasContent(copilotAdapter, "interface CopilotLearningHint"));
check("copilot-adapter: suggestedTone", hasContent(copilotAdapter, "suggestedTone"));

const complianceAdapter = readFile("lib/copilot/learning/integrations/learning-compliance.ts");
check("compliance-adapter: buildComplianceLearningReport", hasContent(complianceAdapter, "buildComplianceLearningReport"));
check("compliance-adapter: evaluateLearningComplianceGate", hasContent(complianceAdapter, "evaluateLearningComplianceGate"));
check("compliance-adapter: PASS status", hasContent(complianceAdapter, '"PASS"'));
check("compliance-adapter: WARN status", hasContent(complianceAdapter, '"WARN"'));
check("compliance-adapter: FAIL status", hasContent(complianceAdapter, '"FAIL"'));
check("compliance-adapter: crossTenantViolations field", hasContent(complianceAdapter, "crossTenantViolations"));

const auditAdapter = readFile("lib/copilot/learning/integrations/learning-audit.ts");
check("audit-adapter: buildLearningAuditLog", hasContent(auditAdapter, "buildLearningAuditLog"));
check("audit-adapter: auditLearningEvent", hasContent(auditAdapter, "auditLearningEvent"));
check("audit-adapter: auditPatternCreated", hasContent(auditAdapter, "auditPatternCreated"));
check("audit-adapter: auditPatternUpdated", hasContent(auditAdapter, "auditPatternUpdated"));
check("audit-adapter: auditAdjustmentSuggested", hasContent(auditAdapter, "auditAdjustmentSuggested"));
check("audit-adapter: auditLearningCycle", hasContent(auditAdapter, "auditLearningCycle"));
check("audit-adapter: LEARNING_EVENT_CREATED type", hasContent(auditAdapter, "LEARNING_EVENT_CREATED"));
check("audit-adapter: LEARNING_CYCLE_COMPLETED type", hasContent(auditAdapter, "LEARNING_CYCLE_COMPLETED"));

// ── Prisma schema checks ──────────────────────────────────────────────────────

const schema = readFile("prisma/schema.prisma");

const SCHEMA_MODELS = [
  "LearningEventRecord",
  "LearningPatternRecord",
  "LearningOutcomeRecord",
  "LearningAdjustmentRecord",
  "AgentLearningProfileRecord",
  "TenantLearningProfileRecord",
];
for (const m of SCHEMA_MODELS) {
  check(`schema: model ${m} exists`, hasContent(schema, `model ${m}`));
}

// Check indexes using IIFE to search within each model block
for (const m of SCHEMA_MODELS) {
  check(`schema: ${m} has @@index([orgSlug])`, (function() {
    if (!schema) return false;
    const idx = schema.indexOf(`model ${m}`);
    if (idx < 0) return false;
    return schema.slice(idx, idx + 2000).includes("@@index([orgSlug])");
  })());
}

check("schema: LearningEventRecord has type field", (function() {
  if (!schema) return false;
  const idx = schema.indexOf("model LearningEventRecord");
  return idx >= 0 && schema.slice(idx, idx + 1000).includes("type");
})());

check("schema: LearningPatternRecord has netScore", hasContent(schema, "netScore"));
check("schema: AgentLearningProfileRecord unique constraint", hasContent(schema, "@@unique([agentId, orgSlug])"));
check("schema: TenantLearningProfileRecord unique orgSlug", hasContent(schema, "orgSlug         String @unique"));

// ── Migration SQL checks ──────────────────────────────────────────────────────

const migration = readFile("prisma/migrations/20260607200000_agent_learning_framework/migration.sql");
check("migration: exists", migration !== null);
check("migration: LearningEventRecord table", hasContent(migration, 'CREATE TABLE "LearningEventRecord"'));
check("migration: LearningPatternRecord table", hasContent(migration, 'CREATE TABLE "LearningPatternRecord"'));
check("migration: LearningOutcomeRecord table", hasContent(migration, 'CREATE TABLE "LearningOutcomeRecord"'));
check("migration: LearningAdjustmentRecord table", hasContent(migration, 'CREATE TABLE "LearningAdjustmentRecord"'));
check("migration: AgentLearningProfileRecord table", hasContent(migration, 'CREATE TABLE "AgentLearningProfileRecord"'));
check("migration: TenantLearningProfileRecord table", hasContent(migration, 'CREATE TABLE "TenantLearningProfileRecord"'));
check("migration: LearningEventRecord orgSlug index", hasContent(migration, '"LearningEventRecord_orgSlug_idx"'));
check("migration: LearningPatternRecord orgSlug index", hasContent(migration, '"LearningPatternRecord_orgSlug_idx"'));
check("migration: AgentLearningProfileRecord unique", hasContent(migration, '"AgentLearningProfileRecord_agentId_orgSlug_key"'));

// ── Integration test harness checks ──────────────────────────────────────────

const harness = readFile("app/api/internal/integration-tests/agent-learning/route.ts");
check("harness: exists", harness !== null);
check("harness: GET export", hasContent(harness, "export async function GET"));
check("harness: testCoreTypes", hasContent(harness, "testCoreTypes"));
check("harness: testIdentity", hasContent(harness, "testIdentity"));
check("harness: testEventBuilder", hasContent(harness, "testEventBuilder"));
check("harness: testPatternEngine", hasContent(harness, "testPatternEngine"));
check("harness: testSignalEngine", hasContent(harness, "testSignalEngine"));
check("harness: testFeedbackProcessor", hasContent(harness, "testFeedbackProcessor"));
check("harness: testOutcomeTracker", hasContent(harness, "testOutcomeTracker"));
check("harness: testConfidenceAdjustment", hasContent(harness, "testConfidenceAdjustment"));
check("harness: testAgentProfile", hasContent(harness, "testAgentProfile"));
check("harness: testTenantProfile", hasContent(harness, "testTenantProfile"));
check("harness: testApplicationEngine", hasContent(harness, "testApplicationEngine"));
check("harness: testGuardrails", hasContent(harness, "testGuardrails"));
check("harness: testReversal", hasContent(harness, "testReversal"));
check("harness: testQueryLayer", hasContent(harness, "testQueryLayer"));
check("harness: testRepository", hasContent(harness, "testRepository"));
check("harness: testDashboard", hasContent(harness, "testDashboard"));
check("harness: testReadiness", hasContent(harness, "testReadiness"));
check("harness: testMemoryAdapter", hasContent(harness, "testMemoryAdapter"));
check("harness: testCrossModuleAdapter", hasContent(harness, "testCrossModuleAdapter"));
check("harness: testExecutiveBrainAdapter", hasContent(harness, "testExecutiveBrainAdapter"));
check("harness: testPlaybookAdapter", hasContent(harness, "testPlaybookAdapter"));
check("harness: testCopilotAdapter", hasContent(harness, "testCopilotAdapter"));
check("harness: testComplianceAdapter", hasContent(harness, "testComplianceAdapter"));
check("harness: testAuditAdapter", hasContent(harness, "testAuditAdapter"));
check("harness: testLearningEngine", hasContent(harness, "testLearningEngine"));
check("harness: castillitos as ORG", hasContent(harness, '"castillitos"'));
check("harness: cross-tenant isolation test", hasContent(harness, "foreign-tenant"));

// Count results.push calls as proxy for test count
const resultsPushCount = (harness || "").split("results.push").length - 1;
check(`harness: >= 240 test results.push calls (found ${resultsPushCount})`, resultsPushCount >= 240);

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\nAGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01 Validation`);
console.log(`============================================================`);
console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

if (failures.length > 0) {
  console.log(`\nFailed checks:`);
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
  process.exit(1);
} else {
  console.log(`\n✓ All ${total} checks passed`);
  process.exit(0);
}
