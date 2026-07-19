/**
 * lib/copilot/profiles/copilot-profile-repository.ts
 *
 * Agentik — Copilot Tenant Profiles — Repository Contract
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Pure interface contract for profile storage.
 * The current implementation is in-memory.
 * DEBT: Prisma persistence — AGENTIK-COPILOT-PROFILE-PERSIST-01
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotTenantProfile } from "./copilot-tenant-profile";

// ── Input types ───────────────────────────────────────────────────────────────

export type CreateProfileInput = Omit<CopilotTenantProfile, "createdAt" | "updatedAt">;

export type UpdateProfileInput = Partial<Omit<CopilotTenantProfile, "id" | "orgSlug" | "createdAt">>;

// ── Repository interface ──────────────────────────────────────────────────────

export interface CopilotProfileRepository {
  /**
   * Save a new profile.
   * Throws if a profile with the same id already exists.
   */
  saveProfile(input: CreateProfileInput): Promise<CopilotTenantProfile>;

  /**
   * Update an existing profile by id.
   * Returns null if not found.
   */
  updateProfile(id: string, updates: UpdateProfileInput): Promise<CopilotTenantProfile | null>;

  /**
   * Get a profile by its internal id.
   * Returns null if not found.
   */
  getProfile(id: string): Promise<CopilotTenantProfile | null>;

  /**
   * Get a profile by orgSlug.
   * Returns null if no profile is registered for this org.
   */
  getProfileByOrgSlug(orgSlug: string): Promise<CopilotTenantProfile | null>;

  /**
   * Delete a profile by id.
   * Returns true if deleted, false if not found.
   */
  deleteProfile(id: string): Promise<boolean>;

  /**
   * List all profiles, optionally filtered.
   */
  listProfiles(options?: { enabledOnly?: boolean }): Promise<CopilotTenantProfile[]>;
}
