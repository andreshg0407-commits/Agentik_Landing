/**
 * lib/copilot/suggestions/index.ts
 *
 * Agentik Copilot — Suggestion Layer Public API
 * Sprint: AGENTIK-COPILOT-SUGGESTIONS-01
 *
 * Single import point for the entire suggestion layer.
 *
 * Usage:
 *   import { generateSuggestions, getSuggestionRegistryStats } from "@/lib/copilot/suggestions"
 *
 * Architecture:
 *   Runtime Snapshot → Generator → Ranker → Grouper → SuggestionEngineResult
 *
 * Layer contract:
 *   - Consumes: lib/copilot/runtime/* (via CopilotRuntimeSnapshot)
 *   - Produces:  SuggestionEngineResult
 *   - Never calls DB, SAG, LLM, or external APIs
 *   - Fully deterministic
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  SuggestionPriority,
  SuggestionCategory,
  SuggestionSource,
  SuggestionGroupKey,
  CopilotSuggestion,
  SuggestionGroup,
  SuggestionEngineResult,
} from "./suggestion-types";

// ── Registry ──────────────────────────────────────────────────────────────────
export {
  SUGGESTION_REGISTRY,
  getTemplatesForCapability,
  getTotalRegisteredTemplates,
  type SuggestionTemplate,
} from "./suggestion-registry";

// ── Generator ─────────────────────────────────────────────────────────────────
export { generateSuggestions as generateRawSuggestions } from "./suggestion-generator";

// ── Ranking ───────────────────────────────────────────────────────────────────
export {
  rankSuggestions,
  filterByMinPriority,
  getTopN,
} from "./suggestion-ranking";

// ── Groups ────────────────────────────────────────────────────────────────────
export {
  groupSuggestions,
  getGroup,
  countGrouped,
  getNonEmptyGroups,
} from "./suggestion-groups";

// ── Engine (main entry point) ─────────────────────────────────────────────────
export {
  generateSuggestions,
  getSuggestionRegistryStats,
} from "./suggestion-engine";
