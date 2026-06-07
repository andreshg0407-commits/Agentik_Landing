// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory builder — factory functions for each memory type

import type {
  StrategicMemoryEntry,
  StrategicMemoryType,
  StrategicMemoryPriority,
  StrategicMemoryStatus,
  StrategicMemoryConfidence,
  StrategicMemoryDomain,
  StrategicMemorySource,
} from "./strategic-memory-types";
import { generateStrategicMemoryId } from "./strategic-memory-identity";

export interface StrategicMemoryInput {
  readonly orgSlug: string;
  readonly type: StrategicMemoryType;
  readonly priority: StrategicMemoryPriority;
  readonly domain: StrategicMemoryDomain;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly confidence?: StrategicMemoryConfidence;
  readonly confidenceScore?: number;
  readonly source?: StrategicMemorySource;
  readonly status?: StrategicMemoryStatus;
  readonly evidenceIds?: string[];
  readonly relatedIds?: string[];
  readonly agentId?: string;
  readonly userId?: string;
  readonly validUntil?: string;
  readonly metadata?: Record<string, unknown>;
}

export function buildStrategicMemory(input: StrategicMemoryInput): StrategicMemoryEntry {
  const now = new Date().toISOString();
  const confidenceScore = Math.max(0, Math.min(1, input.confidenceScore ?? 0.6));
  return {
    id: generateStrategicMemoryId(),
    orgSlug: input.orgSlug,
    type: input.type,
    priority: input.priority,
    status: input.status ?? "ACTIVE",
    confidence: input.confidence ?? scoreToConfidence(confidenceScore),
    confidenceScore,
    domain: input.domain,
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    evidenceIds: input.evidenceIds ?? [],
    relatedIds: input.relatedIds ?? [],
    source: input.source ?? "MANUAL",
    agentId: input.agentId,
    userId: input.userId,
    relevanceScore: computeInitialRelevance(input.priority),
    strategicScore: computeInitialStrategicScore(input.type, input.priority),
    metadata: input.metadata ?? {},
    validUntil: input.validUntil,
    createdAt: now,
    updatedAt: now,
  };
}

function scoreToConfidence(score: number): StrategicMemoryConfidence {
  if (score >= 0.9) return "VERY_HIGH";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

function computeInitialRelevance(priority: StrategicMemoryPriority): number {
  switch (priority) {
    case "CRITICAL": return 0.95;
    case "HIGH": return 0.8;
    case "MEDIUM": return 0.6;
    case "LOW": return 0.4;
  }
}

function computeInitialStrategicScore(
  type: StrategicMemoryType,
  priority: StrategicMemoryPriority
): number {
  const typeWeights: Record<StrategicMemoryType, number> = {
    GOAL: 0.9, DECISION: 0.85, RISK: 0.85, COMMITMENT: 0.8,
    OBJECTIVE: 0.8, POLICY: 0.75, OPPORTUNITY: 0.75, PRIORITY: 0.75,
    LESSON: 0.7, INSIGHT: 0.65, PLAYBOOK: 0.65, ASSUMPTION: 0.55,
    CONSTRAINT: 0.55, RELATIONSHIP: 0.5, CUSTOM: 0.5,
  };
  const priorityMultiplier: Record<StrategicMemoryPriority, number> = {
    CRITICAL: 1.0, HIGH: 0.85, MEDIUM: 0.7, LOW: 0.5,
  };
  return Math.min(1, typeWeights[type] * priorityMultiplier[priority]);
}

// ── Specific builders ─────────────────────────────────────────────────────────

export function buildStrategicGoal(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  priority: StrategicMemoryPriority = "HIGH",
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "GOAL", priority, domain, title, description,
    rationale: `Strategic goal: ${title}`,
    confidence: "HIGH", confidenceScore: 0.85,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicRisk(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  priority: StrategicMemoryPriority = "HIGH",
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "RISK", priority, domain, title, description,
    rationale: `Strategic risk: ${title}`,
    confidence: "HIGH", confidenceScore: 0.8,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicOpportunity(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  priority: StrategicMemoryPriority = "MEDIUM",
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "OPPORTUNITY", priority, domain, title, description,
    rationale: `Strategic opportunity: ${title}`,
    confidence: "MEDIUM", confidenceScore: 0.7,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicDecision(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  rationale: string,
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "DECISION", priority: "HIGH", domain, title, description, rationale,
    confidence: "VERY_HIGH", confidenceScore: 0.9,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicLesson(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "LESSON", priority: "MEDIUM", domain, title, description,
    rationale: `Lesson learned: ${title}`,
    confidence: "HIGH", confidenceScore: 0.8,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicCommitment(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  priority: StrategicMemoryPriority = "HIGH",
  validUntil?: string,
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "COMMITMENT", priority, domain, title, description,
    rationale: `Strategic commitment: ${title}`,
    confidence: "HIGH", confidenceScore: 0.85,
    validUntil, evidenceIds, metadata: metadata ?? {},
  });
}

export function buildStrategicPolicy(
  orgSlug: string,
  title: string,
  description: string,
  domain: StrategicMemoryDomain,
  evidenceIds: string[] = [],
  metadata?: Record<string, unknown>
): StrategicMemoryEntry {
  return buildStrategicMemory({
    orgSlug, type: "POLICY", priority: "HIGH", domain, title, description,
    rationale: `Strategic policy: ${title}`,
    confidence: "VERY_HIGH", confidenceScore: 0.9,
    evidenceIds, metadata: metadata ?? {},
  });
}

export function updateStrategicMemoryStatus(
  entry: StrategicMemoryEntry,
  status: StrategicMemoryStatus
): StrategicMemoryEntry {
  return {
    ...entry,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function updateStrategicMemoryPriority(
  entry: StrategicMemoryEntry,
  priority: StrategicMemoryPriority
): StrategicMemoryEntry {
  return {
    ...entry,
    priority,
    relevanceScore: computeInitialRelevance(priority),
    strategicScore: computeInitialStrategicScore(entry.type, priority),
    updatedAt: new Date().toISOString(),
  };
}
