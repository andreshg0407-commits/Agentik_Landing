/**
 * lib/copilot/playbooks/playbook-repository.ts
 *
 * Agentik — Copilot Playbooks — Repository Contract
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Pure interface contract for playbook persistence.
 * No Prisma. No implementation. Just the contract.
 *
 * Current implementation: InMemoryPlaybookRepository
 * Future implementation:  PrismaPlaybookRepository (AGENTIK-COPILOT-PLAYBOOKS-PERSIST-01)
 */

import type {
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookSearchOptions,
  PlaybookCategory,
} from "./playbook-types";

// ── Repository interface ───────────────────────────────────────────────────────

/**
 * PlaybookRepository — persistence contract for Copilot operational playbooks.
 *
 * All methods are async to support both in-memory and DB implementations.
 * All methods NEVER throw — return null/false/empty on failure.
 * All queries are scoped to orgSlug — cross-tenant access is impossible.
 */
export interface PlaybookRepository {
  /**
   * Create a new playbook for a tenant.
   * Status defaults to ACTIVE.
   */
  createPlaybook(input: CreatePlaybookInput): Promise<Playbook>;

  /**
   * Update fields on an existing playbook.
   * Returns the updated playbook, or null if not found.
   */
  updatePlaybook(id: string, updates: UpdatePlaybookInput): Promise<Playbook | null>;

  /**
   * Archive a playbook (sets status = ARCHIVED).
   * Archived playbooks are excluded from all retrieval.
   * Returns true if archived, false if not found.
   */
  archivePlaybook(id: string): Promise<boolean>;

  /**
   * Retrieve a playbook by ID.
   * Returns null if not found or ARCHIVED.
   */
  getPlaybook(id: string): Promise<Playbook | null>;

  /**
   * List all ACTIVE playbooks for a tenant, ordered by priority DESC, updatedAt DESC.
   */
  listPlaybooks(
    orgSlug: string,
    options?: Pick<PlaybookSearchOptions, "limit">,
  ): Promise<Playbook[]>;

  /**
   * Search playbooks for a tenant using filters from PlaybookSearchOptions.
   * All filters are ANDed.
   * Results ordered by priority DESC, updatedAt DESC.
   */
  searchPlaybooks(orgSlug: string, options: PlaybookSearchOptions): Promise<Playbook[]>;

  /**
   * Find all ACTIVE playbooks for a tenant in a specific category.
   */
  findByCategory(orgSlug: string, category: PlaybookCategory, limit?: number): Promise<Playbook[]>;

  /**
   * Find ACTIVE playbooks for a tenant that have ALL of the specified tags.
   */
  findByTags(orgSlug: string, tags: string[], limit?: number): Promise<Playbook[]>;

  /**
   * Count ACTIVE playbooks for a tenant.
   */
  countPlaybooks(orgSlug: string): Promise<number>;

  /**
   * Remove all playbooks for a tenant. Use only in tests.
   */
  clearPlaybooks(orgSlug: string): Promise<void>;
}
