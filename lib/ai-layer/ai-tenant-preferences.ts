/**
 * lib/ai-layer/ai-tenant-preferences.ts
 *
 * Agentik — AI Layer Foundation — Tenant AI Preferences
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * In-memory tenant preference store.
 * In production, preferences would be loaded from the DB per org.
 * For now, this provides defaults and an override mechanism.
 */

import type { AITenantPreferences, AIProviderId, AIModelId } from "./ai-layer-types";

// ── Default preferences ───────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: Omit<AITenantPreferences, "orgSlug"> = {
  preferredProviderId:  undefined,
  preferredModelId:     undefined,
  maxCreditsPerCall:    0,       // 0 = no limit
  allowedProviderIds:   [],     // empty = all allowed
  forceMockAdapters:    true,   // always mock until real adapters are wired
};

// ── In-memory override store ──────────────────────────────────────────────────

const _overrides = new Map<string, Partial<AITenantPreferences>>();

// ── Preference resolver ───────────────────────────────────────────────────────

/**
 * Resolve tenant AI preferences for an org.
 * Merges defaults with any in-memory overrides.
 * In production, this would load from the DB.
 */
export function resolveTenantPreferences(orgSlug: string): AITenantPreferences {
  const overrides = _overrides.get(orgSlug) ?? {};

  return {
    ...DEFAULT_PREFERENCES,
    ...overrides,
    orgSlug,
  };
}

/**
 * Set an in-memory preference override for an org (useful for tests and admin).
 */
export function setTenantPreferences(
  orgSlug: string,
  prefs: Partial<Omit<AITenantPreferences, "orgSlug">>,
): void {
  const existing = _overrides.get(orgSlug) ?? {};
  _overrides.set(orgSlug, { ...existing, ...prefs });
}

/**
 * Clear all in-memory overrides for an org.
 */
export function clearTenantPreferences(orgSlug: string): void {
  _overrides.delete(orgSlug);
}

/**
 * Clear all in-memory overrides (for test teardown).
 */
export function clearAllTenantPreferences(): void {
  _overrides.clear();
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface TenantPreferenceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTenantPreferences(
  prefs: AITenantPreferences,
): TenantPreferenceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!prefs.orgSlug || prefs.orgSlug.trim() === "") {
    errors.push("orgSlug must not be empty.");
  }

  if (prefs.maxCreditsPerCall !== undefined && prefs.maxCreditsPerCall < 0) {
    errors.push("maxCreditsPerCall must be >= 0 (0 = no limit).");
  }

  if (prefs.forceMockAdapters) {
    warnings.push("forceMockAdapters=true: all calls will use mock adapters (no real provider).");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
