/**
 * lib/copilot/memory/index.ts
 *
 * Agentik — Copilot Memory Engine — Client-Safe Barrel
 * Sprint: AGENTIK-COPILOT-MEMORY-PERSISTENCE-01
 *
 * Public API for client-safe code (React components, client utilities, shared types).
 *
 * Exports ONLY:
 *   - Domain types (MemoryEntry, MemoryContext, etc.)
 *   - Pure helper functions (importanceAtLeast, classifyMemory, etc.)
 *   - Classifier and summary helpers
 *   - Repository interface contract (no implementation)
 *   - Audit log types (for display only)
 *
 * NEVER exports:
 *   - PrismaMemoryRepository or prismaMemoryRepository
 *   - getServerMemoryRepository / memory-repository-resolver
 *   - serverMemoryManager / StrategicMemoryManager (server runtime)
 *   - Any file that contains import "server-only"
 *   - Any file that imports from @prisma/client or lib/prisma
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type {
  MemoryEntry,
  MemoryContext,
  MemoryType,
  MemoryScope,
  MemoryImportance,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
}                           from "./memory-types";

export { importanceAtLeast } from "./memory-types";

// ── Repository interface (contract only — no implementation) ──────────────────

export type { MemoryRepository } from "./memory-repository";

// ── Classifier (pure — no Prisma, no server-only) ─────────────────────────────

export {
  classifyMemory,
  shouldStoreMemory,
}                           from "./memory-classifier";

// ── Summary helpers (pure — no Prisma, no server-only) ───────────────────────

export type { MemorySummary }     from "./memory-summary";

// ── Audit types (read-only display — no write operations) ────────────────────

export type {
  MemoryAuditEvent,
  MemoryAuditEventType,
}                           from "./memory-audit";
