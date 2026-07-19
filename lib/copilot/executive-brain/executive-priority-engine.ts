/**
 * lib/copilot/executive-brain/executive-priority-engine.ts
 *
 * Agentik — Executive Brain — Priority Engine
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Calculates the executive priority for a Copilot request based on
 * the ExecutiveContext and the user's intent.
 *
 * Rules (deterministic, no AI):
 *   - Any CRITICAL insight → CRITICAL
 *   - 2+ HIGH insights → HIGH
 *   - 1 HIGH insight, or COLLECTIONS/FINANCE intent with signals → HIGH
 *   - Signals present but below HIGH → MEDIUM
 *   - No signals or empty context → MEDIUM (default)
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { ExecutiveContext }     from "./executive-brain-types";
import { EXECUTIVE_SEVERITY_RANK }   from "./executive-brain-types";
import type { CopilotPlanPriority }  from "../memory-planning/memory-planning-types";

// ── Priority rules ────────────────────────────────────────────────────────────

const HIGH_PRIORITY_INTENTS = new Set(["FINANCE", "COLLECTIONS", "MULTI_DOMAIN"]);

/**
 * Calculate the executive priority from the ExecutiveContext and intent.
 *
 * Output maps to CopilotPlanPriority (same scale as memory-aware planning).
 */
export function calculateExecutivePriority(
  intent:  string,
  context: ExecutiveContext | undefined,
): CopilotPlanPriority {
  if (!context || (context.signals.length === 0 && context.insights.length === 0)) {
    return "MEDIUM";
  }

  const insights = context.insights;
  const signals  = context.signals;

  // Rule 1: Any CRITICAL insight → CRITICAL
  const hasCriticalInsight = insights.some(i => i.priority === "CRITICAL");
  if (hasCriticalInsight) return "CRITICAL";

  // Rule 2: Any CRITICAL signal → CRITICAL
  const hasCriticalSignal = signals.some(s => s.severity === "CRITICAL");
  if (hasCriticalSignal) return "CRITICAL";

  // Rule 3: 2+ HIGH insights → HIGH
  const highInsights = insights.filter(i => EXECUTIVE_SEVERITY_RANK[i.priority] >= EXECUTIVE_SEVERITY_RANK["HIGH"]);
  if (highInsights.length >= 2) return "HIGH";

  // Rule 4: 1 HIGH insight + high-stakes intent → HIGH
  if (highInsights.length >= 1 && HIGH_PRIORITY_INTENTS.has(intent.toUpperCase())) return "HIGH";

  // Rule 5: 1 HIGH signal → HIGH
  const highSignals = signals.filter(s => s.severity === "HIGH");
  if (highSignals.length >= 1 && HIGH_PRIORITY_INTENTS.has(intent.toUpperCase())) return "HIGH";
  if (highSignals.length >= 3) return "HIGH";

  // Rule 6: Signals present but below HIGH threshold → MEDIUM
  if (signals.length > 0) return "MEDIUM";

  return "MEDIUM";
}
