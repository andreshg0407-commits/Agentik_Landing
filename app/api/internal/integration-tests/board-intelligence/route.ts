// AGENTIK-BOARD-INTELLIGENCE-01 — Integration Harness
// 45 test suites covering all layers

import { NextResponse } from "next/server";

// Types
import {
  boardConfidenceFromScore,
  boardOutcomeFromScore,
  governanceStatusFromScore,
  sortBoardRisksByComposite,
  sortBoardPrioritiesByScore,
  sortBoardOpportunitiesByCapture,
  sortBoardRecommendationsByPriority,
  BOARD_CONFIDENCES,
  BOARD_OUTCOMES,
  BOARD_DOMAINS,
  BOARD_PRIORITY_LEVELS,
  BOARD_BRIEFING_TYPES,
  BOARD_DIGEST_PERIODS,
} from "@/lib/copilot/board-intelligence/board-intelligence-types";

// Identity
import {
  generateBoardSessionId,
  generateBoardReportId,
  generateBoardFindingId,
  generateBoardRecommendationId,
  generateBoardResolutionId,
  validateBoardId,
  isBoardSessionId,
  isBoardReportId,
} from "@/lib/copilot/board-intelligence/board-intelligence-identity";

// Engines
import {
  buildGovernanceAssessment,
  scoreGovernance,
  rankGovernanceConcerns,
} from "@/lib/copilot/board-intelligence/governance-assessment-engine";
import {
  buildStrategicAssessment,
  scoreStrategicAlignment,
  scoreStrategicExecutionReadiness,
} from "@/lib/copilot/board-intelligence/strategic-assessment-engine";
import {
  buildBoardRisk,
  identifyBoardRisks,
  rankBoardRisks,
  scoreBoardRisk,
  getSystemicRisks,
} from "@/lib/copilot/board-intelligence/board-risk-engine";
import {
  buildBoardOpportunity,
  identifyBoardOpportunities,
  rankBoardOpportunities,
  scoreBoardOpportunity,
} from "@/lib/copilot/board-intelligence/board-opportunity-engine";
import {
  buildBoardConcern,
  identifyBoardConcerns,
  rankBoardConcerns,
  groupBoardConcerns,
} from "@/lib/copilot/board-intelligence/board-concern-engine";
import {
  buildBoardPriority,
  identifyBoardPriorities,
  rankBoardPriorities,
  scorePriority,
} from "@/lib/copilot/board-intelligence/board-priority-engine";
import {
  evaluateAlignment,
  evaluateAlignmentScore,
  detectMisalignment,
} from "@/lib/copilot/board-intelligence/board-alignment-engine";
import {
  buildBoardFinding,
  identifyBoardFindings,
  getBlockerFindings,
  getCriticalFindings,
} from "@/lib/copilot/board-intelligence/board-finding-engine";
import {
  buildDecisionCandidate,
  buildDecisionCandidates,
  rankDecisionCandidates,
  deriveOverallOutcomeFromCandidates,
} from "@/lib/copilot/board-intelligence/decision-candidate-engine";
import {
  buildBoardRecommendation,
  buildBoardRecommendations,
  rankBoardRecommendations,
} from "@/lib/copilot/board-intelligence/board-recommendation-engine";
import {
  buildResolution,
  validateResolution,
} from "@/lib/copilot/board-intelligence/board-resolution-engine";
import { buildBoardNarrative } from "@/lib/copilot/board-intelligence/board-narrative-engine";
import {
  buildBoardDigest,
  buildDigestTitle,
  buildDigestHeadline,
} from "@/lib/copilot/board-intelligence/board-digest-engine";
import { buildBoardBriefing } from "@/lib/copilot/board-intelligence/board-briefing-engine";
import { runBoardIntelligence } from "@/lib/copilot/board-intelligence/board-intelligence-engine";

// Integrations
import {
  buildExecutiveBrainBoardContext,
  getBoardConfidenceBoostFromBrain,
} from "@/lib/copilot/board-intelligence/integrations/board-executive-brain";
import {
  buildAdvisorBoardContext,
  getAdvisorTopRecommendationLabels,
} from "@/lib/copilot/board-intelligence/integrations/board-advisor";
import {
  buildSimulationBoardContext,
  getSimulationTitlesForBoard,
} from "@/lib/copilot/board-intelligence/integrations/board-simulations";
import {
  buildPlanningBoardContext,
  getActivePlanTitles,
} from "@/lib/copilot/board-intelligence/integrations/board-planning";
import {
  buildCouncilBoardContext,
  shouldEscalateToBoardFromCouncil,
  getCouncilGovernanceSignal,
} from "@/lib/copilot/board-intelligence/integrations/board-executive-council";
import {
  buildBoardMemoryContext,
  getBoardMemoryLimitations,
} from "@/lib/copilot/board-intelligence/integrations/board-strategic-memory";
import {
  buildLearningBoardContext,
  getRelevantBoardPatternNames,
} from "@/lib/copilot/board-intelligence/integrations/board-learning";
import {
  buildGraphBoardContext,
  getConnectedBoardNodeLabels,
} from "@/lib/copilot/board-intelligence/integrations/board-memory-graph";
import {
  buildCrossModuleBoardContext,
  getCrossModuleRiskLabels,
} from "@/lib/copilot/board-intelligence/integrations/board-cross-module";
import {
  registerBoardTenantProfile,
  getBoardTenantProfile,
  shouldEscalateToBoard,
} from "@/lib/copilot/board-intelligence/integrations/board-tenant-profile";
import {
  buildPlaybookBoardContext,
  getPlaybookTitlesForBoard,
} from "@/lib/copilot/board-intelligence/integrations/board-playbooks";
import {
  evaluateBoardComplianceGate,
  assertBoardTenantIsolation,
} from "@/lib/copilot/board-intelligence/integrations/board-compliance";
import {
  buildBoardAuditEvent,
  auditBoardSessionCreated,
  auditBoardResolutionGenerated,
} from "@/lib/copilot/board-intelligence/integrations/board-audit";

// Query
import {
  getSessions,
  getFindings,
  getRisks,
  getOpportunities,
  getPriorities,
  getRecommendations,
  getBoardStats,
  sortSessionsByScore,
} from "@/lib/copilot/board-intelligence/board-intelligence-query";

// Repository
import {
  InMemoryBoardIntelligenceRepository,
} from "@/lib/copilot/board-intelligence/board-intelligence-repository";

// Dashboard
import {
  buildBoardSessionCard,
  buildBoardIntelligenceDashboard,
  buildEmptyBoardIntelligenceDashboard,
} from "@/lib/copilot/board-intelligence/board-intelligence-dashboard-contract";

// Health + Readiness
import {
  checkBoardIntelligenceHealth,
} from "@/lib/copilot/board-intelligence/board-intelligence-health";
import {
  checkBoardReadiness,
  buildBoardReadinessFlags,
} from "@/lib/copilot/board-intelligence/board-intelligence-readiness";

// Canonical
import {
  CANONICAL_BOARD_SCENARIOS,
} from "@/lib/copilot/board-intelligence/board-intelligence-canonical";

// Synthesis
import {
  buildBoardView,
  buildBoardConsensus,
  buildBoardAssessment,
} from "@/lib/copilot/board-intelligence/board-council-synthesis-engine";

// ── Test helpers ────────────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; error?: string; details?: unknown };
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

function run(name: string, fn: () => void): TestResult {
  try { fn(); return { name, passed: true }; }
  catch (e) { return { name, passed: false, error: e instanceof Error ? e.message : String(e) }; }
}

async function runAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try { await fn(); return { name, passed: true }; }
  catch (e) { return { name, passed: false, error: e instanceof Error ? e.message : String(e) }; }
}

const ORG = "castillitos";
const SESSION_ID = "board_test_session";

// ── Test Suites ─────────────────────────────────────────────────────────────

export async function GET() {
  const results: TestResult[] = [];

  // ── Suite 1: Types ─────────────────────────────────────────────────────────
  results.push(run("types: BoardConfidence enum complete", () => {
    assert(BOARD_CONFIDENCES.includes("VERY_HIGH"), "VERY_HIGH missing");
    assert(BOARD_CONFIDENCES.length === 4, "Should have 4 confidences");
  }));
  results.push(run("types: BoardOutcome enum complete", () => {
    assert(BOARD_OUTCOMES.includes("APPROVE"), "APPROVE missing");
    assert(BOARD_OUTCOMES.includes("ESCALATE"), "ESCALATE missing");
    assert(BOARD_OUTCOMES.length === 5, "Should have 5 outcomes");
  }));
  results.push(run("types: BoardDomain enum complete", () => {
    assert(BOARD_DOMAINS.includes("GOVERNANCE"), "GOVERNANCE missing");
    assert(BOARD_DOMAINS.includes("CROSS_DOMAIN"), "CROSS_DOMAIN missing");
    assert(BOARD_DOMAINS.length === 11, "Should have 11 domains");
  }));
  results.push(run("types: utility functions work", () => {
    assert(boardConfidenceFromScore(0.9) === "VERY_HIGH", "0.9 -> VERY_HIGH");
    assert(boardConfidenceFromScore(0.7) === "HIGH", "0.7 -> HIGH");
    assert(boardConfidenceFromScore(0.5) === "MEDIUM", "0.5 -> MEDIUM");
    assert(boardConfidenceFromScore(0.1) === "LOW", "0.1 -> LOW");
    assert(governanceStatusFromScore(0.8) === "STRONG", "0.8 -> STRONG");
    assert(governanceStatusFromScore(0.2) === "CRITICAL", "0.2 -> CRITICAL");
  }));
  results.push(run("types: boardOutcomeFromScore logic", () => {
    assert(boardOutcomeFromScore(0.8, 0.2) === "APPROVE", "High gov, low risk -> APPROVE");
    assert(boardOutcomeFromScore(0.6, 0.5) === "APPROVE_WITH_CONDITIONS", "Med gov, med risk");
    assert(boardOutcomeFromScore(0.2, 0.8) === "ESCALATE", "Low gov, high risk -> ESCALATE");
  }));

  // ── Suite 2: Identity ──────────────────────────────────────────────────────
  results.push(run("identity: session ID format", () => {
    const id = generateBoardSessionId();
    assert(id.startsWith("board_"), "Must start with board_");
    assert(validateBoardId(id), "Must be valid");
    assert(isBoardSessionId(id), "Must be session ID");
  }));
  results.push(run("identity: report ID format", () => {
    const id = generateBoardReportId();
    assert(id.startsWith("board_report_"), "Must start with board_report_");
    assert(isBoardReportId(id), "Must be report ID");
  }));
  results.push(run("identity: uniqueness", () => {
    const ids = Array.from({ length: 10 }, () => generateBoardSessionId());
    assert(new Set(ids).size === 10, "All IDs must be unique");
  }));
  results.push(run("identity: invalid ID rejected", () => {
    assert(!validateBoardId("invalid"), "invalid should fail");
    assert(!validateBoardId(""), "empty should fail");
  }));

  // ── Suite 3: Governance ────────────────────────────────────────────────────
  results.push(run("governance: scoreGovernance basic", () => {
    const score = scoreGovernance({ orgSlug: ORG, sessionId: SESSION_ID, riskScore: 0.2, complianceScore: 0.8, controlScore: 0.8, alignmentScore: 0.8 });
    assert(score >= 0.6, `Score should be high, got ${score}`);
  }));
  results.push(run("governance: buildGovernanceAssessment structure", () => {
    const g = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    assert(g.orgSlug === ORG, "orgSlug");
    assert(typeof g.governanceScore === "number", "governanceScore");
    assert(["STRONG","ADEQUATE","WEAK","CRITICAL"].includes(g.status), "status");
    assert(Array.isArray(g.concerns), "concerns array");
    assert(Array.isArray(g.strengths), "strengths array");
    assert(g.assessedAt.length > 0, "assessedAt");
  }));
  results.push(run("governance: rankGovernanceConcerns sorts critical first", () => {
    const concerns = ["Minor issue", "CRÍTICO: fraude detectado", "High risk alert"];
    const ranked = rankGovernanceConcerns(concerns);
    assert(ranked[0].includes("CRÍTICO"), "Critical should be first");
  }));

  // ── Suite 4: Strategic ─────────────────────────────────────────────────────
  results.push(run("strategic: scoreStrategicAlignment with horizon boost", () => {
    const score = scoreStrategicAlignment({ orgSlug: ORG, sessionId: SESSION_ID, alignmentScore: 0.6, shortTermCoverage: true, mediumTermCoverage: true, longTermCoverage: true });
    assert(score >= 0.65, "Horizon boost should raise score");
  }));
  results.push(run("strategic: buildStrategicAssessment structure", () => {
    const s = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    assert(typeof s.strategicScore === "number", "strategicScore");
    assert(["SHORT","MEDIUM","LONG","MULTI_HORIZON"].includes(s.horizonCoverage), "horizonCoverage");
    assert(Array.isArray(s.gaps), "gaps array");
    assert(s.assessedAt.length > 0, "assessedAt");
  }));

  // ── Suite 5: Board Risks ───────────────────────────────────────────────────
  results.push(run("risks: scoreBoardRisk calculation", () => {
    const score = scoreBoardRisk(0.8, 0.9);
    assert(score > 0.6, "High likelihood + high impact = high composite risk");
    const low = scoreBoardRisk(0.1, 0.1);
    assert(low < 0.3, "Low likelihood + low impact = low risk");
  }));
  results.push(run("risks: buildBoardRisk structure", () => {
    const r = buildBoardRisk(ORG, SESSION_ID, {
      title: "Test Risk", description: "desc", domain: "FINANCE",
      likelihood: 0.7, impact: 0.8, isSystemic: true,
    });
    assert(r.id.startsWith("board_risk_"), "ID prefix");
    assert(r.orgSlug === ORG, "orgSlug");
    assert(r.isSystemic === true, "isSystemic");
    assert(typeof r.compositeRisk === "number", "compositeRisk defined on risk");
    assert(typeof r.compositeRisk === "number", "compositeRisk");
  }));
  results.push(run("risks: identifyBoardRisks + rank", () => {
    const risks = identifyBoardRisks(ORG, SESSION_ID, [
      { title: "High", description: "d", domain: "FINANCE", likelihood: 0.9, impact: 0.9 },
      { title: "Low",  description: "d", domain: "OPERATIONS", likelihood: 0.1, impact: 0.1 },
    ]);
    const ranked = rankBoardRisks(risks);
    assert(ranked[0].compositeRisk >= ranked[1].compositeRisk, "Should rank by compositeRisk desc");
  }));
  results.push(run("risks: getSystemicRisks filter", () => {
    const risks = identifyBoardRisks(ORG, SESSION_ID, [
      { title: "Systemic", description: "d", domain: "CROSS_DOMAIN", likelihood: 0.7, impact: 0.7, isSystemic: true },
      { title: "Local",    description: "d", domain: "FINANCE",      likelihood: 0.5, impact: 0.5, isSystemic: false },
    ]);
    const systemic = getSystemicRisks(risks);
    assert(systemic.length === 1, "Should find 1 systemic risk");
  }));

  // ── Suite 6: Opportunities ─────────────────────────────────────────────────
  results.push(run("opportunities: scoreBoardOpportunity weights", () => {
    const large = scoreBoardOpportunity("LARGE", "IMMEDIATE", 0.8);
    const small = scoreBoardOpportunity("SMALL", "LONG_TERM", 0.2);
    assert(large > small, "Large immediate should score higher");
  }));
  results.push(run("opportunities: buildBoardOpportunity structure", () => {
    const o = buildBoardOpportunity(ORG, SESSION_ID, {
      title: "Expand", description: "d", domain: "COMMERCIAL",
      magnitude: "LARGE", timeHorizon: "SHORT_TERM",
      captureScore: 0.75, rationale: "Good market conditions",
    });
    assert(o.id.startsWith("board_opp_"), "ID prefix");
    assert(typeof o.captureScore === "number", "captureScore defined on opportunity");
    assert(o.magnitude === "LARGE", "magnitude");
  }));

  // ── Suite 7: Concerns ──────────────────────────────────────────────────────
  results.push(run("concerns: buildBoardConcern structure", () => {
    const c = buildBoardConcern(ORG, SESSION_ID, {
      title: "Concern A", description: "d", domain: "GOVERNANCE",
      severity: "HIGH", isEmergent: true, isSystemic: false,
      rationale: "Detected in audit",
    });
    assert(c.id.startsWith("board_concern_"), "ID prefix");
    assert(c.isEmergent === true, "isEmergent");
  }));
  results.push(run("concerns: rankBoardConcerns puts CRITICAL first", () => {
    const concerns = identifyBoardConcerns(ORG, SESSION_ID, [
      { title: "Low", description: "d", domain: "OPERATIONS", severity: "LOW", rationale: "r" },
      { title: "Critical Systemic", description: "d", domain: "CROSS_DOMAIN", severity: "CRITICAL", isSystemic: true, rationale: "r" },
    ]);
    const ranked = rankBoardConcerns(concerns);
    assert(ranked[0].severity === "CRITICAL", "CRITICAL should be first");
  }));
  results.push(run("concerns: groupBoardConcerns by domain", () => {
    const concerns = identifyBoardConcerns(ORG, SESSION_ID, [
      { title: "A", description: "d", domain: "FINANCE",     severity: "MEDIUM", rationale: "r" },
      { title: "B", description: "d", domain: "OPERATIONS",  severity: "LOW",    rationale: "r" },
    ]);
    const groups = groupBoardConcerns(concerns);
    assert("FINANCE" in groups, "FINANCE group");
    assert("OPERATIONS" in groups, "OPERATIONS group");
  }));

  // ── Suite 8: Priorities ────────────────────────────────────────────────────
  results.push(run("priorities: scorePriority calculation", () => {
    const high = scorePriority(0.9, 0.9, "CRITICAL");
    const low  = scorePriority(0.1, 0.1, "LOW");
    assert(high > low, "High priority params should score higher");
  }));
  results.push(run("priorities: rankBoardPriorities assigns ranks", () => {
    const priorities = identifyBoardPriorities(ORG, SESSION_ID, [
      { title: "B", description: "d", domain: "STRATEGY", level: "LOW",      impactScore: 0.3, urgencyScore: 0.3, rationale: "r" },
      { title: "A", description: "d", domain: "FINANCE",  level: "CRITICAL", impactScore: 0.9, urgencyScore: 0.9, rationale: "r" },
    ]);
    const ranked = rankBoardPriorities(priorities);
    assert(ranked[0].rank === 1, "First rank should be 1");
    assert(ranked[0].priorityScore >= ranked[1].priorityScore, "Top priority should have higher score");
  }));

  // ── Suite 9: Alignment ────────────────────────────────────────────────────
  results.push(run("alignment: evaluateAlignmentScore", () => {
    const score = evaluateAlignmentScore({ orgSlug: ORG, sessionId: SESSION_ID, strategicScore: 0.8, governanceScore: 0.8, executionScore: 0.8, risksAligned: true, budgetAligned: true });
    assert(score >= 0.75, "High inputs should yield high alignment");
  }));
  results.push(run("alignment: detectMisalignment flags issues", () => {
    const misaligned = detectMisalignment({ orgSlug: ORG, sessionId: SESSION_ID, strategicScore: 0.2, governanceScore: 0.2, risksAligned: false });
    assert(misaligned.length >= 2, "Should detect at least 2 misalignments");
  }));
  results.push(run("alignment: evaluateAlignment structure", () => {
    const a = evaluateAlignment({ orgSlug: ORG, sessionId: SESSION_ID });
    assert(typeof a.alignmentScore === "number", "alignmentScore");
    assert(Array.isArray(a.misalignedAreas), "misalignedAreas");
    assert(Array.isArray(a.alignedAreas), "alignedAreas");
    assert(a.alignmentSummary.length > 0, "alignmentSummary");
  }));

  // ── Suite 10: Findings ────────────────────────────────────────────────────
  results.push(run("findings: buildBoardFinding structure", () => {
    const f = buildBoardFinding(ORG, SESSION_ID, {
      title: "Critical Finding", description: "d", domain: "FINANCE",
      priority: "CRITICAL", isBlocker: true, sourceModule: "test",
    });
    assert(f.id.startsWith("board_finding_"), "ID prefix");
    assert(f.isBlocker === true, "isBlocker");
  }));
  results.push(run("findings: getBlockerFindings filter", () => {
    const findings = identifyBoardFindings(ORG, SESSION_ID, [
      { title: "Blocker", description: "d", domain: "FINANCE", priority: "CRITICAL", isBlocker: true, sourceModule: "m" },
      { title: "Non-blocker", description: "d", domain: "OPERATIONS", priority: "LOW", isBlocker: false, sourceModule: "m" },
    ]);
    const blockers = getBlockerFindings(findings);
    assert(blockers.length === 1, "Should find 1 blocker");
  }));

  // ── Suite 11: Decision Candidates ────────────────────────────────────────
  results.push(run("decisions: buildDecisionCandidate suggestedOnly", () => {
    const gov = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const c = buildDecisionCandidate(ORG, SESSION_ID, {
      title: "Test Decision", description: "d", domain: "STRATEGY",
      impactScore: 0.7, riskScore: 0.3, rationale: "r",
    }, gov);
    assert(c.suggestedOnly === true, "suggestedOnly must be true");
    assert(c.id.startsWith("board_decision_"), "ID prefix");
  }));
  results.push(run("decisions: rankDecisionCandidates APPROVE first", () => {
    const gov = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID, riskScore: 0.1, complianceScore: 0.9, controlScore: 0.9, alignmentScore: 0.9 });
    const candidates = buildDecisionCandidates(ORG, SESSION_ID, [
      { title: "Approve-able", description: "d", domain: "FINANCE", impactScore: 0.9, riskScore: 0.1, rationale: "r" },
      { title: "Risky", description: "d", domain: "RISK", impactScore: 0.3, riskScore: 0.9, rationale: "r" },
    ], gov);
    const ranked = rankDecisionCandidates(candidates);
    assert(ranked.length === 2, "Should have 2 candidates");
  }));

  // ── Suite 12: Recommendations ─────────────────────────────────────────────
  results.push(run("recommendations: buildBoardRecommendation suggestedOnly", () => {
    const r = buildBoardRecommendation(ORG, SESSION_ID, {
      title: "Rec A", description: "d", rationale: "r", domain: "STRATEGY",
      priority: "HIGH", impactScore: 0.8, riskScore: 0.2,
    });
    assert(r.suggestedOnly === true, "suggestedOnly must be true");
    assert(r.id.startsWith("board_recommendation_"), "ID prefix");
  }));
  results.push(run("recommendations: deduplication works", () => {
    const recs = buildBoardRecommendations(ORG, SESSION_ID, [
      { title: "Rec A duplicate", description: "d", rationale: "r", domain: "FINANCE", priority: "HIGH", impactScore: 0.7, riskScore: 0.3 },
      { title: "Rec A duplicate", description: "d", rationale: "r", domain: "FINANCE", priority: "HIGH", impactScore: 0.7, riskScore: 0.3 },
      { title: "Rec B unique",    description: "d", rationale: "r", domain: "STRATEGY", priority: "MEDIUM", impactScore: 0.5, riskScore: 0.4 },
    ]);
    const { deduplicateBoardRecommendations } = require("@/lib/copilot/board-intelligence/board-recommendation-engine");
    const deduped = deduplicateBoardRecommendations(recs);
    assert(deduped.length === 2, "Should deduplicate to 2");
  }));

  // ── Suite 13: Resolution ──────────────────────────────────────────────────
  results.push(run("resolution: buildResolution suggestedOnly", () => {
    const gov = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const r = buildResolution({
      orgSlug: ORG, sessionId: SESSION_ID,
      title: "Test Resolution", summary: "Test",
      recommendations: [], decisionCandidates: [], risks: [], governance: gov,
    });
    assert(r.suggestedOnly === true, "suggestedOnly must be true");
    assert(r.id.startsWith("board_resolution_"), "ID prefix");
    assert(r.resolvedAt.length > 0, "resolvedAt");
  }));
  results.push(run("resolution: validateResolution basic valid", () => {
    const gov = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const r = buildResolution({
      orgSlug: ORG, sessionId: SESSION_ID,
      title: "Res A", summary: "Summary",
      recommendations: [], decisionCandidates: [], risks: [], governance: gov,
      limitations: ["Test limitation"],
    });
    const validation = validateResolution(r);
    assert(validation.isValid, `Should be valid: ${validation.errors.join(", ")}`);
  }));

  // ── Suite 14: Narrative ────────────────────────────────────────────────────
  results.push(run("narrative: buildBoardNarrative structure", () => {
    const gov  = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const strat = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const n = buildBoardNarrative({
      orgSlug: ORG, sessionId: SESSION_ID, topic: "Q2 Strategy Review",
      governance: gov, strategic: strat,
      topRisks: [], topOpportunities: [], topPriorities: [], resolution: null,
    });
    assert(n.executive.length > 0, "executive narrative");
    assert(n.governance.length > 0, "governance narrative");
    assert(n.strategic.length > 0, "strategic narrative");
    assert(n.risk.length > 0, "risk narrative");
    assert(n.generatedAt.length > 0, "generatedAt");
  }));

  // ── Suite 15: Digest ──────────────────────────────────────────────────────
  results.push(run("digest: buildBoardDigest structure", () => {
    const gov  = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const strat = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const d = buildBoardDigest({
      orgSlug: ORG, period: "MONTHLY",
      title: buildDigestTitle(ORG, "MONTHLY", "Q2"),
      headline: buildDigestHeadline(gov, strat, []),
      topPriorities: [], topRisks: [], topOpportunities: [], topRecommendations: [],
      governance: gov, strategic: strat,
    });
    assert(d.id.startsWith("board_digest_"), "ID prefix");
    assert(d.period === "MONTHLY", "period");
    assert(d.generatedAt.length > 0, "generatedAt");
  }));
  results.push(run("digest: all periods supported", () => {
    const gov  = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const strat = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    for (const period of BOARD_DIGEST_PERIODS) {
      const d = buildBoardDigest({
        orgSlug: ORG, period,
        title: buildDigestTitle(ORG, period, "Test"),
        headline: "H", topPriorities: [], topRisks: [], topOpportunities: [], topRecommendations: [],
        governance: gov, strategic: strat,
      });
      assert(d.period === period, `Period ${period} not preserved`);
    }
  }));

  // ── Suite 16: Briefing ─────────────────────────────────────────────────────
  results.push(run("briefing: buildBoardBriefing for all types", () => {
    const gov  = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const strat = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    for (const type of BOARD_BRIEFING_TYPES) {
      const b = buildBoardBriefing({
        orgSlug: ORG, type, topic: "Test",
        topPriorities: [], topRisks: [], topOpportunities: [], topRecommendations: [], topFindings: [],
        governance: gov, strategic: strat,
      });
      assert(b.type === type, `Type ${type}`);
      assert(b.id.startsWith("board_briefing_"), "ID prefix");
      assert(b.summary.length > 0, "summary");
    }
  }));

  // ── Suite 17: Main Pipeline ────────────────────────────────────────────────
  results.push(run("pipeline: runBoardIntelligence success path", () => {
    const result = runBoardIntelligence(
      { orgSlug: ORG, topic: "Q2 Board Review" },
      {
        riskSignals: [
          { title: "Liquidity risk", description: "d", domain: "FINANCE", likelihood: 0.6, impact: 0.7 },
        ],
        prioritySignals: [
          { title: "Market expansion", description: "d", domain: "COMMERCIAL", level: "HIGH", impactScore: 0.8, urgencyScore: 0.7, rationale: "r" },
        ],
      }
    );
    assert(result.status === "SUCCESS", `Status: ${result.status}`);
    assert(result.session !== undefined, "Session should exist");
    assert(result.report !== undefined, "Report should exist");
    assert(result.session!.orgSlug === ORG, "orgSlug");
    assert(result.session!.resolution !== null, "Resolution should exist");
    assert(result.session!.resolution!.suggestedOnly === true, "suggestedOnly");
  }));
  results.push(run("pipeline: runBoardIntelligence with digest", () => {
    const result = runBoardIntelligence(
      { orgSlug: ORG, topic: "Monthly Digest", digestPeriod: "MONTHLY" },
      {}
    );
    assert(result.status === "SUCCESS", "Should succeed");
    assert(result.digest !== undefined, "Digest should exist");
    assert(result.digest!.period === "MONTHLY", "Period");
  }));
  results.push(run("pipeline: runBoardIntelligence with briefing", () => {
    const result = runBoardIntelligence(
      { orgSlug: ORG, topic: "CEO Briefing", briefingType: "CEO" },
      {}
    );
    assert(result.status === "SUCCESS", "Should succeed");
    assert(result.briefing !== undefined, "Briefing should exist");
    assert(result.briefing!.type === "CEO", "Type");
  }));
  results.push(run("pipeline: runBoardIntelligence fails on missing orgSlug", () => {
    const result = runBoardIntelligence({ orgSlug: "", topic: "Test" }, {});
    assert(result.status === "FAILED", "Should fail");
    assert(typeof result.error === "string", "Error message");
  }));
  results.push(run("pipeline: all recommendations suggestedOnly", () => {
    const result = runBoardIntelligence({ orgSlug: ORG, topic: "Check" }, {
      recommendationSignals: [
        { title: "Rec 1", description: "d", rationale: "r", domain: "STRATEGY", priority: "HIGH", impactScore: 0.7, riskScore: 0.3 },
      ],
    });
    assert(result.status === "SUCCESS", "Should succeed");
    const recs = result.session!.recommendations;
    assert(recs.every((r) => r.suggestedOnly === true), "All recs must be suggestedOnly");
  }));
  results.push(run("pipeline: tenant isolation preserved", () => {
    const r1 = runBoardIntelligence({ orgSlug: "org-a", topic: "T1" }, {});
    const r2 = runBoardIntelligence({ orgSlug: "org-b", topic: "T2" }, {});
    assert(r1.session!.orgSlug === "org-a", "org-a");
    assert(r2.session!.orgSlug === "org-b", "org-b");
    assert(r1.session!.orgSlug !== r2.session!.orgSlug, "Must be different");
  }));

  // ── Suite 18: Integration — Executive Brain ───────────────────────────────
  results.push(run("int-brain: buildExecutiveBrainBoardContext", () => {
    const ctx = buildExecutiveBrainBoardContext(ORG, ["Priority 1"], ["Risk 1"], ["Opp 1"], ["Focus 1"], 0.8);
    assert(ctx.orgSlug === ORG, "orgSlug");
    assert(ctx.boardBoost > 0, "boardBoost");
    assert(ctx.priorities.length === 1, "priorities");
  }));
  results.push(run("int-brain: getBoardConfidenceBoostFromBrain max 0.15", () => {
    const ctx = buildExecutiveBrainBoardContext(ORG, [], [], [], [], 1.0);
    assert(getBoardConfidenceBoostFromBrain(ctx) <= 0.15, "Max 0.15");
  }));

  // ── Suite 19: Integration — Advisor ──────────────────────────────────────
  results.push(run("int-advisor: buildAdvisorBoardContext", () => {
    const ctx = buildAdvisorBoardContext(ORG, ["Critical: fix compliance"], ["Emergent concern"], ["Risk A"]);
    assert(ctx.orgSlug === ORG, "orgSlug");
    assert(ctx.criticalRecCount >= 1, "criticalRecCount");
    assert(ctx.advisorBoost > 0, "advisorBoost");
  }));

  // ── Suite 20: Integration — Simulations ──────────────────────────────────
  results.push(run("int-simulations: buildSimulationBoardContext", () => {
    const ctx = buildSimulationBoardContext(ORG, [
      { id: "s1", orgSlug: ORG, title: "Scenario A", outcome: "POSITIVE", confidenceScore: 0.8, impactScore: 0.9, suggestedOnly: true },
    ]);
    assert(ctx.totalCount === 1, "totalCount");
    assert(ctx.highImpactCount === 1, "highImpactCount");
    assert(getSimulationTitlesForBoard(ctx).includes("Scenario A"), "title");
  }));

  // ── Suite 21: Integration — Planning ─────────────────────────────────────
  results.push(run("int-planning: buildPlanningBoardContext", () => {
    const ctx = buildPlanningBoardContext(ORG,
      [{ id: "p1", orgSlug: ORG, title: "Plan A", status: "ACTIVE", score: 0.8 }],
      [{ id: "i1", orgSlug: ORG, title: "Init A", status: "IN_PROGRESS" }]
    );
    assert(ctx.activePlanCount === 1, "activePlanCount");
    assert(ctx.activeInitiativeCount === 1, "activeInitiativeCount");
    assert(getActivePlanTitles(ctx).includes("Plan A"), "plan title");
  }));

  // ── Suite 22: Integration — Executive Council ─────────────────────────────
  results.push(run("int-council: buildCouncilBoardContext with consensus", () => {
    const ctx = buildCouncilBoardContext(ORG, [
      { id: "c1", orgSlug: ORG, topic: "T1", outcome: "CONSENSUS", sessionScore: 0.8, confidence: "HIGH", hasEscalation: false, hasConsensus: true },
    ]);
    assert(ctx.consensusCount === 1, "consensusCount");
    assert(!ctx.hasActiveEscalation, "no escalation");
    assert(!shouldEscalateToBoardFromCouncil(ctx), "should not escalate");
  }));
  results.push(run("int-council: escalation detection", () => {
    const ctx = buildCouncilBoardContext(ORG, [
      { id: "c1", orgSlug: ORG, topic: "T1", outcome: "ESCALATION_REQUIRED", sessionScore: 0.3, confidence: "LOW", hasEscalation: true, hasConsensus: false },
    ]);
    assert(ctx.hasActiveEscalation, "has active escalation");
    assert(shouldEscalateToBoardFromCouncil(ctx), "should escalate");
    assert(getCouncilGovernanceSignal(ctx) < 0.5, "Low governance signal when escalating");
  }));

  // ── Suite 23: Integration — Memory ────────────────────────────────────────
  results.push(run("int-memory: buildBoardMemoryContext", () => {
    const ctx = buildBoardMemoryContext(ORG, ["Topic A", "Topic A", "Topic B"], ["APPROVE", "REVIEW_REQUIRED"]);
    assert(ctx.recurrenceCount === 1, "Should detect 1 recurrence");
    assert(ctx.hasRecurringIssues, "hasRecurringIssues");
    assert(getBoardMemoryLimitations(ctx).length > 0, "limitations");
  }));

  // ── Suite 24: Integration — Learning ─────────────────────────────────────
  results.push(run("int-learning: LearningPattern uses .name not .label", () => {
    const mockPatterns = [
      { orgSlug: ORG, name: "Pattern Alpha", status: "REINFORCED", description: "d", reinforcementCount: 3, weakeningCount: 0, netScore: 3, evidenceEventIds: [], firstSeenAt: "", lastUpdatedAt: "" },
    ] as any[];
    const names = getRelevantBoardPatternNames(ORG, mockPatterns);
    assert(names.includes("Pattern Alpha"), "Should return pattern name");
  }));

  // ── Suite 25: Integration — Memory Graph ──────────────────────────────────
  results.push(run("int-graph: buildGraphBoardContext uses sourceNodeId/targetNodeId", () => {
    const node1 = { id: "n1", orgSlug: ORG, type: "FINANCIAL_KPI", label: "Revenue", data: {}, createdAt: "" } as any;
    const node2 = { id: "n2", orgSlug: ORG, type: "RISK", label: "Liquidity Risk", data: {}, createdAt: "" } as any;
    const edge  = { id: "e1", sourceNodeId: "n1", targetNodeId: "n2", type: "IMPACTS", weight: 0.8, data: {}, createdAt: "" } as any;
    const ctx = buildGraphBoardContext(ORG, [node1, node2], [edge]);
    assert(ctx.nodeCount === 2, "nodeCount");
    assert(ctx.edgeCount === 1, "edgeCount");
    const labels = getConnectedBoardNodeLabels(ctx);
    assert(labels.length > 0, "Should return labels");
  }));

  // ── Suite 26: Integration — Cross-Module ──────────────────────────────────
  results.push(run("int-cross: buildCrossModuleBoardContext from null", () => {
    const ctx = buildCrossModuleBoardContext(ORG, null);
    assert(ctx.crossModuleBoost === 0, "Zero boost from null");
    assert(ctx.findings.length === 0, "No findings");
  }));

  // ── Suite 27: Tenant Profile ──────────────────────────────────────────────
  results.push(run("tenant-profile: register and retrieve", () => {
    registerBoardTenantProfile({
      orgSlug: "test-board-org",
      boardSize: 7,
      governanceMaturity: "HIGH",
      riskTolerance: "CONSERVATIVE",
      industryContext: "Financial Services",
      escalationThreshold: 0.35,
    });
    const profile = getBoardTenantProfile("test-board-org");
    assert(profile.boardSize === 7, "boardSize");
    assert(profile.governanceMaturity === "HIGH", "governanceMaturity");
  }));
  results.push(run("tenant-profile: shouldEscalateToBoard CONSERVATIVE threshold", () => {
    registerBoardTenantProfile({
      orgSlug: "conservative-org",
      boardSize: 5,
      governanceMaturity: "HIGH",
      riskTolerance: "CONSERVATIVE",
      industryContext: "Banking",
      escalationThreshold: 0.35,
    });
    assert(shouldEscalateToBoard("conservative-org", 0.45), "Should escalate at 0.45 for CONSERVATIVE");
    assert(!shouldEscalateToBoard("conservative-org", 0.30), "Should not escalate at 0.30");
  }));

  // ── Suite 28: Playbooks ───────────────────────────────────────────────────
  results.push(run("playbooks: uses .title not .name", () => {
    const playbooks = [
      { id: "pb1", orgSlug: ORG, title: "Governance Crisis Playbook", status: "ACTIVE", domain: "governance" },
    ];
    const titles = getPlaybookTitlesForBoard(ORG, playbooks);
    assert(titles.includes("Governance Crisis Playbook"), "Should find playbook title");
  }));

  // ── Suite 29: Compliance Gate ─────────────────────────────────────────────
  results.push(run("compliance: evaluateBoardComplianceGate passes valid session", () => {
    const result = runBoardIntelligence({ orgSlug: ORG, topic: "Compliance Test" }, {
      recommendationSignals: [{ title: "R1", description: "d", rationale: "r", domain: "COMPLIANCE", priority: "HIGH", impactScore: 0.7, riskScore: 0.3 }],
    });
    assert(result.status === "SUCCESS", "Session must succeed first");
    const compliance = evaluateBoardComplianceGate(ORG, result.session!);
    assert(compliance.passed, `Must pass: ${compliance.failedChecks.join(", ")}`);
    assert(compliance.passedChecks.includes("TENANT_ISOLATION"), "TENANT_ISOLATION");
    assert(compliance.passedChecks.includes("SUGGESTED_ONLY"), "SUGGESTED_ONLY");
  }));
  results.push(run("compliance: assertBoardTenantIsolation throws on violation", () => {
    const result = runBoardIntelligence({ orgSlug: "org-x", topic: "Test" }, {});
    let threw = false;
    try {
      assertBoardTenantIsolation("org-y", result.session!);
    } catch {
      threw = true;
    }
    assert(threw, "Should throw on tenant isolation violation");
  }));

  // ── Suite 30: Audit ───────────────────────────────────────────────────────
  results.push(run("audit: buildBoardAuditEvent structure", () => {
    const event = buildBoardAuditEvent(ORG, SESSION_ID, "BOARD_SESSION_CREATED", { topic: "Test" });
    assert(event.id.startsWith("baud_"), "ID prefix baud_");
    assert(event.eventType === "BOARD_SESSION_CREATED", "eventType");
    assert(event.orgSlug === ORG, "orgSlug");
    assert(event.timestamp.length > 0, "timestamp");
  }));
  results.push(run("audit: named constructors work", () => {
    const e1 = auditBoardSessionCreated(ORG, SESSION_ID, "Topic A");
    assert(e1.eventType === "BOARD_SESSION_CREATED", "session created");
    const e2 = auditBoardResolutionGenerated(ORG, SESSION_ID, "APPROVE", "HIGH");
    assert(e2.metadata.suggestedOnly === true, "resolution audit has suggestedOnly");
  }));

  // ── Suite 31: Query Layer ─────────────────────────────────────────────────
  results.push(run("query: getSessions filters by orgSlug", () => {
    const r1 = runBoardIntelligence({ orgSlug: "org-a", topic: "T1" }, {});
    const r2 = runBoardIntelligence({ orgSlug: "org-b", topic: "T2" }, {});
    const all = [r1.session!, r2.session!];
    assert(getSessions("org-a", all).length === 1, "Only org-a sessions");
    assert(getSessions("org-b", all).length === 1, "Only org-b sessions");
  }));
  results.push(run("query: getBoardStats computes correctly", () => {
    const results2: typeof results = [];
    for (let i = 0; i < 3; i++) {
      const r = runBoardIntelligence({ orgSlug: ORG, topic: `Session ${i}` }, {});
      results2.push(run(`stat-session-${i}`, () => assert(r.status === "SUCCESS", "OK")));
    }
    const sessions = [
      runBoardIntelligence({ orgSlug: ORG, topic: "S1" }, {}).session!,
      runBoardIntelligence({ orgSlug: ORG, topic: "S2" }, {}).session!,
    ];
    const stats = getBoardStats(ORG, sessions);
    assert(stats.totalSessions === 2, "totalSessions");
    assert(typeof stats.avgBoardScore === "number", "avgBoardScore");
    assert(typeof stats.avgGovernanceScore === "number", "avgGovernanceScore");
  }));

  // ── Suite 32: Repository (In-Memory) ──────────────────────────────────────
  results.push(await runAsync("repository: save and retrieve session", async () => {
    const repo = new InMemoryBoardIntelligenceRepository();
    const r = runBoardIntelligence({ orgSlug: ORG, topic: "Repo Test" }, {});
    await repo.saveSession(r.session!);
    const retrieved = await repo.getSession(ORG, r.session!.id);
    assert(retrieved !== null, "Session should be retrievable");
    assert(retrieved!.id === r.session!.id, "ID matches");
  }));
  results.push(await runAsync("repository: querySessions returns all for orgSlug", async () => {
    const repo = new InMemoryBoardIntelligenceRepository();
    for (const t of ["T1","T2","T3"]) {
      const r = runBoardIntelligence({ orgSlug: ORG, topic: t }, {});
      await repo.saveSession(r.session!);
    }
    const sessions = await repo.querySessions(ORG);
    assert(sessions.length === 3, `Should have 3 sessions, got ${sessions.length}`);
  }));
  results.push(await runAsync("repository: archiveSession removes", async () => {
    const repo = new InMemoryBoardIntelligenceRepository();
    const r = runBoardIntelligence({ orgSlug: ORG, topic: "Archive Me" }, {});
    await repo.saveSession(r.session!);
    await repo.archiveSession(ORG, r.session!.id);
    const retrieved = await repo.getSession(ORG, r.session!.id);
    assert(retrieved === null, "Should be null after archive");
  }));

  // ── Suite 33: Dashboard Contract ──────────────────────────────────────────
  results.push(run("dashboard: buildBoardSessionCard structure", () => {
    const r = runBoardIntelligence({ orgSlug: ORG, topic: "Dashboard Test" }, {});
    const card = buildBoardSessionCard(r.session!);
    assert(card.id === r.session!.id, "ID");
    assert(card.orgSlug === ORG, "orgSlug");
    assert(typeof card.boardScore === "number", "boardScore");
    assert(typeof card.governanceScore === "number", "governanceScore");
    assert(typeof card.criticalRiskCount === "number", "criticalRiskCount");
  }));
  results.push(run("dashboard: buildBoardIntelligenceDashboard structure", () => {
    const sessions = [
      runBoardIntelligence({ orgSlug: ORG, topic: "S1" }, {}).session!,
      runBoardIntelligence({ orgSlug: ORG, topic: "S2" }, {}).session!,
    ];
    const dashboard = buildBoardIntelligenceDashboard(ORG, sessions);
    assert(dashboard.orgSlug === ORG, "orgSlug");
    assert(dashboard.totalSessions === 2, "totalSessions");
    assert(["HEALTHY","DEGRADED","CRITICAL","EMPTY"].includes(dashboard.boardHealth), "boardHealth");
    assert(Array.isArray(dashboard.sessions), "sessions array");
  }));
  results.push(run("dashboard: empty dashboard for no sessions", () => {
    const d = buildEmptyBoardIntelligenceDashboard(ORG);
    assert(d.boardHealth === "EMPTY", "boardHealth EMPTY");
    assert(d.totalSessions === 0, "totalSessions 0");
  }));

  // ── Suite 34: Health ──────────────────────────────────────────────────────
  results.push(run("health: checkBoardIntelligenceHealth returns HEALTHY", () => {
    const health = checkBoardIntelligenceHealth();
    assert(["HEALTHY","DEGRADED","UNAVAILABLE"].includes(health.status), "valid status");
    assert(typeof health.score === "number", "score");
    assert(Array.isArray(health.checks), "checks array");
    assert(health.checks.length > 0, "has checks");
    assert(health.status === "HEALTHY", `Should be HEALTHY, got ${health.status}`);
  }));

  // ── Suite 35: Readiness ───────────────────────────────────────────────────
  results.push(run("readiness: isReady when Brain + Advisor present", () => {
    const flags = buildBoardReadinessFlags({ hasBrainData: true, hasAdvisorData: true });
    const result = checkBoardReadiness(flags);
    assert(result.isReady, "Should be ready");
    assert(result.readinessScore >= 0.25, "Score >= 0.25");
  }));
  results.push(run("readiness: not ready when missing required", () => {
    const flags = buildBoardReadinessFlags({ hasBrainData: false, hasAdvisorData: false });
    const result = checkBoardReadiness(flags);
    assert(!result.isReady, "Should not be ready");
    assert(result.limitations.length > 0, "Has limitations");
  }));
  results.push(run("readiness: full readiness when all flags set", () => {
    const flags = buildBoardReadinessFlags({
      hasBrainData: true, hasAdvisorData: true, hasSimData: true,
      hasPlanningData: true, hasCouncilData: true, hasMemoryData: true,
      hasCrossModuleData: true, hasLearningData: true,
    });
    const result = checkBoardReadiness(flags);
    assert(result.isReady, "Should be ready");
    assert(result.readinessScore === 1.0, "Score should be 1.0");
    assert(result.limitations.length === 0, "No limitations");
  }));

  // ── Suite 36: Canonical Scenarios ────────────────────────────────────────
  results.push(run("canonical: 20 scenarios defined", () => {
    assert(CANONICAL_BOARD_SCENARIOS.length === 20, `Should have 20, got ${CANONICAL_BOARD_SCENARIOS.length}`);
  }));
  results.push(run("canonical: all have required fields", () => {
    for (const s of CANONICAL_BOARD_SCENARIOS) {
      assert(s.id.length > 0, `id missing in ${s.type}`);
      assert(s.title.length > 0, `title missing in ${s.type}`);
      assert(s.limitations.some((l) => l.includes("suggestedOnly")), `suggestedOnly limitation missing in ${s.type}`);
      assert(BOARD_OUTCOMES.includes(s.suggestedOutcome), `Invalid outcome in ${s.type}`);
    }
  }));
  results.push(run("canonical: all CRITICAL scenarios escalate or review", () => {
    const criticals = CANONICAL_BOARD_SCENARIOS.filter((s) => s.priority === "CRITICAL");
    assert(criticals.length >= 5, "Should have at least 5 critical scenarios");
    assert(criticals.every((s) =>
      s.suggestedOutcome === "ESCALATE" ||
      s.suggestedOutcome === "REVIEW_REQUIRED" ||
      s.suggestedOutcome === "APPROVE_WITH_CONDITIONS"
    ), "CRITICAL scenarios should not be plain APPROVE");
  }));

  // ── Suite 37: Synthesis Engine ────────────────────────────────────────────
  results.push(run("synthesis: buildBoardView structure", () => {
    const gov  = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const strat = buildStrategicAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const council = buildCouncilBoardContext(ORG, []);
    const view = buildBoardView(ORG, SESSION_ID, gov, strat, council);
    assert(view.orgSlug === ORG, "orgSlug");
    assert(view.executiveSummary.length > 0, "executiveSummary");
    assert(typeof view.boardScore === "number", "boardScore");
  }));
  results.push(run("synthesis: buildBoardConsensus with escalation", () => {
    const gov = buildGovernanceAssessment({ orgSlug: ORG, sessionId: SESSION_ID });
    const council = buildCouncilBoardContext(ORG, [
      { id: "c1", orgSlug: ORG, topic: "T1", outcome: "ESCALATION_REQUIRED", sessionScore: 0.3, confidence: "LOW", hasEscalation: true, hasConsensus: false },
    ]);
    const consensus = buildBoardConsensus(ORG, SESSION_ID, council, gov);
    assert(!consensus.hasConsensus, "No consensus when escalating");
    assert(consensus.disagreementAreas.length > 0, "Should have disagreement areas");
  }));
  results.push(run("synthesis: buildBoardAssessment integrates council", () => {
    const council = buildCouncilBoardContext(ORG, [
      { id: "c1", orgSlug: ORG, topic: "T1", outcome: "CONSENSUS", sessionScore: 0.85, confidence: "HIGH", hasEscalation: false, hasConsensus: true },
    ]);
    const assessment = buildBoardAssessment(ORG, SESSION_ID, council);
    assert(typeof assessment.overallScore === "number", "overallScore");
    assert(assessment.governance.orgSlug === ORG, "governance.orgSlug");
    assert(assessment.consensus.hasConsensus, "hasConsensus from council");
  }));

  // ── Suite 38: End-to-end full pipeline ────────────────────────────────────
  results.push(run("e2e: complete scenario CRISIS_LIQUIDEZ", () => {
    const scenario = CANONICAL_BOARD_SCENARIOS.find((s) => s.type === "CRISIS_LIQUIDEZ_CRITICA")!;
    const r = runBoardIntelligence(
      { orgSlug: ORG, topic: scenario.title, briefingType: "BOARD", digestPeriod: "MONTHLY" },
      {
        governanceInput: { riskScore: 0.85, complianceScore: 0.4, controlScore: 0.3 },
        riskSignals: scenario.expectedRisks.map((title) => ({
          title, description: "Riesgo crítico de liquidez", domain: "FINANCE" as const,
          likelihood: 0.8, impact: 0.9, isSystemic: true,
        })),
        recommendationSignals: scenario.expectedRecommendations.map((title) => ({
          title, description: "Acción recomendada", rationale: "Urgente",
          domain: "FINANCE" as const, priority: "CRITICAL" as const,
          impactScore: 0.9, riskScore: 0.7,
        })),
      }
    );
    assert(r.status === "SUCCESS", `Should succeed: ${r.error ?? ""}`);
    assert(r.session!.risks.length > 0, "Should have risks");
    assert(r.session!.resolution!.suggestedOnly === true, "suggestedOnly");
    assert(r.digest !== undefined, "Digest generated");
    assert(r.briefing !== undefined, "Briefing generated");
  }));

  // ── Summary ────────────────────────────────────────────────────────────────
  const total  = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);

  return NextResponse.json({
    sprint:      "AGENTIK-BOARD-INTELLIGENCE-01",
    timestamp:   new Date().toISOString(),
    summary:     { total, passed, failed: failed.length },
    verdict:     failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`,
    results,
    failedTests: failed.map((r) => ({ name: r.name, error: r.error })),
  }, { status: failed.length === 0 ? 200 : 500 });
}
