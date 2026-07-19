/**
 * lib/security/audit-persistence/persistence/prisma-audit-repository.ts
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Persistent Security Audit — Prisma Repository Implementation
 *
 * Implements AuditRepository using Prisma + PostgreSQL.
 * All persistence passes through this class.
 *
 * Design:
 *   - Never throws into callers — all errors caught, logged to stderr, return null/0
 *   - Tenant isolation: every query filters by orgSlug
 *   - Append-only: no update or delete operations
 *   - NEVER stores secret values, tokens, certificates, or passwords
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * Uses (prisma as any).securityAuditEvent until Prisma client regenerated.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { createPersistentAuditEvent } from "../audit-event-types";
import type { AuditRepository, AuditQueryOptions, AuditCountOptions } from "../audit-repository";
import type {
  PersistentSecurityAuditEvent,
  PersistentAuditEventInput,
  PersistentAuditCategory,
  PersistentAuditSeverity,
} from "../audit-event-types";

// ── DB row → domain mapper ────────────────────────────────────────────────────

function rowToEvent(row: any): PersistentSecurityAuditEvent {
  return {
    id:        row.id,
    orgSlug:   row.orgSlug,
    eventType: row.eventType,
    category:  row.category,
    severity:  row.severity,
    resource:  (row.resourceId || row.resourceType || row.resourceName)
      ? {
          id:   row.resourceId   ?? "unknown",
          type: row.resourceType ?? "UNKNOWN",
          name: row.resourceName ?? undefined,
        }
      : undefined,
    actor: (row.actorId || row.actorType)
      ? {
          id:   row.actorId   ?? "unknown",
          type: row.actorType ?? "SYSTEM",
          name: row.actorName ?? undefined,
        }
      : undefined,
    metadata:  (typeof row.metadata === "object" && row.metadata !== null)
      ? (row.metadata as Record<string, unknown>)
      : {},
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  };
}

// ── Input → Prisma data ───────────────────────────────────────────────────────

function inputToData(event: PersistentSecurityAuditEvent): Record<string, unknown> {
  return {
    id:           event.id,
    orgSlug:      event.orgSlug,
    eventType:    event.eventType,
    category:     event.category,
    severity:     event.severity,
    resourceId:   event.resource?.id   ?? null,
    resourceType: event.resource?.type ?? null,
    resourceName: event.resource?.name ?? null,
    actorId:      event.actor?.id      ?? null,
    actorType:    event.actor?.type    ?? null,
    actorName:    event.actor?.name    ?? null,
    metadata:     event.metadata,
    // createdAt: managed by Prisma @default(now())
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaAuditRepository implements AuditRepository {
  private get db() {
    return (prisma as any).securityAuditEvent;
  }

  async appendEvent(
    input: PersistentAuditEventInput,
  ): Promise<PersistentSecurityAuditEvent | null> {
    try {
      const event = createPersistentAuditEvent(input);
      const row   = await this.db.create({ data: inputToData(event) });
      return rowToEvent(row);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] appendEvent failed: ${e?.message ?? e}\n`);
      return null;
    }
  }

  async appendMany(inputs: PersistentAuditEventInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    let count = 0;
    for (const input of inputs) {
      const result = await this.appendEvent(input);
      if (result !== null) count++;
    }
    return count;
  }

  async findById(id: string): Promise<PersistentSecurityAuditEvent | null> {
    try {
      const row = await this.db.findUnique({ where: { id } });
      return row ? rowToEvent(row) : null;
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findById failed: ${e?.message ?? e}\n`);
      return null;
    }
  }

  async findByTenant(
    orgSlug:  string,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const where: any = { orgSlug };
      if (options?.eventType) where.eventType = options.eventType;
      if (options?.after || options?.before) {
        where.createdAt = {};
        if (options.after)  where.createdAt.gte = new Date(options.after);
        if (options.before) where.createdAt.lte = new Date(options.before);
      }
      const rows = await this.db.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    Math.min(options?.limit ?? 50, 500),
      });
      return rows.map(rowToEvent);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findByTenant failed: ${e?.message ?? e}\n`);
      return [];
    }
  }

  async findByCategory(
    orgSlug:  string,
    category: PersistentAuditCategory,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const where: any = { orgSlug, category };
      if (options?.after || options?.before) {
        where.createdAt = {};
        if (options.after)  where.createdAt.gte = new Date(options.after);
        if (options.before) where.createdAt.lte = new Date(options.before);
      }
      const rows = await this.db.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    Math.min(options?.limit ?? 50, 500),
      });
      return rows.map(rowToEvent);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findByCategory failed: ${e?.message ?? e}\n`);
      return [];
    }
  }

  async findBySeverity(
    orgSlug:  string,
    severity: PersistentAuditSeverity,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const where: any = { orgSlug, severity };
      if (options?.after || options?.before) {
        where.createdAt = {};
        if (options.after)  where.createdAt.gte = new Date(options.after);
        if (options.before) where.createdAt.lte = new Date(options.before);
      }
      const rows = await this.db.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    Math.min(options?.limit ?? 50, 500),
      });
      return rows.map(rowToEvent);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findBySeverity failed: ${e?.message ?? e}\n`);
      return [];
    }
  }

  async findByDateRange(
    orgSlug:  string,
    after:    string,
    before:   string,
    options?: AuditQueryOptions,
  ): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const rows = await this.db.findMany({
        where: {
          orgSlug,
          createdAt: { gte: new Date(after), lte: new Date(before) },
          ...(options?.eventType ? { eventType: options.eventType } : {}),
        },
        orderBy: { createdAt: "desc" },
        take:    Math.min(options?.limit ?? 50, 500),
      });
      return rows.map(rowToEvent);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findByDateRange failed: ${e?.message ?? e}\n`);
      return [];
    }
  }

  async findRecent(orgSlug: string, limit = 20): Promise<PersistentSecurityAuditEvent[]> {
    try {
      const rows = await this.db.findMany({
        where:   { orgSlug },
        orderBy: { createdAt: "desc" },
        take:    Math.min(limit, 500),
      });
      return rows.map(rowToEvent);
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] findRecent failed: ${e?.message ?? e}\n`);
      return [];
    }
  }

  async countEvents(orgSlug: string, options?: AuditCountOptions): Promise<number> {
    try {
      const where: any = { orgSlug };
      if (options?.category) where.category = options.category;
      if (options?.severity) where.severity = options.severity;
      if (options?.after || options?.before) {
        where.createdAt = {};
        if (options.after)  where.createdAt.gte = new Date(options.after);
        if (options.before) where.createdAt.lte = new Date(options.before);
      }
      return await this.db.count({ where });
    } catch (e: any) {
      process.stderr.write(`[AUDIT_REPO] countEvents failed: ${e?.message ?? e}\n`);
      return 0;
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: PrismaAuditRepository | null = null;

export function getPrismaAuditRepository(): PrismaAuditRepository {
  if (!_instance) _instance = new PrismaAuditRepository();
  return _instance;
}
