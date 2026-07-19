/**
 * lib/copilot/memory/strategic-memory-manager.ts
 *
 * Agentik — Copilot Memory Engine — Strategic Memory Manager
 * Sprint: AGENTIK-COPILOT-MEMORY-ENGINE-01
 *
 * Domain service that orchestrates memory storage with classification,
 * governance checks, and audit trail.
 *
 * This is the primary write interface for the Copilot Memory Engine.
 * Never call the repository directly — always go through this manager.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type { MemoryRepository }           from "./memory-repository";
import type { MemoryEntry, CreateMemoryInput } from "./memory-types";
import { classifyMemory, shouldStoreMemory } from "./memory-classifier";
import {
  canStoreMemory,
  globalMemoryAuditLog,
  auditMemoryCreated,
  auditMemoryUpdated,
  auditMemoryDeleted,
  auditMemoryClassified,
  auditMemoryRejected,
} from "./memory-audit";
import { defaultMemoryRepository }          from "./in-memory-memory-repository";

// ── Manager result types ──────────────────────────────────────────────────────

export interface MemoryStoreResult {
  stored:  boolean;
  entry?:  MemoryEntry;
  reason?: string; // rejection reason when stored=false
}

// ── Manager ───────────────────────────────────────────────────────────────────

// DEBT(quota): Memory quota enforcement not yet implemented. Add in AGENTIK-COPILOT-MEMORY-QUOTA-01.
// DEBT(acls): Access control lists not yet implemented. Add in AGENTIK-COPILOT-MEMORY-ACLS-01.
// DEBT(expire): Memory expiration policy not yet implemented. Add in AGENTIK-COPILOT-MEMORY-EXPIRE-01.
export class StrategicMemoryManager {
  constructor(private readonly repo: MemoryRepository = defaultMemoryRepository) {}

  // ── Write operations ────────────────────────────────────────────────────────

  /**
   * Record a strategic fact about a tenant.
   *
   * Examples:
   *   - "Castillitos usa SAG para facturación"
   *   - "La línea bebé es la línea prioritaria del tenant"
   *   - "PagosNet está pendiente de integración"
   *
   * Always classified as STRATEGIC.
   * Source = "copilot" unless overridden.
   */
  async recordStrategicFact(
    orgSlug: string,
    title:   string,
    content: string,
    options?: { tags?: string[]; source?: string; moduleId?: string },
  ): Promise<MemoryStoreResult> {
    return this._store(orgSlug, content, {
      type:       "STRATEGIC",
      title,
      tags:       options?.tags,
      source:     options?.source ?? "copilot",
      moduleId:   options?.moduleId,
    });
  }

  /**
   * Record a tenant or user preference.
   *
   * Examples:
   *   - "Andrés prefiere agentes especializados por módulo"
   *   - "El tenant prefiere resúmenes cortos"
   */
  async recordPreference(
    orgSlug: string,
    title:   string,
    content: string,
    options?: { tags?: string[]; source?: string },
  ): Promise<MemoryStoreResult> {
    return this._store(orgSlug, content, {
      type:   "PREFERENCE",
      title,
      tags:   options?.tags,
      source: options?.source ?? "copilot",
    });
  }

  /**
   * Record a behavioral pattern or learning.
   *
   * Examples:
   *   - "Cuando hay facturas vencidas > 30 días, escalar a Mila"
   *   - "Agentik usa AI Layer como capa central de IA"
   */
  async recordLearning(
    orgSlug: string,
    title:   string,
    content: string,
    options?: { tags?: string[]; source?: string },
  ): Promise<MemoryStoreResult> {
    return this._store(orgSlug, content, {
      type:   "LEARNING",
      title,
      tags:   options?.tags,
      source: options?.source ?? "copilot",
    });
  }

  /**
   * Record an operational fact (status, progress, module state).
   *
   * Examples:
   *   - "Cierre de mayo 2026 está en proceso"
   *   - "Conciliación de junio completada"
   */
  async recordOperationalFact(
    orgSlug:  string,
    title:    string,
    content:  string,
    options?: { tags?: string[]; source?: string; moduleId?: string },
  ): Promise<MemoryStoreResult> {
    return this._store(orgSlug, content, {
      type:     "OPERATIONAL",
      title,
      tags:     options?.tags,
      source:   options?.source ?? "copilot",
      moduleId: options?.moduleId,
    });
  }

  /**
   * Store arbitrary content, auto-classifying type and importance.
   * Use when the caller doesn't know the type in advance.
   */
  async recordAutoClassified(
    orgSlug: string,
    title:   string,
    content: string,
    source?:  string,
  ): Promise<MemoryStoreResult> {
    return this._store(orgSlug, content, { title, source: source ?? "copilot" });
  }

  // ── Update and delete ────────────────────────────────────────────────────────

  /**
   * Update an existing memory entry.
   * Validates orgSlug ownership before applying changes — cross-tenant mutations are rejected.
   * Returns the updated entry, or null if not found or orgSlug mismatch.
   */
  async updateMemory(
    orgSlug:  string,
    id:       string,
    updates:  { title?: string; content?: string; tags?: string[] },
  ): Promise<MemoryEntry | null> {
    // Tenant isolation: verify entry belongs to this org before updating
    const existing = await this.repo.getMemory(id);
    if (!existing || existing.orgSlug !== orgSlug) return null;

    const updated = await this.repo.updateMemory(id, updates);
    if (updated) {
      const fields = Object.keys(updates).filter(k => updates[k as keyof typeof updates] !== undefined);
      globalMemoryAuditLog.push(auditMemoryUpdated(orgSlug, id, fields));
    }
    return updated;
  }

  /**
   * Delete a memory entry by ID.
   * Validates orgSlug ownership before deleting — cross-tenant deletions are rejected.
   * Returns true if deleted.
   */
  async deleteMemory(orgSlug: string, id: string): Promise<boolean> {
    // Tenant isolation: verify entry belongs to this org before deleting
    const entry = await this.repo.getMemory(id);
    if (!entry || entry.orgSlug !== orgSlug) return false;

    const deleted = await this.repo.deleteMemory(id);
    if (deleted) {
      globalMemoryAuditLog.push(auditMemoryDeleted(orgSlug, id, entry.title));
    }
    return deleted;
  }

  // ── Core store logic ─────────────────────────────────────────────────────────

  private async _store(
    orgSlug: string,
    content: string,
    hints:   { type?: CreateMemoryInput["type"]; title: string; tags?: string[]; source?: string; moduleId?: string; agentId?: string },
  ): Promise<MemoryStoreResult> {
    // Governance check
    if (!canStoreMemory(orgSlug)) {
      globalMemoryAuditLog.push(auditMemoryRejected(orgSlug, "memory quota exceeded", content));
      return { stored: false, reason: "memory quota exceeded" };
    }

    // Classify content
    const classification = classifyMemory(content);
    globalMemoryAuditLog.push(auditMemoryClassified(
      orgSlug,
      classification.type,
      classification.importance,
      classification.shouldStore,
      content,
    ));

    if (!classification.shouldStore) {
      globalMemoryAuditLog.push(auditMemoryRejected(orgSlug, classification.rejectReason ?? "trivial content", content));
      return { stored: false, reason: classification.rejectReason ?? "trivial content" };
    }

    // Merge tags: explicit + suggested by classifier
    const mergedTags = Array.from(new Set([
      ...(hints.tags ?? []),
      ...classification.suggestedTags,
    ]));

    // Determine effective type (hint overrides classifier)
    const effectiveType = hints.type ?? classification.type;

    // DEBT(importance): Promote importance when type is overridden to STRATEGIC but
    // classifier assigned MEDIUM (e.g. "pendiente de integración" scores OPERATIONAL).
    // STRATEGIC facts are always at least HIGH — same rule as in the classifier.
    let effectiveImportance = classification.importance;
    if (effectiveType === "STRATEGIC" && effectiveImportance === "MEDIUM") {
      effectiveImportance = "HIGH";
    }

    const input: CreateMemoryInput = {
      orgSlug,
      type:       effectiveType,
      scope:      classification.scope,
      importance: effectiveImportance,
      title:      hints.title,
      content,
      tags:       mergedTags,
      source:     hints.source ?? "copilot",
      moduleId:   hints.moduleId,
      agentId:    hints.agentId,
    };

    const entry = await this.repo.saveMemory(input);
    globalMemoryAuditLog.push(auditMemoryCreated(
      orgSlug,
      entry.id,
      entry.title,
      entry.type,
      entry.importance,
      entry.source,
    ));

    return { stored: true, entry };
  }
}

// ── Default manager singleton ─────────────────────────────────────────────────

/**
 * Process-level manager instance backed by the default in-memory repository.
 * Shared across the Copilot intelligence pipeline and integration harness.
 */
export const defaultMemoryManager = new StrategicMemoryManager(defaultMemoryRepository);
