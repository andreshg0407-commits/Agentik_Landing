/**
 * lib/security/kms/persistence/prisma-kms-repository.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Prisma Repository — PostgreSQL Persistence for Key Metadata
 *
 * Server-only. Implements KmsRepository using Prisma.
 *
 * CRITICAL:
 *   - Only metadata is persisted — NEVER key material
 *   - All operations are tenant-scoped (orgSlug required)
 *   - Cross-tenant access returns CRITICAL error
 *   - Fail-closed: Prisma errors → structured KmsResult
 *
 * Requires: KmsKey model in prisma/schema.prisma
 * (added in Phase 22 migration)
 */

import "server-only";

import type { KmsKeyMetadata } from "../kms-key";
import type { KmsKeyStatus, KmsResult } from "../kms-types";
import type { KmsRepository } from "../kms-repository";
import { prisma } from "@/lib/prisma";

// Prisma client is typed from the generated client.
// KmsKey model is available after running `prisma migrate dev` or `prisma generate`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ── PrismaKmsRepository ───────────────────────────────────────────────────────

export class PrismaKmsRepository implements KmsRepository {

  // ── saveKey ─────────────────────────────────────────────────────────────────

  async saveKey(metadata: KmsKeyMetadata): Promise<KmsResult<KmsKeyMetadata>> {
    try {
      const record = await db.kmsKey.create({
        data: {
          keyId:      metadata.keyId,
          keyAlias:   metadata.keyAlias,
          provider:   metadata.provider,
          status:     metadata.status,
          version:    metadata.version,
          orgSlug:    metadata.orgSlug,
          algorithm:  metadata.algorithm,
          createdAt:  new Date(metadata.createdAt),
          rotatedAt:  metadata.rotatedAt  ? new Date(metadata.rotatedAt)  : null,
          expiresAt:  metadata.expiresAt  ? new Date(metadata.expiresAt)  : null,
        },
      });
      return { ok: true, value: _toMetadata(record) };
    } catch (err: unknown) {
      if (_isPrismaUniqueError(err)) {
        return { ok: false, error: "key_already_exists", riskLevel: "HIGH" };
      }
      return { ok: false, error: `save_key_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── updateKey ───────────────────────────────────────────────────────────────

  async updateKey(
    keyId:   string,
    orgSlug: string,
    updates: Partial<Omit<KmsKeyMetadata, "keyId" | "orgSlug">>,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    try {
      const record = await db.kmsKey.update({
        where:  { keyId_orgSlug: { keyId, orgSlug } },
        data: {
          ...(updates.keyAlias  != null && { keyAlias:  updates.keyAlias }),
          ...(updates.status    != null && { status:    updates.status }),
          ...(updates.version   != null && { version:   updates.version }),
          ...(updates.algorithm != null && { algorithm: updates.algorithm }),
          ...(updates.provider  != null && { provider:  updates.provider }),
          ...(updates.rotatedAt != null && { rotatedAt: new Date(updates.rotatedAt) }),
          ...(updates.expiresAt != null && { expiresAt: new Date(updates.expiresAt) }),
        },
      });
      return { ok: true, value: _toMetadata(record) };
    } catch (err: unknown) {
      if (_isPrismaNotFoundError(err)) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }
      return { ok: false, error: `update_key_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── deleteKey ───────────────────────────────────────────────────────────────

  async deleteKey(keyId: string, orgSlug: string): Promise<KmsResult<{ deleted: boolean }>> {
    try {
      await db.kmsKey.delete({
        where: { keyId_orgSlug: { keyId, orgSlug } },
      });
      return { ok: true, value: { deleted: true } };
    } catch (err: unknown) {
      if (_isPrismaNotFoundError(err)) {
        return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      }
      return { ok: false, error: `delete_key_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── findByKeyId ─────────────────────────────────────────────────────────────

  async findByKeyId(keyId: string, orgSlug: string): Promise<KmsResult<KmsKeyMetadata>> {
    try {
      const record = await db.kmsKey.findUnique({
        where: { keyId_orgSlug: { keyId, orgSlug } },
      });
      if (!record) return { ok: false, error: "key_not_found", riskLevel: "HIGH" };
      if (record.orgSlug !== orgSlug) {
        return { ok: false, error: "cross_tenant_key_access_denied", riskLevel: "CRITICAL" };
      }
      return { ok: true, value: _toMetadata(record) };
    } catch (err: unknown) {
      return { ok: false, error: `find_key_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── findByAlias ─────────────────────────────────────────────────────────────

  async findByAlias(orgSlug: string, keyAlias: string): Promise<KmsResult<KmsKeyMetadata>> {
    try {
      const record = await db.kmsKey.findUnique({
        where: { orgSlug_keyAlias: { orgSlug, keyAlias } },
      });
      if (!record) return { ok: false, error: "key_alias_not_found", riskLevel: "HIGH" };
      return { ok: true, value: _toMetadata(record) };
    } catch (err: unknown) {
      return { ok: false, error: `find_by_alias_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── listByOrg ───────────────────────────────────────────────────────────────

  async listByOrg(orgSlug: string): Promise<KmsKeyMetadata[]> {
    try {
      const records = await db.kmsKey.findMany({ where: { orgSlug } });
      return records.map(_toMetadata);
    } catch {
      return [];
    }
  }

  // ── listByStatus ────────────────────────────────────────────────────────────

  async listByStatus(orgSlug: string, status: KmsKeyStatus): Promise<KmsKeyMetadata[]> {
    try {
      const records = await db.kmsKey.findMany({ where: { orgSlug, status } });
      return records.map(_toMetadata);
    } catch {
      return [];
    }
  }

  // ── countByOrg ──────────────────────────────────────────────────────────────

  async countByOrg(orgSlug: string): Promise<number> {
    try {
      return await db.kmsKey.count({ where: { orgSlug } });
    } catch {
      return 0;
    }
  }
}

/** Singleton Prisma KMS repository. */
export const prismaKmsRepository = new PrismaKmsRepository();

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toMetadata(record: {
  keyId:     string;
  keyAlias:  string;
  provider:  string;
  status:    string;
  version:   number;
  orgSlug:   string;
  algorithm: string;
  createdAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
}): KmsKeyMetadata {
  return {
    keyId:     record.keyId,
    keyAlias:  record.keyAlias,
    provider:  record.provider as KmsKeyMetadata["provider"],
    status:    record.status   as KmsKeyMetadata["status"],
    version:   record.version,
    orgSlug:   record.orgSlug,
    algorithm: record.algorithm,
    createdAt: record.createdAt.toISOString(),
    rotatedAt: record.rotatedAt ? record.rotatedAt.toISOString() : undefined,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : undefined,
  };
}

function _isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function _isPrismaNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
}

function _safeMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 100) : "unknown";
}
