/**
 * lib/copilot/memory/server.ts
 *
 * Agentik — Copilot Memory Persistence — Server-Only Barrel
 * Sprint: AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
 *
 * Server-side entry point for the Copilot Memory Engine.
 * Exports everything needed to use durable memory from server code:
 *   - The Prisma-backed repository singleton
 *   - The environment-aware resolver
 *   - A server-ready StrategicMemoryManager backed by Prisma
 *   - All retrieval helpers bound to the Prisma repository
 *
 * SERVER-ONLY — never import from client components or pure-domain code.
 * Client-safe imports use lib/copilot/memory/index.ts instead.
 */
import "server-only";

// ── Repository ────────────────────────────────────────────────────────────────

export { prismaMemoryRepository }           from "./persistence/prisma-memory-repository";
export {
  getServerMemoryRepository,
  resetTestMemoryRepository,
}                                           from "./memory-repository-resolver";

// ── Server-ready manager ──────────────────────────────────────────────────────

import { StrategicMemoryManager }           from "./strategic-memory-manager";
import { getServerMemoryRepository }        from "./memory-repository-resolver";

/**
 * Process-level StrategicMemoryManager backed by the server repository.
 * In production: PrismaMemoryRepository (durable).
 * In tests:      InMemoryMemoryRepository (ephemeral).
 *
 * Use this singleton from API routes and intelligence services.
 * Do NOT use defaultMemoryManager from strategic-memory-manager.ts in server code.
 */
export const serverMemoryManager = new StrategicMemoryManager(getServerMemoryRepository());

// ── Re-export StrategicMemoryManager class for custom instantiation ────────────

export { StrategicMemoryManager }           from "./strategic-memory-manager";

// ── Retrieval helpers bound to the server repository ──────────────────────────

import {
  getStrategicContext   as _getStrategicContext,
  getModuleContext      as _getModuleContext,
  getAgentContext       as _getAgentContext,
  searchRelevantMemories as _searchRelevantMemories,
  getPreferenceContext  as _getPreferenceContext,
}                                           from "./memory-retrieval";
import type { CopilotIntent }               from "../copilot-types";

const _serverRepo = getServerMemoryRepository();

/** getStrategicContext bound to the server repository */
export function getStrategicContext(orgSlug: string, intent: CopilotIntent) {
  return _getStrategicContext(orgSlug, intent, _serverRepo);
}

/** getModuleContext bound to the server repository */
export function getModuleContext(orgSlug: string, moduleId: string) {
  return _getModuleContext(orgSlug, moduleId, _serverRepo);
}

/** getAgentContext bound to the server repository */
export function getAgentContext(orgSlug: string, agentId: string) {
  return _getAgentContext(orgSlug, agentId, _serverRepo);
}

/** searchRelevantMemories bound to the server repository */
export function searchRelevantMemories(
  orgSlug: string,
  query?:  string,
  tags?:   string[],
  limit?:  number,
) {
  return _searchRelevantMemories(orgSlug, query, tags, limit, _serverRepo);
}

/** getPreferenceContext bound to the server repository */
export function getPreferenceContext(orgSlug: string) {
  return _getPreferenceContext(orgSlug, _serverRepo);
}

// ── Re-export types and pure helpers (safe to re-export from server barrel) ───

export type {
  MemoryEntry,
  MemoryContext,
  MemoryType,
  MemoryScope,
  MemoryImportance,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
}                                           from "./memory-types";
export { importanceAtLeast }                from "./memory-types";
export type { MemoryRepository }            from "./memory-repository";
export type { MemoryStoreResult }           from "./strategic-memory-manager";
