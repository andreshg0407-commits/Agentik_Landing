/**
 * lib/copilot/profiles/in-memory-copilot-profile-repository.ts
 *
 * Agentik — Copilot Tenant Profiles — In-Memory Repository
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Ephemeral implementation of CopilotProfileRepository.
 * All data lives in process memory — reset on restart.
 *
 * DEBT: replace with Prisma-backed repository — AGENTIK-COPILOT-PROFILE-PERSIST-01
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { CopilotTenantProfile }           from "./copilot-tenant-profile";
import type {
  CopilotProfileRepository,
  CreateProfileInput,
  UpdateProfileInput,
}                                               from "./copilot-profile-repository";

// ── Implementation ────────────────────────────────────────────────────────────

export class InMemoryCopilotProfileRepository implements CopilotProfileRepository {
  private readonly _byId:      Map<string, CopilotTenantProfile> = new Map();
  private readonly _byOrgSlug: Map<string, string>               = new Map(); // orgSlug → id

  async saveProfile(input: CreateProfileInput): Promise<CopilotTenantProfile> {
    if (this._byId.has(input.id)) {
      throw new Error(`Profile with id "${input.id}" already exists.`);
    }
    const now     = new Date().toISOString();
    const profile: CopilotTenantProfile = {
      ...input,
      enabledAgents: [...input.enabledAgents], // defensive copy
      createdAt:     now,
      updatedAt:     now,
    };
    this._byId.set(profile.id, profile);
    this._byOrgSlug.set(profile.orgSlug, profile.id);
    return { ...profile };
  }

  async updateProfile(id: string, updates: UpdateProfileInput): Promise<CopilotTenantProfile | null> {
    const existing = this._byId.get(id);
    if (!existing) return null;

    const updated: CopilotTenantProfile = {
      ...existing,
      ...updates,
      // Immutable fields — never overwrite
      id:        existing.id,
      orgSlug:   existing.orgSlug,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      // Defensive copy of arrays if updated
      enabledAgents: updates.enabledAgents
        ? [...updates.enabledAgents]
        : [...existing.enabledAgents],
    };

    this._byId.set(id, updated);
    return { ...updated };
  }

  async getProfile(id: string): Promise<CopilotTenantProfile | null> {
    const profile = this._byId.get(id);
    return profile ? { ...profile } : null;
  }

  async getProfileByOrgSlug(orgSlug: string): Promise<CopilotTenantProfile | null> {
    const id = this._byOrgSlug.get(orgSlug);
    if (!id) return null;
    return this.getProfile(id);
  }

  async deleteProfile(id: string): Promise<boolean> {
    const existing = this._byId.get(id);
    if (!existing) return false;
    this._byId.delete(id);
    this._byOrgSlug.delete(existing.orgSlug);
    return true;
  }

  async listProfiles(options?: { enabledOnly?: boolean }): Promise<CopilotTenantProfile[]> {
    const all = Array.from(this._byId.values()).map(p => ({ ...p }));
    if (options?.enabledOnly) return all.filter(p => p.enabled);
    return all;
  }

  /** Test/debug helper: count of stored profiles. */
  count(): number {
    return this._byId.size;
  }

  /** Test/debug helper: clear all profiles. */
  clear(): void {
    this._byId.clear();
    this._byOrgSlug.clear();
  }
}

// ── Process-level singleton ────────────────────────────────────────────────────

export const defaultProfileRepository: CopilotProfileRepository =
  new InMemoryCopilotProfileRepository();
