/**
 * lib/copilot/playbooks/server.ts
 *
 * Agentik — Copilot Playbooks — Server-Only Barrel
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Server-side entry point for the Copilot Playbooks layer.
 * Exports everything needed to use playbooks from server code:
 *   - The default in-memory repository singleton
 *   - The StrategicPlaybookManager (with audit + tenant isolation)
 *   - All retrieval helpers
 *   - All summary builders
 *
 * SERVER-ONLY — never import from client components or pure-domain code.
 * Client-safe imports use lib/copilot/playbooks/index.ts instead.
 *
 * NOTE: When AGENTIK-COPILOT-PLAYBOOKS-PERSIST-01 lands, this barrel will be
 * updated to export a PrismaPlaybookRepository alongside the in-memory one.
 */
import "server-only";

// ── Repository ────────────────────────────────────────────────────────────────

export {
  InMemoryPlaybookRepository,
  defaultPlaybookRepository,
}                                        from "./in-memory-playbook-repository";

// ── Manager ───────────────────────────────────────────────────────────────────

export {
  StrategicPlaybookManager,
  defaultPlaybookManager,
}                                        from "./strategic-playbook-manager";

export type { PlaybookCreateResult }     from "./strategic-playbook-manager";

// ── Retrieval ─────────────────────────────────────────────────────────────────

export {
  getRelevantPlaybooks,
  getCategoryPlaybooks,
  getExecutivePlaybooks,
  searchPlaybooks,
}                                        from "./playbook-retrieval";

// ── Summary builders ──────────────────────────────────────────────────────────

export {
  buildPlaybookContextSummary,
  buildPlaybookSummary,
  buildExecutivePlaybookSummary,
  buildOperationalPlaybookSummary,
}                                        from "./playbook-summary";

export type { PlaybookSummary }          from "./playbook-summary";

// ── Audit ─────────────────────────────────────────────────────────────────────

export { globalPlaybookAuditLog }        from "./playbook-audit";

// ── Re-export all types (safe to re-export from server barrel) ────────────────

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
}                                        from "./playbook-types";

export {
  priorityAtLeast,
  sortByPriorityThenDate,
}                                        from "./playbook-types";

export type { PlaybookRepository }       from "./playbook-repository";
