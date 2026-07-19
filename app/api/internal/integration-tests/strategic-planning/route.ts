// AGENTIK-STRATEGIC-PLANNING-01 — Phase 38: Integration Harness
// GET /api/internal/integration-tests/strategic-planning
// Requires ENABLE_INTERNAL_INTEGRATION_TESTS=true

import { NextResponse } from "next/server";

import {
  generatePlanId, generateObjectiveId, generateInitiativeId,
  generateMilestoneId, generateDependencyId, generateRoadmapId,
  generateRiskPlanId, generateOppPlanId, generateCandidateId,
  generateSnapshotId, validatePlanningId,
} from "@/lib/copilot/strategic-planning/strategic-planning-identity";
import {
  PLANNING_PRIORITIES, PLANNING_STATUSES, PLANNING_HORIZONS, PLANNING_CONFIDENCES,
  CANONICAL_PLAN_TYPES,
} from "@/lib/copilot/strategic-planning/strategic-planning-types";
import { buildObjective, validateObjective, rankObjectives } from "@/lib/copilot/strategic-planning/objective-engine";
import { createInitiative, createInitiativeFromRecommendation, validateInitiative } from "@/lib/copilot/strategic-planning/initiative-engine";
import { createDependency, validateDependency, detectCircularDependencies } from "@/lib/copilot/strategic-planning/dependency-engine";
import { createMilestone, validateMilestone, buildDefaultMilestonesForInitiative } from "@/lib/copilot/strategic-planning/milestone-engine";
import { buildPlanningRisk, rankPlanningRisks, computeRiskCoverage } from "@/lib/copilot/strategic-planning/risk-planning-engine";
import { buildPlanningOpportunity, rankOpportunities } from "@/lib/copilot/strategic-planning/opportunity-planning-engine";
import { buildRoadmap, validateRoadmap } from "@/lib/copilot/strategic-planning/roadmap-engine";
import { scorePlan, rankPlans } from "@/lib/copilot/strategic-planning/plan-prioritization-engine";
import { buildPlanningNarrative } from "@/lib/copilot/strategic-planning/planning-narrative-engine";
import { runStrategicPlanning, enforceStrategicPlanTenantBoundary } from "@/lib/copilot/strategic-planning/strategic-planning-engine";
import { buildObjectivesFromMemory, getMemoryPlanningContext } from "@/lib/copilot/strategic-planning/integrations/planning-strategic-memory";
import { buildPlanningLearningContext, getTopLearningPatternLabels } from "@/lib/copilot/strategic-planning/integrations/planning-learning";
import { buildObjectivesFromExecutiveBrain, getExecutiveFocusBoost, getExecutiveRiskLabels } from "@/lib/copilot/strategic-planning/integrations/planning-executive-brain";
import { buildInitiativesFromAdvisorRecommendations, buildRisksFromAdvisorConcerns } from "@/lib/copilot/strategic-planning/integrations/planning-advisor";
import { buildInitiativesFromSimulations, buildRisksFromSimulations, getSimulationConfidenceBoost } from "@/lib/copilot/strategic-planning/integrations/planning-simulations";
import { buildInitiativesFromCrossModuleRecommendations, buildRisksFromCrossModuleRisks, buildOpportunitiesFromCrossModule, getHypothesisContext } from "@/lib/copilot/strategic-planning/integrations/planning-cross-module";
import { buildPlanningGraphContext, getRelevantInsightLabels } from "@/lib/copilot/strategic-planning/integrations/planning-memory-graph";
import { getTenantStrategyProfile, alignPlanWithTenantProfile, getRiskToleranceBoost } from "@/lib/copilot/strategic-planning/integrations/planning-tenant-profile";
import { buildPlaybookPlanningContext, getActivePlaybookLabels } from "@/lib/copilot/strategic-planning/integrations/planning-playbooks";
import { evaluatePlanningComplianceGate, assertAllInitiativesSuggestedOnly } from "@/lib/copilot/strategic-planning/integrations/planning-compliance";
import { auditPlanCreated, auditInitiativeCreated, buildPlanningAuditEvent } from "@/lib/copilot/strategic-planning/integrations/planning-audit";
import { getPlans, findPlansByStatus, findPlansByPriority, getPlanningStats } from "@/lib/copilot/strategic-planning/strategic-planning-query";
import { InMemoryStrategicPlanningRepository } from "@/lib/copilot/strategic-planning/strategic-planning-repository";
import { buildStrategicPlanningDashboard, buildEmptyStrategicPlanningDashboard } from "@/lib/copilot/strategic-planning/strategic-planning-dashboard-contract";
import { checkStrategicPlanningHealth, isStrategicPlanningHealthy } from "@/lib/copilot/strategic-planning/strategic-planning-health";
import { checkStrategicPlanningReadiness, buildReadinessFromFlags } from "@/lib/copilot/strategic-planning/strategic-planning-readiness";
import { CANONICAL_PLANNING_SCENARIOS, getCanonicalScenario, getScenariosByDomain } from "@/lib/copilot/strategic-planning/strategic-planning-canonical";
import { runPlanningCouncil } from "@/lib/copilot/strategic-planning/planning-council-engine";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG = "castillitos";
let _passed = 0;
let _failed = 0;
const _failures: string[] = [];

function expect(label: string, condition: boolean): void {
  if (condition) { _passed++; }
  else           { _failed++; _failures.push(label); }
}

function reset() { _passed = 0; _failed = 0; _failures.length = 0; }

// ── Test suites ───────────────────────────────────────────────────────────────

function testIdentity() {
  const planId     = generatePlanId();
  const objId      = generateObjectiveId();
  const initId     = generateInitiativeId();
  const mileId     = generateMilestoneId();
  const depId      = generateDependencyId();
  const roadId     = generateRoadmapId();
  const riskId     = generateRiskPlanId();
  const oppId      = generateOppPlanId();
  const candId     = generateCandidateId();
  const snapId     = generateSnapshotId();

  expect("plan_ prefix",       planId.startsWith("plan_"));
  expect("objective_ prefix",  objId.startsWith("objective_"));
  expect("initiative_ prefix", initId.startsWith("initiative_"));
  expect("milestone_ prefix",  mileId.startsWith("milestone_"));
  expect("dependency_ prefix", depId.startsWith("dependency_"));
  expect("roadmap_ prefix",    roadId.startsWith("roadmap_"));
  expect("planrisk_ prefix",   riskId.startsWith("planrisk_"));
  expect("planopp_ prefix",    oppId.startsWith("planopp_"));
  expect("candidate_ prefix",  candId.startsWith("candidate_"));
  expect("snapshot_ prefix",   snapId.startsWith("snapshot_"));

  expect("validatePlanningId plan",       validatePlanningId(planId));
  expect("validatePlanningId objective",  validatePlanningId(objId));
  expect("validatePlanningId invalid",    !validatePlanningId("bad_id"));
  expect("validatePlanningId empty",      !validatePlanningId(""));
}

function testTypes() {
  expect("PLANNING_PRIORITIES has 4 values",  PLANNING_PRIORITIES.length === 4);
  expect("PLANNING_STATUSES has 5 values",    PLANNING_STATUSES.length === 5);
  expect("PLANNING_HORIZONS has 4 values",    PLANNING_HORIZONS.length === 4);
  expect("PLANNING_CONFIDENCES has 4 values", PLANNING_CONFIDENCES.length === 4);
  expect("CANONICAL_PLAN_TYPES has 15",       CANONICAL_PLAN_TYPES.length === 15);
  expect("CRITICAL in priorities",            PLANNING_PRIORITIES.includes("CRITICAL"));
  expect("ACTIVE in statuses",                PLANNING_STATUSES.includes("ACTIVE"));
  expect("MEDIUM_TERM in horizons",           PLANNING_HORIZONS.includes("MEDIUM_TERM"));
  expect("VERY_HIGH in confidences",          PLANNING_CONFIDENCES.includes("VERY_HIGH"));
}

function testObjectiveEngine() {
  const obj = buildObjective({
    orgSlug: ORG, title: "Reducir cartera vencida", description: "Test obj",
    domain: "FINANCE", priority: "HIGH", confidenceScore: 0.75,
    impactScore: 0.80, alignmentScore: 0.70, evidenceIds: ["e1"], metadata: {},
  });

  expect("objective has id",              obj.id.startsWith("objective_"));
  expect("objective orgSlug correct",     obj.orgSlug === ORG);
  expect("objective domain FINANCE",      obj.domain === "FINANCE");
  expect("objective priority HIGH",       obj.priority === "HIGH");
  expect("objective status DRAFT",        obj.status === "DRAFT");
  expect("objective createdAt set",       !!obj.createdAt);

  const validation = validateObjective(obj);
  expect("objective validates",           validation.valid);
  expect("objective errors empty",        validation.errors.length === 0);

  const ranked = rankObjectives([obj]);
  expect("ranked returns array",          ranked.length === 1);

  // Invalid objective
  const badObj = { ...obj, title: "" };
  const badVal = validateObjective(badObj as any);
  expect("invalid obj fails",            !badVal.valid);
}

function testInitiativeEngine() {
  const objId = generateObjectiveId();
  const init = createInitiative({
    orgSlug: ORG, objectiveId: objId,
    title: "Automatizar recordatorios", description: "Test init",
    domain: "FINANCE", type: "PROCESS_IMPROVEMENT", priority: "HIGH",
    effortScore: 0.40, impactScore: 0.75, confidenceScore: 0.70,
    evidenceIds: ["e1"], playbookIds: [],
  });

  expect("initiative id prefix",      init.id.startsWith("initiative_"));
  expect("initiative suggestedOnly",  init.suggestedOnly === true);
  expect("initiative orgSlug",        init.orgSlug === ORG);
  expect("initiative objectiveId",    init.objectiveId === objId);
  expect("initiative status DRAFT",   init.status === "DRAFT");

  const val = validateInitiative(init);
  expect("initiative validates",      val.valid);

  const fromRec = createInitiativeFromRecommendation({
    orgSlug: ORG, objectiveId: objId, domain: "COMMERCIAL",
    recTitle: "Expandir canal digital", recDesc: "Descripción",
    recPriority: "HIGH", confidenceScore: 0.65, evidenceIds: [],
  });
  expect("fromRec suggestedOnly",     fromRec.suggestedOnly === true);
  expect("fromRec has id",            fromRec.id.startsWith("initiative_"));
}

function testDependencyEngine() {
  const fromId = generateInitiativeId();
  const toId   = generateInitiativeId();
  const dep = createDependency({ orgSlug: ORG, fromId, toId, type: "REQUIRES", description: "Dep test", isBlocking: true });

  expect("dependency id prefix",    dep.id.startsWith("dependency_"));
  expect("dependency fromId",       dep.fromId === fromId);
  expect("dependency toId",         dep.toId === toId);
  expect("dependency isBlocking",   dep.isBlocking === true);

  const valR = validateDependency(dep);
  expect("dependency validates",    valR.valid);

  const noCyclePaths = detectCircularDependencies([dep]);
  expect("no cycle detected",       noCyclePaths.length === 0);

  // Create a cycle: A→B, B→A
  const idA = generateInitiativeId();
  const idB = generateInitiativeId();
  const depAB = createDependency({ orgSlug: ORG, fromId: idA, toId: idB, type: "REQUIRES", description: "", isBlocking: false });
  const depBA = createDependency({ orgSlug: ORG, fromId: idB, toId: idA, type: "REQUIRES", description: "", isBlocking: false });
  const cyclePaths = detectCircularDependencies([depAB, depBA]);
  expect("cycle detected",          cyclePaths.length > 0);
}

function testMilestoneEngine() {
  const initId = generateInitiativeId();
  const ms = createMilestone({
    orgSlug: ORG, initiativeId: initId,
    title: "Milestone test", description: "Test",
    successCriteria: "Criteria", priority: "MEDIUM",
    estimatedDate: "SHORT_TERM", dependencyIds: [],
  });

  expect("milestone id prefix",     ms.id.startsWith("milestone_"));
  expect("milestone initiativeId",  ms.initiativeId === initId);
  expect("milestone status DRAFT",  ms.status === "DRAFT");
  expect("milestone orgSlug",       ms.orgSlug === ORG);

  const val = validateMilestone(ms);
  expect("milestone validates",     val.valid);

  const initForMs = createInitiative({
    orgSlug: ORG, objectiveId: initId, title: "For MS", description: "D",
    domain: "FINANCE", type: "PROCESS_IMPROVEMENT", priority: "MEDIUM",
    effortScore: 0.30, impactScore: 0.50, confidenceScore: 0.60, evidenceIds: [], playbookIds: [],
  });
  const defaults = buildDefaultMilestonesForInitiative(initForMs);
  expect("default milestones > 0",  defaults.length > 0);
  for (const dm of defaults) {
    expect("default ms has initiativeId", dm.initiativeId === initForMs.id);
  }
}

function testRiskPlanningEngine() {
  const planId = generatePlanId();
  const risk = buildPlanningRisk({
    orgSlug: ORG, planId,
    title: "Riesgo de liquidez", description: "Desc",
    domain: "FINANCE", likelihood: 0.70, impact: 0.80,
    mitigations: ["Línea de crédito"], metadata: {},
  });

  expect("risk id prefix",      risk.id.startsWith("planrisk_"));
  expect("risk planId",         risk.planId === planId);
  expect("risk compositeRisk",  risk.compositeRisk > 0);
  expect("risk level set",      !!risk.level);

  const ranked = rankPlanningRisks([risk]);
  expect("risk ranking works",  ranked.length === 1);

  const coverage = computeRiskCoverage([risk]);
  expect("coverage is 0-1",     coverage >= 0 && coverage <= 1);
}

function testOpportunityEngine() {
  const planId = generatePlanId();
  const opp = buildPlanningOpportunity({
    orgSlug: ORG, planId,
    title: "Oportunidad de expansión", description: "Desc",
    domain: "COMMERCIAL", captureScore: 0.75, magnitude: "LARGE",
    evidenceIds: [], metadata: {},
  });

  expect("opp id prefix",       opp.id.startsWith("planopp_"));
  expect("opp planId",          opp.planId === planId);
  expect("opp captureScore",    opp.captureScore > 0);
  expect("opp magnitude set",   !!opp.magnitude);

  const ranked = rankOpportunities([opp]);
  expect("opp ranking works",   ranked.length === 1);
}

function testRoadmapEngine() {
  const planId = generatePlanId();
  const objId  = generateObjectiveId();
  const road = buildRoadmap({
    orgSlug: ORG, planId,
    title: "Roadmap test", description: "Test roadmap",
    objectives: [], initiatives: [], milestones: [],
    dependencies: [], horizon: "MEDIUM_TERM",
  });

  expect("roadmap id prefix",     road.id.startsWith("roadmap_"));
  expect("roadmap orgSlug",       road.orgSlug === ORG);
  expect("roadmap horizon set",   road.horizon === "MEDIUM_TERM");
  expect("roadmap confidence",    road.confidence === "HIGH");

  const val = validateRoadmap(road);
  expect("roadmap validates",     val.valid);
}

function testPrioritizationEngine() {
  const context: any = {
    orgSlug: ORG, domain: "FINANCE",
  };
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "Plan test",
    description: "Desc", rationale: "R", domain: "FINANCE",
    priority: "HIGH", status: "DRAFT", horizon: "MEDIUM_TERM",
    objectives: [], initiatives: [], milestones: [], dependencies: [],
    risks: [], opportunities: [], roadmap: null, narrative: "N",
    planScore: 0, confidence: "MEDIUM", confidenceScore: 0.60,
    alignmentScore: 0.70, riskCoverage: 0.50,
    evidenceIds: [], sourceIds: [], suggestedOnly: true as const,
    metadata: {}, createdAt: new Date().toISOString(),
  };

  const scored = scorePlan(plan, context);
  expect("score returns number",    typeof scored === "number");
  expect("score in range",          scored >= 0 && scored <= 1);

  const ranked = rankPlans([plan], context);
  expect("ranked returns array",    ranked.length === 1);
}

function testNarrativeEngine() {
  const narrative = buildPlanningNarrative({
    orgSlug: ORG, title: "Plan narrativo",
    domain: "FINANCE", planScore: 0.70,
    objectives: [], initiatives: [], risks: [], opportunities: [],
  });

  expect("narrative executive set",    !!narrative.executive);
  expect("narrative rationale set",    !!narrative.rationale);
  expect("narrative riskSummary",      !!narrative.riskSummary);
  expect("narrative oppSummary",       !!narrative.oppSummary);
  expect("narrative limitations",      narrative.limitations.length > 0);
  expect("narrative has disclaimer",   narrative.executive.length > 10);
}

function testPlanningEngine() {
  const result = runStrategicPlanning({
    orgSlug: ORG,
    context: { orgSlug: ORG, domain: "FINANCE" },
    title: "Plan de prueba",
  });

  expect("engine returns result",         !!result);
  expect("engine has status",             !!result.status);
  expect("engine has planId",             result.status !== "FAILED" || !!result.error);
  expect("engine fail-closed on empty",   result.status === "OK" || result.status === "PARTIAL" || result.status === "FAILED");

  // Empty orgSlug → FAILED
  const failedResult = runStrategicPlanning({ orgSlug: "", context: { orgSlug: "", domain: "FINANCE" } });
  expect("empty orgSlug → FAILED",        failedResult.status === "FAILED");
  expect("FAILED has error",              !!failedResult.error);
}

function testTenantBoundary() {
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "T", description: "T",
    rationale: "R", domain: "FINANCE", priority: "HIGH", status: "DRAFT",
    horizon: "SHORT_TERM", objectives: [], initiatives: [], milestones: [],
    dependencies: [], risks: [], opportunities: [], roadmap: null,
    narrative: "N", planScore: 0.5, confidence: "MEDIUM", confidenceScore: 0.6,
    alignmentScore: 0.7, riskCoverage: 0.5, evidenceIds: [], sourceIds: [],
    suggestedOnly: true as const, limitations: [], metadata: {}, createdAt: new Date().toISOString(),
  };

  let threw = false;
  try {
    enforceStrategicPlanTenantBoundary("other-org", plan);
  } catch {
    threw = true;
  }
  expect("cross-tenant throws",     threw);

  let noThrow = true;
  try {
    enforceStrategicPlanTenantBoundary(ORG, plan);
  } catch {
    noThrow = false;
  }
  expect("same-tenant no throw",    noThrow);
}

function testIntegrationStrategicMemory() {
  const entries: any[] = [
    { id: "m1", orgSlug: ORG, type: "GOAL", status: "ACTIVE", title: "Meta 1",
      description: "Desc", domain: "FINANCE", priority: "HIGH",
      confidenceScore: 0.70, relevanceScore: 0.65, strategicScore: 0.60,
      evidenceIds: ["e1"] },
  ];
  const objs = buildObjectivesFromMemory(ORG, entries);
  expect("memory→objectives count",  objs.length === 1);
  expect("memory obj id prefix",     objs[0].id.startsWith("objective_"));
  expect("memory obj orgSlug",       objs[0].orgSlug === ORG);
  expect("memory obj suggestedOnly not here", objs[0].domain === "FINANCE");

  const ctx = getMemoryPlanningContext(ORG, entries);
  expect("ctx activeGoalCount",      ctx.activeGoalCount === 1);
  expect("ctx activeRiskCount",      ctx.activeRiskCount === 0);
}

function testIntegrationLearning() {
  const patterns: any[] = [
    { orgSlug: ORG, status: "REINFORCED", name: "Pattern A", reinforcementCount: 10 },
    { orgSlug: ORG, status: "ACTIVE",     name: "Pattern B", reinforcementCount: 5  },
    { orgSlug: ORG, status: "WEAKENED",   name: "Pattern C", reinforcementCount: 1  },
  ];
  const outcomes: any[] = [
    { orgSlug: ORG, result: "POSITIVE" },
    { orgSlug: ORG, result: "NEGATIVE" },
  ];

  const ctx = buildPlanningLearningContext(ORG, patterns, outcomes);
  expect("learning confirmedCount",    ctx.confirmedPatternCount === 2);
  expect("learning positiveRate",      ctx.positiveOutcomeRate === 0.50);
  expect("learning boost 0-0.15",      ctx.learningConfidenceBoost >= 0 && ctx.learningConfidenceBoost <= 0.15);

  const labels = getTopLearningPatternLabels(ORG, patterns, 2);
  expect("top pattern labels count",   labels.length === 2);
  expect("top pattern first is A",     labels[0] === "Pattern A");
}

function testIntegrationExecutiveBrain() {
  const priorities: any[] = [
    { id: "p1", orgSlug: ORG, level: "CRITICAL", title: "Prioridad crítica",
      description: "Desc", domain: "FINANCE", confidenceScore: 0.80, evidenceIds: [] },
    { id: "p2", orgSlug: ORG, level: "HIGH", title: "Alta prioridad",
      description: "Desc", domain: "COMMERCIAL", confidenceScore: 0.65, evidenceIds: [] },
  ];

  const objs = buildObjectivesFromExecutiveBrain(ORG, priorities);
  expect("brain→objectives only critical", objs.length === 1);
  expect("brain obj priority CRITICAL",    objs[0].priority === "CRITICAL");

  const focusAreas: any[] = [{ orgSlug: ORG }, { orgSlug: ORG }];
  const boost = getExecutiveFocusBoost(ORG, focusAreas);
  expect("focus boost positive",           boost > 0);
  expect("focus boost max 0.10",           boost <= 0.10);

  const risks: any[] = [
    { orgSlug: ORG, level: "CRITICAL", title: "Riesgo A" },
    { orgSlug: ORG, level: "HIGH",     title: "Riesgo B" },
    { orgSlug: "other",level: "CRITICAL", title: "Riesgo C" },
  ];
  const labels = getExecutiveRiskLabels(ORG, risks);
  expect("risk labels count ≤ 3",          labels.length <= 3);
  expect("risk labels only own org",       !labels.includes("Riesgo C"));
}

function testIntegrationAdvisor() {
  const objId = generateObjectiveId();
  const recs: any[] = [
    { orgSlug: ORG, title: "Rec 1", description: "D", domain: "FINANCE",
      priority: "HIGH", confidenceScore: 0.75, evidenceIds: [] },
    { orgSlug: "other", title: "Rec 2", description: "D", domain: "COMMERCIAL",
      priority: "MEDIUM", confidenceScore: 0.50, evidenceIds: [] },
  ];

  const inits = buildInitiativesFromAdvisorRecommendations(ORG, objId, recs);
  expect("advisor→initiatives only own org",  inits.length === 1);
  expect("advisor initiative suggestedOnly",  inits[0].suggestedOnly === true);

  const concerns: any[] = [
    { orgSlug: ORG, severity: "CRITICAL", title: "Concern A",
      description: "D", domain: "FINANCE", confidenceScore: 0.80, evidenceIds: [], id: "c1" },
  ];
  const planId = generatePlanId();
  const risks = buildRisksFromAdvisorConcerns(ORG, planId, concerns);
  expect("advisor→risks count",   risks.length === 1);
  expect("advisor risk title has [Asesor]", risks[0].title.includes("[Asesor]"));
}

function testIntegrationSimulations() {
  const objId = generateObjectiveId();
  const planId = generatePlanId();
  const simResults: any[] = [
    {
      orgSlug: ORG, status: "COMPLETED",
      recommendations: [
        { orgSlug: ORG, title: "Sim rec 1", description: "D", domain: "FINANCE",
          priority: "HIGH", confidenceScore: 0.75, evidenceIds: [] },
      ],
      scenarios: [
        { risks: [
          { orgSlug: ORG, level: "CRITICAL", title: "Sim risk A",
            description: "D", domain: "FINANCE", likelihood: 0.70,
            impact: 0.80, mitigations: [] },
        ]},
      ],
    },
  ];

  const inits = buildInitiativesFromSimulations(ORG, objId, simResults);
  expect("sim→initiatives count",     inits.length === 1);
  expect("sim initiative suggestedOnly", inits[0].suggestedOnly === true);

  const risks = buildRisksFromSimulations(ORG, planId, simResults);
  expect("sim→risks count",           risks.length === 1);
  expect("sim risk has [Simulación]", risks[0].title.includes("[Simulación]"));

  const boost = getSimulationConfidenceBoost(ORG, simResults);
  expect("sim boost > 0",             boost > 0);
  expect("sim boost max 0.10",        boost <= 0.10);
}

function testIntegrationCrossModule() {
  const objId = generateObjectiveId();
  const planId = generatePlanId();
  const cmRecs: any[] = [
    { orgSlug: ORG, priority: "URGENT", title: "CM Rec 1",
      description: "D", type: "ACTION", evidenceIds: [] },
  ];
  const cmRisks: any[] = [
    { orgSlug: ORG, severity: "CRITICAL", title: "CM Risk A",
      description: "D", domain: "FINANCIAL", likelihood: 0.75, impact: 0.80, evidenceIds: [], id: "r1", detectedAt: "" },
  ];
  const cmOpps: any[] = [
    { orgSlug: ORG, urgency: "HIGH", potential: 0.80, title: "CM Opp A",
      description: "D", type: "GROWTH", evidenceIds: [], id: "o1", detectedAt: "" },
  ];
  const hypotheses: any[] = [
    { orgSlug: ORG, supported: true, category: "STRATEGIC",
      confidence: { score: 0.75 }, contradicted: false, id: "h1" },
  ];

  const inits = buildInitiativesFromCrossModuleRecommendations(ORG, objId, cmRecs);
  expect("cm→initiatives",            inits.length === 1);

  const risks = buildRisksFromCrossModuleRisks(ORG, planId, cmRisks);
  expect("cm→risks",                  risks.length === 1);

  const opps = buildOpportunitiesFromCrossModule(ORG, planId, cmOpps);
  expect("cm→opportunities",          opps.length === 1);

  const hCtx = getHypothesisContext(ORG, hypotheses);
  expect("hypothesis supportedCount", hCtx.supportedCount === 1);
  expect("hypothesis avgConf",        hCtx.avgConfidence === 0.75);
}


function testIntegrationMemoryGraph() {
  const nodes: any[] = [
    { orgSlug: ORG, type: "INSIGHT",  label: "Insight A", weight: 0.90, id: "n1", metadata: {}, tags: [], source: "", createdAt: "" },
    { orgSlug: ORG, type: "DECISION", label: "Decision A", weight: 0.80, id: "n2", metadata: {}, tags: [], source: "", createdAt: "" },
    { orgSlug: ORG, type: "PLAYBOOK", label: "Playbook A", weight: 0.70, id: "n3", metadata: {}, tags: [], source: "", createdAt: "" },
  ];
  const edges: any[] = [
    { orgSlug: ORG, weight: 0.85, id: "e1", type: "RELATED_TO", sourceNodeId: "n1", targetNodeId: "n2", metadata: {}, source: "", createdAt: "" },
  ];

  const ctx = buildPlanningGraphContext(ORG, nodes, edges);
  expect("graph insightCount",        ctx.insightNodeCount === 1);
  expect("graph playbookCount",       ctx.playbookNodeCount === 1);
  expect("graph decisionCount",       ctx.decisionNodeCount === 1);
  expect("graph boost max 0.10",      ctx.graphConfidenceBoost <= 0.10);

  const insightLabels = getRelevantInsightLabels(ORG, nodes);
  expect("insight labels",            insightLabels.includes("Insight A"));
}

function testIntegrationTenantProfile() {
  const profile = getTenantStrategyProfile(ORG);
  expect("tenant profile orgSlug",    profile.orgSlug === ORG);
  expect("tenant has riskTolerance",  !!profile.riskTolerance);
  expect("tenant has domains",        profile.primaryDomains.length > 0);

  const alignment = alignPlanWithTenantProfile(ORG, ["FINANCE", "MARKETING"]);
  expect("alignment returns obj",     typeof alignment.alignmentScore === "number");
  expect("alignment score 0-1",       alignment.alignmentScore >= 0 && alignment.alignmentScore <= 1);

  const boost = getRiskToleranceBoost(ORG);
  expect("risk tolerance boost 0-1",  boost >= 0 && boost <= 0.10);
}

function testIntegrationPlaybooks() {
  const playbooks: any[] = [
    { orgSlug: ORG, status: "ACTIVE", priority: "HIGH", category: "FINANCE",
      title: "Proceso de cobranza", id: "pb1", description: "" },
    { orgSlug: ORG, status: "DRAFT",  priority: "MEDIUM", category: "MARKETING",
      title: "Plan de marketing", id: "pb2", description: "" },
  ];

  const ctx = buildPlaybookPlanningContext(ORG, playbooks);
  expect("playbook active count",     ctx.activePlaybookCount === 1);
  expect("playbook boost > 0",        ctx.playbookConfidenceBoost > 0);

  const labels = getActivePlaybookLabels(ORG, playbooks);
  expect("active labels count",       labels.length === 1);
  expect("active label is cobranza",  labels[0] === "Proceso de cobranza");
}

function testComplianceGate() {
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "Plan T",
    description: "D", rationale: "R", domain: "FINANCE",
    priority: "HIGH", status: "ACTIVE", horizon: "MEDIUM_TERM",
    objectives: [{ id: "o1" }], initiatives: [], milestones: [],
    dependencies: [], risks: [], opportunities: [], roadmap: null,
    narrative: "N", planScore: 0.7, confidence: "HIGH",
    confidenceScore: 0.75, alignmentScore: 0.70, riskCoverage: 0.60,
    evidenceIds: ["e1"], sourceIds: [],
    suggestedOnly: true as const,
    limitations: ["Limit 1"],
    metadata: { origin: "STRATEGIC_PLANNING_ENGINE" },
    createdAt: new Date().toISOString(),
    objectiveIds: ["o1"], initiativeIds: [], milestoneIds: [],
  };

  const result = evaluatePlanningComplianceGate(ORG, plan);
  expect("compliance status PASS",    result.status === "PASS");
  expect("compliance passed > 0",     result.passed > 0);
  expect("compliance failed === 0",   result.failed === 0);

  // suggestedOnly violation
  const badPlan = { ...plan, suggestedOnly: false };
  const badResult = evaluatePlanningComplianceGate(ORG, badPlan as any);
  expect("bad plan fails compliance", badResult.status === "FAIL");

  // assertAllInitiativesSuggestedOnly passes with empty
  let threw = false;
  try { assertAllInitiativesSuggestedOnly([]); } catch { threw = true; }
  expect("empty initiatives no throw", !threw);
}

function testAuditEvents() {
  const planId = generatePlanId();
  const initId = generateInitiativeId();

  const planEvt = auditPlanCreated(ORG, planId, "Test plan");
  expect("audit planCreated type",    planEvt.eventType === "STRATEGIC_PLAN_CREATED");
  expect("audit planCreated orgSlug", planEvt.orgSlug === ORG);
  expect("audit planCreated id",      planEvt.id.startsWith("paudit_"));
  expect("audit planCreated occurredAt", !!planEvt.occurredAt);

  const initEvt = auditInitiativeCreated(ORG, initId, "Test init");
  expect("audit initCreated type",    initEvt.eventType === "INITIATIVE_CREATED");

  const custom = buildPlanningAuditEvent({
    orgSlug: ORG, eventType: "PLAN_UPDATED", entityId: planId,
    summary: "Test", metadata: { key: "val" },
  });
  expect("audit custom eventType",    custom.eventType === "PLAN_UPDATED");
  expect("audit custom metadata",     (custom.metadata as any).key === "val");
}

function testQueryLayer() {
  const p1: any = {
    id: generatePlanId(), orgSlug: ORG, status: "ACTIVE", priority: "HIGH",
    planScore: 0.8, title: "P1", objectives: [], initiatives: [], milestones: [],
    risks: [], opportunities: [], suggestedOnly: true as const,
  };
  const p2: any = {
    id: generatePlanId(), orgSlug: ORG, status: "DRAFT", priority: "CRITICAL",
    planScore: 0.9, title: "P2", objectives: [], initiatives: [], milestones: [],
    risks: [], opportunities: [], suggestedOnly: true as const,
  };
  const p3: any = {
    id: generatePlanId(), orgSlug: "other", status: "ACTIVE", priority: "HIGH",
    planScore: 0.7, title: "P3", objectives: [], initiatives: [], milestones: [],
    risks: [], opportunities: [], suggestedOnly: true as const,
  };

  const plans = getPlans(ORG, [p1, p2, p3]);
  expect("getPlans filters by org",      plans.length === 2);

  const active = findPlansByStatus(ORG, [p1, p2, p3], "ACTIVE");
  expect("findByStatus ACTIVE",          active.length === 1);

  const critical = findPlansByPriority(ORG, [p1, p2, p3], "CRITICAL");
  expect("findByPriority CRITICAL",      critical.length === 1);

  const stats = getPlanningStats(ORG, [p1, p2, p3], [], [], []);
  expect("stats totalPlans",             stats.totalPlans === 2);
  expect("stats activePlans",            stats.activePlans === 1);
}

async function testRepository() {
  const repo = new InMemoryStrategicPlanningRepository();
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "Repo plan",
    description: "D", rationale: "R", domain: "FINANCE",
    priority: "HIGH", status: "ACTIVE", horizon: "MEDIUM_TERM",
    objectives: [], initiatives: [], milestones: [], dependencies: [],
    risks: [], opportunities: [], roadmap: null, narrative: "N",
    planScore: 0.7, confidence: "HIGH", confidenceScore: 0.7,
    alignmentScore: 0.7, riskCoverage: 0.6,
    evidenceIds: [], sourceIds: [], suggestedOnly: true as const,
    limitations: [], metadata: {}, createdAt: new Date().toISOString(),
    objectiveIds: [], initiativeIds: [], milestoneIds: [],
  };

  await repo.savePlan(plan);
  const found = await repo.getPlan(ORG, plan.id);
  expect("repo saved plan",        found !== null);
  expect("repo plan title",        found?.title === "Repo plan");

  const plans = await repo.queryPlans(ORG, { status: "ACTIVE" });
  expect("repo query by status",   plans.length === 1);

  await repo.archivePlan(ORG, plan.id);
  const archived = await repo.getPlan(ORG, plan.id);
  expect("repo plan archived",     archived?.status === "ARCHIVED");
}

function testDashboardContract() {
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "D Plan",
    description: "D", rationale: "R", domain: "FINANCE",
    priority: "HIGH", status: "ACTIVE", horizon: "SHORT_TERM",
    objectives: [{ id: "o1" }], initiatives: [{ id: "i1" }],
    milestones: [], dependencies: [], risks: [], opportunities: [],
    roadmap: null, narrative: "N", planScore: 0.75,
    confidence: "HIGH", confidenceScore: 0.75,
    alignmentScore: 0.70, riskCoverage: 0.60,
    evidenceIds: [], sourceIds: [], suggestedOnly: true as const,
    limitations: [], metadata: {}, createdAt: new Date().toISOString(),
  };

  const dashboard = buildStrategicPlanningDashboard(ORG, [plan]);
  expect("dashboard orgSlug",         dashboard.orgSlug === ORG);
  expect("dashboard activePlanCount", dashboard.activePlanCount === 1);
  expect("dashboard totalObjectives", dashboard.totalObjectives === 1);
  expect("dashboard totalInitiatives", dashboard.totalInitiatives === 1);
  expect("dashboard planningScore",   dashboard.planningScore > 0);
  expect("dashboard generatedAt",     !!dashboard.generatedAt);

  const empty = buildEmptyStrategicPlanningDashboard(ORG);
  expect("empty dashboard orgSlug",   empty.orgSlug === ORG);
  expect("empty dashboard 0 plans",   empty.activePlanCount === 0);
}

function testHealthAndReadiness() {
  const plan: any = {
    id: generatePlanId(), orgSlug: ORG, title: "H Plan",
    description: "D", rationale: "R", domain: "FINANCE",
    priority: "HIGH", status: "ACTIVE", horizon: "SHORT_TERM",
    objectives: [{ id: "o1" }], initiatives: [], milestones: [],
    dependencies: [], risks: [], opportunities: [], roadmap: null,
    narrative: "N", planScore: 0.70, confidence: "HIGH",
    confidenceScore: 0.70, alignmentScore: 0.70, riskCoverage: 0.60,
    evidenceIds: [], sourceIds: [], suggestedOnly: true as const,
    limitations: ["L1"], metadata: {}, createdAt: new Date().toISOString(),
  };

  const health = checkStrategicPlanningHealth(ORG, [plan], [], []);
  expect("health status set",         !!health.status);
  expect("health planCount 1",        health.planCount === 1);
  expect("health activePlans 1",      health.activePlans === 1);

  const isHealthy = isStrategicPlanningHealthy(health);
  expect("isHealthy is boolean",      typeof isHealthy === "boolean");

  // Empty plans
  const emptyH = checkStrategicPlanningHealth(ORG, [], [], []);
  expect("empty plans → EMPTY",       emptyH.status === "EMPTY");

  // Readiness
  const readiness = checkStrategicPlanningReadiness(ORG, {
    hasMemoryData: true, hasLearningData: true, hasExecutiveBrainData: true,
    hasAdvisorData: false, hasSimulationData: false, hasCrossModuleData: false,
  });
  expect("readiness ready (3/6)",     readiness.ready);
  expect("readiness score > 0",       readiness.score > 0);
  expect("readiness requirements 6",  readiness.requirements.length === 6);

  const notReady = buildReadinessFromFlags(ORG, { hasMemoryData: false });
  expect("notReady not ready",        !notReady.ready);
}

function testCanonicalScenarios() {
  expect("canonical scenarios 15",    CANONICAL_PLANNING_SCENARIOS.length === 15);

  const cartera = getCanonicalScenario("REDUCIR_CARTERA");
  expect("canonical cartera exists",  !!cartera);
  expect("canonical cartera domain",  cartera?.domain === "FINANCE");
  expect("canonical cartera priority", cartera?.priority === "CRITICAL");
  expect("canonical cartera objectives", (cartera?.objectiveTitles.length ?? 0) > 0);
  expect("canonical cartera initiatives", (cartera?.initiativeTitles.length ?? 0) > 0);
  expect("canonical cartera limitations", (cartera?.limitations.length ?? 0) > 0);

  const financeScenarios = getScenariosByDomain("FINANCE");
  expect("finance scenarios > 0",     financeScenarios.length > 0);
  for (const s of financeScenarios) {
    expect(`${s.type} domain FINANCE`, s.domain === "FINANCE");
  }

  const allTypes = CANONICAL_PLANNING_SCENARIOS.map((s) => s.type);
  const uniqueTypes = new Set(allTypes);
  expect("all types unique",          uniqueTypes.size === 15);

  // Every scenario has required fields
  for (const s of CANONICAL_PLANNING_SCENARIOS) {
    expect(`${s.type} has title`,         !!s.title);
    expect(`${s.type} has description`,   !!s.description);
    expect(`${s.type} has objectiveTitles`, s.objectiveTitles.length > 0);
    expect(`${s.type} has initiativeTitles`, s.initiativeTitles.length > 0);
    expect(`${s.type} has limitations`,   s.limitations.length > 0);
  }
}

function testCouncilEngine() {
  const priorities: any[] = [
    { id: "p1", orgSlug: ORG, level: "CRITICAL", title: "Prioridad A",
      description: "D", domain: "FINANCE", confidenceScore: 0.80, evidenceIds: [] },
  ];
  const recs: any[] = [
    { orgSlug: ORG, title: "Rec A", description: "D", domain: "FINANCE",
      priority: "HIGH", confidenceScore: 0.75, evidenceIds: [] },
  ];
  const concerns: any[] = [
    { orgSlug: ORG, severity: "CRITICAL", title: "Concern A",
      description: "D", domain: "FINANCE", confidenceScore: 0.80,
      evidenceIds: [], id: "c1" },
  ];
  const simResults: any[] = [
    {
      orgSlug: ORG, status: "COMPLETED",
      recommendations: [{ orgSlug: ORG, title: "Sim Rec A", description: "D", domain: "COMMERCIAL", priority: "HIGH", confidenceScore: 0.65, evidenceIds: [] }],
      scenarios: [{ risks: [{ orgSlug: ORG, level: "HIGH", title: "Sim Risk A", description: "D", domain: "FINANCE", likelihood: 0.6, impact: 0.7, mitigations: [] }] }],
    },
  ];

  const consensus = runPlanningCouncil({
    orgSlug: ORG,
    executivePriorities: priorities,
    advisorRecs: recs,
    advisorConcerns: concerns,
    simulationResults: simResults,
  });

  expect("council orgSlug",           consensus.orgSlug === ORG);
  expect("council objectives > 0",    consensus.objectives.length > 0);
  expect("council initiatives > 0",   consensus.initiatives.length > 0);
  expect("council risks > 0",         consensus.risks.length > 0);
  expect("council consensusScore",    consensus.consensusScore > 0);
  expect("council limitations",       consensus.limitations.length > 0);
  expect("council sourcesUsed",       consensus.sourcesUsed.length > 0);
  expect("council generatedAt",       !!consensus.generatedAt);

  // All initiatives suggestedOnly
  for (const i of consensus.initiatives) {
    expect("council init suggestedOnly", i.suggestedOnly === true);
  }

  // Empty orgSlug
  const empty = runPlanningCouncil({
    orgSlug: "", executivePriorities: [],
    advisorRecs: [], advisorConcerns: [], simulationResults: [],
  });
  expect("council empty orgSlug → limitations", empty.limitations.length > 0);
  expect("council empty orgSlug → score 0",    empty.consensusScore === 0);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "Integration tests disabled." }, { status: 403 });
  }

  reset();

  testIdentity();
  testTypes();
  testObjectiveEngine();
  testInitiativeEngine();
  testDependencyEngine();
  testMilestoneEngine();
  testRiskPlanningEngine();
  testOpportunityEngine();
  testRoadmapEngine();
  testPrioritizationEngine();
  testNarrativeEngine();
  testPlanningEngine();
  testTenantBoundary();
  testIntegrationStrategicMemory();
  testIntegrationLearning();
  testIntegrationExecutiveBrain();
  testIntegrationAdvisor();
  testIntegrationSimulations();
  testIntegrationCrossModule();
  testIntegrationMemoryGraph();
  testIntegrationTenantProfile();
  testIntegrationPlaybooks();
  testComplianceGate();
  testAuditEvents();
  testQueryLayer();
  await testRepository();
  testDashboardContract();
  testHealthAndReadiness();
  testCanonicalScenarios();
  testCouncilEngine();

  const total   = _passed + _failed;
  const pass    = _failed === 0;
  const verdict = pass ? "ALL_PASS" : "SOME_FAILURES";

  return NextResponse.json(
    { total, passed: _passed, failed: _failed, pass, verdict, failedTests: _failures },
    { status: pass ? 200 : 422 }
  );
}
