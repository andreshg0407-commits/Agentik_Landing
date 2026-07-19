/**
 * lib/copilot/profiles/copilot-branding.ts
 *
 * Agentik — Copilot Tenant Profiles — Branding Contract
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Defines the visual branding contract for a tenant's Copilot.
 * All fields are optional — unset fields inherit the Agentik defaults.
 *
 * NOTE: This is the domain contract only. UI rendering is NOT implemented here.
 * The UI layer reads these values via CopilotPersona resolution — never directly.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

// ── Type ──────────────────────────────────────────────────────────────────────

export interface CopilotBranding {
  /**
   * URL to the tenant's custom Copilot logo.
   * When absent, the default Agentik Copilot avatar is used.
   */
  logoUrl?:      string;
  /**
   * Hex or CSS color string for the primary brand color.
   * e.g. "#004AAD"
   */
  primaryColor?: string;
  /**
   * Hex or CSS color string for the accent/action color.
   * e.g. "#2563eb"
   */
  accentColor?:  string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Build a minimal branding object (all fields optional). */
export function buildBranding(
  overrides: Partial<CopilotBranding> = {},
): CopilotBranding {
  return {
    logoUrl:      overrides.logoUrl,
    primaryColor: overrides.primaryColor,
    accentColor:  overrides.accentColor,
  };
}

/** Empty branding — no overrides, inherits all Agentik defaults. */
export const EMPTY_BRANDING: CopilotBranding = Object.freeze({});

// ── Guard ─────────────────────────────────────────────────────────────────────

/** True if the branding has at least one non-empty override. */
export function hasBrandingOverrides(branding: CopilotBranding): boolean {
  return (
    Boolean(branding.logoUrl)      ||
    Boolean(branding.primaryColor) ||
    Boolean(branding.accentColor)
  );
}
