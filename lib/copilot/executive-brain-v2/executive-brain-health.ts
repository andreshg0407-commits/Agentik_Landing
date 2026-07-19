// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 28 — Executive Brain Health
import "server-only";

import type { ExecutiveBrainV2Result, ExecutiveContext } from "./executive-brain-types";

export type ExecutiveBrainHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ExecutiveBrainHealth {
  readonly orgSlug: string;
  readonly status: ExecutiveBrainHealthStatus;
  readonly score: number; // 0–1
  readonly signals: string[];
  readonly lastRunAt?: string;
  readonly checkedAt: string;
}

export function checkExecutiveBrainHealth(
  orgSlug: string,
  lastResult?: ExecutiveBrainV2Result,
  context?: ExecutiveContext
): ExecutiveBrainHealth {
  const signals: string[] = [];
  let score = 1.0;

  if (!lastResult) {
    signals.push("NO_RUN_AVAILABLE");
    score -= 0.4;
  } else if (lastResult.status === "FAILED") {
    signals.push("LAST_RUN_FAILED");
    score -= 0.5;
  } else if (lastResult.status === "PARTIAL") {
    signals.push("LAST_RUN_PARTIAL");
    score -= 0.2;
  }

  if (context) {
    if (context.priorities.length === 0) {
      signals.push("NO_PRIORITIES_COMPUTED");
      score -= 0.2;
    }
    if (context.executiveScore < 0.2) {
      signals.push("EXECUTIVE_SCORE_CRITICAL");
      score -= 0.1;
    }
  }

  const finalScore = Math.max(0, Math.round(score * 100) / 100);
  const status: ExecutiveBrainHealthStatus =
    finalScore >= 0.7 ? "HEALTHY" :
    finalScore >= 0.3 ? "DEGRADED" :
    "UNAVAILABLE";

  return {
    orgSlug,
    status,
    score: finalScore,
    signals,
    lastRunAt: lastResult?.completedAt,
    checkedAt: new Date().toISOString(),
  };
}
