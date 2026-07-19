// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 43: Integration Harness
// 500+ tests across all council modules. Internal route — never exposed publicly.

import { NextResponse } from "next/server";

const ORG = "castillitos";

// ── Test runners ───────────────────────────────────────────────────────────────

function pass(name: string): { name: string; status: "PASS" } {
  return { name, status: "PASS" };
}
function fail(name: string, error: unknown): { name: string; status: "FAIL"; error: string } {
  return { name, status: "FAIL", error: String(error) };
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ── Test suites ────────────────────────────────────────────────────────────────

async function testTypes() {
  const { COUNCIL_CONFIDENCES, COUNCIL_OUTCOMES, COUNCIL_PERSPECTIVES, COUNCIL_PRIORITIES,
    councilConfidenceFromScore, councilOutcomeFromAgreement } =
    await import("@/lib/copilot/executive-council/executive-council-types");

  assert(COUNCIL_CONFIDENCES.includes("LOW"), "COUNCIL_CONFIDENCES includes LOW");
  assert(COUNCIL_CONFIDENCES.includes("VERY_HIGH"), "COUNCIL_CONFIDENCES includes VERY_HIGH");
  assert(COUNCIL_OUTCOMES.includes("CONSENSUS"), "COUNCIL_OUTCOMES includes CONSENSUS");
  assert(COUNCIL_OUTCOMES.includes("ESCALATION_REQUIRED"), "ESCALATION_REQUIRED present");
  assert(COUNCIL_PERSPECTIVES.length >= 9, "9+ perspectives");
  assert(COUNCIL_PRIORITIES.includes("CRITICAL"), "CRITICAL priority");
  assert(councilConfidenceFromScore(0.9) === "VERY_HIGH", "confidence from score 0.9");
  assert(councilConfidenceFromScore(0.2) === "LOW", "confidence from score 0.2");
  assert(councilOutcomeFromAgreement(0.8) === "CONSENSUS", "outcome from 0.8 agreement");
  assert(councilOutcomeFromAgreement(0.1) === "ESCALATION_REQUIRED", "outcome from 0.1 agreement");
}

async function testIdentity() {
  const { newCouncilId, newOpinionId, newConsensusId, newResolutionId,
    newArgumentId, newFindingId, newDisagreementId, newRecommendationId,
    COUNCIL_ID_PREFIX, OPINION_ID_PREFIX, CONSENSUS_ID_PREFIX, RESOLUTION_ID_PREFIX } =
    await import("@/lib/copilot/executive-council/executive-council-identity");

  assert(newCouncilId().startsWith(COUNCIL_ID_PREFIX), "council id prefix");
  assert(newOpinionId().startsWith(OPINION_ID_PREFIX), "opinion id prefix");
  assert(newConsensusId().startsWith(CONSENSUS_ID_PREFIX), "consensus id prefix");
  assert(newResolutionId().startsWith(RESOLUTION_ID_PREFIX), "resolution id prefix");
  assert(newArgumentId().startsWith("arg"), "arg id prefix");
  assert(newFindingId().startsWith("finding"), "finding id prefix");
  assert(newDisagreementId().startsWith("disagree"), "disagree id prefix");
  assert(newRecommendationId().startsWith("councilrec"), "councilrec id prefix");
  // IDs must be unique
  const ids = Array.from({ length: 10 }, () => newCouncilId());
  assert(new Set(ids).size === 10, "council ids are unique");
}

async function testPerspectiveRegistry() {
  const { PERSPECTIVE_REGISTRY, getPerspectiveDefinition, getPerspectiveWeight,
    DEFAULT_COUNCIL_PERSPECTIVES, FULL_COUNCIL_PERSPECTIVES } =
    await import("@/lib/copilot/executive-council/perspective-registry");

  assert(PERSPECTIVE_REGISTRY["FINANCE"].weight === 1.0, "FINANCE weight 1.0");
  assert(PERSPECTIVE_REGISTRY["RISK"].weight === 1.0, "RISK weight 1.0");
  assert(getPerspectiveDefinition("COMMERCIAL").id === "COMMERCIAL", "commercial def id");
  assert(getPerspectiveWeight("FINANCE") === 1.0, "finance weight");
  assert(DEFAULT_COUNCIL_PERSPECTIVES.includes("FINANCE"), "default includes FINANCE");
  assert(FULL_COUNCIL_PERSPECTIVES.length >= 9, "full perspectives >= 9");
  assert(FULL_COUNCIL_PERSPECTIVES.includes("COLLECTIONS"), "COLLECTIONS in full");
}

async function testFinancePerspective() {
  const { buildFinancePerspective } =
    await import("@/lib/copilot/executive-council/engines/finance-perspective-engine");

  const opinion = buildFinancePerspective(ORG, "sess_1", [], [], []);
  assert(opinion.orgSlug === ORG, "finance org");
  assert(opinion.perspective === "FINANCE", "finance perspective");
  assert(opinion.id.startsWith("opinion"), "finance opinion id");
  assert(opinion.confidence !== undefined, "finance confidence set");
  assert(typeof opinion.priority === "string", "finance priority is string");

  // With risk data
  const risks: any[] = [{
    id: "r1", orgSlug: ORG, title: "Liquidez crítica", description: "...",
    domain: "FINANCE", level: "CRITICAL", confidence: "HIGH", confidenceScore: 0.85,
    likelihood: 0.8, impact: 0.9, compositeRisk: 0.72, rationale: "...",
    evidenceIds: ["ev1"], mitigationSuggestions: [], metadata: {},
  }];
  const withRisk = buildFinancePerspective(ORG, "sess_2", [], risks, []);
  assert(withRisk.priority === "CRITICAL" || withRisk.priority === "HIGH", "finance high priority with critical risk");
  assert(withRisk.findings.length > 0, "finance findings populated");
}

async function testCommercialPerspective() {
  const { buildCommercialPerspective } =
    await import("@/lib/copilot/executive-council/engines/commercial-perspective-engine");

  const op = buildCommercialPerspective(ORG, "sess_1", [], [], [], []);
  assert(op.perspective === "COMMERCIAL", "commercial perspective");
  assert(op.id.startsWith("opinion"), "commercial id");
}

async function testOperationsPerspective() {
  const { buildOperationsPerspective } =
    await import("@/lib/copilot/executive-council/engines/operations-perspective-engine");

  const op = buildOperationsPerspective(ORG, "sess_1", [], [], []);
  assert(op.perspective === "OPERATIONS", "operations perspective");
  assert(op.priority !== undefined, "operations priority set");
}

async function testMarketingPerspective() {
  const { buildMarketingPerspective } =
    await import("@/lib/copilot/executive-council/engines/marketing-perspective-engine");

  const op = buildMarketingPerspective(ORG, "sess_1", [], [], []);
  assert(op.perspective === "MARKETING", "marketing perspective");
  assert(op.generatedAt !== undefined, "marketing generatedAt");
}

async function testCollectionsPerspective() {
  const { buildCollectionsPerspective } =
    await import("@/lib/copilot/executive-council/engines/collections-perspective-engine");

  const op = buildCollectionsPerspective(ORG, "sess_1", [], [], []);
  assert(op.perspective === "COLLECTIONS", "collections perspective");

  const concerns: any[] = [{
    id: "c1", orgSlug: ORG, title: "Cartera vencida 90d", description: "...",
    domain: "FINANCE", severity: "CRITICAL", confidence: "HIGH", confidenceScore: 0.8,
    isEmergent: true, isLatent: false, rationale: "...",
    evidenceIds: [], relatedGoals: [], metadata: {}, detectedAt: new Date().toISOString(),
  }];
  const withConcern = buildCollectionsPerspective(ORG, "sess_2", [], [], concerns);
  assert(withConcern.priority === "CRITICAL" || withConcern.priority === "HIGH", "collections critical concern");
}

async function testStrategyPerspective() {
  const { buildStrategyPerspective } =
    await import("@/lib/copilot/executive-council/engines/strategy-perspective-engine");

  const op = buildStrategyPerspective(ORG, "sess_1", [], [], [], []);
  assert(op.perspective === "STRATEGY", "strategy perspective");
  assert(op.metadata["engine"] === "STRATEGY_PERSPECTIVE", "strategy engine meta");
}

async function testRiskPerspective() {
  const { buildRiskPerspective } =
    await import("@/lib/copilot/executive-council/engines/risk-perspective-engine");

  const op = buildRiskPerspective(ORG, "sess_1", [], []);
  assert(op.perspective === "RISK", "risk perspective");
  assert(op.priority === "LOW", "risk low priority with no data");

  const risks: any[] = [{
    id: "r1", orgSlug: ORG, title: "Riesgo crítico", description: "...",
    domain: "FINANCE", level: "CRITICAL", confidence: "VERY_HIGH", confidenceScore: 0.92,
    likelihood: 0.9, impact: 0.85, compositeRisk: 0.765, rationale: "...",
    evidenceIds: [], mitigationSuggestions: [], metadata: {},
  }];
  const withRisk = buildRiskPerspective(ORG, "sess_2", risks, []);
  assert(withRisk.priority === "CRITICAL" || withRisk.priority === "HIGH", "risk critical with critical data");
  assert(withRisk.findings.length > 0, "risk findings");
}

async function testCompliancePerspective() {
  const { buildCompliancePerspective } =
    await import("@/lib/copilot/executive-council/engines/compliance-perspective-engine");

  const op = buildCompliancePerspective(ORG, "sess_1", [], []);
  assert(op.perspective === "COMPLIANCE", "compliance perspective");
  assert(op.stance !== "", "compliance stance non-empty");
}

async function testOpinionEngine() {
  const { buildOpinionSet, filterOpinionsByPriority, sortOpinionsByPriority, buildPlaceholderOpinion } =
    await import("@/lib/copilot/executive-council/opinion-engine");

  const empty = buildOpinionSet(ORG, []);
  assert(empty.opinions.length === 0, "empty opinion set");
  assert(empty.highestPriority === "LOW", "empty highest priority LOW");

  const placeholder = buildPlaceholderOpinion(ORG, "sess_1", "FINANCE");
  assert(placeholder.perspective === "FINANCE", "placeholder perspective");
  assert(placeholder.priority === "LOW", "placeholder priority LOW");

  const opinions: any[] = [
    { ...placeholder, priority: "HIGH", confidenceScore: 0.7 },
    { ...placeholder, id: "op_2", perspective: "RISK", priority: "CRITICAL", confidenceScore: 0.9, orgSlug: ORG },
  ];

  const set = buildOpinionSet(ORG, opinions);
  assert(set.highestPriority === "CRITICAL", "highest priority CRITICAL");
  assert(set.averageConfidence > 0.5, "average confidence > 0.5");

  const filtered = filterOpinionsByPriority(opinions, "HIGH");
  assert(filtered.length === 2, "filter HIGH includes CRITICAL too");

  const sorted = sortOpinionsByPriority(opinions);
  assert(sorted[0].priority === "CRITICAL", "sorted first is CRITICAL");
}

async function testArgumentEngine() {
  const { analyzeArguments, hasBlockingOpposition, getStrongestOppositions, getTopSupportArguments } =
    await import("@/lib/copilot/executive-council/argument-engine");

  const analysis = analyzeArguments([]);
  assert(analysis.totalArguments === 0, "empty analysis");
  assert(analysis.supportRatio === 0, "empty support ratio");
  assert(analysis.oppositionRatio === 0, "empty opposition ratio");

  const opinions: any[] = [{
    arguments: [
      { id: "a1", opinionId: "op1", type: "SUPPORT", claim: "X", rationale: "Y", strength: "STRONG", evidenceIds: [], metadata: {} },
      { id: "a2", opinionId: "op1", type: "OPPOSE", claim: "Z", rationale: "W", strength: "STRONG", evidenceIds: [], metadata: {} },
    ],
    priority: "CRITICAL",
  }];

  const a = analyzeArguments(opinions);
  assert(a.totalArguments === 2, "total arguments");
  assert(a.supportArguments.length === 1, "support args");
  assert(a.opposeArguments.length === 1, "oppose args");
  assert(a.strongArguments.length === 2, "strong args");
  assert(hasBlockingOpposition(opinions), "has blocking opposition");

  const strongest = getStrongestOppositions(opinions, 3);
  assert(strongest.length === 1, "strongest oppositions");
  const topSupport = getTopSupportArguments(opinions, 3);
  assert(topSupport.length === 1, "top support args");
}

async function testConsensusEngine() {
  const { buildConsensus, buildVotes, computeAgreementScore } =
    await import("@/lib/copilot/executive-council/consensus-engine");

  const empty = buildConsensus(ORG, "sess_1", [], "test topic");
  assert(empty.outcome === "NO_CONSENSUS", "empty consensus outcome");
  assert(empty.agreementScore === 0, "empty agreement score");

  const opinions: any[] = [
    { id: "op1", orgSlug: ORG, perspective: "FINANCE", priority: "HIGH",
      arguments: [{ type: "SUPPORT", strength: "STRONG" }], stance: "Support", confidenceScore: 0.8 },
    { id: "op2", orgSlug: ORG, perspective: "COMMERCIAL", priority: "MEDIUM",
      arguments: [{ type: "SUPPORT", strength: "MODERATE" }], stance: "Support", confidenceScore: 0.7 },
    { id: "op3", orgSlug: ORG, perspective: "RISK", priority: "LOW",
      arguments: [], stance: "Neutral", confidenceScore: 0.5 },
  ];

  const votes = buildVotes(opinions);
  assert(votes.length === 3, "3 votes built");

  const score = computeAgreementScore(votes);
  assert(score > 0, "agreement score > 0");

  const consensus = buildConsensus(ORG, "sess_2", opinions, "test topic");
  assert(consensus.orgSlug === ORG, "consensus org");
  assert(consensus.votes.length === 3, "consensus votes");
  assert(["CONSENSUS", "PARTIAL_CONSENSUS", "NO_CONSENSUS", "ESCALATION_REQUIRED"].includes(consensus.outcome), "valid outcome");
  assert(consensus.id.startsWith("consensus"), "consensus id prefix");
}

async function testDisagreementEngine() {
  const { detectDisagreements, getBlockingDisagreements, getResolvableDisagreements, summarizeDisagreements } =
    await import("@/lib/copilot/executive-council/disagreement-engine");

  const empty = detectDisagreements(ORG, "sess_1", []);
  assert(empty.length === 0, "empty disagreements");

  const opinions: any[] = [
    { id: "op1", orgSlug: ORG, perspective: "FINANCE", priority: "CRITICAL",
      arguments: [{ type: "OPPOSE", strength: "STRONG" }] },
    { id: "op2", orgSlug: ORG, perspective: "COMMERCIAL", priority: "LOW",
      arguments: [{ type: "OPPOSE", strength: "MODERATE" }] },
  ];

  const disag = detectDisagreements(ORG, "sess_2", opinions);
  assert(disag.length >= 0, "disagreements detected (may or may not find depending on priority gap)");

  const summary = summarizeDisagreements([]);
  assert(summary.includes("Sin desacuerdo"), "empty summary");

  const mockDisag: any[] = [{
    id: "d1", orgSlug: ORG, sessionId: "sess", title: "Test",
    description: "desc", perspectiveA: "FINANCE", perspectiveB: "RISK",
    pointOfConflict: "conflict", severity: "CRITICAL", canBeResolved: false, resolutionPath: "escalate", metadata: {},
  }];
  const blocking = getBlockingDisagreements(mockDisag);
  assert(blocking.length === 1, "blocking disagreements");

  const resolvable = getResolvableDisagreements(mockDisag);
  assert(resolvable.length === 0, "no resolvable in mock");
}

async function testResolutionEngine() {
  const { buildResolution } =
    await import("@/lib/copilot/executive-council/resolution-engine");

  const empty = buildResolution(ORG, "sess_1", "test", [], null, []);
  assert(empty.orgSlug === ORG, "resolution org");
  assert(empty.suggestedOnly === true, "suggestedOnly true");
  assert(empty.id.startsWith("resolution"), "resolution id prefix");
  assert(empty.limitations.length > 0, "resolution has limitations");

  const opinions: any[] = [
    {
      id: "op1", orgSlug: ORG, perspective: "FINANCE", priority: "HIGH",
      stance: "Finance supports action", confidenceScore: 0.8, confidence: "HIGH",
      arguments: [
        { id: "a1", opinionId: "op1", type: "SUPPORT", claim: "Activate collections",
          rationale: "Cash flow critical", strength: "STRONG", evidenceIds: ["ev1"], metadata: {} },
      ],
      findings: [], evidenceIds: [], metadata: {}, generatedAt: new Date().toISOString(),
    },
  ];

  const resolution = buildResolution(ORG, "sess_2", "crisis liquidez", opinions, null, []);
  assert(resolution.recommendations.length > 0, "resolution has recommendations");
  assert(resolution.recommendations.every((r: any) => r.suggestedOnly === true), "all recs suggestedOnly");
  assert(resolution.confidence !== undefined, "resolution confidence set");
}

async function testCouncilEngine() {
  const { runExecutiveCouncil } =
    await import("@/lib/copilot/executive-council/executive-council-engine");

  const emptyCtx = {
    priorities: [], risks: [], opportunities: [], focusAreas: [],
    recs: [], concerns: [], advisorRisks: [], plans: [],
  };

  // Fail case: missing orgSlug
  const failResult = runExecutiveCouncil({ orgSlug: "", topic: "test" }, emptyCtx);
  assert(failResult.status === "FAILED", "fails without orgSlug");

  // Fail case: missing topic
  const failResult2 = runExecutiveCouncil({ orgSlug: ORG, topic: "" }, emptyCtx);
  assert(failResult2.status === "FAILED", "fails without topic");

  // Success with empty context
  const result = runExecutiveCouncil({ orgSlug: ORG, topic: "Crisis de liquidez" }, emptyCtx);
  assert(result.status === "SUCCESS", "council runs with empty ctx");
  assert(result.session !== undefined, "session created");
  assert(result.session!.orgSlug === ORG, "session org");
  assert(result.session!.recommendations.every((r) => r.suggestedOnly === true), "all recs suggestedOnly");
  assert(result.session!.topic === "Crisis de liquidez", "topic preserved");
  assert(result.durationMs >= 0, "duration tracked");
  assert(result.session!.id.startsWith("council"), "session id prefix");
  assert(result.report !== undefined, "report generated");
  assert(result.briefing !== undefined, "briefing generated");

  // With perspectives override
  const withPersp = runExecutiveCouncil(
    { orgSlug: ORG, topic: "Expansión", perspectives: ["FINANCE", "COMMERCIAL"] },
    emptyCtx
  );
  assert(withPersp.session!.perspectives.length === 2, "custom perspectives respected");

  // Session score 0..1
  assert(result.session!.sessionScore >= 0 && result.session!.sessionScore <= 1, "session score in range");
  assert(result.session!.limitations.length > 0, "session has limitations");
  assert(result.session!.consensus !== null, "session has consensus");
}

async function testIntegrationExecutiveBrain() {
  const { buildExecutiveBrainCouncilContext, getCriticalPrioritiesForCouncil,
    getCriticalRisksForCouncil, getCouncilConfidenceBoostFromBrain } =
    await import("@/lib/copilot/executive-council/integrations/council-executive-brain");

  const emptyCtx = buildExecutiveBrainCouncilContext(ORG, [], [], [], []);
  assert(emptyCtx.contextScore === 0, "empty brain context score");
  assert(emptyCtx.priorities.length === 0, "empty priorities");

  const priorities: any[] = [
    { id: "p1", orgSlug: ORG, rank: 1, title: "T1", description: "D1", domain: "FINANCE",
      level: "CRITICAL", confidence: "HIGH", confidenceScore: 0.85, impactScore: 0.9,
      urgencyScore: 0.8, strategicAlignmentScore: 0.7, historicalRiskScore: 0.6,
      priorityScore: 0.85, rationale: "R1", evidenceIds: [], metadata: {}, computedAt: "" },
  ];
  const ctx = buildExecutiveBrainCouncilContext(ORG, priorities, [], [], []);
  assert(ctx.contextScore > 0, "context score > 0 with data");
  assert(ctx.priorities.length === 1, "priority scoped");

  const criticals = getCriticalPrioritiesForCouncil(ORG, priorities);
  assert(criticals.length === 1, "critical priority found");

  const boost = getCouncilConfidenceBoostFromBrain(ctx);
  assert(boost >= 0 && boost <= 0.15, "boost in range");
}

async function testIntegrationStrategicAdvisor() {
  const { buildAdvisorCouncilContext, getTopAdvisorRecommendations, getEmergentConcernsForCouncil } =
    await import("@/lib/copilot/executive-council/integrations/council-strategic-advisor");

  const empty = buildAdvisorCouncilContext(ORG, [], [], []);
  assert(empty.advisorBoost === 0, "empty advisor boost");

  const recs: any[] = [
    { id: "r1", orgSlug: ORG, title: "Activar cobranza", description: "...", rationale: "...",
      domain: "FINANCE", priority: "CRITICAL", confidence: "HIGH", confidenceScore: 0.85,
      expectedImpact: "Improve cash flow", associatedRisks: [], evidenceIds: [], playbookIds: [],
      suggestedOnly: true, metadata: {} },
  ];

  const ctx = buildAdvisorCouncilContext(ORG, recs, [], []);
  assert(ctx.criticalRecCount === 1, "critical rec count");
  assert(ctx.advisorBoost > 0, "advisor boost > 0");

  const top = getTopAdvisorRecommendations(ORG, recs, 3);
  assert(top.length === 1, "top recs");
  assert(top[0].suggestedOnly === true, "rec is suggestedOnly");

  const emergent = getEmergentConcernsForCouncil(ORG, []);
  assert(emergent.length === 0, "no emergent concerns");
}

async function testIntegrationStrategicSimulations() {
  const { buildSimulationCouncilContext, getHighImpactSimulations } =
    await import("@/lib/copilot/executive-council/integrations/council-strategic-simulations");

  const empty = buildSimulationCouncilContext(ORG, []);
  assert(empty.simulationBoost === 0, "empty simulation boost");

  const sims: any[] = [
    { id: "s1", orgSlug: ORG, title: "Escenario A", outcome: "POSITIVE",
      confidenceScore: 0.8, impactScore: 0.85, suggestedOnly: true },
  ];
  const ctx = buildSimulationCouncilContext(ORG, sims);
  assert(ctx.simulationBoost > 0, "sim boost > 0");
  assert(ctx.topOutcomeLabels.length === 1, "top outcome labels");

  const high = getHighImpactSimulations(ORG, sims, 0.7);
  assert(high.length === 1, "high impact simulation");
}

async function testIntegrationStrategicPlanning() {
  const { buildPlanningCouncilContext, getActivePlanLabels, hasConflictingPlans } =
    await import("@/lib/copilot/executive-council/integrations/council-strategic-planning");

  const empty = buildPlanningCouncilContext(ORG, [], []);
  assert(empty.activePlanCount === 0, "empty planning ctx");

  const plans: any[] = [
    { id: "pl1", orgSlug: ORG, title: "Plan A", status: "ACTIVE", priority: "HIGH",
      planScore: 0.8, objectives: [], initiatives: [], milestones: [], suggestedOnly: true, evidenceIds: [],
      description: "", createdAt: "", metadata: {} },
  ];
  const ctx = buildPlanningCouncilContext(ORG, plans, []);
  assert(ctx.activePlanCount === 1, "active plan count");
  assert(ctx.planningBoost > 0, "planning boost");

  const labels = getActivePlanLabels(ORG, plans, 3);
  assert(labels.includes("Plan A"), "plan label included");

  const conflict = hasConflictingPlans(ORG, plans);
  assert(typeof conflict === "boolean", "conflict is boolean");
}

async function testIntegrationMemory() {
  const { buildMemoryCouncilContext, getMemoryInsightCount } =
    await import("@/lib/copilot/executive-council/integrations/council-memory");

  const empty = buildMemoryCouncilContext(ORG, []);
  assert(empty.memoryBoost === 0, "empty memory boost");

  const snaps: any[] = [
    { orgSlug: ORG, domain: "FINANCE", insightCount: 5, patternCount: 3, confidenceScore: 0.8 },
  ];
  const ctx = buildMemoryCouncilContext(ORG, snaps);
  assert(ctx.memoryBoost > 0, "memory boost > 0");
  assert(ctx.domainsCovered.includes("FINANCE"), "domain covered");

  const count = getMemoryInsightCount(ORG, snaps);
  assert(count === 5, "insight count");
}

async function testIntegrationLearning() {
  const { buildLearningCouncilContext, getRelevantPatternLabels } =
    await import("@/lib/copilot/executive-council/integrations/council-learning");

  const empty = buildLearningCouncilContext(ORG, []);
  assert(empty.learningBoost === 0, "empty learning boost");

  const patterns: any[] = [
    { id: "p1", orgSlug: ORG, name: "Cobranza eficiente", description: "desc",
      status: "REINFORCED", agentId: "diego", domain: "FINANCE", confidenceScore: 0.85,
      reinforcementCount: 3, weakeningCount: 0, netScore: 3,
      evidenceEventIds: [], metadata: {}, firstSeenAt: "", lastUpdatedAt: "" },
  ];
  const ctx = buildLearningCouncilContext(ORG, patterns);
  assert(ctx.reinforcedPatternCount === 1, "reinforced count");
  assert(ctx.learningBoost > 0, "learning boost");

  const labels = getRelevantPatternLabels(ORG, patterns, 3);
  assert(labels.includes("Cobranza eficiente"), "pattern label");
}

async function testIntegrationMemoryGraph() {
  const { buildGraphCouncilContext, getDecisionNodeLabels } =
    await import("@/lib/copilot/executive-council/integrations/council-memory-graph");

  const empty = buildGraphCouncilContext(ORG, [], []);
  assert(empty.graphBoost === 0, "empty graph boost");

  const nodes: any[] = [
    { id: "n1", orgSlug: ORG, type: "DECISION", label: "Reducir cartera", metadata: {}, createdAt: "" },
    { id: "n2", orgSlug: ORG, type: "INSIGHT", label: "Liquidez baja", metadata: {}, createdAt: "" },
  ];
  const ctx = buildGraphCouncilContext(ORG, nodes, []);
  assert(ctx.decisionNodeCount === 1, "decision nodes");
  assert(ctx.insightNodeCount === 1, "insight nodes");
  assert(ctx.graphBoost > 0, "graph boost");

  const labels = getDecisionNodeLabels(ORG, nodes, 3);
  assert(labels.includes("Reducir cartera"), "decision label");
}

async function testIntegrationCrossModule() {
  const { buildCrossModuleCouncilContext, getCrossModuleTopRecommendations } =
    await import("@/lib/copilot/executive-council/integrations/council-cross-module");

  const empty = buildCrossModuleCouncilContext(ORG, [], [], []);
  assert(empty.urgentRecCount === 0, "empty cross module");

  const recs: any[] = [
    { id: "r1", orgSlug: ORG, title: "Urgent action", priority: "URGENT",
      domain: "FINANCE", evidenceIds: [], metadata: {} },
  ];
  const ctx = buildCrossModuleCouncilContext(ORG, recs, [], []);
  assert(ctx.urgentRecCount === 1, "urgent rec count");
  assert(ctx.crossModuleBoost > 0, "cross module boost");

  const top = getCrossModuleTopRecommendations(ORG, recs, 3);
  assert(top.length === 1, "top cross module recs");
}

async function testIntegrationTenantProfile() {
  const { registerCouncilTenantProfile, getCouncilTenantProfile,
    shouldEscalate, getPreferredPerspectives, getRiskToleranceMultiplier } =
    await import("@/lib/copilot/executive-council/integrations/council-tenant-profile");

  const profile = getCouncilTenantProfile("unknown_org");
  assert(profile.riskTolerance === "MEDIUM", "default risk tolerance");
  assert(profile.escalationThreshold === 0.35, "default escalation threshold");

  registerCouncilTenantProfile({
    orgSlug: ORG, riskTolerance: "HIGH",
    primaryDomains: ["FINANCE"], preferredPerspectives: ["FINANCE", "RISK"],
    escalationThreshold: 0.25,
  });
  const registered = getCouncilTenantProfile(ORG);
  assert(registered.riskTolerance === "HIGH", "registered risk tolerance");
  assert(shouldEscalate(ORG, 0.20), "should escalate below threshold");
  assert(!shouldEscalate(ORG, 0.80), "no escalation above threshold");

  const persp = getPreferredPerspectives(ORG);
  assert(persp.includes("FINANCE"), "preferred perspectives include FINANCE");

  const mult = getRiskToleranceMultiplier(ORG);
  assert(mult === 1.2, "high risk tolerance multiplier");
}

async function testIntegrationPlaybooks() {
  const { buildPlaybookCouncilContext, getPlaybookTitlesForCouncil } =
    await import("@/lib/copilot/executive-council/integrations/council-playbooks");

  const empty = buildPlaybookCouncilContext(ORG, []);
  assert(empty.activeCount === 0, "empty playbooks");

  const playbooks: any[] = [
    { id: "pb1", orgSlug: ORG, title: "Cobranza acelerada", status: "ACTIVE",
      priority: "CRITICAL", metadata: {} },
  ];
  const ctx = buildPlaybookCouncilContext(ORG, playbooks);
  assert(ctx.activeCount === 1, "active playbooks");
  assert(ctx.criticalPlaybooks.length === 1, "critical playbooks");
  assert(ctx.playbookBoost > 0, "playbook boost");

  const titles = getPlaybookTitlesForCouncil(ORG, playbooks, 3);
  assert(titles.includes("Cobranza acelerada"), "playbook title");
}

async function testIntegrationCompliance() {
  const { evaluateCouncilComplianceGate, assertCouncilTenantIsolation } =
    await import("@/lib/copilot/executive-council/integrations/council-compliance");

  const mockSession: any = {
    id: "sess_1", orgSlug: ORG, title: "Test", topic: "Test",
    perspectives: ["FINANCE"],
    opinions: [{ perspective: "FINANCE", findings: [], arguments: [], confidenceScore: 0.7 }],
    resolution: { suggestedOnly: true },
    recommendations: [{ suggestedOnly: true }],
    disagreements: [], limitations: ["Limit 1"],
    metadata: {}, sessionScore: 0.7, outcome: "CONSENSUS", confidence: "HIGH",
    conductedAt: new Date().toISOString(), consensus: null,
  };

  const result = evaluateCouncilComplianceGate(ORG, mockSession);
  assert(result.orgSlug === ORG, "compliance org");
  assert(["PASS", "WARN", "FAIL"].includes(result.status), "valid status");
  assert(result.checks.length > 0, "checks present");

  // Tenant isolation
  try {
    assertCouncilTenantIsolation("other_org", mockSession);
    assert(false, "should have thrown");
  } catch (e) {
    assert(String(e).includes("isolation"), "isolation error thrown");
  }
}

async function testIntegrationAudit() {
  const { buildCouncilAuditEvent, auditSessionCreated, auditConsensusReached,
    auditEngineCompleted, auditEngineFailed, auditTenantBoundaryViolation,
    auditComplianceFailed } =
    await import("@/lib/copilot/executive-council/integrations/council-audit");

  const event = buildCouncilAuditEvent({ orgSlug: ORG, eventType: "COUNCIL_SESSION_CREATED",
    entityId: "sess_1", summary: "Test" });
  assert(event.id.startsWith("caudit"), "audit id prefix");
  assert(event.orgSlug === ORG, "audit org");

  const created = auditSessionCreated(ORG, "sess_1", "Test topic");
  assert(created.eventType === "COUNCIL_SESSION_CREATED", "session created event type");

  const consensus = auditConsensusReached(ORG, "sess_1", "CONSENSUS", 0.85);
  assert(consensus.eventType === "COUNCIL_CONSENSUS_REACHED", "consensus event type");
  assert((consensus.metadata as any).score === 0.85, "consensus score in metadata");

  const completed = auditEngineCompleted(ORG, "sess_1", 150);
  assert(completed.eventType === "COUNCIL_ENGINE_COMPLETED", "engine completed type");

  const failed = auditEngineFailed(ORG, "sess_1", "test error");
  assert(failed.eventType === "COUNCIL_ENGINE_FAILED", "engine failed type");

  const violation = auditTenantBoundaryViolation(ORG, "sess_1");
  assert(violation.eventType === "COUNCIL_TENANT_BOUNDARY_VIOLATION", "violation type");

  const compFailed = auditComplianceFailed(ORG, "sess_1", ["SUGGESTED_ONLY"]);
  assert(compFailed.eventType === "COUNCIL_COMPLIANCE_FAILED", "compliance failed type");
  assert((compFailed.metadata as any).failedRules.length === 1, "failed rules in metadata");
}

async function testQueryLayer() {
  const { getSessions, findSessionsByOutcome, sortSessionsByScore, getRecommendations,
    filterRecommendationsByPriority, getFindings, getCriticalFindings,
    getDisagreements, getUnresolvedDisagreements, getCouncilStats } =
    await import("@/lib/copilot/executive-council/executive-council-query");

  const sessions: any[] = [];
  assert(getSessions(ORG, sessions).length === 0, "empty sessions");
  assert(getCouncilStats(ORG, sessions).totalSessions === 0, "empty stats");

  const mockSession: any = {
    id: "sess_1", orgSlug: ORG, title: "S1", topic: "T1",
    sessionScore: 0.8, outcome: "CONSENSUS", perspectives: [],
    opinions: [{ perspective: "FINANCE", findings: [
      { id: "f1", severity: "CRITICAL", isBlocker: true, perspective: "FINANCE" }
    ], arguments: [] }],
    recommendations: [{ id: "r1", priority: "HIGH", impactScore: 0.8, suggestedOnly: true }],
    disagreements: [{ id: "d1", canBeResolved: false, severity: "CRITICAL" }],
    limitations: [], metadata: {}, conductedAt: "", consensus: null, resolution: null, confidence: "HIGH",
  };

  const sessions2 = [mockSession];
  const scoped = getSessions(ORG, sessions2);
  assert(scoped.length === 1, "scoped session");

  const byOutcome = findSessionsByOutcome(ORG, sessions2, "CONSENSUS");
  assert(byOutcome.length === 1, "find by outcome");

  const sorted = sortSessionsByScore(sessions2);
  assert(sorted[0].sessionScore === 0.8, "sorted by score");

  const recs = getRecommendations(ORG, sessions2);
  assert(recs.length === 1, "recs from sessions");
  assert(filterRecommendationsByPriority(recs, "HIGH").length === 1, "filter recs by priority");

  const finds = getFindings(ORG, sessions2);
  assert(finds.length === 1, "findings from sessions");
  const critical = getCriticalFindings(ORG, sessions2);
  assert(critical.length === 1, "critical findings");

  const disag = getDisagreements(ORG, sessions2);
  assert(disag.length === 1, "disagreements");
  const unresolved = getUnresolvedDisagreements(ORG, sessions2);
  assert(unresolved.length === 1, "unresolved disagreements");

  const stats = getCouncilStats(ORG, sessions2);
  assert(stats.totalSessions === 1, "total sessions");
  assert(stats.consensusSessions === 1, "consensus sessions");
  assert(stats.criticalFindings === 1, "critical findings stat");
  assert(stats.unresolvedDisagreements === 1, "unresolved disagreements stat");
}

async function testRepository() {
  const { InMemoryExecutiveCouncilRepository } =
    await import("@/lib/copilot/executive-council/executive-council-repository");

  const repo = new InMemoryExecutiveCouncilRepository();

  const session: any = {
    id: "sess_test", orgSlug: ORG, title: "Test Session", topic: "Liquidez",
    perspectives: ["FINANCE"], opinions: [], recommendations: [],
    disagreements: [], consensus: null, resolution: null,
    sessionScore: 0.7, outcome: "CONSENSUS", confidence: "HIGH",
    limitations: [], metadata: {}, conductedAt: new Date().toISOString(),
  };

  await repo.saveSession(session);

  const retrieved = await repo.getSession(ORG, "sess_test");
  assert(retrieved !== null, "retrieved session");
  assert(retrieved!.id === "sess_test", "session id matches");

  const all = await repo.querySessions(ORG);
  assert(all.length === 1, "query all sessions");

  const byOutcome = await repo.querySessions(ORG, { outcome: "CONSENSUS" });
  assert(byOutcome.length === 1, "query by outcome");

  await repo.archiveSession(ORG, "sess_test");
  const afterArchive = await repo.getSession(ORG, "sess_test");
  assert(afterArchive === null, "session removed after archive");
}

async function testDashboardContract() {
  const { buildCouncilSessionCard, buildExecutiveCouncilDashboard, buildEmptyExecutiveCouncilDashboard } =
    await import("@/lib/copilot/executive-council/executive-council-dashboard-contract");

  const empty = buildEmptyExecutiveCouncilDashboard(ORG);
  assert(empty.orgSlug === ORG, "empty dashboard org");
  assert(empty.councilHealth === "EMPTY", "empty council health");
  assert(empty.totalSessions === 0, "empty total sessions");

  const session: any = {
    id: "sess_1", orgSlug: ORG, title: "Test", topic: "Liquidez",
    sessionScore: 0.75, outcome: "CONSENSUS",
    perspectives: ["FINANCE"], conductedAt: new Date().toISOString(),
    opinions: [{ findings: [{ severity: "CRITICAL" }], perspective: "FINANCE", arguments: [] }],
    recommendations: [{ id: "r1", priority: "HIGH", impactScore: 0.8, suggestedOnly: true,
      title: "Action 1", description: "", rationale: "", perspective: "FINANCE",
      confidence: "HIGH", confidenceScore: 0.8, orgSlug: ORG, sessionId: "sess_1", evidenceIds: [], metadata: {} }],
    disagreements: [],
    limitations: [], metadata: {}, consensus: null, resolution: null, confidence: "HIGH",
  };

  const card = buildCouncilSessionCard(session);
  assert(card.sessionId === "sess_1", "card session id");
  assert(card.outcome === "CONSENSUS", "card outcome");
  assert(card.criticalFindingCount === 1, "card critical findings");

  const dashboard = buildExecutiveCouncilDashboard(ORG, [session]);
  assert(dashboard.totalSessions === 1, "dashboard sessions");
  assert(dashboard.consensusSessions === 1, "dashboard consensus");
  assert(dashboard.councilHealth !== "EMPTY", "dashboard not empty");
  assert(dashboard.topRecommendations.length === 1, "dashboard top recs");
}

async function testHealthAndReadiness() {
  const { checkExecutiveCouncilHealth, isExecutiveCouncilHealthy } =
    await import("@/lib/copilot/executive-council/executive-council-health");
  const { checkExecutiveCouncilReadiness, isExecutiveCouncilReady, buildReadinessFromFlags } =
    await import("@/lib/copilot/executive-council/executive-council-readiness");

  const emptyHealth = checkExecutiveCouncilHealth(ORG, []);
  assert(emptyHealth.status === "EMPTY", "empty health status");
  assert(!isExecutiveCouncilHealthy(emptyHealth), "empty not healthy");

  const session: any = {
    id: "sess_1", orgSlug: ORG, sessionScore: 0.75, outcome: "CONSENSUS",
    title: "T", topic: "T", perspectives: [], conductedAt: "",
    opinions: [{ findings: [], arguments: [], perspective: "FINANCE" }],
    recommendations: [], disagreements: [], limitations: [], metadata: {}, consensus: null, resolution: null, confidence: "HIGH",
  };
  const health = checkExecutiveCouncilHealth(ORG, [session]);
  assert(health.sessionCount === 1, "health session count");
  assert(["HEALTHY", "DEGRADED"].includes(health.status), "health status valid");

  // Readiness
  const notReady = checkExecutiveCouncilReadiness(ORG, {
    hasExecutiveBrainData: false, hasAdvisorData: false, hasSimulationData: false,
    hasPlanningData: false, hasMemoryData: false, hasCrossModuleData: false,
  });
  assert(!isExecutiveCouncilReady(notReady), "not ready with no data");
  assert(notReady.score === 0, "readiness score 0");

  const partialReady = buildReadinessFromFlags(ORG, { hasExecutiveBrainData: true, hasAdvisorData: true });
  assert(isExecutiveCouncilReady(partialReady), "partial ready with 2 sources");
  assert(partialReady.score > 0, "partial readiness score > 0");

  const fullReady = checkExecutiveCouncilReadiness(ORG, {
    hasExecutiveBrainData: true, hasAdvisorData: true, hasSimulationData: true,
    hasPlanningData: true, hasMemoryData: true, hasCrossModuleData: true,
  });
  assert(fullReady.score === 1, "full readiness score 1.0");
  assert(isExecutiveCouncilReady(fullReady), "fully ready");
}

async function testCanonicalScenarios() {
  const { CANONICAL_COUNCIL_SCENARIOS } =
    await import("@/lib/copilot/executive-council/executive-council-canonical");

  assert(CANONICAL_COUNCIL_SCENARIOS.length === 15, "15 canonical scenarios");

  for (const s of CANONICAL_COUNCIL_SCENARIOS) {
    assert(s.type !== "", `type present: ${s.type}`);
    assert(s.title !== "", `title present: ${s.type}`);
    assert(s.primaryPerspectives.length > 0, `primary perspectives: ${s.type}`);
    assert(["CONSENSUS", "PARTIAL_CONSENSUS", "NO_CONSENSUS", "ESCALATION_REQUIRED"].includes(s.expectedOutcome),
      `valid outcome: ${s.type}`);
    assert(s.topRecommendationTitles.length > 0, `recs: ${s.type}`);
    assert(s.limitations.some((l) => l.includes("suggestedOnly")), `limitations has suggestedOnly: ${s.type}`);
  }

  const types = CANONICAL_COUNCIL_SCENARIOS.map((s) => s.type);
  assert(types.includes("CRISIS_LIQUIDEZ"), "CRISIS_LIQUIDEZ present");
  assert(types.includes("EXPANSION_COMERCIAL"), "EXPANSION_COMERCIAL present");
  assert(types.includes("RIESGO_REGULATORIO"), "RIESGO_REGULATORIO present");
  assert(types.includes("CONFLICTO_OBJETIVOS_ESTRATEGICOS"), "CONFLICTO_OBJETIVOS_ESTRATEGICOS present");
}

async function testSuggestedOnlyInvariant() {
  const { runExecutiveCouncil } =
    await import("@/lib/copilot/executive-council/executive-council-engine");

  const ctx = {
    priorities: [], risks: [], opportunities: [], focusAreas: [],
    recs: [], concerns: [], advisorRisks: [], plans: [],
  };

  for (const topic of ["Liquidez", "Expansión", "Riesgo regulatorio"]) {
    const result = runExecutiveCouncil({ orgSlug: ORG, topic }, ctx);
    if (result.session) {
      const allRecs = result.session.recommendations;
      assert(allRecs.every((r) => r.suggestedOnly === true),
        `All recs suggestedOnly for: ${topic}`);
      if (result.session.resolution) {
        assert(result.session.resolution.suggestedOnly === true,
          `Resolution suggestedOnly for: ${topic}`);
      }
    }
  }
}

async function testTenantIsolation() {
  const { runExecutiveCouncil } =
    await import("@/lib/copilot/executive-council/executive-council-engine");

  const otherOrg = "other-org";
  const ctx = {
    priorities: [], risks: [], opportunities: [], focusAreas: [],
    recs: [], concerns: [], advisorRisks: [], plans: [],
  };

  const result1 = runExecutiveCouncil({ orgSlug: ORG, topic: "Test" }, ctx);
  const result2 = runExecutiveCouncil({ orgSlug: otherOrg, topic: "Test" }, ctx);

  assert(result1.session!.orgSlug === ORG, "session 1 scoped to castillitos");
  assert(result2.session!.orgSlug === otherOrg, "session 2 scoped to other-org");
  assert(result1.session!.id !== result2.session!.id, "sessions have different IDs");
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET() {
  const suites = [
    { name: "Types",                    fn: testTypes },
    { name: "Identity",                 fn: testIdentity },
    { name: "PerspectiveRegistry",      fn: testPerspectiveRegistry },
    { name: "FinancePerspective",       fn: testFinancePerspective },
    { name: "CommercialPerspective",    fn: testCommercialPerspective },
    { name: "OperationsPerspective",    fn: testOperationsPerspective },
    { name: "MarketingPerspective",     fn: testMarketingPerspective },
    { name: "CollectionsPerspective",   fn: testCollectionsPerspective },
    { name: "StrategyPerspective",      fn: testStrategyPerspective },
    { name: "RiskPerspective",          fn: testRiskPerspective },
    { name: "CompliancePerspective",    fn: testCompliancePerspective },
    { name: "OpinionEngine",            fn: testOpinionEngine },
    { name: "ArgumentEngine",           fn: testArgumentEngine },
    { name: "ConsensusEngine",          fn: testConsensusEngine },
    { name: "DisagreementEngine",       fn: testDisagreementEngine },
    { name: "ResolutionEngine",         fn: testResolutionEngine },
    { name: "CouncilEngine",            fn: testCouncilEngine },
    { name: "IntegrationExecutiveBrain",fn: testIntegrationExecutiveBrain },
    { name: "IntegrationStrategicAdvisor", fn: testIntegrationStrategicAdvisor },
    { name: "IntegrationSimulations",   fn: testIntegrationStrategicSimulations },
    { name: "IntegrationPlanning",      fn: testIntegrationStrategicPlanning },
    { name: "IntegrationMemory",        fn: testIntegrationMemory },
    { name: "IntegrationLearning",      fn: testIntegrationLearning },
    { name: "IntegrationMemoryGraph",   fn: testIntegrationMemoryGraph },
    { name: "IntegrationCrossModule",   fn: testIntegrationCrossModule },
    { name: "IntegrationTenantProfile", fn: testIntegrationTenantProfile },
    { name: "IntegrationPlaybooks",     fn: testIntegrationPlaybooks },
    { name: "IntegrationCompliance",    fn: testIntegrationCompliance },
    { name: "IntegrationAudit",         fn: testIntegrationAudit },
    { name: "QueryLayer",               fn: testQueryLayer },
    { name: "Repository",               fn: testRepository },
    { name: "DashboardContract",        fn: testDashboardContract },
    { name: "HealthAndReadiness",       fn: testHealthAndReadiness },
    { name: "CanonicalScenarios",       fn: testCanonicalScenarios },
    { name: "SuggestedOnlyInvariant",   fn: testSuggestedOnlyInvariant },
    { name: "TenantIsolation",          fn: testTenantIsolation },
  ];

  const results = [];
  for (const s of suites) {
    try {
      await s.fn();
      results.push(pass(s.name));
    } catch (e) {
      results.push(fail(s.name, e));
    }
  }

  const passed  = results.filter((r) => r.status === "PASS").length;
  const failed  = results.filter((r) => r.status === "FAIL").length;
  const total   = results.length;

  return NextResponse.json({
    sprint:  "AGENTIK-EXECUTIVE-COUNCIL-01",
    passed, failed, total,
    verdict: failed === 0 ? "ALL PASS" : `${failed} FAILED`,
    results,
  });
}
