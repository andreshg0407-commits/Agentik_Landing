/**
 * lib/copilot/profiles/default-copilot-profiles.ts
 *
 * Agentik — Copilot Tenant Profiles — Default Profiles Registry
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Pre-defined profiles for known tenants and the global fallback.
 *
 * RULES:
 *   - Profile IDs are IMMUTABLE. displayNames can change.
 *   - "agentik" org → Yumeko (STRATEGIC)
 *   - "castillitos" org → Asistente Castillitos (OPERATIONAL)
 *   - Unknown orgs → global fallback "Copilot" (ANALYTICAL)
 *   - These profiles are read-only seeds. Runtime overrides go to the repository.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotTenantProfile }        from "./copilot-tenant-profile";
import { FULL_MEMORY_POLICY,
         DEFAULT_MEMORY_POLICY }             from "./copilot-memory-policy";
import { SUPERVISED_AUTONOMY_POLICY }        from "./copilot-autonomy-policy";
import { EMPTY_BRANDING }                    from "./copilot-branding";

// ── Agentik internal profile ──────────────────────────────────────────────────

/**
 * Agentik's own Copilot — "Yumeko".
 *
 * ID:   "agentik_copilot"  ← immutable
 * Name: "Yumeko"           ← visible, can change per tenant preference
 */
export const AGENTIK_COPILOT_PROFILE: CopilotTenantProfile = Object.freeze({
  id:             "agentik_copilot",
  orgSlug:        "agentik",
  enabled:        true,
  displayName:    "Yumeko",
  avatar:         "/agents/Yumeko.png",
  tone:           "DIRECT",
  language:       "es",
  executiveStyle: "STRATEGIC",
  branding:       EMPTY_BRANDING,
  enabledAgents:  [],             // all agents available
  memoryPolicy:   FULL_MEMORY_POLICY,
  autonomyPolicy: SUPERVISED_AUTONOMY_POLICY,
  createdAt:      "2026-01-01T00:00:00.000Z",
  updatedAt:      "2026-01-01T00:00:00.000Z",
}) as CopilotTenantProfile;

// ── Castillitos profile ───────────────────────────────────────────────────────

/**
 * Castillitos tenant Copilot.
 * Operational style: tasks, actions, execution cadence.
 */
export const CASTILLITOS_COPILOT_PROFILE: CopilotTenantProfile = Object.freeze({
  id:             "castillitos_copilot",
  orgSlug:        "castillitos",
  enabled:        true,
  displayName:    "Asistente Castillitos",
  avatar:         undefined,
  tone:           "FORMAL",
  language:       "es",
  executiveStyle: "OPERATIONAL",
  branding:       EMPTY_BRANDING,
  enabledAgents:  [],             // all agents available
  memoryPolicy:   DEFAULT_MEMORY_POLICY,
  autonomyPolicy: SUPERVISED_AUTONOMY_POLICY,
  createdAt:      "2026-01-01T00:00:00.000Z",
  updatedAt:      "2026-01-01T00:00:00.000Z",
}) as CopilotTenantProfile;

// ── Global fallback ───────────────────────────────────────────────────────────

/**
 * Global fallback for any unregistered tenant.
 * Analytical style: metrics, data, indicators.
 */
export const FALLBACK_COPILOT_PROFILE: CopilotTenantProfile = Object.freeze({
  id:             "default_copilot",
  orgSlug:        "__default__",
  enabled:        true,
  displayName:    "Copilot",
  avatar:         undefined,
  tone:           "FRIENDLY",
  language:       "es",
  executiveStyle: "ANALYTICAL",
  branding:       EMPTY_BRANDING,
  enabledAgents:  [],
  memoryPolicy:   DEFAULT_MEMORY_POLICY,
  autonomyPolicy: SUPERVISED_AUTONOMY_POLICY,
  createdAt:      "2026-01-01T00:00:00.000Z",
  updatedAt:      "2026-01-01T00:00:00.000Z",
}) as CopilotTenantProfile;

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Map of orgSlug → default profile for known tenants.
 * Consulted by the profile resolver before falling back to FALLBACK_COPILOT_PROFILE.
 */
export const DEFAULT_PROFILE_REGISTRY: ReadonlyMap<string, CopilotTenantProfile> = new Map([
  ["agentik",     AGENTIK_COPILOT_PROFILE],
  ["castillitos", CASTILLITOS_COPILOT_PROFILE],
]);

/**
 * Get a default profile for an orgSlug.
 * Returns FALLBACK_COPILOT_PROFILE for unknown orgs.
 * Never returns null.
 */
export function getDefaultProfile(orgSlug: string): CopilotTenantProfile {
  return DEFAULT_PROFILE_REGISTRY.get(orgSlug) ?? FALLBACK_COPILOT_PROFILE;
}
