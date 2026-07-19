/**
 * lib/autonomous/autonomous-policy-engine.ts
 *
 * Agentik — Autonomous Operations — Policy Engine
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Resolves the effective policy for an autonomous operation.
 *
 * Rules (exhaustive, in priority order):
 *   CRITICAL → MANUAL_ONLY        (never auto-execute critical risk)
 *   HIGH     → APPROVAL_REQUIRED  (require human sign-off)
 *   MEDIUM   → APPROVAL_REQUIRED  (require human sign-off)
 *   LOW      → AUTO_ALLOWED       (execute immediately)
 *
 * Extensible: add new rules here without touching the executor.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AutonomousRiskLevel, AutonomousPolicy } from "./autonomous-types";

// ── Policy rule ───────────────────────────────────────────────────────────────

interface PolicyRule {
  id:          string;
  riskLevel:   AutonomousRiskLevel | "*";
  policy:      AutonomousPolicy;
  reason:      string;
  priority:    number; // higher = evaluated first
}

// ── Policy table ──────────────────────────────────────────────────────────────

const POLICY_RULES: PolicyRule[] = [
  {
    id:        "RULE_CRITICAL_MANUAL_ONLY",
    riskLevel: "CRITICAL",
    policy:    "MANUAL_ONLY",
    reason:    "CRITICAL risk operations are always MANUAL_ONLY — no autonomous path.",
    priority:  100,
  },
  {
    id:        "RULE_HIGH_APPROVAL_REQUIRED",
    riskLevel: "HIGH",
    policy:    "APPROVAL_REQUIRED",
    reason:    "HIGH risk requires human approval before execution.",
    priority:  90,
  },
  {
    id:        "RULE_MEDIUM_APPROVAL_REQUIRED",
    riskLevel: "MEDIUM",
    policy:    "APPROVAL_REQUIRED",
    reason:    "MEDIUM risk requires human approval before execution.",
    priority:  80,
  },
  {
    id:        "RULE_LOW_AUTO_ALLOWED",
    riskLevel: "LOW",
    policy:    "AUTO_ALLOWED",
    reason:    "LOW risk operations may execute autonomously.",
    priority:  70,
  },
  // Safety fallback — should never be reached
  {
    id:        "RULE_FALLBACK_MANUAL_ONLY",
    riskLevel: "*",
    policy:    "MANUAL_ONLY",
    reason:    "No policy matched — falling back to MANUAL_ONLY for safety.",
    priority:  -1,
  },
];

// ── Resolver ──────────────────────────────────────────────────────────────────

export interface PolicyResolution {
  policy:   AutonomousPolicy;
  ruleId:   string;
  reason:   string;
}

/**
 * Resolve the effective policy for a given risk level.
 * Returns the highest-priority matching rule.
 * Never throws — always returns a resolution.
 */
export function resolvePolicy(riskLevel: AutonomousRiskLevel): PolicyResolution {
  const sorted = [...POLICY_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (rule.riskLevel === riskLevel || rule.riskLevel === "*") {
      return {
        policy: rule.policy,
        ruleId: rule.id,
        reason: rule.reason,
      };
    }
  }

  // Unreachable — fallback rule always matches
  return {
    policy: "MANUAL_ONLY",
    ruleId: "RULE_EMERGENCY_FALLBACK",
    reason: "Emergency fallback — blocked for safety.",
  };
}

// ── Policy classifier helpers ─────────────────────────────────────────────────

export function isAutoAllowed(policy: AutonomousPolicy): boolean {
  return policy === "AUTO_ALLOWED";
}

export function requiresApproval(policy: AutonomousPolicy): boolean {
  return policy === "APPROVAL_REQUIRED";
}

export function isBlocked(policy: AutonomousPolicy): boolean {
  return policy === "MANUAL_ONLY";
}

// ── Export rules for audits ───────────────────────────────────────────────────

export { POLICY_RULES };
