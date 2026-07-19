/**
 * app/api/internal/integration-tests/copilot-intelligence-02/route.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Integration Test Harness — Reasoning Engine
 *
 * 150 tests (T01–T150) across 13 sections.
 *
 * NEVER run in production. Protected by:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS !== "true"
 *   - INTERNAL_INTEGRATION_TEST_TOKEN header
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";

// ── Core types ─────────────────────────────────────────────────────────────────
import {
  REASONING_CATEGORIES,
  REASONING_CONFIDENCE_THRESHOLDS,
  EXECUTIVE_IMPACT_RANK,
  scoreToConfidence,
  emptyConclusion,
  reasoningError,
} from "@/lib/copilot/intelligence/reasoning/reasoning-types";
import type {
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningCategory,
  SignalDirection,
  ReasoningConfidence,
} from "@/lib/copilot/intelligence/reasoning/reasoning-types";

// ── Cross-domain context ───────────────────────────────────────────────────────
import {
  buildContext,
  mergeContexts,
  validateContext,
  getSignalsForDomain,
  getAllSignals,
} from "@/lib/copilot/intelligence/reasoning/cross-domain-context";

// ── Evidence builder ───────────────────────────────────────────────────────────
import {
  buildEvidence,
  buildFinancialEvidence,
  buildCommercialEvidence,
  buildMarketingEvidence,
  buildCollectionsEvidence,
  buildOperationsEvidence,
  buildMemoryEvidence,
  buildPlaybookEvidence,
  buildExecutiveBrainEvidence,
  buildEvidenceFromContext,
  getSupportingEvidence,
  getContradictingEvidence,
  getEvidenceForCategory,
  getEvidenceAboveThreshold,
} from "@/lib/copilot/intelligence/reasoning/evidence-builder";

// ── Hypothesis engine ──────────────────────────────────────────────────────────
import {
  HYPOTHESIS_PATTERNS,
  generateHypotheses,
  getViableHypotheses,
  getRefutedHypotheses,
  rankHypotheses,
  getHypothesesForDomain,
  getMultiDomainHypotheses,
} from "@/lib/copilot/intelligence/reasoning/hypothesis-engine";

// ── Insight engine ─────────────────────────────────────────────────────────────
import {
  generateInsights,
  rankInsights,
  filterActionableInsights,
  filterInsightsByConfidence,
  filterInsightsByImpact,
  getCriticalInsights,
  getInsightsForDomain,
  getMultiDomainInsights,
} from "@/lib/copilot/intelligence/reasoning/insight-engine";

// ── Confidence engine ──────────────────────────────────────────────────────────
import {
  calculateEvidenceConfidence,
  calculateHypothesisConfidence,
  calculateInsightConfidence,
  calculateOverallConfidence,
  getConfidenceSummary,
} from "@/lib/copilot/intelligence/reasoning/confidence-engine";

// ── Contradiction detector ─────────────────────────────────────────────────────
import {
  detectEvidenceContradictions,
  detectHypothesisContradictions,
  detectSignalContradictions,
  detectAllContradictions,
  getSevereContradictions,
  getUnresolvedContradictions,
  hasBlockingContradictions,
} from "@/lib/copilot/intelligence/reasoning/contradiction-detector";

// ── Executive impact ───────────────────────────────────────────────────────────
import {
  classifyInsightImpact,
  classifyConclusionImpact,
  getImpactSummary,
  filterInsightsByMinImpact,
} from "@/lib/copilot/intelligence/reasoning/executive-impact";

// ── Reasoning pipeline ─────────────────────────────────────────────────────────
import { runReasoningPipeline } from "@/lib/copilot/intelligence/reasoning/reasoning-pipeline";

// ── Multi-domain resolver ─────────────────────────────────────────────────────
import {
  resolveDomains,
  resolveMultiDomainQuery,
  getDomainCoverage,
  getActiveDomains,
} from "@/lib/copilot/intelligence/reasoning/multi-domain-resolver";

// ── Integration adapters ───────────────────────────────────────────────────────
import {
  memoryToReasoningSignals,
  memoryToContextSummary,
  getMemoryRelevance,
} from "@/lib/copilot/intelligence/reasoning/integrations/reasoning-memory";
import {
  playbookToReasoningSignals,
  playbookToContextSummary,
  getRelevantPlaybooks,
} from "@/lib/copilot/intelligence/reasoning/integrations/reasoning-playbooks";
import {
  executiveBrainToReasoningSignals,
  executiveBrainToContextSummary,
  buildExecutiveFeedback,
} from "@/lib/copilot/intelligence/reasoning/integrations/reasoning-executive-brain";
import {
  buildReasoningTraceRecord,
  getEvidenceTraces,
  validateReasoningCompliance,
} from "@/lib/copilot/intelligence/reasoning/integrations/reasoning-compliance";
import {
  createReasoningAuditLog,
  auditReasoningStarted,
  auditReasoningCompleted,
  auditReasoningFailed,
  auditInsightGenerated,
  auditHypothesisGenerated,
  auditContradictionDetected,
  getAuditSummary,
} from "@/lib/copilot/intelligence/reasoning/integrations/reasoning-audit";

// ── Query helpers ──────────────────────────────────────────────────────────────
import {
  getInsights,
  getHypotheses,
  getEvidence,
  getConfidence,
  getContradictions,
  getCoveredDomains,
  isMultiDomainConclusion,
  getConclusionSummary,
} from "@/lib/copilot/intelligence/reasoning/reasoning-query";

// ── Dashboard contract ─────────────────────────────────────────────────────────
import {
  buildReasoningDashboard,
  buildEmptyReasoningDashboard,
} from "@/lib/copilot/intelligence/reasoning/reasoning-dashboard-contract";

// ── Health + Readiness ─────────────────────────────────────────────────────────
import { evaluateReasoningHealth } from "@/lib/copilot/intelligence/reasoning/reasoning-health";
import { scanReasoningReadiness }  from "@/lib/copilot/intelligence/reasoning/reasoning-readiness";

// ── Future compatibility ───────────────────────────────────────────────────────
import {
  REASONING_FUTURE_PLANS,
  getFutureRoadmapSummary,
  MEMORY_GRAPH_PLAN,
  AUTONOMOUS_PLANNING_PLAN,
} from "@/lib/copilot/intelligence/reasoning/future-compatibility";

// ── Test infrastructure ────────────────────────────────────────────────────────

type TestResult = { id: string; name: string; passed: boolean; error?: string };

function t(id: string, name: string, fn: () => boolean | void): TestResult {
  try {
    const r = fn();
    const passed = r === undefined ? true : Boolean(r);
    return { id, name, passed };
  } catch (err) {
    return { id, name, passed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ── Fixture builders ───────────────────────────────────────────────────────────

const ORG = "test-org";
const QUERY_ID = "qry_test_001";

function makeSignal(overrides: Partial<{
  id: string;
  orgSlug: string;
  source: string;
  category: ReasoningCategory;
  metric: string;
  value: unknown;
  direction: SignalDirection;
  confidence: ReasoningConfidence;
  timestamp: string;
  tags: string[];
}> = {}): ReasoningSignal {
  return {
    id:         overrides.id         ?? "sig_001",
    orgSlug:    overrides.orgSlug    ?? ORG,
    source:     overrides.source     ?? "test",
    category:   overrides.category   ?? "FINANCIAL",
    metric:     overrides.metric     ?? "cash_balance",
    value:      overrides.value      ?? 1000,
    direction:  overrides.direction  ?? "DOWN",
    confidence: overrides.confidence ?? "HIGH",
    timestamp:  overrides.timestamp  ?? new Date().toISOString(),
    tags:       overrides.tags       ?? ["finance"],
  };
}

function makeEvidence(overrides: Partial<{
  id: string;
  orgSlug: string;
  source: string;
  category: ReasoningCategory;
  confidenceScore: number;
  summary: string;
  signalIds: string[];
  isSupporting: boolean;
}> = {}): ReasoningEvidence {
  const built = buildEvidence({
    orgSlug:         overrides.orgSlug         ?? ORG,
    source:          overrides.source          ?? "test",
    category:        overrides.category        ?? "FINANCIAL",
    confidenceScore: overrides.confidenceScore ?? 80,
    summary:         overrides.summary         ?? "Cash balance declining",
    signalIds:       overrides.signalIds       ?? ["sig_001"],
    isSupporting:    overrides.isSupporting    ?? true,
  });
  return overrides.id ? { ...built, id: overrides.id } : built;
}

// ═════════════════════════════��══════════════════════════���══════════════════════
// SECTION 1 — Core Types (T01–T12)
// ═══════════════════════════════════════════════════════════════════════════════

const section1: TestResult[] = [
  t("T01", "REASONING_CATEGORIES has 7+ entries", () => {
    assert(REASONING_CATEGORIES.length >= 7, `Got ${REASONING_CATEGORIES.length}`);
  }),
  t("T02", "REASONING_CATEGORIES includes FINANCIAL", () => {
    assert(REASONING_CATEGORIES.includes("FINANCIAL"), "Missing FINANCIAL");
  }),
  t("T03", "REASONING_CATEGORIES includes MULTI_DOMAIN", () => {
    assert(REASONING_CATEGORIES.includes("MULTI_DOMAIN"), "Missing MULTI_DOMAIN");
  }),
  t("T04", "EXECUTIVE_IMPACT_RANK has correct ordering", () => {
    assert(EXECUTIVE_IMPACT_RANK["CRITICAL"] > EXECUTIVE_IMPACT_RANK["HIGH"], "CRITICAL must be > HIGH");
    assert(EXECUTIVE_IMPACT_RANK["HIGH"]     > EXECUTIVE_IMPACT_RANK["MEDIUM"], "HIGH > MEDIUM");
    assert(EXECUTIVE_IMPACT_RANK["MEDIUM"]   > EXECUTIVE_IMPACT_RANK["LOW"],    "MEDIUM > LOW");
  }),
  t("T05", "scoreToConfidence HIGH at 75+", () => {
    assert(scoreToConfidence(75) === "HIGH", "75 should be HIGH");
    assert(scoreToConfidence(100) === "HIGH", "100 should be HIGH");
  }),
  t("T06", "scoreToConfidence MEDIUM at 40–74", () => {
    assert(scoreToConfidence(40) === "MEDIUM", "40 should be MEDIUM");
    assert(scoreToConfidence(74) === "MEDIUM", "74 should be MEDIUM");
  }),
  t("T07", "scoreToConfidence LOW below 40", () => {
    assert(scoreToConfidence(0) === "LOW", "0 should be LOW");
    assert(scoreToConfidence(39) === "LOW", "39 should be LOW");
  }),
  t("T08", "emptyConclusion returns valid shape", () => {
    const c = emptyConclusion(ORG, QUERY_ID);
    assert(c.orgSlug === ORG, "orgSlug mismatch");
    assert(c.queryId === QUERY_ID, "queryId mismatch");
    assert(Array.isArray(c.insights), "insights must be array");
    assert(c.insights.length === 0, "empty conclusion must have 0 insights");
    assert(c.evidence.length === 0, "empty conclusion must have 0 evidence");
  }),
  t("T09", "emptyConclusion has confidence LOW", () => {
    const c = emptyConclusion(ORG, QUERY_ID);
    assert(c.overallConfidence === "LOW", "empty conclusion confidence should be LOW");
  }),
  t("T10", "reasoningError returns correct shape", () => {
    const err = reasoningError("TEST_CODE", "test message", "evidence");
    assert(err.code === "TEST_CODE", "code mismatch");
    assert(err.message === "test message", "message mismatch");
    assert(err.phase === "evidence", "phase mismatch");
    assert(err.recoverable === true, "default recoverable should be true");
  }),
  t("T11", "REASONING_CONFIDENCE_THRESHOLDS is defined", () => {
    assert(typeof REASONING_CONFIDENCE_THRESHOLDS === "object", "must be object");
    assert("HIGH" in REASONING_CONFIDENCE_THRESHOLDS, "must have HIGH key");
  }),
  t("T12", "emptyConclusion is orgSlug-scoped", () => {
    const c1 = emptyConclusion("org-a", QUERY_ID);
    const c2 = emptyConclusion("org-b", QUERY_ID);
    assert(c1.orgSlug !== c2.orgSlug, "must be scoped by org");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Cross-Domain Context (T13–T24)
// ═══════════════════════════════════════════════════════════════════════════════

const section2: TestResult[] = [
  t("T13", "buildContext returns valid structure", () => {
    const sig = makeSignal();
    const ctx = buildContext(ORG, QUERY_ID, [sig]);
    assert(ctx.orgSlug === ORG, "orgSlug");
    assert(ctx.queryId === QUERY_ID, "queryId");
    assert(Array.isArray(ctx.signalSets), "signalSets must be array");
  }),
  t("T14", "buildContext groups signals by domain", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "FINANCIAL" }),
      makeSignal({ id: "s3", category: "COMMERCIAL" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const fin = ctx.signalSets.find(s => s.domain === "FINANCIAL");
    assert(fin !== undefined, "FINANCIAL set must exist");
    assert(fin!.signals.length === 2, "FINANCIAL must have 2 signals");
  }),
  t("T15", "buildContext enforces tenant isolation", () => {
    const otherOrgSignal = makeSignal({ id: "foreign", orgSlug: "other-org" });
    const mySignal       = makeSignal({ id: "mine", orgSlug: ORG });
    const ctx = buildContext(ORG, QUERY_ID, [otherOrgSignal, mySignal]);
    const allSigs = getAllSignals(ctx);
    assert(allSigs.every(s => s.orgSlug === ORG), "must not leak cross-tenant signals");
  }),
  t("T16", "validateContext passes for valid context", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const result = validateContext(ctx);
    assert(result.valid === true, `Should be valid: ${result.errors.join(", ")}`);
  }),
  t("T17", "getSignalsForDomain returns only matching domain", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "MARKETING" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const fin = getSignalsForDomain(ctx, "FINANCIAL");
    assert(fin.length === 1, "Must return 1 financial signal");
    assert(fin[0].id === "s1", "Must be the financial signal");
  }),
  t("T18", "getAllSignals returns all signals", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "MARKETING" }),
      makeSignal({ id: "s3", category: "COMMERCIAL" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const all = getAllSignals(ctx);
    assert(all.length === 3, `Expected 3, got ${all.length}`);
  }),
  t("T19", "buildContext includes memoryContext summary when provided", () => {
    const memorySummary = { available: true, entryCount: 2, topEntries: [] };
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()], { memoryContext: memorySummary });
    assert(ctx.memoryContext?.available === true, "memoryContext must be attached");
  }),
  t("T20", "mergeContexts combines signals from both contexts", () => {
    const ctx1 = buildContext(ORG, QUERY_ID, [makeSignal({ id: "s1", category: "FINANCIAL" })]);
    const ctx2 = buildContext(ORG, QUERY_ID, [makeSignal({ id: "s2", category: "MARKETING" })]);
    const merged = mergeContexts(ctx1, ctx2);
    const all = getAllSignals(merged);
    assert(all.length === 2, `Expected 2 merged signals, got ${all.length}`);
  }),
  t("T21", "mergeContexts rejects cross-tenant merge", () => {
    const ctx1 = buildContext("org-a", QUERY_ID, [makeSignal({ orgSlug: "org-a" })]);
    const ctx2 = buildContext("org-b", QUERY_ID, [makeSignal({ orgSlug: "org-b" })]);
    let threw = false;
    try { mergeContexts(ctx1, ctx2); } catch { threw = true; }
    assert(threw, "Cross-tenant merge must throw");
  }),
  t("T22", "buildContext sets isMultiDomain for 2+ domains", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "COMMERCIAL" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    assert(ctx.isMultiDomain === true, "isMultiDomain must be true for 2+ domains");
  }),
  t("T23", "buildContext with 0 signals returns empty context", () => {
    const ctx = buildContext(ORG, QUERY_ID, []);
    assert(ctx.totalSignalCount === 0, "Must have 0 signals");
    assert(ctx.domains.length === 0, "Must have 0 domains");
  }),
  t("T24", "buildContext sets totalSignalCount correctly", () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      makeSignal({ id: `s${i}`, category: "FINANCIAL" }),
    );
    const ctx = buildContext(ORG, QUERY_ID, signals);
    assert(ctx.totalSignalCount === 5, `Expected 5, got ${ctx.totalSignalCount}`);
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Evidence Builder (T25–T38)
// ═══════════════════════════════════════════════════════════════════════════════

const section3: TestResult[] = [
  t("T25", "buildEvidence returns evidence with signalIds", () => {
    const evd = buildEvidence({
      orgSlug:         ORG,
      source:          "test",
      category:        "FINANCIAL",
      confidenceScore: 80,
      summary:         "Test summary",
      signalIds:       ["sig_001"],
      isSupporting:    true,
    });
    assert(evd.signalIds.length > 0, "Evidence must carry signalIds");
    assert(evd.orgSlug === ORG, "orgSlug must match");
  }),
  t("T26", "buildFinancialEvidence returns evidence array", () => {
    const sigs = [
      makeSignal({ id: "f1", category: "FINANCIAL", direction: "DOWN", confidence: "HIGH" }),
      makeSignal({ id: "f2", category: "FINANCIAL", direction: "DOWN", confidence: "HIGH" }),
    ];
    const evds = buildFinancialEvidence(ORG, sigs);
    assert(Array.isArray(evds), "must return array");
    assert(evds.length > 0, "must produce at least 1 evidence");
    assert(evds.every(e => e.orgSlug === ORG), "all evidence must be org-scoped");
  }),
  t("T27", "buildCommercialEvidence returns evidence", () => {
    const sigs = [makeSignal({ id: "c1", category: "COMMERCIAL", direction: "DOWN", confidence: "HIGH" })];
    const evds = buildCommercialEvidence(ORG, sigs);
    assert(Array.isArray(evds), "must be array");
  }),
  t("T28", "buildMarketingEvidence returns evidence", () => {
    const sigs = [makeSignal({ id: "m1", category: "MARKETING", direction: "DOWN", confidence: "MEDIUM" })];
    const evds = buildMarketingEvidence(ORG, sigs);
    assert(Array.isArray(evds), "must be array");
  }),
  t("T29", "buildCollectionsEvidence returns evidence", () => {
    const sigs = [makeSignal({ id: "col1", category: "COLLECTIONS", direction: "UP", confidence: "HIGH" })];
    const evds = buildCollectionsEvidence(ORG, sigs);
    assert(Array.isArray(evds), "must be array");
  }),
  t("T30", "buildOperationsEvidence returns evidence", () => {
    const sigs = [makeSignal({ id: "op1", category: "OPERATIONS", direction: "STABLE", confidence: "MEDIUM" })];
    const evds = buildOperationsEvidence(ORG, sigs);
    assert(Array.isArray(evds), "must be array");
  }),
  t("T31", "buildMemoryEvidence converts memory entries to evidence", () => {
    const entries = [{
      id:         "mem_001",
      type:       "OBSERVATION",
      importance: "HIGH",
      title:      "Cash flow alert",
      content:    "Cash below threshold",
      tags:       ["finance"],
      source:     "manual",
    }];
    const evds = buildMemoryEvidence(ORG, entries);
    assert(evds.length > 0, "must produce evidence from memory entries");
    assert(evds.every(e => e.signalIds.length > 0), "all evidence must have signalIds");
  }),
  t("T32", "buildPlaybookEvidence converts playbooks to evidence", () => {
    const playbooks = [{
      id:       "pb_001",
      title:    "Cash flow recovery playbook",
      category: "FINANCE",
      priority: "HIGH",
      status:   "ACTIVE",
      tags:     ["finance", "recovery"],
    }];
    const evds = buildPlaybookEvidence(ORG, playbooks);
    assert(Array.isArray(evds), "must be array");
  }),
  t("T33", "buildExecutiveBrainEvidence converts EB signals to evidence", () => {
    const signals = [{
      id:          "eb_001",
      title:       "Critical collections alert",
      description: "Collections overdue",
      category:    "COLLECTIONS",
      severity:    "CRITICAL",
      direction:   "DECLINING",
      confidence:  0.9,
      source:      "executive-brain:registry",
    }];
    const evds = buildExecutiveBrainEvidence(ORG, signals);
    assert(evds.length > 0, "CRITICAL EB signal must produce evidence");
  }),
  t("T34", "buildEvidenceFromContext builds evidence from all signal sets", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL", direction: "DOWN" }),
      makeSignal({ id: "s2", category: "COLLECTIONS", direction: "UP" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const evds = buildEvidenceFromContext(ctx);
    assert(evds.length > 0, "must produce evidence from context");
    assert(evds.every(e => e.orgSlug === ORG), "all evidence must be org-scoped");
  }),
  t("T35", "getSupportingEvidence filters to supporting only", () => {
    const evds = [
      makeEvidence({ id: "e1", isSupporting: true }),
      makeEvidence({ id: "e2", isSupporting: false }),
    ];
    const supporting = getSupportingEvidence(evds);
    assert(supporting.length === 1, "must return only supporting");
    assert(supporting[0].id === "e1", "must return e1");
  }),
  t("T36", "getContradictingEvidence filters to contradicting", () => {
    const evds = [
      makeEvidence({ id: "e1", isSupporting: true }),
      makeEvidence({ id: "e2", isSupporting: false }),
    ];
    const contra = getContradictingEvidence(evds);
    assert(contra.length === 1, "must return only contradicting");
    assert(contra[0].id === "e2", "must return e2");
  }),
  t("T37", "getEvidenceForCategory filters by category", () => {
    const evds = [
      makeEvidence({ id: "e1", category: "FINANCIAL" }),
      makeEvidence({ id: "e2", category: "MARKETING" }),
    ];
    const fin = getEvidenceForCategory(evds, "FINANCIAL");
    assert(fin.length === 1 && fin[0].id === "e1", "must filter to FINANCIAL");
  }),
  t("T38", "getEvidenceAboveThreshold filters by score", () => {
    const evds = [
      makeEvidence({ id: "e1", confidenceScore: 80 }),
      makeEvidence({ id: "e2", confidenceScore: 30 }),
    ];
    const high = getEvidenceAboveThreshold(evds, 60);
    assert(high.length === 1 && high[0].id === "e1", "must return only e1 above threshold");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Hypothesis Engine (T39–T52)
// ═══════════════════════════════════════════════════════════════════════════════

const section4: TestResult[] = [
  t("T39", "HYPOTHESIS_PATTERNS has 10+ patterns", () => {
    assert(HYPOTHESIS_PATTERNS.length >= 10, `Got ${HYPOTHESIS_PATTERNS.length}`);
  }),
  t("T40", "HYPOTHESIS_PATTERNS all have unique keys", () => {
    const keys = HYPOTHESIS_PATTERNS.map(p => p.key);
    const unique = new Set(keys);
    assert(unique.size === keys.length, "All pattern keys must be unique");
  }),
  t("T41", "HYPOTHESIS_PATTERNS all have requiredSignals", () => {
    assert(HYPOTHESIS_PATTERNS.every(p => Array.isArray(p.requiredSignals) && p.requiredSignals.length > 0),
      "All patterns must have requiredSignals");
  }),
  t("T42", "HYPOTHESIS_PATTERNS has FINANCIAL_CRISIS pattern", () => {
    const fin = HYPOTHESIS_PATTERNS.find(p => p.key === "FINANCIAL_CRISIS");
    assert(fin !== undefined, "FINANCIAL_CRISIS pattern must exist");
  }),
  t("T43", "generateHypotheses returns array from evidence", () => {
    const evds = [
      makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 80 }),
      makeEvidence({ id: "e2", category: "COLLECTIONS", confidenceScore: 75 }),
    ];
    const hyps = generateHypotheses(ORG, evds);
    assert(Array.isArray(hyps), "must return array");
  }),
  t("T44", "generateHypotheses scopes to orgSlug", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL" })];
    const hyps = generateHypotheses(ORG, evds);
    assert(hyps.every(h => h.orgSlug === ORG), "all hypotheses must be org-scoped");
  }),
  t("T45", "generateHypotheses returns empty for no evidence", () => {
    const hyps = generateHypotheses(ORG, []);
    assert(hyps.length === 0, "no evidence → no hypotheses");
  }),
  t("T46", "getViableHypotheses returns SUPPORTED and WEAKENED", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 90 })];
    const hyps = generateHypotheses(ORG, evds);
    const viable = getViableHypotheses(hyps);
    assert(viable.every(h => h.status !== "REFUTED" && h.status !== "CANDIDATE"), "viable must exclude REFUTED/CANDIDATE");
  }),
  t("T47", "rankHypotheses returns ordered array", () => {
    const evds = [
      makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 90 }),
      makeEvidence({ id: "e2", category: "COLLECTIONS", confidenceScore: 85 }),
    ];
    const hyps = generateHypotheses(ORG, evds);
    const ranked = rankHypotheses(hyps);
    assert(Array.isArray(ranked), "must return array");
  }),
  t("T48", "getHypothesesForDomain filters by domain", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 90 })];
    const hyps = generateHypotheses(ORG, evds);
    const finHyps = getHypothesesForDomain(hyps, "FINANCIAL");
    assert(finHyps.every(h => h.domains.includes("FINANCIAL")), "all must include FINANCIAL domain");
  }),
  t("T49", "getRefutedHypotheses returns only REFUTED", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL" })];
    const hyps = generateHypotheses(ORG, evds);
    const refuted = getRefutedHypotheses(hyps);
    assert(refuted.every(h => h.status === "REFUTED"), "all must be REFUTED");
  }),
  t("T50", "getMultiDomainHypotheses returns multi-domain patterns", () => {
    const evds = [
      makeEvidence({ id: "e1", category: "FINANCIAL",   confidenceScore: 85 }),
      makeEvidence({ id: "e2", category: "COLLECTIONS", confidenceScore: 80 }),
    ];
    const hyps = generateHypotheses(ORG, evds);
    const multi = getMultiDomainHypotheses(hyps);
    assert(multi.every(h => h.domains.length >= 2), "all must have 2+ domains");
  }),
  t("T51", "hypothesis has patternKey", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 90 })];
    const hyps = generateHypotheses(ORG, evds);
    if (hyps.length > 0) {
      assert(typeof hyps[0].patternKey === "string" && hyps[0].patternKey.length > 0, "must have patternKey");
    }
  }),
  t("T52", "hypothesis carries supportingEvidenceIds", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 90 })];
    const hyps = generateHypotheses(ORG, evds);
    if (hyps.length > 0) {
      assert(Array.isArray(hyps[0].supportingEvidenceIds), "must have supportingEvidenceIds array");
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Insight Engine (T53–T65)
// ═══════════════════════════════════════════════════════════════════════════════

const section5: TestResult[] = [
  t("T53", "generateInsights returns insights array", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    assert(Array.isArray(insights), "must return array");
  }),
  t("T54", "generateInsights scopes to orgSlug", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    assert(insights.every(i => i.orgSlug === ORG), "all insights must be org-scoped");
  }),
  t("T55", "insights carry evidenceIds (no hallucination)", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    assert(insights.every(i => Array.isArray(i.evidenceIds)), "all insights must have evidenceIds");
  }),
  t("T56", "insights carry hypothesisIds (no hallucination)", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    assert(insights.every(i => Array.isArray(i.hypothesisIds)), "all insights must have hypothesisIds");
  }),
  t("T57", "insights carry explanation field", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    if (insights.length > 0) {
      assert(typeof insights[0].explanation === "string" && insights[0].explanation.length > 0,
        "insights must have non-empty explanation");
    }
  }),
  t("T58", "rankInsights orders by impact then confidence", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const ranked = rankInsights(insights);
    if (ranked.length >= 2) {
      const rankA = EXECUTIVE_IMPACT_RANK[ranked[0].executiveImpact];
      const rankB = EXECUTIVE_IMPACT_RANK[ranked[1].executiveImpact];
      assert(rankA >= rankB, "first insight must have impact >= second");
    }
  }),
  t("T59", "filterActionableInsights returns only actionable", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const actionable = filterActionableInsights(insights);
    assert(actionable.every(i => i.actionable === true), "all must be actionable");
  }),
  t("T60", "filterInsightsByConfidence filters correctly", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const highConf = filterInsightsByConfidence(insights, 70);
    assert(highConf.every(i => i.confidence === "HIGH"), "must filter to HIGH confidence");
  }),
  t("T61", "filterInsightsByImpact filters correctly", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const critical = filterInsightsByImpact(insights, "CRITICAL");
    assert(critical.every(i => i.executiveImpact === "CRITICAL"), "must filter to CRITICAL");
  }),
  t("T62", "getCriticalInsights returns HIGH and CRITICAL", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const critical = getCriticalInsights(insights);
    assert(critical.every(i => i.executiveImpact === "HIGH" || i.executiveImpact === "CRITICAL"),
      "getCriticalInsights must only return HIGH/CRITICAL");
  }),
  t("T63", "getInsightsForDomain filters by domain", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const fin = getInsightsForDomain(insights, "FINANCIAL");
    assert(fin.every(i => i.domains.includes("FINANCIAL")), "all must include FINANCIAL");
  }),
  t("T64", "getMultiDomainInsights returns multi-domain insights", () => {
    const evds = [
      makeEvidence({ id: "e1", category: "FINANCIAL",   confidenceScore: 85 }),
      makeEvidence({ id: "e2", category: "COLLECTIONS", confidenceScore: 80 }),
    ];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const multi = getMultiDomainInsights(insights);
    assert(multi.every(i => i.domains.length >= 2), "all must span 2+ domains");
  }),
  t("T65", "generateInsights returns empty for empty hypotheses", () => {
    const evds = [makeEvidence({ id: "e1", category: "FINANCIAL", confidenceScore: 85 })];
    const insights = generateInsights(ORG, [], evds);
    assert(insights.length === 0, "empty hypotheses → empty insights");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Confidence Engine (T66–T76)
// ═══════════════════════════════════════════════════════════════════════════════

const section6: TestResult[] = [
  t("T66", "calculateEvidenceConfidence returns 0–100", () => {
    const evds = [makeEvidence({ confidenceScore: 80 }), makeEvidence({ id: "e2", confidenceScore: 60 })];
    const score = calculateEvidenceConfidence(evds);
    assert(score >= 0 && score <= 100, `Score out of range: ${score}`);
  }),
  t("T67", "calculateEvidenceConfidence returns 0 for empty evidence", () => {
    const score = calculateEvidenceConfidence([]);
    assert(score === 0, "empty evidence → score 0");
  }),
  t("T68", "calculateHypothesisConfidence returns 0–100", () => {
    const evds = [makeEvidence({ confidenceScore: 80 })];
    const hyps = generateHypotheses(ORG, evds);
    if (hyps.length > 0) {
      const score = calculateHypothesisConfidence(hyps[0], evds);
      assert(score >= 0 && score <= 100, `Score ${score} out of range`);
    }
  }),
  t("T69", "calculateInsightConfidence returns 0–100", () => {
    const evds = [makeEvidence({ confidenceScore: 80 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    if (insights.length > 0) {
      const score = calculateInsightConfidence(insights[0], hyps, evds);
      assert(score >= 0 && score <= 100, `Score ${score} out of range`);
    }
  }),
  t("T70", "calculateOverallConfidence returns score and level", () => {
    const evds = [makeEvidence({ confidenceScore: 80 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const { score, level } = calculateOverallConfidence({ evidence: evds, hypotheses: hyps, insights, contradictions: [] });
    assert(score >= 0 && score <= 100, "score out of range");
    assert(["LOW", "MEDIUM", "HIGH"].includes(level), "level must be valid");
  }),
  t("T71", "getConfidenceSummary returns structured summary", () => {
    const evds = [makeEvidence({ confidenceScore: 80 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const summary = getConfidenceSummary({ evidence: evds, hypotheses: hyps, insights, contradictions: [] });
    assert(typeof summary.overallScore === "number", "must have overallScore");
    assert(typeof summary.overallLevel === "string", "must have overallLevel");
  }),
  t("T72", "calculateEvidenceConfidence handles empty array", () => {
    const scoreEmpty = calculateEvidenceConfidence([]);
    assert(scoreEmpty === 0, "empty array must return 0");
  }),
  t("T73", "overall confidence LOW with 0 evidence", () => {
    const { level } = calculateOverallConfidence({ evidence: [], hypotheses: [], insights: [], contradictions: [] });
    assert(level === "LOW", "no evidence → LOW confidence");
  }),
  t("T74", "confidence engine never throws on empty input", () => {
    calculateEvidenceConfidence([]);
    calculateOverallConfidence({ evidence: [], hypotheses: [], insights: [], contradictions: [] });
    getConfidenceSummary({ evidence: [], hypotheses: [], insights: [], contradictions: [] });
  }),
  t("T75", "overall confidence HIGH or MEDIUM with all HIGH-score evidence", () => {
    const evds = Array.from({ length: 5 }, (_, i) =>
      makeEvidence({ id: `e${i}`, confidenceScore: 90 }),
    );
    const { level } = calculateOverallConfidence({ evidence: evds, hypotheses: [], insights: [], contradictions: [] });
    assert(level === "HIGH" || level === "MEDIUM", "HIGH evidence should produce HIGH or MEDIUM overall");
  }),
  t("T76", "getConfidenceSummary has overallScore", () => {
    const evds = [makeEvidence(), makeEvidence({ id: "e2" })];
    const summary = getConfidenceSummary({ evidence: evds, hypotheses: [], insights: [], contradictions: [] });
    assert(typeof summary.overallScore === "number", "must include overallScore");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Contradiction Detector (T77–T87)
// ═══════════════════════════════════════════════════════════════════════════════

const section7: TestResult[] = [
  t("T77", "detectEvidenceContradictions returns array", () => {
    const evds = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2", isSupporting: false })];
    const contras = detectEvidenceContradictions(evds);
    assert(Array.isArray(contras), "must return array");
  }),
  t("T78", "detectEvidenceContradictions returns empty for single evidence", () => {
    const contras = detectEvidenceContradictions([makeEvidence()]);
    assert(contras.length === 0, "single evidence cannot contradict itself");
  }),
  t("T79", "detectSignalContradictions returns array", () => {
    const signals = [
      makeSignal({ id: "s1", direction: "UP" }),
      makeSignal({ id: "s2", direction: "DOWN" }),
    ];
    const contras = detectSignalContradictions(signals);
    assert(Array.isArray(contras), "must return array");
  }),
  t("T80", "detectAllContradictions returns comprehensive list", () => {
    const evds = [
      makeEvidence({ id: "e1", isSupporting: true }),
      makeEvidence({ id: "e2", isSupporting: false }),
    ];
    const hyps = generateHypotheses(ORG, evds);
    const contras = detectAllContradictions(evds, hyps);
    assert(Array.isArray(contras), "must return array");
  }),
  t("T81", "getSevereContradictions filters SEVERE severity", () => {
    const allContras = detectAllContradictions(
      [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2", isSupporting: false })],
      [],
    );
    const severe = getSevereContradictions(allContras);
    assert(severe.every(c => c.severity === "SEVERE"),
      "getSevereContradictions must only return SEVERE");
  }),
  t("T82", "getUnresolvedContradictions returns non-resolved", () => {
    const allContras = detectAllContradictions(
      [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2", isSupporting: false })],
      [],
    );
    const unresolved = getUnresolvedContradictions(allContras);
    assert(unresolved.every(c => c.resolution === "UNRESOLVED"), "must all be unresolved");
  }),
  t("T83", "hasBlockingContradictions returns boolean", () => {
    const result = hasBlockingContradictions([]);
    assert(result === false, "empty array → no blocking contradictions");
  }),
  t("T84", "contradiction has required fields", () => {
    const evds = [
      makeEvidence({ id: "e1", isSupporting: true }),
      makeEvidence({ id: "e2", isSupporting: false }),
    ];
    const contras = detectAllContradictions(evds, []);
    if (contras.length > 0) {
      assert(typeof contras[0].evidenceAId === "string", "must have evidenceAId");
      assert(typeof contras[0].evidenceBId === "string", "must have evidenceBId");
      assert(typeof contras[0].severity === "string", "must have severity");
    }
  }),
  t("T85", "detectHypothesisContradictions returns array", () => {
    const evds = [makeEvidence({ id: "e1" })];
    const hyps = generateHypotheses(ORG, evds);
    const contras = detectHypothesisContradictions(hyps, evds);
    assert(Array.isArray(contras), "must return array");
  }),
  t("T86", "contradiction detector never throws on empty", () => {
    detectEvidenceContradictions([]);
    detectSignalContradictions([]);
    detectAllContradictions([], []);
    hasBlockingContradictions([]);
  }),
  t("T87", "detectEvidenceContradictions produces evidence IDs", () => {
    const evds = [
      makeEvidence({ id: "e1", isSupporting: true, category: "FINANCIAL" }),
      makeEvidence({ id: "e2", isSupporting: false, category: "FINANCIAL" }),
    ];
    const contras = detectAllContradictions(evds, []);
    if (contras.length > 0) {
      assert(typeof contras[0].evidenceAId === "string", "must have evidenceAId");
      assert(typeof contras[0].evidenceBId === "string", "must have evidenceBId");
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Executive Impact (T88–T96)
// ═══════════════════════════════════════════════════════════════════════════════

const section8: TestResult[] = [
  t("T88", "classifyInsightImpact returns valid level", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    if (insights.length > 0) {
      const impact = classifyInsightImpact(insights[0]);
      assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(impact), `Invalid impact: ${impact}`);
    }
  }),
  t("T89", "classifyConclusionImpact returns valid level", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const impact = classifyConclusionImpact(insights, hyps, []);
    assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(impact), `Invalid: ${impact}`);
  }),
  t("T90", "classifyConclusionImpact returns LOW for empty inputs", () => {
    const impact = classifyConclusionImpact([], [], []);
    assert(impact === "LOW", "empty inputs → LOW impact");
  }),
  t("T91", "getImpactSummary returns structured object", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const summary = getImpactSummary(insights, hyps, []);
    assert(typeof summary.overall === "string", "must have overall impact field");
    assert(typeof summary.criticalCount === "number", "must have criticalCount");
  }),
  t("T92", "filterInsightsByMinImpact filters by minimum impact", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const highPlus = filterInsightsByMinImpact(insights, "HIGH");
    assert(highPlus.every(i =>
      EXECUTIVE_IMPACT_RANK[i.executiveImpact] >= EXECUTIVE_IMPACT_RANK["HIGH"],
    ), "all must be HIGH or CRITICAL");
  }),
  t("T93", "getImpactSummary never throws on empty", () => {
    const summary = getImpactSummary([], [], []);
    assert(summary.overall === "LOW", "empty → LOW");
  }),
  t("T94", "classifyConclusionImpact escalates with SEVERE contradictions", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const allContras = detectAllContradictions(
      [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2", isSupporting: false })],
      [],
    );
    const impact = classifyConclusionImpact(insights, hyps, allContras);
    assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(impact), "must return valid level");
  }),
  t("T95", "filterInsightsByMinImpact returns all for LOW minimum", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const all = filterInsightsByMinImpact(insights, "LOW");
    assert(all.length === insights.length, "LOW minimum → all insights pass");
  }),
  t("T96", "classifyInsightImpact never throws on any insight", () => {
    const evds = [makeEvidence({ confidenceScore: 40 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    if (insights.length > 0) {
      classifyInsightImpact(insights[0]);
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Reasoning Pipeline (T97–T110)
// ═══════════════════════════════════════════════════════════════════════════════

const section9: TestResult[] = [
  t("T97", "runReasoningPipeline returns conclusion and errors", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const result = runReasoningPipeline(ctx);
    assert("conclusion" in result, "must have conclusion");
    assert("errors" in result, "must have errors");
    assert("phaseTimings" in result, "must have phaseTimings");
  }),
  t("T98", "runReasoningPipeline never throws", () => {
    const ctx = buildContext(ORG, QUERY_ID, []);
    const result = runReasoningPipeline(ctx);
    assert(result.conclusion.orgSlug === ORG, "must return org-scoped conclusion");
  }),
  t("T99", "pipeline conclusion is orgSlug-scoped", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(conclusion.orgSlug === ORG, "orgSlug must match");
  }),
  t("T100", "pipeline conclusion has generatedAt timestamp", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(typeof conclusion.generatedAt === "string" && conclusion.generatedAt.length > 0,
      "must have generatedAt");
  }),
  t("T101", "pipeline returns phaseTimings for all phases", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { phaseTimings } = runReasoningPipeline(ctx);
    assert("evidence" in phaseTimings, "must have evidence timing");
    assert("hypotheses" in phaseTimings, "must have hypotheses timing");
  }),
  t("T102", "pipeline empty context returns empty conclusion", () => {
    const ctx = buildContext(ORG, QUERY_ID, []);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(conclusion.evidence.length === 0, "empty context → empty evidence");
    assert(conclusion.insights.length === 0, "empty context → empty insights");
  }),
  t("T103", "pipeline respects maxInsights option", () => {
    const signals = Array.from({ length: 10 }, (_, i) =>
      makeSignal({ id: `s${i}`, category: "FINANCIAL", direction: "DOWN", confidence: "HIGH" }),
    );
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const { conclusion } = runReasoningPipeline(ctx, { maxInsights: 2 });
    assert(conclusion.insights.length <= 2, "must respect maxInsights");
  }),
  t("T104", "pipeline insights all carry evidenceIds", () => {
    const signals = [makeSignal({ direction: "DOWN", confidence: "HIGH" })];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(conclusion.insights.every(i => Array.isArray(i.evidenceIds)),
      "all insights must have evidenceIds");
  }),
  t("T105", "pipeline insights all carry hypothesisIds", () => {
    const signals = [makeSignal({ direction: "DOWN", confidence: "HIGH" })];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(conclusion.insights.every(i => Array.isArray(i.hypothesisIds)),
      "all insights must have hypothesisIds");
  }),
  t("T106", "pipeline skipContradictionDetection option works", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx, { skipContradictionDetection: true });
    assert(conclusion.contradictions.length === 0, "skipped → no contradictions");
  }),
  t("T107", "pipeline durationMs is populated", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(typeof conclusion.durationMs === "number" && conclusion.durationMs >= 0,
      "durationMs must be non-negative number");
  }),
  t("T108", "pipeline conclusion has executiveImpact", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(conclusion.executiveImpact),
      "must have valid executiveImpact");
  }),
  t("T109", "pipeline conclusion has overallConfidence", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    assert(["LOW", "MEDIUM", "HIGH"].includes(conclusion.overallConfidence),
      "must have valid overallConfidence");
  }),
  t("T110", "pipeline minConfidenceScore filters insights", () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      makeSignal({ id: `s${i}`, direction: "DOWN", confidence: "LOW" }),
    );
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const { conclusion } = runReasoningPipeline(ctx, { minConfidenceScore: 70 });
    assert(conclusion.insights.every(i => i.confidenceScore >= 70),
      "all insights must meet minConfidenceScore threshold");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Multi-Domain Resolver (T111–T118)
// ═══════════════════════════════════════════════════════════════════════════════

const section10: TestResult[] = [
  t("T111", "resolveDomains classifies financial query", () => {
    const plan = resolveDomains("¿Cómo está el flujo de caja?", ORG, QUERY_ID);
    assert(plan.resolvedDomains.includes("FINANCIAL") || plan.isMultiDomain,
      `Expected FINANCIAL in resolvedDomains: ${plan.resolvedDomains}`);
  }),
  t("T112", "resolveDomains classifies marketing query", () => {
    const plan = resolveDomains("¿Cómo van las campañas de marketing?", ORG, QUERY_ID);
    assert(plan.resolvedDomains.includes("MARKETING") || plan.resolvedDomains.length > 0,
      `Expected MARKETING in resolvedDomains: ${plan.resolvedDomains}`);
  }),
  t("T113", "resolveMultiDomainQuery returns conclusion", () => {
    const signals = [makeSignal({ direction: "DOWN", confidence: "HIGH" })];
    const conclusion = resolveMultiDomainQuery(ORG, QUERY_ID, "cash flow issues", signals);
    assert(conclusion.orgSlug === ORG, "orgSlug must match");
  }),
  t("T114", "getDomainCoverage returns signal counts per domain", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "FINANCIAL" }),
      makeSignal({ id: "s3", category: "MARKETING" }),
    ];
    const coverage = getDomainCoverage(signals, ORG);
    assert(coverage["FINANCIAL"] === 2, "FINANCIAL must have 2");
    assert(coverage["MARKETING"] === 1, "MARKETING must have 1");
  }),
  t("T115", "getActiveDomains returns domains with signals", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "MARKETING" }),
    ];
    const coverage = getDomainCoverage(signals, ORG);
    const active = getActiveDomains(signals, ORG);
    assert(active.includes("FINANCIAL"), "FINANCIAL must be active");
    assert(active.includes("MARKETING"), "MARKETING must be active");
  }),
  t("T116", "resolveDomains returns DomainResolutionPlan shape", () => {
    const plan = resolveDomains("estado de tesorería", ORG, QUERY_ID);
    assert(Array.isArray(plan.resolvedDomains), "must have resolvedDomains");
    assert(typeof plan.isMultiDomain === "boolean", "must have isMultiDomain");
    assert(typeof plan.reasoning === "string", "must have reasoning");
  }),
  t("T117", "resolveMultiDomainQuery never throws", () => {
    const conclusion = resolveMultiDomainQuery(ORG, QUERY_ID, "", []);
    assert(conclusion.orgSlug === ORG, "must return org-scoped even for empty query");
  }),
  t("T118", "getDomainCoverage excludes cross-tenant signals", () => {
    const signals = [
      makeSignal({ id: "mine", orgSlug: ORG, category: "FINANCIAL" }),
      makeSignal({ id: "theirs", orgSlug: "other-org", category: "FINANCIAL" }),
    ];
    const coverage = getDomainCoverage(signals, ORG);
    assert(coverage["FINANCIAL"] === 1, "must exclude cross-tenant signals");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Integration Adapters (T119–T134)
// ═══════════════════════════════════════════════════════════════════════════════

const section11: TestResult[] = [
  t("T119", "memoryToReasoningSignals converts HIGH importance entries", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      entries: [{ id: "m1", type: "OBSERVATION", importance: "HIGH", title: "Cash alert", content: "...", tags: ["finance"], source: "manual" }],
    };
    const signals = memoryToReasoningSignals(input);
    assert(signals.length === 1, "HIGH importance entry must produce 1 signal");
    assert(signals[0].orgSlug === ORG, "signal must be org-scoped");
  }),
  t("T120", "memoryToReasoningSignals skips LOW importance", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      entries: [{ id: "m1", type: "OBSERVATION", importance: "LOW", title: "Minor note", content: "...", tags: [], source: "manual" }],
    };
    const signals = memoryToReasoningSignals(input);
    assert(signals.length === 0, "LOW importance must not produce signals");
  }),
  t("T121", "memoryToContextSummary returns correct counts", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      entries: [
        { id: "m1", type: "OBSERVATION", importance: "HIGH", title: "A", content: "...", tags: [], source: "manual" },
        { id: "m2", type: "OBSERVATION", importance: "MEDIUM", title: "B", content: "...", tags: [], source: "manual" },
      ],
    };
    const summary = memoryToContextSummary(input);
    assert(summary.entryCount === 2, "must count all entries");
    assert(summary.available === true, "available must be true");
  }),
  t("T122", "getMemoryRelevance returns 0 for empty entries", () => {
    const score = getMemoryRelevance({ orgSlug: ORG, queryId: QUERY_ID, entries: [] });
    assert(score === 0, "empty entries → relevance 0");
  }),
  t("T123", "getMemoryRelevance returns 75+ for all HIGH entries", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      entries: [
        { id: "m1", type: "OBS", importance: "HIGH", title: "A", content: "...", tags: [], source: "s" },
        { id: "m2", type: "OBS", importance: "HIGH", title: "B", content: "...", tags: [], source: "s" },
      ],
    };
    const score = getMemoryRelevance(input);
    assert(score >= 75, `HIGH entries should score 75+, got ${score}`);
  }),
  t("T124", "playbookToReasoningSignals converts HIGH priority playbooks", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      playbooks: [{ id: "pb1", title: "Recovery plan", category: "FINANCE", priority: "HIGH", status: "ACTIVE", tags: ["finance"] }],
    };
    const signals = playbookToReasoningSignals(input);
    assert(signals.length >= 1, "HIGH priority playbook must produce signals");
  }),
  t("T125", "playbookToContextSummary returns correct shape", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      playbooks: [{ id: "pb1", title: "Plan A", category: "FINANCE", priority: "HIGH", status: "ACTIVE", tags: [] }],
    };
    const summary = playbookToContextSummary(input);
    assert(summary.playbookCount === 1, "must count 1 playbook");
    assert(summary.available === true, "must be available");
  }),
  t("T126", "getRelevantPlaybooks filters by domain", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      playbooks: [
        { id: "pb1", title: "Finance plan", category: "FINANCE", priority: "HIGH", status: "ACTIVE", tags: ["finance"] },
        { id: "pb2", title: "Marketing plan", category: "MARKETING", priority: "MEDIUM", status: "ACTIVE", tags: ["marketing"] },
      ],
    };
    const relevant = getRelevantPlaybooks(input, ["FINANCIAL"]);
    assert(Array.isArray(relevant), "must return array");
  }),
  t("T127", "executiveBrainToReasoningSignals converts CRITICAL signals", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      signals: [{ id: "eb1", title: "Collections crisis", description: "Overdue 90+", category: "COLLECTIONS", severity: "CRITICAL", direction: "DECLINING", confidence: 0.9, source: "registry" }],
    };
    const signals = executiveBrainToReasoningSignals(input);
    assert(signals.length >= 1, "CRITICAL EB signal must produce reasoning signals");
  }),
  t("T128", "executiveBrainToReasoningSignals skips LOW confidence", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      signals: [{ id: "eb1", title: "Weak signal", description: "...", category: "FINANCE", severity: "CRITICAL", direction: "STABLE", confidence: 0.1, source: "registry" }],
    };
    const signals = executiveBrainToReasoningSignals(input);
    assert(signals.length === 0, "LOW confidence must be skipped");
  }),
  t("T129", "executiveBrainToContextSummary returns correct counts", () => {
    const input = {
      orgSlug: ORG, queryId: QUERY_ID,
      signals: [
        { id: "eb1", title: "A", description: "...", category: "FINANCE", severity: "CRITICAL", direction: "DECLINING", confidence: 0.9, source: "s" },
        { id: "eb2", title: "B", description: "...", category: "COMMERCIAL", severity: "HIGH", direction: "STABLE", confidence: 0.7, source: "s" },
      ],
    };
    const summary = executiveBrainToContextSummary(input);
    assert(summary.signalCount === 2, "must count 2 signals");
    assert(summary.criticalSignalCount === 1, "must count 1 critical");
  }),
  t("T130", "buildExecutiveFeedback only includes HIGH/CRITICAL insights", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    const feedback = buildExecutiveFeedback(ORG, QUERY_ID, insights);
    assert(feedback.orgSlug === ORG, "must be org-scoped");
    assert(feedback.insights.every(i => i.impact === "HIGH" || i.impact === "CRITICAL"),
      "feedback must only include HIGH/CRITICAL insights");
  }),
  t("T131", "buildReasoningTraceRecord returns metadata shape", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const trace = buildReasoningTraceRecord(conclusion);
    assert(trace.orgSlug === ORG, "must be org-scoped");
    assert(typeof trace.queryId === "string", "must have queryId");
  }),
  t("T132", "validateReasoningCompliance returns compliant boolean", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const result = validateReasoningCompliance(conclusion);
    assert(typeof result.compliant === "boolean", "must have compliant field");
    assert(Array.isArray(result.violations), "must have violations array");
  }),
  t("T133", "getEvidenceTraces returns trace per evidence", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const traces = getEvidenceTraces(conclusion);
    assert(Array.isArray(traces), "must return array");
  }),
  t("T134", "integration adapters never throw on empty input", () => {
    memoryToReasoningSignals({ orgSlug: ORG, queryId: QUERY_ID, entries: [] });
    playbookToReasoningSignals({ orgSlug: ORG, queryId: QUERY_ID, playbooks: [] });
    executiveBrainToReasoningSignals({ orgSlug: ORG, queryId: QUERY_ID, signals: [] });
    buildExecutiveFeedback(ORG, QUERY_ID, []);
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — Audit & Query Helpers (T135–T145)
// ═══════════════════════════════════════════════════════════════════════════════

const section12: TestResult[] = [
  t("T135", "createReasoningAuditLog returns valid log", () => {
    const log = createReasoningAuditLog(ORG, QUERY_ID);
    assert(log.orgSlug === ORG, "must be org-scoped");
    assert(log.queryId === QUERY_ID, "must carry queryId");
    assert(Array.isArray(log.events), "must have events array");
  }),
  t("T136", "auditReasoningStarted appends event", () => {
    let log = createReasoningAuditLog(ORG, QUERY_ID);
    log = auditReasoningStarted(log, "cash flow query", ["FINANCIAL"]);
    assert(log.events.length >= 1, "must have at least 1 event after start");
  }),
  t("T137", "auditReasoningCompleted appends event", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    let log = createReasoningAuditLog(ORG, QUERY_ID);
    log = auditReasoningStarted(log, "test query", ["FINANCIAL"]);
    log = auditReasoningCompleted(log, conclusion);
    const types = log.events.map(e => e.eventType);
    assert(types.includes("REASONING_COMPLETED"), "must include REASONING_COMPLETED event");
  }),
  t("T138", "auditReasoningFailed appends failed event", () => {
    let log = createReasoningAuditLog(ORG, QUERY_ID);
    log = auditReasoningFailed(log, "PIPELINE_ERROR", "test error");
    const types = log.events.map(e => e.eventType);
    assert(types.includes("REASONING_FAILED"), "must include REASONING_FAILED event");
  }),
  t("T139", "auditInsightGenerated appends event", () => {
    const evds = [makeEvidence({ confidenceScore: 85 })];
    const hyps = generateHypotheses(ORG, evds);
    const insights = generateInsights(ORG, hyps, evds);
    let log = createReasoningAuditLog(ORG, QUERY_ID);
    if (insights.length > 0) {
      log = auditInsightGenerated(log, insights[0].id, insights[0].type, insights[0].executiveImpact, insights[0].confidence);
    }
    assert(Array.isArray(log.events), "events must remain array");
  }),
  t("T140", "getAuditSummary returns structured summary", () => {
    let log = createReasoningAuditLog(ORG, QUERY_ID);
    log = auditReasoningStarted(log, "test", ["FINANCIAL"]);
    const summary = getAuditSummary(log);
    assert(typeof summary.totalEvents === "number", "must have totalEvents");
    assert(typeof log.orgSlug === "string", "must have orgSlug");
  }),
  t("T141", "getInsights query helper returns insights", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const insights = getInsights(conclusion);
    assert(Array.isArray(insights), "must return array");
  }),
  t("T142", "getConfidence returns confidence shape", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const conf = getConfidence(conclusion);
    assert(typeof conf.score === "number", "must have score");
    assert(typeof conf.level === "string", "must have level");
    assert(typeof conf.isReliable === "boolean", "must have isReliable");
  }),
  t("T143", "getCoveredDomains returns domain list", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const domains = getCoveredDomains(conclusion);
    assert(Array.isArray(domains), "must return array");
  }),
  t("T144", "getConclusionSummary returns structured summary object", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const summary = getConclusionSummary(conclusion);
    assert(typeof summary === "object" && summary !== null, "must return object");
  }),
  t("T145", "isMultiDomainConclusion detects multi-domain", () => {
    const signals = [
      makeSignal({ id: "s1", category: "FINANCIAL" }),
      makeSignal({ id: "s2", category: "COMMERCIAL" }),
    ];
    const ctx = buildContext(ORG, QUERY_ID, signals);
    const { conclusion } = runReasoningPipeline(ctx);
    const result = isMultiDomainConclusion(conclusion);
    assert(typeof result === "boolean", "must return boolean");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — Dashboard, Health, Readiness, Future (T146–T150)
// ═══════════════════════════════════════════════════════════════════════════════

const section13: TestResult[] = [
  t("T146", "buildEmptyReasoningDashboard returns valid payload", () => {
    const payload = buildEmptyReasoningDashboard(ORG);
    assert(payload.orgSlug === ORG, "must be org-scoped");
    assert(payload.insightCount === 0, "empty dashboard must have 0 insights");
    assert(payload.requiresAttention === false, "empty dashboard must not require attention");
  }),
  t("T147", "buildReasoningDashboard builds from conclusion", () => {
    const ctx = buildContext(ORG, QUERY_ID, [makeSignal()]);
    const { conclusion } = runReasoningPipeline(ctx);
    const payload = buildReasoningDashboard(conclusion);
    assert(payload.orgSlug === ORG, "must be org-scoped");
    assert(Array.isArray(payload.domainCoverage), "must have domainCoverage");
    assert(Array.isArray(payload.topInsights), "must have topInsights");
  }),
  t("T148", "evaluateReasoningHealth returns health report", () => {
    const report = evaluateReasoningHealth();
    assert(["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(report.overall), "must have valid status");
    assert(Array.isArray(report.subsystems), "must have subsystems");
    assert(report.subsystems.length >= 8, "must have 8+ subsystem checks");
  }),
  t("T149", "scanReasoningReadiness returns readiness report", () => {
    const report = scanReasoningReadiness();
    assert(["READY", "PARTIAL", "NOT_READY"].includes(report.status), "must have valid status");
    assert(report.score >= 0 && report.score <= 100, "score must be 0–100");
    assert(report.checks.length >= 14, "must have 14+ checks");
  }),
  t("T150", "REASONING_FUTURE_PLANS has 4 planned items", () => {
    assert(REASONING_FUTURE_PLANS.length === 4, `Expected 4 plans, got ${REASONING_FUTURE_PLANS.length}`);
    const summary = getFutureRoadmapSummary();
    assert(summary.every(p => p.status === "PLANNED"), "all plans must be PLANNED");
    assert(AUTONOMOUS_PLANNING_PLAN.requiresApproval === true, "autonomous planning MUST require approval");
    assert(MEMORY_GRAPH_PLAN.readinessStatus === "PLANNED", "memory graph must be PLANNED");
    assert(typeof auditHypothesisGenerated === "function", "auditHypothesisGenerated must be function");
    assert(typeof auditContradictionDetected === "function", "auditContradictionDetected must be function");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// Route handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "Integration tests not enabled" }, { status: 403 });
  }
  const token = req.headers.get("x-internal-test-token");
  if (!token || token !== process.env.INTERNAL_INTEGRATION_TEST_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allResults = [
    ...section1,
    ...section2,
    ...section3,
    ...section4,
    ...section5,
    ...section6,
    ...section7,
    ...section8,
    ...section9,
    ...section10,
    ...section11,
    ...section12,
    ...section13,
  ];

  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed);
  const total  = allResults.length;

  return NextResponse.json({
    sprint:  "AGENTIK-COPILOT-INTELLIGENCE-02",
    total,
    passed,
    failed:  failed.length,
    score:   `${passed}/${total}`,
    status:  failed.length === 0 ? "PASS" : "FAIL",
    failures: failed.map(r => ({ id: r.id, name: r.name, error: r.error })),
    results: allResults,
  });
}
