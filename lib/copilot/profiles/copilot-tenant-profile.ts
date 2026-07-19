/**
 * lib/copilot/profiles/copilot-tenant-profile.ts
 *
 * Agentik — Copilot Tenant Profiles — Domain Type
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * CopilotTenantProfile is the authoritative per-tenant identity contract.
 * It separates WHAT the Copilot is called (displayName) from WHO it IS (id).
 *
 * ARCHITECTURE RULE:
 *   - `id` is immutable and must NEVER be a display name.
 *   - `displayName` is a user-facing label that can change at any time.
 *   - The motor (agents, executor, planner) always uses AgentId — never displayName.
 *
 * Example:
 *   id:          "agentik_copilot"   ← immutable identifier
 *   displayName: "Yumeko"            ← visible label, can change
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { AgentId }             from "@/lib/agents/runtime/agent-types";
import type { ExecutiveStyle }      from "./copilot-executive-style";
import type { CopilotBranding }     from "./copilot-branding";
import type { CopilotMemoryPolicy } from "./copilot-memory-policy";
import type { CopilotAutonomyPolicy } from "./copilot-autonomy-policy";

// ── Tone ──────────────────────────────────────────────────────────────────────

/**
 * How the Copilot communicates with users.
 *
 * FORMAL    — professional, structured, no colloquialisms.
 * DIRECT    — brief, action-oriented, no filler.
 * FRIENDLY  — conversational, warm, approachable.
 * TECHNICAL — precise, domain-specific terminology, data-heavy.
 */
export type CopilotTone = "FORMAL" | "DIRECT" | "FRIENDLY" | "TECHNICAL";

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * CopilotTenantProfile — per-tenant Copilot identity and policy container.
 *
 * All fields are JSON-serializable.
 * This type travels through the request pipeline as read-only context.
 */
export interface CopilotTenantProfile {
  /**
   * Immutable internal identifier.
   * Format: "{slug}_copilot" or custom stable ID.
   * NEVER set this to a display name.
   */
  id:              string;
  /** Tenant org slug this profile belongs to. */
  orgSlug:         string;
  /** When false, the Copilot is disabled for this tenant. Falls back to default. */
  enabled:         boolean;
  /**
   * Visible name shown in the UI.
   * Can change at any time without affecting internal behavior.
   * Examples: "Yumeko", "Asistente Castillitos", "Copilot"
   */
  displayName:     string;
  /** Optional URL to the Copilot's avatar image. */
  avatar?:         string;
  /** How the Copilot communicates. */
  tone:            CopilotTone;
  /**
   * Primary language for responses.
   * ISO 639-1 code: "es", "en", "pt", etc.
   */
  language:        string;
  /** Executive communication style. */
  executiveStyle:  ExecutiveStyle;
  /** Visual branding overrides for this tenant. */
  branding:        CopilotBranding;
  /**
   * Subset of agents enabled for this tenant.
   * Empty array = all agents in the registry are available.
   * DEBT: wire enabledAgents filter into selectAgentsForIntent — AGENTIK-PROFILE-AGENT-FILTER-01
   */
  enabledAgents:   AgentId[];
  /** Memory storage policy for this tenant. */
  memoryPolicy:    CopilotMemoryPolicy;
  /** Autonomy policy for this tenant. */
  autonomyPolicy:  CopilotAutonomyPolicy;
  /** ISO 8601 timestamp when this profile was created. */
  createdAt:       string;
  /** ISO 8601 timestamp when this profile was last updated. */
  updatedAt:       string;
}

// ── ID generator ──────────────────────────────────────────────────────────────

/**
 * Derive a stable internal profile ID from an orgSlug.
 * e.g. "castillitos" → "castillitos_copilot"
 */
export function buildProfileId(orgSlug: string): string {
  return `${orgSlug}_copilot`;
}

// ── Guard ─────────────────────────────────────────────────────────────────────

/** True if the profile is active and usable. */
export function isProfileEnabled(profile: CopilotTenantProfile): boolean {
  return profile.enabled;
}

/** True if the profile has custom agents configured. */
export function hasCustomAgents(profile: CopilotTenantProfile): boolean {
  return profile.enabledAgents.length > 0;
}
