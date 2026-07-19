/**
 * lib/copilot/playbooks/strategic-playbook-manager.ts
 *
 * Agentik — Copilot Playbooks — Strategic Playbook Manager
 * Sprint: AGENTIK-COPILOT-PLAYBOOKS-01
 *
 * Domain service that orchestrates playbook storage with classification,
 * governance, tenant isolation, and audit trail.
 *
 * This is the primary write interface for the Playbooks layer.
 * Never call the repository directly from application code — always go
 * through this manager.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { PlaybookRepository }    from "./playbook-repository";
import type {
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookSearchOptions,
  PlaybookCategory,
} from "./playbook-types";
import {
  inferPlaybookCategory,
  inferPlaybookPriority,
}                                     from "./playbook-classifier";
import {
  globalPlaybookAuditLog,
  auditPlaybookCreated,
  auditPlaybookUpdated,
  auditPlaybookArchived,
}                                     from "./playbook-audit";
import { defaultPlaybookRepository }  from "./in-memory-playbook-repository";

// ── Result types ──────────────────────────────────────────────────────────────

export interface PlaybookCreateResult {
  created:   boolean;
  playbook?: Playbook;
  reason?:   string;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class StrategicPlaybookManager {
  constructor(private readonly repo: PlaybookRepository = defaultPlaybookRepository) {}

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Create a new playbook for a tenant.
   * If category or priority are not specified, they are inferred from the
   * title and description using the keyword classifier.
   */
  async createPlaybook(input: CreatePlaybookInput): Promise<PlaybookCreateResult> {
    // Validate required fields
    if (!input.orgSlug?.trim() || !input.title?.trim()) {
      return { created: false, reason: "orgSlug and title are required" };
    }

    // Infer missing metadata
    const category = input.category ?? inferPlaybookCategory(input.title, input.description);
    const priority = input.priority ?? inferPlaybookPriority(input.title, input.description);

    const playbook = await this.repo.createPlaybook({
      ...input,
      category,
      priority,
    });

    globalPlaybookAuditLog.push(auditPlaybookCreated(
      input.orgSlug,
      playbook.id,
      playbook.title,
      playbook.category,
      playbook.priority,
    ));

    return { created: true, playbook };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * Update an existing playbook.
   * Validates orgSlug ownership before applying changes.
   * Returns the updated playbook, or null if not found or orgSlug mismatch.
   */
  async updatePlaybook(
    orgSlug:  string,
    id:       string,
    updates:  UpdatePlaybookInput,
  ): Promise<Playbook | null> {
    // Tenant isolation: verify ownership before mutating
    const existing = await this.repo.getPlaybook(id);
    if (!existing || existing.orgSlug !== orgSlug) return null;

    const updated = await this.repo.updatePlaybook(id, updates);
    if (updated) {
      const fields = Object.keys(updates).filter(k => updates[k as keyof UpdatePlaybookInput] !== undefined);
      globalPlaybookAuditLog.push(auditPlaybookUpdated(orgSlug, id, fields));
    }
    return updated;
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  /**
   * Archive a playbook (logical delete).
   * Validates orgSlug ownership before archiving.
   * Returns true if archived, false if not found or orgSlug mismatch.
   */
  async archivePlaybook(orgSlug: string, id: string): Promise<boolean> {
    // Tenant isolation: verify ownership before archiving
    const existing = await this.repo.getPlaybook(id);
    if (!existing || existing.orgSlug !== orgSlug) return false;

    const archived = await this.repo.archivePlaybook(id);
    if (archived) {
      globalPlaybookAuditLog.push(auditPlaybookArchived(orgSlug, id, existing.title));
    }
    return archived;
  }

  // ── Read operations ───────────────────────────────────────────────────────

  /**
   * Retrieve a playbook by ID. Returns null if not found or ARCHIVED.
   */
  async getPlaybook(id: string): Promise<Playbook | null> {
    return this.repo.getPlaybook(id);
  }

  /**
   * List all ACTIVE playbooks for a tenant, ordered by priority then date.
   */
  async listPlaybooks(
    orgSlug: string,
    options?: Pick<PlaybookSearchOptions, "limit">,
  ): Promise<Playbook[]> {
    return this.repo.listPlaybooks(orgSlug, options);
  }

  /**
   * Search playbooks for a tenant with filters.
   */
  async searchPlaybooks(orgSlug: string, options: PlaybookSearchOptions): Promise<Playbook[]> {
    return this.repo.searchPlaybooks(orgSlug, options);
  }

  /**
   * Find all ACTIVE playbooks in a specific category.
   */
  async getByCategory(orgSlug: string, category: PlaybookCategory, limit?: number): Promise<Playbook[]> {
    return this.repo.findByCategory(orgSlug, category, limit);
  }

  /**
   * Find ACTIVE playbooks that have ALL of the specified tags.
   */
  async getByTags(orgSlug: string, tags: string[], limit?: number): Promise<Playbook[]> {
    return this.repo.findByTags(orgSlug, tags, limit);
  }

  /**
   * Count ACTIVE playbooks for a tenant.
   */
  async countPlaybooks(orgSlug: string): Promise<number> {
    return this.repo.countPlaybooks(orgSlug);
  }
}

// ── Default manager singleton ─────────────────────────────────────────────────

/**
 * Process-level manager instance backed by the default in-memory repository.
 * Shared across the playbook retrieval and intelligence pipeline.
 */
export const defaultPlaybookManager = new StrategicPlaybookManager(defaultPlaybookRepository);
