/**
 * lib/copilot/memory-planning/copilot-plan-priority.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Plan Priority Calculator
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * Calculates CopilotPlanPriority from intent + memory signals.
 * Deterministic. No AI. No external calls.
 *
 * Priority rules (highest-wins):
 *   CRITICAL  — Any CRITICAL-strength signal present.
 *   HIGH      — Any ESCALATE_ATTENTION signal, OR any HIGH-strength signal.
 *   MEDIUM    — Default. Applies when signals present but none exceed HIGH.
 *   LOW       — Explicitly low priority (no signals, GENERAL intent).
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotPlanPriority, MemoryPlanningSignal } from "./memory-planning-types";
import type { CopilotIntent } from "../copilot-types";

// Re-export for consumers that import priority type from this file
export type { CopilotPlanPriority };

// ── Priority ordering ─────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<CopilotPlanPriority, number> = {
  LOW:      0,
  MEDIUM:   1,
  HIGH:     2,
  CRITICAL: 3,
};

function maxPriority(
  a: CopilotPlanPriority,
  b: CopilotPlanPriority,
): CopilotPlanPriority {
  return PRIORITY_ORDER[a] >= PRIORITY_ORDER[b] ? a : b;
}

// ── Intent baseline priority ──────────────────────────────────────────────────

function intentBasePriority(intent: CopilotIntent): CopilotPlanPriority {
  switch (intent) {
    case "MULTI_DOMAIN": return "MEDIUM"; // always at least medium
    case "FINANCE":      return "MEDIUM";
    case "COLLECTIONS":  return "MEDIUM";
    case "COMMERCIAL":   return "MEDIUM";
    case "MARKETING":    return "MEDIUM";
    case "GENERAL":      return "LOW";
    default:             return "LOW";
  }
}

// ── Calculator ────────────────────────────────────────────────────────────────

/**
 * Calculate the execution plan priority from intent and memory signals.
 *
 * @param intent   Resolved business intent.
 * @param signals  Planning signals extracted from memory context.
 * @returns        CopilotPlanPriority — never throws.
 */
export function calculatePlanPriority(
  intent:  CopilotIntent,
  signals: MemoryPlanningSignal[],
): CopilotPlanPriority {
  let priority: CopilotPlanPriority = intentBasePriority(intent);

  for (const signal of signals) {
    // Any CRITICAL-strength signal → CRITICAL
    if (signal.strength === "CRITICAL") {
      priority = "CRITICAL";
      break; // Can't go higher
    }

    // ESCALATE_ATTENTION always → at least HIGH
    if (signal.signalType === "ESCALATE_ATTENTION") {
      priority = maxPriority(priority, "HIGH");
    }

    // HIGH-strength signal → at least HIGH
    if (signal.strength === "HIGH") {
      priority = maxPriority(priority, "HIGH");
    }

    // ADD_WARNING with HIGH strength → at least HIGH
    if (signal.signalType === "ADD_WARNING" && signal.strength === "HIGH") {
      priority = maxPriority(priority, "HIGH");
    }
  }

  return priority;
}

/**
 * Returns true if priority `a` is at least as high as priority `b`.
 */
export function priorityAtLeast(
  a: CopilotPlanPriority,
  b: CopilotPlanPriority,
): boolean {
  return PRIORITY_ORDER[a] >= PRIORITY_ORDER[b];
}
