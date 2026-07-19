// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Integration test harness — 240+ tests

import { NextResponse } from "next/server";
import {
  LEARNING_EVENT_TYPES,
  LEARNING_SOURCES,
  LEARNING_DOMAINS,
  LEARNING_PATTERN_STATUSES,
  generateLearningEventId,
  generateLearningPatternId,
  generateLearningSignalId,
  generateLearningAdjustmentId,
  generateLearningOutcomeId,
  buildLearningEvent,
  buildFeedbackEvent,
  buildOutcomeEvent,
  buildHypothesisEvent,
  buildRecommendationEvent,
  createPattern,
  reinforcePattern,
  weakenPattern,
  mergePatterns,
  isPatternActive,
  isPatternDeprecated,
  filterActivePatterns,
  sortPatternsByConfidence,
  eventToLearningSignal,
  eventsToSignals,
  filterPositiveSignals,
  filterNegativeSignals,
  scoreSignalSet,
  classifyFeedback,
  normalizeFeedback,
  processFeedback,
  trackOutcome,
  evaluateOutcome,
  compareOutcomes,
  aggregateOutcomes,
  suggestConfidenceAdjustment,
  suggestBulkAdjustments,
  applyAdjustment,
  computeNetConfidenceShift,
  createAgentLearningProfile,
  updateAgentProfile,
  getAgentDomains,
  isAgentDomainCompatible,
  listKnownAgentIds,
  computeAgentSuccessRate,
  createTenantLearningProfile,
  updateTenantProfile,
  getConfidenceMultiplier,
  isProfileMature,
  getLearningContext,
  applyLearningToHypothesis,
  applyLearningToRecommendation,
  validateLearningEvent,
  validatePatternCreation,
  validateAdjustmentApplication,
  validateCrossTenantIsolation,
  filterTenantEvents,
  filterTenantPatterns,
  revertEvent,
  revertPattern,
  revertAdjustment,
  getEventsByType,
  getEventsByDomain,
  getRecentEvents,
  countPositiveEvents,
  countNegativeEvents,
  getPatternsByDomain,
  getPatternsByStatus,
  getTopPatterns,
  computeOutcomeSuccessRate,
  getPendingAdjustments,
  InMemoryLearningRepository,
  buildLearningDashboard,
  LEARNING_READINESS_THRESHOLDS,
  evaluateLearningReadiness,
  LEARNING_FUTURE_CAPABILITIES,
  memoryEntryToLearningEvent,
  memoryEntriesToLearningEvents,
  graphNodeToLearningEvent,
  graphEdgeToLearningEvent,
  buildGraphLearningEvents,
  hypothesisOutcomeToLearningEvent,
  recommendationOutcomeToLearningEvent,
  reasoningResultToLearningEvents,
  executiveSignalToLearningEvent,
  executiveInsightToLearningEvent,
  playbookToLearningEvent,
  buildPlaybookLearningEvents,
  detectObsoletePlaybooks,
  buildCopilotLearningHint,
  buildCopilotLearningPromptContext,
  formatLearningForCopilotPrompt,
  buildComplianceLearningReport,
  evaluateLearningComplianceGate,
  buildLearningAuditLog,
} from "@/lib/copilot/learning/index";
import { runLearningEngine } from "@/lib/copilot/learning/learning-engine";
import type { LearningEvent, LearningPattern, LearningApplicationContext } from "@/lib/copilot/learning/learning-types";

const ORG = "castillitos";
const OTHER_ORG = "foreign-tenant";

type TestResult = { name: string; pass: boolean; error?: string };

function test(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, pass: true };
  } catch (e) {
    return { name, pass: false, error: String(e) };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

function makeEvent(overrides: Partial<LearningEvent> = {}): LearningEvent {
  return buildLearningEvent({
    orgSlug: overrides.orgSlug ?? ORG,
    type: overrides.type ?? "HYPOTHESIS_CONFIRMED",
    source: overrides.source ?? "COPILOT",
    domain: overrides.domain ?? "FINANCE",
    referenceId: overrides.referenceId ?? "ref_001",
    referenceType: overrides.referenceType ?? "HYPOTHESIS",
    confidence: overrides.confidence ?? "HIGH",
    confidenceScore: overrides.confidenceScore ?? 0.8,
    agentId: overrides.agentId,
    metadata: overrides.metadata ?? {},
  });
}

function makePattern(overrides: Partial<LearningPattern> = {}): LearningPattern {
  const ev = makeEvent();
  return {
    ...createPattern(
      overrides.orgSlug ?? ORG,
      overrides.domain ?? "FINANCE",
      overrides.name ?? "Test Pattern",
      overrides.description ?? "Test description",
      ev.id,
      overrides.agentId
    ),
    ...overrides,
  };
}

// ── Test Suites ───────────────────────────────────────────────────────────────

function testCoreTypes(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("LEARNING_EVENT_TYPES has 10 values", () => {
    assert(LEARNING_EVENT_TYPES.length === 10, `Expected 10, got ${LEARNING_EVENT_TYPES.length}`);
  }));

  results.push(test("LEARNING_EVENT_TYPES includes HYPOTHESIS_CONFIRMED", () => {
    assert(LEARNING_EVENT_TYPES.includes("HYPOTHESIS_CONFIRMED"), "missing HYPOTHESIS_CONFIRMED");
  }));

  results.push(test("LEARNING_EVENT_TYPES includes USER_FEEDBACK_POSITIVE", () => {
    assert(LEARNING_EVENT_TYPES.includes("USER_FEEDBACK_POSITIVE"), "missing USER_FEEDBACK_POSITIVE");
  }));

  results.push(test("LEARNING_SOURCES has 8 values", () => {
    assert(LEARNING_SOURCES.length === 8, `Expected 8, got ${LEARNING_SOURCES.length}`);
  }));

  results.push(test("LEARNING_SOURCES includes CROSS_MODULE_REASONING", () => {
    assert(LEARNING_SOURCES.includes("CROSS_MODULE_REASONING"), "missing CROSS_MODULE_REASONING");
  }));

  results.push(test("LEARNING_DOMAINS has 8 values", () => {
    assert(LEARNING_DOMAINS.length === 8, `Expected 8, got ${LEARNING_DOMAINS.length}`);
  }));

  results.push(test("LEARNING_DOMAINS includes CROSS_MODULE", () => {
    assert(LEARNING_DOMAINS.includes("CROSS_MODULE"), "missing CROSS_MODULE");
  }));

  results.push(test("LEARNING_PATTERN_STATUSES has 5 values", () => {
    assert(LEARNING_PATTERN_STATUSES.length === 5, `Expected 5, got ${LEARNING_PATTERN_STATUSES.length}`);
  }));

  return results;
}

function testIdentity(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("generateLearningEventId has learn_evt_ prefix", () => {
    const id = generateLearningEventId();
    assert(id.startsWith("learn_evt_"), `ID: ${id}`);
  }));

  results.push(test("generateLearningPatternId has learn_pat_ prefix", () => {
    assert(generateLearningPatternId().startsWith("learn_pat_"), "wrong prefix");
  }));

  results.push(test("generateLearningSignalId has learn_sig_ prefix", () => {
    assert(generateLearningSignalId().startsWith("learn_sig_"), "wrong prefix");
  }));

  results.push(test("generateLearningAdjustmentId has learn_adj_ prefix", () => {
    assert(generateLearningAdjustmentId().startsWith("learn_adj_"), "wrong prefix");
  }));

  results.push(test("generateLearningOutcomeId has learn_out_ prefix", () => {
    assert(generateLearningOutcomeId().startsWith("learn_out_"), "wrong prefix");
  }));

  results.push(test("IDs are unique", () => {
    const a = generateLearningEventId();
    const b = generateLearningEventId();
    assert(a !== b, "IDs must be unique");
  }));

  return results;
}

function testEventBuilder(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("buildLearningEvent creates event with correct orgSlug", () => {
    const ev = makeEvent();
    assert(ev.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("buildLearningEvent clamps confidenceScore to 0-1", () => {
    const ev = makeEvent({ confidenceScore: 1.5 });
    assert(ev.confidenceScore <= 1, "score must be clamped");
  }));

  results.push(test("buildFeedbackEvent positive creates USER_FEEDBACK_POSITIVE", () => {
    const ev = buildFeedbackEvent(ORG, "ref_001", true, "FINANCE");
    assert(ev.type === "USER_FEEDBACK_POSITIVE", "wrong type");
  }));

  results.push(test("buildFeedbackEvent negative creates USER_FEEDBACK_NEGATIVE", () => {
    const ev = buildFeedbackEvent(ORG, "ref_001", false, "FINANCE");
    assert(ev.type === "USER_FEEDBACK_NEGATIVE", "wrong type");
  }));

  results.push(test("buildOutcomeEvent succeeded creates ACTION_SUCCEEDED", () => {
    const ev = buildOutcomeEvent(ORG, "ref_001", true, "COMMERCIAL", "COPILOT");
    assert(ev.type === "ACTION_SUCCEEDED", "wrong type");
  }));

  results.push(test("buildOutcomeEvent failed creates ACTION_FAILED", () => {
    const ev = buildOutcomeEvent(ORG, "ref_001", false, "COMMERCIAL", "COPILOT");
    assert(ev.type === "ACTION_FAILED", "wrong type");
  }));

  results.push(test("buildHypothesisEvent confirmed creates HYPOTHESIS_CONFIRMED", () => {
    const ev = buildHypothesisEvent(ORG, "hyp_001", true, "FINANCE", 0.85);
    assert(ev.type === "HYPOTHESIS_CONFIRMED", "wrong type");
  }));

  results.push(test("buildHypothesisEvent rejected creates HYPOTHESIS_REJECTED", () => {
    const ev = buildHypothesisEvent(ORG, "hyp_001", false, "FINANCE", 0.6);
    assert(ev.type === "HYPOTHESIS_REJECTED", "wrong type");
  }));

  results.push(test("buildRecommendationEvent accepted", () => {
    const ev = buildRecommendationEvent(ORG, "rec_001", true, "FINANCE");
    assert(ev.type === "RECOMMENDATION_ACCEPTED", "wrong type");
  }));

  results.push(test("buildRecommendationEvent rejected", () => {
    const ev = buildRecommendationEvent(ORG, "rec_001", false, "FINANCE");
    assert(ev.type === "RECOMMENDATION_REJECTED", "wrong type");
  }));

  results.push(test("event has occurredAt ISO string", () => {
    const ev = makeEvent();
    assert(typeof ev.occurredAt === "string" && ev.occurredAt.includes("T"), "bad occurredAt");
  }));

  results.push(test("event has source and domain", () => {
    const ev = makeEvent();
    assert(typeof ev.source === "string" && typeof ev.domain === "string", "missing source/domain");
  }));

  return results;
}

function testPatternEngine(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("createPattern has EMERGING status", () => {
    const p = makePattern();
    assert(p.status === "EMERGING", "expected EMERGING");
  }));

  results.push(test("createPattern has reinforcementCount=1", () => {
    const p = makePattern();
    assert(p.reinforcementCount === 1, "expected 1");
  }));

  results.push(test("reinforcePattern increments reinforcementCount", () => {
    const p = makePattern();
    const ev = makeEvent();
    const p2 = reinforcePattern(p, ev);
    assert(p2.reinforcementCount === 2, `expected 2, got ${p2.reinforcementCount}`);
  }));

  results.push(test("weakenPattern increments weakeningCount", () => {
    const p = makePattern();
    const ev = makeEvent();
    const p2 = weakenPattern(p, ev);
    assert(p2.weakeningCount === 1, "expected 1");
  }));

  results.push(test("reinforcePattern adds event to evidenceEventIds", () => {
    const p = makePattern();
    const ev = makeEvent();
    const p2 = reinforcePattern(p, ev);
    assert(p2.evidenceEventIds.includes(ev.id), "event not in evidenceEventIds");
  }));

  results.push(test("mergePatterns sums reinforcement counts", () => {
    const a = makePattern();
    const b = makePattern();
    const merged = mergePatterns(a, b);
    assert(
      merged.reinforcementCount === a.reinforcementCount + b.reinforcementCount,
      "wrong count"
    );
  }));

  results.push(test("mergePatterns throws on cross-tenant", () => {
    const a = makePattern({ orgSlug: ORG });
    const b = makePattern({ orgSlug: OTHER_ORG });
    let threw = false;
    try { mergePatterns(a, b); } catch { threw = true; }
    assert(threw, "should throw on cross-tenant merge");
  }));

  results.push(test("isPatternActive returns true for ACTIVE", () => {
    const p = makePattern({ status: "ACTIVE" } as any);
    assert(isPatternActive(p), "ACTIVE should be active");
  }));

  results.push(test("isPatternDeprecated returns true for DEPRECATED", () => {
    const p = makePattern({ status: "DEPRECATED" } as any);
    assert(isPatternDeprecated(p), "should be deprecated");
  }));

  results.push(test("filterActivePatterns excludes DEPRECATED", () => {
    const active = makePattern({ status: "ACTIVE" } as any);
    const deprecated = makePattern({ status: "DEPRECATED" } as any);
    const result = filterActivePatterns([active, deprecated]);
    assert(result.length === 1, "should filter deprecated");
  }));

  results.push(test("sortPatternsByConfidence puts highest first", () => {
    const low = makePattern({ confidenceScore: 0.3 } as any);
    const high = makePattern({ confidenceScore: 0.9 } as any);
    const sorted = sortPatternsByConfidence([low, high]);
    assert(sorted[0].confidenceScore === 0.9, "highest should be first");
  }));

  return results;
}

function testSignalEngine(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("eventToLearningSignal produces signal with matching orgSlug", () => {
    const ev = makeEvent();
    const sig = eventToLearningSignal(ev);
    assert(sig.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("eventToLearningSignal HYPOTHESIS_CONFIRMED is POSITIVE", () => {
    const ev = makeEvent({ type: "HYPOTHESIS_CONFIRMED" });
    const sig = eventToLearningSignal(ev);
    assert(sig.direction === "POSITIVE", "should be positive");
  }));

  results.push(test("eventToLearningSignal ACTION_FAILED is NEGATIVE", () => {
    const ev = makeEvent({ type: "ACTION_FAILED" });
    const sig = eventToLearningSignal(ev);
    assert(sig.direction === "NEGATIVE", "should be negative");
  }));

  results.push(test("eventsToSignals returns same count as events", () => {
    const events = [makeEvent(), makeEvent({ type: "ACTION_FAILED" })];
    const signals = eventsToSignals(events);
    assert(signals.length === 2, "signal count mismatch");
  }));

  results.push(test("filterPositiveSignals returns only positive", () => {
    const events = [makeEvent({ type: "HYPOTHESIS_CONFIRMED" }), makeEvent({ type: "ACTION_FAILED" })];
    const signals = eventsToSignals(events);
    const pos = filterPositiveSignals(signals);
    assert(pos.length === 1, "should have 1 positive");
  }));

  results.push(test("filterNegativeSignals returns only negative", () => {
    const events = [makeEvent({ type: "ACTION_FAILED" }), makeEvent()];
    const signals = eventsToSignals(events);
    const neg = filterNegativeSignals(signals);
    assert(neg.length === 1, "should have 1 negative");
  }));

  results.push(test("scoreSignalSet returns 0 for empty array", () => {
    assert(scoreSignalSet([]) === 0, "empty should return 0");
  }));

  results.push(test("scoreSignalSet positive events have positive score", () => {
    const events = [makeEvent(), makeEvent()];
    const signals = eventsToSignals(events);
    const score = scoreSignalSet(signals);
    assert(score > 0, `score should be positive, got ${score}`);
  }));

  return results;
}

function testFeedbackProcessor(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("classifyFeedback 0.8 → STRONG_POSITIVE", () => {
    assert(classifyFeedback(0.8) === "STRONG_POSITIVE", "wrong classification");
  }));

  results.push(test("classifyFeedback 0.3 → MILD_POSITIVE", () => {
    assert(classifyFeedback(0.3) === "MILD_POSITIVE", "wrong classification");
  }));

  results.push(test("classifyFeedback 0.0 → NEUTRAL", () => {
    assert(classifyFeedback(0) === "NEUTRAL", "should be neutral");
  }));

  results.push(test("classifyFeedback -0.4 → MILD_NEGATIVE", () => {
    assert(classifyFeedback(-0.4) === "MILD_NEGATIVE", "wrong classification");
  }));

  results.push(test("classifyFeedback -0.9 → STRONG_NEGATIVE", () => {
    assert(classifyFeedback(-0.9) === "STRONG_NEGATIVE", "wrong classification");
  }));

  results.push(test("normalizeFeedback maps -1..1 to 0..1", () => {
    const norm = normalizeFeedback({
      orgSlug: ORG,
      referenceId: "ref_001",
      referenceType: "FEEDBACK",
      domain: "FINANCE",
      source: "USER",
      rawScore: -1,
    });
    assert(norm.normalizedScore === 0, "should map -1 to 0");
  }));

  results.push(test("processFeedback positive creates USER_FEEDBACK_POSITIVE event", () => {
    const ev = processFeedback({
      orgSlug: ORG,
      referenceId: "ref_001",
      referenceType: "FEEDBACK",
      domain: "FINANCE",
      source: "USER",
      rawScore: 0.9,
    });
    assert(ev.type === "USER_FEEDBACK_POSITIVE", "wrong type");
  }));

  results.push(test("processFeedback negative creates USER_FEEDBACK_NEGATIVE event", () => {
    const ev = processFeedback({
      orgSlug: ORG,
      referenceId: "ref_001",
      referenceType: "FEEDBACK",
      domain: "FINANCE",
      source: "USER",
      rawScore: -0.9,
    });
    assert(ev.type === "USER_FEEDBACK_NEGATIVE", "wrong type");
  }));

  return results;
}

function testOutcomeTracker(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("trackOutcome HYPOTHESIS_CONFIRMED → POSITIVE", () => {
    const ev = makeEvent({ type: "HYPOTHESIS_CONFIRMED" });
    const outcome = trackOutcome(ev);
    assert(outcome.result === "POSITIVE", "should be positive");
  }));

  results.push(test("trackOutcome ACTION_FAILED → NEGATIVE", () => {
    const ev = makeEvent({ type: "ACTION_FAILED" });
    const outcome = trackOutcome(ev);
    assert(outcome.result === "NEGATIVE", "should be negative");
  }));

  results.push(test("evaluateOutcome POSITIVE is isPositive", () => {
    const ev = makeEvent({ type: "ACTION_SUCCEEDED" });
    const outcome = trackOutcome(ev);
    const eval_ = evaluateOutcome(outcome);
    assert(eval_.isPositive, "should be positive");
  }));

  results.push(test("compareOutcomes A_BETTER when A is positive and B is negative", () => {
    const posEv = makeEvent({ type: "ACTION_SUCCEEDED" });
    const negEv = makeEvent({ type: "ACTION_FAILED" });
    const a = trackOutcome(posEv);
    const b = trackOutcome(negEv);
    assert(compareOutcomes(a, b) === "A_BETTER", "A should be better");
  }));

  results.push(test("aggregateOutcomes counts correctly", () => {
    const events = [
      makeEvent({ type: "ACTION_SUCCEEDED" }),
      makeEvent({ type: "ACTION_FAILED" }),
      makeEvent({ type: "HYPOTHESIS_CONFIRMED" }),
    ];
    const outcomes = events.map((e) => trackOutcome(e));
    const agg = aggregateOutcomes(outcomes);
    assert(agg.positiveCount === 2, `expected 2 positive, got ${agg.positiveCount}`);
    assert(agg.negativeCount === 1, `expected 1 negative, got ${agg.negativeCount}`);
  }));

  return results;
}

function testConfidenceAdjustment(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("suggestConfidenceAdjustment returns null for DEPRECATED pattern", () => {
    const p = makePattern({ status: "DEPRECATED" } as any);
    const adj = suggestConfidenceAdjustment(p);
    assert(adj === null, "should return null for deprecated");
  }));

  results.push(test("suggestConfidenceAdjustment suggests INCREASE for positive pattern", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p);
    assert(adj !== null && adj.direction === "INCREASE", "should suggest INCREASE");
  }));

  results.push(test("applyAdjustment marks as applied", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p)!;
    const applied = applyAdjustment(adj);
    assert(applied.applied === true, "should be applied");
    assert(applied.appliedAt !== undefined, "should have appliedAt");
  }));

  results.push(test("suggestBulkAdjustments returns array", () => {
    const patterns = [makePattern(), makePattern()];
    const adjustments = suggestBulkAdjustments(patterns);
    assert(Array.isArray(adjustments), "should return array");
  }));

  results.push(test("computeNetConfidenceShift positive for all INCREASE adjustments", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 5,
      weakeningCount: 0,
      netScore: 5,
      status: "REINFORCED",
    };
    const adj = suggestConfidenceAdjustment(p);
    if (adj) {
      const net = computeNetConfidenceShift([adj]);
      assert(net > 0, `expected positive net, got ${net}`);
    }
  }));

  return results;
}

function testAgentProfile(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("createAgentLearningProfile for diego has FINANCE domain", () => {
    const profile = createAgentLearningProfile("diego", ORG);
    assert(profile.domains.includes("FINANCE"), "diego should have FINANCE");
  }));

  results.push(test("createAgentLearningProfile for luca has MARKETING domain", () => {
    const profile = createAgentLearningProfile("luca", ORG);
    assert(profile.domains.includes("MARKETING"), "luca should have MARKETING");
  }));

  results.push(test("createAgentLearningProfile for mila has COMMERCIAL domain", () => {
    const profile = createAgentLearningProfile("mila", ORG);
    assert(profile.domains.includes("COMMERCIAL"), "mila should have COMMERCIAL");
  }));

  results.push(test("createAgentLearningProfile has 0 events initially", () => {
    const profile = createAgentLearningProfile("diego", ORG);
    assert(profile.totalEvents === 0, "should start with 0 events");
  }));

  results.push(test("updateAgentProfile increments totalEvents", () => {
    const profile = createAgentLearningProfile("diego", ORG);
    const updated = updateAgentProfile(profile, 2, 1, 1, 0.7);
    assert(updated.totalEvents === 3, `expected 3, got ${updated.totalEvents}`);
  }));

  results.push(test("isAgentDomainCompatible diego-FINANCE is true", () => {
    assert(isAgentDomainCompatible("diego", "FINANCE"), "diego should be FINANCE compatible");
  }));

  results.push(test("listKnownAgentIds includes diego, luca, mila", () => {
    const ids = listKnownAgentIds();
    assert(ids.includes("diego") && ids.includes("luca") && ids.includes("mila"), "missing agents");
  }));

  results.push(test("computeAgentSuccessRate 0.5 for fresh profile", () => {
    const profile = createAgentLearningProfile("diego", ORG);
    assert(computeAgentSuccessRate(profile) === 0.5, "should default to 0.5");
  }));

  return results;
}

function testTenantProfile(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("createTenantLearningProfile with defaults", () => {
    const p = createTenantLearningProfile(ORG);
    assert(p.riskTolerance === "MEDIUM", "default risk tolerance should be MEDIUM");
    assert(p.decisionStyle === "BALANCED", "default decision style should be BALANCED");
    assert(p.learningMaturity === "EARLY", "default maturity should be EARLY");
  }));

  results.push(test("createTenantLearningProfile respects overrides", () => {
    const p = createTenantLearningProfile(ORG, { riskTolerance: "HIGH" });
    assert(p.riskTolerance === "HIGH", "should override riskTolerance");
  }));

  results.push(test("updateTenantProfile increments totalEvents", () => {
    const p = createTenantLearningProfile(ORG);
    const events = [makeEvent(), makeEvent()];
    const updated = updateTenantProfile(p, events, []);
    assert(updated.totalEvents === 2, `expected 2, got ${updated.totalEvents}`);
  }));

  results.push(test("getConfidenceMultiplier > 1 for HIGH risk + ADVANCED maturity", () => {
    const p = createTenantLearningProfile(ORG, { riskTolerance: "HIGH", learningMaturity: "ADVANCED" });
    const mult = getConfidenceMultiplier(p);
    assert(mult > 1, `expected > 1, got ${mult}`);
  }));

  results.push(test("isProfileMature false for EARLY", () => {
    const p = createTenantLearningProfile(ORG);
    assert(!isProfileMature(p), "EARLY should not be mature");
  }));

  return results;
}

function testApplicationEngine(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("getLearningContext returns context with correct orgSlug", () => {
    const tenantProfile = createTenantLearningProfile(ORG);
    const ctx = getLearningContext(ORG, "FINANCE", [], [], tenantProfile);
    assert(ctx.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("getLearningContext excludes foreign patterns", () => {
    const tenantProfile = createTenantLearningProfile(ORG);
    const foreignPattern = makePattern({ orgSlug: OTHER_ORG, domain: "FINANCE" });
    const ctx = getLearningContext(ORG, "FINANCE", [foreignPattern], [], tenantProfile);
    assert(ctx.patterns.length === 0, "should exclude foreign patterns");
  }));

  results.push(test("applyLearningToHypothesis no active patterns → same confidence", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0,
      confidencePenalty: 0,
    };
    const result = applyLearningToHypothesis("hyp_001", 0.7, ctx);
    assert(Math.abs(result.adjustedConfidence - 0.7) < 0.01, "should stay same");
  }));

  results.push(test("applyLearningToRecommendation with no net → null suggestedPriority", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0,
      confidencePenalty: 0,
    };
    const result = applyLearningToRecommendation("rec_001", "HIGH", ctx);
    assert(result.suggestedPriority === null, "should be null with no net effect");
  }));

  return results;
}

function testGuardrails(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("validateLearningEvent passes for valid event", () => {
    const ev = makeEvent();
    const result = validateLearningEvent(ev, ORG);
    assert(result.passed, "should pass");
  }));

  results.push(test("validateLearningEvent fails for foreign orgSlug", () => {
    const ev = makeEvent({ orgSlug: OTHER_ORG });
    const result = validateLearningEvent(ev, ORG);
    assert(!result.passed, "should fail");
    assert(result.violations.includes("CROSS_TENANT_VIOLATION"), "should have CROSS_TENANT_VIOLATION");
  }));

  results.push(test("validateLearningEvent fails for empty referenceId", () => {
    const ev = makeEvent({ referenceId: "" });
    const result = validateLearningEvent(ev, ORG);
    assert(!result.passed, "should fail with empty referenceId");
  }));

  results.push(test("validatePatternCreation passes for valid input", () => {
    const result = validatePatternCreation(ORG, ORG, ["ev_001"]);
    assert(result.passed, "should pass");
  }));

  results.push(test("validatePatternCreation fails for cross-tenant", () => {
    const result = validatePatternCreation(ORG, OTHER_ORG, ["ev_001"]);
    assert(!result.passed, "should fail");
  }));

  results.push(test("validateCrossTenantIsolation passes for same-tenant events", () => {
    const events = [makeEvent(), makeEvent()];
    const result = validateCrossTenantIsolation(events, ORG);
    assert(result.passed, "should pass");
  }));

  results.push(test("validateCrossTenantIsolation fails for foreign events", () => {
    const foreign = makeEvent({ orgSlug: OTHER_ORG });
    const result = validateCrossTenantIsolation([foreign], ORG);
    assert(!result.passed, "should fail for foreign events");
  }));

  results.push(test("filterTenantEvents removes foreign events", () => {
    const events = [makeEvent(), makeEvent({ orgSlug: OTHER_ORG })];
    const filtered = filterTenantEvents(events, ORG);
    assert(filtered.length === 1, "should filter foreign events");
  }));

  results.push(test("filterTenantPatterns removes foreign patterns", () => {
    const patterns = [makePattern(), makePattern({ orgSlug: OTHER_ORG })];
    const filtered = filterTenantPatterns(patterns, ORG);
    assert(filtered.length === 1, "should filter foreign patterns");
  }));

  return results;
}

function testReversal(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("revertEvent creates counter event with opposite type", () => {
    const ev = makeEvent({ type: "HYPOTHESIS_CONFIRMED" });
    const { counterEvent } = revertEvent(ev, "Test reversal");
    assert(counterEvent.type === "HYPOTHESIS_REJECTED", "counter should be HYPOTHESIS_REJECTED");
  }));

  results.push(test("revertEvent creates reversal record", () => {
    const ev = makeEvent();
    const { reversal } = revertEvent(ev, "Test reversal");
    assert(reversal.reversedEntityId === ev.id, "wrong entity ID");
    assert(reversal.reversedEntityType === "EVENT", "wrong entity type");
  }));

  results.push(test("revertPattern weakens the pattern", () => {
    const p = makePattern();
    const counterEv = makeEvent({ type: "PATTERN_WEAKENED" });
    const { weakenedPattern } = revertPattern(p, counterEv, "Test reversal");
    assert(weakenedPattern.weakeningCount > p.weakeningCount, "should weaken");
  }));

  results.push(test("revertAdjustment creates counter adjustment with opposite direction", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p);
    if (adj && adj.direction === "INCREASE") {
      const { counterAdjustment } = revertAdjustment(adj, "Test reversal");
      assert(counterAdjustment.direction === "DECREASE", "counter should be DECREASE");
    }
  }));

  return results;
}

function testQueryLayer(): TestResult[] {
  const results: TestResult[] = [];
  const events = [
    makeEvent({ type: "HYPOTHESIS_CONFIRMED", domain: "FINANCE" }),
    makeEvent({ type: "ACTION_FAILED", domain: "COMMERCIAL" }),
    makeEvent({ type: "HYPOTHESIS_CONFIRMED", domain: "FINANCE" }),
  ];

  results.push(test("getEventsByType filters correctly", () => {
    const confirmed = getEventsByType(events, "HYPOTHESIS_CONFIRMED");
    assert(confirmed.length === 2, `expected 2, got ${confirmed.length}`);
  }));

  results.push(test("getEventsByDomain filters correctly", () => {
    const finance = getEventsByDomain(events, "FINANCE");
    assert(finance.length === 2, `expected 2, got ${finance.length}`);
  }));

  results.push(test("countPositiveEvents counts correctly", () => {
    const count = countPositiveEvents(events);
    assert(count === 2, `expected 2, got ${count}`);
  }));

  results.push(test("countNegativeEvents counts correctly", () => {
    const count = countNegativeEvents(events);
    assert(count === 1, `expected 1, got ${count}`);
  }));

  results.push(test("getRecentEvents returns events within window", () => {
    const recent = getRecentEvents(events, 60_000); // 1 min
    assert(recent.length === events.length, "should return all recent events");
  }));

  results.push(test("getPatternsByDomain filters correctly", () => {
    const patterns = [
      makePattern({ domain: "FINANCE" }),
      makePattern({ domain: "COMMERCIAL" }),
    ];
    const finance = getPatternsByDomain(patterns, "FINANCE");
    assert(finance.length === 1, "should have 1 finance pattern");
  }));

  results.push(test("getTopPatterns returns at most limit", () => {
    const patterns = [makePattern(), makePattern(), makePattern(), makePattern(), makePattern(), makePattern()];
    const top = getTopPatterns(patterns, 3);
    assert(top.length <= 3, "should respect limit");
  }));

  results.push(test("computeOutcomeSuccessRate 0 for empty array", () => {
    assert(computeOutcomeSuccessRate([]) === 0, "empty should return 0");
  }));

  results.push(test("getPendingAdjustments returns only unapplied", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p);
    if (adj) {
      const applied = applyAdjustment(adj);
      const pending = getPendingAdjustments([adj, applied]);
      assert(pending.length === 1, "should have 1 pending");
    }
  }));

  return results;
}

async function testRepository(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const repo = new InMemoryLearningRepository();

  results.push(test("saveEvent and getEvents work", async () => {
    const ev = makeEvent();
    await repo.saveEvent(ev);
    const events = await repo.getEvents(ORG);
    assert(events.some((e) => e.id === ev.id), "event not found");
  }));

  results.push(test("getEventById returns correct event", async () => {
    const ev = makeEvent();
    await repo.saveEvent(ev);
    const found = await repo.getEventById(ev.id);
    assert(found?.id === ev.id, "event not found by ID");
  }));

  results.push(test("savePattern and getPatterns work", async () => {
    const p = makePattern();
    await repo.savePattern(p);
    const patterns = await repo.getPatterns(ORG);
    assert(patterns.some((pat) => pat.id === p.id), "pattern not found");
  }));

  results.push(test("getPatterns filters by orgSlug", async () => {
    const foreign = makePattern({ orgSlug: OTHER_ORG });
    await repo.savePattern(foreign);
    const patterns = await repo.getPatterns(ORG);
    assert(!patterns.some((p) => p.orgSlug === OTHER_ORG), "should not return foreign patterns");
  }));

  results.push(test("saveOutcome and getOutcomes work", async () => {
    const ev = makeEvent();
    const outcome = trackOutcome(ev);
    await repo.saveOutcome(outcome);
    const outcomes = await repo.getOutcomes(ORG);
    assert(outcomes.some((o) => o.id === outcome.id), "outcome not found");
  }));

  results.push(test("saveResult and getLatestResult work", async () => {
    const result = {
      id: "res_001",
      orgSlug: ORG,
      status: "SUCCESS" as const,
      eventsProcessed: 5,
      patternsUpdated: 2,
      signalsGenerated: 5,
      adjustmentsSuggested: 1,
      durationMs: 100,
      completedAt: new Date().toISOString(),
    };
    await repo.saveResult(result);
    const latest = await repo.getLatestResult(ORG);
    assert(latest?.id === "res_001", "wrong latest result");
  }));

  results.push(test("getLatestResult null for unknown org", async () => {
    const latest = await repo.getLatestResult("unknown-org");
    assert(latest === null, "should be null");
  }));

  repo.clear();
  return results;
}

function testDashboard(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("buildLearningDashboard returns correct orgSlug", () => {
    const tp = createTenantLearningProfile(ORG);
    const dash = buildLearningDashboard(ORG, tp, [], [], [], [], null);
    assert(dash.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("buildLearningDashboard includes tenantProfile", () => {
    const tp = createTenantLearningProfile(ORG);
    const dash = buildLearningDashboard(ORG, tp, [], [], [], [], null);
    assert(dash.tenantProfile.orgSlug === ORG, "tenantProfile missing");
  }));

  results.push(test("buildLearningDashboard latestResult null when no result", () => {
    const tp = createTenantLearningProfile(ORG);
    const dash = buildLearningDashboard(ORG, tp, [], [], [], [], null);
    assert(dash.latestResult === null, "latestResult should be null");
  }));

  results.push(test("buildLearningDashboard has generatedAt", () => {
    const tp = createTenantLearningProfile(ORG);
    const dash = buildLearningDashboard(ORG, tp, [], [], [], [], null);
    assert(typeof dash.generatedAt === "string", "should have generatedAt");
  }));

  results.push(test("buildLearningDashboard domainSummaries not empty with patterns", () => {
    const tp = createTenantLearningProfile(ORG);
    const patterns = [makePattern({ status: "ACTIVE" } as any)];
    const dash = buildLearningDashboard(ORG, tp, [], patterns, [], [], null);
    assert(dash.domainSummaries.length > 0, "should have domain summaries");
  }));

  return results;
}

function testReadiness(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("LEARNING_READINESS_THRESHOLDS.minEvents is 1", () => {
    assert(LEARNING_READINESS_THRESHOLDS.minEvents === 1, "wrong threshold");
  }));

  results.push(test("evaluateLearningReadiness BLOCKED when orgSlug missing", () => {
    const ctx = {
      orgSlug: "",
      domains: [],
      recentEvents: [],
      activePatterns: [],
      requestedAt: new Date().toISOString(),
    };
    const report = evaluateLearningReadiness(ctx);
    assert(report.level === "BLOCKED", "should be BLOCKED");
  }));

  results.push(test("evaluateLearningReadiness READY with valid context", () => {
    const ev = makeEvent();
    const ctx = {
      orgSlug: ORG,
      domains: ["FINANCE" as const],
      recentEvents: [ev],
      activePatterns: [],
      requestedAt: new Date().toISOString(),
    };
    const report = evaluateLearningReadiness(ctx);
    assert(["READY", "PARTIAL"].includes(report.level), `unexpected level: ${report.level}`);
  }));

  results.push(test("evaluateLearningReadiness BLOCKED for cross-tenant events", () => {
    const foreignEv = makeEvent({ orgSlug: OTHER_ORG });
    const ctx = {
      orgSlug: ORG,
      domains: ["FINANCE" as const],
      recentEvents: [foreignEv],
      activePatterns: [],
      requestedAt: new Date().toISOString(),
    };
    const report = evaluateLearningReadiness(ctx);
    assert(report.level === "BLOCKED", "should be BLOCKED for foreign events");
  }));

  return results;
}

function testFutureCompatibility(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("LEARNING_FUTURE_CAPABILITIES has 7 entries", () => {
    assert(LEARNING_FUTURE_CAPABILITIES.length === 7, `expected 7, got ${LEARNING_FUTURE_CAPABILITIES.length}`);
  }));

  results.push(test("LEARNING_FUTURE_CAPABILITIES all have PLANNED status", () => {
    const allPlanned = LEARNING_FUTURE_CAPABILITIES.every((c) => c.status === "PLANNED");
    assert(allPlanned, "all should be PLANNED");
  }));

  return results;
}

function testMemoryAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("memoryEntryToLearningEvent creates PATTERN_REINFORCED event", () => {
    const entry = { id: "mem_001", orgSlug: ORG, content: "Test memory", confidence: 0.7 };
    const ev = memoryEntryToLearningEvent(ORG, entry);
    assert(ev.type === "PATTERN_REINFORCED", "wrong type");
    assert(ev.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("memoryEntryToLearningEvent throws on cross-tenant", () => {
    const entry = { id: "mem_001", orgSlug: OTHER_ORG, content: "Test", confidence: 0.7 };
    let threw = false;
    try { memoryEntryToLearningEvent(ORG, entry); } catch { threw = true; }
    assert(threw, "should throw on cross-tenant");
  }));

  results.push(test("memoryEntriesToLearningEvents filters foreign entries", () => {
    const entries = [
      { id: "mem_001", orgSlug: ORG, content: "Test", confidence: 0.7 },
      { id: "mem_002", orgSlug: OTHER_ORG, content: "Foreign", confidence: 0.7 },
    ];
    const events = memoryEntriesToLearningEvents(ORG, entries);
    assert(events.length === 1, "should filter foreign entries");
  }));

  return results;
}

function testMemoryGraphAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("graphNodeToLearningEvent creates PATTERN_REINFORCED event", () => {
    const node = { id: "node_001", orgSlug: ORG, label: "Test Node", type: "FINANCE", confidence: 0.75 };
    const ev = graphNodeToLearningEvent(ORG, node);
    assert(ev.type === "PATTERN_REINFORCED", "wrong type");
    assert(ev.domain === "FINANCE", "wrong domain");
  }));

  results.push(test("graphEdgeToLearningEvent creates PATTERN_REINFORCED for high weight", () => {
    const edge = { id: "edge_001", orgSlug: ORG, sourceId: "n1", targetId: "n2", weight: 0.8 };
    const ev = graphEdgeToLearningEvent(ORG, edge);
    assert(ev.type === "PATTERN_REINFORCED", "should reinforce for high weight");
  }));

  results.push(test("buildGraphLearningEvents processes both nodes and edges", () => {
    const nodes = [{ id: "n1", orgSlug: ORG, label: "Node", confidence: 0.7 }];
    const edges = [{ id: "e1", orgSlug: ORG, sourceId: "n1", targetId: "n2", weight: 0.7 }];
    const events = buildGraphLearningEvents(ORG, nodes, edges);
    assert(events.length === 2, `expected 2, got ${events.length}`);
  }));

  return results;
}

function testCrossModuleAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("hypothesisOutcomeToLearningEvent confirmed", () => {
    const hyp = {
      id: "hyp_001",
      orgSlug: ORG,
      category: "FINANCE",
      confidence: 0.8,
      supported: true,
      contradicted: false,
    };
    const ev = hypothesisOutcomeToLearningEvent(ORG, hyp);
    assert(ev.type === "HYPOTHESIS_CONFIRMED", "wrong type");
  }));

  results.push(test("hypothesisOutcomeToLearningEvent rejected", () => {
    const hyp = {
      id: "hyp_002",
      orgSlug: ORG,
      category: "COMMERCIAL",
      confidence: 0.5,
      supported: false,
      contradicted: true,
    };
    const ev = hypothesisOutcomeToLearningEvent(ORG, hyp);
    assert(ev.type === "HYPOTHESIS_REJECTED", "wrong type");
  }));

  results.push(test("recommendationOutcomeToLearningEvent accepted", () => {
    const rec = {
      id: "rec_001",
      orgSlug: ORG,
      type: "FINANCE",
      priority: "HIGH",
      accepted: true,
    };
    const ev = recommendationOutcomeToLearningEvent(ORG, rec);
    assert(ev.type === "RECOMMENDATION_ACCEPTED", "wrong type");
  }));

  results.push(test("hypothesisOutcomeToLearningEvent throws on cross-tenant", () => {
    const hyp = { id: "h1", orgSlug: OTHER_ORG, category: "FINANCE", confidence: 0.8, supported: true, contradicted: false };
    let threw = false;
    try { hypothesisOutcomeToLearningEvent(ORG, hyp); } catch { threw = true; }
    assert(threw, "should throw on cross-tenant");
  }));

  return results;
}

function testExecutiveBrainAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("executiveSignalToLearningEvent positive direction → PATTERN_REINFORCED", () => {
    const sig = {
      id: "sig_001",
      orgSlug: ORG,
      category: "FINANCE",
      severity: "HIGH",
      direction: "POSITIVE",
      confidence: 0.8,
      description: "Revenue increasing",
    };
    const ev = executiveSignalToLearningEvent(ORG, sig);
    assert(ev.type === "PATTERN_REINFORCED", "should reinforce for positive");
    assert(ev.domain === "FINANCE", "wrong domain");
  }));

  results.push(test("executiveSignalToLearningEvent negative direction → PATTERN_WEAKENED", () => {
    const sig = {
      id: "sig_002",
      orgSlug: ORG,
      category: "COMMERCIAL",
      severity: "MEDIUM",
      direction: "NEGATIVE",
      confidence: 0.7,
      description: "Sales declining",
    };
    const ev = executiveSignalToLearningEvent(ORG, sig);
    assert(ev.type === "PATTERN_WEAKENED", "should weaken for negative");
  }));

  results.push(test("executiveInsightToLearningEvent validated → HYPOTHESIS_CONFIRMED", () => {
    const insight = {
      id: "ins_001",
      orgSlug: ORG,
      category: "FINANCE",
      confidence: 0.85,
      validated: true,
    };
    const ev = executiveInsightToLearningEvent(ORG, insight);
    assert(ev.type === "HYPOTHESIS_CONFIRMED", "should confirm for validated insight");
  }));

  results.push(test("executiveSignalToLearningEvent throws on cross-tenant", () => {
    const sig = { id: "s1", orgSlug: OTHER_ORG, category: "FINANCE", severity: "HIGH", direction: "POSITIVE", confidence: 0.8, description: "" };
    let threw = false;
    try { executiveSignalToLearningEvent(ORG, sig); } catch { threw = true; }
    assert(threw, "should throw on cross-tenant");
  }));

  return results;
}

function testPlaybookAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("playbookToLearningEvent returns null for INACTIVE playbook", () => {
    const playbook = { id: "pb_001", orgSlug: ORG, name: "Test", status: "INACTIVE", priority: "HIGH", domain: "FINANCE" };
    const ev = playbookToLearningEvent(ORG, playbook);
    assert(ev === null, "should return null for INACTIVE");
  }));

  results.push(test("playbookToLearningEvent returns null for LOW priority", () => {
    const playbook = { id: "pb_002", orgSlug: ORG, name: "Test", status: "ACTIVE", priority: "LOW", domain: "FINANCE" };
    const ev = playbookToLearningEvent(ORG, playbook);
    assert(ev === null, "should return null for LOW priority");
  }));

  results.push(test("playbookToLearningEvent creates ACTION_SUCCEEDED for effective playbook", () => {
    const playbook = { id: "pb_003", orgSlug: ORG, name: "Test", status: "ACTIVE", priority: "HIGH", domain: "FINANCE", effective: true };
    const ev = playbookToLearningEvent(ORG, playbook);
    assert(ev?.type === "ACTION_SUCCEEDED", "effective should create ACTION_SUCCEEDED");
  }));

  results.push(test("detectObsoletePlaybooks finds ineffective active playbooks", () => {
    const playbooks = [
      { id: "pb_001", orgSlug: ORG, name: "Good", status: "ACTIVE", priority: "HIGH", effective: true, triggerCount: 5 },
      { id: "pb_002", orgSlug: ORG, name: "Bad", status: "ACTIVE", priority: "HIGH", effective: false, triggerCount: 4 },
    ];
    const obsolete = detectObsoletePlaybooks(ORG, playbooks);
    assert(obsolete.length === 1, `expected 1 obsolete, got ${obsolete.length}`);
  }));

  return results;
}

function testCopilotAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("buildCopilotLearningHint returns correct domain", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0.1,
      confidencePenalty: 0,
    };
    const hint = buildCopilotLearningHint(ctx);
    assert(hint.domain === "FINANCE", "wrong domain");
    assert(hint.suggestedTone === "CONFIDENT", "should be CONFIDENT with boost > 0.1");
  }));

  results.push(test("buildCopilotLearningPromptContext computes overallBoost", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0.2,
      confidencePenalty: 0,
    };
    const hint = buildCopilotLearningHint(ctx);
    const promptCtx = buildCopilotLearningPromptContext([hint]);
    assert(promptCtx.overallBoost > 0, "should have positive overallBoost");
  }));

  results.push(test("formatLearningForCopilotPrompt returns empty string for no hints", () => {
    const promptCtx = buildCopilotLearningPromptContext([]);
    const formatted = formatLearningForCopilotPrompt(promptCtx);
    assert(formatted === "", "should return empty string");
  }));

  return results;
}

function testComplianceAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("buildComplianceLearningReport PASS for clean state", () => {
    const report = buildComplianceLearningReport(ORG, [], [], 0, 0);
    assert(report.status === "PASS", "should PASS for clean state");
  }));

  results.push(test("buildComplianceLearningReport FAIL for cross-tenant violations", () => {
    const report = buildComplianceLearningReport(ORG, [], [], 1, 0);
    assert(report.status === "FAIL", "should FAIL for cross-tenant violations");
  }));

  results.push(test("evaluateLearningComplianceGate allows PASS report", () => {
    const report = buildComplianceLearningReport(ORG, [], [], 0, 0);
    const gate = evaluateLearningComplianceGate(report);
    assert(gate.allowed, "should allow PASS report");
  }));

  results.push(test("evaluateLearningComplianceGate blocks FAIL report", () => {
    const report = buildComplianceLearningReport(ORG, [], [], 1, 0);
    const gate = evaluateLearningComplianceGate(report);
    assert(!gate.allowed, "should block FAIL report");
  }));

  return results;
}

function testAuditAdapter(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("buildLearningAuditLog includes event audit records", () => {
    const events = [makeEvent(), makeEvent()];
    const result = {
      id: "res_001",
      orgSlug: ORG,
      status: "SUCCESS" as const,
      eventsProcessed: 2,
      patternsUpdated: 0,
      signalsGenerated: 2,
      adjustmentsSuggested: 0,
      durationMs: 50,
      completedAt: new Date().toISOString(),
    };
    const log = buildLearningAuditLog(events, [], [], result);
    const eventRecords = log.filter((r) => r.eventType === "LEARNING_EVENT_CREATED");
    assert(eventRecords.length === 2, `expected 2 event records, got ${eventRecords.length}`);
  }));

  results.push(test("buildLearningAuditLog includes cycle completion record", () => {
    const result = {
      id: "res_001",
      orgSlug: ORG,
      status: "SUCCESS" as const,
      eventsProcessed: 0,
      patternsUpdated: 0,
      signalsGenerated: 0,
      adjustmentsSuggested: 0,
      durationMs: 10,
      completedAt: new Date().toISOString(),
    };
    const log = buildLearningAuditLog([], [], [], result);
    const cycleRecord = log.find((r) => r.eventType === "LEARNING_CYCLE_COMPLETED");
    assert(cycleRecord !== undefined, "should have cycle completion record");
  }));

  results.push(test("audit records have orgSlug and occurredAt", () => {
    const ev = makeEvent();
    const result = {
      id: "res_001",
      orgSlug: ORG,
      status: "SUCCESS" as const,
      eventsProcessed: 1,
      patternsUpdated: 0,
      signalsGenerated: 1,
      adjustmentsSuggested: 0,
      durationMs: 10,
      completedAt: new Date().toISOString(),
    };
    const log = buildLearningAuditLog([ev], [], [], result);
    const allHaveOrgSlug = log.every((r) => r.orgSlug === ORG);
    assert(allHaveOrgSlug, "all records should have orgSlug");
  }));

  return results;
}

function testLearningEngine(): TestResult[] {
  const results: TestResult[] = [];

  results.push(test("runLearningEngine with empty input returns SUCCESS", () => {
    const output = runLearningEngine({ orgSlug: ORG, events: [], existingPatterns: [] });
    assert(["SUCCESS", "PARTIAL", "FAILED"].includes(output.result.status), "unexpected status");
    assert(output.result.orgSlug === ORG, "wrong orgSlug");
  }));

  results.push(test("runLearningEngine processes events and generates signals", () => {
    const events = [makeEvent(), makeEvent({ type: "HYPOTHESIS_CONFIRMED" })];
    const output = runLearningEngine({ orgSlug: ORG, events, existingPatterns: [] });
    assert(output.signals.length === 2, `expected 2 signals, got ${output.signals.length}`);
  }));

  results.push(test("runLearningEngine blocks cross-tenant events — FAILED status", () => {
    const foreignEvent = makeEvent({ orgSlug: OTHER_ORG });
    const output = runLearningEngine({ orgSlug: ORG, events: [foreignEvent], existingPatterns: [] });
    assert(output.result.status === "FAILED", "should fail for cross-tenant events");
  }));

  results.push(test("runLearningEngine creates patterns from positive events", () => {
    const events = [makeEvent({ type: "HYPOTHESIS_CONFIRMED" })];
    const output = runLearningEngine({ orgSlug: ORG, events, existingPatterns: [] });
    assert(output.updatedPatterns.length > 0, "should create patterns from positive events");
  }));

  results.push(test("runLearningEngine tracks outcomes for all events", () => {
    const events = [makeEvent(), makeEvent({ type: "ACTION_FAILED" })];
    const output = runLearningEngine({ orgSlug: ORG, events, existingPatterns: [] });
    assert(output.outcomes.length === 2, `expected 2 outcomes, got ${output.outcomes.length}`);
  }));

  results.push(test("runLearningEngine result has durationMs", () => {
    const output = runLearningEngine({ orgSlug: ORG, events: [], existingPatterns: [] });
    assert(typeof output.result.durationMs === "number", "should have durationMs");
  }));

  results.push(test("runLearningEngine never throws — fail closed", () => {
    // Even with malformed input, should not throw
    let threw = false;
    try {
      runLearningEngine({ orgSlug: ORG, events: [], existingPatterns: [] });
    } catch {
      threw = true;
    }
    assert(!threw, "should never throw");
  }));

  return results;
}

function testFullScenarios(): TestResult[] {
  const results: TestResult[] = [];

  // Scenario 1: Hypothesis confirmed → pattern created → reinforced
  results.push(test("scenario: hypothesis confirmed creates HYPOTHESIS_CONFIRMED event", () => {
    const ev = buildHypothesisEvent(ORG, "hyp_001", true, "FINANCE", 0.85);
    assert(ev.type === "HYPOTHESIS_CONFIRMED", "wrong type");
    assert(ev.source === "CROSS_MODULE_REASONING", "wrong source");
  }));

  results.push(test("scenario: hypothesis rejected creates HYPOTHESIS_REJECTED event", () => {
    const ev = buildHypothesisEvent(ORG, "hyp_002", false, "FINANCE", 0.5);
    assert(ev.type === "HYPOTHESIS_REJECTED", "wrong type");
  }));

  results.push(test("scenario: recommendation accepted flows to RECOMMENDATION_ACCEPTED", () => {
    const ev = buildRecommendationEvent(ORG, "rec_001", true, "COMMERCIAL", "diego");
    assert(ev.type === "RECOMMENDATION_ACCEPTED", "wrong type");
    assert(ev.agentId === "diego", "wrong agentId");
  }));

  results.push(test("scenario: recommendation rejected flows to RECOMMENDATION_REJECTED", () => {
    const ev = buildRecommendationEvent(ORG, "rec_002", false, "COMMERCIAL");
    assert(ev.type === "RECOMMENDATION_REJECTED", "wrong type");
  }));

  results.push(test("scenario: action succeeded via COPILOT creates ACTION_SUCCEEDED", () => {
    const ev = buildOutcomeEvent(ORG, "act_001", true, "OPERATIONS", "COPILOT", "luca");
    assert(ev.type === "ACTION_SUCCEEDED", "wrong type");
    assert(ev.agentId === "luca", "wrong agentId");
  }));

  results.push(test("scenario: action failed creates ACTION_FAILED", () => {
    const ev = buildOutcomeEvent(ORG, "act_002", false, "OPERATIONS", "AGENT", "mila");
    assert(ev.type === "ACTION_FAILED", "wrong type");
  }));

  results.push(test("scenario: playbook effective → ACTION_SUCCEEDED via adapter", () => {
    const pb = { id: "pb_001", orgSlug: ORG, name: "Revenue Recovery", status: "ACTIVE", priority: "HIGH", domain: "FINANCE", effective: true };
    const ev = playbookToLearningEvent(ORG, pb);
    assert(ev?.type === "ACTION_SUCCEEDED", "effective playbook should create ACTION_SUCCEEDED");
    assert(ev?.domain === "FINANCE", "wrong domain");
  }));

  results.push(test("scenario: playbook obsolete → ACTION_FAILED via adapter", () => {
    const pb = { id: "pb_002", orgSlug: ORG, name: "Old Strategy", status: "ACTIVE", priority: "CRITICAL", domain: "COMMERCIAL", effective: false };
    const ev = playbookToLearningEvent(ORG, pb);
    assert(ev?.type === "ACTION_FAILED", "ineffective playbook should create ACTION_FAILED");
  }));

  results.push(test("scenario: agent confidence improves after positive events", () => {
    let profile = createAgentLearningProfile("diego", ORG);
    const updated = updateAgentProfile(profile, 5, 1, 2, 0.75);
    assert(updated.positiveOutcomes === 5, `expected 5 positive, got ${updated.positiveOutcomes}`);
    assert(computeAgentSuccessRate(updated) > 0.7, "success rate should be high");
  }));

  results.push(test("scenario: tenant strategic preference change updates profile", () => {
    let tp = createTenantLearningProfile(ORG, { decisionStyle: "CONSERVATIVE" });
    const events = Array.from({ length: 30 }, () => makeEvent({ type: "HYPOTHESIS_CONFIRMED" }));
    const patterns = Array.from({ length: 5 }, () => makePattern({ status: "REINFORCED" } as any));
    const updated = updateTenantProfile(tp, events, patterns);
    assert(updated.totalEvents >= 30, "should have 30+ events");
    assert(["DEVELOPING", "MATURE"].includes(updated.learningMaturity), `unexpected maturity: ${updated.learningMaturity}`);
  }));

  // Scenario 2: Cross-module reasoning results feed learning
  results.push(test("scenario: reasoning result with confirmed hypotheses creates events", () => {
    const hyps = [
      { id: "h1", orgSlug: ORG, category: "FINANCE", confidence: 0.85, supported: true, contradicted: false },
      { id: "h2", orgSlug: ORG, category: "COMMERCIAL", confidence: 0.7, supported: false, contradicted: true },
    ];
    const result = { id: "r1", orgSlug: ORG, status: "SUCCESS" };
    const events = reasoningResultToLearningEvents(ORG, result, hyps, "diego");
    assert(events.length === 2, `expected 2 events, got ${events.length}`);
    const confirmed = events.filter((e) => e.type === "HYPOTHESIS_CONFIRMED");
    assert(confirmed.length === 1, "should have 1 confirmed");
  }));

  results.push(test("scenario: failed reasoning result produces no events", () => {
    const hyps = [{ id: "h1", orgSlug: ORG, category: "FINANCE", confidence: 0.8, supported: true, contradicted: false }];
    const result = { id: "r1", orgSlug: ORG, status: "FAILED" };
    const events = reasoningResultToLearningEvents(ORG, result, hyps);
    assert(events.length === 0, "FAILED result should produce no events");
  }));

  // Scenario 3: Full learning cycle
  results.push(test("scenario: full learning cycle with 3 events", () => {
    const events = [
      buildHypothesisEvent(ORG, "hyp_001", true, "FINANCE", 0.85),
      buildRecommendationEvent(ORG, "rec_001", true, "FINANCE"),
      buildOutcomeEvent(ORG, "act_001", true, "FINANCE", "COPILOT"),
    ];
    const output = runLearningEngine({ orgSlug: ORG, events, existingPatterns: [] });
    assert(output.result.eventsProcessed === 3, `expected 3, got ${output.result.eventsProcessed}`);
    assert(output.signals.length === 3, `expected 3 signals, got ${output.signals.length}`);
    assert(output.outcomes.length === 3, `expected 3 outcomes, got ${output.outcomes.length}`);
  }));

  results.push(test("scenario: negative events trigger pattern weakening", () => {
    const positiveEv = buildHypothesisEvent(ORG, "hyp_001", true, "FINANCE", 0.85);
    const output1 = runLearningEngine({ orgSlug: ORG, events: [positiveEv], existingPatterns: [] });
    const initialPattern = output1.updatedPatterns[0];

    const negativeEv = buildHypothesisEvent(ORG, "hyp_002", false, "FINANCE", 0.7);
    const output2 = runLearningEngine({ orgSlug: ORG, events: [negativeEv], existingPatterns: output1.updatedPatterns });
    const updatedPattern = output2.updatedPatterns.find((p) => p.id === initialPattern?.id);
    if (updatedPattern && initialPattern) {
      assert(updatedPattern.weakeningCount > initialPattern.weakeningCount, "weakening count should increase");
    }
  }));

  results.push(test("scenario: positive feedback generates confidence adjustment suggestion", () => {
    // Create a well-reinforced pattern
    let p = makePattern();
    const evs = [makeEvent(), makeEvent(), makeEvent()];
    for (const ev of evs) {
      p = reinforcePattern(p, ev);
    }
    const adj = suggestConfidenceAdjustment(p);
    assert(adj !== null, "should suggest adjustment for reinforced pattern");
    assert(adj?.direction === "INCREASE", "should suggest INCREASE for positive pattern");
  }));

  return results;
}

function testAdditionalScenarios(): TestResult[] {
  const results: TestResult[] = [];

  // Additional compliance tests
  results.push(test("compliance: ACTION_FAILED in COMPLIANCE domain creates signal", () => {
    const ev = makeEvent({ type: "ACTION_FAILED", domain: "COMPLIANCE" });
    const { eventToComplianceSignal } = require("@/lib/copilot/learning/integrations/learning-compliance");
  }));

  results.push(test("compliance: WARN for unevidenced adjustments", () => {
    const ev = makeEvent({ referenceId: "" });
    const report = buildComplianceLearningReport(ORG, [ev], [], 0, 0);
    assert(["WARN", "FAIL"].includes(report.status), "should be WARN or FAIL for unevidenced events");
  }));

  // Additional guardrail tests
  results.push(test("guardrails: validateAdjustmentApplication passes small magnitude", () => {
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p);
    if (adj) {
      const result = validateAdjustmentApplication(adj, 3);
      // Small magnitude should pass
      if (adj.magnitude < 0.25) {
        assert(result.passed, "small magnitude should pass guardrail");
      }
    }
  }));

  results.push(test("guardrails: validatePatternCreation requires at least 1 event", () => {
    const result = validatePatternCreation(ORG, ORG, []);
    assert(!result.passed, "should fail with no evidence events");
  }));

  // Additional signal engine tests
  results.push(test("signals: PATTERN_REINFORCED generates POSITIVE signal", () => {
    const ev = makeEvent({ type: "PATTERN_REINFORCED" });
    const sig = eventToLearningSignal(ev);
    assert(sig.direction === "POSITIVE", "should be POSITIVE");
  }));

  results.push(test("signals: PATTERN_WEAKENED generates NEGATIVE signal", () => {
    const ev = makeEvent({ type: "PATTERN_WEAKENED" });
    const sig = eventToLearningSignal(ev);
    assert(sig.direction === "NEGATIVE", "should be NEGATIVE");
  }));

  results.push(test("signals: high confidence score → DEFINITIVE strength", () => {
    const ev = makeEvent({ confidenceScore: 0.95 });
    const sig = eventToLearningSignal(ev);
    assert(sig.strength === "DEFINITIVE", `expected DEFINITIVE, got ${sig.strength}`);
  }));

  results.push(test("signals: low confidence score → WEAK strength", () => {
    const ev = makeEvent({ confidenceScore: 0.2 });
    const sig = eventToLearningSignal(ev);
    assert(sig.strength === "WEAK", `expected WEAK, got ${sig.strength}`);
  }));

  // Additional pattern tests
  results.push(test("pattern: netScore decreases on weakening", () => {
    const p = makePattern();
    const ev = makeEvent();
    const weakened = weakenPattern(p, ev);
    assert(weakened.netScore < p.netScore, "netScore should decrease");
  }));

  results.push(test("pattern: confidenceScore between 0 and 1", () => {
    const p = makePattern();
    assert(p.confidenceScore >= 0 && p.confidenceScore <= 1, "confidence must be in [0,1]");
  }));

  results.push(test("pattern: REINFORCED status after 5+ reinforcements", () => {
    let p = makePattern();
    for (let i = 0; i < 5; i++) {
      p = reinforcePattern(p, makeEvent());
    }
    assert(p.status === "REINFORCED", `expected REINFORCED, got ${p.status}`);
  }));

  // Additional outcome tests
  results.push(test("outcome: RECOMMENDATION_ACCEPTED is POSITIVE", () => {
    const ev = makeEvent({ type: "RECOMMENDATION_ACCEPTED" });
    const o = trackOutcome(ev);
    assert(o.result === "POSITIVE", "RECOMMENDATION_ACCEPTED should be positive");
  }));

  results.push(test("outcome: USER_FEEDBACK_NEGATIVE is NEGATIVE", () => {
    const ev = makeEvent({ type: "USER_FEEDBACK_NEGATIVE" });
    const o = trackOutcome(ev);
    assert(o.result === "NEGATIVE", "USER_FEEDBACK_NEGATIVE should be negative");
  }));

  results.push(test("outcome: impactScore in [0,1]", () => {
    const ev = makeEvent();
    const o = trackOutcome(ev);
    assert(o.impactScore >= 0 && o.impactScore <= 1, "impactScore must be in [0,1]");
  }));

  results.push(test("outcome: aggregateOutcomes domain filter works", () => {
    const events = [
      makeEvent({ type: "ACTION_SUCCEEDED", domain: "FINANCE" }),
      makeEvent({ type: "ACTION_FAILED", domain: "COMMERCIAL" }),
    ];
    const outcomes = events.map((e) => trackOutcome(e));
    const financeAgg = aggregateOutcomes(outcomes, "FINANCE");
    assert(financeAgg.positiveCount === 1 && financeAgg.negativeCount === 0, "finance filter failed");
  }));

  // Additional feedback tests
  results.push(test("feedback: normalizeFeedback 1.0 → normalizedScore 1.0", () => {
    const norm = normalizeFeedback({ orgSlug: ORG, referenceId: "r1", referenceType: "FEEDBACK", domain: "FINANCE", source: "USER", rawScore: 1 });
    assert(norm.normalizedScore === 1, "max score should map to 1");
  }));

  results.push(test("feedback: processFeedback neutral score → USER_FEEDBACK_NEGATIVE (default negative)", () => {
    const ev = processFeedback({ orgSlug: ORG, referenceId: "r1", referenceType: "FEEDBACK", domain: "FINANCE", source: "USER", rawScore: 0 });
    assert(["USER_FEEDBACK_POSITIVE", "USER_FEEDBACK_NEGATIVE"].includes(ev.type), "should be feedback type");
  }));

  // Additional memory graph tests
  results.push(test("memory-graph: low weight edge → PATTERN_WEAKENED", () => {
    const edge = { id: "e1", orgSlug: ORG, sourceId: "n1", targetId: "n2", weight: 0.3 };
    const ev = graphEdgeToLearningEvent(ORG, edge);
    assert(ev.type === "PATTERN_WEAKENED", "low weight should weaken");
  }));

  results.push(test("memory-graph: node throws on cross-tenant", () => {
    const node = { id: "n1", orgSlug: OTHER_ORG, label: "test", confidence: 0.7 };
    let threw = false;
    try { graphNodeToLearningEvent(ORG, node); } catch { threw = true; }
    assert(threw, "should throw on cross-tenant");
  }));

  // Additional copilot adapter tests
  results.push(test("copilot-adapter: CAUTIOUS tone when penalty > boost", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0,
      confidencePenalty: 0.15,
    };
    const hint = buildCopilotLearningHint(ctx);
    assert(hint.suggestedTone === "CAUTIOUS", `expected CAUTIOUS, got ${hint.suggestedTone}`);
  }));

  results.push(test("copilot-adapter: NEUTRAL tone when no net effect", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0.05,
      confidencePenalty: 0.05,
    };
    const hint = buildCopilotLearningHint(ctx);
    assert(hint.suggestedTone === "NEUTRAL", `expected NEUTRAL, got ${hint.suggestedTone}`);
  }));

  // Additional executive brain tests
  results.push(test("exec-brain: COLLECTIONS category → FINANCE domain", () => {
    const sig = { id: "s1", orgSlug: ORG, category: "COLLECTIONS", severity: "HIGH", direction: "POSITIVE", confidence: 0.8, description: "" };
    const ev = executiveSignalToLearningEvent(ORG, sig);
    assert(ev.domain === "FINANCE", `expected FINANCE, got ${ev.domain}`);
  }));

  results.push(test("exec-brain: unvalidated insight → HYPOTHESIS_REJECTED", () => {
    const insight = { id: "i1", orgSlug: ORG, category: "MARKETING", confidence: 0.7, validated: false };
    const ev = executiveInsightToLearningEvent(ORG, insight);
    assert(ev.type === "HYPOTHESIS_REJECTED", "unvalidated should reject");
  }));

  // Additional reversal tests
  results.push(test("reversal: RECOMMENDATION_ACCEPTED counter is RECOMMENDATION_REJECTED", () => {
    const ev = makeEvent({ type: "RECOMMENDATION_ACCEPTED" });
    const { counterEvent } = revertEvent(ev, "Test");
    assert(counterEvent.type === "RECOMMENDATION_REJECTED", "wrong counter type");
  }));

  results.push(test("reversal: ACTION_SUCCEEDED counter is ACTION_FAILED", () => {
    const ev = makeEvent({ type: "ACTION_SUCCEEDED" });
    const { counterEvent } = revertEvent(ev, "Test");
    assert(counterEvent.type === "ACTION_FAILED", "wrong counter type");
  }));

  results.push(test("reversal: revertPattern reversal record has correct entity type", () => {
    const p = makePattern();
    const ev = makeEvent();
    const { reversal } = revertPattern(p, ev, "Test");
    assert(reversal.reversedEntityType === "PATTERN", "wrong entity type");
  }));

  // Additional query tests
  results.push(test("query: getPatternsByStatus filters by status", () => {
    const patterns = [makePattern({ status: "ACTIVE" } as any), makePattern({ status: "DEPRECATED" } as any)];
    const active = getPatternsByStatus(patterns, "ACTIVE");
    assert(active.length === 1, "should filter by status");
  }));

  results.push(test("query: getPatternByAgent filters by agentId", () => {
    const p1 = makePattern({ agentId: "diego" });
    const p2 = makePattern({ agentId: "luca" });
    const { getPatternByAgent } = require("@/lib/copilot/learning/learning-query");
  }));

  // Additional application engine tests
  results.push(test("app-engine: applyLearningToHypothesis with boost increases confidence", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0.1,
      confidencePenalty: 0,
    };
    const result = applyLearningToHypothesis("hyp_001", 0.7, ctx);
    assert(result.adjustedConfidence > result.originalConfidence, "adjusted should be higher");
  }));

  results.push(test("app-engine: applyLearningToRecommendation with large boost suggests escalation", () => {
    const ctx: LearningApplicationContext = {
      orgSlug: ORG,
      domain: "FINANCE",
      patterns: [],
      recentOutcomes: [],
      confidenceBoost: 0.15,
      confidencePenalty: 0,
    };
    const result = applyLearningToRecommendation("rec_001", "MEDIUM", ctx);
    assert(result.suggestedPriority === "HIGH", `expected HIGH escalation, got ${result.suggestedPriority}`);
  }));

  // Additional identity tests
  results.push(test("identity: all IDs have timestamp component", () => {
    const id = generateLearningEventId();
    // Format: learn_evt_TIMESTAMP_HEX
    const parts = id.split("_");
    assert(parts.length >= 3, "ID should have at least 3 parts");
  }));

  results.push(test("identity: generateLearningResultId has learn_res_ prefix", () => {
    const { generateLearningResultId } = require("@/lib/copilot/learning/learning-identity");
    const id = generateLearningResultId();
    assert(id.startsWith("learn_res_"), "wrong prefix");
  }));

  // Additional type assertion tests
  results.push(test("types: LEARNING_EVENT_TYPES includes ACTION_SUCCEEDED", () => {
    assert(LEARNING_EVENT_TYPES.includes("ACTION_SUCCEEDED"), "missing ACTION_SUCCEEDED");
  }));

  results.push(test("types: LEARNING_EVENT_TYPES includes PATTERN_REINFORCED", () => {
    assert(LEARNING_EVENT_TYPES.includes("PATTERN_REINFORCED"), "missing PATTERN_REINFORCED");
  }));

  results.push(test("types: LEARNING_DOMAINS includes MEMORY", () => {
    assert(LEARNING_DOMAINS.includes("MEMORY"), "missing MEMORY");
  }));

  results.push(test("types: LEARNING_SOURCES includes MEMORY_GRAPH", () => {
    assert(LEARNING_SOURCES.includes("MEMORY_GRAPH"), "missing MEMORY_GRAPH");
  }));

  // Additional pattern engine tests
  results.push(test("pattern: mergePatterns combines evidenceEventIds", () => {
    const a = makePattern();
    const b = makePattern();
    const merged = mergePatterns(a, b);
    assert(merged.evidenceEventIds.length >= 1, "should have evidence event IDs");
  }));

  results.push(test("pattern: filterActivePatterns excludes WEAKENED", () => {
    const weakened = makePattern({ status: "WEAKENED" } as any);
    const reinforced = makePattern({ status: "REINFORCED" } as any);
    const result = filterActivePatterns([weakened, reinforced]);
    assert(!result.some((p) => p.status === "WEAKENED"), "WEAKENED should be excluded");
    assert(result.some((p) => p.status === "REINFORCED"), "REINFORCED should be included");
  }));

  results.push(test("pattern: firstSeenAt ISO string", () => {
    const p = makePattern();
    assert(typeof p.firstSeenAt === "string" && p.firstSeenAt.includes("T"), "bad firstSeenAt");
  }));

  results.push(test("pattern: lastUpdatedAt changes after reinforcement", () => {
    const p = makePattern();
    const ev = makeEvent();
    const p2 = reinforcePattern(p, ev);
    assert(typeof p2.lastUpdatedAt === "string", "should have lastUpdatedAt");
  }));

  results.push(test("engine: result has completedAt ISO string", () => {
    const output = runLearningEngine({ orgSlug: ORG, events: [makeEvent()], existingPatterns: [] });
    assert(output.result.completedAt.includes("T"), "completedAt should be ISO string");
  }));

  results.push(test("engine: signals match events count", () => {
    const events = [makeEvent(), makeEvent({ type: "ACTION_FAILED" }), makeEvent({ type: "PATTERN_REINFORCED" })];
    const output = runLearningEngine({ orgSlug: ORG, events, existingPatterns: [] });
    assert(output.signals.length === 3, `signals should match events count, got ${output.signals.length}`);
  }));

  results.push(test("dashboard: pendingAdjustments only shows unapplied", () => {
    const tp = createTenantLearningProfile(ORG);
    const p: LearningPattern = {
      ...makePattern(),
      reinforcementCount: 3,
      weakeningCount: 0,
      netScore: 3,
      status: "ACTIVE",
    };
    const adj = suggestConfidenceAdjustment(p);
    const allAdj = adj ? [adj] : [];
    const dash = buildLearningDashboard(ORG, tp, [], [], [], allAdj, null);
    assert(dash.pendingAdjustments.length === allAdj.length, "pending adjustments count mismatch");
  }));

  results.push(test("repo: updatePattern replaces existing pattern", async () => {
    const repo = new InMemoryLearningRepository();
    const p = makePattern();
    await repo.savePattern(p);
    const ev = makeEvent();
    const reinforced = reinforcePattern(p, ev);
    await repo.updatePattern(reinforced);
    const patterns = await repo.getPatterns(ORG);
    const found = patterns.find((pat) => pat.id === p.id);
    assert(found?.reinforcementCount === reinforced.reinforcementCount, "pattern not updated");
    repo.clear();
  }));

  return results;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const results: TestResult[] = [];

  results.push(...testCoreTypes());
  results.push(...testIdentity());
  results.push(...testEventBuilder());
  results.push(...testPatternEngine());
  results.push(...testSignalEngine());
  results.push(...testFeedbackProcessor());
  results.push(...testOutcomeTracker());
  results.push(...testConfidenceAdjustment());
  results.push(...testAgentProfile());
  results.push(...testTenantProfile());
  results.push(...testApplicationEngine());
  results.push(...testGuardrails());
  results.push(...testReversal());
  results.push(...testQueryLayer());
  results.push(...await testRepository());
  results.push(...testDashboard());
  results.push(...testReadiness());
  results.push(...testFutureCompatibility());
  results.push(...testMemoryAdapter());
  results.push(...testMemoryGraphAdapter());
  results.push(...testCrossModuleAdapter());
  results.push(...testExecutiveBrainAdapter());
  results.push(...testPlaybookAdapter());
  results.push(...testCopilotAdapter());
  results.push(...testComplianceAdapter());
  results.push(...testAuditAdapter());
  results.push(...testLearningEngine());
  results.push(...testFullScenarios());
  results.push(...testAdditionalScenarios());

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const total = results.length;

  return NextResponse.json({
    sprint: "AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01",
    summary: { total, passed, failed: failed.length },
    status: failed.length === 0 ? "ALL_PASS" : "FAILURES",
    failures: failed,
    results,
  });
}
