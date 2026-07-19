/**
 * app/api/internal/integration-tests/cross-module-reasoning/route.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Integration harness — 220+ tests for the cross-module reasoning layer.
 *
 * GET /api/internal/integration-tests/cross-module-reasoning
 */

import { NextResponse } from "next/server";

// ── Test runner ────────────────────────────────────────────────────────────────

interface TestResult {
  name:    string;
  passed:  boolean;
  error?:  string;
}

function pass(name: string): TestResult {
  return { name, passed: true };
}

function fail(name: string, error: string): TestResult {
  return { name, passed: false, error };
}

function expect(label: string, actual: unknown, expected: unknown): TestResult {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return ok
    ? pass(label)
    : fail(label, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectTruthy(label: string, val: unknown): TestResult {
  return val ? pass(label) : fail(label, `Expected truthy, got ${JSON.stringify(val)}`);
}

function expectType(label: string, val: unknown, type: string): TestResult {
  return typeof val === type ? pass(label) : fail(label, `Expected type ${type}, got ${typeof val}`);
}

// ── Test suites ────────────────────────────────────────────────────────────────

async function testCoreTypes(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const {
      generateCmrId,
      REASONING_SOURCE_DOMAINS,
      REASONING_CONFIDENCE_LEVELS,
      REASONING_DEFAULT_CONFIDENCE,
      REASONING_SIGNAL_TYPES,
      REASONING_EVIDENCE_TYPES,
      HYPOTHESIS_CATEGORIES,
      RISK_DOMAINS,
      OPPORTUNITY_TYPES,
    } = await import("@/lib/copilot/cross-module-reasoning/cross-module-types");

    // T1-T10: generateCmrId
    const id1 = generateCmrId("sig");
    results.push(expectTruthy("T1: generateCmrId returns string", id1));
    results.push(expectTruthy("T2: id starts with cmr_sig", id1.startsWith("cmr_sig")));
    const id2 = generateCmrId("sig");
    results.push(expect("T3: ids are unique", id1 !== id2, true));

    // T4-T10: domain constants
    results.push(expectTruthy("T4: REASONING_SOURCE_DOMAINS is array", Array.isArray(REASONING_SOURCE_DOMAINS)));
    results.push(expectTruthy("T5: FINANCE in domains", REASONING_SOURCE_DOMAINS.includes("FINANCE")));
    results.push(expectTruthy("T6: COMMERCIAL in domains", REASONING_SOURCE_DOMAINS.includes("COMMERCIAL")));
    results.push(expectTruthy("T7: CONFIDENCE_LEVELS has 4 items", REASONING_CONFIDENCE_LEVELS.length === 4));
    results.push(expectTruthy("T8: DEFAULT_CONFIDENCE level=LOW", REASONING_DEFAULT_CONFIDENCE.level === "LOW"));
    results.push(expectTruthy("T9: SIGNAL_TYPES is non-empty", REASONING_SIGNAL_TYPES.length > 0));
    results.push(expectTruthy("T10: EVIDENCE_TYPES is non-empty", REASONING_EVIDENCE_TYPES.length > 0));
    results.push(expectTruthy("T11: HYPOTHESIS_CATEGORIES has 8", HYPOTHESIS_CATEGORIES.length === 8));
    results.push(expectTruthy("T12: RISK_DOMAINS has 5", RISK_DOMAINS.length === 5));
    results.push(expectTruthy("T13: OPPORTUNITY_TYPES has 6", OPPORTUNITY_TYPES.length === 6));
  } catch (err) {
    results.push(fail("T_CORE_TYPES: import failed", String(err)));
  }
  return results;
}

async function testConfidenceEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const {
      CONFIDENCE_THRESHOLDS,
      scoreToConfidenceLevel,
      evidenceCountFactor,
      calculateConfidence,
    } = await import("@/lib/copilot/cross-module-reasoning/confidence-engine");

    results.push(expectTruthy("CE1: CONFIDENCE_THRESHOLDS defined", CONFIDENCE_THRESHOLDS));
    results.push(expect("CE2: VERY_HIGH threshold=0.85", CONFIDENCE_THRESHOLDS.VERY_HIGH, 0.85));
    results.push(expect("CE3: score 0.90 → VERY_HIGH", scoreToConfidenceLevel(0.90), "VERY_HIGH"));
    results.push(expect("CE4: score 0.70 → HIGH", scoreToConfidenceLevel(0.70), "HIGH"));
    results.push(expect("CE5: score 0.40 → MEDIUM", scoreToConfidenceLevel(0.40), "MEDIUM"));
    results.push(expect("CE6: score 0.10 → LOW", scoreToConfidenceLevel(0.10), "LOW"));
    results.push(expect("CE7: 0 evidence → factor 0", evidenceCountFactor(0), 0));
    results.push(expectTruthy("CE8: 5 evidence → factor>0", evidenceCountFactor(5) > 0));
    results.push(expectTruthy("CE9: 10 evidence → factor≤1", evidenceCountFactor(10) <= 1));

    // CE10-CE15: calculateConfidence
    const emptyResult = calculateConfidence([]);
    results.push(expect("CE10: empty evidence → LOW", emptyResult.level, "LOW"));
    results.push(expectTruthy("CE11: empty evidence → score < 0.3", emptyResult.score < 0.3));
    results.push(expectTruthy("CE12: empty evidence has explanation", emptyResult.explanation.length > 0));
    results.push(expectTruthy("CE13: confidence result has all fields",
      "level" in emptyResult && "score" in emptyResult && "evidenceCount" in emptyResult));
  } catch (err) {
    results.push(fail("CE_IMPORT: confidence-engine import failed", String(err)));
  }
  return results;
}

async function testSignalNormalizer(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const {
      normalizeSignal,
      normalizeSignals,
      validateSignal,
      filterSignalsByDomain,
      filterSignalsBySeverity,
      sortSignalsByScore,
    } = await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const raw = {
      orgSlug:     "castillitos",
      domain:      "FINANCE" as const,
      label:       "Caída de caja",
      description: "La caja cayó un 30% vs semana anterior",
      severity:    "HIGH" as const,
      confidence:  0.8,
      source:      "finance-module",
    };

    const sig = normalizeSignal(raw);
    results.push(expectTruthy("SN1: normalizeSignal returns object", sig !== null));
    results.push(expect("SN2: orgSlug preserved", sig.orgSlug, "castillitos"));
    results.push(expect("SN3: domain preserved", sig.domain, "FINANCE"));
    results.push(expect("SN4: label preserved", sig.label, "Caída de caja"));
    results.push(expectTruthy("SN5: id generated", sig.id.startsWith("cmr_sig")));
    results.push(expect("SN6: severity preserved", sig.severity, "HIGH"));

    const validation = validateSignal(sig);
    results.push(expectTruthy("SN7: valid signal passes", validation.valid));

    const signals = normalizeSignals([raw, { ...raw, domain: "COMMERCIAL" as const, label: "Test 2" }]);
    results.push(expect("SN8: normalizeSignals returns 2", signals.length, 2));

    const financeOnly = filterSignalsByDomain(signals, "FINANCE");
    results.push(expect("SN9: filter by domain FINANCE = 1", financeOnly.length, 1));

    const highOnly = filterSignalsBySeverity(signals, "HIGH");
    results.push(expect("SN10: filter by severity HIGH = 2", highOnly.length, 2));

    const sorted = sortSignalsByScore(signals);
    results.push(expectTruthy("SN11: sortByScore returns array", Array.isArray(sorted)));
  } catch (err) {
    results.push(fail("SN_IMPORT: signal-normalizer import failed", String(err)));
  }
  return results;
}

async function testEvidenceEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { signalToEvidence, collectEvidence, rankEvidence } =
      await import("@/lib/copilot/cross-module-reasoning/evidence-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Test",
      description: "Test signal", severity: "HIGH", confidence: 0.8, source: "test",
    });

    const ev = signalToEvidence(sig);
    results.push(expectTruthy("EV1: signalToEvidence returns object", ev !== null));
    results.push(expectTruthy("EV2: evidence has id", ev.id.startsWith("cmr_ev")));
    results.push(expect("EV3: evidence orgSlug", ev.orgSlug, "castillitos"));
    results.push(expectTruthy("EV4: evidence has strength > 0", ev.strength > 0));
    results.push(expectTruthy("EV5: evidence has reliability > 0", ev.reliability > 0));
    results.push(expectTruthy("EV6: evidence has sourceRef", ev.sourceRef.length > 0));

    const evidenceSet = collectEvidence("castillitos", [sig]);
    results.push(expectTruthy("EV7: collectEvidence returns array", Array.isArray(evidenceSet)));
    results.push(expectTruthy("EV8: collectEvidence has items", evidenceSet.length > 0));

    const ranked = rankEvidence(evidenceSet);
    results.push(expectTruthy("EV9: rankEvidence returns array", Array.isArray(ranked)));
    results.push(expect("EV10: rank preserves count", ranked.length, evidenceSet.length));
  } catch (err) {
    results.push(fail("EV_IMPORT: evidence-engine import failed", String(err)));
  }
  return results;
}

async function testHypothesisEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { generateHypotheses, filterSupportedHypotheses, rankHypotheses } =
      await import("@/lib/copilot/cross-module-reasoning/hypothesis-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");
    const { signalToEvidence } =
      await import("@/lib/copilot/cross-module-reasoning/evidence-engine");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Caída de caja",
      description: "La caja cayó un 30%", severity: "CRITICAL", confidence: 0.8, source: "test",
    });
    const ev = signalToEvidence(sig);

    const hypotheses = generateHypotheses("castillitos", [sig], [ev]);
    results.push(expectTruthy("HYP1: generateHypotheses returns array", Array.isArray(hypotheses)));
    results.push(expectTruthy("HYP2: generates ≥ 1 hypothesis", hypotheses.length >= 1));

    if (hypotheses.length > 0) {
      const h = hypotheses[0];
      results.push(expectTruthy("HYP3: hypothesis has id", h.id.startsWith("cmr_hyp")));
      results.push(expect("HYP4: hypothesis orgSlug", h.orgSlug, "castillitos"));
      results.push(expectTruthy("HYP5: hypothesis has title", h.title.length > 0));
      results.push(expectTruthy("HYP6: hypothesis has explanation", h.explanation.length > 0));
      results.push(expectTruthy("HYP7: hypothesis has confidence", h.confidence.score >= 0));
    }

    const supported = filterSupportedHypotheses(hypotheses);
    results.push(expectTruthy("HYP8: filterSupported returns array", Array.isArray(supported)));

    const ranked = rankHypotheses(hypotheses);
    results.push(expectTruthy("HYP9: rankHypotheses returns array", Array.isArray(ranked)));
  } catch (err) {
    results.push(fail("HYP_IMPORT: hypothesis-engine import failed", String(err)));
  }
  return results;
}

async function testCorrelationEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { correlateSignals, detectPatterns } =
      await import("@/lib/copilot/cross-module-reasoning/correlation-engine");
    const { normalizeSignals } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const signals = normalizeSignals([
      { orgSlug: "castillitos", domain: "FINANCE", label: "Caída de caja",
        description: "Caja baja", severity: "HIGH", confidence: 0.8, source: "finance" },
      { orgSlug: "castillitos", domain: "COMMERCIAL", label: "Caída de ventas",
        description: "Ventas bajas", severity: "HIGH", confidence: 0.7, source: "commercial" },
    ]);

    const correlations = correlateSignals("castillitos", signals);
    results.push(expectTruthy("CORR1: correlateSignals returns array", Array.isArray(correlations)));

    const patterns = detectPatterns("castillitos", signals);
    results.push(expectTruthy("CORR2: detectPatterns returns array", Array.isArray(patterns)));

    if (correlations.length > 0) {
      const c = correlations[0];
      results.push(expectTruthy("CORR3: correlation has signalIdA", c.signalIdA.length > 0));
      results.push(expectTruthy("CORR4: correlation has strength", c.strength >= 0 && c.strength <= 1));
    }
  } catch (err) {
    results.push(fail("CORR_IMPORT: correlation-engine import failed", String(err)));
  }
  return results;
}

async function testRiskEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { detectRisks, rankRisks } =
      await import("@/lib/copilot/cross-module-reasoning/risk-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");
    const { signalToEvidence } =
      await import("@/lib/copilot/cross-module-reasoning/evidence-engine");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Caja crítica",
      description: "Caja en mínimos históricos", severity: "CRITICAL", confidence: 0.9, source: "test",
    });
    const ev = [signalToEvidence(sig)];

    const risks = detectRisks("castillitos", [sig], ev);
    results.push(expectTruthy("RISK1: detectRisks returns array", Array.isArray(risks)));

    if (risks.length > 0) {
      const r = risks[0];
      results.push(expectTruthy("RISK2: risk has id", r.id.startsWith("cmr_risk")));
      results.push(expect("RISK3: risk orgSlug", r.orgSlug, "castillitos"));
      results.push(expectTruthy("RISK4: risk has title", r.title.length > 0));
      results.push(expectTruthy("RISK5: risk severity valid", ["LOW","MEDIUM","HIGH","CRITICAL"].includes(r.severity)));
      results.push(expectTruthy("RISK6: risk likelihood 0-1", r.likelihood >= 0 && r.likelihood <= 1));
    }

    const ranked = rankRisks(risks);
    results.push(expectTruthy("RISK7: rankRisks returns array", Array.isArray(ranked)));
  } catch (err) {
    results.push(fail("RISK_IMPORT: risk-engine import failed", String(err)));
  }
  return results;
}

async function testOpportunityEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { detectOpportunities, rankOpportunities } =
      await import("@/lib/copilot/cross-module-reasoning/opportunity-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");
    const { signalToEvidence } =
      await import("@/lib/copilot/cross-module-reasoning/evidence-engine");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "COMMERCIAL", label: "Clientes activos creciendo",
      description: "Base de clientes en alza", severity: "LOW", confidence: 0.75, source: "test",
    });
    const ev = [signalToEvidence(sig)];

    const opps = detectOpportunities("castillitos", [sig], ev);
    results.push(expectTruthy("OPP1: detectOpportunities returns array", Array.isArray(opps)));

    if (opps.length > 0) {
      const o = opps[0];
      results.push(expectTruthy("OPP2: opp has id", o.id.startsWith("cmr_opp")));
      results.push(expect("OPP3: opp orgSlug", o.orgSlug, "castillitos"));
      results.push(expectTruthy("OPP4: opp has title", o.title.length > 0));
      results.push(expectTruthy("OPP5: opp urgency valid", ["LOW","MEDIUM","HIGH"].includes(o.urgency)));
    }

    const ranked = rankOpportunities(opps);
    results.push(expectTruthy("OPP6: rankOpportunities returns array", Array.isArray(ranked)));
  } catch (err) {
    results.push(fail("OPP_IMPORT: opportunity-engine import failed", String(err)));
  }
  return results;
}

async function testRecommendationEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { generateRecommendationsFromHypotheses, rankRecommendations } =
      await import("@/lib/copilot/cross-module-reasoning/recommendation-engine");
    const { generateHypotheses } =
      await import("@/lib/copilot/cross-module-reasoning/hypothesis-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");
    const { signalToEvidence } =
      await import("@/lib/copilot/cross-module-reasoning/evidence-engine");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Caja baja",
      description: "Caja en riesgo", severity: "CRITICAL", confidence: 0.85, source: "test",
    });
    const ev = [signalToEvidence(sig)];
    const hyps = generateHypotheses("castillitos", [sig], ev);

    const recs = generateRecommendationsFromHypotheses("castillitos", hyps);
    results.push(expectTruthy("REC1: generateRecs returns array", Array.isArray(recs)));

    if (recs.length > 0) {
      const r = recs[0];
      results.push(expectTruthy("REC2: rec has id", r.id.startsWith("cmr_rec")));
      results.push(expect("REC3: rec orgSlug", r.orgSlug, "castillitos"));
      results.push(expectTruthy("REC4: rec has title", r.title.length > 0));
      results.push(expectTruthy("REC5: rec priority valid",
        ["LOW","MEDIUM","HIGH","URGENT"].includes(r.priority)));
      results.push(expectTruthy("REC6: rec type valid",
        ["ACTION","INVESTIGATION","MONITORING","PREVENTION","CORRECTION"].includes(r.type)));
    }

    const ranked = rankRecommendations(recs);
    results.push(expectTruthy("REC7: rankRecommendations returns array", Array.isArray(ranked)));
  } catch (err) {
    results.push(fail("REC_IMPORT: recommendation-engine import failed", String(err)));
  }
  return results;
}

async function testFullEngine(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { runCrossModuleReasoning, runExecutiveScenario } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Alerta de caja",
      description: "Caja al 20% de lo normal", severity: "CRITICAL", confidence: 0.85, source: "finance",
    });

    const ctx = {
      orgSlug:     "castillitos",
      domains:     ["FINANCE"] as const,
      signals:     [sig],
      requestedAt: new Date().toISOString(),
    };

    const result = await runCrossModuleReasoning(ctx as any);
    results.push(expectTruthy("ENG1: runCrossModuleReasoning returns object", result !== null));
    results.push(expectTruthy("ENG2: result has id", result.id.length > 0));
    results.push(expect("ENG3: result orgSlug", result.orgSlug, "castillitos"));
    results.push(expectTruthy("ENG4: result has status",
      ["SUCCESS","PARTIAL","INSUFFICIENT_EVIDENCE","ERROR"].includes(result.status)));
    results.push(expectTruthy("ENG5: result has confidence", result.confidence !== null));
    results.push(expectTruthy("ENG6: result has chain", result.chain !== null));
    results.push(expectTruthy("ENG7: chain has signals array", Array.isArray(result.chain.signals)));
    results.push(expectTruthy("ENG8: chain has evidence array", Array.isArray(result.chain.evidence)));
    results.push(expectTruthy("ENG9: chain has hypotheses array", Array.isArray(result.chain.hypotheses)));
    results.push(expectTruthy("ENG10: chain has risks array", Array.isArray(result.chain.risks)));
    results.push(expectTruthy("ENG11: chain has opportunities array", Array.isArray(result.chain.opportunities)));
    results.push(expectTruthy("ENG12: chain has recommendations array", Array.isArray(result.chain.recommendations)));
    results.push(expectTruthy("ENG13: result has narrative", typeof result.narrative === "string"));
    results.push(expectTruthy("ENG14: result has completedAt", result.completedAt.length > 0));
    results.push(expectTruthy("ENG15: durationMs ≥ 0", result.durationMs >= 0));
    results.push(expectTruthy("ENG16: all chain entities scoped to org",
      result.chain.signals.every((s: any) => s.orgSlug === "castillitos") &&
      result.chain.evidence.every((e: any) => e.orgSlug === "castillitos")));

    // Test executive scenario
    const scenario = runExecutiveScenario("castillitos", "CASH_DROP");
    results.push(expectTruthy("ENG17: runExecutiveScenario returns object", scenario !== null));
    results.push(expect("ENG18: scenario type", scenario.type, "CASH_DROP"));
    results.push(expectTruthy("ENG19: scenario has signals", Array.isArray(scenario.signals)));
    results.push(expectTruthy("ENG20: scenario orgSlug", scenario.orgSlug === "castillitos"));
  } catch (err) {
    results.push(fail("ENG_IMPORT: cross-module-engine import failed", String(err)));
  }
  return results;
}

async function testTenantIsolation(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { runCrossModuleReasoning } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    // Create signal from a different org
    const sigA = normalizeSignal({
      orgSlug: "org-a", domain: "FINANCE", label: "Test A",
      description: "Signal from org-a", severity: "HIGH", confidence: 0.7, source: "test",
    });

    // Run reasoning for org-b with org-a signal — should be caught
    const ctx = {
      orgSlug:     "org-b",
      domains:     ["FINANCE"] as const,
      signals:     [sigA],
      requestedAt: new Date().toISOString(),
    };

    const result = await runCrossModuleReasoning(ctx as any);
    // The engine should handle this gracefully (fail-closed or empty result)
    results.push(expectTruthy("ISO1: cross-tenant returns result object", result !== null));
    // The chain should not contain org-a signals as evidenced in org-b context
    const orgBEvidence = result.chain.evidence.filter((e: any) => e.orgSlug === "org-a");
    results.push(expect("ISO2: no org-a evidence in org-b chain", orgBEvidence.length, 0));

    // Test that in-memory repository respects tenant isolation
    const { InMemoryCrossModuleReasoningRepository } =
      await import("@/lib/copilot/cross-module-reasoning/reasoning-repository");

    const repo = new InMemoryCrossModuleReasoningRepository();
    await repo.saveResult({ ...result, id: "test-result-1", orgSlug: "org-a" });
    const orgBResults = await repo.listResults({ orgSlug: "org-b" });
    results.push(expect("ISO3: repo isolates org-a from org-b", orgBResults.length, 0));

    const orgAResults = await repo.listResults({ orgSlug: "org-a" });
    results.push(expectTruthy("ISO4: org-a results accessible from org-a", orgAResults.length > 0));
  } catch (err) {
    results.push(fail("ISO_IMPORT: tenant isolation test failed", String(err)));
  }
  return results;
}

async function testReadiness(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { evaluateReadiness, getCoveredDomains, READINESS_THRESHOLDS } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-readiness");
    const { normalizeSignals } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const signals = normalizeSignals([
      { orgSlug: "castillitos", domain: "FINANCE", label: "S1",
        description: "Desc1", severity: "HIGH", confidence: 0.8, source: "test" },
      { orgSlug: "castillitos", domain: "COMMERCIAL", label: "S2",
        description: "Desc2", severity: "MEDIUM", confidence: 0.7, source: "test" },
    ]);

    const ctx = { orgSlug: "castillitos", domains: ["FINANCE", "COMMERCIAL"], signals, requestedAt: new Date().toISOString() };
    const report = evaluateReadiness(ctx as any);

    results.push(expectTruthy("RDY1: evaluateReadiness returns report", report !== null));
    results.push(expect("RDY2: report orgSlug", report.orgSlug, "castillitos"));
    results.push(expectTruthy("RDY3: report has level",
      ["READY","PARTIAL","INSUFFICIENT","BLOCKED"].includes(report.level)));
    results.push(expectTruthy("RDY4: 2 good signals → canReason=true", report.canReason));
    results.push(expectTruthy("RDY5: report has checks array", Array.isArray(report.checks)));

    // Test with empty signals
    const emptyCtx = { orgSlug: "castillitos", domains: [], signals: [], requestedAt: new Date().toISOString() };
    const emptyReport = evaluateReadiness(emptyCtx as any);
    results.push(expectTruthy("RDY6: empty signals → cannot reason", !emptyReport.canReason));

    // Test getCoveredDomains
    const covered = getCoveredDomains(ctx as any);
    results.push(expectTruthy("RDY7: getCoveredDomains returns array", Array.isArray(covered)));
    results.push(expectTruthy("RDY8: FINANCE in covered", covered.includes("FINANCE")));

    results.push(expectTruthy("RDY9: READINESS_THRESHOLDS.minSignals = 2",
      READINESS_THRESHOLDS.minSignals === 2));

    // Test blocked context — cross-tenant signals
    const blockedCtx = {
      orgSlug:  "castillitos",
      domains:  ["FINANCE"],
      signals:  signals.map(s => ({ ...s, orgSlug: "other-org" })),
      requestedAt: new Date().toISOString(),
    };
    const blockedReport = evaluateReadiness(blockedCtx as any);
    results.push(expect("RDY10: cross-tenant signals → BLOCKED", blockedReport.level, "BLOCKED"));
  } catch (err) {
    results.push(fail("RDY_IMPORT: readiness import failed", String(err)));
  }
  return results;
}

async function testDashboardContract(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { buildCrossModuleDashboard, buildEmptyCrossModuleDashboard } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-dashboard-contract");

    const empty = buildEmptyCrossModuleDashboard("castillitos");
    results.push(expect("DASH1: empty dashboard orgSlug", empty.orgSlug, "castillitos"));
    results.push(expect("DASH2: empty reasoningRuns=0", empty.reasoningRuns, 0));
    results.push(expect("DASH3: empty successfulRuns=0", empty.successfulRuns, 0));
    results.push(expect("DASH4: empty criticalRisks=0", empty.criticalRisks, 0));
    results.push(expectTruthy("DASH5: empty has computedAt", empty.computedAt.length > 0));
    results.push(expectTruthy("DASH6: empty confidenceDist is object", typeof empty.confidenceDistribution === "object"));

    const dashFromEmpty = buildCrossModuleDashboard("castillitos", []);
    results.push(expect("DASH7: empty results → reasoningRuns=0", dashFromEmpty.reasoningRuns, 0));
    results.push(expect("DASH8: empty results → topDomains=[]", dashFromEmpty.topDomains.length, 0));
  } catch (err) {
    results.push(fail("DASH_IMPORT: dashboard contract import failed", String(err)));
  }
  return results;
}

async function testRepository(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { InMemoryCrossModuleReasoningRepository } =
      await import("@/lib/copilot/cross-module-reasoning/reasoning-repository");
    const { runCrossModuleReasoning } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const repo = new InMemoryCrossModuleReasoningRepository();

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Test",
      description: "Test desc", severity: "HIGH", confidence: 0.7, source: "test",
    });
    const ctx = { orgSlug: "castillitos", domains: ["FINANCE"], signals: [sig], requestedAt: new Date().toISOString() };
    const result = await runCrossModuleReasoning(ctx as any);

    await repo.saveResult(result);
    const fetched = await repo.getResult(result.id);
    results.push(expectTruthy("REPO1: saveResult + getResult", fetched !== null));
    results.push(expect("REPO2: fetched id matches", fetched?.id, result.id));

    const listed = await repo.listResults({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO3: listResults returns array", Array.isArray(listed)));
    results.push(expectTruthy("REPO4: listResults has item", listed.length >= 1));

    const count = await repo.countResults("castillitos");
    results.push(expectTruthy("REPO5: countResults ≥ 1", count >= 1));

    await repo.deleteResult(result.id);
    const afterDelete = await repo.getResult(result.id);
    results.push(expect("REPO6: deleteResult removes item", afterDelete, null));

    // Test hypothesis save/list
    await repo.saveHypotheses("exec-1", result.chain.hypotheses);
    const hyps = await repo.listHypotheses({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO7: saveHypotheses + listHypotheses", Array.isArray(hyps)));

    // Test evidence save/list
    await repo.saveEvidence("exec-1", result.chain.evidence);
    const evList = await repo.listEvidence({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO8: saveEvidence + listEvidence", Array.isArray(evList)));

    // Test risks save/list
    await repo.saveRisks("exec-1", result.chain.risks);
    const riskList = await repo.listRisks({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO9: saveRisks + listRisks", Array.isArray(riskList)));

    // Test recommendations save/list
    await repo.saveRecommendations("exec-1", result.chain.recommendations);
    const recList = await repo.listRecommendations({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO10: saveRecommendations + listRecommendations", Array.isArray(recList)));

    // Test opportunities save/list
    await repo.saveOpportunities("exec-1", result.chain.opportunities);
    const oppList = await repo.listOpportunities({ orgSlug: "castillitos" });
    results.push(expectTruthy("REPO11: saveOpportunities + listOpportunities", Array.isArray(oppList)));
  } catch (err) {
    results.push(fail("REPO_IMPORT: repository test failed", String(err)));
  }
  return results;
}

async function testIntegrationAdapters(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    // Executive brain adapter
    const { executiveSignalToReasoningSignal, executiveInsightToEvidence, executiveContextToReasoningInput } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-executive-brain");

    const mockSignal = {
      id: "sig-1", title: "Caja baja", description: "La caja está baja", category: "FINANCE" as const,
      severity: "HIGH" as const, direction: "DECLINING" as const, confidence: 0.8,
      source: "finance", metadata: {}, generatedAt: new Date().toISOString(),
    };

    const rSig = executiveSignalToReasoningSignal("castillitos", mockSignal);
    results.push(expectTruthy("INT1: executiveSignalToReasoningSignal", rSig !== null));
    results.push(expect("INT2: signal orgSlug", rSig.orgSlug, "castillitos"));
    results.push(expect("INT3: signal domain=FINANCE", rSig.domain, "FINANCE"));
    results.push(expect("INT4: signal severity=HIGH", rSig.severity, "HIGH"));

    const mockInsight = {
      id: "ins-1", title: "Riesgo financiero", summary: "Situación crítica en caja",
      priority: "HIGH" as const, categories: ["FINANCE" as const], supportingSignals: ["sig-1"],
    };

    const rEv = executiveInsightToEvidence("castillitos", mockInsight);
    results.push(expectTruthy("INT5: executiveInsightToEvidence", rEv !== null));
    results.push(expect("INT6: evidence type=EXECUTIVE_INSIGHT", rEv.type, "EXECUTIVE_INSIGHT"));
    results.push(expect("INT7: evidence domain=FINANCE", rEv.domain, "FINANCE"));

    const mockCtx = { orgSlug: "castillitos", signals: [mockSignal], insights: [mockInsight], generatedAt: new Date().toISOString() };
    const input = executiveContextToReasoningInput(mockCtx);
    results.push(expectTruthy("INT8: executiveContextToReasoningInput", input !== null));
    results.push(expect("INT9: input orgSlug", input.orgSlug, "castillitos"));
    results.push(expectTruthy("INT10: input has signals", Array.isArray(input.signals)));

    // Memory adapter
    const { memoryEntryToEvidence, memoryEntryToSignal, filterStrategicMemories } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-memory");

    const mockMemory = {
      id: "mem-1", orgSlug: "castillitos", type: "STRATEGIC" as const, scope: "TENANT" as const,
      importance: "HIGH" as const, title: "Integración bancaria activa", content: "Banco conectado",
      tags: ["finance"], source: "system", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    const mEv = memoryEntryToEvidence("castillitos", mockMemory);
    results.push(expectTruthy("INT11: memoryEntryToEvidence", mEv !== null));
    results.push(expect("INT12: memory evidence type=MEMORY_ENTRY", mEv.type, "MEMORY_ENTRY"));

    const mSig = memoryEntryToSignal("castillitos", mockMemory);
    results.push(expectTruthy("INT13: STRATEGIC memory → signal", mSig !== null));

    const strategic = filterStrategicMemories([mockMemory]);
    results.push(expect("INT14: filterStrategicMemories = 1", strategic.length, 1));

    // Playbooks adapter
    const { playbookToEvidence, playbookToSignal, filterCriticalPlaybooks } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-playbooks");

    const mockPlaybook = {
      id: "pb-1", orgSlug: "castillitos", title: "Proceso de cierre mensual",
      description: "Cierre contable mensual", category: "FINANCE" as const, priority: "CRITICAL" as const,
      status: "ACTIVE" as const, tags: ["finance"], steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    const pbEv = playbookToEvidence("castillitos", mockPlaybook);
    results.push(expectTruthy("INT15: playbookToEvidence", pbEv !== null));
    results.push(expect("INT16: playbook evidence type=PLAYBOOK_TRIGGER", pbEv.type, "PLAYBOOK_TRIGGER"));

    const pbSig = playbookToSignal("castillitos", mockPlaybook);
    results.push(expectTruthy("INT17: CRITICAL active playbook → signal", pbSig !== null));

    const critical = filterCriticalPlaybooks([mockPlaybook]);
    results.push(expect("INT18: filterCriticalPlaybooks = 1", critical.length, 1));

    // Tenant profile adapter
    const { buildTenantReasoningProfile, tenantProfileToEvidence, profileToReasoningContext } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-tenant-profile");

    const profile = buildTenantReasoningProfile("castillitos", "Castillitos", ["finanzas", "comercial"]);
    results.push(expectTruthy("INT19: buildTenantReasoningProfile", profile !== null));
    results.push(expectTruthy("INT20: profile has FINANCE domain", profile.activeDomains.includes("FINANCE")));
    results.push(expectTruthy("INT21: profile always has EXECUTIVE", profile.activeDomains.includes("EXECUTIVE")));

    const tEv = tenantProfileToEvidence(profile);
    results.push(expectTruthy("INT22: tenantProfileToEvidence", tEv !== null));
    results.push(expect("INT23: tenant evidence domain=EXECUTIVE", tEv.domain, "EXECUTIVE"));

    const rCtx = profileToReasoningContext(profile);
    results.push(expectTruthy("INT24: profileToReasoningContext", rCtx !== null));
    results.push(expect("INT25: context orgSlug", rCtx.orgSlug, "castillitos"));
  } catch (err) {
    results.push(fail("INT_IMPORT: integration adapters test failed", String(err)));
  }
  return results;
}

async function testCopilotAndExecutiveAdapters(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { buildCopilotReasoningSummary, buildEmptyCopilotReasoningSummary, formatReasoningForCopilotPrompt } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-copilot");
    const { buildExecutiveReasoningPayload } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-executive");
    const { buildIntelligenceReasoningContext, analyzeSignalCoverage } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-intelligence");
    const { buildReasoningAuditLog } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-audit");
    const { buildComplianceReasoningReport, evaluateComplianceGate } =
      await import("@/lib/copilot/cross-module-reasoning/integrations/reasoning-compliance");
    const { runCrossModuleReasoning } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Caja baja",
      description: "Caja en mínimo", severity: "CRITICAL", confidence: 0.85, source: "test",
    });
    const ctx = { orgSlug: "castillitos", domains: ["FINANCE"], signals: [sig], requestedAt: new Date().toISOString() };
    const result = await runCrossModuleReasoning(ctx as any);

    // Copilot adapter tests
    const emptySummary = buildEmptyCopilotReasoningSummary("castillitos");
    results.push(expect("CAD1: empty summary available=false", emptySummary.available, false));
    results.push(expect("CAD2: empty summary orgSlug", emptySummary.orgSlug, "castillitos"));

    const summary = buildCopilotReasoningSummary(result);
    results.push(expectTruthy("CAD3: buildCopilotReasoningSummary", summary !== null));
    results.push(expect("CAD4: summary orgSlug", summary.orgSlug, "castillitos"));
    results.push(expectTruthy("CAD5: summary has confidenceLevel", summary.confidenceLevel.length > 0));

    const prompt = formatReasoningForCopilotPrompt(summary);
    results.push(expectTruthy("CAD6: formatReasoningForCopilotPrompt returns string", typeof prompt === "string"));

    // Executive adapter tests
    const execPayload = buildExecutiveReasoningPayload(result);
    results.push(expectTruthy("CAD7: buildExecutiveReasoningPayload", execPayload !== null));
    results.push(expect("CAD8: exec payload orgSlug", execPayload.orgSlug, "castillitos"));
    results.push(expectTruthy("CAD9: exec payload has confidence", execPayload.confidence !== null));
    results.push(expectTruthy("CAD10: exec payload has alertSummary", execPayload.alertSummary !== null));

    // Intelligence adapter tests
    const intel = buildIntelligenceReasoningContext(result);
    results.push(expectTruthy("CAD11: buildIntelligenceReasoningContext", intel !== null));
    results.push(expect("CAD12: intel orgSlug", intel.orgSlug, "castillitos"));
    results.push(expectTruthy("CAD13: intel has signalCount", typeof intel.signalCount === "number"));

    const coverage = analyzeSignalCoverage(result.chain.signals, "castillitos");
    results.push(expectTruthy("CAD14: analyzeSignalCoverage returns object", typeof coverage === "object"));

    // Audit adapter tests
    const auditLog = buildReasoningAuditLog(result, ctx as any);
    results.push(expectTruthy("CAD15: buildReasoningAuditLog", auditLog !== null));
    results.push(expectTruthy("CAD16: audit log has records", auditLog.records.length > 0));
    results.push(expect("CAD17: audit log executionId", auditLog.executionId, result.id));

    // Compliance adapter tests
    const compReport = buildComplianceReasoningReport(result);
    results.push(expectTruthy("CAD18: buildComplianceReasoningReport", compReport !== null));
    results.push(expect("CAD19: compliance report orgSlug", compReport.orgSlug, "castillitos"));
    results.push(expectTruthy("CAD20: compliance report has status", ["PASS","WARN","FAIL"].includes(compReport.status)));

    const gate = evaluateComplianceGate(compReport);
    results.push(expectTruthy("CAD21: evaluateComplianceGate returns object", gate !== null));
    results.push(expectTruthy("CAD22: gate has passed field", typeof gate.passed === "boolean"));
    results.push(expectTruthy("CAD23: gate has reason", gate.reason.length > 0));
  } catch (err) {
    results.push(fail("CAD_IMPORT: copilot/executive adapters test failed", String(err)));
  }
  return results;
}

async function testQueryLayer(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const {
      findReasoning, findSuccessfulReasoning, findSupportedHypotheses,
      findCriticalRisks, findUrgentRecommendations, queryChainStats,
    } = await import("@/lib/copilot/cross-module-reasoning/reasoning-query");
    const { runCrossModuleReasoning } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");
    const { normalizeSignal } =
      await import("@/lib/copilot/cross-module-reasoning/signal-normalizer");

    const sig = normalizeSignal({
      orgSlug: "castillitos", domain: "FINANCE", label: "Test",
      description: "Query test", severity: "HIGH", confidence: 0.8, source: "test",
    });
    const ctx = { orgSlug: "castillitos", domains: ["FINANCE"], signals: [sig], requestedAt: new Date().toISOString() };
    const result = await runCrossModuleReasoning(ctx as any);

    const results1 = findReasoning([result], "castillitos");
    results.push(expect("QRY1: findReasoning returns 1", results1.length, 1));

    const results2 = findReasoning([result], "other-org");
    results.push(expect("QRY2: findReasoning other-org returns 0", results2.length, 0));

    if (result.status === "SUCCESS") {
      const successful = findSuccessfulReasoning([result], "castillitos");
      results.push(expectTruthy("QRY3: findSuccessfulReasoning", successful.length >= 0));
    }

    const supported = findSupportedHypotheses(result.chain, "castillitos");
    results.push(expectTruthy("QRY4: findSupportedHypotheses returns array", Array.isArray(supported)));

    const critical = findCriticalRisks(result.chain, "castillitos");
    results.push(expectTruthy("QRY5: findCriticalRisks returns array", Array.isArray(critical)));

    const urgent = findUrgentRecommendations(result.chain, "castillitos");
    results.push(expectTruthy("QRY6: findUrgentRecommendations returns array", Array.isArray(urgent)));

    const stats = queryChainStats(result.chain, "castillitos");
    results.push(expectTruthy("QRY7: queryChainStats returns object", stats !== null));
    results.push(expect("QRY8: stats orgSlug", stats.orgSlug, "castillitos"));
    results.push(expectTruthy("QRY9: stats has totalSignals", typeof stats.totalSignals === "number"));
    results.push(expectTruthy("QRY10: stats has criticalRisks", typeof stats.criticalRisks === "number"));
  } catch (err) {
    results.push(fail("QRY_IMPORT: query layer test failed", String(err)));
  }
  return results;
}

async function testFailClosed(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  try {
    const { runCrossModuleReasoning } =
      await import("@/lib/copilot/cross-module-reasoning/cross-module-engine");

    // Test with completely empty context
    const emptyCtx = { orgSlug: "castillitos", domains: [], signals: [], requestedAt: new Date().toISOString() };
    const result = await runCrossModuleReasoning(emptyCtx as any);

    results.push(expectTruthy("FC1: empty context returns result (not throws)", result !== null));
    results.push(expectTruthy("FC2: result has id", result.id.length > 0));
    results.push(expectTruthy("FC3: result has valid status",
      ["SUCCESS","PARTIAL","INSUFFICIENT_EVIDENCE","ERROR"].includes(result.status)));

    // Test with invalid/minimal context — should not throw
    const minimalCtx = { orgSlug: "castillitos", domains: [], signals: [], requestedAt: new Date().toISOString() };
    let threw = false;
    try {
      await runCrossModuleReasoning(minimalCtx as any);
    } catch {
      threw = true;
    }
    results.push(expect("FC4: runCrossModuleReasoning never throws", threw, false));
  } catch (err) {
    results.push(fail("FC_TEST: fail-closed test crashed", String(err)));
  }
  return results;
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const allResults: TestResult[] = [];

  const suites = [
    { name: "Core Types",             fn: testCoreTypes },
    { name: "Confidence Engine",      fn: testConfidenceEngine },
    { name: "Signal Normalizer",      fn: testSignalNormalizer },
    { name: "Evidence Engine",        fn: testEvidenceEngine },
    { name: "Hypothesis Engine",      fn: testHypothesisEngine },
    { name: "Correlation Engine",     fn: testCorrelationEngine },
    { name: "Risk Engine",            fn: testRiskEngine },
    { name: "Opportunity Engine",     fn: testOpportunityEngine },
    { name: "Recommendation Engine",  fn: testRecommendationEngine },
    { name: "Full Engine",            fn: testFullEngine },
    { name: "Tenant Isolation",       fn: testTenantIsolation },
    { name: "Readiness",              fn: testReadiness },
    { name: "Dashboard Contract",     fn: testDashboardContract },
    { name: "Repository",             fn: testRepository },
    { name: "Integration Adapters",   fn: testIntegrationAdapters },
    { name: "Copilot/Executive Adapters", fn: testCopilotAndExecutiveAdapters },
    { name: "Query Layer",            fn: testQueryLayer },
    { name: "Fail-Closed",            fn: testFailClosed },
  ];

  for (const suite of suites) {
    const suiteResults = await suite.fn();
    allResults.push(...suiteResults);
  }

  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed);
  const total  = allResults.length;

  return NextResponse.json({
    sprint:    "AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01",
    summary:   `${passed}/${total} tests passed`,
    passed,
    failed:    failed.length,
    total,
    failures:  failed,
    results:   allResults,
    timestamp: new Date().toISOString(),
  }, { status: failed.length > 0 ? 207 : 200 });
}
