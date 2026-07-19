/**
 * lib/agent-runtime/agent-memory.ts
 *
 * Agentik Agent Runtime — Memory Layer Types
 *
 * Defines the 5-layer memory model for the agent runtime.
 * This file is TYPE-ONLY — no Prisma, no storage implementation.
 *
 * Implementations live in lib/agentik/operational-memory.ts,
 * lib/copilot/strategic-memory.ts, and future lib/agent-runtime/memory/*.ts
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentRuntimeId, AgentDomain } from "./agent-types";

// ── Memory scope ──────────────────────────────────────────────────────────────

/**
 * Five memory scopes, each with different retention, access, and persistence rules.
 *
 * tenant:      Organization-wide rules, thresholds, source configs. Prisma.
 * module:      Per-module decision history, resolved signals. Prisma.
 * agent:       Per-agent learned patterns, domain-specific context. Prisma + vector.
 * user:        Per-user preferences, format choices. Session + Prisma.
 * operational: In-flight signals, pending actions, workflow states. Redis / Prisma TTL.
 */
export type MemoryScope =
  | "tenant"
  | "module"
  | "agent"
  | "user"
  | "operational";

// ── Base memory entry ─────────────────────────────────────────────────────────

export interface MemoryEntry {
  id:             string;
  scope:          MemoryScope;
  organizationId: string;
  /** Set for module/agent/operational scope. Null for tenant-wide entries. */
  moduleKey?:     string;
  /** Set for agent and operational scope. Null for broader scopes. */
  agentId?:       AgentRuntimeId;
  /** Set for user scope entries. */
  userId?:        string;
  /** Memory content — typed per scope, stored as JSON */
  content:        Record<string, unknown>;
  /** Relevance score 0–1 when retrieved via semantic search */
  relevanceScore?: number;
  createdAt:      string;  // ISO
  expiresAt?:     string;  // ISO — null = permanent
  /** Version for optimistic concurrency */
  version:        number;
}

// ── Tenant memory ─────────────────────────────────────────────────────────────

/**
 * Tenant memory content.
 * Org-wide business rules configured by administrators.
 * Never expires. Source of truth for agent thresholds.
 */
export interface TenantMemoryContent {
  /** Treasury coverage threshold in days before "low coverage" signal */
  treasuryCoverageDaysThreshold:  number;
  /** Minimum coverage % below which references are flagged */
  coverageMinThresholdPct:        number;
  /** Active source IDs and their sync frequency */
  activeSources:                  string[];
  /** Custom labels per module */
  moduleLabels:                   Record<string, string>;
  /** Preferred currency */
  currency:                       string;
  /** Fiscal year start (1-12) */
  fiscalYearStartMonth:           number;
}

// ── Module memory ─────────────────────────────────────────────────────────────

/**
 * Module memory content.
 * Stores the recent history of decisions and resolved signals per module.
 */
export interface ModuleMemoryContent {
  domain:           AgentDomain;
  recentDecisions:  ModuleDecisionRecord[];
  resolvedSignals:  string[];  // signal IDs that were resolved
  lastSnapshotAt:   string;    // ISO — when the last context snapshot was taken
}

export interface ModuleDecisionRecord {
  timestamp:  string;
  actionType: string;
  summary:    string;
  outcome:    "approved" | "dismissed" | "executed" | "failed";
}

// ── Agent memory ──────────────────────────────────────────────────────────────

/**
 * Agent memory content.
 * Domain-specific learned patterns and context.
 * May be supplemented by vector embeddings for semantic retrieval.
 */
export interface AgentMemoryContent {
  domain:           AgentDomain;
  learnedPatterns:  AgentPattern[];
  domainRules:      string[];  // natural language rules set by the tenant
  signalThresholds: Record<string, number>;  // override thresholds per signal type
}

export interface AgentPattern {
  id:          string;
  description: string;   // e.g. "This org typically closes books on the 30th"
  confidence:  number;   // 0–1
  sourceCount: number;   // how many observations support this pattern
  firstSeenAt: string;
  lastSeenAt:  string;
}

// ── User memory ───────────────────────────────────────────────────────────────

/**
 * User memory content.
 * Per-user preferences that persist across sessions.
 */
export interface UserMemoryContent {
  preferredModules:   string[];  // module keys sorted by recency
  preferredFormat:    "summary" | "detail";
  preferredCurrency?: string;
  dismissedSignals:   string[];  // signal IDs permanently dismissed by this user
}

// ── Operational memory ────────────────────────────────────────────────────────

/**
 * Operational memory content.
 * In-flight state: active signals, pending actions, workflow states.
 * Short-lived — TTL governed by the storage layer.
 */
export interface OperationalMemoryContent {
  activeSignalIds:       string[];
  pendingActionIds:      string[];
  activeWorkflowIds:     string[];
  lastAgentInvocationAt: string;
}
