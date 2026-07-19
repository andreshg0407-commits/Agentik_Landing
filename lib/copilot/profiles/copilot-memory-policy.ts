/**
 * lib/copilot/profiles/copilot-memory-policy.ts
 *
 * Agentik — Copilot Tenant Profiles — Memory Policy
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Defines what kinds of memories a tenant's Copilot is allowed to store.
 * All fields are deterministic booleans — no AI, no runtime inference.
 *
 * NOTE: This is the policy contract. Enforcement is the responsibility of
 * the Memory Engine (strategic-memory-manager.ts).
 * DEBT: policy enforcement in manager — AGENTIK-COPILOT-MEMORY-POLICY-ENFORCE-01
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CopilotMemoryPolicy {
  /** Allow storing STRATEGIC memories (long-term tenant facts). */
  allowStrategicMemory:    boolean;
  /** Allow storing OPERATIONAL memories (daily tasks, context). */
  allowOperationalMemory:  boolean;
  /** Allow storing LEARNING memories (behavioral patterns from interactions). */
  allowLearningMemory:     boolean;
  /** Allow storing PREFERENCE memories (user preferences and settings). */
  allowPreferenceMemory:   boolean;
  /**
   * Maximum number of memories stored per tenant.
   * 0 = unlimited (use with caution).
   */
  maxMemories:             number;
}

// ── Presets ───────────────────────────────────────────────────────────────────

/** Full memory access — all types enabled, high limit. */
export const FULL_MEMORY_POLICY: CopilotMemoryPolicy = Object.freeze({
  allowStrategicMemory:   true,
  allowOperationalMemory: true,
  allowLearningMemory:    true,
  allowPreferenceMemory:  true,
  maxMemories:            500,
});

/** Restricted policy — strategic only, smaller limit. */
export const STRATEGIC_ONLY_MEMORY_POLICY: CopilotMemoryPolicy = Object.freeze({
  allowStrategicMemory:   true,
  allowOperationalMemory: false,
  allowLearningMemory:    false,
  allowPreferenceMemory:  false,
  maxMemories:            100,
});

/** Default balanced policy for most tenants. */
export const DEFAULT_MEMORY_POLICY: CopilotMemoryPolicy = Object.freeze({
  allowStrategicMemory:   true,
  allowOperationalMemory: true,
  allowLearningMemory:    true,
  allowPreferenceMemory:  false,
  maxMemories:            200,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Check if a specific memory type is allowed by this policy. */
export function isMemoryTypeAllowed(
  policy: CopilotMemoryPolicy,
  type:   "STRATEGIC" | "OPERATIONAL" | "LEARNING" | "PREFERENCE",
): boolean {
  switch (type) {
    case "STRATEGIC":   return policy.allowStrategicMemory;
    case "OPERATIONAL": return policy.allowOperationalMemory;
    case "LEARNING":    return policy.allowLearningMemory;
    case "PREFERENCE":  return policy.allowPreferenceMemory;
  }
}

/** True if the tenant has not yet reached their memory limit. */
export function isWithinMemoryLimit(
  policy:      CopilotMemoryPolicy,
  currentCount: number,
): boolean {
  if (policy.maxMemories === 0) return true; // unlimited
  return currentCount < policy.maxMemories;
}
