/**
 * lib/security/secret-rotation/persistence/prisma-rotation-repository.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Prisma Rotation Repository — Concrete Persistence Implementation
 *
 * Server-only. Implements RotationRepository using Prisma.
 * All rotation state changes are persisted here.
 *
 * Principles:
 *   - Append-first: prefer create over delete
 *   - Multi-tenant: all queries scoped to orgSlug
 *   - Never store secret values — metadata only
 *   - Fail-safe: all methods return null/[] on error
 */

import "server-only";

import type {
  RotationRepository,
  RotationRecord,
  CreateRotationInput,
  RotationQueryOptions,
} from "../rotation-repository";
import type { SecretRotationStatus } from "../rotation-types";
import { prisma } from "@/lib/prisma";

function getPrismaClient() { return prisma; }

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapRecord(raw: any): RotationRecord {
  return {
    id:           raw.id,
    orgSlug:      raw.orgSlug,
    secretId:     raw.secretId,
    strategy:     raw.strategy,
    status:       raw.status,
    requestedBy:  raw.requestedBy,
    approvedBy:   raw.approvedBy ?? undefined,
    reason:       raw.reason,
    metadata:     (raw.metadata as Record<string, string | number | boolean>) ?? {},
    createdAt:    raw.createdAt instanceof Date ? raw.createdAt.toISOString() : raw.createdAt,
    activatedAt:  raw.activatedAt instanceof Date ? raw.activatedAt.toISOString() : raw.activatedAt ?? undefined,
    revokedAt:    raw.revokedAt instanceof Date ? raw.revokedAt.toISOString() : raw.revokedAt ?? undefined,
    completedAt:  raw.completedAt instanceof Date ? raw.completedAt.toISOString() : raw.completedAt ?? undefined,
  };
}

// ── Repository Implementation ─────────────────────────────────────────────────

export class PrismaRotationRepository implements RotationRepository {

  async createRotation(input: CreateRotationInput): Promise<RotationRecord> {
    const prisma = getPrismaClient();
    const raw = await (prisma as any).secretRotation.create({
      data: {
        orgSlug:     input.orgSlug,
        secretId:    input.secretId,
        strategy:    input.strategy,
        status:      "PENDING",
        requestedBy: input.requestedBy,
        reason:      input.reason,
        metadata:    input.metadata ?? {},
      },
    });
    return mapRecord(raw);
  }

  async getRotation(id: string): Promise<RotationRecord | null> {
    try {
      const prisma = getPrismaClient();
      const raw = await (prisma as any).secretRotation.findUnique({ where: { id } });
      return raw ? mapRecord(raw) : null;
    } catch { return null; }
  }

  async updateStatus(
    id:     string,
    status: SecretRotationStatus,
    extra?: Partial<Pick<RotationRecord, "approvedBy" | "activatedAt" | "revokedAt" | "completedAt">>,
  ): Promise<RotationRecord | null> {
    try {
      const prisma = getPrismaClient();
      const data: Record<string, unknown> = { status };
      if (extra?.approvedBy)  data.approvedBy  = extra.approvedBy;
      if (extra?.activatedAt) data.activatedAt = new Date(extra.activatedAt);
      if (extra?.revokedAt)   data.revokedAt   = new Date(extra.revokedAt);
      if (extra?.completedAt) data.completedAt = new Date(extra.completedAt);
      const raw = await (prisma as any).secretRotation.update({ where: { id }, data });
      return mapRecord(raw);
    } catch { return null; }
  }

  async findBySecret(
    orgSlug:  string,
    secretId: string,
    options?: RotationQueryOptions,
  ): Promise<RotationRecord[]> {
    try {
      const prisma = getPrismaClient();
      const raws = await (prisma as any).secretRotation.findMany({
        where:   { orgSlug, secretId },
        orderBy: { createdAt: "desc" },
        take:    options?.limit  ?? 50,
        skip:    options?.offset ?? 0,
      });
      return raws.map(mapRecord);
    } catch { return []; }
  }

  async findByStatus(
    orgSlug:  string,
    status:   SecretRotationStatus,
    options?: RotationQueryOptions,
  ): Promise<RotationRecord[]> {
    try {
      const prisma = getPrismaClient();
      const raws = await (prisma as any).secretRotation.findMany({
        where:   { orgSlug, status },
        orderBy: { createdAt: "desc" },
        take:    options?.limit  ?? 50,
        skip:    options?.offset ?? 0,
      });
      return raws.map(mapRecord);
    } catch { return []; }
  }

  async findActiveRotations(orgSlug: string): Promise<RotationRecord[]> {
    try {
      const prisma = getPrismaClient();
      const raws = await (prisma as any).secretRotation.findMany({
        where:   { orgSlug, status: { in: ["PENDING", "VALIDATING", "READY", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
      });
      return raws.map(mapRecord);
    } catch { return []; }
  }

  async findFailedRotations(orgSlug: string, options?: RotationQueryOptions): Promise<RotationRecord[]> {
    try {
      const prisma = getPrismaClient();
      const raws = await (prisma as any).secretRotation.findMany({
        where:   { orgSlug, status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take:    options?.limit  ?? 50,
        skip:    options?.offset ?? 0,
      });
      return raws.map(mapRecord);
    } catch { return []; }
  }

  async countRotations(orgSlug: string, status?: SecretRotationStatus): Promise<number> {
    try {
      const prisma = getPrismaClient();
      const where: Record<string, unknown> = { orgSlug };
      if (status) where.status = status;
      return await (prisma as any).secretRotation.count({ where });
    } catch { return 0; }
  }

  async findLatestRotation(orgSlug: string, secretId: string): Promise<RotationRecord | null> {
    try {
      const prisma = getPrismaClient();
      const raw = await (prisma as any).secretRotation.findFirst({
        where:   { orgSlug, secretId },
        orderBy: { createdAt: "desc" },
      });
      return raw ? mapRecord(raw) : null;
    } catch { return null; }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: PrismaRotationRepository | null = null;

export function getPrismaRotationRepository(): PrismaRotationRepository {
  if (!_instance) _instance = new PrismaRotationRepository();
  return _instance;
}

export const prismaRotationRepository = new PrismaRotationRepository();
