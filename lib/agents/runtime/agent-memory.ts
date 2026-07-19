/**
 * lib/agents/runtime/agent-memory.ts
 *
 * Agentik — Agent Memory
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * AgentMemorySnapshot holds the agent's operational memory for a runtime session.
 * Not persisted in this sprint — future sprint will add persistence layer.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type { AgentId, AgentMemoryId } from "./agent-runtime-types";

// ── Memory entries ────────────────────────────────────────────────────────────

export interface ShortTermMemoryEntry {
  key:         string;
  value:       unknown;
  addedAt:     string;
  expiresAt?:  string;
}

export interface LongTermMemoryRef {
  id:          string;
  topic:       string;
  summary:     string;
  domain?:     string;
  createdAt:   string;
}

export interface RecentDecisionRef {
  decisionRunId: string;
  domain:        string;
  signalCount:   number;
  topActionType: string;
  topScore:      number;
  ranAt:         string;
}

export interface RecentRecommendationRef {
  recommendationId: string;
  actionType:       string;
  domain:           string;
  score:            number;
  generatedAt:      string;
}

export interface UserPreference {
  key:   string;
  value: unknown;
}

export interface TenantRule {
  id:          string;
  domain:      string;
  description: string;
  isActive:    boolean;
}

export interface RiskNote {
  id:          string;
  domain:      string;
  note:        string;
  severity:    string;
  addedAt:     string;
}

// ── Memory snapshot ───────────────────────────────────────────────────────────

export interface AgentMemorySnapshot {
  id:                    AgentMemoryId;
  agentId:               AgentId;
  shortTerm:             ShortTermMemoryEntry[];
  longTermReferences:    LongTermMemoryRef[];
  recentDecisions:       RecentDecisionRef[];
  recentRecommendations: RecentRecommendationRef[];
  userPreferences:       UserPreference[];
  tenantRules:           TenantRule[];
  riskNotes:             RiskNote[];
  snapshotAt:            string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function createEmptyAgentMemory(agentId: AgentId): AgentMemorySnapshot {
  return {
    id:                    `mem_${agentId}_${Date.now()}`,
    agentId,
    shortTerm:             [],
    longTermReferences:    [],
    recentDecisions:       [],
    recentRecommendations: [],
    userPreferences:       [],
    tenantRules:           [],
    riskNotes:             [],
    snapshotAt:            new Date().toISOString(),
  };
}

export function mergeAgentMemorySnapshot(
  base:    AgentMemorySnapshot,
  overlay: Partial<AgentMemorySnapshot>,
): AgentMemorySnapshot {
  return {
    ...base,
    ...overlay,
    shortTerm:             overlay.shortTerm             ?? base.shortTerm,
    longTermReferences:    overlay.longTermReferences    ?? base.longTermReferences,
    recentDecisions:       overlay.recentDecisions       ?? base.recentDecisions,
    recentRecommendations: overlay.recentRecommendations ?? base.recentRecommendations,
    userPreferences:       overlay.userPreferences       ?? base.userPreferences,
    tenantRules:           overlay.tenantRules           ?? base.tenantRules,
    riskNotes:             overlay.riskNotes             ?? base.riskNotes,
    snapshotAt:            new Date().toISOString(),
  };
}

/**
 * Produces a compact string summary of the memory for decision context injection.
 * Used by the engine to enrich decision prompts (future AI integration).
 */
export function summarizeAgentMemoryForDecision(memory: AgentMemorySnapshot): string {
  const parts: string[] = [];

  if (memory.riskNotes.length > 0) {
    parts.push(`Risk notes: ${memory.riskNotes.map(r => r.note).slice(0, 3).join("; ")}`);
  }
  if (memory.tenantRules.filter(r => r.isActive).length > 0) {
    parts.push(`Active rules: ${memory.tenantRules.filter(r => r.isActive).map(r => r.description).slice(0, 3).join("; ")}`);
  }
  if (memory.recentDecisions.length > 0) {
    const last = memory.recentDecisions[0];
    if (last) {
      parts.push(`Last decision: ${last.domain} — ${last.topActionType} (score=${last.topScore})`);
    }
  }

  return parts.length > 0 ? parts.join(". ") : "No prior context.";
}
