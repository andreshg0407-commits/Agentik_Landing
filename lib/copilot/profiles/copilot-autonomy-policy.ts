/**
 * lib/copilot/profiles/copilot-autonomy-policy.ts
 *
 * Agentik — Copilot Tenant Profiles — Autonomy Policy
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Defines how much autonomous action a tenant's Copilot is permitted to take.
 * This is a contract only — autonomous execution is NOT implemented here.
 *
 * NOTE: Actual autonomous execution is gated by AGENTIK-AGENT-RUNTIME-01.
 * DEBT: wire into agent-capability-guard.ts — AGENTIK-AUTONOMY-ENFORCE-01
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

// ── Risk level ────────────────────────────────────────────────────────────────

/**
 * Maximum risk level the Copilot is allowed to take on autonomously.
 * Maps to the risk levels in the Agent Runtime capability guard.
 */
export type AutonomyRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const RISK_ORDER: Record<AutonomyRiskLevel, number> = {
  LOW:      0,
  MEDIUM:   1,
  HIGH:     2,
  CRITICAL: 3,
};

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CopilotAutonomyPolicy {
  /** Allow the Copilot to autonomously set operational goals. */
  allowAutonomousGoals:       boolean;
  /** Allow the Copilot to autonomously execute tasks without approval. */
  allowAutonomousExecution:   boolean;
  /** Allow the Copilot to autonomously approve actions. */
  allowAutonomousApprovals:   boolean;
  /**
   * Maximum risk level for autonomous actions.
   * Actions above this level always require human approval.
   */
  maxRiskLevel:               AutonomyRiskLevel;
}

// ── Presets ───────────────────────────────────────────────────────────────────

/** Fully supervised — no autonomous actions of any kind. */
export const SUPERVISED_AUTONOMY_POLICY: CopilotAutonomyPolicy = Object.freeze({
  allowAutonomousGoals:       false,
  allowAutonomousExecution:   false,
  allowAutonomousApprovals:   false,
  maxRiskLevel:               "LOW",
});

/** Semi-autonomous — goals and execution allowed, approvals require human. */
export const SEMI_AUTONOMY_POLICY: CopilotAutonomyPolicy = Object.freeze({
  allowAutonomousGoals:       true,
  allowAutonomousExecution:   true,
  allowAutonomousApprovals:   false,
  maxRiskLevel:               "MEDIUM",
});

/** Full autonomy — all actions permitted up to HIGH risk. */
export const FULL_AUTONOMY_POLICY: CopilotAutonomyPolicy = Object.freeze({
  allowAutonomousGoals:       true,
  allowAutonomousExecution:   true,
  allowAutonomousApprovals:   true,
  maxRiskLevel:               "HIGH",
});

/** Default policy: supervised, lowest risk threshold. */
export const DEFAULT_AUTONOMY_POLICY: CopilotAutonomyPolicy = SUPERVISED_AUTONOMY_POLICY;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if the given risk level is permitted under this policy. */
export function isRiskLevelPermitted(
  policy:    CopilotAutonomyPolicy,
  riskLevel: AutonomyRiskLevel,
): boolean {
  return RISK_ORDER[riskLevel] <= RISK_ORDER[policy.maxRiskLevel];
}

/** True if autonomous execution is fully gated (requires human for everything). */
export function isFullySupervised(policy: CopilotAutonomyPolicy): boolean {
  return (
    !policy.allowAutonomousGoals     &&
    !policy.allowAutonomousExecution &&
    !policy.allowAutonomousApprovals
  );
}
