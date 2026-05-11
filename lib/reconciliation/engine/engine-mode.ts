/**
 * lib/reconciliation/engine/engine-mode.ts
 *
 * AGENTIK-RECON-ENGINE-02 — Task 3
 * Reconciliation Engine Feature Flag
 *
 * Controls which engine is used for reconciliation runs:
 *
 *   "legacy"    — Use the existing key-based engine (current production behavior).
 *                 Universal engine is NOT run.
 *
 *   "shadow"    — Legacy engine provides the response (no user-visible change).
 *                 Universal engine runs in parallel (fire-and-forget) and
 *                 the comparison is recorded to the audit trail.
 *                 Safe for production: shadow errors never affect the response.
 *
 *   "universal" — Universal engine provides the response.
 *                 Fallback to legacy on any unhandled error.
 *                 Only activate after shadow mode shows stable parity.
 *
 * Configuration:
 *   Set environment variable RECON_ENGINE_MODE to one of: legacy | shadow | universal
 *   Default: "shadow" (safe — legacy response, universal runs silently for validation)
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

/** Valid engine modes for the reconciliation engine. */
export type ReconEngineMode = "legacy" | "shadow" | "universal";

/** Valid mode values as a runtime constant (for validation). */
const VALID_MODES: readonly ReconEngineMode[] = ["legacy", "shadow", "universal"] as const;

/**
 * Read the engine mode from the environment variable RECON_ENGINE_MODE.
 *
 * Falls back to "shadow" if the variable is unset or invalid.
 * "shadow" is the safe default: legacy provides the response, universal
 * runs silently so we can verify parity before promoting to primary.
 *
 * @returns The active ReconEngineMode
 */
export function getEngineMode(): ReconEngineMode {
  const raw = process.env.RECON_ENGINE_MODE?.trim().toLowerCase();
  if (raw && (VALID_MODES as readonly string[]).includes(raw)) {
    return raw as ReconEngineMode;
  }
  // Default: shadow — safe for production
  return "shadow";
}

/**
 * Whether the universal engine should run for this mode.
 * True for shadow and universal; false for legacy-only.
 */
export function shouldRunUniversal(mode: ReconEngineMode): boolean {
  return mode === "shadow" || mode === "universal";
}

/**
 * Whether the universal engine result should be used as the response.
 * True only for universal mode; legacy and shadow both use the legacy result.
 */
export function universalIsAuthority(mode: ReconEngineMode): boolean {
  return mode === "universal";
}
