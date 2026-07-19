/**
 * lib/copilot/profiles/copilot-persona.ts
 *
 * Agentik — Copilot Tenant Profiles — Persona Resolution Layer
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Thin abstraction layer between consumers and CopilotTenantProfile.
 * All UI and service code must read persona attributes through this layer —
 * never by accessing profile fields directly.
 *
 * WHY: Decouples consumers from the profile schema.
 * If a field is renamed or the derivation logic changes, only this file changes.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotTenantProfile } from "./copilot-tenant-profile";
import type { CopilotTone }          from "./copilot-tenant-profile";
import type { ExecutiveStyle }       from "./copilot-executive-style";
import { FALLBACK_COPILOT_PROFILE }  from "./default-copilot-profiles";

// ── Resolution functions ──────────────────────────────────────────────────────

/**
 * Resolve the display name for a Copilot profile.
 * Falls back to the global fallback displayName if the profile is undefined.
 *
 * This is the ONLY function that should be used to get a displayName.
 * Never read profile.displayName directly in service or UI code.
 */
export function resolveDisplayName(profile: CopilotTenantProfile | undefined): string {
  return profile?.displayName ?? FALLBACK_COPILOT_PROFILE.displayName;
}

/**
 * Resolve the tone for a Copilot profile.
 * Falls back to the global fallback tone.
 */
export function resolveTone(profile: CopilotTenantProfile | undefined): CopilotTone {
  return profile?.tone ?? FALLBACK_COPILOT_PROFILE.tone;
}

/**
 * Resolve the executive style for a Copilot profile.
 * Falls back to the global fallback style (ANALYTICAL).
 */
export function resolveExecutiveStyle(
  profile: CopilotTenantProfile | undefined,
): ExecutiveStyle {
  return profile?.executiveStyle ?? FALLBACK_COPILOT_PROFILE.executiveStyle;
}

/**
 * Resolve the avatar URL for a Copilot profile.
 * Returns undefined when no avatar is set (UI renders default).
 */
export function resolveAvatar(
  profile: CopilotTenantProfile | undefined,
): string | undefined {
  return profile?.avatar;
}

/**
 * Resolve the primary language for a Copilot profile.
 * Falls back to "es".
 */
export function resolveLanguage(profile: CopilotTenantProfile | undefined): string {
  return profile?.language ?? "es";
}

// ── Compound helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the complete persona summary for a profile.
 * Used for response metadata.
 */
export interface CopilotPersonaSummary {
  displayName:    string;
  tone:           CopilotTone;
  executiveStyle: ExecutiveStyle;
  language:       string;
  avatar?:        string;
}

export function resolvePersonaSummary(
  profile: CopilotTenantProfile | undefined,
): CopilotPersonaSummary {
  return {
    displayName:    resolveDisplayName(profile),
    tone:           resolveTone(profile),
    executiveStyle: resolveExecutiveStyle(profile),
    language:       resolveLanguage(profile),
    avatar:         resolveAvatar(profile),
  };
}
