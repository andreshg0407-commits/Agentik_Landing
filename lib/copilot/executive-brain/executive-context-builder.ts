/**
 * lib/copilot/executive-brain/executive-context-builder.ts
 *
 * Agentik — Executive Brain — Context Builder
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Orchestrates the full Executive Brain pipeline:
 *   collectAllSignals → rankSignals → generateExecutiveInsights → ExecutiveContext
 *
 * Pure domain. No Prisma. No server-only. No React. No AI.
 */

import type {
  ExecutiveContext,
  ExecutiveBrainInput,
  ExecutiveBrainOptions,
} from "./executive-brain-types";
import { collectAllSignals }         from "./executive-signal-collector";
import { rankSignals }               from "./executive-signal-ranking";
import { generateExecutiveInsights } from "./executive-insight-generator";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIGNALS  = 20;
const DEFAULT_MAX_INSIGHTS = 10;

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the full ExecutiveContext from an ExecutiveBrainInput.
 *
 * Pipeline:
 *   1. Collect signals from memory + playbooks + strategic patterns
 *   2. Rank signals (CRITICAL first, then by confidence)
 *   3. Generate insights from ranked signals
 *   4. Assemble and return ExecutiveContext
 *
 * Always returns a valid ExecutiveContext — never throws.
 * On any internal error, returns an empty context.
 */
export function buildExecutiveContext(
  input:   ExecutiveBrainInput,
  options?: ExecutiveBrainOptions,
): ExecutiveContext {
  const maxSignals  = options?.maxSignals  ?? DEFAULT_MAX_SIGNALS;
  const maxInsights = options?.maxInsights ?? DEFAULT_MAX_INSIGHTS;

  try {
    // Step 1: Collect
    const rawSignals   = collectAllSignals(input);

    // Step 2: Rank
    const rankedSignals = rankSignals(rawSignals, maxSignals);

    // Step 3: Insights
    const insights = generateExecutiveInsights(rankedSignals).slice(0, maxInsights);

    return {
      orgSlug:     input.orgSlug,
      signals:     rankedSignals,
      insights,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    // Never throw — return empty context on failure
    return {
      orgSlug:     input.orgSlug,
      signals:     [],
      insights:    [],
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Returns true if an ExecutiveContext has any actionable content (non-empty signals or insights).
 */
export function isContextNonEmpty(ctx: ExecutiveContext): boolean {
  return ctx.signals.length > 0 || ctx.insights.length > 0;
}
