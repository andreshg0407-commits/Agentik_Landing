/**
 * lib/copilot/memory-planning/memory-planning-types.ts
 *
 * Agentik — Copilot Memory-Aware Planning — Domain Types
 * Sprint: AGENTIK-COPILOT-MEMORY-AWARE-PLANNING-01
 *
 * Pure TypeScript domain types for the Memory-Aware Planning layer.
 * No Prisma. No React. No Next. No server-only.
 * All types are fully JSON-serializable.
 */

import type { AgentId } from "@/lib/agents/runtime/agent-types";

// ── Domain targeting ──────────────────────────────────────────────────────────

/**
 * The 4 specific operational domains that agents cover.
 * Subset of CopilotIntent (excludes MULTI_DOMAIN and GENERAL).
 */
export type CopilotDomain =
  | "FINANCE"
  | "MARKETING"
  | "COMMERCIAL"
  | "COLLECTIONS";

// ── Signal classification ─────────────────────────────────────────────────────

/**
 * Type of planning signal emitted from a memory entry.
 *
 * PRIORITIZE_DOMAIN     — Include the domain's agent in the execution plan.
 * PRIORITIZE_AGENT      — Include a specific agent by semantic ID.
 * ADD_WARNING           — Surface a warning in the response (e.g. "PagosNet pendiente").
 * SUGGEST_NEXT_ACTION   — Propose a concrete next step to the user.
 * ESCALATE_ATTENTION    — Mark the plan as HIGH/CRITICAL priority.
 */
export type MemoryPlanningSignalType =
  | "PRIORITIZE_DOMAIN"
  | "PRIORITIZE_AGENT"
  | "ADD_WARNING"
  | "SUGGEST_NEXT_ACTION"
  | "ESCALATE_ATTENTION";

/**
 * Strength of a planning signal.
 * Governs whether the signal can override the base plan.
 */
export type PlanningSignalStrength =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

/**
 * Priority of a CopilotExecutionPlan.
 * Calculated from intent + memory signals.
 */
export type CopilotPlanPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

// ── Signal ────────────────────────────────────────────────────────────────────

/**
 * A planning signal extracted from a single MemoryEntry.
 *
 * Signals drive:
 *   - Agent selection (PRIORITIZE_DOMAIN, PRIORITIZE_AGENT)
 *   - Response warnings (ADD_WARNING)
 *   - Suggested next actions (SUGGEST_NEXT_ACTION)
 *   - Priority elevation (ESCALATE_ATTENTION)
 *
 * id:             Unique signal ID. Format: "sig-{timestamp}-{seq}".
 * orgSlug:        Tenant this signal is scoped to.
 * memoryId:       ID of the MemoryEntry that produced this signal.
 * signalType:     What kind of planning action this signal triggers.
 * strength:       How strongly this signal overrides the base plan.
 * targetDomain:   Present for PRIORITIZE_DOMAIN signals.
 * targetAgentId:  Present for PRIORITIZE_AGENT signals.
 * reason:         Human-readable explanation for transparency.
 * createdAt:      ISO 8601 timestamp.
 */
export interface MemoryPlanningSignal {
  id:             string;
  orgSlug:        string;
  memoryId:       string;
  signalType:     MemoryPlanningSignalType;
  strength:       PlanningSignalStrength;
  targetDomain?:  CopilotDomain;
  targetAgentId?: AgentId;
  reason:         string;
  createdAt:      string;
}

// ── Agent selection result ────────────────────────────────────────────────────

/**
 * Result of memory-aware agent selection.
 */
export interface MemoryAwareSelectionResult {
  /** Final agent list (base + memory-added, deduplicated, ordered). */
  finalAgents:   AgentId[];
  /** Agents added purely because of memory signals (not in base selection). */
  addedAgents:   AgentId[];
  /** Human-readable reasons for each modification. */
  reasons:       string[];
  /** Warnings surfaced by memory signals (ADD_WARNING signals). */
  warnings:      string[];
  /** Suggested next actions (SUGGEST_NEXT_ACTION signals). */
  suggestedActions: string[];
}

// ── Strength ordering ─────────────────────────────────────────────────────────

const STRENGTH_ORDER: Record<PlanningSignalStrength, number> = {
  LOW:      0,
  MEDIUM:   1,
  HIGH:     2,
  CRITICAL: 3,
};

export function strengthAtLeast(
  a: PlanningSignalStrength,
  b: PlanningSignalStrength,
): boolean {
  return STRENGTH_ORDER[a] >= STRENGTH_ORDER[b];
}

export function maxStrength(
  strengths: PlanningSignalStrength[],
): PlanningSignalStrength {
  if (strengths.length === 0) return "LOW";
  return strengths.reduce((best, s) =>
    STRENGTH_ORDER[s] > STRENGTH_ORDER[best] ? s : best,
  "LOW" as PlanningSignalStrength);
}
