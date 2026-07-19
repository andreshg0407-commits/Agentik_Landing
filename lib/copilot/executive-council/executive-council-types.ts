// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 1: Domain Types
// Serializable, tenant-scoped, fail-closed. No Prisma. No server-only. No React.

// ── Confidence & Outcome enumerations ─────────────────────────────────────────

export type CouncilConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const COUNCIL_CONFIDENCES: CouncilConfidence[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];

export const COUNCIL_CONFIDENCE_SCORE: Record<CouncilConfidence, number> = {
  LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 0.95,
};

export type CouncilOutcome =
  | "CONSENSUS"
  | "PARTIAL_CONSENSUS"
  | "NO_CONSENSUS"
  | "ESCALATION_REQUIRED";

export const COUNCIL_OUTCOMES: CouncilOutcome[] = [
  "CONSENSUS", "PARTIAL_CONSENSUS", "NO_CONSENSUS", "ESCALATION_REQUIRED",
];

export type CouncilPerspective =
  | "FINANCE"
  | "COMMERCIAL"
  | "OPERATIONS"
  | "MARKETING"
  | "COLLECTIONS"
  | "EXECUTIVE"
  | "STRATEGY"
  | "RISK"
  | "COMPLIANCE"
  | "CUSTOM";

export const COUNCIL_PERSPECTIVES: CouncilPerspective[] = [
  "FINANCE", "COMMERCIAL", "OPERATIONS", "MARKETING",
  "COLLECTIONS", "EXECUTIVE", "STRATEGY", "RISK", "COMPLIANCE", "CUSTOM",
];

export type CouncilPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const COUNCIL_PRIORITIES: CouncilPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const COUNCIL_PRIORITY_RANK: Record<CouncilPriority, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

export type CouncilVotePosition = "AGREE" | "DISAGREE" | "ABSTAIN" | "CONDITIONAL";

export const COUNCIL_VOTE_POSITIONS: CouncilVotePosition[] = [
  "AGREE", "DISAGREE", "ABSTAIN", "CONDITIONAL",
];

export type CouncilArgumentType = "SUPPORT" | "OPPOSE" | "QUALIFY" | "CLARIFY";

export const COUNCIL_ARGUMENT_TYPES: CouncilArgumentType[] = [
  "SUPPORT", "OPPOSE", "QUALIFY", "CLARIFY",
];

export type CouncilArgumentStrength = "WEAK" | "MODERATE" | "STRONG";

export const COUNCIL_ARGUMENT_STRENGTHS: CouncilArgumentStrength[] = [
  "WEAK", "MODERATE", "STRONG",
];

export type CouncilFindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Core council entities ──────────────────────────────────────────────────────

export interface ExecutiveArgument {
  readonly id:          string;
  readonly opinionId:   string;
  readonly type:        CouncilArgumentType;
  readonly claim:       string;
  readonly rationale:   string;
  readonly strength:    CouncilArgumentStrength;
  readonly evidenceIds: string[];
  readonly metadata:    Record<string, unknown>;
}

export interface ExecutiveFinding {
  readonly id:          string;
  readonly opinionId:   string;
  readonly sessionId:   string;
  readonly orgSlug:     string;
  readonly title:       string;
  readonly description: string;
  readonly severity:    CouncilFindingSeverity;
  readonly perspective: CouncilPerspective;
  readonly isBlocker:   boolean;
  readonly evidenceIds: string[];
  readonly metadata:    Record<string, unknown>;
}

export interface ExecutiveOpinion {
  readonly id:              string;           // opinion_…
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly perspective:     CouncilPerspective;
  readonly title:           string;
  readonly stance:          string;           // 1-sentence position
  readonly rationale:       string;
  readonly confidence:      CouncilConfidence;
  readonly confidenceScore: number;           // 0–1
  readonly priority:        CouncilPriority;
  readonly arguments:       ExecutiveArgument[];
  readonly findings:        ExecutiveFinding[];
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
  readonly generatedAt:     string;           // ISO
}

export interface ExecutiveVote {
  readonly perspective: CouncilPerspective;
  readonly position:    CouncilVotePosition;
  readonly weight:      number;               // 0–1
  readonly rationale:   string;
}

export interface ExecutiveConsensus {
  readonly id:                      string;   // consensus_…
  readonly orgSlug:                 string;
  readonly sessionId:               string;
  readonly outcome:                 CouncilOutcome;
  readonly title:                   string;
  readonly summary:                 string;
  readonly votes:                   ExecutiveVote[];
  readonly agreementScore:          number;   // 0–1
  readonly confidence:              CouncilConfidence;
  readonly dominantPerspective:     CouncilPerspective;
  readonly supportingPerspectives:  CouncilPerspective[];
  readonly opposingPerspectives:    CouncilPerspective[];
  readonly limitations:             string[];
  readonly metadata:                Record<string, unknown>;
  readonly reachedAt:               string;
}

export interface ExecutiveDisagreement {
  readonly id:               string;
  readonly orgSlug:          string;
  readonly sessionId:        string;
  readonly title:            string;
  readonly description:      string;
  readonly perspectiveA:     CouncilPerspective;
  readonly perspectiveB:     CouncilPerspective;
  readonly pointOfConflict:  string;
  readonly severity:         CouncilFindingSeverity;
  readonly canBeResolved:    boolean;
  readonly resolutionPath:   string;
  readonly metadata:         Record<string, unknown>;
}

export interface ExecutiveCouncilRecommendation {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly rationale:       string;
  readonly perspective:     CouncilPerspective;
  readonly priority:        CouncilPriority;
  readonly confidence:      CouncilConfidence;
  readonly confidenceScore: number;
  readonly impactScore:     number;
  readonly suggestedOnly:   true;
  readonly evidenceIds:     string[];
  readonly metadata:        Record<string, unknown>;
}

export interface ExecutiveResolution {
  readonly id:              string;           // resolution_…
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly outcome:         CouncilOutcome;
  readonly recommendations: ExecutiveCouncilRecommendation[];
  readonly consensus:       ExecutiveConsensus | null;
  readonly disagreements:   ExecutiveDisagreement[];
  readonly confidenceScore: number;
  readonly confidence:      CouncilConfidence;
  readonly suggestedOnly:   true;
  readonly limitations:     string[];
  readonly metadata:        Record<string, unknown>;
  readonly resolvedAt:      string;
}

export interface ExecutiveCouncilSession {
  readonly id:              string;           // council_…
  readonly orgSlug:         string;
  readonly title:           string;
  readonly topic:           string;
  readonly perspectives:    CouncilPerspective[];
  readonly opinions:        ExecutiveOpinion[];
  readonly consensus:       ExecutiveConsensus | null;
  readonly disagreements:   ExecutiveDisagreement[];
  readonly resolution:      ExecutiveResolution | null;
  readonly recommendations: ExecutiveCouncilRecommendation[];
  readonly sessionScore:    number;           // 0–1
  readonly outcome:         CouncilOutcome;
  readonly confidence:      CouncilConfidence;
  readonly limitations:     string[];
  readonly metadata:        Record<string, unknown>;
  readonly conductedAt:     string;
}

export interface ExecutiveCouncilReport {
  readonly id:                       string;
  readonly orgSlug:                  string;
  readonly session:                  ExecutiveCouncilSession;
  readonly executiveSummary:         string;
  readonly keyFindings:              ExecutiveFinding[];
  readonly topRecommendations:       ExecutiveCouncilRecommendation[];
  readonly unresolvedDisagreements:  ExecutiveDisagreement[];
  readonly councilScore:             number;
  readonly confidence:               CouncilConfidence;
  readonly generatedAt:              string;
}

export interface ExecutiveCouncilBriefing {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly title:             string;
  readonly headline:          string;
  readonly summary:           string;
  readonly topRecommendations: ExecutiveCouncilRecommendation[];
  readonly keyFindings:       ExecutiveFinding[];
  readonly unresolvedCount:   number;
  readonly councilScore:      number;
  readonly confidence:        CouncilConfidence;
  readonly metadata:          Record<string, unknown>;
  readonly generatedAt:       string;
}

export interface ExecutiveCouncilDigest {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly title:             string;
  readonly headline:          string;
  readonly outcome:           CouncilOutcome;
  readonly topRecommendations: ExecutiveCouncilRecommendation[];
  readonly councilScore:      number;
  readonly confidence:        CouncilConfidence;
  readonly metadata:          Record<string, unknown>;
  readonly generatedAt:       string;
}

// ── Input / Result types ───────────────────────────────────────────────────────

export interface ExecutiveCouncilInput {
  readonly orgSlug:         string;
  readonly topic:           string;
  readonly perspectives?:   CouncilPerspective[];
  readonly metadata?:       Record<string, unknown>;
}

export interface ExecutiveCouncilResult {
  readonly id:         string;
  readonly orgSlug:    string;
  readonly status:     "SUCCESS" | "PARTIAL" | "FAILED";
  readonly session?:   ExecutiveCouncilSession;
  readonly report?:    ExecutiveCouncilReport;
  readonly briefing?:  ExecutiveCouncilBriefing;
  readonly durationMs: number;
  readonly completedAt: string;
  readonly error?:     string;
}

// ── Snapshot ───────────────────────────────────────────────────────────────────

export interface ExecutiveCouncilSnapshot {
  readonly id:         string;
  readonly orgSlug:    string;
  readonly session:    ExecutiveCouncilSession;
  readonly report:     ExecutiveCouncilReport;
  readonly briefing:   ExecutiveCouncilBriefing;
  readonly digest:     ExecutiveCouncilDigest;
  readonly metadata:   Record<string, unknown>;
  readonly createdAt:  string;
}

// ── Utility helpers ────────────────────────────────────────────────────────────

export function councilConfidenceFromScore(score: number): CouncilConfidence {
  if (score >= 0.85) return "VERY_HIGH";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  return "LOW";
}

export function councilOutcomeFromAgreement(score: number): CouncilOutcome {
  if (score >= 0.75) return "CONSENSUS";
  if (score >= 0.50) return "PARTIAL_CONSENSUS";
  if (score >= 0.25) return "NO_CONSENSUS";
  return "ESCALATION_REQUIRED";
}

export function sortOpinionsByConfidence(opinions: ExecutiveOpinion[]): ExecutiveOpinion[] {
  return [...opinions].sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function sortRecommendationsByPriority(
  recs: ExecutiveCouncilRecommendation[]
): ExecutiveCouncilRecommendation[] {
  return [...recs].sort(
    (a, b) => COUNCIL_PRIORITY_RANK[b.priority] - COUNCIL_PRIORITY_RANK[a.priority]
  );
}

export function sortFindingsBySeverity(findings: ExecutiveFinding[]): ExecutiveFinding[] {
  const rank: Record<CouncilFindingSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return [...findings].sort((a, b) => rank[b.severity] - rank[a.severity]);
}
