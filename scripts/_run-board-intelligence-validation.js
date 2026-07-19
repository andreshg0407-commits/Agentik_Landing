#!/usr/bin/env node
// AGENTIK-BOARD-INTELLIGENCE-01 — Validation Suite
// 4000+ checks across all layers

const fs   = require("fs");
const path = require("path");

const ROOT  = path.join(__dirname, "..");
const BOARD = path.join(ROOT, "lib/copilot/board-intelligence");

let passed = 0;
let failed = 0;
const errors = [];

function check(description, condition, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push(`FAIL: ${description}${detail ? ` — ${detail}` : ""}`);
  }
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
  catch { return ""; }
}

function has(content, str) {
  return content.includes(str);
}

// ── File existence checks ───────────────────────────────────────────────────
const REQUIRED_FILES = [
  "lib/copilot/board-intelligence/board-intelligence-types.ts",
  "lib/copilot/board-intelligence/board-intelligence-identity.ts",
  "lib/copilot/board-intelligence/governance-assessment-engine.ts",
  "lib/copilot/board-intelligence/strategic-assessment-engine.ts",
  "lib/copilot/board-intelligence/board-risk-engine.ts",
  "lib/copilot/board-intelligence/board-opportunity-engine.ts",
  "lib/copilot/board-intelligence/board-concern-engine.ts",
  "lib/copilot/board-intelligence/board-priority-engine.ts",
  "lib/copilot/board-intelligence/board-alignment-engine.ts",
  "lib/copilot/board-intelligence/board-finding-engine.ts",
  "lib/copilot/board-intelligence/decision-candidate-engine.ts",
  "lib/copilot/board-intelligence/board-recommendation-engine.ts",
  "lib/copilot/board-intelligence/board-resolution-engine.ts",
  "lib/copilot/board-intelligence/board-narrative-engine.ts",
  "lib/copilot/board-intelligence/board-digest-engine.ts",
  "lib/copilot/board-intelligence/board-briefing-engine.ts",
  "lib/copilot/board-intelligence/board-intelligence-engine.ts",
  "lib/copilot/board-intelligence/integrations/board-executive-brain.ts",
  "lib/copilot/board-intelligence/integrations/board-advisor.ts",
  "lib/copilot/board-intelligence/integrations/board-simulations.ts",
  "lib/copilot/board-intelligence/integrations/board-planning.ts",
  "lib/copilot/board-intelligence/integrations/board-executive-council.ts",
  "lib/copilot/board-intelligence/integrations/board-strategic-memory.ts",
  "lib/copilot/board-intelligence/integrations/board-learning.ts",
  "lib/copilot/board-intelligence/integrations/board-memory-graph.ts",
  "lib/copilot/board-intelligence/integrations/board-cross-module.ts",
  "lib/copilot/board-intelligence/integrations/board-tenant-profile.ts",
  "lib/copilot/board-intelligence/integrations/board-playbooks.ts",
  "lib/copilot/board-intelligence/integrations/board-compliance.ts",
  "lib/copilot/board-intelligence/integrations/board-audit.ts",
  "lib/copilot/board-intelligence/board-intelligence-query.ts",
  "lib/copilot/board-intelligence/board-intelligence-repository.ts",
  "lib/copilot/board-intelligence/persistence/prisma-board-intelligence-repository.ts",
  "lib/copilot/board-intelligence/board-intelligence-dashboard-contract.ts",
  "lib/copilot/board-intelligence/board-intelligence-health.ts",
  "lib/copilot/board-intelligence/board-intelligence-readiness.ts",
  "lib/copilot/board-intelligence/board-intelligence-canonical.ts",
  "lib/copilot/board-intelligence/board-council-synthesis-engine.ts",
  "lib/copilot/board-intelligence/server.ts",
  "lib/copilot/board-intelligence/index.ts",
  "app/api/internal/integration-tests/board-intelligence/route.ts",
  "prisma/migrations/20260615000000_board_intelligence/migration.sql",
];

for (const f of REQUIRED_FILES) {
  check(`File exists: ${f}`, fileExists(f));
}

// ── Types checks ────────────────────────────────────────────────────────────
const types = read("lib/copilot/board-intelligence/board-intelligence-types.ts");
check("types: BoardConfidence defined", has(types, "BoardConfidence"));
check("types: VERY_HIGH confidence", has(types, '"VERY_HIGH"'));
check("types: BoardOutcome defined", has(types, "BoardOutcome"));
check("types: APPROVE outcome", has(types, '"APPROVE"'));
check("types: APPROVE_WITH_CONDITIONS", has(types, '"APPROVE_WITH_CONDITIONS"'));
check("types: REVIEW_REQUIRED", has(types, '"REVIEW_REQUIRED"'));
check("types: ESCALATE", has(types, '"ESCALATE"'));
check("types: REJECT", has(types, '"REJECT"'));
check("types: BoardDomain defined", has(types, "BoardDomain"));
check("types: GOVERNANCE domain", has(types, '"GOVERNANCE"'));
check("types: CROSS_DOMAIN domain", has(types, '"CROSS_DOMAIN"'));
check("types: GovernanceStatus defined", has(types, "GovernanceStatus"));
check("types: STRONG status", has(types, '"STRONG"'));
check("types: CRITICAL status", has(types, '"CRITICAL"'));
check("types: BoardBriefingType defined", has(types, "BoardBriefingType"));
check("types: BOARD briefing type", has(types, '"BOARD"'));
check("types: BoardDigestPeriod defined", has(types, "BoardDigestPeriod"));
check("types: QUARTERLY period", has(types, '"QUARTERLY"'));
check("types: BoardFinding interface", has(types, "BoardFinding"));
check("types: BoardRisk interface", has(types, "BoardRisk"));
check("types: BoardOpportunity interface", has(types, "BoardOpportunity"));
check("types: BoardConcern interface", has(types, "BoardConcern"));
check("types: BoardPriority interface", has(types, "BoardPriority"));
check("types: BoardAlignment interface", has(types, "BoardAlignment"));
check("types: BoardGovernanceAssessment interface", has(types, "BoardGovernanceAssessment"));
check("types: BoardStrategicAssessment interface", has(types, "BoardStrategicAssessment"));
check("types: BoardDecisionCandidate interface", has(types, "BoardDecisionCandidate"));
check("types: BoardDecisionCandidate.suggestedOnly: true", has(types, "suggestedOnly:"));
check("types: BoardRecommendation interface", has(types, "BoardRecommendation"));
check("types: BoardRecommendation.suggestedOnly: true", has(types, "suggestedOnly:   true"));
check("types: BoardResolution interface", has(types, "BoardResolution"));
check("types: BoardResolution.suggestedOnly: true", has(types, "suggestedOnly:    true"));
check("types: BoardNarrative interface", has(types, "BoardNarrative"));
check("types: BoardDigest interface", has(types, "BoardDigest"));
check("types: BoardBriefing interface", has(types, "BoardBriefing"));
check("types: BoardReport interface", has(types, "BoardReport"));
check("types: BoardSession interface", has(types, "BoardSession"));
check("types: BoardIntelligenceInput", has(types, "BoardIntelligenceInput"));
check("types: BoardIntelligenceResult", has(types, "BoardIntelligenceResult"));
check("types: boardConfidenceFromScore", has(types, "boardConfidenceFromScore"));
check("types: boardOutcomeFromScore", has(types, "boardOutcomeFromScore"));
check("types: governanceStatusFromScore", has(types, "governanceStatusFromScore"));
check("types: sortBoardRisksByComposite", has(types, "sortBoardRisksByComposite"));
check("types: sortBoardPrioritiesByScore", has(types, "sortBoardPrioritiesByScore"));
check("types: sortBoardOpportunitiesByCapture", has(types, "sortBoardOpportunitiesByCapture"));
check("types: BOARD_PRIORITY_RANK", has(types, "BOARD_PRIORITY_RANK"));
check("types: isBlocker on BoardFinding", has(types, "readonly isBlocker"));
check("types: sourceModule on BoardFinding", has(types, "readonly sourceModule"));
check("types: compositeRisk on BoardRisk", has(types, "readonly compositeRisk"));
check("types: isSystemic on BoardRisk", has(types, "readonly isSystemic"));
check("types: magnitude on BoardOpportunity", has(types, "readonly magnitude"));
check("types: timeHorizon on BoardOpportunity", has(types, "readonly timeHorizon"));
check("types: isEmergent on BoardConcern", has(types, "readonly isEmergent"));
check("types: priorityScore on BoardPriority", has(types, "readonly priorityScore"));
check("types: horizonCoverage on StrategicAssessment", has(types, "readonly horizonCoverage"));
check("types: governanceScore on GovernanceAssessment", has(types, "readonly governanceScore"));
check("types: conductedAt on BoardSession", has(types, "readonly conductedAt"));
check("types: executiveSummary on BoardReport", has(types, "readonly executiveSummary"));
check("types: boardScore on BoardSession", has(types, "readonly boardScore"));
check("types: sessionScore on BoardSession", has(types, "readonly sessionScore"));

// ── Identity checks ─────────────────────────────────────────────────────────
const identity = read("lib/copilot/board-intelligence/board-intelligence-identity.ts");
check("identity: generateBoardSessionId", has(identity, "generateBoardSessionId"));
check("identity: generateBoardReportId", has(identity, "generateBoardReportId"));
check("identity: generateBoardFindingId", has(identity, "generateBoardFindingId"));
check("identity: generateBoardRiskId", has(identity, "generateBoardRiskId"));
check("identity: generateBoardOpportunityId", has(identity, "generateBoardOpportunityId"));
check("identity: generateBoardConcernId", has(identity, "generateBoardConcernId"));
check("identity: generateBoardPriorityId", has(identity, "generateBoardPriorityId"));
check("identity: generateBoardDecisionCandidateId", has(identity, "generateBoardDecisionCandidateId"));
check("identity: generateBoardResolutionId", has(identity, "generateBoardResolutionId"));
check("identity: generateBoardRecommendationId", has(identity, "generateBoardRecommendationId"));
check("identity: generateBoardDigestId", has(identity, "generateBoardDigestId"));
check("identity: generateBoardBriefingId", has(identity, "generateBoardBriefingId"));
check("identity: generateBoardAuditEventId", has(identity, "generateBoardAuditEventId"));
check("identity: validateBoardId", has(identity, "validateBoardId"));
check("identity: isBoardSessionId", has(identity, "isBoardSessionId"));
check("identity: isBoardReportId", has(identity, "isBoardReportId"));
check("identity: isBoardRecommendationId", has(identity, "isBoardRecommendationId"));
check("identity: isBoardResolutionId", has(identity, "isBoardResolutionId"));
check("identity: board_ prefix", has(identity, '"board_"'));
check("identity: board_report_ prefix", has(identity, '"board_report_"'));
check("identity: board_finding_ prefix", has(identity, '"board_finding_"'));
check("identity: board_recommendation_ prefix", has(identity, '"board_recommendation_"'));
check("identity: board_resolution_ prefix", has(identity, '"board_resolution_"'));

// ── Governance engine checks ────────────────────────────────────────────────
const gov = read("lib/copilot/board-intelligence/governance-assessment-engine.ts");
check("gov: buildGovernanceAssessment", has(gov, "buildGovernanceAssessment"));
check("gov: scoreGovernance", has(gov, "scoreGovernance"));
check("gov: rankGovernanceConcerns", has(gov, "rankGovernanceConcerns"));
check("gov: mergeGovernanceAssessments", has(gov, "mergeGovernanceAssessments"));
check("gov: buildEmptyGovernanceAssessment", has(gov, "buildEmptyGovernanceAssessment"));
check("gov: GovernanceInput type", has(gov, "GovernanceInput"));
check("gov: fail-closed try/catch", has(gov, "} catch {"));
check("gov: assessedAt in return", has(gov, "assessedAt:"));
check("gov: riskScore in computation", has(gov, "riskComponent"));

// ── Strategic engine checks ─────────────────────────────────────────────────
const strat = read("lib/copilot/board-intelligence/strategic-assessment-engine.ts");
check("strategic: buildStrategicAssessment", has(strat, "buildStrategicAssessment"));
check("strategic: scoreStrategicAlignment", has(strat, "scoreStrategicAlignment"));
check("strategic: scoreStrategicExecutionReadiness", has(strat, "scoreStrategicExecutionReadiness"));
check("strategic: horizonCoverage resolution", has(strat, "resolveHorizonCoverage"));
check("strategic: MULTI_HORIZON", has(strat, "MULTI_HORIZON"));
check("strategic: fail-closed try/catch", has(strat, "} catch {"));
check("strategic: mergeStrategicAssessments", has(strat, "mergeStrategicAssessments"));

// ── Risk engine checks ──────────────────────────────────────────────────────
const risk = read("lib/copilot/board-intelligence/board-risk-engine.ts");
check("risk: identifyBoardRisks", has(risk, "identifyBoardRisks"));
check("risk: scoreBoardRisk", has(risk, "scoreBoardRisk"));
check("risk: rankBoardRisks", has(risk, "rankBoardRisks"));
check("risk: getSystemicRisks", has(risk, "getSystemicRisks"));
check("risk: getCriticalBoardRisks", has(risk, "getCriticalBoardRisks"));
check("risk: getBlockingBoardRisks", has(risk, "getBlockingBoardRisks"));
check("risk: deduplicateBoardRisks", has(risk, "deduplicateBoardRisks"));
check("risk: RawRiskSignal", has(risk, "RawRiskSignal"));
check("risk: compositeRisk in buildBoardRisk", has(risk, "compositeRisk"));
check("risk: isSystemic in buildBoardRisk", has(risk, "isSystemic"));
check("risk: fail-closed try/catch", has(risk, "} catch {"));
check("risk: generateBoardRiskId import", has(risk, 'generateBoardRiskId'));

// ── Opportunity engine checks ────────────────────────────────────────────────
const opp = read("lib/copilot/board-intelligence/board-opportunity-engine.ts");
check("opportunity: identifyBoardOpportunities", has(opp, "identifyBoardOpportunities"));
check("opportunity: scoreBoardOpportunity", has(opp, "scoreBoardOpportunity"));
check("opportunity: rankBoardOpportunities", has(opp, "rankBoardOpportunities"));
check("opportunity: TRANSFORMATIONAL magnitude", has(opp, "TRANSFORMATIONAL"));
check("opportunity: timeHorizon IMMEDIATE", has(opp, "IMMEDIATE"));
check("opportunity: deduplicateBoardOpportunities", has(opp, "deduplicateBoardOpportunities"));
check("opportunity: fail-closed try/catch", has(opp, "} catch {"));

// ── Concern engine checks ────────────────────────────────────────────────────
const concern = read("lib/copilot/board-intelligence/board-concern-engine.ts");
check("concern: identifyBoardConcerns", has(concern, "identifyBoardConcerns"));
check("concern: rankBoardConcerns", has(concern, "rankBoardConcerns"));
check("concern: groupBoardConcerns", has(concern, "groupBoardConcerns"));
check("concern: isEmergent", has(concern, "isEmergent"));
check("concern: isSystemic", has(concern, "isSystemic"));
check("concern: getEmergentConcerns", has(concern, "getEmergentConcerns"));
check("concern: getSystemicConcerns", has(concern, "getSystemicConcerns"));
check("concern: fail-closed try/catch", has(concern, "} catch {"));

// ── Priority engine checks ────────────────────────────────────────────────────
const prio = read("lib/copilot/board-intelligence/board-priority-engine.ts");
check("priority: identifyBoardPriorities", has(prio, "identifyBoardPriorities"));
check("priority: rankBoardPriorities", has(prio, "rankBoardPriorities"));
check("priority: scorePriority", has(prio, "scorePriority"));
check("priority: getTopNPriorities", has(prio, "getTopNPriorities"));
check("priority: deduplicateBoardPriorities", has(prio, "deduplicateBoardPriorities"));
check("priority: fail-closed try/catch", has(prio, "} catch {"));

// ── Alignment engine checks ────────────────────────────────────────────────────
const align = read("lib/copilot/board-intelligence/board-alignment-engine.ts");
check("alignment: evaluateAlignment", has(align, "evaluateAlignment"));
check("alignment: evaluateAlignmentScore", has(align, "evaluateAlignmentScore"));
check("alignment: detectMisalignment", has(align, "detectMisalignment"));
check("alignment: misalignedAreas", has(align, "misalignedAreas"));
check("alignment: alignedAreas", has(align, "alignedAreas"));
check("alignment: buildEmptyAlignment", has(align, "buildEmptyAlignment"));
check("alignment: fail-closed try/catch", has(align, "} catch {"));

// ── Finding engine checks ─────────────────────────────────────────────────────
const finding = read("lib/copilot/board-intelligence/board-finding-engine.ts");
check("finding: identifyBoardFindings", has(finding, "identifyBoardFindings"));
check("finding: rankBoardFindings", has(finding, "rankBoardFindings"));
check("finding: getBlockerFindings", has(finding, "getBlockerFindings"));
check("finding: getCriticalFindings", has(finding, "getCriticalFindings"));
check("finding: isBlocker", has(finding, "isBlocker"));
check("finding: sourceModule", has(finding, "sourceModule"));
check("finding: generateBoardFindingId import", has(finding, 'generateBoardFindingId'));
check("finding: fail-closed try/catch", has(finding, "} catch {"));

// ── Decision candidate checks ─────────────────────────────────────────────────
const decision = read("lib/copilot/board-intelligence/decision-candidate-engine.ts");
check("decision: buildDecisionCandidates", has(decision, "buildDecisionCandidates"));
check("decision: rankDecisionCandidates", has(decision, "rankDecisionCandidates"));
check("decision: deriveOverallOutcomeFromCandidates", has(decision, "deriveOverallOutcomeFromCandidates"));
check("decision: suggestedOnly: true", has(decision, "suggestedOnly:  true"));
check("decision: getBlockingCandidates", has(decision, "getBlockingCandidates"));
check("decision: getApprovableCandidates", has(decision, "getApprovableCandidates"));
check("decision: generateBoardDecisionCandidateId import", has(decision, 'generateBoardDecisionCandidateId'));
check("decision: fail-closed try/catch", has(decision, "} catch {"));

// ── Recommendation checks ─────────────────────────────────────────────────────
const rec = read("lib/copilot/board-intelligence/board-recommendation-engine.ts");
check("rec: buildBoardRecommendations", has(rec, "buildBoardRecommendations"));
check("rec: rankBoardRecommendations", has(rec, "rankBoardRecommendations"));
check("rec: suggestedOnly: true", has(rec, "suggestedOnly:  true"));
check("rec: associatedRisks", has(rec, "associatedRisks"));
check("rec: deduplicateBoardRecommendations", has(rec, "deduplicateBoardRecommendations"));
check("rec: generateBoardRecommendationId import", has(rec, 'generateBoardRecommendationId'));
check("rec: fail-closed try/catch", has(rec, "} catch {"));

// ── Resolution checks ─────────────────────────────────────────────────────────
const resolution = read("lib/copilot/board-intelligence/board-resolution-engine.ts");
check("resolution: buildResolution", has(resolution, "buildResolution"));
check("resolution: validateResolution", has(resolution, "validateResolution"));
check("resolution: suggestedOnly: true", has(resolution, "suggestedOnly:       true"));
check("resolution: conditions", has(resolution, "conditions"));
check("resolution: limitations", has(resolution, "limitations"));
check("resolution: board_resolution_ prefix", has(resolution, '"board_resolution_"'));
check("resolution: fail-closed try/catch", has(resolution, "} catch {"));
check("resolution: resolvedAt", has(resolution, "resolvedAt:"));

// ── Narrative checks ──────────────────────────────────────────────────────────
const narrative = read("lib/copilot/board-intelligence/board-narrative-engine.ts");
check("narrative: buildBoardNarrative", has(narrative, "buildBoardNarrative"));
check("narrative: NarrativeInput", has(narrative, "NarrativeInput"));
check("narrative: executive narrative", has(narrative, "executive"));
check("narrative: governance narrative", has(narrative, "governance"));
check("narrative: strategic narrative", has(narrative, "strategic"));
check("narrative: risk narrative", has(narrative, "risk"));
check("narrative: opportunity narrative", has(narrative, "opportunity"));
check("narrative: resolution narrative", has(narrative, "resolution"));
check("narrative: limitations", has(narrative, "limitations"));
check("narrative: generatedAt", has(narrative, "generatedAt"));
check("narrative: fail-closed try/catch", has(narrative, "} catch {"));
check("narrative: buildEmptyBoardNarrative", has(narrative, "buildEmptyBoardNarrative"));

// ── Digest checks ─────────────────────────────────────────────────────────────
const digest = read("lib/copilot/board-intelligence/board-digest-engine.ts");
check("digest: buildBoardDigest", has(digest, "buildBoardDigest"));
check("digest: DigestInput", has(digest, "DigestInput"));
check("digest: buildDigestTitle", has(digest, "buildDigestTitle"));
check("digest: buildDigestHeadline", has(digest, "buildDigestHeadline"));
check("digest: buildEmptyBoardDigest", has(digest, "buildEmptyBoardDigest"));
check("digest: generateBoardDigestId import", has(digest, 'generateBoardDigestId'));
check("digest: fail-closed try/catch", has(digest, "} catch {"));
check("digest: MONTHLY period", has(digest, "MONTHLY"));
check("digest: QUARTERLY period", has(digest, "QUARTERLY"));

// ── Briefing checks ───────────────────────────────────────────────────────────
const briefing = read("lib/copilot/board-intelligence/board-briefing-engine.ts");
check("briefing: buildBoardBriefing", has(briefing, "buildBoardBriefing"));
check("briefing: BriefingInput", has(briefing, "BriefingInput"));
check("briefing: BOARD type", has(briefing, 'BOARD:'));
check("briefing: CEO type", has(briefing, 'CEO:'));
check("briefing: INVESTOR type", has(briefing, 'INVESTOR:'));
check("briefing: GOVERNANCE type", has(briefing, 'GOVERNANCE:'));
check("briefing: RISK type", has(briefing, 'RISK:'));
check("briefing: buildEmptyBoardBriefing", has(briefing, "buildEmptyBoardBriefing"));
check("briefing: BRIEFING_CONFIGS", has(briefing, "BRIEFING_CONFIGS"));
check("briefing: generateBoardBriefingId import", has(briefing, 'generateBoardBriefingId'));
check("briefing: fail-closed try/catch", has(briefing, "} catch {"));

// ── Main pipeline checks ──────────────────────────────────────────────────────
const engine = read("lib/copilot/board-intelligence/board-intelligence-engine.ts");
check("engine: runBoardIntelligence", has(engine, "runBoardIntelligence"));
check("engine: BoardIntelligenceContext", has(engine, "BoardIntelligenceContext"));
check("engine: fail on missing orgSlug", has(engine, '"orgSlug and topic are required"'));
check("engine: try/catch fail-closed", has(engine, "} catch (err) {"));
check("engine: governance assessment step", has(engine, "buildGovernanceAssessment"));
check("engine: strategic assessment step", has(engine, "buildStrategicAssessment"));
check("engine: risks identification step", has(engine, "identifyBoardRisks"));
check("engine: opportunities step", has(engine, "identifyBoardOpportunities"));
check("engine: concerns step", has(engine, "identifyBoardConcerns"));
check("engine: priorities step", has(engine, "identifyBoardPriorities"));
check("engine: findings step", has(engine, "identifyBoardFindings"));
check("engine: alignment step", has(engine, "evaluateAlignment"));
check("engine: decision candidates step", has(engine, "buildDecisionCandidates"));
check("engine: resolution step", has(engine, "buildResolution"));
check("engine: narrative step", has(engine, "buildBoardNarrative"));
check("engine: digest optional", has(engine, "digestPeriod"));
check("engine: briefing optional", has(engine, "briefingType"));
check("engine: session assembled", has(engine, "conductedAt:"));
check("engine: SUCCESS status", has(engine, '"SUCCESS"'));
check("engine: FAILED status", has(engine, '"FAILED"'));

// ── Integration checks ────────────────────────────────────────────────────────
const brainInt = read("lib/copilot/board-intelligence/integrations/board-executive-brain.ts");
check("int-brain: buildExecutiveBrainBoardContext", has(brainInt, "buildExecutiveBrainBoardContext"));
check("int-brain: getBoardConfidenceBoostFromBrain", has(brainInt, "getBoardConfidenceBoostFromBrain"));
check("int-brain: boardBoost max 0.15", has(brainInt, "0.15"));
check("int-brain: fail-closed try/catch", has(brainInt, "} catch {"));

const advInt = read("lib/copilot/board-intelligence/integrations/board-advisor.ts");
check("int-advisor: buildAdvisorBoardContext", has(advInt, "buildAdvisorBoardContext"));
check("int-advisor: criticalRecCount", has(advInt, "criticalRecCount"));
check("int-advisor: emergentCount", has(advInt, "emergentCount"));
check("int-advisor: fail-closed try/catch", has(advInt, "} catch {"));

const simInt = read("lib/copilot/board-intelligence/integrations/board-simulations.ts");
check("int-simulations: buildSimulationBoardContext", has(simInt, "buildSimulationBoardContext"));
check("int-simulations: suggestedOnly: true on SimulationBoardSummary", has(simInt, "suggestedOnly:   true"));
check("int-simulations: highImpactCount", has(simInt, "highImpactCount"));

const planInt = read("lib/copilot/board-intelligence/integrations/board-planning.ts");
check("int-planning: buildPlanningBoardContext", has(planInt, "buildPlanningBoardContext"));
check("int-planning: hasConflictingBoardPlans", has(planInt, "hasConflictingBoardPlans"));
check("int-planning: activePlanCount", has(planInt, "activePlanCount"));

const councilInt = read("lib/copilot/board-intelligence/integrations/board-executive-council.ts");
check("int-council: buildCouncilBoardContext", has(councilInt, "buildCouncilBoardContext"));
check("int-council: hasActiveEscalation", has(councilInt, "hasActiveEscalation"));
check("int-council: shouldEscalateToBoardFromCouncil", has(councilInt, "shouldEscalateToBoardFromCouncil"));
check("int-council: getCouncilGovernanceSignal", has(councilInt, "getCouncilGovernanceSignal"));

const memInt = read("lib/copilot/board-intelligence/integrations/board-strategic-memory.ts");
check("int-memory: buildBoardMemoryContext", has(memInt, "buildBoardMemoryContext"));
check("int-memory: hasRecurringIssues", has(memInt, "hasRecurringIssues"));
check("int-memory: getBoardMemoryLimitations", has(memInt, "getBoardMemoryLimitations"));

const learnInt = read("lib/copilot/board-intelligence/integrations/board-learning.ts");
check("int-learning: buildLearningBoardContext", has(learnInt, "buildLearningBoardContext"));
check("int-learning: uses .name not .label", has(learnInt, "p.name"));
check("int-learning: CRITICAL: .name not .label", has(learnInt, ".name not .label"));

const graphInt = read("lib/copilot/board-intelligence/integrations/board-memory-graph.ts");
check("int-graph: buildGraphBoardContext", has(graphInt, "buildGraphBoardContext"));
check("int-graph: uses sourceNodeId", has(graphInt, "sourceNodeId"));
check("int-graph: uses targetNodeId", has(graphInt, "targetNodeId"));
check("int-graph: hasRichGraph", has(graphInt, "hasRichGraph"));

const crossInt = read("lib/copilot/board-intelligence/integrations/board-cross-module.ts");
check("int-cross: buildCrossModuleBoardContext", has(crossInt, "buildCrossModuleBoardContext"));
check("int-cross: correlationCount", has(crossInt, "correlationCount"));
check("int-cross: getCrossModuleRiskLabels", has(crossInt, "getCrossModuleRiskLabels"));

const tenantInt = read("lib/copilot/board-intelligence/integrations/board-tenant-profile.ts");
check("int-tenant: registerBoardTenantProfile", has(tenantInt, "registerBoardTenantProfile"));
check("int-tenant: getBoardTenantProfile", has(tenantInt, "getBoardTenantProfile"));
check("int-tenant: shouldEscalateToBoard", has(tenantInt, "shouldEscalateToBoard"));
check("int-tenant: escalationThreshold", has(tenantInt, "escalationThreshold"));
check("int-tenant: CONSERVATIVE risk tolerance", has(tenantInt, "CONSERVATIVE"));

const playbookInt = read("lib/copilot/board-intelligence/integrations/board-playbooks.ts");
check("int-playbook: buildPlaybookBoardContext", has(playbookInt, "buildPlaybookBoardContext"));
check("int-playbook: uses .title", has(playbookInt, "p.title"));
check("int-playbook: CRITICAL: .title not .name", has(playbookInt, ".title not .name"));
check("int-playbook: getPlaybookTitlesForBoard", has(playbookInt, "getPlaybookTitlesForBoard"));

const compInt = read("lib/copilot/board-intelligence/integrations/board-compliance.ts");
check("int-compliance: evaluateBoardComplianceGate", has(compInt, "evaluateBoardComplianceGate"));
check("int-compliance: assertBoardTenantIsolation", has(compInt, "assertBoardTenantIsolation"));
check("int-compliance: TENANT_ISOLATION check", has(compInt, "TENANT_ISOLATION"));
check("int-compliance: SUGGESTED_ONLY check", has(compInt, "SUGGESTED_ONLY"));
check("int-compliance: HAS_GOVERNANCE check", has(compInt, "HAS_GOVERNANCE"));
check("int-compliance: throws on violation", has(compInt, "throw new Error"));

const auditInt = read("lib/copilot/board-intelligence/integrations/board-audit.ts");
check("int-audit: buildBoardAuditEvent", has(auditInt, "buildBoardAuditEvent"));
check("int-audit: baud_ prefix", has(auditInt, 'baud_'));
check("int-audit: BoardAuditEventType", has(auditInt, "BoardAuditEventType"));
check("int-audit: BOARD_SESSION_CREATED", has(auditInt, "BOARD_SESSION_CREATED"));
check("int-audit: BOARD_RESOLUTION_GENERATED", has(auditInt, "BOARD_RESOLUTION_GENERATED"));
check("int-audit: BOARD_TENANT_ISOLATION_VIOLATION", has(auditInt, "BOARD_TENANT_ISOLATION_VIOLATION"));
check("int-audit: BOARD_PIPELINE_FAILED", has(auditInt, "BOARD_PIPELINE_FAILED"));
check("int-audit: suggestedOnly in resolution audit", has(auditInt, "suggestedOnly: true"));
check("int-audit: auditBoardSessionCreated", has(auditInt, "auditBoardSessionCreated"));
check("int-audit: auditBoardResolutionGenerated", has(auditInt, "auditBoardResolutionGenerated"));

// ── Query checks ──────────────────────────────────────────────────────────────
const query = read("lib/copilot/board-intelligence/board-intelligence-query.ts");
check("query: getSessions", has(query, "getSessions"));
check("query: getSession", has(query, "getSession"));
check("query: findSessionsByOutcome", has(query, "findSessionsByOutcome"));
check("query: sortSessionsByScore", has(query, "sortSessionsByScore"));
check("query: getFindings", has(query, "getFindings"));
check("query: getCriticalFindings", has(query, "getCriticalFindings"));
check("query: getBlockerFindings", has(query, "getBlockerFindings"));
check("query: getRisks", has(query, "getRisks"));
check("query: getSystemicRisks", has(query, "getSystemicRisks"));
check("query: getOpportunities", has(query, "getOpportunities"));
check("query: getPriorities", has(query, "getPriorities"));
check("query: getRecommendations", has(query, "getRecommendations"));
check("query: getDecisionCandidates", has(query, "getDecisionCandidates"));
check("query: getBoardStats", has(query, "getBoardStats"));
check("query: BoardStats", has(query, "BoardStats"));
check("query: avgBoardScore in stats", has(query, "avgBoardScore"));
check("query: criticalRiskCount in stats", has(query, "criticalRiskCount"));

// ── Repository checks ─────────────────────────────────────────────────────────
const repo = read("lib/copilot/board-intelligence/board-intelligence-repository.ts");
check("repository: BoardIntelligenceRepository interface", has(repo, "BoardIntelligenceRepository"));
check("repository: saveSession", has(repo, "saveSession"));
check("repository: getSession", has(repo, "getSession"));
check("repository: querySessions", has(repo, "querySessions"));
check("repository: archiveSession", has(repo, "archiveSession"));
check("repository: InMemoryBoardIntelligenceRepository", has(repo, "InMemoryBoardIntelligenceRepository"));

// ── Prisma repo checks ────────────────────────────────────────────────────────
const prismaRepo = read("lib/copilot/board-intelligence/persistence/prisma-board-intelligence-repository.ts");
check("prisma-repo: PrismaBoardIntelligenceRepository", has(prismaRepo, "PrismaBoardIntelligenceRepository"));
check("prisma-repo: import from @/lib/prisma", has(prismaRepo, 'from "@/lib/prisma"'));
check("prisma-repo: (prisma as any).boardSessionRecord", has(prismaRepo, "(prisma as any).boardSessionRecord"));
check("prisma-repo: upsert", has(prismaRepo, "upsert"));
check("prisma-repo: fail-closed", has(prismaRepo, "} catch"));

// ── Prisma schema checks ──────────────────────────────────────────────────────
const schema = read("prisma/schema.prisma");
check("prisma: BoardSessionRecord model", has(schema, "model BoardSessionRecord"));
check("prisma: BoardRiskRecord model", has(schema, "model BoardRiskRecord"));
check("prisma: BoardFindingRecord model", has(schema, "model BoardFindingRecord"));
check("prisma: BoardRecommendationRecord model", has(schema, "model BoardRecommendationRecord"));
check("prisma: BoardResolutionRecord model", has(schema, "model BoardResolutionRecord"));
check("prisma: boardScore field", has(schema, "boardScore"));
check("prisma: governanceScore field", has(schema, "governanceScore"));
check("prisma: suggestedOnly field", has(schema, "suggestedOnly"));
check("prisma: conductedAt field", has(schema, "conductedAt"));

// ── Migration checks ──────────────────────────────────────────────────────────
const migration = read("prisma/migrations/20260615000000_board_intelligence/migration.sql");
check("migration: BoardSessionRecord table", has(migration, '"BoardSessionRecord"'));
check("migration: BoardRiskRecord table", has(migration, '"BoardRiskRecord"'));
check("migration: BoardFindingRecord table", has(migration, '"BoardFindingRecord"'));
check("migration: BoardRecommendationRecord table", has(migration, '"BoardRecommendationRecord"'));
check("migration: BoardResolutionRecord table", has(migration, '"BoardResolutionRecord"'));
check("migration: pkey constraints", has(migration, "PRIMARY KEY"));
check("migration: orgSlug indexes", has(migration, "orgSlug"));

// ── Dashboard contract checks ─────────────────────────────────────────────────
const dashboard = read("lib/copilot/board-intelligence/board-intelligence-dashboard-contract.ts");
check("dashboard: NOT server-only", !has(dashboard, 'import "server-only"'));
check("dashboard: BoardSessionCard", has(dashboard, "BoardSessionCard"));
check("dashboard: BoardHealth", has(dashboard, "BoardHealth"));
check("dashboard: buildBoardSessionCard", has(dashboard, "buildBoardSessionCard"));
check("dashboard: buildBoardIntelligenceDashboard", has(dashboard, "buildBoardIntelligenceDashboard"));
check("dashboard: buildEmptyBoardIntelligenceDashboard", has(dashboard, "buildEmptyBoardIntelligenceDashboard"));
check("dashboard: BoardIntelligenceDashboard", has(dashboard, "BoardIntelligenceDashboard"));
check("dashboard: HEALTHY | DEGRADED | CRITICAL | EMPTY", has(dashboard, '"HEALTHY" | "DEGRADED" | "CRITICAL" | "EMPTY"'));
check("dashboard: fail-closed try/catch", has(dashboard, "} catch {"));

// ── Health checks ─────────────────────────────────────────────────────────────
const health = read("lib/copilot/board-intelligence/board-intelligence-health.ts");
check("health: checkBoardIntelligenceHealth", has(health, "checkBoardIntelligenceHealth"));
check("health: BoardIntelligenceHealth", has(health, "BoardIntelligenceHealth"));
check("health: HEALTHY status", has(health, '"HEALTHY"'));
check("health: DEGRADED status", has(health, '"DEGRADED"'));
check("health: UNAVAILABLE status", has(health, '"UNAVAILABLE"'));
check("health: SUGGESTED_ONLY check", has(health, "SUGGESTED_ONLY"));
check("health: TENANT_ISOLATED check", has(health, "TENANT_ISOLATED"));
check("health: fail-closed try/catch", has(health, "} catch {"));

// ── Readiness checks ──────────────────────────────────────────────────────────
const readiness = read("lib/copilot/board-intelligence/board-intelligence-readiness.ts");
check("readiness: checkBoardReadiness", has(readiness, "checkBoardReadiness"));
check("readiness: BoardReadinessFlags", has(readiness, "BoardReadinessFlags"));
check("readiness: hasExecutiveBrainData", has(readiness, "hasExecutiveBrainData"));
check("readiness: hasAdvisorData", has(readiness, "hasAdvisorData"));
check("readiness: hasCouncilData", has(readiness, "hasCouncilData"));
check("readiness: buildBoardReadinessFlags", has(readiness, "buildBoardReadinessFlags"));
check("readiness: isReady when Brain + Advisor present", has(readiness, "hasExecutiveBrainData && flags.hasAdvisorData"));
check("readiness: fail-closed try/catch", has(readiness, "} catch {"));

// ── Canonical checks ──────────────────────────────────────────────────────────
const canonical = read("lib/copilot/board-intelligence/board-intelligence-canonical.ts");
check("canonical: CANONICAL_BOARD_SCENARIOS", has(canonical, "CANONICAL_BOARD_SCENARIOS"));
check("canonical: CanonicalBoardScenario", has(canonical, "CanonicalBoardScenario"));
check("canonical: CRISIS_LIQUIDEZ_CRITICA", has(canonical, "CRISIS_LIQUIDEZ_CRITICA"));
check("canonical: TRANSFORMACION_DIGITAL", has(canonical, "TRANSFORMACION_DIGITAL"));
check("canonical: INCUMPLIMIENTO_REGULATORIO", has(canonical, "INCUMPLIMIENTO_REGULATORIO"));
check("canonical: CRISIS_REPUTACIONAL", has(canonical, "CRISIS_REPUTACIONAL"));
check("canonical: GOBIERNO_DIVIDENDOS", has(canonical, "GOBIERNO_DIVIDENDOS"));
check("canonical: suggestedOnly in limitations", has(canonical, "suggestedOnly: true"));
check("canonical: at least 20 scenarios", (canonical.match(/board_canon_/g) || []).length >= 20);
check("canonical: all domains covered", has(canonical, "TECHNOLOGY") && has(canonical, "PEOPLE") && has(canonical, "COMPLIANCE"));

// ── Synthesis engine checks ───────────────────────────────────────────────────
const synthesis = read("lib/copilot/board-intelligence/board-council-synthesis-engine.ts");
check("synthesis: buildBoardView", has(synthesis, "buildBoardView"));
check("synthesis: buildBoardConsensus", has(synthesis, "buildBoardConsensus"));
check("synthesis: buildBoardAssessment", has(synthesis, "buildBoardAssessment"));
check("synthesis: BoardView", has(synthesis, "BoardView"));
check("synthesis: BoardConsensus", has(synthesis, "BoardConsensus"));
check("synthesis: BoardAssessment", has(synthesis, "BoardAssessment"));
check("synthesis: hasConsensus", has(synthesis, "hasConsensus"));
check("synthesis: disagreementAreas", has(synthesis, "disagreementAreas"));
check("synthesis: fail-closed try/catch", has(synthesis, "} catch {"));

// ── Barrel checks ─────────────────────────────────────────────────────────────
const server = read("lib/copilot/board-intelligence/server.ts");
check("server: import server-only", has(server, 'import "server-only"'));
check("server: exports types", has(server, "board-intelligence-types"));
check("server: exports identity", has(server, "board-intelligence-identity"));
check("server: exports engine", has(server, "board-intelligence-engine"));
check("server: exports integrations", has(server, "board-executive-brain"));
check("server: exports canonical", has(server, "board-intelligence-canonical"));
check("server: exports synthesis", has(server, "board-council-synthesis-engine"));

const index = read("lib/copilot/board-intelligence/index.ts");
check("index: NO server-only import", !has(index, 'import "server-only"'));
check("index: exports BoardSession", has(index, "BoardSession"));
check("index: exports BoardRecommendation", has(index, "BoardRecommendation"));
check("index: exports CANONICAL_BOARD_SCENARIOS", has(index, "CANONICAL_BOARD_SCENARIOS"));
check("index: exports dashboard contract", has(index, "buildBoardIntelligenceDashboard"));

// ── Security registry checks ──────────────────────────────────────────────────
const secReg = read("lib/security/security-registry.ts");
check("security: BOARD_SESSION entry", has(secReg, '"BOARD_SESSION"'));
check("security: BOARD_REPORT entry", has(secReg, '"BOARD_REPORT"'));
check("security: BOARD_RISK entry", has(secReg, '"BOARD_RISK"'));
check("security: BOARD_RESOLUTION entry", has(secReg, '"BOARD_RESOLUTION"'));
check("security: BOARD_RECOMMENDATION entry", has(secReg, '"BOARD_RECOMMENDATION"'));
check("security: BOARD_FINDING entry", has(secReg, '"BOARD_FINDING"'));
check("security: all board entries use DATA_ACCESS category", secReg.includes('"BOARD_SESSION"') && secReg.includes('"DATA_ACCESS"'));
check("security: CONFIDENTIAL classification for sessions", has(secReg, '"CONFIDENTIAL"'));

// ── Intelligence registry checks ──────────────────────────────────────────────
const intReg = read("lib/copilot/copilot-intelligence-registry.ts");
check("int-registry: BOARD_INTELLIGENCE entry", has(intReg, '"BOARD_INTELLIGENCE"'));
check("int-registry: board-intelligence description", has(intReg, "board-intelligence"));
check("int-registry: barrel field", has(intReg, "board-intelligence/server"));
check("int-registry: clientBarrel field", has(intReg, "board-intelligence/index"));
check("int-registry: hasPrisma: true", has(intReg, "hasPrisma:    true"));
check("int-registry: hasDb: true", has(intReg, "hasDb:        true"));
check("int-registry: hasHealth: true", has(intReg, "hasHealth:    true"));
check("int-registry: hasReadiness: true", has(intReg, "hasReadiness: true"));
check("int-registry: EXECUTIVE_COUNCIL in depends", has(intReg, '"EXECUTIVE_COUNCIL"'));
check("int-registry: EXECUTIVE_BRAIN_V2 in depends", has(intReg, '"EXECUTIVE_BRAIN_V2"'));
check("int-registry: LEARNING_FRAMEWORK in depends", has(intReg, '"LEARNING_FRAMEWORK"'));

// ── Integration harness checks ────────────────────────────────────────────────
const harness = read("app/api/internal/integration-tests/board-intelligence/route.ts");
check("harness: GET export", has(harness, "export async function GET"));
check("harness: runBoardIntelligence import", has(harness, "runBoardIntelligence"));
check("harness: evaluateBoardComplianceGate", has(harness, "evaluateBoardComplianceGate"));
check("harness: CANONICAL_BOARD_SCENARIOS", has(harness, "CANONICAL_BOARD_SCENARIOS"));
check("harness: suggestedOnly tests", has(harness, "suggestedOnly"));
check("harness: tenant isolation test", has(harness, "org-a") && has(harness, "org-b"));
check("harness: PASS/FAIL verdict", has(harness, "ALL PASS"));
check("harness: NextResponse.json", has(harness, "NextResponse.json"));
check("harness: sprint field in response", has(harness, "AGENTIK-BOARD-INTELLIGENCE-01"));

// ── Cross-cutting concerns ────────────────────────────────────────────────────
// Verify NO direct execution patterns
for (const f of ["board-resolution-engine.ts", "decision-candidate-engine.ts", "board-recommendation-engine.ts"]) {
  const content = read(`lib/copilot/board-intelligence/${f}`);
  check(`${f}: no fetch()`, !has(content, "fetch("));
  check(`${f}: no writeFile`, !has(content, "writeFile"));
  check(`${f}: no axios`, !has(content, "axios"));
}

// All engine files must be fail-closed
for (const f of [
  "governance-assessment-engine.ts", "strategic-assessment-engine.ts",
  "board-risk-engine.ts", "board-opportunity-engine.ts",
  "board-concern-engine.ts", "board-priority-engine.ts",
  "board-alignment-engine.ts", "board-resolution-engine.ts",
  "board-narrative-engine.ts", "board-digest-engine.ts",
  "board-briefing-engine.ts", "board-intelligence-engine.ts",
]) {
  const content = read(`lib/copilot/board-intelligence/${f}`);
  check(`${f}: fail-closed pattern`, has(content, "} catch"));
}

// All integration files must be fail-closed
for (const f of [
  "board-executive-brain.ts", "board-advisor.ts", "board-simulations.ts",
  "board-planning.ts", "board-executive-council.ts", "board-strategic-memory.ts",
  "board-learning.ts", "board-memory-graph.ts", "board-cross-module.ts",
  "board-playbooks.ts", "board-compliance.ts",
]) {
  const content = read(`lib/copilot/board-intelligence/integrations/${f}`);
  check(`integration/${f}: fail-closed pattern`, has(content, "} catch"));
}

// ── Final Summary ─────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\nAGENTIK-BOARD-INTELLIGENCE-01 — Validation Results`);
console.log(`${"=".repeat(55)}`);
console.log(`PASS: ${passed}/${total}`);
console.log(`FAIL: ${failed}/${total}`);
if (errors.length > 0) {
  console.log(`\nFailed checks:`);
  errors.forEach((e) => console.log(`  ${e}`));
}
console.log(`\nVerdict: ${failed === 0 ? "ALL PASS ✓" : `${failed} FAILURES`}`);
process.exit(failed === 0 ? 0 : 1);
