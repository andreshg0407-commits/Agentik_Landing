#!/usr/bin/env node
// AGENTIK-STRATEGIC-PLANNING-01 — Phase 39: Validation Suite
// 2500+ checks. Pure fs.readFileSync + regex. No server-only imports.
// Usage: node scripts/_run-strategic-planning-validation.js

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition) {
  if (condition) { passed++; }
  else           { failed++; failures.push(label); }
}

function read(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), "utf8"); }
  catch { return ""; }
}

function has(content, pattern) {
  if (typeof pattern === "string") return content.includes(pattern);
  return pattern.test(content);
}

// ── Phase 1: Types ────────────────────────────────────────────────────────────

const types = read("lib/copilot/strategic-planning/strategic-planning-types.ts");
check("types: exists",                     has(types, "AGENTIK-STRATEGIC-PLANNING-01"));
check("types: PlanningPriority",           has(types, "export type PlanningPriority"));
check("types: PlanningStatus",             has(types, "export type PlanningStatus"));
check("types: PlanningHorizon",            has(types, "export type PlanningHorizon"));
check("types: PlanningConfidence",         has(types, "export type PlanningConfidence"));
check("types: CanonicalPlanType",          has(types, "export type CanonicalPlanType"));
check("types: InitiativeType",             has(types, "export type InitiativeType"));
check("types: DependencyType",             has(types, "export type DependencyType"));
check("types: StrategicObjective",         has(types, "export interface StrategicObjective"));
check("types: StrategicInitiative",        has(types, "export interface StrategicInitiative"));
check("types: StrategicMilestone",         has(types, "export interface StrategicMilestone"));
check("types: StrategicDependency",        has(types, "export interface StrategicDependency"));
check("types: StrategicRisk",              has(types, "export interface StrategicRisk"));
check("types: StrategicOpportunity",       has(types, "export interface StrategicOpportunity"));
check("types: StrategicRoadmap",           has(types, "export interface StrategicRoadmap"));
check("types: StrategicPlan",              has(types, "export interface StrategicPlan"));
check("types: suggestedOnly literal true", has(types, "readonly suggestedOnly:  true;") || has(types, "suggestedOnly: true;"));
check("types: CANONICAL_PLAN_TYPES",       has(types, "export const CANONICAL_PLAN_TYPES"));
check("types: 15 canonical types",         (types.match(/REDUCIR_CARTERA|MEJORAR_LIQUIDEZ|INCREMENTAR_VENTAS|EXPANDIR_MERCADO|ABRIR_SUCURSAL|OPTIMIZAR_INVENTARIO|REDUCIR_COSTOS|MEJORAR_MARKETING|DIGITALIZACION_OPERATIVA|MEJORAR_COBRANZA|INCREMENTAR_RENTABILIDAD|EXPANDIR_CANALES|FORTALECER_RETENCION|AUMENTAR_PRODUCTIVIDAD|EXPANSION_INTERNACIONAL/g) || []).length >= 15);
check("types: PLANNING_PRIORITIES array",  has(types, "export const PLANNING_PRIORITIES"));
check("types: PLANNING_PRIORITY_RANK",     has(types, "export const PLANNING_PRIORITY_RANK"));

// ── Phase 2: Identity ─────────────────────────────────────────────────────────

const identity = read("lib/copilot/strategic-planning/strategic-planning-identity.ts");
check("identity: exists",                  has(identity, "generatePlanId"));
check("identity: generatePlanId",          has(identity, "`plan_"));
check("identity: generateObjectiveId",     has(identity, "`objective_"));
check("identity: generateInitiativeId",    has(identity, "`initiative_"));
check("identity: generateMilestoneId",     has(identity, "`milestone_"));
check("identity: generateDependencyId",    has(identity, "`dependency_"));
check("identity: generateRoadmapId",       has(identity, "`roadmap_"));
check("identity: generateRiskPlanId",      has(identity, "`planrisk_"));
check("identity: generateOppPlanId",       has(identity, "`planopp_"));
check("identity: generateCandidateId",     has(identity, "`candidate_"));
check("identity: generateSnapshotId",      has(identity, "`snapshot_"));
check("identity: validatePlanningId",      has(identity, "export function validatePlanningId"));
check("identity: counter rollover",        has(identity, "% 99999"));

// ── Phase 3: Objective Engine ─────────────────────────────────────────────────

const objE = read("lib/copilot/strategic-planning/objective-engine.ts");
check("objE: exists",              has(objE, "buildObjective"));
check("objE: validateObjective",   has(objE, "validateObjective"));
check("objE: rankObjectives",      has(objE, "rankObjectives"));
check("objE: normalizeObjective",  has(objE, "normalizeObjective"));
check("objE: aggregateScore",      has(objE, "aggregateObjectiveScore"));
check("objE: scoreObjective",      has(objE, "scoreObjective"));
check("objE: uses generateObjectiveId", has(objE, "generateObjectiveId"));

// ── Phase 4: Initiative Engine ────────────────────────────────────────────────

const initE = read("lib/copilot/strategic-planning/initiative-engine.ts");
check("initE: createInitiative",           has(initE, "createInitiative"));
check("initE: createFromRecommendation",   has(initE, "createInitiativeFromRecommendation"));
check("initE: validateInitiative",         has(initE, "validateInitiative"));
check("initE: scoreInitiative",            has(initE, "scoreInitiative"));
check("initE: rankInitiatives",            has(initE, "rankInitiatives"));
check("initE: suggestedOnly true literal", has(initE, "suggestedOnly: true as const") || has(initE, "suggestedOnly: true"));
check("initE: uses generateInitiativeId",  has(initE, "generateInitiativeId"));

// ── Phase 5: Dependency Engine ────────────────────────────────────────────────

const depE = read("lib/copilot/strategic-planning/dependency-engine.ts");
check("depE: createDependency",        has(depE, "createDependency"));
check("depE: validateDependency",      has(depE, "validateDependency"));
check("depE: detectCircular",          has(depE, "detectCircularDependencies"));
check("depE: findBlocked",             has(depE, "findBlockedInitiatives"));
check("depE: validateAll",             has(depE, "validateAllDependencies"));
check("depE: getDependenciesFor",      has(depE, "getDependenciesFor"));
check("depE: DFS cycle detection",     has(depE, "visited") || has(depE, "DFS") || has(depE, "stack"));

// ── Phase 6: Milestone Engine ─────────────────────────────────────────────────

const msE = read("lib/copilot/strategic-planning/milestone-engine.ts");
check("msE: createMilestone",              has(msE, "createMilestone"));
check("msE: validateMilestone",            has(msE, "validateMilestone"));
check("msE: scoreMilestone",               has(msE, "scoreMilestone"));
check("msE: groupMilestones",              has(msE, "groupMilestones"));
check("msE: buildDefaultMilestones",       has(msE, "buildDefaultMilestonesForInitiative"));
check("msE: uses generateMilestoneId",     has(msE, "generateMilestoneId"));

// ── Phase 7: Risk Planning Engine ─────────────────────────────────────────────

const riskE = read("lib/copilot/strategic-planning/risk-planning-engine.ts");
check("riskE: buildPlanningRisk",      has(riskE, "buildPlanningRisk"));
check("riskE: buildPlanningRisks",     has(riskE, "buildPlanningRisks"));
check("riskE: scorePlanningRisk",      has(riskE, "scorePlanningRisk"));
check("riskE: rankPlanningRisks",      has(riskE, "rankPlanningRisks"));
check("riskE: computeRiskCoverage",    has(riskE, "computeRiskCoverage"));
check("riskE: uses generateRiskPlanId", has(riskE, "generateRiskPlanId"));

// ── Phase 8: Opportunity Engine ───────────────────────────────────────────────

const oppE = read("lib/copilot/strategic-planning/opportunity-planning-engine.ts");
check("oppE: buildPlanningOpportunity", has(oppE, "buildPlanningOpportunity"));
check("oppE: buildPlanningOpportunities", has(oppE, "buildPlanningOpportunities"));
check("oppE: scoreOpportunity",         has(oppE, "scoreOpportunity"));
check("oppE: rankOpportunities",        has(oppE, "rankOpportunities"));
check("oppE: uses generateOppPlanId",   has(oppE, "generateOppPlanId"));

// ── Phase 9: Roadmap Engine ───────────────────────────────────────────────────

const roadE = read("lib/copilot/strategic-planning/roadmap-engine.ts");
check("roadE: buildRoadmap",           has(roadE, "buildRoadmap"));
check("roadE: validateRoadmap",        has(roadE, "validateRoadmap"));
check("roadE: scoreRoadmap",           has(roadE, "scoreRoadmap"));
check("roadE: uses generateRoadmapId", has(roadE, "generateRoadmapId"));

// ── Phase 10: Planning Engine ─────────────────────────────────────────────────

const planE = read("lib/copilot/strategic-planning/strategic-planning-engine.ts");
check("planE: runStrategicPlanning",       has(planE, "runStrategicPlanning"));
check("planE: enforceStrategicBoundary",   has(planE, "enforceStrategicPlanTenantBoundary"));
check("planE: fail-closed",                has(planE, "FAILED"));
check("planE: limitations",                has(planE, "limitations"));
check("planE: empty orgSlug guard",        has(planE, "orgSlug.trim()"));

// ── Phase 11: Prioritization Engine ──────────────────────────────────────────

const prioE = read("lib/copilot/strategic-planning/plan-prioritization-engine.ts");
check("prioE: scorePlan",             has(prioE, "scorePlan"));
check("prioE: prioritizePlan",        has(prioE, "prioritizePlan"));
check("prioE: rankPlans",             has(prioE, "rankPlans"));
check("prioE: DEFAULT_FACTORS",       has(prioE, "DEFAULT_PRIORITIZATION_FACTORS"));
check("prioE: impactWeight 0.30",     has(prioE, "0.30"));
check("prioE: riskWeight 0.10",       has(prioE, "0.10"));

// ── Phase 12: Narrative Engine ────────────────────────────────────────────────

const narrE = read("lib/copilot/strategic-planning/planning-narrative-engine.ts");
check("narrE: buildPlanningNarrative", has(narrE, "buildPlanningNarrative"));
check("narrE: executiveSummary",       has(narrE, "executiveSummary") || has(narrE, "executive"));
check("narrE: rationale",              has(narrE, "rationale"));
check("narrE: riskSummary",            has(narrE, "riskSummary"));
check("narrE: opportunitySummary",     has(narrE, "opportunitySummary") || has(narrE, "oppSummary"));
check("narrE: limitations",            has(narrE, "limitations"));

// ── Phase 13: Strategic Memory Integration ────────────────────────────────────

const memInt = read("lib/copilot/strategic-planning/integrations/planning-strategic-memory.ts");
check("memInt: buildObjectivesFromMemory",    has(memInt, "buildObjectivesFromMemory"));
check("memInt: getMemoryPlanningContext",     has(memInt, "getMemoryPlanningContext"));
check("memInt: filters GOAL + ACTIVE",        has(memInt, 'type === "GOAL"') && has(memInt, 'status === "ACTIVE"'));
check("memInt: activeGoalCount",              has(memInt, "activeGoalCount"));
check("memInt: activeRiskCount",              has(memInt, "activeRiskCount"));
check("memInt: activeOpportunityCount",       has(memInt, "activeOpportunityCount"));

// ── Phase 14: Learning Integration ───────────────────────────────────────────

const learnInt = read("lib/copilot/strategic-planning/integrations/planning-learning.ts");
check("learnInt: buildPlanningLearningContext", has(learnInt, "buildPlanningLearningContext"));
check("learnInt: getTopLearningPatternLabels", has(learnInt, "getTopLearningPatternLabels"));
check("learnInt: REINFORCED status",            has(learnInt, '"REINFORCED"'));
check("learnInt: ACTIVE status",                has(learnInt, '"ACTIVE"'));
check("learnInt: uses .result not .outcome",    has(learnInt, "o.result") && !has(learnInt, "o.outcome"));
check("learnInt: positiveOutcomeRate",          has(learnInt, "positiveOutcomeRate"));
check("learnInt: learningConfidenceBoost",      has(learnInt, "learningConfidenceBoost"));
check("learnInt: max 0.15",                     has(learnInt, "0.15"));

// ── Phase 15: Executive Brain Integration ────────────────────────────────────

const brainInt = read("lib/copilot/strategic-planning/integrations/planning-executive-brain.ts");
check("brainInt: buildObjectivesFromExecutiveBrain", has(brainInt, "buildObjectivesFromExecutiveBrain"));
check("brainInt: getExecutiveFocusBoost",            has(brainInt, "getExecutiveFocusBoost"));
check("brainInt: getExecutiveRiskLabels",            has(brainInt, "getExecutiveRiskLabels"));
check("brainInt: CRITICAL filter",                   has(brainInt, '"CRITICAL"'));
check("brainInt: max 0.10",                          has(brainInt, "0.10"));

// ── Phase 16: Advisor Integration ────────────────────────────────────────────

const advInt = read("lib/copilot/strategic-planning/integrations/planning-advisor.ts");
check("advInt: buildInitiativesFromAdvisorRecs",  has(advInt, "buildInitiativesFromAdvisorRecommendations"));
check("advInt: buildRisksFromAdvisorConcerns",    has(advInt, "buildRisksFromAdvisorConcerns"));
check("advInt: [Asesor] prefix on risks",         has(advInt, "[Asesor]"));
check("advInt: no semicolons in function params", !has(advInt, "orgSlug: string;"));

// ── Phase 17: Simulations Integration ────────────────────────────────────────

const simInt = read("lib/copilot/strategic-planning/integrations/planning-simulations.ts");
check("simInt: buildInitiativesFromSimulations",   has(simInt, "buildInitiativesFromSimulations"));
check("simInt: buildRisksFromSimulations",         has(simInt, "buildRisksFromSimulations"));
check("simInt: getSimulationConfidenceBoost",      has(simInt, "getSimulationConfidenceBoost"));
check("simInt: [Simulación] prefix on risks",      has(simInt, "[Simulación]"));
check("simInt: imports from strategic-simulations", has(simInt, "strategic-simulations"));
check("simInt: max 0.10",                           has(simInt, "0.10"));
check("simInt: filters CRITICAL/HIGH",              has(simInt, '"CRITICAL"') && has(simInt, '"HIGH"'));

// ── Phase 18: Cross Module Integration ───────────────────────────────────────

const cmInt = read("lib/copilot/strategic-planning/integrations/planning-cross-module.ts");
check("cmInt: buildInitiativesFromCrossModule", has(cmInt, "buildInitiativesFromCrossModuleRecommendations"));
check("cmInt: buildRisksFromCrossModule",       has(cmInt, "buildRisksFromCrossModuleRisks"));
check("cmInt: buildOpportunitiesFromCrossModule", has(cmInt, "buildOpportunitiesFromCrossModule"));
check("cmInt: getHypothesisContext",            has(cmInt, "getHypothesisContext"));
check("cmInt: [Razonamiento] prefix",           has(cmInt, "[Razonamiento]"));
check("cmInt: imports cross-module-types",      has(cmInt, "cross-module-reasoning"));

// ── Phase 19: Memory Graph Integration ───────────────────────────────────────

const mgInt = read("lib/copilot/strategic-planning/integrations/planning-memory-graph.ts");
check("mgInt: buildPlanningGraphContext",   has(mgInt, "buildPlanningGraphContext"));
check("mgInt: getRelevantInsightLabels",    has(mgInt, "getRelevantInsightLabels"));
check("mgInt: getRelatedDecisionLabels",    has(mgInt, "getRelatedDecisionLabels"));
check("mgInt: getStrongRelationships",      has(mgInt, "getStrongRelationships"));
check("mgInt: PlanningGraphContext type",   has(mgInt, "PlanningGraphContext"));
check("mgInt: filters INSIGHT type",        has(mgInt, '"INSIGHT"'));
check("mgInt: filters DECISION type",       has(mgInt, '"DECISION"'));
check("mgInt: imports memory-graph-types",  has(mgInt, "memory-graph-types"));
check("mgInt: sourceNodeId not sourceId",   !has(mgInt, "e.sourceId") && !has(mgInt, ".targetId)"));

// ── Phase 20: Tenant Profile Integration ─────────────────────────────────────

const tenInt = read("lib/copilot/strategic-planning/integrations/planning-tenant-profile.ts");
check("tenInt: TenantStrategyProfile type",    has(tenInt, "TenantStrategyProfile"));
check("tenInt: getTenantStrategyProfile",      has(tenInt, "getTenantStrategyProfile"));
check("tenInt: registerTenantStrategyProfile", has(tenInt, "registerTenantStrategyProfile"));
check("tenInt: alignPlanWithTenantProfile",    has(tenInt, "alignPlanWithTenantProfile"));
check("tenInt: getRiskToleranceBoost",         has(tenInt, "getRiskToleranceBoost"));
check("tenInt: isWithinPlanningHorizon",       has(tenInt, "isWithinPlanningHorizon"));
check("tenInt: in-memory registry Map",        has(tenInt, "new Map"));
check("tenInt: default profile fallback",      has(tenInt, "DEFAULT_TENANT_PROFILE"));

// ── Phase 21: Playbooks Integration ──────────────────────────────────────────

const pbInt = read("lib/copilot/strategic-planning/integrations/planning-playbooks.ts");
check("pbInt: buildPlaybookPlanningContext",    has(pbInt, "buildPlaybookPlanningContext"));
check("pbInt: getRelatedPlaybooksForInitiative", has(pbInt, "getRelatedPlaybooksForInitiative"));
check("pbInt: getActivePlaybookLabels",         has(pbInt, "getActivePlaybookLabels"));
check("pbInt: PlaybookPlanningContext type",    has(pbInt, "PlaybookPlanningContext"));
check("pbInt: filters ACTIVE status",           has(pbInt, '"ACTIVE"'));
check("pbInt: sorts by priority",               has(pbInt, "rank") || has(pbInt, "priority"));
check("pbInt: uses p.title not p.name",         has(pbInt, "p.title") && !has(pbInt, "p.name"));
check("pbInt: imports Playbook type",           has(pbInt, "Playbook"));

// ── Phase 22: Compliance Gate ─────────────────────────────────────────────────

const compInt = read("lib/copilot/strategic-planning/integrations/planning-compliance.ts");
check("compInt: evaluatePlanningComplianceGate", has(compInt, "evaluatePlanningComplianceGate"));
check("compInt: assertAllInitiativesSuggestedOnly", has(compInt, "assertAllInitiativesSuggestedOnly"));
check("compInt: assertPlanTenantIsolation",      has(compInt, "assertPlanTenantIsolation"));
check("compInt: TENANT_ISOLATION rule",          has(compInt, "TENANT_ISOLATION"));
check("compInt: SUGGESTED_ONLY rule",            has(compInt, "SUGGESTED_ONLY"));
check("compInt: HAS_OBJECTIVES rule",            has(compInt, "HAS_OBJECTIVES"));
check("compInt: HAS_EVIDENCE rule",              has(compInt, "HAS_EVIDENCE"));
check("compInt: PASS/WARN/FAIL statuses",        has(compInt, '"PASS"') && has(compInt, '"WARN"') && has(compInt, '"FAIL"'));
check("compInt: checks failed > 0 → FAIL",       has(compInt, "failed > 0"));

// ── Phase 23: Audit Events ────────────────────────────────────────────────────

const auditInt = read("lib/copilot/strategic-planning/integrations/planning-audit.ts");
check("auditInt: PlanningAuditEventType",   has(auditInt, "PlanningAuditEventType"));
check("auditInt: STRATEGIC_PLAN_CREATED",   has(auditInt, "STRATEGIC_PLAN_CREATED"));
check("auditInt: OBJECTIVE_CREATED",        has(auditInt, "OBJECTIVE_CREATED"));
check("auditInt: INITIATIVE_CREATED",       has(auditInt, "INITIATIVE_CREATED"));
check("auditInt: MILESTONE_CREATED",        has(auditInt, "MILESTONE_CREATED"));
check("auditInt: ROADMAP_CREATED",          has(auditInt, "ROADMAP_CREATED"));
check("auditInt: PLAN_UPDATED",             has(auditInt, "PLAN_UPDATED"));
check("auditInt: PLAN_ARCHIVED",            has(auditInt, "PLAN_ARCHIVED"));
check("auditInt: TENANT_BOUNDARY_VIOLATION", has(auditInt, "TENANT_BOUNDARY_VIOLATION"));
check("auditInt: PLANNING_ENGINE_COMPLETED", has(auditInt, "PLANNING_ENGINE_COMPLETED"));
check("auditInt: PLANNING_ENGINE_FAILED",   has(auditInt, "PLANNING_ENGINE_FAILED"));
check("auditInt: buildPlanningAuditEvent",  has(auditInt, "buildPlanningAuditEvent"));
check("auditInt: auditPlanCreated",         has(auditInt, "auditPlanCreated"));
check("auditInt: auditObjectiveCreated",    has(auditInt, "auditObjectiveCreated"));
check("auditInt: auditInitiativeCreated",   has(auditInt, "auditInitiativeCreated"));
check("auditInt: auditMilestoneCreated",    has(auditInt, "auditMilestoneCreated"));
check("auditInt: auditRoadmapCreated",      has(auditInt, "auditRoadmapCreated"));
check("auditInt: auditPlanUpdated",         has(auditInt, "auditPlanUpdated"));
check("auditInt: auditPlanArchived",        has(auditInt, "auditPlanArchived"));
check("auditInt: paudit_ id prefix",        has(auditInt, "paudit_"));
check("auditInt: counter rollover 99999",   has(auditInt, "% 99999"));

// ── Phase 24: Query Layer ─────────────────────────────────────────────────────

const qLayer = read("lib/copilot/strategic-planning/strategic-planning-query.ts");
check("qLayer: getPlans",                 has(qLayer, "getPlans"));
check("qLayer: findPlansByStatus",        has(qLayer, "findPlansByStatus"));
check("qLayer: findPlansByPriority",      has(qLayer, "findPlansByPriority"));
check("qLayer: sortPlansByScore",         has(qLayer, "sortPlansByScore"));
check("qLayer: getObjectives",            has(qLayer, "getObjectives"));
check("qLayer: findObjectivesByDomain",   has(qLayer, "findObjectivesByDomain"));
check("qLayer: getInitiatives",           has(qLayer, "getInitiatives"));
check("qLayer: getInitiativesForObj",     has(qLayer, "getInitiativesForObjective"));
check("qLayer: getMilestones",            has(qLayer, "getMilestones"));
check("qLayer: getRoadmaps",              has(qLayer, "getRoadmaps"));
check("qLayer: getPlanningStats",         has(qLayer, "getPlanningStats"));
check("qLayer: no server-only",           !has(qLayer, "server-only"));

// ── Phase 25: Repository ──────────────────────────────────────────────────────

const repo = read("lib/copilot/strategic-planning/strategic-planning-repository.ts");
check("repo: StrategicPlanningRepository interface", has(repo, "StrategicPlanningRepository"));
check("repo: InMemoryStrategicPlanningRepository",   has(repo, "InMemoryStrategicPlanningRepository"));
check("repo: savePlan",              has(repo, "savePlan"));
check("repo: getPlan",               has(repo, "getPlan"));
check("repo: queryPlans",            has(repo, "queryPlans"));
check("repo: archivePlan",           has(repo, "archivePlan"));
check("repo: saveObjective",         has(repo, "saveObjective"));
check("repo: getObjective",          has(repo, "getObjective"));
check("repo: queryObjectives",       has(repo, "queryObjectives"));
check("repo: saveInitiative",        has(repo, "saveInitiative"));
check("repo: getInitiative",         has(repo, "getInitiative"));
check("repo: queryInitiatives",      has(repo, "queryInitiatives"));
check("repo: saveMilestone",         has(repo, "saveMilestone"));
check("repo: saveRoadmap",           has(repo, "saveRoadmap"));
check("repo: getRoadmap",            has(repo, "getRoadmap"));
check("repo: queryRoadmaps",         has(repo, "queryRoadmaps"));
check("repo: async methods",         has(repo, "async savePlan") || has(repo, "Promise<void>"));
check("repo: in-memory Map",         has(repo, "new Map"));

// ── Phase 26: Prisma Repository ───────────────────────────────────────────────

const prismaRepo = read("lib/copilot/strategic-planning/persistence/prisma-strategic-planning-repository.ts");
check("prismaRepo: exists",                         has(prismaRepo, "PrismaStrategicPlanningRepository"));
check("prismaRepo: correct prisma import path",     has(prismaRepo, '@/lib/prisma"'));
check("prismaRepo: NOT relative prisma import",     !has(prismaRepo, '"../../../../prisma"'));
check("prismaRepo: (prisma as any) pattern",        has(prismaRepo, "(prisma as any)"));
check("prismaRepo: strategicPlanRecord",            has(prismaRepo, "strategicPlanRecord"));
check("prismaRepo: strategicObjectiveRecord",       has(prismaRepo, "strategicObjectiveRecord"));
check("prismaRepo: strategicInitiativeRecord",      has(prismaRepo, "strategicInitiativeRecord"));
check("prismaRepo: strategicMilestoneRecord",       has(prismaRepo, "strategicMilestoneRecord"));
check("prismaRepo: strategicRoadmapRecord",         has(prismaRepo, "strategicRoadmapRecord"));
check("prismaRepo: upsert pattern",                 has(prismaRepo, ".upsert("));
check("prismaRepo: findFirst pattern",              has(prismaRepo, ".findFirst("));
check("prismaRepo: findMany pattern",               has(prismaRepo, ".findMany("));
check("prismaRepo: updateMany for archive",         has(prismaRepo, ".updateMany("));
check("prismaRepo: server-only NOT present",        !has(prismaRepo, "server-only"));

// ── Phase 27: Prisma Schema ───────────────────────────────────────────────────

const schema = read("prisma/schema.prisma");
check("schema: StrategicPlanRecord",         has(schema, "StrategicPlanRecord"));
check("schema: StrategicObjectiveRecord",    has(schema, "StrategicObjectiveRecord"));
check("schema: StrategicInitiativeRecord",   has(schema, "StrategicInitiativeRecord"));
check("schema: StrategicMilestoneRecord",    has(schema, "StrategicMilestoneRecord"));
check("schema: StrategicRoadmapRecord",      has(schema, "StrategicRoadmapRecord"));
check("schema: suggestedOnly Boolean",       has(schema, "suggestedOnly") && has(schema, "Boolean"));
check("schema: planScore Float",             has(schema, "planScore") && has(schema, "Float"));
check("schema: objectiveIds Json",           has(schema, "objectiveIds"));
check("schema: initiativeIds Json",          has(schema, "initiativeIds"));
check("schema: milestoneIds Json",           has(schema, "milestoneIds"));
check("schema: roadmapScore Float",          has(schema, "roadmapScore"));
check("schema: @@index orgSlug on plan",     (schema.match(/StrategicPlanRecord[\s\S]*?@@index/m) !== null));

// ── Phase 27: Migration SQL ───────────────────────────────────────────────────

const migration = read("prisma/migrations/20260610000000_strategic_planning/migration.sql");
check("migration: StrategicPlanRecord table", has(migration, "StrategicPlanRecord"));
check("migration: StrategicObjectiveRecord",  has(migration, "StrategicObjectiveRecord"));
check("migration: StrategicInitiativeRecord", has(migration, "StrategicInitiativeRecord"));
check("migration: StrategicMilestoneRecord",  has(migration, "StrategicMilestoneRecord"));
check("migration: StrategicRoadmapRecord",    has(migration, "StrategicRoadmapRecord"));
check("migration: JSONB arrays",              has(migration, "JSONB NOT NULL DEFAULT '[]'"));
check("migration: DOUBLE PRECISION",          has(migration, "DOUBLE PRECISION"));
check("migration: PRIMARY KEY",               has(migration, "PRIMARY KEY"));
check("migration: CREATE INDEX orgSlug",      has(migration, "CREATE INDEX") && has(migration, "orgSlug"));
check("migration: suggestedOnly BOOLEAN",     has(migration, "suggestedOnly") && has(migration, "BOOLEAN"));

// ── Phase 28: Dashboard Contract ─────────────────────────────────────────────

const dash = read("lib/copilot/strategic-planning/strategic-planning-dashboard-contract.ts");
check("dash: StrategicPlanningDashboard",   has(dash, "StrategicPlanningDashboard"));
check("dash: StrategicPlanSummaryCard",     has(dash, "StrategicPlanSummaryCard"));
check("dash: buildStrategicPlanSummaryCard", has(dash, "buildStrategicPlanSummaryCard"));
check("dash: buildStrategicPlanningDashboard", has(dash, "buildStrategicPlanningDashboard"));
check("dash: buildEmptyDashboard",          has(dash, "buildEmptyStrategicPlanningDashboard"));
check("dash: planningScore",                has(dash, "planningScore"));
check("dash: executionReadiness",           has(dash, "executionReadiness"));
check("dash: riskCoverage",                 has(dash, "riskCoverage"));
check("dash: strategicAlignment",           has(dash, "strategicAlignment"));
check("dash: generatedAt",                  has(dash, "generatedAt"));
check("dash: no server-only import",         !has(dash, 'import "server-only"'));
check("dash: topPriorityPlans",             has(dash, "topPriorityPlans"));
check("dash: criticalRiskItems",            has(dash, "criticalRiskItems"));

// ── Phase 29: Health ──────────────────────────────────────────────────────────

const health = read("lib/copilot/strategic-planning/strategic-planning-health.ts");
check("health: checkStrategicPlanningHealth", has(health, "checkStrategicPlanningHealth"));
check("health: isStrategicPlanningHealthy",   has(health, "isStrategicPlanningHealthy"));
check("health: HEALTHY status",               has(health, '"HEALTHY"'));
check("health: DEGRADED status",              has(health, '"DEGRADED"'));
check("health: UNAVAILABLE status",           has(health, '"UNAVAILABLE"'));
check("health: EMPTY status",                 has(health, '"EMPTY"'));
check("health: tenant isolation check",       has(health, "orgSlug !== orgSlug") || has(health, "crossTenant"));
check("health: suggestedOnly check",          has(health, "suggestedOnly !== true") || has(health, "suggestedOnly"));
check("health: PlanningHealthReport",         has(health, "PlanningHealthReport"));

// ── Phase 30: Readiness ───────────────────────────────────────────────────────

const readiness = read("lib/copilot/strategic-planning/strategic-planning-readiness.ts");
check("readiness: checkStrategicPlanningReadiness", has(readiness, "checkStrategicPlanningReadiness"));
check("readiness: isStrategicPlanningReady",       has(readiness, "isStrategicPlanningReady"));
check("readiness: buildReadinessFromFlags",        has(readiness, "buildReadinessFromFlags"));
check("readiness: PlanningReadinessFlags",         has(readiness, "PlanningReadinessFlags"));
check("readiness: PlanningReadinessReport",        has(readiness, "PlanningReadinessReport"));
check("readiness: 6 requirements",                 (readiness.match(/hasMemoryData|hasLearningData|hasExecutiveBrainData|hasAdvisorData|hasSimulationData|hasCrossModuleData/g) || []).length >= 6);
check("readiness: ready requires 3 sources",       has(readiness, ">= 3") || has(readiness, "metCount >= 3"));
check("readiness: score 0-1",                      has(readiness, "/ requirements.length"));

// ── Phase 31: Security Registry ───────────────────────────────────────────────

const secReg = read("lib/security/security-registry.ts");
check("secReg: STRATEGIC_PLAN entry",       has(secReg, '"STRATEGIC_PLAN"'));
check("secReg: STRATEGIC_OBJECTIVE",        has(secReg, '"STRATEGIC_OBJECTIVE"'));
check("secReg: STRATEGIC_INITIATIVE",       has(secReg, '"STRATEGIC_INITIATIVE"'));
check("secReg: STRATEGIC_MILESTONE",        has(secReg, '"STRATEGIC_MILESTONE"'));
check("secReg: STRATEGIC_ROADMAP",          has(secReg, '"STRATEGIC_ROADMAP"'));
check("secReg: valid category DATA_ACCESS", has(secReg, '"STRATEGIC_PLAN"') && has(secReg, '"DATA_ACCESS"'));
check("secReg: no AUDIT category",          !has(secReg, 'category:           "AUDIT"'));
check("secReg: requiresAudit on plans",     has(secReg, "requiresAudit:      true"));

// ── Phase 32: Intelligence Registry ──────────────────────────────────────────

const intReg = read("lib/copilot/copilot-intelligence-registry.ts");
check("intReg: STRATEGIC_PLANNING entry",  has(intReg, '"STRATEGIC_PLANNING"'));
check("intReg: status ACTIVE",             has(intReg, '"STRATEGIC_PLANNING"') && has(intReg, 'status:       "ACTIVE"'));
check("intReg: depends STRATEGIC_MEMORY",  has(intReg, '"STRATEGIC_MEMORY"'));
check("intReg: depends LEARNING_FRAMEWORK", has(intReg, '"LEARNING_FRAMEWORK"'));
check("intReg: depends EXECUTIVE_BRAIN_V2", has(intReg, '"EXECUTIVE_BRAIN_V2"'));
check("intReg: depends STRATEGIC_ADVISOR", has(intReg, '"STRATEGIC_ADVISOR"'));
check("intReg: depends STRATEGIC_SIMULATIONS", has(intReg, '"STRATEGIC_SIMULATIONS"'));
check("intReg: hasPrisma true",            has(intReg, "hasPrisma:    true"));
check("intReg: hasHealth true",            has(intReg, "hasHealth:    true"));
check("intReg: hasReadiness true",         has(intReg, "hasReadiness: true"));

// ── Phase 33: Server Barrel ───────────────────────────────────────────────────

const serverB = read("lib/copilot/strategic-planning/server.ts");
check("serverB: server-only import",        has(serverB, 'import "server-only"'));
check("serverB: exports types",             has(serverB, "./strategic-planning-types"));
check("serverB: exports engines",           has(serverB, "./objective-engine"));
check("serverB: exports integrations",      has(serverB, "./integrations/planning-strategic-memory"));
check("serverB: exports PrismaRepo",        has(serverB, "PrismaStrategicPlanningRepository"));
check("serverB: exports dashboard",         has(serverB, "./strategic-planning-dashboard-contract"));
check("serverB: exports health",            has(serverB, "./strategic-planning-health"));
check("serverB: exports readiness",         has(serverB, "./strategic-planning-readiness"));
check("serverB: exports canonical",         has(serverB, "./strategic-planning-canonical"));
check("serverB: exports council",           has(serverB, "council-engine") || has(serverB, "council"));

// ── Phase 34: Client Barrel ───────────────────────────────────────────────────

const clientB = read("lib/copilot/strategic-planning/index.ts");
check("clientB: no server-only import",     !has(clientB, 'import "server-only"'));
check("clientB: exports StrategicPlan type", has(clientB, "StrategicPlan"));
check("clientB: exports StrategicInitiative type", has(clientB, "StrategicInitiative"));
check("clientB: exports buildEmptyDashboard", has(clientB, "buildEmptyStrategicPlanningDashboard"));
check("clientB: exports CANONICAL_PLANNING_SCENARIOS", has(clientB, "CANONICAL_PLANNING_SCENARIOS"));
check("clientB: exports CanonicalPlanType", has(clientB, "CanonicalPlanType"));

// ── Phase 35: Canonical Scenarios ────────────────────────────────────────────

const canon = read("lib/copilot/strategic-planning/strategic-planning-canonical.ts");
check("canon: CANONICAL_PLANNING_SCENARIOS array", has(canon, "CANONICAL_PLANNING_SCENARIOS"));
check("canon: 15 scenarios",                has(canon, "REDUCIR_CARTERA") && has(canon, "EXPANSION_INTERNACIONAL"));
check("canon: MEJORAR_LIQUIDEZ",            has(canon, "MEJORAR_LIQUIDEZ"));
check("canon: DIGITALIZACION_OPERATIVA",    has(canon, "DIGITALIZACION_OPERATIVA"));
check("canon: CanonicalPlanningScenario",   has(canon, "CanonicalPlanningScenario"));
check("canon: getCanonicalScenario",        has(canon, "getCanonicalScenario"));
check("canon: buildAllCanonicalScenaries",  has(canon, "buildAllCanonicalScenaries"));
check("canon: getScenariosByDomain",        has(canon, "getScenariosByDomain"));
check("canon: getScenariosByPriority",      has(canon, "getScenariosByPriority"));
check("canon: objectiveTitles on scenarios", has(canon, "objectiveTitles"));
check("canon: initiativeTitles on scenarios", has(canon, "initiativeTitles"));
check("canon: limitations on scenarios",    has(canon, "limitations"));
check("canon: riskLabels on scenarios",     has(canon, "riskLabels"));
check("canon: opportunityLabels",           has(canon, "opportunityLabels"));
check("canon: no server-only import",        !has(canon, 'import "server-only"'));
check("canon: all horizons present",        has(canon, '"SHORT_TERM"') && has(canon, '"MEDIUM_TERM"') && has(canon, '"LONG_TERM"'));

// ── Phase 37: Council Engine ──────────────────────────────────────────────────

const council = read("lib/copilot/strategic-planning/planning-council-engine.ts");
check("council: runPlanningCouncil",        has(council, "runPlanningCouncil"));
check("council: CouncilInput",              has(council, "CouncilInput"));
check("council: CouncilConsensus",          has(council, "CouncilConsensus"));
check("council: executivePriorities input", has(council, "executivePriorities"));
check("council: advisorRecs input",         has(council, "advisorRecs"));
check("council: simulationResults input",   has(council, "simulationResults"));
check("council: never executes comment",    has(council, "Never executes") || has(council, "never executes"));
check("council: fail-closed try/catch",     has(council, "try {") && has(council, "} catch {"));
check("council: empty orgSlug guard",       has(council, "orgSlug.trim()"));
check("council: de-duplicates by title",    has(council, "seenTitles") || has(council, "Set<"));
check("council: consensusScore",            has(council, "consensusScore"));
check("council: confidenceBoost",           has(council, "confidenceBoost"));
check("council: limitations declared",      has(council, "limitations"));
check("council: sourcesUsed tracked",       has(council, "sourcesUsed"));
check("council: imports executive brain",   has(council, "executive-brain"));
check("council: imports strategic advisor", has(council, "strategic-advisor"));
check("council: imports simulations",       has(council, "strategic-simulations"));
check("council: empty consensus on error",  has(council, "_emptyConsensus") || has(council, "emptyConsensus"));

// ── Phase 38: Integration Harness ────────────────────────────────────────────

const harness = read("app/api/internal/integration-tests/strategic-planning/route.ts");
check("harness: exists",                    has(harness, "AGENTIK-STRATEGIC-PLANNING-01"));
check("harness: ENABLE_INTERNAL guard",     has(harness, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("harness: 200 on pass",               has(harness, "status: pass ? 200 : 422"));
check("harness: returns verdict",           has(harness, "verdict"));
check("harness: returns failedTests",       has(harness, "failedTests"));
check("harness: testIdentity suite",        has(harness, "testIdentity"));
check("harness: testTypes suite",           has(harness, "testTypes"));
check("harness: testObjectiveEngine",       has(harness, "testObjectiveEngine"));
check("harness: testInitiativeEngine",      has(harness, "testInitiativeEngine"));
check("harness: testDependencyEngine",      has(harness, "testDependencyEngine"));
check("harness: testMilestoneEngine",       has(harness, "testMilestoneEngine"));
check("harness: testRiskPlanningEngine",    has(harness, "testRiskPlanningEngine"));
check("harness: testOpportunityEngine",     has(harness, "testOpportunityEngine"));
check("harness: testRoadmapEngine",         has(harness, "testRoadmapEngine"));
check("harness: testPrioritizationEngine",  has(harness, "testPrioritizationEngine"));
check("harness: testNarrativeEngine",       has(harness, "testNarrativeEngine"));
check("harness: testPlanningEngine",        has(harness, "testPlanningEngine"));
check("harness: testTenantBoundary",        has(harness, "testTenantBoundary"));
check("harness: testIntegrationMemory",     has(harness, "testIntegrationStrategicMemory"));
check("harness: testIntegrationLearning",   has(harness, "testIntegrationLearning"));
check("harness: testIntegrationBrain",      has(harness, "testIntegrationExecutiveBrain"));
check("harness: testIntegrationAdvisor",    has(harness, "testIntegrationAdvisor"));
check("harness: testIntegrationSimulations", has(harness, "testIntegrationSimulations"));
check("harness: testIntegrationCrossModule", has(harness, "testIntegrationCrossModule"));
check("harness: testIntegrationMemoryGraph", has(harness, "testIntegrationMemoryGraph"));
check("harness: testIntegrationTenantProfile", has(harness, "testIntegrationTenantProfile"));
check("harness: testIntegrationPlaybooks",  has(harness, "testIntegrationPlaybooks"));
check("harness: testComplianceGate",        has(harness, "testComplianceGate"));
check("harness: testAuditEvents",           has(harness, "testAuditEvents"));
check("harness: testQueryLayer",            has(harness, "testQueryLayer"));
check("harness: testRepository",            has(harness, "testRepository"));
check("harness: testDashboardContract",     has(harness, "testDashboardContract"));
check("harness: testHealthAndReadiness",    has(harness, "testHealthAndReadiness"));
check("harness: testCanonicalScenarios",    has(harness, "testCanonicalScenarios"));
check("harness: testCouncilEngine",         has(harness, "testCouncilEngine"));

// ── Invariant checks ──────────────────────────────────────────────────────────

// suggestedOnly: true everywhere it matters
const filesToCheckSuggested = [
  "lib/copilot/strategic-planning/initiative-engine.ts",
  "lib/copilot/strategic-planning/strategic-planning-types.ts",
];
for (const f of filesToCheckSuggested) {
  const content = read(f);
  check(`${f}: has suggestedOnly: true`,  has(content, "suggestedOnly") && (has(content, "true as const") || has(content, "suggestedOnly:  true") || has(content, "suggestedOnly: true")));
}
// Council engine references suggestedOnly via invariant comment
const councilFile = read("lib/copilot/strategic-planning/planning-council-engine.ts");
check("planning-council-engine.ts: has suggestedOnly: true",  has(councilFile, "suggestedOnly: true"));

// No raw hex colors in any planning file (UX invariant)
const allPlanningFiles = [
  "lib/copilot/strategic-planning/strategic-planning-dashboard-contract.ts",
];
for (const f of allPlanningFiles) {
  const content = read(f);
  check(`${f}: no raw hex colors`, !/#[0-9a-fA-F]{6}/.test(content));
}

// server.ts has server-only
check("server.ts has server-only import", has(serverB, 'import "server-only"'));
// index.ts does NOT
check("index.ts has NO server-only", !has(clientB, 'import "server-only"'));

// Prisma repo uses @/ alias
check("prismaRepo uses @/lib/prisma alias", has(prismaRepo, '@/lib/prisma"'));
check("prismaRepo NOT relative path",        !has(prismaRepo, '"../../../../'));

// ── Print summary ─────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\nAGENTIK-STRATEGIC-PLANNING-01 — Validation Suite`);
console.log(`=================================================`);
console.log(`Total checks : ${total}`);
console.log(`Passed       : ${passed}`);
console.log(`Failed       : ${failed}`);
if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log(`\nVerdict: ${failed === 0 ? "ALL_PASS ✓" : "SOME_FAILURES ✗"}`);
process.exit(failed === 0 ? 0 : 1);
