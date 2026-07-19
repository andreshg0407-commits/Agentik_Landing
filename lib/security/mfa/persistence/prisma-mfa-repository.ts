/**
 * lib/security/mfa/persistence/prisma-mfa-repository.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Prisma Repository — PostgreSQL Persistence for MFA State
 *
 * Server-only. Implements MfaRepository using Prisma.
 *
 * CRITICAL:
 *   - Only metadata is persisted — NEVER plain secrets or codes
 *   - All operations are tenant-scoped (orgSlug required)
 *   - Cross-tenant access returns CRITICAL error
 *   - Fail-closed: Prisma errors → structured MfaResult
 *
 * Requires: MfaEnrollment + MfaRecoveryCode models in prisma/schema.prisma
 * (added in Phase 11 migration)
 */

import "server-only";

import type { MfaEnrollment, MfaMethod, MfaStatus, MfaResult } from "../mfa-types";
import type { MfaRepository, MfaRecoveryCodeRecord, MfaEnrollmentUpdate } from "../mfa-repository";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ── PrismaMfaRepository ───────────────────────────────────────────────────────

export class PrismaMfaRepository implements MfaRepository {

  // ── saveEnrollment ─────────────────────────────────────────────────────────

  async saveEnrollment(enrollment: MfaEnrollment): Promise<MfaResult<MfaEnrollment>> {
    try {
      const record = await db.mfaEnrollment.create({
        data: {
          id:              enrollment.id,
          orgSlug:         enrollment.orgSlug,
          userId:          enrollment.userId,
          method:          enrollment.method,
          status:          enrollment.status,
          encryptedSecret: enrollment.secretRef,
          failCount:       enrollment.failCount,
          createdAt:       new Date(enrollment.createdAt),
          enabledAt:       enrollment.enabledAt  ? new Date(enrollment.enabledAt)  : null,
          lastUsedAt:      enrollment.lastUsedAt ? new Date(enrollment.lastUsedAt) : null,
        },
      });
      return { ok: true, value: _toEnrollment(record) };
    } catch (err: unknown) {
      if (_isPrismaUniqueError(err)) {
        return { ok: false, error: "enrollment_already_exists", riskLevel: "HIGH" };
      }
      return { ok: false, error: `save_enrollment_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── getEnrollment ──────────────────────────────────────────────────────────

  async getEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaEnrollment | null> {
    try {
      const record = await db.mfaEnrollment.findUnique({
        where: { orgSlug_userId_method: { orgSlug, userId, method } },
      });
      if (!record) return null;
      if (record.orgSlug !== orgSlug) return null; // cross-tenant guard
      return _toEnrollment(record);
    } catch {
      return null;
    }
  }

  // ── updateEnrollment ──────────────────────────────────────────────────────

  async updateEnrollment(id: string, orgSlug: string, updates: MfaEnrollmentUpdate): Promise<MfaResult<MfaEnrollment>> {
    try {
      const record = await db.mfaEnrollment.update({
        where: { id_orgSlug: { id, orgSlug } },
        data: {
          ...(updates.status    != null && { status:     updates.status }),
          ...(updates.failCount != null && { failCount:  updates.failCount }),
          ...(updates.enabledAt  != null && { enabledAt:  new Date(updates.enabledAt) }),
          ...(updates.lastUsedAt != null && { lastUsedAt: new Date(updates.lastUsedAt) }),
        },
      });
      return { ok: true, value: _toEnrollment(record) };
    } catch (err: unknown) {
      if (_isPrismaNotFoundError(err)) {
        return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
      }
      return { ok: false, error: `update_enrollment_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── disableEnrollment ─────────────────────────────────────────────────────

  async disableEnrollment(orgSlug: string, userId: string, method: MfaMethod): Promise<MfaResult<{ disabled: boolean }>> {
    try {
      await db.mfaEnrollment.update({
        where: { orgSlug_userId_method: { orgSlug, userId, method } },
        data:  { status: "DISABLED" },
      });
      return { ok: true, value: { disabled: true } };
    } catch (err: unknown) {
      if (_isPrismaNotFoundError(err)) {
        return { ok: false, error: "enrollment_not_found", riskLevel: "HIGH" };
      }
      return { ok: false, error: `disable_enrollment_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── listEnrollments ────────────────────────────────────────────────────────

  async listEnrollments(orgSlug: string, userId: string): Promise<MfaEnrollment[]> {
    try {
      const records = await db.mfaEnrollment.findMany({ where: { orgSlug, userId } });
      return records.map(_toEnrollment);
    } catch {
      return [];
    }
  }

  // ── listEnrollmentsByStatus ────────────────────────────────────────────────

  async listEnrollmentsByStatus(orgSlug: string, status: MfaStatus): Promise<MfaEnrollment[]> {
    try {
      const records = await db.mfaEnrollment.findMany({ where: { orgSlug, status } });
      return records.map(_toEnrollment);
    } catch {
      return [];
    }
  }

  // ── countEnrollments ──────────────────────────────────────────────────────

  async countEnrollments(orgSlug: string, status?: MfaStatus): Promise<number> {
    try {
      return await db.mfaEnrollment.count({
        where: { orgSlug, ...(status ? { status } : {}) },
      });
    } catch {
      return 0;
    }
  }

  // ── saveRecoveryCodes ─────────────────────────────────────────────────────

  async saveRecoveryCodes(orgSlug: string, userId: string, codeHashes: string[]): Promise<MfaResult<{ count: number }>> {
    try {
      const now  = new Date();
      await db.mfaRecoveryCode.createMany({
        data: codeHashes.map(h => ({
          orgSlug,
          userId,
          codeHash:  h,
          createdAt: now,
        })),
      });
      return { ok: true, value: { count: codeHashes.length } };
    } catch (err: unknown) {
      return { ok: false, error: `save_recovery_codes_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── getRecoveryCodes ──────────────────────────────────────────────────────

  async getRecoveryCodes(orgSlug: string, userId: string): Promise<MfaRecoveryCodeRecord[]> {
    try {
      const records = await db.mfaRecoveryCode.findMany({ where: { orgSlug, userId } });
      return records.map(_toCodeRecord);
    } catch {
      return [];
    }
  }

  // ── markRecoveryCodeUsed ──────────────────────────────────────────────────

  async markRecoveryCodeUsed(orgSlug: string, userId: string, codeId: string): Promise<MfaResult<{ marked: boolean }>> {
    try {
      await db.mfaRecoveryCode.update({
        where: { id: codeId, orgSlug, userId },
        data:  { usedAt: new Date() },
      });
      return { ok: true, value: { marked: true } };
    } catch (err: unknown) {
      if (_isPrismaNotFoundError(err)) {
        return { ok: false, error: "code_not_found", riskLevel: "HIGH" };
      }
      return { ok: false, error: `mark_code_used_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }

  // ── deleteRecoveryCodes ───────────────────────────────────────────────────

  async deleteRecoveryCodes(orgSlug: string, userId: string): Promise<MfaResult<{ deleted: number }>> {
    try {
      const result = await db.mfaRecoveryCode.deleteMany({ where: { orgSlug, userId } });
      return { ok: true, value: { deleted: result.count } };
    } catch (err: unknown) {
      return { ok: false, error: `delete_recovery_codes_failed:${_safeMessage(err)}`, riskLevel: "HIGH" };
    }
  }
}

/** Singleton Prisma MFA repository. */
export const prismaMfaRepository = new PrismaMfaRepository();

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toEnrollment(record: {
  id: string; orgSlug: string; userId: string; method: string; status: string;
  encryptedSecret: string; failCount: number; createdAt: Date;
  enabledAt: Date | null; lastUsedAt: Date | null;
}): MfaEnrollment {
  return {
    id:          record.id,
    orgSlug:     record.orgSlug,
    userId:      record.userId,
    method:      record.method      as MfaMethod,
    status:      record.status      as MfaEnrollment["status"],
    secretRef:   record.encryptedSecret,
    failCount:   record.failCount,
    createdAt:   record.createdAt.toISOString(),
    enabledAt:   record.enabledAt   ? record.enabledAt.toISOString()  : undefined,
    lastUsedAt:  record.lastUsedAt  ? record.lastUsedAt.toISOString() : undefined,
  };
}

function _toCodeRecord(record: {
  id: string; orgSlug: string; userId: string; codeHash: string;
  usedAt: Date | null; createdAt: Date;
}): MfaRecoveryCodeRecord {
  return {
    id:        record.id,
    orgSlug:   record.orgSlug,
    userId:    record.userId,
    codeHash:  record.codeHash,
    usedAt:    record.usedAt ? record.usedAt.toISOString() : undefined,
    createdAt: record.createdAt.toISOString(),
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
