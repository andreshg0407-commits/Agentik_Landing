// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 1: Domain Types
// Serializable, tenant-scoped, fail-closed. No Prisma. No server-only. No React.
// Board Intelligence: highest-level strategic and governance analysis layer.

// ── Confidence ────────────────────────────────────────────────────────────────

export type BoardConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const BOARD_CONFIDENCES: BoardConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];

export const BOARD_CONFIDENCE_SCORE: Record<BoardConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 0.95,
};

// ── Outcome ────────────────────────────────────────────────────────────────────

export type BoardOutcome =
  | "APPROVE"
  | "APPROVE_WITH_CONDITIONS"
  | "REVIEW_REQUIRED"
  | "ESCALATE"
  | "REJECT";

export const BOARD_OUTCOMES: BoardOutcome[] = [
  "APPROVE", "APPROVE_WITH_CONDITIONS", "REVIEW_REQUIRED", "ESCALATE", "REJECT",
];

// ── Priority ───────────────────────────────────────────────────────────────────

export type BoardPriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const BOARD_PRIORITY_LEVELS: BoardPriorityLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const BOARD_PRIORITY_RANK: Record<BoardPriorityLevel, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

// ── Domain ─────────────────────────────────────────────────────────────────────

export type BoardDomain =
  | "FINANCE"
  | "COMMERCIAL"
  | "OPERATIONS"
  | "MARKETING"
  | "COMPLIANCE"
  | "GOVERNANCE"
  | "STRATEGY"
  | "RISK"
  | "TECHNOLOGY"
  | "PEOPLE"
  | "CROSS_DOMAIN";

export const BOARD_DOMAINS: BoardDomain[] = [
  "FINANCE", "COMMERCIAL", "OPERATIONS", "MARKETING", "COMPLIANCE",
  "GOVERNANCE", "STRATEGY", "RISK", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN",
];

// ── Briefing type ──────────────────────────────────────────────────────────────

export type BoardBriefingType =
  | "BOARD"
  | "CEO"
  | "EXECUTIVE"
  | "INVESTOR"
  | "GOVERNANCE"
  | "RISK";

export const BOARD_BRIEFING_TYPES: BoardBriefingType[] = [
  "BOARD", "CEO", "EXECUTIVE", "INVESTOR", "GOVERNANCE", "RISK",
];

// ── Digest period ──────────────────────────────────────────────────────────────

export type BoardDigestPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export const BOARD_DIGEST_PERIODS: BoardDigestPeriod[] = [
  "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL",
];

// ── Governance status ──────────────────────────────────────────────────────────

export type GovernanceStatus = "STRONG" | "ADEQUATE" | "WEAK" | "CRITICAL";

export const GOVERNANCE_STATUSES: GovernanceStatus[] = [
  "STRONG", "ADEQUATE", "WEAK", "CRITICAL",
];

// ── Core entities ──────────────────────────────────────────────────────────────

export interface BoardFinding {
  readonly id:              string;           // board_finding_…
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly priority:        BoardPriorityLevel;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;           // 0–1
  readonly isBlocker:       boolean;
  readonly evidenceIds:     string[];
  readonly sourceModule:    string;           // which intelligence module surfaced this
  readonly metadata:        Record<string, unknown>;
}

export interface BoardRisk {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly severity:        BoardPriorityLevel;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly likelihood:      number;           // 0–1
  readonly impact:          number;           // 0–1
  readonly compositeRisk:   number;           // 0–1
  readonly mitigations:     string[];
  readonly evidenceIds:     string[];
  readonly isSystemic:      boolean;          // cross-domain systemic risk
  readonly metadata:        Record<string, unknown>;
}

export interface BoardOpportunity {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly magnitude:       "SMALL" | "MEDIUM" | "LARGE" | "TRANSFORMATIONAL";
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly captureScore:    number;           // 0–1
  readonly timeHorizon:     "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";
  readonly rationale:       string;
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
}

export interface BoardConcern {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly severity:        BoardPriorityLevel;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly isEmergent:      boolean;
  readonly isSystemic:      boolean;
  readonly rationale:       string;
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
}

export interface BoardPriority {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly rank:            number;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly level:           BoardPriorityLevel;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly urgencyScore:    number;
  readonly priorityScore:   number;
  readonly rationale:       string;
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
}

export interface BoardAlignment {
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly alignmentScore:    number;         // 0–1
  readonly misalignedAreas:   string[];
  readonly alignedAreas:      string[];
  readonly alignmentSummary:  string;
  readonly recommendations:   string[];
  readonly confidence:        BoardConfidence;
}

export interface BoardGovernanceAssessment {
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly status:           GovernanceStatus;
  readonly governanceScore:  number;          // 0–1
  readonly riskScore:        number;
  readonly controlScore:     number;
  readonly alignmentScore:   number;
  readonly complianceScore:  number;
  readonly concerns:         string[];
  readonly strengths:        string[];
  readonly limitations:      string[];
  readonly confidence:       BoardConfidence;
  readonly assessedAt:       string;
}

export interface BoardStrategicAssessment {
  readonly orgSlug:              string;
  readonly sessionId:            string;
  readonly alignmentScore:       number;
  readonly executionReadiness:   number;
  readonly strategicScore:       number;
  readonly horizonCoverage:      "SHORT" | "MEDIUM" | "LONG" | "MULTI_HORIZON";
  readonly gaps:                 string[];
  readonly strengths:            string[];
  readonly limitations:          string[];
  readonly confidence:           BoardConfidence;
  readonly assessedAt:           string;
}

export interface BoardDecisionCandidate {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly domain:          BoardDomain;
  readonly outcome:         BoardOutcome;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly riskScore:       number;
  readonly rationale:       string;
  readonly conditions:      string[];         // conditions for APPROVE_WITH_CONDITIONS
  readonly risks:           string[];
  readonly evidenceIds:     string[];
  readonly suggestedOnly:   true;
  readonly metadata:        Record<string, unknown>;
}

export interface BoardRecommendation {
  readonly id:              string;           // board_recommendation_…
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly rationale:       string;
  readonly domain:          BoardDomain;
  readonly priority:        BoardPriorityLevel;
  readonly confidence:      BoardConfidence;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly riskScore:       number;
  readonly evidenceIds:     string[];
  readonly suggestedOnly:   true;
  readonly associatedRisks: string[];
  readonly metadata:        Record<string, unknown>;
}

export interface BoardResolution {
  readonly id:               string;          // board_resolution_…
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly title:            string;
  readonly summary:          string;
  readonly outcome:          BoardOutcome;
  readonly conditions:       string[];        // for APPROVE_WITH_CONDITIONS
  readonly recommendations:  BoardRecommendation[];
  readonly decisionCandidates: BoardDecisionCandidate[];
  readonly confidenceScore:  number;
  readonly confidence:       BoardConfidence;
  readonly suggestedOnly:    true;
  readonly limitations:      string[];
  readonly evidenceIds:      string[];
  readonly metadata:         Record<string, unknown>;
  readonly resolvedAt:       string;
}

export interface BoardNarrative {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly executive:  string;               // executive summary (board language)
  readonly governance: string;               // governance narrative
  readonly strategic:  string;               // strategic direction narrative
  readonly risk:       string;               // risk narrative
  readonly opportunity: string;              // opportunity narrative
  readonly resolution: string;               // resolution narrative
  readonly limitations: string[];
  readonly generatedAt: string;
}

export interface BoardDigest {
  readonly id:                  string;
  readonly orgSlug:             string;
  readonly period:              BoardDigestPeriod;
  readonly title:               string;
  readonly headline:            string;
  readonly topPriorities:       BoardPriority[];
  readonly topRisks:            BoardRisk[];
  readonly topOpportunities:    BoardOpportunity[];
  readonly topRecommendations:  BoardRecommendation[];
  readonly governanceScore:     number;
  readonly strategicScore:      number;
  readonly boardScore:          number;
  readonly confidence:          BoardConfidence;
  readonly metadata:            Record<string, unknown>;
  readonly generatedAt:         string;
}

export interface BoardBriefing {
  readonly id:                  string;
  readonly orgSlug:             string;
  readonly type:                BoardBriefingType;
  readonly title:               string;
  readonly headline:            string;
  readonly summary:             string;
  readonly topPriorities:       BoardPriority[];
  readonly topRisks:            BoardRisk[];
  readonly topOpportunities:    BoardOpportunity[];
  readonly topRecommendations:  BoardRecommendation[];
  readonly topFindings:         BoardFinding[];
  readonly governance:          BoardGovernanceAssessment;
  readonly strategic:           BoardStrategicAssessment;
  readonly boardScore:          number;
  readonly confidence:          BoardConfidence;
  readonly metadata:            Record<string, unknown>;
  readonly generatedAt:         string;
}

export interface BoardReport {
  readonly id:                      string;   // board_report_…
  readonly orgSlug:                 string;
  readonly sessionId:               string;
  readonly title:                   string;
  readonly executiveSummary:        string;
  readonly governance:              BoardGovernanceAssessment;
  readonly strategic:               BoardStrategicAssessment;
  readonly topFindings:             BoardFinding[];
  readonly topRisks:                BoardRisk[];
  readonly topOpportunities:        BoardOpportunity[];
  readonly topConcerns:             BoardConcern[];
  readonly topPriorities:           BoardPriority[];
  readonly topRecommendations:      BoardRecommendation[];
  readonly resolution:              BoardResolution | null;
  readonly alignment:               BoardAlignment;
  readonly boardScore:              number;
  readonly confidence:              BoardConfidence;
  readonly limitations:             string[];
  readonly generatedAt:             string;
}

export interface BoardSession {
  readonly id:                   string;      // board_…
  readonly orgSlug:              string;
  readonly title:                string;
  readonly topic:                string;
  readonly governance:           BoardGovernanceAssessment;
  readonly strategic:            BoardStrategicAssessment;
  readonly findings:             BoardFinding[];
  readonly risks:                BoardRisk[];
  readonly opportunities:        BoardOpportunity[];
  readonly concerns:             BoardConcern[];
  readonly priorities:           BoardPriority[];
  readonly alignment:            BoardAlignment;
  readonly decisionCandidates:   BoardDecisionCandidate[];
  readonly resolution:           BoardResolution | null;
  readonly recommendations:      BoardRecommendation[];
  readonly narrative:            BoardNarrative | null;
  readonly digest:               BoardDigest | null;
  readonly briefing:             BoardBriefing | null;
  readonly report:               BoardReport | null;
  readonly sessionScore:         number;
  readonly boardScore:           number;
  readonly confidence:           BoardConfidence;
  readonly limitations:          string[];
  readonly metadata:             Record<string, unknown>;
  readonly conductedAt:          string;
}

// ── Input / Result ─────────────────────────────────────────────────────────────

export interface BoardIntelligenceInput {
  readonly orgSlug:       string;
  readonly topic:         string;
  readonly briefingType?: BoardBriefingType;
  readonly digestPeriod?: BoardDigestPeriod;
  readonly metadata?:     Record<string, unknown>;
}

export interface BoardIntelligenceResult {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly status:      "SUCCESS" | "PARTIAL" | "FAILED";
  readonly session?:    BoardSession;
  readonly report?:     BoardReport;
  readonly briefing?:   BoardBriefing;
  readonly digest?:     BoardDigest;
  readonly durationMs:  number;
  readonly completedAt: string;
  readonly error?:      string;
}

// ── Utility helpers ────────────────────────────────────────────────────────────

export function boardConfidenceFromScore(score: number): BoardConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function boardOutcomeFromScore(governanceScore: number, riskScore: number): BoardOutcome {
  if (governanceScore >= 0.75 && riskScore <= 0.35) return "APPROVE";
  if (governanceScore >= 0.55 && riskScore <= 0.55) return "APPROVE_WITH_CONDITIONS";
  if (governanceScore >= 0.35 || riskScore <= 0.70) return "REVIEW_REQUIRED";
  if (riskScore > 0.70) return "ESCALATE";
  return "REJECT";
}

export function governanceStatusFromScore(score: number): GovernanceStatus {
  if (score >= 0.75) return "STRONG";
  if (score >= 0.50) return "ADEQUATE";
  if (score >= 0.30) return "WEAK";
  return "CRITICAL";
}

export function sortBoardRisksByComposite(risks: BoardRisk[]): BoardRisk[] {
  return [...risks].sort((a, b) => b.compositeRisk - a.compositeRisk);
}

export function sortBoardPrioritiesByScore(priorities: BoardPriority[]): BoardPriority[] {
  return [...priorities].sort((a, b) => b.priorityScore - a.priorityScore);
}

export function sortBoardOpportunitiesByCapture(opps: BoardOpportunity[]): BoardOpportunity[] {
  return [...opps].sort((a, b) => b.captureScore - a.captureScore);
}

export function sortBoardRecommendationsByPriority(recs: BoardRecommendation[]): BoardRecommendation[] {
  return [...recs].sort(
    (a, b) => BOARD_PRIORITY_RANK[b.priority] - BOARD_PRIORITY_RANK[a.priority] || b.impactScore - a.impactScore
  );
}
