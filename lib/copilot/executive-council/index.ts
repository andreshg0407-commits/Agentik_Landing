// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 40: Client-Safe Barrel
// NO server-only imports. Safe for client components.

// Types only
export type {
  CouncilConfidence,
  CouncilOutcome,
  CouncilPerspective,
  CouncilPriority,
  CouncilVotePosition,
  CouncilArgumentType,
  CouncilArgumentStrength,
  CouncilFindingSeverity,
  ExecutiveArgument,
  ExecutiveFinding,
  ExecutiveOpinion,
  ExecutiveVote,
  ExecutiveConsensus,
  ExecutiveDisagreement,
  ExecutiveCouncilRecommendation,
  ExecutiveResolution,
  ExecutiveCouncilSession,
  ExecutiveCouncilReport,
  ExecutiveCouncilBriefing,
  ExecutiveCouncilDigest,
  ExecutiveCouncilInput,
  ExecutiveCouncilResult,
  ExecutiveCouncilSnapshot,
} from "./executive-council-types";

export {
  COUNCIL_CONFIDENCES,
  COUNCIL_CONFIDENCE_SCORE,
  COUNCIL_OUTCOMES,
  COUNCIL_PERSPECTIVES,
  COUNCIL_PRIORITIES,
  COUNCIL_PRIORITY_RANK,
  COUNCIL_VOTE_POSITIONS,
  COUNCIL_ARGUMENT_TYPES,
  COUNCIL_ARGUMENT_STRENGTHS,
  councilConfidenceFromScore,
  councilOutcomeFromAgreement,
  sortOpinionsByConfidence,
  sortRecommendationsByPriority,
  sortFindingsBySeverity,
} from "./executive-council-types";

// Client-safe dashboard contract
export {
  buildCouncilSessionCard,
  buildExecutiveCouncilDashboard,
  buildEmptyExecutiveCouncilDashboard,
} from "./executive-council-dashboard-contract";

export type {
  CouncilSessionCard,
  ExecutiveCouncilDashboard,
} from "./executive-council-dashboard-contract";

// Client-safe health types
export type {
  CouncilHealthStatus,
  CouncilHealthReport,
} from "./executive-council-health";

// Client-safe readiness types
export type {
  CouncilReadinessFlags,
  CouncilReadinessReport,
  CouncilReadinessRequirement,
} from "./executive-council-readiness";

// Canonical scenarios (client-safe)
export { CANONICAL_COUNCIL_SCENARIOS } from "./executive-council-canonical";
export type { CanonicalCouncilScenario } from "./executive-council-canonical";

// Perspective registry (client-safe)
export { PERSPECTIVE_REGISTRY, DEFAULT_COUNCIL_PERSPECTIVES, FULL_COUNCIL_PERSPECTIVES } from "./perspective-registry";
export type { PerspectiveDefinition } from "./perspective-registry";
