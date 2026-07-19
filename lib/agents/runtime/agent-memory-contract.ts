/**
 * lib/agents/runtime/agent-memory-contract.ts
 *
 * Agentik — Universal Agent Runtime — Memory Contract
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Defines the IAgentMemory interface consumed by the runtime.
 * Distinct from the existing agent-memory.ts (which has the full snapshot model).
 *
 * Pure domain. No Prisma. No React. No server-only.
 * Implement this interface to wire real persistence to the runtime.
 */

import type { AgentId } from "./agent-types";

// ── Memory entry ───────────────────────────────────────────────────────────────

export interface AgentMemoryEntry {
  key:       string;
  value:     unknown;
  createdAt: string;
  expiresAt?: string;
}

// ── Search result ─────────────────────────────────────────────────────────────

export interface AgentMemorySearchResult {
  key:     string;
  value:   unknown;
  score:   number;
}

// ── Contract ──────────────────────────────────────────────────────────────────

/**
 * IAgentMemory — minimal memory contract for the Universal Agent Runtime.
 *
 * Implementations may back this with Redis, Prisma, or in-memory maps.
 * The runtime loads memory before planning and saves after execution.
 */
export interface IAgentMemory {
  /**
   * Load all memory entries for an agent in a given org.
   * Returns a key→value map — never throws.
   */
  loadMemory(
    agentId: AgentId,
    orgSlug: string,
  ): Promise<Record<string, unknown>>;

  /**
   * Persist a set of key→value pairs for an agent in a given org.
   * Upserts — existing keys are overwritten.
   */
  saveMemory(
    agentId:  AgentId,
    orgSlug:  string,
    entries:  Record<string, unknown>,
  ): Promise<void>;

  /**
   * Search memory entries by a text query.
   * Returns ordered results with similarity scores.
   * Implementations may use keyword match, vector search, or both.
   */
  searchMemory(
    agentId: AgentId,
    orgSlug: string,
    query:   string,
    limit?:  number,
  ): Promise<AgentMemorySearchResult[]>;
}

// ── No-op implementation (safe default) ──────────────────────────────────────

/**
 * NoOpAgentMemory — used when no real memory backend is wired.
 * loadMemory returns empty, saveMemory is silent, searchMemory returns [].
 * Never throws.
 */
export const noOpAgentMemory: IAgentMemory = {
  async loadMemory()   { return {}; },
  async saveMemory()   { return; },
  async searchMemory() { return []; },
};
