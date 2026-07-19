/**
 * lib/autonomous/autonomous-feature-flags.ts
 *
 * Agentik — Autonomous Operations — Kill Switch
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * CRITICAL DESIGN RULE:
 *   This is the single point of control for autonomous execution.
 *   Every executor MUST consult isAutonomousModeEnabled() before proceeding.
 *   If this function returns false, NO autonomous operation may execute.
 *
 * Default: false — no tenant runs autonomy by default.
 * Autonomy is opt-in. Tenants must be explicitly enabled.
 *
 * Pure domain. No Prisma. No React. No server-only.
 * This function is intentionally synchronous for performance.
 */

// ── Enabled tenants registry ──────────────────────────────────────────────────
//
// In-memory allowlist. Will be replaced with DB-backed config in
// AGENTIK-AUTONOMOUS-FEATURE-FLAGS-01.
// Do NOT add production tenants here without explicit authorization.

const _enabledTenants = new Set<string>([
  // NO tenants enabled by default.
  // Add "castillitos" here only when explicitly authorized.
]);

// ── Kill switch ───────────────────────────────────────────────────────────────

/**
 * Returns true if autonomous mode is enabled for this tenant.
 *
 * DEFAULT: false — no autonomous execution for any tenant.
 *
 * This is the KILL SWITCH for the entire autonomous operations layer.
 * All executors must call this before any autonomous action.
 */
export function isAutonomousModeEnabled(orgSlug: string): boolean {
  return _enabledTenants.has(orgSlug);
}

// ── Admin controls (for testing / gradual rollout) ────────────────────────────

/**
 * Enable autonomous mode for a specific tenant.
 * USE WITH CAUTION — only call from authorized admin flows or test harnesses.
 */
export function enableAutonomousMode(orgSlug: string): void {
  _enabledTenants.add(orgSlug);
}

/**
 * Disable autonomous mode for a specific tenant (immediate kill switch).
 */
export function disableAutonomousMode(orgSlug: string): void {
  _enabledTenants.delete(orgSlug);
}

/**
 * Returns the set of all currently enabled tenants.
 * For audit and observability only — do not use for access control.
 */
export function getEnabledTenants(): readonly string[] {
  return Array.from(_enabledTenants);
}
