/**
 * lib/copilot/collaboration-priority.ts
 *
 * Agentik Copilot — Collaboration Priority Engine V1
 *
 * Phase 4 of Sprint AGENTIK-COPILOT-MULTI-AGENT-DELEGATION-01
 *
 * Sorts agent collaborations by composite priority and resolves
 * the overall collaboration pressure for rail display.
 *
 * Pressure drives visual emphasis in the "Colaboración IA" section.
 */

import type { AgentCollaboration, CollaborationPriority } from "./agent-collaboration";
import type { AccountabilitySignal }                       from "./accountability-engine";

// ── Pressure type ──────────────────────────────────────────────────────────────

export type CollaborationPressure = "low" | "medium" | "high" | "urgent";

// ── Score tables ───────────────────────────────────────────────────────────────

const PRIORITY_SCORE: Record<CollaborationPriority, number> = {
  urgent: 40,
  high:   28,
  medium: 15,
  low:    5,
};

const TYPE_SCORE: Record<string, number> = {
  escalation:      20,
  handoff:         16,
  support_request: 12,
  consultation:    8,
  shared_context:  4,
};

const STATUS_SCORE: Record<string, number> = {
  blocked:  15,
  active:   10,
  waiting:  8,
  proposed: 5,
  resolved: 0,
};

const TARGET_IMPORTANCE: Record<string, number> = {
  sofi:  8,  // Technical stability is critical
  diego: 6,  // Financial validation is high-value
  luca:  5,  // Commercial recovery is important
  mila:  5,  // Sales followup is important
};

const RUNTIME_MULTIPLIER: Record<string, number> = {
  DEGRADED: 1.4,
  STALE:    1.15,
  SYNCING:  1.05,
  HEALTHY:  1.0,
};

const MEMORY_ATTEMPT_BONUS = 6; // Per unresolved attempt > 1

function collaborationScore(
  collab:        AgentCollaboration,
  runtimeState:  string,
  memoryAttempts: number,
): number {
  const base =
    PRIORITY_SCORE[collab.priority]           +
    (TYPE_SCORE[collab.type]    ?? 0)         +
    (STATUS_SCORE[collab.status] ?? 0)        +
    (TARGET_IMPORTANCE[collab.targetAgentId] ?? 0);

  const memBonus  = Math.max(0, memoryAttempts - 1) * MEMORY_ATTEMPT_BONUS;
  const raw       = base + memBonus;
  const multiplier = RUNTIME_MULTIPLIER[runtimeState] ?? 1.0;

  return raw * multiplier;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sorts collaborations by composite priority (descending).
 */
export function sortAgentCollaborations(
  collaborations: AgentCollaboration[],
  runtimeState:   string,
  memoryAttempts: Record<string, number> = {},
): AgentCollaboration[] {
  return [...collaborations].sort((a, b) => {
    const aScore = collaborationScore(a, runtimeState, memoryAttempts[a.id] ?? 0);
    const bScore = collaborationScore(b, runtimeState, memoryAttempts[b.id] ?? 0);
    return bScore - aScore;
  });
}

/**
 * Returns the single highest-priority collaboration.
 */
export function getPrimaryAgentCollaboration(
  collaborations: AgentCollaboration[],
  runtimeState:   string,
  memoryAttempts: Record<string, number> = {},
): AgentCollaboration | null {
  if (collaborations.length === 0) return null;
  return sortAgentCollaborations(collaborations, runtimeState, memoryAttempts)[0] ?? null;
}

/**
 * Resolves overall collaboration pressure.
 * Considers runtime state, accountability signals, and primary collaboration priority.
 */
export function resolveCollaborationPressure(
  collaborations:        AgentCollaboration[],
  runtimeState:          string,
  accountabilitySignals: AccountabilitySignal[],
): CollaborationPressure {
  if (collaborations.length === 0) return "low";

  const primary = collaborations[0];
  if (!primary) return "low";

  // Base from primary collaboration priority
  let pressureLevel =
    primary.priority === "urgent" ? 3 :
    primary.priority === "high"   ? 2 :
    primary.priority === "medium" ? 1 :
    0;

  // Amplify if runtime is degraded
  if (runtimeState === "DEGRADED") pressureLevel += 1;

  // Amplify if there are critical accountability signals
  const hasCriticalSignal = accountabilitySignals.some(s => s.severity === "critical");
  const hasEscalation     = accountabilitySignals.some(s => s.escalationRecommended);
  if (hasCriticalSignal) pressureLevel += 1;
  if (hasEscalation)     pressureLevel += 1;

  if (pressureLevel >= 4) return "urgent";
  if (pressureLevel >= 3) return "high";
  if (pressureLevel >= 2) return "medium";
  return "low";
}
