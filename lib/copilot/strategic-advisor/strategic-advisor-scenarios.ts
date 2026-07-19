// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 36: Strategic Advisor Scenarios
// 12 canonical business scenarios, each producing a self-contained advisor output
// Pure domain logic — no server-only imports, no Prisma, no AI

import type {
  StrategicScenarioType, StrategicDomain, StrategicConcern, StrategicOpportunityAssessment,
  StrategicRecommendation, StrategicQuestion, StrategicFocusArea, StrategicAdvisorBriefing,
  StrategicAdvisorReport, StrategicAdvisorResult, StrategicDecisionContext,
} from "./strategic-advisor-types";
import {
  generateSaId, confidenceSaFromScore,
} from "./strategic-advisor-types";

// ── Scenario output type ───────────────────────────────────────────────────────

export interface ScenarioOutput {
  readonly type:     StrategicScenarioType;
  readonly orgSlug:  string;
  readonly report:   StrategicAdvisorReport;
  readonly briefing: StrategicAdvisorBriefing;
  readonly summary:  string;
}

export interface ScenarioSummary {
  readonly type:         StrategicScenarioType;
  readonly title:        string;
  readonly description:  string;
  readonly domain:       StrategicDomain;
  readonly advisorScore: number;
}

// ── Internal factory helpers ───────────────────────────────────────────────────

function _concern(orgSlug: string, title: string, description: string, domain: StrategicDomain, severity: StrategicConcern["severity"], isEmergent = false): StrategicConcern {
  return {
    id: generateSaId("c"), orgSlug, title, description, domain,
    severity, confidence: confidenceSaFromScore(0.75), confidenceScore: 0.75,
    isEmergent, isLatent: false, rationale: description, evidenceIds: [],
    relatedGoals: [], metadata: {}, detectedAt: new Date().toISOString(),
  };
}

function _opportunity(orgSlug: string, title: string, description: string, domain: StrategicDomain, captureScore: number): StrategicOpportunityAssessment {
  return {
    id: generateSaId("opp"), orgSlug, title, description, domain,
    magnitude: captureScore >= 0.75 ? "LARGE" : "MEDIUM",
    confidence: confidenceSaFromScore(captureScore),
    confidenceScore: captureScore, captureScore,
    timeHorizon: "SHORT_TERM", isIgnored: false,
    rationale: description, evidenceIds: [], metadata: {},
  };
}

function _recommendation(orgSlug: string, title: string, description: string, domain: StrategicDomain, priority: StrategicRecommendation["priority"]): StrategicRecommendation {
  return {
    id: generateSaId("r"), orgSlug, title, description, domain,
    rationale: description, priority,
    confidence: confidenceSaFromScore(0.7), confidenceScore: 0.7,
    expectedImpact: "Mitigation of critical risk exposure",
    associatedRisks: [], evidenceIds: [], playbookIds: [],
    suggestedOnly: true, metadata: {},
  };
}

function _question(orgSlug: string, question: string, domain: StrategicDomain, category: StrategicQuestion["category"]): StrategicQuestion {
  return {
    id: generateSaId("q"), orgSlug, question, domain, category,
    rationale: question, priority: "HIGH",
    confidence: "MEDIUM", evidenceIds: [], metadata: {},
  };
}

function _focusArea(orgSlug: string, rank: number, title: string, domain: StrategicDomain, urgencyScore: number): StrategicFocusArea {
  return {
    id: generateSaId("fa"), orgSlug, rank, title,
    rationale: `Focus area ${rank}: ${title}`, domain,
    urgencyScore, impactScore: urgencyScore,
    compositeScore: Math.round((urgencyScore * 0.6 + urgencyScore * 0.4) * 100) / 100,
    confidence: confidenceSaFromScore(urgencyScore),
    evidenceIds: [], metadata: {},
  };
}

function _decisionCtx(orgSlug: string, advisorScore: number): StrategicDecisionContext {
  return {
    orgSlug, activeGoalCount: 3, criticalRiskCount: 2,
    openConflictCount: 1, opportunityCount: 2,
    alignmentScore: Math.round(advisorScore * 0.85 * 100) / 100,
    maturityLevel: "DEVELOPING", hasLearningData: true,
    hasGraphData: false, hasSignalData: true, advisorScore,
  };
}

function _report(orgSlug: string, concerns: StrategicConcern[], opportunities: StrategicOpportunityAssessment[], recommendations: StrategicRecommendation[], questions: StrategicQuestion[], focusAreas: StrategicFocusArea[], advisorScore: number): StrategicAdvisorReport {
  return {
    id: generateSaId("report"), orgSlug, advisorScore,
    concerns, opportunities, risks: [], questions, recommendations, focusAreas,
    advice: [], decisionContext: _decisionCtx(orgSlug, advisorScore),
    alignmentScore: Math.round(advisorScore * 0.85 * 100) / 100,
    generatedAt: new Date().toISOString(),
  };
}

function _briefing(orgSlug: string, title: string, summary: string, concerns: StrategicConcern[], opportunities: StrategicOpportunityAssessment[], recommendations: StrategicRecommendation[], questions: StrategicQuestion[], advisorScore: number, domain: StrategicDomain): StrategicAdvisorBriefing {
  return {
    id: generateSaId("br"), orgSlug, type: "CEO", title, summary,
    headline: summary.split(".")[0] ?? summary,
    topConcerns: concerns.slice(0, 3),
    topOpportunities: opportunities.slice(0, 3),
    topRecommendations: recommendations.slice(0, 3),
    keyQuestions: questions.slice(0, 3),
    advisorScore, confidence: confidenceSaFromScore(advisorScore),
    domains: [domain], metadata: {}, generatedAt: new Date().toISOString(),
  };
}

// ── 12 Canonical Scenarios ─────────────────────────────────────────────────────

function _buildLiquidityCrisis(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Cash position below 30-day runway", "Operating cash reserves are insufficient to cover one month of expenses.", "FINANCE", "CRITICAL", true),
    _concern(orgSlug, "Receivables ageing beyond 90 days", "A growing backlog of accounts receivable is not converting to cash.", "FINANCE", "HIGH"),
    _concern(orgSlug, "Credit line approaching limit", "Available credit facility is nearly exhausted with no refinancing plan.", "FINANCE", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Early payment discounts to accelerate collection", "Offer 2% early payment discount to recover key receivables faster.", "FINANCE", 0.8),
    _opportunity(orgSlug, "Deferred non-critical capex", "Postpone discretionary investments to preserve operating cash.", "FINANCE", 0.85),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Initiate emergency cash recovery plan", "Activate collection calls on top 10 overdue accounts immediately.", "FINANCE", "CRITICAL"),
    _recommendation(orgSlug, "Freeze non-essential discretionary spend", "Suspend all spending above threshold not tied to revenue generation.", "FINANCE", "HIGH"),
    _recommendation(orgSlug, "Open refinancing negotiation with bank", "Schedule formal meeting with primary lender to discuss bridge financing.", "FINANCE", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "Which clients represent the top 80% of overdue receivables?", "FINANCE", "RISK"),
    _question(orgSlug, "What is the minimum cash position required to sustain core operations for 60 days?", "FINANCE", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Immediate cash recovery", "FINANCE", 0.95),
    _focusArea(orgSlug, 2, "Credit facility negotiation", "FINANCE", 0.85),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.35);
  const briefing = _briefing(orgSlug, "Liquidity Crisis Response Briefing", "The organization faces a critical liquidity constraint requiring immediate executive action. Cash runway is below 30 days and receivables are stalling.", concerns, opportunities, recommendations, questions, 0.35, "FINANCE");
  return { type: "LIQUIDITY_CRISIS", orgSlug, report, briefing, summary: "Critical liquidity crisis: cash below 30-day runway, receivables stalled." };
}

function _buildAcceleratedGrowth(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Operational capacity lag behind revenue growth", "Sales are outpacing the organization's ability to deliver.", "OPERATIONS", "HIGH", true),
    _concern(orgSlug, "Talent acquisition bottleneck", "Key roles cannot be filled fast enough to sustain growth trajectory.", "PEOPLE", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Scale high-margin product lines first", "Prioritize products with >40% margin to maximize growth return.", "COMMERCIAL", 0.85),
    _opportunity(orgSlug, "Partner-based delivery expansion", "Engage certified partners to expand delivery capacity without headcount.", "OPERATIONS", 0.78),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Establish growth governance council", "Create weekly cross-functional growth review with CEO, COO, and Sales.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Define sustainable growth ceiling", "Set quarterly headcount and capacity targets before accepting new revenue.", "OPERATIONS", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "At what revenue level does delivery quality begin to degrade?", "OPERATIONS", "RISK"),
    _question(orgSlug, "Which growth channels are generating the highest-margin customers?", "COMMERCIAL", "OPPORTUNITY"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Capacity scaling plan", "OPERATIONS", 0.88),
    _focusArea(orgSlug, 2, "High-margin channel prioritization", "COMMERCIAL", 0.82),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.78);
  const briefing = _briefing(orgSlug, "Accelerated Growth Strategy Briefing", "The organization is in a high-growth phase. The strategic priority is scaling delivery and operations without degrading quality or burning out teams.", concerns, opportunities, recommendations, questions, 0.78, "COMMERCIAL");
  return { type: "ACCELERATED_GROWTH", orgSlug, report, briefing, summary: "High-growth phase: capacity and talent are the binding constraints." };
}

function _buildGrowingReceivables(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Accounts receivable DSO exceeding 75 days", "Days Sales Outstanding is above safe threshold, creating cash flow stress.", "FINANCE", "HIGH"),
    _concern(orgSlug, "Concentration risk in top 3 clients", "Three clients represent over 60% of outstanding receivables.", "COMMERCIAL", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Implement factoring for key invoices", "Convert top receivables to immediate cash via factoring arrangement.", "FINANCE", 0.72),
    _opportunity(orgSlug, "Revise payment terms with new clients", "Shift new contracts to shorter net terms or milestone-based billing.", "COMMERCIAL", 0.80),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Activate receivables aging dashboard", "Monitor daily aging by client to catch 45-day cases before they hit 60+.", "FINANCE", "HIGH"),
    _recommendation(orgSlug, "Require executive escalation for overdue > 60 days", "Any receivable exceeding 60 days requires CEO-level collection outreach.", "FINANCE", "CRITICAL"),
  ];
  const questions = [
    _question(orgSlug, "What are the payment behavior patterns for the top 5 overdue clients?", "FINANCE", "RISK"),
    _question(orgSlug, "Are payment terms in current contracts aligned to cash flow needs?", "COMMERCIAL", "ALIGNMENT"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Receivables collection acceleration", "FINANCE", 0.87),
    _focusArea(orgSlug, 2, "Payment terms revision", "COMMERCIAL", 0.74),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.55);
  const briefing = _briefing(orgSlug, "Growing Receivables Risk Briefing", "Receivables aging is creating hidden cash flow risk. DSO is above safe levels and client concentration adds systemic exposure.", concerns, opportunities, recommendations, questions, 0.55, "FINANCE");
  return { type: "GROWING_RECEIVABLES", orgSlug, report, briefing, summary: "DSO above safe threshold; concentration risk from top 3 clients." };
}

function _buildSalesDecline(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Revenue below prior quarter by >15%", "Quarter-over-quarter decline signals a structural sales issue.", "COMMERCIAL", "CRITICAL", true),
    _concern(orgSlug, "Pipeline velocity declining", "Deals are stalling mid-funnel with longer conversion times.", "COMMERCIAL", "HIGH"),
    _concern(orgSlug, "Churn increasing in mid-tier accounts", "Mid-tier clients are not renewing, suggesting product-market fit erosion.", "COMMERCIAL", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Reactivate dormant accounts", "20% of lapsed clients from the past 12 months could be re-engaged.", "COMMERCIAL", 0.70),
    _opportunity(orgSlug, "Win-loss analysis on recent lost deals", "Understanding why deals were lost reveals correctable patterns.", "COMMERCIAL", 0.85),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Conduct emergency pipeline review", "Weekly deal-by-deal pipeline review with Sales leadership.", "COMMERCIAL", "CRITICAL"),
    _recommendation(orgSlug, "Identify root cause of churn spike", "Survey churned clients within 30 days to identify systemic issues.", "COMMERCIAL", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "Is the decline concentrated in specific segments, geographies, or products?", "COMMERCIAL", "RISK"),
    _question(orgSlug, "What changed in the past 90 days that could explain declining pipeline velocity?", "COMMERCIAL", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Root cause identification", "COMMERCIAL", 0.92),
    _focusArea(orgSlug, 2, "Dormant account reactivation", "COMMERCIAL", 0.75),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.30);
  const briefing = _briefing(orgSlug, "Sales Decline Recovery Briefing", "Revenue has declined more than 15% versus the prior quarter. Churn is rising and pipeline velocity is deteriorating. Immediate root cause analysis is required.", concerns, opportunities, recommendations, questions, 0.30, "COMMERCIAL");
  return { type: "SALES_DECLINE", orgSlug, report, briefing, summary: "Revenue -15% QoQ; pipeline stalling and churn accelerating." };
}

function _buildClientConcentration(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Single client represents over 40% of revenue", "Revenue concentration creates existential dependency risk.", "COMMERCIAL", "CRITICAL"),
    _concern(orgSlug, "Top 3 clients represent over 70% of revenue", "Loss of any one client would destabilize the organization's finances.", "COMMERCIAL", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "New client acquisition campaign for mid-market", "Redirect 20% of sales effort to diversify into new mid-market accounts.", "COMMERCIAL", 0.75),
    _opportunity(orgSlug, "Expand wallet share in secondary accounts", "Deepen existing relationships outside the top tier to grow non-concentrated revenue.", "COMMERCIAL", 0.72),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Define maximum revenue concentration policy", "Set a formal policy: no single client should exceed 25% of revenue.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Build a concentration risk dashboard", "Track weekly evolution of revenue share per client.", "FINANCE", "MEDIUM"),
  ];
  const questions = [
    _question(orgSlug, "What is the contractual risk if the top client does not renew?", "COMMERCIAL", "RISK"),
    _question(orgSlug, "Is there an active diversification target in the commercial strategy?", "COMMERCIAL", "ALIGNMENT"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Client diversification strategy", "COMMERCIAL", 0.88),
    _focusArea(orgSlug, 2, "Concentration risk monitoring", "FINANCE", 0.78),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.45);
  const briefing = _briefing(orgSlug, "Client Concentration Risk Briefing", "Revenue is dangerously concentrated in a small number of clients. A formal diversification strategy is required to reduce systemic exposure.", concerns, opportunities, recommendations, questions, 0.45, "COMMERCIAL");
  return { type: "CLIENT_CONCENTRATION", orgSlug, report, briefing, summary: "Single client >40% of revenue; systemic concentration risk." };
}

function _buildIgnoredOpportunity(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "High-capture opportunities with no active goal alignment", "Identified opportunities have no corresponding strategic goal or initiative.", "EXECUTIVE", "HIGH"),
    _concern(orgSlug, "Decision paralysis on proven patterns", "Patterns confirmed by learning framework are not being acted upon.", "EXECUTIVE", "MEDIUM"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Activate top confirmed playbook immediately", "A confirmed pattern has >3 successful instances and is not being leveraged.", "COMMERCIAL", 0.88),
    _opportunity(orgSlug, "Convert top ignored opportunity into a sprint goal", "Assign ownership and 30-day action plan to the highest capture-score opportunity.", "EXECUTIVE", 0.82),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Create goal for each opportunity exceeding capture score 0.7", "Any opportunity with captureScore ≥ 0.70 must have a named owner and target date.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Review ignored opportunity list in next board session", "Present top 5 ignored opportunities to leadership with conversion rationale.", "EXECUTIVE", "MEDIUM"),
  ];
  const questions = [
    _question(orgSlug, "Why are confirmed high-value patterns not being acted upon?", "EXECUTIVE", "DECISION"),
    _question(orgSlug, "Which opportunity has the highest capture score and no active owner?", "EXECUTIVE", "OPPORTUNITY"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Opportunity-to-goal conversion", "EXECUTIVE", 0.85),
    _focusArea(orgSlug, 2, "Playbook activation", "COMMERCIAL", 0.80),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.60);
  const briefing = _briefing(orgSlug, "Ignored Opportunity Recovery Briefing", "Multiple high-capture opportunities have been identified but are not connected to any active strategic goal. Value is being left on the table.", concerns, opportunities, recommendations, questions, 0.60, "EXECUTIVE");
  return { type: "IGNORED_OPPORTUNITY", orgSlug, report, briefing, summary: "Confirmed opportunities unactioned; pattern-value not being captured." };
}

function _buildMisalignedObjectives(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Department goals contradict executive priorities", "Cross-functional initiatives are pulling in opposite directions.", "EXECUTIVE", "HIGH"),
    _concern(orgSlug, "Budget allocation does not match stated strategic priorities", "Spending patterns contradict declared strategic goals.", "FINANCE", "HIGH"),
    _concern(orgSlug, "OKR targets not cascaded from executive strategy", "Team-level objectives were set without reference to the executive plan.", "EXECUTIVE", "MEDIUM"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Strategic alignment workshop to reset priorities", "A structured cross-functional session can surface and resolve conflicts.", "EXECUTIVE", 0.78),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Conduct formal strategic alignment audit", "Map each department goal against the executive strategy. Identify conflicts and gaps.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Require quarterly goal-to-strategy linkage review", "Every 90 days, validate that active goals still map to the current strategy.", "EXECUTIVE", "MEDIUM"),
  ];
  const questions = [
    _question(orgSlug, "Which department goals actively conflict with the declared executive priorities?", "EXECUTIVE", "ALIGNMENT"),
    _question(orgSlug, "Is there a documented strategy that all teams are aligned to?", "EXECUTIVE", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Cross-functional alignment reset", "EXECUTIVE", 0.85),
    _focusArea(orgSlug, 2, "Budget-to-strategy reconciliation", "FINANCE", 0.78),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.42);
  const briefing = _briefing(orgSlug, "Strategic Misalignment Briefing", "Department-level objectives and spending patterns are not aligned with the executive strategy. Without correction, execution will fragment and value will be destroyed.", concerns, opportunities, recommendations, questions, 0.42, "EXECUTIVE");
  return { type: "MISALIGNED_OBJECTIVES", orgSlug, report, briefing, summary: "Department goals and budgets misaligned with executive strategy." };
}

function _buildSuccessfulPlaybook(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Successful patterns not formalized as scalable playbooks", "Proven approaches exist in individual knowledge but not in institutional process.", "OPERATIONS", "MEDIUM"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Replicate top playbook across new client segments", "The confirmed playbook can be systematically applied to additional segments.", "COMMERCIAL", 0.88),
    _opportunity(orgSlug, "Train entire sales team on confirmed pattern", "Democratize the pattern to multiply its impact across the team.", "PEOPLE", 0.82),
    _opportunity(orgSlug, "Publish playbook as a competitive differentiator", "Formalize and promote the process as a value-add to clients.", "MARKETING", 0.70),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Document and version the successful playbook", "Formalize the steps, conditions, and expected outcomes in a shareable format.", "OPERATIONS", "HIGH"),
    _recommendation(orgSlug, "Scale the playbook to 3 new accounts in next 60 days", "Assign ownership and success metrics for each new replication.", "COMMERCIAL", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "What are the exact conditions that made this playbook succeed?", "OPERATIONS", "OPPORTUNITY"),
    _question(orgSlug, "Which other accounts have similar profiles that could benefit from this playbook?", "COMMERCIAL", "OPPORTUNITY"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Playbook formalization and replication", "OPERATIONS", 0.90),
    _focusArea(orgSlug, 2, "Segment expansion", "COMMERCIAL", 0.82),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.82);
  const briefing = _briefing(orgSlug, "Successful Playbook Scale Briefing", "A confirmed high-success playbook is an organizational asset not yet fully leveraged. Systematic replication represents high-capture opportunity.", concerns, opportunities, recommendations, questions, 0.82, "COMMERCIAL");
  return { type: "SUCCESSFUL_PLAYBOOK", orgSlug, report, briefing, summary: "Confirmed playbook ready for systematic scale across new segments." };
}

function _buildObsoletePlaybook(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Playbook applied despite declining success rate", "A previously successful pattern is failing in current conditions but still being used.", "OPERATIONS", "HIGH"),
    _concern(orgSlug, "No mechanism to retire or revise failing playbooks", "There is no formal process to flag and update obsolete patterns.", "EXECUTIVE", "MEDIUM"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Diagnose root cause of playbook failure", "Understanding why the playbook stopped working provides correctable insight.", "OPERATIONS", 0.80),
    _opportunity(orgSlug, "Develop next-generation playbook variant", "Adapt the core logic to new market conditions.", "COMMERCIAL", 0.72),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Suspend use of the declining playbook immediately", "Until root cause is understood, stop replicating a failing pattern.", "OPERATIONS", "HIGH"),
    _recommendation(orgSlug, "Initiate a 30-day playbook autopsy", "Analyze the 5 most recent failures to identify the point of breakdown.", "OPERATIONS", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "At what point did the playbook's success rate begin declining?", "OPERATIONS", "RISK"),
    _question(orgSlug, "What market or context change may have invalidated this pattern?", "COMMERCIAL", "RISK"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Playbook retirement and replacement", "OPERATIONS", 0.86),
    _focusArea(orgSlug, 2, "Pattern failure root cause analysis", "COMMERCIAL", 0.80),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.40);
  const briefing = _briefing(orgSlug, "Obsolete Playbook Risk Briefing", "A previously reliable playbook is now failing. Continued use without adaptation is accelerating losses. An immediate pause and diagnosis is recommended.", concerns, opportunities, recommendations, questions, 0.40, "OPERATIONS");
  return { type: "OBSOLETE_PLAYBOOK", orgSlug, report, briefing, summary: "Playbook success rate declining; continued use without revision creates risk." };
}

function _buildRegulatoryRisk(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Regulatory compliance gap detected in core process", "A key business process does not meet current regulatory requirements.", "COMPLIANCE", "CRITICAL", true),
    _concern(orgSlug, "No formal compliance monitoring cadence", "There is no systematic process for tracking regulatory changes.", "COMPLIANCE", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Proactive remediation before regulatory audit", "Addressing gaps now is less costly than remediation after an audit finding.", "COMPLIANCE", 0.88),
    _opportunity(orgSlug, "Build compliance as a competitive moat", "Being certifiably compliant opens enterprise client segments.", "COMMERCIAL", 0.65),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Commission immediate compliance gap assessment", "Engage qualified counsel to document all current gaps and remediation paths.", "COMPLIANCE", "CRITICAL"),
    _recommendation(orgSlug, "Establish compliance monitoring calendar", "Assign an owner to track all applicable regulatory updates quarterly.", "COMPLIANCE", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "Which specific regulatory requirements are currently unmet?", "COMPLIANCE", "RISK"),
    _question(orgSlug, "What is the estimated cost of non-compliance if an audit occurs?", "COMPLIANCE", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Regulatory gap remediation", "COMPLIANCE", 0.93),
    _focusArea(orgSlug, 2, "Compliance monitoring system", "COMPLIANCE", 0.82),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.32);
  const briefing = _briefing(orgSlug, "Regulatory Risk Response Briefing", "A critical compliance gap has been identified. Proactive remediation is strongly recommended before any regulatory exposure materializes.", concerns, opportunities, recommendations, questions, 0.32, "COMPLIANCE");
  return { type: "REGULATORY_RISK", orgSlug, report, briefing, summary: "Compliance gap detected; proactive remediation required before audit exposure." };
}

function _buildBusinessExpansion(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Expansion risk: new market with insufficient local knowledge", "Entering new geography or segment without validated assumptions.", "COMMERCIAL", "HIGH"),
    _concern(orgSlug, "Expansion speed outpacing capital readiness", "The investment required for expansion exceeds current liquidity comfort zone.", "FINANCE", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Adjacent market with proven product-market fit signals", "Learning patterns confirm demand in adjacent segment.", "COMMERCIAL", 0.82),
    _opportunity(orgSlug, "Partnership-based market entry reduces capital requirement", "Partner with established local player to minimize upfront investment.", "COMMERCIAL", 0.78),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Define expansion readiness criteria before committing", "Document the financial, operational, and knowledge thresholds for expansion go/no-go.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Run a 90-day validation pilot before full entry", "Test the market with a limited scope before full resource commitment.", "COMMERCIAL", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "What evidence validates demand in the target expansion market?", "COMMERCIAL", "OPPORTUNITY"),
    _question(orgSlug, "What is the break-even timeline for the expansion investment?", "FINANCE", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Expansion readiness assessment", "EXECUTIVE", 0.85),
    _focusArea(orgSlug, 2, "Pilot market design", "COMMERCIAL", 0.80),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.65);
  const briefing = _briefing(orgSlug, "Business Expansion Strategy Briefing", "A market expansion opportunity has been identified with positive signals. Capital readiness and local knowledge gaps must be addressed before commitment.", concerns, opportunities, recommendations, questions, 0.65, "COMMERCIAL");
  return { type: "BUSINESS_EXPANSION", orgSlug, report, briefing, summary: "Expansion opportunity identified; capital readiness and local knowledge are key constraints." };
}

function _buildStrategicConflict(orgSlug: string): ScenarioOutput {
  const concerns = [
    _concern(orgSlug, "Two high-priority strategic goals are mutually exclusive", "Pursuing both simultaneously will drain resources and deliver neither.", "EXECUTIVE", "CRITICAL"),
    _concern(orgSlug, "Leadership team lacks consensus on priority sequencing", "Without explicit priority resolution, execution will be fragmented.", "EXECUTIVE", "HIGH"),
  ];
  const opportunities = [
    _opportunity(orgSlug, "Structured conflict resolution will clarify priorities", "A facilitated priority session can align leadership and unlock execution.", "EXECUTIVE", 0.85),
  ];
  const recommendations = [
    _recommendation(orgSlug, "Facilitate a strategic priority resolution session", "Bring leadership together within 2 weeks to resolve the conflict with clear criteria.", "EXECUTIVE", "CRITICAL"),
    _recommendation(orgSlug, "Document the decision rationale and trade-offs", "Record what was decided, why, and what was deprioritized for future reference.", "EXECUTIVE", "HIGH"),
    _recommendation(orgSlug, "Communicate the resolution to all affected teams", "Once resolved, ensure all teams understand the new priority order.", "EXECUTIVE", "HIGH"),
  ];
  const questions = [
    _question(orgSlug, "Which strategic goal has higher long-term value if only one can be pursued?", "EXECUTIVE", "DECISION"),
    _question(orgSlug, "Can either goal be sequenced rather than pursued simultaneously?", "EXECUTIVE", "DECISION"),
  ];
  const focusAreas = [
    _focusArea(orgSlug, 1, "Priority conflict resolution", "EXECUTIVE", 0.95),
    _focusArea(orgSlug, 2, "Strategic decision documentation", "EXECUTIVE", 0.80),
  ];
  const report = _report(orgSlug, concerns, opportunities, recommendations, questions, focusAreas, 0.38);
  const briefing = _briefing(orgSlug, "Strategic Conflict Resolution Briefing", "Two high-priority strategic goals are creating resource conflict. Without explicit resolution, execution will stall and both goals will be under-delivered.", concerns, opportunities, recommendations, questions, 0.38, "EXECUTIVE");
  return { type: "STRATEGIC_CONFLICT", orgSlug, report, briefing, summary: "Two high-priority goals are mutually exclusive; leadership alignment required." };
}

// ── Public API ────────────────────────────────────────────────────────────────

const SCENARIO_BUILDERS: Record<StrategicScenarioType, (orgSlug: string) => ScenarioOutput> = {
  LIQUIDITY_CRISIS:      _buildLiquidityCrisis,
  ACCELERATED_GROWTH:    _buildAcceleratedGrowth,
  GROWING_RECEIVABLES:   _buildGrowingReceivables,
  SALES_DECLINE:         _buildSalesDecline,
  CLIENT_CONCENTRATION:  _buildClientConcentration,
  IGNORED_OPPORTUNITY:   _buildIgnoredOpportunity,
  MISALIGNED_OBJECTIVES: _buildMisalignedObjectives,
  SUCCESSFUL_PLAYBOOK:   _buildSuccessfulPlaybook,
  OBSOLETE_PLAYBOOK:     _buildObsoletePlaybook,
  REGULATORY_RISK:       _buildRegulatoryRisk,
  BUSINESS_EXPANSION:    _buildBusinessExpansion,
  STRATEGIC_CONFLICT:    _buildStrategicConflict,
};

export function buildAllStrategicScenarios(orgSlug: string): ScenarioOutput[] {
  return Object.values(SCENARIO_BUILDERS).map((fn) => fn(orgSlug));
}

export function getScenarioByType(orgSlug: string, type: StrategicScenarioType): ScenarioOutput {
  const fn = SCENARIO_BUILDERS[type];
  return fn(orgSlug);
}

export function buildScenarioSummary(output: ScenarioOutput): ScenarioSummary {
  const topConcern = output.report.concerns[0];
  return {
    type:         output.type,
    title:        output.briefing.title,
    description:  output.summary,
    domain:       topConcern?.domain ?? "CROSS_DOMAIN",
    advisorScore: output.report.advisorScore,
  };
}
