// AGENTIK-BOARD-INTELLIGENCE-01 — Client-safe barrel
// NO server-only imports. Safe for use in client components.

// Types only
export type {
  BoardConfidence,
  BoardOutcome,
  BoardDomain,
  BoardPriorityLevel,
  BoardBriefingType,
  BoardDigestPeriod,
  GovernanceStatus,
  BoardFinding,
  BoardRisk,
  BoardOpportunity,
  BoardConcern,
  BoardPriority,
  BoardAlignment,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
  BoardDecisionCandidate,
  BoardRecommendation,
  BoardResolution,
  BoardNarrative,
  BoardDigest,
  BoardBriefing,
  BoardReport,
  BoardSession,
  BoardIntelligenceInput,
  BoardIntelligenceResult,
} from "./board-intelligence-types";

// Constants + utilities
export {
  BOARD_CONFIDENCES,
  BOARD_OUTCOMES,
  BOARD_DOMAINS,
  BOARD_PRIORITY_LEVELS,
  BOARD_PRIORITY_RANK,
  BOARD_BRIEFING_TYPES,
  BOARD_DIGEST_PERIODS,
  GOVERNANCE_STATUSES,
  boardConfidenceFromScore,
  boardOutcomeFromScore,
  governanceStatusFromScore,
  sortBoardRisksByComposite,
  sortBoardPrioritiesByScore,
  sortBoardOpportunitiesByCapture,
  sortBoardRecommendationsByPriority,
} from "./board-intelligence-types";

// Dashboard contract (client-safe)
export type {
  BoardSessionCard,
  BoardHealth,
  BoardIntelligenceDashboard,
} from "./board-intelligence-dashboard-contract";

export {
  buildBoardSessionCard,
  buildBoardIntelligenceDashboard,
  buildEmptyBoardIntelligenceDashboard,
} from "./board-intelligence-dashboard-contract";

// Canonical scenarios
export type { CanonicalBoardScenario } from "./board-intelligence-canonical";
export { CANONICAL_BOARD_SCENARIOS } from "./board-intelligence-canonical";
