/**
 * lib/copilot/executive-brain/executive-brain-provider.ts
 *
 * Agentik — Executive Brain — Provider Contract
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Pure interface contract for the Executive Brain.
 * No implementation. No Prisma. No server-only.
 *
 * Future implementations may include:
 *   - ML-based signal scoring (AGENTIK-EXECUTIVE-BRAIN-ML-01)
 *   - Real-time data connectors (AGENTIK-EXECUTIVE-BRAIN-REALTIME-01)
 *   - External financial data providers
 */

import type {
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveContext,
  ExecutiveBrainInput,
  ExecutiveBrainOptions,
} from "./executive-brain-types";

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * ExecutiveBrainProvider — contract for executive intelligence providers.
 *
 * All methods are async. All methods NEVER throw — return empty arrays/contexts on failure.
 */
export interface ExecutiveBrainProvider {
  /**
   * Collect raw executive signals from available context (memory, playbooks, etc.).
   * Returns an empty array if no signals can be extracted.
   */
  collectSignals(input: ExecutiveBrainInput, options?: ExecutiveBrainOptions): Promise<ExecutiveSignal[]>;

  /**
   * Generate executive insights from ranked signals.
   * Insights are human-readable observations derived from signal groupings.
   * Returns an empty array if no insights can be generated.
   */
  generateInsights(signals: ExecutiveSignal[], orgSlug: string, options?: ExecutiveBrainOptions): Promise<ExecutiveInsight[]>;

  /**
   * Build the full ExecutiveContext from input context.
   * Orchestrates: collect → rank → insights → context.
   * Always returns a valid ExecutiveContext (may be empty but never null).
   */
  buildContext(input: ExecutiveBrainInput, options?: ExecutiveBrainOptions): Promise<ExecutiveContext>;
}
