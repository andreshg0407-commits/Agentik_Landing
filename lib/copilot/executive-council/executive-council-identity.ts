// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 2: Identity Layer
// ID generation and prefix constants for the Executive Council domain.

let _ecCounter = 0;

export function generateCouncilId(prefix: string): string {
  _ecCounter = (_ecCounter + 1) % 999999;
  return `${prefix}_${Date.now().toString(36)}_${_ecCounter}`;
}

// ── ID Prefix constants ────────────────────────────────────────────────────────

export const COUNCIL_ID_PREFIX      = "council";
export const OPINION_ID_PREFIX      = "opinion";
export const CONSENSUS_ID_PREFIX    = "consensus";
export const RESOLUTION_ID_PREFIX   = "resolution";
export const ARGUMENT_ID_PREFIX     = "arg";
export const FINDING_ID_PREFIX      = "finding";
export const DISAGREEMENT_ID_PREFIX = "disagree";
export const RECOMMENDATION_ID_PREFIX = "councilrec";
export const REPORT_ID_PREFIX       = "councilrpt";
export const BRIEFING_ID_PREFIX     = "councilbrf";
export const DIGEST_ID_PREFIX       = "councildgst";
export const SNAPSHOT_ID_PREFIX     = "councilsnap";
export const VOTE_ID_PREFIX         = "vote";

// ── Factory helpers ────────────────────────────────────────────────────────────

export function newCouncilId():       string { return generateCouncilId(COUNCIL_ID_PREFIX); }
export function newOpinionId():       string { return generateCouncilId(OPINION_ID_PREFIX); }
export function newConsensusId():     string { return generateCouncilId(CONSENSUS_ID_PREFIX); }
export function newResolutionId():    string { return generateCouncilId(RESOLUTION_ID_PREFIX); }
export function newArgumentId():      string { return generateCouncilId(ARGUMENT_ID_PREFIX); }
export function newFindingId():       string { return generateCouncilId(FINDING_ID_PREFIX); }
export function newDisagreementId():  string { return generateCouncilId(DISAGREEMENT_ID_PREFIX); }
export function newRecommendationId(): string { return generateCouncilId(RECOMMENDATION_ID_PREFIX); }
export function newReportId():        string { return generateCouncilId(REPORT_ID_PREFIX); }
export function newBriefingId():      string { return generateCouncilId(BRIEFING_ID_PREFIX); }
export function newDigestId():        string { return generateCouncilId(DIGEST_ID_PREFIX); }
export function newSnapshotId():      string { return generateCouncilId(SNAPSHOT_ID_PREFIX); }
