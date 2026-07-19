/**
 * lib/agent-intelligence/index.ts
 *
 * Agentik Runtime Intelligence — Public Barrel Export
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  InsightType,
  InsightSeverity,
  BlockerType,
  RuntimeInsight,
  RuntimeBlocker,
  CoordinationRecommendation,
  DetectedPattern,
  OrphanDecision,
  RuntimeIntelligenceReport,
  ExecutiveRuntimeInsight,
} from "./runtime-intelligence-types";

export { insightId, blockerId, coordId } from "./runtime-intelligence-types";

// ── Priority engine ───────────────────────────────────────────────────────────

export { buildRuntimePriorities } from "./runtime-priority-engine";

// ── Blocker engine ────────────────────────────────────────────────────────────

export { detectRuntimeBlockers } from "./runtime-blocker-engine";

// ── Coordination engine ───────────────────────────────────────────────────────

export { buildCoordinationRecommendations } from "./runtime-coordination-engine";

// ── Intelligence engine (main) ────────────────────────────────────────────────

export {
  generateRuntimeIntelligence,
  detectRepeatedPatterns,
  detectUnresolvedChains,
  detectCrossModuleImpact,
  detectOrphanDecisions,
  deriveExecutiveRuntimeInsight,
} from "./runtime-intelligence-engine";
