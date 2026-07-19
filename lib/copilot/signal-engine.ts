/**
 * lib/copilot/signal-engine.ts
 *
 * Signal Engine V1 — Orchestrates the 4 signal rules.
 *
 * Public API:
 *   evaluateAllSignals(orgId, orgSlug)          → SignalEngineResult
 *   evaluateModuleSignals(orgId, orgSlug, module) → filtered SignalEngineResult
 *
 * Execution model:
 *   - All 4 rules run in parallel (Promise.allSettled)
 *   - Failed rules are captured in degradedRules (do not crash the engine)
 *   - Session cooldown is applied before returning signals
 *   - Signals are sorted by severity: critica → elevada → vigilancia → informativa
 *
 * Server-side only: imports Prisma via signal rules. Never import in client components.
 */

import { evaluateBudgetVelocity }        from "@/lib/copilot/signal-rules/budget-velocity";
import { evaluateTreasuryCoverage }      from "@/lib/copilot/signal-rules/treasury-coverage";
import { evaluateFinancialCloseBlocked } from "@/lib/copilot/signal-rules/financial-close-blocked";
import { evaluateReconciliationCritical } from "@/lib/copilot/signal-rules/reconciliation-critical";
import { isInCooldown, markShown }       from "@/lib/copilot/session-cooldown";
import type {
  CopilotSignal,
  CopilotSignalId,
  CopilotRuntime,
  CopilotRuntimeState,
  SignalEngineResult,
  SignalTargetModule,
  SignalSeverity,
} from "@/lib/copilot/types";

// ── Severity ordering ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  critica:     0,
  elevada:     1,
  vigilancia:  2,
  informativa: 3,
};

function sortByPriority(signals: CopilotSignal[]): CopilotSignal[] {
  return [...signals].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

// ── Runtime state derivation ───────────────────────────────────────────────────

function deriveRuntimeState(
  degradedRules: CopilotSignalId[],
  signalCount: number,
): CopilotRuntimeState {
  if (degradedRules.length === 4) return "DEGRADED";
  if (degradedRules.length > 0)  return "DEGRADED";
  if (signalCount === 0)          return "HEALTHY";
  return "HEALTHY";
}

// ── Main evaluation ────────────────────────────────────────────────────────────

export interface EvaluateOptions {
  /**
   * When true, session cooldown is bypassed and signals are NOT marked as shown.
   * Use for permanent displays (right rail) that should always reflect current state.
   * Default: false (applies cooldown — for contextual module slots).
   */
  bypassCooldown?: boolean;
}

export async function evaluateAllSignals(
  orgId: string,
  orgSlug: string,
  options: EvaluateOptions = {},
): Promise<SignalEngineResult> {
  const evaluatedAt = new Date();

  const [r1, r2, r3, r4] = await Promise.allSettled([
    evaluateBudgetVelocity(orgId, orgSlug),
    evaluateTreasuryCoverage(orgId, orgSlug),
    evaluateFinancialCloseBlocked(orgId, orgSlug),
    evaluateReconciliationCritical(orgId, orgSlug),
  ]);

  const ruleIds: CopilotSignalId[] = [
    "budget.velocity_exceeded",
    "treasury.low_coverage",
    "financial_close.blocked",
    "reconciliation.pending_critical",
  ];
  const results = [r1, r2, r3, r4];

  const degradedRules: CopilotSignalId[] = [];
  const rawSignals: CopilotSignal[]      = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const ruleId = ruleIds[i];

    if (result.status === "rejected") {
      console.error(
        `[copilot] signal rule ${ruleId} failed:`,
        result.reason,
      );
      degradedRules.push(ruleId);
      continue;
    }

    if (result.value !== null) {
      rawSignals.push(result.value);
    }
  }

  // ── Apply session cooldown (skipped for permanent displays like the right rail) ─
  const filteredSignals: CopilotSignal[] = [];
  if (options.bypassCooldown) {
    filteredSignals.push(...rawSignals);
  } else {
    for (const signal of rawSignals) {
      if (!isInCooldown(orgId, signal.ruleId)) {
        filteredSignals.push(signal);
        markShown(orgId, signal.ruleId);
      }
    }
  }

  const sortedSignals = sortByPriority(filteredSignals);

  const runtime: CopilotRuntime = {
    state:            deriveRuntimeState(degradedRules, sortedSignals.length),
    lastEvaluatedAt:  evaluatedAt,
    activeSignals:    sortedSignals.length,
    staleRules:       [],
    degradedRules,
  };

  return { signals: sortedSignals, runtime, evaluatedAt };
}

// ── Module-filtered evaluation ─────────────────────────────────────────────────

export async function evaluateModuleSignals(
  orgId: string,
  orgSlug: string,
  module: SignalTargetModule,
): Promise<SignalEngineResult> {
  const result = await evaluateAllSignals(orgId, orgSlug);
  return {
    ...result,
    signals: result.signals.filter((s) => s.targetModule === module),
  };
}
