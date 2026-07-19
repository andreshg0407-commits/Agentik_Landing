/**
 * lib/copilot/executive-brain/server.ts
 *
 * Agentik — Executive Brain — Server-Only Barrel
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Server-side entry point for the Executive Brain layer.
 * Exports everything needed from server code:
 *   - The ExecutiveBrainService singleton
 *   - All collection, ranking, and generation functions
 *   - The global audit log
 *   - The context builder and summary
 *
 * SERVER-ONLY — never import from client components or pure-domain code.
 * Client-safe imports use lib/copilot/executive-brain/index.ts instead.
 */
import "server-only";

// ── Service ───────────────────────────────────────────────────────────────────

export {
  ExecutiveBrainService,
  defaultExecutiveBrainService,
}                                         from "./executive-brain-service";

// ── Collector ─────────────────────────────────────────────────────────────────

export {
  collectMemorySignals,
  collectPlaybookSignals,
  collectStrategicSignals,
  collectAllSignals,
}                                         from "./executive-signal-collector";

// ── Ranking ───────────────────────────────────────────────────────────────────

export {
  rankSignals,
  compareSignals,
  countBySeverity,
  highestSeverity,
  filterBySeverity,
}                                         from "./executive-signal-ranking";

// ── Insight generator ─────────────────────────────────────────────────────────

export { generateExecutiveInsights }     from "./executive-insight-generator";

// ── Context builder ───────────────────────────────────────────────────────────

export {
  buildExecutiveContext,
  isContextNonEmpty,
}                                         from "./executive-context-builder";

// ── Priority engine ───────────────────────────────────────────────────────────

export { calculateExecutivePriority }    from "./executive-priority-engine";

// ── Context summary ───────────────────────────────────────────────────────────

export {
  buildExecutiveSummary,
  buildExecutiveHeadline,
}                                         from "./executive-context-summary";

// ── Audit ─────────────────────────────────────────────────────────────────────

export { globalExecutiveAuditLog }       from "./executive-audit";

// ── Re-export all types ───────────────────────────────────────────────────────

export type {
  ExecutiveSignalSeverity,
  ExecutiveSignalDirection,
  ExecutiveSignalCategory,
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveContext,
  ExecutiveBrainInput,
  ExecutiveBrainOptions,
}                                         from "./executive-brain-types";

export type { ExecutiveBrainProvider }   from "./executive-brain-provider";
export type { SignalRegistryEntry }      from "./executive-signal-registry";
export {
  SIGNAL_REGISTRY,
  getSignalEntry,
}                                         from "./executive-signal-registry";
