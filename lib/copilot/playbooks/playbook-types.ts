/**
 * lib/copilot/playbooks/playbook-types.ts
 *
 * Agentik — Copilot Playbooks — Domain Types
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Core domain types for the Playbooks layer.
 * A Playbook represents structured operational knowledge — how the company works,
 * not just what Agentik knows (that's the Memory Engine).
 *
 * All types are:
 *   - JSON serializable (no Date objects, no class instances)
 *   - Multi-tenant by design (every object carries orgSlug)
 *   - Pure domain — no Prisma, no React, no Next.js, no server-only
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

/**
 * Business domain category for a playbook.
 * Drives retrieval — Copilot filters playbooks by intent-to-category mapping.
 */
export type PlaybookCategory =
  | "SALES"
  | "MARKETING"
  | "FINANCE"
  | "COLLECTIONS"
  | "OPERATIONS"
  | "CUSTOMER_SERVICE"
  | "EXECUTIVE"
  | "CUSTOM";

/**
 * Execution priority — higher priority playbooks surface first in context.
 */
export type PlaybookPriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

/**
 * Lifecycle status of a playbook.
 * DRAFT    — in progress, not yet used by Copilot
 * ACTIVE   — live, included in Copilot context
 * ARCHIVED — retired, excluded from all retrieval
 */
export type PlaybookStatus =
  | "ACTIVE"
  | "DRAFT"
  | "ARCHIVED";

// ── Step ──────────────────────────────────────────────────────────────────────

/**
 * A single step in a playbook procedure.
 *
 * Steps are ordered (index is 1-based), plain-text instructions.
 * Optional ownerRole allows attributing steps to a specific role/agent.
 */
export interface PlaybookStep {
  /** 1-based position in the sequence. */
  index:       number;
  /** Short action label, e.g. "Verificar saldo bancario". */
  title:       string;
  /** Full description of what to do in this step. */
  description: string;
  /** Optional role or agent responsible for this step. */
  ownerRole?:  string;
  /** Optional trigger condition — when is this step activated. */
  condition?:  string;
}

// ── Playbook ──────────────────────────────────────────────────────────────────

/**
 * A Playbook is a reusable operational procedure for a tenant.
 *
 * Examples:
 *   - "Proceso de cierre mensual" (FINANCE/CRITICAL)
 *   - "Proceso de cobranza" (COLLECTIONS/HIGH)
 *   - "Lanzamiento de campaña social" (MARKETING/MEDIUM)
 *   - "Atención a cliente VIP" (CUSTOMER_SERVICE/HIGH)
 */
export interface Playbook {
  /** Unique identifier (CUID or UUID). */
  id:          string;
  /** Tenant that owns this playbook. */
  orgSlug:     string;
  /** Human-readable title. Max 120 chars. */
  title:       string;
  /** One-sentence description of purpose. Max 300 chars. */
  description: string;
  /** Business domain category. */
  category:    PlaybookCategory;
  /** Execution priority — used for ordering in Copilot context. */
  priority:    PlaybookPriority;
  /** Lifecycle status — only ACTIVE playbooks appear in Copilot context. */
  status:      PlaybookStatus;
  /** Normalized lowercase tags for search and retrieval. */
  tags:        string[];
  /** Ordered procedure steps. */
  steps:       PlaybookStep[];
  /** Who created or last modified this playbook (free-form label). */
  author?:     string;
  /** ISO 8601. */
  createdAt:   string;
  /** ISO 8601. */
  updatedAt:   string;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreatePlaybookInput {
  orgSlug:     string;
  title:       string;
  description: string;
  category:    PlaybookCategory;
  priority:    PlaybookPriority;
  tags?:       string[];
  steps?:      PlaybookStep[];
  author?:     string;
}

export interface UpdatePlaybookInput {
  title?:       string;
  description?: string;
  category?:    PlaybookCategory;
  priority?:    PlaybookPriority;
  status?:      PlaybookStatus;
  tags?:        string[];
  steps?:       PlaybookStep[];
  author?:      string;
}

export interface PlaybookSearchOptions {
  /** Filter by category. */
  category?:  PlaybookCategory;
  /** Filter by priority (minimum). */
  priority?:  PlaybookPriority;
  /** Filter by status. Default: ACTIVE only. */
  status?:    PlaybookStatus;
  /** Filter entries that have ALL of the given tags. */
  tags?:      string[];
  /** Full-text query against title + description. */
  query?:     string;
  /** Max results. Default: 10. */
  limit?:     number;
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * PlaybookContext — result of a retrieval pass.
 * Attached to CopilotResponse when relevant playbooks were found.
 */
export interface PlaybookContext {
  orgSlug:       string;
  playbooks:     Playbook[];
  /** ISO 8601 timestamp of when this context was assembled. */
  retrievedAt:   string;
  /** Number of additional matching playbooks not included due to limit. */
  overflow:      number;
}

// ── Priority ordering ─────────────────────────────────────────────────────────

export const PLAYBOOK_PRIORITY_RANK: Record<PlaybookPriority, number> = {
  CRITICAL: 3,
  HIGH:     2,
  MEDIUM:   1,
  LOW:      0,
};

/**
 * Returns true when `a` has at least the priority level of `min`.
 */
export function priorityAtLeast(a: PlaybookPriority, min: PlaybookPriority): boolean {
  return PLAYBOOK_PRIORITY_RANK[a] >= PLAYBOOK_PRIORITY_RANK[min];
}

/**
 * Sort comparator: higher priority first, then most-recently-updated first.
 */
export function sortByPriorityThenDate(a: Playbook, b: Playbook): number {
  const diff = PLAYBOOK_PRIORITY_RANK[b.priority] - PLAYBOOK_PRIORITY_RANK[a.priority];
  return diff !== 0 ? diff : b.updatedAt.localeCompare(a.updatedAt);
}
