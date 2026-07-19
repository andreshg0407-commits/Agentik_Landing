/**
 * lib/copilot/profiles/copilot-profile-resolver.ts
 *
 * Agentik — Copilot Tenant Profiles — Profile Resolver
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Resolution chain for a given orgSlug:
 *   1. Runtime repository (in-memory overrides, set via admin operations)
 *   2. Default profile registry (known tenants: agentik, castillitos)
 *   3. Global fallback (always valid, never null)
 *
 * Contract: getProfile() NEVER returns null.
 *           getProfile() NEVER throws.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotTenantProfile }   from "./copilot-tenant-profile";
import type { CopilotProfileRepository } from "./copilot-profile-repository";
import { defaultProfileRepository }    from "./in-memory-copilot-profile-repository";
import {
  getDefaultProfile,
  FALLBACK_COPILOT_PROFILE,
}                                       from "./default-copilot-profiles";

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Copilot profile for a given orgSlug.
 *
 * Resolution order:
 *   1. Check the runtime repository (allows per-org overrides at runtime).
 *   2. Check the default profile registry (known tenants).
 *   3. Return the global fallback profile.
 *
 * @param orgSlug    Tenant org slug.
 * @param repository Optional repository override (defaults to process singleton).
 * @returns          Always a valid, enabled-checked CopilotTenantProfile.
 */
export async function getProfile(
  orgSlug:     string,
  repository?: CopilotProfileRepository,
): Promise<CopilotTenantProfile> {
  const repo = repository ?? defaultProfileRepository;

  try {
    // Step 1: Runtime repository
    const repoProfile = await repo.getProfileByOrgSlug(orgSlug);
    if (repoProfile) {
      // If the stored profile is disabled, skip to default
      if (repoProfile.enabled) return repoProfile;
    }
  } catch {
    // Repository failure is non-fatal — fall through to defaults
  }

  // Step 2: Default profile registry
  const defaultProfile = getDefaultProfile(orgSlug);
  if (defaultProfile.orgSlug !== "__default__") {
    return defaultProfile;
  }

  // Step 3: Global fallback
  return FALLBACK_COPILOT_PROFILE;
}

/**
 * Synchronous profile resolver — uses default registry + fallback only.
 * Use this when async resolution is not available (e.g. pure domain callers).
 *
 * Does NOT consult the runtime repository.
 */
export function getProfileSync(orgSlug: string): CopilotTenantProfile {
  return getDefaultProfile(orgSlug);
}
