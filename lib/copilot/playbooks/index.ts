/**
 * lib/copilot/playbooks/index.ts
 *
 * Agentik — Copilot Playbooks — Client-Safe Barrel
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Public API for client-safe code (React components, shared types, UI utilities).
 *
 * Exports ONLY:
 *   - Domain types (Playbook, PlaybookContext, etc.)
 *   - Pure helper functions (priorityAtLeast, sortByPriorityThenDate, etc.)
 *   - Classifier helpers (inferPlaybookCategory, inferPlaybookPriority)
 *   - Repository interface contract (no implementation)
 *   - Audit event types (for display only)
 *
 * NEVER exports:
 *   - InMemoryPlaybookRepository (runtime state)
 *   - StrategicPlaybookManager (server runtime)
 *   - Retrieval functions (depend on repository instances)
 *   - Summary builders (depend on repository instances)
 *   - Any file that contains import "server-only"
 *   - Any file that imports from @prisma/client or lib/prisma
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type {
  PlaybookCategory,
  PlaybookPriority,
  PlaybookStatus,
  PlaybookStep,
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookSearchOptions,
  PlaybookContext,
}                                       from "./playbook-types";

export {
  PLAYBOOK_PRIORITY_RANK,
  priorityAtLeast,
  sortByPriorityThenDate,
}                                       from "./playbook-types";

// ── Repository interface (contract only — no implementation) ──────────────────

export type { PlaybookRepository }     from "./playbook-repository";

// ── Classifier (pure — no Prisma, no server-only) ─────────────────────────────

export {
  inferPlaybookCategory,
  inferPlaybookPriority,
  getCategoryKeywords,
  getPriorityKeywords,
}                                       from "./playbook-classifier";

// ── Audit event types (read-only display) ─────────────────────────────────────

export type {
  PlaybookAuditEvent,
  PlaybookAuditEventType,
}                                       from "./playbook-audit";

// ── Summary result type ───────────────────────────────────────────────────────

export type { PlaybookSummary }        from "./playbook-summary";

// ── Manager result type ───────────────────────────────────────────────────────

export type { PlaybookCreateResult }   from "./strategic-playbook-manager";
