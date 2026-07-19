/**
 * lib/copilot/insights/insight-engine.ts
 *
 * Agentik Copilot — Insight Engine
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Primary entry point for the Insights layer.
 *
 * Pipeline:
 *   1. generateInsights(input)  → raw CopilotInsight[]
 *   2. rankInsights(raw, ctx)   → sorted CopilotInsight[]
 *   3. groupInsights(ranked)    → InsightGroup[]
 *   4. Return InsightEngineResult
 *
 * Contract:
 *   - Input:  CopilotRuntimeSnapshot + optional signals + optional suggestion refs
 *   - Output: InsightEngineResult (insights + groups + meta)
 *   - Pure:   no side effects, no I/O, fully deterministic
 *
 * Usage:
 *   const snapshot  = buildRuntimeSnapshot(input);
 *   const result    = generateInsights({ snapshot });
 *
 *   // With signals:
 *   const result    = generateInsights({ snapshot, signals: detectedSignals });
 *
 *   // With suggestion linkage:
 *   const result    = generateInsights({ snapshot, signals, suggestions: suggestionRefs });
 */

import type { CopilotRuntimeSnapshot }   from "../runtime/runtime-snapshot";
import type { InsightSignal, SuggestionRef, InsightEngineResult } from "./insight-types";
import { generateInsights as generate }  from "./insight-generator";
import { rankInsights }                  from "./insight-ranking";
import { groupInsights }                 from "./insight-groups";
import { getTotalSignalCount }           from "./insight-signal-registry";
import { getTotalInsightTemplateCount }  from "./insight-registry";

// ── Engine input ──────────────────────────────────────────────────────────────

export interface InsightEngineInput {
  snapshot:     CopilotRuntimeSnapshot;
  suggestions?: SuggestionRef[];
  signals?:     InsightSignal[];
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Generates a complete set of contextual insights from a runtime snapshot.
 *
 * @param input - Snapshot + optional signals + optional suggestion references
 * @returns InsightEngineResult with insights, groups, and metadata
 */
export function generateInsights(input: InsightEngineInput): InsightEngineResult {
  const { snapshot, suggestions = [], signals = [] } = input;

  // 1. Generate raw insights
  const raw = generate({ snapshot, suggestions, signals });

  // 2. Rank by composite score
  const ranked = rankInsights(raw, snapshot.context);

  // 3. Group into sections
  const groupedInsights = groupInsights(ranked);

  // 4. Assemble result
  return {
    insights: ranked,
    groupedInsights,
    meta: {
      totalInsights:  ranked.length,
      totalGroups:    groupedInsights.filter(g => g.insights.length > 0).length,
      leadAgent:      snapshot.context.leadAgent?.id ?? null,
      activeDomains:  snapshot.context.domains,
      signalCount:    signals.length,
      snapshotId:     snapshot.snapshotId,
      generatedAt:    new Date(),
    },
  };
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Returns registry statistics for debugging and validation.
 */
export function getInsightRegistryStats(): {
  totalSignals:    number;
  totalTemplates:  number;
  insightTypes:    string[];
  severities:      string[];
  groups:          string[];
  externalDeps:    number;
} {
  return {
    totalSignals:   getTotalSignalCount(),
    totalTemplates: getTotalInsightTemplateCount(),
    insightTypes:   [
      "observation", "anomaly", "opportunity", "risk",
      "trend", "alert", "explanation", "summary",
    ],
    severities:     ["critical", "high", "medium", "low", "info"],
    groups:         ["attention", "risks", "summary", "opportunities", "explanation"],
    externalDeps:   0,
  };
}
