// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Classification Engine — determine what merits strategic memory

import type {
  StrategicMemoryEntry,
  StrategicMemoryType,
  StrategicMemoryPriority,
  StrategicMemoryDomain,
} from "./strategic-memory-types";

export interface ClassificationInput {
  readonly orgSlug: string;
  readonly type: StrategicMemoryType;
  readonly priority: StrategicMemoryPriority;
  readonly domain: StrategicMemoryDomain;
  readonly title: string;
  readonly description: string;
  readonly evidenceIds?: string[];
  readonly confidenceScore?: number;
}

export interface ClassificationResult {
  readonly isStrategicCandidate: boolean;
  readonly strategicScore: number; // 0–1
  readonly importanceLevel: "NOT_STRATEGIC" | "LOW_STRATEGIC" | "STRATEGIC" | "HIGHLY_STRATEGIC";
  readonly reasons: string[];
  readonly classifiedAt: string; // ISO8601
}

const MIN_STRATEGIC_SCORE = 0.35;

const TYPE_BASE_SCORES: Record<StrategicMemoryType, number> = {
  GOAL: 0.9,
  DECISION: 0.88,
  RISK: 0.85,
  COMMITMENT: 0.83,
  OBJECTIVE: 0.8,
  POLICY: 0.78,
  OPPORTUNITY: 0.75,
  PRIORITY: 0.73,
  LESSON: 0.7,
  INSIGHT: 0.65,
  PLAYBOOK: 0.63,
  ASSUMPTION: 0.5,
  CONSTRAINT: 0.5,
  RELATIONSHIP: 0.45,
  CUSTOM: 0.4,
};

const PRIORITY_MULTIPLIERS: Record<StrategicMemoryPriority, number> = {
  CRITICAL: 1.0,
  HIGH: 0.85,
  MEDIUM: 0.65,
  LOW: 0.45,
};

export function computeStrategicScore(input: ClassificationInput): number {
  const typeScore = TYPE_BASE_SCORES[input.type];
  const priorityMult = PRIORITY_MULTIPLIERS[input.priority];

  // Evidence bonus
  const evidenceBonus = (input.evidenceIds?.length ?? 0) > 0 ? 0.05 : 0;

  // Confidence bonus
  const confidenceBonus = (input.confidenceScore ?? 0) >= 0.8 ? 0.05 : 0;

  // Title quality (rough proxy: length > 5 words)
  const words = input.title.trim().split(/\s+/).length;
  const titleBonus = words >= 5 ? 0.03 : 0;

  return Math.min(1, (typeScore * priorityMult) + evidenceBonus + confidenceBonus + titleBonus);
}

export function classifyStrategicImportance(input: ClassificationInput): ClassificationResult {
  const strategicScore = computeStrategicScore(input);
  const reasons: string[] = [];

  if (TYPE_BASE_SCORES[input.type] >= 0.8) {
    reasons.push(`High-value type: ${input.type}`);
  }
  if (input.priority === "CRITICAL" || input.priority === "HIGH") {
    reasons.push(`Priority level: ${input.priority}`);
  }
  if ((input.evidenceIds?.length ?? 0) > 0) {
    reasons.push(`Backed by ${input.evidenceIds!.length} evidence item(s)`);
  }
  if ((input.confidenceScore ?? 0) >= 0.8) {
    reasons.push(`High confidence: ${((input.confidenceScore ?? 0) * 100).toFixed(0)}%`);
  }

  const isStrategicCandidate = strategicScore >= MIN_STRATEGIC_SCORE;

  let importanceLevel: ClassificationResult["importanceLevel"];
  if (strategicScore >= 0.75) {
    importanceLevel = "HIGHLY_STRATEGIC";
  } else if (strategicScore >= 0.5) {
    importanceLevel = "STRATEGIC";
  } else if (strategicScore >= MIN_STRATEGIC_SCORE) {
    importanceLevel = "LOW_STRATEGIC";
  } else {
    importanceLevel = "NOT_STRATEGIC";
    reasons.push(`Score ${strategicScore.toFixed(2)} below threshold ${MIN_STRATEGIC_SCORE}`);
  }

  return {
    isStrategicCandidate,
    strategicScore,
    importanceLevel,
    reasons,
    classifiedAt: new Date().toISOString(),
  };
}

export function isStrategicCandidate(input: ClassificationInput): boolean {
  return classifyStrategicImportance(input).isStrategicCandidate;
}

export function rankStrategicItems(
  entries: StrategicMemoryEntry[]
): StrategicMemoryEntry[] {
  return [...entries].sort((a, b) => {
    // Sort by strategic score, then priority
    if (Math.abs(a.strategicScore - b.strategicScore) > 0.05) {
      return b.strategicScore - a.strategicScore;
    }
    const pOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return pOrder[b.priority] - pOrder[a.priority];
  });
}

export function filterStrategicItems(
  entries: StrategicMemoryEntry[],
  minScore = MIN_STRATEGIC_SCORE
): StrategicMemoryEntry[] {
  return entries.filter((e) => e.strategicScore >= minScore);
}

export function getStrategicImportanceLabel(score: number): string {
  if (score >= 0.75) return "Highly Strategic";
  if (score >= 0.5) return "Strategic";
  if (score >= MIN_STRATEGIC_SCORE) return "Low Strategic";
  return "Not Strategic";
}
