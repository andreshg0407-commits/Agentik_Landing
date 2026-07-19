// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning pattern engine — create, reinforce, weaken, merge patterns

import type {
  LearningPattern,
  LearningEvent,
  LearningDomain,
  LearningPatternStatus,
} from "./learning-types";
import { generateLearningPatternId } from "./learning-identity";

const REINFORCEMENT_THRESHOLD = 5;
const WEAKENING_THRESHOLD = 3;
const DEPRECATION_NET_SCORE = -5;

function computeStatus(
  reinforcementCount: number,
  weakeningCount: number,
  netScore: number,
  current: LearningPatternStatus
): LearningPatternStatus {
  if (netScore <= DEPRECATION_NET_SCORE) return "DEPRECATED";
  if (weakeningCount > reinforcementCount && netScore < 0) return "WEAKENED";
  if (reinforcementCount >= REINFORCEMENT_THRESHOLD) return "REINFORCED";
  if (reinforcementCount > 0 || weakeningCount > 0) return "ACTIVE";
  return current;
}

function computeConfidence(
  reinforcementCount: number,
  weakeningCount: number
): number {
  const total = reinforcementCount + weakeningCount;
  if (total === 0) return 0.3;
  const ratio = reinforcementCount / total;
  // Scale to 0.1–0.95 range
  return Math.max(0.1, Math.min(0.95, 0.3 + ratio * 0.65));
}

export function createPattern(
  orgSlug: string,
  domain: LearningDomain,
  name: string,
  description: string,
  seedEventId: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): LearningPattern {
  const now = new Date().toISOString();
  return {
    id: generateLearningPatternId(),
    orgSlug,
    domain,
    name,
    description,
    status: "EMERGING",
    reinforcementCount: 1,
    weakeningCount: 0,
    netScore: 1,
    confidenceScore: 0.35,
    evidenceEventIds: [seedEventId],
    agentId,
    metadata: metadata ?? {},
    firstSeenAt: now,
    lastUpdatedAt: now,
  };
}

export function reinforcePattern(
  pattern: LearningPattern,
  event: LearningEvent
): LearningPattern {
  const reinforcementCount = pattern.reinforcementCount + 1;
  const weakeningCount = pattern.weakeningCount;
  const netScore = pattern.netScore + 1;
  const confidenceScore = computeConfidence(reinforcementCount, weakeningCount);
  const status = computeStatus(reinforcementCount, weakeningCount, netScore, pattern.status);
  return {
    ...pattern,
    reinforcementCount,
    netScore,
    confidenceScore,
    status,
    evidenceEventIds: [...pattern.evidenceEventIds, event.id],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function weakenPattern(
  pattern: LearningPattern,
  event: LearningEvent
): LearningPattern {
  const reinforcementCount = pattern.reinforcementCount;
  const weakeningCount = pattern.weakeningCount + 1;
  const netScore = pattern.netScore - 1;
  const confidenceScore = computeConfidence(reinforcementCount, weakeningCount);
  const status = computeStatus(reinforcementCount, weakeningCount, netScore, pattern.status);
  return {
    ...pattern,
    weakeningCount,
    netScore,
    confidenceScore,
    status,
    evidenceEventIds: [...pattern.evidenceEventIds, event.id],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function mergePatterns(
  primary: LearningPattern,
  secondary: LearningPattern
): LearningPattern {
  if (primary.orgSlug !== secondary.orgSlug) {
    throw new Error("Cannot merge patterns from different tenants");
  }
  const reinforcementCount = primary.reinforcementCount + secondary.reinforcementCount;
  const weakeningCount = primary.weakeningCount + secondary.weakeningCount;
  const netScore = primary.netScore + secondary.netScore;
  const confidenceScore = computeConfidence(reinforcementCount, weakeningCount);
  const status = computeStatus(reinforcementCount, weakeningCount, netScore, primary.status);
  const allEventIds = Array.from(
    new Set([...primary.evidenceEventIds, ...secondary.evidenceEventIds])
  );
  return {
    ...primary,
    reinforcementCount,
    weakeningCount,
    netScore,
    confidenceScore,
    status,
    evidenceEventIds: allEventIds,
    description: primary.description,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function isPatternActive(pattern: LearningPattern): boolean {
  return pattern.status === "ACTIVE" || pattern.status === "REINFORCED";
}

export function isPatternDeprecated(pattern: LearningPattern): boolean {
  return pattern.status === "DEPRECATED";
}

export function sortPatternsByConfidence(patterns: LearningPattern[]): LearningPattern[] {
  return [...patterns].sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function filterActivePatterns(patterns: LearningPattern[]): LearningPattern[] {
  return patterns.filter(isPatternActive);
}
