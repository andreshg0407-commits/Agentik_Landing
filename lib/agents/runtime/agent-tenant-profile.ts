/**
 * lib/agents/runtime/agent-tenant-profile.ts
 *
 * Agentik — Universal Agent Runtime — Tenant Agent Profile
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Per-tenant configuration overlay for a registered agent.
 * Allows tenants to customize display name, avatar, tone, and instructions
 * without changing the immutable AgentDefinition (which uses the semantic ID).
 *
 * agentId ALWAYS references the semantic ID: "finance_agent", "marketing_agent", etc.
 * displayName is the cosmetic label shown in UI — tenant-overridable.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentId } from "./agent-types";

// ── Tone ──────────────────────────────────────────────────────────────────────

export type AgentTone =
  | "formal"
  | "friendly"
  | "concise"
  | "detailed"
  | "neutral";

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * AgentTenantProfile — tenant-specific overlay for an agent.
 *
 * Applied on top of the AgentDefinition at runtime:
 *   - displayName overrides AgentDefinition.displayName
 *   - systemPrompt overrides AgentDefinition.systemPrompt
 *   - All other fields are additive
 *
 * Stored per (orgSlug, agentId) pair.
 */
export interface AgentTenantProfile {
  /** Tenant this profile applies to. */
  orgSlug:              string;
  /** Semantic agent ID — NEVER a display name. Must match AgentDefinition.id. */
  agentId:              AgentId;
  /** Tenant-defined display name. Overrides AgentDefinition.displayName. */
  displayName?:         string;
  /** Tenant-defined avatar URL. */
  avatarUrl?:           string;
  /** Tone preference for this agent in this tenant. */
  tone?:                AgentTone;
  /** Tenant-specific system prompt suffix appended to the base prompt. */
  systemPromptSuffix?:  string;
  /** Whether this agent is enabled for this tenant. Defaults to true. */
  enabled:              boolean;
  /** Tenant-authored custom instructions (plain text, max 2000 chars). */
  customInstructions?:  string;
  /** Extra tenant metadata: billing tier, feature flags, etc. */
  metadata?:            Record<string, unknown>;
  /** When this profile was last modified. */
  updatedAt?:           string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAgentTenantProfile(
  orgSlug:  string,
  agentId:  AgentId,
  overrides?: Partial<Omit<AgentTenantProfile, "orgSlug" | "agentId">>,
): AgentTenantProfile {
  return {
    orgSlug,
    agentId,
    enabled:   true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── In-memory registry ────────────────────────────────────────────────────────
//
// Current implementation is in-memory only.
// Persistence will be added in AGENTIK-TENANT-AGENT-PROFILES-01.
// Do NOT rely on this registry as a permanent data store — it resets on process restart.

const _profiles = new Map<string, AgentTenantProfile>();

function profileKey(orgSlug: string, agentId: AgentId): string {
  return `${orgSlug}:${agentId}`;
}

/**
 * Register or update a tenant profile.
 */
export function setAgentTenantProfile(profile: AgentTenantProfile): void {
  _profiles.set(profileKey(profile.orgSlug, profile.agentId), {
    ...profile,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Retrieve the tenant profile for an agent, or null if not configured.
 */
export function getAgentTenantProfile(
  orgSlug: string,
  agentId: AgentId,
): AgentTenantProfile | null {
  return _profiles.get(profileKey(orgSlug, agentId)) ?? null;
}

/**
 * Apply a tenant profile to an agent's display name and system prompt.
 * Returns the effective display name and prompt for this org.
 */
export function resolveAgentDisplayName(
  orgSlug:        string,
  agentId:        AgentId,
  baseDisplayName: string,
): string {
  const profile = getAgentTenantProfile(orgSlug, agentId);
  return profile?.displayName ?? baseDisplayName;
}
