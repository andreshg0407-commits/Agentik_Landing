/**
 * lib/copilot/executive-brain/executive-brain-service.ts
 *
 * Agentik — Executive Brain — Service
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Main orchestration service for the Executive Brain layer.
 * Coordinates signal collection, ranking, insight generation, and audit logging
 * into a single buildExecutiveContext() call.
 *
 * Implements ExecutiveBrainProvider.
 *
 * Pure domain. No Prisma. No server-only. No React.
 * All errors are caught internally — never throws.
 */

import type {
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveContext,
  ExecutiveBrainInput,
  ExecutiveBrainOptions,
} from "./executive-brain-types";
import type { ExecutiveBrainProvider }   from "./executive-brain-provider";
import { collectAllSignals }             from "./executive-signal-collector";
import { rankSignals, countBySeverity }  from "./executive-signal-ranking";
import { generateExecutiveInsights }     from "./executive-insight-generator";
import {
  globalExecutiveAuditLog,
  auditSignalsCollected,
  auditSignalsRanked,
  auditInsightsGenerated,
  auditContextBuilt,
}                                        from "./executive-audit";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIGNALS  = 20;
const DEFAULT_MAX_INSIGHTS = 10;

// ── Service ───────────────────────────────────────────────────────────────────

export class ExecutiveBrainService implements ExecutiveBrainProvider {

  // ── collectSignals ────────────────────────────────────────────────────────

  async collectSignals(
    input:    ExecutiveBrainInput,
    _options?: ExecutiveBrainOptions,
  ): Promise<ExecutiveSignal[]> {
    try {
      const signals = collectAllSignals(input);
      const sources = [
        ...(input.memoryEntries && input.memoryEntries.length > 0 ? ["memory"] : []),
        ...(input.playbooks && input.playbooks.length > 0         ? ["playbooks"] : []),
        "strategic",
      ];
      globalExecutiveAuditLog.push(auditSignalsCollected(input.orgSlug, signals.length, sources));
      return signals;
    } catch {
      return [];
    }
  }

  // ── generateInsights ──────────────────────────────────────────────────────

  async generateInsights(
    signals:   ExecutiveSignal[],
    orgSlug:   string,
    options?:  ExecutiveBrainOptions,
  ): Promise<ExecutiveInsight[]> {
    try {
      const maxInsights = options?.maxInsights ?? DEFAULT_MAX_INSIGHTS;
      const insights    = generateExecutiveInsights(signals).slice(0, maxInsights);
      globalExecutiveAuditLog.push(auditInsightsGenerated(orgSlug, insights.length, signals.length));
      return insights;
    } catch {
      return [];
    }
  }

  // ── buildContext ──────────────────────────────────────────────────────────

  async buildContext(
    input:   ExecutiveBrainInput,
    options?: ExecutiveBrainOptions,
  ): Promise<ExecutiveContext> {
    const startedAt   = Date.now();
    const maxSignals  = options?.maxSignals  ?? DEFAULT_MAX_SIGNALS;
    const maxInsights = options?.maxInsights ?? DEFAULT_MAX_INSIGHTS;

    try {
      // Step 1: Collect
      const rawSignals = collectAllSignals(input);
      const sources = [
        ...(input.memoryEntries && input.memoryEntries.length > 0 ? ["memory"] : []),
        ...(input.playbooks && input.playbooks.length > 0         ? ["playbooks"] : []),
        "strategic",
      ];
      globalExecutiveAuditLog.push(auditSignalsCollected(input.orgSlug, rawSignals.length, sources));

      // Step 2: Rank
      const rankedSignals  = rankSignals(rawSignals, maxSignals);
      const severityCounts = countBySeverity(rankedSignals);
      globalExecutiveAuditLog.push(auditSignalsRanked(
        input.orgSlug,
        rawSignals.length,
        rankedSignals.length,
        severityCounts.CRITICAL,
        severityCounts.HIGH,
      ));

      // Step 3: Insights
      const insights = generateExecutiveInsights(rankedSignals).slice(0, maxInsights);
      globalExecutiveAuditLog.push(auditInsightsGenerated(input.orgSlug, insights.length, rankedSignals.length));

      // Step 4: Assemble
      const ctx: ExecutiveContext = {
        orgSlug:     input.orgSlug,
        signals:     rankedSignals,
        insights,
        generatedAt: new Date().toISOString(),
      };

      globalExecutiveAuditLog.push(auditContextBuilt(
        input.orgSlug,
        rankedSignals.length,
        insights.length,
        Date.now() - startedAt,
      ));

      return ctx;

    } catch {
      // Never throw — return empty context on any failure
      const ctx: ExecutiveContext = {
        orgSlug:     input.orgSlug,
        signals:     [],
        insights:    [],
        generatedAt: new Date().toISOString(),
      };
      globalExecutiveAuditLog.push(auditContextBuilt(input.orgSlug, 0, 0, Date.now() - startedAt));
      return ctx;
    }
  }
}

// ── Default service singleton ─────────────────────────────────────────────────

/**
 * Process-level ExecutiveBrainService singleton.
 * Shared across the Copilot intelligence pipeline.
 */
export const defaultExecutiveBrainService = new ExecutiveBrainService();
