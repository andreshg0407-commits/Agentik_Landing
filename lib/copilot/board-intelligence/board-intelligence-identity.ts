// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 2: Identity
// Deterministic, collision-resistant ID generation for all board intelligence entities.

let _counter = 0;
function next(): string {
  return (++_counter).toString(36).padStart(4, "0");
}

// ── Session / Report ────────────────────────────────────────────────────────

export function generateBoardSessionId(): string {
  return `board_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardReportId(): string {
  return `board_report_${Date.now().toString(36)}_${next()}`;
}

// ── Findings / Risks / Opportunities / Concerns / Priorities ────────────────

export function generateBoardFindingId(): string {
  return `board_finding_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardRiskId(): string {
  return `board_risk_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardOpportunityId(): string {
  return `board_opp_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardConcernId(): string {
  return `board_concern_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardPriorityId(): string {
  return `board_priority_${Date.now().toString(36)}_${next()}`;
}

// ── Decision / Resolution / Recommendation ──────────────────────────────────

export function generateBoardDecisionCandidateId(): string {
  return `board_decision_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardResolutionId(): string {
  return `board_resolution_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardRecommendationId(): string {
  return `board_recommendation_${Date.now().toString(36)}_${next()}`;
}

// ── Digest / Briefing / Narrative ───────────────────────────────────────────

export function generateBoardDigestId(): string {
  return `board_digest_${Date.now().toString(36)}_${next()}`;
}

export function generateBoardBriefingId(): string {
  return `board_briefing_${Date.now().toString(36)}_${next()}`;
}

// ── Audit ───────────────────────────────────────────────────────────────────

export function generateBoardAuditEventId(): string {
  return `baud_${Date.now().toString(36)}_${next()}`;
}

// ── Validation ──────────────────────────────────────────────────────────────

const BOARD_ID_PREFIXES = [
  "board_",
  "board_report_",
  "board_finding_",
  "board_risk_",
  "board_opp_",
  "board_concern_",
  "board_priority_",
  "board_decision_",
  "board_resolution_",
  "board_recommendation_",
  "board_digest_",
  "board_briefing_",
  "baud_",
] as const;

export function validateBoardId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return BOARD_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function isBoardSessionId(id: string): boolean {
  return typeof id === "string" && id.startsWith("board_") && !id.startsWith("board_report_") &&
    !id.startsWith("board_finding_") && !id.startsWith("board_risk_") &&
    !id.startsWith("board_opp_") && !id.startsWith("board_concern_") &&
    !id.startsWith("board_priority_") && !id.startsWith("board_decision_") &&
    !id.startsWith("board_resolution_") && !id.startsWith("board_recommendation_") &&
    !id.startsWith("board_digest_") && !id.startsWith("board_briefing_");
}

export function isBoardReportId(id: string): boolean {
  return typeof id === "string" && id.startsWith("board_report_");
}

export function isBoardRecommendationId(id: string): boolean {
  return typeof id === "string" && id.startsWith("board_recommendation_");
}

export function isBoardResolutionId(id: string): boolean {
  return typeof id === "string" && id.startsWith("board_resolution_");
}
