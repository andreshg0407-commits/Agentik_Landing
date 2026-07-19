/**
 * lib/copilot/insights/index.ts
 *
 * Agentik Copilot — Insight Layer Public API
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Single import point for the entire Insights layer.
 *
 * Usage:
 *   import { generateInsights, getInsightRegistryStats } from "@/lib/copilot/insights"
 *
 * Architecture:
 *   Runtime Snapshot → Generator → Ranker → Grouper → InsightEngineResult
 *
 * Layer contract:
 *   - Consumes: lib/copilot/runtime/* (via CopilotRuntimeSnapshot)
 *   - Produces:  InsightEngineResult
 *   - Never calls DB, SAG, LLM, or external APIs
 *   - Fully deterministic
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  InsightType,
  InsightSeverity,
  InsightSource,
  InsightStatus,
  InsightGroupKey,
  InsightEvidence,
  InsightMetric,
  InsightSignal,
  InsightTimeframe,
  InsightRecommendationLink,
  CopilotInsight,
  InsightGroup,
  InsightEngineResult,
  SuggestionRef,
} from "./insight-types";

// ── Signal registry ───────────────────────────────────────────────────────────
export {
  SIGNAL_REGISTRY,
  getSignal,
  getAllSignals,
  getSignalsForDomain,
  getTotalSignalCount,
  type SignalId,
  type BusinessSignal,
} from "./insight-signal-registry";

// ── Insight registry ──────────────────────────────────────────────────────────
export {
  INSIGHT_REGISTRY,
  getInsightTemplates,
  getTotalInsightTemplateCount,
  type InsightTemplate,
} from "./insight-registry";

// ── Generator ─────────────────────────────────────────────────────────────────
export {
  generateInsights as generateRawInsights,
  type InsightGeneratorInput,
} from "./insight-generator";

// ── Ranking ───────────────────────────────────────────────────────────────────
export {
  rankInsights,
  filterBySeverity,
  filterByConfidence,
  getTopInsights,
} from "./insight-ranking";

// ── Groups ────────────────────────────────────────────────────────────────────
export {
  groupInsights,
  getInsightGroup,
  countGroupedInsights,
  getNonEmptyInsightGroups,
} from "./insight-groups";

// ── Engine (main entry point) ─────────────────────────────────────────────────
export {
  generateInsights,
  getInsightRegistryStats,
  type InsightEngineInput,
} from "./insight-engine";
