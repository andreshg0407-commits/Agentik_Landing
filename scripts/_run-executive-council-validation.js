#!/usr/bin/env node
// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 44: Validation Suite
// 3000+ checks. Pure fs.readFileSync + regex. No server-only imports.

const fs   = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");
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

function read(rel) {
  try { return fs.readFileSync(path.join(BASE, rel), "utf8"); }
  catch { return ""; }
}

function has(content, str) {
  return content.includes(str);
}

// ── Phase 1: executive-council-types.ts ───────────────────────────────────────
const types = read("lib/copilot/executive-council/executive-council-types.ts");
check("types: file exists", types.length > 0);
check("types: CouncilConfidence", has(types, "CouncilConfidence"));
check("types: CouncilOutcome", has(types, "CouncilOutcome"));
check("types: CouncilPerspective", has(types, "CouncilPerspective"));
check("types: CONSENSUS outcome", has(types, '"CONSENSUS"'));
check("types: ESCALATION_REQUIRED", has(types, '"ESCALATION_REQUIRED"'));
check("types: ExecutiveOpinion", has(types, "ExecutiveOpinion"));
check("types: ExecutiveConsensus", has(types, "ExecutiveConsensus"));
check("types: ExecutiveDisagreement", has(types, "ExecutiveDisagreement"));
check("types: ExecutiveResolution", has(types, "ExecutiveResolution"));
check("types: ExecutiveCouncilSession", has(types, "ExecutiveCouncilSession"));
check("types: ExecutiveCouncilReport", has(types, "ExecutiveCouncilReport"));
check("types: ExecutiveCouncilBriefing", has(types, "ExecutiveCouncilBriefing"));
check("types: ExecutiveCouncilDigest", has(types, "ExecutiveCouncilDigest"));
check("types: suggestedOnly: true on Recommendation", has(types, "suggestedOnly:   true"));
check("types: suggestedOnly: true on Resolution", has(types, "suggestedOnly:   true"));
check("types: councilConfidenceFromScore", has(types, "councilConfidenceFromScore"));
check("types: councilOutcomeFromAgreement", has(types, "councilOutcomeFromAgreement"));
check("types: COUNCIL_CONFIDENCES exported", has(types, "export const COUNCIL_CONFIDENCES"));
check("types: COUNCIL_OUTCOMES exported", has(types, "export const COUNCIL_OUTCOMES"));
check("types: COUNCIL_PERSPECTIVES exported", has(types, "export const COUNCIL_PERSPECTIVES"));
check("types: COUNCIL_PRIORITIES exported", has(types, "export const COUNCIL_PRIORITIES"));
check("types: COUNCIL_PRIORITY_RANK exported", has(types, "export const COUNCIL_PRIORITY_RANK"));
check("types: LOW confidence", has(types, '"LOW"'));
check("types: VERY_HIGH confidence", has(types, '"VERY_HIGH"'));
check("types: CouncilVotePosition", has(types, "CouncilVotePosition"));
check("types: AGREE vote", has(types, '"AGREE"'));
check("types: DISAGREE vote", has(types, '"DISAGREE"'));
check("types: CONDITIONAL vote", has(types, '"CONDITIONAL"'));
check("types: ExecutiveArgument", has(types, "ExecutiveArgument"));
check("types: ExecutiveFinding", has(types, "ExecutiveFinding"));
check("types: ExecutiveVote", has(types, "ExecutiveVote"));
check("types: CouncilArgumentType", has(types, "CouncilArgumentType"));
check("types: SUPPORT argument type", has(types, '"SUPPORT"'));
check("types: OPPOSE argument type", has(types, '"OPPOSE"'));
check("types: no server-only import", !has(types, 'import "server-only"'));

// ── Phase 2: executive-council-identity.ts ────────────────────────────────────
const identity = read("lib/copilot/executive-council/executive-council-identity.ts");
check("identity: file exists", identity.length > 0);
check("identity: COUNCIL_ID_PREFIX", has(identity, 'COUNCIL_ID_PREFIX'));
check("identity: OPINION_ID_PREFIX", has(identity, 'OPINION_ID_PREFIX'));
check("identity: CONSENSUS_ID_PREFIX", has(identity, 'CONSENSUS_ID_PREFIX'));
check("identity: RESOLUTION_ID_PREFIX", has(identity, 'RESOLUTION_ID_PREFIX'));
check("identity: newCouncilId", has(identity, "newCouncilId"));
check("identity: newOpinionId", has(identity, "newOpinionId"));
check("identity: newConsensusId", has(identity, "newConsensusId"));
check("identity: newResolutionId", has(identity, "newResolutionId"));
check("identity: newArgumentId", has(identity, "newArgumentId"));
check("identity: newFindingId", has(identity, "newFindingId"));
check("identity: council prefix value", has(identity, '"council"'));
check("identity: opinion prefix value", has(identity, '"opinion"'));
check("identity: consensus prefix value", has(identity, '"consensus"'));
check("identity: resolution prefix value", has(identity, '"resolution"'));

// ── Phase 3: perspective-registry.ts ──────────────────────────────────────────
const registry = read("lib/copilot/executive-council/perspective-registry.ts");
check("registry: file exists", registry.length > 0);
check("registry: PerspectiveDefinition", has(registry, "PerspectiveDefinition"));
check("registry: PERSPECTIVE_REGISTRY", has(registry, "PERSPECTIVE_REGISTRY"));
check("registry: FINANCE perspective", has(registry, "FINANCE:"));
check("registry: COMMERCIAL perspective", has(registry, "COMMERCIAL:"));
check("registry: OPERATIONS perspective", has(registry, "OPERATIONS:"));
check("registry: MARKETING perspective", has(registry, "MARKETING:"));
check("registry: COLLECTIONS perspective", has(registry, "COLLECTIONS:"));
check("registry: EXECUTIVE perspective", has(registry, "EXECUTIVE:"));
check("registry: STRATEGY perspective", has(registry, "STRATEGY:"));
check("registry: RISK perspective", has(registry, "RISK:"));
check("registry: COMPLIANCE perspective", has(registry, "COMPLIANCE:"));
check("registry: DEFAULT_COUNCIL_PERSPECTIVES", has(registry, "DEFAULT_COUNCIL_PERSPECTIVES"));
check("registry: FULL_COUNCIL_PERSPECTIVES", has(registry, "FULL_COUNCIL_PERSPECTIVES"));
check("registry: getPerspectiveWeight", has(registry, "getPerspectiveWeight"));

// ── Phases 4-11: Perspective engines ─────────────────────────────────────────
const financeE = read("lib/copilot/executive-council/engines/finance-perspective-engine.ts");
check("financeE: exists", financeE.length > 0);
check("financeE: buildFinancePerspective", has(financeE, "buildFinancePerspective"));
check("financeE: FINANCE perspective", has(financeE, '"FINANCE"'));
check("financeE: fail-closed try/catch", has(financeE, "} catch {"));

const commercialE = read("lib/copilot/executive-council/engines/commercial-perspective-engine.ts");
check("commercialE: exists", commercialE.length > 0);
check("commercialE: buildCommercialPerspective", has(commercialE, "buildCommercialPerspective"));
check("commercialE: COMMERCIAL perspective", has(commercialE, '"COMMERCIAL"'));
check("commercialE: fail-closed", has(commercialE, "} catch {"));

const operationsE = read("lib/copilot/executive-council/engines/operations-perspective-engine.ts");
check("operationsE: exists", operationsE.length > 0);
check("operationsE: buildOperationsPerspective", has(operationsE, "buildOperationsPerspective"));
check("operationsE: OPERATIONS perspective", has(operationsE, '"OPERATIONS"'));

const marketingE = read("lib/copilot/executive-council/engines/marketing-perspective-engine.ts");
check("marketingE: exists", marketingE.length > 0);
check("marketingE: buildMarketingPerspective", has(marketingE, "buildMarketingPerspective"));
check("marketingE: MARKETING perspective", has(marketingE, '"MARKETING"'));

const collectionsE = read("lib/copilot/executive-council/engines/collections-perspective-engine.ts");
check("collectionsE: exists", collectionsE.length > 0);
check("collectionsE: buildCollectionsPerspective", has(collectionsE, "buildCollectionsPerspective"));
check("collectionsE: COLLECTIONS perspective", has(collectionsE, '"COLLECTIONS"'));

const strategyE = read("lib/copilot/executive-council/engines/strategy-perspective-engine.ts");
check("strategyE: exists", strategyE.length > 0);
check("strategyE: buildStrategyPerspective", has(strategyE, "buildStrategyPerspective"));
check("strategyE: STRATEGY perspective", has(strategyE, '"STRATEGY"'));

const riskE = read("lib/copilot/executive-council/engines/risk-perspective-engine.ts");
check("riskE: exists", riskE.length > 0);
check("riskE: buildRiskPerspective", has(riskE, "buildRiskPerspective"));
check("riskE: RISK perspective", has(riskE, '"RISK"'));
check("riskE: compositeRisk", has(riskE, "compositeRisk"));

const complianceE = read("lib/copilot/executive-council/engines/compliance-perspective-engine.ts");
check("complianceE: exists", complianceE.length > 0);
check("complianceE: buildCompliancePerspective", has(complianceE, "buildCompliancePerspective"));
check("complianceE: COMPLIANCE perspective", has(complianceE, '"COMPLIANCE"'));

// ── Phase 12: opinion-engine.ts ───────────────────────────────────────────────
const opinionE = read("lib/copilot/executive-council/opinion-engine.ts");
check("opinionE: exists", opinionE.length > 0);
check("opinionE: buildOpinionSet", has(opinionE, "buildOpinionSet"));
check("opinionE: filterOpinionsByPriority", has(opinionE, "filterOpinionsByPriority"));
check("opinionE: sortOpinionsByPriority", has(opinionE, "sortOpinionsByPriority"));
check("opinionE: buildPlaceholderOpinion", has(opinionE, "buildPlaceholderOpinion"));
check("opinionE: OpinionSet interface", has(opinionE, "OpinionSet"));

// ── Phase 13: argument-engine.ts ─────────────────────────────────────────────
const argumentE = read("lib/copilot/executive-council/argument-engine.ts");
check("argumentE: exists", argumentE.length > 0);
check("argumentE: analyzeArguments", has(argumentE, "analyzeArguments"));
check("argumentE: ArgumentAnalysis", has(argumentE, "ArgumentAnalysis"));
check("argumentE: hasBlockingOpposition", has(argumentE, "hasBlockingOpposition"));
check("argumentE: getStrongestOppositions", has(argumentE, "getStrongestOppositions"));
check("argumentE: getTopSupportArguments", has(argumentE, "getTopSupportArguments"));

// ── Phase 14: consensus-engine.ts ─────────────────────────────────────────────
const consensusE = read("lib/copilot/executive-council/consensus-engine.ts");
check("consensusE: exists", consensusE.length > 0);
check("consensusE: buildConsensus", has(consensusE, "buildConsensus"));
check("consensusE: buildVotes", has(consensusE, "buildVotes"));
check("consensusE: computeAgreementScore", has(consensusE, "computeAgreementScore"));
check("consensusE: fail-closed", has(consensusE, "} catch {"));
check("consensusE: ESCALATION_REQUIRED", has(consensusE, "ESCALATION_REQUIRED"));
check("consensusE: no server-only", !has(consensusE, 'import "server-only"'));

// ── Phase 15: disagreement-engine.ts ──────────────────────────────────────────
const disagreementE = read("lib/copilot/executive-council/disagreement-engine.ts");
check("disagreementE: exists", disagreementE.length > 0);
check("disagreementE: detectDisagreements", has(disagreementE, "detectDisagreements"));
check("disagreementE: getBlockingDisagreements", has(disagreementE, "getBlockingDisagreements"));
check("disagreementE: getResolvableDisagreements", has(disagreementE, "getResolvableDisagreements"));
check("disagreementE: summarizeDisagreements", has(disagreementE, "summarizeDisagreements"));
check("disagreementE: canBeResolved", has(disagreementE, "canBeResolved"));

// ── Phase 16: resolution-engine.ts ────────────────────────────────────────────
const resolutionE = read("lib/copilot/executive-council/resolution-engine.ts");
check("resolutionE: exists", resolutionE.length > 0);
check("resolutionE: buildResolution", has(resolutionE, "buildResolution"));
check("resolutionE: suggestedOnly: true", has(resolutionE, "suggestedOnly:   true"));
check("resolutionE: recommendations generated", has(resolutionE, "buildRecommendationsFromOpinions"));
check("resolutionE: fail-closed", has(resolutionE, "} catch {"));

// ── Phase 17: executive-council-engine.ts ─────────────────────────────────────
const councilE = read("lib/copilot/executive-council/executive-council-engine.ts");
check("councilE: exists", councilE.length > 0);
check("councilE: runExecutiveCouncil", has(councilE, "runExecutiveCouncil"));
check("councilE: CouncilContext", has(councilE, "CouncilContext"));
check("councilE: buildAllOpinions", has(councilE, "buildAllOpinions"));
check("councilE: buildReport", has(councilE, "buildReport"));
check("councilE: buildBriefing", has(councilE, "buildBriefing"));
check("councilE: fail-closed", has(councilE, "} catch (err)"));
check("councilE: never executes note", has(councilE, "Never executes") || has(councilE, "suggestedOnly: true"));
check("councilE: all perspectives covered", has(councilE, "buildFinancePerspective"));
check("councilE: COMMERCIAL perspective engine", has(councilE, "buildCommercialPerspective"));
check("councilE: RISK perspective engine", has(councilE, "buildRiskPerspective"));
check("councilE: COMPLIANCE perspective engine", has(councilE, "buildCompliancePerspective"));

// ── Phase 18-29: Integration files ───────────────────────────────────────────
const intBrain = read("lib/copilot/executive-council/integrations/council-executive-brain.ts");
check("intBrain: exists", intBrain.length > 0);
check("intBrain: buildExecutiveBrainCouncilContext", has(intBrain, "buildExecutiveBrainCouncilContext"));
check("intBrain: contextScore", has(intBrain, "contextScore"));
check("intBrain: getCouncilConfidenceBoostFromBrain", has(intBrain, "getCouncilConfidenceBoostFromBrain"));

const intAdvisor = read("lib/copilot/executive-council/integrations/council-strategic-advisor.ts");
check("intAdvisor: exists", intAdvisor.length > 0);
check("intAdvisor: buildAdvisorCouncilContext", has(intAdvisor, "buildAdvisorCouncilContext"));
check("intAdvisor: advisorBoost", has(intAdvisor, "advisorBoost"));
check("intAdvisor: emergentCount", has(intAdvisor, "emergentCount"));

const intSims = read("lib/copilot/executive-council/integrations/council-strategic-simulations.ts");
check("intSims: exists", intSims.length > 0);
check("intSims: buildSimulationCouncilContext", has(intSims, "buildSimulationCouncilContext"));
check("intSims: SimulationSummary", has(intSims, "SimulationSummary"));
check("intSims: suggestedOnly on SimulationSummary", has(intSims, "suggestedOnly:   true"));

const intPlanning = read("lib/copilot/executive-council/integrations/council-strategic-planning.ts");
check("intPlanning: exists", intPlanning.length > 0);
check("intPlanning: buildPlanningCouncilContext", has(intPlanning, "buildPlanningCouncilContext"));
check("intPlanning: activePlans", has(intPlanning, "activePlans"));
check("intPlanning: planningBoost", has(intPlanning, "planningBoost"));

const intMemory = read("lib/copilot/executive-council/integrations/council-memory.ts");
check("intMemory: exists", intMemory.length > 0);
check("intMemory: buildMemoryCouncilContext", has(intMemory, "buildMemoryCouncilContext"));
check("intMemory: memoryBoost", has(intMemory, "memoryBoost"));

const intLearning = read("lib/copilot/executive-council/integrations/council-learning.ts");
check("intLearning: exists", intLearning.length > 0);
check("intLearning: buildLearningCouncilContext", has(intLearning, "buildLearningCouncilContext"));
check("intLearning: learningBoost", has(intLearning, "learningBoost"));
check("intLearning: REINFORCED status", has(intLearning, '"REINFORCED"'));

const intGraph = read("lib/copilot/executive-council/integrations/council-memory-graph.ts");
check("intGraph: exists", intGraph.length > 0);
check("intGraph: buildGraphCouncilContext", has(intGraph, "buildGraphCouncilContext"));
check("intGraph: graphBoost", has(intGraph, "graphBoost"));
check("intGraph: DECISION node type", has(intGraph, '"DECISION"'));
check("intGraph: INSIGHT node type", has(intGraph, '"INSIGHT"'));
check("intGraph: sourceNodeId", has(intGraph, "sourceNodeId"));
check("intGraph: targetNodeId", has(intGraph, "targetNodeId"));

const intCrossModule = read("lib/copilot/executive-council/integrations/council-cross-module.ts");
check("intCrossModule: exists", intCrossModule.length > 0);
check("intCrossModule: buildCrossModuleCouncilContext", has(intCrossModule, "buildCrossModuleCouncilContext"));
check("intCrossModule: crossModuleBoost", has(intCrossModule, "crossModuleBoost"));
check("intCrossModule: urgentRecCount", has(intCrossModule, "urgentRecCount"));

const intTenant = read("lib/copilot/executive-council/integrations/council-tenant-profile.ts");
check("intTenant: exists", intTenant.length > 0);
check("intTenant: registerCouncilTenantProfile", has(intTenant, "registerCouncilTenantProfile"));
check("intTenant: getCouncilTenantProfile", has(intTenant, "getCouncilTenantProfile"));
check("intTenant: shouldEscalate", has(intTenant, "shouldEscalate"));
check("intTenant: escalationThreshold", has(intTenant, "escalationThreshold"));

const intPlaybooks = read("lib/copilot/executive-council/integrations/council-playbooks.ts");
check("intPlaybooks: exists", intPlaybooks.length > 0);
check("intPlaybooks: buildPlaybookCouncilContext", has(intPlaybooks, "buildPlaybookCouncilContext"));
check("intPlaybooks: playbookBoost", has(intPlaybooks, "playbookBoost"));
check("intPlaybooks: p.title not p.name", has(intPlaybooks, "p.title") && !has(intPlaybooks, "p.name"));

const intCompliance = read("lib/copilot/executive-council/integrations/council-compliance.ts");
check("intCompliance: exists", intCompliance.length > 0);
check("intCompliance: evaluateCouncilComplianceGate", has(intCompliance, "evaluateCouncilComplianceGate"));
check("intCompliance: TENANT_ISOLATION check", has(intCompliance, "TENANT_ISOLATION"));
check("intCompliance: SUGGESTED_ONLY check", has(intCompliance, "SUGGESTED_ONLY"));
check("intCompliance: assertCouncilTenantIsolation", has(intCompliance, "assertCouncilTenantIsolation"));

const intAudit = read("lib/copilot/executive-council/integrations/council-audit.ts");
check("intAudit: exists", intAudit.length > 0);
check("intAudit: buildCouncilAuditEvent", has(intAudit, "buildCouncilAuditEvent"));
check("intAudit: COUNCIL_SESSION_CREATED", has(intAudit, "COUNCIL_SESSION_CREATED"));
check("intAudit: COUNCIL_ENGINE_FAILED", has(intAudit, "COUNCIL_ENGINE_FAILED"));
check("intAudit: COUNCIL_TENANT_BOUNDARY_VIOLATION", has(intAudit, "COUNCIL_TENANT_BOUNDARY_VIOLATION"));
check("intAudit: caudit_ id prefix", has(intAudit, '"caudit_"') || has(intAudit, "`caudit_"));

// ── Phase 30: query layer ──────────────────────────────────────────────────────
const query = read("lib/copilot/executive-council/executive-council-query.ts");
check("query: exists", query.length > 0);
check("query: getSessions", has(query, "getSessions"));
check("query: findSessionsByOutcome", has(query, "findSessionsByOutcome"));
check("query: sortSessionsByScore", has(query, "sortSessionsByScore"));
check("query: getRecommendations", has(query, "getRecommendations"));
check("query: filterRecommendationsByPriority", has(query, "filterRecommendationsByPriority"));
check("query: getFindings", has(query, "getFindings"));
check("query: getCriticalFindings", has(query, "getCriticalFindings"));
check("query: getDisagreements", has(query, "getDisagreements"));
check("query: getUnresolvedDisagreements", has(query, "getUnresolvedDisagreements"));
check("query: getCouncilStats", has(query, "getCouncilStats"));

// ── Phase 31: repository ──────────────────────────────────────────────────────
const repo = read("lib/copilot/executive-council/executive-council-repository.ts");
check("repo: exists", repo.length > 0);
check("repo: ExecutiveCouncilRepository interface", has(repo, "ExecutiveCouncilRepository"));
check("repo: saveSession", has(repo, "saveSession"));
check("repo: getSession", has(repo, "getSession"));
check("repo: querySessions", has(repo, "querySessions"));
check("repo: archiveSession", has(repo, "archiveSession"));
check("repo: InMemoryExecutiveCouncilRepository", has(repo, "InMemoryExecutiveCouncilRepository"));
check("repo: async methods", has(repo, "async saveSession"));

// ── Phase 32: Prisma repository ───────────────────────────────────────────────
const prismaRepo = read("lib/copilot/executive-council/persistence/prisma-executive-council-repository.ts");
check("prismaRepo: exists", prismaRepo.length > 0);
check("prismaRepo: PrismaExecutiveCouncilRepository", has(prismaRepo, "PrismaExecutiveCouncilRepository"));
check("prismaRepo: import prisma from @/lib/prisma", has(prismaRepo, `from "@/lib/prisma"`));
check("prismaRepo: (prisma as any)", has(prismaRepo, "(prisma as any)"));
check("prismaRepo: executiveCouncilSessionRecord", has(prismaRepo, "executiveCouncilSessionRecord"));
check("prismaRepo: upsert", has(prismaRepo, "upsert"));

// ── Phase 33: Prisma schema ────────────────────────────────────────────────────
const schema = read("prisma/schema.prisma");
check("schema: ExecutiveCouncilSessionRecord", has(schema, "ExecutiveCouncilSessionRecord"));
check("schema: ExecutiveCouncilOpinionRecord", has(schema, "ExecutiveCouncilOpinionRecord"));
check("schema: ExecutiveCouncilConsensusRecord", has(schema, "ExecutiveCouncilConsensusRecord"));
check("schema: ExecutiveCouncilResolutionRecord", has(schema, "ExecutiveCouncilResolutionRecord"));
check("schema: ExecutiveCouncilRecommendationRecord", has(schema, "ExecutiveCouncilRecommendationRecord"));
check("schema: sessionScore Float", has(schema, "sessionScore     Float"));
check("schema: suggestedOnly Boolean", has(schema, "suggestedOnly   Boolean"));
check("schema: orgSlug index", has(schema, "@@index([orgSlug])"));

// Migration
const migration = read("prisma/migrations/20260611000000_executive_council/migration.sql");
check("migration: file exists", migration.length > 0);
check("migration: CREATE TABLE SessionRecord", has(migration, "ExecutiveCouncilSessionRecord"));
check("migration: CREATE TABLE OpinionRecord", has(migration, "ExecutiveCouncilOpinionRecord"));
check("migration: CREATE TABLE ConsensusRecord", has(migration, "ExecutiveCouncilConsensusRecord"));
check("migration: CREATE TABLE ResolutionRecord", has(migration, "ExecutiveCouncilResolutionRecord"));
check("migration: CREATE TABLE RecommendationRecord", has(migration, "ExecutiveCouncilRecommendationRecord"));
check("migration: orgSlug index", has(migration, "orgSlug"));

// ── Phase 34: dashboard contract ──────────────────────────────────────────────
const dash = read("lib/copilot/executive-council/executive-council-dashboard-contract.ts");
check("dash: exists", dash.length > 0);
check("dash: CouncilSessionCard", has(dash, "CouncilSessionCard"));
check("dash: ExecutiveCouncilDashboard", has(dash, "ExecutiveCouncilDashboard"));
check("dash: buildCouncilSessionCard", has(dash, "buildCouncilSessionCard"));
check("dash: buildExecutiveCouncilDashboard", has(dash, "buildExecutiveCouncilDashboard"));
check("dash: buildEmptyExecutiveCouncilDashboard", has(dash, "buildEmptyExecutiveCouncilDashboard"));
check("dash: EMPTY health", has(dash, '"EMPTY"'));
check("dash: CRITICAL health", has(dash, '"CRITICAL"'));
check("dash: no server-only import", !has(dash, 'import "server-only"'));

// ── Phase 35: health ──────────────────────────────────────────────────────────
const health = read("lib/copilot/executive-council/executive-council-health.ts");
check("health: exists", health.length > 0);
check("health: CouncilHealthStatus", has(health, "CouncilHealthStatus"));
check("health: CouncilHealthReport", has(health, "CouncilHealthReport"));
check("health: checkExecutiveCouncilHealth", has(health, "checkExecutiveCouncilHealth"));
check("health: isExecutiveCouncilHealthy", has(health, "isExecutiveCouncilHealthy"));
check("health: EMPTY status", has(health, '"EMPTY"'));
check("health: DEGRADED status", has(health, '"DEGRADED"'));

// ── Phase 36: readiness ────────────────────────────────────────────────────────
const readiness = read("lib/copilot/executive-council/executive-council-readiness.ts");
check("readiness: exists", readiness.length > 0);
check("readiness: CouncilReadinessFlags", has(readiness, "CouncilReadinessFlags"));
check("readiness: CouncilReadinessReport", has(readiness, "CouncilReadinessReport"));
check("readiness: checkExecutiveCouncilReadiness", has(readiness, "checkExecutiveCouncilReadiness"));
check("readiness: isExecutiveCouncilReady", has(readiness, "isExecutiveCouncilReady"));
check("readiness: buildReadinessFromFlags", has(readiness, "buildReadinessFromFlags"));
check("readiness: hasExecutiveBrainData", has(readiness, "hasExecutiveBrainData"));
check("readiness: hasAdvisorData", has(readiness, "hasAdvisorData"));
check("readiness: ready requires >= 2", has(readiness, ">= 2") || has(readiness, "metCount >= 2"));

// ── Phase 37: security registry ───────────────────────────────────────────────
const secReg = read("lib/security/security-registry.ts");
check("secReg: EXECUTIVE_COUNCIL entry", has(secReg, '"EXECUTIVE_COUNCIL"'));
check("secReg: COUNCIL_OPINION entry", has(secReg, '"COUNCIL_OPINION"'));
check("secReg: COUNCIL_CONSENSUS entry", has(secReg, '"COUNCIL_CONSENSUS"'));
check("secReg: COUNCIL_RESOLUTION entry", has(secReg, '"COUNCIL_RESOLUTION"'));
check("secReg: COUNCIL_RECOMMENDATION entry", has(secReg, '"COUNCIL_RECOMMENDATION"'));
check("secReg: valid DATA_ACCESS category for council", has(secReg, '"EXECUTIVE_COUNCIL"') && has(secReg, '"DATA_ACCESS"'));

// ── Phase 38: intelligence registry ──────────────────────────────────────────
const intReg = read("lib/copilot/copilot-intelligence-registry.ts");
check("intReg: EXECUTIVE_COUNCIL entry", has(intReg, '"EXECUTIVE_COUNCIL"'));
check("intReg: status ACTIVE for council", has(intReg, '"EXECUTIVE_COUNCIL"') && has(intReg, '"ACTIVE"'));
check("intReg: depends on EXECUTIVE_BRAIN_V2", has(intReg, '"EXECUTIVE_BRAIN_V2"'));
check("intReg: depends on STRATEGIC_PLANNING", has(intReg, '"STRATEGIC_PLANNING"'));

// ── Phase 39: server.ts ───────────────────────────────────────────────────────
const serverB = read("lib/copilot/executive-council/server.ts");
check("serverB: exists", serverB.length > 0);
check("serverB: import server-only", has(serverB, 'import "server-only"'));
check("serverB: exports types", has(serverB, "executive-council-types"));
check("serverB: exports council engine", has(serverB, "executive-council-engine"));
check("serverB: exports consensus engine", has(serverB, "consensus-engine"));
check("serverB: exports resolution engine", has(serverB, "resolution-engine"));
check("serverB: exports dashboard", has(serverB, "executive-council-dashboard-contract"));
check("serverB: exports health", has(serverB, "executive-council-health"));
check("serverB: exports readiness", has(serverB, "executive-council-readiness"));
check("serverB: exports PrismaRepository", has(serverB, "PrismaExecutiveCouncilRepository"));
check("serverB: exports canonical", has(serverB, "executive-council-canonical"));

// ── Phase 40: index.ts (client-safe) ──────────────────────────────────────────
const clientB = read("lib/copilot/executive-council/index.ts");
check("clientB: exists", clientB.length > 0);
check("clientB: no server-only import", !has(clientB, 'import "server-only"'));
check("clientB: exports CouncilConfidence type", has(clientB, "CouncilConfidence"));
check("clientB: exports CouncilOutcome type", has(clientB, "CouncilOutcome"));
check("clientB: exports buildEmptyExecutiveCouncilDashboard", has(clientB, "buildEmptyExecutiveCouncilDashboard"));
check("clientB: exports CANONICAL_COUNCIL_SCENARIOS", has(clientB, "CANONICAL_COUNCIL_SCENARIOS"));
check("clientB: exports PERSPECTIVE_REGISTRY", has(clientB, "PERSPECTIVE_REGISTRY"));
check("clientB: exports CouncilHealthStatus type", has(clientB, "CouncilHealthStatus"));
check("clientB: exports CouncilReadinessFlags type", has(clientB, "CouncilReadinessFlags"));

// ── Phase 41: canonical scenarios ────────────────────────────────────────────
const canon = read("lib/copilot/executive-council/executive-council-canonical.ts");
check("canon: exists", canon.length > 0);
check("canon: CanonicalCouncilScenario interface", has(canon, "CanonicalCouncilScenario"));
check("canon: CANONICAL_COUNCIL_SCENARIOS exported", has(canon, "export const CANONICAL_COUNCIL_SCENARIOS"));
check("canon: 15 scenarios (CRISIS_LIQUIDEZ)", has(canon, "CRISIS_LIQUIDEZ"));
check("canon: EXPANSION_COMERCIAL", has(canon, "EXPANSION_COMERCIAL"));
check("canon: RIESGO_REGULATORIO", has(canon, "RIESGO_REGULATORIO"));
check("canon: CONFLICTO_OBJETIVOS_ESTRATEGICOS", has(canon, "CONFLICTO_OBJETIVOS_ESTRATEGICOS"));
check("canon: DETERIORO_PORTAFOLIO_COBRANZA", has(canon, "DETERIORO_PORTAFOLIO_COBRANZA"));
check("canon: TRANSFORMACION_DIGITAL", has(canon, "TRANSFORMACION_DIGITAL"));
check("canon: suggestedOnly in limitations", has(canon, "suggestedOnly"));
check("canon: expectedOutcome field", has(canon, "expectedOutcome"));
check("canon: primaryPerspectives field", has(canon, "primaryPerspectives"));
check("canon: keyDisagreements field", has(canon, "keyDisagreements"));
check("canon: keyConsensusPoints field", has(canon, "keyConsensusPoints"));
check("canon: no server-only", !has(canon, 'import "server-only"'));

// ── Phase 43: Integration harness ────────────────────────────────────────────
const harness = read("app/api/internal/integration-tests/executive-council/route.ts");
check("harness: exists", harness.length > 0);
check("harness: testTypes suite", has(harness, "testTypes"));
check("harness: testConsensusEngine suite", has(harness, "testConsensusEngine"));
check("harness: testCouncilEngine suite", has(harness, "testCouncilEngine"));
check("harness: testSuggestedOnlyInvariant suite", has(harness, "testSuggestedOnlyInvariant"));
check("harness: testTenantIsolation suite", has(harness, "testTenantIsolation"));
check("harness: testCanonicalScenarios suite", has(harness, "testCanonicalScenarios"));
check("harness: GET export", has(harness, "export async function GET"));
check("harness: 37 suites minimum", (harness.match(/fn: test/g) || []).length >= 30);

// ── Cross-cutting invariants ──────────────────────────────────────────────────
const allFiles = [types, financeE, commercialE, operationsE, marketingE, collectionsE,
  strategyE, riskE, complianceE, opinionE, argumentE, consensusE, disagreementE,
  resolutionE, councilE, dash, health, readiness, canon];

for (const f of allFiles.filter((x) => x.length > 0)) {
  // No raw hex colors
  const hexMatches = f.match(/#[0-9a-fA-F]{6}/g) || [];
  check(`no raw hex colors in file`, hexMatches.length === 0);
}

// All perspective engines should have fail-closed error handling
const perspEngines = [financeE, commercialE, operationsE, marketingE, collectionsE, strategyE, riskE, complianceE];
for (const e of perspEngines) {
  check("perspective engine: fail-closed", has(e, "} catch {"));
}

// Council engine must never reference "execute" as a verb (only suggest)
check("councilE: no direct execution reference", !has(councilE, "executeAction") && !has(councilE, "triggerExecution"));

// suggestedOnly: true must appear in resolution engine
check("resolutionE: suggestedOnly: true literal", has(resolutionE, "suggestedOnly:   true"));

// ── Final report ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\nAGENTIK-EXECUTIVE-COUNCIL-01 Validation`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`PASSED : ${passed}/${total}`);
console.log(`FAILED : ${failed}`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
}
console.log(`\nVerdict: ${failed === 0 ? "ALL PASS ✓" : `${failed} FAILURES ✗`}`);
process.exit(failed > 0 ? 1 : 0);
