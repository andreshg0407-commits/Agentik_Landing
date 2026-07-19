/**
 * lib/approvals/approval-priority.ts
 *
 * Agentik — Approval Priority Helpers
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Pure helpers for approval priority resolution, comparison, and display.
 * No React. No Prisma. No side effects.
 */

import type { ApprovalPriority } from "./approval-types";

// ── Weight map ────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<ApprovalPriority, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

// ── Label map ─────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<ApprovalPriority, string> = {
  LOW:      "Baja",
  MEDIUM:   "Media",
  HIGH:     "Alta",
  CRITICAL: "Crítica",
};

// ── Tone map ──────────────────────────────────────────────────────────────────

const PRIORITY_TONE: Record<ApprovalPriority, "neutral" | "info" | "warning" | "danger"> = {
  LOW:      "neutral",
  MEDIUM:   "info",
  HIGH:     "warning",
  CRITICAL: "danger",
};

const VALID_PRIORITIES: ApprovalPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ── Normalizer ────────────────────────────────────────────────────────────────

/**
 * Normalize an unknown string to a valid ApprovalPriority.
 * Falls back to "MEDIUM" if unrecognized.
 */
export function normalizeApprovalPriority(value: string): ApprovalPriority {
  const upper = value.toUpperCase() as ApprovalPriority;
  return VALID_PRIORITIES.includes(upper) ? upper : "MEDIUM";
}

// ── Comparison ────────────────────────────────────────────────────────────────

/**
 * Compare two priorities.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 * Use for descending sort: sort((a, b) => compareApprovalPriority(b.priority, a.priority))
 */
export function compareApprovalPriority(
  a: ApprovalPriority,
  b: ApprovalPriority,
): number {
  return PRIORITY_WEIGHT[a] - PRIORITY_WEIGHT[b];
}

// ── Predicates ────────────────────────────────────────────────────────────────

export function isCriticalApproval(priority: ApprovalPriority): boolean {
  return priority === "CRITICAL";
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getApprovalPriorityWeight(priority: ApprovalPriority): number {
  return PRIORITY_WEIGHT[priority];
}

export function getApprovalPriorityLabel(priority: ApprovalPriority): string {
  return PRIORITY_LABEL[priority];
}

export function getApprovalPriorityTone(
  priority: ApprovalPriority,
): "neutral" | "info" | "warning" | "danger" {
  return PRIORITY_TONE[priority];
}
