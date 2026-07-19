/**
 * lib/copilot/executive-brain/index.ts
 *
 * Agentik — Executive Brain — Client-Safe Barrel
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Public API for client-safe code (React components, shared types, UI utilities).
 *
 * Exports ONLY:
 *   - Domain types (ExecutiveSignal, ExecutiveInsight, ExecutiveContext, etc.)
 *   - Pure helper functions (sortSignalsByPriority, etc.)
 *   - Registry types and lookup helpers (read-only catalog)
 *   - Priority engine (pure function, no external deps)
 *   - Audit event types (for display only — no write operations)
 *   - Context summary functions (pure text composition)
 *   - Provider interface (contract only)
 *
 * NEVER exports:
 *   - ExecutiveBrainService (server runtime with audit side-effects)
 *   - globalExecutiveAuditLog (server-side accumulator)
 *   - Signal collector, ranking, insight generator as live imports (stateful)
 *   - Any file containing import "server-only"
 *   - Any file that imports from @prisma/client or lib/prisma
 */

// ── Domain types ──────────────────────────────────────────────────────────────

export type {
  ExecutiveSignalSeverity,
  ExecutiveSignalDirection,
  ExecutiveSignalCategory,
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveContext,
  ExecutiveBrainInput,
  ExecutiveBrainOptions,
}                                        from "./executive-brain-types";

export {
  EXECUTIVE_SEVERITY_RANK,
  sortSignalsByPriority,
  sortInsightsByPriority,
}                                        from "./executive-brain-types";

// ── Provider interface (contract only) ────────────────────────────────────────

export type { ExecutiveBrainProvider }   from "./executive-brain-provider";

// ── Signal registry (read-only catalog) ──────────────────────────────────────

export type { SignalRegistryEntry }      from "./executive-signal-registry";
export {
  SIGNAL_REGISTRY,
  getSignalEntry,
  getSignalsByCategory,
  getSignalsBySeverity,
}                                        from "./executive-signal-registry";

// ── Audit event types (read-only display) ─────────────────────────────────────

export type {
  ExecutiveAuditEvent,
  ExecutiveAuditEventType,
}                                        from "./executive-audit";

// ── Priority engine (pure function) ───────────────────────────────────────────

export { calculateExecutivePriority }   from "./executive-priority-engine";

// ── Context summary (pure text composition) ───────────────────────────────────

export {
  buildExecutiveSummary,
  buildExecutiveHeadline,
}                                        from "./executive-context-summary";

// ── Context builder helpers (pure, no IO) ────────────────────────────────────

export { isContextNonEmpty }            from "./executive-context-builder";

// ── Ranking helpers (pure) ────────────────────────────────────────────────────

export {
  compareSignals,
  countBySeverity,
  highestSeverity,
  filterBySeverity,
}                                        from "./executive-signal-ranking";
