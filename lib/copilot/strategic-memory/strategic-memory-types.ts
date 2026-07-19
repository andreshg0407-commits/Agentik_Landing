// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory domain types — serializable, tenant-scoped

// ── Enumerations ─────────────────────────────────────────────────────────────

export type StrategicMemoryType =
  | "GOAL"
  | "OBJECTIVE"
  | "PRIORITY"
  | "RISK"
  | "OPPORTUNITY"
  | "DECISION"
  | "COMMITMENT"
  | "ASSUMPTION"
  | "CONSTRAINT"
  | "POLICY"
  | "PLAYBOOK"
  | "LESSON"
  | "INSIGHT"
  | "RELATIONSHIP"
  | "CUSTOM";

export const STRATEGIC_MEMORY_TYPES: StrategicMemoryType[] = [
  "GOAL", "OBJECTIVE", "PRIORITY", "RISK", "OPPORTUNITY", "DECISION",
  "COMMITMENT", "ASSUMPTION", "CONSTRAINT", "POLICY", "PLAYBOOK",
  "LESSON", "INSIGHT", "RELATIONSHIP", "CUSTOM",
];

export type StrategicMemoryPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const STRATEGIC_MEMORY_PRIORITIES: StrategicMemoryPriority[] = [
  "LOW", "MEDIUM", "HIGH", "CRITICAL",
];

export type StrategicMemoryStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "SUPERSEDED"
  | "ARCHIVED"
  | "INVALIDATED";

export const STRATEGIC_MEMORY_STATUSES: StrategicMemoryStatus[] = [
  "ACTIVE", "COMPLETED", "SUPERSEDED", "ARCHIVED", "INVALIDATED",
];

export type StrategicMemoryConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const STRATEGIC_MEMORY_CONFIDENCE_LEVELS: StrategicMemoryConfidence[] = [
  "LOW", "MEDIUM", "HIGH", "VERY_HIGH",
];

export type StrategicMemoryDomain =
  | "FINANCE"
  | "COMMERCIAL"
  | "MARKETING"
  | "OPERATIONS"
  | "EXECUTIVE"
  | "COMPLIANCE"
  | "TECHNOLOGY"
  | "PEOPLE"
  | "CROSS_DOMAIN";

export const STRATEGIC_MEMORY_DOMAINS: StrategicMemoryDomain[] = [
  "FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS", "EXECUTIVE",
  "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN",
];

export type StrategicRelationType =
  | "SUPPORTS"
  | "BLOCKS"
  | "DEPENDS_ON"
  | "CONFLICTS_WITH"
  | "DERIVED_FROM"
  | "SUPERSEDES"
  | "VALIDATES"
  | "INVALIDATES"
  | "RELATED_TO";

export const STRATEGIC_RELATION_TYPES: StrategicRelationType[] = [
  "SUPPORTS", "BLOCKS", "DEPENDS_ON", "CONFLICTS_WITH", "DERIVED_FROM",
  "SUPERSEDES", "VALIDATES", "INVALIDATES", "RELATED_TO",
];

// ── Core entity: StrategicMemoryEntry ─────────────────────────────────────────

export interface StrategicMemoryEntry {
  readonly id: string;
  readonly orgSlug: string;
  readonly type: StrategicMemoryType;
  readonly priority: StrategicMemoryPriority;
  readonly status: StrategicMemoryStatus;
  readonly confidence: StrategicMemoryConfidence;
  readonly confidenceScore: number; // 0–1
  readonly domain: StrategicMemoryDomain;
  readonly title: string;
  readonly description: string;
  /** Structured rationale — why this is strategically important */
  readonly rationale: string;
  /** IDs of evidence items that support this memory */
  readonly evidenceIds: string[];
  /** IDs of related strategic memory entries */
  readonly relatedIds: string[];
  /** Source system that created this entry */
  readonly source: StrategicMemorySource;
  readonly agentId?: string;
  readonly userId?: string;
  /** Relevance score 0–1, computed by relevance engine */
  readonly relevanceScore: number;
  /** Strategic importance score 0–1, computed by classification engine */
  readonly strategicScore: number;
  readonly metadata: Record<string, unknown>;
  readonly validUntil?: string; // ISO8601 — optional expiry
  readonly createdAt: string; // ISO8601
  readonly updatedAt: string; // ISO8601
}

export type StrategicMemorySource =
  | "MANUAL"
  | "EXECUTIVE_BRAIN"
  | "LEARNING_FRAMEWORK"
  | "MEMORY_ENGINE"
  | "MEMORY_GRAPH"
  | "CROSS_MODULE_REASONING"
  | "PLAYBOOK"
  | "COPILOT"
  | "AGENT"
  | "SYSTEM";

export const STRATEGIC_MEMORY_SOURCES: StrategicMemorySource[] = [
  "MANUAL", "EXECUTIVE_BRAIN", "LEARNING_FRAMEWORK", "MEMORY_ENGINE",
  "MEMORY_GRAPH", "CROSS_MODULE_REASONING", "PLAYBOOK", "COPILOT", "AGENT", "SYSTEM",
];

// ── Strategic Relation ────────────────────────────────────────────────────────

export interface StrategicMemoryRelation {
  readonly id: string;
  readonly orgSlug: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: StrategicRelationType;
  readonly strength: number; // 0–1
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string; // ISO8601
}

// ── Strategic Evidence ────────────────────────────────────────────────────────

export interface StrategicMemoryEvidence {
  readonly id: string;
  readonly orgSlug: string;
  readonly memoryId: string;
  readonly type: "SIGNAL" | "OUTCOME" | "PATTERN" | "DOCUMENT" | "DECISION" | "METRIC";
  readonly description: string;
  readonly strength: number; // 0–1
  readonly sourceRef: string;
  readonly metadata: Record<string, unknown>;
  readonly recordedAt: string; // ISO8601
}

// ── Strategic Signal ──────────────────────────────────────────────────────────

export interface StrategicMemorySignal {
  readonly id: string;
  readonly orgSlug: string;
  readonly memoryId: string;
  readonly domain: StrategicMemoryDomain;
  readonly signalType: "REINFORCEMENT" | "INVALIDATION" | "UPDATE" | "ESCALATION" | "COMPLETION";
  readonly strength: number; // 0–1
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly generatedAt: string; // ISO8601
}

// ── Strategic Context ─────────────────────────────────────────────────────────

export interface StrategicMemoryContext {
  readonly orgSlug: string;
  readonly domains: StrategicMemoryDomain[];
  readonly activeGoals: StrategicMemoryEntry[];
  readonly criticalRisks: StrategicMemoryEntry[];
  readonly recentDecisions: StrategicMemoryEntry[];
  readonly activeCommitments: StrategicMemoryEntry[];
  readonly topPolicies: StrategicMemoryEntry[];
  readonly recentLessons: StrategicMemoryEntry[];
  readonly strategicScore: number; // 0–1 aggregate
  readonly requestedAt: string; // ISO8601
}

// ── Strategic Query ───────────────────────────────────────────────────────────

export interface StrategicMemoryQuery {
  readonly orgSlug: string;
  readonly types?: StrategicMemoryType[];
  readonly priorities?: StrategicMemoryPriority[];
  readonly statuses?: StrategicMemoryStatus[];
  readonly domains?: StrategicMemoryDomain[];
  readonly minConfidenceScore?: number;
  readonly minStrategicScore?: number;
  readonly agentId?: string;
  readonly limit?: number;
  readonly since?: string; // ISO8601
}

// ── Strategic Snapshot ────────────────────────────────────────────────────────

export interface StrategicMemorySnapshot {
  readonly id: string;
  readonly orgSlug: string;
  readonly period: "CURRENT" | "QUARTER" | "YEAR" | "CUSTOM";
  readonly goals: StrategicMemoryEntry[];
  readonly risks: StrategicMemoryEntry[];
  readonly opportunities: StrategicMemoryEntry[];
  readonly decisions: StrategicMemoryEntry[];
  readonly commitments: StrategicMemoryEntry[];
  readonly lessons: StrategicMemoryEntry[];
  readonly policies: StrategicMemoryEntry[];
  readonly relations: StrategicMemoryRelation[];
  readonly totalItems: number;
  readonly activeItems: number;
  readonly criticalItems: number;
  readonly strategicScore: number; // 0–1
  readonly narrative: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string; // ISO8601
}

// ── Strategic Result ──────────────────────────────────────────────────────────

export interface StrategicMemoryResult {
  readonly id: string;
  readonly orgSlug: string;
  readonly status: "SUCCESS" | "PARTIAL" | "FAILED";
  readonly itemsSaved: number;
  readonly relationsSaved: number;
  readonly snapshotsGenerated: number;
  readonly durationMs: number;
  readonly completedAt: string; // ISO8601
}
