/**
 * lib/security/audit-persistence/persistent-audit-service.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Audit Service
 *
 * Orchestrates persistence, validation, serialization, and tenant enforcement
 * for security audit events.
 *
 * Responsibilities:
 *   - Validate input (orgSlug required, metadata serializable)
 *   - Enforce tenant scope on all queries
 *   - Delegate persistence to AuditRepository
 *   - Never store secret values
 *
 * Fail-safe: never throws into callers.
 * No business logic. No rules engine.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import type { AuditRepository, AuditQueryOptions, AuditCountOptions } from "./audit-repository";
import type {
  PersistentSecurityAuditEvent,
  PersistentAuditEventInput,
  PersistentAuditCategory,
  PersistentAuditSeverity,
} from "./audit-event-types";

// ── Service ───────────────────────────────────────────────────────────────────

export class PersistentAuditService {
  constructor(private readonly repo: AuditRepository) {}

  // ── Write operations ──────────────────────────────────────────────────────

  /**
   * Record a single audit event.
   * Never throws. Returns the persisted event, or null on failure.
   */
  async recordEvent(
    input: PersistentAuditEventInput,
  ): Promise<PersistentSecurityAuditEvent | null> {
    try {
      if (!input.orgSlug) {
        process.stderr.write("[AUDIT_SVC] recordEvent: orgSlug required\n");
        return null;
      }
      const safe = sanitizeInput(input);
      return await this.repo.appendEvent(safe);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_SVC] recordEvent failed: ${e?.message ?? e}\n`);
      return null;
    }
  }

  /**
   * Record multiple audit events in one batch.
   * Never throws. Returns count of successfully persisted events.
   */
  async recordMany(inputs: PersistentAuditEventInput[]): Promise<number> {
    try {
      if (!Array.isArray(inputs) || inputs.length === 0) return 0;
      const valid = inputs
        .filter(i => !!i.orgSlug)
        .map(sanitizeInput);
      return await this.repo.appendMany(valid);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_SVC] recordMany failed: ${e?.message ?? e}\n`);
      return 0;
    }
  }

  // ── Read operations ───────────────────────────────────────────────────────

  /**
   * Query events for a tenant.
   * Never throws. Returns empty array on failure.
   */
  async queryEvents(
    orgSlug:  string,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      if (!orgSlug) return [];
      return await this.repo.findByTenant(orgSlug, options);
    } catch {
      return [];
    }
  }

  /**
   * Query the most recent events for a tenant.
   * Never throws.
   */
  async queryRecentEvents(
    orgSlug: string,
    limit    = 20,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      if (!orgSlug) return [];
      return await this.repo.findRecent(orgSlug, limit);
    } catch {
      return [];
    }
  }

  /**
   * Query events by category for a tenant.
   */
  async queryByCategory(
    orgSlug:  string,
    category: PersistentAuditCategory,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      if (!orgSlug) return [];
      return await this.repo.findByCategory(orgSlug, category, options);
    } catch {
      return [];
    }
  }

  /**
   * Query events by severity for a tenant.
   */
  async queryBySeverity(
    orgSlug:  string,
    severity: PersistentAuditSeverity,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      if (!orgSlug) return [];
      return await this.repo.findBySeverity(orgSlug, severity, options);
    } catch {
      return [];
    }
  }

  /**
   * Query events within a time range for a tenant.
   */
  async queryByDateRange(
    orgSlug: string,
    after:   string,
    before:  string,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      if (!orgSlug || !after || !before) return [];
      return await this.repo.findByDateRange(orgSlug, after, before, options);
    } catch {
      return [];
    }
  }

  /**
   * Count events for a tenant, optionally filtered.
   */
  async countEvents(orgSlug: string, options?: AuditCountOptions): Promise<number> {
    try {
      if (!orgSlug) return 0;
      return await this.repo.countEvents(orgSlug, options);
    } catch {
      return 0;
    }
  }

  /**
   * Find a single event by ID.
   */
  async findById(id: string): Promise<PersistentSecurityAuditEvent | null> {
    try {
      if (!id) return null;
      return await this.repo.findById(id);
    } catch {
      return null;
    }
  }
}

// ── Input sanitizer ───────────────────────────────────────────────────────────

/**
 * Sanitize input before persistence.
 * - Ensures metadata is serializable
 * - Strips any fields named "secret", "token", "password", "certificate"
 * - Preserves all other metadata fields
 */
function sanitizeInput(input: PersistentAuditEventInput): PersistentAuditEventInput {
  const safeMetadata = sanitizeMetadata(input.metadata ?? {});
  return { ...input, metadata: safeMetadata };
}

const FORBIDDEN_METADATA_KEYS = new Set([
  "secret", "token", "password", "certificate", "privateKey",
  "apiKey", "api_key", "accessToken", "access_token",
  "refreshToken", "refresh_token", "p12", "cert",
]);

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    // Ensure JSON-serializable: exclude functions, undefined, circular refs
    try {
      JSON.stringify(value);
      result[key] = value;
    } catch {
      result[key] = "[non-serializable]";
    }
  }
  return result;
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _service: PersistentAuditService | null = null;

export function getPersistentAuditService(): PersistentAuditService {
  if (!_service) {
    const { getPrismaAuditRepository } = require("./persistence/prisma-audit-repository");
    _service = new PersistentAuditService(getPrismaAuditRepository());
  }
  return _service;
}
